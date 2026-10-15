//! Background poster-frame and duration extraction for library items.
//!
//! One low-priority worker thread asks the store for items without a frame,
//! extracts one with the engine's image output, and records duration/size.
//! It pauses briefly between items so it never competes hard with playback.

use nova_playback_mpv::thumbnail;
use nova_storage::Store;
use nova_storage::extras::ThumbState;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

pub type ThumbProgress = Box<dyn Fn(usize) + Send + Sync>;

pub struct ThumbnailWorker {
    kick: Arc<(Mutex<bool>, Condvar)>,
    stop: Arc<AtomicBool>,
    thread: Mutex<Option<JoinHandle<()>>>,
}

impl ThumbnailWorker {
    /// `on_progress(done)` is called after each batch of finished items.
    pub fn start(
        store: Arc<Store>,
        libmpv: PathBuf,
        dir: PathBuf,
        on_progress: ThumbProgress,
    ) -> Self {
        let kick: Arc<(Mutex<bool>, Condvar)> = Arc::new((Mutex::new(true), Condvar::new()));
        let stop = Arc::new(AtomicBool::new(false));
        let (k, s) = (Arc::clone(&kick), Arc::clone(&stop));
        let thread = std::thread::Builder::new()
            .name("nova-thumbnails".into())
            .spawn(move || run(store, libmpv, dir, k, s, on_progress))
            .expect("spawn thumbnail worker");
        Self {
            kick,
            stop,
            thread: Mutex::new(Some(thread)),
        }
    }

    /// Wakes the worker (e.g. after a scan added items).
    pub fn kick(&self) {
        let (lock, cv) = &*self.kick;
        *lock.lock().unwrap() = true;
        cv.notify_all();
    }

    pub fn shutdown(&self) {
        self.stop.store(true, Ordering::SeqCst);
        self.kick();
        if let Some(t) = self.thread.lock().unwrap().take() {
            let _ = t.join();
        }
    }
}

impl Drop for ThumbnailWorker {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn run(
    store: Arc<Store>,
    libmpv: PathBuf,
    dir: PathBuf,
    kick: Arc<(Mutex<bool>, Condvar)>,
    stop: Arc<AtomicBool>,
    on_progress: ThumbProgress,
) {
    let _ = std::fs::create_dir_all(&dir);
    loop {
        {
            let (lock, cv) = &*kick;
            let mut pending = lock.lock().unwrap();
            while !*pending && !stop.load(Ordering::SeqCst) {
                pending = cv.wait(pending).unwrap();
            }
            *pending = false;
        }
        if stop.load(Ordering::SeqCst) {
            return;
        }
        loop {
            let batch = match store.pending_thumbnails(8) {
                Ok(b) if !b.is_empty() => b,
                Ok(_) => break,
                Err(e) => {
                    log::warn!("thumbnail queue unavailable: {e}");
                    break;
                }
            };
            let mut done = 0;
            for (id, path) in batch {
                if stop.load(Ordering::SeqCst) {
                    return;
                }
                let out = dir.join(format!("{id}.jpg"));
                let result = thumbnail::extract(
                    &libmpv,
                    path.as_ref(),
                    &out,
                    25,
                    480,
                    Duration::from_secs(20),
                );
                let (state, facts) = match result {
                    Ok(t) if t.image.as_os_str().is_empty() => (ThumbState::None, Some(t)),
                    Ok(t) => (ThumbState::Ready, Some(t)),
                    Err(e) => {
                        log::info!("no poster frame for item {id}: {e}");
                        (ThumbState::None, None)
                    }
                };
                let (d, w, h) =
                    facts.map_or((None, None, None), |t| (t.duration_ms, t.width, t.height));
                if let Err(e) = store.set_media_facts(id, state, d, w, h) {
                    log::warn!("could not record media facts: {e}");
                }
                done += 1;
                std::thread::sleep(Duration::from_millis(120));
            }
            on_progress(done);
        }
    }
}
