# Tippani CLI, MCP & API Reference

For a browser-first walkthrough, use the [User Guide](user-guide.md).
This reference covers [CLI configuration](#cli-reference),
[MCP client setup](#mcp-client-setup), the [tool inventory](#mcp-server), and the
[HTTP control API](#http-control-api).

Tippani exposes its workflow two ways for automation:

- an **MCP server** (`tippani-mcp`) that gives an AI agent the same read /
  annotate / edit / author capabilities a person has in the portal; and
- an **HTTP control API** served by the portal itself, which the browser UI and
  external clients use.

MCP review and authoring staging tools prepare work for `push_staged_changes`
(`POST /api/v1/branches/push`). This is not a blanket rule for HTTP routes:
direct comment, reply, resolve, save, and review routes can publish immediately.
See the [publication table](user-guide.md#know-which-actions-publish).

## CLI reference

### Installation and downloads

For npm installation, use Node.js 20 or later and npm:

```bash
npm install -g tippani
```

Or run without installing globally:

```bash
npx tippani 12345 --org=https://dev.azure.com/YOUR_ORG --project="Your Project" --save-config
```

Authenticate first as described below. See [One-time setup](user-guide.md#one-time-setup)
for Azure CLI and GitHub CLI installation links.

Alternatively, download from the [latest release](https://github.com/mavaali/tippani/releases/latest):

| Platform | Download | Requires |
|---|---|---|
| macOS (Apple Silicon) | [`tippani`](https://github.com/mavaali/tippani/releases/latest/download/tippani) | Standalone binary; no Node.js installation |
| Windows | [`cli.cjs`](https://github.com/mavaali/tippani/releases/latest/download/cli.cjs) + [`tippani.bat`](https://github.com/mavaali/tippani/releases/latest/download/tippani.bat) | Node.js 18+ for the release wrapper |
| Linux / macOS | [`cli.cjs`](https://github.com/mavaali/tippani/releases/latest/download/cli.cjs) + [`tippani.sh`](https://github.com/mavaali/tippani/releases/latest/download/tippani.sh) | Node.js 18+ for the release wrapper |

### Launch examples

Leave the terminal process running while using the browser. Stop an existing
instance before starting another on the same port, or choose a different `--port`.

```bash
# Sample review: no repository credentials; comments are not saved
tippani --demo

# Azure DevOps PR; save org/project for later PR-number launches
tippani 12345 --org=https://dev.azure.com/YOUR_ORG --project="Your Project" --save-config
tippani 12345

# Equivalent GitHub PR targets
tippani https://github.com/OWNER/REPO/pull/123
tippani github:OWNER/REPO#123
tippani 123 --github=OWNER/REPO

# GitHub Discovery, anchored to a repository for authoring
tippani --browse --github=OWNER/REPO

# Azure DevOps Discovery: requires saved config and PAT or supplied ADO token
tippani --browse

# Open a specific file from a PR
tippani 12345 --file="/path/to/spec.md"

# Fetch fresh PR data, bypassing the cache
tippani 12345 --refresh

# Use a previously cached PR offline
tippani 12345 --offline

# Review a local git clone without a PR or repository-host sign-in
tippani --local-repo=/path/to/clone
```

GitHub Discovery searches reviews and Markdown across the owner's accessible
repositories; the selected repository anchors authoring. Azure DevOps Discovery
also includes Work items. GitHub omits that capability.

Offline content lives in `~/.tippani/cache/`. Online launches reuse a fresh cache
for up to one hour; offline mode can use older data. Files that weren't cached
aren't available offline. Save or copy unfinished work, stop the offline instance,
restart the same review without `--offline`, then use **Sync to ADO**. Reconnecting
the network doesn't change the launch mode. Votes are never queued.

### Flags and configuration

| Flag | Meaning | Environment variable |
|---|---|---|
| `--org=<url>` | Azure DevOps organization URL, e.g. `https://dev.azure.com/myorg`. | `TIPPANI_ORG` |
| `--project=<name>` | Project containing the repositories. | `TIPPANI_PROJECT` |
| `--repo=<name>` | Repository name; optional for PR lookup, where it is detected. | `TIPPANI_REPO` |
| `--browse` | Start Discovery instead of a single PR. | — |
| `--file=<path>` | Open a specific file directly. | — |
| `--offline` | Work from the cache without connecting. | — |
| `--refresh` | Fetch fresh data, ignoring the cache. | — |
| `--save-config` | Save org/project/repo defaults. Include a PR number or supported launch mode. | — |
| `--port=<n>` | Server port; default `3847`. | `TIPPANI_PORT` |
| `--headless` | Don't open a browser; use `tippani open` to connect one later. | `TIPPANI_HEADLESS` |
| `--ado-token=<t>` | Supply an ADO access token, bypassing PAT / Azure CLI. | `TIPPANI_ADO_TOKEN` |
| `--github=<owner/repo>` | Select GitHub with a PR number or `--browse`. | `TIPPANI_GITHUB_REPO` / `TIPPANI_GH_REPO` |
| `--gh-token=<t>` | Supply a GitHub token. | `TIPPANI_GH_TOKEN` / `GITHUB_TOKEN` |
| `--local-repo=<path>` | Review a local clone. | `TIPPANI_LOCAL_REPO` |

Azure DevOps defaults are stored in `~/.tippani/config.json`:

```json
{
  "org": "https://dev.azure.com/myorg",
  "project": "My Project",
  "repo": "My Repo"
}
```

For these defaults, precedence is CLI flags, then environment variables, then
the config file. Configuration flags alone don't save settings: include a PR number
or supported launch mode.

### Repository authentication

Tippani uses your credentials, not a shared account. GitHub token precedence is
`--gh-token`, then `TIPPANI_GH_TOKEN` / `GITHUB_TOKEN`, then `gh auth token`.
Run `gh auth login` first if using GitHub CLI. Tippani doesn't save the GitHub token.

An online Azure DevOps PR launch uses `--ado-token` / `TIPPANI_ADO_TOKEN`, then a
saved PAT at `~/.tippani/pat`, then Azure CLI. Use `az login` for the CLI path.
On a fresh load without credentials, Tippani prompts for a PAT and recommends
Azure CLI as the alternative. A PAT needs Code (Read & Write) scope; creation may
be prohibited by tenant policy.

An expired saved PAT isn't replaced by running `az login`. Resolve that credential
before retrying. Direct Azure DevOps `--browse` startup accepts a saved PAT or
supplied access token but doesn't try Azure CLI or prompt interactively. Use a
PR-number launch if you're relying on Azure CLI sign-in.

Credentials can expire, and repository read access doesn't necessarily include
permission to comment, review, or edit. Don't share tokens through chat.

### Reconnect a browser

The plain `http://localhost:3847` address doesn't establish a browser session.
Startup opens a one-time sign-in link unless `--headless` is set. Each link works
once and expires after about two minutes. Browser sessions last up to eight hours
or end after 30 minutes idle.

```bash
# Reconnect to an existing portal, including a demo
tippani open

# Print a fresh link instead of opening it
tippani open --headless

# Choose among multiple running portals
tippani open --port=3848

# Land on a particular page
tippani open --path=/feedback
```

`tippani reopen` is an alias. Neither command starts a server. Reconnecting to a
running portal preserves its state; restarting it is different. If no portal is
running, start one; if several are running, choose a listed port. If its registered
app session has expired or been rejected, preserve unfinished work before restarting.

## MCP client setup

Install Tippani globally, then add a server entry to your client's configuration.
For example, in Claude Desktop's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tippani": {
      "command": "tippani-mcp",
      "env": { "TIPPANI_ADO_TOKEN": "<your ADO access token>" }
    }
  }
}
```

For GitHub, set `TIPPANI_GH_TOKEN` instead, or use `gh auth token` from the MCP
server's environment. GitHub and ADO tokens are separate. Without an ADO token,
local-only review remains available; ADO-backed tools require a token. A supplied
ADO token receives fail-fast audience/type validation; optionally configure
`TIPPANI_ADO_AUDIENCE` for an expected audience.

You don't need to start a review portal first. The shim launches or adopts one on
demand, with instances discovered through `~/.tippani/instances/`. Multiple PRs can
run on separate ports. The integration design is tracked in
[issue #42](https://github.com/mavaali/tippani/issues/42).

Staged whole-file proposals appear as Current/Proposed comparisons. A user can
accept and refine one in the editor before committing. An assistant should show a
fresh clickable `portalUrl`, not reuse a consumed sign-in link.

The active PR page also exposes **Use with Copilot**. It identifies the current
provider, PR and portal session; shows the correct ADO or GitHub MCP credential
configuration; and explains that assistant edits remain staged until the user
reviews the Diff/Proposed views and explicitly selects **Save edits to PR**.

---

## MCP server

Start it as an MCP stdio server:

```bash
tippani-mcp
```

It registers **47 tools**. `open_pr` (or a Discovery tool like `list_prs` /
`search_specs`) launches a headless portal and returns a `portalUrl`; every
other tool then operates on that open session. A parameter marked `*` is
required.

**A `portalUrl` is a one-time sign-in link, not an address.** The portal refuses
an unauthenticated browser, so a plain `http://localhost:<port>` will not open
it, and a link stops working once it has been followed or after it expires
(about two minutes). Show the returned link to the user as a clickable link, and
call `get_portal_url` for a fresh one instead of resending a link you already
gave out. Users can mint their own at any time with `tippani open`.

### Portal lifecycle

| Tool | Purpose | Parameters |
|---|---|---|
| `start_tippani` | Start the portal in browse mode without opening a PR. Adopts a running portal. Returns a fresh single-use `portalUrl`. | — |
| `get_portal_url` | Mint a fresh single-use `portalUrl` for the running portal — use this to reconnect a user whose link was used or expired. Does not start the portal: when `running` is false, `portalUrl` is `null`. | — |
| `open_local_only` | Start the portal in local-only mode (no ADO token). Returns a fresh single-use `portalUrl`. | — |
| `close_tippani` | Steer the open tab to a closed page, then shut the portal down and clear its registry entry. | — |

All three link-returning tools also set `singleUse: true` and a `note`
restating that the link works once.

The server's `initialize.instructions` defines authentication recovery for all
ADO-backed tools. After HTTP 401, call `close_tippani`, restart the MCP server
through the host's lifecycle controls (or terminate `tippani-mcp` with an
approved local script when no restart control exists), and retry the original
tool exactly once. Never pass access tokens through chat or MCP tool arguments;
report and stop if the retry also fails.

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
| `open_thread` | Select one thread and return its full content plus any staged draft. File threads open in context and scroll both the thread pane and file contents to the anchor; PR-level threads open standalone. Navigation failure is reported as failure. | `threadId` |
| `focus_thread` | Scroll the browser to a thread and highlight it (`threadId=null` clears focus). | `threadId` |
| `set_view` | Switch the reading view of a file: `current`, `diff`, or `proposed`. Call after `edit_spec` — the view never auto-flips. | `view`, `fileIndex` |
| `open_file` | Open a changed file at the file view, optionally scrolled to a line. Read-only. | `fileIndex`, `line` |
| `go_to_line` | Scroll the file the user ALREADY has open to a 1-based source line, without reopening or switching files. Works on any open surface (PR file, branch file, local file). Read-only same-page scroll. | `line*` |
| `get_spec` | Read the rendered Markdown of one PR file plus a flat heading list (level, text, 1-based line). | `fileIndex` |
| `get_file_commits` | Bulk commit history for up to 25 spec files (id, author/committer, message, change counts, url). | `files*`, `top` |

### Staged review replies and edits

Review reply drafts (`stage_draft`) and PR spec proposals (`edit_spec`) are
currently tied to the running portal process and are lost when that process
restarts. Staged resolves use the disk-backed pending queue and survive a
restart.

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
session. Browsers exchange a one-time sign-in link for an HttpOnly, SameSite
app-session cookie; browser mutations require an exact `localhost` or `127.0.0.1`
Origin match. Headless clients use a separate expiring app-session bearer from
`~/.tippani/session-token-<port>` plus the configured `TIPPANI_CLIENT_NAME`.
Bearer values aren't printed to stdout. Every request must pass a loopback host
allow-list; localhost isn't treated as an authentication boundary.

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

All routes are prefixed `/api/v1`. Mutating routes (marked ✎) require an authorized
session as described above.

**Feedback & threads**

| Route | Purpose |
|---|---|
| `GET /threads` · `GET /threads/:id` | List thread summaries; get one thread. |
| `GET /triage` | Triage summary of all threads. |
| `PUT /threads/:id/draft` ✎ · `DELETE /threads/:id/draft` ✎ | Stage / discard a reply draft. |
| `POST /threads/:id/lock` ✎ | Lock a thread's draft (edit coordination). |
| `POST /commands/focus` ✎ · `POST /nav` ✎ · `POST /commands/view` ✎ · `POST /commands/filter` ✎ · `POST /commands/go-to-line` ✎ | Drive the browser: focus a thread, navigate, switch view, filter feedback, scroll the open file to a line. |
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

`POST /api/v1/branches/push` is the staged-publication endpoint used by both the
portal's **Push to remote** button and the MCP `push_staged_changes` tool. ADO
calls are timeout-bounded, and a failed group keeps its staged state with a
target-specific error for correction and retry.
