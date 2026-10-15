import { useRef, useState } from "react";
import { execute } from "../../services/playback/client";
import { formatTime } from "../../services/playback/format";
import type { AbLoop } from "../../services/playback/types";

const SCRUB_SEEK_INTERVAL_MS = 80;

/**
 * Timeline: native range input (keyboard + screen readers), drawn track,
 * hover time preview, A–B region. Scrubbing issues fast keyframe seeks and
 * one exact seek on release.
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

  const commit = () => {
    if (scrubMs == null) return;
    void execute({ type: "seek", positionMs: Math.round(scrubMs), exact: true });
    setScrubMs(null);
  };

  return (
    <div
      className="timeline group relative flex h-6 items-center"
      onPointerMove={(e) => {
        if (max <= 0) return;
        const r = e.currentTarget.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        setHover({ pct: p * 100, ms: p * max });
      }}
      onPointerLeave={() => setHover(null)}
    >
      <div className="pointer-events-none absolute inset-x-0 h-[3px] rounded-full bg-white/22 transition-[height] duration-150 ease-(--ease-out-strong) group-hover:h-[6px]">
        {hover && scrubMs == null && <div className="absolute inset-y-0 left-0 rounded-full bg-white/18" style={{ width: `${hover.pct}%` }} />}
        <div className="absolute inset-y-0 left-0 rounded-full bg-ember" style={{ width: `${pct}%` }} />
        {a != null && b != null && (
          <div aria-hidden className="absolute -inset-y-[3px] rounded-[2px] bg-cream/25 ring-1 ring-cream/70" style={{ left: `${a}%`, width: `${Math.max(0.4, b - a)}%` }} />
        )}
        {a != null && b == null && <div aria-hidden className="absolute -inset-y-[5px] w-[2px] rounded-full bg-cream" style={{ left: `${a}%` }} />}
      </div>
      {(scrubMs != null || hover) && max > 0 && (
        <div
          className="pointer-events-none absolute -top-9 -translate-x-1/2 rounded-[5px] bg-room-glass px-2 py-0.5 text-[12px] font-[560] tabular-nums text-room-ink ring-1 ring-room-seam"
          style={{ left: `${scrubMs != null ? pct : hover!.pct}%` }}
        >
          {formatTime(scrubMs ?? hover!.ms)}
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
        disabled={disabled || max <= 0}
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
        className="seek-input relative h-6 w-full cursor-pointer disabled:cursor-default"
      />
    </div>
  );
}
