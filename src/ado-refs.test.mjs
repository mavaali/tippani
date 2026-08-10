// Tests for ADO ref helpers (clickstop 2, step 9). Pure.
import { buildCreateBranchRef, normalizeBranchRef, resolveBaseBranch, ZERO_OBJECT_ID } from "./ado-refs.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }
function threw(name, fn) { let t = false; try { fn(); } catch { t = true; } ok(name, t); }

// --- normalizeBranchRef ---
eq("bare name -> refs/heads/", normalizeBranchRef("spec/x"), "refs/heads/spec/x");
eq("already-qualified stays", normalizeBranchRef("refs/heads/dev/y"), "refs/heads/dev/y");
eq("empty -> empty", normalizeBranchRef(""), "");

// --- buildCreateBranchRef ---
eq("create ref from zero to base",
  buildCreateBranchRef({ branch: "spec/x", baseTip: "deadbeef" }),
  { name: "refs/heads/spec/x", oldObjectId: ZERO_OBJECT_ID, newObjectId: "deadbeef" });
threw("missing branch throws", () => buildCreateBranchRef({ baseTip: "x" }));
threw("missing baseTip throws", () => buildCreateBranchRef({ branch: "spec/x" }));

// --- resolveBaseBranch (no dead-ends) ---
eq("prefers main", resolveBaseBranch(["main", "master", "develop"]), "main");
eq("falls to master", resolveBaseBranch(["master", "develop"]), "master");
eq("falls to develop", resolveBaseBranch(["develop", "trunk"]), "develop");
eq("falls to trunk", resolveBaseBranch(["trunk"]), "trunk");
eq("honors valid preference", resolveBaseBranch(["main", "release/1.0"], "release/1.0"), "release/1.0");
eq("ignores bad preference, falls back", resolveBaseBranch(["main"], "nope"), "main");
eq("refs/heads/ prefixes tolerated", resolveBaseBranch(["refs/heads/main"]), "main");
eq("none match -> null", resolveBaseBranch(["feature/a", "feature/b"]), null);

console.log(`ado-refs: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
