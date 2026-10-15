import { describe, expect, it } from "vitest";
import { conflicts, effectiveKeymap } from "../../services/playback/actions";
import { parseTimeInput } from "../../services/playback/time";
import { bind, resetAction, unbind } from "./keymapEdit";

describe("keymap editing", () => {
  it("adds a free key and stores only the override", () => {
    const r = bind({}, "volume.mute", "Ctrl+M", false);
    expect(r).toEqual({ ok: true, map: { "volume.mute": ["M", "Ctrl+M"] } });
  });

  it("refuses a key owned by another action unless moving it, and never duplicates", () => {
    const r = bind({}, "volume.mute", "Space", false);
    expect(r).toEqual({ ok: false, conflictWith: "play.toggle" });
    const moved = bind({}, "volume.mute", "Space", true);
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      const map = effectiveKeymap(moved.map);
      expect(map["volume.mute"]).toContain("Space");
      expect(map["play.toggle"]).not.toContain("Space");
      expect(conflicts(map).size).toBe(0);
    }
  });

  it("unbinds and resets explicitly", () => {
    const without = unbind({}, "volume.mute", "M");
    expect(without).toEqual({ "volume.mute": [] });
    expect(resetAction(without, "volume.mute")).toEqual({ ok: true, map: {} });
  });

  it("will not restore a default whose key has since been given away", () => {
    const moved = bind({}, "volume.mute", "Space", true);
    if (!moved.ok) throw new Error("setup");
    expect(resetAction(moved.map, "play.toggle")).toEqual({ ok: false, conflictWith: "volume.mute" });
  });
});

describe("go-to-time parsing", () => {
  it("accepts clock, seconds and unit forms", () => {
    expect(parseTimeInput("1:02:03")).toBe(3_723_000);
    expect(parseTimeInput("62:03")).toBe(3_723_000);
    expect(parseTimeInput("90.5")).toBe(90_500);
    expect(parseTimeInput("1h2m3s")).toBe(3_723_000);
    expect(parseTimeInput("45s")).toBe(45_000);
  });
  it("rejects malformed input", () => {
    expect(parseTimeInput("")).toBeNull();
    expect(parseTimeInput("1:75")).toBeNull();
    expect(parseTimeInput("abc")).toBeNull();
    expect(parseTimeInput("1:2:3:4")).toBeNull();
  });
});
