import { useEffect, useRef, useState } from "react";
import { execute, previewFrame, store } from "../../services/playback/client";
import { formatTime } from "../../services/playback/format";
import { keyStepMs, msToPct, pointerToMs, ScrubSession, seekTarget } from "../../services/playback/seek";
import type { AbLoop, Chapter } from "../../services/playback/types";
import { usePrefs } from "../../services/prefs";

const PREVIEW_DEBOUNCE_MS = 110;
const PREVIEW_RETRY_MS = 160;
/** Preview requests are keyed to 100 ms so a settled pointer gets its own frame. */
const PREVIEW_KEY_MS = 100;

/** Preview cache key for a hovered time. */
export function previewKey(ms: number): number {
  return Math.round(ms / PREVIEW_KEY_MS) * PREVIEW_KEY_MS;
}

/** How far a cached frame may be from the hovered time and still be shown (dimmed). */
export function previewTolerance(durationMs: number): number {
  return Math.max(1000, durationMs / 120);
}

/** The cached preview nearest to `ms`, if within tolerance. */
export function nearestPreview(frames: Map<number, string>, ms: number, durationMs: number): { url: string; ms: number } | null {
  let best: { url: string; ms: number } | null = null;
  for (const [k, url] of frames) {
    if (Math.abs(k - ms) <= previewTolerance(durationMs) && (!best || Math.abs(k - ms) < Math.abs(best.ms - ms))) best = { url, ms: k };
  }
  return best;
}

/** The chapter that contains `ms` (null without chapters). */
export function chapterAt(chapters: Chapter[], ms: number): Chapter | null {
  let hit: Chapter | null = null;
  for (const c of chapters) if (c.timeMs <= ms) hit = c;
  return hit;
}

/**
 * The timeline row: elapsed time, a slim bar, total (or remaining) time.
 *
 * Seeking (docs/architecture/seeking.md): one pointer-to-time mapping drives
 * hover, drag and release, so the time in the preview is the time you land
 * on. Dragging sends latest-wins seeks (one in flight at a time); releasing
 * sends one accurate seek and holds the playhead on the target until the
 * engine confirms it, so it never snaps back to a stale position. Arrow keys
 * reach the global seek actions; PageUp/PageDown, Home and End are handled
 * here, as a slider should.
 *
 * Everything drawn is engine-reported: chapter cuts only when the container
 * has chapters, preview frames only when the engine decoded one.
 */
export function Timeline(props: {
  sessionId: number;
  positionMs: number;
  durationMs: number | null;
  disabled: boolean;
  hasVideo: boolean;
  abLoop: AbLoop;
  chapters: Chapter[];
  remaining: boolean;
  onToggleTime: () => void;
}) {
  const { durationMs, abLoop, chapters } = props;
  const prefs = usePrefs();
  /** Target shown while dragging or until the final seek lands. */
  const [heldMs, setHeldMs] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [frames, setFrames] = useState<Map<number, string>>(new Map());
  const scrub = useRef<ScrubSession | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pending = useRef<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const max = durationMs ?? 0;
  const live = !props.disabled && max > 0;
  const value = heldMs ?? Math.min(props.positionMs, max);
  const pct = msToPct(value, max);
  const a = abLoop.aMs != null ? msToPct(abLoop.aMs, max) : null;
  const b = abLoop.bMs != null ? msToPct(abLoop.bMs, max) : null;
  const probe = dragging ? value : hover;

  // New media: forget its frames and any seek in progress.
  useEffect(() => {
    setFrames(new Map());
    pending.current = null;
    scrub.current = null;
    setHeldMs(null);
    setDragging(false);
  }, [props.sessionId]);

  // Drive the scrub session from engine snapshots, plus a tick so a seek the
  // engine never reports still times out while paused (no snapshots arrive).
  useEffect(() => {
    if (heldMs == null) return;
    const check = () => {
      const s = scrub.current;
      if (!s) return setHeldMs(null);
      const snap = store.get();
      if (s.observe({ seq: snap.seq, phase: snap.phase })) {
        scrub.current = null;
        setHeldMs(null);
      }
    };
    const unsub = store.subscribe(check);
    const tick = window.setInterval(check, 100);
    return () => {
      unsub();
      window.clearInterval(tick);
    };
  }, [heldMs != null]);

  // Ask the engine for the hovered frame once the pointer settles.
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (probe == null || !live || !props.hasVideo) return;
    const key = previewKey(probe);
    if (frames.has(key)) return;
    const request = () => {
      if (pending.current != null) return;
      pending.current = key;
      previewFrame(key).then(
        (url) => {
          pending.current = null;
          setFrames((m) => new Map(m).set(key, url));
        },
        (e) => {
          pending.current = null;
          if (String(e) === "busy") timer.current = window.setTimeout(request, PREVIEW_RETRY_MS);
        },
      );
    };
    timer.current = window.setTimeout(request, PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(timer.current);
  }, [probe != null ? previewKey(probe) : null, live, props.hasVideo, max]);

  const msAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return pointerToMs(clientX, r.left, r.width, max);
  };
  const send = (req: { positionMs: number; exact: boolean }) => void execute({ type: "seek", ...req }).catch(() => {});
  /** One accurate seek outside a drag (keys, clicks without movement). */
  const jump = (ms: number) => {
    const s = new ScrubSession(send, max, prefs.scrub);
    s.release(ms, store.get().seq);
    scrub.current = s;
    setHeldMs(seekTarget(ms, max));
  };

  const frame = probe != null && props.hasVideo && max > 0 ? nearestPreview(frames, probe, max) : null;
  const exactFrame = frame != null && probe != null && Math.abs(frame.ms - probe) <= PREVIEW_KEY_MS / 2;
  const chapter = probe != null ? chapterAt(chapters, probe) : null;
  const shownLeft = props.remaining && durationMs != null ? `−${formatTime(Math.max(0, durationMs - props.positionMs))}` : formatTime(props.positionMs);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="readout w-[52px] shrink-0 text-right text-[12.5px] text-room-ink" aria-hidden>
        {props.disabled ? "--:--" : formatTime(value)}
      </span>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={live ? 0 : -1}
        aria-label="Seek"
        aria-disabled={!live}
        aria-valuemin={0}
        aria-valuemax={Math.round(max / 1000)}
        aria-valuenow={Math.round(value / 1000)}
        aria-valuetext={`${formatTime(value)} of ${formatTime(durationMs)}${chapter?.title ? `, ${chapter.title}` : ""}`}
        className={`timeline seek-surface relative flex h-[22px] min-w-0 flex-1 touch-none items-center ${live ? "cursor-pointer" : "cursor-default"}`}
        data-scrubbing={dragging}
        onPointerDown={(e) => {
          if (!live || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const ms = msAt(e.clientX);
          const s = new ScrubSession(send, max, prefs.scrub);
          scrub.current = s;
          setDragging(true);
          setHeldMs(ms);
          s.move(ms, store.get().seq);
        }}
        onPointerMove={(e) => {
          if (!live) return;
          const ms = msAt(e.clientX);
          if (dragging && scrub.current) {
            setHeldMs(ms);
            scrub.current.move(ms, store.get().seq);
          } else setHover(ms);
        }}
        onPointerUp={(e) => {
          if (!dragging || !scrub.current) return;
          const ms = msAt(e.clientX);
          setDragging(false);
          setHeldMs(seekTarget(ms, max));
          scrub.current.release(ms, store.get().seq);
        }}
        onPointerCancel={() => {
          // Capture lost mid-drag: finish accurately where the playhead was drawn.
          if (!dragging || !scrub.current) return;
          setDragging(false);
          scrub.current.release(value, store.get().seq);
        }}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (!live) return;
          // Arrows and Home reach the global seek actions (configurable keys).
          if (e.key.startsWith("Arrow") || e.key === "Home") return;
          const step = keyStepMs(e.key, e.shiftKey, max);
          const to = e.key === "End" ? max : step != null ? value + step : null;
          if (to == null) return;
          e.preventDefault();
          e.stopPropagation();
          jump(to);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div className={`timeline-track pointer-events-none absolute inset-x-0 overflow-hidden rounded-[2px] ${live ? "bg-white/[0.22]" : "timeline-ghost bg-white/[0.06]"}`}>
          {hover != null && !dragging && msToPct(hover, max) > pct && (
            <div className="timeline-ghost absolute inset-y-0" style={{ left: `${pct}%`, width: `${msToPct(hover, max) - pct}%` }} />
          )}
          <div className="absolute inset-y-0 left-0 bg-ember" style={{ width: `${pct}%` }} />
          {/* Chapter cuts: a gap in the line, not a coloured dot. */}
          {live &&
            chapters
              .filter((c) => c.timeMs > 0 && c.timeMs < max)
              .map((c) => <span key={c.timeMs} aria-hidden className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-room" style={{ left: `${msToPct(c.timeMs, max)}%` }} />)}
        </div>

        {/* A–B: a doubled bracket around the looped span; A alone is a single stem. */}
        {live && a != null && b != null && (
          <div aria-hidden className="pointer-events-none absolute top-1/2 h-[14px] -translate-y-1/2 border-x-2 border-y border-cream/90" style={{ left: `${a}%`, width: `${Math.max(0.3, b - a)}%` }} />
        )}
        {live && a != null && b == null && <div aria-hidden className="pointer-events-none absolute top-1/2 h-[14px] w-[2px] -translate-x-1/2 -translate-y-1/2 bg-cream" style={{ left: `${a}%` }} />}

        {live && <span aria-hidden className="timeline-beam pointer-events-none absolute" style={{ left: `${pct}%` }} />}

        {probe != null && live && (
          <div
            aria-hidden
            className="timeline-preview pointer-events-none absolute bottom-[calc(100%+10px)] -translate-x-1/2 overflow-hidden rounded-[6px] border border-room-seam bg-room-ply-2 shadow-[0_12px_28px_-10px_rgb(0_0_0/0.8)]"
            style={{ left: `clamp(${frame ? 92 : 40}px, ${msToPct(probe, max)}%, calc(100% - ${frame ? 92 : 40}px))` }}
          >
            {frame && <img src={frame.url} alt="" draggable={false} className={`block aspect-video w-[176px] object-cover ${exactFrame ? "" : "opacity-60"}`} />}
            <div className={`flex items-baseline gap-2 px-2 py-1 ${frame ? "" : "justify-center"}`}>
              <span className="readout text-[12px] text-room-ink">{formatTime(probe)}</span>
              {/* A nearby frame stands in until this one decodes: say whose it is. */}
              {frame && !exactFrame && <span className="readout text-[11px] text-room-ink-3">frame {formatTime(frame.ms)}</span>}
              {chapter?.title && <span className="max-w-[120px] truncate text-[11.5px] text-room-ink-2">{chapter.title}</span>}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={props.onToggleTime}
        disabled={props.disabled}
        title={props.remaining ? "Show total length" : "Show time remaining"}
        aria-label={`${formatTime(props.positionMs)} of ${durationMs == null ? "unknown length" : formatTime(durationMs)}. ${props.remaining ? "Show total length" : "Show time remaining"}`}
        className="readout w-[60px] shrink-0 rounded-[4px] py-0.5 text-left text-[12.5px] text-room-ink-2 hover:text-room-ink disabled:pointer-events-none"
      >
        {props.disabled ? "--:--" : durationMs == null ? <span className="engrave text-room-ink-3">Unknown</span> : props.remaining ? shownLeft : formatTime(durationMs)}
      </button>
    </div>
  );
}
