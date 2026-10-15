import type { PlaybackCommand, PlaybackSnapshot } from "./types";

/**
 * A–B loop cycles like most players: set A at the current position, then B,
 * then clear. B must be after A; pressing at or before A restarts with a new A.
 * (Key bindings live in actions.ts.)
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
