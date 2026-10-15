import { useRef, useState } from "react";
import { execute } from "../../services/playback/client";
import { formatTime } from "../../services/playback/format";
import type { AbLoop } from "../../services/playback/types";

const SCRUB_SEEK_INTERVAL_MS = 80;

/**
 * Native range input for accessibility. While scrubbing it shows the local
 * value and issues fast keyframe seeks; on release it issues one exact seek.
 */
export function SeekBar({ positionMs, durationMs, disabled, abLoop }: { positionMs: number; durationMs: number | null; disabled: boolean; abLoop: AbLoop }) {
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const lastSeek = useRef(0);
  const max = durationMs ?? 0;
  const value = scrubMs ?? Math.min(positionMs, max);
  const pct = max > 0 ? (value / max) * 100 : 0;
  const toPct = (ms: number) => (max > 0 ? Math.min(100, (ms / max) * 100) : 0);
  const aPct = abLoop.aMs != null ? toPct(abLoop.aMs) : null;
  const bPct = abLoop.bMs != null ? toPct(abLoop.bMs) : null;

  const commit = () => {
    if (scrubMs == null) return;
    void execute({ type: "seek", positionMs: Math.round(scrubMs), exact: true });
    setScrubMs(null);
  };

  return (
    <div className="group relative flex h-5 items-center">
      <div className="pointer-events-none absolute inset-x-0 h-1 rounded-full bg-white/20 transition-[height] duration-150 group-hover:h-1.5">
        <div className="h-full rounded-full bg-ember" style={{ width: `${pct}%` }} />
        {aPct != null && bPct != null && (
          <div
            aria-hidden
            className="absolute -inset-y-1 rounded-sm bg-cream/25 ring-1 ring-cream/60"
            style={{ left: `${aPct}%`, width: `${Math.max(0.4, bPct - aPct)}%` }}
          />
        )}
        {aPct != null && bPct == null && (
          <div aria-hidden className="absolute -inset-y-1.5 w-0.5 rounded-full bg-cream" style={{ left: `${aPct}%` }} />
        )}
      </div>
      {scrubMs != null && (
        <div
          className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded-md bg-ink/90 px-2 py-0.5 text-xs tabular-nums text-cream"
          style={{ left: `${pct}%` }}
        >
          {formatTime(scrubMs)}
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
        className="seek-input relative h-5 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-default"
      />
    </div>
  );
}
