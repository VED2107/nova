import { describe, expect, it } from "vitest";
import { keyStepMs, msToPct, pointerToMs, SCRUB_ACCURATE_BUDGET_MS, ScrubSession, scrubMode, SEEK_START_TIMEOUT_MS, seekTarget, type SeekRequest } from "./seek";
import { nearestPreview, previewKey } from "../../features/player/Timeline";

const TWO_HOURS = 7_200_000;

describe("pointer mapping", () => {
  it("maps the full track width edge to edge", () => {
    expect(pointerToMs(100, 100, 700, TWO_HOURS)).toBe(0);
    expect(pointerToMs(800, 100, 700, TWO_HOURS)).toBe(TWO_HOURS);
    expect(pointerToMs(450, 100, 700, TWO_HOURS)).toBe(TWO_HOURS / 2);
  });

  it("agrees with the hover time near the edges (the old range input was off by up to 61.7 s here)", () => {
    // 6 px into a 700 px track over 2 h is 61.7 s, not 0.
    expect(pointerToMs(106, 100, 700, TWO_HOURS)).toBeCloseTo(61_714.3, 0);
    expect(pointerToMs(794, 100, 700, TWO_HOURS)).toBeCloseTo(TWO_HOURS - 61_714.3, 0);
  });

  it("clamps outside the track and survives degenerate input", () => {
    expect(pointerToMs(0, 100, 700, TWO_HOURS)).toBe(0);
    expect(pointerToMs(5000, 100, 700, TWO_HOURS)).toBe(TWO_HOURS);
    expect(pointerToMs(300, 100, 0, TWO_HOURS)).toBe(0);
    expect(pointerToMs(300, 100, 700, 0)).toBe(0);
    expect(pointerToMs(300, 100, 700, NaN)).toBe(0);
  });

  it("round-trips with msToPct without drift", () => {
    for (const ms of [0, 1, 41.708, 1_234_567.25, TWO_HOURS]) {
      const x = 100 + (msToPct(ms, TWO_HOURS) / 100) * 700;
      expect(pointerToMs(x, 100, 700, TWO_HOURS)).toBeCloseTo(ms, 6);
    }
  });

  it("resolves sub-frame positions on short media (no 100 ms step)", () => {
    const ms = pointerToMs(100 + 1, 100, 700, 10_000);
    expect(seekTarget(ms, 10_000)).toBe(14);
  });
});

describe("seekTarget", () => {
  it("rounds once and clamps to the media", () => {
    expect(seekTarget(1234.5, 10_000)).toBe(1235);
    expect(seekTarget(-5, 10_000)).toBe(0);
    expect(seekTarget(10_400, 10_000)).toBe(10_000);
    expect(seekTarget(3_000, null)).toBe(3_000);
  });

  it("does not accumulate rounding error over many small moves", () => {
    let ms = 0;
    for (let i = 0; i < 10_000; i++) ms += 41.708333; // 23.976 fps frame steps
    expect(seekTarget(ms, TWO_HOURS)).toBe(Math.round(417_083.33));
  });
});

describe("keyboard steps", () => {
  it("uses 5 s / 30 s and a tenth of the media for PageUp/Down", () => {
    expect(keyStepMs("ArrowRight", false, TWO_HOURS)).toBe(5_000);
    expect(keyStepMs("ArrowLeft", true, TWO_HOURS)).toBe(-30_000);
    expect(keyStepMs("PageUp", false, TWO_HOURS)).toBe(720_000);
    expect(keyStepMs("PageDown", false, 30_000)).toBe(-10_000);
    expect(keyStepMs("Enter", false, TWO_HOURS)).toBeNull();
  });
});

describe("scrub mode", () => {
  it("is accurate while the engine keeps up and fast beyond the budget", () => {
    expect(scrubMode("auto", null)).toBe("accurate");
    expect(scrubMode("auto", SCRUB_ACCURATE_BUDGET_MS)).toBe("accurate");
    expect(scrubMode("auto", SCRUB_ACCURATE_BUDGET_MS + 1)).toBe("fast");
    expect(scrubMode("fast", 1)).toBe("fast");
    expect(scrubMode("accurate", 10_000)).toBe("accurate");
  });
});

function harness(pref: "auto" | "accurate" | "fast" = "auto") {
  let t = 0;
  const sent: SeekRequest[] = [];
  const s = new ScrubSession((r) => sent.push(r), 60_000, pref, () => t);
  return { s, sent, advance: (ms: number) => (t += ms) };
}

describe("ScrubSession", () => {
  it("keeps one seek in flight and sends only the newest target when it settles", () => {
    const { s, sent, advance } = harness();
    s.move(1_000, 10);
    s.move(2_000, 10);
    s.move(3_000, 10);
    expect(sent).toEqual([{ positionMs: 1_000, exact: true }]);
    advance(20);
    s.observe({ seq: 11, phase: "seeking" });
    s.observe({ seq: 12, phase: "paused" });
    expect(sent).toEqual([
      { positionMs: 1_000, exact: true },
      { positionMs: 3_000, exact: true },
    ]);
  });

  it("does not treat position-only snapshots while playing as settled", () => {
    const { s, sent, advance } = harness();
    s.move(1_000, 10);
    s.move(2_000, 10);
    advance(10);
    s.observe({ seq: 11, phase: "playing" }); // stale position tick
    expect(sent).toHaveLength(1);
    s.observe({ seq: 12, phase: "seeking" });
    s.observe({ seq: 13, phase: "playing" });
    expect(sent).toHaveLength(2);
  });

  it("ends with one accurate seek to the exact release target and reports done after it lands", () => {
    const { s, sent, advance } = harness("fast");
    s.move(5_000, 1);
    expect(sent[0]).toEqual({ positionMs: 5_000, exact: false });
    s.release(5_432.6, 1);
    expect(s.done).toBe(false);
    s.observe({ seq: 2, phase: "seeking" });
    s.observe({ seq: 3, phase: "paused" });
    expect(sent[1]).toEqual({ positionMs: 5_433, exact: true });
    expect(s.done).toBe(false);
    advance(30);
    s.observe({ seq: 4, phase: "seeking" });
    expect(s.observe({ seq: 5, phase: "paused" })).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it("ignores moves after release (no stale seek after the final one)", () => {
    const { s, sent } = harness();
    s.release(4_000, 1);
    s.move(9_000, 1);
    s.observe({ seq: 2, phase: "seeking" });
    s.observe({ seq: 3, phase: "paused" });
    expect(sent).toEqual([{ positionMs: 4_000, exact: true }]);
    expect(s.done).toBe(true);
  });

  it("switches to fast seeks after a slow accurate one", () => {
    const { s, sent, advance } = harness();
    s.move(1_000, 1);
    s.move(2_000, 1);
    advance(SCRUB_ACCURATE_BUDGET_MS + 50);
    s.observe({ seq: 2, phase: "seeking" });
    s.observe({ seq: 3, phase: "paused" });
    expect(sent[1]).toEqual({ positionMs: 2_000, exact: false });
  });

  it("gives up on a seek the engine never reported starting", () => {
    const { s, sent, advance } = harness();
    s.move(1_000, 1);
    s.move(2_000, 1);
    advance(SEEK_START_TIMEOUT_MS + 1);
    s.observe({ seq: 1, phase: "paused" });
    expect(sent).toHaveLength(2);
  });

  it("clamps targets past the end", () => {
    const { s, sent } = harness();
    s.release(99_999, 1);
    expect(sent[0]).toEqual({ positionMs: 60_000, exact: true });
  });
});

describe("timeline previews", () => {
  it("keys requests to 100 ms so a settled pointer gets its own frame", () => {
    expect(previewKey(1_234)).toBe(1_200);
    expect(previewKey(1_251)).toBe(1_300);
  });

  it("stands in the nearest cached frame within tolerance, and says which", () => {
    const frames = new Map([
      [10_000, "a"],
      [70_000, "b"],
    ]);
    expect(nearestPreview(frames, 12_000, TWO_HOURS)).toEqual({ url: "a", ms: 10_000 });
    expect(nearestPreview(frames, 200_000, TWO_HOURS)).toBeNull();
  });
});
