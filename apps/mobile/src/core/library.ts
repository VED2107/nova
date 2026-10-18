import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import * as Q from "./queue";

/**
 * Everything NOVA remembers on the phone: media the user added (single files
 * or whole folders), playback positions, learned durations, poster frames,
 * saved playlists and the play queue. Local only (AsyncStorage); nothing
 * leaves the device. M4 moves this to SQLite with the desktop schema.
 *
 * Kinds: `bundled` = the NOVA test card shipped in the app; `file` = a file
 * the user picked; `folder` = a file found in a folder the user added.
 */
export type ItemKind = "bundled" | "file" | "folder";

export interface MediaItem {
  id: string;
  kind: ItemKind;
  title: string;
  /** Asset module (bundled) or file/content URI. */
  source: number | string;
  folderId?: string;
  durationMs?: number;
  sizeBytes?: number;
  /** Container/MIME as reported by the picker, e.g. "video/mp4". */
  mime?: string;
  format?: string;
  addedAt: number;
}

export interface Folder {
  id: string;
  name: string;
  uri: string;
  addedAt: number;
  /** iOS grants folder access for the current session only. */
  sessionOnly: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  ids: string[];
  updatedAt: number;
}

export interface Progress {
  positionMs: number;
  durationMs: number;
  playedAt: number;
}

export const TEST_CARD: MediaItem = {
  id: "bundled:testcard",
  kind: "bundled",
  title: "NOVA test card",
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  source: require("../../assets/media/testcard.mp4"),
  durationMs: 45_000,
  sizeBytes: 7_523_326,
  format: "H.264 · AAC ×2 · Subtitles ×2 · MP4",
  addedAt: 0,
};

export const VIDEO_EXTENSIONS = ["mp4", "m4v", "mov", "mkv", "webm", "avi", "ts", "m2ts", "mts", "3gp", "mpg", "mpeg", "wmv", "flv", "ogv", "mxf", "mp3", "m4a", "aac", "flac", "wav", "opus", "ogg", "alac"];

export function isMediaName(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.includes(ext);
}

export function titleOf(name: string): string {
  return decodeURIComponent(name).replace(/\.[^.]+$/, "").replace(/[._]+/g, " ").trim() || name;
}

export function formatFromName(name: string, mime?: string | null): string | undefined {
  const ext = name.split(".").pop()?.toUpperCase();
  return ext && ext.length <= 5 ? ext : (mime ?? undefined);
}

interface State {
  items: MediaItem[];
  folders: Folder[];
  playlists: Playlist[];
  progress: Record<string, Progress>;
  durations: Record<string, number>;
  posters: Record<string, string>;
  /** Picture facts learned when an item was played (the library cannot probe files). */
  facts: Record<string, MediaFacts>;
  /** Items whose file could not be found or opened the last time NOVA tried. */
  missing: Record<string, true>;
  queue: Q.QueueState;
}

export interface MediaFacts {
  width?: number | null;
  height?: number | null;
  frameRate?: number | null;
}

const KEY = "nova.library.v2";
let state: State = { items: [], folders: [], playlists: [], progress: {}, durations: {}, posters: {}, facts: {}, missing: {}, queue: Q.EMPTY_QUEUE };
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function commit(next: State) {
  state = next;
  listeners.forEach((l) => l());
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  }, 250);
}

export async function loadLibrary(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<State>;
      state = {
        items: (s.items ?? []).filter((i) => i && typeof i.source === "string" && (i.kind === "file" || i.kind === "folder")),
        folders: s.folders ?? [],
        playlists: s.playlists ?? [],
        progress: s.progress ?? {},
        durations: s.durations ?? {},
        posters: s.posters ?? {},
        facts: s.facts ?? {},
        missing: s.missing ?? {},
        queue: s.queue ?? Q.EMPTY_QUEUE,
      };
    } else {
      // v1 (preview) data: keep positions and picked files.
      const [h, p] = await Promise.all([AsyncStorage.getItem("nova.history.v1"), AsyncStorage.getItem("nova.picked.v1")]);
      const old = p ? (JSON.parse(p) as { id: string; title: string; source: string; sizeBytes?: number; format?: string; addedAt: number }[]) : [];
      state = { ...state, progress: h ? JSON.parse(h) : {}, items: old.filter((i) => typeof i.source === "string").map((i) => ({ ...i, kind: "file" as const })) };
    }
  } catch {
    /* corrupt store: start empty, the test card still works */
  }
  listeners.forEach((l) => l());
}

export function useLibrary(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function getLibrary(): State {
  return state;
}

export function allItems(s: State = state): MediaItem[] {
  return [TEST_CARD, ...s.items].map((i) => (s.durations[i.id] && !i.durationMs ? { ...i, durationMs: s.durations[i.id] } : i));
}

export function findItem(id: string, s: State = state): MediaItem | undefined {
  return allItems(s).find((i) => i.id === id);
}

/* ---------------- Adding media ---------------- */

export function addFiles(files: { uri: string; name: string; size?: number | null; mime?: string | null }[]): MediaItem[] {
  const now = Date.now();
  const added = files.map(
    (f, i): MediaItem => ({ id: `file:${f.name}:${f.size ?? 0}`, kind: "file", title: titleOf(f.name), source: f.uri, sizeBytes: f.size ?? undefined, mime: f.mime ?? undefined, format: formatFromName(f.name, f.mime), addedAt: now + i }),
  );
  const ids = new Set(added.map((a) => a.id));
  commit({ ...state, items: [...added, ...state.items.filter((i) => !ids.has(i.id))].slice(0, 2000) });
  return added;
}

export function addFolder(folder: Omit<Folder, "addedAt">, files: { uri: string; name: string; size?: number | null }[]): MediaItem[] {
  const now = Date.now();
  const items = files.map((f, i): MediaItem => ({ id: `folder:${folder.id}:${f.name}:${f.size ?? 0}`, kind: "folder", folderId: folder.id, title: titleOf(f.name), source: f.uri, sizeBytes: f.size ?? undefined, format: formatFromName(f.name), addedAt: now + i }));
  const keep = state.items.filter((i) => i.folderId !== folder.id);
  commit({ ...state, folders: [{ ...folder, addedAt: now }, ...state.folders.filter((f) => f.id !== folder.id)], items: [...items, ...keep] });
  return items;
}

export function removeFolder(id: string): void {
  commit({ ...state, folders: state.folders.filter((f) => f.id !== id), items: state.items.filter((i) => i.folderId !== id) });
}

/** Removes from the library (the file itself is never touched). */
export function removeItem(id: string): void {
  const { [id]: _p, ...progress } = state.progress;
  commit({
    ...state,
    items: state.items.filter((i) => i.id !== id),
    progress,
    playlists: state.playlists.map((p) => ({ ...p, ids: p.ids.filter((x) => x !== id) })),
    queue: Q.remove(state.queue, id),
  });
}

/* ---------------- Positions, durations, posters ---------------- */

/** Resume rule (same as desktop): ignore the first 10 s and the last 5 %. */
export function resumePoint(p: Progress | undefined): number | null {
  if (!p || p.durationMs <= 0) return null;
  if (p.positionMs < 10_000 || p.positionMs > p.durationMs * 0.95) return null;
  return p.positionMs;
}

export function saveProgress(id: string, positionMs: number, durationMs: number): void {
  if (!(durationMs > 0)) return;
  commit({ ...state, progress: { ...state.progress, [id]: { positionMs, durationMs, playedAt: Date.now() } }, durations: { ...state.durations, [id]: durationMs } });
}

export function resetProgress(id: string): void {
  const { [id]: _p, ...progress } = state.progress;
  commit({ ...state, progress });
}

export function clearHistory(): void {
  commit({ ...state, progress: {} });
}

export function setPoster(id: string, uri: string): void {
  if (state.posters[id] === uri) return;
  commit({ ...state, posters: { ...state.posters, [id]: uri } });
}

export function setFacts(id: string, facts: MediaFacts): void {
  const before = state.facts[id];
  if (before && before.width === facts.width && before.height === facts.height && before.frameRate === facts.frameRate) return;
  commit({ ...state, facts: { ...state.facts, [id]: { ...before, ...facts } } });
}

export function setMissing(id: string, missing: boolean): void {
  if (!!state.missing[id] === missing) return;
  const { [id]: _m, ...rest } = state.missing;
  commit({ ...state, missing: missing ? { ...rest, [id]: true } : rest });
}

/** Catalogue number as on desktop ("NO. 004"): order of addition, the test card is 000. */
export function catalogNumber(id: string, s: State = state): string {
  if (id === TEST_CARD.id) return "NO. 000";
  const ordered = [...s.items].sort((a, b) => a.addedAt - b.addedAt);
  const i = ordered.findIndex((x) => x.id === id);
  return i < 0 ? "" : `NO. ${String(i + 1).padStart(3, "0")}`;
}

/** "720p", "4K" from learned height. */
export function pictureLabel(f: MediaFacts | undefined): string | null {
  const h = f?.height;
  if (!h) return null;
  if (h >= 2000) return "4K";
  if (h >= 1400) return "1440p";
  return `${h}p`;
}

/* ---------------- Queue ---------------- */

export function setQueue(next: Q.QueueState): void {
  commit({ ...state, queue: next });
}

export function playIds(ids: string[], startId?: string): void {
  const q = Q.openQueue(ids, startId ? Math.max(0, ids.indexOf(startId)) : 0, state.queue.repeat);
  setQueue(q);
}

/* ---------------- Playlists ---------------- */

export function savePlaylist(name: string, ids: string[]): Playlist {
  const p: Playlist = { id: `pl:${Date.now()}`, name: name.trim() || "Playlist", ids: [...new Set(ids)], updatedAt: Date.now() };
  commit({ ...state, playlists: [p, ...state.playlists] });
  return p;
}

export function addToPlaylist(playlistId: string, id: string): void {
  commit({ ...state, playlists: state.playlists.map((p) => (p.id === playlistId && !p.ids.includes(id) ? { ...p, ids: [...p.ids, id], updatedAt: Date.now() } : p)) });
}

export function removeFromPlaylist(playlistId: string, id: string): void {
  commit({ ...state, playlists: state.playlists.map((p) => (p.id === playlistId ? { ...p, ids: p.ids.filter((x) => x !== id), updatedAt: Date.now() } : p)) });
}

export function renamePlaylist(playlistId: string, name: string): void {
  commit({ ...state, playlists: state.playlists.map((p) => (p.id === playlistId ? { ...p, name: name.trim() || p.name, updatedAt: Date.now() } : p)) });
}

export function deletePlaylist(playlistId: string): void {
  commit({ ...state, playlists: state.playlists.filter((p) => p.id !== playlistId) });
}

/* ---------------- Views ---------------- */

export type Sort = "recent" | "title" | "length" | "added";

export function sortItems(items: MediaItem[], sort: Sort, progress: Record<string, Progress>): MediaItem[] {
  const by = (a: MediaItem, b: MediaItem) => {
    if (sort === "title") return a.title.localeCompare(b.title, undefined, { numeric: true });
    if (sort === "length") return (b.durationMs ?? 0) - (a.durationMs ?? 0);
    if (sort === "added") return b.addedAt - a.addedAt;
    return (progress[b.id]?.playedAt ?? 0) - (progress[a.id]?.playedAt ?? 0) || b.addedAt - a.addedAt;
  };
  return [...items].sort(by);
}

export function matches(item: MediaItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return item.title.toLowerCase().includes(q) || (item.format ?? "").toLowerCase().includes(q);
}
