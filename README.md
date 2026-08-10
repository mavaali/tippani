# tippani

[![npm](https://img.shields.io/npm/v/tippani?cacheSeconds=3600)](https://www.npmjs.com/package/tippani)
[![GitHub release](https://img.shields.io/github/v/release/mavaali/tippani)](https://github.com/mavaali/tippani/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> टिप्पणी — *annotation* (Sanskrit)

**Tippani** is a friendly workspace for the Markdown **specs** that live in your Git repositories. Instead of squinting at raw diffs, you get clean, readable pages where you can **read** a spec, **comment** on it, **edit** it, and **write** brand-new ones — then send your changes up as a pull request when you're ready.

Everything runs on your own machine. Tippani opens in your web browser at `http://localhost`, connects to the repositories you point it at, and never uploads your work anywhere else. There's also a matching **MCP server** so an AI assistant can do the same things for you.

**New here?** The [User Guide](docs/user-guide.md) walks through every screen; the [MCP & API Reference](docs/mcp-api.md) covers the assistant tools and endpoints.

## Try it — no setup

```bash
npx tippani --demo
```

Opens the portal on a sample spec with sample comment threads. No account, no login, no clone. Nothing is sent anywhere.

## Quick Start

Tippani is a small command-line tool. Point it at your repositories once, then open the home screen in your browser.

Install globally from npm:

```bash
npm install -g tippani
tippani 12345 --org=https://dev.azure.com/YOUR_ORG --project="Your Project" --save-config
```

Or open a GitHub pull request directly:

```bash
tippani github:OWNER/REPO#123
# equivalent:
tippani 123 --github=OWNER/REPO
```

GitHub auth uses `--gh-token`, `TIPPANI_GH_TOKEN` / `GITHUB_TOKEN`, then
`gh auth token`. Direct PR read/comment/edit/review and staged branch/spec/PR
authoring work. GitHub browse/discovery and search are not wired yet.

Or run without installing:

```bash
npx tippani 12345 --org=https://dev.azure.com/YOUR_ORG --project="Your Project" --save-config
```

Once your org and project are saved, open the **Discovery** portal (the home screen with all five tabs) with `--browse`:

```bash
tippani --browse
```

Or download a standalone binary from the [latest release](https://github.com/mavaali/tippani/releases/latest):

| Platform | Download | Requires |
|---|---|---|
| **macOS** (Apple Silicon) | [`tippani`](https://github.com/mavaali/tippani/releases/latest/download/tippani) | Nothing — standalone binary |
| **Windows** | [`cli.cjs`](https://github.com/mavaali/tippani/releases/latest/download/cli.cjs) + [`tippani.bat`](https://github.com/mavaali/tippani/releases/latest/download/tippani.bat) | Node.js 18+ |
| **Linux / macOS** | [`cli.cjs`](https://github.com/mavaali/tippani/releases/latest/download/cli.cjs) + [`tippani.sh`](https://github.com/mavaali/tippani/releases/latest/download/tippani.sh) | Node.js 18+ |

## The portal at a glance

**Discovery** is the home screen — five tabs to find what to work on: read a finished **Spec**, pick up a **Review**, open a **Work item**, browse **Branches**, or open something from your **Reading list**.

![Discovery — Review queue](docs/img/discovery-review-queue.png)

**Reviewing** a spec gives you a three-pane workspace: a table-of-contents rail, the rendered spec (Markdown, tables, and Mermaid diagrams), and a comments panel with keyboard-driven navigation, inline replies, and Approve / Request Changes actions.

![Spec review — three panes](docs/img/spec-view-current.png)

> All screenshots use placeholder *lorem ipsum* content in a throwaway sandbox project.

## Features

- **A home screen for finding work** — search your specs, pick up a review, look up a linked work item, browse branches, or reopen something from your reading list.
- **Comfortable reviewing** — a table of contents, the rendered spec, and the comment threads side by side; move between comments with `J` / `K`.
- **Nicely rendered specs** — Markdown with tables, code, images, and **Mermaid** diagrams, and **Current / Diff / Proposed** views of every changed file.
- **Two kinds of notes** — shared comment threads on the pull request, plus private **annotations** pinned to a line that follow the text as it changes.
- **Edit in place** — change a spec in a WYSIWYG editor, no hand-written Markdown required.
- **Write new specs** — create a branch, add or edit `.md` files, and open a pull request (optionally linked to a work item) — without cloning anything locally.
- **Nothing happens by surprise** — every change waits, staged and reviewable, until you press **Push to remote** once.
- **Sign off** — Approve or Request Changes from the reviewing bar, recorded as your vote on the pull request.
- **Work from a local clone** — review branches and files straight from a folder on disk.
- **Offline mode** — cache a review, comment offline, and sync when you reconnect.
- **Assistant-ready** — an MCP server (`tippani-mcp`) that can do all of this on your behalf.

## Documentation

| Guide | What's inside |
|---|---|
| **[User Guide](docs/user-guide.md)** | A screen-by-screen walkthrough of the whole UI: Discovery tabs, the reviewing workspace, comments, editing, and the authoring flow. |
| **[MCP & API Reference](docs/mcp-api.md)** | Every MCP tool and every HTTP control-API endpoint, with parameters and behavior. |
| **[How this compares](docs/competitive-positioning.md)** | Dated, sourced research on the surrounding landscape — PR review tools, AI review agents, and MCP servers for developer workflows. |
| **[Changelog](CHANGELOG.md)** | Release history. |

## Usage

```bash
# Try it on a sample spec — no account, no config
npx tippani --demo

# Open the Discovery portal (Specs, Review queue, Work items, Branches, Reading list)
tippani --browse

# Open a PR for review (uses saved config)
npx tippani <PR_ID>

# Open a GitHub PR directly
npx tippani github:OWNER/REPO#123

# Open a specific file directly
npx tippani <PR_ID> --file="/path/to/spec.md"

# Work offline (must have run online at least once for this PR)
npx tippani <PR_ID> --offline

# Fetch fresh data, ignoring the cache
npx tippani <PR_ID> --refresh

# Review a local git clone — no PR needed
npx tippani --local-repo=/path/to/clone
```

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
| `--headless` | Don't open a browser — for assistant-only sessions. | `TIPPANI_HEADLESS` |
| `--ado-token=<t>` | Sign in with an access token instead of an interactive login. | `TIPPANI_ADO_TOKEN` |
| `--github=<owner/repo>` | Review a GitHub PR; pair with the positional PR number. | `TIPPANI_GITHUB_REPO` / `TIPPANI_GH_REPO` |
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

1. **Already signed in on this machine?** Tippani uses `gh auth token` for
   GitHub, or the existing Azure CLI/PAT flow for Azure DevOps.
2. **Prefer a token?** GitHub: `--gh-token` / `TIPPANI_GH_TOKEN`.
   Azure DevOps: `--ado-token` / `TIPPANI_ADO_TOKEN`.
3. **Neither?** Azure DevOps can prompt once for a PAT. GitHub asks you to run
   `gh auth login` or provide a token; Tippani never stores the GitHub token.

You only do this the first time; after that, Tippani connects on its own.

## Offline mode

```bash
# First run caches everything
npx tippani 12345

# Later, work offline — no connection needed
npx tippani 12345 --offline

# Your comments are queued locally.
# When you're back online, sync them:
npx tippani 12345   # then click 'Sync' in the status bar
```

The cache lives in `~/.tippani/cache/` and is valid for one hour.

## Build Standalone Binary

```bash
npm run build
```

Produces:
- `dist/bin/tippani` — macOS standalone (68MB, no Node.js required)
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

**Tools (40):**

- **Portal & navigation** — `open_pr` (ADO by default; for GitHub pass `provider: "github"`, `owner`, and `repo`), `open_file`, `open_thread`, `show_feedback` (cross-PR triage page), `set_view`, `set_feedback_filter`, `refresh_spec`.
- **Reading** — `list_threads`, `get_thread`, `get_spec`, `get_spec_draft`, `triage_summary`; focus with `focus_thread`.
- **Stage-then-push** — stage review work with `stage_draft`, `edit_spec`, and `stage_resolve_thread`; stage authoring work with `stage_branch`, `stage_spec`, and `stage_spec_pr`. Nothing staged by MCP reaches your repository host until one explicit `push_staged_changes` call. Also `clear_draft` and `clear_spec_edit`.
- **Discovery** — `list_prs`, `search_specs`, `search_work_items`, `get_file_commits`.
- **Local review (no PR, no host account)** — `open_branch`, `open_branch_file`, `open_local_file`.
- **Annotations** — `read_annotations`, `add_annotation`, `edit_annotation`, `delete_annotation`, `reply_annotation`, `resolve_annotation`, plus navigation (`navigate_annotations`, `jump_to_annotation`, `show_resolved_annotations`) and bulk cleanup.

Staged whole-file edits show up in the portal as a side-by-side Current/Proposed diff you can accept-and-refine in the editor before committing.

The portal can also run standalone with `--headless` (assistant-only, no browser), `--port=<n>` (run several at once), and `--ado-token=<t>` (token-based sign-in, skipping the interactive login). The underlying HTTP control API is directly usable for scripts and IDE extensions — see `src/control-api.js`.

## License

MIT — see [LICENSE](LICENSE)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.
