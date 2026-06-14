// Unit tests for src/api-state.js (Phase 1 of #42).
// Mirrors the conflict.test.mjs / canedit.test.mjs style: plain node, no
// framework, pass/fail counted at the end and process.exit non-zero on fail.

import {
  createFocusStore,
  createDraftStore,
  createLockStore,
  createInflightStore,
} from "./api-state.js";

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("  FAIL: " + name); }
}

// --- FocusStore ---
{
  const f = createFocusStore();
  const initial = f.get();
  check("focus: starts null", initial.focusedThreadId === null);
  check("focus: starts at v0", initial.version === 0);

  const s1 = f.set(42);
  check("focus: set(42) records id", s1.focusedThreadId === 42);
  check("focus: set bumps version", s1.version === 1);

  const s2 = f.set(42);
  check("focus: re-setting same value does NOT bump version", s2.version === 1);

  const s3 = f.set(43);
  check("focus: changing id bumps version", s3.version === 2);

  const s4 = f.set(null);
  check("focus: set(null) clears", s4.focusedThreadId === null);
  check("focus: clear bumps version", s4.version === 3);

  let threw = false;
  try { f.set("not-a-number"); } catch { threw = true; }
  check("focus: rejects non-numeric id", threw);
}

// --- DraftStore ---
{
  let pings = 0;
  const d = createDraftStore({ onChange: () => pings++ });

  check("draft: get unknown returns null", d.get(1) === null);

  d.put(1, "hello", { source: "external" });
  check("draft: put fires onChange", pings === 1);
  check("draft: get returns content", d.get(1).content === "hello");
  check("draft: get returns source", d.get(1).source === "external");

  d.put(1, "hello world");
  check("draft: overwrite fires onChange", pings === 2);
  check("draft: overwrite updates content", d.get(1).content === "hello world");
  check("draft: overwrite defaults source=external", d.get(1).source === "external");

  d.put(2, "second", { source: "user" });
  check("draft: list returns both", Object.keys(d.list()).length === 2);

  const deleted = d.delete(1);
  check("draft: delete returns true on hit", deleted === true);
  check("draft: delete fires onChange", pings === 4);

  const notDeleted = d.delete(99);
  check("draft: delete returns false on miss", notDeleted === false);
  check("draft: missed delete does NOT fire onChange", pings === 4);

  let threw = false;
  try { d.put(1, 123); } catch { threw = true; }
  check("draft: rejects non-string content", threw);
}

// --- LockStore ---
{
  let t = 1000;
  const l = createLockStore({ ttlMs: 100, now: () => t });

  check("lock: starts empty", l.size() === 0);
  check("lock: isLocked false initially", l.isLocked(1) === false);

  l.touch(1);
  check("lock: touch makes isLocked true", l.isLocked(1) === true);
  check("lock: size reflects active lock", l.size() === 1);

  t = 1050;
  check("lock: still active before ttl", l.isLocked(1) === true);

  l.touch(1);  // sliding window — extends to t+100=1150
  t = 1140;
  check("lock: sliding refresh keeps lock active", l.isLocked(1) === true);

  t = 1200;
  check("lock: expires after ttl with no refresh", l.isLocked(1) === false);
  check("lock: size prunes expired locks", l.size() === 0);

  l.touch(7);
  const released = l.release(7);
  check("lock: release returns true on hit", released === true);
  check("lock: released is no longer locked", l.isLocked(7) === false);
}

// --- InflightStore ---
{
  const i = createInflightStore();
  check("inflight: starts empty", i.size() === 0);
  check("inflight: has() false initially", i.has(1) === false);

  const ok = i.acquire(1);
  check("inflight: acquire returns true on free slot", ok === true);
  check("inflight: has() true after acquire", i.has(1) === true);

  const ok2 = i.acquire(1);
  check("inflight: second acquire returns false (conflict)", ok2 === false);

  i.release(1);
  check("inflight: release frees the slot", i.has(1) === false);
  const ok3 = i.acquire(1);
  check("inflight: re-acquire after release works", ok3 === true);
}

console.log(`api-state.test: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
