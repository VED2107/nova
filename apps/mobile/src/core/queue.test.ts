import assert from "node:assert/strict";
import { test } from "node:test";
import { abWrap, append, current, cycleAb, cycleRepeat, frameStepTarget, move, nextIndex, openQueue, parseTimeInput, playNext, previousIndex, remove, select, shuffleUpcoming } from "./queue.ts";

test("open dedupes and clamps the start", () => {
  const q = openQueue(["a", "b", "a", "c"], 9);
  assert.deepEqual(q.ids, ["a", "b", "c"]);
  assert.equal(current(q), "c");
  assert.equal(openQueue([]).index, -1);
});

test("next honours repeat; repeat one only on auto-advance", () => {
  const q = openQueue(["a", "b"], 1);
  assert.equal(nextIndex(q, true), null);
  assert.equal(nextIndex({ ...q, repeat: "all" }, true), 0);
  assert.equal(nextIndex({ ...q, repeat: "one" }, true), 1);
  assert.equal(nextIndex({ ...q, repeat: "one", index: 0 }, false), 1);
});

test("previous restarts after 3 s, wraps only with repeat all", () => {
  const q = openQueue(["a", "b", "c"], 1);
  assert.equal(previousIndex(q, 5_000), 1);
  assert.equal(previousIndex(q, 1_000), 0);
  assert.equal(previousIndex({ ...q, index: 0 }, 0), 0);
  assert.equal(previousIndex({ ...q, index: 0, repeat: "all" }, 0), 2);
  assert.equal(cycleRepeat("off"), "all");
  assert.equal(cycleRepeat("all"), "one");
  assert.equal(cycleRepeat("one"), "off");
});

test("append, play next, remove and move keep the current item", () => {
  let q = openQueue(["a", "b", "c"], 1);
  q = append(q, ["c", "d"]);
  assert.deepEqual(q.ids, ["a", "b", "c", "d"]);
  q = playNext(q, "d");
  assert.deepEqual(q.ids, ["a", "b", "d", "c"]);
  assert.equal(current(q), "b");
  q = remove(q, "a");
  assert.equal(current(q), "b");
  q = remove(q, "b");
  assert.equal(current(q), "d");
  q = move(q, "c", -5);
  assert.deepEqual(q.ids, ["c", "d"]);
  assert.equal(current(q), "d");
  assert.equal(current(select(q, "c")), "c");
  assert.equal(remove(openQueue(["x"]), "x").index, -1);
});

test("shuffle leaves played and current items in place", () => {
  const q = openQueue(["a", "b", "c", "d", "e"], 1);
  const s = shuffleUpcoming(q, () => 0);
  assert.deepEqual(s.ids.slice(0, 2), ["a", "b"]);
  assert.deepEqual([...s.ids.slice(2)].sort(), ["c", "d", "e"]);
});

test("A–B loop cycle and wrap", () => {
  let l = cycleAb({ aMs: null, bMs: null }, 2_000);
  assert.deepEqual(l, { aMs: 2_000, bMs: null });
  assert.deepEqual(cycleAb(l, 2_050), { aMs: 2_050, bMs: null }); // B must follow A
  l = cycleAb(l, 5_000);
  assert.equal(abWrap(l, 4_999), null);
  assert.equal(abWrap(l, 5_000), 2_000);
  assert.deepEqual(cycleAb(l, 1), { aMs: null, bMs: null });
});

test("frame step lands inside the neighbouring frame", () => {
  assert.equal(Math.floor(frameStepTarget(1_000, 24, true)! / (1000 / 24)), 25);
  assert.equal(Math.floor(frameStepTarget(1_000, 24, false)! / (1000 / 24)), 23);
  assert.equal(frameStepTarget(0, 24, false), 0);
  assert.equal(frameStepTarget(1_000, null, true), null);
});

test("go to time parsing", () => {
  assert.equal(parseTimeInput("1:02:03"), 3_723_000);
  assert.equal(parseTimeInput("90.5"), 90_500);
  assert.equal(parseTimeInput("1h2m3s"), 3_723_000);
  assert.equal(parseTimeInput("1:75"), null);
  assert.equal(parseTimeInput(""), null);
});
