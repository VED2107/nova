//! libmpv implementation of the NOVA playback contract.
//!
//! Ownership model:
//! - [`MpvPlayer`] owns exactly one `mpv_handle` and one event thread.
//! - Commands run on the caller's thread (libmpv's client API is thread-safe).
//! - The event thread translates native events into [`EngineEvent`]s and feeds
//!   the shared [`PlaybackState`] reducer; the resulting snapshots go to the sink.
//! - Dropping the player stops the event thread, then destroys the handle.

mod ffi;
pub mod node;
pub mod thumbnail;

use ffi::*;
use node::Node;
use nova_playback_api::format::{CameraRaw, FileClass, classify};
use nova_playback_api::{
    AudioDetails, MediaDetails, PlaybackIssue, VideoDetails, pixel_format_traits,
};
use nova_playback_api::{
    Capabilities, CommandAck, EngineEvent, MediaSource, MediaSourceError, PlaybackBackend,
    PlaybackCommand, PlaybackError, PlaybackErrorKind, PlaybackPhase, PlaybackSnapshot,
    PlaybackState, SessionId, Track, TrackId, TrackKind, VideoInfo,
};
use std::collections::HashMap;
use std::ffi::{CString, c_char, c_int, c_void};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

pub type SnapshotSink = Arc<dyn Fn(PlaybackSnapshot) + Send + Sync>;

/// Position-only updates are coalesced to at most one per interval.
const POSITION_EMIT_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Debug, Clone)]
pub struct MpvConfig {
    /// Path to `libmpv-2.dll` (or the platform equivalent).
    pub library_path: PathBuf,
    /// Native window handle to render into (`wid`). `None` with `headless`.
    pub window_handle: Option<i64>,
    /// Disable video and audio output (for tests and CI).
    pub headless: bool,
    /// libmpv `hwdec` value, e.g. `auto-safe` or `no`.
    pub hwdec: String,
}

impl MpvConfig {
    pub fn headless(library_path: impl Into<PathBuf>) -> Self {
        Self {
            library_path: library_path.into(),
            window_handle: None,
            headless: true,
            hwdec: "no".into(),
        }
    }
}

/// Engine diagnostics read directly from libmpv (never inferred).
#[derive(Debug, Clone, Default)]
pub struct EngineDiagnostics {
    pub mpv_version: Option<String>,
    pub ffmpeg_version: Option<String>,
    pub client_api: (u64, u64),
    pub current_vo: Option<String>,
    pub current_ao: Option<String>,
    pub gpu_api: Option<String>,
    pub hwdec_current: Option<String>,
    /// Current audio/video desync in seconds as measured by libmpv (`avsync`).
    pub avsync_secs: Option<f64>,
    /// Frames dropped by the decoder (`decoder-frame-drop-count`).
    pub decoder_drops: Option<i64>,
    /// Frames dropped by the video output (`frame-drop-count`).
    pub vo_drops: Option<i64>,
    pub vo_delayed_frames: Option<i64>,
    pub estimated_vf_fps: Option<f64>,
    pub display_fps: Option<f64>,
}

struct Handle(*mut mpv_handle);
// SAFETY: the libmpv client API is documented as fully thread-safe; the
// handle is destroyed only after the event thread has been joined.
unsafe impl Send for Handle {}
unsafe impl Sync for Handle {}

#[derive(Default)]
struct Sessions {
    next: SessionId,
    by_entry: HashMap<i64, SessionId>,
    /// Sessions whose file was classified as camera RAW (by extension).
    raw: HashMap<SessionId, CameraRaw>,
}

fn raw_error(raw: CameraRaw) -> PlaybackError {
    PlaybackError::new(
        PlaybackErrorKind::RequiresExternalDecoder,
        format!(
            "{} can't be decoded by NOVA's built-in engine. {}",
            raw.name(),
            raw.advice()
        ),
    )
}

struct Inner {
    api: MpvApi,
    handle: Handle,
    state: Mutex<PlaybackState>,
    sessions: Mutex<Sessions>,
    sink: SnapshotSink,
    stop: AtomicBool,
}

pub struct MpvPlayer {
    inner: Arc<Inner>,
    thread: Option<JoinHandle<()>>,
}

// Observed property ids (reply_userdata).
const P_PAUSE: u64 = 1;
const P_TIME_POS: u64 = 2;
const P_DURATION: u64 = 3;
const P_EOF: u64 = 4;
const P_VOLUME: u64 = 5;
const P_MUTE: u64 = 6;
const P_SPEED: u64 = 7;
const P_TRACKS: u64 = 8;
const P_TITLE: u64 = 9;
const P_HWDEC: u64 = 10;
const P_VIDEO_PARAMS: u64 = 11;
const P_AB_A: u64 = 12;
const P_AB_B: u64 = 13;
const P_SUB_DELAY: u64 = 14;
const P_AUDIO_DELAY: u64 = 15;
const P_ASPECT: u64 = 16;
const P_ROTATE: u64 = 17;
const P_DEINT: u64 = 18;
const P_LOOP_FILE: u64 = 19;

const OBSERVED: &[(u64, &str, c_int)] = &[
    (P_PAUSE, "pause", MPV_FORMAT_FLAG),
    (P_TIME_POS, "time-pos", MPV_FORMAT_DOUBLE),
    (P_DURATION, "duration", MPV_FORMAT_DOUBLE),
    (P_EOF, "eof-reached", MPV_FORMAT_FLAG),
    (P_VOLUME, "volume", MPV_FORMAT_DOUBLE),
    (P_MUTE, "mute", MPV_FORMAT_FLAG),
    (P_SPEED, "speed", MPV_FORMAT_DOUBLE),
    (P_TRACKS, "track-list", MPV_FORMAT_NODE),
    (P_TITLE, "media-title", MPV_FORMAT_STRING),
    (P_HWDEC, "hwdec-current", MPV_FORMAT_STRING),
    (P_VIDEO_PARAMS, "video-params", MPV_FORMAT_NODE),
    (P_AB_A, "ab-loop-a", MPV_FORMAT_DOUBLE),
    (P_AB_B, "ab-loop-b", MPV_FORMAT_DOUBLE),
    (P_SUB_DELAY, "sub-delay", MPV_FORMAT_DOUBLE),
    (P_AUDIO_DELAY, "audio-delay", MPV_FORMAT_DOUBLE),
    (P_ASPECT, "video-aspect-override", MPV_FORMAT_STRING),
    (P_ROTATE, "video-rotate", MPV_FORMAT_STRING),
    (P_DEINT, "deinterlace", MPV_FORMAT_STRING),
    (P_LOOP_FILE, "loop-file", MPV_FORMAT_STRING),
];

fn engine_err(msg: impl Into<String>) -> PlaybackError {
    PlaybackError::new(PlaybackErrorKind::EngineFailure, msg)
}

fn cstring(s: &str) -> Result<CString, PlaybackError> {
    CString::new(s).map_err(|_| PlaybackError::invalid("argument contains NUL"))
}

impl MpvPlayer {
    /// Loads libmpv, creates and initializes a handle, and starts the event thread.
    pub fn new(config: MpvConfig, sink: SnapshotSink) -> Result<Self, PlaybackError> {
        // SAFETY: the path is chosen by the application (bundled or vendored build).
        let api = unsafe { MpvApi::load(&config.library_path) }
            .map_err(|e| PlaybackError::new(PlaybackErrorKind::EngineUnavailable, e))?;
        let raw = unsafe { (api.create)() };
        if raw.is_null() {
            return Err(PlaybackError::new(
                PlaybackErrorKind::EngineUnavailable,
                "mpv_create failed",
            ));
        }
        let inner = Inner {
            api,
            handle: Handle(raw),
            state: Mutex::new(PlaybackState::default()),
            sessions: Mutex::new(Sessions::default()),
            sink,
            stop: AtomicBool::new(false),
        };

        let mut options: Vec<(&str, String)> = vec![
            // Isolation: never read user mpv config, scripts or network helpers.
            ("config", "no".into()),
            ("load-scripts", "no".into()),
            ("ytdl", "no".into()),
            ("osc", "no".into()),
            ("terminal", "no".into()),
            // NOVA owns input and on-screen UI.
            ("input-default-bindings", "no".into()),
            ("input-vo-keyboard", "no".into()),
            ("input-cursor", "no".into()),
            ("cursor-autohide", "no".into()),
            ("osd-level", "0".into()),
            // Keep last frame at EOF so the user can seek back; stay alive when idle.
            ("keep-open", "yes".into()),
            ("idle", "yes".into()),
            ("hwdec", config.hwdec.clone()),
        ];
        if config.headless {
            options.push(("vo", "null".into()));
            options.push(("ao", "null".into()));
        } else if let Some(wid) = config.window_handle {
            options.push(("wid", wid.to_string()));
            options.push(("force-window", "yes".into()));
        }
        for (name, value) in &options {
            if let Err(e) = inner.set_option(name, value) {
                // SAFETY: handle is valid and not shared yet.
                unsafe { (inner.api.terminate_destroy)(raw) };
                return Err(e);
            }
        }
        let rc = unsafe { (inner.api.initialize)(raw) };
        if rc < 0 {
            let msg = inner.api.error_message(rc);
            unsafe { (inner.api.terminate_destroy)(raw) };
            return Err(PlaybackError::new(
                PlaybackErrorKind::EngineUnavailable,
                format!("mpv_initialize failed: {msg}"),
            ));
        }
        let level = CString::new("warn").unwrap();
        unsafe { (inner.api.request_log_messages)(raw, level.as_ptr()) };
        for (id, name, format) in OBSERVED {
            let name = CString::new(*name).unwrap();
            let rc = unsafe { (inner.api.observe_property)(raw, *id, name.as_ptr(), *format) };
            if rc < 0 {
                log::warn!("observe {name:?} failed: {}", inner.api.error_message(rc));
            }
        }

        let inner = Arc::new(inner);
        let thread_inner = Arc::clone(&inner);
        let thread = std::thread::Builder::new()
            .name("nova-mpv-events".into())
            .spawn(move || EventLoop::new(thread_inner).run())
            .map_err(|e| engine_err(format!("could not start event thread: {e}")))?;
        Ok(Self {
            inner,
            thread: Some(thread),
        })
    }

    pub fn diagnostics(&self) -> EngineDiagnostics {
        let i = &self.inner;
        EngineDiagnostics {
            mpv_version: i.get_string("mpv-version"),
            ffmpeg_version: i.get_string("ffmpeg-version"),
            client_api: i.api.api_version(),
            current_vo: i.get_string("current-vo"),
            current_ao: i.get_string("current-ao"),
            gpu_api: i.get_string("current-gpu-context"),
            hwdec_current: i.get_string("hwdec-current"),
            avsync_secs: i.get_string("avsync").and_then(|v| v.parse().ok()),
            decoder_drops: i
                .get_string("decoder-frame-drop-count")
                .and_then(|v| v.parse().ok()),
            vo_drops: i
                .get_string("frame-drop-count")
                .and_then(|v| v.parse().ok()),
            vo_delayed_frames: i
                .get_string("vo-delayed-frame-count")
                .and_then(|v| v.parse().ok()),
            estimated_vf_fps: i
                .get_string("estimated-vf-fps")
                .and_then(|v| v.parse().ok()),
            display_fps: i.get_string("display-fps").and_then(|v| v.parse().ok()),
        }
    }

    /// Reads an arbitrary engine property as a string. Diagnostics and tests only.
    /// Reads an engine property as a structured node (lists, maps).
    pub fn property_node(&self, name: &str) -> Option<Node> {
        let n = CString::new(name).ok()?;
        let mut raw = mpv_node {
            u: mpv_node_u { int64: 0 },
            format: MPV_FORMAT_NONE,
        };
        let rc = unsafe {
            (self.inner.api.get_property)(
                self.inner.h(),
                n.as_ptr(),
                MPV_FORMAT_NODE,
                &mut raw as *mut _ as *mut c_void,
            )
        };
        if rc < 0 {
            return None;
        }
        let node = unsafe { Node::from_raw(&raw) };
        unsafe { (self.inner.api.free_node_contents)(&mut raw) };
        Some(node)
    }

    pub fn property_string(&self, name: &str) -> Option<String> {
        self.inner.get_string(name)
    }
}

impl Drop for MpvPlayer {
    fn drop(&mut self) {
        self.inner.stop.store(true, Ordering::SeqCst);
        unsafe { (self.inner.api.wakeup)(self.inner.handle.0) };
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
        // SAFETY: event thread joined; no other users of the handle remain
        // (the Arc may still be referenced only by `self`).
        unsafe { (self.inner.api.terminate_destroy)(self.inner.handle.0) };
    }
}

impl Inner {
    fn h(&self) -> *mut mpv_handle {
        self.handle.0
    }

    fn check(&self, rc: c_int, what: &str) -> Result<(), PlaybackError> {
        if rc < 0 {
            Err(engine_err(format!(
                "{what}: {}",
                self.api.error_message(rc)
            )))
        } else {
            Ok(())
        }
    }

    fn set_option(&self, name: &str, value: &str) -> Result<(), PlaybackError> {
        let (n, v) = (cstring(name)?, cstring(value)?);
        let rc = unsafe { (self.api.set_option_string)(self.h(), n.as_ptr(), v.as_ptr()) };
        self.check(rc, &format!("option {name}"))
    }

    fn command(&self, args: &[&str]) -> Result<(), PlaybackError> {
        let owned = args
            .iter()
            .map(|a| cstring(a))
            .collect::<Result<Vec<_>, _>>()?;
        let mut ptrs: Vec<*const c_char> = owned.iter().map(|c| c.as_ptr()).collect();
        ptrs.push(std::ptr::null());
        let rc = unsafe { (self.api.command)(self.h(), ptrs.as_mut_ptr()) };
        self.check(rc, args.first().copied().unwrap_or("command"))
    }

    fn command_ret(&self, args: &[&str]) -> Result<Node, PlaybackError> {
        let owned = args
            .iter()
            .map(|a| cstring(a))
            .collect::<Result<Vec<_>, _>>()?;
        let mut ptrs: Vec<*const c_char> = owned.iter().map(|c| c.as_ptr()).collect();
        ptrs.push(std::ptr::null());
        let mut result = mpv_node {
            u: mpv_node_u { int64: 0 },
            format: MPV_FORMAT_NONE,
        };
        let rc = unsafe { (self.api.command_ret)(self.h(), ptrs.as_mut_ptr(), &mut result) };
        self.check(rc, args.first().copied().unwrap_or("command"))?;
        let node = unsafe { Node::from_raw(&result) };
        unsafe { (self.api.free_node_contents)(&mut result) };
        Ok(node)
    }

    fn set_flag(&self, name: &str, value: bool) -> Result<(), PlaybackError> {
        let n = cstring(name)?;
        let mut v: c_int = value.into();
        let rc = unsafe {
            (self.api.set_property)(
                self.h(),
                n.as_ptr(),
                MPV_FORMAT_FLAG,
                &mut v as *mut _ as *mut c_void,
            )
        };
        self.check(rc, name)
    }

    fn set_double(&self, name: &str, value: f64) -> Result<(), PlaybackError> {
        let n = cstring(name)?;
        let mut v = value;
        let rc = unsafe {
            (self.api.set_property)(
                self.h(),
                n.as_ptr(),
                MPV_FORMAT_DOUBLE,
                &mut v as *mut _ as *mut c_void,
            )
        };
        self.check(rc, name)
    }

    fn set_string(&self, name: &str, value: &str) -> Result<(), PlaybackError> {
        let (n, v) = (cstring(name)?, cstring(value)?);
        let mut p = v.as_ptr();
        let rc = unsafe {
            (self.api.set_property)(
                self.h(),
                n.as_ptr(),
                MPV_FORMAT_STRING,
                &mut p as *mut _ as *mut c_void,
            )
        };
        self.check(rc, name)
    }

    fn get_string(&self, name: &str) -> Option<String> {
        let n = CString::new(name).ok()?;
        let ptr = unsafe { (self.api.get_property_string)(self.h(), n.as_ptr()) };
        if ptr.is_null() {
            return None;
        }
        let s = unsafe { opt_str(ptr) };
        unsafe { (self.api.free)(ptr as *mut c_void) };
        s.filter(|s| !s.is_empty())
    }

    fn lock_state(&self) -> MutexGuard<'_, PlaybackState> {
        self.state.lock().unwrap_or_else(|p| p.into_inner())
    }

    fn lock_sessions(&self) -> MutexGuard<'_, Sessions> {
        self.sessions.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// Applies an event and returns the new snapshot if anything changed.
    fn apply(&self, session: SessionId, event: EngineEvent) -> Option<PlaybackSnapshot> {
        let mut st = self.lock_state();
        st.apply(session, event).then(|| st.snapshot())
    }

    fn emit(&self, snapshot: Option<PlaybackSnapshot>) {
        if let Some(s) = snapshot {
            (self.sink)(s);
        }
    }

    /// Resumes playback; at the end of media, restarts from the beginning.
    fn play(&self) -> Result<(), PlaybackError> {
        if self.lock_state().phase() == PlaybackPhase::Ended {
            self.command(&["seek", "0", "absolute+exact"])?;
        }
        self.set_flag("pause", false)
    }

    fn open(&self, path: &str, start_ms: Option<u64>) -> Result<CommandAck, PlaybackError> {
        let source = MediaSource::from_user_path(path).map_err(|e| {
            let kind = match e {
                MediaSourceError::NotFound => PlaybackErrorKind::NotFound,
                MediaSourceError::UnsupportedScheme => PlaybackErrorKind::UnsupportedSource,
                _ => PlaybackErrorKind::InvalidArgument,
            };
            PlaybackError::new(kind, e.to_string())
        })?;
        let path_str = source
            .path()
            .to_str()
            .ok_or_else(|| PlaybackError::invalid("path is not valid Unicode"))?
            .to_owned();
        let class = classify(source.path());
        if let FileClass::EditingProject(app) = class {
            return Err(PlaybackError::new(
                PlaybackErrorKind::EditingProject,
                format!(
                    "This is a project file for {}, not a video. Open it there, or export/render it to a video file (for example H.264 MP4 or ProRes MOV) and open that.",
                    app.name()
                ),
            ));
        }

        // Holding the sessions lock across `loadfile` guarantees the event
        // thread cannot observe START_FILE before the entry is mapped.
        let mut sessions = self.lock_sessions();
        sessions.next += 1;
        let session = sessions.next;
        // `pause` is player-wide in mpv; opening media means "play it".
        self.set_flag("pause", false)?;
        // A–B loop points are player-wide in mpv but per-media in NOVA.
        self.set_string("ab-loop-a", "no")?;
        self.set_string("ab-loop-b", "no")?;
        // Per-file options are restored by mpv when the file ends.
        let options = match start_ms {
            Some(ms) if ms > 0 => format!("start={:.3}", ms as f64 / 1000.0),
            _ => String::new(),
        };
        let result = if options.is_empty() {
            self.command_ret(&["loadfile", &path_str, "replace"])
        } else {
            self.command_ret(&["loadfile", &path_str, "replace", "-1", &options])
        };
        let entry = result
            .as_ref()
            .ok()
            .and_then(|n| n.get("playlist_entry_id"))
            .and_then(Node::as_i64);
        if let Some(entry) = entry {
            sessions.by_entry.insert(entry, session);
        }
        if let FileClass::CameraRaw(raw) = class {
            sessions.raw.insert(session, raw);
        }
        drop(sessions);

        let snap = self.apply(
            session,
            EngineEvent::SessionStarted {
                path: path_str,
                title: Some(source.display_name()),
            },
        );
        self.emit(snap);
        match (result, entry) {
            (Ok(_), Some(_)) => Ok(CommandAck {
                session_id: session,
            }),
            (Ok(_), None) => {
                let err = engine_err("libmpv did not report a playlist entry for loadfile");
                self.emit(self.apply(session, EngineEvent::Failed(err.clone())));
                Err(err)
            }
            (Err(e), _) => {
                let err = PlaybackError::new(PlaybackErrorKind::LoadFailed, e.message);
                self.emit(self.apply(session, EngineEvent::Failed(err.clone())));
                Err(err)
            }
        }
    }
}

impl PlaybackBackend for MpvPlayer {
    fn capabilities(&self) -> Capabilities {
        let hw = self.inner.get_string("hwdec").is_some_and(|h| h != "no");
        Capabilities {
            backend: "libmpv".into(),
            backend_version: self.inner.get_string("mpv-version").unwrap_or_default(),
            can_seek_exact: true,
            can_select_tracks: true,
            can_change_speed: true,
            hardware_decoding: hw,
        }
    }

    fn execute(&self, command: PlaybackCommand) -> Result<CommandAck, PlaybackError> {
        command.validate()?;
        let i = &self.inner;
        let session = i.lock_state().session_id();
        let ack = CommandAck {
            session_id: session,
        };
        match command {
            PlaybackCommand::Open { path, start_ms } => return i.open(&path, start_ms),
            PlaybackCommand::Play => i.play()?,
            PlaybackCommand::Pause => i.set_flag("pause", true)?,
            PlaybackCommand::TogglePause => {
                if i.lock_state().phase() == PlaybackPhase::Paused {
                    i.set_flag("pause", false)?
                } else if i.lock_state().phase() == PlaybackPhase::Ended {
                    i.play()?
                } else {
                    i.command(&["cycle", "pause"])?
                }
            }
            PlaybackCommand::Stop => i.command(&["stop"])?,
            PlaybackCommand::Seek { position_ms, exact } => {
                let secs = format!("{:.3}", position_ms as f64 / 1000.0);
                let flags = if exact {
                    "absolute+exact"
                } else {
                    "absolute+keyframes"
                };
                i.command(&["seek", &secs, flags])?
            }
            PlaybackCommand::SeekRelative { offset_ms } => {
                let secs = format!("{:.3}", offset_ms as f64 / 1000.0);
                i.command(&["seek", &secs, "relative"])?
            }
            PlaybackCommand::SetVolume { percent } => i.set_double("volume", percent.into())?,
            PlaybackCommand::SetMuted { muted } => i.set_flag("mute", muted)?,
            PlaybackCommand::SetSpeed { multiplier } => i.set_double("speed", multiplier)?,
            PlaybackCommand::SelectAudioTrack { track_id } => i.set_string(
                "aid",
                &track_selector(track_id.as_deref(), TrackKind::Audio)?,
            )?,
            PlaybackCommand::SelectSubtitleTrack { track_id } => i.set_string(
                "sid",
                &track_selector(track_id.as_deref(), TrackKind::Subtitle)?,
            )?,
            PlaybackCommand::FrameStep { forward } => i.command(&[if forward {
                "frame-step"
            } else {
                "frame-back-step"
            }])?,
            PlaybackCommand::SetSubtitleDelay { ms } => {
                i.set_double("sub-delay", ms as f64 / 1000.0)?
            }
            PlaybackCommand::SetAudioDelay { ms } => {
                i.set_double("audio-delay", ms as f64 / 1000.0)?
            }
            PlaybackCommand::SetAspectRatio { ratio } => {
                i.set_string("video-aspect-override", ratio.as_deref().unwrap_or("no"))?
            }
            PlaybackCommand::SetRotation { degrees } => {
                i.set_string("video-rotate", &degrees.to_string())?
            }
            PlaybackCommand::SetDeinterlace { enabled } => {
                i.set_string("deinterlace", if enabled { "yes" } else { "no" })?
            }
            PlaybackCommand::SetLoopFile { enabled } => {
                i.set_string("loop-file", if enabled { "inf" } else { "no" })?
            }
            PlaybackCommand::AddSubtitle { path } => i.command(&["sub-add", &path, "select"])?,
            PlaybackCommand::SetHardwareDecoding { enabled } => {
                i.set_string("hwdec", if enabled { "auto-safe" } else { "no" })?
            }
            PlaybackCommand::SetAbLoop { a_ms, b_ms } => {
                let point = |ms: Option<u64>| {
                    ms.map_or_else(
                        || "no".to_owned(),
                        |ms| format!("{:.3}", ms as f64 / 1000.0),
                    )
                };
                i.set_string("ab-loop-a", &point(a_ms))?;
                i.set_string("ab-loop-b", &point(b_ms))?;
            }
        }
        Ok(ack)
    }

    fn screenshot(
        &self,
        path: &std::path::Path,
        with_subtitles: bool,
    ) -> Result<(), PlaybackError> {
        let p = path
            .to_str()
            .ok_or_else(|| PlaybackError::invalid("path is not valid Unicode"))?;
        self.inner.command(&[
            "screenshot-to-file",
            p,
            if with_subtitles { "subtitles" } else { "video" },
        ])
    }

    fn media_details(&self) -> Option<MediaDetails> {
        let p = self;
        let s = |n: &str| p.property_string(n);
        let container = s("file-format")?;
        let num = |v: Option<&Node>| v.and_then(Node::as_i64).and_then(|v| u32::try_from(v).ok());
        let text = |v: Option<&Node>| v.and_then(Node::as_str).map(str::to_owned);
        let video = p.property_node("video-params").map(|vp| {
            // Decoder output format (before any hardware download) gives true depth/chroma.
            // With hardware decoding `pixelformat` names the GPU surface (e.g. "d3d11");
            // the real layout is in `hw-pixelformat` (e.g. "nv12", "p010").
            let dec = p.property_node("video-dec-params");
            let pick = |n: &Node| {
                let sw = text(n.get("pixelformat"));
                if sw
                    .as_deref()
                    .map(pixel_format_traits)
                    .is_some_and(|t| t.0.is_some())
                {
                    sw
                } else {
                    text(n.get("hw-pixelformat")).or(sw)
                }
            };
            let fmt = dec.as_ref().and_then(pick).or_else(|| pick(&vp));
            let (bit_depth, chroma, has_alpha) = fmt
                .as_deref()
                .map(pixel_format_traits)
                .unwrap_or((None, None, false));
            let transfer = text(vp.get("gamma"));
            let hdr = match transfer.as_deref() {
                Some("pq") => Some("HDR10".to_owned()),
                Some("hlg") => Some("HLG".to_owned()),
                _ => None,
            };
            VideoDetails {
                codec: s("video-format"),
                codec_description: s("video-codec"),
                width: num(vp.get("w")),
                height: num(vp.get("h")),
                pixel_format: fmt,
                bit_depth,
                chroma,
                has_alpha,
                frame_rate: s("container-fps")
                    .or_else(|| s("estimated-vf-fps"))
                    .and_then(|v| v.parse().ok()),
                color_matrix: text(vp.get("colormatrix")),
                primaries: text(vp.get("primaries")),
                transfer,
                hdr,
                hwdec: s("hwdec-current").filter(|h| h != "no"),
                decoder: s("current-tracks/video/decoder-desc"),
            }
        });
        let audio = p.property_node("audio-params").map(|ap| AudioDetails {
            codec: s("audio-codec-name"),
            codec_description: s("audio-codec"),
            sample_rate: num(ap.get("samplerate")),
            channels: num(ap.get("channel-count")),
            channel_layout: text(ap.get("hr-channels")).or_else(|| text(ap.get("channels"))),
            sample_format: text(ap.get("format")),
        });
        Some(MediaDetails {
            container: Some(container),
            file_size_bytes: s("file-size").and_then(|v| v.parse().ok()),
            duration_ms: s("duration")
                .and_then(|v| v.parse::<f64>().ok())
                .map(secs_to_ms),
            video,
            audio,
        })
    }

    fn snapshot(&self) -> PlaybackSnapshot {
        self.inner.lock_state().snapshot()
    }
}

fn track_selector(id: Option<&str>, kind: TrackKind) -> Result<String, PlaybackError> {
    match id {
        None => Ok("no".into()),
        Some(s) => {
            let id =
                TrackId::parse(s).ok_or_else(|| PlaybackError::invalid("malformed track id"))?;
            if id.kind != kind {
                return Err(PlaybackError::invalid("track id has the wrong kind"));
            }
            Ok(id.index.to_string())
        }
    }
}

/// Maps mpv's reported aspect override (label or decimal) to one of ours.
fn aspect_label(v: &str) -> Option<String> {
    if nova_playback_api::ASPECT_RATIOS.contains(&v) {
        return Some(v.to_owned());
    }
    let value: f64 = v.parse().ok()?;
    nova_playback_api::ASPECT_RATIOS
        .iter()
        .find(|r| {
            let (a, b) = r.split_once(':').unwrap();
            let ratio = a.parse::<f64>().unwrap() / b.parse::<f64>().unwrap();
            (ratio - value).abs() < 0.005
        })
        .map(|r| (*r).to_owned())
}

fn secs_to_ms(secs: f64) -> u64 {
    if secs.is_finite() && secs > 0.0 {
        (secs * 1000.0).round() as u64
    } else {
        0
    }
}

fn parse_tracks(node: &Node) -> Vec<Track> {
    let Node::Array(items) = node else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|t| {
            let kind = match t.get("type")?.as_str()? {
                "video" => TrackKind::Video,
                "audio" => TrackKind::Audio,
                "sub" => TrackKind::Subtitle,
                _ => return None,
            };
            let index = t.get("id")?.as_i64()?;
            let s = |k: &str| t.get(k).and_then(Node::as_str).map(str::to_owned);
            let b = |k: &str| t.get(k).and_then(Node::as_bool).unwrap_or(false);
            let u = |k: &str| {
                t.get(k)
                    .and_then(Node::as_i64)
                    .and_then(|v| u32::try_from(v).ok())
            };
            Some(Track {
                id: TrackId { kind, index }.to_string(),
                kind,
                title: s("title"),
                language: s("lang"),
                codec: s("codec"),
                is_default: b("default"),
                is_external: b("external"),
                is_selected: b("selected"),
                channels: u("demux-channel-count"),
                width: u("demux-w"),
                height: u("demux-h"),
            })
        })
        .collect()
}

/// State owned by the event thread.
struct EventLoop {
    inner: Arc<Inner>,
    /// Session of the file libmpv is currently processing (from START_FILE).
    engine_session: SessionId,
    hwdec: Option<String>,
    video_size: Option<(u32, u32)>,
    tracks: Vec<Track>,
    pending_position: Option<PlaybackSnapshot>,
    last_position_emit: Instant,
}

impl EventLoop {
    fn new(inner: Arc<Inner>) -> Self {
        Self {
            inner,
            engine_session: 0,
            hwdec: None,
            video_size: None,
            tracks: Vec::new(),
            pending_position: None,
            last_position_emit: Instant::now(),
        }
    }

    fn run(mut self) {
        loop {
            if self.inner.stop.load(Ordering::SeqCst) {
                break;
            }
            let timeout = match self.pending_position {
                Some(_) => POSITION_EMIT_INTERVAL
                    .saturating_sub(self.last_position_emit.elapsed())
                    .as_secs_f64(),
                None => 1.0,
            };
            let ev = unsafe { (self.inner.api.wait_event)(self.inner.h(), timeout) };
            if ev.is_null() {
                continue;
            }
            let ev = unsafe { &*ev };
            if ev.event_id == MPV_EVENT_SHUTDOWN {
                break;
            }
            self.handle(ev);
            self.flush_position(false);
        }
    }

    fn flush_position(&mut self, force: bool) {
        if self.pending_position.is_some()
            && (force || self.last_position_emit.elapsed() >= POSITION_EMIT_INTERVAL)
        {
            self.inner.emit(self.pending_position.take());
            self.last_position_emit = Instant::now();
        }
    }

    fn apply(&mut self, event: EngineEvent) {
        let snap = self.inner.apply(self.engine_session, event);
        if snap.is_some() {
            // Any non-position change supersedes a pending position update.
            self.pending_position = None;
            self.last_position_emit = Instant::now();
        }
        self.inner.emit(snap);
    }

    fn raw_for(&self, session: SessionId) -> Option<CameraRaw> {
        self.inner.lock_sessions().raw.get(&session).copied()
    }

    fn session_for_entry(&self, entry: i64, remove: bool) -> SessionId {
        let mut s = self.inner.lock_sessions();
        let found = s.by_entry.get(&entry).copied().unwrap_or(0);
        if remove {
            s.by_entry.remove(&entry);
        }
        found
    }

    fn video_info(&self) -> Option<VideoInfo> {
        let video = self
            .tracks
            .iter()
            .find(|t| t.kind == TrackKind::Video && t.is_selected)?;
        Some(VideoInfo {
            codec: video.codec.clone(),
            width: self.video_size.map(|s| s.0).or(video.width),
            height: self.video_size.map(|s| s.1).or(video.height),
            hwdec: self.hwdec.clone(),
        })
    }

    fn handle(&mut self, ev: &mpv_event) {
        match ev.event_id {
            MPV_EVENT_START_FILE => {
                let data = unsafe { &*(ev.data as *const mpv_event_start_file) };
                self.engine_session = self.session_for_entry(data.playlist_entry_id, false);
                self.hwdec = None;
                self.video_size = None;
                self.tracks.clear();
            }
            MPV_EVENT_FILE_LOADED => self.apply(EngineEvent::FileLoaded),
            MPV_EVENT_PLAYBACK_RESTART => self.apply(EngineEvent::PlaybackRestarted),
            MPV_EVENT_SEEK => self.apply(EngineEvent::SeekStarted),
            MPV_EVENT_END_FILE => {
                let data = unsafe { &*(ev.data as *const mpv_event_end_file) };
                let session = self.session_for_entry(data.playlist_entry_id, true);
                let event = match data.reason {
                    MPV_END_FILE_REASON_EOF => EngineEvent::EndReached(true),
                    MPV_END_FILE_REASON_ERROR => EngineEvent::Failed(match self.raw_for(session) {
                        Some(raw) => raw_error(raw),
                        None => PlaybackError::new(
                            PlaybackErrorKind::LoadFailed,
                            self.inner.api.error_message(data.error),
                        ),
                    }),
                    _ => EngineEvent::Stopped,
                };
                self.flush_position(true);
                let snap = self.inner.apply(session, event);
                self.inner.emit(snap);
            }
            MPV_EVENT_PROPERTY_CHANGE => {
                let prop = unsafe { &*(ev.data as *const mpv_event_property) };
                self.property(ev.reply_userdata, prop);
            }
            MPV_EVENT_LOG_MESSAGE => {
                let m = unsafe { &*(ev.data as *const mpv_event_log_message) };
                let (prefix, text) = unsafe { (opt_str(m.prefix), opt_str(m.text)) };
                let text = text.unwrap_or_default();
                let prefix = prefix.unwrap_or_default();
                if let Some(issue) = self.decoder_issue(&prefix, &text) {
                    let video_missing = matches!(issue, PlaybackIssue::VideoDecoderMissing { .. });
                    match self.raw_for(self.engine_session) {
                        // A RAW clip whose video can't be decoded is a hard failure.
                        Some(raw) if video_missing => {
                            self.apply(EngineEvent::Failed(raw_error(raw)))
                        }
                        _ => self.apply(EngineEvent::Issue(issue)),
                    }
                }
                log::warn!(target: "mpv", "[{prefix}] {}", text.trim_end());
            }
            MPV_EVENT_QUEUE_OVERFLOW => log::error!(target: "mpv", "event queue overflow"),
            _ => {}
        }
    }

    /// Recognizes libmpv's decoder-initialization failure (verified text:
    /// `[vd] Failed to initialize a decoder for codec '<name>'.`). The codec
    /// name can be empty for unknown FourCCs; fall back to the track's codec.
    fn decoder_issue(&self, prefix: &str, text: &str) -> Option<PlaybackIssue> {
        let rest = text.strip_prefix("Failed to initialize a decoder for codec '")?;
        let named = rest.split('\'').next().unwrap_or("").to_owned();
        let kind = match prefix {
            "vd" => TrackKind::Video,
            "ad" => TrackKind::Audio,
            _ => return None,
        };
        let codec = if named.is_empty() {
            self.tracks
                .iter()
                .find(|t| t.kind == kind && t.is_selected)
                .and_then(|t| t.codec.clone())
                .unwrap_or_else(|| "unknown".into())
        } else {
            named
        };
        Some(match kind {
            TrackKind::Video => PlaybackIssue::VideoDecoderMissing { codec },
            _ => PlaybackIssue::AudioDecoderMissing { codec },
        })
    }

    fn property(&mut self, id: u64, prop: &mpv_event_property) {
        let has = prop.format != MPV_FORMAT_NONE && !prop.data.is_null();
        let flag = || has && unsafe { *(prop.data as *const c_int) } != 0;
        let double = || has.then(|| unsafe { *(prop.data as *const f64) });
        let string = || {
            if has {
                unsafe { opt_str(*(prop.data as *const *const c_char)) }
            } else {
                None
            }
        };
        let node = || {
            if has {
                unsafe { Node::from_raw(prop.data as *const mpv_node) }
            } else {
                Node::None
            }
        };

        match id {
            P_PAUSE => self.apply(EngineEvent::PauseChanged(flag())),
            P_EOF => self.apply(EngineEvent::EndReached(flag())),
            P_DURATION => self.apply(EngineEvent::DurationChanged(double().map(secs_to_ms))),
            P_TIME_POS => {
                if let Some(secs) = double() {
                    let snap = self.inner.apply(
                        self.engine_session,
                        EngineEvent::PositionChanged(secs_to_ms(secs)),
                    );
                    if snap.is_some() {
                        self.pending_position = snap;
                    }
                }
            }
            P_VOLUME => {
                if let Some(v) = double() {
                    self.apply(EngineEvent::VolumeChanged(v.round().clamp(0.0, 255.0) as u8))
                }
            }
            P_MUTE => self.apply(EngineEvent::MuteChanged(flag())),
            P_AB_A => self.apply(EngineEvent::AbLoopAChanged(double().map(secs_to_ms))),
            P_SUB_DELAY => self.apply(EngineEvent::SubtitleDelayChanged(
                double().map_or(0, |d| (d * 1000.0).round() as i64),
            )),
            P_AUDIO_DELAY => self.apply(EngineEvent::AudioDelayChanged(
                double().map_or(0, |d| (d * 1000.0).round() as i64),
            )),
            P_ASPECT => {
                // mpv reports "no"/"-1" for "as encoded"; numeric forms are mapped back to our labels.
                let v = string().filter(|v| v != "no" && v != "-1" && v != "-1.000000");
                let label = v.and_then(|v| aspect_label(&v));
                self.apply(EngineEvent::AspectChanged(label))
            }
            P_ROTATE => self.apply(EngineEvent::RotationChanged(
                string().and_then(|v| v.parse().ok()).unwrap_or(0),
            )),
            P_DEINT => self.apply(EngineEvent::DeinterlaceChanged(
                string().is_some_and(|v| v == "yes"),
            )),
            P_LOOP_FILE => self.apply(EngineEvent::LoopFileChanged(
                string().is_some_and(|v| v != "no"),
            )),
            P_AB_B => self.apply(EngineEvent::AbLoopBChanged(double().map(secs_to_ms))),
            P_SPEED => {
                if let Some(s) = double() {
                    self.apply(EngineEvent::SpeedChanged(s))
                }
            }
            P_TITLE => self.apply(EngineEvent::TitleChanged(string())),
            P_TRACKS => {
                self.tracks = parse_tracks(&node());
                self.apply(EngineEvent::TracksChanged(self.tracks.clone()));
                self.apply(EngineEvent::VideoChanged(self.video_info()));
            }
            P_HWDEC => {
                self.hwdec = string().filter(|h| !h.is_empty() && h != "no");
                self.apply(EngineEvent::VideoChanged(self.video_info()));
            }
            P_VIDEO_PARAMS => {
                let n = node();
                let dim = |k| {
                    n.get(k)
                        .and_then(Node::as_i64)
                        .and_then(|v| u32::try_from(v).ok())
                };
                self.video_size = dim("w").zip(dim("h"));
                self.apply(EngineEvent::VideoChanged(self.video_info()));
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn track_selector_validates_kind() {
        assert_eq!(track_selector(None, TrackKind::Audio).unwrap(), "no");
        assert_eq!(
            track_selector(Some("audio:2"), TrackKind::Audio).unwrap(),
            "2"
        );
        assert!(track_selector(Some("sub:2"), TrackKind::Audio).is_err());
        assert!(track_selector(Some("audio:x"), TrackKind::Audio).is_err());
    }

    #[test]
    fn secs_to_ms_handles_edge_values() {
        assert_eq!(secs_to_ms(1.2345), 1235);
        assert_eq!(secs_to_ms(-1.0), 0);
        assert_eq!(secs_to_ms(f64::NAN), 0);
    }
}
