/**
 * Seek policy shared with desktop (apps/desktop/src/services/playback/seek.ts).
 * Pure: no React Native imports, so it runs under `node --test`. Extraction
 * into one shared package is milestone M4 (docs/architecture/mobile.md).
 *
 * Times are float milliseconds internally and rounded once, when a command
 * is built, so repeated scrubbing never accumulates rounding error.
 */

export type SeekMode = "accurate" | "fast";
export type ScrubPreference = "auto" | "accurate" | "fast";

/** One mapping drives touch-down, drag and release: the time shown is the time landed. */
export function pointerToMs(x: number, trackLeft: number, trackWidth: number, durationMs: number): number {
  if (!(trackWidth > 0) || !(durationMs > 0)) return 0;
  return Math.min(1, Math.max(0, (x - trackLeft) / trackWidth)) * durationMs;
}

export function msToFraction(ms: number, durationMs: number): number {
  if (!(durationMs > 0)) return 0;
  return Math.min(1, Math.max(0, ms / durationMs));
}

export function seekTarget(ms: number, durationMs: number | null): number {
  const hi = durationMs != null && durationMs > 0 ? durationMs : Number.MAX_SAFE_INTEGER;
  return Math.round(Math.min(hi, Math.max(0, ms)));
}

/**
 * Fine scrubbing for touch. A finger is ~10 mm wide, so on long media a
 * full-width drag is too coarse. Dragging away from the bar vertically slows
 * the scrub rate (like iOS's native scrubber): 1x at the bar, 1/2 beyond
 * 64 pt, 1/4 beyond 128 pt, 1/8 beyond 192 pt.
 */
export function scrubRate(verticalDistancePt: number): number {
  const d = Math.abs(verticalDistancePt);
  if (d >= 192) return 0.125;
  if (d >= 128) return 0.25;
  if (d >= 64) return 0.5;
  return 1;
}

export function scrubRateLabel(rate: number): string | null {
  return rate >= 1 ? null : rate === 0.5 ? "Half-speed scrubbing" : rate === 0.25 ? "Quarter-speed scrubbing" : "Fine scrubbing";
}

/**
 * Applies a horizontal finger delta at the current rate. Rate changes mid-drag
 * re-anchor at the current position instead of jumping (the anchor is the
 * time at which the rate last changed).
 */
export function scrubbedMs(anchorMs: number, dxSinceAnchor: number, trackWidth: number, durationMs: number, rate: number): number {
  if (!(trackWidth > 0) || !(durationMs > 0)) return anchorMs;
  return Math.min(durationMs, Math.max(0, anchorMs + (dxSinceAnchor / trackWidth) * durationMs * rate));
}

export const SCRUB_ACCURATE_BUDGET_MS = 120;

export function scrubMode(pref: ScrubPreference, lastAccurateMs: number | null): SeekMode {
  if (pref !== "auto") return pref;
  return lastAccurateMs != null && lastAccurateMs > SCRUB_ACCURATE_BUDGET_MS ? "fast" : "accurate";
}

/** Double-tap side: the outer 40 % of each side seeks; the middle third toggles controls. */
export function tapZone(x: number, width: number): "back" | "middle" | "forward" {
  if (!(width > 0)) return "middle";
  const f = x / width;
  return f < 0.4 ? "back" : f > 0.6 ? "forward" : "middle";
}

/**
 * Consecutive double-taps on one side accumulate (10 s, 20 s, 30 s…) and the
 * total is applied as one relative seek, so repeated taps never race each other.
 */
export function accumulate(prev: { side: "back" | "forward"; totalMs: number } | null, side: "back" | "forward", stepMs: number) {
  if (prev && prev.side === side) return { side, totalMs: prev.totalMs + stepMs };
  return { side, totalMs: stepMs };
}

/** Chapter start after/before a position; going back > 3 s into a chapter restarts it. */
export function chapterTarget(chapters: { timeMs: number }[], positionMs: number, dir: 1 | -1): number | null {
  if (chapters.length === 0) return null;
  if (dir > 0) return chapters.find((c) => c.timeMs > positionMs + 500)?.timeMs ?? null;
  const current = [...chapters].reverse().find((c) => c.timeMs <= positionMs + 500);
  if (current && positionMs - current.timeMs > 3_000) return current.timeMs;
  const before = [...chapters].reverse().find((c) => c.timeMs < (current?.timeMs ?? positionMs) - 1);
  return before?.timeMs ?? 0;
}

export interface SeekRequest {
  positionMs: number;
  exact: boolean;
}

/**
 * Latest-wins scrub coalescer: at most one seek in flight, newer targets
 * replace queued ones, release ends with one accurate seek. Unlike desktop,
 * the system players report seek completion through a promise-like callback,
 * so `settled()` is called directly by the engine adapter.
 */
export class ScrubSession {
  private inFlight: { mode: SeekMode; at: number } | null = null;
  private queued: number | null = null;
  private released = false;
  private finalSent = false;
  lastAccurateMs: number | null = null;
  private readonly send: (req: SeekRequest) => void;
  private readonly durationMs: number;
  private readonly pref: ScrubPreference;
  private readonly now: () => number;

  // Plain fields, not parameter properties: this file must run under node's
  // type stripping for the unit tests.
  constructor(send: (req: SeekRequest) => void, durationMs: number, pref: ScrubPreference = "auto", now: () => number = () => Date.now()) {
    this.send = send;
    this.durationMs = durationMs;
    this.pref = pref;
    this.now = now;
  }

  move(ms: number): void {
    if (this.released) return;
    this.queued = ms;
    this.pump();
  }

  release(ms: number): void {
    this.released = true;
    this.queued = ms;
    this.pump();
  }

  /** The engine finished the in-flight seek. Returns true once the final one landed. */
  settled(): boolean {
    const f = this.inFlight;
    if (f) {
      if (f.mode === "accurate") this.lastAccurateMs = this.now() - f.at;
      this.inFlight = null;
      this.pump();
    }
    return this.done;
  }

  get done(): boolean {
    return this.finalSent && this.inFlight == null;
  }

  private pump(): void {
    if (this.inFlight || this.queued == null) return;
    const ms = this.queued;
    this.queued = null;
    const mode: SeekMode = this.released ? "accurate" : scrubMode(this.pref, this.lastAccurateMs);
    if (this.released) this.finalSent = true;
    this.inFlight = { mode, at: this.now() };
    this.send({ positionMs: seekTarget(ms, this.durationMs), exact: mode === "accurate" });
  }
}
