//! Seeds a library database for manual/visual testing:
//! cargo run -p nova-library --example seed_library -- <data dir> <folder>...
use nova_library::thumbs::ThumbnailWorker;
use nova_library::{ScanState, scan_root};
use nova_storage::Store;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let data = PathBuf::from(&args[0]);
    let store = Arc::new(Store::open(&data.join("library.sqlite3")).expect("db"));
    for folder in &args[1..] {
        let root = match store.add_root(folder.as_ref()) {
            Ok(r) => r.id,
            Err(e) => {
                println!("{folder}: {e}");
                continue;
            }
        };
        let p = scan_root(&store, root, &AtomicBool::new(false), &mut |_| {}).unwrap();
        assert_eq!(p.state, ScanState::Completed);
        println!("{folder}: {} files, {} added", p.files_seen, p.files_added);
    }
    let done = Arc::new(AtomicUsize::new(0));
    let d2 = Arc::clone(&done);
    let lib = PathBuf::from("vendor/libmpv/libmpv-2.dll");
    let w = ThumbnailWorker::start(
        Arc::clone(&store),
        lib,
        data.join("thumbs"),
        Box::new(move |n| {
            d2.fetch_add(n, Ordering::SeqCst);
        }),
    );
    while !store.pending_thumbnails(1).unwrap().is_empty() {
        std::thread::sleep(std::time::Duration::from_millis(200));
    }
    w.shutdown();
    println!(
        "thumbnails/facts processed: {}",
        done.load(Ordering::SeqCst)
    );
}
