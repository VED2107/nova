import { useEffect, useRef, useState } from "react";
import { execute, previewFrame } from "../../services/playback/client";
import { formatTime } from "../../services/playback/format";
import type { AbLoop, Chapter } from "../../services/playback/types";

const SCRUB_SEEK_INTERVAL_MS = 80;
const PREVIEW_DEBOUNCE_MS = 110;
const PREVIEW_RETRY_MS = 160;

/** Preview frames are cached per bucket so hovering back and forth costs nothing. */
export function previewBucket(ms: number, durationMs: number): number {
  const size = Math.max(1000, Math.round(durationMs / 240));
  return Math.floor(ms / size) * size + Math.floor(size / 2);
}

/** The chapter that contains `ms` (null without chapters). */
export function chapterAt(chapters: Chapter[], ms: number): Chapter | null {
  let hit: Chapter | null = null;
  for (const c of chapters) if (c.timeMs <= ms) hit = c;
  return hit;
}

/**
 * The timeline row, as in most desktop players: elapsed time, a slim bar,
 * total (or remaining) time. A native range input underneath carries keyboard
 * and screen-reader behaviour. Everything drawn is engine-reported: chapter
 * cuts only when the container has chapters, preview frames only when the
 * engine decoded one, no buffering band (local files have none to show).
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
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const [hover, setHover] = useState<{ pct: number; ms: number } | null>(null);
  const [frames, setFrames] = useState<Map<number, string>>(new Map());
  const lastSeek = useRef(0);
  const pending = useRef<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const max = durationMs ?? 0;
  const live = !props.disabled && max > 0;
  const value = scrubMs ?? Math.min(props.positionMs, max);
  const toPct = (ms: number) => (max > 0 ? Math.min(100, Math.max(0, (ms / max) * 100)) : 0);
  const pct = toPct(value);
  const a = abLoop.aMs != null ? toPct(abLoop.aMs) : null;
  const b = abLoop.bMs != null ? toPct(abLoop.bMs) : null;
  const probe = scrubMs != null ? { pct, ms: scrubMs } : hover;

  // New media: forget its frames.
  useEffect(() => {
    setFrames(new Map());
    pending.current = null;
  }, [props.sessionId]);

  // Ask the engine for the hovered frame once the pointer settles.
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!probe || !live || !props.hasVideo) return;
    const bucket = previewBucket(probe.ms, max);
    if (frames.has(bucket)) return;
    const request = () => {
      if (pending.current != null) return;
      pending.current = bucket;
      previewFrame(bucket).then(
        (url) => {
          pending.current = null;
          setFrames((m) => new Map(m).set(bucket, url));
        },
        (e) => {
          pending.current = null;
          if (String(e) === "busy") timer.current = window.setTimeout(request, PREVIEW_RETRY_MS);
        },
      );
    };
    timer.current = window.setTimeout(request, PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(timer.current);
  }, [probe && previewBucket(probe.ms, max), live, props.hasVideo, max]);

  const commit = () => {
    if (scrubMs == null) return;
    void execute({ type: "seek", positionMs: Math.round(scrubMs), exact: true });
    setScrubMs(null);
  };

  // Nearest decoded frame within two buckets; otherwise the card is time-only.
  const frame = (() => {
    if (!probe || !props.hasVideo || max <= 0) return null;
    const bucket = previewBucket(probe.ms, max);
    const size = Math.max(1000, Math.round(max / 240));
    for (const d of [0, -1, 1, -2, 2]) {
      const f = frames.get(bucket + d * size);
      if (f) return { url: f, exact: d === 0 };
    }
    return null;
  })();
  const chapter = probe ? chapterAt(chapters, probe.ms) : null;
  const shownLeft = props.remaining && durationMs != null ? `−${formatTime(Math.max(0, durationMs - props.positionMs))}` : formatTime(props.positionMs);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="readout w-[52px] shrink-0 text-right text-[12.5px] text-room-ink" aria-hidden>
        {props.disabled ? "--:--" : formatTime(value)}
      </span>

      <div
        className="timeline relative flex h-[22px] min-w-0 flex-1 items-center"
        data-scrubbing={scrubMs != null}
        onPointerMove={(e) => {
          if (!live) return;
          const r = e.currentTarget.getBoundingClientRect();
          const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
          setHover({ pct: p * 100, ms: p * max });
        }}
        onPointerLeave={() => setHover(null)}
      >
        <div className={`timeline-track pointer-events-none absolute inset-x-0 overflow-hidden rounded-[2px] ${live ? "bg-white/[0.22]" : "timeline-ghost bg-white/[0.06]"}`}>
          {hover && scrubMs == null && hover.pct > pct && (
            <div className="timeline-ghost absolute inset-y-0" style={{ left: `${pct}%`, width: `${hover.pct - pct}%` }} />
          )}
          <div className="absolute inset-y-0 left-0 bg-ember" style={{ width: `${pct}%` }} />
          {/* Chapter cuts: a gap in the line, not a coloured dot. */}
          {live &&
            chapters
              .filter((c) => c.timeMs > 0 && c.timeMs < max)
              .map((c) => <span key={c.timeMs} aria-hidden className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-room" style={{ left: `${toPct(c.timeMs)}%` }} />)}
        </div>

        {/* A–B: a doubled bracket around the looped span; A alone is a single stem. */}
        {live && a != null && b != null && (
          <div aria-hidden className="pointer-events-none absolute top-1/2 h-[14px] -translate-y-1/2 border-x-2 border-y border-cream/90" style={{ left: `${a}%`, width: `${Math.max(0.3, b - a)}%` }} />
        )}
        {live && a != null && b == null && <div aria-hidden className="pointer-events-none absolute top-1/2 h-[14px] w-[2px] -translate-x-1/2 -translate-y-1/2 bg-cream" style={{ left: `${a}%` }} />}

        {live && <span aria-hidden className="timeline-beam pointer-events-none absolute" style={{ left: `${pct}%` }} />}

        {probe && live && (
          <div
            aria-hidden
            className="timeline-preview pointer-events-none absolute bottom-[calc(100%+10px)] -translate-x-1/2 overflow-hidden rounded-[6px] border border-room-seam bg-room-ply-2 shadow-[0_12px_28px_-10px_rgb(0_0_0/0.8)]"
            style={{ left: `clamp(${frame ? 92 : 40}px, ${probe.pct}%, calc(100% - ${frame ? 92 : 40}px))` }}
          >
            {frame && <img src={frame.url} alt="" draggable={false} className={`block aspect-video w-[176px] object-cover ${frame.exact ? "" : "opacity-60"}`} />}
            <div className={`flex items-baseline gap-2 px-2 py-1 ${frame ? "" : "justify-center"}`}>
              <span className="readout text-[12px] text-room-ink">{formatTime(probe.ms)}</span>
              {chapter?.title && <span className="max-w-[120px] truncate text-[11.5px] text-room-ink-2">{chapter.title}</span>}
            </div>
          </div>
        )}

        <input
          type="range"
          aria-label="Seek"
          aria-valuetext={`${formatTime(value)} of ${formatTime(durationMs)}${chapter?.title ? `, ${chapter.title}` : ""}`}
          min={0}
          max={max}
          step={100}
          value={value}
          disabled={!live}
          onChange={(e) => {
            const ms = Number(e.currentTarget.value);
            setScrubMs(ms);
            const now = performance.now();
            if (now - lastSeek.current >= SCRUB_SEEK_INTERVAL_MS) {
              lastSeek.current = now;
              void execute({ type: "seek", positionMs: Math.round(ms), exact: false });
            }
          }}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
          className="seek-input relative h-[22px] w-full cursor-pointer disabled:cursor-default"
        />
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
