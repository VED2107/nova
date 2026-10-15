import { describe, expect, it } from "vitest";
import { folderName, formatBytes, pagesFor, timeLeft, visibleRange, watchedFraction } from "./view";

describe("virtual list math", () => {
  it("computes visible rows with overscan and clamps to total", () => {
    expect(visibleRange(0, 560, 56, 20_000, 6)).toEqual({ start: 0, end: 16 });
    expect(visibleRange(56 * 1000, 560, 56, 20_000, 6)).toEqual({ start: 994, end: 1016 });
    expect(visibleRange(56 * 19_995, 560, 56, 20_000, 6)).toEqual({ start: 19_989, end: 20_000 });
    expect(visibleRange(0, 560, 56, 0)).toEqual({ start: 0, end: 0 });
  });
  it("maps row ranges to pages", () => {
    expect(pagesFor(0, 16, 100)).toEqual([0]);
    expect(pagesFor(95, 110, 100)).toEqual([0, 1]);
    expect(pagesFor(5, 5, 100)).toEqual([]);
  });
});

describe("progress display", () => {
  const p = (positionMs: number, durationMs: number | null, completed = false) => ({ positionMs, durationMs, completed });
  it("fraction and time left", () => {
    expect(watchedFraction(null)).toBeNull();
    expect(watchedFraction(p(30_000, 120_000))).toBe(0.25);
    expect(watchedFraction(p(0, null))).toBeNull();
    expect(watchedFraction(p(0, 100, true))).toBe(1);
    expect(timeLeft(p(0, 23 * 60_000))).toBe("23 min left");
    expect(timeLeft(p(0, 65 * 60_000))).toBe("1 h 5 min left");
    expect(timeLeft(p(0, 120 * 60_000))).toBe("2 h left");
    expect(timeLeft(p(0, 0, true))).toBe("Finished");
  });
  it("folder names and sizes", () => {
    expect(folderName(String.raw`C:\Media\Shows\Café`)).toBe("Café");
    expect(folderName("/home/a/b/")).toBe("b");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(3.2 * 1024 ** 3)).toBe("3.2 GB");
  });
});
