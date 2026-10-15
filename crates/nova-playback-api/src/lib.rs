//! Backend-neutral playback contract for NOVA.
//!
//! The frontend and application layers speak only these types. A backend
//! (libmpv today) translates its native events into [`EngineEvent`]s and feeds
//! them to a [`PlaybackState`] reducer. The reducer is pure, deterministic and
//! unit-tested, so state-transition rules do not depend on any engine.

mod details;
pub mod format;
mod media;
mod state;

pub use details::{AudioDetails, MediaDetails, VideoDetails, pixel_format_traits};
pub use media::{MediaSource, MediaSourceError};
pub use state::{EngineEvent, PlaybackState};

use serde::{Deserialize, Serialize};

/// Identifies one "open media" request. Every `Open` creates a new session;
/// events belonging to an older session must never affect the current one.
pub type SessionId = u64;

/// Media time in integer milliseconds.
pub type MediaTimeMs = u64;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PlaybackCommand {
    Open {
        path: String,
        /// Start position (e.g. resume). Applied by the engine before the
        /// first frame, so no visible seek happens.
        #[serde(default)]
        start_ms: Option<MediaTimeMs>,
    },
    Play,
    Pause,
    TogglePause,
    Stop,
    /// Absolute seek. `exact` trades speed for frame accuracy.
    Seek {
        position_ms: MediaTimeMs,
        exact: bool,
    },
    /// Relative seek in milliseconds (may be negative).
    SeekRelative {
        offset_ms: i64,
    },
    SetVolume {
        percent: u8,
    },
    SetMuted {
        muted: bool,
    },
    SetSpeed {
        multiplier: f64,
    },
    SelectAudioTrack {
        track_id: Option<String>,
    },
    SelectSubtitleTrack {
        track_id: Option<String>,
    },
    /// Sets or clears the A–B loop points. Playback loops between A and B
    /// while both are set; `None` clears a point.
    SetAbLoop {
        a_ms: Option<MediaTimeMs>,
        b_ms: Option<MediaTimeMs>,
    },
    /// Allow hardware decoding (with automatic software fallback) or force software.
    SetHardwareDecoding {
        enabled: bool,
    },
}

impl PlaybackCommand {
    pub const MAX_VOLUME_PERCENT: u8 = 130;
    pub const SPEED_RANGE: (f64, f64) = (0.25, 4.0);

    /// Validates command arguments independently of any backend.
    pub fn validate(&self) -> Result<(), PlaybackError> {
        match self {
            Self::SetVolume { percent } if *percent > Self::MAX_VOLUME_PERCENT => Err(
                PlaybackError::invalid(format!("volume must be 0..={}", Self::MAX_VOLUME_PERCENT)),
            ),
            Self::SetSpeed { multiplier }
                if !multiplier.is_finite()
                    || *multiplier < Self::SPEED_RANGE.0
                    || *multiplier > Self::SPEED_RANGE.1 =>
            {
                Err(PlaybackError::invalid(format!(
                    "speed must be within {}..={}",
                    Self::SPEED_RANGE.0,
                    Self::SPEED_RANGE.1
                )))
            }
            Self::SelectAudioTrack { track_id: Some(id) }
            | Self::SelectSubtitleTrack { track_id: Some(id) }
                if TrackId::parse(id).is_none() =>
            {
                Err(PlaybackError::invalid("malformed track id"))
            }
            Self::SetAbLoop {
                a_ms: Some(a),
                b_ms: Some(b),
            } if a >= b => Err(PlaybackError::invalid("loop end must be after loop start")),
            _ => Ok(()),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlaybackPhase {
    Idle,
    Loading,
    Playing,
    Paused,
    Seeking,
    Ended,
    Error,
    Stopped,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TrackKind {
    Video,
    Audio,
    Subtitle,
}

impl TrackKind {
    fn prefix(self) -> &'static str {
        match self {
            Self::Video => "video",
            Self::Audio => "audio",
            Self::Subtitle => "sub",
        }
    }
}

/// Stable, backend-neutral track identifier of the form `audio:2`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TrackId {
    pub kind: TrackKind,
    pub index: i64,
}

impl TrackId {
    pub fn parse(s: &str) -> Option<Self> {
        let (prefix, index) = s.split_once(':')?;
        let kind = match prefix {
            "video" => TrackKind::Video,
            "audio" => TrackKind::Audio,
            "sub" => TrackKind::Subtitle,
            _ => return None,
        };
        let index: i64 = index.parse().ok().filter(|i| *i > 0)?;
        Some(Self { kind, index })
    }
}

impl std::fmt::Display for TrackId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}:{}", self.kind.prefix(), self.index)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub kind: TrackKind,
    pub title: Option<String>,
    pub language: Option<String>,
    pub codec: Option<String>,
    pub is_default: bool,
    pub is_external: bool,
    pub is_selected: bool,
    pub channels: Option<u32>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfo {
    pub codec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// Active hardware decoder (e.g. `d3d11va`), or `None` for software decoding.
    pub hwdec: Option<String>,
}

/// Everything the UI needs to render the player. Produced only by the backend.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackSnapshot {
    pub session_id: SessionId,
    /// Monotonic per-backend sequence number; consumers drop older snapshots.
    pub seq: u64,
    pub phase: PlaybackPhase,
    pub media_title: Option<String>,
    pub path: Option<String>,
    pub position_ms: MediaTimeMs,
    pub duration_ms: Option<MediaTimeMs>,
    pub speed: f64,
    pub volume_percent: u8,
    pub is_muted: bool,
    pub tracks: Vec<Track>,
    pub video: Option<VideoInfo>,
    pub ab_loop: AbLoop,
    /// Non-fatal problems observed for this media (e.g. no video decoder).
    pub issues: Vec<PlaybackIssue>,
    pub error: Option<PlaybackError>,
}

/// Engine-confirmed A–B loop points.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AbLoop {
    pub a_ms: Option<MediaTimeMs>,
    pub b_ms: Option<MediaTimeMs>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlaybackErrorKind {
    InvalidArgument,
    NotFound,
    UnsupportedSource,
    LoadFailed,
    EngineUnavailable,
    EngineFailure,
    /// An editing project (e.g. Premiere `.prproj`), not playable media.
    EditingProject,
    /// Camera RAW or other format that needs a vendor decoder NOVA does not ship.
    RequiresExternalDecoder,
}

/// A non-fatal problem with the current media. Playback may continue
/// (e.g. audio plays while the video codec cannot be decoded).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PlaybackIssue {
    VideoDecoderMissing { codec: String },
    AudioDecoderMissing { codec: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, thiserror::Error)]
#[serde(rename_all = "camelCase")]
#[error("{kind:?}: {message}")]
pub struct PlaybackError {
    pub kind: PlaybackErrorKind,
    /// Human-readable message. Must not contain raw engine command strings.
    pub message: String,
}

impl PlaybackError {
    pub fn new(kind: PlaybackErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new(PlaybackErrorKind::InvalidArgument, message)
    }
}

/// What a backend can do. The UI hides controls a backend cannot honor.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub backend: String,
    pub backend_version: String,
    pub can_seek_exact: bool,
    pub can_select_tracks: bool,
    pub can_change_speed: bool,
    pub hardware_decoding: bool,
}

/// The contract every playback backend implements.
///
/// Commands are requests: a successful return only means the backend accepted
/// the request. Observed results arrive later as snapshots via the sink the
/// backend was constructed with.
pub trait PlaybackBackend: Send + Sync {
    fn capabilities(&self) -> Capabilities;
    fn execute(&self, command: PlaybackCommand) -> Result<CommandAck, PlaybackError>;
    fn snapshot(&self) -> PlaybackSnapshot;
    /// Detailed stream information for diagnostics, when media is loaded.
    fn media_details(&self) -> Option<MediaDetails> {
        None
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandAck {
    /// Session the command applies to (a new one for `Open`).
    pub session_id: SessionId,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn track_id_round_trips() {
        let id = TrackId::parse("audio:2").unwrap();
        assert_eq!(id.kind, TrackKind::Audio);
        assert_eq!(id.index, 2);
        assert_eq!(id.to_string(), "audio:2");
        assert_eq!(TrackId::parse("sub:1").unwrap().to_string(), "sub:1");
    }

    #[test]
    fn track_id_rejects_garbage() {
        for bad in [
            "",
            "audio",
            "audio:",
            "audio:0",
            "audio:-1",
            "x:1",
            "audio:1;quit",
            "sub:1 2",
        ] {
            assert!(TrackId::parse(bad).is_none(), "{bad} should be rejected");
        }
    }

    #[test]
    fn validates_volume_and_speed() {
        assert!(
            PlaybackCommand::SetVolume { percent: 100 }
                .validate()
                .is_ok()
        );
        assert!(
            PlaybackCommand::SetVolume { percent: 131 }
                .validate()
                .is_err()
        );
        assert!(
            PlaybackCommand::SetSpeed { multiplier: 1.5 }
                .validate()
                .is_ok()
        );
        assert!(
            PlaybackCommand::SetSpeed { multiplier: 0.1 }
                .validate()
                .is_err()
        );
        assert!(
            PlaybackCommand::SetSpeed {
                multiplier: f64::NAN
            }
            .validate()
            .is_err()
        );
        assert!(
            PlaybackCommand::SetSpeed {
                multiplier: f64::INFINITY
            }
            .validate()
            .is_err()
        );
    }

    #[test]
    fn validates_track_ids_in_commands() {
        let ok = PlaybackCommand::SelectAudioTrack {
            track_id: Some("audio:1".into()),
        };
        assert!(ok.validate().is_ok());
        let off = PlaybackCommand::SelectSubtitleTrack { track_id: None };
        assert!(off.validate().is_ok());
        let bad = PlaybackCommand::SelectSubtitleTrack {
            track_id: Some("sub:1,quit".into()),
        };
        assert!(bad.validate().is_err());
    }

    #[test]
    fn validates_ab_loop_order() {
        let ok = PlaybackCommand::SetAbLoop {
            a_ms: Some(1_000),
            b_ms: Some(2_000),
        };
        assert!(ok.validate().is_ok());
        let only_a = PlaybackCommand::SetAbLoop {
            a_ms: Some(1_000),
            b_ms: None,
        };
        assert!(only_a.validate().is_ok());
        let bad = PlaybackCommand::SetAbLoop {
            a_ms: Some(2_000),
            b_ms: Some(2_000),
        };
        assert!(bad.validate().is_err());
    }

    #[test]
    fn open_start_is_optional_in_json() {
        let cmd: PlaybackCommand =
            serde_json::from_str(r#"{"type":"open","path":"C:/a.mp4"}"#).unwrap();
        assert_eq!(
            cmd,
            PlaybackCommand::Open {
                path: "C:/a.mp4".into(),
                start_ms: None
            }
        );
        let cmd: PlaybackCommand =
            serde_json::from_str(r#"{"type":"open","path":"C:/a.mp4","startMs":1500}"#).unwrap();
        assert_eq!(
            cmd,
            PlaybackCommand::Open {
                path: "C:/a.mp4".into(),
                start_ms: Some(1500)
            }
        );
    }

    #[test]
    fn command_json_shape_is_stable() {
        let cmd: PlaybackCommand =
            serde_json::from_str(r#"{"type":"seek","positionMs":1500,"exact":true}"#).unwrap();
        assert_eq!(
            cmd,
            PlaybackCommand::Seek {
                position_ms: 1500,
                exact: true
            }
        );
        let cmd: PlaybackCommand = serde_json::from_str(r#"{"type":"togglePause"}"#).unwrap();
        assert_eq!(cmd, PlaybackCommand::TogglePause);
    }
}
