import type { LibraryItem } from "../../services/library/types";
import { folderName, formatBytes, timeLeft, watchedFraction } from "../../services/library/view";

export const ROW_HEIGHT = 56;

/** One library result. The whole row is the play button. */
export function ItemRow({ item, onPlay, style }: { item: LibraryItem; onPlay: (i: LibraryItem) => void; style?: React.CSSProperties }) {
  const frac = watchedFraction(item.progress);
  const left = timeLeft(item.progress);
  return (
    <button
      type="button"
      style={{ height: ROW_HEIGHT, ...style }}
      onClick={() => onPlay(item)}
      disabled={item.missing}
      title={item.path}
      className="press group absolute inset-x-0 flex items-center gap-4 rounded-lg px-3 text-left hover:bg-ink/[0.04] focus-visible:bg-ink/[0.04] disabled:cursor-not-allowed disabled:opacity-55"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink">{item.title}</span>
        <span className="block truncate text-xs text-ash">
          {item.missing ? <span className="font-medium text-ember">File missing · </span> : null}
          {folderName(item.folder)}
        </span>
      </span>
      {frac != null && (
        <span className="hidden w-28 shrink-0 flex-col gap-1 sm:flex" aria-label={left ?? undefined}>
          <span className="h-1 overflow-hidden rounded-full bg-ink/10">
            <span className="block h-full rounded-full bg-ember" style={{ width: `${frac * 100}%` }} />
          </span>
          <span className="text-[11px] text-ash">{left}</span>
        </span>
      )}
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-ash">{formatBytes(item.sizeBytes)}</span>
    </button>
  );
}
