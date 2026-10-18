import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

/**
 * Mobile preferences. Same idea as desktop (a closed set of allowed values,
 * anything else falls back to the default), but only settings that mean
 * something on a phone: no window, wheel or keymap options here.
 */
export interface Prefs {
  theme: "system" | "light" | "dark";
  /** Seconds per double-tap / skip button. */
  seekStep: "5" | "10" | "15" | "30";
  doubleTapSeek: "on" | "off";
  /** Vertical swipes on the picture: right = volume, left = brightness. */
  swipeGestures: "on" | "off";
  /** While dragging the timeline; release always lands accurately. */
  scrub: "auto" | "accurate" | "fast";
  haptics: "on" | "off";
  timeDisplay: "elapsed" | "remaining";
  resume: "on" | "off";
  /** First-run hint for double-tap seeking was dismissed. */
  gestureHintSeen: "yes" | "no";
}

const ALLOWED: { [K in keyof Prefs]: readonly Prefs[K][] } = {
  theme: ["system", "light", "dark"],
  seekStep: ["5", "10", "15", "30"],
  doubleTapSeek: ["on", "off"],
  swipeGestures: ["on", "off"],
  scrub: ["auto", "accurate", "fast"],
  haptics: ["on", "off"],
  timeDisplay: ["elapsed", "remaining"],
  resume: ["on", "off"],
  gestureHintSeen: ["yes", "no"],
};

export const DEFAULT_PREFS: Prefs = {
  theme: "system",
  seekStep: "10",
  doubleTapSeek: "on",
  swipeGestures: "on",
  scrub: "auto",
  haptics: "on",
  timeDisplay: "elapsed",
  resume: "on",
  gestureHintSeen: "no",
};

const KEY = "nova.prefs.v1";
let prefs: Prefs = DEFAULT_PREFS;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Keeps only known keys with allowed values (schema v1). */
export function sanitize(raw: unknown): Prefs {
  const out: Prefs = { ...DEFAULT_PREFS };
  if (!raw || typeof raw !== "object") return out;
  for (const k of Object.keys(ALLOWED) as (keyof Prefs)[]) {
    const v = (raw as Record<string, unknown>)[k];
    if ((ALLOWED[k] as readonly unknown[]).includes(v)) (out as unknown as Record<string, unknown>)[k] = v;
  }
  return out;
}

export async function loadPrefs(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    prefs = sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    prefs = DEFAULT_PREFS;
  }
  emit();
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  prefs = { ...prefs, [key]: value };
  emit();
  AsyncStorage.setItem(KEY, JSON.stringify(prefs)).catch(() => {});
}

export function getPrefs(): Prefs {
  return prefs;
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
