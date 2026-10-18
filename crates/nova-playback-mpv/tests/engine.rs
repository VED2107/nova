//! Integration tests against the real libmpv build (headless: vo=null, ao=null).
//!
//! Prerequisites (see docs/testing/README.md):
//!   bash scripts/fetch-libmpv.sh
//!   bash scripts/generate-fixtures.sh
//! Override the library with NOVA_LIBMPV_PATH.

use nova_playback_api::{
    PlaybackBackend, PlaybackCommand as Cmd, PlaybackErrorKind, PlaybackPhase as P,
    PlaybackSnapshot, TrackKind,
};
use nova_playback_mpv::{MpvConfig, MpvPlayer};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::mpsc::{Receiver, channel};
use std::time::{Duration, Instant};

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}

fn libmpv_path() -> PathBuf {
    std::env::var_os("NOVA_LIBMPV_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|| repo_root().join("vendor/libmpv/libmpv-2.dll"))
}

fn fixture(name: &str) -> String {
    let p = repo_root().join("tests/fixtures/media").join(name);
    assert!(
        p.exists(),
        "missing fixture {name}; run scripts/generate-fixtures.sh"
    );
    // Strip the \\?\ prefix canonicalize adds on Windows; mpv accepts plain paths.
    p.to_string_lossy().trim_start_matches(r"\\?\").to_string()
}

struct Harness {
    player: MpvPlayer,
    rx: Receiver<PlaybackSnapshot>,
    last: Option<PlaybackSnapshot>,
}

impl Harness {
    fn new() -> Self {
        let (tx, rx) = channel();
        let tx = std::sync::Mutex::new(tx);
        let sink = Arc::new(move |s: PlaybackSnapshot| {
            let _ = tx.lock().unwrap().send(s);
        });
        let player = MpvPlayer::new(MpvConfig::headless(libmpv_path()), sink)
            .expect("libmpv should load; run scripts/fetch-libmpv.sh");
        Self {
            player,
            rx,
            last: None,
        }
    }

    fn exec(&self, cmd: Cmd) {
        self.player
            .execute(cmd.clone())
            .unwrap_or_else(|e| panic!("{cmd:?} failed: {e}"));
    }

    /// Waits until a snapshot satisfies `pred`. Panics with the last seen state on timeout.
    fn wait(
        &mut self,
        what: &str,
        timeout_ms: u64,
        pred: impl Fn(&PlaybackSnapshot) -> bool,
    ) -> PlaybackSnapshot {
        let deadline = Instant::now() + Duration::from_millis(timeout_ms);
        // The current state may already satisfy the predicate.
        let current = self.player.snapshot();
        if pred(&current) {
            return current;
        }
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            match self.rx.recv_timeout(left) {
                Ok(s) => {
                    if self.last.as_ref().is_some_and(|l| l.seq > s.seq) {
                        continue; // out-of-order delivery; keep newest
                    }
                    let ok = pred(&s);
                    self.last = Some(s.clone());
                    if ok {
                        return s;
                    }
                }
                Err(_) => panic!(
                    "timed out waiting for {what}; last = {:#?}",
                    self.last.as_ref().map(brief)
                ),
            }
        }
    }

    fn open_and_play(&mut self, name: &str) -> PlaybackSnapshot {
        let ack = self
            .player
            .execute(Cmd::Open {
                path: fixture(name),
                start_ms: None,
            })
            .expect("open");
        // Duration is a separate engine property that can land just after the
        // phase flips to Playing; every fixture has one, so wait for both.
        self.wait("playing", 10_000, |s| {
            s.session_id == ack.session_id && s.phase == P::Playing && s.duration_ms.is_some()
        })
    }
}

fn brief(s: &PlaybackSnapshot) -> String {
    format!(
        "session={} seq={} phase={:?} pos={} dur={:?} err={:?}",
        s.session_id, s.seq, s.phase, s.position_ms, s.duration_ms, s.error
    )
}

#[test]
fn engine_reports_versions() {
    let h = Harness::new();
    let d = h.player.diagnostics();
    println!("{d:#?}");
    assert_eq!(d.client_api.0, 2);
    assert!(d.mpv_version.unwrap().starts_with("mpv"));
    assert!(d.ffmpeg_version.is_some());
    let caps = h.player.capabilities();
    assert_eq!(caps.backend, "libmpv");
}

#[test]
fn plays_h264_and_reports_duration_and_tracks() {
    let mut h = Harness::new();
    let s = h.open_and_play("h264_aac_1080p30_30s.mp4");
    let dur = s.duration_ms.expect("duration");
    assert!((29_900..=30_100).contains(&dur), "duration {dur}");
    let video = s
        .tracks
        .iter()
        .find(|t| t.kind == TrackKind::Video)
        .expect("video track");
    assert_eq!(video.codec.as_deref(), Some("h264"));
    assert!(
        s.tracks
            .iter()
            .any(|t| t.kind == TrackKind::Audio && t.codec.as_deref() == Some("aac"))
    );
    // Position must advance in real time while playing.
    let start = s.position_ms;
    let later = h.wait("position advance", 5_000, |x| {
        x.position_ms >= start + 1_000
    });
    assert_eq!(later.phase, P::Playing);
}

#[test]
fn plays_each_supported_codec() {
    for name in [
        "hevc_aac_1080p24_10s.mkv",
        "vp9_opus_720p30_10s.webm",
        "multitrack_h264_2a_2s_10s.mkv",
    ] {
        let mut h = Harness::new();
        let s = h.open_and_play(name);
        assert!(
            s.duration_ms.is_some_and(|d| d > 9_000),
            "{name}: {}",
            brief(&s)
        );
    }
}

#[test]
fn pause_seek_resume_returns_to_intended_state() {
    let mut h = Harness::new();
    h.open_and_play("h264_aac_1080p30_30s.mp4");
    h.exec(Cmd::Pause);
    h.wait("paused", 3_000, |s| s.phase == P::Paused);

    h.exec(Cmd::Seek {
        position_ms: 20_000,
        exact: true,
    });
    let s = h.wait("paused at 20s", 5_000, |s| {
        s.phase == P::Paused && s.position_ms.abs_diff(20_000) <= 50
    });
    assert_eq!(s.phase, P::Paused, "seek while paused must stay paused");

    h.exec(Cmd::Play);
    h.wait("playing after 20s", 5_000, |s| {
        s.phase == P::Playing && s.position_ms > 20_200
    });
}

#[test]
fn rapid_seeks_settle_on_last_target() {
    let mut h = Harness::new();
    h.open_and_play("h264_aac_1080p30_30s.mp4");
    h.exec(Cmd::Pause);
    for target in [5_000, 25_000, 12_000, 18_000, 7_000] {
        h.exec(Cmd::Seek {
            position_ms: target,
            exact: true,
        });
    }
    h.wait("settled at 7s", 5_000, |s| {
        s.phase == P::Paused && s.position_ms.abs_diff(7_000) <= 50
    });
}

/// Arrow-key seeks are relative. The fixture uses x264's default 250-frame
/// GOP (8.3 s at 30 fps), so a keyframe seek would land seconds away.
#[test]
fn relative_seeks_land_on_requested_time() {
    let mut h = Harness::new();
    h.open_and_play("h264_aac_1080p30_30s.mp4");
    h.exec(Cmd::Pause);
    h.exec(Cmd::Seek {
        position_ms: 3_000,
        exact: true,
    });
    h.wait("paused at 3s", 5_000, |s| {
        s.phase == P::Paused && s.position_ms.abs_diff(3_000) <= 34
    });
    for (offset, expect) in [(5_000, 8_000), (5_000, 13_000), (-5_000, 8_000), (-1_000, 7_000)] {
        h.exec(Cmd::SeekRelative { offset_ms: offset });
        // One frame at 30 fps is 33.3 ms.
        h.wait(&format!("relative {offset} -> {expect}"), 5_000, |s| {
            s.phase == P::Paused && s.position_ms.abs_diff(expect) <= 34
        });
    }
}

#[test]
fn reaches_end_and_can_seek_back() {
    let mut h = Harness::new();
    h.open_and_play("vp9_opus_720p30_10s.webm");
    h.exec(Cmd::Seek {
        position_ms: 9_000,
        exact: false,
    });
    h.wait("ended", 10_000, |s| s.phase == P::Ended);
    h.exec(Cmd::Seek {
        position_ms: 1_000,
        exact: true,
    });
    h.wait("left ended", 5_000, |s| {
        matches!(s.phase, P::Paused | P::Playing) && s.position_ms < 2_000
    });
}

#[test]
fn play_at_end_restarts_from_beginning() {
    let mut h = Harness::new();
    h.open_and_play("vp9_opus_720p30_10s.webm");
    h.exec(Cmd::Seek {
        position_ms: 9_500,
        exact: false,
    });
    h.wait("ended", 10_000, |s| s.phase == P::Ended);
    h.exec(Cmd::TogglePause);
    h.wait("replaying from start", 5_000, |s| {
        s.phase == P::Playing && s.position_ms < 2_000
    });
}

#[test]
fn ab_loop_repeats_section_and_resets_on_open() {
    let mut h = Harness::new();
    h.open_and_play("h264_aac_1080p30_30s.mp4");
    h.exec(Cmd::SetAbLoop {
        a_ms: Some(2_000),
        b_ms: Some(3_000),
    });
    h.wait("loop confirmed", 3_000, |s| {
        s.ab_loop.a_ms == Some(2_000) && s.ab_loop.b_ms == Some(3_000)
    });
    h.exec(Cmd::Seek {
        position_ms: 2_000,
        exact: true,
    });
    // Watch for 3 s of real time: position must stay within [A, B + tolerance].
    let deadline = Instant::now() + Duration::from_secs(3);
    let mut wrapped = false;
    let mut last_pos = 0;
    while Instant::now() < deadline {
        if let Ok(s) = h.rx.recv_timeout(Duration::from_millis(200)) {
            if s.phase == P::Playing {
                assert!(s.position_ms <= 3_150, "escaped loop: {}", brief(&s));
                if s.position_ms + 500 < last_pos {
                    wrapped = true;
                }
                last_pos = s.position_ms;
            }
        }
    }
    assert!(wrapped, "playback never jumped back to A");

    h.exec(Cmd::SetAbLoop {
        a_ms: None,
        b_ms: None,
    });
    h.wait("loop cleared", 3_000, |s| {
        s.ab_loop.a_ms.is_none() && s.ab_loop.b_ms.is_none()
    });

    h.exec(Cmd::SetAbLoop {
        a_ms: Some(1_000),
        b_ms: Some(2_000),
    });
    h.wait("loop set again", 3_000, |s| s.ab_loop.b_ms == Some(2_000));
    let s = h.open_and_play("vp9_opus_720p30_10s.webm");
    assert_eq!(
        s.ab_loop.a_ms, None,
        "loop must not leak into the next file"
    );
    assert!(h.player.property_string("ab-loop-a").as_deref() == Some("no"));
    assert!(
        h.player
            .execute(Cmd::SetAbLoop {
                a_ms: Some(5),
                b_ms: Some(1)
            })
            .is_err()
    );
}

#[test]
fn open_with_start_position_begins_there() {
    let mut h = Harness::new();
    let ack = h
        .player
        .execute(Cmd::Open {
            path: fixture("h264_aac_1080p30_30s.mp4"),
            start_ms: Some(20_000),
        })
        .expect("open");
    let s = h.wait("playing", 10_000, |s| {
        s.session_id == ack.session_id && s.phase == P::Playing
    });
    assert!(s.position_ms >= 19_900, "started at {}", s.position_ms);
    // The start option is per-file: the next plain open starts at 0.
    let s = h.open_and_play("vp9_opus_720p30_10s.webm");
    assert!(
        s.position_ms < 1_000,
        "leaked start option: {}",
        s.position_ms
    );
}

#[test]
fn invalid_media_reports_load_failure() {
    let mut h = Harness::new();
    let ack = h
        .player
        .execute(Cmd::Open {
            path: fixture("not_media.mp4"),
            start_ms: None,
        })
        .expect("accepted");
    let s = h.wait("error", 10_000, |s| {
        s.session_id == ack.session_id && s.phase == P::Error
    });
    assert_eq!(s.error.unwrap().kind, PlaybackErrorKind::LoadFailed);
}

#[test]
fn truncated_media_never_hangs() {
    let mut h = Harness::new();
    let ack = h
        .player
        .execute(Cmd::Open {
            path: fixture("truncated_h264.mp4"),
            start_ms: None,
        })
        .expect("accepted");
    let s = h.wait("terminal state", 15_000, |s| {
        s.session_id == ack.session_id && matches!(s.phase, P::Error | P::Ended | P::Playing)
    });
    println!("truncated file outcome: {}", brief(&s));
}

#[test]
fn missing_file_is_rejected_synchronously() {
    let h = Harness::new();
    let missing = repo_root().join("tests/fixtures/media/does_not_exist.mp4");
    let err = h
        .player
        .execute(Cmd::Open {
            path: missing.to_string_lossy().into(),
            start_ms: None,
        })
        .unwrap_err();
    assert_eq!(err.kind, PlaybackErrorKind::NotFound);
    let err = h
        .player
        .execute(Cmd::Open {
            path: "https://example.com/x.mp4".into(),
            start_ms: None,
        })
        .unwrap_err();
    assert_eq!(err.kind, PlaybackErrorKind::UnsupportedSource);
}

#[test]
fn rapid_file_switching_ends_on_last_file() {
    let mut h = Harness::new();
    let files = [
        "h264_aac_1080p30_30s.mp4",
        "hevc_aac_1080p24_10s.mkv",
        "not_media.mp4",
        "vp9_opus_720p30_10s.webm",
        "multitrack_h264_2a_2s_10s.mkv",
    ];
    let mut last = 0;
    for _round in 0..3 {
        for f in files {
            last = h
                .player
                .execute(Cmd::Open {
                    path: fixture(f),
                    start_ms: None,
                })
                .expect("open")
                .session_id;
        }
    }
    let s = h.wait("last file playing", 10_000, |s| {
        s.session_id == last && s.phase == P::Playing
    });
    assert!(s.path.unwrap().ends_with("multitrack_h264_2a_2s_10s.mkv"));
    // Stale events from earlier sessions must not override the final state.
    std::thread::sleep(Duration::from_millis(500));
    let s = h.player.snapshot();
    assert_eq!(s.session_id, last);
    assert_eq!(s.phase, P::Playing, "{}", brief(&s));
    assert!(s.error.is_none());
}

#[test]
fn audio_and_subtitle_track_selection_is_confirmed_by_engine() {
    let mut h = Harness::new();
    let s = h.open_and_play("multitrack_h264_2a_2s_10s.mkv");
    let audio: Vec<_> = s
        .tracks
        .iter()
        .filter(|t| t.kind == TrackKind::Audio)
        .collect();
    let subs: Vec<_> = s
        .tracks
        .iter()
        .filter(|t| t.kind == TrackKind::Subtitle)
        .collect();
    assert_eq!(audio.len(), 2);
    assert_eq!(subs.len(), 2);
    assert_eq!(audio[0].language.as_deref(), Some("eng"));
    assert_eq!(audio[1].language.as_deref(), Some("fra"));
    assert_eq!(audio[1].title.as_deref(), Some("French 1320Hz"));

    h.exec(Cmd::SelectAudioTrack {
        track_id: Some("audio:2".into()),
    });
    h.wait("audio:2 selected", 3_000, |s| {
        s.tracks.iter().any(|t| t.id == "audio:2" && t.is_selected)
    });
    h.exec(Cmd::SelectSubtitleTrack {
        track_id: Some("sub:2".into()),
    });
    h.wait("sub:2 selected", 3_000, |s| {
        s.tracks.iter().any(|t| t.id == "sub:2" && t.is_selected)
    });
    h.exec(Cmd::SelectSubtitleTrack { track_id: None });
    h.wait("subs off", 3_000, |s| {
        !s.tracks
            .iter()
            .any(|t| t.kind == TrackKind::Subtitle && t.is_selected)
    });
    let err = h
        .player
        .execute(Cmd::SelectAudioTrack {
            track_id: Some("sub:1".into()),
        })
        .unwrap_err();
    assert_eq!(err.kind, PlaybackErrorKind::InvalidArgument);
}

#[test]
fn volume_mute_speed_are_confirmed_by_engine() {
    let mut h = Harness::new();
    h.open_and_play("h264_aac_1080p30_30s.mp4");
    h.exec(Cmd::SetVolume { percent: 35 });
    h.wait("volume 35", 3_000, |s| s.volume_percent == 35);
    h.exec(Cmd::SetMuted { muted: true });
    h.wait("muted", 3_000, |s| s.is_muted);
    h.exec(Cmd::SetSpeed { multiplier: 2.0 });
    h.wait("speed 2", 3_000, |s| (s.speed - 2.0).abs() < 1e-9);
    assert!(
        h.player
            .execute(Cmd::SetSpeed { multiplier: 10.0 })
            .is_err()
    );
    assert!(h.player.execute(Cmd::SetVolume { percent: 200 }).is_err());
    // Speed change must not restart playback.
    let s = h.player.snapshot();
    assert_eq!(s.phase, P::Playing);
}

#[test]
fn stop_moves_to_stopped() {
    let mut h = Harness::new();
    h.open_and_play("h264_aac_1080p30_30s.mp4");
    h.exec(Cmd::Stop);
    h.wait("stopped", 3_000, |s| {
        s.phase == P::Stopped && s.position_ms == 0
    });
}

#[cfg(windows)]
mod win {
    #[repr(C)]
    #[derive(Default)]
    pub struct ProcessMemoryCounters {
        pub cb: u32,
        pub page_fault_count: u32,
        pub peak_working_set_size: usize,
        pub working_set_size: usize,
        pub quota_peak_paged_pool_usage: usize,
        pub quota_paged_pool_usage: usize,
        pub quota_peak_non_paged_pool_usage: usize,
        pub quota_non_paged_pool_usage: usize,
        pub pagefile_usage: usize,
        pub peak_pagefile_usage: usize,
    }
    unsafe extern "system" {
        fn GetCurrentProcess() -> isize;
        fn GetProcessHandleCount(process: isize, count: *mut u32) -> i32;
        fn K32GetProcessMemoryInfo(
            process: isize,
            counters: *mut ProcessMemoryCounters,
            cb: u32,
        ) -> i32;
    }
    pub fn handles() -> u32 {
        let mut n = 0;
        unsafe { GetProcessHandleCount(GetCurrentProcess(), &mut n) };
        n
    }
    pub fn private_bytes() -> usize {
        let mut c = ProcessMemoryCounters {
            cb: size_of::<ProcessMemoryCounters>() as u32,
            ..Default::default()
        };
        unsafe { K32GetProcessMemoryInfo(GetCurrentProcess(), &mut c, c.cb) };
        c.pagefile_usage
    }
}

/// Creates and destroys the engine repeatedly while media is playing and
/// checks that OS handles and private memory do not grow per cycle.
#[cfg(windows)]
#[test]
fn engine_lifecycle_does_not_leak() {
    // Warm up: first load initializes process-wide state inside the DLL.
    for _ in 0..2 {
        let mut h = Harness::new();
        h.open_and_play("h264_aac_1080p30_30s.mp4");
    }
    let (h0, m0) = (win::handles(), win::private_bytes());
    const CYCLES: usize = 15;
    for _ in 0..CYCLES {
        let mut h = Harness::new();
        h.open_and_play("h264_aac_1080p30_30s.mp4");
        drop(h); // shutdown while playing
    }
    let (h1, m1) = (win::handles(), win::private_bytes());
    println!(
        "lifecycle x{CYCLES}: handles {h0} -> {h1}, private bytes {:.1} MiB -> {:.1} MiB",
        m0 as f64 / 1048576.0,
        m1 as f64 / 1048576.0
    );
    assert!(h1 <= h0 + 20, "handle growth {h0} -> {h1}");
    assert!(m1 <= m0 + 64 * 1024 * 1024, "memory growth {m0} -> {m1}");
}

#[test]
fn vlc_style_adjustments_are_confirmed_by_engine() {
    let mut h = Harness::new();
    h.open_and_play("h264_aac_1080p30_30s.mp4");
    h.exec(Cmd::SetSubtitleDelay { ms: -1500 });
    h.exec(Cmd::SetAudioDelay { ms: 250 });
    h.exec(Cmd::SetAspectRatio {
        ratio: Some("4:3".into()),
    });
    h.exec(Cmd::SetRotation { degrees: 90 });
    h.exec(Cmd::SetDeinterlace { enabled: true });
    h.exec(Cmd::SetLoopFile { enabled: true });
    let s = h.wait("adjustments confirmed", 3_000, |s| {
        let a = &s.adjust;
        a.subtitle_delay_ms == -1500
            && a.audio_delay_ms == 250
            && a.aspect_ratio.as_deref() == Some("4:3")
            && a.rotation == 90
            && a.deinterlace
            && a.loop_file
    });
    assert_eq!(s.phase, P::Playing);
    h.exec(Cmd::SetAspectRatio { ratio: None });
    h.exec(Cmd::SetLoopFile { enabled: false });
    h.wait("reset", 3_000, |s| {
        s.adjust.aspect_ratio.is_none() && !s.adjust.loop_file
    });

    // Frame step pauses and moves forward by about one frame (30 fps).
    h.exec(Cmd::Pause);
    let before = h
        .wait("paused", 3_000, |s| s.phase == P::Paused)
        .position_ms;
    h.exec(Cmd::FrameStep { forward: true });
    h.wait("stepped", 3_000, |s| {
        s.phase == P::Paused && s.position_ms > before && s.position_ms <= before + 100
    });

    // External subtitle file is loaded and selected.
    let srt = std::env::temp_dir().join("nova-engine-test.srt");
    std::fs::write(&srt, "1\n00:00:00,000 --> 00:00:30,000\nExternal\n").unwrap();
    h.exec(Cmd::AddSubtitle {
        path: srt.to_string_lossy().into(),
    });
    h.wait("external sub selected", 3_000, |s| {
        s.tracks
            .iter()
            .any(|t| t.kind == TrackKind::Subtitle && t.is_external && t.is_selected)
    });

    // Screenshot of the current frame.
    let shot = std::env::temp_dir().join("nova-engine-test-shot.png");
    let _ = std::fs::remove_file(&shot);
    let r = h.player.screenshot(&shot, false);
    println!("screenshot with vo=null: {r:?}");
}
