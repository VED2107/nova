import { useEffect, useState } from "react";
import { execute, useResumeNotice } from "../../services/playback/client";
import { formatTime } from "../../services/playback/format";

const VISIBLE_MS = 6000;

/** "Resumed at 12:34 · Start over" — shown once per resumed session. */
export function ResumeToast({ sessionId, hasMedia }: { sessionId: number; hasMedia: boolean }) {
  const notice = useResumeNotice();
  const [dismissed, setDismissed] = useState<number | null>(null);
  const active = hasMedia && notice != null && notice.sessionId === sessionId && dismissed !== notice.sessionId;

  useEffect(() => {
    if (!active || !notice) return;
    const t = window.setTimeout(() => setDismissed(notice.sessionId), VISIBLE_MS);
    return () => window.clearTimeout(t);
  }, [active, notice]);

  return (
    <div
      role="status"
      aria-live="polite"
      data-show={active}
      onClick={(e) => e.stopPropagation()}
      className={[
        "absolute left-1/2 top-[60px] z-20 flex -translate-x-1/2 items-center gap-3 rounded-[6px] border border-room-seam",
        "bg-room-ply py-1.5 pl-3 pr-1.5 text-[13px] text-room-ink shadow-[0_10px_28px_-12px_rgb(0_0_0/0.8)]",
        "transition-[opacity,transform] duration-200 ease-(--ease-out-strong)",
        "data-[show=false]:pointer-events-none data-[show=false]:-translate-y-2 data-[show=false]:opacity-0",
        "motion-reduce:transition-opacity motion-reduce:data-[show=false]:translate-y-0",
      ].join(" ")}
    >
      {notice && (
        <>
          <span className="engrave text-room-ink-3">Resumed</span>
          <span className="readout">{formatTime(notice.positionMs)}</span>
          <button
            type="button"
            tabIndex={active ? 0 : -1}
            onClick={() => {
              setDismissed(notice.sessionId);
              void execute({ type: "seek", positionMs: 0, exact: true });
            }}
            className="press rounded-[4px] bg-white/10 px-2.5 py-1 text-[12.5px] font-[600] hover:bg-white/15"
          >
            Start over
          </button>
        </>
      )}
    </div>
  );
}
