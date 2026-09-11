# Releasing Tippani

Every version tag (`v*`, including prereleases) runs `.github/workflows/release.yml`.
A release is published only after all three native installers build, pass their
packaged-runtime smoke, and pass signature verification. Do not create a public
release manually or publish npm first.

## Prerequisites

- On `main`, with the release commit merged (version bumped in `package.json`, CHANGELOG entry added).
- `npm test` is green.
- The release tag must exactly match `v` + `package.json` version.
- Repository signing secrets must be configured by an authorized maintainer:
  - `MAC_CSC_LINK`: base64 Developer ID Application certificate (.p12);
    `MAC_CSC_KEY_PASSWORD`: certificate password.
  - `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`: Apple notarization
    credentials for that developer account.
  - `WIN_CSC_LINK`: base64 Windows code-signing certificate (.pfx);
    `WIN_CSC_KEY_PASSWORD`: certificate password. The certificate must be trusted
    and usable on the Windows runner. If your issuer requires hardware/cloud HSM
    signing, configure an approved runner/signing integration before release;
    exporting a non-exportable key is not an option.
- GitHub Actions must allow macOS arm64, macOS Intel, Windows x64 runners and
  release publication by the workflow's `GITHUB_TOKEN`.
- Missing signing credentials, notarization rejection, failed signature checks,
  missing architectures or failing tests block publication. Never disable these
  checks to get an unsigned public release out.

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

The desktop app is a small isolated Electron launcher, not a replacement review UI.
It forks the same bundled CLI in Electron's Node runtime and opens the authenticated
portal in the system browser. It accepts provider tokens over private IPC, never
arguments or an unauthenticated HTTP setup form. The renderer is sandboxed, has no
Node integration or network access, and can invoke only fixed, sender-validated
operations. The IPC pipe also terminates its server when the app exits or crashes.
No provider credential is persisted by Tippani. Azure CLI manages its own sign-in
cache. ADO setup uses only Azure CLI's first-party Entra flow, with explicit account
selection and tenant/object-id-pinned refresh through `/api/v1/ado-token` using the
existing token-refresh helper. It does not require PATs, register an OAuth app,
change the default account, or fall back to Git credentials. Existing `~/.tippani` data remains outside
the installation directory across upgrades/uninstall.

Local-only launch uses the native directory picker and the existing local-repository
validator, then starts the bundled CLI with `--local-repo`, `--local-only` and
`--offline`. It skips provider authentication (including saved PATs), rejects
token updates and prevents remote connection creation. The desktop smoke exercises
a real temporary Git repository and proves local Markdown rendering, remote-open
rejection and preserved files without Azure CLI or provider tokens.

Electron and electron-builder are development-only dependencies: maintained
cross-platform graphical runtime and DMG/NSIS packaging are used instead of a
bespoke native installer. Runtime metadata is pinned by the lockfile and Electron
version in `package.json`; keep Electron current with security releases.

```bash
npm ci
npm run test:desktop
npm run package:desktop                 # native development installer, unsigned/ad hoc
npm run smoke:desktop                   # exercise the packaged runtime on this OS
node scripts/smoke-installed.mjs installers/Tippani-VERSION-mac-arm64.dmg
node scripts/build.js --bundle-only     # CLI without optional macOS SEA
npm run build                          # CLI + macOS SEA; SEA failures now fail the build
```

Build outputs:

If a cloud-synced workspace adds Finder metadata to app bundles and `codesign`
reports resource-fork/Finder-information errors, build into a non-synced directory
with electron-builder's `--config.directories.output=PATH` option, then copy only
the finished DMG back. Do not remove quarantine attributes or use personal signing
credentials for development builds.

| Output | Purpose |
|---|---|
| `installers/Tippani-VERSION-mac-arm64.dmg` | Apple Silicon Mac application installer (macOS 12+). |
| `installers/Tippani-VERSION-mac-x64.dmg` | Intel Mac application installer (macOS 12+). |
| `installers/Tippani-VERSION-win-x64.exe` | Per-user Windows NSIS installer, Start menu entry and uninstaller (Windows 10+). |
| `dist/desktop-app/` | Staged self-contained application, including bundled CLI; no production node_modules needed. |
| `dist/cli.cjs` + `.bat` / `.sh` wrappers | Optional CLI distribution; separately installed Node required. |
| `dist/bin/tippani` | Optional macOS CLI SEA, not the graphical installer. |

Use a native runner for each architecture. `.github/workflows/desktop.yml` builds
all three on every CI push/PR without signing secrets; these test artifacts must
not be distributed as releases. The release caller enables fail-closed signing,
notarizes/staples the Mac app and DMG, and checks Windows Authenticode on the app
and installer. Installed-path tests mount/copy the DMG or silently install,
reinstall and uninstall NSIS on its native runner, using a path with spaces and
Unicode. Smoke tests run the packaged executable, verify actual
provider-backed browser content with fixture credentials, enforce loopback/browser
auth, test expired credentials/retry and shutdown, and preserve data in a private
repository-local test profile. They do not claim live provider or Windows tests
passed on a Mac developer machine.

## Release procedure (stable or prerelease)

A prerelease version such as `1.9.0-beta.0` stays a GitHub prerelease. Publish its npm
package using `--tag next` so it does not replace `latest`.

```bash
# 1. Verify the merged release commit (version, lockfile and CHANGELOG updated).
git checkout main && git pull
npm ci
npm test
npm run package:desktop
npm run smoke:desktop

# 2. An authorized maintainer creates/pushes the matching version tag.
git tag v1.9.0-beta.0
git push origin v1.9.0-beta.0

# 3. Wait for Release workflow success and inspect all downloaded installers.
# Only then publish npm from the matching checkout:
npm publish --tag next                 # prerelease
# npm publish                          # stable only
```

## Notes

- The workflow uploads all installers, npm tarball, CLI wrappers and
  `SHA256SUMS.txt` to a draft before making it public. Build jobs never publish.
  A failed upload leaves a draft; rerun the failed workflow, don't publish it by hand.
- `prepublishOnly` blocks normal `npm publish` until the matching GitHub release
  contains both Mac installers, the Windows installer and checksums. Don't bypass
  lifecycle scripts. This presence check complements, not replaces, CI signing checks.
- `dist/`, `installers/` and `.desktop-validation/` are ignored, not committed.
  Development installers are unsigned/ad hoc and cannot validate public signing.
- End users upgrade by quitting, downloading and reinstalling. There is no
  auto-update service. Uninstall removes the app, never silently removes user data.
- Before the first public release, manually install/launch, upgrade and uninstall
  on clean Mac and Windows accounts; confirm shortcuts, browser opening, Microsoft sign-in/GitHub token
  setup and retained data. Verify downloaded checksums and signatures.
- Release-note bodies may live under `docs/release-notes/`; the workflow generates
  GitHub notes by default. npm installation remains supported with Node.js 20+.
