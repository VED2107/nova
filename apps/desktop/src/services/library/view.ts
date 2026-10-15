import type { LibraryItem, SavedProgress } from "./types";

/** Rows to render for a fixed-height virtual list (with overscan). */
export function visibleRange(scrollTop: number, viewportHeight: number, rowHeight: number, total: number, overscan = 6) {
  if (total <= 0 || rowHeight <= 0) return { start: 0, end: 0 };
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const count = Math.ceil(Math.max(0, viewportHeight) / rowHeight);
  const start = Math.max(0, first - overscan);
  const end = Math.min(total, first + count + overscan);
  return { start, end };
}

/** Page indices needed to cover rows [start, end). */
export function pagesFor(start: number, end: number, pageSize: number): number[] {
  if (end <= start) return [];
  const first = Math.floor(start / pageSize);
  const last = Math.floor((end - 1) / pageSize);
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

/** Fraction watched in [0, 1], or null when unknown. */
export function watchedFraction(p: SavedProgress | null): number | null {
  if (!p) return null;
  if (p.completed) return 1;
  if (!p.durationMs || p.durationMs <= 0) return null;
  return Math.min(1, Math.max(0, p.positionMs / p.durationMs));
}

/** "23 min left" / "1 h 5 min left" / "Finished" / null. */
export function timeLeft(p: SavedProgress | null): string | null {
  if (!p) return null;
  if (p.completed) return "Finished";
  if (!p.durationMs) return null;
  const mins = Math.max(1, Math.round((p.durationMs - p.positionMs) / 60_000));
  if (mins < 60) return `${mins} min left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min left` : `${h} h left`;
}

/** Last folder name of a path, for compact display. */
export function folderName(folder: string): string {
  const parts = folder.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? folder;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export const itemKey = (i: LibraryItem) => i.id;
