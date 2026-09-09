# Review your first spec in Tippani

Tippani lets you read a spec, discuss it with its author, and suggest changes in
your browser. This walkthrough takes you from opening a review to sharing feedback.
You don't need to edit the document or use an AI assistant to review it.

A **pull request**, or **PR**, is a proposed update that colleagues review before
it becomes part of the shared version. Tippani displays the Markdown (`.md`) specs
in that update. It doesn't display Word documents or PDFs.

**First time using Tippani?** Start with [one-time setup](#one-time-setup), or ask
a teammate to help with it. You'll need access to the repository: the shared place
where your team's specs are stored.

**Find what you need:** [First review](#1-open-the-right-spec) ·
[Troubleshooting](#when-something-doesnt-look-right) · [Other tasks](#other-tasks) ·
[Screen reference](#screen-reference) · [Setup](#one-time-setup).

## 1. Open the right spec

Ask the author for the review number and the name of the spec they want you to read.
Use the launch command from your setup. Tippani opens a browser window; leave its
terminal window running while you work.

Check the review's title and author. Under **Changed Files**, choose the spec.
If the document is already open, you can start reading.

![The spec in the center, its headings on the left, and review comments on the right](img/spec-view-current.png)

*Screenshots show sample content. Your review will have its own title and text.*

Use **Contents** on the left to jump to a section. The middle is the spec; the
right-hand **Comments** panel holds the discussion about it.

**You're in the right place when:** the title and file match the author's request.

## 2. Read the discussion

Select a comment to find the passage it refers to. Read the replies before adding
your own; the author may already have answered your question.

Need the full discussion? Open **Feedback** from the review overview. It brings
together comments across the review's files.

Keep **Current** selected while you read. **Diff** and **Proposed** preview edits
being prepared in Tippani; they aren't a history of everything changed in the PR.
They stay disabled when there are no edits to preview.

## 3. Choose a private note or shared feedback

Before typing, check which panel you're using:

| Panel | Who can see what you write? |
|---|---|
| **Annotations** | Notes kept on your computer, not posted to the review. |
| **Comments** | Feedback shared on the review when you post it. |

For a private reminder, select **Annotations**, hover over the relevant passage,
and select the **Add annotation** control. Write your note and use its **Save**
control. Return to **Comments** when you're ready to discuss something with others.

For example, "Check the launch date with the team" might be a private reminder.
"Can we explain what happens when the upload fails?" is feedback for the author.

### Reply to someone

**Posting shares your reply immediately when you're online.** You don't need to
press **Push to remote** afterward.

1. Select **Reply** on the comment.
2. Write your response.
3. Select **Post & next** to send it and move to the next comment.

Look for **Reply posted**. **Reply queued** means Tippani has kept it locally but
hasn't delivered it. See [queued feedback](#queued-feedback).

### Add a new comment

With **Comments** selected, hover over the passage and select its `+` control.
Check the section and line shown in the comment box, write your feedback, and
select **Comment**.

**Comment posted** means it was shared. A pending-sync message means it wasn't.
Use **Cancel** if you're not ready to send it.

## 4. Finish your review

You can leave feedback without making a review decision yet. When you're ready,
use the buttons at the bottom:

| Button | What you're telling the team |
|---|---|
| **Approve** | You've reviewed the proposal and approve it. |
| **Request Changes** | The author needs to address something before you approve. |

Both buttons submit your decision immediately when you're online. Neither merges
the update into the shared version. Offline decisions aren't queued: reconnect
before submitting one.

Use **Resolve** on a comment only when that discussion has been addressed, following
your team's review convention. It updates the shared discussion online; it isn't
a private "I've read this" marker.

**Before leaving:** check whether your feedback was posted or is still queued.
You don't need to approve a spec just to finish reading it.

## 5. Come back later

Closing a browser tab isn't the same as stopping Tippani. If Tippani is still
running, open another terminal window and run:

```bash
tippani open
```

This opens a fresh sign-in link. Don't bookmark or share that link: it works once.
Don't type `localhost:3847` to start a new browser session.

If Tippani says no portal is running, use your original launch command again.
If it reports an expired app session, preserve any open edits before restarting.
Don't assume unsaved text or every staged action will survive a restart.

---

## When something doesn't look right

| What you see | What to do |
|---|---|
| **Authentication required** or an expired browser link | Run `tippani open` while Tippani is running. |
| More than one running portal | Use the listed port, for example `tippani open --port=3848`. |
| Review not found or access denied | Check the review number and repository with the author. Confirm you can open the review in Azure DevOps or GitHub. |
| No Markdown files | Ask for the review containing the `.md` spec. Tippani can't render a Word document or PDF. |
| **Diff** or **Proposed** is disabled | There are no proposed edits to preview. Use **Current** to read. |
| **Edit** is missing | That document or review may not be editable with your access. You can still use the available review controls. |
| **File changed on the server** | Copy your changes before reloading. Read the newer version, then reapply your changes. |

### Queued feedback

**Queued** means saved on this computer, not delivered to the author. A failed
connection can queue feedback even if you didn't deliberately choose offline mode.

Reconnect and use the review's **Sync to ADO** button. That label is also used in
the current GitHub review screen; the action sends to the review's repository host.
Check for failures after syncing.

If you started Tippani with `--offline`, save or copy any unfinished work, stop
that instance, and launch the same review without `--offline` before syncing.
Simply reconnecting Wi-Fi doesn't change that launch mode.

---

## Other tasks

### Make an edit to a spec under review

If you only want the author to consider a change, leave a comment. Editing changes
the document itself.

1. Select **Edit** and make your changes using the formatting toolbar.
2. Select **Save** to see a preview of what will change.
3. Read the preview and the **Commit message**, the short description saved with
   the update. Select **Cancel** to keep working, or **Confirm & Save** to proceed.

**In a PR review, Confirm & Save can publish the edited spec immediately.** It
updates the version under review, not the team's main version. Look for the saved
confirmation; a queued or conflict message needs attention before you leave.

![The editing view with formatting controls and the comments panel](img/wysiwyg-editor.png)

### Write a new spec

This is a separate workflow from reviewing an existing PR. A **branch** is a
separate version where you prepare work without changing the team's main version.

1. In **Branches**, select **+ New branch** and choose the version to start from.
2. Add a Markdown file or edit an existing one on that branch. Save your work.
3. In **Review queue**, select **+ New pull request**. Choose the repository and
   source and target branches; add a title and description. Select **Stage PR**.
4. Review the pending work, then select **Push to remote** to publish it.

Here, **staged** means prepared in Tippani but not yet published. The staged-changes
count can include other pending work, not just the file you're looking at.

In Azure DevOps, the PR form also supports work-item details. GitHub doesn't have
that option. **Draft** creates a PR that isn't ready for formal review; the
**Publish** action on a draft PR card stages its promotion for the next push.

After a push, successful items are cleared. Failed items remain with an error so
you can address the problem and retry. Don't assume a partially failed push
published nothing.

### Know which actions publish

| Action | When it becomes shared |
|---|---|
| Save a private annotation | It isn't posted to the review. |
| **Comment**, **Post & next**, or **Resolve** in a PR | Immediately online; otherwise queued for delivery. |
| **Confirm & Save** while editing a PR file | Attempts to publish immediately online; read the result. |
| Save while authoring through **Branches** | Staged until **Push to remote**. |
| **Approve** or **Request Changes** | Immediately online; never queued offline. |
| **Sync to ADO** | Sends queued review work. |
| **Push to remote** | Publishes the pending staged work. |

### Work offline

Open the review online first and load the files you need. Tippani keeps a local
copy; files it couldn't cache won't be available offline.

Launch the same review with `--offline`. You can read cached content and queue
feedback. Later, restart online and sync as described under
[queued feedback](#queued-feedback). Review decisions require a live connection.

The one-hour cache freshness rule applies to online loading. It doesn't delete
your offline copy after an hour. Use `--refresh` on an online launch when you need
to bypass the cache.

### Use an AI assistant

This is optional. An assistant can prepare replies and edits for you to inspect.
Assistant staging is different from the browser's immediate-post buttons.
See the [MCP & API Reference](mcp-api.md) for setup and publishing controls.

---

## Screen reference

You don't need to learn every screen to complete a review.

### Discovery

Discovery is the home screen for finding work. Azure DevOps has five tabs; GitHub
omits **Work items**.

| Tab | Use it to |
|---|---|
| **Specs** | Search Markdown specs from repositories' default branches. Narrow by file name, repository, author, or folder. |
| **Review queue** | Find a PR by title or author, then use the available filters to narrow the results. |
| **Work items** | Search Azure DevOps work items and open an item in your work tracker. |
| **Branches** | Browse remote branches or switch to **Local** for a clone on disk. |
| **Reading list** | Keep links to local Markdown files you want to read again. |

Newly published specs won't appear in search until the repository's search index
has picked them up. A Reading list file opens from your computer, not from `main`.
Its pinned **Tippani — User Manual** entry opens Tippani's README.

![Discovery's review queue](img/discovery-review-queue.png)

### Feedback

The **Feedback** screen collects discussions across the review. Use **Needs you**,
**Awaiting reviewer**, **Viewed**, **FYI**, or **Resolved** to narrow the list, or
filter by reviewer, file, and text. Expand a discussion to read the replies.
In its thread view, the send button is **Post reply**.

![Feedback across a review's files](img/pr-feedback-threads.png)

### Reading views and navigation

| View | What it shows |
|---|---|
| **Current** | The loaded document before your proposed edits. |
| **Diff** | How your edits or a staged proposal differ from that document. |
| **Proposed** | The edited version as a readable page. |
| **Edit** | The document editor, when editing is available. |

You can resize the side panels or collapse them for more reading space. In the
Comments panel, `J` and `K` move between active comments, `R` opens a reply, and
`S` skips ahead. In a reply box, `Ctrl+Enter` on Windows or `Command+Enter` on Mac
posts and advances. These shortcuts are optional; they send just like the button.

---

## One-time setup

*This section is for you or the teammate helping you get started. Once setup is
finished, return to [Open the right spec](#1-open-the-right-spec).*

### Install Tippani

Use [Node.js 20 or later, with npm](https://nodejs.org/en/download) for this installation.
Install software through your organization's approved process. A terminal is the app where you
paste commands: Terminal on Mac or PowerShell on Windows.

```bash
npm install -g tippani
```

To look around without repository access:

```bash
tippani --demo
```

The demo shows sample content. Comments entered there aren't saved or sent.
Stop the demo with `Ctrl+C` in its terminal before opening a real review on the
same port.

### Connect to Azure DevOps

Have [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) installed
and sign in with the account that can access the review:

```bash
az login
```

Ask the author for the PR number, organization URL, and project name. Replace the
example values below; keep quotation marks around a project name containing spaces.

```bash
tippani 12345 --org=https://dev.azure.com/YOUR_ORG --project="Your Project" --save-config
```

That saves the connection settings and opens the review. For later reviews, use
the new number:

```bash
tippani 12345
```

If you previously saved a personal access token, Tippani uses it ahead of Azure
CLI sign-in. An expired saved token needs attention; signing in again through
Azure CLI doesn't replace it. Don't create a token if your organization prohibits
it. Ask your setup helper to resolve the credentials.

**Helper note:** starting directly with `tippani --browse` currently requires a
saved personal access token or an access token supplied through `TIPPANI_ADO_TOKEN`.
It doesn't use the Azure CLI fallback used by the PR-number command. Use the
PR-number path above for this walkthrough. Configuration flags alone don't start
Tippani or save the settings: include a PR number or a supported launch mode.

### Connect to GitHub

Have [GitHub CLI](https://cli.github.com/) installed and sign in with the account
that can access the review:

```bash
gh auth login
```

Paste the review's GitHub URL after `tippani`:

```bash
tippani https://github.com/OWNER/REPO/pull/123
```

For Discovery instead of a specific review:

```bash
tippani --browse --github=OWNER/REPO
```

Reading access doesn't necessarily grant permission to post reviews or change
files. Have the repository owner help with access errors; don't share credentials.

### Keep a launch command

Keep the command that worked for your repository. You can reuse it with a different
review number. Keep Tippani's terminal running during a review; use `Ctrl+C` to
stop it after saving or copying unfinished work.

For other installation options and advanced configuration, see the
[CLI reference](mcp-api.md#cli-reference). For a running portal whose browser tab has closed,
use [Come back later](#5-come-back-later), not another server launch.
