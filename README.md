# tippani

[![npm](https://img.shields.io/npm/v/tippani?cacheSeconds=3600)](https://www.npmjs.com/package/tippani)
[![GitHub release](https://img.shields.io/github/v/release/mavaali/tippani)](https://github.com/mavaali/tippani/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> टिप्पणी — *annotation* (Sanskrit)

**Read a spec. Discuss it with its author. Suggest a change.**

Tippani is for PMs and other contributors who review Markdown specs in Azure DevOps
or GitHub but don't want to work through a raw code diff. It opens the document in
your browser, with its headings on the left and the review discussion on the right.
You can read and respond without editing the spec or using an AI assistant.

![Tippani showing a rendered spec between its contents and review comments](docs/img/spec-view-current.png)

*Sample content shown. Your team's specs and discussions appear in its place.*

## Start with your first review

**[Review your first spec in Tippani](docs/user-guide.md)** walks through opening the
right file, reading the discussion, choosing private notes or shared feedback, and
finishing your review. It also explains what to do when a reply is queued or a
browser sign-in link expires.

A pull request, or PR, is a proposed update your colleagues can review before it
becomes part of the shared version. Ask the author for the review number or GitHub
URL and the name of the spec to read. You'll need access to its repository.

Tippani displays Markdown (`.md`) specs, including tables, code, images, and Mermaid
diagrams. It doesn't display Word documents or PDFs.

## Install the desktop app (recommended)

Download an installer from [Release downloads](https://github.com/mavaali/tippani/releases/latest):

- **Mac (macOS 12+):** choose `Tippani-VERSION-mac-arm64.dmg` for Apple Silicon,
  or `Tippani-VERSION-mac-x64.dmg` for Intel. Open it and drag **Tippani** to **Applications**.
- **Windows (Windows 10+ x64):** run `Tippani-VERSION-win-x64.exe`, then open
  **Tippani** from the Start menu.

No Node.js or npm is needed. Paste a pull request URL in the app.
**Azure DevOps:** install Microsoft's Azure CLI if needed, choose **Sign in with
Microsoft**, then explicitly select your account and tenant. No PAT or new app
registration is required; existing Azure CLI accounts can be reused.
**GitHub:** enter a GitHub personal access token. Choose **Start review**.
The existing review interface opens in your normal browser.

For local-only work, choose **Local repository**, then **Choose folder** and
**Open local repository in browser**. Select an existing Git repository.
No Azure CLI, account, PR URL or token is needed; Git is needed to browse branches.
This session does not publish remotely. Stop it and select **Remote review** to
work with Azure DevOps or GitHub.

Keep the app open while reviewing. **Open browser again** renews browser sign-in;
**Quit Tippani** stops its server without deleting saved data. To upgrade, quit
and install the newer download over the old app. Every new release includes both
Mac architectures and a Windows installer; older releases may have only CLI files.
Unsigned CI/development builds are for testing, not public distribution.

See **[One-time setup](docs/user-guide.md#one-time-setup)** for sign-in, upgrades,
uninstall and the still-supported npm/CLI installation.

## Optional command-line demo

With **Node.js 20 or later and npm** installed, run this in a terminal:

```bash
npx tippani --demo
```

The demo opens sample content without a repository account, login, or local clone.
Comments entered there aren't saved or sent. Leave the terminal running while you
look around; press `Ctrl+C` there to stop the demo. The desktop app instead opens
real reviews using the setup above.

## Know what you're sharing

**Annotations are private notes kept on your computer. Comments are shared review
feedback.** Posting a comment or reply, resolving a discussion, or submitting a
review decision can update the remote review immediately when you're online.

Editing a PR file is also different from leaving a suggestion: **Save edits to PR**
and **Commit edits** can publish the changed spec to the version under review.
**Approve PR** submits only the review vote and is blocked while edits are unsaved
or queued. Branch authoring and
assistant staging wait for an explicit push instead. Don't assume every action
waits for **Push to remote**.

Read the result after sending. **Queued** means kept locally, not delivered.
The guide's [publishing table](docs/user-guide.md#know-which-actions-publish)
explains the differences.

## Choose your next task

| I want to… | Start here |
|---|---|
| Find a spec or review | [Discovery and screen reference](docs/user-guide.md#screen-reference) |
| Edit a spec under review | [Edit, preview, and save](docs/user-guide.md#make-an-edit-to-a-spec-under-review) |
| Write a new spec | [Branches, files, and a new PR](docs/user-guide.md#write-a-new-spec) |
| Read or comment offline | [Cached reviews and queued feedback](docs/user-guide.md#work-offline) |
| Reopen a closed browser tab | [Come back later](docs/user-guide.md#5-come-back-later) |
| Set up an AI assistant | [MCP client setup and tools](docs/mcp-api.md#mcp-client-setup) |
| Configure Tippani or use a local clone | [CLI examples, flags, and authentication](docs/mcp-api.md#cli-reference) |
| Build or release Tippani | [Architecture, build outputs, and releasing](docs/RELEASING.md) |

The assistant integration is optional. You can complete the human review workflow
without configuring it. Likewise, editing and authoring are separate tasks, not
requirements for leaving useful feedback on someone else's spec.

[Release downloads](https://github.com/mavaali/tippani/releases/latest) ·
[Changelog](CHANGELOG.md) · [How Tippani compares](docs/competitive-positioning.md) ·
[MIT license](LICENSE)
