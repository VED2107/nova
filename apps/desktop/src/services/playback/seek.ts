/**
 * Seek policy for the timeline. Pure and engine-free so it can be tested and
 * shared with other shells. See docs/architecture/seeking.md for the measured
 * behaviour this is built on.
 *
 * Times are float milliseconds internally; they are rounded once, when a
 * command is built, so repeated scrubbing never accumulates rounding error.
 */

/** Seek the engine can perform: accurate lands on the first frame at or after
 *  the target; fast lands on a nearby keyframe (up to a whole GOP away). */
export type SeekMode = "accurate" | "fast";

/**
 * Maps a pointer x to a media time. The whole track width is the time axis,
 * edge to edge, and the same function drives hover, drag and release, so the
 * time a user sees in the preview is the time they get.
 */
export function pointerToMs(clientX: number, trackLeft: number, trackWidth: number, durationMs: number): number {
  if (!(trackWidth > 0) || !(durationMs > 0)) return 0;
  const p = (clientX - trackLeft) / trackWidth;
  return Math.min(1, Math.max(0, p)) * durationMs;
}

/** Inverse of {@link pointerToMs}, as a percentage for CSS. */
export function msToPct(ms: number, durationMs: number): number {
  if (!(durationMs > 0)) return 0;
  return Math.min(100, Math.max(0, (ms / durationMs) * 100));
}

/** Clamps a target into the media and rounds it for the engine (integer ms). */
export function seekTarget(ms: number, durationMs: number | null): number {
  const hi = durationMs != null && durationMs > 0 ? durationMs : Number.MAX_SAFE_INTEGER;
  return Math.round(Math.min(hi, Math.max(0, ms)));
}

/** Keyboard step on the timeline: 5 s, Shift 30 s, PageUp/Down 10 % of the media. */
export function keyStepMs(key: string, shift: boolean, durationMs: number): number | null {
  const tenth = Math.max(10_000, durationMs / 10);
  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      return shift ? -30_000 : -5_000;
    case "ArrowRight":
    case "ArrowUp":
      return shift ? 30_000 : 5_000;
    case "PageDown":
      return -tenth;
    case "PageUp":
      return tenth;
    default:
      return null;
  }
}

/** Accurate seeks slower than this make scrubbing feel sticky; fall back to fast. */
export const SCRUB_ACCURATE_BUDGET_MS = 120;
/** A seek that started but never reports settling is abandoned after this long. */
export const SEEK_SETTLE_TIMEOUT_MS = 1_500;
/** A seek the engine never reported starting (e.g. a no-op) is abandoned sooner. */
export const SEEK_START_TIMEOUT_MS = 250;

export type ScrubPreference = "auto" | "accurate" | "fast";

/**
 * Chooses the scrub mode. `auto` uses accurate seeks while the engine keeps
 * up (measured: H.264 1080p settles in ~6–40 ms, AV1 long-GOP ~80–160 ms)
 * and fast seeks once the last accurate seek was slower than the budget.
 */
export function scrubMode(pref: ScrubPreference, lastAccurateMs: number | null): SeekMode {
  if (pref !== "auto") return pref;
  return lastAccurateMs != null && lastAccurateMs > SCRUB_ACCURATE_BUDGET_MS ? "fast" : "accurate";
}

export interface SeekRequest {
  positionMs: number;
  exact: boolean;
}

export interface Settle {
  seq: number;
  phase: string;
}

/**
 * Latest-wins scrub coalescer. At most one seek is in flight; while it runs,
 * newer targets replace each other and only the newest is sent when the
 * engine settles. Release always ends with one accurate seek to the exact
 * release target, and the timeline keeps showing that target until the
 * engine confirms it landed (so the playhead never snaps back to a stale
 * position in between).
 */
export class ScrubSession {
  private inFlight: { seq: number; mode: SeekMode; at: number; started: boolean } | null = null;
  private queued: number | null = null;
  private released = false;
  private finalSent = false;
  lastAccurateMs: number | null = null;

  constructor(
    private readonly send: (req: SeekRequest) => void,
    private readonly durationMs: number,
    private readonly pref: ScrubPreference = "auto",
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Pointer moved while held. `seq` is the latest snapshot seq seen. */
  move(ms: number, seq: number): void {
    if (this.released) return;
    this.queued = ms;
    this.pump(seq);
  }

  /** Pointer released at `ms`: one final accurate seek, after any in flight. */
  release(ms: number, seq: number): void {
    this.released = true;
    this.queued = ms;
    this.pump(seq);
  }

  /** Feed every snapshot. Returns true once the final seek has landed. */
  observe(s: Settle): boolean {
    const f = this.inFlight;
    if (!f) return this.done;
    // While playing, position-only snapshots keep arriving, so "settled"
    // means: the engine reported this seek starting, then stopped seeking.
    if (s.seq > f.seq && s.phase === "seeking") f.started = true;
    const age = this.now() - f.at;
    const timedOut = age > (f.started ? SEEK_SETTLE_TIMEOUT_MS : SEEK_START_TIMEOUT_MS);
    if ((f.started && s.phase !== "seeking") || timedOut) {
      if (f.mode === "accurate" && !timedOut) this.lastAccurateMs = this.now() - f.at;
      this.inFlight = null;
      this.pump(s.seq);
    }
    return this.done;
  }

  /** The final seek was sent and the engine settled after it. */
  get done(): boolean {
    return this.finalSent && this.inFlight == null;
  }

  private pump(seq: number): void {
    if (this.inFlight || this.queued == null) return;
    const ms = this.queued;
    this.queued = null;
    const mode: SeekMode = this.released ? "accurate" : scrubMode(this.pref, this.lastAccurateMs);
    if (this.released) this.finalSent = true;
    this.inFlight = { seq, mode, at: this.now(), started: false };
    this.send({ positionMs: seekTarget(ms, this.durationMs), exact: mode === "accurate" });
  }
}
