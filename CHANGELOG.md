# Changelog

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
