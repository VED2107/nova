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
        "absolute left-1/2 top-5 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full ring-1 ring-room-seam",
        "bg-room-glass py-1.5 pl-4 pr-1.5 text-[13px] text-room-ink shadow-xl shadow-black/40",
        "transition-[opacity,transform] duration-200 ease-(--ease-out-strong)",
        "data-[show=false]:pointer-events-none data-[show=false]:-translate-y-2 data-[show=false]:opacity-0",
        "motion-reduce:transition-opacity motion-reduce:data-[show=false]:translate-y-0",
      ].join(" ")}
    >
      {notice && (
        <>
          <span>
            Resumed at <span className="tabular-nums">{formatTime(notice.positionMs)}</span>
          </span>
          <button
            type="button"
            tabIndex={active ? 0 : -1}
            onClick={() => {
              setDismissed(notice.sessionId);
              void execute({ type: "seek", positionMs: 0, exact: true });
            }}
            className="press rounded-full bg-white/10 px-3 py-1 text-[12.5px] font-[600] hover:bg-white/15"
          >
            Start over
          </button>
        </>
      )}
    </div>
  );
}
