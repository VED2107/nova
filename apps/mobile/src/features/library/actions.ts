import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { Platform } from "react-native";
import { addFiles, addFolder, getLibrary, playIds, type MediaItem } from "@/core/library";
import { pickFolder } from "@/core/media";

/** Opens the player on `item`, queueing `context` (the list it was chosen from) around it, as desktop does. */
export function play(item: MediaItem, context?: MediaItem[]) {
  const ids = context && context.some((c) => c.id === item.id) ? context.map((c) => c.id) : [item.id];
  playIds(ids, item.id);
  router.push({ pathname: "/player", params: { id: item.id } });
}

/** "Open file": one or more files from Files / the system picker; they play as a queue. */
export async function openFiles(): Promise<string | null> {
  try {
    const r = await DocumentPicker.getDocumentAsync({ type: ["video/*", "audio/*"], copyToCacheDirectory: true, multiple: true });
    if (r.canceled || !r.assets?.length) return null;
    const added = addFiles(r.assets.map((a) => ({ uri: a.uri, name: a.name, size: a.size, mime: a.mimeType })));
    if (added[0]) play(added[0], added);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "The file could not be opened.";
  }
}

/** "Add folder": indexes media in a folder the user picks (no broad storage permission). */
export async function openFolder(): Promise<{ added: number; error: string | null }> {
  try {
    const r = await pickFolder();
    if (!r) return { added: 0, error: null };
    const id = `dir:${r.dir.uri}`;
    const items = addFolder({ id, name: decodeURIComponent(r.dir.name || "Folder"), uri: r.dir.uri, sessionOnly: Platform.OS === "ios" }, r.files);
    if (items.length === 0) return { added: 0, error: "No video or audio files were found in that folder." };
    return { added: items.length, error: null };
  } catch (e) {
    return { added: 0, error: e instanceof Error ? e.message : "The folder could not be read." };
  }
}

/** Plays a saved playlist from its first available item. */
export function playPlaylist(playlistId: string) {
  const lib = getLibrary();
  const p = lib.playlists.find((x) => x.id === playlistId);
  if (!p || p.ids.length === 0) return;
  playIds(p.ids, p.ids[0]);
  router.push({ pathname: "/player", params: { id: p.ids[0]! } });
}
