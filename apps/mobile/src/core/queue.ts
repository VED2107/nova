/**
 * Play queue rules, same behaviour as desktop (crates/nova-domain/src/queue.rs):
 * next/previous, repeat off/one/all, shuffle of the upcoming items only,
 * "previous" restarts the current item when more than 3 s in.
 * Pure: no React Native imports (unit-tested under node).
 */

export type RepeatMode = "off" | "one" | "all";

export interface QueueState {
  ids: string[];
  index: number; // -1 when empty
  repeat: RepeatMode;
}

export const EMPTY_QUEUE: QueueState = { ids: [], index: -1, repeat: "off" };

export function openQueue(ids: string[], startAt = 0, repeat: RepeatMode = "off"): QueueState {
  const clean = dedupe(ids);
  if (clean.length === 0) return { ...EMPTY_QUEUE, repeat };
  return { ids: clean, index: Math.min(Math.max(0, startAt), clean.length - 1), repeat };
}

function dedupe(ids: string[]): string[] {
  return ids.filter((id, i) => ids.indexOf(id) === i);
}

export function current(q: QueueState): string | null {
  return q.index >= 0 ? (q.ids[q.index] ?? null) : null;
}

/**
 * The item after the current one when media ends (`auto`) or the user asks
 * for "next". Repeat one only applies to the automatic advance: an explicit
 * "next" still moves on.
 */
export function nextIndex(q: QueueState, auto: boolean): number | null {
  if (q.index < 0) return null;
  if (auto && q.repeat === "one") return q.index;
  if (q.index + 1 < q.ids.length) return q.index + 1;
  return q.repeat === "all" && q.ids.length > 0 ? 0 : null;
}

/** Previous restarts the current item when > 3 s in (returns the same index). */
export function previousIndex(q: QueueState, positionMs: number): number | null {
  if (q.index < 0) return null;
  if (positionMs > 3_000) return q.index;
  if (q.index > 0) return q.index - 1;
  return q.repeat === "all" ? q.ids.length - 1 : q.index;
}

export function cycleRepeat(r: RepeatMode): RepeatMode {
  return r === "off" ? "all" : r === "all" ? "one" : "off";
}

/** Adds to the end (already queued items are left where they are). */
export function append(q: QueueState, ids: string[]): QueueState {
  const add = dedupe(ids).filter((id) => !q.ids.includes(id));
  const out = { ...q, ids: [...q.ids, ...add] };
  if (out.index < 0 && out.ids.length > 0) out.index = 0;
  return out;
}

/** Puts `id` right after the current item (moving it if already queued). */
export function playNext(q: QueueState, id: string): QueueState {
  if (q.index < 0) return openQueue([id]);
  if (current(q) === id) return q;
  const ids = q.ids.filter((x) => x !== id);
  const cur = ids.indexOf(current(q)!);
  ids.splice(cur + 1, 0, id);
  return { ...q, ids, index: cur };
}

export function remove(q: QueueState, id: string): QueueState {
  const at = q.ids.indexOf(id);
  if (at < 0) return q;
  const ids = q.ids.filter((x) => x !== id);
  let index = q.index;
  if (at < q.index) index -= 1;
  else if (at === q.index) index = Math.min(q.index, ids.length - 1);
  return { ...q, ids, index: ids.length === 0 ? -1 : index };
}

/** Moves an item by `delta` places; the current item stays current. */
export function move(q: QueueState, id: string, delta: number): QueueState {
  const from = q.ids.indexOf(id);
  if (from < 0) return q;
  const to = Math.min(q.ids.length - 1, Math.max(0, from + delta));
  if (to === from) return q;
  const cur = current(q);
  const ids = [...q.ids];
  ids.splice(from, 1);
  ids.splice(to, 0, id);
  return { ...q, ids, index: cur == null ? q.index : ids.indexOf(cur) };
}

/** Shuffles only what comes after the current item (Fisher–Yates; rng injectable for tests). */
export function shuffleUpcoming(q: QueueState, rng: () => number = Math.random): QueueState {
  const head = q.ids.slice(0, q.index + 1);
  const tail = q.ids.slice(q.index + 1);
  for (let i = tail.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [tail[i], tail[j]] = [tail[j]!, tail[i]!];
  }
  return { ...q, ids: [...head, ...tail] };
}

export function select(q: QueueState, id: string): QueueState {
  const at = q.ids.indexOf(id);
  return at < 0 ? q : { ...q, index: at };
}

/* ---------------- A–B loop (the system engine has none; NOVA drives it) ---------------- */

export interface AbLoop {
  aMs: number | null;
  bMs: number | null;
}

/** L / the loop button: set A, then B (must be after A), then clear. */
export function cycleAb(loop: AbLoop, positionMs: number): AbLoop {
  if (loop.aMs == null) return { aMs: positionMs, bMs: null };
  if (loop.bMs == null) return positionMs > loop.aMs + 100 ? { aMs: loop.aMs, bMs: positionMs } : { aMs: positionMs, bMs: null };
  return { aMs: null, bMs: null };
}

/** Where to jump when playback crosses B (null = keep playing). */
export function abWrap(loop: AbLoop, positionMs: number): number | null {
  if (loop.aMs == null || loop.bMs == null) return null;
  return positionMs >= loop.bMs ? loop.aMs : null;
}

/* ---------------- Frame stepping by exact seek ---------------- */

/**
 * One frame forward/back by seeking exactly one frame duration from the
 * displayed frame. Correct for constant-frame-rate media; on variable frame
 * rate it may skip or repeat a frame (the system engine has no frame step).
 */
export function frameStepTarget(positionMs: number, fps: number | null, forward: boolean): number | null {
  if (!fps || !(fps > 0)) return null;
  const frame = 1000 / fps;
  const index = Math.round(positionMs / frame);
  return Math.max(0, (index + (forward ? 1 : -1)) * frame + 0.5);
}

/** "1:02:03", "62:03", "3723", "90.5" or "1h2m3s" → ms (same as desktop). */
export function parseTimeInput(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const hms = t.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/);
  if (hms && (hms[1] || hms[2] || hms[3])) {
    return Math.round((Number(hms[1] ?? 0) * 3600 + Number(hms[2] ?? 0) * 60 + Number(hms[3] ?? 0)) * 1000);
  }
  const parts = t.split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  if (parts.slice(1).some((p) => Number(p) >= 60)) return null;
  return Math.round(parts.reduce((acc, p) => acc * 60 + Number(p), 0) * 1000);
}
