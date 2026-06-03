#!/usr/bin/env node

/**
 * Demo mode for tippani — serves the review portal with fake data.
 * No ADO connection needed. Use for generating README screenshots.
 *
 * Usage: node scripts/demo.js
 */

import express from "express";
import open from "open";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";

const PORT = 3847;

// ── Markdown rendering (copied from src/index.js) ──────────────────────

async function renderMarkdown(content) {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, { behavior: "wrap" })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(content);
  return String(result);
}

async function renderMarkdownSafe(content) {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(content);
  return String(result);
}

function stripFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { metadata: {}, body: content };
  const metadata = {};
  match[1].split("\n").forEach((line) => {
    const [key, ...vals] = line.split(":");
    if (key && vals.length) {
      metadata[key.trim()] = vals.join(":").trim().replace(/^["']|["']$/g, "");
    }
  });
  return { metadata, body: match[2] };
}

function buildSourceMap(content) {
  const lines = content.split("\n");
  const toc = [];
  const sourceMap = {};
  let pIdx = 0;
  let inPara = false;
  let paraStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hm = line.match(/^(#{1,6})\s+(.+)/);
    if (hm) {
      const text = hm[2].replace(/[*_`\[\]]/g, "");
      const id = text.toLowerCase().replace(/[^\w]+/g, "-").replace(/-$/, "");
      toc.push({ id, text, level: hm[1].length });
    }
    if (line.trim() === "") {
      if (inPara) {
        sourceMap[pIdx] = { startLine: paraStart + 1, endLine: i };
        pIdx++;
        inPara = false;
      }
    } else if (
      !inPara && !line.startsWith("#") && !line.startsWith("|") &&
      !line.startsWith("```") && !line.startsWith("-") && !line.startsWith("*")
    ) {
      inPara = true;
      paraStart = i;
    }
  }
  if (inPara) sourceMap[pIdx] = { startLine: paraStart + 1, endLine: lines.length };
  return { toc, sourceMap };
}

// ── Utility helpers (copied from src/index.js) ─────────────────────────

function cssVariables() {
  return `
:root {
  color-scheme: light;
  --cp-bg: #f7f4ef;
  --cp-bg-elevated: #fcfbf8;
  --cp-surface: #ffffff;
  --cp-surface-soft: #f5f5f5;
  --cp-border: #dedede;
  --cp-border-strong: #919191;
  --cp-text: #242424;
  --cp-text-muted: #5c5c5c;
  --cp-text-soft: #6f6f6f;
  --cp-accent: #b11f4b;
  --cp-accent-hover: #9a1a41;
  --cp-accent-soft: rgba(177, 31, 75, 0.08);
  --cp-accent-fg: #ffffff;
  --cp-success: #16a34a;
  --cp-danger: #dc2626;
  --cp-warning: #f59e0b;
  --cp-link: #0078d4;
  --cp-shadow: 0 18px 48px rgba(0, 0, 0, 0.12);
  --cp-overlay: rgba(255, 255, 255, 0.8);
  --cp-panel: rgba(255, 255, 255, 0.86);
  --cp-panel-strong: rgba(255, 255, 255, 0.96);
  --cp-sheen: rgba(255, 255, 255, 0.55);
  --cp-highlight: rgba(177, 31, 75, 0.12);
}
html[data-theme="dark"] {
  color-scheme: dark;
  --cp-bg: #3d3b3a;
  --cp-bg-elevated: #343231;
  --cp-surface: #292929;
  --cp-surface-soft: #2e2e2e;
  --cp-border: #474747;
  --cp-border-strong: #5f5f5f;
  --cp-text: #dedede;
  --cp-text-muted: #919191;
  --cp-text-soft: #b0b0b0;
  --cp-accent: #fd8ea1;
  --cp-accent-hover: #fb7b91;
  --cp-accent-soft: rgba(253, 142, 161, 0.14);
  --cp-accent-fg: #1a1a1a;
  --cp-success: #4ade80;
  --cp-danger: #f87171;
  --cp-warning: #fbbf24;
  --cp-link: #4da6ff;
  --cp-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
  --cp-overlay: rgba(41, 41, 41, 0.88);
  --cp-panel: rgba(41, 41, 41, 0.72);
  --cp-panel-strong: rgba(41, 41, 41, 0.96);
  --cp-sheen: rgba(255, 255, 255, 0.04);
  --cp-highlight: rgba(253, 142, 161, 0.12);
}`;
}

function changeTypeBadge(changeType) {
  if (changeType === 1) return { label: "Added", color: "success" };
  return { label: "Modified", color: "accent" };
}

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function stripMarkdown(s) {
  return String(s)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ")
    .trim();
}

// ── Template functions (copied from src/index.js) ──────────────────────

function buildPickerPage(pr, changedFiles) {
  const prTitle = escHtml(pr.title || "Pull Request");
  const author = escHtml(pr.createdBy?.displayName || "Unknown");
  const prId = pr.pullRequestId;
  const descExcerpt = escHtml(stripMarkdown((pr.description || "").slice(0, 300)).slice(0, 200));

  const fileCardsHtml = changedFiles
    .map((f, i) => {
      const fileName = f.path.split("/").pop();
      const parentPath = f.path.split("/").slice(0, -1).join("/") + "/";
      const badge = changeTypeBadge(f.changeType);
      const badgeClass = badge.color === "success" ? "badge-success" : "badge-accent";
      return `<a href="/file/${i}" class="file-card">
        <div class="file-icon">📄</div>
        <div class="file-info">
          <div class="file-name">${escHtml(fileName)}</div>
          <div class="file-path">${escHtml(parentPath)}</div>
        </div>
        <span class="badge ${badgeClass}">${badge.label}</span>
      </a>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>tippani Review — PR #${prId}</title>
<style>
${cssVariables()}
* { margin: 0; padding: 0; box-sizing: border-box; }
html { height: 100%; }
body { font-family: "Segoe UI", Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif; background: var(--cp-bg); color: var(--cp-text); min-height: 100%; display: flex; flex-direction: column; align-items: center; padding: 48px 24px; }
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-thumb { background: var(--cp-border-strong); border-radius: 3px; }
*:focus-visible { outline: 2px solid var(--cp-accent); outline-offset: 2px; border-radius: 4px; }

.brand-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 32px; }
.logo { width: 32px; height: 32px; border-radius: 8px; background: var(--cp-accent); display: flex; align-items: center; justify-content: center; color: var(--cp-accent-fg); font-size: 12px; font-weight: 700; }
.brand-text { font-size: 15px; font-weight: 600; color: var(--cp-text-muted); }

.container { width: 100%; max-width: 720px; }

.pr-card { background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: var(--cp-shadow); }
.pr-card h1 { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
.pr-meta { font-size: 13px; color: var(--cp-text-muted); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pr-meta .pr-badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; background: var(--cp-accent-soft); color: var(--cp-accent); }
.pr-desc { margin-top: 12px; font-size: 13px; color: var(--cp-text-soft); line-height: 1.5; }

.section-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--cp-text-muted); margin-bottom: 12px; }

.file-list { display: flex; flex-direction: column; gap: 6px; }

.file-card { display: flex; align-items: center; gap: 14px; padding: 14px 18px; background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 12px; text-decoration: none; color: var(--cp-text); transition: all 0.15s; cursor: pointer; }
.file-card:hover { background: var(--cp-accent-soft); border-color: var(--cp-accent); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.file-icon { font-size: 22px; flex-shrink: 0; }
.file-info { flex: 1; min-width: 0; }
.file-name { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-path { font-size: 12px; color: var(--cp-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; flex-shrink: 0; }
.badge-accent { background: var(--cp-accent-soft); color: var(--cp-accent); }
.badge-success { background: rgba(22,163,74,0.1); color: var(--cp-success); }

<\/style>
<script>
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme = 'dark';
<\/script>
</head>
<body>
  <div class="brand-bar">
    <div class="logo">TP</div>
    <span class="brand-text">tippani Review Portal</span>
  </div>
  <div class="container">
    <div class="pr-card">
      <h1>${prTitle}</h1>
      <div class="pr-meta">
        <span class="pr-badge">PR #${prId}</span>
        <span>by ${author}</span>
        <span>· ${changedFiles.length} file${changedFiles.length !== 1 ? "s" : ""} changed</span>
      </div>
      ${descExcerpt ? `<div class="pr-desc">${descExcerpt}</div>` : ""}
    </div>
    <div class="section-label">Changed Files</div>
    <div class="file-list">
      ${fileCardsHtml}
    </div>
  </div>
</body>
</html>`;
}

function buildSpecPage(specHtml, toc, metadata, pr, threads, specPath, sourceMap, changedFiles, currentFileIndex) {
  const tocHtml = toc
    .map(
      (t) =>
        `<a href="#${t.id}" class="toc-item" style="padding-left:${(t.level - 1) * 12 + 12}px" data-id="${t.id}">${escHtml(t.text)}</a>`
    )
    .join("\n");

  const prTitle = escHtml(metadata.title || pr.title || "Spec Review");
  const author = escHtml(pr.createdBy?.displayName || "Unknown");
  const prId = pr.pullRequestId;

  const allThreads = (threads || []).filter((t) => t.comments?.length > 0);
  const activeThreads = allThreads.filter((t) => t.status !== 2 && t.status !== 4);
  const resolvedThreads = allThreads.filter((t) => t.status === 2 || t.status === 4);

  function buildThreadHtml(t, isResolved) {
    const anchor = t.threadContext?.filePath
      ? t.threadContext.filePath.split("/").pop() + (t.threadContext.rightFileStart ? `:${t.threadContext.rightFileStart.line}` : "")
      : "";
    const commentsHtml = t.comments
      .map(
        (c, i) =>
          `<div class="comment ${i > 0 ? "comment-reply" : ""}">
            <div class="comment-meta">
              <span class="comment-author">${escHtml(c.author?.displayName || "Unknown")}</span>
              <span class="comment-date">${new Date(c.publishedDate).toLocaleDateString()}</span>
            </div>
            <div class="comment-body">${c.renderedContent || escHtml(c.content || "")}</div>
          </div>`
      )
      .join("");
    const statusClass = isResolved ? "thread-resolved" : "thread-active";
    const actions = isResolved
      ? ``
      : `<div class="thread-actions">
          <button class="btn-thread-reply" onclick="replyToThread(${t.id})">Reply</button>
          <button class="btn-thread-resolve" onclick="resolveThread(${t.id})">✓ Resolve</button>
        </div>`;
    return `<div class="comment-thread ${statusClass}" data-thread-id="${t.id}" data-thread-line="${t.threadContext?.rightFileStart?.line || ""}">
      ${anchor ? `<div class="comment-anchor">${isResolved ? "✓ " : ""}${escHtml(anchor)}</div>` : ""}
      ${isResolved ? `<details><summary class="resolved-summary">${escHtml(t.comments[0]?.author?.displayName || "Comment")} — resolved</summary>` : ""}
      ${commentsHtml}
      ${actions}
      ${isResolved ? `</details>` : ""}
    </div>`;
  }

  const activeHtml = activeThreads.length === 0
    ? `<p class="empty-comments">No active comments. Click on a paragraph to start a review.</p>`
    : activeThreads.map(t => buildThreadHtml(t, false)).join("");
  const resolvedHtml = resolvedThreads.map(t => buildThreadHtml(t, true)).join("");
  const threadsHtml = activeHtml + (resolvedThreads.length > 0
    ? `<div class="sidebar-section-label" style="margin-top:16px;">Resolved (${resolvedThreads.length})</div>${resolvedHtml}`
    : "");

  const filesNavHtml = changedFiles
    .map((f, i) => {
      const name = f.path.split("/").pop();
      const active = i === currentFileIndex ? "file-nav-active" : "";
      return `<a href="/file/${i}" class="file-nav-item ${active}" title="${escHtml(f.path)}">${escHtml(name)}</a>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${prTitle} — tippani Review</title>
<style>
${cssVariables()}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; }
body { font-family: "Segoe UI", Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif; background: var(--cp-bg); color: var(--cp-text); font-size: 15px; line-height: 1.7; }
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-thumb { background: var(--cp-border-strong); border-radius: 3px; }
a { color: var(--cp-link); text-decoration: none; }
a:hover { text-decoration: underline; }
*:focus-visible { outline: 2px solid var(--cp-accent); outline-offset: 2px; border-radius: 4px; }
button:focus-visible { outline: 2px solid var(--cp-accent); outline-offset: 2px; }

/* Header */
.header { height: 52px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; background: var(--cp-surface); border-bottom: 1px solid var(--cp-border); flex-shrink: 0; z-index: 50; }
.header-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
.logo { width: 26px; height: 26px; border-radius: 6px; background: var(--cp-accent); display: flex; align-items: center; justify-content: center; color: var(--cp-accent-fg); font-size: 10px; font-weight: 700; flex-shrink: 0; }
.brand { font-size: 13px; font-weight: 600; color: var(--cp-text-muted); flex-shrink: 0; }
.hdr-sep { color: var(--cp-border); margin: 0 2px; }
.pr-info { min-width: 0; }
.pr-info h1 { font-size: 14px; font-weight: 600; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pr-meta { font-size: 11px; color: var(--cp-text-muted); margin-top: 1px; display: flex; align-items: center; gap: 4px; }
.comment-count-active { color: var(--cp-accent); font-weight: 600; }
.comment-count-resolved { color: var(--cp-success); font-weight: 500; }
.comment-count-badge { font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: 99px; background: var(--cp-accent-soft); color: var(--cp-accent); margin-left: 4px; }

/* Inline comment bubble on spec content */
.inline-bubble { position: absolute; right: -8px; top: 2px; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; cursor: pointer; z-index: 5; transition: transform 0.12s; border: none; font-family: inherit; }
.inline-bubble:hover { transform: scale(1.2); }
.inline-bubble-active { background: var(--cp-accent); color: var(--cp-accent-fg); }
.inline-bubble-resolved { background: var(--cp-success); color: #fff; }

/* Comment modal context */
.comment-context { font-size: 12px; color: var(--cp-text-muted); margin-bottom: 8px; }

/* 3-column layout */
.layout { display: flex; flex: 1; min-height: 0; }

/* Resize handles */
.resize-handle { width: 5px; flex-shrink: 0; cursor: col-resize; background: transparent; position: relative; z-index: 10; transition: background 0.15s; }
.resize-handle:hover, .resize-handle.dragging { background: var(--cp-accent-soft); }
.resize-handle::after { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 3px; height: 32px; border-radius: 2px; background: var(--cp-border-strong); opacity: 0; transition: opacity 0.15s; }
.resize-handle:hover::after, .resize-handle.dragging::after { opacity: 1; }
body.col-resizing { cursor: col-resize !important; user-select: none !important; }
body.col-resizing * { cursor: col-resize !important; user-select: none !important; }

/* Left sidebar */
.sidebar-left { width: 260px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid var(--cp-border); background: var(--cp-bg-elevated); overflow: hidden; }
.sidebar-left-scroll { flex: 1; overflow-y: auto; padding: 16px; }
.sidebar-section-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--cp-text-muted); margin-bottom: 8px; margin-top: 16px; }
.sidebar-section-label:first-child { margin-top: 0; }

.toc-item { display: block; font-size: 13px; padding: 4px 8px; border-left: 2px solid transparent; color: var(--cp-text-muted); text-decoration: none; transition: all 0.12s; border-radius: 0 4px 4px 0; }
.toc-item:hover { color: var(--cp-text); background: var(--cp-accent-soft); text-decoration: none; }
.toc-item.active { color: var(--cp-accent); border-left-color: var(--cp-accent); font-weight: 600; }

.file-nav-item { display: block; font-size: 12px; padding: 5px 8px; color: var(--cp-text-muted); text-decoration: none; border-radius: 6px; transition: all 0.12s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-nav-item:hover { background: var(--cp-accent-soft); color: var(--cp-text); text-decoration: none; }
.file-nav-active { background: var(--cp-highlight); color: var(--cp-accent); font-weight: 600; }

/* Main content */
.main-content { flex: 1; min-width: 0; overflow-y: auto; padding: 32px 40px; background: var(--cp-bg); }
.spec { background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 16px; padding: 40px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); max-width: 820px; margin: 0 auto; }
.spec h1 { font-size: 28px; font-weight: 700; margin: 1.5rem 0 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--cp-border); color: var(--cp-text); }
.spec h1 a, .spec h2 a, .spec h3 a, .spec h4 a { color: inherit; text-decoration: none; }
.spec h1 a:hover, .spec h2 a:hover, .spec h3 a:hover { text-decoration: none; opacity: 0.8; }
.spec h2 { font-size: 20px; font-weight: 700; margin: 1.8rem 0 0.6rem; padding-bottom: 6px; border-bottom: 1px solid var(--cp-border); color: var(--cp-text); }
.spec h3 { font-size: 16px; font-weight: 600; margin: 1.4rem 0 0.4rem; color: var(--cp-text); }
.spec p { margin-bottom: 0.75rem; line-height: 1.7; position: relative; border-radius: 6px; padding: 2px 6px; margin-left: -6px; transition: background 0.12s; }

/* Commentable element hover */
.spec .commentable { cursor: pointer; position: relative; }
.spec .commentable:hover { background: var(--cp-accent-soft); border-radius: 6px; }
.spec .commentable .comment-btn { position: absolute; left: -36px; top: 6px; width: 24px; height: 24px; border-radius: 6px; background: var(--cp-accent); color: var(--cp-accent-fg); border: none; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.12s; line-height: 1; z-index: 5; }
.spec .commentable:hover .comment-btn { opacity: 1; }
.spec .commentable .comment-btn:hover { background: var(--cp-accent-hover); }

.spec table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.875rem; }
.spec th { background: var(--cp-surface-soft); padding: 8px 12px; text-align: left; font-weight: 600; border: 1px solid var(--cp-border); }
.spec td { padding: 8px 12px; border: 1px solid var(--cp-border); }
.spec tr:nth-child(even) td { background: var(--cp-surface-soft); }
.spec code { background: var(--cp-surface-soft); padding: 1px 5px; border-radius: 4px; font-family: Consolas, "Courier New", monospace; font-size: 13px; border: 1px solid var(--cp-border); }
.spec pre { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 10px; overflow-x: auto; margin: 1rem 0; }
.spec pre code { background: none; padding: 0; color: inherit; border: none; font-size: 13px; }
.spec ul, .spec ol { padding-left: 1.5rem; margin-bottom: 0.75rem; }
.spec li { margin-bottom: 0.2rem; line-height: 1.6; }
.spec strong { font-weight: 600; }
.spec blockquote { border-left: 3px solid var(--cp-accent); padding-left: 1rem; margin: 1rem 0; color: var(--cp-text-soft); }
.spec img { max-width: 100%; border-radius: 8px; }

/* Right sidebar — comments */
.sidebar-right { width: 320px; flex-shrink: 0; border-left: 1px solid var(--cp-border); background: var(--cp-bg-elevated); overflow-y: auto; padding: 16px; }
.empty-comments { font-size: 13px; color: var(--cp-text-muted); font-style: italic; padding: 12px 0; }
.comment-thread { background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 16px; padding: 16px; margin-bottom: 10px; font-size: 13px; transition: box-shadow 0.15s; overflow: hidden; min-width: 0; }
.comment-thread:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
.thread-active { border-left: 3px solid var(--cp-accent); }
.thread-resolved { border-left: 3px solid var(--cp-success); opacity: 0.7; }
.thread-resolved:hover { opacity: 1; }
.thread-resolved .comment-anchor { color: var(--cp-success); }
.resolved-summary { font-size: 12px; color: var(--cp-success); font-weight: 500; cursor: pointer; list-style: none; }
.resolved-summary::-webkit-details-marker { display: none; }
.resolved-summary::before { content: '▸ '; }
details[open] .resolved-summary::before { content: '▾ '; }
.comment-anchor { font-size: 11px; color: var(--cp-accent); margin-bottom: 8px; font-weight: 500; }
.comment-reply { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--cp-border); }
.comment-meta { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; }
.comment-author { font-weight: 600; font-size: 12px; color: var(--cp-text); }
.comment-date { font-size: 11px; color: var(--cp-text-muted); }
.comment-body { line-height: 1.5; color: var(--cp-text); overflow-wrap: break-word; word-break: break-word; overflow-x: auto; max-width: 100%; }
.comment-body pre, .comment-body code { white-space: pre-wrap; word-break: break-all; font-size: 11px; font-family: Consolas, "Courier New", monospace; }
.comment-body pre { background: var(--cp-surface-soft); border: 1px solid var(--cp-border); border-radius: 6px; padding: 8px; margin: 6px 0; max-width: 100%; overflow-x: auto; }
.comment-body code { background: var(--cp-surface-soft); padding: 1px 4px; border-radius: 3px; }
.comment-body table { font-size: 11px; border-collapse: collapse; margin: 6px 0; }
.comment-body td, .comment-body th { padding: 4px 6px; border: 1px solid var(--cp-border); white-space: nowrap; }
.comment-body a { color: var(--cp-link); word-break: break-all; }
.comment-body img { max-width: 100%; }
.thread-actions { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--cp-border); display: flex; gap: 10px; }
.btn-thread-reply { background: none; border: none; font-size: 12px; cursor: pointer; padding: 0; color: var(--cp-text-muted); font-weight: 500; transition: color 0.12s; }
.btn-thread-reply:hover { color: var(--cp-accent); }
.btn-thread-resolve { background: none; border: 1px solid var(--cp-success); color: var(--cp-success); font-size: 12px; cursor: pointer; padding: 2px 10px; border-radius: 6px; font-weight: 500; transition: all 0.12s; }
.btn-thread-resolve:hover { background: var(--cp-success); color: #fff; }

/* Bottom review bar */
.review-bar { height: 64px; display: flex; align-items: center; justify-content: center; gap: 12px; background: var(--cp-panel-strong); backdrop-filter: blur(16px); border-top: 1px solid var(--cp-border); flex-shrink: 0; z-index: 50; }
.review-btn { padding: 10px 28px; font-size: 14px; font-weight: 700; border-radius: 8px; border: none; cursor: pointer; transition: all 0.15s; font-family: inherit; }
.review-btn-approve { background: var(--cp-success); color: #fff; }
.review-btn-approve:hover { opacity: 0.9; }
.review-btn-changes { background: transparent; color: var(--cp-danger); border: 1.5px solid var(--cp-danger); }
.review-btn-changes:hover { background: var(--cp-danger); color: #fff; }

/* Comment input modal */
.comment-modal { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--cp-overlay); z-index: 100; justify-content: center; align-items: center; }
.comment-modal.active { display: flex; }
.comment-modal-inner { background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 16px; padding: 20px; width: 400px; box-shadow: var(--cp-shadow); }
.comment-modal-inner h3 { font-size: 14px; font-weight: 600; margin-bottom: 10px; }
.comment-modal textarea { width: 100%; border: 1px solid var(--cp-border); border-radius: 8px; padding: 10px; font-size: 13px; resize: none; font-family: inherit; background: var(--cp-surface-soft); color: var(--cp-text); }
.comment-modal textarea:focus { outline: none; border-color: var(--cp-accent); }
.comment-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
.modal-btn { padding: 7px 18px; font-size: 13px; font-weight: 500; border-radius: 8px; border: 1px solid var(--cp-border); cursor: pointer; font-family: inherit; background: var(--cp-surface); color: var(--cp-text); }
.modal-btn-primary { background: var(--cp-accent); color: var(--cp-accent-fg); border-color: var(--cp-accent); }
.modal-btn-primary:hover { background: var(--cp-accent-hover); }

/* Toast */
.toast { position: fixed; bottom: 80px; right: 24px; background: var(--cp-surface); color: var(--cp-text); padding: 10px 18px; border-radius: 10px; font-size: 13px; display: none; z-index: 200; border: 1px solid var(--cp-border); box-shadow: var(--cp-shadow); }
.toast.show { display: block; }
<\/style>
<script>
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme = 'dark';
<\/script>
</head>
<body style="display:flex;flex-direction:column;">

<div class="header">
  <div class="header-left">
    <a href="/" style="text-decoration:none;display:flex;align-items:center;gap:10px;">
      <div class="logo">TP</div>
      <span class="brand">Review Portal</span>
    </a>
    <span class="hdr-sep">|</span>
    <div class="pr-info">
      <h1>${prTitle}</h1>
      <div class="pr-meta">PR #${prId} by ${author}
        <span class="hdr-sep">·</span>
        <span class="comment-count-active">${activeThreads.length} active</span>
        ${resolvedThreads.length > 0 ? `<span class="comment-count-resolved">· ${resolvedThreads.length} resolved</span>` : ""}
      </div>
    </div>
  </div>
</div>

<div class="layout" id="layout">
  <nav class="sidebar-left" id="sidebarLeft">
    <div class="sidebar-left-scroll">
      <div class="sidebar-section-label">Contents</div>
      ${tocHtml}
      <div class="sidebar-section-label" style="margin-top:24px;">Files in PR</div>
      ${filesNavHtml}
    </div>
  </nav>

  <div class="resize-handle" id="resizeLeft"></div>

  <main class="main-content" id="mainContent">
    <div class="spec" id="spec-content">
      ${specHtml}
    </div>
  </main>

  <div class="resize-handle" id="resizeRight"></div>

  <aside class="sidebar-right" id="sidebarRight">
    <div class="sidebar-section-label">Comments <span class="comment-count-badge">${activeThreads.length} active</span></div>
    ${threadsHtml}
  </aside>
</div>

<div class="review-bar">
  <button class="review-btn review-btn-approve" onclick="showToast('Approved! (demo mode)')">Approve</button>
  <button class="review-btn review-btn-changes" onclick="showToast('Changes requested (demo mode)')">Request Changes</button>
</div>

<div class="comment-modal" id="commentModal">
  <div class="comment-modal-inner">
    <h3>Add a comment</h3>
    <div class="comment-context" id="commentContext"></div>
    <textarea id="commentText" rows="4" placeholder="Write your comment..."></textarea>
    <div class="comment-modal-actions">
      <button class="modal-btn" onclick="closeModal()">Cancel</button>
      <button class="modal-btn modal-btn-primary" onclick="closeModal(); showToast('Comment saved (demo mode)')">Comment</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const SPEC_PATH = ${JSON.stringify(specPath)};
const SOURCE_MAP = ${JSON.stringify(sourceMap)};
const TOC_DATA = ${JSON.stringify(toc)};
const THREADS_DATA = ${JSON.stringify(allThreads.map(t => ({
  id: t.id,
  line: t.threadContext?.rightFileStart?.line || null,
  file: t.threadContext?.filePath || null,
  count: (t.comments || []).length,
  resolved: t.status === 2 || t.status === 4
})))};

// TOC scroll spy
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      document.querySelectorAll('.toc-item').forEach(a => a.classList.remove('active'));
      const link = document.querySelector('.toc-item[data-id="' + entry.target.id + '"]');
      if (link) link.classList.add('active');
    }
  });
}, { rootMargin: '-10% 0px -80% 0px' });

document.querySelectorAll('.spec h1[id], .spec h2[id], .spec h3[id], .spec h4[id]').forEach(el => observer.observe(el));

document.querySelectorAll('.toc-item').forEach(a => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.getElementById(a.dataset.id);
    if (target) {
      document.getElementById('mainContent').scrollTo({ top: target.offsetTop - 24, behavior: 'smooth' });
    }
  });
});

function findNearestHeading(el) {
  let node = el.previousElementSibling;
  while (node) {
    if (/^H[1-6]$/.test(node.tagName)) return node.textContent.trim();
    node = node.previousElementSibling;
  }
  const parent = el.parentElement;
  if (parent && parent.classList.contains('spec')) return '';
  if (parent) return findNearestHeading(parent);
  return '';
}

let commentLine = 1;
const commentableSelector = '.spec p, .spec li, .spec blockquote, .spec table, .spec pre';
const commentableEls = [];
document.querySelectorAll(commentableSelector).forEach((el, i) => {
  if (el.closest('.commentable')) return;
  el.classList.add('commentable');
  el.style.position = 'relative';
  el.dataset.blockIdx = commentableEls.length;
  commentableEls.push(el);
  const btn = document.createElement('button');
  btn.className = 'comment-btn';
  btn.textContent = '+';
  btn.setAttribute('aria-label', 'Add comment');
  btn.title = 'Add comment';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const mapping = SOURCE_MAP[i];
    commentLine = mapping ? mapping.startLine : 1;
    const heading = findNearestHeading(el);
    const ctx = document.getElementById('commentContext');
    ctx.textContent = heading
      ? '\\u00A7 ' + heading + (mapping ? ', line ' + mapping.startLine : '')
      : (mapping ? 'Line ' + mapping.startLine : '');
    document.getElementById('commentModal').classList.add('active');
    document.getElementById('commentText').focus();
  });
  el.prepend(btn);
});

// Place inline comment bubbles
THREADS_DATA.forEach(td => {
  if (!td.line) return;
  let targetEl = null;
  for (const key of Object.keys(SOURCE_MAP)) {
    const sm = SOURCE_MAP[key];
    if (td.line >= sm.startLine && td.line <= sm.endLine) {
      targetEl = commentableEls[parseInt(key)];
      break;
    }
  }
  if (!targetEl) return;
  const bubble = document.createElement('button');
  bubble.className = 'inline-bubble ' + (td.resolved ? 'inline-bubble-resolved' : 'inline-bubble-active');
  bubble.textContent = td.count;
  bubble.title = (td.resolved ? 'Resolved' : 'Active') + ' — ' + td.count + ' comment' + (td.count > 1 ? 's' : '');
  bubble.setAttribute('aria-label', (td.resolved ? 'Resolved' : 'Active') + ' thread, ' + td.count + ' comment' + (td.count > 1 ? 's' : ''));
  bubble.addEventListener('click', (e) => {
    e.stopPropagation();
    const threadEl = document.querySelector('.comment-thread[data-thread-id="' + td.id + '"]');
    if (threadEl) {
      threadEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      threadEl.style.boxShadow = '0 0 0 2px ' + (td.resolved ? 'var(--cp-success)' : 'var(--cp-accent)');
      setTimeout(() => threadEl.style.boxShadow = '', 2000);
    }
  });
  targetEl.appendChild(bubble);
});

function closeModal() {
  document.getElementById('commentModal').classList.remove('active');
  document.getElementById('commentText').value = '';
  document.getElementById('commentContext').textContent = '';
}

document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('commentModal');
  if (!modal.classList.contains('active')) return;
  if (e.key === 'Escape') { closeModal(); return; }
  if (e.key === 'Tab') {
    const focusable = modal.querySelectorAll('textarea, button');
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// Column resize
(function() {
  const MIN_W = 160;
  const sidebarLeft = document.getElementById('sidebarLeft');
  const sidebarRight = document.getElementById('sidebarRight');
  const handleLeft = document.getElementById('resizeLeft');
  const handleRight = document.getElementById('resizeRight');

  const savedL = localStorage.getItem('fsrp-left-w');
  const savedR = localStorage.getItem('fsrp-right-w');
  if (savedL) sidebarLeft.style.width = savedL + 'px';
  if (savedR) sidebarRight.style.width = savedR + 'px';

  function startDrag(handle, panel, side) {
    return function(e) {
      e.preventDefault();
      handle.classList.add('dragging');
      document.body.classList.add('col-resizing');
      const startX = e.clientX;
      const startW = panel.getBoundingClientRect().width;
      function onMove(ev) {
        const dx = side === 'left' ? ev.clientX - startX : startX - ev.clientX;
        const newW = Math.max(MIN_W, Math.min(600, startW + dx));
        panel.style.width = newW + 'px';
      }
      function onUp() {
        handle.classList.remove('dragging');
        document.body.classList.remove('col-resizing');
        localStorage.setItem(side === 'left' ? 'fsrp-left-w' : 'fsrp-right-w', Math.round(panel.getBoundingClientRect().width));
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
  }

  handleLeft.addEventListener('mousedown', startDrag(handleLeft, sidebarLeft, 'left'));
  handleRight.addEventListener('mousedown', startDrag(handleRight, sidebarRight, 'right'));
})();
<\/script>
</body>
</html>`;
}

// ── Mock Data ──────────────────────────────────────────────────────────

const mockPr = {
  pullRequestId: 4827,
  title: "Webhook Event Delivery System",
  description: "Adds reliable webhook delivery with retry policies, payload signing, and delivery logs. Supports filtering by event type and custom headers.",
  status: 1,
  sourceRefName: "refs/heads/feature/webhook-delivery",
  createdBy: { displayName: "Priya Sharma" },
};

const mockFiles = [
  { path: "/specs/WebhookDelivery/feature-brief.md", changeType: 2 },
  { path: "/specs/WebhookDelivery/CONTEXT.md", changeType: 1 },
  { path: "/specs/WebhookDelivery/discussion.md", changeType: 1 },
];

const mockContents = {};

mockContents[mockFiles[0].path] = `---
title: "Webhook Event Delivery System"
author: "Priya Sharma"
status: "In Review"
area: "Platform Infrastructure"
last_updated: "2026-06-01"
---

# Webhook Event Delivery System

## 1. Overview

This spec defines the design for a **Webhook Event Delivery System**, enabling platform users to register HTTP endpoints and receive real-time notifications when events occur in their projects.

Today, consumers must poll the REST API for changes, creating unnecessary load and introducing latency for time-sensitive integrations.

## 2. Problem Statement

Platform users who build integrations today must rely on polling, third-party middleware, or manual scripts to react to events. This introduces unnecessary complexity, particularly for small teams who may not have infrastructure experience.

Key pain points from customer interviews (N=34):

- **72%** of respondents reported "real-time notifications" as their top missing feature
- **58%** maintain custom polling scripts solely to detect state changes
- Average time-to-setup for a basic event listener via polling: **25 minutes**

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01 | Register webhook URL with event type filter | P0 |
| FR-02 | HMAC-SHA256 payload signing for verification | P0 |
| FR-03 | Up to 50 webhook subscriptions per project | P0 |
| FR-04 | Configurable retry policy: count (0-5), backoff (5-60 sec) | P1 |
| FR-05 | Email notification on consecutive delivery failures | P1 |
| FR-06 | Delivery history with request/response logs | P0 |

### 3.2 Non-Functional Requirements

- **Delivery latency:** ≤ 500ms p99 from event to first attempt
- **Availability:** 99.9% for the delivery subsystem
- **Scale:** Support 10,000 concurrent webhook subscriptions per tenant

## 4. API Contract

### 4.1 Create Subscription

\`\`\`json
POST /v1/projects/{projectId}/webhooks
{
  "url": "https://example.com/hooks/events",
  "events": ["item.created", "item.updated", "build.completed"],
  "secret": "whsec_a1b2c3d4e5",
  "retryPolicy": {
    "maxRetries": 3,
    "backoffSeconds": 15
  },
  "headers": {
    "X-Custom-Auth": "Bearer token123"
  }
}
\`\`\`

### 4.2 Delivery Flow

The dispatcher evaluates pending events every second. When an event fires:

1. Serialize event payload with timestamp and signature
2. Dispatch HTTP POST to registered endpoint within SLA (≤ 500ms p99)
3. Verify response status code (2xx = success)
4. On completion, log delivery attempt with latency
5. On failure, apply retry policy with exponential backoff

## 5. Timeline

| Milestone | Target |
|-----------|--------|
| Design review | June 2026 |
| Alpha release | August 2026 |
| Beta release | October 2026 |
| GA | January 2027 |

## 6. Open Questions

- Should we support "delivery windows" (e.g., only deliver between 2am-6am)?
- How do we handle endpoint throttling when the target returns 429?
- Should subscriptions pause automatically after consecutive delivery failures?
`;

mockContents[mockFiles[1].path] = `# Context — Webhook Delivery

## Locked Decisions

| Decision | Date | Rationale |
|----------|------|-----------|
| Use event type filters over catch-all subscriptions | 2026-05-15 | Reduces noise, lowers egress bandwidth |
| HMAC-SHA256 over mTLS for signature verification | 2026-05-18 | Simpler for consumers, industry standard (Stripe, GitHub) |
| Retry with exponential backoff | 2026-05-20 | Industry standard, prevents thundering herd |

## Dependencies

- Event bus (for ingesting platform events)
- Notification service (email alerts on failure)
- Delivery log store (queryable history)
`;

mockContents[mockFiles[2].path] = `# Discussion — Webhook Delivery

## Open Threads

### Endpoint Throttling Interaction
How should deliveries behave when the target endpoint returns 429? Options:
1. Queue and retry when Retry-After header expires (may delay significantly)
2. Skip the delivery and log a warning
3. Allow users to set priority levels for different event types

### Failure Notification Fatigue
With retry policies, a single failure could generate multiple alerts. Should we:
- Notify on first failure only, then again on final retry exhaustion?
- Bundle notifications into a daily digest?
`;

const mockThreads = [
  {
    id: 101,
    status: 1,
    threadContext: { filePath: "/specs/WebhookDelivery/feature-brief.md", rightFileStart: { line: 28, offset: 1 }, rightFileEnd: { line: 28, offset: 1 } },
    comments: [{
      author: { displayName: "Alex Chen" },
      publishedDate: "2026-06-02T10:30:00Z",
      content: "The 25-minute setup time stat is compelling. Do we have a source for this? Would be good to cite in the blog post too."
    }]
  },
  {
    id: 102,
    status: 1,
    threadContext: { filePath: "/specs/WebhookDelivery/feature-brief.md", rightFileStart: { line: 45, offset: 1 }, rightFileEnd: { line: 45, offset: 1 } },
    comments: [
      {
        author: { displayName: "Jordan Lee" },
        publishedDate: "2026-06-02T11:15:00Z",
        content: "500ms p99 for delivery latency feels tight. What's our current p99 for event serialization? If it's already > 200ms, we're leaving very little headroom."
      },
      {
        author: { displayName: "Priya Sharma" },
        publishedDate: "2026-06-02T14:20:00Z",
        content: "Good question. Current p99 for serialization is ~180ms. The 500ms budget gives us ~320ms for signing + HTTP dispatch. I'll add a latency budget breakdown to the spec."
      }
    ]
  },
  {
    id: 103,
    status: 1,
    threadContext: { filePath: "/specs/WebhookDelivery/feature-brief.md", rightFileStart: { line: 70, offset: 1 }, rightFileEnd: { line: 70, offset: 1 } },
    comments: [{
      author: { displayName: "Ravi Patel" },
      publishedDate: "2026-06-03T09:00:00Z",
      content: "The open question about delivery windows is important. Enterprise customers will definitely ask for this. Can we at least have a `notBefore` / `notAfter` field in the subscription API as a P1?"
    }]
  },
  {
    id: 104,
    status: 2,
    threadContext: { filePath: "/specs/WebhookDelivery/feature-brief.md", rightFileStart: { line: 12, offset: 1 }, rightFileEnd: { line: 12, offset: 1 } },
    comments: [
      {
        author: { displayName: "Alex Chen" },
        publishedDate: "2026-06-01T16:00:00Z",
        content: "Typo: 'notifcations' should be 'notifications'"
      },
      {
        author: { displayName: "Priya Sharma" },
        publishedDate: "2026-06-01T16:30:00Z",
        content: "Fixed, thanks!"
      }
    ]
  }
];

// ── Server ─────────────────────────────────────────────────────────────

async function main() {
  // Pre-render comment content through safe markdown renderer
  for (const t of mockThreads) {
    for (const c of t.comments) {
      c.renderedContent = await renderMarkdownSafe(c.content);
    }
  }

  const app = express();
  app.use(express.json());

  // File picker
  app.get("/", (_req, res) => {
    res.type("html").send(buildPickerPage(mockPr, mockFiles));
  });

  // Spec view
  app.get("/file/:index", async (req, res) => {
    try {
      const idx = parseInt(req.params.index);
      if (isNaN(idx) || idx < 0 || idx >= mockFiles.length) {
        return res.redirect("/");
      }
      const filePath = mockFiles[idx].path;
      const raw = mockContents[filePath];
      if (!raw) return res.status(404).send("File not found in demo data");

      const { metadata, body } = stripFrontmatter(raw);
      const { toc, sourceMap } = buildSourceMap(body);
      const specHtml = await renderMarkdown(body);

      // Filter threads to this file
      const fileThreads = mockThreads.filter(
        (t) => t.threadContext?.filePath === filePath
      );

      res.type("html").send(
        buildSpecPage(specHtml, toc, metadata, mockPr, fileThreads, filePath, sourceMap, mockFiles, idx)
      );
    } catch (e) {
      res.status(500).send("Error rendering spec: " + e.message);
    }
  });

  // Dummy API routes for demo mode
  app.post("/api/comment", (_req, res) => res.json({ ok: true, synced: true }));
  app.post("/api/reply", (_req, res) => res.json({ ok: true, synced: true }));
  app.post("/api/resolve", (_req, res) => res.json({ ok: true, synced: true }));
  app.post("/api/review", (_req, res) => res.json({ ok: true }));
  app.get("/api/pending", (_req, res) => res.json({ count: 0, isOffline: false }));

  const server = app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\n  Demo server running at ${url} — use for screenshots\n`);
    open(url);
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\n  Error: Port ${PORT} is already in use.\n`);
    } else {
      console.error(`\n  Error starting server: ${err.message}\n`);
    }
    process.exit(1);
  });
}

main().catch((e) => {
  console.error(`\n  Error: ${e.message}\n`);
  process.exit(1);
});
