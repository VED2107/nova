// Mirrors crates/nova-playback-api (serde camelCase). Keep in sync; see
// docs/architecture/playback-contract.md.

export type PlaybackPhase =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "seeking"
  | "ended"
  | "error"
  | "stopped";

export type TrackKind = "video" | "audio" | "subtitle";

export interface Track {
  id: string;
  kind: TrackKind;
  title: string | null;
  language: string | null;
  codec: string | null;
  isDefault: boolean;
  isExternal: boolean;
  isSelected: boolean;
  channels: number | null;
  width: number | null;
  height: number | null;
}

export interface VideoInfo {
  codec: string | null;
  width: number | null;
  height: number | null;
  hwdec: string | null;
}

export type PlaybackErrorKind =
  | "invalidArgument"
  | "notFound"
  | "unsupportedSource"
  | "loadFailed"
  | "engineUnavailable"
  | "engineFailure"
  | "editingProject"
  | "requiresExternalDecoder";

export type PlaybackIssue =
  | { kind: "videoDecoderMissing"; codec: string }
  | { kind: "audioDecoderMissing"; codec: string };

export interface VideoDetails {
  codec: string | null;
  codecDescription: string | null;
  width: number | null;
  height: number | null;
  pixelFormat: string | null;
  bitDepth: number | null;
  chroma: string | null;
  hasAlpha: boolean;
  frameRate: number | null;
  colorMatrix: string | null;
  primaries: string | null;
  transfer: string | null;
  hdr: string | null;
  hwdec: string | null;
  decoder: string | null;
}

export interface AudioDetails {
  codec: string | null;
  codecDescription: string | null;
  sampleRate: number | null;
  channels: number | null;
  channelLayout: string | null;
  sampleFormat: string | null;
}

export interface MediaDetails {
  container: string | null;
  fileSizeBytes: number | null;
  durationMs: number | null;
  video: VideoDetails | null;
  audio: AudioDetails | null;
}

export interface PlaybackError {
  kind: PlaybackErrorKind;
  message: string;
}

export interface PlaybackSnapshot {
  sessionId: number;
  seq: number;
  phase: PlaybackPhase;
  mediaTitle: string | null;
  path: string | null;
  positionMs: number;
  durationMs: number | null;
  speed: number;
  volumePercent: number;
  isMuted: boolean;
  tracks: Track[];
  video: VideoInfo | null;
  abLoop: AbLoop;
  issues: PlaybackIssue[];
  error: PlaybackError | null;
}

export interface AbLoop {
  aMs: number | null;
  bMs: number | null;
}

export interface QueueItem {
  id: number;
  path: string;
  title: string;
}

export interface QueueSnapshot {
  items: QueueItem[];
  currentId: number | null;
  hasNext: boolean;
  hasPrevious: boolean;
}

export const EMPTY_QUEUE: QueueSnapshot = { items: [], currentId: null, hasNext: false, hasPrevious: false };

export type PlaybackCommand =
  | { type: "open"; path: string }
  | { type: "play" }
  | { type: "pause" }
  | { type: "togglePause" }
  | { type: "stop" }
  | { type: "seek"; positionMs: number; exact: boolean }
  | { type: "seekRelative"; offsetMs: number }
  | { type: "setVolume"; percent: number }
  | { type: "setMuted"; muted: boolean }
  | { type: "setSpeed"; multiplier: number }
  | { type: "selectAudioTrack"; trackId: string | null }
  | { type: "selectSubtitleTrack"; trackId: string | null }
  | { type: "setAbLoop"; aMs: number | null; bMs: number | null };

export interface CommandAck {
  sessionId: number;
}

export const MAX_VOLUME = 130;
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export const INITIAL_SNAPSHOT: PlaybackSnapshot = {
  sessionId: 0,
  seq: 0,
  phase: "idle",
  mediaTitle: null,
  path: null,
  positionMs: 0,
  durationMs: null,
  speed: 1,
  volumePercent: 100,
  isMuted: false,
  tracks: [],
  video: null,
  abLoop: { aMs: null, bMs: null },
  issues: [],
  error: null,
};

/** Must match crates/nova-library MEDIA_EXTENSIONS. */
export const MEDIA_EXTENSIONS = [
  "mp4", "m4v", "mkv", "webm", "mov", "avi", "wmv", "flv", "ts", "m2ts", "mts", "m2t", "mpg",
  "mpeg", "ogv", "3gp", "3g2", "mxf", "vob", "dv", "gxf", "f4v", "divx", "asf", "y4m", "mp3",
  "flac", "m4a", "aac", "ogg", "opus", "wav", "wma", "aif", "aiff", "ac3", "eac3", "dts", "mka",
  "alac", "thd",
] as const;
