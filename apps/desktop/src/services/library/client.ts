import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { LibraryItem, LibrarySort, ScanProgress, ScanRoot, SearchPage } from "./types";

export const SCAN_EVENT = "library://scan";
export const CHANGED_EVENT = "library://changed";

export const library = {
  roots: () => invoke<ScanRoot[]>("library_roots"),
  addRoot: (path: string) => invoke<ScanRoot>("library_add_root", { path }),
  removeRoot: (id: number) => invoke<void>("library_remove_root", { id }),
  rescan: (ids: number[] = []) => invoke<void>("library_rescan", { ids }),
  cancelScans: () => invoke<void>("library_cancel_scans"),
  scanStatus: () => invoke<{ current: ScanProgress | null; queued: number[] }>("library_scan_status"),
  search: (query: string, sort: LibrarySort, includeMissing: boolean, offset: number, limit: number) =>
    invoke<SearchPage>("library_search", { query, sort, includeMissing, offset, limit }),
  continueWatching: (limit = 12) => invoke<LibraryItem[]>("library_continue_watching", { limit }),
  recentlyAdded: (limit = 12) => invoke<LibraryItem[]>("library_recently_added", { limit }),
  onScan: (cb: (p: ScanProgress) => void) => listen<ScanProgress>(SCAN_EVENT, (e) => cb(e.payload)),
  onChanged: (cb: () => void) => listen(CHANGED_EVENT, () => cb()),
};
