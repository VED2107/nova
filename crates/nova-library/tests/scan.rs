//! Scanner behavior against real folders and a real SQLite database.

use nova_domain::progress::SavedProgress;
use nova_library::{ScanManager, ScanProgress, ScanState, scan_root};
use nova_storage::Store;
use nova_storage::library::LibrarySort;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

fn dir(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join("nova-scan-tests").join(name);
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

/// Writes a small file with distinct content (scanner does not decode media).
fn media(path: &Path, seed: u32) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(
        path,
        format!("fake media {seed} {}", "x".repeat(seed as usize % 97)),
    )
    .unwrap();
}

/// Joins a `/`-separated relative path using OS separators.
fn at(base: &Path, rel: &str) -> PathBuf {
    rel.split('/').fold(base.to_path_buf(), |p, c| p.join(c))
}

fn total(store: &Store) -> i64 {
    store
        .search("", LibrarySort::Title, false, 1, 0)
        .unwrap()
        .total
}

fn scan(store: &Store, root: i64) -> ScanProgress {
    scan_root(store, root, &AtomicBool::new(false), &mut |_| {}).unwrap()
}

fn titles(store: &Store) -> Vec<String> {
    store
        .search("", LibrarySort::Title, false, 500, 0)
        .unwrap()
        .items
        .into_iter()
        .map(|i| i.title)
        .collect()
}

#[test]
fn first_scan_adds_media_only_and_rescan_is_a_no_op() {
    let d = dir("basic");
    media(&d.join("a.mkv"), 1);
    media(&at(&d, "Sub/B.MP4"), 2);
    media(&at(&d, "Sub/Deeper/c.webm"), 3);
    std::fs::write(d.join("notes.txt"), "not media").unwrap();
    std::fs::write(at(&d, "Sub/cover.jpg"), "not media").unwrap();
    let s = Store::open_in_memory().unwrap();
    let root = s.add_root(&d).unwrap().id;

    let p = scan(&s, root);
    assert_eq!(p.state, ScanState::Completed);
    assert_eq!(
        (
            p.files_seen,
            p.files_added,
            p.files_updated,
            p.files_missing
        ),
        (3, 3, 0, 0)
    );
    assert_eq!(titles(&s), ["a", "B", "c"]);

    let p = scan(&s, root);
    assert_eq!(
        (
            p.files_seen,
            p.files_added,
            p.files_updated,
            p.files_missing
        ),
        (3, 0, 0, 0)
    );
}

#[test]
fn renamed_and_moved_files_keep_identity_and_progress() {
    let d = dir("moves");
    media(&at(&d, "show/ep1.mkv"), 1);
    media(&at(&d, "show/ep2.mkv"), 2);
    let s = Store::open_in_memory().unwrap();
    let root = s.add_root(&d).unwrap().id;
    scan(&s, root);
    let id1 = s
        .known_file(&at(&d, "show/ep1.mkv").to_string_lossy())
        .unwrap()
        .unwrap()
        .0;
    let progress = SavedProgress {
        position_ms: 120_000,
        duration_ms: Some(1_200_000),
        completed: false,
    };
    s.save_progress(id1, progress).unwrap();

    std::fs::rename(at(&d, "show/ep1.mkv"), at(&d, "show/Episode 1.mkv")).unwrap();
    std::fs::create_dir_all(d.join("archive")).unwrap();
    std::fs::rename(at(&d, "show/ep2.mkv"), at(&d, "archive/ep2.mkv")).unwrap();

    let p = scan(&s, root);
    assert_eq!(
        (p.files_added, p.files_updated, p.files_missing),
        (0, 2, 0),
        "{p:?}"
    );
    let renamed = s
        .known_file(&at(&d, "show/Episode 1.mkv").to_string_lossy())
        .unwrap()
        .unwrap()
        .0;
    assert_eq!(renamed, id1);
    assert_eq!(s.load_progress(id1).unwrap(), Some(progress));
    assert_eq!(titles(&s), ["ep2", "Episode 1"]);
}

#[test]
fn deleted_folder_is_flagged_missing_and_recovers() {
    let d = dir("deleted");
    media(&at(&d, "keep/a.mkv"), 1);
    media(&at(&d, "gone/b.mkv"), 2);
    media(&at(&d, "gone/c.mkv"), 3);
    let s = Store::open_in_memory().unwrap();
    let root = s.add_root(&d).unwrap().id;
    scan(&s, root);

    let backup = std::env::temp_dir()
        .join("nova-scan-tests")
        .join("deleted-backup");
    let _ = std::fs::remove_dir_all(&backup);
    std::fs::rename(d.join("gone"), &backup).unwrap();
    let p = scan(&s, root);
    assert_eq!(p.files_missing, 2);
    assert_eq!(titles(&s), ["a"]);

    std::fs::rename(&backup, d.join("gone")).unwrap();
    let p = scan(&s, root);
    assert_eq!((p.files_updated, p.files_missing), (2, 0));
    assert_eq!(titles(&s).len(), 3);
}

#[test]
fn inaccessible_root_fails_without_flagging_missing() {
    let d = dir("unplugged");
    media(&at(&d, "lib/a.mkv"), 1);
    let s = Store::open_in_memory().unwrap();
    let root = s.add_root(&d.join("lib")).unwrap().id;
    scan(&s, root);
    let moved = std::env::temp_dir()
        .join("nova-scan-tests")
        .join("unplugged-elsewhere");
    let _ = std::fs::remove_dir_all(&moved);
    std::fs::rename(d.join("lib"), &moved).unwrap(); // like an unplugged drive
    let p = scan(&s, root);
    assert_eq!(p.state, ScanState::Failed);
    assert_eq!(p.files_missing, 0);
    assert!(!s.search("", LibrarySort::Title, true, 50, 0).unwrap().items[0].missing);
    std::fs::rename(&moved, d.join("lib")).unwrap();
}

#[test]
fn cancelled_scan_keeps_committed_work_and_flags_nothing() {
    let d = dir("cancel");
    for i in 0..1_000 {
        media(&at(&d, &format!("f{}/{i:04}.mkv", i % 10)), i);
    }
    let s = Store::open_in_memory().unwrap();
    let root = s.add_root(&d).unwrap().id;
    scan(&s, root); // all 1000 known

    // Remove half, then cancel the rescan after the first committed batch.
    for i in (0..1_000).step_by(2) {
        std::fs::remove_file(at(&d, &format!("f{}/{i:04}.mkv", i % 10))).unwrap();
    }
    let cancel = AtomicBool::new(false);
    let p = scan_root(&s, root, &cancel, &mut |p| {
        if p.files_seen > 0 {
            cancel.store(true, std::sync::atomic::Ordering::SeqCst);
        }
    })
    .unwrap();
    assert_eq!(p.state, ScanState::Cancelled);
    assert!(p.files_seen < 500, "stopped early: {}", p.files_seen);
    assert_eq!(p.files_missing, 0, "cancelled scan must not flag missing");
    assert_eq!(total(&s), 1_000);

    let p = scan(&s, root);
    assert_eq!(p.files_missing, 500);
    assert_eq!(total(&s), 500);
}

#[test]
fn interrupted_scan_is_reported_after_restart() {
    let d = dir("crash");
    media(&d.join("a.mkv"), 1);
    let db = d.join("nova.sqlite3");
    {
        let s = Store::open(&db).unwrap();
        let root = s.add_root(&d).unwrap().id;
        s.begin_job(root).unwrap(); // process "dies" mid-scan
    }
    let s = Store::open(&db).unwrap();
    assert_eq!(s.mark_interrupted_jobs().unwrap(), 1);
    let root = &s.roots().unwrap()[0];
    assert_eq!(root.last_scan.as_ref().unwrap().status, "interrupted");
    assert_eq!(scan(&s, root.id).files_added, 1);
}

#[cfg(windows)]
#[test]
fn junction_loops_are_not_followed() {
    let d = dir("junction");
    media(&at(&d, "real/a.mkv"), 1);
    let link = at(&d, "real/loop");
    let status = std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(&link)
        .arg(&d)
        .output()
        .expect("run mklink");
    assert!(status.status.success(), "mklink /J failed: {status:?}");
    let s = Store::open_in_memory().unwrap();
    let root = s.add_root(&d).unwrap().id;
    let p = scan(&s, root);
    assert_eq!(p.state, ScanState::Completed);
    assert_eq!((p.files_seen, p.skipped_links), (1, 1));
}

#[test]
fn manager_runs_queue_in_background_and_cancels() {
    let d = dir("manager");
    for i in 0..300 {
        media(&d.join(format!("one/{i}.mkv")), i);
        media(&d.join(format!("two/{i}.mkv")), i + 1000);
    }
    let store = Arc::new(Store::open_in_memory().unwrap());
    let r1 = store.add_root(&d.join("one")).unwrap().id;
    let r2 = store.add_root(&d.join("two")).unwrap().id;
    let events = Arc::new(Mutex::new(Vec::<ScanProgress>::new()));
    let e2 = Arc::clone(&events);
    let m = ScanManager::new(
        Arc::clone(&store),
        Box::new(move |p| e2.lock().unwrap().push(p.clone())),
    );

    let t = Instant::now();
    m.enqueue([r1, r2, r1]);
    assert!(m.wait_idle(Duration::from_secs(30)));
    let done: Vec<_> = events
        .lock()
        .unwrap()
        .iter()
        .filter(|p| p.state == ScanState::Completed)
        .cloned()
        .collect();
    assert_eq!(
        done.iter().map(|p| p.root_id).collect::<Vec<_>>(),
        [r1, r2],
        "duplicate enqueue ignored"
    );
    assert_eq!(
        store
            .search("", LibrarySort::Title, false, 1, 0)
            .unwrap()
            .total,
        600
    );
    println!(
        "manager scanned 600 files across 2 roots in {:?}",
        t.elapsed()
    );

    m.cancel_all();
    m.enqueue([r1]);
    m.cancel_all();
    assert!(m.wait_idle(Duration::from_secs(30)));
    m.shutdown();
}

/// LIB-01/02 fixture: 20 000 files. Slow to create, so opt-in:
/// `cargo test -p nova-library --release -- --ignored --nocapture`
#[test]
#[ignore]
fn scan_20k_files() {
    let d = dir("perf20k");
    for i in 0..20_000u32 {
        media(
            &at(
                &d,
                &format!("s{:02}/d{:02}/{i:05} episode.mkv", i % 40, (i / 40) % 25),
            ),
            i,
        );
    }
    let s = Store::open(&d.join("lib.sqlite3")).unwrap();
    let root = s.add_root(&d).unwrap().id;
    let t = Instant::now();
    let p = scan(&s, root);
    println!("first scan: {} files in {:?}", p.files_seen, t.elapsed());
    let t = Instant::now();
    let p2 = scan(&s, root);
    println!(
        "rescan (unchanged): {} files in {:?}",
        p2.files_seen,
        t.elapsed()
    );
    assert_eq!(
        (p.files_added, p2.files_added, p2.files_updated),
        (20_000, 0, 0)
    );
    let t = Instant::now();
    let page = s
        .search("episode 0042", LibrarySort::Relevance, false, 100, 0)
        .unwrap();
    println!("search over 20k: {} hits in {:?}", page.total, t.elapsed());
}
