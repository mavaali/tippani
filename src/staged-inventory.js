// The staged-authoring inventory (clickstop-2): branches, files, folders, PR
// intents, and PR-publish intents that a user (or agent) has staged locally
// before one explicit push_staged_changes / Push-to-remote crosses to Azure
// DevOps. Nothing here calls ADO — this module owns state only.
//
// Why this is a factory returning an instance, not five bare module-level
// `let` arrays (which is how it lived in index.js before this extraction):
// a technical review of this codebase (Thor, FabricSpecs Avengers,
// 2026-08-09) found the five arrays already formed one aggregate with real
// cross-array coupling — folders can't be deleted while they still contain a
// staged file, `stagedTotal()` sums all five, and a caller elsewhere in
// index.js (`loadPersonalComments`/`savePersonalComments`) read `_stagedFiles`
// directly, reaching across the boundary rather than going through a staging
// function. That direct-reach caller is the reason `getFiles()` exists below
// as an explicit, intentional escape hatch (still snapshot-safe) rather than
// something calling code has to fish a private array out for on its own.
// Extracting only a subset of the five (e.g. just the file functions) would
// have split that aggregate across two owners — reviewed and rejected.
//
// `listStagedBranches()` returns SNAPSHOTS (shallow copies), not the live
// internal arrays — the pre-extraction version returned the arrays
// themselves, so a caller holding that reference could mutate staged state
// without going through a staging function at all. This is deliberately
// fixed here, not preserved as "current behavior."
//
// `unstageFile` calls the injected `deletePersonalComments(repo, branch,
// path)` so removing a staged file also cleans up its private annotations —
// unchanged behavior from before the extraction, just via a constructor arg
// instead of a free import.

export function createStagedInventory({ deletePersonalComments } = {}) {
  let _stagedBranches = [];
  let _stagedFiles = [];
  let _stagedFolders = [];
  let _stagedPrs = [];
  let _stagedPrPublishes = [];

  function stagedTotal() {
    return _stagedBranches.length + _stagedFiles.length + _stagedFolders.length + _stagedPrs.length + _stagedPrPublishes.length;
  }

  // Snapshot accessors for the ADO-calling orchestration (pushStagedBranches,
  // publishStagedPrs) that stays in index.js — it plans against these lists
  // (via the already-pure planStagedPushes) but does not need live references,
  // only the current values at the moment of push.
  function snapshot() {
    return {
      branches: _stagedBranches.slice(),
      files: _stagedFiles.slice(),
      folders: _stagedFolders.slice(),
      prs: _stagedPrs.slice(),
      prPublishes: _stagedPrPublishes.slice(),
    };
  }
  function removeBranchesMatching(pred) { _stagedBranches = _stagedBranches.filter((i) => !pred(i)); }
  function removeFilesMatching(pred) { _stagedFiles = _stagedFiles.filter((i) => !pred(i)); }
  function removeFoldersMatching(pred) { _stagedFolders = _stagedFolders.filter((i) => !pred(i)); }
  function removePrsMatching(pred) { _stagedPrs = _stagedPrs.filter((i) => !pred(i)); }
  function setPrPublishes(list) { _stagedPrPublishes = list; }

  function listStagedBranches() {
    return {
      ok: true,
      count: stagedTotal(),
      branches: _stagedBranches.slice(),
      files: _stagedFiles.slice(),
      folders: _stagedFolders.slice(),
      prs: _stagedPrs.slice(),
      prPublishes: _stagedPrPublishes.slice(),
    };
  }

  // --- branches --------------------------------------------------------
  function stageBranch({ org, project, repo, repoName, branch, base } = {}) {
    const name = String(branch || "").trim();
    if (!name) return { ok: false, error: "branch name is required" };
    if (!repo) return { ok: false, error: "repo is required" };
    if (_stagedBranches.some((s) => s.repo === repo && s.branch === name)) return { ok: false, error: "that branch is already staged" };
    _stagedBranches.push({ org, project, repo, repoName: repoName || "", branch: name, base: String(base || "").trim() });
    return { ok: true, count: _stagedBranches.length, branches: _stagedBranches.slice() };
  }
  function unstageBranch({ repo, branch } = {}) {
    const before = _stagedBranches.length;
    _stagedBranches = _stagedBranches.filter((s) => !(s.repo === repo && s.branch === branch));
    return { ok: true, removed: before - _stagedBranches.length, count: _stagedBranches.length, branches: _stagedBranches.slice() };
  }
  // Walk the staged-base chain to the nearest real (or default) branch name —
  // used when a folder/file listing needs an actual ADO ref because the
  // staged branch itself doesn't exist on the remote yet.
  function resolveEffectiveBranch(repo, branch) {
    let cur = String(branch || "").trim();
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const st = _stagedBranches.find((s) => s.repo === repo && s.branch === cur);
      if (!st) return cur;
      cur = String(st.base || "").trim() || "main";
    }
    return cur || "main";
  }

  // --- files -------------------------------------------------------------
  function stageFile({ org, project, repo, repoName, branch, title, folder, path } = {}) {
    const t = String(title || "").trim();
    const fdr = normFolder(folder);
    let name = t;
    if (name && /\.[^./\\]+$/.test(name) && !/\.md$/i.test(name)) return { ok: false, error: "only .md files can be added to a branch" };
    if (name && !/\.md$/i.test(name)) name += ".md";
    const filePath = String(path || "").trim() || (name ? (fdr ? fdr + "/" : "") + name : "");
    if (!filePath) return { ok: false, error: "title is required" };
    if (!/\.md$/i.test(filePath)) return { ok: false, error: "only .md files can be added to a branch" };
    if (!repo || !branch) return { ok: false, error: "repo and branch are required" };
    if (_stagedFiles.some((f) => f.repo === repo && f.branch === branch && f.path === filePath)) return { ok: false, error: "that file is already staged" };
    _stagedFiles.push({ org, project, repo, repoName: repoName || "", branch, title: name || filePath, path: filePath, content: "", personalComments: [] });
    return { ok: true, count: stagedTotal(), files: _stagedFiles.filter((f) => f.repo === repo && f.branch === branch) };
  }
  function unstageFile({ repo, branch, path } = {}) {
    const removing = _stagedFiles.filter((f) => !f.existing && f.repo === repo && f.branch === branch && f.path === path);
    try {
      if (deletePersonalComments) for (const file of removing) deletePersonalComments(file.repo, file.branch, file.path);
    } catch (e) {
      return { ok: false, error: `could not remove annotations: ${e.code || e.message}` };
    }
    const before = _stagedFiles.length;
    _stagedFiles = _stagedFiles.filter((f) => !(f.repo === repo && f.branch === branch && f.path === path));
    return { ok: true, removed: before - _stagedFiles.length, count: stagedTotal() };
  }
  function updateStagedFileContent({ repo, branch, path, content } = {}) {
    const f = _stagedFiles.find((x) => x.repo === repo && x.branch === branch && x.path === path);
    if (!f) return { ok: false, error: "staged file not found" };
    f.content = String(content == null ? "" : content);
    return { ok: true };
  }
  // Staged edit to an EXISTING (already-pushed) ADO file: upsert an entry
  // flagged existing:true so it counts as a staged change and diffs against
  // the original, without a direct commit. Pushed later with the rest.
  function saveExistingEdit({ org, project, repo, repoName, branch, path, content, baseObjectId } = {}) {
    if (!repo || !branch || !path) return { ok: false, error: "repo, branch and path are required" };
    const body = String(content == null ? "" : content);
    const f = _stagedFiles.find((x) => x.repo === repo && x.branch === branch && x.path === path);
    if (f) { f.content = body; f.existing = true; f.baseObjectId = f.baseObjectId || baseObjectId || null; return { ok: true, count: stagedTotal(), files: _stagedFiles.filter((x) => x.repo === repo && x.branch === branch) }; }
    const title = String(path).split("/").pop().replace(/\.md$/i, "");
    _stagedFiles.push({ org, project, repo, repoName: repoName || "", branch, title, path, content: body, existing: true, baseObjectId: baseObjectId || null });
    return { ok: true, count: stagedTotal(), files: _stagedFiles.filter((x) => x.repo === repo && x.branch === branch) };
  }
  // The one function that reaches ACROSS the module's own boundary on
  // purpose: a staged (unpushed) file's personal comments live on the staged
  // entry itself (there is nothing durable to key them to yet), while a
  // pushed file's comments live in the personal-comments-store. This is the
  // explicit seam for that dual lookup, not a caller reaching into a private
  // array — see the header note.
  function getFiles(repoId, branch, filePath) {
    return _stagedFiles.find((f) => !f.existing && f.repo === repoId && f.branch === branch && f.path === filePath) || null;
  }
  // General-purpose lookup, unlike getFiles: matches an existing (already-
  // pushed) staged edit too. Used by the branch-file editor route, which
  // needs to know a file IS staged (either kind) to pick the right view.
  function findFile(repo, branch, path) {
    return _stagedFiles.find((f) => f.repo === repo && f.branch === branch && f.path === path) || null;
  }
  function setFilePersonalComments(repoId, branch, filePath, comments) {
    const staged = getFiles(repoId, branch, filePath);
    if (!staged) return false;
    staged.personalComments = comments;
    return true;
  }

  // --- PR intents ----------------------------------------------------------
  function stageSpecPr({ org, project, repo, repoName, title, sourceBranch, targetBranch, description, isDraft, workItemTitle, workItemType } = {}) {
    const branch = String(sourceBranch || "").replace(/^refs\/heads\//, "").trim();
    if (!org || !project || !repo || !title || !branch || !targetBranch) return { ok: false, error: "org, project, repo, title, sourceBranch and targetBranch are required" };
    if (workItemTitle && !workItemType) return { ok: false, error: "workItemType is required when workItemTitle is set" };
    if (_stagedPrs.some((pr) => pr.repo === repo && pr.branch === branch)) return { ok: false, error: "that branch already has a staged PR intent" };
    _stagedPrs.push({ org, project, repo, repoName: repoName || "", branch, title, sourceBranch: branch, targetBranch, description, isDraft: isDraft !== false, workItemTitle, workItemType });
    return { ok: true, count: stagedTotal(), prs: _stagedPrs.slice() };
  }
  function unstageSpecPr({ repo, branch } = {}) {
    const before = _stagedPrs.length;
    _stagedPrs = _stagedPrs.filter((pr) => !(pr.repo === repo && pr.branch === branch));
    return { ok: true, removed: before - _stagedPrs.length, count: stagedTotal(), prs: _stagedPrs.slice() };
  }

  // --- PR publish (draft -> published) intents ------------------------------
  function stagePrPublish({ org, project, repo, repoName, pullRequestId, title } = {}) {
    const id = Number(pullRequestId);
    if (!org || !project || !repo || !Number.isFinite(id)) return { ok: false, error: "org, project, repo and pullRequestId are required" };
    if (_stagedPrPublishes.some((p) => p.pullRequestId === id)) return { ok: false, error: "that PR is already staged to publish" };
    _stagedPrPublishes.push({ org, project, repo, repoName: repoName || "", pullRequestId: id, title: title || "" });
    return { ok: true, count: stagedTotal(), prPublishes: _stagedPrPublishes.slice() };
  }
  function unstagePrPublish({ pullRequestId } = {}) {
    const id = Number(pullRequestId);
    const before = _stagedPrPublishes.length;
    _stagedPrPublishes = _stagedPrPublishes.filter((p) => p.pullRequestId !== id);
    return { ok: true, removed: before - _stagedPrPublishes.length, count: stagedTotal(), prPublishes: _stagedPrPublishes.slice() };
  }

  // --- folders ---------------------------------------------------------
  function _folderHasStagedFile(repo, branch, folderPath) {
    const f = normFolder(folderPath);
    return _stagedFiles.some((x) => x.repo === repo && x.branch === branch && (normFolder(x.path) + "/").startsWith(f + "/"));
  }
  function _folderHasChild(repo, branch, folderPath) {
    const f = normFolder(folderPath);
    return _stagedFolders.some((y) => y.repo === repo && y.branch === branch && normFolder(y.path) !== f && (normFolder(y.path) + "/").startsWith(f + "/"));
  }
  function createStagedFolder({ org, project, repo, branch, path } = {}) {
    const pn = normFolder(path);
    if (!pn) return { ok: false, error: "folder name is required" };
    if (!repo || !branch) return { ok: false, error: "repo and branch are required" };
    const name = pn.split("/").pop();
    if (/[\\/:*?"<>|]/.test(name)) return { ok: false, error: "invalid folder name" };
    if (_stagedFolders.some((f) => f.repo === repo && f.branch === branch && normFolder(f.path) === pn)) return { ok: false, error: "folder already exists" };
    _stagedFolders.push({ org, project, repo, branch, path: pn });
    return { ok: true, path: pn };
  }
  function deleteStagedFolder({ repo, branch, path } = {}) {
    const pn = normFolder(path);
    const idx = _stagedFolders.findIndex((f) => f.repo === repo && f.branch === branch && normFolder(f.path) === pn);
    if (idx < 0) return { ok: false, error: "only folders you created can be deleted" };
    if (_folderHasStagedFile(repo, branch, pn) || _folderHasChild(repo, branch, pn)) return { ok: false, error: "folder is not empty" };
    _stagedFolders.splice(idx, 1);
    return { ok: true };
  }
  function renameStagedFolder({ repo, branch, path, newName } = {}) {
    const pn = normFolder(path);
    const f = _stagedFolders.find((x) => x.repo === repo && x.branch === branch && normFolder(x.path) === pn);
    if (!f) return { ok: false, error: "only folders you created can be renamed" };
    if (_folderHasStagedFile(repo, branch, pn) || _folderHasChild(repo, branch, pn)) return { ok: false, error: "folder is not empty" };
    const nn = String(newName || "").trim();
    if (!nn) return { ok: false, error: "folder name is required" };
    if (/[\\/:*?"<>|]/.test(nn)) return { ok: false, error: "invalid folder name" };
    const parent = parentFolder(pn);
    const newPath = parent ? parent + "/" + nn : nn;
    if (newPath !== pn && _stagedFolders.some((x) => x.repo === repo && x.branch === branch && normFolder(x.path) === newPath)) return { ok: false, error: "folder already exists" };
    f.path = newPath;
    return { ok: true, path: newPath };
  }
  // Read-only helper for listBranchFolders (stays in index.js — it calls ADO):
  // the staged folders in scope for a given (repo, branch, parent path).
  function stagedFoldersUnder(repo, branch, scopePath) {
    return _stagedFolders.filter((f) => f.repo === repo && f.branch === branch && parentFolder(normFolder(f.path)) === normFolder(scopePath));
  }

  return {
    stagedTotal, snapshot, listStagedBranches,
    removeBranchesMatching, removeFilesMatching, removeFoldersMatching, removePrsMatching, setPrPublishes,
    stageBranch, unstageBranch, resolveEffectiveBranch,
    stageFile, unstageFile, updateStagedFileContent, saveExistingEdit, getFiles, findFile, setFilePersonalComments,
    stageSpecPr, unstageSpecPr,
    stagePrPublish, unstagePrPublish,
    createStagedFolder, deleteStagedFolder, renameStagedFolder, stagedFoldersUnder,
    _folderHasStagedFile, _folderHasChild,
  };
}

// Pure path helpers — no state, kept alongside the store since every staged
// entity is keyed by a normalized folder path. Exported standalone (not
// methods on the instance) because listBranchFolders in index.js also needs
// them directly for ADO-side paths that never touch the staged arrays.
export function normFolder(p) { return String(p == null ? "" : p).replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""); }
export function parentFolder(p) { const n = normFolder(p); const i = n.lastIndexOf("/"); return i < 0 ? "" : n.slice(0, i); }
export function isUnder(childPath, folderPath) { const c = normFolder(childPath), f = normFolder(folderPath); return c === f || (f === "" ? true : (c + "/").startsWith(f + "/")); }
