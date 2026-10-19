import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as Sharing from "expo-sharing";
import type { VideoPlayer } from "expo-video";
import { Platform } from "react-native";

/**
 * "Save frame", desktop's snapshot. The frame is decoded at the exact
 * position (expo-video asks for the closest frame, not the keyframe) at full
 * size and saved as PNG.
 *
 * Android: into a folder the user picks once (Pictures, say), kept like a
 * library folder. No storage permission is involved. iOS: folder access
 * lasts one session, so the share sheet offers "Save Image" instead.
 */
const DIR_KEY = "nova.frames.dir";

export function frameName(title: string, positionMs: number): string {
  const t = Math.max(0, Math.round(positionMs));
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  const ms = t % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  const safe = title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || "NOVA";
  return `${safe} ${p(h)}-${p(m)}-${p(s)}.${p(ms, 3)}`;
}

async function frameFolder(ask: boolean): Promise<Directory | null> {
  const saved = await AsyncStorage.getItem(DIR_KEY).catch(() => null);
  if (saved) {
    try {
      const d = new Directory(saved);
      if (d.exists) return d;
    } catch {
      /* folder gone or access revoked: ask again */
    }
  }
  if (!ask) return null;
  const d = await Directory.pickDirectoryAsync();
  if (!d) return null;
  await AsyncStorage.setItem(DIR_KEY, d.uri).catch(() => {});
  return d;
}

/** Forget the chosen folder (Settings). */
export async function resetFrameFolder(): Promise<void> {
  await AsyncStorage.removeItem(DIR_KEY).catch(() => {});
}

/** System engine: decode the exact frame at full size as a PNG; returns its URI. */
export async function systemFrame(player: VideoPlayer, positionMs: number): Promise<string> {
  const [thumb] = await player.generateThumbnailsAsync([positionMs / 1000]);
  if (!thumb) throw new Error("This frame could not be decoded");
  const image = await ImageManipulator.manipulate(thumb).renderAsync();
  return (await image.saveAsync({ format: SaveFormat.PNG })).uri;
}

/** Saves a PNG from `grab` (the engine's frame); returns a short message for the player's notice. */
export async function saveFrame(grab: () => Promise<string>, positionMs: number, title: string): Promise<string> {
  const png = { uri: await grab() };
  const name = `${frameName(title, positionMs)}.png`;

  if (Platform.OS === "android") {
    let dir: Directory | null = null;
    try {
      dir = await frameFolder(true);
    } catch (e) {
      if (!(e instanceof Error && /cancel/i.test(e.message))) throw e;
    }
    if (!dir) return "Not saved: no folder chosen";
    const out = dir.createFile(name, "image/png");
    out.write(await new File(png.uri).bytes());
    return `Saved to ${decodeURIComponent(dir.name || "the frames folder")}`;
  }
  if (!(await Sharing.isAvailableAsync())) return "Saving is not available here";
  await Sharing.shareAsync(png.uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: name });
  return "Frame ready";
}
