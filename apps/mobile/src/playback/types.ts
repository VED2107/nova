/**
 * Mobile mirror of the backend-neutral contract in crates/nova-playback-api.
 * The UI speaks only these types; an engine adapter translates. Today there
 * is one adapter, the platform's own player via expo-video (AVPlayer on iOS,
 * Media3/ExoPlayer on Android). A libmpv adapter (development build) will
 * implement the same interface; see docs/architecture/mobile.md.
 */

export type PlaybackPhase = "idle" | "loading" | "playing" | "paused" | "seeking" | "ended" | "error";

export interface Track {
  id: string;
  kind: "audio" | "subtitle" | "video";
  label: string;
  language: string | null;
  isSelected: boolean;
}

export interface VideoFacts {
  width: number | null;
  height: number | null;
  frameRate: number | null;
  mimeType: string | null;
  bitrate: number | null;
  /** "SDR", "HDR10", "HLG", "Dolby Vision", as the engine reports it. */
  range: string | null;
}

export interface Snapshot {
  phase: PlaybackPhase;
  positionMs: number;
  durationMs: number | null;
  speed: number;
  muted: boolean;
  /** App volume 0..1 (the system volume stays with the hardware buttons). */
  volume: number;
  tracks: Track[];
  video: VideoFacts | null;
  error: string | null;
}

/** What an engine can do. The UI hides or explains controls it cannot honour. */
export interface Capabilities {
  engine: string;
  engineDetail: string;
  canSeekExact: boolean;
  /** Engine reports when a seek has landed (not just that it was requested). */
  reportsSeekCompletion: boolean;
  canFrameStep: boolean;
  canSelectTracks: boolean;
  canStyleSubtitles: boolean;
  canDelaySubtitles: boolean;
  canDelayAudio: boolean;
  canAbLoop: boolean;
  canPreviewFrames: boolean;
  canPictureInPicture: boolean;
}

export interface Commands {
  play(): void;
  pause(): void;
  toggle(): void;
  seek(positionMs: number, exact: boolean): void;
  seekBy(offsetMs: number): void;
  /** Turn native scrubbing optimisations on while a finger is on the timeline. */
  setScrubbing(on: boolean): void;
  setSpeed(multiplier: number): void;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  stop(): void;
  selectTrack(kind: "audio" | "subtitle", id: string | null): void;
  setLoop(on: boolean): void;
  replay(): void;
}

/** Desktop's speed ladder, limited to what the system players accept everywhere (0.25–2×). */
export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export function nextSpeed(current: number, dir: 1 | -1): number {
  if (dir > 0) return SPEEDS.find((s) => s > current + 1e-6) ?? SPEEDS[SPEEDS.length - 1]!;
  return [...SPEEDS].reverse().find((s) => s < current - 1e-6) ?? SPEEDS[0]!;
}

export type Fit = "contain" | "cover" | "fill";
export const FIT_LABEL: Record<Fit, string> = { contain: "Fit", cover: "Fill screen", fill: "Stretch" };
