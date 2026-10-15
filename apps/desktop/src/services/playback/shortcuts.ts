import type { PlaybackCommand, PlaybackSnapshot } from "./types";
import { MAX_VOLUME } from "./types";

export type ShortcutAction =
  | { kind: "command"; command: PlaybackCommand }
  | { kind: "toggleFullscreen" }
  | { kind: "exitFullscreen" }
  | { kind: "openFile" }
  | { kind: "queueNext" }
  | { kind: "queuePrevious" }
  | { kind: "toggleQueue" };

export interface KeyInput {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

const SEEK_SMALL_MS = 5_000;
const SEEK_LARGE_MS = 30_000;
const VOLUME_STEP = 5;

/**
 * A–B loop cycles like most players: set A at the current position, then B,
 * then clear. B must be after A; pressing at or before A restarts with a new A.
 */
export function nextAbLoop(s: PlaybackSnapshot): PlaybackCommand {
  const { aMs, bMs } = s.abLoop;
  const pos = Math.round(s.positionMs);
  if (aMs == null) return { type: "setAbLoop", aMs: pos, bMs: null };
  if (bMs == null) {
    return pos > aMs ? { type: "setAbLoop", aMs, bMs: pos } : { type: "setAbLoop", aMs: pos, bMs: null };
  }
  return { type: "setAbLoop", aMs: null, bMs: null };
}

/** Maps a key press to an action. Pure, so it is unit-tested. */
export function shortcutFor(e: KeyInput, s: PlaybackSnapshot): ShortcutAction | null {
  if (e.altKey || e.metaKey) return null;
  if (e.ctrlKey) return e.key.toLowerCase() === "o" ? { kind: "openFile" } : null;
  const hasMedia = s.phase !== "idle" && s.phase !== "error" && s.phase !== "stopped";
  const cmd = (command: PlaybackCommand): ShortcutAction => ({ kind: "command", command });
  if (e.shiftKey && (e.key === "N" || e.key === "n")) return { kind: "queueNext" };
  if (e.shiftKey && (e.key === "P" || e.key === "p")) return { kind: "queuePrevious" };
  switch (e.key) {
    case "MediaTrackNext":
      return { kind: "queueNext" };
    case "MediaTrackPrevious":
      return { kind: "queuePrevious" };
    case "MediaPlayPause":
      return hasMedia ? cmd({ type: "togglePause" }) : null;
    case "q":
    case "Q":
      return { kind: "toggleQueue" };
    case "l":
    case "L":
      return hasMedia ? cmd(nextAbLoop(s)) : null;
    case " ":
    case "k":
    case "K":
      return hasMedia ? cmd({ type: "togglePause" }) : null;
    case "ArrowLeft":
      return hasMedia ? cmd({ type: "seekRelative", offsetMs: -(e.shiftKey ? SEEK_LARGE_MS : SEEK_SMALL_MS) }) : null;
    case "ArrowRight":
      return hasMedia ? cmd({ type: "seekRelative", offsetMs: e.shiftKey ? SEEK_LARGE_MS : SEEK_SMALL_MS }) : null;
    case "ArrowUp":
      return cmd({ type: "setVolume", percent: Math.min(MAX_VOLUME, s.volumePercent + VOLUME_STEP) });
    case "ArrowDown":
      return cmd({ type: "setVolume", percent: Math.max(0, s.volumePercent - VOLUME_STEP) });
    case "m":
    case "M":
      return cmd({ type: "setMuted", muted: !s.isMuted });
    case "f":
    case "F":
      return { kind: "toggleFullscreen" };
    case "Escape":
      return { kind: "exitFullscreen" };
    case "Home":
      return hasMedia ? cmd({ type: "seek", positionMs: 0, exact: true }) : null;
    case "o":
    case "O":
      return { kind: "openFile" };
    default:
      return null;
  }
}
