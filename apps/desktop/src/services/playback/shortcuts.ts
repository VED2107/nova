import type { PlaybackCommand, PlaybackSnapshot } from "./types";
import { MAX_VOLUME } from "./types";

export type ShortcutAction =
  | { kind: "command"; command: PlaybackCommand }
  | { kind: "toggleFullscreen" }
  | { kind: "exitFullscreen" }
  | { kind: "openFile" };

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

/** Maps a key press to an action. Pure, so it is unit-tested. */
export function shortcutFor(e: KeyInput, s: PlaybackSnapshot): ShortcutAction | null {
  if (e.altKey || e.metaKey) return null;
  if (e.ctrlKey) return e.key.toLowerCase() === "o" ? { kind: "openFile" } : null;
  const hasMedia = s.phase !== "idle" && s.phase !== "error" && s.phase !== "stopped";
  const cmd = (command: PlaybackCommand): ShortcutAction => ({ kind: "command", command });
  switch (e.key) {
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
