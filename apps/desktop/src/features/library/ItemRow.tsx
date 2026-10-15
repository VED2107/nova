import { Thumb } from "../../components/Thumb";
import { Stamp } from "../../components/ui/controls";
import type { LibraryItem } from "../../services/library/types";
import { catalogNo, folderName, formatBytes, formatDuration, resolutionLabel, stampFor, timeLeft, watchedFraction } from "../../services/library/view";

export const ROW_HEIGHT = 60;

/** Shared column template for the list header and rows; columns drop out as the window narrows. */
export const LIST_COLUMNS =
  "grid grid-cols-[72px_minmax(0,1fr)_64px_92px] min-[900px]:grid-cols-[72px_minmax(0,1fr)_64px_64px_76px_92px] min-[1180px]:grid-cols-[72px_minmax(0,1fr)_64px_64px_76px_minmax(0,150px)_92px]";

export function ListHeader() {
  const cell = "catalog text-ink-3";
  return (
    <div aria-hidden className={`${LIST_COLUMNS} items-center gap-4 border-b border-ink px-2 pb-1.5`}>
      <span />
      <span className={cell}>Title</span>
      <span className={`${cell} text-right`}>Length</span>
      <span className={`${cell} text-right max-[899px]:hidden`}>Picture</span>
      <span className={`${cell} text-right max-[899px]:hidden`}>Size</span>
      <span className={`${cell} max-[1179px]:hidden`}>Folder</span>
      <span className={cell}>Status</span>
    </div>
  );
}

/** One catalogued title as a list row. The whole row is the play button. */
export function ItemRow({
  item,
  onPlay,
  onContextMenu,
  style,
}: {
  item: LibraryItem;
  onPlay: (i: LibraryItem) => void;
  onContextMenu?: (e: React.MouseEvent, item: LibraryItem) => void;
  style?: React.CSSProperties;
}) {
  const stamp = stampFor(item);
  const frac = watchedFraction(item.progress);
  const left = stamp === "progress" ? timeLeft(item.progress) : null;
  return (
    <button
      type="button"
      style={{ height: ROW_HEIGHT, ...style }}
      onClick={() => onPlay(item)}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, item) : undefined}
      disabled={item.missing}
      title={item.missing ? `Moved or deleted: ${item.path}` : item.path}
      className={`press group absolute inset-x-0 ${LIST_COLUMNS} items-center gap-4 border-b border-seam px-2 text-left hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)] disabled:cursor-not-allowed`}
    >
      <Thumb item={item} progress={stamp === "progress" ? frac : null} className={`aspect-video w-[72px] rounded-[3px] ring-1 ring-seam ${item.missing ? "opacity-50 grayscale" : ""}`} />
      <span className="min-w-0">
        <span className={`spine block truncate text-[17px] ${item.missing ? "text-ink-3" : "text-ink"}`}>{item.title}</span>
        <span className="mt-0.5 block truncate text-[12px] text-ink-3">
          <span className="catalog mr-2">{catalogNo(item.id)}</span>
          {left ?? (item.missing ? "The file was moved or deleted" : folderName(item.folder))}
        </span>
      </span>
      <span className="text-right text-[13px] tabular-nums text-ink-2">{formatDuration(item.durationMs) ?? "—"}</span>
      <span className="text-right text-[13px] tabular-nums text-ink-2 max-[899px]:hidden">{resolutionLabel(item.width, item.height) ?? "—"}</span>
      <span className="text-right text-[13px] tabular-nums text-ink-2 max-[899px]:hidden">{formatBytes(item.sizeBytes)}</span>
      <span className="truncate text-[13px] text-ink-2 max-[1179px]:hidden">{folderName(item.folder)}</span>
      <span>{stamp && <Stamp kind={stamp} />}</span>
    </button>
  );
}
