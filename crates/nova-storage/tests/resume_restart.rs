//! End-to-end resume across an application restart, with every real layer:
//! libmpv (headless) + QueueService + ProgressService + SQLite file on disk.
//! Requires scripts/fetch-libmpv.sh and scripts/generate-fixtures.sh.

use nova_application::progress_service::ProgressService;
use nova_application::queue_service::QueueService;
use nova_domain::progress::ResumePolicy;
use nova_playback_api::{PlaybackBackend, PlaybackCommand, PlaybackPhase, PlaybackSnapshot};
use nova_playback_mpv::{MpvConfig, MpvPlayer};
use nova_storage::Store;
use std::path::PathBuf;
use std::sync::mpsc::{Receiver, channel};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}

fn fixture() -> String {
    let p = root().join("tests/fixtures/media/h264_aac_360p30_180s.mp4");
    assert!(p.exists(), "run scripts/generate-fixtures.sh");
    p.to_string_lossy().trim_start_matches(r"\?\").to_string()
}

struct App {
    player: Arc<MpvPlayer>,
    queue: Arc<QueueService>,
    progress: Arc<ProgressService>,
    rx: Receiver<PlaybackSnapshot>,
    notices: Arc<Mutex<Vec<u64>>>,
}

/// Wires the services the same way the desktop shell does.
fn start(db: &std::path::Path) -> App {
    let store = Arc::new(Store::open(db).expect("open db"));
    let notices = Arc::new(Mutex::new(vec![]));
    let n2 = Arc::clone(&notices);
    let progress = ProgressService::new(
        store,
        ResumePolicy::default(),
        Box::new(move |n| n2.lock().unwrap().push(n.position_ms)),
    );
    let queue = QueueService::new(Box::new(|_| {}));
    queue.attach_progress(Arc::clone(&progress));
    let (tx, rx) = channel();
    let tx = Mutex::new(tx);
    let p2 = Arc::clone(&progress);
    let sink = Arc::new(move |s: PlaybackSnapshot| {
        p2.on_snapshot(&s);
        let _ = tx.lock().unwrap().send(s);
    });
    let lib = std::env::var_os("NOVA_LIBMPV_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|| root().join("vendor/libmpv/libmpv-2.dll"));
    let player = Arc::new(MpvPlayer::new(MpvConfig::headless(lib), sink).expect("libmpv"));
    let backend: Arc<dyn PlaybackBackend> = player.clone();
    queue.attach(&backend);
    App {
        player,
        queue,
        progress,
        rx,
        notices,
    }
}

fn wait(app: &App, what: &str, pred: impl Fn(&PlaybackSnapshot) -> bool) -> PlaybackSnapshot {
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        let s = app.player.snapshot();
        if pred(&s) {
            return s;
        }
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            panic!(
                "timed out waiting for {what}; last {:?} at {}",
                s.phase, s.position_ms
            );
        }
        let _ = app.rx.recv_timeout(left.min(Duration::from_millis(100)));
    }
}

fn shutdown(app: App) {
    let last = app.player.snapshot();
    app.progress.shutdown(Some(&last));
    drop(app.queue);
    drop(app.player); // destroys libmpv
}

#[test]
fn position_survives_restart_and_completion_resets_it() {
    let dir = std::env::temp_dir().join("nova-resume-e2e");
    let _ = std::fs::remove_dir_all(&dir);
    let db = dir.join("nova.sqlite3");
    let file = fixture();

    // Session 1: watch, seek to 70 s, pause, quit.
    let app = start(&db);
    app.queue.open(vec![file.clone()]).unwrap();
    wait(&app, "playing", |s| s.phase == PlaybackPhase::Playing);
    assert!(
        app.notices.lock().unwrap().is_empty(),
        "nothing to resume on first open"
    );
    app.player
        .execute(PlaybackCommand::Seek {
            position_ms: 70_000,
            exact: true,
        })
        .unwrap();
    app.player.execute(PlaybackCommand::Pause).unwrap();
    wait(&app, "paused at 70 s", |s| {
        s.phase == PlaybackPhase::Paused && s.position_ms.abs_diff(70_000) < 100
    });
    shutdown(app);

    // Session 2: new process state, same database file.
    let app = start(&db);
    app.queue.open(vec![file.clone()]).unwrap();
    let s = wait(&app, "playing after resume", |s| {
        s.phase == PlaybackPhase::Playing
    });
    assert!(
        (67_900..=69_000).contains(&s.position_ms),
        "expected resume at ~68 s (70 s minus 2 s rewind), got {}",
        s.position_ms
    );
    assert_eq!(app.notices.lock().unwrap().as_slice(), [68_000]);

    // Watch to the end: completion is recorded.
    app.player
        .execute(PlaybackCommand::Seek {
            position_ms: 179_000,
            exact: false,
        })
        .unwrap();
    wait(&app, "ended", |s| s.phase == PlaybackPhase::Ended);
    shutdown(app);

    // Session 3: completed media starts from the beginning.
    let app = start(&db);
    app.queue.open(vec![file]).unwrap();
    let s = wait(&app, "playing from start", |s| {
        s.phase == PlaybackPhase::Playing
    });
    assert!(
        s.position_ms < 1_500,
        "completed media must start over, got {}",
        s.position_ms
    );
    assert!(app.notices.lock().unwrap().is_empty());
    shutdown(app);
}
