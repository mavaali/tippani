// Tests for the durable staged spec-draft disk store (clickstop 2, step 11):
// atomic writes, corruption quarantine (never zeroed), loud failures.
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  specDraftKey,
  loadSpecDraft,
  saveSpecDraft,
  deleteSpecDraft,
} from "./spec-draft-store.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error(`  \u2717 ${name}\n    ${e.message}`); }
}
function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), "spec-draft-")); }
const R = "MyRepo", B = "refs/heads/spec/x", F = "docs/spec.md";

test("key is stable and path-scoped", () => {
  assert.equal(specDraftKey(R, B, F), specDraftKey(R, B, F));
  assert.notEqual(specDraftKey(R, B, F), specDraftKey(R, B, "docs/other.md"));
});

test("absent draft loads as null (nothing staged)", () => {
  const dir = tmpDir();
  assert.equal(loadSpecDraft(dir, R, B, F), null);
});

test("save then load round-trips the body + base", () => {
  const dir = tmpDir();
  saveSpecDraft(dir, R, B, F, { body: "# Spec\n\nhello", baseObjectId: "abc123" });
  const d = loadSpecDraft(dir, R, B, F);
  assert.equal(d.body, "# Spec\n\nhello");
  assert.equal(d.baseObjectId, "abc123");
  assert.equal(d.repo, R);
  assert.equal(d.branch, B);
  assert.equal(d.path, F);
  assert.ok(d.updatedAt);
});

test("save is atomic — no stray temp files, overwrite wins", () => {
  const dir = tmpDir();
  saveSpecDraft(dir, R, B, F, { body: "first" });
  const stray = fs.readdirSync(dir).filter((f) => f.includes(".tmp-"));
  assert.equal(stray.length, 0, `stray temp files: ${stray.join(", ")}`);
  saveSpecDraft(dir, R, B, F, { body: "second" });
  assert.equal(loadSpecDraft(dir, R, B, F).body, "second");
});

test("corrupt store is quarantined (not zeroed) and throws", () => {
  const dir = tmpDir();
  saveSpecDraft(dir, R, B, F, { body: "precious" });
  const p = path.join(dir, `${specDraftKey(R, B, F)}.json`);
  fs.writeFileSync(p, "{ not json");
  assert.throws(() => loadSpecDraft(dir, R, B, F), (e) => e.code === "SPEC_DRAFT_CORRUPT");
  const quarantined = fs.readdirSync(dir).filter((f) => f.includes(".corrupt-"));
  assert.equal(quarantined.length, 1);
  assert.ok(!fs.existsSync(p), "the corrupt primary file was moved aside");
});

test("save failure throws (does not silently swallow)", () => {
  const dir = tmpDir();
  const asFile = path.join(dir, "not-a-dir");
  fs.writeFileSync(asFile, "x");
  assert.throws(() => saveSpecDraft(asFile, R, B, F, { body: "x" }));
});

test("delete removes a staged draft after push", () => {
  const dir = tmpDir();
  saveSpecDraft(dir, R, B, F, { body: "staged" });
  assert.ok(loadSpecDraft(dir, R, B, F));
  deleteSpecDraft(dir, R, B, F);
  assert.equal(loadSpecDraft(dir, R, B, F), null);
});

test("delete of an absent draft is a no-throw no-op", () => {
  const dir = tmpDir();
  assert.equal(deleteSpecDraft(dir, R, B, F), true);
});

console.log(`\nspec-draft-store: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
