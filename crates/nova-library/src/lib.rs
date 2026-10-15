//! Background scanning of user-selected media folders.
//!
//! [`scan_root`] walks one root on the calling thread; [`ScanManager`] runs
//! scans one at a time on a dedicated worker thread.
//!
//! Walk rules:
//! - Iterative (explicit stack) and streaming: memory grows with directory
//!   depth, not with the number of files.
//! - Symlinks and Windows junctions are **not followed** (no loops, no
//!   escaping the root, no double counting).
//! - Unreadable directories and files are counted as errors and skipped; an
//!   unreadable *root* fails the scan without flagging anything missing.
//! - Files whose path, size and modification time are unchanged are not
//!   re-read; new or changed files are fingerprinted (see nova-storage).
//! - Results are committed in small transactions, so cancellation or a crash
//!   leaves the database consistent. Only a completed scan flags unseen files
//!   as missing.

use nova_storage::Store;
use nova_storage::identity::FileIdentity;
use nova_storage::library::{JobStatus, RootId, ScanEntry};
use serde::Serialize;
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant, UNIX_EPOCH};

/// Extensions treated as media (lowercase, without dot).
pub const MEDIA_EXTENSIONS: &[&str] = &[
    "mp4", "m4v", "mkv", "webm", "mov", "avi", "wmv", "flv", "ts", "m2ts", "mts", "m2t", "mpg",
    "mpeg", "ogv", "3gp", "3g2", "mxf", "vob", "dv", "gxf", "f4v", "divx", "asf", "y4m", "mp3",
    "flac", "m4a", "aac", "ogg", "opus", "wav", "wma", "aif", "aiff", "ac3", "eac3", "dts", "mka",
    "alac", "thd",
];

/// Folders never descended into.
const SKIPPED_DIRS: &[&str] = &["$recycle.bin", "system volume information", "node_modules"];

const BATCH_FILES: usize = 200;
const BATCH_INTERVAL: Duration = Duration::from_millis(300);

pub fn is_media_path(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| MEDIA_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ScanState {
    Queued,
    Scanning,
    Completed,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub root_id: RootId,
    pub state: ScanState,
    pub files_seen: i64,
    pub files_added: i64,
    pub files_updated: i64,
    pub files_missing: i64,
    pub errors: i64,
    pub skipped_links: i64,
    pub last_error: Option<String>,
}

impl ScanProgress {
    fn new(root_id: RootId) -> Self {
        Self {
            root_id,
            state: ScanState::Scanning,
            files_seen: 0,
            files_added: 0,
            files_updated: 0,
            files_missing: 0,
            errors: 0,
            skipped_links: 0,
            last_error: None,
        }
    }
}

struct Batch<'a> {
    store: &'a Store,
    job: i64,
    root: RootId,
    entries: Vec<ScanEntry>,
    last_flush: Instant,
}

impl Batch<'_> {
    fn flush(&mut self, p: &mut ScanProgress) -> Result<(), String> {
        if !self.entries.is_empty() {
            let r = self
                .store
                .record_batch(self.job, self.root, &self.entries)
                .map_err(|e| e.to_string())?;
            p.files_seen += self.entries.len() as i64;
            p.files_added += r.added;
            p.files_updated += r.updated;
            self.entries.clear();
        }
        self.last_flush = Instant::now();
        Ok(())
    }

    fn due(&self) -> bool {
        self.entries.len() >= BATCH_FILES || self.last_flush.elapsed() >= BATCH_INTERVAL
    }
}

fn error(p: &mut ScanProgress, msg: String) {
    p.errors += 1;
    if p.errors <= 3 {
        log::warn!("scan: {msg}");
    }
    p.last_error = Some(msg);
}

fn observe(store: &Store, path: &Path, meta: &std::fs::Metadata) -> Result<ScanEntry, String> {
    let path_str = path.to_string_lossy();
    let size = meta.len() as i64;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64);
    if let Some((id, known_size, known_mtime)) =
        store.known_file(&path_str).map_err(|e| e.to_string())?
    {
        if known_size == size && known_mtime == mtime {
            return Ok(ScanEntry::Unchanged(id));
        }
    }
    FileIdentity::from_path(path)
        .map(ScanEntry::Changed)
        .map_err(|e| format!("{}: {e}", path.display()))
}

/// Scans one root synchronously. `on_progress` is called after each committed
/// batch and once at the end. Returns the final progress.
pub fn scan_root(
    store: &Store,
    root: RootId,
    cancel: &AtomicBool,
    on_progress: &mut dyn FnMut(&ScanProgress),
) -> Result<ScanProgress, String> {
    let root_path = store
        .root_path(root)
        .map_err(|e| e.to_string())?
        .ok_or("library folder no longer exists in the database")?;
    let job = store.begin_job(root).map_err(|e| e.to_string())?;
    let mut p = ScanProgress::new(root);
    on_progress(&p);

    let finish = |p: &mut ScanProgress, status: JobStatus| -> Result<(), String> {
        p.files_missing = store
            .finish_job(job, root, status, p.errors, p.last_error.as_deref())
            .map_err(|e| e.to_string())?;
        p.state = match status {
            JobStatus::Completed => ScanState::Completed,
            JobStatus::Cancelled => ScanState::Cancelled,
            JobStatus::Failed => ScanState::Failed,
        };
        Ok(())
    };

    let root_dir = PathBuf::from(&root_path);
    if std::fs::read_dir(&root_dir).is_err() {
        // Unplugged drive, deleted folder or no permission: never flag items missing.
        p.last_error = Some("library folder is not accessible".into());
        finish(&mut p, JobStatus::Failed)?;
        on_progress(&p);
        return Ok(p);
    }

    let mut batch = Batch {
        store,
        job,
        root,
        entries: Vec::new(),
        last_flush: Instant::now(),
    };
    let mut stack = vec![root_dir];
    'walk: while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(rd) => rd,
            Err(e) => {
                error(&mut p, format!("{}: {e}", dir.display()));
                continue;
            }
        };
        for entry in entries {
            if cancel.load(Ordering::Relaxed) {
                break 'walk;
            }
            let entry = match entry {
                Ok(e) => e,
                Err(e) => {
                    error(&mut p, format!("{}: {e}", dir.display()));
                    continue;
                }
            };
            let ft = match entry.file_type() {
                Ok(ft) => ft,
                Err(e) => {
                    error(&mut p, format!("{}: {e}", entry.path().display()));
                    continue;
                }
            };
            let path = entry.path();
            if ft.is_symlink() {
                p.skipped_links += 1;
            } else if ft.is_dir() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if !SKIPPED_DIRS.contains(&name.as_str()) {
                    stack.push(path);
                }
            } else if ft.is_file() && is_media_path(&path) {
                match entry
                    .metadata()
                    .map_err(|e| format!("{}: {e}", path.display()))
                {
                    Ok(meta) => match observe(store, &path, &meta) {
                        Ok(e) => batch.entries.push(e),
                        Err(msg) => error(&mut p, msg),
                    },
                    Err(msg) => error(&mut p, msg),
                }
            }
            if batch.due() {
                batch.flush(&mut p)?;
                on_progress(&p);
            }
        }
    }
    batch.flush(&mut p)?;
    let status = if cancel.load(Ordering::Relaxed) {
        JobStatus::Cancelled
    } else {
        JobStatus::Completed
    };
    finish(&mut p, status)?;
    on_progress(&p);
    Ok(p)
}

pub type ProgressSink = Box<dyn Fn(&ScanProgress) + Send + Sync>;

#[derive(Default)]
struct Shared {
    queue: VecDeque<RootId>,
    current: Option<ScanProgress>,
    shutdown: bool,
}

/// Runs scans one at a time on a worker thread.
pub struct ScanManager {
    shared: Arc<(Mutex<Shared>, Condvar)>,
    cancel: Arc<AtomicBool>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

impl ScanManager {
    pub fn new(store: Arc<Store>, sink: ProgressSink) -> Self {
        let shared: Arc<(Mutex<Shared>, Condvar)> = Arc::default();
        let cancel = Arc::new(AtomicBool::new(false));
        let (s2, c2) = (Arc::clone(&shared), Arc::clone(&cancel));
        let worker = std::thread::Builder::new()
            .name("nova-library-scan".into())
            .spawn(move || worker(store, s2, c2, sink))
            .expect("spawn scan worker");
        Self {
            shared,
            cancel,
            worker: Mutex::new(Some(worker)),
        }
    }

    /// Queues roots for scanning (duplicates and the running root are ignored).
    pub fn enqueue(&self, roots: impl IntoIterator<Item = RootId>) {
        let (lock, cv) = &*self.shared;
        let mut s = lock.lock().unwrap();
        for r in roots {
            let running = s.current.as_ref().is_some_and(|c| c.root_id == r);
            if !running && !s.queue.contains(&r) {
                s.queue.push_back(r);
            }
        }
        cv.notify_all();
    }

    /// Cancels the running scan and clears the queue.
    pub fn cancel_all(&self) {
        let (lock, _) = &*self.shared;
        let mut s = lock.lock().unwrap();
        s.queue.clear();
        if s.current.is_some() {
            self.cancel.store(true, Ordering::SeqCst);
        }
    }

    /// Cancels and dequeues one root (e.g. before removing it).
    pub fn cancel_root(&self, root: RootId) {
        let (lock, _) = &*self.shared;
        let mut s = lock.lock().unwrap();
        s.queue.retain(|r| *r != root);
        if s.current.as_ref().is_some_and(|c| c.root_id == root) {
            self.cancel.store(true, Ordering::SeqCst);
        }
    }

    pub fn status(&self) -> (Option<ScanProgress>, Vec<RootId>) {
        let s = self.shared.0.lock().unwrap();
        (s.current.clone(), s.queue.iter().copied().collect())
    }

    /// Blocks until no scan is running or queued (tests and shutdown).
    pub fn wait_idle(&self, timeout: Duration) -> bool {
        let (lock, cv) = &*self.shared;
        let deadline = Instant::now() + timeout;
        let mut s = lock.lock().unwrap();
        while s.current.is_some() || !s.queue.is_empty() {
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return false;
            }
            s = cv.wait_timeout(s, left).unwrap().0;
        }
        true
    }

    /// Cancels work and joins the worker. Committed batches stay committed.
    pub fn shutdown(&self) {
        {
            let (lock, cv) = &*self.shared;
            let mut s = lock.lock().unwrap();
            s.shutdown = true;
            s.queue.clear();
            self.cancel.store(true, Ordering::SeqCst);
            cv.notify_all();
        }
        if let Some(w) = self.worker.lock().unwrap().take() {
            let _ = w.join();
        }
    }
}

impl Drop for ScanManager {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn worker(
    store: Arc<Store>,
    shared: Arc<(Mutex<Shared>, Condvar)>,
    cancel: Arc<AtomicBool>,
    sink: ProgressSink,
) {
    let (lock, cv) = &*shared;
    loop {
        let root = {
            let mut s = lock.lock().unwrap();
            loop {
                if s.shutdown {
                    return;
                }
                if let Some(r) = s.queue.pop_front() {
                    s.current = Some(ScanProgress::new(r));
                    cancel.store(false, Ordering::SeqCst);
                    break r;
                }
                s = cv.wait(s).unwrap();
            }
        };
        let mut report = |p: &ScanProgress| {
            lock.lock().unwrap().current = Some(p.clone());
            sink(p);
        };
        let result = scan_root(&store, root, &cancel, &mut report);
        if let Err(e) = result {
            log::error!("scan of library folder {root} failed: {e}");
            let mut p = ScanProgress::new(root);
            p.state = ScanState::Failed;
            p.last_error = Some(e);
            sink(&p);
        }
        let mut s = lock.lock().unwrap();
        s.current = None;
        cv.notify_all();
    }
}
