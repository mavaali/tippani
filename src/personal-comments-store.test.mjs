// Tests for the durable personal-comments disk store: atomic writes,
// corruption quarantine (never zeroed), and loud failures.
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  personalCommentsKey,
  loadPersonalComments,
  savePersonalComments,
  migrateKey,
} from "./personal-comments-store.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error(`  \u2717 ${name}\n    ${e.message}`); }
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pc-store-"));
}
const R = "repo1", B = "refs/heads/main", F = "docs/spec.md";

test("key is stable and path-scoped", () => {
  const a = personalCommentsKey(R, B, F);
  assert.equal(a, personalCommentsKey(R, B, F));
  assert.notEqual(a, personalCommentsKey(R, B, "docs/other.md"));
});

test("absent file loads as empty list", () => {
  const dir = tmpDir();
  assert.deepEqual(loadPersonalComments(dir, R, B, F), []);
});

test("save then load round-trips", () => {
  const dir = tmpDir();
  const comments = [{ id: "1", line: 3, content: "hi", resolved: false }];
  savePersonalComments(dir, R, B, F, comments);
  assert.deepEqual(loadPersonalComments(dir, R, B, F), comments);
});

test("save is atomic — an existing store is never left half-written", () => {
  const dir = tmpDir();
  savePersonalComments(dir, R, B, F, [{ id: "1", content: "first" }]);
  // No .tmp files should linger after a successful save.
  const stray = fs.readdirSync(dir).filter((f) => f.includes(".tmp-"));
  assert.equal(stray.length, 0, `stray temp files: ${stray.join(", ")}`);
  savePersonalComments(dir, R, B, F, [{ id: "1", content: "second" }]);
  assert.equal(loadPersonalComments(dir, R, B, F)[0].content, "second");
});

test("corrupt store is quarantined (not zeroed) and throws", () => {
  const dir = tmpDir();
  savePersonalComments(dir, R, B, F, [{ id: "1", content: "precious" }]);
  const p = path.join(dir, `${personalCommentsKey(R, B, F)}.json`);
  fs.writeFileSync(p, "{ this is not json");
  assert.throws(() => loadPersonalComments(dir, R, B, F), (e) => e.code === "PC_STORE_CORRUPT");
  // The bad bytes are preserved under a .corrupt-* sibling, and the store is
  // NOT silently replaced with an empty list.
  const quarantined = fs.readdirSync(dir).filter((f) => f.includes(".corrupt-"));
  assert.equal(quarantined.length, 1);
  assert.ok(!fs.existsSync(p), "the corrupt primary file was moved aside");
});

test("save failure throws (does not silently swallow)", () => {
  const dir = tmpDir();
  // Point the dir at a path that can't hold the file: make `dir` a FILE.
  const asFile = path.join(dir, "not-a-dir");
  fs.writeFileSync(asFile, "x");
  assert.throws(() => savePersonalComments(asFile, R, B, F, [{ id: "1" }]));
});

test("migrateKey moves notes from a legacy repo id to a stable one", () => {
  const dir = tmpDir();
  const LEGACY = "local:/old/abs/path", STABLE = "localorigin:https://x/y";
  savePersonalComments(dir, LEGACY, B, F, [{ id: "1", content: "keep me" }]);
  const moved = migrateKey(dir, LEGACY, STABLE, B, F);
  assert.equal(moved, true);
  assert.deepEqual(loadPersonalComments(dir, STABLE, B, F), [{ id: "1", content: "keep me" }]);
  // The legacy primary file is moved aside, not left as a live duplicate.
  assert.deepEqual(loadPersonalComments(dir, LEGACY, B, F), []);
});

test("migrateKey is a no-op when the destination already exists", () => {
  const dir = tmpDir();
  const LEGACY = "local:/old", STABLE = "localorigin:u";
  savePersonalComments(dir, LEGACY, B, F, [{ id: "1", content: "old" }]);
  savePersonalComments(dir, STABLE, B, F, [{ id: "2", content: "new" }]);
  assert.equal(migrateKey(dir, LEGACY, STABLE, B, F), false);
  assert.equal(loadPersonalComments(dir, STABLE, B, F)[0].content, "new");
});

test("migrateKey no-ops for same id or missing source", () => {
  const dir = tmpDir();
  assert.equal(migrateKey(dir, "x", "x", B, F), false);
  assert.equal(migrateKey(dir, "local:/absent", "localorigin:z", B, F), false);
});

console.log(`\npersonal-comments-store: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
