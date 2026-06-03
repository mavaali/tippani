# Changelog

## 1.1.0 (2026-06-03)

### Error Handling
- **Fixed:** Empty PAT no longer saved when prompt is cancelled — previously broke all subsequent runs
- **Fixed:** Port 3847 in use now shows friendly message instead of raw EADDRINUSE crash
- **Fixed:** Disk full during cache/queue writes caught and warned instead of crashing
- **Fixed:** ADO 401/403/404/429/5xx errors show actionable messages with guidance
- **Fixed:** Wrong org URL, project, or repo name shows specific fix instructions
- **Fixed:** XSS vulnerability — comment rendering no longer allows raw HTML execution

### Improvements
- Org URL auto-normalized (trailing slash stripped, `https://` auto-prepended)
- Abandoned/completed PRs show a warning on startup
- PAT prompt URL now uses your configured org instead of hardcoded value

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
