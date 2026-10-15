import { useState } from "react";
import { thumbnailUrl } from "../services/library/client";
import type { LibraryItem } from "../services/library/types";
import { resolutionLabel } from "../services/library/view";

/**
 * Poster frame from the engine's thumbnail job. Without one (audio, pending,
 * undecodable) it prints a typographic spine: never invented imagery.
 */
export function Thumb({ item, className = "", progress }: { item: LibraryItem; className?: string; progress?: number | null }) {
  const [failed, setFailed] = useState(false);
  const url = failed ? null : thumbnailUrl(item);
  const res = resolutionLabel(item.width, item.height);
  return (
    <div className={`relative overflow-hidden bg-[var(--thumb-bg)] ${className}`}>
      {url ? (
        <img src={url} alt="" draggable={false} onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col justify-between p-2.5">
          <span className="spine line-clamp-2 text-[15px] text-ink-2">{item.title}</span>
          <span className="catalog text-ink-3">{res ?? (item.durationMs == null && item.hasThumbnail === false ? "No picture" : "")}</span>
        </div>
      )}
      {progress != null && (
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/35" aria-hidden>
          <div className="h-full bg-ember" style={{ width: `${Math.max(2, progress * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
