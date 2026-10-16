/**
 * Default key bindings, read from the desktop app's action registry
 * (apps/desktop/src/services/playback/actions.ts) at build time, so the
 * published list cannot drift from the app.
 */
import actionsSource from "../../../desktop/src/services/playback/actions.ts?raw";

export interface Shortcut {
  id: string;
  label: string;
  group: string;
  keys: string[];
}

export function parseActions(src: string): Shortcut[] {
  const block = src.slice(src.indexOf("export const ACTIONS"), src.indexOf("];", src.indexOf("export const ACTIONS")));
  const out: Shortcut[] = [];
  const re = /\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*group:\s*"([^"]+)",\s*keys:\s*\[([^\]]*)\]/g;
  for (const m of block.matchAll(re)) {
    const keys = [...m[4].matchAll(/"([^"]+)"/g)].map((k) => k[1]);
    out.push({ id: m[1], label: m[2], group: m[3], keys });
  }
  return out;
}

export const SHORTCUTS = parseActions(actionsSource as string);

/** Number of action entries in the registry (for the drift test). */
export const ACTION_COUNT = ((actionsSource as string).match(/^\s*\{ id: "/gm) ?? []).length;

const KEY_NAMES: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Space: "Space",
  Escape: "Esc",
  Backspace: "Backspace",
  MediaPlayPause: "Play/Pause media key",
  MediaStop: "Stop media key",
  MediaTrackNext: "Next track media key",
  MediaTrackPrevious: "Previous track media key",
};

/** "Ctrl+ArrowLeft" → ["Ctrl", "←"] */
export function keyParts(key: string): string[] {
  const parts = key === "+" ? ["+"] : key.split("+").filter(Boolean);
  return parts.map((p) => KEY_NAMES[p] ?? p);
}
