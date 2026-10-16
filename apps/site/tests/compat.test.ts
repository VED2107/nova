import { describe, expect, it } from "vitest";
import {
  ATLAS,
  CONTAINERS,
  DOC_ENTRIES,
  ENGINE,
  HARDWARE,
  PARTIAL,
  README,
  SOFTWARE,
  SUMMARY,
} from "../src/data/compat";

/** GitHub-style heading ids, as Astro generates them for the rendered README. */
const slug = (h: string) =>
  h
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
const readmeAnchors = new Set([...README.matchAll(/^#{2,4} (.+)$/gm)].map((m) => slug(m[1])));

describe("Atlas data matches the compatibility evidence", () => {
  it("has every harness sample, once, from both passes", () => {
    expect(SOFTWARE).toHaveLength(55);
    expect(HARDWARE).toHaveLength(55);
    expect(new Set(HARDWARE.map((r) => r.id))).toEqual(new Set(SOFTWARE.map((r) => r.id)));
    const sampleEntries = ATLAS.filter((e) => e.sample);
    expect(sampleEntries).toHaveLength(SOFTWARE.length);
  });

  it("matches the README's headline numbers", () => {
    expect(README).toContain(`**${SUMMARY.softwareMet} / ${SUMMARY.samples} samples met their expectation.**`);
    expect(SUMMARY.softwareMet).toBe(SUMMARY.hardwareMet);
    expect(README).toContain(`${SUMMARY.decoders} decoders and ${SUMMARY.demuxers} demuxers`);
    expect(README).toContain(ENGINE.mpv);
  });

  it("only marks a sample Verified when both passes met their expectation", () => {
    for (const e of ATLAS.filter((x) => x.sample && x.tier === "verified")) {
      expect(e.sample!.software.ok, e.id).toBe(true);
      expect(e.sample!.hardware.ok, e.id).toBe(true);
    }
  });

  it("keeps every transcribed README phrase", () => {
    for (const [id, p] of Object.entries(PARTIAL)) expect(README, id).toContain(p.phrase);
    for (const d of DOC_ENTRIES) expect(README, d.id).toContain(d.phrase);
  });

  it("names Partial samples that exist", () => {
    const ids = new Set(SOFTWARE.map((r) => r.id));
    for (const id of Object.keys(PARTIAL)) expect(ids.has(id), id).toBe(true);
  });

  it("only names decoders the engine audit lists", () => {
    for (const e of ATLAS) for (const d of e.decoders ?? []) expect(d.present, `${e.id}: ${d.name}`).toBe(true);
  });

  it("links every entry to a README section that exists", () => {
    for (const e of ATLAS) expect(readmeAnchors.has(e.source), `${e.id} → #${e.source}`).toBe(true);
  });

  it("never claims Verified for RAW, real camera files or projects", () => {
    for (const e of ATLAS.filter((x) => x.area === "Camera RAW" || x.area === "Project file"))
      expect(e.tier, e.id).not.toBe("verified");
    for (const e of ATLAS.filter((x) => /camera files|recordings/.test(x.name))) expect(e.tier, e.id).toBe("expected");
  });

  it("assigns unique ids and catalogue numbers", () => {
    expect(new Set(ATLAS.map((e) => e.id)).size).toBe(ATLAS.length);
    expect(ATLAS.map((e) => e.no)).toEqual(ATLAS.map((_, i) => String(i + 1).padStart(3, "0")));
  });

  it("explains containers with lower-case dotted extensions", () => {
    for (const k of Object.keys(CONTAINERS)) expect(k).toMatch(/^\.[a-z0-9]+$/);
  });
});
