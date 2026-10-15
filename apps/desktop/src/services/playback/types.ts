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
  | "engineFailure";

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
  error: null,
};
