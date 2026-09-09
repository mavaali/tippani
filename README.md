# tippani

[![npm](https://img.shields.io/npm/v/tippani?cacheSeconds=3600)](https://www.npmjs.com/package/tippani)
[![GitHub release](https://img.shields.io/github/v/release/mavaali/tippani)](https://github.com/mavaali/tippani/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> टिप्पणी — *annotation* (Sanskrit)

**Tippani** is a friendly workspace for the Markdown **specs** that live in your Git repositories. Instead of squinting at raw diffs, you get clean, readable pages where you can **read** a spec, **comment** on it, **edit** it, and **write** brand-new ones — then send your changes up as a pull request when you're ready.

Everything runs on your own machine. Tippani opens in your web browser at `http://localhost`, connects to the repositories you point it at, and never uploads your work anywhere else. There's also a matching **MCP server** so an AI assistant can do the same things for you.

**Reviewing your first spec?** Start with the
[User Guide](docs/user-guide.md): open a spec, read the discussion, and share feedback.
It separates everyday reviewing from setup, editing, and the screen reference.
The [MCP & API Reference](docs/mcp-api.md) covers optional assistant integration.

## Try it — no repository account

The npm commands below require Node.js 20 or later and npm.

```bash
npx tippani --demo
```

Opens the portal on a sample spec with sample comment threads. No repository account,
login, or clone is needed. Demo comments aren't saved or sent.

## Quick Start

Tippani starts from a terminal and opens in your browser. Leave the terminal running
while you review. For assisted setup, see [One-time setup](docs/user-guide.md#one-time-setup).

Install globally from npm:

```bash
npm install -g tippani
```

For Azure DevOps, install Azure CLI and run `az login` with an account that can access
the review. Replace the PR number, organization URL, and project below:

```bash
az login
tippani 12345 --org=https://dev.azure.com/YOUR_ORG --project="Your Project" --save-config
```

Or install GitHub CLI, sign in, and open a GitHub pull request directly:

```bash
gh auth login
tippani https://github.com/OWNER/REPO/pull/123
# equivalent:
tippani 123 --github=OWNER/REPO
```

GitHub auth uses `--gh-token`, `TIPPANI_GH_TOKEN` / `GITHUB_TOKEN`, then
`gh auth token`. Direct PR read/comment/edit/review and staged branch/spec/PR
authoring work. To open GitHub Discovery instead of a specific PR:

```bash
tippani --browse --github=OWNER/REPO
```

The repository anchors authoring; Discovery searches reviews and Markdown
across the owner's accessible repositories.

Or run without a global installation, after signing in:

```bash
npx tippani 12345 --org=https://dev.azure.com/YOUR_ORG --project="Your Project" --save-config
```

After saving your org and project, later Azure DevOps reviews need only the number:

```bash
tippani 12345
```

To start Azure DevOps **Discovery** directly, `--browse` currently requires a saved
PAT or an access token supplied through `TIPPANI_ADO_TOKEN` / `--ado-token`. Unlike
the PR-number command, this launch mode doesn't try Azure CLI sign-in:

```bash
tippani --browse
```

Use the PR-number path if you signed in with Azure CLI and haven't supplied a token.
Configuration flags alone don't save settings: include a PR number or launch mode.
Stop the previous Tippani process before starting another on the same port, or use
`tippani open` to reconnect to the one already running.

Or download a standalone binary from the [latest release](https://github.com/mavaali/tippani/releases/latest):

| Platform | Download | Requires |
|---|---|---|
| **macOS** (Apple Silicon) | [`tippani`](https://github.com/mavaali/tippani/releases/latest/download/tippani) | Nothing — standalone binary |
| **Windows** | [`cli.cjs`](https://github.com/mavaali/tippani/releases/latest/download/cli.cjs) + [`tippani.bat`](https://github.com/mavaali/tippani/releases/latest/download/tippani.bat) | Node.js 18+ |
| **Linux / macOS** | [`cli.cjs`](https://github.com/mavaali/tippani/releases/latest/download/cli.cjs) + [`tippani.sh`](https://github.com/mavaali/tippani/releases/latest/download/tippani.sh) | Node.js 18+ |

## The portal at a glance

**Discovery** is the home screen — read a finished **Spec**, pick up a
**Review**, browse **Branches**, or reopen something from your **Reading list**.
Azure DevOps sessions also include **Work items**; GitHub sessions omit that tab
because GitHub Issues are not a WIQL-compatible work-item system.

![Discovery — Review queue](docs/img/discovery-review-queue.png)

**Reviewing** a spec gives you a three-pane workspace: a table-of-contents rail, the rendered spec (Markdown, tables, and Mermaid diagrams), and a comments panel with keyboard-driven navigation, inline replies, and Approve / Request Changes actions.

![Spec review — three panes](docs/img/spec-view-current.png)

> All screenshots use placeholder *lorem ipsum* content in a throwaway sandbox project.

## Features

- **A home screen for finding work** — search your specs, pick up a review, look up a linked work item, browse branches, or reopen something from your reading list.
- **Comfortable reviewing** — a table of contents, the rendered spec, and the comment threads side by side; move between comments with `J` / `K`.
- **Nicely rendered specs** — Markdown with tables, code, images, and **Mermaid**
  diagrams. **Diff / Proposed** preview your edits or a staged proposal; they're
  disabled when there's nothing to preview.
- **Two kinds of notes** — shared comment threads on the pull request, plus private **annotations** pinned to a line that follow the text as it changes.
- **Edit in place** — change a spec in a WYSIWYG editor, no hand-written Markdown required.
- **Write new specs** — create a branch, add or edit `.md` files, and open a pull request (optionally linked to a work item) — without cloning anything locally.
- **Stage new work** — branch authoring and assistant staging wait for an explicit
  push. Browser review comments, replies, resolutions, and confirmed PR-file saves
  can publish immediately online. See [which actions publish](docs/user-guide.md#know-which-actions-publish).
- **Sign off** — Approve or Request Changes from the reviewing bar, recorded as your vote on the pull request.
- **Work from a local clone** — review branches and files straight from a folder on disk.
- **Offline mode** — cache a review, comment offline, and sync when you reconnect.
- **Assistant-ready** — an MCP server (`tippani-mcp`) that can do all of this on your behalf.

## Documentation

| Guide | What's inside |
|---|---|
| **[User Guide](docs/user-guide.md)** | A first-review walkthrough for non-technical PMs, with private versus shared feedback, setup, recovery, editing, authoring, and a screen reference. |
| **[MCP & API Reference](docs/mcp-api.md)** | Every MCP tool and every HTTP control-API endpoint, with parameters and behavior. |
| **[How this compares](docs/competitive-positioning.md)** | Dated, sourced research on the surrounding landscape — PR review tools, AI review agents, and MCP servers for developer workflows. |
| **[Changelog](CHANGELOG.md)** | Release history. |

## Usage

```bash
# Try it on a sample spec — no account, no config
npx tippani --demo

# Open ADO Discovery (requires saved PAT or supplied ADO token, plus config)
tippani --browse

# Open a PR for review (uses saved config)
npx tippani <PR_ID>

# Open a GitHub PR directly
npx tippani github:OWNER/REPO#123

# Open GitHub Discovery
npx tippani --browse --github=OWNER/REPO

# Open a specific file directly
npx tippani <PR_ID> --file="/path/to/spec.md"

# Work offline (must have run online at least once for this PR)
npx tippani <PR_ID> --offline

# Fetch fresh data, ignoring the cache
npx tippani <PR_ID> --refresh

# Review a local git clone — no PR needed
npx tippani --local-repo=/path/to/clone

# Reconnect a browser to a portal that is ALREADY running
tippani open
```

### Opening the portal in a browser

The portal will not accept an unauthenticated browser, so its plain address
(`http://localhost:3847`) never opens a session on its own. A browser gets in by
following a **one-time sign-in link**, which the running portal mints. Tippani
opens one for you automatically at startup — unless you started it with
`--headless`.

Run `tippani open` whenever you need a new one:

```bash
# Mint a fresh sign-in link for the running portal and open it
tippani open

# Print the link instead of opening a browser
tippani open --headless

# Choose one of several running portals
tippani open --port=3848

# Land on a specific page
tippani open --path=/feedback
```

Use it when:

- you started the portal with `--headless` and now want to look at it yourself;
- your browser session expired (sessions last 8 hours, or 30 minutes idle);
- you closed the tab or cleared cookies and lost the session;
- someone else's link was already used — each link works exactly once.

`tippani open` **adopts the portal that is already running**, so your review
state survives. You do not have to stop the server and restart it without
`--headless`. If nothing is running, it tells you so; if several portals are
running, it lists their ports and asks you to pick one with `--port=<n>`.

`tippani open` covers `--demo` too: the demo registers itself like any other
portal, so a consumed or expired demo link is one `tippani open` away from a
fresh one.

### All flags

| Flag | Meaning | Environment variable |
|---|---|---|
| `--org=<url>` | The address of the service that hosts your repositories, e.g. `https://dev.azure.com/myorg`. | `TIPPANI_ORG` |
| `--project=<name>` | The project that contains your repositories. | `TIPPANI_PROJECT` |
| `--repo=<name>` | The repository name (optional — detected from the pull request). | `TIPPANI_REPO` |
| `--browse` | Open the home screen instead of a single pull request. | — |
| `--file=<path>` | Open a specific file directly. | — |
| `--offline` | Work from a local cache, with no connection. | — |
| `--refresh` | Fetch fresh data, ignoring the cache. | — |
| `--save-config` | Remember `--org/--project/--repo` in `~/.tippani/config.json`. | — |
| `--port=<n>` | Serve on a specific port (default `3847`). | `TIPPANI_PORT` |
| `--headless` | Don't open a browser — for assistant-only sessions. Use `tippani open` later to sign a browser in. | `TIPPANI_HEADLESS` |
| `--ado-token=<t>` | Sign in with an access token instead of an interactive login. | `TIPPANI_ADO_TOKEN` |
| `--github=<owner/repo>` | Select GitHub; pair with a PR number or `--browse`. | `TIPPANI_GITHUB_REPO` / `TIPPANI_GH_REPO` |
| `--gh-token=<t>` | GitHub token (otherwise uses env, then `gh auth token`). | `TIPPANI_GH_TOKEN` / `GITHUB_TOKEN` |
| `--local-repo=<path>` | Work from a local clone on disk, with no server round-trip. | `TIPPANI_LOCAL_REPO` |

**When the same setting is provided in more than one place**, Tippani uses the first place it finds it, in this order: a command-line flag overrides an environment variable, which overrides a value saved in `~/.tippani/config.json`. In short, a flag always wins, and the config file is the fallback when you pass nothing.

## Configuration

Settings are stored in `~/.tippani/config.json`:

```json
{
  "org": "https://dev.azure.com/myorg",
  "project": "My Project",
  "repo": "My Repo"
}
```

You can also use environment variables:
- `TIPPANI_ORG`
- `TIPPANI_PROJECT`
- `TIPPANI_REPO`

Priority: CLI flags > env vars > config file.

## Connecting to your repositories

Tippani signs in with **your own** credentials and keeps them **on your machine** — it never ships a shared secret and never sends your credentials anywhere except to the service that hosts your repositories. That host is the one place connection details matter:

For GitHub, Tippani uses `--gh-token`, then `TIPPANI_GH_TOKEN` / `GITHUB_TOKEN`,
then `gh auth token`. It doesn't save your GitHub token.

For an online Azure DevOps PR launch, it uses a supplied `--ado-token` /
`TIPPANI_ADO_TOKEN`, then a saved PAT at `~/.tippani/pat`, then Azure CLI. On a
fresh load without credentials, it prompts for a PAT and recommends `az login`
as the alternative. PAT creation may be blocked by your organization's policy.

An expired saved PAT isn't replaced by running `az login`; resolve the saved
credential before retrying. Direct Azure DevOps `--browse` startup accepts a saved
PAT or supplied token but doesn't perform the Azure CLI or interactive fallback.
Credentials can expire, so initial setup doesn't guarantee indefinite access.

## Offline mode

```bash
# First run caches the review's available Markdown files
npx tippani 12345

# Stop the online instance before launching the same review offline
npx tippani 12345 --offline

# Save/copy unfinished work and stop the offline instance before restarting online
npx tippani 12345   # then click 'Sync to ADO' in the status bar
```

The cache lives in `~/.tippani/cache/`. Online launches reuse it for up to one hour;
`--refresh` bypasses it. Offline mode can use older cached data, but can't open a
file that wasn't cached. Queued feedback isn't delivered until it syncs; review
votes aren't queued. Reconnecting the network doesn't exit `--offline` mode.

## Build Standalone Binary

```bash
npm run build
```

Produces:
- `dist/bin/tippani` — macOS standalone (~123MB, no Node.js required)
- `dist/cli.cjs` + `dist/tippani.bat` — Windows (requires Node.js 18+)
- `dist/tippani.sh` — Linux/macOS shell wrapper

To build a Windows `.exe`, run `npm run build` on a Windows machine with Node.js 20+.

## How it works

Tippani is a single-file command-line tool (`src/index.js`) that:
1. Signs you in to your repository host — or skips sign-in entirely for local-clone review
2. Fetches the pull request's details, changed files, contents, and comment threads
3. Caches everything locally for offline use
4. Starts a local web server on port 3847
5. Renders Markdown to HTML (via `remark` + `rehype`)
6. Opens Tippani in your browser

Comments are written to a local queue first, then sent to the host. Offline, they wait in the queue until the next sync. Review votes are the exception — they are never queued, since a stale vote sent later could approve a pull request whose content has moved on.

`src/demo.js` serves the same portal over fixture data for `--demo`. It shares the design system and helpers with the real portal so the demo can't drift from what ships.

## AI / MCP integration

Tippani exposes a [Model Context Protocol](https://modelcontextprotocol.io) server so LLM clients (Claude Desktop, GitHub Copilot, etc.) can drive the review workflow — open a PR, triage threads, stage replies and whole-file spec edits, resolve or mark threads viewed — while you watch in tippani's browser UI and approve each action. The design is tracked in issue [#42](https://github.com/mavaali/tippani/issues/42).

**Self-bootstrapping — you don't start tippani first.** The shim launches (or adopts) a review portal per PR on demand via the `open_pr` tool, opening a visible browser window for you while the agent drives it. Multiple PRs can run at once on separate ports, discovered across processes via a per-port registry under `~/.tippani/instances/`.

**Setup (Claude Desktop):** install tippani globally (`npm i -g tippani`), then add to your `claude_desktop_config.json`. For work against a repository host, pass a read/write access token via `TIPPANI_ADO_TOKEN`; without one the shim still starts in local-only mode (local-clone review works, and the host tools ask for a token if used). Optionally set `TIPPANI_ADO_AUDIENCE` to have it verify the token's audience on startup:

```json
{
  "mcpServers": {
    "tippani": {
      "command": "tippani-mcp",
      "env": { "TIPPANI_ADO_TOKEN": "<your repository host access token>" }
    }
  }
}
```

For GitHub, set `TIPPANI_GH_TOKEN` instead (or leave it unset when `gh auth
token` works in the MCP server's environment). GitHub and ADO tokens are
separate; a supplied ADO token still gets its existing fail-fast audience/type
validation.

**Tools (47):**

- **Portal lifecycle** — `start_tippani` (explicit browse-mode start), `get_portal_url` (mint a fresh sign-in link / reconnect), `open_local_only` (local review, no ADO token), `close_tippani`.
- **Portal & navigation** — `open_pr` (ADO by default; for GitHub pass `provider: "github"`, `owner`, and `repo`), `open_file`, `go_to_line` (scroll the already-open file to a line, no reopen), `open_thread` (selects a thread, scrolls both panes to its anchor, and returns its content), `show_feedback` (cross-PR triage page), `set_view`, `set_feedback_filter`, `refresh_spec`.
- **Reading** — `list_threads`, `get_thread`, `get_spec`, `get_spec_draft`, `triage_summary`; focus with `focus_thread`.
- **Stage-then-push** — stage review work with `stage_draft`, `edit_spec`, and `stage_resolve_thread`; stage authoring work with `stage_branch`, `stage_spec`, and `stage_spec_pr`. Nothing staged by MCP reaches your repository host until one explicit `push_staged_changes` call. Also `clear_draft` and `clear_spec_edit`.
- **Discovery** — `list_prs` and `search_specs` support ADO or GitHub;
  `search_work_items` is ADO-only; `get_file_commits` reads either host.
- **Local review (no PR, no host account)** — `open_branch`, `open_branch_file`, `open_local_file`, and the Discovery Reading list (`add_reading_list_file`, `remove_reading_list_file`).
- **Annotations** — `read_annotations`, `add_annotation`, `edit_annotation`, `delete_annotation`, `reply_annotation`, `resolve_annotation`, plus navigation (`navigate_annotations`, `jump_to_annotation`, `show_resolved_annotations`) and bulk cleanup.

Staged whole-file edits show up in the portal as a side-by-side Current/Proposed diff you can accept-and-refine in the editor before committing.

**Every `portalUrl` an MCP tool returns is a one-time sign-in link.** The portal
rejects an unauthenticated browser, so a plain `http://localhost:<port>` address
is never usable, and a link stops working once it has been opened or after it
expires. Assistants should show the link as a clickable link and call
`get_portal_url` again for a new one rather than resending an old one. You can
also mint one yourself at any time with `tippani open`.

The portal can also run standalone with `--headless` (assistant-only, no browser), `--port=<n>` (run several at once), and `--ado-token=<t>` (token-based sign-in, skipping the interactive login). The underlying HTTP control API is directly usable for scripts and IDE extensions — see `src/control-api.js`.

Browser access starts through a short-lived, one-time bootstrap URL and then uses
an HttpOnly, SameSite app-session cookie. Every browser mutation also requires
an exact `localhost` or `127.0.0.1` Origin match. Headless clients use a
separate expiring app-session bearer from
`~/.tippani/session-token-<port>` plus the configured
`TIPPANI_CLIENT_NAME`; bearer values are never printed to stdout.

## License

MIT — see [LICENSE](LICENSE)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.
