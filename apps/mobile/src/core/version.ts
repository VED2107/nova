/**
 * Release selection for the Android updater, kept pure so it can be tested
 * without a device. Mobile releases are GitHub releases tagged `mobile-vX.Y.Z`
 * carrying `NOVA-X.Y.Z-android.apk` and its `.sha256`.
 */
export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface Release {
  tag_name: string;
  name?: string | null;
  body?: string | null;
  draft?: boolean;
  published_at?: string | null;
  html_url?: string;
  assets: ReleaseAsset[];
}

export interface MobileUpdate {
  version: string;
  notes: string | null;
  date: string | null;
  page: string | null;
  apk: ReleaseAsset;
  sha256: ReleaseAsset | null;
}

/** "0.10.2" -> [0, 10, 2]; null when not plain X.Y.Z. */
export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** >0 when a is newer than b. Unparseable versions never count as newer. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return 0;
}

/** The newest mobile release newer than `current` that carries an Android APK, if any. */
export function pickUpdate(releases: Release[], current: string): MobileUpdate | null {
  let best: MobileUpdate | null = null;
  for (const r of releases) {
    if (r.draft || !r.tag_name.startsWith("mobile-v")) continue;
    const version = r.tag_name.slice("mobile-v".length);
    if (!parseVersion(version) || compareVersions(version, current) <= 0) continue;
    if (best && compareVersions(version, best.version) <= 0) continue;
    const apk = r.assets.find((a) => a.name === `NOVA-${version}-android.apk`);
    if (!apk) continue; // tagged, but the signed build is not attached yet
    const sha256 = r.assets.find((a) => a.name === `${apk.name}.sha256`) ?? null;
    best = { version, notes: r.body?.trim() || null, date: r.published_at ?? null, page: r.html_url ?? null, apk, sha256 };
  }
  return best;
}

/** First hex SHA-256 in a `sha256sum` line ("<hash>  <file>"). */
export function parseSha256(text: string): string | null {
  return /\b([0-9a-f]{64})\b/i.exec(text)?.[1]?.toLowerCase() ?? null;
}
