//! Play-queue use cases: open/append files, next/previous, auto-advance.
//!
//! The service owns the [`Queue`] and drives a [`PlaybackBackend`]. It learns
//! about playback only from engine snapshots ([`QueueService::on_snapshot`]),
//! so auto-advance happens when the engine *confirms* the end of media.
//!
//! Locking rule: the internal mutex is never held while calling the backend,
//! because backends may deliver snapshots synchronously from `execute`.

use crate::progress_service::{Prepared, ProgressService};
use nova_domain::queue::{Queue, QueueItem, QueueItemId, QueueSnapshot, RepeatMode};
use nova_playback_api::{
    MediaSource, MediaSourceError, PlaybackBackend, PlaybackCommand, PlaybackError,
    PlaybackErrorKind, PlaybackPhase, PlaybackSnapshot, SessionId,
};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock, Weak};

/// "Previous" restarts the current item instead when past this point.
pub const RESTART_THRESHOLD_MS: u64 = 3_000;

pub type QueueSink = Box<dyn Fn(QueueSnapshot) + Send + Sync>;

#[derive(Default)]
struct State {
    queue: Queue,
    /// Session started by the queue for its current item.
    session: Option<SessionId>,
    /// Session for which auto-advance already ran (fires once per session).
    advanced_for: Option<SessionId>,
}

pub struct QueueService {
    /// Weak: the shell owns the engine and must be able to destroy it at exit.
    backend: OnceLock<Weak<dyn PlaybackBackend>>,
    progress: OnceLock<Arc<ProgressService>>,
    state: Mutex<State>,
    sink: QueueSink,
}

fn validate(paths: &[String]) -> Result<(), PlaybackError> {
    for p in paths {
        MediaSource::from_user_path(p).map_err(|e| {
            let kind = match e {
                MediaSourceError::NotFound => PlaybackErrorKind::NotFound,
                MediaSourceError::UnsupportedScheme => PlaybackErrorKind::UnsupportedSource,
                _ => PlaybackErrorKind::InvalidArgument,
            };
            PlaybackError::new(kind, e.to_string())
        })?;
    }
    if paths.is_empty() {
        return Err(PlaybackError::invalid("no files given"));
    }
    Ok(())
}

impl QueueService {
    pub fn new(sink: QueueSink) -> Arc<Self> {
        Arc::new(Self {
            backend: OnceLock::new(),
            progress: OnceLock::new(),
            state: Mutex::new(State::default()),
            sink,
        })
    }

    /// Attaches the backend once it exists (it needs this service's snapshot hook first).
    /// Enables resume positions and progress tracking for queued media.
    pub fn attach_progress(&self, progress: Arc<ProgressService>) {
        let _ = self.progress.set(progress);
    }

    pub fn attach(&self, backend: &Arc<dyn PlaybackBackend>) {
        let _ = self.backend.set(Arc::downgrade(backend));
    }

    fn backend(&self) -> Result<Arc<dyn PlaybackBackend>, PlaybackError> {
        self.backend.get().and_then(Weak::upgrade).ok_or_else(|| {
            PlaybackError::new(
                PlaybackErrorKind::EngineUnavailable,
                "playback engine not started",
            )
        })
    }

    fn lock(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(|p| p.into_inner())
    }

    fn publish(&self) -> QueueSnapshot {
        let snap = self.lock().queue.snapshot();
        (self.sink)(snap.clone());
        snap
    }

    pub fn snapshot(&self) -> QueueSnapshot {
        self.lock().queue.snapshot()
    }

    /// Opens `item` in the backend and records the resulting session.
    fn play(&self, item: Option<QueueItem>) -> Result<QueueSnapshot, PlaybackError> {
        let Some(item) = item else {
            return Ok(self.publish());
        };
        let backend = self.backend()?;
        let prepared = self.progress.get().map_or(
            Prepared {
                media: None,
                start_ms: None,
            },
            |p| p.prepare(&item.path),
        );
        let result = backend.execute(PlaybackCommand::Open {
            path: item.path,
            start_ms: prepared.start_ms,
        });
        if let (Ok(ack), Some(progress)) = (&result, self.progress.get()) {
            progress.started(ack.session_id, prepared);
        }
        {
            let mut st = self.lock();
            if let Ok(ack) = &result {
                // Concurrent opens: only a newer session may replace the record.
                if st.session.is_none_or(|s| ack.session_id > s) {
                    st.session = Some(ack.session_id);
                }
            }
        }
        let snap = self.publish();
        result.map(|_| snap)
    }

    /// Replaces the queue with `paths` and plays the first one.
    pub fn open(&self, paths: Vec<String>) -> Result<QueueSnapshot, PlaybackError> {
        validate(&paths)?;
        let item = self.lock().queue.replace(paths).cloned();
        self.play(item)
    }

    /// Appends `paths`. Starts playing only if nothing in the queue is current.
    pub fn append(&self, paths: Vec<String>) -> Result<QueueSnapshot, PlaybackError> {
        validate(&paths)?;
        let item = {
            let mut st = self.lock();
            let had_current = st.queue.current().is_some();
            let ids = st.queue.append(paths);
            if had_current {
                None
            } else {
                st.queue.select(ids[0]).cloned()
            }
        };
        self.play(item)
    }

    pub fn select(&self, id: QueueItemId) -> Result<QueueSnapshot, PlaybackError> {
        let item = self.lock().queue.select(id).cloned();
        if item.is_none() {
            return Err(PlaybackError::invalid("no such queue item"));
        }
        self.play(item)
    }

    /// Next item; with repeat-all the end of the queue wraps to the start.
    pub fn next(&self) -> Result<QueueSnapshot, PlaybackError> {
        let item = {
            let mut st = self.lock();
            match st.queue.next_item().cloned() {
                Some(i) => Some(i),
                None if st.queue.repeat() == RepeatMode::All => st.queue.wrap_to_start().cloned(),
                None => None,
            }
        };
        self.play(item)
    }

    /// Goes to the previous item, or restarts the current one when the user
    /// is past [`RESTART_THRESHOLD_MS`] (the common media-player convention).
    pub fn previous(&self) -> Result<QueueSnapshot, PlaybackError> {
        let backend = self.backend()?;
        let snap = backend.snapshot();
        let ours = self.lock().session == Some(snap.session_id);
        let has_current = self.lock().queue.current().is_some();
        if ours && has_current && snap.position_ms > RESTART_THRESHOLD_MS {
            backend.execute(PlaybackCommand::Seek {
                position_ms: 0,
                exact: true,
            })?;
            if snap.phase == PlaybackPhase::Ended {
                backend.execute(PlaybackCommand::Play)?;
            }
            return Ok(self.snapshot());
        }
        let item = self.lock().queue.previous_item().cloned();
        self.play(item)
    }

    pub fn remove(&self, id: QueueItemId) -> QueueSnapshot {
        self.lock().queue.remove(id);
        self.publish()
    }

    pub fn move_item(&self, id: QueueItemId, to: usize) -> QueueSnapshot {
        self.lock().queue.move_item(id, to);
        self.publish()
    }

    /// Repeat one uses the engine's file loop; repeat all wraps the queue.
    pub fn set_repeat(&self, mode: RepeatMode) -> Result<QueueSnapshot, PlaybackError> {
        self.lock().queue.set_repeat(mode);
        if let Ok(backend) = self.backend() {
            backend.execute(PlaybackCommand::SetLoopFile {
                enabled: mode == RepeatMode::One,
            })?;
        }
        Ok(self.publish())
    }

    pub fn shuffle(&self, seed: u64) -> QueueSnapshot {
        self.lock().queue.shuffle_upcoming(seed);
        self.publish()
    }

    /// Clears the list. Playback of the current media continues.
    pub fn clear(&self) -> QueueSnapshot {
        let mut st = self.lock();
        st.queue.clear();
        st.session = None;
        drop(st);
        self.publish()
    }

    /// Feed every engine snapshot here. Returns `true` when it decided to
    /// auto-advance; the caller should then call [`Self::advance_after_end`]
    /// off the engine's event thread.
    pub fn on_snapshot(&self, s: &PlaybackSnapshot) -> bool {
        if s.phase != PlaybackPhase::Ended {
            return false;
        }
        let mut st = self.lock();
        let ours = st.session == Some(s.session_id);
        let can_continue = st.queue.snapshot().has_next || st.queue.repeat() == RepeatMode::All;
        if !ours || st.advanced_for == Some(s.session_id) || !can_continue {
            return false;
        }
        st.advanced_for = Some(s.session_id);
        true
    }

    pub fn advance_after_end(&self) {
        log::info!("end of media confirmed by engine; advancing queue");
        let wrap = {
            let mut st = self.lock();
            if !st.queue.snapshot().has_next && st.queue.repeat() == RepeatMode::All {
                st.queue.wrap_to_start().cloned()
            } else {
                None
            }
        };
        if let Some(first) = wrap {
            if let Err(e) = self.play(Some(first)) {
                log::warn!("repeat-all failed: {e}");
            }
            return;
        }
        if let Err(e) = self.next() {
            log::warn!("auto-advance failed: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use nova_playback_api::{AbLoop, Capabilities, CommandAck};
    use std::sync::atomic::{AtomicU64, Ordering};

    /// Records commands; lets tests set the snapshot the "engine" reports.
    struct Fake {
        commands: Mutex<Vec<PlaybackCommand>>,
        session: AtomicU64,
        snap: Mutex<PlaybackSnapshot>,
    }

    impl Fake {
        fn new() -> Arc<Self> {
            Arc::new(Self {
                commands: Mutex::new(vec![]),
                session: AtomicU64::new(0),
                snap: Mutex::new(PlaybackSnapshot {
                    session_id: 0,
                    seq: 0,
                    phase: PlaybackPhase::Idle,
                    media_title: None,
                    path: None,
                    position_ms: 0,
                    duration_ms: None,
                    speed: 1.0,
                    volume_percent: 100,
                    is_muted: false,
                    tracks: vec![],
                    video: None,
                    ab_loop: AbLoop::default(),
                    issues: vec![],
                    adjust: Default::default(),
                    chapters: vec![],
                    error: None,
                }),
            })
        }
        fn opened(&self) -> Vec<String> {
            self.commands
                .lock()
                .unwrap()
                .iter()
                .filter_map(|c| match c {
                    PlaybackCommand::Open { path, .. } => Some(file(path)),
                    _ => None,
                })
                .collect()
        }
        fn set(&self, phase: PlaybackPhase, position_ms: u64) -> PlaybackSnapshot {
            let mut s = self.snap.lock().unwrap();
            s.phase = phase;
            s.position_ms = position_ms;
            s.seq += 1;
            s.clone()
        }
    }

    impl PlaybackBackend for Fake {
        fn capabilities(&self) -> Capabilities {
            unimplemented!()
        }
        fn execute(&self, command: PlaybackCommand) -> Result<CommandAck, PlaybackError> {
            let session = if let PlaybackCommand::Open { path, .. } = &command {
                let id = self.session.fetch_add(1, Ordering::SeqCst) + 1;
                let mut s = self.snap.lock().unwrap();
                s.session_id = id;
                s.path = Some(path.clone());
                s.phase = PlaybackPhase::Loading;
                id
            } else {
                self.session.load(Ordering::SeqCst)
            };
            self.commands.lock().unwrap().push(command);
            Ok(CommandAck {
                session_id: session,
            })
        }
        fn snapshot(&self) -> PlaybackSnapshot {
            self.snap.lock().unwrap().clone()
        }
    }

    fn file(p: &str) -> String {
        std::path::Path::new(p)
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned()
    }

    /// Real temp files, because the service validates paths.
    fn files(n: usize) -> Vec<String> {
        let dir = std::env::temp_dir().join("nova-queue-service-tests");
        std::fs::create_dir_all(&dir).unwrap();
        (1..=n)
            .map(|i| {
                let p = dir.join(format!("{i}.mp4"));
                std::fs::write(&p, b"x").unwrap();
                p.to_string_lossy().into_owned()
            })
            .collect()
    }

    fn service() -> (Arc<QueueService>, Arc<Fake>, Arc<Mutex<Vec<QueueSnapshot>>>) {
        let published = Arc::new(Mutex::new(vec![]));
        let p2 = Arc::clone(&published);
        let svc = QueueService::new(Box::new(move |s| p2.lock().unwrap().push(s)));
        let fake = Fake::new();
        let dyn_fake: Arc<dyn PlaybackBackend> = fake.clone();
        svc.attach(&dyn_fake);
        (svc, fake, published)
    }

    #[test]
    fn open_replaces_queue_and_plays_first() {
        let (svc, fake, published) = service();
        let snap = svc.open(files(3)).unwrap();
        assert_eq!(snap.items.len(), 3);
        assert_eq!(fake.opened(), ["1.mp4"]);
        assert!(!published.lock().unwrap().is_empty());
    }

    #[test]
    fn open_rejects_missing_files_without_touching_queue() {
        let (svc, fake, _) = service();
        let mut paths = files(1);
        paths.push(
            std::env::temp_dir()
                .join("nova-missing.mp4")
                .to_string_lossy()
                .into(),
        );
        let err = svc.open(paths).unwrap_err();
        assert_eq!(err.kind, PlaybackErrorKind::NotFound);
        assert!(fake.opened().is_empty());
        assert!(svc.snapshot().items.is_empty());
        assert_eq!(
            svc.open(vec![]).unwrap_err().kind,
            PlaybackErrorKind::InvalidArgument
        );
    }

    #[test]
    fn auto_advances_once_when_engine_reports_end() {
        let (svc, fake, _) = service();
        svc.open(files(2)).unwrap();
        let ended = fake.set(PlaybackPhase::Ended, 10_000);
        assert!(svc.on_snapshot(&ended));
        assert!(!svc.on_snapshot(&ended), "must fire once per session");
        svc.advance_after_end();
        assert_eq!(fake.opened(), ["1.mp4", "2.mp4"]);
        // Last item ending does nothing.
        let ended = fake.set(PlaybackPhase::Ended, 10_000);
        assert!(!svc.on_snapshot(&ended));
    }

    #[test]
    fn does_not_advance_for_media_opened_outside_the_queue() {
        let (svc, fake, _) = service();
        svc.open(files(2)).unwrap();
        fake.execute(PlaybackCommand::Open {
            path: "C:/other.mp4".into(),
            start_ms: None,
        })
        .unwrap();
        let ended = fake.set(PlaybackPhase::Ended, 1_000);
        assert!(!svc.on_snapshot(&ended));
    }

    #[test]
    fn errors_and_pauses_do_not_advance() {
        let (svc, fake, _) = service();
        svc.open(files(2)).unwrap();
        assert!(!svc.on_snapshot(&fake.set(PlaybackPhase::Error, 0)));
        assert!(!svc.on_snapshot(&fake.set(PlaybackPhase::Paused, 5_000)));
    }

    #[test]
    fn previous_restarts_when_past_threshold() {
        let (svc, fake, _) = service();
        svc.open(files(2)).unwrap();
        svc.next().unwrap();
        fake.set(PlaybackPhase::Playing, 8_000);
        svc.previous().unwrap();
        assert_eq!(fake.opened(), ["1.mp4", "2.mp4"], "no new file opened");
        assert!(matches!(
            fake.commands.lock().unwrap().last(),
            Some(PlaybackCommand::Seek { position_ms: 0, .. })
        ));
        fake.set(PlaybackPhase::Playing, 1_000);
        svc.previous().unwrap();
        assert_eq!(fake.opened(), ["1.mp4", "2.mp4", "1.mp4"]);
    }

    #[test]
    fn append_starts_playback_only_when_idle() {
        let (svc, fake, _) = service();
        let f = files(3);
        svc.append(vec![f[0].clone()]).unwrap();
        assert_eq!(fake.opened(), ["1.mp4"]);
        svc.append(vec![f[1].clone(), f[2].clone()]).unwrap();
        assert_eq!(fake.opened(), ["1.mp4"]);
        assert_eq!(svc.snapshot().items.len(), 3);
    }

    #[test]
    fn select_plays_chosen_item_and_rejects_unknown() {
        let (svc, fake, _) = service();
        let snap = svc.open(files(3)).unwrap();
        svc.select(snap.items[2].id).unwrap();
        assert_eq!(fake.opened(), ["1.mp4", "3.mp4"]);
        assert!(svc.select(9_999).is_err());
    }

    #[test]
    fn repeat_all_wraps_to_first_and_repeat_one_uses_engine_loop() {
        let (svc, fake, _) = service();
        svc.open(files(2)).unwrap();
        svc.set_repeat(RepeatMode::All).unwrap();
        svc.next().unwrap();
        let ended = fake.set(PlaybackPhase::Ended, 10_000);
        assert!(svc.on_snapshot(&ended));
        svc.advance_after_end();
        assert_eq!(fake.opened(), ["1.mp4", "2.mp4", "1.mp4"]);
        // Manual next at the end wraps too under repeat-all.
        svc.next().unwrap();
        svc.next().unwrap();
        assert_eq!(fake.opened().last().map(String::as_str), Some("1.mp4"));
        svc.set_repeat(RepeatMode::One).unwrap();
        assert!(
            fake.commands
                .lock()
                .unwrap()
                .iter()
                .any(|c| matches!(c, PlaybackCommand::SetLoopFile { enabled: true }))
        );
    }

    #[test]
    fn clear_stops_auto_advance() {
        let (svc, fake, _) = service();
        svc.open(files(2)).unwrap();
        svc.clear();
        assert!(!svc.on_snapshot(&fake.set(PlaybackPhase::Ended, 1_000)));
    }
}
