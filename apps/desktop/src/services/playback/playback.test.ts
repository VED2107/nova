import { describe, expect, it } from "vitest";
import { SnapshotStore } from "./store";
import { formatTime, languageName, trackLabel } from "./format";
import { describeError } from "./errors";
import { nextAbLoop } from "./shortcuts";
import { ACTIONS, actionForChord, chordOf, commandFor, conflicts, cycleTrack, effectiveKeymap, nextAspect, nextSpeed, parseKeymap } from "./actions";
import { INITIAL_SNAPSHOT, type PlaybackSnapshot, type Track } from "./types";

const snap = (over: Partial<PlaybackSnapshot>): PlaybackSnapshot => ({ ...INITIAL_SNAPSHOT, ...over });

describe("SnapshotStore", () => {
  it("drops snapshots older than the current one", () => {
    const store = new SnapshotStore();
    let notified = 0;
    store.subscribe(() => notified++);
    expect(store.push(snap({ seq: 5, phase: "playing" }))).toBe(true);
    expect(store.push(snap({ seq: 4, phase: "loading" }))).toBe(false);
    expect(store.push(snap({ seq: 5, phase: "paused" }))).toBe(false);
    expect(store.get().phase).toBe("playing");
    expect(store.push(snap({ seq: 6, phase: "paused" }))).toBe(true);
    expect(notified).toBe(2);
  });
});

describe("formatTime", () => {
  it("formats minutes and hours", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65_400)).toBe("1:05");
    expect(formatTime(3_725_000)).toBe("1:02:05");
  });
  it("handles unknown values", () => {
    expect(formatTime(null)).toBe("--:--");
    expect(formatTime(Number.NaN)).toBe("--:--");
    expect(formatTime(-1)).toBe("--:--");
  });
});

describe("track labels", () => {
  const base: Track = {
    id: "audio:1", kind: "audio", title: null, language: null, codec: null, isDefault: false,
    isExternal: false, isSelected: false, channels: null, width: null, height: null,
  };
  it("prefers title, then language, then ordinal", () => {
    expect(trackLabel({ ...base, title: "Commentary", language: "eng", codec: "aac", channels: 2 }, 1))
      .toEqual({ primary: "Commentary", secondary: "English · AAC · 2ch" });
    expect(trackLabel({ ...base, language: "fra" }, 2).primary).toBe("French");
    expect(trackLabel(base, 3).primary).toBe("Track 3");
  });
  it("falls back to the raw code for unknown languages", () => {
    expect(languageName("tlh")).toBe("TLH");
  });
});

const key = (k: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) => ({
  key: k, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods,
});

describe("key chords", () => {
  it("normalizes letters, named keys and shifted symbols", () => {
    expect(chordOf(key("n"))).toBe("N");
    expect(chordOf(key("N", { shiftKey: true }))).toBe("Shift+N");
    expect(chordOf(key("ArrowRight", { ctrlKey: true }))).toBe("Ctrl+ArrowRight");
    expect(chordOf(key("?", { shiftKey: true }))).toBe("?");
    expect(chordOf(key(" "))).toBe("Space");
    expect(chordOf(key("Shift", { shiftKey: true }))).toBeNull();
  });
});

describe("keymap", () => {
  it("has no conflicts in the defaults", () => {
    expect([...conflicts(effectiveKeymap({})).entries()]).toEqual([]);
  });
  it("detects conflicts introduced by overrides and resolves chords", () => {
    const map = effectiveKeymap({ "volume.mute": ["Space"] });
    expect(conflicts(map).get("Space")).toEqual(["play.toggle", "volume.mute"]);
    expect(actionForChord(effectiveKeymap({}), "Shift+S")).toBe("video.snapshot");
  });
  it("ignores unknown actions and malformed stored data", () => {
    expect(parseKeymap('{"nope":["A"],"volume.mute":["X"]}')).toEqual({ "volume.mute": ["X"] });
    expect(parseKeymap("not json")).toEqual({});
    expect(parseKeymap('{"volume.mute":"X"}')).toEqual({});
  });
  it("gives every action a label and a group", () => {
    for (const a of ACTIONS) expect(a.label.length).toBeGreaterThan(2);
  });
});

describe("action commands", () => {
  const playing = snap({ seq: 1, phase: "playing", volumePercent: 100, speed: 1 });
  it("maps seeks, speed, volume and delays", () => {
    expect(commandFor("seek.fwd.long", playing)).toEqual({ type: "seekRelative", offsetMs: 60000 });
    expect(commandFor("speed.up", playing)).toEqual({ type: "setSpeed", multiplier: 1.25 });
    expect(nextSpeed(4, 1)).toBe(4);
    expect(nextSpeed(0.25, -1)).toBe(0.25);
    expect(commandFor("volume.up", snap({ volumePercent: 128 }))).toEqual({ type: "setVolume", percent: 130 });
    expect(commandFor("subs.later", playing)).toEqual({ type: "setSubtitleDelay", ms: 50 });
    expect(commandFor("frame.prev", playing)).toEqual({ type: "frameStep", forward: false });
  });
  it("cycles aspect ratios, rotation and tracks", () => {
    expect(nextAspect(null)).toBe("16:9");
    expect(nextAspect("1.85:1")).toBeNull();
    expect(commandFor("video.rotate", snap({ adjust: { ...INITIAL_SNAPSHOT.adjust, rotation: 270 } }))).toEqual({ type: "setRotation", degrees: 0 });
    const t = (id: string, kind: "audio" | "subtitle", sel: boolean) => ({
      id, kind, title: null, language: null, codec: null, isDefault: false, isExternal: false, isSelected: sel, channels: null, width: null, height: null,
    });
    const s2 = snap({ tracks: [t("audio:1", "audio", true), t("audio:2", "audio", false), t("sub:1", "subtitle", true)] });
    expect(cycleTrack(s2, "audio")).toBe("audio:2");
    expect(cycleTrack(s2, "subtitle")).toBeNull();
    expect(cycleTrack(snap({ tracks: [] }), "audio")).toBeUndefined();
  });
});

describe("A–B loop cycling", () => {
  const at = (positionMs: number, aMs: number | null, bMs: number | null) =>
    snap({ seq: 1, phase: "playing", positionMs, abLoop: { aMs, bMs } });
  it("sets A, then B, then clears", () => {
    expect(nextAbLoop(at(1000, null, null))).toEqual({ type: "setAbLoop", aMs: 1000, bMs: null });
    expect(nextAbLoop(at(4000, 1000, null))).toEqual({ type: "setAbLoop", aMs: 1000, bMs: 4000 });
    expect(nextAbLoop(at(2000, 1000, 4000))).toEqual({ type: "setAbLoop", aMs: null, bMs: null });
  });
  it("restarts A when B would be before A", () => {
    expect(nextAbLoop(at(500, 1000, null))).toEqual({ type: "setAbLoop", aMs: 500, bMs: null });
  });
});

describe("error explanations", () => {
  it("explains editing projects and RAW with the engine's specific message", () => {
    const p = describeError({ kind: "editingProject", message: "This is a project file for Adobe Premiere Pro, not a video." });
    expect(p.title).toMatch(/editing project/);
    expect(p.detail).toContain("Premiere Pro");
    expect(p.steps.join(" ")).toMatch(/Export/);
    const r = describeError({ kind: "requiresExternalDecoder", message: "Blackmagic RAW can't be decoded…" });
    expect(r.title).toMatch(/RAW/);
    expect(r.detail).toContain("Blackmagic RAW");
  });
});
