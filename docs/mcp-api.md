# Tippani MCP & API Reference

Tippani exposes its workflow two ways for automation:

- an **MCP server** (`tippani-mcp`) that gives an AI agent the same read /
  annotate / edit / author capabilities a person has in the portal; and
- an **HTTP control API** served by the portal itself, which the browser UI and
  external clients use.

Everything is **staged**: no MCP tool or control-API route writes to Azure
DevOps until the single publish step (`push_staged_changes` /
`POST /api/v1/branches/push`).

---

## MCP server

Start it as an MCP stdio server:

```bash
tippani-mcp
```

It registers **41 tools**. `open_pr` (or a Discovery tool like `list_prs` /
`search_specs`) launches a headless portal and returns a `portalUrl`; every
other tool then operates on that open session. A parameter marked `*` is
required.

### Reviewing a pull request

| Tool | Purpose | Parameters |
|---|---|---|
| `open_pr` | Open a spec PR in the review portal and load its threads and changed files. ADO is the default; for GitHub pass `provider:"github"`, `owner`, and `repo`. Returns a `portalUrl`. | `prId*`, `provider`, `owner`, `org`, `project`, `repo`, `refresh`, `headless` |
| `list_prs` | List PRs to review and open Discovery. Defaults to ADO; for GitHub pass `provider:"github"`, `owner`, and a repository anchor. | `provider`, `owner`, `repo`, `status`, `creator`, `reviewer`, `target`, `top` |
| `list_threads` | List every comment thread on the open PR with status, file, line, and comment count. | — |
| `get_thread` | Get the full content of one thread — every comment plus any staged draft. | `threadId` |
| `triage_summary` | Categorized triage of every thread: counts of needs-your-reply / awaiting-reviewer / viewed / FYI / resolved, plus a per-thread list. | — |
| `show_feedback` | Open the Feedback page — a cross-thread triage list for the whole PR. | — |
| `set_feedback_filter` | Focus the Feedback page by state(s), reviewer, file, and/or text query. `clear=true` shows all. | `states`, `reviewer`, `file`, `query`, `clear` |
| `open_thread` | Open one thread in a single-thread view with a reply box (shows any staged draft). | `threadId` |
| `focus_thread` | Scroll the browser to a thread and highlight it (`threadId=null` clears focus). | `threadId` |
| `set_view` | Switch the reading view of a file: `current`, `diff`, or `proposed`. Call after `edit_spec` — the view never auto-flips. | `view`, `fileIndex` |
| `open_file` | Open a changed file at the file view, optionally scrolled to a line. Read-only. | `fileIndex`, `line` |
| `get_spec` | Read the rendered Markdown of one PR file plus a flat heading list (level, text, 1-based line). | `fileIndex` |
| `get_file_commits` | Bulk commit history for up to 25 spec files (id, author/committer, message, change counts, url). | `files*`, `top` |

### Staged review replies and edits

| Tool | Purpose | Parameters |
|---|---|---|
| `stage_draft` | Stage a draft reply for the user to review and post; never auto-posts. 409 while the user is typing in that thread. | `threadId`, `content`, `source` |
| `clear_draft` | Remove a staged draft. Idempotent. | `threadId` |
| `get_spec_draft` | Read the current staged spec proposal for a PR file. Review-only. | `fileIndex` |
| `stage_resolve_thread` | Stage a thread resolution locally (shows as resolved-pending); pushed only by `push_staged_changes`. | `threadId` |
| `edit_spec` | Apply one or more anchored, atomic edits to a file and stage the result as a review-only draft. Never commits. | `fileIndex`, `edits`, `source` |
| `clear_spec_edit` | Remove a staged spec edit. Idempotent. | `fileIndex` |

### Annotations

Private notes anchored to a source line of the open spec — they persist locally,
survive edits, and never post to ADO.

| Tool | Purpose | Parameters |
|---|---|---|
| `read_annotations` | Read all annotations on the open spec file (id, anchor line, author, text, resolved) plus the selected one. | `repo`, `branch`, `path` |
| `add_annotation` | Add an annotation anchored to a source line; saves immediately and selects it. | `content*`, `line`, `repo`, `branch`, `path` |
| `edit_annotation` | Edit an annotation's text (defaults to the selected one). | `content*`, `id`, `repo`, `branch`, `path` |
| `delete_annotation` | Delete an annotation (defaults to the selected one). | `id`, `repo`, `branch`, `path` |
| `reply_annotation` | Post a follow-up reply on an annotation. | `content*`, `id`, `repo`, `branch`, `path` |
| `resolve_annotation` | Mark an annotation resolved (or reopen with `resolved=false`); `note` is posted as a reply first. | `id`, `resolved`, `note`, `repo`, `branch`, `path` |
| `delete_resolved_annotations` | Delete all resolved annotations on the open file. | — |
| `delete_all_annotations` | Delete every annotation on the open file. Irreversible. | — |
| `navigate_annotations` | Move selection next/prev/first/last and scroll to it. | `direction*` |
| `jump_to_annotation` | Select and scroll to an annotation by id or anchor line. | `id`, `line` |
| `show_resolved_annotations` | Show or hide resolved annotations in the open page. | `show` |

### Branch and file reading

| Tool | Purpose | Parameters |
|---|---|---|
| `open_branch` | Open the Branches file-list page for a branch (remote via `project`+`repo`+`branch`, or local clone via `localPath`+`branch`). | `project`, `repo`, `branch`, `localPath` |
| `open_branch_file` | Open one spec file read-only in the reviewing view for a branch. | `project`, `repo`, `branch`, `path`, `localPath` |
| `open_local_file` | Open one arbitrary `.md` file read-only by absolute path, restricted to an approved root. | `path*` |
| `refresh_spec` | Reload the open spec from source so an external change becomes visible. | — |

### Discovery search

| Tool | Purpose | Parameters |
|---|---|---|
| `search_specs` | Full-text search Markdown across ADO or GitHub and open the Specs tab. For GitHub pass `provider:"github"`, `owner`, and a repository anchor; `project` then selects an owner namespace. | `provider`, `owner`, `repo`, `query*`, `project` |
| `search_work_items` | Run a read-only WIQL query and open the Work items tab; results link out to ADO. | `wiql*`, `project` |

### Authoring (staged)

| Tool | Purpose | Parameters |
|---|---|---|
| `stage_branch` | Stage a branch creation. Nothing is created in ADO until push. | `project*`, `repo*`, `repoName`, `branch*`, `base`, `org` |
| `stage_spec` | Stage a whole-file spec add or update (set `existing=true` + `baseObjectId` when editing an existing file). | `project*`, `repo*`, `repoName`, `branch*`, `path*`, `body*`, `existing`, `baseObjectId`, `org` |
| `stage_spec_pr` | Stage a PR intent (and optional work-item link). Published after its branch and files. | `project*`, `repo*`, `title*`, `sourceBranch*`, `targetBranch*`, `isDraft`, `workItemTitle`, `workItemType`, `org` |
| `push_staged_changes` | Publish every staged branch, file, PR intent, reply, and resolution. The **only** MCP write to ADO; failures stay staged. | — |

> **Authoring rule (in every authoring tool's description):** author specs through
> Tippani's tools only — never edit files, push commits, or open PRs with raw git
> or the Azure DevOps MCP. `open_pr` is likewise the only supported way to review
> a spec PR.

---

## HTTP control API

The portal serves both the HTML pages and a JSON control API on
`http://localhost:<port>` (default `3847`). Read routes require an active
session; **mutating routes require the session bearer token** (sent by the UI
and by external clients) and every request must pass a **loopback host
allow-list** (localhost is not treated as an authentication boundary).

### Portal pages (HTML)

| Route | Screen |
|---|---|
| `GET /` | The current review portal home (the open PR). |
| `GET /open/:prId` | Open a PR into review. |
| `GET /discovery` | Discovery home. Tab via `?tab=specs\|queue\|workitems\|branches\|openfile`. |
| `GET /feedback` | The cross-thread Feedback page. |
| `GET /thread/:id` · `GET /goto/thread/:id` | A single thread; jump-to-thread. |
| `GET /spec` | A finished spec, read-only at a branch (by repo/branch/path). |
| `GET /branch` · `GET /local-branch` | A branch's file list (remote / local clone). |
| `GET /open-file-view?path=` | Open an arbitrary local `.md` read-only. |
| `GET /staged-file` | View a staged (not-yet-pushed) file. |
| `GET /file/:index` · `GET /file/:index/media` | A PR changed file (Current/Diff/Proposed) and its media. |
| `GET /spec/history` · `GET /spec/media` | A spec's commit history and media. |

### Session review API

| Route | Purpose |
|---|---|
| `POST /api/comment` | Post a comment / start a thread. |
| `POST /api/reply` | Reply on a thread. |
| `POST /api/resolve` | Resolve / reopen a thread. |
| `POST /api/save` | Save a spec edit. |
| `POST /api/review` | Submit an Approve / Request Changes review. |
| `POST /api/sync` · `GET /api/pending` | Sync queued offline changes; list pending items. |

### Control API (`/api/v1`)

All routes are prefixed `/api/v1`. Mutating routes (marked ✎) require the bearer.

**Feedback & threads**

| Route | Purpose |
|---|---|
| `GET /threads` · `GET /threads/:id` | List thread summaries; get one thread. |
| `GET /triage` | Triage summary of all threads. |
| `PUT /threads/:id/draft` ✎ · `DELETE /threads/:id/draft` ✎ | Stage / discard a reply draft. |
| `POST /threads/:id/lock` ✎ | Lock a thread's draft (edit coordination). |
| `POST /commands/focus` ✎ · `POST /nav` ✎ · `POST /commands/view` ✎ · `POST /commands/filter` ✎ | Drive the browser: focus a thread, navigate, switch view, filter feedback. |
| `POST /ado-token` ✎ | Supply / refresh the ADO bearer for the session. |

**Specs, drafts & edits**

| Route | Purpose |
|---|---|
| `GET /specs/:fileIndex` · `/:fileIndex/diff` · `/:fileIndex/render` | Read a PR file; its diff; its rendered HTML. |
| `POST /specs/:fileIndex/preview` · `POST /spec-preview` | Render a preview of proposed content. |
| `GET /specs/:fileIndex/draft` · `PUT /:fileIndex/draft` ✎ · `DELETE /:fileIndex/draft` ✎ | Read / stage / discard a per-file spec draft. |
| `POST /specs/:fileIndex/lock` ✎ · `/:fileIndex/edit` ✎ · `/:fileIndex/commit` ✎ | Lock, apply anchored edits, and commit a file. |
| `GET /specs/draft` · `PUT /specs/draft` ✎ · `DELETE /specs/draft` ✎ | Remote (branch-scoped) spec drafts by `org/project/repo/branch/path`. |
| `POST /specs/draft/lock` ✎ · `POST /specs/draft/push` ✎ | Lock / push a remote spec draft. |

**Discovery & lookups**

| Route | Purpose |
|---|---|
| `GET /prs` | List PRs for the Review queue. |
| `POST /specs/search` ✎ | Code-Search specs. |
| `POST /workitems/search` ✎ | WIQL work-item search. |
| `POST /commits/info` ✎ | Bulk file commit history. |
| `POST /branches` ✎ | List remote branches. |
| `POST /local-repo` ✎ · `POST /local-branches` ✎ · `POST /local-pick` ✎ | Open a local clone; list its branches; pick a clone folder. |
| `POST /pick-md-file` ✎ · `POST /open-file` ✎ | Pick / open a local `.md` file. |
| `GET /custom-files` · `POST /custom-files` ✎ · `DELETE /custom-files` ✎ | Read / add / remove Reading-list entries. |

**Staged authoring & publishing**

| Route | Purpose |
|---|---|
| `POST /branches/stage` ✎ · `GET /branches/staged` · `POST /branches/push` ✎ | Stage a branch; list the staged set; **publish everything staged**. |
| `POST /files/stage` ✎ · `POST /files/content` · `POST /files/edit` ✎ | Stage a file; read staged content; stage an edit. |
| `POST /pr/stage` ✎ · `POST /pr/unstage` ✎ | Stage / discard a PR intent. |
| `POST /pr/open` ✎ | Open a PR into the review session. |
| `POST /pr/publish/stage` ✎ · `POST /pr/publish/unstage` ✎ | Stage / discard a draft→published promotion. Unstage accepts `project` + `repo` to disambiguate repository-local PR numbers; an id-only legacy request works when it has one unique match. |

`POST /api/v1/branches/push` is the single publication boundary used by both the
portal's **Push to remote** button and the MCP `push_staged_changes` tool. ADO
calls are timeout-bounded, and a failed group keeps its staged state with a
target-specific error for correction and retry.
