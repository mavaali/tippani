# Changelog

## Unreleased — Personal comments + local (ADO-less) review

File/branch-scoped **personal comments** on a draft spec (no PR), and a
**local-clone review** path that reads branches/files straight from a git clone
via server-side git. From branch `clickstop-1`.

### Review-response hardening (adversarial PR review)
- **Durable comment store.** Writes are atomic (temp-file + `renameSync`) and
  now **throw** on failure, so `create`/`edit`/`resolve`/`reply` return
  `{ ok: false }` instead of a false success; a corrupt store is **quarantined**
  (`*.corrupt-<ts>`) and surfaced rather than silently read as "zero comments"
  and overwritten. Disk I/O extracted to `personal-comments-store.js` with tests.
- **Stored-XSS fix.** Inline `<script>` data embeds go through a new
  `jsonForScript` helper (escapes `<`, U+2028/9) so a comment (or spec/thread
  text) containing `</script>…` can't break out of the script. Applied to the
  personal-comments embed and its siblings across the reviewing/editor pages.
- **Anchors survive edits.** Comments now carry a content-addressed anchor
  (`blockHash` + heading path) re-resolved on every render: a hash match
  re-points the line exactly when a block moves, a heading-path match tracks a
  lightly-edited block (`moved`), and a deleted block is marked `stale` rather
  than silently mispointing. Exposed to MCP (`anchorState`) and shown as a card
  badge. Pure engine in `personal-comments.js` with tests.
- **Local-git hardening.** `runGit` gets a 15s timeout (a wedged git can't hang
  a request); base-branch resolution now includes `develop`/`trunk` (no
  dead-end); the working-tree read is **symlink-safe** (realpath containment,
  not a `..`-string check). Testable helpers in `local-git.js`.
- **Single-write resolve.** `resolve`-with-note applies the reply + the resolved
  flag in one load/save (was two cycles). Mutating MCP handlers echo the
  resolved `{repo,branch,path}` so a stale ambient context is visible.
- **DNS-rebind guard.** A Host allow-list (localhost/127.0.0.1/[::1]) rejects
  rebind attempts on every request.
- **CI.** `.github/workflows/ci.yml` runs the full suite on Node 20/22/24 for
  every push/PR (the offline portal smokes stay dev-only — they need a cached
  PR fixture).
- **LLM-facing strings.** `refresh_spec` no longer claims "reloads from ADO" in
  local mode; comment-tool grammar fixed.

### Known non-blocking follow-ups (documented, not gated)
- **Local read scope.** The MCP reads any `.md` under the user-supplied clone;
  this is a loopback-only, single-user tool where the same user supplies the
  path, so a hard root allow-list is deferred (it would harm the point-at-a-clone
  UX) — tracked as a follow-up.
- **Store key = clone path.** Personal comments are keyed by the absolute clone
  path; moving the clone orphans notes. Re-keying by repo identity (origin URL)
  needs a migration and is deferred.
- **`/api/v1/state` payload.** State polling still ships full draft bodies;
  slimming it to seq-only-until-changed needs a coordinated client change and is
  deferred (perf, non-functional).

## 1.6.0 (2026-07-16)

A review-optimized UX layer: surgical agent edits, a three-view spec toggle, a feedback triage filter, a PR picker, and editor find/replace — plus a security-hardening pass over the new surface. From [#67](https://github.com/mavaali/tippani/pull/67).

### Added — review UX
- **Surgical spec edits (`edit_spec`).** An agent can stage a small, anchored change to a spec (a guarded line-range edit or a find/replace) without resending the whole document. A pure engine (`spec-edit.js`) resolves all edits against one snapshot and applies them atomically: an out-of-range line, a failed `oldString` guard, an overlap, or a zero-match `find` fails the whole call and stages nothing (`422` with a machine-readable `code`). Staged review-only, never committed.
- **Three-view toggle (`set_view`).** The spec reading view has three modes — the committed **Current** text, the **Diff** of the staged proposal, and the full **Proposed** text — switchable by the reader and drivable by the agent (seq-gated so a background stage never flips the reader's view). Diff/Proposed are disabled until a draft exists.
- **Feedback triage filter (`set_feedback_filter`).** The feedback page gains a filter bar (thread state, reviewer, file, free-text search) the reviewer can drive and the agent can set to focus the triage.
- **PR picker (`list_prs` + `/prs` + `--browse`).** List the PRs to review as openable tiles; the portal can boot PR-less in a browse mode that only lists PRs — a review inbox rather than needing to know the PR id up front.
- **Find & Replace in the editor.** CodeMirror's search panel, opened from a toolbar button.
- **Host-routable browser opener (`TIPPANI_OPEN_CMD`).** The portal can open its pages through a host-supplied command (e.g. the VS Code integrated Simple Browser) instead of the OS default browser, via a plain env-var hook.
- **Persistent focus highlight.** Clicking a comment thread highlights it and its anchored spec section in a persistent Bordeaux ring that tracks focus instead of fading on a timer. Plus a **live-staged draft auto-load** and a **height-capped comment-thread pane**.

### Security & robustness
- **`edit_spec` honors the editor lock.** Staging returns `409 { code: "locked" }` while the user holds the file open in edit mode (the 3s heartbeat lock, matching `PUT /draft`), and the file-view auto-load is guarded on `!isDirty()` — so an agent edit never silently overwrites a reviewer's unsaved buffer.
- **Shell-free host opener.** `TIPPANI_OPEN_CMD` no longer runs through a shell with the URL substituted into the command string. The template is tokenized and the URL is passed as a discrete argv element to a shell-less spawn, so URL content can never inject a command.
- **Single-tab nav stays on the resolved same-origin target.** The nav watcher navigates to the resolved same-origin path (never the raw `navUrl`), and a new guard keeps a deliberate `?edit=1` deep-link from being stripped on a fresh browser.

### Notes
- New MCP tools: `edit_spec`, `set_view`, `set_feedback_filter`, `list_prs`. New `--browse` mode.
- New pure engines with unit tests (`spec-edit`, `feedback-filter`, `pr-criteria`, `nav-guard`) plus two end-to-end review-UX smokes (`npm run smoke:review-ux`). Full suite green.

## 1.5.0 (2026-07-15)

MCP reliability for long-lived and multi-PR sessions, single-tab navigation, and a security-hardening pass over the control API. From [#66](https://github.com/mavaali/tippani/pull/66).

### Added — MCP reliability
- **Single-tab navigation (default).** The MCP nav tools (`open_thread`, `show_feedback`, `open_file`) now steer the one open browser tab in place instead of spawning a new tab per navigation, so a review no longer accumulates stale tabs and the agent and user stay on the same page. A shared watcher injected on every portal page polls `/api/v1/state` and follows a monotonic `navSeq`, firing once per bump and never yanking the user back after a manual navigation. Opt back into a tab per nav with `TIPPANI_SEPARATE_TABS=1`.
- **ADO token hot-swap.** `POST /api/v1/ado-token` swaps a long-lived portal's Azure DevOps bearer in place (rebuilds the connection, no restart), so an external token authority can push a fresh token before the old one expires. Session-token gated; the token is never echoed back.
- **Portal lifecycle and orphan reaping.** Each portal is spawned over an IPC channel tied to the shim's lifetime and exits on shim death, so a portal can't outlive the shim that owns it. A startup reaper clears stale/orphaned registry entries, and `session.stop()` removes each owned portal's entry itself (on Windows `TerminateProcess` skips the portal's own cleanup).
- **Shutdown on stdin close.** The stdio MCP server now tears its portals down on stdin EOF/close (how hosts usually stop a stdio server), in addition to `SIGINT`/`SIGTERM`/exit.
- **Viewed-state read failures surfaced.** A failed read of the PR viewed-markers no longer silently renders every thread as unread: an amber banner distinguishes an expired ADO sign-in from a general reach failure on the feedback, thread, and spec pages. The markers stay saved on the pull request.
- **Frontmatter preserved on commit.** Committing an edited spec re-attaches the original YAML frontmatter (the editor mounts a frontmatter-stripped body), so a commit never drops `title`/`ms.date`/etc. on Learn/DocFX docs.

### Security — control-API hardening
- **Exact-origin same-origin gate.** The control API's same-origin check compares parsed origins instead of `startsWith` prefixes. The old prefix match let a different port (`…:38470`), a suffix host (`…:3847.evil.com`), and a userinfo trick (`…:3847@evil.com`) all count as same-origin, which skips the session-token requirement on every mutation.
- **Single-tab nav can't steer off-origin.** The injected watcher navigates only when the resolved URL is same-origin and goes to the computed path (never the raw `navUrl`), and `POST /api/v1/nav` rejects absolute, protocol-relative, `javascript:`, and backslash paths.
- **Orphan reaper won't kill a recycled PID.** The reaper kills an orphaned portal only when its port still accepts a connection (an identity proxy); an alive PID whose port is dead is treated as a recycled stranger and its stale entry is dropped without a kill.
- **Expired bearer rejected.** `POST /api/v1/ado-token` turns away an already-expired bearer JWT instead of binding a dead token that fails on the next call.

### Notes
- Single-tab navigation is a default behavior change for the MCP workflow; set `TIPPANI_SEPARATE_TABS=1` for the previous tab-per-nav behavior.
- New and extended suites for nav validation, the ADO-token expiry check, and the identity-guarded reaper. Full suite: **433 passing**.

## 1.4.0 (2026-07-13)

Promotes the 1.4.0 beta line (AI/MCP integration) to stable and adds the MCP-driven review portal from [#65](https://github.com/mavaali/tippani/pull/65).

### Added — MCP-driven review portal & stage-then-review
- **Self-bootstrapping MCP shim.** `tippani-mcp` no longer requires a portal to already be running — the new `open_pr` tool launches (or adopts) a portal per PR on demand and opens a visible browser for the user, so an agent can start a review from cold. Portals are discovered across processes via a per-port registry under `~/.tippani/instances/`, so multiple PRs can run at once on separate ports. The tool surface grew from 8 to 19.
- **Stage-then-review workflow.** The LLM stages fixes and replies for review *before* anything is posted or committed — `stage_draft`, `stage_spec_edit`, `stage_resolve_thread`. Nothing reaches Azure DevOps until an explicit finalize (`post_reply` / `commit_spec` / `resolve_thread`). Staged work is local and easy to undo.
- **Spec-edit diff overlay.** A GitHub-style inline diff for a staged whole-file proposal: block-level diff with a row-level merged table diff, Current/Proposed boxes, right-gutter change markers, and an "accept & refine" path that seeds the editor with the proposal. Source ranges are derived from the render tree so the overlay anchors to the correct block.
- **Durable "Viewed" state.** Mark a thread viewed (acknowledged) without resolving it — it drops out of the "needs your reply" triage but stays open and resurfaces if a newer comment arrives. Backed by a pull-request property so it's durable and shared. A new cross-PR **Feedback** triage page and `triage_summary` tool categorize every thread (needs-you / awaiting-reviewer / viewed / FYI / resolved).
- **Headless mode and token pass-in.** `--headless` for agent-only sessions; `--port=<n>` to run multiple portals; `--ado-token` / `TIPPANI_ADO_TOKEN` to pass a bearer token directly (with an offline audience check) instead of relying on the PAT or az-CLI caches.

### Notes
- Extracted, unit-tested modules for the diff/source-map, table diff, and viewed-state logic (`spec-source-map`, `table-diff`, `viewed-map`), plus portal launcher/registry and ADO-token-check suites.
- The AI/MCP path (beta since 1.4.0-beta.0) is now considered stable; test on non-critical PRs first if adopting the MCP workflow.

## 1.4.0-beta.1 (2026-07-10)

### Fixed — PR file detection (reported by Kay Unkroth)
- **Repo now auto-detected from the PR.** Previously, running without `--repo` defaulted the repo to the *project* name, so `tippani 920770 --org=… --project="Power BI"` looked in repo "Power BI" instead of the PR's real repo (`powerbi-specs`) and reported **0 changed files** even when the PR had markdown. tippani now reads the authoritative repository (stable GUID) from the loaded PR object and re-points all repo-scoped calls at it, so `--repo` is optional and wrong/omitted repo names self-correct.
- **URL-encoded config values are decoded** ([#54](https://github.com/mavaali/tippani/issues/54)). A saved or pasted `project`/`repo` like `Power%20BI` is now decoded to `Power BI` instead of silently returning 0 changed files.
- **Graceful "no markdown" message.** When a PR changes no `.md` files, tippani now lists the non-markdown files it *did* find (counts per extension + sample paths) and explains it reviews markdown only, instead of the terse `No markdown files changed in this PR.`

### Changed — authentication docs
- README and CLI prompts now lead with `az login` (no PAT required) and demote PAT to an optional fallback, noting PAT creation is often blocked by tenant policy. Clears up "why do you need a PAT — it never prompted me."

### Notes
- New unit tests in `src/config-util.test.mjs` (24) cover config decoding, extension parsing, PR-repo derivation (including Kay's exact no-`--repo` failure), and the non-markdown summary. Suite: 217 passing.

## 1.4.0-beta.0 (2026-06-13)

### Added — AI / MCP integration (beta)
- **Keyboard navigation across comment threads** — `J`/`K` next/prev, `R` reply, `S` skip, `⌘`/`Ctrl`+`Enter` to post and auto-advance, `Esc` to cancel. Inline reply textarea replaces the old `prompt()` dialog. Focused-thread state survives the post-reply reload.
- **HTTP control API** under `/api/v1/*` — read endpoints (`/threads`, `/threads/:id`, `/specs/:fileIndex`), draft staging (`PUT/DELETE /threads/:id/draft`), focus RPC (`POST /commands/focus`), reply/resolve (`POST /threads/:id/{reply,resolve}`), and a polling state endpoint (`/state`). Designed for LLM tools and scripts to drive tippani's UI without an embedded LLM.
- **Session-token auth** — random 24-byte token generated at startup, written to `~/.tippani/session-token` (mode 0600, cleaned up on shutdown). External clients send `Authorization: Bearer <token>` plus `X-Tippani-Client: <name>`. Browser uses same-origin and needs neither.
- **Conflict guards** — `409` on a second concurrent reply to the same thread (catches double-clicks and competing LLM+human posts); `409` on draft staging when the user is actively typing in that thread's textarea (10-second sliding window touched by every keystroke).
- **Externally-staged drafts in the UI** — when an external client stages a draft, the browser picks it up via 1.5s polling, populates the reply textarea, and shows a "✨ Draft from external client" badge. The user always edits or posts; tippani never auto-posts.
- **`tippani-mcp` — MCP server** exposing 8 tools: `list_threads`, `get_thread`, `focus_thread`, `stage_draft`, `clear_draft`, `post_reply`, `resolve_thread`, `get_spec`. Stdio transport; proxies tool calls to the HTTP control API. One-line setup in `claude_desktop_config.json` (see README).

### Notes
- **Beta.** The MCP path has zero real-world miles yet. Test on non-critical PRs first.
- Issue [#42](https://github.com/mavaali/tippani/issues/42) tracks the full design and phasing.
- Test suite grew from 56 → 183 across `src/api-state.test.mjs` (39), `src/control-api.test.mjs` (48), and `src/mcp.test.mjs` (40).

## 1.3.0-beta.0 (2026-06-04)

### Added — WYSIWYG editing & write path (beta)
- **Live-preview editor** — Typora-style CodeMirror 6 editor in the spec view. The buffer *is* the markdown file ("buffer-is-the-file"), so diffs stay clean and YAML frontmatter, HTML comments, and ADO macros (`[[_TOC_]]`, `::: mermaid`, mentions) pass through untouched. Headings, emphasis, inline/fenced code, links, lists, blockquotes, and rules render inline with reveal-on-cursor; fenced-code fences collapse off-cursor.
- **WYSIWYG tables** — pipe tables render as an editable grid (Tab/Shift-Tab/Enter/arrow navigation, add/delete row+column, column alignment) that round-trips to canonical pipe markdown. An unedited table is never reformatted.
- **Edit / view toggle** — read-only render stays the default; editing is opt-in via the header button or `Cmd`/`Ctrl`+`E`. Edit mode is visually distinct; the comment panel and TOC stay visible in both modes.
- **Save to PR branch** — commit edits straight to the PR source branch via the ADO push API, with a diff-on-save preview and an editable commit message. Explicit save only (no auto-save).
- **Dirty state & conflict guard** — dirty indicator (header dot + title marker), warnings on tab close / file switch with unsaved edits, and optimistic-concurrency protection: a push made stale by someone else's commit is rejected, and you're offered reload / copy-to-clipboard. Never auto-merges.
- **Edit gating** — the Edit affordance is offered only when the identity has repo push access (offline edits queue and sync on reconnect); a completed/abandoned PR isn't editable.

### Notes
- **Beta.** This is the first release that *writes* to ADO branches. Verified end-to-end against a live PR, but treat important specs with care and report issues.
- The per-branch push ACL isn't pre-checked — the permission probe is repo-level and fails open; a real push rejection still surfaces gracefully at save time, and the edit is never lost.
- The editor is bundled and inlined into the offline binary — no external assets.

## 1.2.0 (2026-06-03)

### Security
- **Fixed:** Markdown rendering now uses `rehype-sanitize` — prevents stored XSS from malicious PR content
- **Fixed:** Server binds to `127.0.0.1` instead of `0.0.0.0` — no longer LAN-accessible
- **Fixed:** Comment HTML always re-rendered through safe pipeline (ADO `renderedContent` no longer trusted)
- **Fixed:** CSRF origin-check middleware on all POST endpoints
- **Fixed:** Config, cache, and pending files written with restrictive permissions (`0o600`)
- **Fixed:** Error responses no longer leak internal details to client
- **Pinned:** `express`, `azure-devops-node-api`, `rehype-sanitize` to exact versions

### Error Handling
- **Fixed:** Empty PAT no longer saved when prompt is cancelled — previously broke all subsequent runs
- **Fixed:** Port 3847 in use now shows friendly message instead of raw EADDRINUSE crash
- **Fixed:** Disk full during cache/queue writes caught and warned instead of crashing
- **Fixed:** ADO 401/403/404/429/5xx errors show actionable messages with guidance
- **Fixed:** Wrong org URL, project, or repo name shows specific fix instructions

### Improvements
- Org URL auto-normalized (trailing slash stripped, `https://` auto-prepended)
- Abandoned/completed PRs show a warning on startup
- PAT prompt URL now uses your configured org instead of hardcoded value
- Demo server with generic mock data for screenshots (`node scripts/demo.js`)

## 1.0.0 (2026-06-03)

### Features
- File picker landing page for multi-file PRs (single-file auto-redirects)
- Three-column resizable layout: TOC sidebar, rendered spec, comment threads
- Inline commenting on paragraphs, lists, tables, blockquotes, and code blocks
- Offline mode: cache PR data locally, comment without connection, sync later
- Active vs resolved comment threads with color-coded inline bubbles
- Dark mode auto-detection via `prefers-color-scheme`
- Bottom review bar: Approve / Request Changes
- Comment section/line context shown in modal ("§ Requirements, line 76")
- Sync status bar with pending count and manual sync button
- Parameterized ADO config: `--org`, `--project`, `--repo`, `--save-config`
- Environment variable support: `TIPPANI_ORG`, `TIPPANI_PROJECT`, `TIPPANI_REPO`
- Authentication: saved PAT, Azure CLI token, or interactive prompt
- macOS standalone binary via Node SEA (no Node.js required)
- Windows support via bundled `.cjs` + `.bat` launcher
- WCAG AA accessibility: focus rings, aria-labels, modal focus trap, Escape to close
