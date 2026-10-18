import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { parseSha256, pickUpdate, type MobileUpdate, type Release } from "./version";

/**
 * In-app updates for the Android APK, the mobile twin of desktop's updater.
 *
 * - Asks GitHub's releases API for a newer `mobile-v*` release. Nothing about
 *   the user is sent beyond the request itself.
 * - Downloads the APK over HTTPS, checks it against the release's SHA-256,
 *   then hands it to Android's package installer. Android itself refuses an
 *   update that is not signed with NOVA's key, so a swapped file cannot
 *   replace the app even if the checksum were also swapped.
 * - Only in the installed app on Android. Expo Go and iOS cannot install
 *   APKs; iOS updates come through Expo Go (or a store) instead.
 */
export const RELEASES_API = "https://api.github.com/repos/VED2107/nova/releases?per_page=30";
export const RELEASES_PAGE = "https://github.com/VED2107/nova/releases";

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "none"; checkedAt: number }
  | { kind: "available"; update: MobileUpdate }
  | { kind: "downloading"; update: MobileUpdate; received: number; total: number | null }
  | { kind: "verifying"; update: MobileUpdate }
  | { kind: "installing"; update: MobileUpdate }
  | { kind: "error"; message: string; update: MobileUpdate | null };

/** Why this build cannot update itself, or null when it can. */
export function updatesUnsupported(): string | null {
  if (Platform.OS !== "android") return Platform.OS === "ios" ? "On iPhone, NOVA runs in Expo Go, which loads the newest version when you open it." : "Not available here.";
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return "Expo Go loads the newest version from your computer; in-app updates are for the installed NOVA app.";
  return null;
}

export const currentVersion = (): string => Constants.expoConfig?.version ?? "0.0.0";

let state: UpdateState = { kind: "idle" };
let dismissed: string | null = null;
const listeners = new Set<() => void>();
const set = (s: UpdateState) => {
  state = s;
  listeners.forEach((l) => l());
};

export function useUpdates(): UpdateState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

const busy = () => state.kind === "checking" || state.kind === "downloading" || state.kind === "verifying" || state.kind === "installing";

/** Looks for a newer release. `quiet` keeps failures out of sight (start-up check). */
export async function checkForUpdate(quiet = false): Promise<void> {
  if (busy() || updatesUnsupported()) return;
  set({ kind: "checking" });
  try {
    const res = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(res.status === 403 ? "GitHub is limiting requests right now. Try again in a while." : `GitHub answered ${res.status}.`);
    const u = pickUpdate((await res.json()) as Release[], currentVersion());
    set(u ? { kind: "available", update: u } : { kind: "none", checkedAt: Date.now() });
  } catch (e) {
    set(quiet ? { kind: "idle" } : { kind: "error", message: friendly(e), update: null });
  }
}

/** Downloads, verifies and opens the installer for the pending update. */
export async function installUpdate(): Promise<void> {
  if (state.kind !== "available" && !(state.kind === "error" && state.update)) return;
  const update = state.update!;
  set({ kind: "downloading", update, received: 0, total: update.apk.size || null });
  try {
    const dir = new Directory(Paths.cache, "updates");
    if (dir.exists) dir.delete();
    dir.create();
    const apk = await File.downloadFileAsync(update.apk.browser_download_url, new File(dir, update.apk.name), {
      onProgress: ({ bytesWritten, totalBytes }) => set({ kind: "downloading", update, received: bytesWritten, total: totalBytes > 0 ? totalBytes : update.apk.size || null }),
    });

    set({ kind: "verifying", update });
    if (update.sha256) {
      const res = await fetch(update.sha256.browser_download_url);
      const expected = parseSha256(await res.text());
      if (!expected) throw new Error("The release's checksum file could not be read, so the update was not installed.");
      const actual = toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await apk.bytes()));
      if (actual !== expected) {
        apk.delete();
        throw new Error("The download didn't match the release's checksum, so it was not installed.");
      }
    }

    set({ kind: "installing", update });
    // Android-only module: loaded here so iOS never imports it (it has no iOS implementation).
    const IntentLauncher = require("expo-intent-launcher") as typeof import("expo-intent-launcher");
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: apk.contentUri,
      type: "application/vnd.android.package-archive",
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    });
    // Back here: the installer was cancelled or the user allowed "unknown apps" and must tap again.
    set({ kind: "available", update });
  } catch (e) {
    set({ kind: "error", message: friendly(e), update });
  }
}

/** "Later": hide the notice for this version until the next start. */
export function dismissUpdate(version: string) {
  dismissed = version;
  set({ ...state });
}
export const isDismissed = (version: string) => dismissed === version;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function friendly(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e);
  if (/network|failed to fetch|dns|connect|timed? ?out|offline|unable to resolve/i.test(m)) return "Couldn't reach GitHub. Check the connection and try again.";
  return m;
}
