// Tests for the ADO call timeout wrapper (clickstop 2, step 9).
import { withTimeout, adoCall, DEFAULT_ADO_TIMEOUT_MS } from "./ado-call.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

ok("default timeout is 15s", DEFAULT_ADO_TIMEOUT_MS === 15000);

const results = [];
try {
  // Resolves before the timeout.
  results.push(["fast resolves", await withTimeout(delay(5, "ok"), 200) === "ok"]);

  // Rejects when the promise doesn't settle in time.
  let timedOut = false;
  try { await withTimeout(delay(200, "late"), 20, "getRepository"); }
  catch (e) { timedOut = /timed out after 20ms/.test(e.message) && /getRepository/.test(e.message); }
  results.push(["slow rejects with a labelled timeout", timedOut]);

  // A rejected promise propagates its own error (not the timeout).
  let propagated = false;
  try { await withTimeout(Promise.reject(new Error("boom")), 200); }
  catch (e) { propagated = e.message === "boom"; }
  results.push(["underlying rejection propagates", propagated]);

  // adoCall defers a throwing sync thunk into a rejection (never a throw).
  let deferred = false;
  try { await adoCall(() => { throw new Error("sync-boom"); }, { ms: 100 }); }
  catch (e) { deferred = e.message === "sync-boom"; }
  results.push(["adoCall turns a sync throw into a rejection", deferred]);
} catch (e) {
  results.push(["harness error", false]);
  console.error(e);
}

for (const [name, cond] of results) ok(name, cond);

console.log(`ado-call: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
