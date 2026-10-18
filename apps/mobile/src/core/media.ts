import { Asset } from "expo-asset";
import { Directory, File } from "expo-file-system";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { getLibrary, isMediaName, setMissing, setPoster, type MediaItem } from "./library";

/** A playable URI for any item (bundled assets are resolved to a local file once). */
const resolved = new Map<number, string>();
export async function uriOf(item: MediaItem): Promise<string> {
  if (typeof item.source === "string") return item.source;
  const hit = resolved.get(item.source);
  if (hit) return hit;
  const asset = await Asset.fromModule(item.source).downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  resolved.set(item.source, uri);
  return uri;
}

/**
 * Poster frames, as on desktop's library: one decoded frame per title, taken
 * at 10 % in (or 1 s for short clips). Generated one at a time so the
 * library never competes with playback for the decoder.
 */
const pending = new Set<string>();
const queue: MediaItem[] = [];
let running = false;

export function requestPoster(item: MediaItem): void {
  if (Platform.OS === "web") return;
  const lib = getLibrary();
  if (lib.posters[item.id] || pending.has(item.id) || lib.missing[item.id]) return;
  pending.add(item.id);
  queue.push(item);
  void pump();
}

async function pump(): Promise<void> {
  if (running) return;
  running = true;
  while (queue.length > 0) {
    const item = queue.shift()!;
    try {
      const uri = await uriOf(item);
      const d = item.durationMs ?? getLibrary().durations[item.id];
      const time = d ? Math.min(Math.max(1000, d * 0.1), 60_000) : 3000;
      const r = await VideoThumbnails.getThumbnailAsync(uri, { time, quality: 0.6 });
      setPoster(item.id, r.uri);
    } catch {
      // Audio files, unreadable or unsupported media: no poster, the spine is drawn instead.
    } finally {
      pending.delete(item.id);
    }
  }
  running = false;
}

export function usePoster(item: MediaItem): string | null {
  const [, force] = useState(0);
  const uri = getLibrary().posters[item.id] ?? null;
  useEffect(() => {
    if (!uri) requestPoster(item);
  }, [item.id, uri]);
  useEffect(() => {
    // re-render once the poster lands
    const t = setInterval(() => getLibrary().posters[item.id] && force((n) => n + 1), 1500);
    if (uri) clearInterval(t);
    return () => clearInterval(t);
  }, [item.id, uri]);
  return uri;
}

/** Checks whether a file is still reachable; marks it missing (desktop's "Missing files"). */
export function checkExists(item: MediaItem): boolean {
  if (typeof item.source !== "string") return true;
  try {
    const ok = new File(item.source).exists;
    setMissing(item.id, !ok);
    return ok;
  } catch {
    return true; // providers that cannot answer are not reported as missing
  }
}

export interface ScannedFile {
  uri: string;
  name: string;
  size: number | null;
}

/**
 * Lists media in a folder the user picked, recursively (depth-limited).
 * iOS: access lasts for this session only. Android: a persistable SAF tree URI.
 */
export function scanDirectory(dir: Directory, depth = 4, out: ScannedFile[] = []): ScannedFile[] {
  if (depth < 0 || out.length >= 5000) return out;
  let entries: (Directory | File)[] = [];
  try {
    entries = dir.list();
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e instanceof Directory) scanDirectory(e, depth - 1, out);
    else if (isMediaName(e.name)) {
      let size: number | null = null;
      try {
        size = e.size ?? null;
      } catch {
        size = null;
      }
      out.push({ uri: e.uri, name: e.name, size });
    }
  }
  return out;
}

export async function pickFolder(): Promise<{ dir: Directory; files: ScannedFile[] } | null> {
  try {
    const dir = await Directory.pickDirectoryAsync();
    if (!dir) return null;
    return { dir, files: scanDirectory(dir) };
  } catch (e) {
    if (e instanceof Error && /cancel/i.test(e.message)) return null;
    throw e;
  }
}
