import { describe, expect, it } from "vitest";
import { SnapshotStore } from "./store";
import { formatTime, languageName, trackLabel } from "./format";
import { shortcutFor, type KeyInput } from "./shortcuts";
import { INITIAL_SNAPSHOT, type PlaybackSnapshot, type Track } from "./types";

const snap = (over: Partial<PlaybackSnapshot>): PlaybackSnapshot => ({ ...INITIAL_SNAPSHOT, ...over });
const key = (k: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  key: k, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...mods,
});

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

describe("shortcuts", () => {
  const playing = snap({ seq: 1, phase: "playing", volumePercent: 100 });
  it("toggles pause only with media", () => {
    expect(shortcutFor(key(" "), playing)).toEqual({ kind: "command", command: { type: "togglePause" } });
    expect(shortcutFor(key(" "), INITIAL_SNAPSHOT)).toBeNull();
  });
  it("seeks by 5s or 30s with shift", () => {
    expect(shortcutFor(key("ArrowLeft"), playing)).toEqual({ kind: "command", command: { type: "seekRelative", offsetMs: -5000 } });
    expect(shortcutFor(key("ArrowRight", { shiftKey: true }), playing)).toEqual({ kind: "command", command: { type: "seekRelative", offsetMs: 30000 } });
  });
  it("clamps volume to the contract range", () => {
    expect(shortcutFor(key("ArrowUp"), snap({ volumePercent: 128 }))).toEqual({ kind: "command", command: { type: "setVolume", percent: 130 } });
    expect(shortcutFor(key("ArrowDown"), snap({ volumePercent: 3 }))).toEqual({ kind: "command", command: { type: "setVolume", percent: 0 } });
  });
  it("maps fullscreen, open and ignores alt/meta", () => {
    expect(shortcutFor(key("f"), playing)).toEqual({ kind: "toggleFullscreen" });
    expect(shortcutFor(key("o", { ctrlKey: true }), playing)).toEqual({ kind: "openFile" });
    expect(shortcutFor(key("f", { altKey: true }), playing)).toBeNull();
    expect(shortcutFor(key("z"), playing)).toBeNull();
  });
});

describe("A–B loop cycling", () => {
  const at = (positionMs: number, aMs: number | null, bMs: number | null) =>
    snap({ seq: 1, phase: "playing", positionMs, abLoop: { aMs, bMs } });
  it("sets A, then B, then clears", () => {
    expect(shortcutFor(key("l"), at(1000, null, null))).toEqual({ kind: "command", command: { type: "setAbLoop", aMs: 1000, bMs: null } });
    expect(shortcutFor(key("l"), at(4000, 1000, null))).toEqual({ kind: "command", command: { type: "setAbLoop", aMs: 1000, bMs: 4000 } });
    expect(shortcutFor(key("l"), at(2000, 1000, 4000))).toEqual({ kind: "command", command: { type: "setAbLoop", aMs: null, bMs: null } });
  });
  it("restarts A when B would be before A", () => {
    expect(shortcutFor(key("l"), at(500, 1000, null))).toEqual({ kind: "command", command: { type: "setAbLoop", aMs: 500, bMs: null } });
  });
  it("needs media", () => {
    expect(shortcutFor(key("l"), INITIAL_SNAPSHOT)).toBeNull();
  });
});

describe("queue shortcuts", () => {
  it("maps Shift+N / Shift+P / media keys / Q", () => {
    expect(shortcutFor(key("N", { shiftKey: true }), INITIAL_SNAPSHOT)).toEqual({ kind: "queueNext" });
    expect(shortcutFor(key("P", { shiftKey: true }), INITIAL_SNAPSHOT)).toEqual({ kind: "queuePrevious" });
    expect(shortcutFor(key("MediaTrackNext"), INITIAL_SNAPSHOT)).toEqual({ kind: "queueNext" });
    expect(shortcutFor(key("q"), INITIAL_SNAPSHOT)).toEqual({ kind: "toggleQueue" });
  });
});

import { describeError } from "./errors";

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
