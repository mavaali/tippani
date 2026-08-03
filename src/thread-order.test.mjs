import { test } from "node:test";
import assert from "node:assert/strict";
import { sortThreadsByLine, threadLine } from "./thread-order.js";

const th = (id, line) => ({
  id,
  threadContext: line == null ? {} : { rightFileStart: { line } },
});

test("threadLine reads the anchor line or null", () => {
  assert.equal(threadLine(th(1, 42)), 42);
  assert.equal(threadLine(th(2, null)), null);
  assert.equal(threadLine({}), null);
  assert.equal(threadLine(null), null);
});

test("sortThreadsByLine orders ascending by anchor line", () => {
  const out = sortThreadsByLine([th(1, 30), th(2, 5), th(3, 17)]);
  assert.deepEqual(out.map((t) => t.id), [2, 3, 1]);
});

test("threads with no line sort last", () => {
  const out = sortThreadsByLine([th(1, null), th(2, 9), th(3, null), th(4, 2)]);
  assert.deepEqual(out.map((t) => t.id), [4, 2, 1, 3]);
});

test("sort is stable for equal lines and equal nulls", () => {
  const out = sortThreadsByLine([th(1, 10), th(2, 10), th(3, null), th(4, null)]);
  assert.deepEqual(out.map((t) => t.id), [1, 2, 3, 4]);
});

test("empty / non-array input is safe", () => {
  assert.deepEqual(sortThreadsByLine([]), []);
  assert.deepEqual(sortThreadsByLine(undefined), []);
  assert.deepEqual(sortThreadsByLine(null), []);
});
