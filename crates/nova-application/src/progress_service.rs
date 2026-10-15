//! Remembers watch progress and supplies resume positions.
//!
//! - `prepare` (before opening a file) identifies the media and decides the
//!   start position from saved progress.
//! - `on_snapshot` (engine event thread) only updates in-memory state and,
//!   when a write is due, hands a record to a background writer thread. It
//!   never touches the disk itself.
//! - Writes are batched: at most one per [`WRITE_INTERVAL`] while playing,
//!   plus on pause, end of media, switching files and shutdown.

use nova_domain::progress::{ResumePolicy, SavedProgress};
use nova_playback_api::{PlaybackPhase, PlaybackSnapshot, SessionId};
use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

pub const WRITE_INTERVAL: Duration = Duration::from_secs(5);

pub type MediaId = i64;

/// Persistence port. Implemented by `nova-storage`.
pub trait ProgressRepository: Send + Sync {
    /// Resolves a file to a stable media id (handling moves/replacements).
    fn identify(&self, path: &str) -> Result<MediaId, String>;
    fn load(&self, media: MediaId) -> Result<Option<SavedProgress>, String>;
    fn save(&self, media: MediaId, progress: SavedProgress) -> Result<(), String>;
}

/// Result of [`ProgressService::prepare`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Prepared {
    pub media: Option<MediaId>,
    pub start_ms: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ResumeNotice {
    pub session_id: SessionId,
    pub position_ms: u64,
}

pub type ResumeSink = Box<dyn Fn(ResumeNotice) + Send + Sync>;

#[derive(Debug, Clone, Copy)]
struct Tracked {
    session: SessionId,
    media: MediaId,
    position_ms: u64,
    duration_ms: Option<u64>,
    phase: PlaybackPhase,
    /// Last record handed to the writer (avoid duplicate writes).
    written: Option<SavedProgress>,
    last_write: Option<Instant>,
}

enum Msg {
    Save(MediaId, SavedProgress),
    Flush(Sender<()>),
}

pub struct ProgressService {
    /// When false, positions are still saved but files start from the beginning.
    resume_enabled: std::sync::atomic::AtomicBool,
    repo: Arc<dyn ProgressRepository>,
    policy: ResumePolicy,
    tracked: Mutex<Option<Tracked>>,
    tx: Mutex<Option<Sender<Msg>>>,
    writer: Mutex<Option<JoinHandle<()>>>,
    resume_sink: ResumeSink,
}

fn writer_loop(repo: Arc<dyn ProgressRepository>, rx: Receiver<Msg>) {
    for msg in rx {
        match msg {
            Msg::Save(media, p) => {
                if let Err(e) = repo.save(media, p) {
                    log::warn!("saving progress failed: {e}");
                }
            }
            Msg::Flush(ack) => {
                let _ = ack.send(());
            }
        }
    }
}

impl ProgressService {
    pub fn new(
        repo: Arc<dyn ProgressRepository>,
        policy: ResumePolicy,
        resume_sink: ResumeSink,
    ) -> Arc<Self> {
        let (tx, rx) = channel();
        let writer_repo = Arc::clone(&repo);
        let writer = std::thread::Builder::new()
            .name("nova-progress-writer".into())
            .spawn(move || writer_loop(writer_repo, rx))
            .expect("spawn progress writer");
        Arc::new(Self {
            resume_enabled: std::sync::atomic::AtomicBool::new(true),
            repo,
            policy,
            tracked: Mutex::new(None),
            tx: Mutex::new(Some(tx)),
            writer: Mutex::new(Some(writer)),
            resume_sink,
        })
    }

    fn lock(&self) -> MutexGuard<'_, Option<Tracked>> {
        self.tracked.lock().unwrap_or_else(|p| p.into_inner())
    }

    fn send(&self, msg: Msg) {
        if let Some(tx) = self.tx.lock().unwrap_or_else(|p| p.into_inner()).as_ref() {
            let _ = tx.send(msg);
        }
    }

    /// Writes `t`'s current state if it differs from what was last written.
    fn write(&self, t: &mut Tracked, now: Instant) {
        let decision = self.policy.evaluate(t.position_ms, t.duration_ms);
        if let Some(record) = self.policy.record(decision, t.duration_ms) {
            if t.written != Some(record) {
                self.send(Msg::Save(t.media, record));
                t.written = Some(record);
            }
        }
        t.last_write = Some(now);
    }

    pub fn set_resume_enabled(&self, enabled: bool) {
        self.resume_enabled
            .store(enabled, std::sync::atomic::Ordering::Relaxed);
    }

    /// Identifies `path` and returns where playback should start. Failures
    /// are logged and never block playback.
    pub fn prepare(&self, path: &str) -> Prepared {
        let media = match self.repo.identify(path) {
            Ok(id) => id,
            Err(e) => {
                log::warn!("could not identify media for progress: {e}");
                return Prepared {
                    media: None,
                    start_ms: None,
                };
            }
        };
        let start_ms = match self.repo.load(media) {
            Ok(Some(saved))
                if self
                    .resume_enabled
                    .load(std::sync::atomic::Ordering::Relaxed) =>
            {
                self.policy.resume_from(&saved)
            }
            Ok(Some(_)) => None,
            Ok(None) => None,
            Err(e) => {
                log::warn!("could not load progress: {e}");
                None
            }
        };
        Prepared {
            media: Some(media),
            start_ms,
        }
    }

    /// Starts tracking `session`. Flushes the previously tracked media first.
    pub fn started(&self, session: SessionId, prepared: Prepared) {
        let now = Instant::now();
        let mut tracked = self.lock();
        if let Some(prev) = tracked.as_mut() {
            self.write(prev, now);
        }
        *tracked = prepared.media.map(|media| Tracked {
            session,
            media,
            position_ms: prepared.start_ms.unwrap_or(0),
            duration_ms: None,
            phase: PlaybackPhase::Loading,
            written: None,
            last_write: None,
        });
        drop(tracked);
        if let Some(position_ms) = prepared.start_ms {
            (self.resume_sink)(ResumeNotice {
                session_id: session,
                position_ms,
            });
        }
    }

    pub fn on_snapshot(&self, s: &PlaybackSnapshot) {
        self.on_snapshot_at(s, Instant::now());
    }

    /// Testable core of [`Self::on_snapshot`] with an explicit clock.
    pub fn on_snapshot_at(&self, s: &PlaybackSnapshot, now: Instant) {
        let mut tracked = self.lock();
        let Some(t) = tracked.as_mut() else { return };
        if t.session != s.session_id {
            if s.session_id > t.session {
                // Media opened outside the queue replaced ours: final write.
                self.write(t, now);
                *tracked = None;
            }
            return;
        }
        let was = t.phase;
        t.phase = s.phase;
        if s.duration_ms.is_some() {
            t.duration_ms = s.duration_ms;
        }
        match s.phase {
            PlaybackPhase::Playing | PlaybackPhase::Paused | PlaybackPhase::Seeking => {
                t.position_ms = s.position_ms;
            }
            PlaybackPhase::Ended => t.position_ms = t.duration_ms.unwrap_or(s.position_ms),
            // Stopped resets position to 0 in the reducer; keep the last real one.
            _ => {}
        }
        let due = match s.phase {
            PlaybackPhase::Ended => was != PlaybackPhase::Ended,
            PlaybackPhase::Paused | PlaybackPhase::Stopped => was != s.phase,
            PlaybackPhase::Playing => t
                .last_write
                .is_none_or(|w| now.duration_since(w) >= WRITE_INTERVAL),
            _ => false,
        };
        if due {
            self.write(t, now);
        }
    }

    /// Writes the final position (from the engine's last snapshot, if any)
    /// and waits until everything queued has reached storage.
    pub fn shutdown(&self, last: Option<&PlaybackSnapshot>) {
        if let Some(s) = last {
            self.on_snapshot(s);
        }
        if let Some(t) = self.lock().as_mut() {
            self.write(t, Instant::now());
        }
        self.flush();
        // Close the channel and join the writer.
        self.tx.lock().unwrap_or_else(|p| p.into_inner()).take();
        if let Some(w) = self.writer.lock().unwrap_or_else(|p| p.into_inner()).take() {
            let _ = w.join();
        }
    }

    /// Blocks until all queued writes are persisted.
    pub fn flush(&self) {
        let (ack_tx, ack_rx) = channel();
        self.send(Msg::Flush(ack_tx));
        let _ = ack_rx.recv_timeout(Duration::from_secs(5));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use nova_playback_api::AbLoop;
    use std::collections::HashMap;

    #[derive(Default)]
    struct MemRepo {
        ids: Mutex<HashMap<String, MediaId>>,
        saved: Mutex<HashMap<MediaId, SavedProgress>>,
        writes: Mutex<usize>,
    }

    impl ProgressRepository for MemRepo {
        fn identify(&self, path: &str) -> Result<MediaId, String> {
            if path.contains("unreadable") {
                return Err("io error".into());
            }
            let mut ids = self.ids.lock().unwrap();
            let n = ids.len() as i64 + 1;
            Ok(*ids.entry(path.to_owned()).or_insert(n))
        }
        fn load(&self, media: MediaId) -> Result<Option<SavedProgress>, String> {
            Ok(self.saved.lock().unwrap().get(&media).copied())
        }
        fn save(&self, media: MediaId, p: SavedProgress) -> Result<(), String> {
            *self.writes.lock().unwrap() += 1;
            self.saved.lock().unwrap().insert(media, p);
            Ok(())
        }
    }

    fn snap(session: SessionId, phase: PlaybackPhase, pos: u64) -> PlaybackSnapshot {
        PlaybackSnapshot {
            session_id: session,
            seq: 0,
            phase,
            media_title: None,
            path: None,
            position_ms: pos,
            duration_ms: Some(600_000),
            speed: 1.0,
            volume_percent: 100,
            is_muted: false,
            tracks: vec![],
            video: None,
            ab_loop: AbLoop::default(),
            issues: vec![],
            adjust: Default::default(),
            error: None,
        }
    }

    fn svc() -> (
        Arc<ProgressService>,
        Arc<MemRepo>,
        Arc<Mutex<Vec<ResumeNotice>>>,
    ) {
        let repo = Arc::new(MemRepo::default());
        let notices = Arc::new(Mutex::new(vec![]));
        let n2 = Arc::clone(&notices);
        let s = ProgressService::new(
            repo.clone(),
            ResumePolicy::default(),
            Box::new(move |n| n2.lock().unwrap().push(n)),
        );
        (s, repo, notices)
    }

    fn saved(repo: &MemRepo, path: &str) -> Option<SavedProgress> {
        let id = *repo.ids.lock().unwrap().get(path)?;
        repo.saved.lock().unwrap().get(&id).copied()
    }

    #[test]
    fn writes_are_batched_while_playing() {
        let (s, repo, _) = svc();
        let p = s.prepare("C:/a.mp4");
        s.started(1, p);
        let t0 = Instant::now();
        // 60 snapshots over 12 s of playback at 5 Hz.
        for i in 0..60u64 {
            s.on_snapshot_at(
                &snap(1, PlaybackPhase::Playing, 10_000 + i * 200),
                t0 + Duration::from_millis(i * 200),
            );
        }
        s.flush();
        let writes = *repo.writes.lock().unwrap();
        assert!(
            (2..=3).contains(&writes),
            "expected ~1 write per 5 s, got {writes}"
        );
    }

    #[test]
    fn pause_writes_immediately_and_resume_rewinds() {
        let (s, repo, notices) = svc();
        s.started(1, s.prepare("C:/a.mp4"));
        let t0 = Instant::now();
        s.on_snapshot_at(&snap(1, PlaybackPhase::Playing, 1_000), t0);
        s.on_snapshot_at(
            &snap(1, PlaybackPhase::Paused, 120_000),
            t0 + Duration::from_millis(300),
        );
        s.flush();
        assert_eq!(saved(&repo, "C:/a.mp4").unwrap().position_ms, 120_000);

        let p = s.prepare("C:/a.mp4");
        assert_eq!(p.start_ms, Some(118_000));
        s.started(2, p);
        assert_eq!(
            notices.lock().unwrap().as_slice(),
            [ResumeNotice {
                session_id: 2,
                position_ms: 118_000
            }]
        );
    }

    #[test]
    fn ended_marks_completed_so_next_open_starts_over() {
        let (s, repo, _) = svc();
        s.started(1, s.prepare("C:/a.mp4"));
        s.on_snapshot_at(&snap(1, PlaybackPhase::Playing, 300_000), Instant::now());
        s.on_snapshot_at(&snap(1, PlaybackPhase::Ended, 600_000), Instant::now());
        s.flush();
        assert!(saved(&repo, "C:/a.mp4").unwrap().completed);
        assert_eq!(s.prepare("C:/a.mp4").start_ms, None);
    }

    #[test]
    fn switching_files_flushes_previous_position() {
        let (s, repo, _) = svc();
        s.started(1, s.prepare("C:/a.mp4"));
        let t0 = Instant::now();
        s.on_snapshot_at(&snap(1, PlaybackPhase::Playing, 30_000), t0);
        s.on_snapshot_at(
            &snap(1, PlaybackPhase::Playing, 33_000),
            t0 + Duration::from_secs(3),
        );
        s.started(2, s.prepare("C:/b.mp4"));
        s.flush();
        assert_eq!(saved(&repo, "C:/a.mp4").unwrap().position_ms, 33_000);
    }

    #[test]
    fn foreign_session_ends_tracking_after_final_write() {
        let (s, repo, _) = svc();
        s.started(1, s.prepare("C:/a.mp4"));
        let t0 = Instant::now();
        s.on_snapshot_at(&snap(1, PlaybackPhase::Playing, 40_000), t0);
        s.on_snapshot_at(
            &snap(1, PlaybackPhase::Playing, 42_000),
            t0 + Duration::from_secs(2),
        );
        s.on_snapshot_at(
            &snap(5, PlaybackPhase::Loading, 0),
            t0 + Duration::from_secs(3),
        );
        s.on_snapshot_at(
            &snap(1, PlaybackPhase::Playing, 99_000),
            t0 + Duration::from_secs(20),
        );
        s.flush();
        assert_eq!(saved(&repo, "C:/a.mp4").unwrap().position_ms, 42_000);
    }

    #[test]
    fn stopped_keeps_last_real_position() {
        let (s, repo, _) = svc();
        s.started(1, s.prepare("C:/a.mp4"));
        s.on_snapshot_at(&snap(1, PlaybackPhase::Playing, 70_000), Instant::now());
        s.on_snapshot_at(&snap(1, PlaybackPhase::Stopped, 0), Instant::now());
        s.flush();
        assert_eq!(saved(&repo, "C:/a.mp4").unwrap().position_ms, 70_000);
    }

    #[test]
    fn shutdown_persists_latest_position() {
        let (s, repo, _) = svc();
        s.started(1, s.prepare("C:/a.mp4"));
        let t0 = Instant::now();
        s.on_snapshot_at(&snap(1, PlaybackPhase::Playing, 10_000), t0);
        s.on_snapshot_at(
            &snap(1, PlaybackPhase::Playing, 12_000),
            t0 + Duration::from_secs(2),
        );
        s.shutdown(Some(&snap(1, PlaybackPhase::Playing, 13_500)));
        assert_eq!(saved(&repo, "C:/a.mp4").unwrap().position_ms, 13_500);
    }

    #[test]
    fn identification_failure_never_blocks_playback() {
        let (s, _, notices) = svc();
        let p = s.prepare("C:/unreadable.mp4");
        assert_eq!(
            p,
            Prepared {
                media: None,
                start_ms: None
            }
        );
        s.started(1, p);
        s.on_snapshot_at(&snap(1, PlaybackPhase::Paused, 50_000), Instant::now());
        assert!(notices.lock().unwrap().is_empty());
    }
}

#[cfg(test)]
mod resume_toggle_tests {
    use super::*;

    struct One(Mutex<Option<SavedProgress>>);
    impl ProgressRepository for One {
        fn identify(&self, _: &str) -> Result<MediaId, String> {
            Ok(1)
        }
        fn load(&self, _: MediaId) -> Result<Option<SavedProgress>, String> {
            Ok(*self.0.lock().unwrap())
        }
        fn save(&self, _: MediaId, p: SavedProgress) -> Result<(), String> {
            *self.0.lock().unwrap() = Some(p);
            Ok(())
        }
    }

    #[test]
    fn disabling_resume_starts_from_beginning_but_keeps_history() {
        let saved = SavedProgress {
            position_ms: 120_000,
            duration_ms: Some(600_000),
            completed: false,
        };
        let repo = Arc::new(One(Mutex::new(Some(saved))));
        let s = ProgressService::new(repo.clone(), ResumePolicy::default(), Box::new(|_| {}));
        assert_eq!(s.prepare("C:/a.mkv").start_ms, Some(118_000));
        s.set_resume_enabled(false);
        assert_eq!(s.prepare("C:/a.mkv").start_ms, None);
        assert_eq!(*repo.0.lock().unwrap(), Some(saved));
    }
}
