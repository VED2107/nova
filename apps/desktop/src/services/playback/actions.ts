import type { PlaybackCommand, PlaybackSnapshot } from "./types";
import { ASPECT_RATIOS, MAX_VOLUME, SUBTITLE_SCALE_RANGE } from "./types";

/**
 * Every player action, with VLC-parity defaults. Key bindings are data: the
 * shortcut help, the keymap editor and the context menu all read from here,
 * and user overrides (prefs.keymap) replace defaults per action.
 */
export type ActionGroup = "Playback" | "Navigation" | "Audio" | "Subtitles" | "Video" | "Queue" | "View";

export interface ActionDef {
  id: string;
  label: string;
  group: ActionGroup;
  keys: string[];
  /** Needs loaded media to do anything. */
  media?: boolean;
}

export const ACTIONS: ActionDef[] = [
  { id: "play.toggle", label: "Play / pause", group: "Playback", keys: ["Space", "MediaPlayPause"], media: true },
  { id: "play.stop", label: "Stop", group: "Playback", keys: ["S", "MediaStop"], media: true },
  { id: "speed.up", label: "Faster", group: "Playback", keys: ["]", "+"], media: true },
  { id: "speed.down", label: "Slower", group: "Playback", keys: ["[", "-"], media: true },
  { id: "speed.normal", label: "Normal speed", group: "Playback", keys: ["="], media: true },
  { id: "loop.ab", label: "A–B loop (set A, set B, clear)", group: "Playback", keys: ["L"], media: true },
  { id: "repeat.cycle", label: "Repeat: off / one / all", group: "Playback", keys: ["Shift+L"] },
  { id: "frame.next", label: "Next frame", group: "Navigation", keys: ["E", "."], media: true },
  { id: "frame.prev", label: "Previous frame", group: "Navigation", keys: [","], media: true },
  { id: "seek.back.short", label: "Back 5 seconds", group: "Navigation", keys: ["ArrowLeft"], media: true },
  { id: "seek.fwd.short", label: "Forward 5 seconds", group: "Navigation", keys: ["ArrowRight"], media: true },
  { id: "seek.back.medium", label: "Back 30 seconds", group: "Navigation", keys: ["Shift+ArrowLeft"], media: true },
  { id: "seek.fwd.medium", label: "Forward 30 seconds", group: "Navigation", keys: ["Shift+ArrowRight"], media: true },
  { id: "seek.back.long", label: "Back 1 minute", group: "Navigation", keys: ["Ctrl+ArrowLeft"], media: true },
  { id: "seek.fwd.long", label: "Forward 1 minute", group: "Navigation", keys: ["Ctrl+ArrowRight"], media: true },
  { id: "seek.back.tiny", label: "Back 1 second", group: "Navigation", keys: ["Alt+ArrowLeft"], media: true },
  { id: "seek.fwd.tiny", label: "Forward 1 second", group: "Navigation", keys: ["Alt+ArrowRight"], media: true },
  { id: "seek.start", label: "Go to start", group: "Navigation", keys: ["Home"], media: true },
  { id: "seek.goto", label: "Go to time…", group: "Navigation", keys: ["Ctrl+T"], media: true },
  { id: "chapter.next", label: "Next chapter", group: "Navigation", keys: ["Shift+N"], media: true },
  { id: "chapter.prev", label: "Previous chapter", group: "Navigation", keys: ["Shift+P"], media: true },
  { id: "time.toggle", label: "Elapsed / remaining time", group: "Navigation", keys: ["T"] },
  { id: "volume.up", label: "Volume up", group: "Audio", keys: ["ArrowUp", "Ctrl+ArrowUp"] },
  { id: "volume.down", label: "Volume down", group: "Audio", keys: ["ArrowDown", "Ctrl+ArrowDown"] },
  { id: "volume.mute", label: "Mute", group: "Audio", keys: ["M"] },
  { id: "audio.cycle", label: "Next audio track", group: "Audio", keys: ["B"], media: true },
  { id: "audio.earlier", label: "Audio earlier (−50 ms)", group: "Audio", keys: ["J"], media: true },
  { id: "audio.later", label: "Audio later (+50 ms)", group: "Audio", keys: ["K"], media: true },
  { id: "audio.reset", label: "Reset audio delay", group: "Audio", keys: ["Shift+K"], media: true },
  { id: "subs.cycle", label: "Next subtitle (or off)", group: "Subtitles", keys: ["V"], media: true },
  { id: "subs.earlier", label: "Subtitles earlier (−50 ms)", group: "Subtitles", keys: ["G"], media: true },
  { id: "subs.later", label: "Subtitles later (+50 ms)", group: "Subtitles", keys: ["H"], media: true },
  { id: "subs.reset", label: "Reset subtitle delay", group: "Subtitles", keys: ["Shift+H"], media: true },
  { id: "subs.add", label: "Add subtitle file…", group: "Subtitles", keys: ["Shift+V"], media: true },
  { id: "subs.bigger", label: "Larger subtitles", group: "Subtitles", keys: ["Alt+ArrowUp"] },
  { id: "subs.smaller", label: "Smaller subtitles", group: "Subtitles", keys: ["Alt+ArrowDown"] },
  { id: "subs.sizeReset", label: "Subtitles at authored size", group: "Subtitles", keys: ["Alt+0"] },
  { id: "view.fullscreen", label: "Fullscreen", group: "Video", keys: ["F", "F11"] },
  { id: "view.exitFullscreen", label: "Exit fullscreen", group: "Video", keys: ["Escape"] },
  { id: "video.aspect", label: "Next aspect ratio", group: "Video", keys: ["A"], media: true },
  { id: "video.rotate", label: "Rotate 90°", group: "Video", keys: ["Shift+R"], media: true },
  { id: "video.deinterlace", label: "Deinterlace", group: "Video", keys: ["D"], media: true },
  { id: "video.snapshot", label: "Save frame to Pictures", group: "Video", keys: ["Shift+S"], media: true },
  { id: "queue.next", label: "Next in queue", group: "Queue", keys: ["N", "MediaTrackNext"] },
  { id: "queue.prev", label: "Previous in queue", group: "Queue", keys: ["P", "MediaTrackPrevious"] },
  { id: "queue.shuffle", label: "Shuffle upcoming", group: "Queue", keys: ["R"] },
  { id: "view.queue", label: "Show queue", group: "View", keys: ["Q"] },
  { id: "view.inspector", label: "Show playback details", group: "View", keys: ["I"] },
  { id: "view.immersive", label: "Immersive mode", group: "View", keys: ["Z"] },
  { id: "view.library", label: "Back to library", group: "View", keys: ["Backspace"] },
  { id: "file.open", label: "Open file…", group: "View", keys: ["O", "Ctrl+O"] },
  { id: "view.settings", label: "Settings", group: "View", keys: ["Ctrl+,"] },
  { id: "view.help", label: "Keyboard shortcuts", group: "View", keys: ["?", "F1"] },
];

export const ACTION_BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph", "CapsLock", "OS"]);

/**
 * Canonical chord: "Ctrl+Alt+Shift+Key". Letters are uppercase; Shift is only
 * part of the chord for letters and named keys (for "?" or "+" the produced
 * character already encodes it, so layouts work as typed).
 */
export function chordOf(e: KeyLike): string | null {
  if (MODIFIER_KEYS.has(e.key) || e.key === "Dead" || e.key === "Unidentified") return null;
  let key = e.key === " " ? "Space" : e.key;
  const isChar = key.length === 1;
  const isLetter = isChar && /\p{L}/u.test(key);
  if (isLetter) key = key.toUpperCase();
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.metaKey) parts.push("Meta");
  if (e.shiftKey && (!isChar || isLetter)) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

/** Pretty label for a chord: "Ctrl+→". */
export function chordLabel(chord: string): string {
  const names: Record<string, string> = {
    ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Space: "Space", Escape: "Esc",
    MediaPlayPause: "Media Play", MediaStop: "Media Stop", MediaTrackNext: "Media Next", MediaTrackPrevious: "Media Prev",
    Backspace: "⌫",
  };
  return chord.split("+").map((p, i, a) => (i === a.length - 1 ? names[p] ?? p : p)).join("+").replace("++", "+Plus");
}

export type Keymap = Record<string, string[]>;

/** Effective bindings: user overrides replace an action's defaults entirely. */
export function effectiveKeymap(overrides: Keymap): Keymap {
  const out: Keymap = {};
  for (const a of ACTIONS) out[a.id] = overrides[a.id] ?? a.keys;
  return out;
}

/** Chord -> action ids that claim it (more than one = conflict). */
export function conflicts(map: Keymap): Map<string, string[]> {
  const by = new Map<string, string[]>();
  for (const [id, chords] of Object.entries(map)) {
    for (const c of chords) by.set(c, [...(by.get(c) ?? []), id]);
  }
  for (const [c, ids] of by) if (ids.length < 2) by.delete(c);
  return by;
}

export function actionForChord(map: Keymap, chord: string): string | null {
  for (const [id, chords] of Object.entries(map)) if (chords.includes(chord)) return id;
  return null;
}

export function parseKeymap(json: string | undefined): Keymap {
  try {
    const v = JSON.parse(json ?? "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Keymap = {};
    for (const [k, list] of Object.entries(v)) {
      if (ACTION_BY_ID.has(k) && Array.isArray(list) && list.every((x) => typeof x === "string")) out[k] = list as string[];
    }
    return out;
  } catch {
    return {};
  }
}

/* ---------------- Pure helpers used by the dispatcher (tested) ---------------- */

export const SEEK_STEPS: Record<string, number> = {
  "seek.back.tiny": -1_000, "seek.fwd.tiny": 1_000,
  "seek.back.short": -5_000, "seek.fwd.short": 5_000,
  "seek.back.medium": -30_000, "seek.fwd.medium": 30_000,
  "seek.back.long": -60_000, "seek.fwd.long": 60_000,
};

export const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

export function nextSpeed(current: number, dir: 1 | -1): number {
  if (dir > 0) return SPEED_STEPS.find((s) => s > current + 1e-6) ?? SPEED_STEPS[SPEED_STEPS.length - 1]!;
  return [...SPEED_STEPS].reverse().find((s) => s < current - 1e-6) ?? SPEED_STEPS[0]!;
}

/** Next track id in cycle order; subtitles include "off" (null) after the last. */
export function cycleTrack(s: PlaybackSnapshot, kind: "audio" | "subtitle"): string | null | undefined {
  const tracks = s.tracks.filter((t) => t.kind === kind);
  if (tracks.length === 0) return undefined;
  const i = tracks.findIndex((t) => t.isSelected);
  if (kind === "subtitle") {
    if (i === -1) return tracks[0]!.id;
    return i === tracks.length - 1 ? null : tracks[i + 1]!.id;
  }
  return tracks[(i + 1) % tracks.length]!.id;
}

export const SUB_SCALE_STEP = 10;

/** Next subtitle size in steps of 10%, clamped to the engine's range. */
export function nextSubScale(current: number, dir: 1 | -1): number {
  const snapped = Math.round(current / SUB_SCALE_STEP) * SUB_SCALE_STEP;
  return Math.min(SUBTITLE_SCALE_RANGE[1], Math.max(SUBTITLE_SCALE_RANGE[0], snapped + dir * SUB_SCALE_STEP));
}

/** Start of the chapter after (dir 1) or before (dir -1) `positionMs`. Going back
 *  from more than 3 s into a chapter restarts it, like most players. */
export function chapterTarget(chapters: { timeMs: number }[], positionMs: number, dir: 1 | -1): number | null {
  if (chapters.length === 0) return null;
  if (dir > 0) return chapters.find((c) => c.timeMs > positionMs + 500)?.timeMs ?? null;
  const current = [...chapters].reverse().find((c) => c.timeMs <= positionMs + 500);
  if (current && positionMs - current.timeMs > 3_000) return current.timeMs;
  const before = [...chapters].reverse().find((c) => c.timeMs < (current?.timeMs ?? positionMs) - 1);
  return before?.timeMs ?? 0;
}

export function nextAspect(current: string | null): string | null {
  const order: (string | null)[] = [null, ...ASPECT_RATIOS];
  return order[(order.indexOf(current) + 1) % order.length] ?? null;
}

/** Commands for engine-only actions (UI actions are handled by the view). */
export function commandFor(id: string, s: PlaybackSnapshot): PlaybackCommand | null {
  if (id in SEEK_STEPS) return { type: "seekRelative", offsetMs: SEEK_STEPS[id]! };
  const a = s.adjust;
  switch (id) {
    case "play.toggle": return { type: "togglePause" };
    case "play.stop": return { type: "stop" };
    case "speed.up": return { type: "setSpeed", multiplier: nextSpeed(s.speed, 1) };
    case "speed.down": return { type: "setSpeed", multiplier: nextSpeed(s.speed, -1) };
    case "speed.normal": return { type: "setSpeed", multiplier: 1 };
    case "frame.next": return { type: "frameStep", forward: true };
    case "frame.prev": return { type: "frameStep", forward: false };
    case "seek.start": return { type: "seek", positionMs: 0, exact: true };
    case "volume.up": return { type: "setVolume", percent: Math.min(MAX_VOLUME, s.volumePercent + 5) };
    case "volume.down": return { type: "setVolume", percent: Math.max(0, s.volumePercent - 5) };
    case "volume.mute": return { type: "setMuted", muted: !s.isMuted };
    case "audio.earlier": return { type: "setAudioDelay", ms: a.audioDelayMs - 50 };
    case "audio.later": return { type: "setAudioDelay", ms: a.audioDelayMs + 50 };
    case "audio.reset": return { type: "setAudioDelay", ms: 0 };
    case "subs.earlier": return { type: "setSubtitleDelay", ms: a.subtitleDelayMs - 50 };
    case "subs.later": return { type: "setSubtitleDelay", ms: a.subtitleDelayMs + 50 };
    case "subs.reset": return { type: "setSubtitleDelay", ms: 0 };
    case "subs.bigger": return { type: "setSubtitleScale", percent: nextSubScale(a.subtitleScalePercent, 1) };
    case "subs.smaller": return { type: "setSubtitleScale", percent: nextSubScale(a.subtitleScalePercent, -1) };
    case "subs.sizeReset": return { type: "setSubtitleScale", percent: 100 };
    case "chapter.next":
    case "chapter.prev": {
      const t = chapterTarget(s.chapters, s.positionMs, id === "chapter.next" ? 1 : -1);
      return t == null ? null : { type: "seek", positionMs: t, exact: true };
    }
    case "video.aspect": return { type: "setAspectRatio", ratio: nextAspect(a.aspectRatio) };
    case "video.rotate": return { type: "setRotation", degrees: (a.rotation + 90) % 360 };
    case "video.deinterlace": return { type: "setDeinterlace", enabled: !a.deinterlace };
    case "audio.cycle": {
      const t = cycleTrack(s, "audio");
      return t === undefined ? null : { type: "selectAudioTrack", trackId: t };
    }
    case "subs.cycle": {
      const t = cycleTrack(s, "subtitle");
      return t === undefined ? null : { type: "selectSubtitleTrack", trackId: t };
    }
    default:
      return null;
  }
}
