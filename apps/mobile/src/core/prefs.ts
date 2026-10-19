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
  /** Fade the player controls after a few seconds of playback (desktop: autoHide). */
  autoHide: "on" | "off";
  /** Keep playing with the screen off or in another app, with media controls in the notification. */
  background: "on" | "off";
  /** Look for a new release at start-up, or only when asked (Android app). */
  updates: "auto" | "manual";
  /** Desktop "Control bar": full deck, or one slim floating row (desktop: timelineLayout). */
  controlBar: "full" | "compact";
  /** Seconds before controls fade while playing. */
  hideDelay: "2" | "3" | "5" | "8";
  /** Screen orientation when the player opens. */
  orientation: "auto" | "landscape" | "portrait";
  /** How far a vertical swipe must travel for the full volume/brightness range. */
  swipeSensitivity: "low" | "normal" | "high";
  /** Prefer an audio track in the phone's language when the file has one. */
  audioLang: "file" | "device";
  /** Subtitles when a title opens: as the file says, off, or in the phone's language when the audio is not. */
  subtitlesStart: "file" | "off" | "device";
  /** Single tap on the picture (desktop: click). */
  tapAction: "controls" | "pause";
  /** Android: NOVA's libmpv engine (as on Windows) or the phone's Media3 player. */
  engine: "nova" | "system";
  /** libmpv engine: MediaCodec hardware decoding (desktop: hwdec). */
  hwdec: "auto" | "off";
  /** Subtitle size in percent, "50".."300" in steps of 10 (desktop: subScale). */
  subScale: string;
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
  autoHide: ["on", "off"],
  background: ["on", "off"],
  updates: ["auto", "manual"],
  controlBar: ["full", "compact"],
  hideDelay: ["2", "3", "5", "8"],
  orientation: ["auto", "landscape", "portrait"],
  swipeSensitivity: ["low", "normal", "high"],
  audioLang: ["file", "device"],
  subtitlesStart: ["file", "off", "device"],
  tapAction: ["controls", "pause"],
  engine: ["nova", "system"],
  hwdec: ["auto", "off"],
  subScale: Array.from({ length: 26 }, (_, i) => String(50 + i * 10)),
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
  autoHide: "on",
  background: "off",
  updates: "auto",
  controlBar: "full",
  hideDelay: "3",
  orientation: "auto",
  swipeSensitivity: "normal",
  audioLang: "file",
  subtitlesStart: "file",
  tapAction: "controls",
  engine: "nova",
  hwdec: "auto",
  subScale: "100",
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
