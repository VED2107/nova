import assert from "node:assert/strict";
import { test } from "node:test";
import { compareVersions, parseSha256, pickUpdate, type Release } from "./version.ts";

const rel = (tag: string, assets: string[], extra: Partial<Release> = {}): Release => ({
  tag_name: tag,
  assets: assets.map((name) => ({ name, browser_download_url: `https://example.invalid/${name}`, size: 1 })),
  ...extra,
});

test("compares plain versions numerically", () => {
  assert.ok(compareVersions("0.10.0", "0.9.9") > 0);
  assert.ok(compareVersions("1.0.0", "1.0.0") === 0);
  assert.ok(compareVersions("0.1.0", "0.2.0") < 0);
  assert.equal(compareVersions("0.2.0-beta", "0.1.0"), 0, "unparseable never counts as newer");
});

test("picks the newest mobile release with an APK", () => {
  const u = pickUpdate(
    [
      rel("v0.3.0", ["NOVA_0.3.0_x64-setup.exe"]), // desktop release
      rel("mobile-v0.3.0", []), // tagged, APK not attached yet
      rel("mobile-v0.2.1", ["NOVA-0.2.1-android.apk", "NOVA-0.2.1-android.apk.sha256"], { body: " notes " }),
      rel("mobile-v0.2.0", ["NOVA-0.2.0-android.apk"]),
      rel("mobile-v0.9.0", ["NOVA-0.9.0-android.apk"], { draft: true }),
    ],
    "0.1.0",
  );
  assert.equal(u?.version, "0.2.1");
  assert.equal(u?.notes, "notes");
  assert.equal(u?.sha256?.name, "NOVA-0.2.1-android.apk.sha256");
});

test("nothing when current is newest", () => {
  assert.equal(pickUpdate([rel("mobile-v0.2.0", ["NOVA-0.2.0-android.apk"])], "0.2.0"), null);
});

test("reads sha256sum output", () => {
  const h = "D62D8028A34B3C2E5C4A606D3206ED771DFE8E7F4ABEB785137A640D98AAC15B";
  assert.equal(parseSha256(`${h}  NOVA-0.2.0-android.apk\n`), h.toLowerCase());
  assert.equal(parseSha256("nope"), null);
});
