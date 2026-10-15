//! Thumbnail worker against the real engine and a real store.

use nova_library::thumbs::ThumbnailWorker;
use nova_storage::Store;
use nova_storage::identity::FileIdentity;
use nova_storage::library::LibrarySort;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};

#[test]
fn worker_extracts_frame_and_duration() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let media = root.join("tests/fixtures/media");
    let lib = std::env::var_os("NOVA_LIBMPV_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|| root.join("vendor/libmpv/libmpv-2.dll"));
    let store = Arc::new(Store::open_in_memory().unwrap());
    let root_id = store.add_root(&media).unwrap().id;
    let job = store.begin_job(root_id).unwrap();
    let file = FileIdentity::from_path(&media.join("h264_aac_360p30_180s.mp4")).unwrap();
    store
        .record_batch(
            job,
            root_id,
            &[nova_storage::library::ScanEntry::Changed(file)],
        )
        .unwrap();

    let dir = std::env::temp_dir().join("nova-thumb-worker-test");
    let _ = std::fs::remove_dir_all(&dir);
    let done = Arc::new(AtomicUsize::new(0));
    let d2 = Arc::clone(&done);
    let worker = ThumbnailWorker::start(
        Arc::clone(&store),
        lib,
        dir.clone(),
        Box::new(move |n| {
            d2.fetch_add(n, Ordering::SeqCst);
        }),
    );
    let deadline = Instant::now() + Duration::from_secs(20);
    while done.load(Ordering::SeqCst) == 0 && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(50));
    }
    worker.shutdown();
    let item = store
        .search("", LibrarySort::Title, false, 5, 0)
        .unwrap()
        .items
        .remove(0);
    assert!(item.has_thumbnail);
    assert_eq!(item.duration_ms, Some(180_000));
    assert_eq!((item.width, item.height), (Some(640), Some(360)));
    assert!(
        dir.join(format!("{}.jpg", item.id))
            .metadata()
            .unwrap()
            .len()
            > 1000
    );
}
