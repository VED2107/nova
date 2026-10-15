/** Parses "1:02:03", "62:03", "3723", "90.5" or "1h2m3s" into milliseconds. */
export function parseTimeInput(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const hms = t.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/);
  if (hms && (hms[1] || hms[2] || hms[3])) {
    return Math.round((Number(hms[1] ?? 0) * 3600 + Number(hms[2] ?? 0) * 60 + Number(hms[3] ?? 0)) * 1000);
  }
  const parts = t.split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  if (parts.slice(1).some((p) => Number(p) >= 60)) return null;
  return Math.round(parts.reduce((acc, p) => acc * 60 + Number(p), 0) * 1000);
}
