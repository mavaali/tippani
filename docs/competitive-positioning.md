# Tippani vs. the field

**Date:** 2026-08-09
**Status:** Point-in-time research. Verify before citing anything here as still true — see "How to keep this honest" at the bottom.
**Sources:** Compiled from two research passes across PR-review tools, AI code-review agents, docs-as-code CMSes, and MCP servers for developer review workflows. Full findings with citations: `research-review-tools.md` and `research-spec-workflow.md` (session artifacts, not in this repo — ask Mihir if you need the raw pass).

This is deliberately **not** a feature-comparison table embedded in the README. Named-competitor tables age out of date within a release cycle and invite a fight you have to keep re-winning. This document exists so the *claim* is dated, sourced, and revisable — link to it once from the README ("[how this compares](docs/competitive-positioning.md)"), don't repeat the specifics there.

## The claim, stated once

**No other tool pairs an MCP server with a visible, human-driven browser UI, where the agent stages a change and a human watches and approves it before anything reaches the remote.**

That's the whole differentiated bet. Everything else — offline mode, local-clone review, private annotations — is real but secondary. This is the one nobody else is building, as of the research date above.

## What was checked, and what it found

### MCP servers for developer review workflows

The three most relevant MCP servers all turned out to be **headless API bridges** with no UI component at all:

- **Microsoft's own Azure DevOps MCP server** ([github.com/microsoft/azure-devops-mcp](https://github.com/microsoft/azure-devops-mcp)) exposes PR read/write, thread read/write, and a `vote` tool — a superset of what tippani's ADO client does. It opens no browser, shows no diff, and a call to its write tools posts directly to ADO. There is no staging step.
- **GitHub's official MCP server** ([github.com/github/github-mcp-server](https://github.com/github/github-mcp-server)) is the same shape for GitHub: headless, writes land immediately, no visible UI.
- **Greptile's MCP** ([greptile.com/independence.md](https://www.greptile.com/independence.md)) feeds an agent context about existing PR review comments so it can apply fixes in the agent's own coding environment — a different job (agent-assisted code fixing), still headless.

**Closest analog found: GitBook's MCP server** ([gitbook.com/docs/docs-as-code/gitbook-mcp.md](https://gitbook.com/docs/docs-as-code/gitbook-mcp.md)). An agent can open a "change request" through GitBook's MCP tools, and a human reviews and merges it in GitBook's own web editor — genuinely the same "agent proposes, human approves in a UI" shape. But it's for publishing documentation sites, not reviewing a pull request; there's no PR-comment-thread model, no line anchoring to a diff, and no offline mode. It's the nearest relative, not a competitor in the same space.

### AI code-review agents that write to a PR

- **CodeRabbit** ([coderabbit.ai](https://www.coderabbit.ai)) posts AI-generated review comments directly to GitHub, GitLab, Bitbucket, and Azure DevOps PRs. It's a cloud bot: comments land immediately, there's no staging, no offline mode, and no rendered spec view — markdown is read as diff text, not rendered prose.
- **Qodo / PR-Agent** ([qodo.ai](https://www.qodo.ai), open source at [github.com/The-PR-Agent/pr-agent](https://github.com/The-PR-Agent/pr-agent)) — same shape: posts directly, no staging.
- **Ellipsis** ([ellipsis.dev](https://www.ellipsis.dev)) and **Sourcery** ([sourcery.ai](https://www.sourcery.ai)) — both write straight to the PR.

None of these have a "propose, then a human watches and finalizes" gate. They're closer to a very fast, very confident reviewer than to a drafting assistant.

### Docs-as-code CMSes with WYSIWYG editing over git

- **TinaCMS** ([tina.io](https://tina.io)) and **Decap CMS** ([decapcms.org](https://decapcms.org)) both give a non-technical editor a visual editor over markdown that commits to a git branch — the closest prior art to tippani's WYSIWYG-edit-and-commit feature. Neither has inline PR-thread commenting; review happens via the host's own PR/merge-request flow, same as if you'd never used the CMS at all.
- **GitBook** ([gitbook.com](https://www.gitbook.com)) — see above; publishing tool, not a PR reviewer.

### Pull-request review tools that improve on the native diff view

- **Reviewable** ([reviewable.io](https://reviewable.io)), **Gerrit** ([gerritcodereview.com](https://www.gerritcodereview.com)), **Review Board** ([reviewboard.org](https://www.reviewboard.org)) — all improve the *code* review experience (multi-round tracking, per-file state). None render markdown as a document; all show it as a diff, same as the platform they're layered on.

## Whitespace — what nobody occupies

Repeated finding across both research passes, worth naming explicitly rather than just implying:

1. **Rendering a markdown PR file as a *document*** — table of contents, real headings, hover-to-comment on a paragraph, Mermaid diagrams rendered inline — rather than as a diff. Every tool surveyed treats markdown as code text.
2. **Offline PR review.** No competitor surveyed has an offline mode. Tippani's cache-and-sync queue has no analog found.
3. **The staged-then-approved MCP model**, per the headline claim above.
4. **Local-clone review with no PR open at all.** Reviewing a spec on a branch, before it's even proposed, has no equivalent among the PR-review tools surveyed (the closest is a CMS's own editorial-workflow branch preview, which isn't a PR-thread model).
5. **Content-addressed private annotations** that survive edits to the underlying document. Not found anywhere in the survey.

## What this is NOT claiming

- Not claiming to be a better *code* reviewer than CodeRabbit, Qodo, or Greptile — those tools are good at what they do and aren't really the same category.
- Not claiming GitBook is inferior — it's excellent at what it's for (publishing), which isn't PR review.
- Not claiming this research is exhaustive. It's two focused passes, dated, with citations. Treat gaps as unknowns, not as "confirmed absent."

## How to keep this honest

This file has an expiration date, whether or not anyone remembers to check it:

- **Before citing any claim from this doc externally** (a blog post, a README line, a pitch), re-verify the specific claim against the vendor's current docs. Six months is enough for CodeRabbit to ship an MCP server or for GitHub to add a staging model.
- **If a claim here is found to be stale**, correct it here — don't let the README drift out of sync with reality the way the tool-count and token-requirement claims did in the run-up to v1.7.0 (see CHANGELOG's "Fixed — documentation drift" entries).
- **The headline claim (MCP + visible UI + staging) is the load-bearing one.** If that specific claim is ever falsified by a new competitor, this document's whole reason for existing changes — that's worth a fresh pass, not a patch.
