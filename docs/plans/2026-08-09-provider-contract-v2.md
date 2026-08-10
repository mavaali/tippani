# GitHub provider for tippani — design v2 (capability-split contract)

**Date:** 2026-08-09
**Supersedes:** [2026-07-13-github-provider-design.md](2026-07-13-github-provider-design.md) — the original `ReviewProvider` contract is retained as one of six capability interfaces below, unchanged in shape. Nothing in that doc's GitHub-mapping research (threads, viewed-state, commitFile) is invalidated; it is incorporated by reference in the "Review & comment" section.
**Status:** Design proposed; implementation not started.
**Why superseded:** The July design audited 55 call sites across two files and proposed one interface. Since then, "clickstop-2" (PR #71, merged) added end-to-end remote spec authoring — stage a branch, add folders and files, open a PR, link a work item, publish everything in one push — plus Discovery's work-item search and full-text spec search, and #68's image/Git-LFS blob proxy. Re-auditing the current `main` (tag `v1.7.0`) finds **30 distinct Azure DevOps SDK methods across 45 call sites in two files** (`src/index.js`, `src/ado-read.js`) — a larger and functionally broader surface than "review + single-file commit." A twelve-method interface scoped to review cannot express any of it. Per the original doc's own framing: *"the interface is the whole bet."* This revises the bet before a GitHub port is built against a contract already known to be too small.

## Re-audit — the real surface (verified against `main` @ `v1.7.0`)

Counted directly (`grep -oE 'gitApi\.[a-zA-Z]+\(|coreApi\.[a-zA-Z]+\(|witApi\.[a-zA-Z]+\(|conn\.rest\.[a-zA-Z]+\('`), not by counting `getGitApi()`/`getCoreApi()`/`getWorkItemTrackingApi()` factory calls (the July doc's "55 call sites" figure was closer to counting factory acquisitions than distinct backend operations — a methodology mismatch worth naming since it understates what a GitHub port must reimplement).

| Cluster | SDK methods used | Call sites | Where |
|---|---|---:|---|
| PR read/write, review vote | `getPullRequestById`, `getPullRequestsByProject`, `getPullRequestQuery`, `getPullRequestIterations`, `getPullRequestIterationChanges`, `getCommitDiffs`, `createPullRequest`, `createPullRequestReviewer`, `updatePullRequest` | 9 | `index.js` |
| Threads / comments | `getThreads`, `createThread`, `updateThread`, `createComment` | 5 | `index.js` |
| Viewed-state (PR property) | `getPullRequestProperties`, `updatePullRequestProperties` | 2 | `index.js` |
| File/content read | `getItemContent`, `getItems` | 6 | `index.js` (4), `ado-read.js` (2) |
| Branches, commits, pushes | `getRefs`, `updateRefs`, `createPush`, `getRepository`, `getRepositories`, `getCommits` | 15 | `index.js` (14), `ado-read.js` (`getCommits`, 1 site) |
| Project listing | `getProjects` | 1 | `index.js` |
| Work items | `queryByWiql`, `createWorkItem`, `updateWorkItem`, `getWorkItems` | 5 | `index.js` |
| Cross-org / code search (REST, no typed SDK method) | `conn.rest.get` (org-wide PR list), `conn.rest.create` (ADO Code Search) | 2 | `index.js` |

**30 distinct methods, 45 call sites.** Plus one thing with no SDK method at all: `getImageBlob` (index.js:432) calls `getItemContent` with `resolveLfs: true` and pairs it with `isLfsPointer()` (`image-src.js`) to detect and reject a still-pointer response — this is a *behavior*, not just a method, and a GitHub provider needs an equivalent (GitHub's Contents API auto-resolves LFS via `Accept: application/vnd.github.raw`, so the shape differs, not just the transport).

## Architecture — six capability interfaces, not one

Thor's review of this codebase's provider design (2026-08-09) argued a single `ReviewProvider` covering all 30 methods becomes exactly the kind of leaky, over-wide interface the original doc warned against — a `GitHubProvider` would have to either fake support for capabilities GitHub can't cleanly provide (there is no GitHub concept matching ADO's WIQL work-item query, for instance) or the interface silently grows unrelated methods onto an object nominally about "reviewing a PR." Splitting by capability lets each interface stay small, lets a provider legitimately decline a capability it can't support (rather than throwing inside a method that claims to be universal), and keeps the original `ReviewProvider`'s already-researched GitHub mapping (threads via GraphQL `reviewThreads`, viewed-state via a marker comment, `commitFile` via the Contents API `sha` token) untouched.

```
// Unchanged from the July design — this is the whole GitHub-mapping research
// in that doc and remains valid. Every AdoProvider method here already exists
// in src/index.js under a different name (see mapping table below).
interface ReviewProvider {
  connect(auth)
  getPullRequest(id) -> PR
  listChangedFiles(pr) -> [{path, changeType}]
  getFileContent(path, ref) -> string
  listThreads(pr) -> [Thread]
  createComment(pr, {filePath, line, body}) -> Thread
  replyToThread(threadId, body)
  resolveThread(threadId) / unresolve(threadId)
  getViewed(pr) -> {threadId: commentId}
  setViewed(pr, map)
  getFileReviewHistory(repo, path, branch) -> [{pr, threads}]
  commitFile(pr, {path, content, message, baseSha}) -> commitId
  getBranchTip(branch) -> sha
  submitReview(pr, vote) -> void          // NEW: the #72 approve/request-changes
                                           // vote never had a provider method —
                                           // it called gitApi directly. Folding
                                           // it in here, not a new interface,
                                           // since it's a review-scoped action.
}

// New. Backs clickstop-2's remote authoring (stage_branch -> stage_spec ->
// stage_spec_pr -> push_staged_changes) and Discovery's Branches tab.
interface RepoContentProvider {
  resolveRepository(repo, project) -> Repository
  listRepositories(project) -> [Repository]
  listBranches(repo) -> [{name, isDefault}]
  createBranch(repo, {name, fromRef}) -> ref
  getBranchTip(repo, branch) -> sha           // shared shape with ReviewProvider;
                                               // same op, no PR context required
  getText(repo, path, branch) -> string
  listItems(repo, branch, path) -> [Item]      // folder projection/merging with
                                               // local staged folders stays above
                                               // the provider line
  getFileCommits(repo, path, branch, top) -> [Commit]
  diffBranches(repo, base, target) -> [Change]
  pushFiles(repo, branch, {files:[{path,content}], message, expectedOldObjectId}) -> commitId
                                               // multi-file, all-or-nothing —
                                               // ADO's createPush already takes
                                               // a change array; this is NOT a
                                               // new capability, just the plural
                                               // form of ReviewProvider.commitFile
}

// New. The "open a PR from a staged branch" half of clickstop-2.
interface AuthoringProvider {
  createPullRequest(repo, {title, description, sourceBranch, targetBranch, isDraft}) -> PR
  publishPullRequest(repo, pullRequestId) -> PR
}

// New. Two structurally different searches that happen to share a UI tab.
interface SearchProvider {
  searchSpecs(repo, query) -> [{path, snippet}]     // ADO: Code Search REST API
                                                     // (almsearch.dev.azure.com)
  searchPullRequests(criteria) -> [PR]              // ADO: org-wide PR list via
                                                     // conn.rest.get — this is
                                                     // the ONE existing capability
                                                     // with no typed SDK method,
                                                     // already a raw REST call
}

// New. WIQL is ADO-specific; there is no query-language equivalent on GitHub.
// Kept as its OWN interface (not folded into SearchProvider) specifically SO
// a GitHubProvider can decline it outright rather than faking a WIQL dialect
// against GitHub Issues. See "Capability gaps" below.
interface WorkItemProvider {
  queryWorkItemRefs(project, wiql) -> [{id}]
  getWorkItems(project, ids, fields) -> [WorkItem]
  createWorkItem(project, type, patch) -> WorkItem
  updateWorkItem(id, patch, project?) -> WorkItem
  linkToPullRequest(workItemId, {projectId, repositoryId, pullRequestId}) -> WorkItem
}

// New. Isolated because the LFS-pointer-detection behavior (not just the
// transport) is backend-specific, and because it is the one capability a
// provider can be "read-only + resolve" for without touching write paths at all.
interface BlobProvider {
  getBlob(repo, path, ref) -> {bytes, contentType}   // MUST resolve LFS pointers
                                                       // server-side, matching
                                                       // getImageBlob's contract
}
```

### Mapping current `index.js` functions to the new interfaces

| Current function (index.js) | Interface | Method |
|---|---|---|
| `getPullRequest` | ReviewProvider | `getPullRequest` |
| `listPullRequests` | ReviewProvider | PR listing — folds into `ReviewProvider` as a thin wrapper; low-risk, mechanical |
| `listOrgPullRequests` | SearchProvider | `searchPullRequests` |
| `getFileContent` | ReviewProvider | `getFileContent` |
| `getImageBlob` | BlobProvider | `getBlob` |
| `getPRChangedFiles` | ReviewProvider | `listChangedFiles` |
| `getCommentThreads` / `createCommentThread` / `replyToThread` / `resolveThread` | ReviewProvider | `listThreads` / `createComment` / `replyToThread` / `resolveThread` |
| `submitReviewVote` (added in #72) | ReviewProvider | `submitReview` — **new method, not in the July contract at all** |
| `readViewedMap` / `getViewedMap` / `setViewedMap` | ReviewProvider | `getViewed` / `setViewed` |
| `getFileReviewHistory` | ReviewProvider | `getFileReviewHistory` — raw PR/thread history; markdown rendering stays above the provider line |
| `getBranchTip` / `pushFileToBranch` | ReviewProvider (PR-bound single file) **and** RepoContentProvider (branch-bound, no PR) | Two call shapes for the same ADO operation, split by whether a PR is in scope — matches clickstop-1's "a branch is a first-class review surface without a PR" design |
| `resolveTarget`, `pushRemoteSpec`, `stageBranch` → `mcpCreateBranch` | RepoContentProvider | `createBranch`, `pushFiles` |
| `listBranchFolders` | RepoContentProvider | `listItems` — merging with local staged folders and UI shaping stays above the provider line |
| Discovery branch/repository listing | RepoContentProvider | `listRepositories`, `listBranches` |
| `getFileCommits` / `getLastCommitAuthor` | RepoContentProvider | `getFileCommits` |
| `listBranchFiles` | RepoContentProvider | `resolveRepository`, `diffBranches` |
| `openPr`, `publishStagedPrs` | AuthoringProvider | `createPullRequest`, `publishPullRequest` |
| work-item search/create/link (index.js ~7982-7998, ~6594-6598) | WorkItemProvider | `queryWorkItemRefs`, `getWorkItems`, `createWorkItem`, `updateWorkItem`, `linkToPullRequest` |
| code search (index.js ~8015-8023) | SearchProvider | `searchSpecs` |

## `AdoProvider` — implements all six

One class, six interfaces, because a single backend naturally supports all six today — the split is about the *contract*, not about forcing ADO into six separate client objects. `AdoProvider` is the mechanical extraction: same 45 call sites, same behavior, now behind named methods, still covered by the current 58 (soon 59) test suites via integration tests added at the route layer (see "What this design does NOT claim" below).

## `GitHubProvider` — capability-by-capability feasibility

| Interface | GitHub feasibility | Notes |
|---|---|---|
| `ReviewProvider` | **Full.** Already researched in the July doc — GraphQL `reviewThreads`, REST comment/reply, GraphQL `resolveReviewThread`, Contents API `sha` for `commitFile`, marker-comment for viewed-state. `submitReview` (new) maps to `POST /pulls/{n}/reviews` with `event: APPROVE`/`REQUEST_CHANGES`. |
| `RepoContentProvider` | **Full.** `POST /git/refs` (branch create), `GET /git/ref/heads/{branch}` (tip), Contents API or Git Data API tree/commit endpoints for multi-file push (a single-file `PUT /contents` per file is NOT atomic across files the way ADO's `createPush` change-array is — this is a real gap, not a naming one: a multi-file stage-then-push on GitHub needs the lower-level Git Data API, building a tree and one commit, to preserve the "all-or-nothing" guarantee clickstop-2 promises). `listFolders` — `GET /contents/{path}` non-recursive listing. |
| `AuthoringProvider` | **Full.** Create via `POST /pulls`; publish a draft through GraphQL `markPullRequestReadyForReview`. Work-item linking is not an authoring capability — it belongs to the optional `WorkItemProvider` below. |
| `SearchProvider` | **`searchSpecs`: full** via the GitHub code search API (`GET /search/code`), same `ext:md` filter pattern. **`searchPullRequests`: full** via `GET /search/issues?q=type:pr`. |
| `WorkItemProvider` | **Does not exist on GitHub as designed.** GitHub Issues has no query language equivalent to WIQL, no typed "work item type" (Feature/Bug/Task), and no field schema. A `GitHubProvider` should implement this interface as **unsupported** (each method returns a capability-not-available error, or the interface is simply absent and callers check `provider.workItems ?? null` before use) rather than emulating WIQL against GitHub's REST search syntax — that emulation would silently produce wrong results for any nontrivial query, which is worse than a clear "not supported here." |
| `BlobProvider` | **Full**, and simpler than ADO: `GET /repos/{o}/{r}/contents/{path}` with `Accept: application/vnd.github.raw` auto-resolves Git LFS server-side (when the repo has GitHub's LFS support enabled) — no separate pointer-detection step is needed on the GitHub side, though `isLfsPointer()` should stay as a defensive check in case LFS isn't configured, matching the "fail loudly, don't stream pointer bytes as an image" behavior from #68. |

## Capability gaps are a first-class, visible design element

The July doc's model was "one stable interface, dialect-specific calls hidden below the line" — appropriate when every method has a GitHub equivalent. `WorkItemProvider` does not. Rather than stretch the contract to cover it badly, a provider capability check is part of the contract itself:

```
interface Provider {
  review: ReviewProvider
  repoContent: RepoContentProvider
  authoring: AuthoringProvider
  search: SearchProvider
  workItems: WorkItemProvider | null   // null on GitHubProvider
  blobs: BlobProvider
}
```

The portal/MCP layer checks `provider.workItems` before exposing work-item search or linking in the UI/tool list for a GitHub-backed session, rather than calling a method that throws. This is a UX decision as much as an interface one: a PM using tippani against a GitHub repo should see a Discovery home *without* a Work Items tab, not a Work Items tab that errors on click.

## Phasing (revised)

- **Phase 0 — provider interface, six capabilities.** Extract all 45 call sites (not 55 factory-adjusted, not the smaller review-only set) into `AdoProvider` implementing all six interfaces. Zero behavior change; existing tests hold, plus new route-level integration tests (see companion plan). This is larger than the July Phase 0 but is the actual current surface — deferring any of the six defers the correctness of the interface itself, per Thor's review.
- **Phase 1 — GitHub `ReviewProvider` + `RepoContentProvider` + `BlobProvider`.** The three fully-supported capabilities: render, comment, WYSIWYG edit + commit, single-file and multi-file push, image/LFS. Usable end-to-end for read/comment/edit/author-without-PR-metadata.
- **Phase 2 — GitHub `AuthoringProvider` + `SearchProvider`.** PR creation/publish, code search, PR search.
- **Phase 3 — `WorkItemProvider` explicitly absent.** Portal/MCP hide work-item UI and tools when `provider.workItems === null`. Not "Phase 3 implements it differently" — Phase 3 is making the absence a clean, visible product decision instead of a silent gap.

Phase 0 still ships first and still "proves the interface against the known backend before GitHub stresses it" (unchanged reasoning from the July doc) — it is just no longer scoped to a contract already known to be a third smaller than what the codebase needs.

## What this design does NOT claim

Per the companion coverage-hardening plan (Fury/Thor review, 2026-08-09): extracting `AdoProvider` behind these interfaces does not, by itself, catch the class of bug that actually shipped in this codebase (a route returning success without calling the backend; a bundler rewriting `import.meta.url` and double-booting a server). Those require route-level integration tests and built-artifact smokes respectively — orthogonal to, and prerequisite alongside, this contract work. This document is scoped to *what the interface should look like*, not to *proof that extracting it reduces the demonstrated risk*; that proof comes from the tests, not from the shape of the code.

## NOT in scope (unchanged from July, still holds)

- A generic N-provider platform. ADO + GitHub only.
- GitHub's native per-file "viewed" checkbox — different feature, not parity.
- GitHub Enterprise Server host configuration — github.com first.
- Migrating existing ADO viewed-state across providers.
- Emulating `WorkItemProvider` against GitHub Issues — explicitly ruled out above, not merely deferred.
