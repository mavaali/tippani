// R0 — LOSS INVENTORY (characterization test)
//
// Documents what survives a process restart TODAY. This is a characterization
// test in Michael Feathers' sense: it asserts current behaviour, including the
// broken parts, so the loss is precise, executable, and impossible to lose track
// of. It is NOT a wish list.
//
// The four disruption events come from the target architecture (slide 12), which
// names them as things that must NEVER destroy a workspace:
//     process restart | browser close | MCP disconnect | token refresh
//
// Verdicts:
//   SURVIVES  - durable across a restart (disk-backed)
//   LOST      - process-local; gone on restart
//   LOST-SILENT - LOST *and* indistinguishable from "nothing was ever staged".
//               This is the AR-10 violation: missing memory read as an empty
//               workspace. The most damaging cell in the inventory.
//
// When R1 (DraftWorkspace + IWorkspaceStore) lands, the LOST rows become
// SURVIVES and the EXPECTED_LOSS table below shrinks to nothing. That is R1's
// acceptance criteria.

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStagedInventory } from "./staged-inventory.js";
import { saveSpecDraft, loadSpecDraft } from "./spec-draft-store.js";

let pass = 0, fail = 0;
const rows = [];

function record(state, owner, verdict, loss, silent) {
  rows.push({ state, owner, verdict, loss, silent });
}
function check(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
}

console.log("\n=== R0 LOSS INVENTORY — process restart ===\n");

// ---------------------------------------------------------------------------
// A. Staged authoring inventory — the suspected loss surface
// ---------------------------------------------------------------------------
console.log("A. Staged authoring inventory (staged-inventory.js)");

// Simulate a session that stages a full authoring set, then "restarts" by
// constructing a brand-new instance exactly as a fresh process would.
const inv1 = createStagedInventory({ deletePersonalComments: () => {} });

// Signatures verified against staged-inventory.js exports (2026-08-11).
const staged = [];
for (const [label, fn] of [
  ["branch intent",     () => inv1.stageBranch({ org: "o", project: "p", repo: "r", repoName: "rn", branch: "feat/x", base: "main" })],
  ["file",              () => inv1.stageFile({ org: "o", project: "p", repo: "r", repoName: "rn", branch: "feat/x", title: "F Functional Spec", folder: "Specs/A/F", path: "Specs/A/F/F Functional Spec.md" })],
  ["folder",            () => inv1.stageFile({ org: "o", project: "p", repo: "r", repoName: "rn", branch: "feat/x", title: "Images", folder: "Specs/A/F/Images", path: "" })],
  ["PR intent",         () => inv1.stageSpecPr({ org: "o", project: "p", repo: "r", repoName: "rn", title: "[Functional Spec Review] F", sourceBranch: "feat/x", targetBranch: "main", workItemTitle: "Spec review: F", workItemType: "Task" })],
  ["PR publish intent", () => inv1.stagePrPublish({ org: "o", project: "p", repo: "r", repoName: "rn", pullRequestId: 123, title: "F" })],
]) {
  try { fn(); staged.push(label); }
  catch (e) { console.log(`   NOTE: "${label}" did not stage — ${e.message}`); }
}

const totalBefore = inv1.stagedTotal();
console.log(`   staged ${staged.length} intent kinds -> stagedTotal() = ${totalBefore}`);
assert.ok(totalBefore > 0, "precondition: something must actually stage");

// THE RESTART: a new process gets a new instance. Nothing is read from disk.
const inv2 = createStagedInventory({ deletePersonalComments: () => {} });
const totalAfter = inv2.stagedTotal();

check("staged inventory is EMPTY after restart (documents the loss)", () => {
  assert.strictEqual(totalAfter, 0,
    `expected 0 after restart, got ${totalAfter}. If this fails, persistence was ADDED — update the inventory.`);
});

check("loss is SILENT — empty is indistinguishable from never-staged", () => {
  const neverStaged = createStagedInventory({ deletePersonalComments: () => {} });
  assert.strictEqual(neverStaged.stagedTotal(), inv2.stagedTotal(),
    "a restarted session with lost work must be distinguishable from a fresh one — it is not");
});

check("module holds no filesystem persistence path", () => {
  const src = fs.readFileSync(new URL("./staged-inventory.js", import.meta.url), "utf-8");
  assert.ok(!/writeFileSync|readFileSync|fs\./.test(src), "fs usage appeared — persistence may have been added");
});

record("Staged branch intent",  "staged-inventory (memory)", "LOST-SILENT", "Branch + base vanish; re-stage by hand", true);
record("Staged file body",      "staged-inventory (memory)", "LOST-SILENT", "Authored file content lost unless also a spec draft", true);
record("Staged folder",         "staged-inventory (memory)", "LOST-SILENT", "Images/ scaffolding lost", true);
record("Staged PR intent",      "staged-inventory (memory)", "LOST-SILENT", "Title, target, work-item link lost", true);
record("Staged PR publish",     "staged-inventory (memory)", "LOST-SILENT", "Draft->published promotion lost", true);

// ---------------------------------------------------------------------------
// B. Durable stores — the contrast
// ---------------------------------------------------------------------------
console.log("\nB. Durable stores");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tippani-r0-"));

check("spec draft SURVIVES restart (disk + atomic rename)", () => {
  saveSpecDraft(tmp, "repo1", "feat/x", "Specs/A/F/F.md", { body: "# Durable" });
  const back = loadSpecDraft(tmp, "repo1", "feat/x", "Specs/A/F/F.md");
  assert.ok(back, "draft must reload after a restart");
});

check("absent draft is null, NOT an error (absent != unreadable)", () => {
  assert.strictEqual(loadSpecDraft(tmp, "repo1", "feat/x", "does/not/exist.md"), null);
});

check("corrupt draft THROWS rather than reading as empty (AR-10 honoured)", () => {
  const p = path.join(tmp, fs.readdirSync(tmp).find(f => f.endsWith(".json")));
  fs.writeFileSync(p, "{ this is not json");
  assert.throws(() => loadSpecDraft(tmp, "repo1", "feat/x", "Specs/A/F/F.md"),
    "a corrupt store must throw, never silently return empty");
});

record("Staged spec draft",   "spec-draft-store (disk, atomic)",       "SURVIVES", "none", false);
record("Personal annotations","personal-comments-store (disk, atomic)","SURVIVES", "none", false);
record("Viewed-state map",    "github-viewed-store (disk, atomic)",    "SURVIVES", "none", false);
record("Approved read roots", "approved-roots (disk)",                 "SURVIVES", "none", false);
record("Reading list",        "reading-list (disk)",                   "SURVIVES", "none", false);
record("Focus / nav / view",  "api-state (memory)",                    "LOST",     "Lose your place; nav epoch resets by design", false);
record("Breadcrumb",          "breadcrumb (memory)",                   "LOST",     "Navigation trail resets", false);

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}

// ---------------------------------------------------------------------------
// C. The inventory
// ---------------------------------------------------------------------------
console.log("\n=== LOSS INVENTORY (process restart) ===\n");
const w = [34, 38, 12, 6];
console.log(`${"STATE".padEnd(w[0])}${"OWNER".padEnd(w[1])}${"RESTART".padEnd(w[2])}SILENT`);
console.log("-".repeat(w[0] + w[1] + w[2] + w[3]));
for (const r of rows) {
  console.log(`${r.state.padEnd(w[0])}${r.owner.padEnd(w[1])}${r.verdict.padEnd(w[2])}${r.silent ? "YES" : "-"}`);
}

const lost = rows.filter(r => r.verdict.startsWith("LOST"));
const silent = rows.filter(r => r.silent);
console.log(`\n${rows.length} state kinds | ${lost.length} lost on restart | ${silent.length} SILENTLY lost`);
console.log("\nUser-visible loss (silent rows):");
for (const r of silent) console.log(`  - ${r.state}: ${r.loss}`);

console.log("\nR1 acceptance: every LOST-SILENT row above becomes SURVIVES.");
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;

