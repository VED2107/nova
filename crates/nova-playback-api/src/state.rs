use crate::{
    AbLoop, MediaTimeMs, PlaybackError, PlaybackPhase, PlaybackSnapshot, SessionId, Track,
    VideoInfo,
};

/// Backend-neutral facts observed from an engine. Backends translate native
/// events into these; they never set the phase directly.
#[derive(Debug, Clone, PartialEq)]
pub enum EngineEvent {
    /// A new session began loading. Resets all per-media state.
    SessionStarted {
        path: String,
        title: Option<String>,
    },
    /// Container opened, tracks known; frames not necessarily presented yet.
    FileLoaded,
    /// Playback (re)started after a load or seek: the engine is presenting media.
    PlaybackRestarted,
    SeekStarted,
    PauseChanged(bool),
    PositionChanged(MediaTimeMs),
    DurationChanged(Option<MediaTimeMs>),
    /// End of media reached (true) or left again, e.g. by seeking back (false).
    EndReached(bool),
    Failed(PlaybackError),
    Stopped,
    VolumeChanged(u8),
    MuteChanged(bool),
    SpeedChanged(f64),
    TracksChanged(Vec<Track>),
    VideoChanged(Option<VideoInfo>),
    TitleChanged(Option<String>),
    AbLoopAChanged(Option<MediaTimeMs>),
    AbLoopBChanged(Option<MediaTimeMs>),
    Issue(crate::PlaybackIssue),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Lifecycle {
    Idle,
    Loading,
    Active,
    Error,
    Stopped,
}

/// Deterministic playback state reducer.
///
/// The phase is *derived* from observed facts rather than stored, so it can
/// never disagree with them. Events for a session other than the current one
/// are ignored, which prevents a slow, superseded load from corrupting the
/// state of the media the user opened afterwards.
#[derive(Debug, Clone)]
pub struct PlaybackState {
    session_id: SessionId,
    seq: u64,
    lifecycle: Lifecycle,
    file_loaded: bool,
    paused: bool,
    seeking: bool,
    ended: bool,
    path: Option<String>,
    title: Option<String>,
    position_ms: MediaTimeMs,
    duration_ms: Option<MediaTimeMs>,
    speed: f64,
    volume_percent: u8,
    muted: bool,
    tracks: Vec<Track>,
    video: Option<VideoInfo>,
    ab_loop: AbLoop,
    issues: Vec<crate::PlaybackIssue>,
    error: Option<PlaybackError>,
}

impl Default for PlaybackState {
    fn default() -> Self {
        Self {
            session_id: 0,
            seq: 0,
            lifecycle: Lifecycle::Idle,
            file_loaded: false,
            paused: false,
            seeking: false,
            ended: false,
            path: None,
            title: None,
            position_ms: 0,
            duration_ms: None,
            speed: 1.0,
            volume_percent: 100,
            muted: false,
            tracks: Vec::new(),
            video: None,
            ab_loop: AbLoop::default(),
            issues: Vec::new(),
            error: None,
        }
    }
}

impl PlaybackState {
    pub fn session_id(&self) -> SessionId {
        self.session_id
    }

    pub fn phase(&self) -> PlaybackPhase {
        match self.lifecycle {
            Lifecycle::Idle => PlaybackPhase::Idle,
            Lifecycle::Error => PlaybackPhase::Error,
            Lifecycle::Stopped => PlaybackPhase::Stopped,
            Lifecycle::Loading => PlaybackPhase::Loading,
            Lifecycle::Active if self.seeking => PlaybackPhase::Seeking,
            Lifecycle::Active if self.ended => PlaybackPhase::Ended,
            Lifecycle::Active if self.paused => PlaybackPhase::Paused,
            Lifecycle::Active => PlaybackPhase::Playing,
        }
    }

    /// Applies an event observed for `session`. Returns `true` if the visible
    /// state changed (and `seq` was incremented).
    pub fn apply(&mut self, session: SessionId, event: EngineEvent) -> bool {
        if let EngineEvent::SessionStarted { path, title } = event {
            if session <= self.session_id && self.session_id != 0 {
                return false; // a newer session already started
            }
            let (volume, muted, speed) = (self.volume_percent, self.muted, self.speed);
            *self = Self {
                session_id: session,
                seq: self.seq,
                lifecycle: Lifecycle::Loading,
                path: Some(path),
                title,
                // Volume, mute and speed are player-wide, not per-media.
                volume_percent: volume,
                muted,
                speed,
                ..Self::default()
            };
            self.seq += 1;
            return true;
        }

        // Player-wide properties are valid regardless of session.
        let player_wide = matches!(
            event,
            EngineEvent::VolumeChanged(_)
                | EngineEvent::MuteChanged(_)
                | EngineEvent::SpeedChanged(_)
        );
        if !player_wide && session != self.session_id {
            return false;
        }

        let before = self.snapshot();
        match event {
            EngineEvent::SessionStarted { .. } => unreachable!(),
            EngineEvent::FileLoaded => self.file_loaded = true,
            EngineEvent::PlaybackRestarted => {
                if self.lifecycle == Lifecycle::Loading && self.file_loaded {
                    self.lifecycle = Lifecycle::Active;
                }
                self.seeking = false;
            }
            EngineEvent::SeekStarted => {
                if self.lifecycle == Lifecycle::Active {
                    self.seeking = true;
                }
            }
            EngineEvent::PauseChanged(p) => self.paused = p,
            EngineEvent::PositionChanged(ms) => {
                self.position_ms = match self.duration_ms {
                    Some(d) => ms.min(d),
                    None => ms,
                }
            }
            EngineEvent::DurationChanged(d) => self.duration_ms = d,
            EngineEvent::EndReached(e) => {
                if self.lifecycle == Lifecycle::Active || !e {
                    self.ended = e;
                }
            }
            EngineEvent::Failed(err) => {
                self.lifecycle = Lifecycle::Error;
                self.seeking = false;
                self.error = Some(err);
            }
            EngineEvent::Stopped => {
                if self.lifecycle != Lifecycle::Error {
                    self.lifecycle = Lifecycle::Stopped;
                }
                self.seeking = false;
                self.position_ms = 0;
            }
            EngineEvent::VolumeChanged(v) => self.volume_percent = v,
            EngineEvent::MuteChanged(m) => self.muted = m,
            EngineEvent::SpeedChanged(s) => self.speed = s,
            EngineEvent::TracksChanged(t) => self.tracks = t,
            EngineEvent::VideoChanged(v) => self.video = v,
            EngineEvent::AbLoopAChanged(a) => self.ab_loop.a_ms = a,
            EngineEvent::AbLoopBChanged(b) => self.ab_loop.b_ms = b,
            EngineEvent::Issue(i) => {
                if !self.issues.contains(&i) {
                    self.issues.push(i);
                }
            }
            EngineEvent::TitleChanged(t) => {
                if t.is_some() {
                    self.title = t;
                }
            }
        }
        let changed = self.snapshot() != before;
        if changed {
            self.seq += 1;
        }
        changed
    }

    pub fn snapshot(&self) -> PlaybackSnapshot {
        PlaybackSnapshot {
            session_id: self.session_id,
            seq: self.seq,
            phase: self.phase(),
            media_title: self.title.clone(),
            path: self.path.clone(),
            position_ms: self.position_ms,
            duration_ms: self.duration_ms,
            speed: self.speed,
            volume_percent: self.volume_percent,
            is_muted: self.muted,
            tracks: self.tracks.clone(),
            video: self.video.clone(),
            ab_loop: self.ab_loop,
            issues: self.issues.clone(),
            error: self.error.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{AbLoop, PlaybackErrorKind, PlaybackPhase as P};

    fn started(state: &mut PlaybackState, session: SessionId) {
        assert!(state.apply(
            session,
            EngineEvent::SessionStarted {
                path: format!("C:/m/{session}.mp4"),
                title: None
            }
        ));
    }

    fn playing(session: SessionId) -> PlaybackState {
        let mut s = PlaybackState::default();
        started(&mut s, session);
        s.apply(session, EngineEvent::FileLoaded);
        s.apply(session, EngineEvent::DurationChanged(Some(10_000)));
        s.apply(session, EngineEvent::PlaybackRestarted);
        s
    }

    #[test]
    fn starts_idle() {
        assert_eq!(PlaybackState::default().phase(), P::Idle);
    }

    #[test]
    fn load_then_play_requires_engine_confirmation() {
        let mut s = PlaybackState::default();
        started(&mut s, 1);
        assert_eq!(s.phase(), P::Loading);
        s.apply(1, EngineEvent::FileLoaded);
        assert_eq!(s.phase(), P::Loading, "file-loaded alone is not playback");
        s.apply(1, EngineEvent::PlaybackRestarted);
        assert_eq!(s.phase(), P::Playing);
    }

    #[test]
    fn restart_before_file_loaded_does_not_activate() {
        let mut s = PlaybackState::default();
        started(&mut s, 1);
        s.apply(1, EngineEvent::PlaybackRestarted);
        assert_eq!(s.phase(), P::Loading);
    }

    #[test]
    fn load_failure_goes_to_error() {
        let mut s = PlaybackState::default();
        started(&mut s, 1);
        s.apply(
            1,
            EngineEvent::Failed(PlaybackError::new(PlaybackErrorKind::LoadFailed, "x")),
        );
        assert_eq!(s.phase(), P::Error);
        assert!(s.snapshot().error.is_some());
        // Retry = new session = Loading, error cleared.
        started(&mut s, 2);
        assert_eq!(s.phase(), P::Loading);
        assert!(s.snapshot().error.is_none());
    }

    #[test]
    fn pause_and_resume() {
        let mut s = playing(1);
        s.apply(1, EngineEvent::PauseChanged(true));
        assert_eq!(s.phase(), P::Paused);
        s.apply(1, EngineEvent::PauseChanged(false));
        assert_eq!(s.phase(), P::Playing);
    }

    #[test]
    fn seek_returns_to_intended_state() {
        let mut s = playing(1);
        s.apply(1, EngineEvent::SeekStarted);
        assert_eq!(s.phase(), P::Seeking);
        s.apply(1, EngineEvent::PlaybackRestarted);
        assert_eq!(s.phase(), P::Playing);

        s.apply(1, EngineEvent::PauseChanged(true));
        s.apply(1, EngineEvent::SeekStarted);
        assert_eq!(s.phase(), P::Seeking);
        s.apply(1, EngineEvent::PlaybackRestarted);
        assert_eq!(s.phase(), P::Paused);
    }

    #[test]
    fn rapid_seeks_settle_once() {
        let mut s = playing(1);
        for _ in 0..5 {
            s.apply(1, EngineEvent::SeekStarted);
        }
        assert_eq!(s.phase(), P::Seeking);
        s.apply(1, EngineEvent::PlaybackRestarted);
        assert_eq!(s.phase(), P::Playing);
    }

    #[test]
    fn end_and_seek_back() {
        let mut s = playing(1);
        s.apply(1, EngineEvent::EndReached(true));
        s.apply(1, EngineEvent::PauseChanged(true));
        assert_eq!(s.phase(), P::Ended);
        s.apply(1, EngineEvent::SeekStarted);
        s.apply(1, EngineEvent::EndReached(false));
        s.apply(1, EngineEvent::PlaybackRestarted);
        assert_eq!(s.phase(), P::Paused);
    }

    #[test]
    fn end_ignored_while_loading() {
        let mut s = PlaybackState::default();
        started(&mut s, 1);
        s.apply(1, EngineEvent::EndReached(true));
        assert_eq!(s.phase(), P::Loading);
    }

    #[test]
    fn stale_session_events_are_ignored() {
        let mut s = playing(1);
        started(&mut s, 2);
        assert!(!s.apply(1, EngineEvent::PlaybackRestarted));
        assert!(!s.apply(1, EngineEvent::Failed(PlaybackError::invalid("old"))));
        assert!(!s.apply(1, EngineEvent::PositionChanged(9_000)));
        assert_eq!(s.phase(), P::Loading);
        assert_eq!(s.snapshot().position_ms, 0);
        assert_eq!(s.session_id(), 2);
    }

    #[test]
    fn older_session_start_cannot_replace_newer() {
        let mut s = PlaybackState::default();
        started(&mut s, 3);
        assert!(!s.apply(
            2,
            EngineEvent::SessionStarted {
                path: "old".into(),
                title: None
            }
        ));
        assert_eq!(s.session_id(), 3);
    }

    #[test]
    fn player_wide_settings_survive_session_change() {
        let mut s = playing(1);
        s.apply(1, EngineEvent::VolumeChanged(40));
        s.apply(1, EngineEvent::MuteChanged(true));
        s.apply(1, EngineEvent::SpeedChanged(1.5));
        started(&mut s, 2);
        let snap = s.snapshot();
        assert_eq!(
            (snap.volume_percent, snap.is_muted, snap.speed),
            (40, true, 1.5)
        );
    }

    #[test]
    fn stop_resets_position() {
        let mut s = playing(1);
        s.apply(1, EngineEvent::PositionChanged(4_000));
        s.apply(1, EngineEvent::Stopped);
        assert_eq!(s.phase(), P::Stopped);
        assert_eq!(s.snapshot().position_ms, 0);
    }

    #[test]
    fn position_is_clamped_to_duration() {
        let mut s = playing(1);
        s.apply(1, EngineEvent::PositionChanged(99_999));
        assert_eq!(s.snapshot().position_ms, 10_000);
    }

    #[test]
    fn seq_increments_only_on_visible_change() {
        let mut s = playing(1);
        let seq = s.snapshot().seq;
        assert!(!s.apply(1, EngineEvent::PauseChanged(false)));
        assert_eq!(s.snapshot().seq, seq);
        assert!(s.apply(1, EngineEvent::PauseChanged(true)));
        assert_eq!(s.snapshot().seq, seq + 1);
    }

    #[test]
    fn ab_loop_is_per_session() {
        let mut s = playing(1);
        s.apply(1, EngineEvent::AbLoopAChanged(Some(1_000)));
        s.apply(1, EngineEvent::AbLoopBChanged(Some(3_000)));
        assert_eq!(
            s.snapshot().ab_loop,
            AbLoop {
                a_ms: Some(1_000),
                b_ms: Some(3_000)
            }
        );
        started(&mut s, 2);
        assert_eq!(s.snapshot().ab_loop, AbLoop::default());
    }

    #[test]
    fn seq_is_monotonic_across_sessions() {
        let mut s = playing(1);
        let seq = s.snapshot().seq;
        started(&mut s, 2);
        assert!(s.snapshot().seq > seq);
    }
}
