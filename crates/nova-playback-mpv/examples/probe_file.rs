//! Opens one file headless and prints engine log lines (warn+) and the
//! final snapshot. Usage: cargo run -p nova-playback-mpv --example probe_file -- <file>
use nova_playback_api::{PlaybackBackend, PlaybackCommand};
use nova_playback_mpv::{MpvConfig, MpvPlayer};
use std::sync::Arc;

struct Print;
impl log::Log for Print {
    fn enabled(&self, _: &log::Metadata) -> bool {
        true
    }
    fn log(&self, r: &log::Record) {
        eprintln!("[{}] {}", r.target(), r.args());
    }
    fn flush(&self) {}
}

fn main() {
    log::set_logger(&Print).unwrap();
    log::set_max_level(log::LevelFilter::Warn);
    let file = std::env::args().nth(1).expect("file");
    let p = MpvPlayer::new(
        MpvConfig::headless("vendor/libmpv/libmpv-2.dll"),
        Arc::new(|_| {}),
    )
    .unwrap();
    println!(
        "open: {:?}",
        p.execute(PlaybackCommand::Open {
            path: file,
            start_ms: None
        })
    );
    std::thread::sleep(std::time::Duration::from_millis(1500));
    let s = p.snapshot();
    println!(
        "phase={:?} dur={:?} issues={:?} err={:?}",
        s.phase, s.duration_ms, s.issues, s.error
    );
    println!("details={:#?}", p.media_details());
}
