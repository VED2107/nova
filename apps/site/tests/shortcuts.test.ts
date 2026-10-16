import { describe, expect, it } from "vitest";
import { ACTION_COUNT, SHORTCUTS, keyParts } from "../src/data/shortcuts";

describe("shortcuts come from the desktop action registry", () => {
  it("parses every action", () => {
    expect(ACTION_COUNT).toBeGreaterThan(40);
    expect(SHORTCUTS).toHaveLength(ACTION_COUNT);
  });

  it("keeps known defaults", () => {
    const byId = new Map(SHORTCUTS.map((s) => [s.id, s]));
    expect(byId.get("play.toggle")?.keys).toContain("Space");
    expect(byId.get("view.help")?.keys).toEqual(["?", "F1"]);
  });

  it("formats chords", () => {
    expect(keyParts("Ctrl+ArrowLeft")).toEqual(["Ctrl", "←"]);
    expect(keyParts("+")).toEqual(["+"]);
    expect(keyParts("Ctrl+,")).toEqual(["Ctrl", ","]);
  });
});
