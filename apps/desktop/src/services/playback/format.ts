import type { Track } from "./types";

export function formatTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "--:--";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

const LANGUAGES: Record<string, string> = {
  eng: "English", en: "English", fra: "French", fre: "French", fr: "French",
  deu: "German", ger: "German", de: "German", spa: "Spanish", es: "Spanish",
  ita: "Italian", it: "Italian", jpn: "Japanese", ja: "Japanese", kor: "Korean",
  ko: "Korean", zho: "Chinese", chi: "Chinese", zh: "Chinese", hin: "Hindi",
  hi: "Hindi", por: "Portuguese", pt: "Portuguese", rus: "Russian", ru: "Russian",
};

export function languageName(code: string | null): string | null {
  if (!code) return null;
  return LANGUAGES[code.toLowerCase()] ?? code.toUpperCase();
}

/** Human label: "French 1320Hz · AAC 2ch" — title/language first, tech detail second. */
export function trackLabel(track: Track, ordinal: number): { primary: string; secondary: string } {
  const lang = languageName(track.language);
  const primary = track.title && track.title !== lang ? track.title : lang ?? `Track ${ordinal}`;
  const parts: string[] = [];
  if (lang && primary !== lang) parts.push(lang);
  if (track.codec) parts.push(track.codec.toUpperCase());
  if (track.channels) parts.push(track.channels === 1 ? "mono" : `${track.channels}ch`);
  if (track.isExternal) parts.push("external");
  if (track.isDefault) parts.push("default");
  return { primary, secondary: parts.join(" · ") };
}
