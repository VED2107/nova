import { Platform } from "react-native";

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

/**
 * Desktop's speed ladder. Media3 (Android) plays all of it; AVPlayer keeps
 * audio in sync only up to 2×, so iOS stops there.
 */
export const SPEEDS: readonly number[] = Platform.OS === "ios" ? [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] : [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

export function nextSpeed(current: number, dir: 1 | -1): number {
  if (dir > 0) return SPEEDS.find((s) => s > current + 1e-6) ?? SPEEDS[SPEEDS.length - 1]!;
  return [...SPEEDS].reverse().find((s) => s < current - 1e-6) ?? SPEEDS[0]!;
}

/** Desktop's aspect-ratio overrides (crates/nova-playback-api, ASPECT_RATIOS). */
export const ASPECT_RATIOS = ["16:9", "4:3", "1:1", "16:10", "2.21:1", "2.35:1", "2.39:1", "5:4", "1.85:1"] as const;

export function ratioOf(r: string): number {
  const [a, b] = r.split(":").map(Number);
  return a && b ? a / b : 16 / 9;
}

/** The largest box of ratio `r` that fits `w × h`; the picture is stretched into it. */
export function aspectBox(r: string, w: number, h: number): { width: number; height: number } {
  const k = ratioOf(r);
  return w / h > k ? { width: h * k, height: h } : { width: w, height: w / k };
}

export type Fit = "contain" | "cover" | "fill";
export const FIT_LABEL: Record<Fit, string> = { contain: "Fit", cover: "Fill screen", fill: "Stretch" };
