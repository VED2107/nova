import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSyncExternalStore } from "react";

export interface Prefs {
  theme: "system" | "light" | "dark";
  controls: "comfortable" | "compact";
  timeDisplay: "elapsed" | "remaining";
  hwdec: "auto" | "off";
  resume: "on" | "off";
  autoHide: "on" | "off";
  wheel: "volume" | "seek" | "none";
  click: "pause" | "none";
  dblclick: "fullscreen" | "none";
  /** JSON: action id -> chords (overrides only). */
  keymap: string;
}

export const DEFAULT_PREFS: Prefs = {
  theme: "system",
  controls: "comfortable",
  timeDisplay: "elapsed",
  hwdec: "auto",
  resume: "on",
  autoHide: "on",
  wheel: "volume",
  click: "pause",
  dblclick: "fullscreen",
  keymap: "{}",
};

let prefs: Prefs = DEFAULT_PREFS;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const media = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

/** Resolved light/dark for the paper surfaces (the player is always dark). */
export function resolvedTheme(p: Prefs = prefs): "light" | "dark" {
  if (p.theme === "system") return media?.matches ? "dark" : "light";
  return p.theme;
}

function apply() {
  const t = resolvedTheme();
  document.documentElement.dataset.theme = t;
  // Keep the native title bar in the same lighting condition.
  getCurrentWindow().setTheme(prefs.theme === "system" ? null : t).catch(() => {});
}

media?.addEventListener?.("change", () => {
  apply();
  emit();
});

export async function loadPrefs(): Promise<void> {
  try {
    prefs = { ...DEFAULT_PREFS, ...(await invoke<Partial<Prefs>>("prefs_get")) };
  } catch {
    prefs = DEFAULT_PREFS; // database unavailable: defaults, nothing persisted
  }
  apply();
  emit();
}

export async function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): Promise<void> {
  const before = prefs;
  prefs = { ...prefs, [key]: value }; // optimistic for UI-only prefs; reverted on failure
  apply();
  emit();
  try {
    prefs = { ...DEFAULT_PREFS, ...(await invoke<Partial<Prefs>>("prefs_set", { key, value })) };
  } catch (e) {
    prefs = before;
    apply();
    emit();
    throw e;
  }
  emit();
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => prefs,
  );
}
