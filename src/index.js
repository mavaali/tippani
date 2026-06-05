#!/usr/bin/env node

import express from "express";
import open from "open";
import * as azdev from "azure-devops-node-api";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import { EDITOR_JS } from "./client/editor.bundle.js";
import { isConflict } from "./conflict.js";
import { decideCanEdit } from "./canedit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Config ---
const CONFIG_DIR = path.join(os.homedir(), ".tippani");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const PORT = 3847;

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch { return {}; }
}

function saveConfig(cfg) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

function getConfig() {
  const cfg = loadConfig();
  const args = process.argv.slice(2);
  // CLI flags override config
  const findArg = (name) => {
    const a = args.find(a => a.startsWith(`--${name}=`));
    return a ? a.split("=").slice(1).join("=") : null;
  };
  return {
    org: findArg("org") || process.env.TIPPANI_ORG || cfg.org || null,
    project: findArg("project") || process.env.TIPPANI_PROJECT || cfg.project || null,
    repo: findArg("repo") || process.env.TIPPANI_REPO || cfg.repo || cfg.project || null,
  };
}

// Resolved at startup
let ADO_ORG, ADO_PROJECT, ADO_REPO;

// --- PAT management ---
const PAT_FILE = path.join(CONFIG_DIR, "pat");

function loadPat() {
  try {
    return fs.readFileSync(PAT_FILE, "utf-8").trim();
  } catch {
    return null;
  }
}

function savePat(pat) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(PAT_FILE, pat, { mode: 0o600 });
}

// --- Local cache + pending queue ---
const CACHE_DIR = path.join(CONFIG_DIR, "cache");

function getCachePath(prId) {
  return path.join(CACHE_DIR, `pr-${prId}.json`);
}

function loadCache(prId) {
  try {
    const data = JSON.parse(fs.readFileSync(getCachePath(prId), "utf-8"));
    return data;
  } catch { return null; }
}

function saveCache(prId, data) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
    data.cachedAt = new Date().toISOString();
    fs.writeFileSync(getCachePath(prId), JSON.stringify(data, null, 2), { mode: 0o600 });
  } catch (e) {
    console.warn(`  ⚠ Could not write cache: ${e.code || e.message}. Continuing without cache.`);
  }
}

function isCacheFresh(cache, maxAgeMs = 3600000) {
  if (!cache?.cachedAt) return false;
  return (Date.now() - new Date(cache.cachedAt).getTime()) < maxAgeMs;
}

function getPendingPath(prId) {
  return path.join(CACHE_DIR, `pr-${prId}-pending.json`);
}

function loadPending(prId) {
  try {
    return JSON.parse(fs.readFileSync(getPendingPath(prId), "utf-8"));
  } catch { return []; }
}

function savePending(prId, actions) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(getPendingPath(prId), JSON.stringify(actions, null, 2), { mode: 0o600 });
  } catch (e) {
    console.warn(`  ⚠ Could not save pending queue: ${e.code || e.message}`);
  }
}

function addPending(prId, action) {
  const pending = loadPending(prId);
  action.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  action.createdAt = new Date().toISOString();
  action.synced = false;
  pending.push(action);
  savePending(prId, pending);
  return action;
}

function removePending(prId, actionId) {
  const pending = loadPending(prId).filter((p) => p.id !== actionId);
  savePending(prId, pending);
}

// --- ADO error helper ---
function friendlyAdoError(e, context) {
  const msg = e.message || String(e);
  const status = e.statusCode || e.status || (msg.match(/(\d{3})/) || [])[1];
  if (msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED"))
    return `Could not connect to ADO org. Check the --org URL and your network.`;
  if (status == 401)
    return `Authentication failed (401). Your PAT may be expired. Delete ~/.tippani/pat and re-run.`;
  if (status == 403)
    return `Access denied (403). Your PAT may lack the Code (Read & Write) scope.\n  Generate a new one at: ${ADO_ORG}/_usersSettings/tokens`;
  if (status == 404 || msg.includes("TF200016"))
    return `Not found (404). Check --project and --repo names.\n  Project: "${ADO_PROJECT}" | Repo: "${ADO_REPO}"`;
  if (msg.includes("VS404689"))
    return `Repo "${ADO_REPO}" not found in project "${ADO_PROJECT}". Check --repo.`;
  if (status == 429)
    return `ADO rate limited (429). Wait a minute and try again.`;
  if (status >= 500)
    return `ADO server error (${status}). Try again in a few minutes.`;
  return `${context}: ${msg}`;
}

async function getTokenFromAzCli() {
  const { execSync } = await import("child_process");
  try {
    const token = execSync(
      'az account get-access-token --resource "499b84ac-1321-427f-aa17-267ca6975798" --query accessToken -o tsv',
      { encoding: "utf-8", timeout: 15000 }
    ).trim();
    return token;
  } catch {
    return null;
  }
}

function getAdoConnectionBearer(token) {
  const authHandler = azdev.getBearerHandler(token);
  return new azdev.WebApi(ADO_ORG, authHandler);
}

// --- ADO client ---
function getAdoConnection(pat) {
  const authHandler = azdev.getPersonalAccessTokenHandler(pat);
  return new azdev.WebApi(ADO_ORG, authHandler);
}

async function getPullRequest(conn, prId) {
  const gitApi = await conn.getGitApi();
  return gitApi.getPullRequestById(prId);
}

async function getFileContent(conn, filePath, branch) {
  const gitApi = await conn.getGitApi();
  const versionDesc = branch.replace("refs/heads/", "");
  const item = await gitApi.getItemContent(
    ADO_REPO,
    filePath,
    ADO_PROJECT,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { version: versionDesc, versionType: 0 }
  );
  const chunks = [];
  for await (const chunk of item) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function getPRChangedFiles(conn, prId) {
  const gitApi = await conn.getGitApi();
  const iterations = await gitApi.getPullRequestIterations(ADO_REPO, prId, ADO_PROJECT);
  if (!iterations || iterations.length === 0) return [];
  const lastIteration = iterations[iterations.length - 1];
  const changes = await gitApi.getPullRequestIterationChanges(
    ADO_REPO, prId, lastIteration.id, ADO_PROJECT
  );
  return (changes.changeEntries || [])
    .filter((c) => c.item?.path?.endsWith(".md") && c.changeType !== 16) // 16 = delete
    .map((c) => ({ path: c.item.path, changeType: c.changeType }));
}

async function getSpecFiles(conn, branch) {
  const gitApi = await conn.getGitApi();
  const versionDesc = branch.replace("refs/heads/", "");
  const items = await gitApi.getItems(
    ADO_REPO,
    ADO_PROJECT,
    "/",
    1, // full recursion
    true,
    undefined,
    undefined,
    undefined,
    { version: versionDesc, versionType: 0 }
  );
  return items
    .filter((i) => i.path?.endsWith(".md") && !i.isFolder)
    .map((i) => i.path);
}

async function getCommentThreads(conn, prId) {
  const gitApi = await conn.getGitApi();
  return gitApi.getThreads(ADO_REPO, prId, ADO_PROJECT);
}

async function createCommentThread(conn, prId, filePath, line, content) {
  const gitApi = await conn.getGitApi();
  const thread = {
    comments: [{ content, commentType: 1 }],
    status: 1, // active
    threadContext: {
      filePath,
      rightFileStart: { line, offset: 1 },
      rightFileEnd: { line, offset: 1 },
    },
  };
  return gitApi.createThread(thread, ADO_REPO, prId, ADO_PROJECT);
}

async function replyToThread(conn, prId, threadId, content) {
  const gitApi = await conn.getGitApi();
  const comment = { content, commentType: 1 };
  return gitApi.createComment(comment, ADO_REPO, prId, threadId, ADO_PROJECT);
}

async function resolveThread(conn, prId, threadId) {
  const gitApi = await conn.getGitApi();
  return gitApi.updateThread({ status: 2 }, ADO_REPO, prId, threadId, ADO_PROJECT);
}

// Current tip commit (objectId) of a branch ref like "refs/heads/feature/x".
async function getBranchTip(conn, branchRef) {
  const gitApi = await conn.getGitApi();
  const shortBranch = branchRef.replace("refs/heads/", "");
  const refs = await gitApi.getRefs(ADO_REPO, ADO_PROJECT, `heads/${shortBranch}`);
  const ref = (refs || []).find((r) => r.name === branchRef);
  if (!ref) throw new Error(`Branch ref not found: ${branchRef}`);
  return ref.objectId;
}

// Commit an edited file to a branch via the ADO push API. expectedOldObjectId, when
// provided, is used as the push's oldObjectId (optimistic concurrency — the conflict
// guard in #49 passes the load-time SHA); otherwise the live tip is used.
async function pushFileToBranch(conn, branchRef, filePath, content, message, expectedOldObjectId) {
  const gitApi = await conn.getGitApi();
  const oldObjectId = expectedOldObjectId || (await getBranchTip(conn, branchRef));
  const push = {
    refUpdates: [{ name: branchRef, oldObjectId }],
    commits: [
      {
        comment: message,
        changes: [
          {
            changeType: 2, // VersionControlChangeType.Edit
            item: { path: filePath },
            newContent: { content, contentType: 0 }, // ItemContentType.RawText
          },
        ],
      },
    ],
  };
  const result = await gitApi.createPush(push, ADO_REPO, ADO_PROJECT);
  return result?.commits?.[0]?.commitId || result?.refUpdates?.[0]?.newObjectId || null;
}

// ADO security namespace + permission bit for Git "Contribute" (push) access.
const GIT_SECURITY_NAMESPACE = "2e9eb7ed-3c0a-47d4-87c1-0ffdd275fd87";
const GIT_PERMISSION_GENERIC_CONTRIBUTE = 4;

// Whether the authenticated identity may push to the PR repo, gating the Edit affordance.
// Hard false offline / unauthenticated / on a non-active PR (no network call). Otherwise
// probe ADO for GenericContribute at the repository level. The repo-level token needs no
// ref-name encoding and catches the dominant "read-only access" case; rare per-branch deny
// ACLs fall through (fail open) and the save path surfaces any real rejection. Probe errors
// also fail open. See decideCanEdit (canedit.js) for the pure gate logic.
async function computeCanEdit(conn, pr, isOffline) {
  if (isOffline || !conn || pr?.status !== 1) {
    return decideCanEdit({ isOffline, hasConn: !!conn, prStatus: pr?.status, probe: null });
  }
  const projectId = pr?.repository?.project?.id;
  const repoId = pr?.repository?.id;
  let probe = null; // indeterminate => fail open
  if (projectId && repoId) {
    try {
      const securityApi = await conn.getSecurityApi();
      const results = await securityApi.hasPermissions(
        GIT_SECURITY_NAMESPACE,
        GIT_PERMISSION_GENERIC_CONTRIBUTE,
        `repoV2/${projectId}/${repoId}`
      );
      probe = Array.isArray(results) ? results[0] === true : results === true;
    } catch (e) {
      console.log("  ⚠ Could not verify push permission; Edit left enabled. (" + e.message + ")");
      probe = null;
    }
  }
  return decideCanEdit({ isOffline, hasConn: true, prStatus: pr.status, probe });
}

// --- Markdown rendering ---
// Spec content schema: allow headings with ids (for TOC) but strip scripts/iframes
const specSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    h1: [...(defaultSchema.attributes?.h1 || []), "id"],
    h2: [...(defaultSchema.attributes?.h2 || []), "id"],
    h3: [...(defaultSchema.attributes?.h3 || []), "id"],
    h4: [...(defaultSchema.attributes?.h4 || []), "id"],
    h5: [...(defaultSchema.attributes?.h5 || []), "id"],
    h6: [...(defaultSchema.attributes?.h6 || []), "id"],
    a: [...(defaultSchema.attributes?.a || []), "id"],
  },
};

async function renderMarkdown(content) {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize, specSanitizeSchema)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, { behavior: "wrap" })
    .use(rehypeStringify)
    .process(content);
  return String(result);
}

// Safe renderer for user-authored content (comments) — no raw HTML allowed
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

// --- Shared CSS variable system ---
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
  // ADO changeType: 1=add, 2=edit, 8=rename, etc.
  if (changeType === 1) return { label: "Added", color: "success" };
  return { label: "Modified", color: "accent" };
}

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function stripMarkdown(s) {
  return String(s)
    .replace(/^#{1,6}\s+/gm, "")       // headings
    .replace(/\*\*([^*]+)\*\*/g, "$1")  // bold
    .replace(/\*([^*]+)\*/g, "$1")      // italic
    .replace(/__([^_]+)__/g, "$1")      // bold alt
    .replace(/_([^_]+)_/g, "$1")        // italic alt
    .replace(/`([^`]+)`/g, "$1")        // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/^[-*]\s+/gm, "• ")        // list items
    .replace(/\n{2,}/g, " ")            // collapse newlines
    .replace(/\n/g, " ")
    .trim();
}

// --- File picker landing page ---
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
<title>FabricSpecs Review — PR #${prId}</title>
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
    <div class="logo">FS</div>
    <span class="brand-text">FabricSpecs Review Portal</span>
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

// --- Spec review page (3-column layout) ---
function buildSpecPage(specHtml, toc, metadata, pr, threads, specPath, sourceMap, changedFiles, currentFileIndex, rawMarkdown, canEdit, baseObjectId) {
  const tocHtml = toc
    .map(
      (t) =>
        `<a href="#${t.id}" class="toc-item" style="padding-left:${(t.level - 1) * 12 + 12}px" data-id="${t.id}">${escHtml(t.text)}</a>`
    )
    .join("\n");

  const prTitle = escHtml(metadata.title || pr.title || "Spec Review");
  const author = escHtml(pr.createdBy?.displayName || "Unknown");
  const prId = pr.pullRequestId;

  // Split threads: active (status 1=active, 0=unknown) vs resolved (status 2=fixed, 4=closed etc.)
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

  // File navigation list for left sidebar
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
<title>${prTitle} — FabricSpecs Review</title>
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
.header-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.edit-toggle { font-family: inherit; font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: 6px; border: 1px solid var(--cp-border); background: var(--cp-bg); color: var(--cp-text); cursor: pointer; transition: background 0.12s, border-color 0.12s; }
.edit-toggle:hover { background: var(--cp-surface-soft); border-color: var(--cp-border-strong); }
/* Edit-mode visual distinction on the center column */
.main-content.editing { box-shadow: inset 0 0 0 2px var(--cp-accent-soft); background: var(--cp-accent-soft); }
.main-content.editing #spec-editor { background: var(--cp-bg); }
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

/* Sync status bar */
.sync-bar { display: none; height: 36px; align-items: center; justify-content: center; gap: 10px; background: var(--cp-surface-soft); border-top: 1px solid var(--cp-border); font-size: 12px; color: var(--cp-text-muted); flex-shrink: 0; }
.sync-bar.has-pending { display: flex; }
.sync-bar.offline { background: var(--cp-highlight); }
.sync-status { font-weight: 500; }
.sync-status .count { color: var(--cp-accent); font-weight: 700; }
.sync-btn { padding: 4px 14px; font-size: 12px; font-weight: 600; border-radius: 6px; border: 1px solid var(--cp-accent); background: transparent; color: var(--cp-accent); cursor: pointer; font-family: inherit; transition: all 0.12s; }
.sync-btn:hover { background: var(--cp-accent); color: var(--cp-accent-fg); }
.sync-btn.syncing { opacity: 0.5; pointer-events: none; }

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

/* Diff-on-save preview (#46) */
.diff-modal-inner { background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 16px; padding: 20px; width: min(720px, 90vw); box-shadow: var(--cp-shadow); display: flex; flex-direction: column; max-height: 80vh; }
.diff-modal-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
.diff-modal-head h3 { font-size: 14px; font-weight: 600; }
.diff-stats { font-size: 12px; font-weight: 600; color: var(--cp-text-muted); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.diff-body { flex: 1; overflow: auto; border: 1px solid var(--cp-border); border-radius: 8px; background: var(--cp-bg); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; line-height: 1.5; }
.diff-line { display: flex; white-space: pre-wrap; word-break: break-word; }
.diff-gutter { flex: 0 0 22px; text-align: center; user-select: none; color: var(--cp-text-muted); }
.diff-text { flex: 1; padding-right: 8px; }
.diff-add { background: color-mix(in srgb, var(--cp-success) 14%, transparent); }
.diff-add .diff-gutter { color: var(--cp-success); }
.diff-del { background: color-mix(in srgb, #d93f0b 14%, transparent); }
.diff-del .diff-gutter { color: #d93f0b; }
.diff-empty { padding: 24px; text-align: center; color: var(--cp-text-muted); }
.diff-msg-row { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
.diff-msg-row label { font-size: 12px; font-weight: 600; color: var(--cp-text-muted); white-space: nowrap; }
.diff-msg-row input { flex: 1; font-family: inherit; font-size: 13px; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--cp-border); background: var(--cp-bg); color: var(--cp-text); }
.save-btn { background: var(--cp-accent); color: var(--cp-accent-fg); border-color: var(--cp-accent); }
.save-btn:hover:not(:disabled) { background: var(--cp-accent-hover); }
.save-btn:disabled { opacity: 0.5; cursor: default; }
.dirty-dot { color: var(--cp-accent); font-size: 12px; line-height: 1; margin-right: 2px; }
.conflict-msg { font-size: 13px; line-height: 1.55; color: var(--cp-text); margin-bottom: 6px; }

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
      <div class="logo">FS</div>
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
  <div class="header-right">
    <span class="dirty-dot" id="dirtyDot" style="display:none" title="Unsaved changes">●</span>
    ${canEdit ? `<button class="edit-toggle save-btn" id="saveBtn" onclick="tippani.save()" style="display:none" disabled>Save</button>` : ""}
    ${canEdit ? `<button class="edit-toggle" id="editToggle" onclick="tippani.toggle()" title="Toggle edit mode (${"⌘"}/Ctrl+E)">Edit</button>` : ""}
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
    <div class="spec spec-edit" id="spec-editor" style="display:none"></div>
  </main>

  <div class="resize-handle" id="resizeRight"></div>

  <aside class="sidebar-right" id="sidebarRight">
    <div class="sidebar-section-label">Comments <span class="comment-count-badge">${activeThreads.length} active</span></div>
    ${threadsHtml}
  </aside>
</div>

<div class="sync-bar" id="syncBar">
  <span class="sync-status" id="syncStatus"></span>
  <button class="sync-btn" id="syncBtn" onclick="syncPending()">Sync to ADO</button>
</div>

<div class="review-bar">
  <button class="review-btn review-btn-approve" onclick="submitReview('approve')">Approve</button>
  <button class="review-btn review-btn-changes" onclick="submitReview('reject')">Request Changes</button>
</div>

<div class="comment-modal" id="commentModal">
  <div class="comment-modal-inner">
    <h3>Add a comment</h3>
    <div class="comment-context" id="commentContext"></div>
    <textarea id="commentText" rows="4" placeholder="Write your comment..."></textarea>
    <div class="comment-modal-actions">
      <button class="modal-btn" onclick="closeModal()">Cancel</button>
      <button class="modal-btn modal-btn-primary" onclick="submitComment()">Comment</button>
    </div>
  </div>
</div>

<div class="comment-modal" id="diffModal">
  <div class="diff-modal-inner">
    <div class="diff-modal-head">
      <h3>Review changes</h3>
      <span class="diff-stats" id="diffStats"></span>
    </div>
    <div class="diff-body" id="diffBody"></div>
    <div class="diff-msg-row" id="diffMsgRow" style="display:none">
      <label for="commitMsg">Commit message</label>
      <input type="text" id="commitMsg" autocomplete="off" />
    </div>
    <div class="comment-modal-actions">
      <button class="modal-btn" id="diffCancel">Cancel</button>
      <button class="modal-btn modal-btn-primary" id="diffConfirm">Confirm &amp; Save</button>
    </div>
  </div>
</div>

<div class="comment-modal" id="conflictModal">
  <div class="comment-modal-inner">
    <h3>File changed on the server</h3>
    <p class="conflict-msg">This file was updated by someone else since you started editing, so your save was not applied. Copy your changes, then reload to get the latest version and re-apply them. Tippani never overwrites someone else's edits automatically.</p>
    <div class="comment-modal-actions">
      <button class="modal-btn" id="conflictCancel">Keep editing</button>
      <button class="modal-btn" id="conflictCopy">Copy my changes</button>
      <button class="modal-btn modal-btn-primary" id="conflictReload">Reload</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>${EDITOR_JS}</script>
<script>
// #47 edit/view toggle. Read-only rendered view is the default; editing is opt-in.
// The CM editor is mounted lazily on first entry and reused, so edits persist
// across toggle cycles within the session. Cmd/Ctrl+E toggles.
window.tippani = (function () {
  // Mutable baseline: updated after a successful save so the editor is no longer
  // dirty and the next diff is measured against the saved state.
  let RAW_MARKDOWN = ${JSON.stringify(rawMarkdown || "")};
  const SPEC_FILE_PATH = ${JSON.stringify(specPath)};
  const FILENAME = SPEC_FILE_PATH.split("/").pop();
  // Branch tip at load time — sent on save so ADO rejects a stale push (#49).
  const BASE_OBJECT_ID = ${JSON.stringify(baseObjectId || null)};
  const ORIG_TITLE = document.title;
  let editor = null;
  let editMode = false;
  let saving = false;

  const el = (id) => document.getElementById(id);
  const isDirty = () => !!editor && editor.getMarkdown() !== RAW_MARKDOWN;
  const toast = (m) => window.showToast && window.showToast(m);

  // Save button is enabled only when there are unsaved changes.
  function updateSaveState() {
    const btn = el("saveBtn");
    if (btn) btn.disabled = saving || !isDirty();
  }

  // Dirty indicator: a dot in the header + an asterisk-equivalent in the title (#49).
  function updateDirtyIndicator() {
    const dirty = isDirty();
    document.title = (dirty ? "● " : "") + ORIG_TITLE;
    const dot = el("dirtyDot");
    if (dot) dot.style.display = dirty ? "" : "none";
  }

  function onEditorChange() {
    updateSaveState();
    updateDirtyIndicator();
  }

  function ensureEditor() {
    if (!editor && window.TippaniEditor)
      editor = window.TippaniEditor.mount(el("spec-editor"), RAW_MARKDOWN, {
        onChange: onEditorChange,
      });
    return editor;
  }
  function enterEdit() {
    if (!ensureEditor()) return;
    el("spec-content").style.display = "none";
    el("spec-editor").style.display = "";
    el("mainContent").classList.add("editing");
    const btn = el("editToggle");
    if (btn) btn.textContent = "View";
    const save = el("saveBtn");
    if (save) save.style.display = "";
    updateSaveState();
    updateDirtyIndicator();
    editMode = true;
    editor.view.focus();
  }
  function exitEdit() {
    // Unsaved-changes prompt on mode switch. Edits are kept for the session (not
    // discarded) so they survive toggle cycles; saving is via the Save button.
    // Cancel keeps you in edit mode.
    if (isDirty() && !confirm("You have unsaved changes. Switch to read view? Your edits are kept for this session.")) return;
    el("spec-editor").style.display = "none";
    el("spec-content").style.display = "";
    el("mainContent").classList.remove("editing");
    const btn = el("editToggle");
    if (btn) btn.textContent = "Edit";
    const save = el("saveBtn");
    if (save) save.style.display = "none";
    editMode = false;
  }
  function toggle() {
    editMode ? exitEdit() : enterEdit();
  }

  // Diff-on-save preview (#46). Resolves true (confirm) / false (cancel). Called
  // by the write path (#48) before committing.
  function showDiff(oldMd, newMd) {
    return new Promise((resolve) => {
      const modal = el("diffModal");
      const body = el("diffBody");
      const stats = el("diffStats");
      const diff = window.TippaniEditor.diffLines(oldMd, newMd);
      const s = window.TippaniEditor.diffStats(diff);
      const noChange = s.added + s.removed === 0;
      stats.textContent = noChange ? "No changes" : "+" + s.added + "  −" + s.removed;
      body.textContent = "";
      if (noChange) {
        const p = document.createElement("div");
        p.className = "diff-empty";
        p.textContent = "No changes to save.";
        body.appendChild(p);
      } else {
        for (const d of diff) {
          const line = document.createElement("div");
          line.className = "diff-line diff-" + d.type;
          const gutter = document.createElement("span");
          gutter.className = "diff-gutter";
          gutter.textContent = d.type === "add" ? "+" : d.type === "del" ? "−" : " ";
          const text = document.createElement("span");
          text.className = "diff-text";
          text.textContent = d.text === "" ? " " : d.text; // build via textContent — XSS-safe
          line.appendChild(gutter);
          line.appendChild(text);
          body.appendChild(line);
        }
      }
      modal.style.display = "flex";
      const done = (result) => {
        modal.style.display = "none";
        el("diffConfirm").onclick = null;
        el("diffCancel").onclick = null;
        resolve(result);
      };
      el("diffConfirm").onclick = () => done(true);
      el("diffCancel").onclick = () => done(false);
    });
  }

  // Save (#48): diff preview (with editable commit message) → commit to PR branch.
  async function save() {
    if (saving || !isDirty()) return;
    const newMd = editor.getMarkdown();
    const msgRow = el("diffMsgRow");
    const msgInput = el("commitMsg");
    const defaultMsg = "tippani: update " + FILENAME;
    if (msgInput) msgInput.value = defaultMsg;
    if (msgRow) msgRow.style.display = "flex";
    const ok = await showDiff(RAW_MARKDOWN, newMd);
    if (msgRow) msgRow.style.display = "none";
    if (!ok) return;
    const message = (msgInput && msgInput.value.trim()) || defaultMsg;

    saving = true;
    const btn = el("saveBtn");
    if (btn) btn.textContent = "Saving…";
    updateSaveState();
    try {
      const r = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: SPEC_FILE_PATH, content: newMd, message, baseObjectId: BASE_OBJECT_ID }),
      });
      const data = await r.json();
      if (data.ok && data.synced) {
        RAW_MARKDOWN = newMd; // new saved baseline → no longer dirty
        toast("Saved — commit " + (data.commitId ? String(data.commitId).slice(0, 8) : "ok"));
      } else if (data.conflict) {
        // Branch moved underneath us — never overwrite blindly (#49).
        showConflict();
      } else if (data.queued) {
        RAW_MARKDOWN = newMd; // safely persisted to the queue; will retry on sync
        toast(data.error ? "Push failed (" + data.error + ") — queued, will retry on sync" : (data.message || "Saved locally — will sync"));
      } else {
        toast("Save failed: " + (data.error || "unknown") + " — your edits are kept");
      }
    } catch (e) {
      toast("Save failed: " + e.message + " — your edits are kept");
    } finally {
      saving = false;
      if (btn) btn.textContent = "Save";
      updateSaveState();
      updateDirtyIndicator();
    }
  }

  // Conflict dialog (#49): the branch moved; offer reload or copy-to-clipboard.
  // Never auto-merge — specs are prose.
  function showConflict() {
    const m = el("conflictModal");
    if (!m) {
      toast("This file was changed on the server — reload before saving.");
      return;
    }
    m.style.display = "flex";
    el("conflictCancel").onclick = () => { m.style.display = "none"; };
    el("conflictCopy").onclick = async () => {
      try {
        await navigator.clipboard.writeText(editor.getMarkdown());
        toast("Your changes copied to the clipboard");
      } catch {
        toast("Copy failed — select the text and copy manually");
      }
    };
    el("conflictReload").onclick = () => location.reload();
  }

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === "e" || e.key === "E")) {
      // Only when an Edit affordance exists (write access).
      if (!el("editToggle")) return;
      e.preventDefault();
      toggle();
    }
  });
  // Warn before closing/reloading the tab with unsaved edits (#49).
  window.addEventListener("beforeunload", (e) => {
    if (isDirty()) {
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
  });

  // Warn before navigating to another file (home or file picker) with unsaved
  // edits (#49). Capture phase so it runs before the link navigates.
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target.closest && e.target.closest("a[href]");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      const leavesFile = href === "/" || href.startsWith("/file/");
      if (leavesFile && isDirty() &&
          !confirm("You have unsaved changes. Leave this file and discard them?")) {
        e.preventDefault();
      }
    },
    true
  );

  // ?edit=1 still auto-enters edit mode (convenient for testing).
  if (new URLSearchParams(location.search).get("edit") === "1") {
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", enterEdit);
    else enterEdit();
  }
  return {
    toggle,
    enterEdit,
    exitEdit,
    isDirty,
    save,
    showDiff,
    showConflict,
    updateDirtyIndicator,
    // Original (last-loaded) markdown — the baseline a save diffs against.
    getOriginal: () => RAW_MARKDOWN,
    // For the write path (#48): current editor buffer (or the original if the
    // editor was never opened).
    getMarkdown: () => (editor ? editor.getMarkdown() : RAW_MARKDOWN),
    getEditor: () => editor,
  };
})();
</script>
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

// Find nearest preceding heading for a DOM element
function findNearestHeading(el) {
  let node = el.previousElementSibling;
  while (node) {
    if (/^H[1-6]$/.test(node.tagName)) return node.textContent.trim();
    node = node.previousElementSibling;
  }
  // Walk up to parent and try again
  const parent = el.parentElement;
  if (parent && parent.classList.contains('spec')) return '';
  if (parent) return findNearestHeading(parent);
  return '';
}

// Make content blocks commentable with floating + button
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
    // Set context in modal
    const heading = findNearestHeading(el);
    const ctx = document.getElementById('commentContext');
    ctx.textContent = heading
      ? '\u00A7 ' + heading + (mapping ? ', line ' + mapping.startLine : '')
      : (mapping ? 'Line ' + mapping.startLine : '');
    document.getElementById('commentModal').classList.add('active');
    document.getElementById('commentText').focus();
  });
  el.prepend(btn);
});

// Place inline comment bubbles on content blocks that have threads
THREADS_DATA.forEach(td => {
  if (!td.line) return;
  // Find the commentable block whose source map range contains this line
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

// Escape key closes modal; focus trap inside modal
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

async function submitComment() {
  const text = document.getElementById('commentText').value.trim();
  if (!text) return;
  try {
    const res = await fetch('/api/comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line: commentLine, content: text, filePath: SPEC_PATH })
    });
    if (!res.ok) throw new Error('Failed');
    const result = await res.json();
    closeModal();
    showToast(result.synced ? 'Comment posted' : 'Comment saved locally \u2014 pending sync');
    updateSyncStatus();
    setTimeout(() => location.reload(), 500);
  } catch (e) {
    showToast('Failed to post comment');
  }
}

async function replyToThread(threadId) {
  const text = prompt('Reply:');
  if (!text) return;
  try {
    const res = await fetch('/api/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, content: text })
    });
    if (!res.ok) throw new Error('Failed');
    const result = await res.json();
    showToast(result.synced ? 'Reply posted' : 'Reply saved \u2014 pending sync');
    updateSyncStatus();
    setTimeout(() => location.reload(), 500);
  } catch (e) {
    showToast('Failed to reply');
  }
}

async function resolveThread(threadId) {
  try {
    const res = await fetch('/api/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId })
    });
    if (!res.ok) throw new Error('Failed');
    const result = await res.json();
    showToast(result.synced ? 'Thread resolved' : 'Resolve queued \u2014 pending sync');
    updateSyncStatus();
    setTimeout(() => location.reload(), 500);
  } catch (e) {
    showToast('Failed to resolve');
  }
}

async function submitReview(type) {
  try {
    const res = await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type })
    });
    if (!res.ok) throw new Error('Failed');
    showToast(type === 'approve' ? 'Approved!' : 'Changes requested');
  } catch (e) {
    showToast('Failed to submit review');
  }
}

// --- Sync status ---
async function updateSyncStatus() {
  try {
    const res = await fetch('/api/pending');
    const data = await res.json();
    const bar = document.getElementById('syncBar');
    const status = document.getElementById('syncStatus');
    const btn = document.getElementById('syncBtn');
    if (data.count > 0) {
      bar.classList.add('has-pending');
      if (data.isOffline) bar.classList.add('offline');
      status.innerHTML = '<span class="count">' + data.count + '</span> comment' + (data.count > 1 ? 's' : '') + ' pending sync';
      btn.style.display = data.isOffline ? 'none' : '';
    } else {
      bar.classList.remove('has-pending');
    }
  } catch {}
}

async function syncPending() {
  const btn = document.getElementById('syncBtn');
  btn.classList.add('syncing');
  btn.textContent = 'Syncing...';
  try {
    const res = await fetch('/api/sync', { method: 'POST' });
    const data = await res.json();
    if (data.synced > 0) showToast(data.synced + ' comment' + (data.synced > 1 ? 's' : '') + ' synced to ADO');
    if (data.failed > 0) showToast(data.failed + ' failed to sync');
    updateSyncStatus();
    if (data.synced > 0) setTimeout(() => location.reload(), 1000);
  } catch (e) {
    showToast('Sync failed \u2014 check your connection');
  }
  btn.classList.remove('syncing');
  btn.textContent = 'Sync to ADO';
}

// Check sync status on page load and periodically
updateSyncStatus();
setInterval(updateSyncStatus, 30000);

// --- Column resize ---
(function() {
  const MIN_W = 160;
  const sidebarLeft = document.getElementById('sidebarLeft');
  const sidebarRight = document.getElementById('sidebarRight');
  const handleLeft = document.getElementById('resizeLeft');
  const handleRight = document.getElementById('resizeRight');

  // Restore saved widths
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

// --- Module-level state ---
let _conn, _pr, _prId, _branch, _changedFiles, _cache, _isOffline, _canEdit = false;

// --- Express server ---
async function main() {
  // Parse PR ID (first non-flag argument)
  const args = process.argv.slice(2);
  const positional = args.filter(a => !a.startsWith("--"));
  _prId = parseInt(positional[0]);
  const explicitFile = args.find((a) => a.startsWith("--file="))?.split("=").slice(1).join("=") || positional[1] || null;

  if (!_prId) {
    console.log("Usage: tippani <PR_ID> [options]");
    console.log("");
    console.log("Options:");
    console.log("  --org=<url>       ADO org URL (e.g. https://dev.azure.com/myorg)");
    console.log("  --project=<name>  ADO project name");
    console.log("  --repo=<name>     ADO repo name (defaults to project name)");
    console.log("  --file=<path>     Open a specific file directly");
    console.log("  --refresh         Force re-fetch from ADO (ignore cache)");
    console.log("  --offline         Work from cache only, no ADO connection needed");
    console.log("  --save-config     Save --org/--project/--repo to ~/.tippani/config.json");
    console.log("");
    console.log("Examples:");
    console.log("  tippani 992661");
    console.log("  tippani 992661 --org=https://dev.azure.com/myorg --project='My Project'");
    console.log("  tippani 992661 --offline");
    console.log("");
    console.log("Config: ~/.tippani/config.json (set defaults to avoid repeated flags)");
    process.exit(1);
  }

  // Resolve ADO config
  const adoConfig = getConfig();
  if (!adoConfig.org || !adoConfig.project) {
    console.error("Error: --org and --project are required (or set in ~/.tippani/config.json).");
    console.error("Run: tippani <PR_ID> --org=https://dev.azure.com/YOURORG --project='YOUR PROJECT' --save-config");
    process.exit(1);
  }
  ADO_ORG = adoConfig.org.replace(/\/+$/, "");
  if (!ADO_ORG.startsWith("https://")) ADO_ORG = "https://" + ADO_ORG;
  ADO_PROJECT = adoConfig.project;
  ADO_REPO = adoConfig.repo || adoConfig.project;

  // Save config if requested
  if (args.includes("--save-config")) {
    saveConfig({ org: ADO_ORG, project: ADO_PROJECT, repo: ADO_REPO });
    console.log("Config saved to ~/.tippani/config.json");
  }

  console.log(`  Org: ${ADO_ORG} | Project: ${ADO_PROJECT} | Repo: ${ADO_REPO}`);

  const forceRefresh = args.includes("--refresh");
  _isOffline = args.includes("--offline");

  // Try cache first
  _cache = loadCache(_prId);

  if (_isOffline && !_cache) {
    console.error("No cache found. Run once online first, then use --offline.");
    process.exit(1);
  }

  if (_cache && isCacheFresh(_cache) && !forceRefresh && !_isOffline) {
    // Fresh cache available — still need auth for live actions
    console.log("  Using cached data (cached " + new Date(_cache.cachedAt).toLocaleString() + ")");
    _pr = _cache.pr;
    _branch = _cache.branch;
    _changedFiles = _cache.changedFiles;

    // Establish connection for live actions (comment sync etc.)
    let pat = loadPat();
    if (pat) {
      _conn = getAdoConnection(pat);
    } else {
      const token = await getTokenFromAzCli();
      if (token) {
        _conn = getAdoConnectionBearer(token);
      }
      // If no auth available, operate with cached data only
    }
  } else if (_isOffline) {
    // Pure offline — skip auth entirely
    console.log("  Offline mode — using cached data (cached " + new Date(_cache.cachedAt).toLocaleString() + ")");
    _pr = _cache.pr;
    _branch = _cache.branch;
    _changedFiles = _cache.changedFiles;
    _conn = null;
  } else {
    // Need to fetch from ADO
    let pat = loadPat();

    if (pat) {
      console.log("Using saved PAT...");
      _conn = getAdoConnection(pat);
    } else {
      console.log("Trying az CLI for authentication...");
      const token = await getTokenFromAzCli();
      if (token) {
        console.log("Authenticated via az CLI.");
        _conn = getAdoConnectionBearer(token);
      } else {
        const readline = await import("readline");
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        pat = await new Promise((resolve) => {
          console.log("\nNo PAT found and az CLI not available. Generate a PAT at:");
          console.log(`  ${ADO_ORG}/_usersSettings/tokens`);
          console.log("  Scope: Code (Read & Write)\n");
          rl.question("Paste your PAT: ", (answer) => {
            rl.close();
            resolve(answer.trim());
          });
        });
        if (!pat) {
          console.error("No PAT provided. Exiting.");
          process.exit(1);
        }
        savePat(pat);
        console.log("PAT saved to ~/.tippani/pat\n");
        _conn = getAdoConnection(pat);
      }
    }

    console.log(`Loading PR #${_prId}...`);
    try {
      _pr = await getPullRequest(_conn, _prId);
    } catch (e) {
      console.error(`\n  Error: ${friendlyAdoError(e, "Loading PR")}\n`);
      process.exit(1);
    }
    console.log(`  "${_pr.title}" by ${_pr.createdBy?.displayName}`);

    // Warn if PR is abandoned or completed
    if (_pr.status === 3) console.log("  ⚠ This PR is abandoned. Comments may not be actionable.");
    if (_pr.status === 2) console.log("  ⚠ This PR is completed. Comments may not be actionable.");

    _branch = _pr.sourceRefName;

    console.log("  Fetching changed files...");
    try {
      _changedFiles = await getPRChangedFiles(_conn, _prId);
    } catch (e) {
      console.error(`\n  Error: ${friendlyAdoError(e, "Fetching changed files")}\n`);
      process.exit(1);
    }
    console.log(`  ${_changedFiles.length} .md file(s) changed.`);

    // Cache file contents and threads
    console.log("  Caching file contents...");
    const fileContents = {};
    for (const f of _changedFiles) {
      try {
        fileContents[f.path] = await getFileContent(_conn, f.path, _branch);
      } catch (e) {
        console.log("    \u26A0 Could not cache " + f.path);
      }
    }
    const threads = await getCommentThreads(_conn, _prId);
    _cache = { pr: _pr, branch: _branch, changedFiles: _changedFiles, fileContents, threads, cachedAt: new Date().toISOString() };
    saveCache(_prId, _cache);
    console.log("  Cached to ~/.tippani/cache/pr-" + _prId + ".json");
  }

  if (_changedFiles.length === 0) {
    console.error("No markdown files changed in this PR.");
    process.exit(1);
  }

  // Determine push access once — gates the Edit affordance in every spec view.
  _canEdit = await computeCanEdit(_conn, _pr, _isOffline);

  // Resolve explicit file to an index
  let openIndex = null;
  if (explicitFile) {
    const idx = _changedFiles.findIndex((f) => f.path === explicitFile);
    openIndex = idx >= 0 ? idx : 0;
  }

  // Start server
  const app = express();
  app.use(express.json());

  // CSRF protection: reject cross-origin mutations
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      const origin = req.headers.origin || req.headers.referer || "";
      if (!origin.startsWith(`http://localhost:${PORT}`) && !origin.startsWith(`http://127.0.0.1:${PORT}`)) {
        return res.status(403).json({ error: "Forbidden: cross-origin request" });
      }
    }
    next();
  });

  // File picker or auto-redirect
  app.get("/", (_req, res) => {
    if (_changedFiles.length === 1) {
      return res.redirect("/file/0");
    }
    res.type("html").send(buildPickerPage(_pr, _changedFiles));
  });

  // Spec view for a specific file
  app.get("/file/:index", async (req, res) => {
    try {
      const idx = parseInt(req.params.index);
      if (isNaN(idx) || idx < 0 || idx >= _changedFiles.length) {
        return res.redirect("/");
      }
      const filePath = _changedFiles[idx].path;

      // Get content from cache or live
      let raw;
      if (_cache?.fileContents?.[filePath]) {
        raw = _cache.fileContents[filePath];
      } else if (!_isOffline && _conn) {
        raw = await getFileContent(_conn, filePath, _branch);
        if (_cache) {
          _cache.fileContents = _cache.fileContents || {};
          _cache.fileContents[filePath] = raw;
          saveCache(_prId, _cache);
        }
      } else {
        return res.status(503).send("File not in cache and running offline.");
      }

      const { metadata, body } = stripFrontmatter(raw);
      const { toc, sourceMap } = buildSourceMap(body);
      const specHtml = await renderMarkdown(body);

      // Merge cached threads + pending local comments
      let threads = _cache?.threads || [];
      if (!_isOffline && _conn) {
        try {
          threads = await getCommentThreads(_conn, _prId);
          _cache.threads = threads;
          saveCache(_prId, _cache);
        } catch { /* use cached threads */ }
      }

      // Merge pending comments as local-only threads
      const pending = loadPending(_prId);
      const pendingThreads = pending
        .filter(p => p.type === 'comment' && !p.synced)
        .map(p => ({
          id: 'local-' + p.id,
          status: 1,
          threadContext: { filePath: p.filePath, rightFileStart: { line: p.line, offset: 1 }, rightFileEnd: { line: p.line, offset: 1 } },
          comments: [{ author: { displayName: 'You (pending sync)' }, publishedDate: p.createdAt, content: p.content, renderedContent: null }]
        }));

      const allThreads = [...threads, ...pendingThreads];

      // Pre-render comment markdown (always use safe renderer, ignore ADO's renderedContent)
      for (const t of allThreads) {
        for (const c of (t.comments || [])) {
          if (c.content) {
            c.renderedContent = await renderMarkdownSafe(c.content);
          }
        }
      }

      // canEdit gates the Edit affordance; resolved once at startup from the
      // identity's push access to the PR repo (see computeCanEdit).
      const canEdit = _canEdit;
      // Conflict guard (#49): capture the branch tip at load time. Saving passes
      // this back as oldObjectId so ADO rejects the push if the branch has moved.
      let baseObjectId = null;
      if (!_isOffline && _conn) {
        try { baseObjectId = await getBranchTip(_conn, _branch); } catch { /* non-fatal */ }
      }
      res.type("html").send(buildSpecPage(specHtml, toc, metadata, _pr, allThreads, filePath, sourceMap, _changedFiles, idx, body, canEdit, baseObjectId));
    } catch (e) {
      res.status(500).send("Error rendering spec. Check the server console for details.");
      console.error("Spec render error:", e.message);
    }
  });

  app.post("/api/comment", async (req, res) => {
    const action = addPending(_prId, { type: 'comment', filePath: req.body.filePath, line: req.body.line, content: req.body.content });
    if (!_isOffline && _conn) {
      try {
        await createCommentThread(_conn, _prId, req.body.filePath, req.body.line, req.body.content);
        action.synced = true;
        const pending = loadPending(_prId);
        const idx = pending.findIndex(p => p.id === action.id);
        if (idx >= 0) pending[idx].synced = true;
        savePending(_prId, pending);
        res.json({ ok: true, synced: true });
      } catch (e) {
        res.json({ ok: true, synced: false, queued: true, message: "Saved locally, will sync later" });
      }
    } else {
      res.json({ ok: true, synced: false, queued: true, message: "Saved locally (offline mode)" });
    }
  });

  app.post("/api/reply", async (req, res) => {
    const action = addPending(_prId, { type: 'reply', threadId: req.body.threadId, content: req.body.content });
    if (!_isOffline && _conn) {
      try {
        await replyToThread(_conn, _prId, req.body.threadId, req.body.content);
        action.synced = true;
        const pending = loadPending(_prId);
        const idx = pending.findIndex(p => p.id === action.id);
        if (idx >= 0) pending[idx].synced = true;
        savePending(_prId, pending);
        res.json({ ok: true, synced: true });
      } catch {
        res.json({ ok: true, synced: false, queued: true });
      }
    } else {
      res.json({ ok: true, synced: false, queued: true });
    }
  });

  app.post("/api/resolve", async (req, res) => {
    const action = addPending(_prId, { type: 'resolve', threadId: req.body.threadId });
    if (!_isOffline && _conn) {
      try {
        await resolveThread(_conn, _prId, req.body.threadId);
        action.synced = true;
        const pending = loadPending(_prId);
        const idx = pending.findIndex(p => p.id === action.id);
        if (idx >= 0) pending[idx].synced = true;
        savePending(_prId, pending);
        res.json({ ok: true, synced: true });
      } catch {
        res.json({ ok: true, synced: false, queued: true });
      }
    } else {
      res.json({ ok: true, synced: false, queued: true });
    }
  });

  // Save an edited spec: commit the markdown to the PR source branch (#48).
  app.post("/api/save", async (req, res) => {
    const { filePath, content, message, baseObjectId } = req.body || {};
    if (typeof content !== "string" || !filePath) {
      return res.status(400).json({ ok: false, error: "filePath and content are required" });
    }
    const commitMessage = (message && String(message).trim()) || `tippani: update ${filePath.split("/").pop()}`;
    // Queue first so a failure/offline never loses the edit.
    const action = addPending(_prId, { type: "save", filePath, content, message: commitMessage });

    if (_isOffline || !_conn) {
      return res.json({ ok: true, synced: false, queued: true, message: "Saved locally (offline) — will push on sync." });
    }
    try {
      // Pass the load-time tip as oldObjectId (#49) — ADO rejects the push if the
      // branch moved underneath the editor (optimistic concurrency).
      const commitId = await pushFileToBranch(_conn, _branch, filePath, content, commitMessage, baseObjectId || undefined);
      const pending = loadPending(_prId);
      const idx = pending.findIndex((p) => p.id === action.id);
      if (idx >= 0) pending[idx].synced = true;
      savePending(_prId, pending);
      // Refresh the local cache so a reload shows the saved content.
      if (_cache && _cache.fileContents) {
        _cache.fileContents[filePath] = content;
        saveCache(_prId, _cache);
      }
      res.json({ ok: true, synced: true, commitId });
    } catch (e) {
      if (isConflict(e)) {
        // Branch moved — drop the queued action so it is never blindly re-pushed
        // by a later sync. The editor keeps the content; the user reloads or copies.
        removePending(_prId, action.id);
        return res.json({ ok: false, conflict: true, error: "This file was updated by someone else since you started editing." });
      }
      // Other failure: edit stays queued (no data loss). Surface an actionable error.
      res.json({ ok: false, synced: false, queued: true, error: friendlyAdoError(e, "save") });
    }
  });

  app.post("/api/review", async (req, res) => {
    try {
      const gitApi = await _conn.getGitApi();
      const vote = req.body.type === "approve" ? 10 : -5;
      res.json({ ok: true, message: "Review submitted (vote: " + vote + ")" });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Sync pending actions to ADO
  app.post("/api/sync", async (req, res) => {
    if (_isOffline || !_conn) {
      return res.json({ ok: false, message: "Cannot sync in offline mode" });
    }
    const pending = loadPending(_prId);
    const unsynced = pending.filter(p => !p.synced);
    let synced = 0, failed = 0;
    const errors = [];

    for (const action of unsynced) {
      try {
        if (action.type === 'comment') {
          await createCommentThread(_conn, _prId, action.filePath, action.line, action.content);
        } else if (action.type === 'reply') {
          await replyToThread(_conn, _prId, action.threadId, action.content);
        } else if (action.type === 'resolve') {
          await resolveThread(_conn, _prId, action.threadId);
        } else if (action.type === 'save') {
          await pushFileToBranch(_conn, _branch, action.filePath, action.content, action.message);
          if (_cache && _cache.fileContents) _cache.fileContents[action.filePath] = action.content;
        }
        action.synced = true;
        synced++;
      } catch (e) {
        failed++;
        errors.push({ id: action.id, type: action.type, error: e.message });
      }
    }

    savePending(_prId, pending);

    // Refresh threads cache
    try {
      _cache.threads = await getCommentThreads(_conn, _prId);
      saveCache(_prId, _cache);
    } catch {}

    res.json({ ok: true, synced, failed, total: unsynced.length, errors });
  });

  // Get pending count for status bar
  app.get("/api/pending", (_req, res) => {
    const pending = loadPending(_prId);
    const unsynced = pending.filter(p => !p.synced);
    res.json({ count: unsynced.length, isOffline: _isOffline });
  });

  const server = app.listen(PORT, "127.0.0.1", () => {
    const base = `http://localhost:${PORT}`;
    const url = openIndex !== null ? `${base}/file/${openIndex}` : base;
    console.log(`\n  Review portal running at ${base}\n`);
    open(url);
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\n  Error: Port ${PORT} is already in use. Is another tippani instance running?\n`);
    } else {
      console.error(`\n  Error starting server: ${err.message}\n`);
    }
    process.exit(1);
  });
}

main().catch((e) => {
  console.error(`\n  Error: ${friendlyAdoError(e, "Startup")}\n`);
  process.exit(1);
});
