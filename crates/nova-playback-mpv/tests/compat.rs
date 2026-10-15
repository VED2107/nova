//! Media-compatibility harness: plays every sample in the compatibility corpus
//! on the real engine and writes an evidence table.
//!
//!   bash scripts/generate-compat-corpus.sh
//!   cargo test -p nova-playback-mpv --release --test compat -- --ignored --nocapture
//!   NOVA_COMPAT_HWDEC=auto-copy cargo test ... (hardware-decoding pass)
//!
//! Output: docs/compat/results-<hwdec>.md and .json. The test fails if any
//! sample does not meet its manifest expectation.

use nova_playback_api::{
    MediaDetails, PlaybackBackend, PlaybackCommand as Cmd, PlaybackErrorKind, PlaybackIssue,
    PlaybackPhase as P, PlaybackSnapshot,
};
use nova_playback_mpv::{MpvConfig, MpvPlayer};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::mpsc::{Receiver, channel};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Sample {
    id: String,
    file: String,
    category: String,
    expect: String,
    vcodec: String,
    acodec: String,
    width: u32,
    height: u32,
    bit_depth: u32,
    chroma: String,
    feature: String,
    notes: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct Outcome {
    id: String,
    file: String,
    category: String,
    expect: String,
    notes: String,
    pass: bool,
    failures: Vec<String>,
    result: String,
    open_to_play_ms: Option<u128>,
    duration_ms: Option<u64>,
    seek_ms: Option<u128>,
    seek_error_ms: Option<u64>,
    realtime_advance_ms: Option<u64>,
    decoder_drops: Option<i64>,
    private_mib_after: Option<f64>,
    details: Option<MediaDetails>,
    issues: Vec<PlaybackIssue>,
    error: Option<String>,
}

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}

#[cfg(windows)]
fn private_mib() -> Option<f64> {
    #[repr(C)]
    #[derive(Default)]
    struct C {
        cb: u32,
        a: u32,
        b: [usize; 8],
    }
    unsafe extern "system" {
        fn GetCurrentProcess() -> isize;
        fn K32GetProcessMemoryInfo(p: isize, c: *mut C, cb: u32) -> i32;
    }
    let mut c = C {
        cb: size_of::<C>() as u32,
        ..Default::default()
    };
    (unsafe { K32GetProcessMemoryInfo(GetCurrentProcess(), &mut c, c.cb) } != 0)
        .then(|| c.b[6] as f64 / 1_048_576.0) // PagefileUsage = private bytes
}
#[cfg(not(windows))]
fn private_mib() -> Option<f64> {
    None
}

fn wait(
    p: &MpvPlayer,
    rx: &Receiver<PlaybackSnapshot>,
    ms: u64,
    pred: impl Fn(&PlaybackSnapshot) -> bool,
) -> Option<PlaybackSnapshot> {
    let deadline = Instant::now() + Duration::from_millis(ms);
    loop {
        let s = p.snapshot();
        if pred(&s) {
            return Some(s);
        }
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            return None;
        }
        let _ = rx.recv_timeout(left.min(Duration::from_millis(50)));
    }
}

fn run(sample: &Sample, lib: &PathBuf, hwdec: &str) -> Outcome {
    let mut o = Outcome {
        id: sample.id.clone(),
        file: sample.file.clone(),
        category: sample.category.clone(),
        expect: sample.expect.clone(),
        notes: sample.notes.clone(),
        ..Default::default()
    };
    let (tx, rx) = channel();
    let tx = Mutex::new(tx);
    let mut cfg = MpvConfig::headless(lib);
    cfg.hwdec = hwdec.into();
    let player = MpvPlayer::new(
        cfg,
        Arc::new(move |s| {
            let _ = tx.lock().unwrap().send(s);
        }),
    )
    .expect("libmpv");
    let path = root().join("tests/fixtures/compat").join(&sample.file);
    let path = path
        .to_string_lossy()
        .trim_start_matches(r"\\?\")
        .to_string();

    let t0 = Instant::now();
    let opened = player.execute(Cmd::Open {
        path,
        start_ms: None,
    });
    let settled = match &opened {
        Err(e) => {
            o.error = Some(format!("{:?}: {}", e.kind, e.message));
            None
        }
        Ok(_) => wait(&player, &rx, 20_000, |s| {
            matches!(s.phase, P::Playing | P::Error | P::Ended)
        }),
    };

    if let Some(s) = &settled {
        o.result = format!("{:?}", s.phase).to_lowercase();
        o.duration_ms = s.duration_ms;
        o.issues = s.issues.clone();
        if let Some(e) = &s.error {
            o.error = Some(format!("{:?}: {}", e.kind, e.message));
        }
        if s.phase == P::Playing {
            o.open_to_play_ms = Some(t0.elapsed().as_millis());
            // Issues (decoder logs) can arrive just after playback starts.
            std::thread::sleep(Duration::from_millis(300));
            o.issues = player.snapshot().issues;
            o.details = player.media_details();
            let dur = s.duration_ms.unwrap_or(0);
            if dur >= 2_000 {
                let target = dur / 2;
                let t = Instant::now();
                player
                    .execute(Cmd::Seek {
                        position_ms: target,
                        exact: true,
                    })
                    .ok();
                if let Some(after) = wait(&player, &rx, 10_000, |x| {
                    x.phase == P::Playing && x.position_ms.abs_diff(target) <= 250
                }) {
                    o.seek_ms = Some(t.elapsed().as_millis());
                    o.seek_error_ms = Some(after.position_ms.abs_diff(target));
                    let before = player.snapshot().position_ms;
                    std::thread::sleep(Duration::from_millis(1_000));
                    let s2 = player.snapshot();
                    if s2.phase == P::Playing {
                        o.realtime_advance_ms = Some(s2.position_ms.saturating_sub(before));
                    }
                }
            }
            o.decoder_drops = player.diagnostics().decoder_drops;
        }
    } else if opened.is_ok() {
        o.result = "timeout".into();
    } else {
        o.result = "rejected".into();
    }
    o.private_mib_after = private_mib();
    drop(player);

    // ---- evaluate against the manifest ----
    match sample.expect.as_str() {
        "play" => {
            if o.result != "playing" {
                o.failures
                    .push(format!("expected playback, got {}", o.result));
            }
            if !o.issues.is_empty() {
                o.failures.push(format!("unexpected issues {:?}", o.issues));
            }
            let d = o.details.clone().unwrap_or_default();
            if sample.vcodec != "none" {
                match &d.video {
                    None => o.failures.push("no video stream decoded".into()),
                    Some(v) => {
                        let codec = v.codec.clone().unwrap_or_default();
                        let same = codec.eq_ignore_ascii_case(&sample.vcodec)
                            || (sample.vcodec == "dnxhd" && codec.starts_with("dnx"));
                        if !same {
                            o.failures
                                .push(format!("video codec {codec} != {}", sample.vcodec));
                        }
                        if sample.width > 0
                            && (v.width, v.height) != (Some(sample.width), Some(sample.height))
                        {
                            o.failures
                                .push(format!("size {:?}x{:?}", v.width, v.height));
                        }
                        if sample.bit_depth > 0 && v.bit_depth.unwrap_or(0) < sample.bit_depth {
                            o.failures.push(format!(
                                "bit depth {:?} < {}",
                                v.bit_depth, sample.bit_depth
                            ));
                        }
                        let want_chroma = match sample.chroma.as_str() {
                            "420" => Some("4:2:0"),
                            "422" => Some("4:2:2"),
                            "444" => Some("4:4:4"),
                            _ => None,
                        };
                        // Hardware decoders may output 4:2:0 for 4:2:2 sources; only check in software.
                        if let (Some(w), None) = (want_chroma, &v.hwdec) {
                            if v.chroma.as_deref() != Some(w) {
                                o.failures.push(format!("chroma {:?} != {w}", v.chroma));
                            }
                        }
                        match sample.feature.as_str() {
                            "alpha" if !v.has_alpha => o.failures.push("alpha not detected".into()),
                            "hdr10" if v.hdr.as_deref() != Some("HDR10") => {
                                o.failures.push(format!("HDR {:?}", v.hdr))
                            }
                            "hlg" if v.hdr.as_deref() != Some("HLG") => {
                                o.failures.push(format!("HDR {:?}", v.hdr))
                            }
                            _ => {}
                        }
                    }
                }
            }
            if sample.acodec != "none" && d.audio.is_none() {
                o.failures.push("no audio stream decoded".into());
            }
            if sample.feature == "multichannel"
                && d.audio.as_ref().and_then(|a| a.channels).unwrap_or(0) < 6
            {
                o.failures.push(format!(
                    "channels {:?}",
                    d.audio.as_ref().and_then(|a| a.channels)
                ));
            }
            if let Some(e) = o.seek_error_ms.filter(|e| *e > 100) {
                o.failures.push(format!("seek error {e} ms"));
            }
        }
        "video-decoder-missing" => {
            if o.result != "playing"
                || !o
                    .issues
                    .iter()
                    .any(|i| matches!(i, PlaybackIssue::VideoDecoderMissing { .. }))
            {
                o.failures.push(format!(
                    "expected audio-only playback with VideoDecoderMissing, got {} {:?}",
                    o.result, o.issues
                ));
            }
        }
        "no-hang" => {
            if o.result == "timeout" {
                o.failures.push("engine did not settle within 20 s".into());
            }
        }
        "load-failed" => {
            let ok = o
                .error
                .as_deref()
                .is_some_and(|e| e.starts_with(&format!("{:?}", PlaybackErrorKind::LoadFailed)));
            if !ok {
                o.failures.push(format!(
                    "expected LoadFailed, got {} {:?}",
                    o.result, o.error
                ));
            }
        }
        "editing-project" => {
            let ok = o.error.as_deref().is_some_and(|e| {
                e.starts_with(&format!("{:?}", PlaybackErrorKind::EditingProject))
            });
            if !ok {
                o.failures.push(format!(
                    "expected EditingProject, got {} {:?}",
                    o.result, o.error
                ));
            }
        }
        "requires-external" => {
            let ok = o.error.as_deref().is_some_and(|e| {
                e.starts_with(&format!("{:?}", PlaybackErrorKind::RequiresExternalDecoder))
            });
            if !ok {
                o.failures.push(format!(
                    "expected RequiresExternalDecoder, got {} {:?}",
                    o.result, o.error
                ));
            }
        }
        other => o.failures.push(format!("unknown expectation {other}")),
    }
    o.pass = o.failures.is_empty();
    o
}

fn md_table(outcomes: &[Outcome], hwdec: &str, mpv: &str) -> String {
    let mut s = format!(
        "# Compatibility results — hwdec `{hwdec}`\n\nGenerated by `crates/nova-playback-mpv/tests/compat.rs` on the real engine ({mpv}), headless (`vo=null`, `ao=null`). \
Synthetic corpus from `scripts/generate-compat-corpus.sh`.\n\n\
| Sample | Expect | Result | Pass | Container | Video | Depth / chroma | HDR | Decoder | Audio | Open→play ms | Seek ms (err) | 1 s advance | Drops | Private MiB | Notes |\n\
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n"
    );
    for o in outcomes {
        let d = o.details.clone().unwrap_or_default();
        let v = d.video.clone().unwrap_or_default();
        let a = d.audio.clone().unwrap_or_default();
        let opt = |x: Option<String>| x.unwrap_or_else(|| "—".into());
        s.push_str(&format!(
            "| `{}` | {} | {} | {} | {} | {} | {} | {} | {} | {} | {} | {} | {} | {} | {} | {}{} |\n",
            o.file,
            o.expect,
            o.result,
            if o.pass { "✅" } else { "❌" },
            opt(d.container.map(|c| c.split(',').next().unwrap_or("").to_owned())),
            opt(v.codec.map(|c| format!("{c} {}x{}", v.width.unwrap_or(0), v.height.unwrap_or(0)))),
            opt(v.bit_depth.map(|b| format!("{b}-bit {}{}", v.chroma.clone().unwrap_or_default(), if v.has_alpha { " +α" } else { "" }))),
            opt(v.hdr),
            if d.video.is_some() { v.hwdec.clone().unwrap_or_else(|| "software".into()) } else { "—".into() },
            opt(a.codec.map(|c| format!("{c} {}ch", a.channels.unwrap_or(0)))),
            opt(o.open_to_play_ms.map(|x| x.to_string())),
            opt(o.seek_ms.map(|x| format!("{x} ({} ms)", o.seek_error_ms.unwrap_or(0)))),
            opt(o.realtime_advance_ms.map(|x| format!("{x} ms"))),
            opt(o.decoder_drops.map(|x| x.to_string())),
            opt(o.private_mib_after.map(|x| format!("{x:.0}"))),
            o.notes,
            if o.failures.is_empty() { String::new() } else { format!(" **{}**", o.failures.join("; ")) }
                + &o.error.as_ref().map(|e| format!(" — `{}`", e.chars().take(90).collect::<String>().replace('|', "/"))).unwrap_or_default(),
        ));
    }
    s
}

#[test]
#[ignore]
fn compatibility_matrix() {
    let lib = std::env::var_os("NOVA_LIBMPV_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|| root().join("vendor/libmpv/libmpv-2.dll"));
    let hwdec = std::env::var("NOVA_COMPAT_HWDEC").unwrap_or_else(|_| "no".into());
    let only = std::env::var("NOVA_COMPAT_ONLY").ok();
    let manifest = root().join("tests/fixtures/compat/manifest.jsonl");
    let samples: Vec<Sample> = std::fs::read_to_string(&manifest)
        .expect("run scripts/generate-compat-corpus.sh")
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| serde_json::from_str(l).expect("manifest line"))
        .filter(|s: &Sample| only.as_ref().is_none_or(|o| s.id.contains(o.as_str())))
        .collect();
    let mpv = MpvPlayer::new(MpvConfig::headless(&lib), Arc::new(|_| {}))
        .unwrap()
        .diagnostics()
        .mpv_version
        .unwrap_or_default();

    let mut outcomes = Vec::new();
    for s in &samples {
        let o = run(s, &lib, &hwdec);
        println!(
            "{:<16} {:<22} {:<8} {}",
            o.id,
            o.expect,
            o.result,
            if o.pass {
                "PASS".to_owned()
            } else {
                format!("FAIL {:?}", o.failures)
            }
        );
        outcomes.push(o);
    }
    let out = root().join("docs/compat");
    std::fs::create_dir_all(&out).unwrap();
    let tag = hwdec.replace(['-', '/'], "_");
    std::fs::write(
        out.join(format!("results-{tag}.md")),
        md_table(&outcomes, &hwdec, &mpv),
    )
    .unwrap();
    std::fs::write(
        out.join(format!("results-{tag}.json")),
        serde_json::to_string_pretty(&outcomes).unwrap(),
    )
    .unwrap();
    let failed: Vec<_> = outcomes
        .iter()
        .filter(|o| !o.pass)
        .map(|o| o.id.clone())
        .collect();
    println!(
        "{} samples, {} failed: {failed:?}",
        outcomes.len(),
        failed.len()
    );
    assert!(failed.is_empty(), "failed: {failed:?}");
}
