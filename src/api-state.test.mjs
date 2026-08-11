// Unit tests for src/api-state.js (Phase 1 of #42).
// Mirrors the conflict.test.mjs / canedit.test.mjs style: plain node, no
// framework, pass/fail counted at the end and process.exit non-zero on fail.

import {
  createFocusStore,
  createDraftStore,
  createLockStore,
  createKeyedLockStore,
  createInflightStore,
} from "./api-state.js";

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("  FAIL: " + name); }
}

// --- FocusStore ---
{
  const f = createFocusStore({ navEpoch: "epoch-a" });
  const initial = f.get();
  check("focus: starts null", initial.focusedThreadId === null);
  check("focus: starts at v0", initial.version === 0);
  check("nav: exposes its process epoch", initial.navEpoch === "epoch-a");

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

  // --- nav (single-tab navigation) ---
  const n0 = f.get();
  check("nav: starts null", n0.navUrl === null);
  check("nav: seq starts at 0", n0.navSeq === 0);

  const v0 = f.get().version;
  const n1 = f.setNav("/goto/thread/7");
  check("nav: setNav records url", n1.navUrl === "/goto/thread/7");
  check("nav: setNav bumps navSeq", n1.navSeq === 1);
  check("nav: setNav carries the process epoch", n1.navEpoch === "epoch-a");
  check("nav: setNav bumps version", n1.version === v0 + 1);
  check("nav: get() exposes navUrl", f.get().navUrl === "/goto/thread/7");

  // Same path again still fires (monotonic) so a repeat nav re-triggers.
  const n2 = f.setNav("/goto/thread/7");
  check("nav: repeat same path bumps navSeq", n2.navSeq === 2);
  check("nav: repeat same path bumps version", n2.version === n1.version + 1);

  let navThrew = false;
  try { f.setNav(""); } catch { navThrew = true; }
  check("nav: rejects empty url", navThrew);
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

// --- KeyedLockStore (string keys, clickstop 2 step 11) ---
{
  let t = 1000;
  const l = createKeyedLockStore({ ttlMs: 100, now: () => t });
  const K = "MyRepo\nspec/x\ndocs/spec.md";
  check("keyed-lock: string key does NOT throw", (() => { try { l.touch(K); return true; } catch { return false; } })());
  check("keyed-lock: isLocked true after touch", l.isLocked(K) === true);
  check("keyed-lock: a different key is independent", l.isLocked("MyRepo\nspec/x\nother.md") === false);
  t = 1050; l.touch(K); // sliding window
  t = 1140; check("keyed-lock: sliding refresh keeps it active", l.isLocked(K) === true);
  t = 1250; check("keyed-lock: expires after ttl", l.isLocked(K) === false);
  l.touch(K); check("keyed-lock: release returns true on hit", l.release(K) === true);
  check("keyed-lock: empty/non-string key throws", (() => { try { l.touch(""); return false; } catch { return true; } })());
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

// --- FocusStore: view + filter state (items 3 / 5) ---
{
  const f = createFocusStore();
  const init = f.get();
  check("view: starts null", init.view === null && init.viewSeq === 0);
  check("filter: starts null", init.filter === null && init.filterSeq === 0);

  const v = f.get().version;
  const r = f.setView("diff");
  check("setView: records view", r.view === "diff");
  check("setView: bumps viewSeq + version", r.viewSeq === 1 && r.version === v + 1);
  const r2 = f.setView("diff");
  check("setView: repeat still bumps so the browser re-applies", r2.viewSeq === 2);
  let threw = false; try { f.setView("bogus"); } catch { threw = true; }
  check("setView: rejects an unknown view", threw);

  const fr = f.setFilter({ states: ["you"], reviewer: "Alice" });
  check("setFilter: records the filter", fr.filter.states[0] === "you" && fr.filter.reviewer === "Alice");
  check("setFilter: bumps filterSeq", fr.filterSeq === 1);
  const cleared = f.setFilter(null);
  check("setFilter(null): clears", cleared.filter === null);
  let threw2 = false; try { f.setFilter("nope"); } catch { threw2 = true; }
  check("setFilter: rejects a non-object", threw2);

  const g = f.get();
  check("get: exposes view + filter fields", g.view === "diff" && g.filter === null);
}

// --- FocusStore: go_to_line scroll state ---
{
  const f = createFocusStore();
  const init = f.get();
  check("line: starts null", init.line === null && init.lineSeq === 0);
  const v = f.get().version;
  const r = f.setLine(130);
  check("setLine: records line", r.line === 130);
  check("setLine: bumps lineSeq + version", r.lineSeq === 1 && r.version === v + 1);
  const r2 = f.setLine(130);
  check("setLine: repeat still bumps so the page re-scrolls", r2.lineSeq === 2);
  check("get: exposes line + lineSeq", f.get().line === 130 && f.get().lineSeq === 2);
  let threwZero = false; try { f.setLine(0); } catch { threwZero = true; }
  check("setLine: rejects 0", threwZero);
  let threwNeg = false; try { f.setLine(-3); } catch { threwNeg = true; }
  check("setLine: rejects a negative line", threwNeg);
  let threwFrac = false; try { f.setLine(4.5); } catch { threwFrac = true; }
  check("setLine: rejects a fractional line", threwFrac);
  let threwNaN = false; try { f.setLine("nope"); } catch { threwNaN = true; }
  check("setLine: rejects a non-number", threwNaN);
}

// --- FocusStore: author-comment state ---
{
  const f = createFocusStore();
  const init = f.get();
  check("ac: starts empty", init.pcContext === null && init.pcSelectedId === null && init.pcCommand === null && init.pcCommandSeq === 0 && init.pcDataSeq === 0);

  const ctx = f.setPcContext({ repo: "R1", branch: "b", path: "/a.md" });
  check("setPcContext: records", ctx.repo === "R1" && ctx.branch === "b" && ctx.path === "/a.md");
  check("setPcContext: incomplete -> null", f.setPcContext({ repo: "R1" }) === null);
  f.setPcContext({ repo: "R1", branch: "b", path: "/a.md" });

  check("setPcSelected: records", f.setPcSelected("c1") === "c1");
  check("setPcSelected: empty -> null", f.setPcSelected("") === null);

  const v = f.get().version;
  const c1 = f.setPcCommand({ type: "focus", id: "c9" });
  check("setPcCommand: records + bumps", c1.pcCommand.id === "c9" && c1.pcCommandSeq === 1 && f.get().version === v + 1);
  const c2 = f.setPcCommand({ type: "focus", id: "c9" });
  check("setPcCommand: repeat still bumps", c2.pcCommandSeq === 2);

  const d1 = f.bumpPcData();
  check("bumpPcData: increments", d1 === 1);
  check("bumpPcData: again", f.bumpPcData() === 2);
  const g = f.get();
  check("get: exposes ac fields", g.pcContext.repo === "R1" && g.pcCommandSeq === 2 && g.pcDataSeq === 2);
}

console.log(`api-state.test: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
