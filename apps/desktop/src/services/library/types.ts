// Mirrors crates/nova-storage::library and crates/nova-library (serde camelCase).

export interface SavedProgress {
  positionMs: number;
  durationMs: number | null;
  completed: boolean;
}

export interface LibraryItem {
  id: number;
  title: string;
  path: string;
  folder: string;
  sizeBytes: number;
  missing: boolean;
  progress: SavedProgress | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  hasThumbnail: boolean;
}

export interface PlaylistSummary {
  id: number;
  name: string;
  itemCount: number;
  knownDurationMs: number | null;
  updatedAtMs: number;
}

export interface PlaylistEntry {
  path: string;
  title: string;
}

export interface SearchPage {
  items: LibraryItem[];
  total: number;
}

export interface LastScan {
  status: "running" | "completed" | "cancelled" | "failed" | "interrupted";
  startedAtMs: number;
  finishedAtMs: number | null;
  filesSeen: number;
  filesAdded: number;
  filesUpdated: number;
  filesMissing: number;
  errors: number;
  lastError: string | null;
}

export interface ScanRoot {
  id: number;
  path: string;
  itemCount: number;
  missingCount: number;
  lastScan: LastScan | null;
}

export type ScanState = "queued" | "scanning" | "completed" | "cancelled" | "failed";

export interface ScanProgress {
  rootId: number;
  state: ScanState;
  filesSeen: number;
  filesAdded: number;
  filesUpdated: number;
  filesMissing: number;
  errors: number;
  skippedLinks: number;
  lastError: string | null;
}

export type LibrarySort = "relevance" | "title" | "added";
