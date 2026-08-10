// Tests for the staged-authoring inventory (clickstop-2's five staged arrays
// — branches, files, folders, PR intents, PR-publish intents — extracted
// behind createStagedInventory() per Thor's review, 2026-08-09).
//
// Every instance is created fresh per test group so tests never share state
// through a module-level singleton — the whole point of the factory shape
// is that each caller (or each test) gets its own isolated inventory.
import { createStagedInventory, normFolder, parentFolder, isUnder } from "./staged-inventory.js";

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }

// --- pure path helpers -------------------------------------------------
check("normFolder strips leading/trailing slashes", normFolder("/a/b/") === "a/b");
check("normFolder normalizes backslashes", normFolder("a\\b\\c") === "a/b/c");
check("normFolder handles null", normFolder(null) === "");
check("parentFolder of a/b/c", parentFolder("a/b/c") === "a/b");
check("parentFolder of top-level", parentFolder("a") === "");
check("isUnder same path", isUnder("a/b", "a/b") === true);
check("isUnder nested", isUnder("a/b/c.md", "a/b") === true);
check("isUnder root matches everything", isUnder("a/b", "") === true);
check("isUnder unrelated -> false", isUnder("x/y", "a/b") === false);

// --- branches ------------------------------------------------------------
{
  const inv = createStagedInventory({});
  const r1 = inv.stageBranch({ repo: "r", branch: "feature/x", base: "main" });
  check("stageBranch ok", r1.ok === true && r1.count === 1);
  const r2 = inv.stageBranch({ repo: "r", branch: "feature/x" });
  check("stageBranch: duplicate rejected", r2.ok === false);
  check("stageBranch: missing branch name rejected", inv.stageBranch({ repo: "r" }).ok === false);
  check("stageBranch: missing repo rejected", inv.stageBranch({ branch: "x" }).ok === false);

  check("resolveEffectiveBranch: unstaged branch returns itself", inv.resolveEffectiveBranch("r", "main") === "main");
  check("resolveEffectiveBranch: staged branch resolves to its base", inv.resolveEffectiveBranch("r", "feature/x") === "main");
  // stack a second staged branch off the first, unresolved chain follows through
  inv.stageBranch({ repo: "r", branch: "feature/y", base: "feature/x" });
  check("resolveEffectiveBranch: follows a chain of staged bases", inv.resolveEffectiveBranch("r", "feature/y") === "main");
  // a cycle must not infinite-loop
  const cyc = createStagedInventory({});
  cyc.stageBranch({ repo: "r", branch: "a", base: "b" });
  cyc.stageBranch({ repo: "r", branch: "b", base: "a" });
  check("resolveEffectiveBranch: a base cycle terminates", typeof cyc.resolveEffectiveBranch("r", "a") === "string");

  const u = inv.unstageBranch({ repo: "r", branch: "feature/x" });
  check("unstageBranch removes exactly one", u.removed === 1);
  check("unstageBranch: gone from listStagedBranches", inv.listStagedBranches().branches.every((b) => b.branch !== "feature/x"));
}

// --- files ---------------------------------------------------------------
{
  const inv = createStagedInventory({});
  const r1 = inv.stageFile({ repo: "r", branch: "b", title: "My Spec" });
  check("stageFile: appends .md", r1.ok === true && r1.files[0].path === "My Spec.md");
  check("stageFile: rejects non-md explicit extension", inv.stageFile({ repo: "r", branch: "b", title: "notes.txt" }).ok === false);
  check("stageFile: rejects duplicate path", inv.stageFile({ repo: "r", branch: "b", title: "My Spec" }).ok === false);
  check("stageFile: rejects missing title/path", inv.stageFile({ repo: "r", branch: "b" }).ok === false);
  check("stageFile: rejects missing repo/branch", inv.stageFile({ title: "x" }).ok === false);

  const withFolder = inv.stageFile({ repo: "r", branch: "b", folder: "docs/api", title: "auth" });
  check("stageFile: honors folder prefix", withFolder.ok === true && withFolder.files.some((f) => f.path === "docs/api/auth.md"));

  const upd = inv.updateStagedFileContent({ repo: "r", branch: "b", path: "My Spec.md", content: "# hi" });
  check("updateStagedFileContent: ok", upd.ok === true);
  check("updateStagedFileContent: missing file -> not ok", inv.updateStagedFileContent({ repo: "r", branch: "b", path: "nope.md", content: "x" }).ok === false);

  const before = inv.stagedTotal();
  const un = inv.unstageFile({ repo: "r", branch: "b", path: "My Spec.md" });
  check("unstageFile: removes one and total shrinks", un.ok === true && un.removed === 1 && inv.stagedTotal() === before - 1);

  // existing:true files (saveExistingEdit output) ARE removable by
  // unstageFile too — "unstage" on an already-pushed file's pending edit
  // means "discard this staged edit," which is a legitimate action. The
  // `!f.existing` guard in the code only scopes which files get their
  // personal comments cleaned up (existing files' comments live in the
  // durable store, not on the staged entry) — not which files get removed.
  inv.saveExistingEdit({ repo: "r", branch: "b", path: "was-existing.md", content: "x" });
  const existingTotal = inv.stagedTotal();
  const removed = inv.unstageFile({ repo: "r", branch: "b", path: "was-existing.md" });
  check("unstageFile: also removes an existing (already-pushed) staged edit", removed.ok === true && removed.removed === 1 && inv.stagedTotal() === existingTotal - 1);
}

// unstageFile calls the injected deletePersonalComments — proves the wiring,
// not just that the array shrinks.
{
  const calls = [];
  const inv = createStagedInventory({ deletePersonalComments: (repo, branch, path) => calls.push([repo, branch, path]) });
  inv.stageFile({ repo: "r", branch: "b", title: "spec" });
  inv.unstageFile({ repo: "r", branch: "b", path: "spec.md" });
  check("unstageFile: calls deletePersonalComments with (repo, branch, path)", calls.length === 1 && calls[0][0] === "r" && calls[0][1] === "b" && calls[0][2] === "spec.md");

  // If deletePersonalComments throws, the file must NOT be removed — matches
  // the pre-extraction try/catch-and-bail behavior exactly.
  const inv2 = createStagedInventory({ deletePersonalComments: () => { throw new Error("disk full"); } });
  inv2.stageFile({ repo: "r", branch: "b", title: "spec" });
  const totalBefore = inv2.stagedTotal();
  const r = inv2.unstageFile({ repo: "r", branch: "b", path: "spec.md" });
  check("unstageFile: a throwing deletePersonalComments blocks removal", r.ok === false && inv2.stagedTotal() === totalBefore);
}

// saveExistingEdit: upsert semantics (create on first call, update in place on second)
{
  const inv = createStagedInventory({});
  const created = inv.saveExistingEdit({ repo: "r", branch: "b", path: "docs/x.md", content: "v1", baseObjectId: "sha1" });
  check("saveExistingEdit: creates a new existing entry", created.ok === true && created.files[0].existing === true && created.files[0].baseObjectId === "sha1");
  const updated = inv.saveExistingEdit({ repo: "r", branch: "b", path: "docs/x.md", content: "v2" });
  check("saveExistingEdit: second call updates in place, not a duplicate", updated.files.length === 1 && updated.files[0].content === "v2");
  check("saveExistingEdit: preserves the original baseObjectId on update", updated.files[0].baseObjectId === "sha1");
}

// getFiles / setFilePersonalComments — the deliberate cross-boundary seam
{
  const inv = createStagedInventory({});
  check("getFiles: nothing staged -> null", inv.getFiles("r", "b", "spec.md") === null);
  inv.stageFile({ repo: "r", branch: "b", title: "spec" });
  const f = inv.getFiles("r", "b", "spec.md");
  check("getFiles: finds the staged (non-existing) entry", f !== null && f.path === "spec.md");
  check("setFilePersonalComments: writes onto the staged entry", inv.setFilePersonalComments("r", "b", "spec.md", [{ id: 1 }]) === true);
  check("getFiles: reflects the write", inv.getFiles("r", "b", "spec.md").personalComments.length === 1);
  check("setFilePersonalComments: no matching staged file -> false", inv.setFilePersonalComments("r", "b", "nope.md", []) === false);

  // getFiles must NOT match an existing:true (already-pushed) entry — mirrors
  // the same !f.existing guard as unstageFile.
  inv.saveExistingEdit({ repo: "r", branch: "b", path: "pushed.md", content: "x" });
  check("getFiles: does not match an existing (already-pushed) entry", inv.getFiles("r", "b", "pushed.md") === null);
  check("findFile: DOES match an existing (already-pushed) entry", inv.findFile("r", "b", "pushed.md") !== null);
  check("findFile: matches a non-existing staged file too", inv.findFile("r", "b", "spec.md") !== null);
  check("findFile: no match -> null", inv.findFile("r", "b", "nowhere.md") === null);
}

// --- PR intents ------------------------------------------------------------
{
  const inv = createStagedInventory({});
  const bad = inv.stageSpecPr({ org: "o", project: "p", repo: "r", title: "t", sourceBranch: "b", targetBranch: "main" });
  check("stageSpecPr: minimal valid", bad.ok === true);
  check("stageSpecPr: missing required field rejected", inv.stageSpecPr({ org: "o", project: "p", repo: "r" }).ok === false);
  check("stageSpecPr: workItemTitle without type rejected", inv.stageSpecPr({ org: "o", project: "p", repo: "r", title: "t2", sourceBranch: "b2", targetBranch: "main", workItemTitle: "wi" }).ok === false);
  check("stageSpecPr: duplicate branch rejected", inv.stageSpecPr({ org: "o", project: "p", repo: "r", title: "again", sourceBranch: "b", targetBranch: "main" }).ok === false);
  check("stageSpecPr: strips refs/heads/ from sourceBranch", inv.listStagedBranches().prs[0].branch === "b");

  const un = inv.unstageSpecPr({ repo: "r", branch: "b" });
  check("unstageSpecPr: removes it", un.removed === 1);
}

// --- PR publish intents ------------------------------------------------------
{
  const inv = createStagedInventory({});
  const r1 = inv.stagePrPublish({ org: "o", project: "p", repo: "r", pullRequestId: 42 });
  check("stagePrPublish: ok", r1.ok === true);
  check("stagePrPublish: duplicate PR id rejected", inv.stagePrPublish({ org: "o", project: "p", repo: "r", pullRequestId: 42 }).ok === false);
  check("stagePrPublish: same number in another repo allowed",
    inv.stagePrPublish({ org: "o", project: "p", repo: "other", pullRequestId: 42 }).ok === true);
  check("stagePrPublish: missing fields rejected", inv.stagePrPublish({ pullRequestId: 1 }).ok === false);
  check("stagePrPublish: non-numeric id rejected", inv.stagePrPublish({ org: "o", project: "p", repo: "r", pullRequestId: "abc" }).ok === false);

  const un = inv.unstagePrPublish({ project: "p", repo: "r", pullRequestId: 42 });
  check("unstagePrPublish: removes it", un.removed === 1);
  check("unstagePrPublish: preserves same-number PR in another repo",
    un.prPublishes.length === 1 && un.prPublishes[0].repo === "other");

  inv.stagePrPublish({ org: "o", project: "p", repo: "third", pullRequestId: 42 });
  const ambiguous = inv.unstagePrPublish({ pullRequestId: 42 });
  check("unstagePrPublish: ambiguous legacy request fails loudly",
    ambiguous.ok === false && ambiguous.prPublishes.length === 2);
  check("unstagePrPublish: partial coordinates fail loudly",
    inv.unstagePrPublish({ project: "p", pullRequestId: 42 }).ok === false);

  const legacy = createStagedInventory({});
  legacy.stagePrPublish({ org: "o", project: "p", repo: "r", pullRequestId: 7 });
  check("unstagePrPublish: legacy id-only request removes unique match",
    legacy.unstagePrPublish({ pullRequestId: 7 }).removed === 1);
}

// --- folders --------------------------------------------------------------
{
  const inv = createStagedInventory({});
  const r1 = inv.createStagedFolder({ repo: "r", branch: "b", path: "/docs/" });
  check("createStagedFolder: normalizes path", r1.ok === true && r1.path === "docs");
  check("createStagedFolder: duplicate rejected", inv.createStagedFolder({ repo: "r", branch: "b", path: "docs" }).ok === false);
  check("createStagedFolder: invalid char rejected", inv.createStagedFolder({ repo: "r", branch: "b", path: "bad*name" }).ok === false);
  check("createStagedFolder: empty path rejected", inv.createStagedFolder({ repo: "r", branch: "b", path: "" }).ok === false);
  check("createStagedFolder: missing repo/branch rejected", inv.createStagedFolder({ path: "x" }).ok === false);

  // Can't delete a non-empty folder — occupied by a staged file.
  inv.stageFile({ repo: "r", branch: "b", folder: "docs", title: "spec" });
  check("deleteStagedFolder: rejected when it holds a staged file", inv.deleteStagedFolder({ repo: "r", branch: "b", path: "docs" }).ok === false);
  check("deleteStagedFolder: unknown folder rejected", inv.deleteStagedFolder({ repo: "r", branch: "b", path: "ghost" }).ok === false);

  // Can't delete a non-empty folder — occupied by a CHILD folder.
  inv.createStagedFolder({ repo: "r", branch: "b", path: "empty-parent" });
  inv.createStagedFolder({ repo: "r", branch: "b", path: "empty-parent/child" });
  check("deleteStagedFolder: rejected when it holds a child folder", inv.deleteStagedFolder({ repo: "r", branch: "b", path: "empty-parent" }).ok === false);
  // ...but the childless leaf CAN be deleted.
  check("deleteStagedFolder: an actually-empty folder can be deleted", inv.deleteStagedFolder({ repo: "r", branch: "b", path: "empty-parent/child" }).ok === true);

  check("renameStagedFolder: unknown folder rejected", inv.renameStagedFolder({ repo: "r", branch: "b", path: "ghost", newName: "x" }).ok === false);
  check("renameStagedFolder: non-empty folder rejected", inv.renameStagedFolder({ repo: "r", branch: "b", path: "docs", newName: "guides" }).ok === false);
  const ok2 = inv.renameStagedFolder({ repo: "r", branch: "b", path: "empty-parent", newName: "renamed" });
  check("renameStagedFolder: empty folder renames", ok2.ok === true && ok2.path === "renamed");
  check("renameStagedFolder: invalid new name rejected", inv.renameStagedFolder({ repo: "r", branch: "b", path: "renamed", newName: "bad/name" }).ok === false);

  check("_folderHasStagedFile: true for docs (holds spec.md)", inv._folderHasStagedFile("r", "b", "docs") === true);
  check("_folderHasStagedFile: false for an unrelated folder", inv._folderHasStagedFile("r", "b", "nowhere") === false);
  check("stagedFoldersUnder: root scope finds top-level staged folders", inv.stagedFoldersUnder("r", "b", "").some((f) => f.path === "docs"));
}

// --- listStagedBranches returns SNAPSHOTS, not live references ------------
// This is the specific defect flagged in review: the pre-extraction version
// returned the module's own arrays, so a caller mutating the returned array
// silently corrupted staged state without going through any staging function.
{
  const inv = createStagedInventory({});
  inv.stageBranch({ repo: "r", branch: "b" });
  const snap1 = inv.listStagedBranches();
  snap1.branches.push({ repo: "intruder", branch: "should-not-appear" });
  const snap2 = inv.listStagedBranches();
  check("listStagedBranches: mutating a returned snapshot does not affect the store", snap2.branches.length === 1);

  const snapshotFn = inv.snapshot();
  snapshotFn.files.push({ repo: "intruder" });
  check("snapshot(): also returns copies, not live arrays", inv.snapshot().files.length === 0);
}

// --- snapshot() + removeXMatching() — the accessor surface pushStagedBranches / publishStagedPrs use
{
  const inv = createStagedInventory({});
  inv.stageBranch({ repo: "r", branch: "b1" });
  inv.stageBranch({ repo: "r", branch: "b2" });
  inv.stageFile({ repo: "r", branch: "b1", title: "spec" });
  const snap = inv.snapshot();
  check("snapshot: exposes all five arrays", "branches" in snap && "files" in snap && "folders" in snap && "prs" in snap && "prPublishes" in snap);
  check("snapshot: branches present", snap.branches.length === 2);

  inv.removeBranchesMatching((b) => b.branch === "b1");
  check("removeBranchesMatching: removes only the matched branch", inv.snapshot().branches.length === 1 && inv.snapshot().branches[0].branch === "b2");
  check("removeBranchesMatching: files untouched (independent arrays)", inv.snapshot().files.length === 1);

  inv.removeFilesMatching((f) => f.branch === "b1");
  check("removeFilesMatching: removes the file", inv.snapshot().files.length === 0);

  inv.stagePrPublish({ org: "o", project: "p", repo: "r", pullRequestId: 1 });
  inv.setPrPublishes([]);
  check("setPrPublishes: replaces the list wholesale (publishStagedPrs' 'remaining' pattern)", inv.snapshot().prPublishes.length === 0);
}

console.log(`\nstaged-inventory.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
