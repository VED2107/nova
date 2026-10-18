//! Measures seek accuracy against the real engine (headless).
//!
//! For every file in the seek corpus (scripts/generate-seek-fixtures.sh) it
//! issues seeks through the public `PlaybackBackend` contract, waits until the
//! engine reports the seek settled, and reads the presented frame's timestamp
//! (`time-pos` while paused). Ground truth is the `.pts` sidecar: the frame a
//! viewer *should* see at time T is the last frame whose pts <= T.
//!
//! Usage:
//!   cargo run -p nova-playback-mpv --example seek_probe --release -- [dir] [--json out.json]
use nova_playback_api::{
    PlaybackBackend, PlaybackCommand as Cmd, PlaybackPhase as P, PlaybackSnapshot,
};
use nova_playback_mpv::{MpvConfig, MpvPlayer};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, channel};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const SAMPLES: usize = 40;

struct Probe {
    player: MpvPlayer,
    rx: Receiver<PlaybackSnapshot>,
}

#[derive(Default)]
struct Series {
    /// landed - target, ms
    err_ms: Vec<f64>,
    /// index(landed) - index(ideal frame)
    frame_err: Vec<i64>,
    latency_ms: Vec<f64>,
    /// landed on the engine's documented rule: first frame with pts >= target - 5 ms
    rule_hits: usize,
    unmeasured: usize,
}

impl Series {
    fn push(&mut self, pts: &[f64], target: f64, landed: f64, latency: f64) {
        self.err_ms.push((landed - target) * 1000.0);
        let got = nearest_frame(pts, landed);
        self.frame_err
            .push(got as i64 - frame_at(pts, target) as i64);
        let rule = pts
            .partition_point(|&p| p < target - 0.005)
            .min(pts.len() - 1);
        if got == rule {
            self.rule_hits += 1;
        }
        self.latency_ms.push(latency);
    }
}

impl Probe {
    fn new(lib: &Path) -> Self {
        let (tx, rx) = channel();
        let tx = Mutex::new(tx);
        let sink = Arc::new(move |s: PlaybackSnapshot| {
            let _ = tx.lock().unwrap().send(s);
        });
        let player = MpvPlayer::new(MpvConfig::headless(lib.to_path_buf()), sink).expect("libmpv");
        Self { player, rx }
    }

    fn drain(&self) {
        while self.rx.try_recv().is_ok() {}
    }

    fn wait(&self, ms: u64, pred: impl Fn(&PlaybackSnapshot) -> bool) -> bool {
        let deadline = Instant::now() + Duration::from_millis(ms);
        if pred(&self.player.snapshot()) {
            return true;
        }
        while let Ok(s) = self
            .rx
            .recv_timeout(deadline.saturating_duration_since(Instant::now()))
        {
            if pred(&s) {
                return true;
            }
        }
        false
    }

    fn open(&self, path: &str) -> Option<u64> {
        self.drain();
        let ack = self
            .player
            .execute(Cmd::Open {
                path: path.into(),
                start_ms: None,
            })
            .ok()?;
        self.wait(15_000, |s| {
            s.session_id == ack.session_id && s.phase == P::Playing && s.duration_ms.is_some()
        });
        self.player.execute(Cmd::Pause).ok()?;
        self.wait(3_000, |s| s.phase == P::Paused);
        self.player.snapshot().duration_ms
    }

    /// Runs one command and waits for the engine to settle after it. Returns
    /// the presented frame time (s) and the latency, or None if unmeasurable.
    fn settle(&self, cmd: Cmd) -> Option<(f64, f64)> {
        self.drain();
        let t0 = Instant::now();
        self.player.execute(cmd).ok()?;
        // A seek always produces Seeking then a settled phase. If the engine
        // reports nothing (target == current), fall through after a short wait.
        let saw = self.wait(2_000, |s| s.phase == P::Seeking);
        if saw {
            self.wait(20_000, |s| s.phase != P::Seeking);
        }
        let latency = t0.elapsed().as_secs_f64() * 1000.0;
        // time-pos is updated with the restart; read the engine directly.
        std::thread::sleep(Duration::from_millis(15));
        let pos = self
            .player
            .property_string("time-pos")?
            .parse::<f64>()
            .ok()?;
        Some((pos, latency))
    }
}

/// Index of the last frame with pts <= t (the frame on screen at t).
fn frame_at(pts: &[f64], t: f64) -> usize {
    match pts.partition_point(|&p| p <= t + 1e-6) {
        0 => 0,
        n => n - 1,
    }
}

fn nearest_frame(pts: &[f64], t: f64) -> usize {
    let i = pts.partition_point(|&p| p < t);
    let cands = [i.saturating_sub(1), i.min(pts.len() - 1)];
    *cands
        .iter()
        .min_by(|a, b| (pts[**a] - t).abs().total_cmp(&(pts[**b] - t).abs()))
        .unwrap()
}

/// Deterministic targets: edges, frame boundaries and a spread over the file.
fn targets(pts: &[f64], dur: f64) -> Vec<f64> {
    let mut v = vec![0.0, 0.5, dur - 1.0];
    let mut x: u64 = 0x9E37_79B9_7F4A_7C15;
    while v.len() < SAMPLES {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        let f = (x % 1_000_000) as f64 / 1_000_000.0;
        let t = f * (dur - 1.5);
        // Half land mid-frame, a quarter exactly on a frame, a quarter 1 ms before one.
        let i = frame_at(pts, t);
        v.push(match v.len() % 4 {
            0 => pts[i],
            1 => (pts[(i + 1).min(pts.len() - 1)] - 0.001).max(0.0),
            _ => t,
        });
    }
    v
}

fn pct(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return f64::NAN;
    }
    sorted[((sorted.len() - 1) as f64 * p).round() as usize]
}

fn summarize(name: &str, mode: &str, s: &Series) -> String {
    let mut abs: Vec<f64> = s.err_ms.iter().map(|e| e.abs()).collect();
    abs.sort_by(f64::total_cmp);
    let mut lat = s.latency_ms.clone();
    lat.sort_by(f64::total_cmp);
    let exact = s.frame_err.iter().filter(|e| **e == 0).count();
    let mut fe: Vec<i64> = s.frame_err.clone();
    fe.sort();
    format!(
        "| {name} | {mode} | {} | {:.1} | {:.1} | {:.1} | {}/{} | {}/{} | {}..{} | {:.0} | {:.0} | {} |",
        s.err_ms.len(),
        pct(&abs, 0.5),
        pct(&abs, 0.95),
        abs.last().copied().unwrap_or(f64::NAN),
        exact,
        s.frame_err.len(),
        s.rule_hits,
        s.frame_err.len(),
        fe.first().copied().unwrap_or(0),
        fe.last().copied().unwrap_or(0),
        pct(&lat, 0.5),
        pct(&lat, 0.95),
        s.unmeasured
    )
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let dir = args
        .iter()
        .find(|a| !a.starts_with("--"))
        .map(PathBuf::from)
        .unwrap_or(root.join("tests/fixtures/seek"));
    let lib = std::env::var_os("NOVA_LIBMPV_PATH")
        .map(PathBuf::from)
        .unwrap_or(root.join("vendor/libmpv/libmpv-2.dll"));
    let only: Option<String> = std::env::var("SEEK_ONLY").ok();

    let mut files: Vec<PathBuf> = std::fs::read_dir(&dir)
        .expect("seek corpus; run scripts/generate-seek-fixtures.sh")
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x != "pts"))
        .filter(|p| {
            only.as_ref()
                .is_none_or(|o| p.to_string_lossy().contains(o.as_str()))
        })
        .collect();
    files.sort();

    let probe = Probe::new(&lib);
    println!(
        "| File | Mode | n | median abs err ms | p95 | max | on-screen frame | engine rule | frame err range | latency p50 ms | p95 | unmeasured |"
    );
    println!("|---|---|---|---|---|---|---|---|---|---|---|---|");
    for f in files {
        let pts: Vec<f64> = std::fs::read_to_string(
            f.with_extension(format!("{}.pts", f.extension().unwrap().to_string_lossy())),
        )
        .unwrap_or_default()
        .lines()
        .filter_map(|l| l.trim().parse().ok())
        .collect();
        if pts.is_empty() {
            continue;
        }
        let name = f.file_name().unwrap().to_string_lossy().to_string();
        let path = f
            .to_string_lossy()
            .trim_start_matches(r"\\?\")
            .replace('/', "\\");
        let Some(dur_ms) = probe.open(&path) else {
            println!("| {name} | open failed | | | | | | | | | |");
            continue;
        };
        let dur = dur_ms as f64 / 1000.0;
        let tg = targets(&pts, dur);

        for (mode, exact) in [("absolute exact", true), ("absolute keyframes", false)] {
            let mut s = Series::default();
            for &t in &tg {
                let ms = (t * 1000.0).round() as u64;
                match probe.settle(Cmd::Seek {
                    position_ms: ms,
                    exact,
                }) {
                    Some((landed, lat)) => s.push(&pts, ms as f64 / 1000.0, landed, lat),
                    None => s.unmeasured += 1,
                }
            }
            println!("{}", summarize(&name, mode, &s));
        }

        // Relative ±5 s from settled positions, as the arrow keys do.
        let mut s = Series::default();
        for (k, &t) in tg.iter().enumerate().take(SAMPLES / 2) {
            let start = t.clamp(6.0, dur - 7.0);
            if probe
                .settle(Cmd::Seek {
                    position_ms: (start * 1000.0) as u64,
                    exact: true,
                })
                .is_none()
            {
                s.unmeasured += 1;
                continue;
            }
            let Some(from) = probe
                .player
                .property_string("time-pos")
                .and_then(|v| v.parse::<f64>().ok())
            else {
                s.unmeasured += 1;
                continue;
            };
            let off: i64 = if k % 2 == 0 { 5_000 } else { -5_000 };
            match probe.settle(Cmd::SeekRelative { offset_ms: off }) {
                Some((landed, lat)) => s.push(&pts, from + off as f64 / 1000.0, landed, lat),
                None => s.unmeasured += 1,
            }
        }
        println!("{}", summarize(&name, "relative ±5 s", &s));

        // Rapid supersession: 12 exact seeks without waiting; only the last may land.
        let mut s = Series::default();
        for round in 0..5 {
            probe.drain();
            let mut last = 0u64;
            for i in 0..12 {
                last = (((round * 12 + i) as f64 * 0.0731).fract() * (dur - 2.0) * 1000.0) as u64;
                let _ = probe.player.execute(Cmd::Seek {
                    position_ms: last,
                    exact: true,
                });
            }
            let t0 = Instant::now();
            // Settled = not seeking for a while.
            loop {
                std::thread::sleep(Duration::from_millis(60));
                if probe.player.property_string("seeking").as_deref() == Some("no")
                    || t0.elapsed() > Duration::from_secs(20)
                {
                    break;
                }
            }
            std::thread::sleep(Duration::from_millis(50));
            let landed = probe
                .player
                .property_string("time-pos")
                .and_then(|v| v.parse::<f64>().ok());
            let snap = probe.player.snapshot();
            match landed {
                Some(l) => {
                    s.push(
                        &pts,
                        last as f64 / 1000.0,
                        l,
                        t0.elapsed().as_secs_f64() * 1000.0,
                    );
                    // The snapshot the UI sees must agree with the engine.
                    if (snap.position_ms as f64 - l * 1000.0).abs() > 50.0 {
                        eprintln!(
                            "{name}: stale snapshot {} vs engine {:.0}",
                            snap.position_ms,
                            l * 1000.0
                        );
                    }
                }
                None => s.unmeasured += 1,
            }
        }
        println!("{}", summarize(&name, "rapid 12x exact", &s));
    }
}
