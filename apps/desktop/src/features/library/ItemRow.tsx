import { Thumb } from "../../components/Thumb";
import { Stamp } from "../../components/ui/controls";
import type { LibraryItem } from "../../services/library/types";
import { catalogNo, folderName, specLine, stampFor, timeLeft, watchedFraction } from "../../services/library/view";

export const ROW_HEIGHT = 68;

/** One catalogued title. The whole row is the play button. */
export function ItemRow({ item, onPlay, style }: { item: LibraryItem; onPlay: (i: LibraryItem) => void; style?: React.CSSProperties }) {
  const stamp = stampFor(item);
  const frac = watchedFraction(item.progress);
  return (
    <button
      type="button"
      style={{ height: ROW_HEIGHT, ...style }}
      onClick={() => onPlay(item)}
      disabled={item.missing}
      title={item.path}
      className="press group absolute inset-x-0 flex items-center gap-4 border-b border-seam px-2 text-left hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Thumb item={item} progress={stamp === "progress" ? frac : null} className="aspect-video w-[88px] shrink-0 rounded-[3px] ring-1 ring-seam" />
      <span className="min-w-0 flex-1">
        <span className="spine block truncate text-[17px] text-ink">{item.title}</span>
        <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">
          {[stamp === "progress" ? timeLeft(item.progress) : null, specLine(item), folderName(item.folder)].filter(Boolean).join(" · ")}
        </span>
      </span>
      {stamp && <Stamp kind={stamp} />}
      <span className="catalog hidden w-16 shrink-0 text-right text-ink-3 min-[760px]:block">{catalogNo(item.id)}</span>
    </button>
  );
}
