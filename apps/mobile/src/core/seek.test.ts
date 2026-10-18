import assert from "node:assert/strict";
import { test } from "node:test";
import { accumulate, chapterTarget, msToFraction, pointerToMs, ScrubSession, scrubbedMs, scrubMode, scrubRate, seekTarget, tapZone, type SeekRequest } from "./seek.ts";
import { formatDelta, formatPrecise, formatTime } from "./time.ts";

const TWO_H = 7_200_000;

test("pointer maps the full track edge to edge and clamps", () => {
  assert.equal(pointerToMs(16, 16, 343, TWO_H), 0);
  assert.equal(pointerToMs(359, 16, 343, TWO_H), TWO_H);
  assert.equal(pointerToMs(-50, 16, 343, TWO_H), 0);
  assert.equal(pointerToMs(100, 16, 0, TWO_H), 0);
  assert.equal(msToFraction(TWO_H / 4, TWO_H), 0.25);
});

test("seek target rounds once and clamps", () => {
  assert.equal(seekTarget(1234.5, 10_000), 1235);
  assert.equal(seekTarget(-1, 10_000), 0);
  assert.equal(seekTarget(20_000, 10_000), 10_000);
});

test("vertical distance slows scrubbing in steps", () => {
  assert.equal(scrubRate(0), 1);
  assert.equal(scrubRate(-70), 0.5);
  assert.equal(scrubRate(130), 0.25);
  assert.equal(scrubRate(400), 0.125);
});

test("fine scrubbing moves proportionally slower and clamps", () => {
  // 343 pt track over 2 h: a 10 pt drag is 210 s at 1x, 26 s at 1/8.
  assert.equal(Math.round(scrubbedMs(60_000, 10, 343, TWO_H, 1)), 60_000 + 209_913);
  assert.equal(Math.round(scrubbedMs(60_000, 10, 343, TWO_H, 0.125)), 60_000 + 26_239);
  assert.equal(scrubbedMs(1_000, -100, 343, TWO_H, 1), 0);
});

test("scrub mode adapts to engine latency", () => {
  assert.equal(scrubMode("auto", null), "accurate");
  assert.equal(scrubMode("auto", 500), "fast");
  assert.equal(scrubMode("accurate", 500), "accurate");
});

test("tap zones and accumulating double taps", () => {
  assert.equal(tapZone(10, 400), "back");
  assert.equal(tapZone(200, 400), "middle");
  assert.equal(tapZone(390, 400), "forward");
  const a = accumulate(null, "forward", 10_000);
  const b = accumulate(a, "forward", 10_000);
  assert.deepEqual(b, { side: "forward", totalMs: 20_000 });
  assert.deepEqual(accumulate(b, "back", 10_000), { side: "back", totalMs: 10_000 });
});

test("chapter navigation", () => {
  const ch = [{ timeMs: 0 }, { timeMs: 60_000 }, { timeMs: 120_000 }];
  assert.equal(chapterTarget(ch, 70_000, 1), 120_000);
  assert.equal(chapterTarget(ch, 70_000, -1), 60_000);
  assert.equal(chapterTarget(ch, 61_000, -1), 0);
  assert.equal(chapterTarget([], 1, 1), null);
});

test("scrub session: latest wins, release is accurate and final", () => {
  let t = 0;
  const sent: SeekRequest[] = [];
  const s = new ScrubSession((r) => sent.push(r), 60_000, "auto", () => t);
  s.move(1_000);
  s.move(2_000);
  s.move(3_000);
  assert.deepEqual(sent, [{ positionMs: 1_000, exact: true }]);
  t += 300; // slow accurate seek -> following scrub seeks go fast
  s.settled();
  assert.deepEqual(sent[1], { positionMs: 3_000, exact: false });
  s.release(3_456.4);
  s.move(9_999); // ignored after release
  assert.equal(s.settled(), false);
  assert.deepEqual(sent[2], { positionMs: 3_456, exact: true });
  assert.equal(s.settled(), true);
  assert.equal(sent.length, 3);
});

test("time formatting", () => {
  assert.equal(formatTime(3_723_000), "1:02:03");
  assert.equal(formatTime(5_000), "0:05");
  assert.equal(formatDelta(-65_000), "−1:05");
  assert.equal(formatPrecise(12_340, 24), "0:12.08");
  assert.equal(formatPrecise(12_340, null), "0:12.3");
});
