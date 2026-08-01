# tippani

[![npm](https://img.shields.io/npm/v/tippani?cacheSeconds=3600)](https://www.npmjs.com/package/tippani)
[![GitHub release](https://img.shields.io/github/v/release/mavaali/tippani)](https://github.com/mavaali/tippani/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> टिप्पणी — *annotation* (Sanskrit)

**Tippani** turns Azure DevOps pull-request markdown specs into a clean **reading, annotation, and authoring** workspace — so writers and reviewers never have to learn ADO's raw diff view. Discover finished specs, pick up reviews, comment inline, edit WYSIWYG, and author brand-new specs, branches, and PRs — all from a local browser portal. A matching **MCP server** exposes the same workflow to AI agents.

Tippani runs entirely on your machine: it talks to Azure DevOps directly and serves its UI from `http://localhost`. Nothing is uploaded anywhere else.

**New here?** Read the [User Guide](docs/user-guide.md) for a full tour of every screen, and the [MCP & API Reference](docs/mcp-api.md) for the agent tools and HTTP endpoints.

## Quick Start

Install globally from npm:

```bash
npm install -g tippani
tippani 12345 --org=https://dev.azure.com/YOUR_ORG --project="Your Project" --save-config
```

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

- **Discovery home** — Specs (ADO Code Search), Review queue, Work items (WIQL), Branches (remote + local clones), and a personal Reading list.
- **Three-pane reviewing** — resizable contents rail, rendered spec, and comment threads; jump between comments with `J`/`K`.
- **Rendered specs** — Markdown with tables, code, images, and **Mermaid** diagrams; **Current / Diff / Proposed** views for every changed file.
- **Inline commenting** — official ADO threads plus private **personal comments** anchored to source lines that survive edits.
- **WYSIWYG editing** — edit a spec in place and stage the change.
- **Remote authoring** — stage a branch, add or edit `.md` files, stage a PR (with an optional work-item link), and publish the whole set with one action — no local clone required.
- **Staged everywhere** — every change is staged locally and reviewable before a single **Push to remote** crosses into Azure DevOps.
- **Local-clone review** — review branches and files straight from a git clone, no ADO round-trip.
- **Offline mode** — cache a PR, comment offline, and sync when reconnected.
- **MCP server** — drive the entire workflow from an AI agent (`tippani-mcp`).

## Documentation

| Guide | What's inside |
|---|---|
| **[User Guide](docs/user-guide.md)** | A screen-by-screen walkthrough of the whole UI: Discovery tabs, the reviewing workspace, comments, editing, and the authoring flow. |
| **[MCP & API Reference](docs/mcp-api.md)** | Every MCP tool and every HTTP control-API endpoint, with parameters and behavior. |
| **[Changelog](CHANGELOG.md)** | Release history. |

## Usage

```bash
# Open the Discovery portal (Specs, Review queue, Work items, Branches, Reading list)
tippani --browse

# Open a PR for review (uses saved config)
npx tippani <PR_ID>

# Open a specific file directly
npx tippani <PR_ID> --file="/path/to/spec.md"

# Work offline (must have run online at least once for this PR)
npx tippani <PR_ID> --offline

# Force re-fetch from ADO
npx tippani <PR_ID> --refresh
```

### All flags

| Flag | Meaning |
|---|---|
| `--org=<url>` | ADO org URL, e.g. `https://dev.azure.com/myorg`. |
| `--project=<name>` | ADO project name. |
| `--repo=<name>` | ADO repo name (optional; auto-detected from the PR). |
| `--browse` | Open the Discovery portal instead of a single PR. |
| `--file=<path>` | Open a specific file directly. |
| `--offline` | Work from cache only, no ADO connection. |
| `--refresh` | Force re-fetch from ADO (ignore cache). |
| `--save-config` | Save `--org/--project/--repo` to `~/.tippani/config.json`. |
| `--port=<n>` | Serve on a specific port (default `3847`). |
| `--headless` | Don't open a browser — agent-only session. |
| `--ado-token=<t>` | Use a bearer token for ADO (skip PAT / Azure CLI). |
| `--local-repo=<path>` | Review a local git clone with no ADO round-trip. |

Environment equivalents: `TIPPANI_ORG`, `TIPPANI_PROJECT`, `TIPPANI_REPO`, `TIPPANI_PORT`, `TIPPANI_HEADLESS`, `TIPPANI_ADO_TOKEN`, `TIPPANI_LOCAL_REPO`. Precedence: **CLI flags > env vars > config file**.

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

## Authentication

The CLI authenticates to Azure DevOps in this order:

1. **Saved PAT** — stored at `~/.tippani/pat` (only if you created one previously)
2. **Azure CLI** — `az account get-access-token` (recommended: just run `az login` once — no PAT needed)
3. **Interactive prompt** — falls back to asking for a PAT only if neither of the above is available

**You do not need a PAT.** If `az` is installed and you've run `az login`, tippani authenticates automatically and never prompts. This is the recommended path — in many tenants, PAT creation is disabled by policy.

If you can't use `az login`, generate a PAT at `https://dev.azure.com/YOUR_ORG/_usersSettings/tokens` with **Code (Read & Write)** scope.

## Offline Mode

```bash
# First run caches everything
npx tippani 12345

# Later, work offline — no ADO connection needed
npx tippani 12345 --offline

# Comments are queued locally
# When back online, sync to ADO:
npx tippani 12345   # click "Sync to ADO" in the status bar
```

Cache is stored at `~/.tippani/cache/` and is valid for 1 hour.

## Build Standalone Binary

```bash
npm run build
```

Produces:
- `dist/bin/tippani` — macOS standalone (68MB, no Node.js required)
- `dist/cli.cjs` + `dist/tippani.bat` — Windows (requires Node.js 18+)
- `dist/tippani.sh` — Linux/macOS shell wrapper

To build a Windows `.exe`, run `npm run build` on a Windows machine with Node.js 20+.

## Architecture

Single-file CLI (`src/index.js`) that:
1. Authenticates to ADO via PAT or `az cli`
2. Fetches PR metadata, changed files, file contents, comment threads
3. Caches everything locally for offline use
4. Starts a local Express server on port 3847
5. Renders markdown to HTML via `remark` + `rehype`
6. Opens the browser to Tippani

Comments are written to a local queue first, then synced to ADO. If offline, they stay in the queue until the next sync.

## AI / MCP integration

Tippani exposes a [Model Context Protocol](https://modelcontextprotocol.io) server so LLM clients (Claude Desktop, GitHub Copilot, etc.) can drive the review workflow — open a PR, triage threads, stage replies and whole-file spec edits, resolve or mark threads viewed — while you watch in tippani's browser UI and approve each action. The design is tracked in issue [#42](https://github.com/mavaali/tippani/issues/42).

**Self-bootstrapping — you don't start tippani first.** The shim launches (or adopts) a review portal per PR on demand via the `open_pr` tool, opening a visible browser window for you while the agent drives it. Multiple PRs can run at once on separate ports, discovered across processes via a per-port registry under `~/.tippani/instances/`.

**Setup (Claude Desktop):** install tippani globally (`npm i -g tippani`), then add to your `claude_desktop_config.json`. The shim authenticates to Azure DevOps with a token you pass in via `TIPPANI_ADO_TOKEN` (an ADO REST/git access token) — it will refuse to start without one. Optionally set `TIPPANI_ADO_AUDIENCE` to have it verify the token's audience on startup:

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

**Tools (40):**

- **Portal & navigation** — `open_pr` (call first), `open_file`, `open_thread`, `show_feedback` (cross-PR triage page).
- **Reading** — `list_threads`, `get_thread`, `get_spec`, `get_spec_draft`, `triage_summary`; focus with `focus_thread`.
- **Stage-then-push** — stage review work with `stage_draft`, `edit_spec`, and `stage_resolve_thread`; stage authoring work with `stage_branch`, `stage_spec`, and `stage_spec_pr`. Nothing staged by MCP reaches Azure DevOps until one explicit `push_staged_changes` call. Also `clear_draft` and `clear_spec_edit`.

Staged whole-file edits show up in the portal as a GitHub-style Current/Proposed diff you can accept-and-refine in the editor before committing.

The portal can also run standalone with `--headless` (agent-only, no browser), `--port=<n>` (run several at once), and `--ado-token=<t>` (bearer auth, skipping the PAT / az CLI). The underlying HTTP control API is directly usable for scripts and IDE extensions — see `src/control-api.js`.

## License

MIT — see [LICENSE](LICENSE)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.
