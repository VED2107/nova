/** Same format as desktop: m:ss, or h:mm:ss from one hour. */
export function formatTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "--:--";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Signed delta for seek feedback: "+0:12", "−1:05". */
export function formatDelta(ms: number): string {
  const sign = ms < 0 ? "−" : "+";
  return sign + formatTime(Math.abs(ms));
}

/** Timecode with frames for the precision readout while scrubbing: "0:12.08" (frames at fps). */
export function formatPrecise(ms: number, fps: number | null): string {
  if (!Number.isFinite(ms) || ms < 0) return "--:--";
  if (!fps || !(fps > 0)) {
    const tenths = Math.floor((ms % 1000) / 100);
    return `${formatTime(ms)}.${tenths}`;
  }
  const frame = Math.floor(((ms % 1000) / 1000) * fps + 1e-6);
  return `${formatTime(ms)}.${String(frame).padStart(2, "0")}`;
}

const LANGUAGES: Record<string, string> = {
  eng: "English", en: "English", fra: "French", fre: "French", fr: "French",
  deu: "German", ger: "German", de: "German", spa: "Spanish", es: "Spanish",
  ita: "Italian", it: "Italian", jpn: "Japanese", ja: "Japanese", kor: "Korean",
  ko: "Korean", hin: "Hindi", hi: "Hindi", por: "Portuguese", pt: "Portuguese",
};

export function languageName(code: string | null | undefined): string | null {
  if (!code) return null;
  return LANGUAGES[code.toLowerCase()] ?? code.toUpperCase();
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}
