# GitHub provider for tippani — design

**Date:** 2026-07-13
**Status:** Superseded by [2026-08-09-provider-contract-v2.md](2026-08-09-provider-contract-v2.md) — the `ReviewProvider` contract below is still valid and is retained unchanged as one of six capability interfaces in v2. The single-interface framing and the "55 call sites" coupling audit are what's superseded: clickstop-2 (PR #71) added remote authoring, work-item linking, and search that this contract cannot express. Read v2 first; this doc's GitHub-mapping research (threads, viewed-state, commitFile) remains the source of truth for those specific methods.
**Outcome:** Run tippani's full read / annotate / edit / commit workflow against GitHub pull requests, at parity with the Azure DevOps experience, without forking the codebase.

## Why

A concrete need: reviewing markdown spec PRs that live on GitHub with the same workspace tippani already gives ADO PRs. GitHub's native review UI is competent, so the value tippani adds is not a friendlier review pane — it is the WYSIWYG spec editor that commits back to the PR branch and the agent-drivable stage-then-review MCP workflow. Those two capabilities carry the port; the review surface comes along because parity is the goal.

## Coupling audit

The Azure DevOps SDK appears in exactly two files: `src/index.js` (55 call sites) and `src/config-util.js`. Every other layer is already provider-agnostic — the browser portal, the CodeMirror editor, the diff overlay, `spec-source-map.js`, `table-diff.js`, `viewed-map.js`, the control API, and the 19-tool MCP shim all carry zero ADO awareness. The port swaps one client module behind an interface; it does not touch the UX stack.

## Architecture — the `ReviewProvider` contract

The UI, control API, and MCP layer already consume a neutral shape: `{id, status, comments:[{id, author, publishedDate, content}], threadContext:{filePath, rightFileStart:{line}}}`, plus `changedFiles:[{path, changeType}]` and `viewedMap:{threadId: commentId}`. That shape becomes the contract. Each provider translates its backend into it, and nothing above the provider changes.

```
interface ReviewProvider {
  connect(auth)
  getPullRequest(id) -> PR                 // {id, title, author, sourceBranch}
  listChangedFiles(pr) -> [{path, changeType}]
  getFileContent(path, ref) -> string
  listThreads(pr) -> [Thread]              // the neutral shape above
  createComment(pr, {filePath, line, body}) -> Thread
  replyToThread(threadId, body)
  resolveThread(threadId) / unresolve(threadId)
  getViewed(pr) -> {threadId: commentId}
  setViewed(pr, map)
  commitFile(pr, {path, content, message, baseSha}) -> commitId
  getBranchTip(branch) -> sha
}
```

`AdoProvider` is a mechanical extraction of the existing 55 call sites — same behavior, now behind the interface, still covered by the current tests. `GitHubProvider` implements the same twelve methods against Octokit. The model is an ORM dialect: one stable interface, dialect-specific calls hidden below the line.

## GitHubProvider — the two hard methods

Ten of the twelve methods are near-direct swaps. Two fight back.

### Threads, comments, resolve

GitHub groups review comments into review threads, but only GraphQL exposes them with resolve state.

- **Read (`listThreads`):** query `pullRequest.reviewThreads` — each node gives `isResolved`, `path`, `line`/`originalLine`/`startLine`, and `comments.nodes[{id, author, body, createdAt}]`. Map `id -> thread.id` (an opaque node id; tippani already treats thread ids as opaque), `isResolved -> status`, `path -> threadContext.filePath`, `line ?? originalLine -> rightFileStart.line`, comments straight across.
- **Write:** `createComment` posts a single-comment review via REST (`POST /pulls/{n}/comments` with `commit_id`, `path`, `line`, `side: RIGHT`); `replyToThread` via `POST .../comments/{id}/replies`; `resolveThread` via GraphQL `resolveReviewThread` (no REST equivalent).
- **Line anchoring:** ADO gives an absolute right-side file line, exactly what the source-map consumes; GitHub's `line` + `side: RIGHT` is the same. When new commits land, a comment can go outdated and report `originalLine`; the overlay already falls back to the nearest source-mapped block, so it still lands sensibly.
- GitHub has no system-comment type, so `classifyThread`'s system branch simply never fires — harmless.

### Viewed-state — minimized marker comment

ADO stores `tippani.viewed = {threadId: commentId}` in a PR property. GitHub has no property store. `viewed-map.js` (`parseViewedMap`, `updateViewed`, and the read-fail guard) is already provider-agnostic, so only the transport changes.

Store the JSON in one bot PR comment tagged with an HTML marker (`<!-- tippani:viewed ... -->`) and collapsed via GraphQL `minimizeComment`. Read finds and parses it; write PATCHes it. This preserves exact parity — durable, shared, one updatable blob, per-thread — and reuses the concurrency guard verbatim.

## Rest of the surface

- **Auth:** replace `TIPPANI_ADO_TOKEN` with `TIPPANI_GH_TOKEN` (fine-grained PAT or `gh auth token`). No JWT-audience check, so `ado-token-check.js` reduces to a token-shape or `/user`-ping check. Scopes: PR read-write, contents read-write.
- **`commitFile`:** Contents API `PUT /repos/{o}/{r}/contents/{path}` with `branch`, message, and the file's current `sha`. That `sha` is GitHub's optimistic-concurrency token; it maps onto tippani's existing stale-push → 409 → reload flow. `getBranchTip` reads `GET /git/ref/heads/{branch}`.
- **PR identity:** tag the CLI (`tippani github:owner/repo#123`) and MCP `open_pr` with a provider. The portal registry is already provider-neutral.

## Phasing

- **Phase 0 — provider interface.** Extract the 55 ADO call sites into `AdoProvider` behind the contract. Zero behavior change; existing tests hold. De-bloats `index.js`.
- **Phase 1 — GitHub read + edit + commit.** The easy 80%: render, inline comment (REST), WYSIWYG edit, commit to branch. Usable end-to-end.
- **Phase 2 — threads + resolve.** GraphQL review threads mapped into the neutral shape.
- **Phase 3 — viewed-state.** The marker-comment backing.

Shipping Phase 0 first proves the interface against the known backend before GitHub stresses it.

## Failure modes

- **Runaway success:** GitHub rate limits (GraphQL point budgets, REST 5k/hr) bite before ADO would. A multi-PR agent session is the risk; the existing cache layer plus conditional (etag) requests mitigate it.
- **Failure:** provider throws already fall back to cached threads; commit conflicts hit the existing 409/reload path; a mis-mapped thread lands on the nearest block.
- **Six-month view:** the interface is the whole bet. Clean, and a third backend is cheap; leaky, and every feature forks.

## What already exists (reused, not rebuilt)

- Browser portal, CodeMirror WYSIWYG editor, diff overlay — provider-agnostic, unchanged.
- `spec-source-map.js`, `table-diff.js`, `viewed-map.js` — pure modules, unchanged.
- Control API and the 19-tool MCP shim (`mcp-tools.js`, `mcp.js`) — consume the neutral shape, unchanged.
- Portal launcher and registry — provider-neutral, unchanged.
- Optimistic-concurrency, cache-fallback, and staging flows — reused as-is.
- Octokit supplies the GitHub REST + GraphQL client.

## NOT in scope

- **A generic N-provider platform.** Design for ADO + GitHub only. A third backend is speculative; YAGNI.
- **GitHub's native per-file "viewed" checkbox** (`markFileAsViewed`). Per-file and personal, not per-thread and shared — a different feature, not parity. Possible later bonus integration.
- **GitHub Enterprise Server host configuration.** Assume github.com first; a base-URL knob is a later, small addition.
- **Migrating existing ADO viewed-state.** Each backend owns its own state; no cross-provider migration.
- **Review submission semantics** (approve / request-changes as a formal GitHub review). tippani posts comments and resolves threads; formal review verdicts are out.
