# Releasing Tippani

Manual release — there is no CI. Run these from `main` after the release PR is merged.

## Prerequisites

- On `main`, with the release commit merged (version bumped in `package.json`, CHANGELOG entry added).
- `npm test` is green.
- `npm run build` produces `dist/cli.cjs`, the launchers, and (on macOS) `dist/bin/tippani`.
- Logged in to npm as a `tippani` package owner (`npm whoami`) and to `gh` with push access.

## Architecture and build

The CLI entry point, `src/index.js`, signs in to the repository host, loads PR
metadata, changed files and threads, and caches review data locally. Local-clone
review skips repository-host sign-in. An Express server listens on port 3847 by
default, renders Markdown through `remark` and `rehype`, and opens the browser.
Provider adapters and helper modules handle repository-specific behavior.

Browser comments enter a local queue before attempted online delivery. Offline
actions wait for sync; votes are never queued because a delayed vote could approve
content that has since changed. Staged authoring has a separate explicit publication
step. See the [CLI and API reference](mcp-api.md) for configuration and endpoints.

`src/demo.js` serves fixture data using shared portal helpers; its write routes are
stubs, not a persistence or repository-integration test.

```bash
npm run build
```

Build outputs:

| Output | Purpose |
|---|---|
| `dist/bin/tippani` | macOS standalone binary, approximately 123 MB; no Node.js installation required to run. |
| `dist/cli.cjs` + `dist/tippani.bat` | Windows bundle and launcher; Node.js 18+ for the release wrapper. |
| `dist/tippani.sh` | Linux/macOS shell launcher for the bundle. |

To build a Windows `.exe`, run the build on Windows with Node.js 20+.
For npm-based installation, use Node.js 20+; release-wrapper prerequisites above
are distinct from source dependency requirements.

## Beta / pre-release (e.g. `1.3.0-beta.0`)

A beta keeps `latest` on the previous stable, so `npm i -g tippani` does **not** pull it.

```bash
# 1. Verify
git checkout main && git pull
npm ci
npm test
npm run build

# 2. Tag
git tag v1.3.0-beta.0
git push origin v1.3.0-beta.0

# 3. Publish to npm under the "next" dist-tag (NOT latest)
npm publish --tag next

# 4. GitHub pre-release with the built artifacts
gh release create v1.3.0-beta.0 \
  --prerelease \
  --title "v1.3.0-beta.0 — WYSIWYG editing (beta)" \
  --notes-file docs/release-notes/v1.3.0-beta.0.md \
  dist/cli.cjs dist/tippani.bat dist/tippani.sh dist/bin/tippani
```

Install the beta for testing: `npm i -g tippani@next` (or download the binary from the pre-release).

## Promote to stable (`1.3.0`)

After the beta has held up on real edits:

```bash
# bump package.json version -> 1.3.0, move the CHANGELOG heading, commit on main
npm version 1.3.0 -m "Release 1.3.0"   # creates the commit + tag
git push && git push --tags
npm run build
npm publish                            # defaults to the "latest" dist-tag
gh release create v1.3.0 \
  --title "v1.3.0 — WYSIWYG editing" \
  --notes-file docs/release-notes/v1.3.0.md \
  dist/cli.cjs dist/tippani.bat dist/tippani.sh dist/bin/tippani
```

## Notes

- `dist/` is gitignored; artifacts are produced by `npm run build` at release time and attached to the GitHub release, not committed.
- The macOS standalone binary (`dist/bin/tippani`) only builds on macOS (Node SEA). On other platforms, ship `cli.cjs` + the matching launcher.
- Release-note bodies live under `docs/release-notes/`.
