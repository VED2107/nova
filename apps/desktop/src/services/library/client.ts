import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { LibraryItem, LibrarySort, PlaylistEntry, PlaylistSummary, ScanProgress, ScanRoot, SearchPage } from "./types";

let thumbDir: string | null = null;
/** Loads the poster-frame folder once; thumbnails are `<dir>/<id>.jpg`. */
export async function loadThumbDir(): Promise<void> {
  try {
    thumbDir = await invoke<string>("library_thumb_dir");
  } catch {
    thumbDir = null;
  }
}
export function thumbnailUrl(item: Pick<LibraryItem, "id" | "hasThumbnail">): string | null {
  if (!item.hasThumbnail || !thumbDir) return null;
  const sep = thumbDir.includes("\\") ? "\\" : "/";
  return convertFileSrc(thumbDir + sep + item.id + ".jpg");
}

export const SCAN_EVENT = "library://scan";
export const CHANGED_EVENT = "library://changed";

export const library = {
  roots: () => invoke<ScanRoot[]>("library_roots"),
  addRoot: (path: string) => invoke<ScanRoot>("library_add_root", { path }),
  removeRoot: (id: number) => invoke<void>("library_remove_root", { id }),
  rescan: (ids: number[] = []) => invoke<void>("library_rescan", { ids }),
  cancelScans: () => invoke<void>("library_cancel_scans"),
  scanStatus: () => invoke<{ current: ScanProgress | null; queued: number[] }>("library_scan_status"),
  search: (query: string, sort: LibrarySort, includeMissing: boolean, offset: number, limit: number, rootId: number | null = null) =>
    invoke<SearchPage>("library_search", { query, sort, includeMissing, offset, limit, rootId }),
  clearHistory: () => invoke<number>("library_clear_history"),
  playlists: () => invoke<PlaylistSummary[]>("playlists_list"),
  createPlaylist: (name: string, entries: PlaylistEntry[]) => invoke<number>("playlist_create", { name, entries }),
  renamePlaylist: (id: number, name: string) => invoke<void>("playlist_rename", { id, name }),
  deletePlaylist: (id: number) => invoke<void>("playlist_delete", { id }),
  playlistEntries: (id: number) => invoke<{ paths: string[]; missing: string[] }>("playlist_entries", { id }),
  durations: (paths: string[]) => invoke<Record<string, number>>("media_durations", { paths }),
  continueWatching: (limit = 12) => invoke<LibraryItem[]>("library_continue_watching", { limit }),
  recentlyAdded: (limit = 12) => invoke<LibraryItem[]>("library_recently_added", { limit }),
  onScan: (cb: (p: ScanProgress) => void) => listen<ScanProgress>(SCAN_EVENT, (e) => cb(e.payload)),
  onChanged: (cb: () => void) => listen(CHANGED_EVENT, () => cb()),
};
