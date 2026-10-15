import { ACTIONS, ACTION_BY_ID, effectiveKeymap, type Keymap } from "../../services/playback/actions";

/** Overrides only: drop actions whose bindings equal their defaults. */
export function minimize(map: Keymap): Keymap {
  const out: Keymap = {};
  for (const [id, chords] of Object.entries(map)) {
    const def = ACTION_BY_ID.get(id)?.keys ?? [];
    if (chords.length !== def.length || chords.some((c, i) => c !== def[i])) out[id] = chords;
  }
  return out;
}

/** Which other action already uses `chord` (null when free). */
export function ownerOf(overrides: Keymap, chord: string, except: string): string | null {
  const map = effectiveKeymap(overrides);
  for (const a of ACTIONS) if (a.id !== except && map[a.id]!.includes(chord)) return a.id;
  return null;
}

/**
 * Adds `chord` to `actionId`. If another action owns it, `replace` must be
 * true and the chord moves (never duplicated silently).
 */
export type EditResult = { ok: true; map: Keymap } | { ok: false; conflictWith: string };

export function bind(overrides: Keymap, actionId: string, chord: string, replace: boolean): EditResult {
  const owner = ownerOf(overrides, chord, actionId);
  if (owner && !replace) return { ok: false, conflictWith: owner };
  const map = effectiveKeymap(overrides);
  if (owner) map[owner] = map[owner]!.filter((c) => c !== chord);
  if (!map[actionId]!.includes(chord)) map[actionId] = [...map[actionId]!, chord].slice(-6);
  return { ok: true, map: minimize(map) };
}

export function unbind(overrides: Keymap, actionId: string, chord: string): Keymap {
  const map = effectiveKeymap(overrides);
  map[actionId] = map[actionId]!.filter((c) => c !== chord);
  return minimize(map);
}

export function resetAction(overrides: Keymap, actionId: string): EditResult {
  const def = ACTION_BY_ID.get(actionId)?.keys ?? [];
  for (const c of def) {
    const owner = ownerOf({ ...overrides, [actionId]: [] }, c, actionId);
    if (owner) return { ok: false, conflictWith: owner };
  }
  const next = { ...overrides };
  delete next[actionId];
  return { ok: true, map: next };
}
