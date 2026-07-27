// Tests for the local-clone git helpers: base-candidate ordering (incl.
// develop/trunk and origin default seeding) and symlink-safe path containment.
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { baseCandidates, safeLocalPath } from "./local-git.js";

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error(`  \u2717 ${name}\n    ${e.message}`); }
}

// --- baseCandidates ----------------------------------------------------------
test("seeds origin default first, then conventional names", () => {
  const c = baseCandidates("develop");
  assert.equal(c[0], "develop");
  assert.equal(c[1], "origin/develop");
  assert.ok(c.includes("main") && c.includes("master") && c.includes("trunk"));
});

test("no origin default still offers develop/trunk (the dead-end fix)", () => {
  const c = baseCandidates("");
  assert.ok(c.includes("develop"), "develop must be a candidate");
  assert.ok(c.includes("trunk"), "trunk must be a candidate");
  assert.ok(c.includes("main") && c.includes("master"));
});

test("strips a leading origin/ on the seed and de-dupes", () => {
  const c = baseCandidates("origin/main");
  assert.equal(c[0], "main");
  assert.equal(c[1], "origin/main");
  // main should not appear twice.
  assert.equal(c.filter((x) => x === "main").length, 1);
});

test("rejects leading-dash (flag-injection) candidates", () => {
  const c = baseCandidates("--upload-pack=evil");
  assert.ok(!c.some((x) => x.startsWith("-")));
});

// --- safeLocalPath -----------------------------------------------------------
function repo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "lg-repo-"));
  fs.writeFileSync(path.join(d, "spec.md"), "# hi");
  return fs.realpathSync(d);
}

test("an in-repo file resolves", () => {
  const d = repo();
  const p = safeLocalPath(d, "spec.md");
  assert.ok(p && p.endsWith("spec.md"));
});

test("a ../ escape in the request is rejected", () => {
  const d = repo();
  assert.equal(safeLocalPath(d, "../outside.md"), null);
  assert.equal(safeLocalPath(d, "sub/../../x.md"), null);
});

test("NUL and absolute-ish inputs are rejected", () => {
  const d = repo();
  assert.equal(safeLocalPath(d, "a\0b"), null);
  assert.equal(safeLocalPath(d, ""), null);
});

test("a symlink whose target escapes the repo is rejected", () => {
  const d = repo();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "lg-out-"));
  const secret = path.join(outside, "secret.md");
  fs.writeFileSync(secret, "top secret");
  let madeLink = true;
  try { fs.symlinkSync(secret, path.join(d, "link.md")); }
  catch { madeLink = false; } // Windows may forbid symlink creation w/o privilege
  if (madeLink) {
    assert.equal(safeLocalPath(d, "link.md"), null, "symlink target outside the repo must be rejected");
  }
});

console.log(`\nlocal-git: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
