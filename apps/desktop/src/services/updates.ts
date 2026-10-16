import { useSyncExternalStore } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

/**
 * In-app updates from NOVA's GitHub releases. The updater downloads only a
 * release signed with NOVA's key (the public key is built into the app) and
 * runs the installer; nothing about the user is sent beyond the request.
 */
export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "none"; checkedAt: number }
  | { kind: "available"; version: string; notes: string | null; date: string | null }
  | { kind: "downloading"; version: string; received: number; total: number | null }
  | { kind: "installing"; version: string }
  | { kind: "error"; message: string };

let state: UpdateState = { kind: "idle" };
let pending: Update | null = null;
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

/** Asks GitHub for a newer signed release. `quiet` keeps failures out of sight (start-up check). */
export async function checkForUpdate(quiet = false): Promise<void> {
  if (state.kind === "checking" || state.kind === "downloading" || state.kind === "installing") return;
  set({ kind: "checking" });
  try {
    const u = await check();
    pending = u;
    if (u) set({ kind: "available", version: u.version, notes: u.body?.trim() || null, date: u.date ?? null });
    else set({ kind: "none", checkedAt: Date.now() });
  } catch (e) {
    // No release manifest published (yet) means there is nothing newer to install.
    if (/valid release json|404|not found/i.test(String((e as { message?: string })?.message ?? e))) set({ kind: "none", checkedAt: Date.now() });
    else set(quiet ? { kind: "idle" } : { kind: "error", message: friendly(e) });
  }
}

/** Downloads, verifies and installs the pending update, then restarts NOVA. */
export async function installUpdate(): Promise<void> {
  const u = pending;
  if (!u) return;
  let received = 0;
  let total: number | null = null;
  set({ kind: "downloading", version: u.version, received, total });
  try {
    await u.downloadAndInstall((ev) => {
      if (ev.event === "Started") total = ev.data.contentLength ?? null;
      else if (ev.event === "Progress") received += ev.data.chunkLength;
      else if (ev.event === "Finished") {
        set({ kind: "installing", version: u.version });
        return;
      }
      set({ kind: "downloading", version: u.version, received, total });
    });
    await relaunch();
  } catch (e) {
    set({ kind: "error", message: friendly(e) });
  }
}

/** "Later": hide the notice for this version until the next start. */
export function dismissUpdate(version: string) {
  dismissed = version;
  set({ ...state });
}
export const isDismissed = (version: string) => dismissed === version;

function friendly(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e);
  if (/network|dns|connect|timed? ?out|offline/i.test(m)) return "Couldn't reach GitHub. Check the connection and try again.";
  if (/signature/i.test(m)) return "The download didn't match NOVA's signature, so it was not installed.";
  return m;
}
