# Tippani WYSIWYG Editor — Design

**Date:** 2026-06-04
**Status:** Approved direction, not yet implemented

## Problem

Tippani renders Azure DevOps PR markdown as a clean three-column review portal — a
read path. The write path is missing: contributors who won't author raw markdown
have no way to edit specs in the tool. We want to add WYSIWYG editing that commits
back to the PR branch.

Two hard constraints, stated up front:

1. **WYSIWYG** — a non-technical contributor should not stare at raw markdown.
2. **Git-compatible** — saves must produce clean, reviewable diffs. A save that
   reformats the whole file is unacceptable; the diff must show only what the user
   actually changed.

A third, discovered during design: **editable tables are required at v1** ("table
stakes"), not deferrable.

## Current state (codebase)

- `src/index.js` — single 1,516-line file. An Express server renders markdown
  **server-side** through a `unified` (remark → rehype) pipeline and serves HTML
  pages built from template strings with **inline vanilla JS**.
- No client-side bundler for the frontend. `esbuild` exists only to build the
  standalone binary.
- Headline feature is **offline mode** (cache PR data, comment offline, sync later).
- `stripFrontmatter()` and `buildSourceMap()` already exist.

So this feature adds a *client-side write path* to a *server-side read-path* app.

## Decision

Build a **Typora-style live-preview editor on CodeMirror 6**, where the editor's
document model **is the markdown text itself** ("buffer-is-the-file").

This is not the Notion/Word model (formatted blocks over a hidden AST). It is the
Obsidian Live Preview / Typora model: the buffer holds raw markdown, and decorations
render formatting inline and hide markup on lines the cursor isn't on.

### Why not Milkdown or Tiptap

Both are ProseMirror. Their document model is an **AST**; the markdown file is
*generated* from the tree on every save. That makes git-compatibility something you
fight for — either by canonicalizing (every save reformats the file to a house
style, a noisy commit per legacy spec) or by expensive block-level partial
reserialization. Anything outside the schema (YAML frontmatter, `<!-- -->`,
`[[_TOC_]]`, `::: mermaid`, ADO mentions) is dropped or escaped unless you write
custom nodes + parsers + serializers for each.

Tiptap is strictly worse than Milkdown here: markdown is bolted on via a third-party
extension over an HTML/JSON model, adding a lossy hop. Milkdown is at least
remark-based.

With CodeMirror 6, git-compatibility is **free by construction** — there is no
serialization step to introduce noise. Frontmatter, HTML comments, and ADO macros
pass through untouched because they are just text the editor doesn't specially
decorate. Issue 2 (round-trip fidelity), originally "the hardest issue," nearly
evaporates.

### The trade we accepted

We trade Milkdown's batteries-included WYSIWYG (including free editable tables via
`prosemirror-tables`) for git-perfection plus a build-it-yourself live-preview layer.
The displacement is deliberate: Milkdown's free tables come bundled with whole-document
reserialization, which violates the git constraint on *every paragraph*. We pay for
**one contained hard widget (tables)** instead of a **permanent global fidelity tax**.

## Architecture

### 1. Client bundling

CM6 ships as ESM packages and the frontend has no bundler today. Because offline mode
is the headline feature, CM6 must be **bundled locally** (extend the existing esbuild
step) — never loaded from a CDN.

### 2. Live-preview decoration layer

CM6 provides a Lezer syntax tree (`syntaxTree(state)`) and four decoration types.
Live preview = walk the tree, emit decorations, rebuild on selection change so markup
*reveals* when the cursor lands on its line/node.

Effort tiers:

- **Easy (low risk, looks good):** heading sizes, bold/italic/inline-code styling,
  blockquotes, list indentation, horizontal rules, fenced code blocks with syntax
  highlighting (near-Typora parity, mostly free from `lang-markdown`).
- **Medium (the bulk, finicky but a solved pattern):** hide-markup-off-cursor /
  reveal-on-cursor, inline links, images as widgets, strikethrough.
- **Hard (one cliff): tables** — see below.

### 3. Table editor (the hard widget)

A **widget decoration** replaces the pipe-table block with a real HTML `<table>` of
contenteditable cells. On edit, the grid serializes back to **deterministic, canonical
pipe markdown** and dispatches a CM6 transaction replacing just that block's source
range. The buffer stays the file; only the edited table's lines change; diffs stay
clean because we control the serializer.

Genuinely hard parts: focus/selection handoff CM6 ↔ contenteditable grid; undo/redo
wired through CM6 transactions; re-render when underlying text changes; cell
navigation (tab/arrow/enter); add/delete row/column; alignment.

This is the single biggest engineering item and gets its own issue.

### 4. Write path

Explicit save only (no auto-save — specs are high-stakes). On save: show diff preview,
then push the buffer to the PR source branch via ADO REST (`PUT .../pushes`) with the
stored object ID as `oldObjectId` for optimistic concurrency. Single-file, single-commit.
Offline saves queue like comments do today and sync on reconnect.

### 5. Safety rails

Dirty state = `buffer !== loadedText` (trivial under buffer-is-file). Visual dirty
indicator, `beforeunload` guard, file-picker warning. Conflict guard via `oldObjectId`
rejection — show a reload / copy-to-clipboard message, never auto-merge.

## Issue chain

Filed bottom-up so dependencies resolve to real issue numbers.

1. **Integrate CM6 + client bundling + inline live-preview (prose).** Foundation.
2. **WYSIWYG table editor** — grid widget ↔ canonical pipe markdown. Depends on 1.
   The hard one.
3. **Diff-on-save + buffer-is-file invariant.** Depends on 1. (Shrunk from original
   "round-trip fidelity.")
4. **Edit/view toggle** — `Cmd/Ctrl+E`, unsaved-changes guard, hide when no write
   access. Depends on 1.
5. **ADO PR write path** — commit buffer to PR branch, diff preview, offline queue.
   Depends on 1, 3, 4.
6. **Dirty state + conflict guard.** Depends on 5.

## Scope discipline

- **v1 live-preview** = headings, emphasis, lists, links, code blocks, **and editable
  tables** (tables are required, not deferred).
- Inline images / embeds as widgets: polish, can follow v1.
- No real-time collaboration. Single-author editing only.
- No auto-save.
- No auto-merge on conflict.

## Primary risks

1. **Table widget** — the focus/undo/sync integration is the most likely place to
   slip. Mitigation: it is contained, and serialization to canonical pipe markdown is
   deterministic and testable in isolation.
2. **Reveal-on-cursor polish** — finicky but well-trodden; reference implementations
   (Obsidian, community CM6 plugins) exist to crib from.
3. **Bundling into the offline binary** — must verify CM6 bundles cleanly into the
   esbuild/postject binary build and works offline.
