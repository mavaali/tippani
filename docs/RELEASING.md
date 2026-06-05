# Releasing Tippani

Manual release — there is no CI. Run these from `main` after the release PR is merged.

## Prerequisites

- On `main`, with the release commit merged (version bumped in `package.json`, CHANGELOG entry added).
- `npm test` is green.
- `npm run build` produces `dist/cli.cjs`, the launchers, and (on macOS) `dist/bin/tippani`.
- Logged in to npm as a `tippani` package owner (`npm whoami`) and to `gh` with push access.

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
