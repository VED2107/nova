// Fails the build if the website output contains anything it must not ship:
// executables or installers, private paths, secrets, external requests, or
// internal links that do not resolve. Run after `astro build`.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The only installer links allowed are release records that bundle the LGPL engine (ADR 0003, option B)
// and carry a checksum and a notices page.
const releaseData = JSON.parse(readFileSync(new URL("../src/data/releases.json", import.meta.url), "utf8"));
const ALLOWED_DOWNLOADS = new Set();
for (const r of releaseData.releases) {
  if (!r.download) continue;
  const d = r.download;
  if (r.engine !== "lgpl" || !/^[0-9a-f]{64}$/i.test(d.sha256 ?? "") || !d.notices || !/^https:\/\//.test(d.url ?? "")) {
    console.error(`check-dist: release ${r.version} has a download that is not an LGPL build with sha256, notices and an https URL`);
    process.exit(1);
  }
  ALLOWED_DOWNLOADS.add(d.url);
}

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const problems = [];

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(dist);

const rel = (p) => path.relative(dist, p).split(path.sep).join("/");
const BANNED_EXT = /\.(exe|msi|msix|dll|7z|zip|nsis|appx|dmg|pkg|deb|rpm)$/i;
const TEXT_EXT = /\.(html|css|js|json|xml|txt|svg|webmanifest|map)$/i;
const PRIVATE = [
  /[A-Z]:\\Users\\/i,
  /\/Users\/[a-z]/i,
  /\\AppData\\Local\\Temp/i,
  /vedch/i,
  /C:\\PROJECTS/i,
];
const SECRETS = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bghp_[A-Za-z0-9]{30,}/, /\bsk-[A-Za-z0-9]{20,}/, /\bAKIA[0-9A-Z]{16}\b/];
// The site makes no third-party requests: no external scripts, styles, fonts or images.
const EXTERNAL_ASSET = /<(script|img|iframe|source|link)\b[^>]*\b(src|href)="https?:\/\//gi;

for (const f of files) {
  const r = rel(f);
  if (BANNED_EXT.test(r)) problems.push(`${r}: executable or installer file in the output`);
  if (statSync(f).size > 1_500_000) problems.push(`${r}: larger than 1.5 MB`);
  if (!TEXT_EXT.test(r)) continue;
  const text = readFileSync(f, "utf8");
  for (const re of PRIVATE) if (re.test(text)) problems.push(`${r}: private path matching ${re}`);
  for (const re of SECRETS) if (re.test(text)) problems.push(`${r}: possible secret matching ${re}`);
  if (!r.endsWith(".html")) continue;

  for (const m of text.matchAll(EXTERNAL_ASSET)) {
    // <link rel="canonical"> and og URLs are metadata, not requests.
    if (/rel="canonical"/.test(m[0])) continue;
    problems.push(`${r}: external request ${m[0].slice(0, 120)}`);
  }
  for (const m of text.matchAll(/href="([^"]*\.(?:exe|msi|msix|zip|7z))"/gi))
    if (!ALLOWED_DOWNLOADS.has(m[1])) problems.push(`${r}: link to an installer that is not an approved release: ${m[1]}`);
  if (!/<meta name="robots" content="noindex/.test(text)) problems.push(`${r}: missing noindex (preview)`);

  // Internal links and assets must resolve to a built file.
  for (const m of text.matchAll(/\s(?:href|src)="(\/[^"#?]*)(?:[#?][^"]*)?"/g)) {
    const target = decodeURIComponent(m[1]);
    const candidates = [target, `${target}/index.html`, `${target}.html`].map((t) => path.join(dist, t));
    if (!candidates.some((c) => existsSync(c) && statSync(c).isFile())) problems.push(`${r}: broken link ${target}`);
  }
  for (const m of text.matchAll(/\ssrcset="([^"]+)"/g)) {
    for (const part of m[1].split(",")) {
      const url = part.trim().split(/\s+/)[0];
      if (url.startsWith("/") && !existsSync(path.join(dist, url))) problems.push(`${r}: missing srcset image ${url}`);
    }
  }
  // In-page anchors must exist.
  const ids = new Set([...text.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of text.matchAll(/\shref="#([^"]+)"/g)) if (!ids.has(m[1])) problems.push(`${r}: missing anchor #${m[1]}`);
}

// Cross-page anchors (e.g. /docs/compatibility#partial).
for (const f of files.filter((p) => p.endsWith(".html"))) {
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(/\shref="(\/[^"#?]*)#([^"]+)"/g)) {
    const page = [path.join(dist, m[1], "index.html"), path.join(dist, `${m[1]}.html`), path.join(dist, m[1])].find(
      (c) => existsSync(c) && statSync(c).isFile(),
    );
    if (!page) continue;
    if (!readFileSync(page, "utf8").includes(`id="${m[2]}"`)) problems.push(`${rel(f)}: missing anchor ${m[1]}#${m[2]}`);
  }
}

const unique = [...new Set(problems)];
if (unique.length) {
  console.error(`check-dist: ${unique.length} problem(s)\n${unique.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`check-dist: ${files.length} files OK (no executables, private paths, secrets, external requests or broken links)`);
