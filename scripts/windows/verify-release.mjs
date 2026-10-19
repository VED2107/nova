#!/usr/bin/env node
// Release gate for the NOVA Windows build. Run after `pnpm build` with the
// updater key set. Checks, and stages target/release/publish/ for upload:
//   - Authenticode: installer, app exe and libmpv are signed, timestamped, by SNOWBROS
//   - updater: the installer's minisign signature verifies against the public
//     key embedded in tauri.conf.json (the same check the installed app makes)
//   - latest.json points at this installer with this signature
//   - SHA256SUMS.txt matches the staged files (re-hashed after writing)
//   - licence files are present; an installed copy holds only allowlisted files
// Never uploads anything.
//
//   node scripts/windows/verify-release.mjs --notes "…" [--allow-unsigned] [--install-dir <dir>]
import { createHash, createPublicKey, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const allowUnsigned = process.argv.includes("--allow-unsigned");
const conf = JSON.parse(readFileSync(join(root, "apps/desktop/src-tauri/tauri.conf.json"), "utf8"));
const version = conf.version;
const nsis = join(root, "target/release/bundle/nsis");
const installer = join(nsis, `NOVA_${version}_x64-setup.exe`);
const out = join(root, "target/release/publish");
const failures = [];
const warnings = [];
const check = (ok, msg, soft = false) => {
  console.log(`${ok ? "PASS" : soft ? "WARN" : "FAIL"}  ${msg}`);
  if (!ok) (soft ? warnings : failures).push(msg);
};

// --- Authenticode -----------------------------------------------------------
function authenticode(file) {
  const ps = `$s = Get-AuthenticodeSignature -LiteralPath '${file.replace(/'/g, "''")}'; ` +
    `[pscustomobject]@{ status = $s.Status.ToString(); signer = $s.SignerCertificate.Subject; ts = [bool]$s.TimeStamperCertificate; company = (Get-Item -LiteralPath '${file.replace(/'/g, "''")}').VersionInfo.CompanyName } | ConvertTo-Json -Compress`;
  // pwsh 7 when present; Windows PowerShell 5 cannot load its modules under a pwsh 7 PSModulePath.
  const shell = ["pwsh.exe", "powershell.exe"].find((x) => { try { execFileSync(x, ["-NoProfile", "-Command", "1"]); return true; } catch { return false; } });
  const env = shell === "powershell.exe" ? { ...process.env, PSModulePath: "" } : process.env;
  return JSON.parse(execFileSync(shell, ["-NoProfile", "-Command", ps], { encoding: "utf8", env }));
}
function signed(file) {
  if (!existsSync(file)) return check(false, `${basename(file)} exists`);
  const s = authenticode(file);
  const ok = s.status === "Valid" && s.ts && /SNOWBROS/i.test(s.signer ?? "");
  check(ok, `${basename(file)} Authenticode: ${s.status}${s.signer ? `, ${s.signer}` : ""}${s.ts ? ", timestamped" : ", no timestamp"}`, allowUnsigned);
  return s;
}

// --- minisign (Tauri updater) ----------------------------------------------
const b64 = (s) => Buffer.from(s.trim(), "base64");
const lines = (buf) => buf.toString("utf8").split(/\r?\n/);
function minisignVerify(file, sigFile, pubkeyB64) {
  const pk = b64(lines(b64(pubkeyB64))[1]); // "Ed" | keyid(8) | key(32)
  const [, sigLine, trusted, globalLine] = lines(b64(readFileSync(sigFile, "utf8")));
  const sig = b64(sigLine); // "ED" (prehashed) | keyid(8) | sig(64)
  if (!sig.subarray(2, 10).equals(pk.subarray(2, 10))) return "signed with a different key";
  const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), pk.subarray(10)]), format: "der", type: "spki" });
  const alg = sig.subarray(0, 2).toString();
  const msg = alg === "ED" ? createHash("blake2b512").update(readFileSync(file)).digest() : readFileSync(file);
  if (!verify(null, msg, key, sig.subarray(10))) return "file signature does not verify";
  const comment = Buffer.from(trusted.replace(/^trusted comment: /, ""));
  if (!verify(null, Buffer.concat([sig.subarray(10), comment]), key, b64(globalLine))) return "trusted comment signature does not verify";
  return null;
}

console.log(`NOVA ${version} — Windows release gate\n`);
check(existsSync(installer), `installer ${basename(installer)} built`);
if (failures.length) process.exit(1);
const installerSig = signed(installer);
signed(join(root, "target/release/nova-desktop.exe"));
signed(join(root, "vendor/libmpv/libmpv-2.dll"));
check(/SNOWBROS/.test(installerSig.company ?? ""), `installer publisher (version info) is SNOWBROS: "${installerSig.company}"`);
check(conf.bundle.publisher === "SNOWBROS", `tauri.conf publisher is SNOWBROS`);

const sigPath = `${installer}.sig`;
check(existsSync(sigPath), "updater signature (.sig) built");
const sigErr = existsSync(sigPath) ? minisignVerify(installer, sigPath, conf.plugins.updater.pubkey) : "missing";
check(sigErr == null, `updater signature verifies against the embedded public key${sigErr ? `: ${sigErr}` : ""}`);

for (const f of ["THIRD-PARTY-NOTICES.md", "LICENSE-MIT", "LICENSE-APACHE", "LICENSES/GPL-2.0.txt", "LICENSES/LGPL-2.1.txt"])
  check(existsSync(join(root, f)), `licence file ${f} present`);

// --- installed copy audit ---------------------------------------------------
const installDir = arg("--install-dir");
if (installDir) {
  const allowed = /^(nova-desktop\.exe|libmpv-2\.dll|uninstall\.exe|licenses[\\/][^\\/]+)$/i;
  const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  const files = walk(installDir).map((f) => relative(installDir, f));
  const extra = files.filter((f) => !allowed.test(f));
  check(extra.length === 0, `installed files are allowlisted${extra.length ? `: unexpected ${extra.join(", ")}` : ` (${files.length} files)`}`);
  for (const f of files.filter((f) => /\.(exe|dll)$/i.test(f))) signed(join(installDir, f));
}

// --- stage, latest.json, checksums -----------------------------------------
const notes = arg("--notes");
mkdirSync(out, { recursive: true });
const staged = [installer, sigPath, join(root, "THIRD-PARTY-NOTICES.md")].filter(existsSync);
for (const f of staged) copyFileSync(f, join(out, basename(f)));
if (notes != null && existsSync(sigPath)) {
  const latest = {
    version,
    notes,
    pub_date: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    platforms: {
      "windows-x86_64": {
        signature: readFileSync(sigPath, "utf8").trim(),
        url: `https://github.com/VED2107/nova/releases/download/v${version}/${basename(installer)}`,
      },
    },
  };
  writeFileSync(join(out, "latest.json"), JSON.stringify(latest, null, 2) + "\n");
} else check(false, "latest.json written (pass --notes)", true);
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const names = readdirSync(out).filter((n) => n !== "SHA256SUMS.txt").sort();
writeFileSync(join(out, "SHA256SUMS.txt"), names.map((n) => `${sha(join(out, n))}  ${n}`).join("\n") + "\n");
const bad = readFileSync(join(out, "SHA256SUMS.txt"), "utf8").trim().split("\n").filter((l) => { const [h, n] = l.split(/\s+/); return sha(join(out, n)) !== h; });
check(bad.length === 0, `SHA256SUMS.txt matches ${names.length} staged files`);
if (existsSync(join(out, "latest.json"))) {
  const l = JSON.parse(readFileSync(join(out, "latest.json"), "utf8"));
  const p = l.platforms["windows-x86_64"];
  check(l.version === version && p.url.endsWith(`/v${version}/${basename(installer)}`) && p.signature === readFileSync(sigPath, "utf8").trim(), "latest.json references this installer and its signature");
}

console.log(`\n${failures.length} failed, ${warnings.length} warnings. Staged in ${relative(root, out)}`);
process.exit(failures.length ? 1 : 0);
