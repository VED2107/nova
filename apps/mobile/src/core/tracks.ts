import type { Track } from "../playback/types.ts";
import { languageName } from "./time.ts";

/** "en", "eng" and "en-GB" are one language; unknown codes match only themselves. */
export function sameLanguage(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (x: string | null | undefined) => languageName(x?.split(/[-_]/)[0]);
  return n(a) != null && n(a) === n(b);
}

/**
 * Tracks to select when a title opens (desktop: mpv's alang/slang).
 * `undefined` leaves the file's own choice alone; `null` turns subtitles off.
 */
export function startTracks(tracks: Track[], prefs: { audioLang: "file" | "device"; subtitlesStart: "off" | "device" | "file" }, locale: string): { audio?: string; subtitle?: string | null } {
  const audio = tracks.filter((t) => t.kind === "audio");
  const subs = tracks.filter((t) => t.kind === "subtitle");
  const out: { audio?: string; subtitle?: string | null } = {};
  const mine = prefs.audioLang === "device" ? audio.find((t) => sameLanguage(t.language, locale)) : undefined;
  if (mine && !mine.isSelected) out.audio = mine.id;
  if (prefs.subtitlesStart === "off" && subs.some((t) => t.isSelected)) out.subtitle = null;
  if (prefs.subtitlesStart === "device") {
    // Subtitles in your language, unless the audio already is.
    const spoken = (mine ?? audio.find((t) => t.isSelected))?.language;
    const sub = sameLanguage(spoken, locale) ? undefined : subs.find((t) => sameLanguage(t.language, locale));
    if (sub && !sub.isSelected) out.subtitle = sub.id;
  }
  return out;
}
