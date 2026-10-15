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

/** "4K", "1080p", "720p", or "1440×1080" for non-standard sizes. */
export function resolutionLabel(w: number | null, h: number | null): string | null {
  if (!w || !h) return null;
  if (h >= 4300 || w >= 7600) return "8K";
  if (h >= 2100 || w >= 3800) return "4K";
  for (const p of [1440, 1080, 720, 576, 480, 360]) if (h === p) return `${p}p`;
  return `${w}×${h}`;
}

/** Compact duration: "1:32:10" / "47:05" / null. */
export function formatDuration(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return null;
  const t = Math.round(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Catalogue number from the stable media id (real, not decorative). */
export function catalogNo(id: number): string {
  return `No. ${String(id).padStart(3, "0")}`;
}

/** Spec line printed like a disc back cover: only engine-measured facts. */
export function specLine(item: Pick<LibraryItem, "width" | "height" | "durationMs" | "sizeBytes">): string {
  return [resolutionLabel(item.width, item.height), formatDuration(item.durationMs), formatBytes(item.sizeBytes)]
    .filter(Boolean)
    .join(" · ");
}

export function stampFor(item: Pick<LibraryItem, "missing" | "progress">): "missing" | "watched" | "progress" | null {
  if (item.missing) return "missing";
  if (item.progress?.completed) return "watched";
  if (item.progress && item.progress.positionMs > 0) return "progress";
  return null;
}
