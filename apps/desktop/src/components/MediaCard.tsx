import type { LibraryItem } from "../services/library/types";
import { catalogNo, specLine, stampFor, timeLeft, watchedFraction } from "../services/library/view";
import { Thumb } from "./Thumb";
import { Stamp } from "./ui/controls";

/** A title as a frame on the shelf: artwork first, then the facts NOVA actually has. */
export function MediaCard({
  item,
  onPlay,
  showLeft,
  onContextMenu,
}: {
  item: LibraryItem;
  onPlay: (i: LibraryItem) => void;
  showLeft?: boolean;
  onContextMenu?: (e: React.MouseEvent, item: LibraryItem) => void;
}) {
  const stamp = stampFor(item);
  const sub = showLeft ? (timeLeft(item.progress) ?? specLine(item)) : specLine(item);
  return (
    <button
      type="button"
      onClick={() => onPlay(item)}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, item) : undefined}
      disabled={item.missing}
      title={item.missing ? `Moved or deleted: ${item.path}` : item.path} className="press group block w-full rounded-[8px] text-left disabled:cursor-not-allowed">
      <span className="relative block">
        <Thumb
          item={item}
          progress={watchedFraction(item.progress)}
          className={`aspect-video w-full rounded-[6px] ring-1 ring-seam transition-[box-shadow] duration-200 group-hover:ring-[var(--seam-strong)] ${item.missing ? "opacity-50 grayscale" : ""}`}
        />
        {stamp && stamp !== "progress" && (
          <span className="absolute left-2 top-2 rounded-[3px] bg-paper px-0.5">
            <Stamp kind={stamp} />
          </span>
        )}
      </span>
      <span className="mt-2.5 flex items-baseline gap-2">
        <span className="spine min-w-0 flex-1 truncate text-[17px] text-ink">{item.title}</span>
        <span className="catalog shrink-0 text-ink-3">{catalogNo(item.id)}</span>
      </span>
      <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">{sub}</span>
    </button>
  );
}
