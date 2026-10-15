import { useRef, useState } from "react";
import { execute } from "../../services/playback/client";
import { formatTime } from "../../services/playback/format";
import type { AbLoop } from "../../services/playback/types";

const SCRUB_SEEK_INTERVAL_MS = 80;

/**
 * The timeline. A native range input carries keyboard and screen-reader
 * behaviour; the drawing on top is NOVA's: an ink track, ember elapsed, and the
 * playhead as the Lumen beam (the N's diagonal, 15.3° off vertical).
 * Scrubbing issues fast keyframe seeks and one exact seek on release.
 */
export function SeekBar({ positionMs, durationMs, disabled, abLoop }: { positionMs: number; durationMs: number | null; disabled: boolean; abLoop: AbLoop }) {
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const [hover, setHover] = useState<{ pct: number; ms: number } | null>(null);
  const lastSeek = useRef(0);
  const max = durationMs ?? 0;
  const value = scrubMs ?? Math.min(positionMs, max);
  const toPct = (ms: number) => (max > 0 ? Math.min(100, Math.max(0, (ms / max) * 100)) : 0);
  const pct = toPct(value);
  const a = abLoop.aMs != null ? toPct(abLoop.aMs) : null;
  const b = abLoop.bMs != null ? toPct(abLoop.bMs) : null;
  const live = !disabled && max > 0;
  const bubble = scrubMs != null ? { pct, ms: scrubMs } : hover;

  const commit = () => {
    if (scrubMs == null) return;
    void execute({ type: "seek", positionMs: Math.round(scrubMs), exact: true });
    setScrubMs(null);
  };

  return (
    <div
      className="timeline group relative flex h-7 items-center"
      data-scrubbing={scrubMs != null}
      onPointerMove={(e) => {
        if (!live) return;
        const r = e.currentTarget.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        setHover({ pct: p * 100, ms: p * max });
      }}
      onPointerLeave={() => setHover(null)}
    >
      <div className="timeline-track pointer-events-none absolute inset-x-0 rounded-full bg-white/20">
        {hover && scrubMs == null && <div className="absolute inset-y-0 left-0 rounded-full bg-white/16" style={{ width: `${hover.pct}%` }} />}
        <div className="absolute inset-y-0 left-0 rounded-full bg-ember" style={{ width: `${pct}%` }} />
        {a != null && b != null && (
          <div aria-hidden className="absolute -inset-y-[4px] rounded-[2px] bg-cream/20 ring-1 ring-cream/70" style={{ left: `${a}%`, width: `${Math.max(0.4, b - a)}%` }} />
        )}
        {a != null && b == null && <div aria-hidden className="absolute -inset-y-[6px] w-[2px] rounded-full bg-cream" style={{ left: `${a}%` }} />}
      </div>
      {live && <span aria-hidden className="timeline-beam pointer-events-none absolute" style={{ left: `${pct}%` }} />}
      {bubble && live && (
        <div
          className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded-[5px] bg-room-glass px-2 py-0.5 text-[12px] font-[600] tabular-nums text-room-ink ring-1 ring-room-seam"
          style={{ left: `clamp(24px, ${bubble.pct}%, calc(100% - 24px))` }}
        >
          {formatTime(bubble.ms)}
        </div>
      )}
      <input
        type="range"
        aria-label="Seek"
        aria-valuetext={`${formatTime(value)} of ${formatTime(durationMs)}`}
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
        className="seek-input relative h-7 w-full cursor-pointer disabled:cursor-default"
      />
    </div>
  );
}
