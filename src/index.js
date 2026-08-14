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
import { execFile } from "node:child_process";
import { fileURLToPath } from "url";
import os from "os";
import { EDITOR_JS } from "./client/editor.bundle.js";
import { MERMAID_JS } from "./client/mermaid.bundle.js";
import { MERMAID_VIEW_JS } from "./client/mermaid-view.bundle.js";
import { isConflict } from "./conflict.js";
import { decideCanEdit } from "./canedit.js";
import {
  createFocusStore,
  createDraftStore,
  createLockStore,
  createKeyedLockStore,
  createInflightStore,
} from "./api-state.js";
import { registerControlApi } from "./control-api.js";
import { renderSpecBody } from "./spec-source-map.js";
import { buildToc } from "./toc.js";
import { classifyLocalMedia } from "./local-media.js";
import { isReadOnlyWiql, summarizeWorkItem, buildWorkItemUrl, WORK_ITEM_FIELDS } from "./work-item.js";
import { isTableBlock, computeTableDiff } from "./table-diff.js";
import { updateViewed } from "./viewed-map.js";
import { writeInstance, removeInstance } from "./portal-registry.js";
import { reattachFrontmatter } from "./frontmatter.js";
import { sortThreadsByLine } from "./thread-order.js";
import { identityFromAdoToken, isExpiredJwt } from "./ado-token-check.js";
import { buildPrCriteria, summarizePr, mergeRolePrs, prStatusLabel } from "./pr-criteria.js";
import { navCursor, navSkipsBarePathClobber, navShouldNavigate, navTarget } from "./nav-guard.js";
import { createApprovedRoots } from "./approved-roots.js";
import { classifyOpenFilePath, classifyAddFile } from "./open-file-path.js";
import { resolveLinkAction } from "./open-external.js";
import { createCustomFiles } from "./custom-files.js";
import { buildReadingList, isPinnedManual, manualRoot } from "./reading-list.js";
import { fileReviewContext } from "./comment-key.js";
import { isAllowedHost } from "./host-guard.js";
import { createLocalClientAuth } from "./local-client-auth.js";
import {
  createAppSessionRotation,
  ROTATION_INTERVAL_MS,
} from "./app-session-rotation.js";
import { planStagedPushes } from "./staged-push-plan.js";
import { adoCall } from "./ado-call.js";
import { resolveBaseBranch, normalizeBranchRef } from "./ado-refs.js";
import { resolveWriteTarget, draftKeyOf } from "./ado-target.js";
import { selectAdoAuthSource } from "./ado-auth-source.js";
import { makeRepoSession, createSessionTokens } from "./repo-session.js";
import { saveSpecDraft, loadSpecDraft, deleteSpecDraft } from "./spec-draft-store.js";
import { openSpecReviewPr } from "./pr-open.js";
import { specSearchUnavailableMessage } from "./spec-search-error.js";
import { prContentVersion } from "./pr-version.js";
import { renderCrumbBar, renderBrand } from "./breadcrumb.js";
import {
  decodeConfigValue,
  deriveRepoContext,
  summarizeNonMarkdown,
} from "./config-util.js";
import { resolveImagePath, imageContentType, isLfsPointer, secureImageHeaders, isValidRepoId } from "./image-src.js";
import { cssVariables, changeTypeBadge, escHtml, stripMarkdown, jsonForScript, errorPage } from "./html-util.js";
import { getSpecContentAt, getSpecBlobAt, buildSpecWebUrl, getLastCommitAuthor } from "./ado-read.js";
import { branchesForRepo, repoOptions, branchNamePlaceholder, sortBranches, shortBranchName, summarizeBranchRef } from "./branch-list.js";
import { branchFileRows, visibleFileCount, mdPathsFromChanges, buildSpecHref, stagedFileComparison } from "./branch-files.js";
import { validateLocalRepo, resolveGitDir, parseGitHead, parsePackedRefs, mergeLocalBranches, parseOriginHeadDefault, userCreatedBranches } from "./local-repo.js";
import { baseCandidates, safeLocalPath } from "./local-git.js";
import { handleReviewRequest } from "./review-vote.js";
import { newComment as pcNew, addComment as pcAdd, updateComment as pcUpdate, removeComment as pcRemove, findComment as pcFind, sortComments as pcSort, setResolved as pcSetResolved, addReply as pcAddReply, navTargetId as pcNavTarget, reanchorComments as pcReanchor } from "./personal-comments.js";
import { personalCommentsKey as pcStoreKey, loadPersonalComments as pcStoreLoad, savePersonalComments as pcStoreSave, deletePersonalComments as pcStoreDelete, migrateKey as pcStoreMigrate } from "./personal-comments-store.js";
import { createStagedInventory, normFolder, parentFolder } from "./staged-inventory.js";
import { createAdoReviewProvider } from "./ado-review-provider.js";
import { createAdoRepoContentProvider } from "./ado-repo-content-provider.js";
import { createAdoAuthoringProvider } from "./ado-authoring-provider.js";
import { createAdoWorkItemProvider } from "./ado-work-item-provider.js";
import { createAdoSearchProvider } from "./ado-search-provider.js";
import { createAdoBlobProvider } from "./ado-blob-provider.js";
import { createGitHubClient } from "./github-client.js";
import { createGitHubReviewProvider } from "./github-review-provider.js";
import { createGitHubRepoContentProvider } from "./github-repo-content-provider.js";
import { createGitHubAuthoringProvider } from "./github-authoring-provider.js";
import { createGitHubSearchProvider } from "./github-search-provider.js";
import { createGitHubBlobProvider } from "./github-blob-provider.js";
import { createGitHubViewedStore } from "./github-viewed-store.js";
import { normalizeGitHubCoordinates, parseGitHubTarget, selectGitHubToken } from "./github-target.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Config ---
const CONFIG_DIR = path.join(os.homedir(), ".tippani");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
let PORT = 3847;

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
    project: decodeConfigValue(findArg("project") || process.env.TIPPANI_PROJECT || cfg.project || null),
    repo: decodeConfigValue(findArg("repo") || process.env.TIPPANI_REPO || cfg.repo || cfg.project || null),
  };
}

// Resolved at startup
let ADO_ORG, ADO_PROJECT, ADO_REPO;
let _hostKind = "ado";
let _githubOwner = null, _githubRepo = null;
let _githubHeadOwner = null, _githubHeadRepo = null;
let _githubReview = null, _githubRepoContent = null;
let _githubAuthoring = null, _githubSearch = null, _githubBlobs = null;
// Human-readable name for ADO_PROJECT (which applyRepoContextFromPR may re-point
// to a project GUID). Resolved by listAdoProjects so the picker never shows a GUID.
let _adoProjectDisplayName = null;
// The current LOCAL repo path (Branches "Local" mode). Settable via the
// --local-repo CLI arg, TIPPANI_LOCAL_REPO env, or POST /api/v1/local-repo (MCP).
// Injected into the Discovery page so the Repo box shows the full path.
let _localRepoPath = "";

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
  const stem = _hostKind === "github"
    ? `github-${String(_githubOwner).replace(/[^a-z0-9.-]/gi, "_")}-${String(_githubRepo).replace(/[^a-z0-9.-]/gi, "_")}-pr-${prId}`
    : `pr-${prId}`;
  return path.join(CACHE_DIR, `${stem}.json`);
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
  const base = path.basename(getCachePath(prId), ".json");
  return path.join(CACHE_DIR, `${base}-pending.json`);
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

// --- Personal Comments store (file/branch-scoped, local) ---
// A spec author's own notes on a draft file, kept locally per (repo, branch,
// path). List ops are pure (personal-comments.js); disk I/O lives here.
const PERSONAL_COMMENTS_DIR = path.join(CONFIG_DIR, "personal-comments");

// Disk I/O delegates to the durable, unit-tested store (atomic write,
// corruption quarantine, loud failures). loadPersonalComments THROWS on a
// corrupt/unreadable store rather than masquerading as "zero comments", and
// savePersonalComments THROWS on write failure — so every caller wraps these
// in try/catch and reports { ok: false } instead of a false success.
function personalCommentsKey(repoId, branch, filePath) {
  return pcStoreKey(repoId, branch, filePath);
}

// Staged-authoring inventory (clickstop-2): branches, files, folders, PR
// intents, and PR-publish intents held locally until one push_staged_changes
// crosses to ADO. Extracted to staged-inventory.js — this instance owns the
// state; index.js keeps only the ADO-calling orchestration (pushStagedBranches,
// publishStagedPrs, listBranchFolders) that reads/writes it via snapshot()
// and the removeXMatching() accessors rather than raw arrays.
const _inventory = createStagedInventory({
  deletePersonalComments: (repo, branch, path) => pcStoreDelete(PERSONAL_COMMENTS_DIR, repo, branch, path),
});

function loadPersonalComments(repoId, branch, filePath) {
  const staged = _inventory.getFiles(repoId, branch, filePath);
  if (staged) return staged.personalComments || [];
  return pcStoreLoad(PERSONAL_COMMENTS_DIR, repoId, branch, filePath);
}

function savePersonalComments(repoId, branch, filePath, comments) {
  if (_inventory.setFilePersonalComments(repoId, branch, filePath, comments)) return;
  pcStoreSave(PERSONAL_COMMENTS_DIR, repoId, branch, filePath, comments);
}

// --- Approved local-review roots (allow-list) ---
// The local review path reads .md straight off disk from a caller-supplied repo
// path (?local=…, MCP open_branch_file). Left open, a (possibly prompt-injected)
// agent could read any .md under any git repo on the machine. So local reads are
// gated to roots the user DELIBERATELY approved — i.e. opened via the Repo box /
// openLocalRepo or the --local-repo launch arg. Approvals persist so a later MCP
// session still trusts a repo the user set up earlier. realpath-based, so a
// symlinked alias of an approved root still matches.
const LOCAL_ROOTS_FILE = path.join(CONFIG_DIR, "local-roots.json");
// Clickstop 2 (Custom list): the durable user-curated file list. Its parent
// folders are the custom-contributed approved roots, unioned into containment
// below via `extraRoots` — so adding a file approves its folder and removing the
// last file under a folder revokes it, with no dead roots ever accumulating.
const CUSTOM_FILES_FILE = path.join(CONFIG_DIR, "custom-files.json");
// The Reading list always pins the Tippani README as the user manual.
const README_PATH = path.join(__dirname, "..", "README.md");
let _customFiles;
try {
  _customFiles = createCustomFiles({ fs, path, file: CUSTOM_FILES_FILE, configDir: CONFIG_DIR });
} catch (e) {
  // A corrupt store was quarantined; start empty rather than refusing to boot.
  console.error("Custom-list store:", e.message);
  _customFiles = createCustomFiles({ fs, path, file: CUSTOM_FILES_FILE, configDir: CONFIG_DIR });
}
// Clickstop 2, step 1: the approved-roots gate now lives in an importable,
// tested module (behavior unchanged). `isContained` is the pure containment
// check used by the open-a-file validator to distinguish a symlink escape.
// `extraRoots` unions in the Custom-list folders (kept separate from persisted
// local-clone roots so the two provenances never cross-revoke).
const { approveLocalRoot, isApprovedRoot, isContained, containingRoot } = createApprovedRoots({
  fs, path, rootsFile: LOCAL_ROOTS_FILE, configDir: CONFIG_DIR,
  extraRoots: () => {
    const roots = _customFiles.customRoots();
    const r = manualRoot({ readmePath: README_PATH, fs, path });
    return r ? [...roots, r] : roots;
  },
});

// --- ADO error helper ---
function friendlyAdoError(e, context) {
  const msg = e.message || String(e);
  const status = e.statusCode || e.status || (msg.match(/(\d{3})/) || [])[1];
  if (_hostKind === "github") {
    if (status == 401) return "GitHub authentication failed (401). Refresh TIPPANI_GH_TOKEN or run `gh auth login`.";
    if (status == 403) return "GitHub access denied (403). The token may lack pull-request or contents write access.";
    if (status == 404) return `GitHub repository or pull request not found: ${_githubOwner}/${_githubRepo}.`;
    if (status == 422) return `GitHub rejected the request: ${msg}`;
    if (status == 429) return "GitHub rate limited the request. Wait and retry.";
    return `${context}: ${msg}`;
  }
  if (msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED"))
    return `Could not connect to ADO org. Check the --org URL and your network.`;
  if (status == 401)
    return `Authentication failed (401). Your credentials may be expired. Reauthenticate the account used by Tippani and retry. If using a PAT, replace the expired PAT and restart Tippani.`;
  if (status == 403)
    return `Access denied (403). Your account (or PAT) may lack access to this repo, or the PAT is missing the Code (Read & Write) scope.`;
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
  // Dev fallback for standalone use: mint an ADO access token via the az CLI for
  // the host-configured resource. No resource configured → no token.
  const resource = process.env.TIPPANI_ADO_AUDIENCE;
  if (!resource) return null;
  const { execSync } = await import("child_process");
  try {
    const token = execSync(
      `az account get-access-token --resource "${resource}" --query accessToken -o tsv`,
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

// One ReviewProvider instance per ADO connection. Repo/project are dynamic
// getters: applyRepoContextFromPR re-points the review globals after a global
// PR lookup, and the already-created provider must observe the new coordinates.
// A WeakMap avoids rebuilding the adapter on every request without extending
// the connection's lifetime.
const _adoReviewProviders = new WeakMap();
const _adoRepoContentProviders = new WeakMap();
const _adoAuthoringProviders = new WeakMap();
const _adoWorkItemProviders = new WeakMap();
const _adoSearchProviders = new WeakMap();
const _adoBlobProviders = new WeakMap();
function adoReview(conn) {
  if (!conn) throw new Error("ADO review provider requires a connection");
  let provider = _adoReviewProviders.get(conn);
  if (!provider) {
    provider = createAdoReviewProvider(conn, {
      getRepo: () => ADO_REPO,
      getProject: () => ADO_PROJECT,
    });
    _adoReviewProviders.set(conn, provider);
  }
  return provider;
}
function adoRepoContent(conn) {
  if (!conn) throw new Error("ADO repo-content provider requires a connection");
  let provider = _adoRepoContentProviders.get(conn);
  if (!provider) {
    provider = createAdoRepoContentProvider(conn);
    _adoRepoContentProviders.set(conn, provider);
  }
  return provider;
}
function adoAuthoring(conn) {
  if (!conn) throw new Error("ADO authoring provider requires a connection");
  let provider = _adoAuthoringProviders.get(conn);
  if (!provider) {
    provider = createAdoAuthoringProvider(conn);
    _adoAuthoringProviders.set(conn, provider);
  }
  return provider;
}
function adoWorkItems(conn) {
  if (!conn) throw new Error("ADO work-item provider requires a connection");
  let provider = _adoWorkItemProviders.get(conn);
  if (!provider) {
    provider = createAdoWorkItemProvider(conn);
    _adoWorkItemProviders.set(conn, provider);
  }
  return provider;
}
function adoSearch(conn) {
  if (!conn) throw new Error("ADO search provider requires a connection");
  let provider = _adoSearchProviders.get(conn);
  if (!provider) {
    provider = createAdoSearchProvider(conn, { org: ADO_ORG });
    _adoSearchProviders.set(conn, provider);
  }
  return provider;
}
function adoBlobs(conn) {
  if (!conn) throw new Error("ADO blob provider requires a connection");
  let provider = _adoBlobProviders.get(conn);
  if (!provider) {
    provider = createAdoBlobProvider(conn, {
      getRepo: () => ADO_REPO,
      getProject: () => ADO_PROJECT,
    });
    _adoBlobProviders.set(conn, provider);
  }
  return provider;
}
function reviewProvider(conn) {
  return _hostKind === "github" ? _githubReview : adoReview(conn);
}
function repoContentProvider(conn) {
  return _hostKind === "github" ? _githubRepoContent : adoRepoContent(conn);
}
function authoringProvider(conn) {
  return _hostKind === "github" ? _githubAuthoring : adoAuthoring(conn);
}
function searchProvider(conn) {
  return _hostKind === "github" ? _githubSearch : adoSearch(conn);
}
function blobProvider(conn) {
  return _hostKind === "github" ? _githubBlobs : adoBlobs(conn);
}
function initGitHubProviders(token, { owner, repo }) {
  const client = createGitHubClient({
    token,
    apiBase: process.env.TIPPANI_GITHUB_API_BASE ||
      "https://api.github.com",
  });
  const viewedStore = createGitHubViewedStore(
    path.join(CONFIG_DIR, "github-viewed.json"),
  );
  _githubReview = createGitHubReviewProvider(client, {
    owner, repo, viewedStore,
  });
  _githubRepoContent = createGitHubRepoContentProvider(client);
  _githubAuthoring = createGitHubAuthoringProvider(client);
  _githubSearch = createGitHubSearchProvider(client, { owner });
  _githubHeadOwner = owner;
  _githubHeadRepo = repo;
  _githubBlobs = createGitHubBlobProvider(client, {
    getOwner: () => _githubHeadOwner,
    getRepo: () => _githubHeadRepo,
  });
  _conn = client; // truthy session handle; generic adapters ignore its ADO shape
  return client;
}

async function getPullRequest(conn, prId) {
  return reviewProvider(conn).getPullRequest(prId);
}

// List pull requests for the configured project (item 6). `criteria` is a
// GitPullRequestSearchCriteria (see pr-criteria.buildPrCriteria).
async function listPullRequests(conn, criteria, top = 50) {
  return reviewProvider(conn).listPullRequests(criteria, top);
}

// List pull requests across the WHOLE org (every project) matching the criteria
// — used by the Discovery review queue so PRs I author/review in any project
// show up, not just the configured one. The node Git API has no org-level
// method, so this calls the org-level REST endpoint directly (same auth handler
// as every other call, via conn.rest). Best-effort: returns [] on failure.
async function listOrgPullRequests(conn, criteria, top = 50) {
  try {
    return await searchProvider(conn).searchPullRequests(criteria, top);
  } catch (e) {
    console.error("listOrgPullRequests failed:", e.message);
    return [];
  }
}

// List every project the account can see in the org, so the Discovery
// work-item search can target any of them (not just the configured project).
// Returns a sorted, deduped array of project names with the configured project
// guaranteed present. Best-effort: on any failure, falls back to just the
// configured project so the UI still renders.
const _isGuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ""));

async function listAdoProjects(conn) {
  try {
    const projects = await repoContentProvider(conn).listProjects();
    const names = (projects || []).map((p) => p && p.name).filter(Boolean);
    // ADO_PROJECT may have been re-pointed to a project GUID by
    // applyRepoContextFromPR. Resolve it back to a human name so the picker
    // preselects the right project and NEVER lists a raw GUID.
    _adoProjectDisplayName = _isGuid(ADO_PROJECT)
      ? ((projects || []).find((p) => p && String(p.id || "").toLowerCase() === String(ADO_PROJECT).toLowerCase())?.name || null)
      : (ADO_PROJECT || null);
    if (_adoProjectDisplayName && !names.includes(_adoProjectDisplayName)) names.push(_adoProjectDisplayName);
    return [...new Set(names.filter((n) => !_isGuid(n)))].sort((a, b) => a.localeCompare(b));
  } catch (e) {
    console.error("listAdoProjects failed:", e.message);
    return (ADO_PROJECT && !_isGuid(ADO_PROJECT)) ? [ADO_PROJECT] : [];
  }
}

// The PR object carries the authoritative repository (getPullRequestById is a
// global lookup). Re-point ADO_REPO/ADO_PROJECT at its stable GUIDs so every
// downstream call targets the real repo, even if the user never passed --repo
// (it would otherwise default to the project name) or passed URL-encoded names.
function applyRepoContextFromPR(pr) {
  const ctx = deriveRepoContext(pr, { repo: ADO_REPO, project: ADO_PROJECT });
  if (ctx.source === "pr") {
    ADO_REPO = ctx.repo;
    ADO_PROJECT = ctx.project;
  }
  if (_hostKind === "github") {
    _githubReview?.bindPullRequest(pr);
    const head = pr?._githubHeadRepository;
    if (head?.owner && head?.name) {
      _githubHeadOwner = head.owner;
      _githubHeadRepo = head.name;
    }
  }
  return ctx;
}

async function getFileContent(conn, filePath, ver) {
  return reviewProvider(conn).getFileContent(filePath, ver);
}

// Version descriptor for reading the bound PR's file content: prefer the PR's
// source commit (survives source-branch deletion / PR completion), else the
// branch name. Falls back to the raw _branch when no PR is bound (browse). Used
// by every PR-content read; write/tip lookups still use _branch directly.
function contentVersion() { return _pr ? prContentVersion(_pr) : _branch; }

// Fetch a binary blob (an embedded image) from the repo as raw bytes. Same ADO
// call as getFileContent, but returns the Buffer undecoded so the image proxy
// route can stream it with the right content-type. resolveLfs=true makes ADO
// return the real object for Git-LFS-tracked images (the specs store screenshots
// in LFS); without it the call returns the ~130-byte LFS pointer text, which
// would stream as a broken image.
async function getImageBlob(conn, filePath, ver) {
  return blobProvider(conn).getBlob(filePath, ver);
}


// Review history for a spec: the comment threads anchored to THIS file across
// the closed PRs that touched it. There's no "PRs that changed this file" API,
// so map the file's commit history to PRs (LastMergeCommit for squash merges +
// Commit for merge commits), keep completed/abandoned PRs (most recent first,
// capped), and pull the file-anchored threads from each. Best-effort — returns
// [] on any failure so the read-only view still renders.
async function getFileReviewHistory(conn, repoId, filePath, branch = "main") {
  const history = await reviewProvider(conn).getFileReviewHistory(
    repoId, filePath, branch,
  );
  // The provider returns raw ADO comments. Rendering stays above the provider
  // line: a future GitHub provider supplies the same neutral comment content
  // without importing Tippani's markdown pipeline.
  for (const item of history) {
    for (const thread of item.threads || []) {
      for (const comment of thread.comments || []) {
        try {
          const rendered = await renderMarkdownSafe(comment.content || "");
          const textOnly = rendered.replace(/<[^>]+>/g, "").trim();
          comment._html = (!textOnly && comment.content)
            ? `<p>${escHtml(String(comment.content).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())}</p>`
            : rendered;
        } catch {
          comment._html = escHtml(comment.content || "");
        }
      }
    }
  }
  return history;
}

async function getPRChangedFiles(conn, prId) {
  return reviewProvider(conn).listChangedFiles(prId);
}

// Load a PR into module state: fetch it, re-point the repo context at its real
// repository, resolve the source branch, fetch the changed .md files, and cache
// contents + threads. Shared by the Discovery home's /open/:prId re-drive (the
// browse portal binds a PR at runtime and switches to PR-bound pages). Assumes
// _conn is already authenticated. Returns the loaded PR.
async function bindPr(prId) {
  const pr = await getPullRequest(_conn, prId);
  _pr = pr;
  _prId = prId;
  applyRepoContextFromPR(pr);
  _branch = pr.sourceRefName;
  const fileResult = await getPRChangedFiles(_conn, prId);
  _changedFiles = fileResult.mdFiles;
  _otherChangedFiles = fileResult.otherFiles;
  const fileContents = {};
  for (const f of _changedFiles) {
    try { fileContents[f.path] = await getFileContent(_conn, f.path, contentVersion()); } catch { /* skip uncacheable file */ }
  }
  let threads = [];
  try { threads = await getCommentThreads(_conn, prId); } catch { /* threads optional */ }
  _cache = {
    pr: _pr, branch: _branch, changedFiles: _changedFiles,
    otherChangedFiles: _otherChangedFiles, fileContents, threads,
    cachedAt: new Date().toISOString(),
  };
  saveCache(prId, _cache);
  return pr;
}

async function getCommentThreads(conn, prId) {
  return reviewProvider(conn).listThreads(prId);
}

async function createCommentThread(conn, prId, filePath, line, content) {
  return reviewProvider(conn).createComment(prId, {
    filePath, line, body: content,
  });
}

async function replyToThread(conn, prId, threadId, content) {
  return reviewProvider(conn).replyToThread(prId, threadId, content);
}

async function resolveThread(conn, prId, threadId) {
  return reviewProvider(conn).resolveThread(prId, threadId);
}

// Record the signed-in user's review vote on the PR (the Approve / Request
// changes bar). ADO addresses a vote by reviewer identity, so this needs the
// authenticated user's id — an anonymous vote is not expressible.
async function submitReviewVote(conn, prId, vote) {
  return reviewProvider(conn).submitReview(prId, vote);
}

// Durable "viewed" state: ADO comment-thread properties are NOT updatable
// ("Comment thread properties cannot be updated"), so per-thread viewed markers
// live in a single PULL-REQUEST property (tippani.viewed = JSON map
// { threadId: lastViewedCommentId }). PR properties ARE updatable via a
// dedicated API, so this is durable + shared in ADO (not a machine-local file).
// A newer comment id makes a thread resurface as unread.
// Strict read: returns {} only when the property is genuinely absent, and THROWS
// on a transient/corrupt read so a caller doing read-modify-write never wipes
// existing markers by writing an empty map after a failed read.
async function readViewedMap(conn, prId) {
  return reviewProvider(conn).readViewed(prId);
}
// Lenient read for DISPLAY only: on any failure fall back to no-markers so the
// page still renders (threads just show as unread). NEVER use this result to
// write back — use readViewedMap for read-modify-write.
async function getViewedMap(conn, prId) {
  return reviewProvider(conn).getViewed(prId);
}
async function setViewedMap(conn, prId, map) {
  return reviewProvider(conn).setViewed(prId, map);
}

// Load viewed markers for DISPLAY, distinguishing "genuinely none" from
// "couldn't read them". The old lenient getViewedMap swallowed a failed read as
// {} — which renders every thread as unread and looks like the viewed state was
// lost, when it's actually still in the PR property and just wasn't readable
// (usually an expired ADO token on a long-lived portal). Callers surface
// `error` to the user instead of silently showing all-unread.
async function loadViewedState(conn, prId, isOffline) {
  if (!conn) return { map: {}, error: null };
  return reviewProvider(conn).loadViewedState(prId, isOffline);
}

// Amber banner shown when the viewed markers couldn't be read, so a failed read
// never silently masquerades as "nothing viewed".
function viewedWarning(err) {
  if (!err) return "";
  return `<div class="viewed-warning" role="alert" style="margin:10px 0;padding:9px 13px;`
    + `border:1px solid #b8860b;border-radius:8px;`
    + `background:color-mix(in srgb,#b8860b 15%,transparent);`
    + `color:var(--cp-text);font-size:13px;line-height:1.45">`
    + `⚠ <strong>Viewed state couldn't be loaded</strong> (${escHtml(err)}) `
    + `Your markers are still saved on the pull request — this is a read error, not lost data. `
    + `Reopen the PR to refresh the connection.</div>`;
}

// Current tip commit (objectId) of a branch ref like "refs/heads/feature/x".
// Defaults to the current review target (ADO_REPO/ADO_PROJECT) but accepts an
// explicit repo/project so the authoring write path can target any repo without
// leaning on the module globals.
async function getBranchTip(conn, branchRef, repoId = ADO_REPO, project = ADO_PROJECT) {
  return repoContentProvider(conn).getBranchTip(repoId, project, branchRef);
}

// Commit an edited file to a branch via the ADO push API. expectedOldObjectId, when
// provided, is used as the push's oldObjectId (optimistic concurrency — the conflict
// guard in #49 passes the load-time SHA); otherwise the live tip is used.
async function pushFileToBranch(conn, branchRef, filePath, content, message, expectedOldObjectId) {
  return reviewProvider(conn).commitFile(branchRef, {
    filePath,
    content,
    message,
    expectedOldObjectId,
  });
}

// Whether the Edit affordance should be offered, gating push access. Decided without a
// network call when it can be: a non-active PR is never editable; offline is allowed
// (edits queue and sync on reconnect, per #48); online-but-unauthenticated can't push.
// If the installed ADO SDK exposes a generic security namespace API, probe ADO for
// GenericContribute at the repository level. azure-devops-node-api@15 does not expose
// that API, so those builds fall through as indeterminate (fail open) and the save path
// surfaces any real rejection. Probe errors also fail open. See decideCanEdit
// (canedit.js) for the gate.
async function computeCanEdit(conn, pr, isOffline) {
  if (isOffline || !conn || pr?.status !== 1) {
    return decideCanEdit({ isOffline, hasConn: !!conn, prStatus: pr?.status, probe: null });
  }
  const projectId = pr?.repository?.project?.id;
  const repoId = pr?.repository?.id;
  let probe = null; // indeterminate => fail open
  if (projectId && repoId) {
    try {
      probe = await reviewProvider(conn).probePushPermission(projectId, repoId);
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

// renderSpecBody (imported) renders the spec body AND captures per-block source
// line ranges from the render tree itself, so the diff overlay / comment anchors
// map to the exact rendered blocks. See spec-source-map.js.

// --- Spec-edit diff (GitHub-style) ---------------------------------------
// Split markdown into blocks separated by blank lines, tracking 1-based line
// ranges so a hunk can be mapped back to a rendered block via the source map.
function splitMdBlocks(md) {
  const lines = (md || "").split("\n");
  const blocks = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "") { if (cur) { blocks.push(cur); cur = null; } continue; }
    if (!cur) cur = { text: lines[i], startLine: i + 1, endLine: i + 1 };
    else { cur.text += "\n" + lines[i]; cur.endLine = i + 1; }
  }
  if (cur) blocks.push(cur);
  return blocks;
}

// LCS block diff → ordered ops (same/del/add), matching blocks by exact text.
function diffMdBlocks(oldBlocks, newBlocks) {
  const n = oldBlocks.length, m = newBlocks.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = oldBlocks[i].text === newBlocks[j].text
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (oldBlocks[i].text === newBlocks[j].text) { ops.push({ type: "same", o: oldBlocks[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: "del", o: oldBlocks[i] }); i++; }
    else { ops.push({ type: "add", d: newBlocks[j] }); j++; }
  }
  while (i < n) { ops.push({ type: "del", o: oldBlocks[i] }); i++; }
  while (j < m) { ops.push({ type: "add", d: newBlocks[j] }); j++; }
  return ops;
}

// Compute GitHub-style change hunks between the original and the staged draft.
// Each hunk carries the original line range (to anchor it in the rendered doc)
// plus server-rendered HTML for the removed ("current") and added ("proposed")
// blocks. When a hunk is a single table on both sides, it is rendered as ONE
// merged table with per-row red/green so only the changed rows stand out.
// isTableBlock / computeTableDiff live in table-diff.js (render-free + tested).
async function renderCellHtml(md) {
  const h = await renderMarkdown(md || "");
  return h.replace(/^\s*<p>/, "").replace(/<\/p>\s*$/, "").trim();
}
// Render two markdown tables as ONE table with changed rows flagged del/add.
// The row structure (column count, header-change detection, per-row del/add)
// comes from computeTableDiff so it stays render-free and unit-tested.
async function renderTableDiff(oldText, newText) {
  const { rows, headerChanged } = computeTableDiff(oldText, newText);
  const renderRowCells = async (cells, tag) => {
    let out = "";
    for (const c of cells) out += "<" + tag + ">" + (await renderCellHtml(c)) + "</" + tag + ">";
    return out;
  };
  let html = '<table class="docdiff-table">';
  if (headerChanged) {
    // Header changed: render it inline as del/add rows so the rename is marked.
    html += "<tbody>";
    for (const r of rows) {
      const cls = r.cls ? ' class="' + r.cls + '"' : "";
      html += "<tr" + cls + ">" + (await renderRowCells(r.cells, "td")) + "</tr>";
    }
    html += "</tbody>";
  } else {
    const head = rows[0];
    html += "<thead><tr>" + (await renderRowCells(head.cells, "th")) + "</tr></thead><tbody>";
    for (const r of rows.slice(1)) {
      const cls = r.cls ? ' class="' + r.cls + '"' : "";
      html += "<tr" + cls + ">" + (await renderRowCells(r.cells, "td")) + "</tr>";
    }
    html += "</tbody>";
  }
  html += "</table>";
  return html;
}
async function computeSpecDiffHunks(originalBody, draftBody) {
  const ops = diffMdBlocks(splitMdBlocks(originalBody), splitMdBlocks(draftBody));
  const hunks = [];
  let idx = 0, lastSameEnd = 0;
  while (idx < ops.length) {
    if (ops[idx].type === "same") { lastSameEnd = ops[idx].o.endLine; idx++; continue; }
    const dels = [], adds = [];
    while (idx < ops.length && ops[idx].type !== "same") {
      if (ops[idx].type === "del") dels.push(ops[idx].o);
      else adds.push(ops[idx].d);
      idx++;
    }
    const oldText = dels.map((b) => b.text).join("\n\n");
    const newText = adds.map((b) => b.text).join("\n\n");
    const hunk = {
      startLine: dels.length ? dels[0].startLine : lastSameEnd,
      endLine: dels.length ? dels[dels.length - 1].endLine : lastSameEnd,
    };
    if (oldText && newText && isTableBlock(oldText) && isTableBlock(newText)) {
      hunk.mergedHtml = await renderTableDiff(oldText, newText);
    } else {
      hunk.oldHtml = oldText ? await renderMarkdown(oldText) : "";
      hunk.newHtml = newText ? await renderMarkdown(newText) : "";
    }
    hunks.push(hunk);
  }
  return hunks;
}

// Safe renderer for user-authored content (comments). Uses rehype-sanitize
// with the default schema, which:
//   - strips raw HTML (remark-rehype already does this by default)
//   - blocks javascript:, data:, vbscript: URLs in href/src
//   - allow-lists tag/attribute combinations
// The default schema is right for comments — no inline IDs, no autolinks,
// nothing the spec renderer's looser specSanitizeSchema needs.
async function renderMarkdownSafe(content) {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize)
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
  const sourceMap = {};
  let pIdx = 0;
  let inPara = false;
  let paraStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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
  return { toc: buildToc(content), sourceMap };
}

// --- Shared CSS variable system ---

// Shared single-tab navigation watcher, injected into EVERY portal page. When
// an MCP nav tool sets a target via POST /api/v1/nav (single-tab mode), the
// control API bumps navSeq; this steers the one open tab to the new page.
// sessionStorage survives same-tab reloads so it fires once per bump and never
// yanks the user back after a manual navigation. Same-origin, so the browser's
// fetch to /api/v1/state is auth-exempt like the other in-page polls.
const NAV_WATCHER = `<script>
(function(){
  ${navCursor.toString()}
  ${navSkipsBarePathClobber.toString()}
  ${navTarget.toString()}
  ${navShouldNavigate.toString()}
  async function navPoll(){
    try {
      const r = await fetch('/api/v1/state');
      if (!r.ok) return;
      const s = await r.json();
      if (!s || !s.navUrl || !Number.isFinite(s.navSeq)) return;
      var storedEpoch = '', storedSeq = 0;
      try {
        storedEpoch = sessionStorage.getItem('tippaniNavEpoch') || '';
        storedSeq = Number(sessionStorage.getItem('tippaniNavSeq')) || 0;
      } catch (e) {}
      var cursor = navCursor(s.navEpoch, s.navSeq, storedEpoch, storedSeq);
      try {
        if (cursor.epoch) sessionStorage.setItem('tippaniNavEpoch', cursor.epoch);
        if (cursor.lastSeq !== storedSeq) sessionStorage.setItem('tippaniNavSeq', String(cursor.lastSeq));
      } catch (e) {}
      if (!cursor.shouldApply) return;
      try { sessionStorage.setItem('tippaniNavSeq', String(s.navSeq)); } catch (e) {}
      // Same-origin-only + don't clobber a deliberate same-path query deep-link
      // (e.g. ?edit=1) — both handled by navShouldNavigate. Navigate to the
      // RESOLVED same-origin target, never the raw navUrl.
      if (navShouldNavigate({ pathname: location.pathname, search: location.search, hash: location.hash }, s.navUrl, location.origin)) {
        var t = navTarget(s.navUrl, location.origin);
        if (t) location.href = t;
      }
    } catch (e) {}
  }
  setInterval(navPoll, 1500);
  navPoll();
})();
<\/script>`;

// --- File picker landing page ---
function buildPickerPage(pr, changedFiles, threads = []) {
  const prTitle = escHtml(pr.title || "Pull Request");
  const author = escHtml(pr.createdBy?.displayName || "Unknown");
  const prId = pr.pullRequestId;
  const descFull = escHtml(stripMarkdown(pr.description || "").trim());
  const openThreadCount = (threads || []).filter(
    (t) => (t.comments?.length || 0) > 0 && !(t.status === 2 || t.status === 4)).length;

  const fileCardsHtml = changedFiles
    .map((f, i) => {
      const fileName = f.path.split("/").pop();
      const parentPath = f.path.split("/").slice(0, -1).join("/") + "/";
      const badge = changeTypeBadge(f.changeType);
      const badgeClass = badge.color === "success" ? "badge-success" : "badge-accent";
      return `<a href="/file/${i}" class="file-card" onclick="document.body.classList.add('nav-loading')">
        <div class="file-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M4 1.5h5L12.5 5v9a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5Z"/><path d="M9 1.5V5h3.5"/></svg></div>
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
<title>Tippani — PR #${prId}</title>
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
.brand-text { font-size: 15px; font-weight: 600; color: var(--cp-text); }
.brand-text-sub { font-size: 13px; font-weight: 400; color: var(--cp-text-muted); }

.container { width: 100%; max-width: 720px; }

.pr-card { padding: 0; margin-bottom: 24px; text-align: center; }
.pr-card h1 { font-size: 19px; font-weight: 700; margin-bottom: 6px; text-align: center; }
.pr-meta { font-size: 13px; color: var(--cp-text-muted); display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; }
.pr-meta .pr-badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; background: var(--cp-accent-soft); color: var(--cp-accent); }
.pr-desc { margin-top: 10px; font-size: 13px; color: var(--cp-text-muted); line-height: 1.5; text-align: center; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pr-desc.expanded { -webkit-line-clamp: unset; overflow: visible; }
.pr-desc-toggle { margin-top: 4px; background: none; border: none; color: var(--cp-accent); cursor: pointer; font-size: 12px; font-weight: 600; }

.section-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--cp-text-muted); margin-bottom: 12px; }

.file-list { display: flex; flex-direction: column; gap: 6px; }

.file-card { display: flex; align-items: center; gap: 14px; padding: 11px 16px; background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 12px; text-decoration: none; color: var(--cp-text); transition: all 0.15s; cursor: pointer; }
.file-card:hover { background: var(--cp-accent-soft); border-color: var(--cp-accent); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.file-icon { flex-shrink: 0; display: flex; align-items: center; color: var(--cp-text-muted); }
.file-icon svg { width: 20px; height: 20px; }
.file-info { flex: 1; min-width: 0; }
.file-name { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-path { font-size: 12px; color: var(--cp-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 4px; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; flex-shrink: 0; }
.badge-accent { background: var(--cp-accent-soft); color: var(--cp-accent); }
.badge-success { background: rgba(22,163,74,0.1); color: var(--cp-success); }
/* Navigation loading bar: shown when opening a file (full-page nav). */
body.nav-loading { cursor: progress; }
body.nav-loading::after { content: ''; position: fixed; left: 0; top: 0; height: 2px; width: 100%; background: var(--cp-accent); transform-origin: left; animation: navLoad 1.4s ease-out forwards; z-index: 9999; }
@keyframes navLoad { 0% { transform: scaleX(0); } 55% { transform: scaleX(0.7); } 100% { transform: scaleX(0.96); } }

<\/style>
<script>
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme = 'dark';
<\/script>
</head>
<body>
  ${renderCrumbBar([{ label: "Home", href: "/discovery" }, { label: `PR #${prId}` }], { padTop: 48, padX: 24, right: renderBrand("read · annotate · edit") })}
  <div class="container">
    <div class="pr-card">
      <h1>${prTitle}</h1>
      <div class="pr-meta">
        <span class="pr-badge">PR #${prId}</span>
        <span>by ${author}</span>
        <span>· ${changedFiles.length} file${changedFiles.length !== 1 ? "s" : ""} changed</span>
      </div>
      ${descFull ? `<div class="pr-desc-wrap">
        <div class="pr-desc" id="prDesc">${descFull}</div>
        <button type="button" class="pr-desc-toggle" id="prDescToggle" hidden>Show more</button>
      </div>` : ""}
    </div>
    <div class="section-label">Feedback</div>
    <div class="file-list" style="margin-bottom: 24px;">
      <a href="/feedback" class="file-card">
        <div class="file-icon">💬</div>
        <div class="file-info">
          <div class="file-name">Review feedback</div>
          <div class="file-path">${openThreadCount} open thread${openThreadCount !== 1 ? "s" : ""} across this PR</div>
        </div>
        <span class="badge badge-accent">${openThreadCount}</span>
      </a>
    </div>
    <div class="section-label">Changed Files</div>
    <div class="file-list">
      ${fileCardsHtml}
    </div>
  </div>
  <script>
    (function () {
      var d = document.getElementById('prDesc'), b = document.getElementById('prDescToggle');
      if (!d || !b) return;
      if (d.scrollHeight - d.clientHeight > 2) {
        b.hidden = false;
        b.addEventListener('click', function () {
          var ex = d.classList.toggle('expanded');
          b.textContent = ex ? 'Show less' : 'Show more';
        });
      }
    })();
  <\/script>
${NAV_WATCHER}
</body>
</html>`;
}

// --- Cross-PR feedback triage page ---
// Lists every comment thread across the PR on one screen (no file drill-in),
// with a "waiting on" badge computed from the last commenter vs the PR author.
// Classify a thread for triage. Single source of truth shared by the Feedback
// page and the /api/v1/triage summary so chat counts match the page exactly.
// Precedence: Resolved (ADO) > Viewed (ack) > FYI (system) > needs-you > awaiting-reviewer.
function classifyThread(t, authorName, viewedMap = {}) {
  const comments = t.comments || [];
  const resolved = t.status === 2 || t.status === 4;
  const system = comments.length > 0 && comments.every((c) => c.commentType === 3);
  const last = comments[comments.length - 1];
  const lastBy = last?.author?.displayName || "Unknown";
  const lastId = comments.reduce((m, c) => Math.max(m, c.id || 0), 0);
  const viewedId = viewedMap[String(t.id)];
  const viewed = viewedId != null && Number(viewedId) === lastId;
  let waiting;
  if (resolved) waiting = "resolved";
  else if (viewed) waiting = "viewed";
  else if (system) waiting = "fyi";
  else if (lastBy !== authorName) waiting = "you";
  else waiting = "reviewer";
  return { resolved, system, lastBy, lastId, viewed, waiting };
}

function buildFeedbackPage(pr, threads, changedFiles, viewedMap = {}, viewedError = null) {
  const prId = pr.pullRequestId;
  const prTitle = escHtml(pr.title || "Pull Request");
  const author = pr.createdBy?.displayName || "";
  const fileIndexOf = (path) => (changedFiles || []).findIndex((f) => f.path === path);

  const rows = (threads || [])
    .filter((t) => (t.comments?.length || 0) > 0)
    .map((t) => {
      const comments = t.comments || [];
      const file = t.threadContext?.filePath || null;
      const line = t.threadContext?.rightFileStart?.line || null;
      const last = comments[comments.length - 1];
      const { resolved, waiting, lastBy } = classifyThread(t, author, viewedMap);
      const gist = stripMarkdown((last?.content || "").replace(/\s+/g, " ")).slice(0, 180);
      const idx = file ? fileIndexOf(file) : -1;
      const anchor = file ? `${file.split("/").pop()}${line ? ":" + line : ""}` : "PR-level";
      const reviewers = [...new Set(comments.map((c) => c.author?.displayName).filter(Boolean))];
      return { id: t.id, resolved, lastBy, waiting, gist, idx, anchor, comments, count: comments.length, file: file || null, reviewers };
    });

  const rank = (w) => (w === "you" ? 0 : w === "reviewer" ? 1 : w === "viewed" ? 2 : w === "fyi" ? 3 : 4);
  rows.sort((a, b) => rank(a.waiting) - rank(b.waiting) || (a.anchor > b.anchor ? 1 : a.anchor < b.anchor ? -1 : 0));

  const stateLabels = { you: "Needs you", reviewer: "Awaiting reviewer", viewed: "Viewed", fyi: "FYI", resolved: "Resolved" };
  const allReviewers = [...new Set(rows.flatMap((r) => r.reviewers || []))].sort();
  const allFiles = [...new Set(rows.map((r) => r.file).filter(Boolean))].sort();
  const openCount = rows.filter((r) => !r.resolved && r.waiting !== "fyi").length;  const needCount = rows.filter((r) => r.waiting === "you").length;

  const badgeFor = (w) =>
    w === "you" ? '<span class="fb-badge fb-need">Needs your reply</span>'
      : w === "reviewer" ? '<span class="fb-badge fb-wait">Awaiting reviewer</span>'
      : w === "viewed" ? '<span class="fb-badge fb-viewed">Viewed</span>'
      : w === "fyi" ? '<span class="fb-badge fb-fyi">For your information</span>'
      : '<span class="fb-badge fb-done">Resolved</span>';

  const commentHtml = (c) =>
    `<div class="fb-comment">
      <div class="fb-comment-meta"><span class="fb-comment-author">${escHtml(c.author?.displayName || "Unknown")}</span><span class="fb-comment-date">${c.publishedDate ? new Date(c.publishedDate).toLocaleDateString() : ""}</span></div>
      <div class="fb-comment-body">${c.renderedContent || escHtml(c.content || "")}</div>
    </div>`;

  const cardsHtml = rows.map((r) => {
    const threadHtml = (r.comments || []).map(commentHtml).join("");
    const dataText = escHtml((r.gist + " " + (r.comments || []).map((c) => c.content || "").join(" ")).toLowerCase());
    const dataRev = escHtml((r.reviewers || []).join("|"));
    return `<div class="fb-card" data-state="${r.waiting}" data-file="${escHtml(r.file || "")}" data-reviewers="${dataRev}" data-text="${dataText}">
      <div class="fb-top"><span class="fb-anchor">${escHtml(r.anchor)}</span>${badgeFor(r.waiting)}<button type="button" class="fb-toggle" aria-expanded="false" onclick="toggleCard(this)">Expand</button></div>
      <div class="fb-gist">${escHtml(r.gist)}</div>
      <div class="fb-meta">last by ${escHtml(r.lastBy)} \u00b7 ${r.count} comment${r.count !== 1 ? "s" : ""}</div>
      <div class="fb-thread" hidden>
        ${threadHtml}
        <a class="fb-open" href="/goto/thread/${r.id}">Open thread &rarr;</a>
      </div>
    </div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tippani — PR #${prId} — Feedback</title>
<style>
${cssVariables()}
* { margin: 0; padding: 0; box-sizing: border-box; }
html { height: 100%; }
body { font-family: "Segoe UI", Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif; background: var(--cp-bg); color: var(--cp-text); min-height: 100%; display: flex; flex-direction: column; align-items: center; padding: 48px 24px; }
.brand-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
.logo { width: 32px; height: 32px; border-radius: 8px; background: var(--cp-accent); display: flex; align-items: center; justify-content: center; color: var(--cp-accent-fg); font-size: 12px; font-weight: 700; }
.brand-text { font-size: 15px; font-weight: 600; }
.brand-text-sub { font-size: 13px; font-weight: 400; color: var(--cp-text-muted); }
.container { width: 100%; max-width: 760px; }
.fb-head { display: flex; align-items: baseline; justify-content: center; margin-bottom: 6px; }
.fb-head h1 { font-size: 19px; font-weight: 700; }
.back { font-size: 13px; color: var(--cp-accent); text-decoration: none; }
.fb-sub { font-size: 13px; color: var(--cp-text-muted); margin-bottom: 20px; text-align: center; }
.fb-list { display: flex; flex-direction: column; gap: 8px; }
.fb-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
.fb-chip-group { display: inline-flex; gap: 4px; flex-wrap: wrap; }
.fb-chip { font-size: 12px; display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border: 1px solid var(--cp-border); border-radius: 99px; background: var(--cp-surface); cursor: pointer; }
.fb-filters select, .fb-filters input { font-family: inherit; font-size: 12px; padding: 5px 9px; border: 1px solid var(--cp-border); border-radius: 8px; background: var(--cp-surface); color: var(--cp-text); }
.fb-filters input[type=search] { flex: 1; min-width: 140px; }
.fb-card { display: block; padding: 14px 18px; background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 12px; text-decoration: none; color: var(--cp-text); transition: all 0.15s; }
.fb-card:hover { border-color: var(--cp-accent); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.fb-static { cursor: default; opacity: 0.85; }
.fb-top { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.fb-anchor { font-size: 13px; font-weight: 600; color: var(--cp-text-soft); }
.fb-badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; }
.fb-need { background: rgba(220,38,38,0.12); color: #dc2626; }
.fb-wait { background: var(--cp-accent-soft); color: var(--cp-accent); }
.fb-viewed { background: var(--cp-border); color: var(--cp-text-muted); }
.fb-fyi { background: rgba(100,116,139,0.14); color: var(--cp-text-muted); }
.fb-done { background: rgba(22,163,74,0.1); color: var(--cp-success); }
.fb-gist { font-size: 13px; color: var(--cp-text); line-height: 1.45; }
.fb-meta { font-size: 12px; color: var(--cp-text-muted); margin-top: 6px; }
.fb-toggle { margin-left: auto; background: none; border: none; padding: 0; font-family: inherit; font-size: 12px; font-weight: 600; color: var(--cp-text-muted); cursor: pointer; white-space: nowrap; }
.fb-toggle:hover { text-decoration: underline; }
.fb-thread { margin-top: 12px; border-top: 1px solid var(--cp-border); padding-top: 12px; display: flex; flex-direction: column; gap: 12px; }
.fb-thread[hidden] { display: none; }
.fb-comment-meta { display: flex; gap: 8px; align-items: baseline; margin-bottom: 4px; }
.fb-comment-author { font-size: 12px; font-weight: 600; }
.fb-comment-date { font-size: 11px; color: var(--cp-text-muted); }
.fb-comment-body { font-size: 13px; line-height: 1.5; color: var(--cp-text); }
.fb-comment-body p { margin: 0 0 6px; }
.fb-comment-body p:last-child { margin-bottom: 0; }
.fb-open { align-self: flex-start; font-size: 12px; color: var(--cp-accent); text-decoration: none; font-weight: 600; }
.fb-empty { font-size: 14px; color: var(--cp-text-muted); padding: 24px; text-align: center; }
<\/style>
<script>
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme = 'dark';
  function toggleCard(btn) {
    const card = btn.closest('.fb-card');
    const body = card && card.querySelector('.fb-thread');
    if (!body) return;
    const willOpen = body.hasAttribute('hidden');
    if (willOpen) { body.removeAttribute('hidden'); btn.textContent = 'Collapse'; btn.setAttribute('aria-expanded', 'true'); }
    else { body.setAttribute('hidden', ''); btn.textContent = 'Expand'; btn.setAttribute('aria-expanded', 'false'); }
  }
  // Item 5: filter the feedback cards (state / reviewer / file / text). Same
  // shape the set_feedback_filter MCP tool pushes; persisted to localStorage.
  function applyFeedbackFilter() {
    const states = Array.from(document.querySelectorAll('.fb-chip input:checked')).map((c) => c.value);
    const reviewer = (document.getElementById('fbReviewer') || {}).value || '';
    const file = (document.getElementById('fbFile') || {}).value || '';
    const q = ((document.getElementById('fbSearch') || {}).value || '').toLowerCase();
    document.querySelectorAll('.fb-card').forEach((card) => {
      const revs = (card.dataset.reviewers || '').split('|').filter(Boolean);
      const ok = (!states.length || states.includes(card.dataset.state))
        && (!reviewer || revs.includes(reviewer))
        && (!file || card.dataset.file === file)
        && (!q || (card.dataset.text || '').includes(q));
      card.style.display = ok ? '' : 'none';
    });
    try { localStorage.setItem('fbFilter', JSON.stringify({ states, reviewer, file, query: q })); } catch (e) {}
  }
  function setFeedbackFilterUI(f) {
    if (!f) f = { states: ['you','reviewer','viewed','fyi','resolved'], reviewer: '', file: '', query: '' };
    if (Array.isArray(f.states)) document.querySelectorAll('.fb-chip input').forEach((c) => { c.checked = f.states.length ? f.states.includes(c.value) : true; });
    if (document.getElementById('fbReviewer')) document.getElementById('fbReviewer').value = f.reviewer || '';
    if (document.getElementById('fbFile')) document.getElementById('fbFile').value = f.file || '';
    if (document.getElementById('fbSearch')) document.getElementById('fbSearch').value = f.query || '';
    applyFeedbackFilter();
  }
  (function () { try { const s = localStorage.getItem('fbFilter'); if (s) setFeedbackFilterUI(JSON.parse(s)); } catch (e) {} })();
  (function () { let lastSeq = -1; async function poll() { try { const r = await fetch('/api/v1/state'); if (r.ok) { const s = await r.json(); if (typeof s.filterSeq === 'number' && s.filterSeq !== lastSeq) { lastSeq = s.filterSeq; setFeedbackFilterUI(s.filter); } } } catch (e) {} } setInterval(poll, 1500); poll(); })();
<\/script>
</head>
<body>
  ${renderCrumbBar([{ label: "Home", href: "/discovery" }, { label: `PR #${prId}`, href: "/" }, { label: "Feedback" }], { padTop: 48, padX: 24, right: renderBrand("feedback") })}
  <div class="container">
    <div class="fb-head">
      <h1>Feedback — ${prTitle}</h1>
    </div>
    <div class="fb-sub">PR #${prId} · ${openCount} open thread${openCount !== 1 ? "s" : ""}${needCount ? ` · ${needCount} need${needCount !== 1 ? "" : "s"} your reply` : ""}</div>
    ${viewedWarning(viewedError)}
    <div class="fb-filters" id="fbFilters">
      <span class="fb-chip-group">${["you","reviewer","viewed","fyi","resolved"].map((s) => `<label class="fb-chip"><input type="checkbox" value="${s}" checked onchange="applyFeedbackFilter()">${escHtml(stateLabels[s])}</label>`).join("")}</span>
      <select id="fbReviewer" onchange="applyFeedbackFilter()"><option value="">All reviewers</option>${allReviewers.map((r) => `<option value="${escHtml(r)}">${escHtml(r)}</option>`).join("")}</select>
      <select id="fbFile" onchange="applyFeedbackFilter()"><option value="">All files</option>${allFiles.map((f) => `<option value="${escHtml(f)}">${escHtml(f.split("/").pop())}</option>`).join("")}</select>
      <input id="fbSearch" type="search" placeholder="Search\u2026" oninput="applyFeedbackFilter()">
    </div>
    <div class="fb-list">
      ${cardsHtml || '<div class="fb-empty">No comment threads on this PR.</div>'}
    </div>
  </div>
${NAV_WATCHER}
</body>
</html>`;
}

// --- Pull-request list page (item 6) — tiles + client-side title/author filter.
function buildPrListPage(prs, project) {
  const list = prs || [];
  const statusLabel = prStatusLabel;
  const rows = list.map((pr) => `<div class="pr-card" data-title="${escHtml((pr.title || "").toLowerCase())}" data-author="${escHtml((pr.author || "").toLowerCase())}">
      <div class="pr-top"><span class="pr-id">#${pr.id}</span><span class="pr-status">${statusLabel(pr.status)}</span>${pr.isDraft ? '<span class="pr-draft">Draft</span>' : ""}</div>
      <div class="pr-title">${escHtml(pr.title || "")}</div>
      <div class="pr-meta">${escHtml(pr.author || "")} \u00b7 ${escHtml(pr.source || "")} \u2192 ${escHtml(pr.target || "")}${pr.repo ? " \u00b7 " + escHtml(pr.repo) : ""}</div>
      <div class="pr-actions">${pr.webUrl ? `<a class="pr-open" href="${pr.webUrl}" target="_blank" rel="noopener">Open PR \u2197</a>` : ""}</div>
    </div>`).join("\n");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tippani \u2014 Pull Requests</title>
<style>
${cssVariables()}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: "Segoe UI", Aptos, Calibri, -apple-system, sans-serif; background: var(--cp-bg); color: var(--cp-text); padding: 40px 24px; display: flex; flex-direction: column; align-items: center; }
.container { width: 100%; max-width: 820px; }
.brand-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
.logo { width: 32px; height: 32px; border-radius: 8px; background: var(--cp-accent); display: flex; align-items: center; justify-content: center; color: var(--cp-accent-fg); font-weight: 700; font-size: 12px; }
h1 { font-size: 19px; font-weight: 700; margin-bottom: 4px; text-align: center; }
.sub { font-size: 13px; color: var(--cp-text-muted); margin-bottom: 16px; text-align: center; }
.filters { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.filters input { font-family: inherit; font-size: 13px; padding: 6px 10px; border: 1px solid var(--cp-border); border-radius: 8px; background: var(--cp-surface); color: var(--cp-text); flex: 1; min-width: 200px; }
.pr-list { display: flex; flex-direction: column; gap: 8px; }
.pr-card { padding: 14px 18px; background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 12px; }
.pr-card:hover { border-color: var(--cp-accent); }
.pr-top { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; }
.pr-id { font-size: 13px; font-weight: 700; color: var(--cp-accent); }
.pr-status { font-size: 11px; color: var(--cp-text-muted); }
.pr-draft { font-size: 11px; background: var(--cp-border); padding: 1px 7px; border-radius: 99px; }
.pr-title { font-size: 15px; font-weight: 600; line-height: 1.35; }
.pr-meta { font-size: 12px; color: var(--cp-text-muted); margin-top: 4px; }
.pr-actions { margin-top: 8px; display: flex; gap: 14px; }
.pr-open { font-size: 12px; font-weight: 600; color: var(--cp-accent); text-decoration: none; }
.empty { font-size: 14px; color: var(--cp-text-muted); padding: 24px; text-align: center; }
<\/style>
<script>
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme = 'dark';
  function applyPrFilter() {
    const q = (document.getElementById('prSearch').value || '').toLowerCase();
    document.querySelectorAll('.pr-card').forEach((c) => {
      const hit = !q || c.dataset.title.includes(q) || c.dataset.author.includes(q);
      c.style.display = hit ? '' : 'none';
    });
  }
<\/script></head><body>
  ${renderCrumbBar([{ label: "Home", href: "/discovery" }, { label: "Pull requests" }], { padTop: 40, padX: 24, right: renderBrand("pull requests") })}
  <div class="container">
    <h1>Pull requests</h1>
    <div class="sub">${list.length} PR${list.length !== 1 ? "s" : ""}</div>
    <div class="filters"><input id="prSearch" type="search" placeholder="Filter by title or author\u2026" oninput="applyPrFilter()"></div>
    <div class="pr-list">${rows || '<div class="empty">No pull requests found.</div>'}</div>
  </div>
${NAV_WATCHER}
</body></html>`;
}

// Discovery home: the review queue — specs I'm authoring + reviewing, role-
// tagged, whose cards open the PR INSIDE Tippani (/open/:id re-drive) rather
// than linking out to ADO. Built on buildPrListPage's styling; later Discovery
// slices add the work-item and spec-tree panes to this page.
function buildHomePage(
  prs,
  project,
  projects,
  branchPlaceholder = "mybranch",
  discoveryError = "",
  hostKind = "ado",
) {
  const isGitHub = hostKind === "github";
  const list = prs || [];
  const projectNames = (projects && projects.length ? projects : [project].filter(Boolean));
  const projectOptions = projectNames.map((p) =>
    `<option value="${escHtml(p)}"${p === project ? " selected" : ""}>${escHtml(p)}</option>`).join("");
  const statusLabel = prStatusLabel;
  const roleBadge = (roles) => (roles || []).map((r) =>
    `<span class="pr-role pr-role-${r}">${r === "author" ? "Authoring" : "Reviewing"}</span>`).join("");
  const rows = list.map((pr) => {
    const activity = (pr.roles || []).map((r) => r === "author" ? "authoring" : "reviewing").join(" ");
    const status = pr.isDraft ? "draft" : "published";
    const openHref = isGitHub
      ? `/open/${pr.id}?owner=${encodeURIComponent(pr.project || project || "")}&repo=${encodeURIComponent(pr.repo || "")}`
      : `/open/${pr.id}`;
    return `<a class="pr-card" href="${escHtml(openHref)}" data-author="${escHtml(pr.author || "")}" data-project="${escHtml(pr.project || "(none)")}" data-activity="${activity}" data-status="${status}" data-search="${escHtml(((pr.title || "") + " " + (pr.author || "")).toLowerCase())}">
      <div class="pr-top"><span class="pr-id">#${pr.id}</span><span class="pr-status">${statusLabel(pr.status)}</span>${pr.isDraft ? '<span class="pr-draft">Draft</span>' : ""}${roleBadge(pr.roles)}${pr.isDraft ? `<button type="button" class="pr-publish-btn" data-pr-id="${pr.id}" data-project="${escHtml(pr.project || "")}" data-repo="${escHtml(pr.repo || "")}" data-title="${escHtml(pr.title || "")}">Publish PR</button>` : ""}</div>
      <div class="pr-title">${escHtml(pr.title || "")}</div>
      <div class="pr-meta">${escHtml(pr.author || "")} \u00b7 ${escHtml(pr.source || "")} \u2192 ${escHtml(pr.target || "")}${pr.repo ? " \u00b7 " + escHtml(pr.repo) : ""}${pr.project ? " \u00b7 " + escHtml(pr.project) : ""}</div>
    </a>`;
  }).join("\n");
  const sampleWiql = "SELECT [System.Id], [System.Title], [System.State]\nFROM workitems\nWHERE [System.WorkItemType] = 'Feature' AND [System.CreatedDate] >= @today - 30 AND [System.AssignedTo] = @Me\nORDER BY [System.CreatedDate] DESC";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tippani \u2014 Discovery</title>
<style>
${cssVariables()}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: "Segoe UI", Aptos, Calibri, -apple-system, sans-serif; background: var(--cp-bg); color: var(--cp-text); padding: 40px 24px; display: flex; flex-direction: column; align-items: center; }
.container { width: 100%; max-width: 820px; }
.brand-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
.logo { width: 32px; height: 32px; border-radius: 8px; background: var(--cp-accent); display: flex; align-items: center; justify-content: center; color: var(--cp-accent-fg); font-weight: 700; font-size: 12px; }
h1 { font-size: 19px; font-weight: 700; margin-bottom: 4px; text-align: center; }
.sub { font-size: 13px; color: var(--cp-text-muted); margin-bottom: 16px; text-align: center; }
.tabs { display: flex; justify-content: center; gap: 2px; border-bottom: 1px solid var(--cp-border); margin: 14px 0 18px; }
.tab { padding: 8px 16px; font-family: inherit; font-size: 13px; font-weight: 600; color: var(--cp-text-muted); background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; }
.tab:hover { color: var(--cp-text); }
.tab.active { color: var(--cp-accent); border-bottom-color: var(--cp-accent); }
.pane { display: none; }
.pane.active { display: block; }
.filters { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.filters input { font-family: inherit; font-size: 13px; padding: 6px 10px; border: 1px solid var(--cp-border); border-radius: 8px; background: var(--cp-surface); color: var(--cp-text); flex: 1; min-width: 200px; }
.pr-list { display: flex; flex-direction: column; gap: 8px; }
.pr-card { display: block; text-decoration: none; color: inherit; padding: 14px 18px; background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 12px; cursor: pointer; }
.pr-card:hover { border-color: var(--cp-accent); }
.pr-top { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; }
.pr-id { font-size: 13px; font-weight: 700; color: var(--cp-accent); }
.pr-status { font-size: 11px; color: var(--cp-text-muted); }
.pr-draft { font-size: 11px; background: var(--cp-border); padding: 1px 7px; border-radius: 99px; }
.pr-role { font-size: 10px; font-weight: 700; padding: 1px 8px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.3px; }
.pr-role-author { background: var(--cp-accent-soft); color: var(--cp-accent); }
.pr-role-reviewer { background: var(--cp-border); color: var(--cp-text-muted); }
.pr-title { font-size: 15px; font-weight: 600; line-height: 1.35; }
.pr-meta { font-size: 12px; color: var(--cp-text-muted); margin-top: 4px; }
.empty { font-size: 14px; color: var(--cp-text-muted); padding: 24px; text-align: center; }
.wi-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.wi-label { font-size: 12px; font-weight: 700; color: var(--cp-text); }
.wi-project { font-family: inherit; font-size: 13px; padding: 6px 10px; border: 1px solid var(--cp-border); border-radius: 8px; background: var(--cp-surface); color: var(--cp-text); }
.wi-note { font-size: 12px; color: var(--cp-text-muted); }
.wi-query { width: 100%; min-height: 128px; font-family: Consolas, "Courier New", monospace; font-size: 13px; line-height: 1.5; color: #d4d4d4; background: #1e1e1e; border: 1px solid var(--cp-border); border-radius: 10px; padding: 12px 14px; resize: vertical; }
.wi-actions { display: flex; justify-content: flex-end; align-items: center; gap: 12px; margin: 10px 0 6px; }
.wi-status { font-size: 12px; color: var(--cp-text-muted); }
.wi-search { font-family: inherit; font-size: 13px; font-weight: 700; color: var(--cp-accent-fg); background: var(--cp-accent); border: none; border-radius: 8px; padding: 8px 20px; cursor: pointer; }
.wi-search:hover { background: var(--cp-accent-hover, var(--cp-accent)); }
table.wi-results { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
.wi-results th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; color: var(--cp-text-muted); padding: 6px 8px; border-bottom: 1px solid var(--cp-border); }
.wi-results td { padding: 8px; border-bottom: 1px solid var(--cp-border); vertical-align: top; overflow: hidden; }
.wi-results tr:hover td { background: var(--cp-surface); }
.wi-results th:nth-child(1), .wi-results td:nth-child(1) { width: 74px; }
.wi-results th:nth-child(3), .wi-results td:nth-child(3) { width: 96px; }
.wi-results th:nth-child(4), .wi-results td:nth-child(4) { width: 82px; }
.wi-results th:nth-child(5), .wi-results td:nth-child(5) { width: 132px; }
.wi-results th:nth-child(6), .wi-results td:nth-child(6) { width: 32px; text-align: center; }
.wi-title, .wi-asg { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wi-id { font-weight: 700; color: var(--cp-accent); white-space: nowrap; }
.wi-open { color: var(--cp-accent); text-decoration: none; font-weight: 700; }
.br-modes { display: inline-flex; gap: 2px; margin-bottom: 16px; border: 1px solid var(--cp-border); border-radius: 8px; padding: 2px; }
.br-mode-btn { font-family: inherit; font-size: 13px; font-weight: 600; padding: 6px 18px; border: none; background: none; color: var(--cp-text-muted); border-radius: 6px; cursor: pointer; }
.br-mode-btn.active { background: var(--cp-accent); color: var(--cp-accent-fg); }
.br-local-input { flex: 1; min-width: 0; font-family: inherit; font-size: 13px; padding: 8px 12px; border: none; border-radius: 8px; background: transparent; color: var(--cp-text); outline: none; }
.br-create-input { font-family: inherit; font-size: 13px; padding: 6px 10px; border: 1px solid var(--cp-border); border-radius: 8px; background: var(--cp-surface); color: var(--cp-text); flex: 1 1 140px; min-width: 120px; outline: none; }
.br-create-row { flex-wrap: wrap; gap: 12px; align-items: flex-end; }
.br-new-row { display: flex; justify-content: flex-end; margin-top: 4px; }
.br-new-btn { font-family: inherit; font-size: 13px; font-weight: 600; color: var(--cp-accent); background: none; border: 1px dashed var(--cp-border); border-radius: 8px; padding: 6px 12px; cursor: pointer; }
.br-new-btn:hover { border-color: var(--cp-accent); }
.br-cancel-btn { font-family: inherit; font-size: 13px; color: var(--cp-text-muted); background: none; border: none; cursor: pointer; }
.br-field { display: flex; flex-direction: column; gap: 4px; flex: 1 1 160px; min-width: 130px; }
.br-field > label { font-size: 11px; font-weight: 600; color: var(--cp-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.br-field > select, .br-field > input { width: 100%; box-sizing: border-box; height: 32px; flex: none; }
.br-create-row .wi-search { height: 32px; padding: 0 16px; }
.br-create-panel { margin-top: 10px; }
.pr-create-panel { margin: 10px 0 16px; padding: 14px; border: 1px solid var(--cp-border); border-radius: 8px; background: var(--cp-surface); }
.pr-create-panel .wi-row { margin-bottom: 12px; }
.pr-create-panel .wi-row:last-of-type { margin-bottom: 8px; }
.pr-create-panel textarea { width: 100%; min-height: 76px; resize: vertical; }
.pr-create-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.pr-draft-toggle { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--cp-text); margin-right: auto; }
.pr-draft-toggle input { accent-color: var(--cp-accent); }
.pr-staged-card { opacity: 0.72; border-style: dashed; }
.br-staged-card { opacity: 0.72; border-style: dashed; display: flex; align-items: center; gap: 8px; }
.br-staged-link { flex: 1 1 auto; min-width: 0; text-decoration: none; color: inherit; }
.br-staged-del { flex: 0 0 auto; background: none; border: none; cursor: pointer; font-size: 18px; line-height: 1; padding: 4px 8px; border-radius: 6px; opacity: 0.8; }
.br-staged-del:hover { opacity: 1; background: var(--cp-border); }
.pr-staged-del { margin-left: auto; }
.pr-publish-btn { margin-left: auto; flex: 0 0 auto; font-family: inherit; font-size: 11px; font-weight: 600; padding: 2px 10px; border-radius: 99px; border: 1px solid var(--cp-accent); background: var(--cp-accent); color: var(--cp-accent-fg); cursor: pointer; }
.pr-publish-btn:hover { filter: brightness(1.08); }
.pr-publish-btn.pr-publish-staged { background: transparent; color: var(--cp-accent); }
.br-staged-badge { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: var(--cp-text-muted); background: var(--cp-border); padding: 1px 8px; border-radius: 99px; margin-left: 8px; }
.br-ws-field { flex: 1; display: flex; align-items: center; border: 1px solid var(--cp-border); border-radius: 8px; background: var(--cp-surface); }
.br-ws-field:focus-within { border-color: var(--cp-accent); }
.br-ws-clear { flex: 0 0 auto; border: none; background: none; color: var(--cp-text-muted); font-size: 16px; line-height: 1; cursor: pointer; padding: 0 10px; }
.br-ws-clear:hover { color: var(--cp-text); }
.br-current { font-size: 10px; font-weight: 700; padding: 1px 8px; border-radius: 99px; background: var(--cp-accent-soft); color: var(--cp-accent); text-transform: uppercase; letter-spacing: 0.3px; margin-left: 8px; }
.sp-searchrow { display: flex; gap: 10px; margin-bottom: 8px; }
.sp-query { flex: 1; font-family: inherit; font-size: 13px; padding: 8px 12px; border: 1px solid var(--cp-border); border-radius: 8px; background: var(--cp-surface); color: var(--cp-text); }
.sp-layout { display: flex; gap: 20px; align-items: flex-start; }
.sp-facets { flex: 0 0 157px; width: 157px; min-width: 0; position: sticky; top: 20px; }
.sp-layout .pr-list { flex: 1; min-width: 0; }
.sp-layout .pr-meta { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.q-search { margin-bottom: 14px; }
.q-search input { width: 100%; font-family: inherit; font-size: 13px; padding: 8px 12px; border: 1px solid var(--cp-border); border-radius: 8px; background: var(--cp-surface); color: var(--cp-text); }
.facet { position: relative; }
.facet + .facet { margin-top: 18px; }
.facet-title { display: flex; align-items: center; gap: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; color: var(--cp-text-muted); font-weight: 700; margin-bottom: 8px; }
.facet-title-text { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; }
.facet-menu-btn { flex: 0 0 auto; font-size: 14px; line-height: 1; padding: 0 4px; border: none; background: none; color: var(--cp-text-muted); cursor: pointer; border-radius: 4px; }
.facet-menu-btn:hover { background: var(--cp-surface-soft); color: var(--cp-text); }
.facet-menu { position: absolute; right: 0; top: 16px; z-index: 5; display: none; background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,0.14); padding: 4px; min-width: 122px; }
.facet-menu.open { display: block; }
.facet-menu-item { display: block; width: 100%; text-align: left; font-family: inherit; font-size: 12px; text-transform: none; letter-spacing: 0; font-weight: 500; color: var(--cp-text); background: none; border: none; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
.facet-menu-item:hover { background: var(--cp-surface-soft); }
.facet-list { }
.facet-pager { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 8px; }
.facet-pager button { font-family: inherit; font-size: 14px; line-height: 1; padding: 1px 8px; border: 1px solid var(--cp-border); border-radius: 6px; background: var(--cp-surface); color: var(--cp-text); cursor: pointer; }
.facet-pager button:disabled { opacity: 0.4; cursor: default; }
.facet-pageinfo { font-size: 11px; color: var(--cp-text-muted); }
.facet-opt { display: flex; align-items: center; gap: 8px; font-size: 12.5px; height: 26px; color: var(--cp-text); cursor: pointer; }
.facet-opt input { accent-color: var(--cp-accent); width: 14px; height: 14px; flex: 0 0 auto; }
.facet-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.facet-count { flex: 0 0 auto; color: var(--cp-text-muted); font-size: 11px; }
<\/style>
<script>
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme = 'dark';
  var HAS_WORK_ITEMS = ${isGitHub ? "false" : "true"};
  // Reusable client-side faceted filter. Wraps a .pr-list in a slicer panel and
  // cross-filters: each facet's available values reflect the cards passing the
  // OTHER facets. Persists selections in localStorage. defs: [{ title, key,
  // checkedDefault, fixed?:[[label,value]], fill?, getValues?(el) }].
  function mountFacets(listEl, defs, storageKey, onUpdate, searchOpt) {
    if (!listEl || !listEl.querySelector('.pr-card')) return;
    var FACET_PAGE = 6;
    function trunc(t) { t = String(t); return t.length > 12 ? t.slice(0, 12) + '\u2026' : t; }
    function valuesOf(el, d) { return d.getValues ? d.getValues(el) : (el.dataset[d.key] ? [el.dataset[d.key]] : []); }
    var cards = Array.prototype.slice.call(listEl.querySelectorAll('.pr-card')).map(function (el) {
      var vals = {}; defs.forEach(function (d) { vals[d.key] = valuesOf(el, d); }); return { el: el, vals: vals };
    });
    var prefs = {}; try { prefs = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch (e) { prefs = {}; }
    function isChecked(d, value) { var dev = prefs[d.key] && prefs[d.key][value]; return dev ? !d.checkedDefault : d.checkedDefault; }
    function optionsFor(d) {
      if (d.fixed) return d.fixed.slice();
      var set = {}; cards.forEach(function (c) { c.vals[d.key].forEach(function (v) { set[v] = 1; }); });
      return Object.keys(set).sort().map(function (v) { return [v, v]; });
    }
    var asideHtml = '<aside class="sp-facets">';
    defs.forEach(function (d) {
      var opts = optionsFor(d);
      var menu = opts.length >= 3 ? '<button class="facet-menu-btn" type="button" aria-label="Options">\u22ef</button><div class="facet-menu"><button class="facet-menu-item" type="button" data-act="all">Select all</button><button class="facet-menu-item" type="button" data-act="none">Deselect all</button></div>' : '';
      var paged = !d.fixed && !d.fill && opts.length > FACET_PAGE;
      asideHtml += '<div class="facet' + (d.fill ? ' facet--fill' : '') + '" data-cls="' + esc(d.key) + '"><div class="facet-title"><span class="facet-title-text">' + esc(d.title) + '</span>' + menu + '</div><div class="facet-list' + (d.fill ? ' facet-list--fill' : '') + '">';
      opts.forEach(function (o) {
        asideHtml += '<label class="facet-opt"><input type="checkbox" data-fkey="' + esc(d.key) + '" value="' + esc(o[1]) + '"' + (isChecked(d, o[1]) ? ' checked' : '') + '><span class="facet-name" title="' + esc(o[0]) + '">' + esc(trunc(o[0])) + '</span><span class="facet-count">0</span></label>';
      });
      asideHtml += '</div>';
      if (paged) asideHtml += '<div class="facet-pager"><button class="facet-prev" type="button">\u2039</button><span class="facet-pageinfo"></span><button class="facet-next" type="button">\u203a</button></div>';
      asideHtml += '</div>';
    });
    asideHtml += '</aside>';
    var layout = document.createElement('div'); layout.className = 'sp-layout';
    listEl.parentNode.insertBefore(layout, listEl);
    layout.innerHTML = asideHtml;
    layout.appendChild(listEl);
    var container = layout, pageState = {};
    // The text filter is COMMITTED only on Search click / Enter (not while
    // typing); slicer toggles keep using the last committed query.
    var searchQuery = (searchOpt && searchOpt.input) ? (searchOpt.input.value || '').toLowerCase().trim() : '';
    function checkedMap() { var m = {}; defs.forEach(function (d) { m[d.key] = {}; container.querySelectorAll('input[data-fkey="' + d.key + '"]:checked').forEach(function (cb) { m[d.key][cb.value] = 1; }); }); return m; }
    function passExcept(exceptKey, checked) {
      return function (c) {
        if (searchOpt && searchOpt.input && searchQuery) {
          if ((c.el.dataset[searchOpt.attr] || '').indexOf(searchQuery) < 0) return false;
        }
        for (var i = 0; i < defs.length; i++) {
          var d = defs[i]; if (d.key === exceptKey) continue;
          var vals = c.vals[d.key]; if (!vals.length) continue;
          var ok = false; for (var j = 0; j < vals.length; j++) { if (checked[d.key][vals[j]]) { ok = true; break; } }
          if (!ok) return false;
        }
        return true;
      };
    }
    function savePrefs() {
      defs.forEach(function (d) {
        prefs[d.key] = prefs[d.key] || {};
        container.querySelectorAll('input[data-fkey="' + d.key + '"]').forEach(function (cb) { if (cb.checked !== d.checkedDefault) prefs[d.key][cb.value] = 1; else delete prefs[d.key][cb.value]; });
      });
      try { localStorage.setItem(storageKey, JSON.stringify(prefs)); } catch (e) { }
    }
    function update() {
      var checked = checkedMap();
      defs.forEach(function (d) {
        var pass = passExcept(d.key, checked), counts = {};
        cards.forEach(function (c) { if (pass(c)) c.vals[d.key].forEach(function (v) { counts[v] = (counts[v] || 0) + 1; }); });
        var facet = container.querySelector('.facet[data-cls="' + d.key + '"]'), avail = [];
        facet.querySelectorAll('.facet-opt').forEach(function (row) {
          var v = row.querySelector('input').value, cnt = counts[v] || 0;
          row.querySelector('.facet-count').textContent = cnt;
          if (cnt > 0) avail.push(row); else row.style.display = 'none';
        });
        var pager = facet.querySelector('.facet-pager');
        if (!d.fixed && !d.fill && pager && avail.length > FACET_PAGE) {
          var pages = Math.ceil(avail.length / FACET_PAGE), pg = pageState[d.key] || 0;
          if (pg > pages - 1) pg = pages - 1; if (pg < 0) pg = 0; pageState[d.key] = pg;
          avail.forEach(function (row, i) { row.style.display = (i >= pg * FACET_PAGE && i < pg * FACET_PAGE + FACET_PAGE) ? '' : 'none'; });
          pager.style.display = '';
          pager.querySelector('.facet-pageinfo').textContent = (pg + 1) + ' / ' + pages;
          pager.querySelector('.facet-prev').disabled = pg === 0;
          pager.querySelector('.facet-next').disabled = pg === pages - 1;
        } else { avail.forEach(function (row) { row.style.display = ''; }); if (pager) pager.style.display = 'none'; }
      });
      var passAll = passExcept(null, checked), visible = 0;
      cards.forEach(function (c) { var ok = passAll(c); c.el.style.display = ok ? '' : 'none'; if (ok) visible++; });
      if (onUpdate) onUpdate(visible);
      savePrefs();
    }
    container.querySelectorAll('input[data-fkey]').forEach(function (cb) { cb.addEventListener('change', update); });
    container.querySelectorAll('.facet-pager').forEach(function (pager) {
      var key = pager.closest('.facet').dataset.cls;
      pager.querySelector('.facet-prev').addEventListener('click', function () { pageState[key] = Math.max(0, (pageState[key] || 0) - 1); update(); });
      pager.querySelector('.facet-next').addEventListener('click', function () { pageState[key] = (pageState[key] || 0) + 1; update(); });
    });
    container.querySelectorAll('.facet-menu-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); var menu = btn.parentNode.querySelector('.facet-menu'); var willOpen = !menu.classList.contains('open'); document.querySelectorAll('.facet-menu.open').forEach(function (m) { m.classList.remove('open'); }); if (willOpen) menu.classList.add('open'); });
    });
    container.querySelectorAll('.facet-menu-item').forEach(function (item) {
      item.addEventListener('click', function (e) { e.stopPropagation(); var facet = item.closest('.facet'); var on = item.dataset.act === 'all'; facet.querySelectorAll('input[type=checkbox]').forEach(function (cb) { cb.checked = on; }); item.closest('.facet-menu').classList.remove('open'); update(); });
    });
    if (!window.__facetMenuBound) { document.addEventListener('click', function () { document.querySelectorAll('.facet-menu.open').forEach(function (m) { m.classList.remove('open'); }); }); window.__facetMenuBound = true; }
    function commitSearch() { searchQuery = (searchOpt.input.value || '').toLowerCase().trim(); update(); }
    if (searchOpt && searchOpt.button) searchOpt.button.addEventListener('click', commitSearch);
    if (searchOpt && searchOpt.input) searchOpt.input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); commitSearch(); } });
    update();
  }
  function activateTab(name) {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.tab === name); });
    document.querySelectorAll('.pane').forEach(function (p) { p.classList.toggle('active', p.dataset.pane === name); });
    document.body.dataset.pane = name;
    try { localStorage.setItem('tippani.discoveryTab', name); } catch (e) {}
    try { var u = new URL(location.href); u.searchParams.set('tab', name); history.replaceState(null, '', u); } catch (e) {}
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  async function runWiql() {
    var wiql = document.getElementById('wiQuery').value;
    var project = document.getElementById('wiProject').value;
    var out = document.getElementById('wiResults');
    var status = document.getElementById('wiStatus');
    status.textContent = 'Searching\u2026'; out.innerHTML = '';
    try {
      var r = await fetch('/api/v1/workitems/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wiql: wiql, project: project }) });
      var d = await r.json();
      if (d.error) { status.textContent = d.error; return; }
      var items = d.workItems || [];
      status.textContent = items.length + ' result' + (items.length === 1 ? '' : 's');
      if (!items.length) { out.innerHTML = '<div class="empty">No work items matched.</div>'; return; }
      var h = '<div class="pr-list">';
      items.forEach(function (w) {
        var attrs = ' data-assigned="' + esc(w.assignedTo || '(unassigned)') + '" data-status="' + esc(w.state || '(none)') + '" data-type="' + esc(w.type || '(none)') + '"';
        var top = '<div class="pr-top"><span class="pr-id">#' + esc(w.id) + '</span><span class="pr-status">' + esc(w.type) + (w.state ? ' \u00b7 ' + esc(w.state) : '') + '</span></div>';
        var body = '<div class="pr-title">' + esc(w.title) + '</div><div class="pr-meta">' + esc(w.assignedTo) + '</div>';
        if (w.url) h += '<a class="pr-card" href="' + esc(w.url) + '" target="_blank" rel="noopener"' + attrs + '>' + top + body + '</a>';
        else h += '<div class="pr-card"' + attrs + '>' + top + body + '</div>';
      });
      h += '</div>';
      out.innerHTML = h;
      // Client-side slicers over the WIQL results (same faceted engine).
      mountFacets(
        out.querySelector('.pr-list'),
        [
          { title: 'Assigned To', key: 'assigned', checkedDefault: true },
          { title: 'Status', key: 'status', checkedDefault: true },
          { title: 'Type', key: 'type', checkedDefault: true }
        ],
        'tippani.wiFacetPrefs.v1',
        function (n) { status.textContent = n + ' result' + (n === 1 ? '' : 's'); }
      );
    } catch (e) { status.textContent = 'Search failed: ' + e.message; }
  }
  async function runSpecSearch() {
    var query = document.getElementById('spQuery').value;
    var project = document.getElementById('spProject').value;
    var out = document.getElementById('spResults');
    var status = document.getElementById('spStatus');
    // Keep the URL in sync so browser-back from a spec returns to these results.
    try { var u = new URL(location.href); u.searchParams.set('tab', 'specs'); if (query && query.trim()) u.searchParams.set('q', query); else u.searchParams.delete('q'); if (project) u.searchParams.set('project', project); history.replaceState(null, '', u); } catch (e) { }
    if (!query || !query.trim()) { status.textContent = ''; out.innerHTML = ''; return; }
    status.textContent = 'Searching\u2026'; out.innerHTML = '';
    try {
      var r = await fetch('/api/v1/specs/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: query, project: project, enrich: true }) });
      var d = await r.json();
      if (d.error) { status.textContent = d.error; return; }
      var items = d.specs || [];
      status.textContent = items.length + ' spec' + (items.length === 1 ? '' : 's');
      if (!items.length) { out.innerHTML = '<div class="empty">No specs matched.</div>'; return; }
      // Per-spec facet keys.
      function specFolder(p) { var segs = (p || '').split('/').filter(Boolean); return segs.length >= 2 ? segs[segs.length - 2] : '(root)'; }
      function specKind(name) { var n = (name || '').toLowerCase(); return n === 'readme.md' ? 'readme' : (n === 'index.md' ? 'index' : ''); }
      function trunc(t) { return t.length > 12 ? t.slice(0, 12) + '\u2026' : t; }
      var repoCounts = {}, authorCounts = {}, folderCounts = {}, readmeN = 0, indexN = 0;
      items.forEach(function (s) {
        var rp = s.repo || '(none)'; repoCounts[rp] = (repoCounts[rp] || 0) + 1;
        var au = s.lastModifiedBy || '(unknown)'; authorCounts[au] = (authorCounts[au] || 0) + 1;
        var fo = specFolder(s.path); folderCounts[fo] = (folderCounts[fo] || 0) + 1;
        var k = specKind(s.name); if (k === 'readme') readmeN++; else if (k === 'index') indexN++;
      });
      var FACET_PAGE = 6;
      // Remembered slicer selections — persist across searches and portal
      // restarts (localStorage, keyed to the portal origin). For the data
      // facets we store the DESELECTED values (default is checked); for Included
      // we store the SELECTED values (default is unchecked).
      var PREFS_KEY = 'tippani.specFacetPrefs.v1';
      var prefs = {};
      try { prefs = JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { prefs = {}; }
      function prefChecked(cls, value) {
        if (cls === 'facet-inc') return !!(prefs['facet-inc'] && prefs['facet-inc'][value]);
        return !(prefs[cls] && prefs[cls][value]); // checked unless remembered OFF
      }
      function savePrefs() {
        // Merge: update only values present in this search; preserve prefs for
        // values from other searches so they're remembered when they reappear.
        ['facet-repo', 'facet-author', 'facet-folder'].forEach(function (cls) {
          prefs[cls] = prefs[cls] || {};
          out.querySelectorAll('.' + cls).forEach(function (cb) { if (!cb.checked) prefs[cls][cb.value] = 1; else delete prefs[cls][cb.value]; });
        });
        prefs['facet-inc'] = prefs['facet-inc'] || {};
        out.querySelectorAll('.facet-inc').forEach(function (cb) { if (cb.checked) prefs['facet-inc'][cb.value] = 1; else delete prefs['facet-inc'][cb.value]; });
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { }
      }
      // A facet box: max 6 rows per page; extra rows paginate. checkedDefault
      // controls the initial checkbox state (Included defaults OFF to exclude).
      // fill=true: no pager, the box shows its full list (the page scrolls).
      function facetGroup(title, cls, pairs, checkedDefault, fill) {
        var paged = !fill && pairs.length > FACET_PAGE;
        var menu = pairs.length >= 3
          ? '<button class="facet-menu-btn" type="button" aria-label="Options">\u22ef</button>'
            + '<div class="facet-menu"><button class="facet-menu-item" type="button" data-act="all">Select all</button><button class="facet-menu-item" type="button" data-act="none">Deselect all</button></div>'
          : '';
        var g = '<div class="facet' + (fill ? ' facet--fill' : '') + '" data-cls="' + cls + '">'
          + '<div class="facet-title"><span class="facet-title-text">' + title + '</span>' + menu + '</div>'
          + '<div class="facet-list' + (fill ? ' facet-list--fill' : '') + '">';
        pairs.forEach(function (p) {
          g += '<label class="facet-opt"><input type="checkbox" class="' + cls + '" value="' + esc(p[0]) + '"' + (prefChecked(cls, p[0]) ? ' checked' : '') + '><span class="facet-name" title="' + esc(p[0]) + '">' + esc(trunc(p[0])) + '</span><span class="facet-count">' + p[1] + '</span></label>';
        });
        g += '</div>';
        if (paged) {
          g += '<div class="facet-pager"><button class="facet-prev" type="button" aria-label="Previous">\u2039</button><span class="facet-pageinfo"></span><button class="facet-next" type="button" aria-label="Next">\u203a</button></div>';
        }
        return g + '</div>';
      }
      function sortedPairs(counts) { return Object.keys(counts).sort().map(function (k) { return [k, counts[k]]; }); }
      var facets = '<aside class="sp-facets">'
        + facetGroup('Included', 'facet-inc', [['Readme.md', readmeN], ['Index.md', indexN]], false)
        + facetGroup('Repo', 'facet-repo', sortedPairs(repoCounts), true)
        + facetGroup('Author', 'facet-author', sortedPairs(authorCounts), true)
        + facetGroup('Folder', 'facet-folder', sortedPairs(folderCounts), true, true)
        + '</aside>';
      var list = '<div class="pr-list">';
      items.forEach(function (s) {
        var open = '/spec?repo=' + encodeURIComponent(s.repoId) + '&path=' + encodeURIComponent(s.path) + '&repoName=' + encodeURIComponent(s.repo || '') + '&project=' + encodeURIComponent(s.project || project) + '&branch=' + encodeURIComponent(s.branch || 'main') + '&q=' + encodeURIComponent(query);
        var top = '<div class="pr-top"><span class="pr-id">' + esc(s.repo) + '</span>' + (s.lastModifiedBy ? '<span class="pr-status">Last modified by ' + esc(s.lastModifiedBy) + '</span>' : '') + '</div>';
        list += '<a class="pr-card" href="' + esc(open) + '" data-repo="' + esc(s.repo || '(none)') + '" data-author="' + esc(s.lastModifiedBy || '(unknown)') + '" data-folder="' + esc(specFolder(s.path)) + '" data-kind="' + specKind(s.name) + '">' + top + '<div class="pr-title">' + esc(s.name) + '</div><div class="pr-meta">' + esc(s.path) + '</div></a>';
      });
      list += '</div>';
      out.innerHTML = '<div class="sp-layout">' + facets + list + '</div>';
      // --- Cross-filtering facets (faceted search) ---------------------------
      // Each slicer's available values reflect the specs passing the OTHER
      // slicers, so selecting in one narrows the others. A spec is visible when
      // its repo AND author AND folder are checked; README/index specs are
      // hidden unless their Included box turns them on.
      var cards = Array.prototype.slice.call(out.querySelectorAll('.pr-card')).map(function (el) {
        return { el: el, repo: el.dataset.repo, author: el.dataset.author, folder: el.dataset.folder, kind: el.dataset.kind };
      });
      var pageState = {};
      function facetByCls(cls) { return out.querySelector('.facet[data-cls="' + cls + '"]'); }
      function checkedSet(cls) { var m = {}; out.querySelectorAll('.' + cls + ':checked').forEach(function (c) { m[c.value] = 1; }); return m; }
      // Predicate: does spec s pass every facet EXCEPT exceptCls?
      function passExcept(exceptCls) {
        var repos = checkedSet('facet-repo'), authors = checkedSet('facet-author'), folders = checkedSet('facet-folder'), inc = checkedSet('facet-inc');
        return function (s) {
          if (exceptCls !== 'facet-repo' && !repos[s.repo]) return false;
          if (exceptCls !== 'facet-author' && !authors[s.author]) return false;
          if (exceptCls !== 'facet-folder' && !folders[s.folder]) return false;
          if (exceptCls !== 'facet-inc') {
            if (s.kind === 'readme' && !inc['Readme.md']) return false;
            if (s.kind === 'index' && !inc['Index.md']) return false;
          }
          return true;
        };
      }
      function updateFacets() {
        // Data facets: available values + counts come from specs passing the
        // OTHER facets; only available rows are shown (and paginated).
        [['facet-repo', 'repo'], ['facet-author', 'author'], ['facet-folder', 'folder']].forEach(function (dim) {
          var cls = dim[0], key = dim[1], pass = passExcept(cls), counts = {};
          cards.forEach(function (s) { if (pass(s)) counts[s[key]] = (counts[s[key]] || 0) + 1; });
          var facet = facetByCls(cls), avail = [];
          facet.querySelectorAll('.facet-opt').forEach(function (row) {
            var v = row.querySelector('input').value, c = counts[v] || 0;
            row.querySelector('.facet-count').textContent = c;
            if (c > 0) avail.push(row); else row.style.display = 'none';
          });
          var pager = facet.querySelector('.facet-pager');
          if (pager && avail.length > FACET_PAGE) {
            var pages = Math.ceil(avail.length / FACET_PAGE), pg = pageState[cls] || 0;
            if (pg > pages - 1) pg = pages - 1; if (pg < 0) pg = 0; pageState[cls] = pg;
            avail.forEach(function (row, i) { row.style.display = (i >= pg * FACET_PAGE && i < pg * FACET_PAGE + FACET_PAGE) ? '' : 'none'; });
            pager.style.display = '';
            pager.querySelector('.facet-pageinfo').textContent = (pg + 1) + ' / ' + pages;
            pager.querySelector('.facet-prev').disabled = pg === 0;
            pager.querySelector('.facet-next').disabled = pg === pages - 1;
          } else {
            avail.forEach(function (row) { row.style.display = ''; });
            if (pager) pager.style.display = 'none';
          }
        });
        // Included: fixed options, live counts (specs passing the other facets).
        var incPass = passExcept('facet-inc'), rN = 0, iN = 0;
        cards.forEach(function (s) { if (incPass(s)) { if (s.kind === 'readme') rN++; else if (s.kind === 'index') iN++; } });
        facetByCls('facet-inc').querySelectorAll('.facet-opt').forEach(function (row) {
          row.querySelector('.facet-count').textContent = (row.querySelector('input').value === 'Readme.md' ? rN : iN);
        });
        // Spec list: visible when passing every facet.
        var passAll = passExcept(''), visible = 0;
        cards.forEach(function (s) { var ok = passAll(s); s.el.style.display = ok ? '' : 'none'; if (ok) visible++; });
        status.textContent = visible + ' spec' + (visible === 1 ? '' : 's');
        savePrefs();
      }
      out.querySelectorAll('.facet-inc, .facet-repo, .facet-author, .facet-folder').forEach(function (cb) { cb.addEventListener('change', updateFacets); });

      // Slicer pagers page over the AVAILABLE (cross-filtered) rows.
      out.querySelectorAll('.facet-pager').forEach(function (pager) {
        var cls = pager.closest('.facet').dataset.cls;
        pager.querySelector('.facet-prev').addEventListener('click', function () { pageState[cls] = Math.max(0, (pageState[cls] || 0) - 1); updateFacets(); });
        pager.querySelector('.facet-next').addEventListener('click', function () { pageState[cls] = (pageState[cls] || 0) + 1; updateFacets(); });
      });

      // Per-box header menu: Select all / Deselect all.
      out.querySelectorAll('.facet-menu-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var menu = btn.parentNode.querySelector('.facet-menu');
          var willOpen = !menu.classList.contains('open');
          document.querySelectorAll('.facet-menu.open').forEach(function (m) { m.classList.remove('open'); });
          if (willOpen) menu.classList.add('open');
        });
      });
      out.querySelectorAll('.facet-menu-item').forEach(function (item) {
        item.addEventListener('click', function (e) {
          e.stopPropagation();
          var facet = item.closest('.facet');
          var on = item.dataset.act === 'all';
          facet.querySelectorAll('input[type=checkbox]').forEach(function (cb) { cb.checked = on; });
          item.closest('.facet-menu').classList.remove('open');
          updateFacets();
        });
      });
      if (!window.__facetMenuBound) {
        document.addEventListener('click', function () { document.querySelectorAll('.facet-menu.open').forEach(function (m) { m.classList.remove('open'); }); });
        window.__facetMenuBound = true;
      }
      updateFacets(); // initial: README/index exclusion + cross-filter
    } catch (e) { status.textContent = 'Search failed: ' + e.message; }
  }
  var SERVER_LOCAL_REPO = ${jsonForScript(_localRepoPath || "")};
  var BR_ORG = ${jsonForScript(ADO_ORG)};
  var brMode = 'remote';
  var brCreateRepos = [];
  var prBranchData = { branches: [], repos: [] };
  function prRepoOptions() {
    var byId = {};
    (prBranchData.repos || []).forEach(function (r) { if (r && r.id) byId[r.id] = r; });
    (prBranchData.branches || []).forEach(function (b) {
      if (b && b.repoId && !byId[b.repoId]) byId[b.repoId] = { id: b.repoId, name: b.repo || b.repoId, project: b.project || '' };
    });
    (prBranchData.stagedBranches || []).forEach(function (b) {
      if (b && b.repo && !byId[b.repo]) byId[b.repo] = { id: b.repo, name: b.repoName || b.repo, project: b.project || '' };
    });
    return Object.keys(byId).map(function (id) { return byId[id]; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  }
  function populatePrBranches() {
    var repoSel = document.getElementById('prCreateRepo');
    var sourceSel = document.getElementById('prCreateSource');
    var targetSel = document.getElementById('prCreateTarget');
    if (!repoSel || !sourceSel || !targetSel) return;
    var repoId = repoSel.value;
    var branches = (prBranchData.branches || []).filter(function (b) { return b.repoId === repoId; }).map(function (b) { return b.name; });
    var staged = (prBranchData.stagedBranches || []).filter(function (b) { return b.repo === repoId; }).map(function (b) { return b.branch; });
    staged.forEach(function (name) { if (branches.indexOf(name) === -1) branches.push(name); });
    branches.sort();
    sourceSel.innerHTML = branches.length ? branches.map(function (name) { return '<option value="' + esc(name) + '">' + esc(name) + '</option>'; }).join('') : '<option value="">No branches found</option>';
    var targets = branches.slice(); if (targets.indexOf('main') === -1) targets.unshift('main');
    targetSel.innerHTML = targets.map(function (name) { return '<option value="' + esc(name) + '"' + (name === 'main' ? ' selected' : '') + '>' + esc(name) + '</option>'; }).join('');
  }
  function populatePrRepos() {
    var sel = document.getElementById('prCreateRepo');
    if (!sel) return;
    var repos = prRepoOptions();
    sel.innerHTML = repos.length ? repos.map(function (r) { return '<option value="' + esc(r.id) + '" data-name="' + esc(r.name || '') + '" data-project="' + esc(r.project || '') + '">' + esc(r.name || r.id) + '</option>'; }).join('') : '<option value="">No repositories found</option>';
    populatePrBranches();
  }
  async function loadPrChoices() {
    var project = document.getElementById('prCreateProject').value;
    var status = document.getElementById('prCreateStatus');
    status.textContent = 'Loading branches\u2026';
    try {
      var results = await Promise.all([
        fetch('/api/v1/branches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: project }) }).then(function (r) { return r.json(); }),
        fetch('/api/v1/staged').then(function (r) { return r.json(); })
      ]);
      var remote = results[0] || {}, staged = results[1] || {};
      if (remote.error && remote.error !== 'offline') { status.textContent = remote.error; return; }
      prBranchData = { branches: remote.branches || [], repos: remote.repos || [], stagedBranches: staged.branches || [] };
      populatePrRepos();
      status.textContent = prRepoOptions().length ? '' : 'No repositories found for this project.';
    } catch (e) { status.textContent = 'Failed: ' + e.message; }
  }
  function stagedPrCard(pr) {
    var draft = pr.isDraft !== false ? '<span class="pr-draft">Draft</span>' : '';
    return '<div class="pr-card pr-staged-card" data-project="' + esc(pr.project || '') + '" data-activity="authoring" data-status="' + (pr.isDraft !== false ? 'draft' : 'published') + '" data-search="' + esc(String(pr.title || '').toLowerCase()) + '">' +
      '<div class="pr-top"><span class="br-staged-badge">staged only</span>' + draft + '<span class="pr-role pr-role-author">Authoring</span>' +
      '<button class="br-staged-del pr-staged-del" data-repo="' + esc(pr.repo || '') + '" data-branch="' + esc(pr.branch || pr.sourceBranch || '') + '" title="Delete staged PR" aria-label="Delete staged PR">\uD83D\uDDD1</button></div>' +
      '<div class="pr-title">' + esc(pr.title || '') + '</div>' +
      '<div class="pr-meta">' + esc(pr.sourceBranch || pr.branch || '') + ' \u2192 ' + esc(pr.targetBranch || '') + ' \u00b7 ' + esc(pr.repoName || pr.repo || '') + ' \u00b7 ' + esc(pr.project || '') + '</div></div>';
  }
  async function refreshStagedPrs() {
    var list = document.getElementById('qPrList');
    if (!list) return;
    try {
      var r = await fetch('/api/v1/staged');
      var d = await r.json();
      list.querySelectorAll('.pr-staged-card').forEach(function (card) { card.remove(); });
      if (d.prs && d.prs.length) {
        var empty = list.querySelector('.empty'); if (empty) empty.remove();
        list.insertAdjacentHTML('afterbegin', d.prs.map(stagedPrCard).join(''));
        list.querySelectorAll('.pr-staged-del').forEach(function (b) {
          b.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); unstagePr(b.getAttribute('data-repo'), b.getAttribute('data-branch')); });
        });
      }
    } catch (e) {}
    // Mirror the Branches tab: refresh the top-row staged ticker / Push to remote.
    if (window.__tpStagedRefresh) window.__tpStagedRefresh();
  }
  async function unstagePr(repo, branch) {
    try { await fetch('/api/v1/pr/unstage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo: repo, branch: branch }) }); } catch (e) {}
    refreshStagedPrs();
  }
  // Clickstop 5: stage/unstage the publish (draft -> published) of a real PR
  // from its queue card. Local until Push to remote, like every staged intent.
  async function stagePrPublishFromCard(prId, project, repo, title) {
    try { await fetch('/api/v1/pr/publish/stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org: BR_ORG, project: project, repo: repo, repoName: repo, pullRequestId: Number(prId), title: title }) }); } catch (e) {}
    markStagedPublishes();
    if (window.__tpStagedRefresh) window.__tpStagedRefresh();
  }
  function prPublishKey(project, repo, prId) {
    return String(project || '') + '\\n' + String(repo || '') + '\\n' + String(prId);
  }
  async function unstagePrPublishFromCard(prId, project, repo) {
    try { await fetch('/api/v1/pr/publish/unstage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: project, repo: repo, pullRequestId: Number(prId) }) }); } catch (e) {}
    markStagedPublishes();
    if (window.__tpStagedRefresh) window.__tpStagedRefresh();
  }
  async function markStagedPublishes() {
    var ids = {};
    try { var d = await (await fetch('/api/v1/staged')).json(); (d.prPublishes || []).forEach(function (p) { ids[prPublishKey(p.project, p.repo, p.pullRequestId)] = true; }); } catch (e) {}
    document.querySelectorAll('.pr-publish-btn').forEach(function (b) {
      var staged = ids[prPublishKey(b.getAttribute('data-project'), b.getAttribute('data-repo'), b.getAttribute('data-pr-id'))];
      b.textContent = staged ? 'Publish PR staged \u2713' : 'Publish PR';
      b.classList.toggle('pr-publish-staged', !!staged);
    });
  }
  function wireQueuePublish() {
    var list = document.getElementById('qPrList');
    if (!list || list.__pubWired) return;
    list.__pubWired = true;
    list.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('.pr-publish-btn');
      if (!b) return;
      ev.preventDefault(); ev.stopPropagation();
      var id = b.getAttribute('data-pr-id');
      if (b.classList.contains('pr-publish-staged')) unstagePrPublishFromCard(id, b.getAttribute('data-project'), b.getAttribute('data-repo'));
      else stagePrPublishFromCard(id, b.getAttribute('data-project'), b.getAttribute('data-repo'), b.getAttribute('data-title'));
    });
  }
  async function stagePr() {
    var repoSel = document.getElementById('prCreateRepo');
    var repoOpt = repoSel && repoSel.options[repoSel.selectedIndex];
    var workItemTitleEl = document.getElementById('prCreateWorkItemTitle');
    var workItemTypeEl = document.getElementById('prCreateWorkItemType');
    var workItemTitle = workItemTitleEl ? (workItemTitleEl.value || '').trim() : '';
    var body = {
      org: BR_ORG,
      project: document.getElementById('prCreateProject').value,
      repo: repoSel ? repoSel.value : '',
      title: (document.getElementById('prCreateTitle').value || '').trim(),
      description: (document.getElementById('prCreateDescription').value || '').trim(),
      sourceBranch: document.getElementById('prCreateSource').value,
      targetBranch: document.getElementById('prCreateTarget').value,
      isDraft: document.getElementById('prCreateDraft').checked,
      workItemTitle: workItemTitle || undefined,
      workItemType: workItemTitle && workItemTypeEl ? (workItemTypeEl.value || '').trim() : undefined,
      repoName: repoOpt ? (repoOpt.getAttribute('data-name') || '') : ''
    };
    var status = document.getElementById('prCreateStatus');
    if (!body.repo || !body.sourceBranch || !body.targetBranch || !body.title) { status.textContent = 'Repository, source, target, and title are required.'; return; }
    if (body.sourceBranch === body.targetBranch) { status.textContent = 'Source and target branches must be different.'; return; }
    if (body.workItemTitle && !body.workItemType) { status.textContent = 'Work item type is required when a work item title is set.'; return; }
    status.textContent = 'Staging\u2026';
    try {
      var r = await fetch('/api/v1/pr/stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      var d = await r.json();
      if (!d || !d.ok) { status.textContent = (d && d.error) || 'Stage failed.'; return; }
      status.textContent = 'Pull request staged. Publish staged changes when ready.';
      document.getElementById('prCreatePanel').hidden = true;
      await refreshStagedPrs();
    } catch (e) { status.textContent = 'Failed: ' + e.message; }
  }
  function renderBranchCards(items, kind) {
    var out = document.getElementById('brResults');
    if (!items.length) { out.innerHTML = '<div class="empty">No branches found.</div>'; return; }
    var h = '<div class="pr-list">';
    items.forEach(function (b) {
      if (kind === 'remote') {
        var top = '<div class="pr-top"><span class="pr-id">' + esc(b.repo) + '</span></div>';
        if (b.repoId) {
          var href = '/branch?project=' + encodeURIComponent(b.project || '') + '&repo=' + encodeURIComponent(b.repoId) + '&repoName=' + encodeURIComponent(b.repo || '') + '&ref=' + encodeURIComponent(b.name);
          h += '<a class="pr-card" href="' + esc(href) + '">' + top + '<div class="pr-title">' + esc(b.name) + '</div></a>';
        } else {
          h += '<div class="pr-card">' + top + '<div class="pr-title">' + esc(b.name) + '</div></div>';
        }
      } else {
        var badge = b.current ? '<span class="br-current">current</span>' : '';
        // Local branches open the fully-local branch page; files are diffed from
        // the clone with real git (no ADO, no push required).
        var lhref = '/local-branch?path=' + encodeURIComponent(brLocalPathValue || '') + '&ref=' + encodeURIComponent(b.name);
        h += '<a class="pr-card" href="' + esc(lhref) + '"><div class="pr-title">' + esc(b.name) + badge + '</div></a>';
      }
    });
    h += '</div>';
    out.innerHTML = h;
  }
  async function runBranches() {
    var project = document.getElementById('brProject').value;
    var status = document.getElementById('brStatus');
    status.textContent = 'Loading\u2026'; document.getElementById('brResults').innerHTML = '';
    try {
      var r = await fetch('/api/v1/branches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: project }) });
      var d = await r.json();
      if (d.error) { status.textContent = d.error; return; }
      var items = d.branches || [];
      brCreateRepos = d.repos || [];
      status.textContent = items.length + ' branch' + (items.length === 1 ? '' : 'es');
      renderBranchCards(items, 'remote');
      populateCreateRepos();
      saveBranchCache('remote');
      refreshStaged();
    } catch (e) { status.textContent = 'Failed: ' + e.message; }
  }
  // Clickstop 2: create/adopt a remote branch to author on. Repo options come
  // from the loaded branch list; the new branch opens its (empty) branch page.
  function brScanCards() {
    var repos = [], seenR = {}, byRepo = {};
    document.querySelectorAll('#brResults a.pr-card').forEach(function (a) {
      try {
        var u = new URL(a.getAttribute('href'), location.origin);
        var id = u.searchParams.get('repo'), nm = u.searchParams.get('repoName'), pj = u.searchParams.get('project'), ref = u.searchParams.get('ref');
        if (!id) return;
        if (!seenR[id]) { seenR[id] = 1; repos.push({ id: id, name: nm || '', project: pj || '' }); byRepo[id] = []; }
        if (ref && byRepo[id].indexOf(ref) === -1) byRepo[id].push(ref);
      } catch (e) {}
    });
    return { repos: repos, byRepo: byRepo };
  }
  function populateBaseBranches() {
    var repoSel = document.getElementById('brCreateRepo');
    var baseSel = document.getElementById('brCreateBase');
    if (!repoSel || !baseSel) return;
    var branches = brScanCards().byRepo[repoSel.value] || [];
    var opts = '<option value="main">main</option>';
    branches.forEach(function (b) { if (b !== 'main') opts += '<option value="' + esc(b) + '">' + esc(b) + '</option>'; });
    baseSel.innerHTML = opts;
  }
  function populateCreateRepos() {
    var sel = document.getElementById('brCreateRepo');
    if (!sel) return;
    var repos = brScanCards().repos;
    if (!repos.length) repos = brCreateRepos;
    if (!repos.length) return;
    sel.innerHTML = repos.map(function (r) {
      return '<option value="' + esc(r.id) + '" data-name="' + esc(r.name) + '" data-project="' + esc(r.project) + '">' + esc(r.name) + '</option>';
    }).join('');
    populateBaseBranches();
  }
  async function stageBranch() {
    var sel = document.getElementById('brCreateRepo');
    var opt = sel && sel.options[sel.selectedIndex];
    var repoId = sel ? sel.value : '';
    var repoName = opt ? (opt.getAttribute('data-name') || '') : '';
    var project = (opt && opt.getAttribute('data-project')) || (document.getElementById('brProject') || {}).value || '';
    var name = (document.getElementById('brCreateName').value || '').trim();
    var base = (document.getElementById('brCreateBase').value || '').trim();
    var status = document.getElementById('brCreateStatus');
    if (!repoId) { status.textContent = 'Pick a repo (load branches first).'; return; }
    if (!name) { status.textContent = 'Enter a branch name.'; return; }
    status.textContent = 'Staging\u2026';
    try {
      var r = await fetch('/api/v1/branches/stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org: BR_ORG, project: project, repo: repoId, repoName: repoName, branch: name, base: base || undefined }) });
      var d = await r.json();
      if (!d || !d.ok) { status.textContent = (d && d.error) || 'Stage failed.'; return; }
      document.getElementById('brCreateName').value = '';
      status.textContent = '';
      var panel = document.getElementById('brCreatePanel'); if (panel) panel.hidden = true;
      refreshStaged();
    } catch (e) { status.textContent = 'Failed: ' + e.message; }
  }
  // Render staged (pre-push) branch cards atop the remote list — lighter, with a
  // "staged only" badge — and refresh the top-row staged hint.
  async function refreshStaged() {
    var out = document.getElementById('brResults');
    try {
      var r = await fetch('/api/v1/staged');
      if (r.ok) {
        var d = await r.json();
        if (out) {
          out.querySelectorAll('.br-staged-card').forEach(function (c) { c.remove(); });
          if (d.branches && d.branches.length) {
            var list = out.querySelector('.pr-list');
            if (!list) { out.innerHTML = '<div class="pr-list"></div>'; list = out.querySelector('.pr-list'); }
            var html = d.branches.map(function (s) {
              var href = '/branch?project=' + encodeURIComponent(s.project || '') + '&repo=' + encodeURIComponent(s.repo) + '&repoName=' + encodeURIComponent(s.repoName || '') + '&ref=' + encodeURIComponent(s.branch) + '&staged=1';
              return '<div class="pr-card br-staged-card">' +
                '<a class="br-staged-link" href="' + esc(href) + '"><div class="pr-top"><span class="pr-id">' + esc(s.repoName || '') + '</span><span class="br-staged-badge">staged only</span></div><div class="pr-title">' + esc(s.branch) + '</div></a>' +
                '<button class="br-staged-del" data-repo="' + esc(s.repo) + '" data-branch="' + esc(s.branch) + '" title="Delete staged branch" aria-label="Delete staged branch">\uD83D\uDDD1</button>' +
              '</div>';
            }).join('');
            list.insertAdjacentHTML('afterbegin', html);
            list.querySelectorAll('.br-staged-del').forEach(function (b) {
              b.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); unstageBranch(b.getAttribute('data-repo'), b.getAttribute('data-branch')); });
            });
          }
        }
      }
    } catch (e) {}
    if (window.__tpStagedRefresh) window.__tpStagedRefresh();
  }
  async function unstageBranch(repo, branch) {
    try { await fetch('/api/v1/branches/unstage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo: repo, branch: branch }) }); } catch (e) {}
    refreshStaged();
  }
  var brLocalPathValue = '';
  // Per-mode result cache so switching Remote/Local — and navigating to a branch
  // page and back — restores the last view instead of refetching (Refresh forces
  // a reload). Backed by sessionStorage so it survives the full-page navigation
  // the "\u2190 Branches" back link performs.
  var brCache = { remote: null, local: null };
  function persistBranchCache(mode, payload) {
    try {
      if (mode === 'remote') { var sel = document.getElementById('brProject'); payload.project = sel ? sel.value : ''; }
      sessionStorage.setItem('tippani.brCache.' + mode, JSON.stringify(payload));
    } catch (e) {}
  }
  function loadPersistedBranchCache(mode) {
    try { var s = sessionStorage.getItem('tippani.brCache.' + mode); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function saveBranchCache(mode) {
    var payload = { results: document.getElementById('brResults').innerHTML, status: document.getElementById('brStatus').textContent };
    brCache[mode] = payload;
    persistBranchCache(mode, payload);
  }
  function restoreBranchCache(mode) {
    var c = brCache[mode];
    if (!c) {
      var p = loadPersistedBranchCache(mode);
      // For remote, only reuse the persisted view if it's for the selected project.
      if (p && mode === 'remote') { var sel = document.getElementById('brProject'); if (sel && p.project && p.project !== sel.value) p = null; }
      if (p) { c = { results: p.results, status: p.status }; brCache[mode] = c; }
    }
    if (!c) return false;
    document.getElementById('brResults').innerHTML = c.results;
    document.getElementById('brStatus').textContent = c.status;
    if (mode === 'remote') { populateCreateRepos(); refreshStaged(); }
    return true;
  }
  function setLocalNote(picked) {
    var n = document.getElementById('brLocalNote');
    if (n) n.innerHTML = picked ? 'Every branch in the workspace is listed; the checked-out one is marked <b>current</b>.' : 'Pick a local workspace to list its branches.';
  }
  function updateBranchesActions() {
    var input = document.getElementById('brLocalPath');
    var hasPath = !!(input && (input.value || '').trim());
    var show = (brMode === 'remote') || (brMode === 'local' && hasPath);
    var a = document.getElementById('brActions'); if (a) a.style.display = show ? '' : 'none';
    var nw = document.getElementById('brNewWrap'); if (nw) nw.style.display = (brMode === 'remote') ? '' : 'none';
  }
  function clearWorkspace() {
    brLocalPathValue = '';
    brCache.local = null;
    try { sessionStorage.removeItem('tippani.brCache.local'); } catch (e) {}
    try { localStorage.removeItem('tippani.brLocalPath'); } catch (e) {}
    document.getElementById('brLocalPath').value = '';
    var c = document.getElementById('brLocalClear'); if (c) c.hidden = true;
    document.getElementById('brResults').innerHTML = '';
    document.getElementById('brStatus').textContent = '';
    setLocalNote(false);
    updateBranchesActions();
  }
  async function pickWorkspace() {
    // Native OS folder dialog (served locally) returns the real path server-side
    // git needs. The pane UI is unchanged; only the dialog is native.
    var status = document.getElementById('brStatus');
    status.textContent = 'Opening folder picker\u2026';
    try {
      var r = await fetch('/api/v1/local-pick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      var d = await r.json();
      if (d && d.canceled) { status.textContent = ''; return; }
      if (!d || !d.ok) { status.textContent = (d && d.error) || 'Could not open the folder picker.'; return; }
      brLocalPathValue = d.path;
      try { localStorage.setItem('tippani.brLocalPath', d.path); } catch (e) {}
      document.getElementById('brLocalPath').value = d.path;
      var c = document.getElementById('brLocalClear'); if (c) c.hidden = false;
      setLocalNote(true);
      updateBranchesActions();
      await runLocalBranches();
    } catch (e) { status.textContent = 'Failed: ' + e.message; }
  }
  // Restore a remembered local repo path on load and list its branches.
  async function restoreWorkspace() {
    var saved = null; try { saved = localStorage.getItem('tippani.brLocalPath'); } catch (e) {}
    if (!saved) return false;
    brLocalPathValue = saved;
    document.getElementById('brLocalPath').value = saved;
    var c = document.getElementById('brLocalClear'); if (c) c.hidden = false;
    setLocalNote(true);
    updateBranchesActions();
    return true;
  }
  async function runLocalBranches() {
    // The Repo textbox is the source of truth (typed, picked, or CLI/MCP-set).
    var status = document.getElementById('brStatus');
    var input = document.getElementById('brLocalPath');
    var repoPath = (input && input.value || '').trim();
    brLocalPathValue = repoPath;
    if (repoPath) { try { localStorage.setItem('tippani.brLocalPath', repoPath); } catch (e) {} }
    if (!repoPath) { status.textContent = 'Type a repo path or Browse to one.'; document.getElementById('brResults').innerHTML = ''; return; }
    status.textContent = 'Reading\u2026'; document.getElementById('brResults').innerHTML = '';
    try {
      var r = await fetch('/api/v1/local-branches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: repoPath }) });
      var d = await r.json();
      if (!d || d.error || d.ok === false) { status.textContent = (d && d.error) || 'Could not read the repo.'; return; }
      var branches = d.branches || [];
      status.textContent = branches.length + ' branch' + (branches.length === 1 ? '' : 'es');
      renderBranchCards(branches, 'local');
      saveBranchCache('local');
    } catch (e) { status.textContent = 'Failed: ' + e.message; }
  }
  function runActiveBranches() { if (brMode === 'local') runLocalBranches(); else runBranches(); }
  // Clickstop 2 (Custom-list tab): a durable, user-curated list of one-off .md
  // files. Add validates + persists the file (approving its folder); each tile
  // opens the read-only view; the × removes it (revoking its folder if last).
  // All text goes through esc() (never raw HTML) so a path can't break out.
  function clTile(f) {
    var dir = f.dir ? '<div style="font-size:11px;color:var(--cp-text-muted);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(f.dir) + '</div>' : '';
    var summary = f.summary ? '<div style="font-size:12px;color:var(--cp-text-muted);margin-top:3px;">' + esc(f.summary) + '</div>' : '';
    var titlePrefix = f.pinned ? '\uD83D\uDCD8 ' : '';
    var right = f.pinned
      ? '<span title="Pinned \u2014 always available" style="flex:0 0 auto;font-size:11px;font-weight:600;color:var(--cp-accent);border:1px solid var(--cp-accent);border-radius:999px;padding:2px 10px;">Manual</span>'
      : '<button class="cl-remove br-staged-del" data-path="' + esc(f.path) + '" title="Remove from list" aria-label="Remove from list">\uD83D\uDDD1</button>';
    return '<div class="pr-card" style="display:flex;align-items:center;gap:12px;">' +
      '<a href="' + esc(f.openHref) + '" style="flex:1 1 auto;min-width:0;text-decoration:none;color:inherit;">' +
        dir + '<div class="pr-title">' + titlePrefix + esc(f.name) + '</div>' + summary +
      '</a>' +
      right +
    '</div>';
  }
  function renderCustomList(files) {
    var list = document.getElementById('clList');
    if (!list) return;
    files = files || [];
    if (!files.length) { list.innerHTML = '<div class="empty">No files yet. Add a .md file above.</div>'; return; }
    list.innerHTML = '<div class="pr-list">' + files.map(clTile).join('') + '</div>';
    list.querySelectorAll('.cl-remove').forEach(function (b) {
      b.addEventListener('click', function () { removeCustomFile(b.dataset.path); });
    });
  }
  async function loadCustomList() {
    try {
      var r = await fetch('/api/v1/custom-files');
      var d = await r.json();
      if (d && d.ok) renderCustomList(d.files);
    } catch (e) { /* leave the list as-is on a transient error */ }
  }
  async function runAddFile() {
    var input = document.getElementById('ofPath');
    var err = document.getElementById('ofError');
    if (!input) return;
    if (err) err.innerHTML = '';
    var p = (input.value || '').trim();
    if (!p) return;
    try {
      var r = await fetch('/api/v1/custom-files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }) });
      var d = await r.json();
      if (d && d.ok) { input.value = ''; renderCustomList(d.files); }
      else if (err) { err.innerHTML = '<div class="empty" style="color:var(--cp-danger,#c0392b)">' + esc((d && d.error) || 'Not a valid .md file path.') + '</div>'; }
    } catch (e) {
      if (err) err.innerHTML = '<div class="empty" style="color:var(--cp-danger,#c0392b)">' + esc(String((e && e.message) || e)) + '</div>';
    }
  }
  // Native OS file picker (served locally, filtered to .md) — mirrors the Local
  // branches Browse. Fills the box with the chosen real path; the user then Adds.
  async function pickMdFile() {
    var input = document.getElementById('ofPath');
    var status = document.getElementById('ofStatus');
    var err = document.getElementById('ofError'); if (err) err.innerHTML = '';
    if (status) status.textContent = 'Opening file picker\u2026';
    try {
      var r = await fetch('/api/v1/pick-md-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      var d = await r.json();
      if (d && d.canceled) { if (status) status.textContent = ''; return; }
      if (d && d.ok && d.path) { if (input) input.value = d.path; if (status) status.textContent = ''; }
      else { if (status) status.textContent = ''; if (err) err.innerHTML = '<div class="empty" style="color:var(--cp-danger,#c0392b)">' + esc((d && d.error) || 'Could not open the file picker.') + '</div>'; }
    } catch (e) {
      if (status) status.textContent = '';
      if (err) err.innerHTML = '<div class="empty" style="color:var(--cp-danger,#c0392b)">' + esc(String((e && e.message) || e)) + '</div>';
    }
  }
  async function removeCustomFile(p) {
    try {
      var r = await fetch('/api/v1/custom-files', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }) });
      var d = await r.json();
      if (d && d.ok) renderCustomList(d.files);
    } catch (e) { /* leave the list as-is on a transient error */ }
  }
  window.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.tab').forEach(function (t) { t.addEventListener('click', function () { activateTab(t.dataset.tab); }); });
    var params = new URLSearchParams(location.search);
    var t = params.get('tab');
    if (!t) { try { t = localStorage.getItem('tippani.discoveryTab'); } catch (e) {} }
    activateTab((HAS_WORK_ITEMS && t === 'workitems') || t === 'specs' || t === 'branches' || t === 'openfile' ? t : 'queue');
    // Review queue slicers (client-side faceted filter, same engine as Specs).
    mountFacets(
      document.querySelector('.pane[data-pane="queue"] .pr-list'),
      [
        { title: 'Project', key: 'project', checkedDefault: true },
        { title: 'Author', key: 'author', checkedDefault: true },
        { title: 'Activity', key: 'activity', checkedDefault: true, fixed: [['Authoring', 'authoring'], ['Reviewing', 'reviewing']], getValues: function (el) { return (el.dataset.activity || '').split(' ').filter(Boolean); } },
        { title: 'PR Status', key: 'status', checkedDefault: true, fixed: [['Draft', 'draft'], ['Published', 'published']] }
      ],
      'tippani.queueFacetPrefs.v1',
      function (n) { var el = document.getElementById('qStatus'); if (el) el.textContent = n + ' pull request' + (n === 1 ? '' : 's'); },
      { input: document.getElementById('qSearch'), attr: 'search', button: document.getElementById('qSearchBtn') }
    );
    var btn = document.getElementById('wiSearchBtn'); if (btn) btn.addEventListener('click', runWiql);
    var spBtn = document.getElementById('spSearchBtn'); if (spBtn) spBtn.addEventListener('click', runSpecSearch);
    var spBox = document.getElementById('spQuery'); if (spBox) spBox.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runSpecSearch(); } });
    // Remember the Work items project selection across restarts (localStorage).
    var wiProjSel = document.getElementById('wiProject');
    if (wiProjSel) {
      var savedProj = null; try { savedProj = localStorage.getItem('tippani.wiProject'); } catch (e) { }
      if (savedProj) { for (var pk = 0; pk < wiProjSel.options.length; pk++) { if (wiProjSel.options[pk].value === savedProj) { wiProjSel.selectedIndex = pk; break; } } }
      wiProjSel.addEventListener('change', function () { try { localStorage.setItem('tippani.wiProject', wiProjSel.value); } catch (e) { } });
    }
    // Remember the Specs project selection across restarts (localStorage).
    var spProjSel = document.getElementById('spProject');
    if (spProjSel) {
      var savedSpProj = null; try { savedSpProj = localStorage.getItem('tippani.spProject'); } catch (e) { }
      if (savedSpProj) { for (var spk = 0; spk < spProjSel.options.length; spk++) { if (spProjSel.options[spk].value === savedSpProj) { spProjSel.selectedIndex = spk; break; } } }
      spProjSel.addEventListener('change', function () { try { localStorage.setItem('tippani.spProject', spProjSel.value); } catch (e) { } });
    }
    // Branches tab: Remote/Local toggle + per-mode source; list on load/change.
    var brProjSel = document.getElementById('brProject');
    if (brProjSel) {
      var savedBrProj = null; try { savedBrProj = localStorage.getItem('tippani.brProject'); } catch (e) { }
      if (savedBrProj) { for (var brk = 0; brk < brProjSel.options.length; brk++) { if (brProjSel.options[brk].value === savedBrProj) { brProjSel.selectedIndex = brk; break; } } }
      brProjSel.addEventListener('change', function () { try { localStorage.setItem('tippani.brProject', brProjSel.value); } catch (e) { } if (brMode === 'remote') runBranches(); });
    }
    document.querySelectorAll('.br-mode-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        brMode = btn.dataset.mode;
        document.querySelectorAll('.br-mode-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
        document.querySelectorAll('.br-source').forEach(function (s) { s.hidden = (s.dataset.source !== brMode); });
        try { localStorage.setItem('tippani.brMode', brMode); } catch (e) { }
        if (brMode === 'local') setLocalNote(!!brLocalPathValue);
        updateBranchesActions();
        // Restore the last view for this mode; only fetch if never loaded.
        if (!restoreBranchCache(brMode)) runActiveBranches();
      });
    });
    var brRefresh = document.getElementById('brRefreshBtn'); if (brRefresh) brRefresh.addEventListener('click', runActiveBranches);
    var brCreate = document.getElementById('brCreateBtn'); if (brCreate) brCreate.addEventListener('click', stageBranch);
    var brNew = document.getElementById('brNewBtn'); if (brNew) brNew.addEventListener('click', function () { var p = document.getElementById('brCreatePanel'); if (!p) return; p.hidden = !p.hidden; if (!p.hidden) { populateCreateRepos(); var n = document.getElementById('brCreateName'); if (n) n.focus(); } });
    var brCreateRepoSel = document.getElementById('brCreateRepo'); if (brCreateRepoSel) brCreateRepoSel.addEventListener('change', populateBaseBranches);
    var prNew = document.getElementById('prNewBtn'); if (prNew) prNew.addEventListener('click', function () { var p = document.getElementById('prCreatePanel'); if (!p) return; p.hidden = !p.hidden; if (!p.hidden) loadPrChoices(); });
    var prProject = document.getElementById('prCreateProject'); if (prProject) prProject.addEventListener('change', loadPrChoices);
    var prRepo = document.getElementById('prCreateRepo'); if (prRepo) prRepo.addEventListener('change', populatePrBranches);
    var prStage = document.getElementById('prCreateBtn'); if (prStage) prStage.addEventListener('click', stagePr);
    refreshStagedPrs();
    wireQueuePublish();
    markStagedPublishes();
    var brBrowse = document.getElementById('brBrowseBtn'); if (brBrowse) brBrowse.addEventListener('click', pickWorkspace);
    var ofBtn = document.getElementById('ofOpenBtn'); if (ofBtn) ofBtn.addEventListener('click', runAddFile);
    var ofBrowse = document.getElementById('ofBrowseBtn'); if (ofBrowse) ofBrowse.addEventListener('click', pickMdFile);
    var ofBox = document.getElementById('ofPath'); if (ofBox) ofBox.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runAddFile(); } });
    loadCustomList();
    var brPathInput = document.getElementById('brLocalPath');
    if (brPathInput) {
      brPathInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runLocalBranches(); } });
      brPathInput.addEventListener('input', function () { brLocalPathValue = (brPathInput.value || '').trim(); var c = document.getElementById('brLocalClear'); if (c) c.hidden = !brLocalPathValue; updateBranchesActions(); });
    }
    var brClear = document.getElementById('brLocalClear'); if (brClear) brClear.addEventListener('click', clearWorkspace);
    // Initial local state: a server-provided repo path (CLI --local-repo or an
    // MCP/API call) wins and prefills the Repo box; else restore the last path
    // from localStorage. A ?mode= param (e.g. from MCP) sets the active mode.
    var brModeParam = params.get('mode');
    function activateLocalMode() { var lb = document.querySelector('.br-mode-btn[data-mode="local"]'); if (lb) lb.click(); }
    if (SERVER_LOCAL_REPO) {
      brLocalPathValue = SERVER_LOCAL_REPO;
      var brf = document.getElementById('brLocalPath'); if (brf) brf.value = SERVER_LOCAL_REPO;
      var brc = document.getElementById('brLocalClear'); if (brc) brc.hidden = false;
      setLocalNote(true);
      if (brModeParam === 'remote') { if (!restoreBranchCache('remote')) runBranches(); }
      else { activateLocalMode(); }
      updateBranchesActions();
    } else {
      restoreWorkspace().then(function () {
        var savedMode = null; try { savedMode = localStorage.getItem('tippani.brMode'); } catch (e) { }
        var wantLocal = brModeParam === 'local' || (brModeParam !== 'remote' && savedMode === 'local');
        if (wantLocal) { activateLocalMode(); }
        else { if (!restoreBranchCache('remote')) runBranches(); }
        updateBranchesActions();
      });
    }
    // Deep-link a query (e.g. from the search_work_items tool): prefill + run.
    if (HAS_WORK_ITEMS) {
      var qWiql = params.get('wiql');
      if (qWiql) {
        var qp = params.get('project');
        var box = document.getElementById('wiQuery'); if (box) box.value = qWiql;
        var sel = document.getElementById('wiProject');
        if (sel && qp) { for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].value === qp) sel.selectedIndex = i; } }
        runWiql();
      } else {
        // No deep-link: run the default query (Features, last 30 days, assigned
        // to me) so the ADO Work items tab shows results on load.
        runWiql();
      }
    }
    // Deep-link a spec search (e.g. from the search_specs tool): prefill + run.
    var qSpec = params.get('q');
    if (qSpec) {
      var sp = params.get('project');
      var sbox = document.getElementById('spQuery'); if (sbox) sbox.value = qSpec;
      var ssel = document.getElementById('spProject');
      if (ssel && sp) { for (var j = 0; j < ssel.options.length; j++) { if (ssel.options[j].value === sp) ssel.selectedIndex = j; } }
      runSpecSearch();
    }
  });
<\/script></head><body>
  ${renderCrumbBar([{ label: "Home" }], { padTop: 40, padX: 24, right: renderBrand("discovery") })}
  <div class="container">
    <h1>Discovery</h1>
    <div class="sub">${isGitHub
      ? "Find a spec, review, or branch across your GitHub repositories."
      : "Find what to work on \u2014 a finished spec to read, a review to pick up, or a work item to open in ADO."}</div>
    <div class="tabs">
      <button class="tab" data-tab="specs" type="button">Specs</button>
      <button class="tab" data-tab="queue" type="button">Review queue</button>
      ${isGitHub ? "" : '<button class="tab" data-tab="workitems" type="button">Work items</button>'}
      <button class="tab" data-tab="branches" type="button">Branches</button>
      <button class="tab" data-tab="openfile" type="button">Reading list</button>
    </div>

    <div class="pane" data-pane="queue">
      <div class="q-search"><input id="qSearch" type="search" placeholder="Filter by title or author\u2026"></div>
      <div class="wi-actions"><span id="qStatus" class="wi-status">${escHtml(discoveryError)}</span><button id="qSearchBtn" class="wi-search" type="button">Search</button></div>
      <div class="br-new-row"><button id="prNewBtn" class="br-new-btn" type="button">\u002b New pull request</button></div>
      <div class="pr-create-panel" id="prCreatePanel" hidden>
        <div class="wi-row br-create-row">
          <div class="br-field"><label>${isGitHub ? "Owner" : "Project"}</label><select id="prCreateProject" class="wi-project">${projectOptions || `<option value="${escHtml(project || "")}">${escHtml(project || "(configured project)")}</option>`}</select></div>
          <div class="br-field"><label>Repository</label><select id="prCreateRepo" class="wi-project"><option value="">Loading\u2026</option></select></div>
        </div>
        <div class="wi-row br-create-row">
          <div class="br-field"><label>Source branch</label><select id="prCreateSource" class="wi-project"><option value="">Select a repository</option></select></div>
          <div class="br-field"><label>Target branch</label><select id="prCreateTarget" class="wi-project"><option value="main">main</option></select></div>
        </div>
        <div class="wi-row br-create-row">
          <div class="br-field"><label>Title</label><input id="prCreateTitle" class="br-create-input" type="text"></div>
        </div>
        <div class="wi-row br-create-row">
          <div class="br-field"><label>Description</label><textarea id="prCreateDescription" class="br-create-input"></textarea></div>
        </div>
        ${isGitHub ? "" : `<div class="wi-row br-create-row">
          <div class="br-field"><label>Work item title (optional)</label><input id="prCreateWorkItemTitle" class="br-create-input" type="text"></div>
          <div class="br-field"><label>Work item type</label><input id="prCreateWorkItemType" class="br-create-input" type="text" placeholder="Required when title is set"></div>
        </div>`}
        <div class="pr-create-actions">
          <label class="pr-draft-toggle"><input id="prCreateDraft" type="checkbox" checked> Draft</label>
          <span id="prCreateStatus" class="wi-status"></span>
          <button id="prCreateBtn" class="wi-search" type="button">Stage PR</button>
        </div>
      </div>
      <div class="pr-list" id="qPrList">${rows || '<div class="empty">Nothing in your review queue.</div>'}</div>
    </div>

    ${isGitHub ? "" : `<div class="pane" data-pane="workitems">
      <div class="wi-row">
        <span class="wi-label">Project</span>
        <select id="wiProject" class="wi-project">${projectOptions || `<option value="${escHtml(project || "")}">${escHtml(project || "(configured project)")}</option>`}</select>
        <span class="wi-note">The query runs against the selected Azure DevOps project.</span>
      </div>
      <textarea id="wiQuery" class="wi-query" spellcheck="false">${escHtml(sampleWiql)}</textarea>
      <div class="wi-note" style="margin-top:8px">Enter a WIQL <code>SELECT</code> against <code>workitems</code>. Results open the item in Azure DevOps (\u2197).</div>
      <div class="wi-actions"><span id="wiStatus" class="wi-status">${escHtml(discoveryError)}</span><button id="wiSearchBtn" class="wi-search" type="button">Search</button></div>
      <div id="wiResults"></div>
    </div>`}

    <div class="pane" data-pane="specs">
      <div class="wi-row">
        <span class="wi-label">${isGitHub ? "Owner" : "Project"}</span>
        <select id="spProject" class="wi-project">${projectOptions || `<option value="${escHtml(project || "")}">${escHtml(project || "(configured project)")}</option>`}</select>
        <span class="wi-note">Full-text search over specs in the selected ${isGitHub ? "owner namespace" : "project"}.</span>
      </div>
      <div class="sp-searchrow">
        <input id="spQuery" class="sp-query" type="search" spellcheck="false" placeholder="Keyword search on file name and content">
      </div>
      <div class="wi-actions"><span id="spStatus" class="wi-status">${escHtml(discoveryError)}</span><button id="spSearchBtn" class="wi-search" type="button">Search</button></div>
      <div id="spResults"></div>
      <div class="wi-note" style="margin-top:12px">Results are <code>.md</code> specs from ${isGitHub ? "GitHub Code Search" : "Azure DevOps Code Search"}. Opening a result shows it read-only at its default branch.</div>
    </div>

    <div class="pane" data-pane="branches">
      <div class="br-modes">
        <button class="br-mode-btn active" data-mode="remote" type="button">Remote</button>
        <button class="br-mode-btn" data-mode="local" type="button">Local</button>
      </div>
      <div class="br-source" data-source="remote">
        <div class="wi-row">
          <span class="wi-label">${isGitHub ? "Owner" : "Project"}</span>
          <select id="brProject" class="wi-project">${projectOptions || `<option value="${escHtml(project || "")}">${escHtml(project || "(configured project)")}</option>`}</select>
          <span class="wi-note">Your branches across the repos in the selected ${isGitHub ? "owner namespace" : "project"}.</span>
        </div>
      </div>
      <div class="br-source" data-source="local" hidden>
        <div class="wi-row">
          <span class="wi-label">Repo</span>
          <div class="br-ws-field">
            <input id="brLocalPath" class="br-local-input" type="text" spellcheck="false" placeholder="Type a repo path, or click Browse…">
            <button id="brLocalClear" class="br-ws-clear" type="button" title="Clear" hidden>×</button>
          </div>
          <button id="brBrowseBtn" class="wi-search" type="button">Browse…</button>
        </div>
        <div id="brLocalNote" class="wi-note">Type a local repo path or Browse to one; its branches are listed.</div>
      </div>
      <div class="wi-actions" id="brActions"><span id="brStatus" class="wi-status"></span><button id="brRefreshBtn" class="wi-search" type="button">Refresh</button></div>
      <div id="brNewWrap">
        <div class="br-new-row">
          <button id="brNewBtn" class="br-new-btn" type="button">\u002b New branch</button>
        </div>
        <div class="br-create-panel" id="brCreatePanel" hidden>
          <div class="wi-row br-create-row">
            <div class="br-field">
              <label>Repo</label>
              <select id="brCreateRepo" class="wi-project"><option value="">Load branches first\u2026</option></select>
            </div>
            <div class="br-field">
              <label>Branch name</label>
              <input id="brCreateName" class="br-create-input" type="text" spellcheck="false" placeholder="${escHtml(branchPlaceholder)}">
            </div>
            <div class="br-field">
              <label>Parent branch</label>
              <select id="brCreateBase" class="wi-project"><option value="main">main</option></select>
            </div>
            <button id="brCreateBtn" class="wi-search" type="button">Stage</button>
          </div>
          <div id="brCreateStatus" class="wi-note"></div>
        </div>
      </div>
      <div id="brResults"></div>
    </div>

    <div class="pane" data-pane="openfile">
      <div class="wi-row">
        <span class="wi-label">File</span>
        <div class="br-ws-field">
          <input id="ofPath" class="br-local-input" type="text" spellcheck="false" placeholder="Type or paste a path to a .md file, or click Browse\u2026">
        </div>
        <button id="ofBrowseBtn" class="wi-search" type="button">Browse\u2026</button>
      </div>
      <div class="wi-actions"><span id="ofStatus" class="wi-status"></span><button id="ofOpenBtn" class="wi-search" type="button">Add</button></div>
      <div class="wi-note">Add any local <code>.md</code> file to your spec list — it's remembered across restarts. Click a file to open it read-only.</div>
      <div id="ofError"></div>
      <div id="clList"></div>
    </div>
  </div>
${NAV_WATCHER}
</body></html>`;
}

// --- Single-thread view + reply page (used for PR-level threads that have no
// file anchor, so they still get a "jump in and reply" experience).
function buildThreadPage(pr, thread, draft, isViewed = false, viewedError = null) {
  const prId = pr.pullRequestId;
  const tid = thread.id;
  const file = thread.threadContext?.filePath || null;
  const line = thread.threadContext?.rightFileStart?.line || null;
  const anchor = file ? `${file.split("/").pop()}${line ? ":" + line : ""}` : "PR-level comment";
  const resolved = thread.status === 2 || thread.status === 4;
  const draftContent = (draft && draft.content) || "";

  const commentsHtml = (thread.comments || []).map((c) => {
    const who = escHtml(c.author?.displayName || "Unknown");
    const when = c.publishedDate ? escHtml(new Date(c.publishedDate).toLocaleString()) : "";
    const body = escHtml(c.content || "");
    return `<div class="tc">
      <div class="tc-head"><span class="tc-who">${who}</span><span class="tc-when">${when}</span></div>
      <div class="tc-body">${body}</div>
    </div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tippani \u2014 PR #${prId} \u2014 Thread ${tid}</title>
<style>
${cssVariables()}
* { margin: 0; padding: 0; box-sizing: border-box; }
html { height: 100%; }
body { font-family: "Segoe UI", Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif; background: var(--cp-bg); color: var(--cp-text); min-height: 100%; display: flex; flex-direction: column; align-items: center; padding: 48px 24px; }
.brand-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
.logo { width: 32px; height: 32px; border-radius: 8px; background: var(--cp-accent); display: flex; align-items: center; justify-content: center; color: var(--cp-accent-fg); font-size: 12px; font-weight: 700; }
.brand-text { font-size: 15px; font-weight: 600; }
.brand-text-sub { font-size: 13px; font-weight: 400; color: var(--cp-text-muted); }
.container { width: 100%; max-width: 720px; }
.th-head { display: flex; align-items: baseline; justify-content: center; margin-bottom: 4px; }
.th-head h1 { font-size: 18px; font-weight: 700; }
.back { font-size: 13px; color: var(--cp-accent); text-decoration: none; }
.th-sub { font-size: 13px; color: var(--cp-text-muted); margin-bottom: 18px; text-align: center; }
.tc { background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 12px; padding: 14px 18px; margin-bottom: 8px; }
.tc-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
.tc-who { font-size: 13px; font-weight: 600; }
.tc-when { font-size: 12px; color: var(--cp-text-muted); }
.tc-body { font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
.reply-wrap { margin-top: 18px; }
.reply-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--cp-text-muted); margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
.reply-hint { font-size: 12px; color: var(--cp-text-muted); margin-top: 6px; }
.draft-badge { display: none; padding: 2px 8px; border-radius: 99px; font-size: 10px; font-weight: 600; background: var(--cp-accent-soft); color: var(--cp-accent); }
textarea { width: 100%; min-height: 120px; padding: 12px 14px; border: 1px solid var(--cp-border-strong); border-radius: 10px; background: var(--cp-surface); color: var(--cp-text); font-family: inherit; font-size: 13px; line-height: 1.5; resize: vertical; }
textarea:focus { outline: 2px solid var(--cp-accent); outline-offset: 1px; }
.actions { display: flex; gap: 10px; margin-top: 12px; }
.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: 1px solid var(--cp-border-strong); background: var(--cp-surface); color: var(--cp-text); cursor: pointer; }
.btn-primary { background: var(--cp-accent); color: var(--cp-accent-fg); border-color: var(--cp-accent); }
.btn:disabled { opacity: 0.6; cursor: default; }
<\/style>
<script>
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme = 'dark';
<\/script>
</head>
<body>
  ${renderCrumbBar([{ label: "Home", href: "/discovery" }, { label: `PR #${prId}`, href: "/" }, { label: "Feedback", href: "/feedback" }, { label: "Thread" }], { padTop: 48, padX: 24, right: renderBrand("thread") })}
  <div class="container">
    <div class="th-head">
      <h1>${escHtml(anchor)}</h1>
    </div>
    <div class="th-sub">PR #${prId} \u00b7 thread ${tid}${resolved ? " \u00b7 resolved" : ""}${isViewed ? " \u00b7 viewed" : ""}</div>
    ${viewedWarning(viewedError)}
    ${commentsHtml}
    <div class="reply-wrap">
      <div class="reply-label">Your reply <span class="draft-badge" id="draftBadge">staged by agent</span></div>
      <textarea id="reply" placeholder="Write a reply\u2026">${escHtml(draftContent)}</textarea>
      <div class="reply-hint">Posted replies appear above. Text here is a draft \u2014 nothing is sent until you press Post reply.</div>
      <div class="actions">
        <button class="btn btn-primary" id="postBtn">Post reply</button>
        <button class="btn" id="viewedBtn">${isViewed ? "Viewed \u2713" : "Mark viewed"}</button>
        <button class="btn" id="resolveBtn"${resolved ? " disabled" : ""}>${resolved ? "Resolved" : "Resolve"}</button>
        <button class="btn" id="clearBtn" style="display:${draftContent ? "inline-block" : "none"};">Discard draft</button>
      </div>
    </div>
  </div>
<script>
  const TID = ${tid};
  const box = document.getElementById('reply');
  const draftBadge = document.getElementById('draftBadge');
  const clearBtn = document.getElementById('clearBtn');
  let dirty = false;
  if (box.value) draftBadge.style.display = 'inline-block';
  box.addEventListener('input', () => { dirty = true; draftBadge.style.display = 'none'; if (clearBtn) clearBtn.style.display = 'none'; });
  async function post() {
    const content = box.value.trim();
    if (!content) return;
    const btn = document.getElementById('postBtn');
    btn.disabled = true; btn.textContent = 'Posting\u2026';
    try {
      const r = await fetch('/api/v1/threads/' + TID + '/reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
      if (r.ok) { try { await fetch('/api/v1/threads/' + TID + '/draft', { method: 'DELETE' }); } catch {} location.reload(); }
      else { const e = await r.json().catch(() => ({})); alert('Post failed: ' + (e.error || r.status)); btn.disabled = false; btn.textContent = 'Post reply'; }
    } catch (e) { alert('Post failed: ' + e); btn.disabled = false; btn.textContent = 'Post reply'; }
  }
  async function clearDraft() {
    try { await fetch('/api/v1/threads/' + TID + '/draft', { method: 'DELETE' }); } catch {}
    box.value = ''; dirty = true; draftBadge.style.display = 'none'; if (clearBtn) clearBtn.style.display = 'none';
  }
  document.getElementById('postBtn').onclick = post;
  document.getElementById('clearBtn').onclick = clearDraft;
  async function act(path, verb) {
    try {
      const r = await fetch('/api/v1/threads/' + TID + path, { method: verb });
      if (r.ok) { location.href = '/feedback'; }
      else { const e = await r.json().catch(() => ({})); alert('Failed: ' + (e.error || r.status)); }
    } catch (e) { alert('Failed: ' + e); }
  }
  const vb = document.getElementById('viewedBtn'); if (vb) vb.onclick = () => act('/viewed', ${isViewed ? "'DELETE'" : "'POST'"});
  const rb = document.getElementById('resolveBtn'); if (rb && !rb.disabled) rb.onclick = () => act('/resolve', 'POST');
  async function poll() {
    try {
      const r = await fetch('/api/v1/threads/' + TID);
      if (r.ok) { const t = await r.json(); const c = t.draft && t.draft.content;
        if (c && !dirty && box.value !== c) { box.value = c; draftBadge.style.display = 'inline-block'; if (clearBtn) clearBtn.style.display = 'inline-block'; } }
    } catch {}
  }
  setInterval(poll, 1500);
<\/script>
${NAV_WATCHER}
</body>
</html>`;
}

// --- Read-only spec view (Discovery spec search results open here) ---
// Matches the file-review page's design: a Contents (TOC) pane on the left and a
// Build the flat review-history thread cards (used by the async /spec/history
// endpoint). Kept separate from buildReadonlySpecPage so the page can render
// immediately and fetch this heavier payload (commit->PR mapping + per-comment
// markdown render) afterward.
function buildHistoryCardsHtml(history, specPath) {
  const fileName = escHtml(String(specPath).split("/").pop());
  if (!history || !history.length) {
    return '<div class="ro-empty">No review comments anchored to this file were found in closed PRs.</div>';
  }
  return history.flatMap((entry) => {
    const pr = entry.pr;
    const when = pr.closedDate ? new Date(pr.closedDate).toLocaleDateString() : (pr.creationDate ? new Date(pr.creationDate).toLocaleDateString() : "");
    const st = (pr.status === 2 || pr.status === "abandoned") ? "Abandoned" : "Completed";
    return entry.threads.map((t) => {
      const line = t.threadContext?.rightFileStart?.line || t.threadContext?.leftFileStart?.line || null;
      const resolved = (t.status === 2 || t.status === 4);
      const comments = t.comments || [];
      const first = comments[0];
      const firstWho = escHtml(first?.author?.displayName || "Unknown");
      const firstSnippet = escHtml(String(first?.content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 90));
      const commentsHtml = comments.map((c) => {
        const who = escHtml(c.author?.displayName || "Unknown");
        const cwhen = c.publishedDate ? escHtml(new Date(c.publishedDate).toLocaleDateString()) : "";
        const bodyC = c._html || escHtml(c.content || "");
        return `<div class="rh-comment"><div class="rh-cmeta"><span class="rh-who">${who}</span><span class="rh-when">${cwhen}</span></div><div class="rh-body">${bodyC}</div></div>`;
      }).join("");
      return `<div class="rh-thread"${line ? ` data-line="${line}"` : ""} data-pr="${pr.pullRequestId}">`
        + `<div class="rh-head"><span class="rh-badge">PR #${pr.pullRequestId}</span><span class="rh-hline">${line ? ":" + line : ""}</span>${resolved ? '<span class="rh-res" title="Resolved">\u2713</span>' : ""}<span class="rh-count">${comments.length}</span></div>`
        + `<div class="rh-summary"><span class="rh-who">${firstWho}</span> ${firstSnippet}</div>`
        + `<div class="rh-full"><div class="rh-anchor">${fileName}${line ? ":" + line : ""} \u00b7 ${st}${when ? " \u00b7 " + when : ""}</div>${commentsHtml}</div>`
        + `</div>`;
    });
  }).join("");
}

// Review History pane on the right (the comment threads anchored to this file
// across the closed PRs that touched it), around the rendered spec. Both panes
// collapse to a rail with << / >> arrows — Contents shown, History hidden by
// default. The history is fetched asynchronously (historyUrl) so the page paints
// without waiting on the ADO round-trips. Read-only: no edit / save / reply.
// Discovery branch page: list a branch's markdown files as a read-only review
// surface. Each file opens the existing read-only /spec page (which already
// carries the comment/threads pane, where branch comments will render once the
// Comments feature lands). READMEs are hidden by default with a checkbox to
// reveal them, matching the Specs "Included" README facet. Row shaping is pure
// (branch-files.js).
function buildBranchPage({ repoName, project, ref, rows, backHref, adoUrl, error, mode, staged }) {
  const title = (repoName ? repoName + " \u00b7 " : "") + (ref || "");
  const back = backHref || "/discovery?tab=branches";
  const modeBadge = staged
    ? `<span class="ro-mode" style="background:var(--cp-border);color:var(--cp-text-muted)">Staged</span>`
    : (mode ? `<span class="ro-mode ro-mode-${mode}">${mode === "local" ? "Local" : "Remote"}</span>` : "");
  const initialCount = visibleFileCount(rows, false);
  const isLocal = mode === "local";
  const _firstRow = (rows || []).find((r) => !r.isReadme) || (rows || [])[0] || null;
  const defaultFolder = _firstRow && _firstRow.dir ? String(_firstRow.dir).replace(/^\/+|\/+$/g, "") : "";
  const readmeTotal = (rows || []).filter((r) => r.isReadme).length;
  const listHtml = (rows || []).length
    ? `<div class="pr-list">` + rows.map((r) => {
        const dir = r.dir ? `<div class="bp-dir">${escHtml(r.dir)}</div>` : "";
        const cls = "pr-card bp-file" + (r.isReadme ? " bp-readme" : "");
        const inner = `${dir}<div class="pr-title">${escHtml(r.name)}</div>`;
        // A row with no href renders as a plain card (the local file list is
        // display-only until the review step wires opening).
        return r.href
          ? `<a class="${cls}" data-path="${escHtml(r.path)}" href="${escHtml(r.href)}"${r.isReadme ? ' hidden' : ""}>${inner}</a>`
          : `<div class="${cls}" data-path="${escHtml(r.path)}"${r.isReadme ? ' hidden' : ""}>${inner}</div>`;
      }).join("") + `</div>`
    : "";
  const emptyHtml = error
    ? `<div class="bp-empty">${escHtml(error)}</div>`
    : (rows || []).length ? "" : `<div class="bp-empty">${staged ? "No files yet \u2014 this branch is staged. Add a spec, then Push to remote to create it in ADO." : "No markdown files in this branch."}</div>`;
  const readmeToggle = readmeTotal
    ? `<label class="bp-check"><input type="checkbox" id="bpShowReadme"> Show Readme.md</label>`
    : "";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title)} \u2014 Tippani</title>
<style>
${cssVariables()}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: "Segoe UI", Aptos, Calibri, -apple-system, sans-serif; background: var(--cp-bg); color: var(--cp-text); }
.ro-topbar { display: flex; align-items: center; gap: 14px; height: 48px; padding: 0 20px; border-bottom: 1px solid var(--cp-border); background: var(--cp-bg-elevated); position: sticky; top: 0; z-index: 20; }
.ro-back { font-size: 13px; font-weight: 600; color: var(--cp-accent); text-decoration: none; white-space: nowrap; }
.ro-back:hover { text-decoration: underline; }
.ro-topbar-title { flex: 1 1 auto; min-width: 0; font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ro-mode { flex: 0 0 auto; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.4px; white-space: nowrap; background: var(--cp-accent-soft); color: var(--cp-accent); }
.ro-mode-local { background: rgba(47,143,78,0.16); color: #2f8f4e; }
[data-theme="dark"] .ro-mode-local { background: rgba(90,190,120,0.18); color: #6ecb8b; }
.bp-wrap { max-width: 820px; margin: 0 auto; padding: 24px 20px 60px; }
.bp-head { text-align: center; padding: 0 20px 10px; }
.bp-head h1 { font-size: 19px; font-weight: 700; line-height: 1.3; word-break: break-all; }
.bp-sub { font-size: 13px; color: var(--cp-text-muted); margin-top: 3px; }
.bp-toolbar { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
.bp-count { font-size: 13px; font-weight: 600; color: var(--cp-text-muted); }
.bp-check { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--cp-text); cursor: pointer; margin-left: auto; }
.bp-check input { cursor: pointer; }
.pr-list { display: flex; flex-direction: column; gap: 8px; }
.pr-card { display: block; padding: 12px 14px; border: 1px solid var(--cp-border); border-radius: 10px; background: var(--cp-surface); text-decoration: none; color: var(--cp-text); transition: box-shadow 0.15s, border-color 0.15s; }
.pr-card:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.08); border-color: var(--cp-accent); }
.bp-file[hidden] { display: none; }
.bp-dir { font-size: 11px; color: var(--cp-text-muted); margin-bottom: 2px; }
.pr-title { font-size: 14px; font-weight: 600; }
.bp-readme .pr-title::after { content: " \u00b7 readme"; font-weight: 400; font-size: 11px; color: var(--cp-text-muted); }
.bp-empty { font-size: 13px; color: var(--cp-text-muted); padding: 20px 0; }
.bp-newfile-row { display: flex; justify-content: flex-end; margin-bottom: 8px; }
.br-new-btn { font-family: inherit; font-size: 13px; font-weight: 600; color: var(--cp-accent); background: none; border: 1px dashed var(--cp-border); border-radius: 8px; padding: 6px 12px; cursor: pointer; }
.br-new-btn:hover { border-color: var(--cp-accent); }
.bp-newfile-panel { margin-bottom: 14px; }
.bp-newfile-form { display: flex; flex-direction: column; align-items: stretch; gap: 12px; }
.bp-newfile-form .br-field { flex: 0 0 auto; }
.br-field { display: flex; flex-direction: column; gap: 4px; flex: 1 1 220px; min-width: 160px; }
.br-field > label { font-size: 11px; font-weight: 600; color: var(--cp-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.br-field > input { width: 100%; box-sizing: border-box; height: 32px; font-family: inherit; font-size: 13px; padding: 6px 10px; border: 1px solid var(--cp-border); border-radius: 8px; background: var(--cp-surface); color: var(--cp-text); outline: none; }
.wi-search { font-family: inherit; font-size: 13px; font-weight: 700; color: var(--cp-accent-fg); background: var(--cp-accent); border: none; border-radius: 8px; height: 32px; padding: 0 16px; cursor: pointer; }
.wi-note { font-size: 12px; color: var(--cp-text-muted); margin-top: 6px; }
.wi-note.is-error { color: #d13438; }
.br-staged-badge { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: var(--cp-text-muted); background: var(--cp-border); padding: 1px 8px; border-radius: 99px; margin-left: 8px; }
.bp-staged-file { display: flex; align-items: center; gap: 8px; opacity: 0.72; border-style: dashed; }
.bp-file.bp-edited { border-color: var(--cp-accent); }
.bp-staged-file .pr-title { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bp-staged-link { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; color: inherit; text-decoration: none; }
.bp-staged-link:hover .pr-title { color: var(--cp-accent); text-decoration: underline; }
.bp-folder-row { display: flex; gap: 8px; align-items: center; }
.bp-title-row { display: flex; gap: 8px; align-items: center; }
.bp-folder-row > input, .bp-title-row > input { flex: 1 1 auto; min-width: 0; box-sizing: border-box; height: 32px; font-family: inherit; font-size: 13px; padding: 6px 10px; border: 1px solid var(--cp-border); border-radius: 8px; background: var(--cp-surface); color: var(--cp-text); outline: none; }
.bp-title-row > input[aria-invalid="true"] { border-color: #d13438; }
.bp-form-action { flex: 0 0 82px; display: inline-flex; align-items: center; justify-content: center; width: 82px; height: 32px; box-sizing: border-box; padding: 0; border: 1px solid var(--cp-border); border-radius: 8px; font-family: inherit; font-size: 13px; font-weight: 600; line-height: 1; appearance: none; cursor: pointer; }
.bp-form-action.wi-search { height: 28px; border-color: var(--cp-accent); border-radius: 4px; }
.wi-search:disabled { opacity: 0.5; cursor: default; }
.bp-browse-btn { color: var(--cp-accent); background: var(--cp-surface); }
.bp-browse-btn:hover { border-color: var(--cp-accent); }
.fp-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 200; display: flex; align-items: center; justify-content: center; }
.fp-overlay[hidden] { display: none; }
.fp-dialog { width: 560px; max-width: 92vw; max-height: 82vh; display: flex; flex-direction: column; background: var(--cp-bg-elevated, #22272e); border: 1px solid var(--cp-border); border-radius: 12px; box-shadow: 0 18px 50px rgba(0,0,0,0.5); overflow: hidden; }
.fp-titlebar { display: flex; align-items: flex-start; gap: 10px; padding: 12px 16px; background: var(--cp-surface); border-bottom: 1px solid var(--cp-border); }
.fp-titlewrap { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.fp-subtitle { font-size: 12px; font-weight: 400; color: var(--cp-text-muted); line-height: 1.35; }
.fp-title { font-size: 14px; font-weight: 700; }
.fp-x { flex: 0 0 auto; background: none; border: none; color: var(--cp-text-muted); font-size: 15px; cursor: pointer; padding: 2px 6px; border-radius: 6px; }
.fp-x:hover { background: var(--cp-border); color: var(--cp-text); }
.fp-toolbar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--cp-border); }
.fp-crumbs { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 3px; font-size: 12px; color: var(--cp-text-muted); overflow: hidden; white-space: nowrap; }
.fp-crumb { color: var(--cp-accent); cursor: pointer; }
.fp-crumb:hover { text-decoration: underline; }
.fp-crumb-sep { color: var(--cp-text-muted); }
.fp-spacer { flex: 0 0 auto; }
.fp-btn { font-family: inherit; font-size: 12px; font-weight: 600; color: var(--cp-text); background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 8px; height: 30px; padding: 0 12px; cursor: pointer; white-space: nowrap; }
.fp-btn:hover:not(:disabled) { border-color: var(--cp-accent); }
.fp-btn:disabled { opacity: 0.5; cursor: default; }
.fp-primary { background: var(--cp-accent); color: var(--cp-accent-fg); border-color: var(--cp-accent); }
.fp-del { color: var(--cp-danger, #d13438); }
.fp-tbtitle { font-size: 12px; font-weight: 700; color: var(--cp-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.fp-newbar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--cp-border); background: var(--cp-surface-soft); }
.fp-newbar[hidden] { display: none; }
.fp-newbar input { flex: 0 1 220px; height: 30px; font-family: inherit; font-size: 13px; padding: 0 10px; border: 1px solid var(--cp-accent); border-radius: 8px; background: var(--cp-surface); color: var(--cp-text); outline: none; }
.fp-newnote { flex: 1 1 auto; font-size: 12px; color: var(--cp-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fp-tree { flex: 1 1 auto; overflow-y: auto; padding: 6px; min-height: 260px; }
.fp-children[hidden] { display: none; }
.fp-row { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 8px; cursor: pointer; font-size: 13px; user-select: none; }
.fp-exp { flex: 0 0 auto; width: 16px; text-align: center; font-size: 13px; font-weight: 700; line-height: 1; color: var(--cp-text-muted); cursor: pointer; }
.fp-exp.fp-leaf { cursor: default; color: transparent; }
.fp-row:hover { background: var(--cp-surface-soft); }
.fp-row.fp-sel { background: var(--cp-accent-soft); }
.fp-row .fp-ico { flex: 0 0 auto; font-size: 15px; }
.fp-row .fp-name { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fp-row .fp-tag { flex: 0 0 auto; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: var(--cp-text-muted); background: var(--cp-border); padding: 1px 7px; border-radius: 99px; }
.fp-empty, .fp-loading { font-size: 12px; color: var(--cp-text-muted); padding: 6px 8px; }
.fp-hint { padding: 8px 16px; font-size: 12px; color: var(--cp-text-muted); border-bottom: 1px solid var(--cp-border); }
.fp-rename-input { flex: 1 1 auto; min-width: 0; height: 26px; font-family: inherit; font-size: 13px; padding: 0 8px; border: 1px solid var(--cp-accent); border-radius: 6px; background: var(--cp-surface); color: var(--cp-text); outline: none; }
.fp-menu { position: fixed; z-index: 210; min-width: 150px; background: var(--cp-bg-elevated, #22272e); border: 1px solid var(--cp-border); border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); padding: 4px; display: flex; flex-direction: column; }
.fp-menu[hidden] { display: none; }
.fp-menu-item { text-align: left; font-family: inherit; font-size: 13px; color: var(--cp-text); background: none; border: none; border-radius: 6px; padding: 7px 12px; cursor: pointer; }
.fp-menu-item:hover:not(:disabled) { background: var(--cp-surface-soft); }
.fp-menu-item:disabled { opacity: 0.4; cursor: default; }
.fp-newrow { display: flex; align-items: center; gap: 6px; padding: 6px 10px; }
.fp-newrow input { flex: 1 1 auto; height: 30px; font-family: inherit; font-size: 13px; padding: 0 10px; border: 1px solid var(--cp-accent); border-radius: 8px; background: var(--cp-surface); color: var(--cp-text); outline: none; }
.fp-footer { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-top: 1px solid var(--cp-border); background: var(--cp-surface); }
.fp-selected { flex: 1 1 auto; min-width: 0; font-size: 12px; color: var(--cp-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fp-selected span { color: var(--cp-text); font-weight: 600; }
.fp-actions { flex: 0 0 auto; display: flex; gap: 8px; }
.br-staged-del { flex: 0 0 auto; background: none; border: none; cursor: pointer; font-size: 18px; line-height: 1; padding: 4px 8px; border-radius: 6px; opacity: 0.8; }
.br-staged-del:hover { opacity: 1; background: var(--cp-border); }
</style>
<script>
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme = 'dark';
<\/script></head>
<body>
${renderCrumbBar([{ label: "Home", href: "/discovery" }, { label: "Branch" }], { right: modeBadge })}

<div class="bp-head">
  <h1>${escHtml(ref || title)}</h1>
  <div class="bp-sub">${escHtml(repoName || "")}${project ? " \u00b7 " + escHtml(project) : ""}</div>
</div>

<div class="bp-wrap">
  ${isLocal ? "" : `<div class="bp-newfile-row">
    <button id="bpNewFileBtn" class="br-new-btn" type="button">\u002b New md file</button>
  </div>
  <div class="bp-newfile-panel" id="bpNewFilePanel" hidden>
    <div class="bp-newfile-form">
      <div class="br-field bp-folder-field"><label>Folder</label>
        <div class="bp-folder-row">
          <input id="bpNewFileFolder" class="br-create-input" type="text" readonly placeholder="Choose a folder\u2026">
          <button id="bpBrowseBtn" class="bp-form-action bp-browse-btn" type="button">Browse\u2026</button>
        </div>
      </div>
      <div class="br-field"><label>Spec title</label>
        <div class="bp-title-row">
          <input id="bpNewFileTitle" class="br-create-input" type="text" spellcheck="false" placeholder="My New Spec">
          <button id="bpNewFileStage" class="bp-form-action wi-search" type="button" disabled>Stage</button>
        </div>
      </div>
    </div>
    <div id="bpNewFileStatus" class="wi-note"></div>
  </div>
  <div class="fp-overlay" id="fpOverlay" hidden>
    <div class="fp-dialog" role="dialog" aria-modal="true" aria-label="Select folder">
      <div class="fp-titlebar"><div class="fp-titlewrap"><span class="fp-title">Select folder</span><span class="fp-subtitle">Select a folder or right-click one to create a new folder, rename, or delete it (empty folders only).</span></div><button class="fp-x" id="fpClose" type="button" aria-label="Close">\u2715</button></div>
      <div class="fp-tree" id="fpTree"></div>
      <div class="fp-footer">
        <div class="fp-selected">Folder: <span id="fpSelectedPath">/</span></div>
        <div class="fp-actions"><button class="fp-btn" id="fpCancel" type="button">Cancel</button><button class="fp-btn fp-primary" id="fpSelect" type="button">Select folder</button></div>
      </div>
      <div class="fp-menu" id="fpMenu" hidden>
        <button class="fp-menu-item" data-act="create" type="button">New folder</button>
        <button class="fp-menu-item" data-act="rename" type="button">Rename</button>
        <button class="fp-menu-item" data-act="delete" type="button">Delete</button>
      </div>
    </div>
  </div>`}
  <div class="bp-toolbar">
    <span class="bp-count" id="bpCount">${initialCount} file${initialCount === 1 ? "" : "s"}</span>
    ${readmeToggle}
  </div>
  <div id="bpFiles">${listHtml}${emptyHtml}</div>
</div>
<script>
(function () {
  var params = new URLSearchParams(location.search);
  var BP = { org: ${jsonForScript(ADO_ORG)}, project: params.get('project')||'', repo: params.get('repo')||'', repoName: params.get('repoName')||'', branch: (params.get('ref')||'').replace('refs/heads/','') };
  function esch(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  var IS_LOCAL = ${isLocal ? "true" : "false"};
  var fpFolderPicked = false, fpFolderValue = '';
  var DEFAULT_FOLDER = ${JSON.stringify(defaultFolder)};
  (function(){
    var fld = document.getElementById('bpNewFileFolder');
    if (!fld) return;
    function norm(p){ p = String(p == null ? '' : p); while (p.charAt(0) === '/') p = p.slice(1); while (p.length && p.charAt(p.length - 1) === '/') p = p.slice(0, -1); return p; }
    var key = 'tippani.folderPick:' + BP.repo + ':' + BP.branch;
    var remembered = null; try { remembered = localStorage.getItem(key); } catch (e) {}
    var val = (remembered !== null) ? norm(remembered) : norm(DEFAULT_FOLDER);
    fpFolderValue = val; fpFolderPicked = true; fld.value = '/' + val;
  })();
  var KEY = 'tippani.brShowReadme';
  var box = document.getElementById('bpShowReadme');
  var countEl = document.getElementById('bpCount');
  var host = document.getElementById('bpFiles');
  function updateCount(){
    var show = box ? box.checked : true;
    var pushed = 0;
    document.querySelectorAll('.bp-file').forEach(function(el){ var isReadme = el.classList.contains('bp-readme'); var hidden = isReadme && !show; el.hidden = hidden; if(!hidden) pushed++; });
    var st = document.querySelectorAll('.bp-staged-file').length;
    var tot = pushed + st;
    if (countEl) countEl.textContent = tot + (tot === 1 ? ' file' : ' files');
  }
  if (box) {
    var saved = false; try { saved = localStorage.getItem(KEY) === '1'; } catch (e) {}
    box.checked = saved;
    box.addEventListener('change', function () { try { localStorage.setItem(KEY, box.checked ? '1' : '0'); } catch (e) {} updateCount(); });
  }
  var newBtn = document.getElementById('bpNewFileBtn'), panel = document.getElementById('bpNewFilePanel'),
      titleInput = document.getElementById('bpNewFileTitle'), stageBtn = document.getElementById('bpNewFileStage'),
      statusEl = document.getElementById('bpNewFileStatus');
  if (newBtn && panel) newBtn.addEventListener('click', function(){ panel.hidden = !panel.hidden; if(!panel.hidden && titleInput) titleInput.focus(); });
  async function stageNewFile(){
    var title = (titleInput.value||'').trim();
    if (!title) { statusEl.textContent = 'Enter a title.'; return; }
    if (/\\.[^./\\\\]+$/.test(title) && !/\\.md$/i.test(title)) { titleInput.setAttribute('aria-invalid','true'); statusEl.classList.add('is-error'); statusEl.textContent = 'Only .md files can be added to a branch.'; return; }
    if (!fpFolderPicked) { statusEl.textContent = 'Choose a folder.'; return; }
    if (!BP.repo || !BP.branch) { statusEl.textContent = 'Missing branch context.'; return; }
    statusEl.textContent = 'Staging\u2026';
    try {
      var r = await fetch('/api/v1/files/stage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ org: BP.org, project: BP.project, repo: BP.repo, repoName: BP.repoName, branch: BP.branch, title: title, folder: fpFolderValue })});
      var d = await r.json();
      if (!d || !d.ok) { statusEl.textContent = (d && d.error) || 'Stage failed.'; return; }
      titleInput.value=''; statusEl.textContent=''; if(stageBtn) stageBtn.disabled = true; if(panel) panel.hidden = true;
      renderStagedFiles();
    } catch(e){ statusEl.textContent = 'Failed: '+e.message; }
  }
  if (stageBtn) stageBtn.addEventListener('click', stageNewFile);
  if (stageBtn && titleInput) { var _syncStage = function(){ titleInput.removeAttribute('aria-invalid'); statusEl.classList.remove('is-error'); stageBtn.disabled = !titleInput.value.trim(); }; _syncStage(); titleInput.addEventListener('input', _syncStage); }
  // Folder picker dialog (remote/staged only): a lazy treeview over the branch's
  // folder tree (the parent branch's tree for a staged branch). Create / Rename /
  // Delete are right-click actions; each is a staged change that refreshes the
  // staged counter. Rename/Delete are limited to empty folders you created.
  (function () {
    var browseBtn = document.getElementById('bpBrowseBtn');
    var overlay = document.getElementById('fpOverlay');
    if (!browseBtn || !overlay) return;
    var folderInput = document.getElementById('bpNewFileFolder');
    var treeEl = document.getElementById('fpTree');
    var selPathEl = document.getElementById('fpSelectedPath');
    var menu = document.getElementById('fpMenu');
    var fpMeta = {}, fpSelPath = '', fpSelRow = null, rootRow = null, menuRow = null;
    function disp(p){ return '/' + (p || ''); }
    function foldersUrl(scope){ return '/api/v1/branches/folders?project=' + encodeURIComponent(BP.project) + '&repo=' + encodeURIComponent(BP.repo) + '&repoName=' + encodeURIComponent(BP.repoName) + '&branch=' + encodeURIComponent(BP.branch) + '&scope=' + encodeURIComponent(scope || ''); }
    function updateFooter(){ selPathEl.textContent = disp(fpSelPath); }
    function selectRow(row){
      if (fpSelRow) fpSelRow.classList.remove('fp-sel');
      fpSelRow = row; if (row) row.classList.add('fp-sel');
      fpSelPath = row ? row._path : '';
      updateFooter();
    }
    function setExp(row){
      if (!row._hasChildren){ row._exp.textContent = ''; row._exp.classList.add('fp-leaf'); }
      else { row._exp.classList.remove('fp-leaf'); row._exp.textContent = row._kids.hidden ? '+' : '\u2212'; }
    }
    function mkMsg(text, depth){ var d = document.createElement('div'); d.className = 'fp-empty'; d.style.paddingLeft = (depth * 16 + 8) + 'px'; d.textContent = text; return d; }
    function makeNode(item, depth){
      fpMeta[item.path] = { created: !!item.created, empty: !!item.empty };
      var wrap = document.createElement('div'); wrap.className = 'fp-item';
      var row = document.createElement('div'); row.className = 'fp-row'; row.style.paddingLeft = (depth * 16 + 8) + 'px';
      var exp = document.createElement('span'); exp.className = 'fp-exp';
      var ico = document.createElement('span'); ico.className = 'fp-ico'; ico.textContent = '\uD83D\uDCC1';
      var nm = document.createElement('span'); nm.className = 'fp-name'; nm.textContent = item.name;
      row.appendChild(exp); row.appendChild(ico); row.appendChild(nm);
      if (item.created){ var tag = document.createElement('span'); tag.className = 'fp-tag'; tag.textContent = 'new'; row.appendChild(tag); }
      var kids = document.createElement('div'); kids.className = 'fp-children'; kids.hidden = true; kids._loaded = false; kids._ownerRow = row;
      wrap.appendChild(row); wrap.appendChild(kids);
      row._path = item.path; row._name = item.name; row._kids = kids; row._exp = exp; row._nameEl = nm; row._depth = depth; row._hasChildren = !!item.hasChildren; row._isRoot = (depth === 0);
      setExp(row);
      exp.addEventListener('click', function(e){ e.stopPropagation(); if (row._hasChildren) toggle(row); });
      row.addEventListener('click', function(){ selectRow(row); });
      row.addEventListener('dblclick', function(){ if (row._hasChildren) toggle(row, true); });
      row.addEventListener('contextmenu', function(e){ e.preventDefault(); e.stopPropagation(); selectRow(row); openMenu(row, e.clientX, e.clientY); });
      return wrap;
    }
    async function loadKids(row){
      var kids = row._kids;
      if (kids._loaded) return;
      kids.innerHTML = ''; kids.appendChild(mkMsg('Loading\u2026', row._depth + 1));
      var folders = [];
      try { var r = await fetch(foldersUrl(row._path)); var d = await r.json(); folders = (d && d.folders) || []; } catch(e){}
      kids.innerHTML = '';
      folders.forEach(function(f){ kids.appendChild(makeNode(f, row._depth + 1)); });
      kids._loaded = true;
      row._hasChildren = folders.length > 0;
      setExp(row);
      updateFooter();
    }
    async function toggle(row, forceOpen){
      var willOpen = forceOpen || row._kids.hidden;
      if (willOpen){ await loadKids(row); row._kids.hidden = false; }
      else { row._kids.hidden = true; }
      setExp(row);
    }
    async function refreshNode(row){
      row._kids._loaded = false;
      await loadKids(row);
      row._kids.hidden = false;
      setExp(row);
    }
    function findChildRow(row, path){
      var items = row._kids.querySelectorAll(':scope > .fp-item > .fp-row');
      for (var i = 0; i < items.length; i++){ if (items[i]._path === path) return items[i]; }
      return null;
    }
    async function revealPath(path){
      var segs = path ? path.split('/') : [];
      var cur = rootRow, acc = '';
      for (var i = 0; i < segs.length; i++){
        acc = acc ? acc + '/' + segs[i] : segs[i];
        await toggle(cur, true);
        var child = findChildRow(cur, acc);
        if (!child) break;
        cur = child;
      }
      selectRow(cur);
      if (cur !== rootRow) cur.scrollIntoView({ block: 'nearest' });
    }
    async function initTree(){
      treeEl.innerHTML = ''; fpMeta = {}; fpSelRow = null;
      var rootWrap = makeNode({ path: '', name: '/', created: false, empty: false, hasChildren: true }, 0);
      treeEl.appendChild(rootWrap);
      rootRow = rootWrap.querySelector('.fp-row');
      selectRow(rootRow);
      await toggle(rootRow, true);
      await revealPath(fpFolderValue || '');
    }
    function ownerRowOf(row){ var k = row.closest('.fp-children'); return k ? k._ownerRow : rootRow; }
    // Context menu
    function openMenu(row, x, y){
      menuRow = row;
      var m = fpMeta[row._path] || {};
      var canMutate = !!(m.created && m.empty) && !row._isRoot;
      menu.querySelector('[data-act="rename"]').disabled = !canMutate;
      menu.querySelector('[data-act="delete"]').disabled = !canMutate;
      menu.style.left = x + 'px'; menu.style.top = y + 'px'; menu.hidden = false;
      var r = menu.getBoundingClientRect();
      if (r.right > window.innerWidth) menu.style.left = Math.max(8, window.innerWidth - r.width - 8) + 'px';
      if (r.bottom > window.innerHeight) menu.style.top = Math.max(8, window.innerHeight - r.height - 8) + 'px';
    }
    function closeMenu(){ menu.hidden = true; menuRow = null; }
    menu.addEventListener('click', function(e){
      var btn = e.target.closest('.fp-menu-item'); if (!btn || btn.disabled) return;
      var act = btn.getAttribute('data-act'); var row = menuRow; closeMenu();
      if (!row) return;
      if (act === 'create') startCreate(row);
      else if (act === 'rename') startRename(row);
      else if (act === 'delete') doDelete(row);
    });
    document.addEventListener('click', function(e){ if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
    treeEl.addEventListener('scroll', closeMenu);
    treeEl.addEventListener('contextmenu', function(e){ if (!e.target.closest('.fp-row')) e.preventDefault(); });
    async function startCreate(row){
      await toggle(row, true);
      row._hasChildren = true; setExp(row);
      var editor = document.createElement('div'); editor.className = 'fp-newrow'; editor.style.paddingLeft = ((row._depth + 1) * 16 + 8) + 'px';
      var sp = document.createElement('span'); sp.className = 'fp-exp fp-leaf';
      var ico = document.createElement('span'); ico.className = 'fp-ico'; ico.textContent = '\uD83D\uDCC1';
      var input = document.createElement('input'); input.type = 'text'; input.placeholder = 'New folder name'; input.spellcheck = false;
      editor.appendChild(sp); editor.appendChild(ico); editor.appendChild(input);
      row._kids.insertBefore(editor, row._kids.firstChild);
      input.focus();
      var done = false;
      function cancel(){ if (done) return; done = true; editor.remove(); }
      async function commit(){
        if (done) return;
        var name = (input.value || '').trim();
        if (!name) { input.focus(); return; }
        done = true;
        var full = row._path ? row._path + '/' + name : name;
        try {
          var r = await fetch('/api/v1/branches/folders/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org: BP.org, project: BP.project, repo: BP.repo, branch: BP.branch, path: full }) });
          var d = await r.json();
          if (!d || !d.ok) { alert((d && d.error) || 'Create failed.'); editor.remove(); return; }
        } catch(e){ alert('Create failed: ' + e.message); editor.remove(); return; }
        await refreshNode(row);
        if (window.__tpStagedRefresh) window.__tpStagedRefresh();
      }
      input.addEventListener('keydown', function(e){ e.stopPropagation(); if (e.key === 'Enter'){ e.preventDefault(); commit(); } else if (e.key === 'Escape'){ e.preventDefault(); cancel(); } });
      input.addEventListener('blur', function(){ setTimeout(cancel, 150); });
    }
    function startRename(row){
      if (row._renaming) return; row._renaming = true;
      var nm = row._nameEl; nm.style.display = 'none';
      var input = document.createElement('input'); input.type = 'text'; input.className = 'fp-rename-input'; input.value = row._name; input.spellcheck = false;
      nm.parentNode.insertBefore(input, nm.nextSibling);
      input.focus(); input.select();
      var done = false;
      function finish(){ if (done) return; done = true; row._renaming = false; input.remove(); nm.style.display = ''; }
      async function commit(){
        if (done) return;
        var name = (input.value || '').trim();
        if (!name || name === row._name){ finish(); return; }
        done = true; row._renaming = false;
        try {
          var r = await fetch('/api/v1/branches/folders/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo: BP.repo, branch: BP.branch, path: row._path, newName: name }) });
          var d = await r.json();
          if (!d || !d.ok) { alert((d && d.error) || 'Rename failed.'); input.remove(); nm.style.display = ''; return; }
        } catch(e){ alert('Rename failed: ' + e.message); input.remove(); nm.style.display = ''; return; }
        var owner = ownerRowOf(row);
        await refreshNode(owner);
        selectRow(owner);
        if (window.__tpStagedRefresh) window.__tpStagedRefresh();
      }
      input.addEventListener('keydown', function(e){ e.stopPropagation(); if (e.key === 'Enter'){ e.preventDefault(); commit(); } else if (e.key === 'Escape'){ e.preventDefault(); finish(); } });
      input.addEventListener('blur', function(){ setTimeout(function(){ if (row._renaming) finish(); }, 150); });
    }
    async function doDelete(row){
      var m = fpMeta[row._path] || {};
      if (!(m.created && m.empty) || row._isRoot) return;
      var owner = ownerRowOf(row);
      try {
        var r = await fetch('/api/v1/branches/folders/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo: BP.repo, branch: BP.branch, path: row._path }) });
        var d = await r.json();
        if (!d || !d.ok) { alert((d && d.error) || 'Delete failed.'); return; }
      } catch(e){ alert('Delete failed: ' + e.message); return; }
      await refreshNode(owner);
      selectRow(owner);
      if (window.__tpStagedRefresh) window.__tpStagedRefresh();
    }
    function closeDialog(){ overlay.hidden = true; closeMenu(); }
    browseBtn.addEventListener('click', function(){ overlay.hidden = false; closeMenu(); initTree(); });
    document.getElementById('fpClose').addEventListener('click', closeDialog);
    document.getElementById('fpCancel').addEventListener('click', closeDialog);
    overlay.addEventListener('click', function(e){ if (e.target === overlay) closeDialog(); });
    document.addEventListener('keydown', function(e){ if (!overlay.hidden && e.key === 'Escape'){ if (!menu.hidden) closeMenu(); else closeDialog(); } });
    document.getElementById('fpSelect').addEventListener('click', function(){
      fpFolderValue = fpSelPath; fpFolderPicked = true; folderInput.value = disp(fpSelPath);
      try { localStorage.setItem('tippani.folderPick:' + BP.repo + ':' + BP.branch, fpSelPath); } catch (e) {}
      closeDialog();
    });
  })();
  async function unstageFile(path){
    try { await fetch('/api/v1/files/unstage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ repo: BP.repo, branch: BP.branch, path: path })}); } catch(e){}
    renderStagedFiles();
  }
  async function renderStagedFiles(){
    if(!host) return;
    var mine = [];
    try { var r = await fetch('/api/v1/staged'); if(r.ok){ var d = await r.json(); mine = (d.files||[]).filter(function(f){ return f.repo===BP.repo && f.branch===BP.branch; }); } } catch(e){}
    var mineNew = mine.filter(function(f){ return !f.existing; });
    var mineEdit = mine.filter(function(f){ return !!f.existing; });
    host.querySelectorAll('.bp-staged-file').forEach(function(c){ c.remove(); });
    host.querySelectorAll('.bp-file.bp-edited').forEach(function(el){ el.classList.remove('bp-edited'); var b = el.querySelector('.br-edited-badge'); if (b) b.remove(); });
    var list = host.querySelector('.pr-list');
    var empty = host.querySelector('.bp-empty');
    if (mineNew.length) {
      if (empty) empty.style.display = 'none';
      if (!list) { host.insertAdjacentHTML('afterbegin','<div class="pr-list"></div>'); list = host.querySelector('.pr-list'); }
      var html = mineNew.map(function(f){
        var href = '/staged-file?project='+encodeURIComponent(BP.project)+'&repo='+encodeURIComponent(BP.repo)+'&repoName='+encodeURIComponent(BP.repoName)+'&branch='+encodeURIComponent(BP.branch)+'&path='+encodeURIComponent(f.path);
        var p = f.path || ''; var sl = p.lastIndexOf('/'); var dir = sl >= 0 ? p.slice(0, sl) : '';
        return '<div class="pr-card bp-staged-file"><a class="bp-staged-link" href="'+href+'">'+
          (dir ? '<div class="bp-dir">'+esch(dir)+'</div>' : '')+
          '<div class="pr-title">'+esch(f.title||f.path)+'<span class="br-staged-badge">staged only</span></div></a>'+
          '<button class="br-staged-del bp-staged-del" data-path="'+esch(f.path)+'" title="Delete staged file" aria-label="Delete staged file">\uD83D\uDDD1</button></div>';
      }).join('');
      list.insertAdjacentHTML('afterbegin', html);
      list.querySelectorAll('.bp-staged-del').forEach(function(b){ b.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); unstageFile(b.getAttribute('data-path')); }); });
    } else if (empty) { empty.style.display = ''; }
    if (mineEdit.length) {
      var rows = host.querySelectorAll('.bp-file');
      mineEdit.forEach(function(f){
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].getAttribute('data-path') === f.path) {
            rows[i].classList.add('bp-edited');
            var t = rows[i].querySelector('.pr-title');
            if (t && !t.querySelector('.br-edited-badge')) { var s = document.createElement('span'); s.className = 'br-staged-badge br-edited-badge'; s.textContent = 'edited'; t.appendChild(s); }
            break;
          }
        }
      });
    }
    updateCount();
    if (window.__tpStagedRefresh) window.__tpStagedRefresh();
  }
  updateCount();
  if (!IS_LOCAL) renderStagedFiles();
})();
</script>
${NAV_WATCHER}
</body></html>`;
}

function buildReadonlySpecPage({ title, bodyHtml, toc, specPath, repo, adoUrl, backHref, backLabel, historyUrl, sourceMap, reviewing, editMode, commentCount = 0, reviewRepo, reviewBranch, reviewPath, currentUser, personalComments, pcDataSeq = 0 }) {
  const back = backHref || "/discovery?tab=specs";
  const backText = backLabel || "Specs";
  const crumb = escHtml((repo ? repo + " \u00b7 " : "") + specPath);
  // File-reviewing mode (opened from a branch): the margin is a Personal Comments
  // pane (hidden until a comment exists); otherwise it's the PR Review History.
  const paneTitle = reviewing ? "Annotations" : "Review History";
  const marginCollapsed = reviewing ? (commentCount > 0 ? "" : "collapsed") : "collapsed";
  const modeTag = editMode
    ? `<span class="ro-mode ro-mode-${editMode}">${editMode === "local" ? "Local" : "Remote"}</span>`
    : "";
  const refreshBtn = `<button type="button" class="ro-refresh" onclick="location.reload()" title="Reload this file">\u21bb Refresh</button>`;
  const tocHtml = (toc || []).length
    ? (toc || []).map((t) => `<a href="#${t.id}" class="toc-item" style="padding-left:${(t.level - 1) * 10 + 8}px">${escHtml(t.text)}</a>`).join("")
    : '<div class="ro-empty">No headings.</div>';
  const historyHtml = reviewing
    ? '<div class="ro-empty" id="roHistLoading">No annotations yet.</div>'
    : '<div class="ro-empty" id="roHistLoading">Loading review history\u2026</div>';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title)} \u2014 Tippani</title>
<style>
${cssVariables()}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: "Segoe UI", Aptos, Calibri, -apple-system, sans-serif; background: var(--cp-bg); color: var(--cp-text); }
.ro-topbar { display: flex; align-items: center; gap: 14px; height: 48px; padding: 0 20px; border-bottom: 1px solid var(--cp-border); background: var(--cp-bg-elevated); position: sticky; top: 0; z-index: 20; }
.ro-back { font-size: 13px; font-weight: 600; color: var(--cp-accent); text-decoration: none; white-space: nowrap; }
.ro-back:hover { text-decoration: underline; }
.ro-topbar-title { flex: 1 1 auto; min-width: 0; font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ro-refresh { flex: 0 0 auto; font-family: inherit; font-size: 12px; font-weight: 600; color: var(--cp-accent); background: none; border: none; cursor: pointer; padding: 4px 6px; white-space: nowrap; }
.ro-refresh:hover { text-decoration: underline; }
.ro-mode { flex: 0 0 auto; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.4px; white-space: nowrap; background: var(--cp-accent-soft); color: var(--cp-accent); }
.ro-mode-local { background: rgba(47,143,78,0.16); color: #2f8f4e; }
[data-theme="dark"] .ro-mode-local { background: rgba(90,190,120,0.18); color: #6ecb8b; }
.ro-shell { display: flex; align-items: stretch; }
.ro-pane { flex: 0 0 auto; transition: width 0.18s ease; overflow: visible; }
.ro-toc { width: 250px; border-right: 1px solid var(--cp-border); }
.ro-pane.collapsed { width: 38px; }
.ro-margin { position: relative; flex: 0 0 340px; width: 340px; border-left: 1px solid var(--cp-border); transition: flex-basis 0.18s ease; }
.ro-margin.collapsed { flex-basis: 38px; }
.ro-margin-head { position: sticky; top: 0; z-index: 6; display: flex; align-items: center; gap: 8px; padding: 12px 14px; background: var(--cp-bg); border-bottom: 1px solid var(--cp-border); }
.ro-margin-title { flex: 1 1 auto; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; color: var(--cp-text-muted); }
.ro-margin.collapsed .ro-margin-head, .ro-margin.collapsed .ro-margin-body { display: none; }
.ro-margin-body { position: relative; }
.ro-margin .ro-rail { display: none; }
.ro-margin.collapsed .ro-rail { display: flex; position: sticky; top: 48px; width: 38px; height: calc(100vh - 48px); flex-direction: column; align-items: center; gap: 10px; padding-top: 12px; background: none; border: none; cursor: pointer; color: var(--cp-text-muted); font-size: 14px; }
.ro-margin.collapsed .ro-rail:hover { color: var(--cp-text); }
.ro-pane-full { position: sticky; top: 0; max-height: 100vh; display: flex; flex-direction: column; }
.ro-pane.collapsed .ro-pane-full { display: none; }
.ro-pane-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--cp-border); }
.ro-pane-title { flex: 1 1 auto; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; color: var(--cp-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ro-history .ro-pane-title { text-align: right; }
.ro-toggle { flex: 0 0 auto; font-size: 14px; line-height: 1; padding: 2px 6px; border: 1px solid var(--cp-border); border-radius: 6px; background: var(--cp-surface); color: var(--cp-text-muted); cursor: pointer; }
.ro-toggle:hover { color: var(--cp-text); }
.ro-pane-body { overflow-y: auto; padding: 10px; }
.ro-rail { display: none; }
.ro-pane.collapsed .ro-rail { display: flex; position: sticky; top: 48px; width: 38px; height: calc(100vh - 48px); flex-direction: column; align-items: center; gap: 10px; padding-top: 12px; background: none; border: none; cursor: pointer; color: var(--cp-text-muted); font-size: 14px; }
.ro-pane.collapsed .ro-rail:hover { color: var(--cp-text); }
.ro-rail-label { writing-mode: vertical-rl; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
.toc-item { display: block; font-size: 13px; color: var(--cp-text-muted); text-decoration: none; padding: 4px 8px; border-radius: 6px; line-height: 1.35; }
.toc-item:hover { background: var(--cp-surface-soft); color: var(--cp-text); }
.ro-empty { font-size: 12px; color: var(--cp-text-muted); padding: 12px; }
.ro-doc :is(h1,h2,h3,h4,h5,h6) { scroll-margin-top: 16px; }
/* Margin review threads: absolutely positioned beside their anchor block, sharing the page scroll (no separate scrollbar). Collapsed to a summary; expand on click. */
.rh-thread { position: absolute; left: 10px; right: 10px; padding: 8px 10px; border: 1px solid var(--cp-border); border-radius: 10px; background: var(--cp-surface); cursor: pointer; transition: box-shadow 0.15s, border-color 0.15s; }
.rh-thread:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
.rh-thread.rh-focused { box-shadow: 0 0 0 2px #6d071a; border-color: #6d071a; z-index: 3; }
[data-theme="dark"] .rh-thread.rh-focused { box-shadow: 0 0 0 2px #b23a58; border-color: #b23a58; }
.rh-head { display: flex; align-items: center; gap: 6px; }
.rh-badge { font-size: 10px; font-weight: 700; color: var(--cp-accent); white-space: nowrap; }
.rh-hline { font-size: 10px; color: var(--cp-text-muted); }
.rh-count { margin-left: auto; font-size: 10px; font-weight: 700; min-width: 16px; height: 16px; padding: 0 5px; border-radius: 8px; background: var(--cp-surface-soft); color: var(--cp-text-muted); display: inline-flex; align-items: center; justify-content: center; }
.rh-res { color: #2f8f4e; font-size: 12px; }
.pc-drift { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; padding: 0 4px; border-radius: 6px; margin-left: 4px; cursor: help; }
.pc-drift-stale { background: rgba(220, 38, 38, 0.12); color: var(--cp-danger); }
.pc-drift-moved { background: rgba(245, 158, 11, 0.14); color: var(--cp-warning); }
.rh-summary { font-size: 12px; color: var(--cp-text-muted); margin-top: 5px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rh-thread.rh-expanded .rh-summary { display: none; }
.rh-full { display: none; margin-top: 6px; }
.rh-thread.rh-expanded .rh-full { display: block; }
.rh-thread.rh-expanded:not(.pc-card) .rh-full { max-height: 55vh; overflow-y: auto; }
/* Personal comments always show their full text (not a clamped 2-line summary);
   a single very long comment scrolls within the card rather than overflowing the
   page's vertical space. */
.pc-card .rh-summary { display: none; }
.pc-card .rh-full { display: block; }
.pc-card .pc-view .rh-body { max-height: calc(100vh - 160px); overflow-y: auto; resize: vertical; }
/* Replies (follow-up notes, e.g. the assistant recording how it addressed the comment). */
.pc-replies { margin-top: 8px; border-top: 1px dashed var(--cp-border); padding-top: 6px; }
.pc-reply { margin-top: 6px; padding-left: 8px; border-left: 2px solid var(--cp-accent); }
.pc-reply-meta { font-size: 10px; font-weight: 700; color: var(--cp-accent); margin-bottom: 2px; }
.pc-reply .rh-body { font-size: 12px; }
.rh-anchor { font-size: 11px; color: var(--cp-text-muted); margin-bottom: 6px; }
.rh-comment { margin: 6px 0; }
.rh-comment + .rh-comment { border-top: 1px dashed var(--cp-border); padding-top: 6px; }
.rh-cmeta { display: flex; align-items: baseline; gap: 6px; }
.rh-who { font-size: 12px; font-weight: 600; color: var(--cp-text); }
.rh-when { font-size: 11px; color: var(--cp-text-muted); }
.rh-body { font-size: 13px; margin-top: 2px; line-height: 1.45; overflow-wrap: anywhere; }
.rh-body p { margin: 4px 0; }
.rh-body code { font-family: var(--cp-mono, ui-monospace, monospace); font-size: 12px; background: var(--cp-surface-2, rgba(127,127,127,0.14)); padding: 1px 4px; border-radius: 4px; }
.rh-body pre { background: var(--cp-surface-2, rgba(127,127,127,0.14)); padding: 8px 10px; border-radius: 6px; overflow-x: auto; }
.rh-body pre code { background: none; padding: 0; }
.rh-body ul, .rh-body ol { margin: 4px 0; padding-left: 18px; }
.rh-body img { max-width: 100%; }
.ro-center { flex: 1 1 auto; min-width: 0; padding: 12px 28px 28px; }
.ro-center-inner { max-width: 860px; margin: 0 auto; }
.ro-crumb { font-size: 12px; color: var(--cp-text-muted); margin-bottom: 16px; word-break: break-all; }
.ro-doc { background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 12px; padding: 28px 34px; line-height: 1.6; font-size: 15px; }
.ro-doc > :first-child { margin-top: 0; }
.ro-head { text-align: center; padding: 0 20px 10px; flex-shrink: 0; }
.ro-head h1 { font-size: 19px; font-weight: 700; line-height: 1.3; }
.ro-sub { font-size: 13px; color: var(--cp-text-muted); margin-top: 3px; word-break: break-all; }
.ro-doc h1, .ro-doc h2, .ro-doc h3, .ro-doc h4 { line-height: 1.3; margin: 22px 0 10px; }
.ro-doc h1 { font-size: 26px; } .ro-doc h2 { font-size: 21px; } .ro-doc h3 { font-size: 17px; }
.ro-doc h1:first-child, .ro-doc h2:first-child { margin-top: 0; }
.ro-doc h1 a, .ro-doc h2 a, .ro-doc h3 a, .ro-doc h4 a, .ro-doc h5 a, .ro-doc h6 a { color: inherit; text-decoration: none; }
.ro-doc p { margin: 10px 0; }
.ro-doc ul, .ro-doc ol { margin: 10px 0 10px 24px; }
.ro-doc li { margin: 4px 0; }
.ro-doc a { color: var(--cp-accent); }
.ro-doc p, .ro-doc li, .ro-doc a, .ro-doc code { overflow-wrap: anywhere; }
.ro-doc code { font-family: Consolas, "Courier New", monospace; font-size: 0.9em; background: var(--cp-surface-soft); padding: 1px 5px; border-radius: 5px; }
.ro-doc pre { background: var(--cp-code-bg); color: var(--cp-code-fg); border: 1px solid var(--cp-border); padding: 14px 16px; border-radius: 10px; overflow-x: auto; margin: 12px 0; }
.ro-doc pre code { background: none; padding: 0; color: inherit; }
.ro-doc blockquote { border-left: 3px solid var(--cp-border-strong); padding-left: 14px; color: var(--cp-text-muted); margin: 12px 0; }
.ro-doc table { border-collapse: collapse; margin: 14px 0; font-size: 14px; max-width: 100%; }
.ro-doc th, .ro-doc td { border: 1px solid var(--cp-border); padding: 6px 10px; text-align: left; overflow-wrap: anywhere; word-break: break-word; }
.ro-doc th { background: var(--cp-surface-soft); }
.ro-doc img { max-width: 100%; height: auto; border-radius: 8px; }
/* Persistent Bordeaux border on the block tied to the focused review thread (same as PR mode's .section-focused). */
.ro-doc .section-focused { box-shadow: 0 0 0 2px #6d071a; border-radius: 6px; }
[data-theme="dark"] .ro-doc .section-focused { box-shadow: 0 0 0 2px #b23a58; }
/* Anchor markers on the referenced block, shown only while the history margin is open. Click jumps to the thread card. */
.rh-marker { display: none; position: absolute; top: 2px; width: 20px; height: 20px; border-radius: 50%; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; cursor: pointer; z-index: 4; border: none; font-family: inherit; transition: transform 0.12s; }
.rh-marker:hover { transform: scale(1.15); }
.rh-marker-active { background: var(--cp-accent); color: var(--cp-accent-fg); }
.rh-marker-resolved { background: var(--cp-success); color: #fff; }
body.show-markers .rh-marker { display: inline-flex; }
/* Personal Comments: hover affordance + add dot + edit controls (file-reviewing mode). */
.ro-commentable.pc-hover, .ro-commentable.pc-active { box-shadow: 0 0 0 2px var(--cp-accent); border-radius: 6px; }
[data-theme="dark"] .ro-commentable.pc-hover, [data-theme="dark"] .ro-commentable.pc-active { box-shadow: 0 0 0 2px #b23a58; }
.pc-add { position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; border-radius: 50%; border: none; background: var(--cp-accent); color: #fff; font-size: 14px; font-weight: 700; line-height: 1; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; z-index: 6; box-shadow: 0 1px 5px rgba(0,0,0,0.25); }
.pc-add:hover { transform: scale(1.12); }
.pc-card .rh-count { display: none; }
.pc-card .pc-ico { flex: 0 0 auto; margin-left: 4px; padding: 2px 4px; font-size: 13px; line-height: 1; border: none; background: none; color: var(--cp-text-muted); cursor: pointer; border-radius: 4px; }
.pc-card .pc-ico:hover { color: var(--cp-accent); background: var(--cp-surface-soft); }
.pc-card .pc-del:hover { color: #c0392b; }
.pc-card .pc-resolve:hover { color: #2f8f4e; }
.pc-card .pc-save { display: none; font-family: "Segoe MDL2 Assets", "Segoe Fluent Icons"; font-size: 14px; }
.pc-card.pc-editing .pc-save { display: inline-flex; }
.pc-card.pc-editing .pc-edit { display: none; }
.pc-card.pc-resolved .rh-badge { text-decoration: line-through; color: var(--cp-text-muted); }
.pc-text { width: 100%; min-height: 66px; font-family: inherit; font-size: 13px; padding: 8px; border: 1px solid var(--cp-border); border-radius: 6px; background: var(--cp-bg); color: var(--cp-text); resize: vertical; box-sizing: border-box; }
.pc-reply-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px; }
.pc-reply-actions button { font-family: inherit; font-size: 12px; padding: 4px 9px; border: 1px solid var(--cp-border); border-radius: 5px; background: var(--cp-surface); color: var(--cp-text); cursor: pointer; }
.pc-reply-actions .pc-reply-submit { border-color: var(--cp-accent); background: var(--cp-accent); color: var(--cp-accent-fg); }
.mermaid-block { margin: 14px 0; text-align: center; overflow-x: auto; }
.mermaid-block svg { max-width: 100%; height: auto; }
.mermaid-block.mermaid-error { text-align: left; }
.mermaid-error-note { font-size: 12px; color: var(--cp-text-muted); margin-top: 4px; }
<\/style>
<script>
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme = 'dark';
<\/script></head><body>
  ${renderCrumbBar([{ label: "Home", href: "/discovery" }, { label: backText, href: back }, { label: title }], { right: `${modeTag}${refreshBtn}` })}

  <div class="ro-head">
    <h1>${escHtml(title)}</h1>
    <div class="ro-sub">${escHtml(specPath)}</div>
  </div>

  <div class="ro-shell">
    <aside class="ro-pane ro-toc" id="roToc">
      <div class="ro-pane-full">
        <div class="ro-pane-head"><span class="ro-pane-title">Contents</span><button class="ro-toggle" data-target="roToc" title="Collapse">\u00ab</button></div>
        <nav class="ro-pane-body">${tocHtml}</nav>
      </div>
      <button class="ro-rail" data-target="roToc" title="Show contents">\u00bb<span class="ro-rail-label">Contents</span></button>
    </aside>
    <main class="ro-center">
      <div class="ro-center-inner">
        <div class="ro-doc">${bodyHtml}</div>
      </div>
    </main>
    <aside class="ro-margin ${marginCollapsed}" id="roMargin">
      <div class="ro-margin-head"><button class="ro-toggle" data-target="roMargin" title="Hide">\u00bb</button><span class="ro-margin-title">${escHtml(paneTitle)}</span></div>
      <button class="ro-rail" data-target="roMargin" title="Show ${escHtml(paneTitle.toLowerCase())}">\u00ab<span class="ro-rail-label">${escHtml(paneTitle)}</span></button>
      <div class="ro-margin-body" id="roMarginBody">${historyHtml}</div>
    </aside>
  </div>
  <script src="/vendor/mermaid.min.js"><\/script>
  <script>${MERMAID_VIEW_JS}<\/script>
  <script>
    document.querySelectorAll('.ro-toggle, .ro-rail').forEach(function (b) {
      b.addEventListener('click', function () { var el = document.getElementById(b.dataset.target); if (el) el.classList.toggle('collapsed'); });
    });
  <\/script>
  <script>
    // Margin review threads: each thread card is absolutely positioned beside the
    // anchor block it references (shared page scroll, no separate scrollbar).
    // RO_SOURCE_MAP[i] (a {startLine,endLine} captured from the render tree) aligns
    // 1:1 with the i-th outermost commentable block. Cards are collapsed to a
    // summary; clicking one focuses it (Bordeaux border on the card + its section),
    // expands its comments, and reflows the column so nothing overlaps.
    (function () {
      var RO_SOURCE_MAP = ${jsonForScript(sourceMap || [])};
      var RO_HISTORY_URL = ${jsonForScript(reviewing ? "" : (historyUrl || ""))};
      // Personal-comments (file-reviewing) mode config.
      var RO_REVIEWING = ${reviewing ? "true" : "false"};
      var RO_REPO = ${jsonForScript(reviewRepo || "")};
      var RO_BRANCH = ${jsonForScript(reviewBranch || "")};
      var RO_PATH = ${jsonForScript(reviewPath || "")};
      var RO_USER = ${jsonForScript(currentUser || "You")};
      var RO_PERSONAL_COMMENTS = ${jsonForScript(personalComments || [])};
      var RO_PC_DATASEQ = ${Number(pcDataSeq) || 0};
      var marginEl = document.getElementById('roMargin');
      var docEl = document.querySelector('.ro-doc');
      if (!marginEl || !docEl) return;
      var blocks = [];
      var cards = [];
      function collectBlocks() {
        blocks = [];
        // Include '.mermaid-block' because the mermaid transform has (by now)
        // replaced each mermaid <pre> with a <div class="mermaid-block"> in place;
        // the server range map counted that <pre>, so the div must occupy its slot
        // to keep the index alignment 1:1.
        docEl.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote, table, pre, .mermaid-block').forEach(function (el) {
          if (el.closest('.ro-commentable')) return; // outermost only, mirrors the map
          el.classList.add('ro-commentable');
          blocks.push(el);
        });
      }
      function blockForLine(line) {
        var bestKey = null, bestDist = Infinity;
        for (var k = 0; k < RO_SOURCE_MAP.length; k++) {
          var sm = RO_SOURCE_MAP[k];
          if (!sm) continue;
          if (line >= sm.startLine && line <= sm.endLine) return blocks[k] || null;
          var dist = line < sm.startLine ? sm.startLine - line : line - sm.endLine;
          if (dist < bestDist) { bestDist = dist; bestKey = k; }
        }
        return bestKey != null ? (blocks[bestKey] || null) : null;
      }
      // Position each card at its anchor's vertical offset; stack downward when
      // cards would overlap so every card stays as close to its anchor as it can.
      function layout() {
        // Cards are position:absolute inside .ro-margin-body (which is
        // position:relative), so top is measured from the body — i.e. BELOW the
        // sticky header. A card with no line anchor (file-level) lands at the top
        // of the body, clear of the header (previously it sat at top:0 of
        // .ro-margin, behind the header, and its first line clipped).
        var bodyEl = document.getElementById('roMarginBody') || marginEl;
        var mt = bodyEl.getBoundingClientRect().top + window.scrollY;
        var items = cards.map(function (card) {
          var line = parseInt(card.getAttribute('data-line'), 10);
          var b = Number.isFinite(line) ? blockForLine(line) : null;
          var y = b ? (b.getBoundingClientRect().top + window.scrollY - mt) : 0;
          return { card: card, y: Math.max(0, y) };
        });
        items.sort(function (a, b) { return a.y - b.y; });
        var cursor = 8;
        items.forEach(function (it) {
          var top = Math.max(it.y, cursor);
          it.card.style.top = top + 'px';
          cursor = top + it.card.offsetHeight + 8;
        });
        bodyEl.style.minHeight = cursor + 'px';
      }
      function clearFocus() {
        cards.forEach(function (c) { c.classList.remove('rh-focused', 'rh-expanded'); });
        docEl.querySelectorAll('.section-focused').forEach(function (e) { e.classList.remove('section-focused'); });
      }
      function focus(card, scrollTo) {
        clearFocus();
        card.classList.add('rh-focused', 'rh-expanded');
        var line = parseInt(card.getAttribute('data-line'), 10);
        var b = Number.isFinite(line) ? blockForLine(line) : null;
        if (b) b.classList.add('section-focused');
        layout();
        var dest = scrollTo === 'card' ? card : (b || card);
        if (dest) dest.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // Place a small anchor marker on each thread's referenced block; clicking it
      // focuses + scrolls to the thread card in the margin (the reverse of clicking
      // a card, which scrolls the content to the block).
      function makeMarkers() {
        cards.forEach(function (card) {
          var line = parseInt(card.getAttribute('data-line'), 10);
          if (!Number.isFinite(line)) return;
          var b = blockForLine(line);
          if (!b) return;
          b.style.position = 'relative';
          var n = b.__mk || 0; b.__mk = n + 1;
          var mk = document.createElement('button');
          mk.type = 'button';
          mk.className = 'rh-marker ' + (card.querySelector('.rh-res') ? 'rh-marker-resolved' : 'rh-marker-active');
          var cnt = card.querySelector('.rh-count');
          mk.textContent = cnt ? cnt.textContent : '';
          mk.title = 'Review comment \u2014 jump to thread';
          mk.style.right = (-10 - n * 22) + 'px';
          mk.addEventListener('click', function (e) { e.stopPropagation(); focus(card, 'card'); });
          b.appendChild(mk);
        });
      }
      function setupCards() {
        cards = [].slice.call(marginEl.querySelectorAll('.rh-thread'));
        cards.forEach(function (card) {
          card.addEventListener('click', function (e) {
            if (e.target.closest && e.target.closest('a, button')) return;
            if (card.classList.contains('rh-expanded')) { clearFocus(); layout(); return; }
            focus(card, 'block');
          });
        });
        makeMarkers();
        document.body.classList.toggle('show-markers', !marginEl.classList.contains('collapsed') && cards.length > 0);
        layout();
        setTimeout(layout, 400);
      }
      // Fetch the (heavier) review history after the page has painted, then wire
      // up the cards, anchor markers and layout.
      function loadHistory() {
        var body = document.getElementById('roMarginBody');
        // File-reviewing mode: no PR history to fetch; the pane already shows the
        // Reviewer Comments empty state. Just wire up (zero) cards.
        if (!RO_HISTORY_URL) { setupCards(); return; }
        fetch(RO_HISTORY_URL).then(function (r) { return r.json(); }).then(function (d) {
          if (body) body.innerHTML = (d && d.html) || '<div class="ro-empty">No review history.</div>';
          setupCards();
        }).catch(function () {
          if (body) body.innerHTML = '<div class="ro-empty">Could not load review history.</div>';
        });
      }
      // ---- Personal Comments (file-reviewing mode) ----------------------------
      // Hover a block to border it + reveal an "add" dot; click the dot to open a
      // draft card in the margin. Empty drafts vanish when the block loses focus;
      // a typed draft auto-saves. Existing comments get the same anchor markers,
      // focus and layout as PR review, plus edit/delete.
      var pcBody = function () { return document.getElementById('roMarginBody'); };
      var pcDraft = null; // the single in-progress draft card, or null
      var pcShowResolvedState = true;      // hide/show resolved cards (MCP-driven)
      var pcLastDataSeq = RO_PC_DATASEQ;   // last comment-data version this page has applied
      var pcLastCmdSeq = 0;                // last one-shot UI command applied
      var pcLastLineSeq = 0;               // last go_to_line seq applied (baselined on first poll)
      var pcPollInit = false;              // first poll only syncs baselines
      function pcEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
      function pcWhen(iso) { try { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
      function pcSnippet(t) {
        // Collapse whitespace WITHOUT a backslash regex: inside this server
        // template literal, /\s+/ would become /s+/ and strip every "s".
        var s = String(t || ''), out = '', prevWs = false;
        var TAB = String.fromCharCode(9), LF = String.fromCharCode(10), CR = String.fromCharCode(13), FF = String.fromCharCode(12), VT = String.fromCharCode(11);
        for (var i = 0; i < s.length; i++) {
          var ch = s.charAt(i);
          if (ch === ' ' || ch === TAB || ch === LF || ch === CR || ch === FF || ch === VT) { if (!prevWs && out) out += ' '; prevWs = true; }
          else { out += ch; prevWs = false; }
        }
        return pcEsc(out.replace(/^ +| +$/g, '').slice(0, 90));
      }
      function pcLineForBlock(b) { var i = blocks.indexOf(b); var sm = RO_SOURCE_MAP[i]; return sm ? sm.startLine : null; }
      function clearMarkers() { docEl.querySelectorAll('.rh-marker').forEach(function (m) { m.remove(); }); docEl.querySelectorAll('[data-pc-mk]').forEach(function (b) { b.__mk = 0; b.removeAttribute('data-pc-mk'); }); }
      function pcRefresh() {
        cards = [].slice.call(marginEl.querySelectorAll('.pc-card'));
        if (!cards.length) { var b = pcBody(); if (b && !b.querySelector('.ro-empty')) b.innerHTML = '<div class="ro-empty">No annotations yet.</div>'; }
        clearMarkers();
        docEl.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,table,pre,.mermaid-block').forEach(function (b) { b.__mk = 0; });
        makeMarkers();
        // Apply the current hide/show-resolved view state after any re-render.
        cards.forEach(function (card) { if (card.classList.contains('pc-resolved')) card.hidden = !pcShowResolvedState; });
        if (!pcShowResolvedState) docEl.querySelectorAll('.rh-marker-resolved').forEach(function (m) { m.style.display = 'none'; });
        document.body.classList.toggle('show-markers', !marginEl.classList.contains('collapsed') && cards.length > 0);
        layout(); setTimeout(layout, 60);
      }
      function pcApplyShowResolved(show) { pcShowResolvedState = (show !== false); pcRefresh(); }
      function pcReportSelected(id) { pcApi('POST', '/api/v1/personal-comments/select', { id: id || '' }); }
      function pcFocusById(id) {
        for (var i = 0; i < cards.length; i++) {
          if (cards[i].getAttribute('data-id') === id) {
            if (marginEl.classList.contains('collapsed')) marginEl.classList.remove('collapsed');
            if (cards[i].hidden) { pcShowResolvedState = true; cards[i].hidden = false; }
            focus(cards[i], 'card');
            return true;
          }
        }
        return false;
      }
      function pcReloadComments() {
        var q = '?repo=' + encodeURIComponent(RO_REPO) + '&branch=' + encodeURIComponent(RO_BRANCH) + '&path=' + encodeURIComponent(RO_PATH);
        return fetch('/api/v1/personal-comments' + q).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
          if (!d || !d.ok) return;
          // Don't clobber an in-progress draft/edit.
          if (pcDraft || marginEl.querySelector('.pc-editing, .pc-replying')) return;
          var body = pcBody(); if (body) body.innerHTML = '';
          (d.comments || []).forEach(function (c) { pcBody().appendChild(pcBuildCard(c, false)); });
          if (!(d.comments || []).length && body) body.innerHTML = '<div class="ro-empty">No annotations yet.</div>';
          pcRefresh();
        }).catch(function () {});
      }
      function pcPoll() {
        fetch('/api/v1/state').then(function (r) { return r.ok ? r.json() : null; }).then(function (s) {
          if (!s) return;
          if (!pcPollInit) { pcPollInit = true; if (typeof s.pcCommandSeq === 'number') pcLastCmdSeq = s.pcCommandSeq; if (typeof s.pcDataSeq === 'number') pcLastDataSeq = Math.max(pcLastDataSeq, s.pcDataSeq); if (typeof s.lineSeq === 'number') pcLastLineSeq = s.lineSeq; return; }
          if (typeof s.pcDataSeq === 'number' && s.pcDataSeq > pcLastDataSeq) { pcLastDataSeq = s.pcDataSeq; pcReloadComments(); }
          if (typeof s.lineSeq === 'number' && s.lineSeq > pcLastLineSeq) {
            pcLastLineSeq = s.lineSeq;
            // go_to_line: scroll the open file to a source line (same-page, no reopen).
            var goB = Number.isFinite(s.line) ? blockForLine(s.line) : null;
            if (goB) goB.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          if (typeof s.pcCommandSeq === 'number' && s.pcCommandSeq > pcLastCmdSeq) {
            pcLastCmdSeq = s.pcCommandSeq;
            var cmd = s.pcCommand;
            if (cmd && cmd.type === 'focus' && cmd.id) { if (!pcFocusById(cmd.id)) { pcReloadComments().then(function () { pcFocusById(cmd.id); }); } }
            else if (cmd && cmd.type === 'showResolved') pcApplyShowResolved(cmd.show !== false);
            else if (cmd && cmd.type === 'reload') location.reload();
          }
        }).catch(function () {});
      }
      function pcRepliesHtml(c) {
        var reps = (c && c.replies) || [];
        if (!reps.length) return '';
        var items = reps.map(function (r) {
          return '<div class="pc-reply"><div class="pc-reply-meta">' + pcEsc(r.author || '') + ' \u00b7 ' + pcWhen(r.createdAt || new Date().toISOString()) + '</div>'
            + '<div class="rh-body">' + (r.html || pcEsc(r.content || '')) + '</div></div>';
        }).join('');
        return '<div class="pc-replies">' + items + '</div>';
      }
      function pcBuildCard(c, isDraft) {
        var card = document.createElement('div');
        card.className = 'rh-thread pc-card' + (isDraft ? ' pc-draft' : '') + (c.resolved ? ' pc-resolved' : '') + (c.anchorState === 'stale' ? ' pc-stale' : c.anchorState === 'moved' ? ' pc-moved' : '');
        if (c.line != null) card.setAttribute('data-line', c.line);
        if (c.id) card.setAttribute('data-id', c.id);
        card.__data = c;
        var resolveIco = isDraft ? '' : '<button type="button" class="pc-ico pc-resolve" title="' + (c.resolved ? 'Reopen' : 'Resolve') + '">' + (c.resolved ? '\u21ba' : '\u2713') + '</button>';
        var replyIco = isDraft ? '' : '<button type="button" class="pc-ico pc-reply-btn" title="Reply">\u21a9</button>';
        var resTag = c.resolved ? '<span class="rh-res" title="Resolved">\u2713</span>' : '';
        var driftTag = c.anchorState === 'stale'
          ? '<span class="pc-drift pc-drift-stale" title="The block this note anchored to was edited away or removed \u2014 the position is approximate.">moved?</span>'
          : c.anchorState === 'moved'
          ? '<span class="pc-drift pc-drift-moved" title="The block text changed; tracked to its heading section.">tracked</span>'
          : '';
        card.innerHTML =
          '<div class="rh-head"><span class="rh-badge">' + pcEsc(c.author || RO_USER) + ' \u00b7 ' + pcWhen(c.updatedAt || c.createdAt || new Date().toISOString()) + '</span>'
          + '<span class="rh-hline">' + (c.line != null ? ':' + c.line : '') + '</span>' + driftTag + resTag + '<span class="rh-count">1</span>'
          + '<button type="button" class="pc-ico pc-save" title="Save">\ue74e</button>'
          + replyIco
          + resolveIco
          + '<button type="button" class="pc-ico pc-edit" title="Edit">\u270e</button>'
          + '<button type="button" class="pc-ico pc-del" title="Delete">\u{1f5d1}</button></div>'
          + '<div class="rh-summary"><span class="rh-who"></span> ' + pcSnippet(c.content) + '</div>'
          + '<div class="rh-full">'
          + '<div class="pc-view"><div class="rh-body">' + (c.html || pcEsc(c.content)) + '</div>' + pcRepliesHtml(c) + '</div>'
          + '<div class="pc-editbox" hidden><textarea class="pc-text" placeholder="Add a comment\u2026 (saves when you click away)"></textarea></div>'
          + '<div class="pc-replybox" hidden><textarea class="pc-text pc-reply-text" placeholder="Write a reply\u2026"></textarea><div class="pc-reply-actions"><button type="button" class="pc-reply-cancel">Cancel</button><button type="button" class="pc-reply-submit">Reply</button></div></div>'
          + '</div>';
        pcWireCard(card);
        return card;
      }
      function pcShowEdit(card, open) {
        card.querySelector('.pc-view').hidden = open;
        card.querySelector('.pc-editbox').hidden = !open;
        card.querySelector('.pc-replybox').hidden = true;
        card.classList.toggle('pc-editing', open);
        card.classList.remove('pc-replying');
        card.classList.toggle('rh-expanded', true);
      }
      function pcShowReply(card, open) {
        card.querySelector('.pc-view').hidden = false;
        card.querySelector('.pc-editbox').hidden = true;
        card.querySelector('.pc-replybox').hidden = !open;
        card.classList.remove('pc-editing');
        card.classList.toggle('pc-replying', open);
        card.classList.toggle('rh-expanded', true);
      }
      function pcApi(method, url, body) {
        return fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json().catch(function () { return {}; }); });
      }
      function pcCoords() { return { repo: RO_REPO, branch: RO_BRANCH, path: RO_PATH }; }
      function pcRemoveDraft() {
        if (!pcDraft) return;
        var b = pcDraft.__block; if (b) b.classList.remove('pc-active');
        pcDraft.remove(); pcDraft = null; pcRefresh();
      }
      function pcCommit(card) {
        if (card.__saving || !card.isConnected) return;
        var ta = card.querySelector('.pc-text'); if (!ta) return;
        var text = ta.value.trim();
        var isDraft = card.classList.contains('pc-draft');
        var orig = (card.__data && card.__data.content) || '';
        if (isDraft) {
          if (!text) { pcRemoveDraft(); return; }
          card.__saving = true;
          var payload = Object.assign({}, pcCoords(), { line: card.__data.line, content: text });
          pcApi('POST', '/api/v1/personal-comments', payload).then(function (d) {
            card.__saving = false;
            if (!d || !d.ok || !d.comment) { return; }
            if (typeof d.dataSeq === 'number') pcLastDataSeq = d.dataSeq;
            card.classList.remove('pc-draft');
            var b = card.__block; if (b) b.classList.remove('pc-active');
            var nb = card.__block; card = pcReplace(card, d.comment); if (nb) card.__block = nb;
            pcDraft = null; pcRefresh();
          });
        } else {
          // Existing comment: emptying it saves an empty comment (allowed) — only
          // an untouched edit is a no-op.
          if (text === orig) { pcShowEdit(card, false); return; }
          card.__saving = true;
          var pl = Object.assign({}, pcCoords(), { content: text });
          pcApi('PUT', '/api/v1/personal-comments/' + encodeURIComponent(card.getAttribute('data-id')), pl).then(function (d) {
            card.__saving = false;
            if (!d || !d.ok) return;
            if (typeof d.dataSeq === 'number') pcLastDataSeq = d.dataSeq;
            if (d.deleted) { pcRemoveCardDom(card); return; }
            pcReplace(card, d.comment); pcRefresh();
          });
        }
      }
      function pcReplace(card, c) {
        var fresh = pcBuildCard(c, false);
        card.replaceWith(fresh);
        return fresh;
      }
      function pcCommitReply(card) {
        if (card.__replying || !card.isConnected) return;
        var ta = card.querySelector('.pc-reply-text');
        var text = ta ? ta.value.trim() : '';
        if (!text) return;
        card.__replying = true;
        var payload = Object.assign({}, pcCoords(), { content: text });
        pcApi('POST', '/api/v1/personal-comments/' + encodeURIComponent(card.getAttribute('data-id')) + '/reply', payload).then(function (d) {
          card.__replying = false;
          if (!d || !d.ok || !d.comment) return;
          if (typeof d.dataSeq === 'number') pcLastDataSeq = d.dataSeq;
          var block = card.__block;
          card = pcReplace(card, d.comment);
          if (block) card.__block = block;
          pcRefresh();
        });
      }
      function pcRemoveCardDom(card) { card.remove(); pcRefresh(); }
      function pcDelete(card) {
        if (card.classList.contains('pc-draft')) { pcRemoveDraft(); return; }
        var id = card.getAttribute('data-id');
        pcApi('DELETE', '/api/v1/personal-comments/' + encodeURIComponent(id), pcCoords()).then(function (d) { if (d && typeof d.dataSeq === 'number') pcLastDataSeq = d.dataSeq; pcRemoveCardDom(card); });
      }
      function pcToggleResolved(card) {
        if (card.classList.contains('pc-draft') || card.__resolving) return;
        var id = card.getAttribute('data-id'); if (!id) return;
        var next = !(card.__data && card.__data.resolved);
        card.__resolving = true;
        pcApi('POST', '/api/v1/personal-comments/' + encodeURIComponent(id) + '/resolve', Object.assign({}, pcCoords(), { resolved: next })).then(function (d) {
          card.__resolving = false;
          if (!d || !d.ok || !d.comment) return;
          if (typeof d.dataSeq === 'number') pcLastDataSeq = d.dataSeq;
          // Update the card IN PLACE so it keeps its expanded/focused state
          // (rebuilding collapsed it, which read as "resolve didn't work").
          card.__data = d.comment;
          card.classList.toggle('pc-resolved', !!d.comment.resolved);
          var resBtn = card.querySelector('.pc-resolve');
          if (resBtn) { resBtn.textContent = d.comment.resolved ? '\u21ba' : '\u2713'; resBtn.title = d.comment.resolved ? 'Reopen' : 'Resolve'; }
          var head = card.querySelector('.rh-head');
          var res = head.querySelector('.rh-res');
          if (d.comment.resolved && !res) { var span = document.createElement('span'); span.className = 'rh-res'; span.title = 'Resolved'; span.textContent = '\u2713'; head.insertBefore(span, head.querySelector('.rh-count')); }
          else if (!d.comment.resolved && res) { res.remove(); }
          pcRefresh(); // recolor the anchor marker (resolved -> green)
        });
      }
      function pcWireCard(card) {
        card.addEventListener('click', function (e) {
          if (e.target.closest && e.target.closest('button, textarea, a')) return;
          if (card.classList.contains('rh-expanded')) { clearFocus(); layout(); pcReportSelected(null); return; }
          focus(card, 'block'); pcReportSelected(card.getAttribute('data-id'));
        });
        var editBtn = card.querySelector('.pc-edit'); if (editBtn) editBtn.addEventListener('click', function (e) { e.stopPropagation(); var ta = card.querySelector('.pc-text'); ta.value = (card.__data && card.__data.content) || ''; pcShowEdit(card, true); ta.focus(); });
        var replyBtn = card.querySelector('.pc-reply-btn'); if (replyBtn) replyBtn.addEventListener('click', function (e) { e.stopPropagation(); pcShowReply(card, true); var replyTa = card.querySelector('.pc-reply-text'); if (replyTa) replyTa.focus(); });
        var replySubmit = card.querySelector('.pc-reply-submit'); if (replySubmit) replySubmit.addEventListener('click', function (e) { e.stopPropagation(); pcCommitReply(card); });
        var replyCancel = card.querySelector('.pc-reply-cancel'); if (replyCancel) replyCancel.addEventListener('click', function (e) { e.stopPropagation(); var replyTa = card.querySelector('.pc-reply-text'); if (replyTa) replyTa.value = ''; pcShowReply(card, false); });
        var delBtn = card.querySelector('.pc-del'); if (delBtn) delBtn.addEventListener('click', function (e) { e.stopPropagation(); pcDelete(card); });
        var resBtn = card.querySelector('.pc-resolve'); if (resBtn) resBtn.addEventListener('click', function (e) { e.stopPropagation(); pcToggleResolved(card); });
        var saveBtn = card.querySelector('.pc-save'); if (saveBtn) saveBtn.addEventListener('click', function (e) { e.stopPropagation(); pcCommit(card); });
        var ta = card.querySelector('.pc-text');
        if (ta) {
          // Commits on Save, Ctrl+Enter, or losing focus.
          ta.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); ta.blur(); }
          });
          ta.addEventListener('blur', function () { setTimeout(function () { var ae = document.activeElement; if (ae && card.contains(ae)) return; pcCommit(card); }, 150); });
        }
        var replyTa = card.querySelector('.pc-reply-text');
        if (replyTa) replyTa.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); pcCommitReply(card); } });
      }
      function pcCreateDraft(block, line) {
        if (pcDraft) { var ta0 = pcDraft.querySelector('.pc-text'); if (ta0 && ta0.value.trim()) { pcCommit(pcDraft); } else { pcRemoveDraft(); } }
        if (marginEl.classList.contains('collapsed')) marginEl.classList.remove('collapsed');
        var empty = pcBody().querySelector('.ro-empty'); if (empty) empty.remove();
        var c = { id: '', line: line, author: RO_USER, content: '', createdAt: new Date().toISOString() };
        var card = pcBuildCard(c, true);
        card.__block = block;
        pcBody().appendChild(card);
        pcDraft = card;
        block.classList.add('pc-active');
        pcShowEdit(card, true);
        pcRefresh();
        var ta = card.querySelector('.pc-text'); if (ta) ta.focus();
        focus(card, 'card');
      }
      function pcAddDot(block) {
        if (block.querySelector('.pc-add')) return;
        block.style.position = 'relative';
        var dot = document.createElement('button');
        dot.type = 'button'; dot.className = 'pc-add'; dot.textContent = '\uff0b';
        dot.title = 'Add annotation';
        dot.addEventListener('click', function (e) { e.stopPropagation(); pcCreateDraft(block, pcLineForBlock(block)); });
        block.appendChild(dot);
      }
      function pcWireHover() {
        blocks.forEach(function (b) {
          b.addEventListener('mouseenter', function () { b.classList.add('pc-hover'); pcAddDot(b); });
          b.addEventListener('mouseleave', function () {
            b.classList.remove('pc-hover');
            var dot = b.querySelector('.pc-add'); if (dot) dot.remove();
            // An empty, unfocused draft anchored here vanishes when the block loses focus.
            if (pcDraft && pcDraft.__block === b) {
              var ta = pcDraft.querySelector('.pc-text');
              if (ta && !ta.value.trim() && document.activeElement !== ta) pcRemoveDraft();
            }
          });
        });
      }
      function pcCardForBlock(block) {
        var line = pcLineForBlock(block);
        if (line == null) return null;
        for (var i = 0; i < cards.length; i++) { if (parseInt(cards[i].getAttribute('data-line'), 10) === line) return cards[i]; }
        return null;
      }
      // Clicking a different section clears the current section's border/focus and
      // un-highlights its comment; clicking a section that has a comment focuses it.
      function pcWireContentClicks() {
        docEl.addEventListener('click', function (e) {
          if (e.target.closest('.pc-add, .rh-marker, a, button, textarea, input')) return;
          var focusedBlock = docEl.querySelector('.section-focused');
          var block = e.target.closest('.ro-commentable');
          if (block && block === focusedBlock) return; // clicking the focused section: keep it
          var card = block ? pcCardForBlock(block) : null;
          if (card) { focus(card, 'card'); pcReportSelected(card.getAttribute('data-id')); }
          else if (focusedBlock) { clearFocus(); layout(); pcReportSelected(null); }
        });
      }
      function pcLoad() {
        var body = pcBody();
        if (body) body.innerHTML = '';
        (RO_PERSONAL_COMMENTS || []).forEach(function (c) { pcBody().appendChild(pcBuildCard(c, false)); });
        if (!(RO_PERSONAL_COMMENTS || []).length && body) body.innerHTML = '<div class="ro-empty">No annotations yet.</div>';
        pcWireHover();
        pcWireContentClicks();
        pcRefresh();
        // Live channel: poll for MCP-driven data changes + one-shot UI commands.
        setInterval(pcPoll, 1200); pcPoll();
      }
      function init() {
        collectBlocks();
        window.addEventListener('load', layout);
        var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(layout, 150); });
        // Show markers + relayout whenever the margin is revealed (default hidden);
        // cards have no measurable height while display:none.
        var mo = new MutationObserver(function () {
          var shown = !marginEl.classList.contains('collapsed');
          document.body.classList.toggle('show-markers', shown && cards.length > 0);
          if (shown) { layout(); setTimeout(layout, 60); }
        });
        mo.observe(marginEl, { attributes: true, attributeFilter: ['class'] });
        if (RO_REVIEWING) pcLoad(); else loadHistory();
      }
      // Run after the mermaid transform has claimed its blocks (it registers its
      // own DOMContentLoaded handler earlier, so it runs first).
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
      else init();
    })();
  <\/script>
${NAV_WATCHER}
</body></html>`;
}

// --- Spec review page (3-column layout) ---
function buildSpecPage(specHtml, toc, metadata, pr, threads, specPath, sourceMap, changedFiles, currentFileIndex, rawMarkdown, canEdit, baseObjectId, viewedMap = {}, viewedError = null, reviewing = false, ctx = null, reviewPc = null) {
  const tocHtml = toc
    .map(
      (t) =>
        `<a href="#${t.id}" class="toc-item" style="padding-left:${(t.level - 1) * 12 + 12}px" data-id="${t.id}">${escHtml(t.text)}</a>`
    )
    .join("\n");

  const prTitle = escHtml(metadata.title || pr.title || "Spec Review");
  const author = escHtml(pr.createdBy?.displayName || "Unknown");
  const prId = pr.pullRequestId;
  const _clipName = (s) => { const n = String(s || "").split("/").pop() || "File"; return n.length > 16 ? n.slice(0, 16) + "\u2026" : n; };
  // Personal Comments (annotations) data: branch/file-editor mode supplies it via
  // ctx.pc; a real PR review page supplies it via reviewPc (independent of ctx,
  // which stays branch-mode-only). dualMode = a real PR page with annotations
  // available, i.e. the sidebar can toggle between Comments and Annotations.
  const pcCtx = (ctx && ctx.pc) ? ctx.pc : (reviewPc || null);
  const dualMode = !ctx && !!pcCtx;

  // Split threads: active (status 1=active, 0=unknown) vs resolved (status 2=fixed, 4=closed etc.)
  const allThreads = sortThreadsByLine((threads || []).filter((t) => t.comments?.length > 0));
  const activeThreads = allThreads.filter((t) => t.status !== 2 && t.status !== 4);
  const resolvedThreads = allThreads.filter((t) => t.status === 2 || t.status === 4);

  function buildThreadHtml(t, isResolved) {
    const anchor = t.threadContext?.filePath
      ? t.threadContext.filePath.split("/").pop() + (t.threadContext.rightFileStart ? `:${t.threadContext.rightFileStart.line}` : "")
      : (t.comments?.[0]?.author?.displayName || "");
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
    const lastId = (t.comments || []).reduce((m, c) => Math.max(m, c.id || 0), 0);
    const viewed = viewedMap[String(t.id)] != null && Number(viewedMap[String(t.id)]) === lastId;
    // If the last comment is mine (the PR author), I've obviously seen the thread —
    // "Mark viewed" is nonsense there.
    const lastComment = (t.comments || [])[t.comments.length - 1];
    const mineLast = !!(lastComment?.author?.displayName && pr.createdBy?.displayName
      && lastComment.author.displayName === pr.createdBy.displayName);
    // Status tag in the thread header. "Replied" = my comment is last (I responded);
    // "Viewed" = I explicitly acknowledged the latest comment.
    const tagStyle = "margin-left:6px;padding:1px 8px;border-radius:99px;font-size:10px;font-weight:600;background:var(--cp-border);color:var(--cp-text-muted);";
    const statusTag = isResolved
      ? ""
      : mineLast
        ? `<span style="${tagStyle}">Replied</span>`
        : viewed
          ? `<span style="${tagStyle}">Viewed</span>`
          : "";
    const actions = isResolved
      ? ``
      : `<div class="thread-actions">
          <button class="btn-thread-reply" onclick="openReply(${t.id})">Reply</button>
          ${(viewed || mineLast) ? "" : `<button class="btn-thread-reply" onclick="toggleViewed(${t.id}, false)">Mark viewed</button>`}
          <button class="btn-thread-resolve" onclick="resolveThread(${t.id})">✓ Resolve</button>
        </div>
        <form class="reply-form" data-thread-id="${t.id}" onsubmit="return false;">
          <textarea class="reply-textarea" rows="3" placeholder="Reply… (⌘/Ctrl+Enter to post and advance, Esc to cancel)"></textarea>
          <div class="reply-form-actions">
            <button type="button" class="reply-btn-post" onclick="submitReply(${t.id})">Post & next</button>
            <button type="button" class="reply-btn-cancel reply-btn-discard" style="display:none;" onclick="discardDraft(${t.id})">Discard draft</button>
            <button type="button" class="reply-btn-cancel reply-btn-close" onclick="closeReply(${t.id})">Cancel</button>
          </div>
        </form>`;
    return `<div class="comment-thread ${statusClass}" data-thread-id="${t.id}" data-thread-line="${t.threadContext?.rightFileStart?.line || ""}" onclick="onThreadClick(event, ${t.id})">
      <div class="thread-head">
        <button type="button" class="thread-collapse-btn" title="Collapse / expand" aria-label="Collapse or expand this comment" aria-expanded="true" onclick="toggleThreadCollapse(event, ${t.id})">\u25be</button>
        <div class="comment-anchor">${isResolved ? `<span class="resolved-check">\u2713 </span>` : ""}${escHtml(anchor) || "Comment"}${statusTag}</div>
      </div>
      <div class="thread-body">
        <div class="thread-comments">${commentsHtml}</div>
        ${actions}
      </div>
    </div>`;
  }

  // Render active + resolved threads as a single list ordered by anchor line
  // (sortThreadsByLine) so the pane reads top-to-bottom with the document.
  // Resolving a thread must not move it (its line is unchanged), only restyle it.
  // activeThreads/resolvedThreads are still used for the header counts above.
  const threadsHtml = allThreads.length === 0
    ? `<p class="empty-comments">No comments yet. Click on a paragraph to start a review.</p>`
    : allThreads.map(t => buildThreadHtml(t, t.status === 2 || t.status === 4)).join("");

  // File navigation list for left sidebar
  const filesNavHtml = changedFiles
    .map((f, i) => {
      const name = f.path.split("/").pop();
      const active = i === currentFileIndex ? "file-nav-active" : "";
      return `<a href="/file/${i}" class="file-nav-item ${active}" title="${escHtml(f.path)}" onclick="document.body.classList.add('nav-loading')">${escHtml(name)}</a>`;
    })
    .join("\n");

  // Header actions (view toggle + edit buttons) now live in the top
  // breadcrumb row's right slot; the old second header row is gone.
  const headerActions = `
    <div class="view-toggle" id="viewToggle" role="group" aria-label="View">
      <button class="view-btn active" data-view="current" onclick="tippani.setView('current')" title="Version currently committed in the PR">Current</button>
      <button class="view-btn" data-view="diff" onclick="tippani.setView('diff')" title="Proposed changes overlaid" disabled>Diff</button>
      <button class="view-btn" data-view="proposed" onclick="tippani.setView('proposed')" title="Proposed version (clean)" disabled>Proposed</button>
    </div>
    <span class="dirty-dot" id="dirtyDot" style="display:none" title="Unsaved changes">●</span>
    ${canEdit ? `<button class="edit-toggle save-btn" id="saveBtn" onclick="tippani.save()" style="display:none" disabled>Save</button>` : ""}
    ${canEdit ? `<button class="edit-toggle" id="findBtn" onclick="tippani.search()" style="display:none" title="Find & Replace (Ctrl+F / Ctrl+H)">Find</button>` : ""}
    ${canEdit ? `<button class="edit-toggle" id="editToggle" onclick="tippani.toggle()" title="Toggle edit mode (${"⌘"}/Ctrl+E)">Edit</button>` : ""}
    <span id="proposalSource" class="proposal-source" style="display:none"></span>
    <button class="edit-toggle" id="discardProposalBtn" onclick="tippani.discardProposal()" style="display:none" title="Discard the staged proposed edit for this file">Discard proposal</button>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${prTitle} — Tippani</title>
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
.edit-toggle { font-family: inherit; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--cp-border); background: var(--cp-bg); color: var(--cp-text); cursor: pointer; transition: background 0.12s, border-color 0.12s; }
.edit-toggle:hover { background: var(--cp-surface-soft); border-color: var(--cp-border-strong); }
/* Edit-mode visual distinction on the center column */
.main-content.editing { box-shadow: inset 0 0 0 2px var(--cp-accent-soft); background: var(--cp-accent-soft); }
.main-content.editing #spec-editor { background: var(--cp-bg); }
/* --- Formatting toolbar (#55) --- */
.fmt-toolbar { display: flex; align-items: center; gap: 2px; padding: 4px 8px; background: var(--cp-surface, #fff); border-bottom: 1px solid var(--cp-border, #e0e0e0); position: sticky; top: 0; z-index: 10; flex-shrink: 0; flex-wrap: wrap; }
.fmt-group { display: inline-flex; align-items: center; gap: 2px; }
.fmt-sep { width: 1px; height: 20px; background: var(--cp-border, #e0e0e0); margin: 0 4px; }
.fmt-btn { font-family: inherit; font-size: 13px; line-height: 1; min-width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; padding: 0 5px; border: 1px solid transparent; border-radius: 4px; background: transparent; color: var(--cp-text, #1a1a1a); cursor: pointer; transition: background 0.1s, border-color 0.1s; }
.fmt-btn:hover { background: var(--cp-surface-soft, #f5f5f5); border-color: var(--cp-border, #e0e0e0); }
.fmt-btn.active, .fmt-btn[aria-pressed="true"] { background: var(--cp-accent-soft, #e8f0fe); border-color: var(--cp-accent, #1a73e8); color: var(--cp-accent, #1a73e8); }
.fmt-btn code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; pointer-events: none; }
.fmt-heading-btn { font-weight: 600; min-width: 32px; }
.fmt-dropdown { position: absolute; top: 100%; left: 0; margin: 2px 0 0; padding: 4px 0; list-style: none; background: var(--cp-surface, #fff); border: 1px solid var(--cp-border, #e0e0e0); border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.12); z-index: 30; min-width: 140px; }
.fmt-dropdown li { padding: 6px 12px; cursor: pointer; font-size: 13px; color: var(--cp-text, #1a1a1a); }
.fmt-dropdown li:hover { background: var(--cp-surface-soft, #f5f5f5); }
.fmt-dropdown li[aria-selected="true"] { font-weight: 600; color: var(--cp-accent, #1a73e8); }
.fmt-group { position: relative; }
/* Styled tooltip — replaces slow native title tooltip */
.fmt-btn { position: relative; }
.fmt-btn::after { content: attr(title); position: absolute; bottom: -30px; left: 50%; transform: translateX(-50%); padding: 3px 8px; font-size: 11px; font-weight: 500; white-space: nowrap; color: var(--cp-accent-fg, #fff); background: var(--cp-text, #1a1a1a); border-radius: 4px; pointer-events: none; opacity: 0; transition: opacity 0.12s; z-index: 40; }
.fmt-btn:hover::after { opacity: 1; }
.logo { width: 26px; height: 26px; border-radius: 6px; background: var(--cp-accent); display: flex; align-items: center; justify-content: center; color: var(--cp-accent-fg); font-size: 10px; font-weight: 700; flex-shrink: 0; }
.brand { font-size: 13px; font-weight: 600; color: var(--cp-text); flex-shrink: 0; }
.brand-sub { font-size: 11px; font-weight: 400; color: var(--cp-text-muted); flex-shrink: 0; white-space: nowrap; }
.hdr-sep { color: var(--cp-border); margin: 0 2px; }
.pr-info { min-width: 0; }
.pr-info h1 { font-size: 15px; font-weight: 700; line-height: 1.3; color: var(--cp-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pr-meta { font-size: 11px; color: var(--cp-text-muted); margin-top: 1px; display: flex; align-items: center; gap: 4px; }
.comment-count-active { color: var(--cp-accent); font-weight: 600; }
.comment-count-resolved { color: var(--cp-success); font-weight: 500; }
.spec-head { flex-shrink: 0; text-align: center; padding: 0 20px 10px; }
.spec-head h1 { font-size: 19px; font-weight: 700; line-height: 1.3; }
.spec-head .pr-meta { justify-content: center; font-size: 13px; margin-top: 3px; }
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
/* Narrow viewports: shrink the side rails, then drop the right rail entirely. */
@media (max-width: 1000px) {
  .sidebar-left { width: 200px; }
  .sidebar-right { width: 240px; }
}
@media (max-width: 760px) {
  .sidebar-right { display: none; }
  .sidebar-left { width: 180px; }
  .main-content { padding: 0 16px 32px; }
}

/* Resize handles */
.resize-handle { width: 5px; flex-shrink: 0; cursor: col-resize; background: transparent; position: relative; z-index: 10; transition: background 0.15s; }
.resize-handle:hover, .resize-handle.dragging { background: var(--cp-accent-soft); }
.resize-handle::after { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 3px; height: 32px; border-radius: 2px; background: var(--cp-border-strong); opacity: 0; transition: opacity 0.15s; }
.resize-handle:hover::after, .resize-handle.dragging::after { opacity: 1; }
body.col-resizing { cursor: col-resize !important; user-select: none !important; }
body.col-resizing * { cursor: col-resize !important; user-select: none !important; }

/* Left sidebar */
.sidebar-left { width: 260px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid var(--cp-border); background: var(--cp-bg-elevated); overflow: hidden; }
.sidebar-left-scroll { flex: 1; overflow-y: auto; padding: 16px; -webkit-mask-image: linear-gradient(to bottom, transparent 0, black 12px, black calc(100% - 16px), transparent 100%); mask-image: linear-gradient(to bottom, transparent 0, black 12px, black calc(100% - 16px), transparent 100%); }
.sidebar-section-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--cp-text-muted); margin-bottom: 8px; margin-top: 16px; }
.sidebar-section-label:first-child { margin-top: 0; }
.sidebar-section-label:first-child { margin-top: 0; }
.sidebar-section-label-sub { margin-top: 20px; padding-top: 12px; border-top: 1px solid var(--cp-border); font-size: 10px; opacity: 0.9; }

.toc-item { display: block; font-size: 13px; padding: 4px 8px; border-left: 2px solid transparent; color: var(--cp-text-muted); text-decoration: none; transition: all 0.12s; border-radius: 0 4px 4px 0; }
.toc-item:hover { color: var(--cp-text); background: var(--cp-accent-soft); text-decoration: none; }
.toc-item.active { color: var(--cp-accent); border-left-color: var(--cp-accent); font-weight: 600; }

.file-nav-item { display: block; font-size: 12px; padding: 5px 8px; color: var(--cp-text-muted); text-decoration: none; border-radius: 6px; transition: all 0.12s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-nav-item:hover { background: var(--cp-accent-soft); color: var(--cp-text); text-decoration: none; }
.file-nav-active { background: var(--cp-highlight); color: var(--cp-accent); font-weight: 600; }
/* Navigation loading bar: shown when opening a file (full-page nav). */
body.nav-loading { cursor: progress; }
body.nav-loading::after { content: ''; position: fixed; left: 0; top: 0; height: 2px; width: 100%; background: var(--cp-accent); transform-origin: left; animation: navLoad 1.4s ease-out forwards; z-index: 9999; }
@keyframes navLoad { 0% { transform: scaleX(0); } 55% { transform: scaleX(0.7); } 100% { transform: scaleX(0.96); } }

/* Main content */
.main-content { flex: 1; min-width: 0; overflow-y: auto; padding: 0 40px 40px; background: var(--cp-bg); scroll-padding-top: 56px; }
.spec { background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 16px; padding: 20px 40px 40px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); max-width: 820px; margin: 0 auto; }
body.branch-mode .spec { background: transparent; border: none; box-shadow: none; padding: 8px 0 40px; }
.spec > :first-child { margin-top: 0; }
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
/* Comments/Annotations toggle (real PR review + annotations both available).
   Only one set of per-block affordances makes sense at a time: the PR "+"
   comment button belongs to Comments mode, the annotation dot/markers to
   Annotations mode — hide whichever doesn't match the active mode. */
.sidebar-mode-toggle { display: flex; gap: 2px; flex: 1 1 auto; background: var(--cp-bg); border-radius: 8px; padding: 2px; }
.sidebar-mode-btn { flex: 1 1 auto; background: none; border: none; font-size: 11px; font-weight: 600; color: var(--cp-text-muted); padding: 5px 8px; border-radius: 6px; cursor: pointer; transition: all 0.12s; }
.sidebar-mode-btn:hover { color: var(--cp-text); }
.sidebar-mode-btn.active { background: var(--cp-surface); color: var(--cp-accent); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
body.sidebar-mode-annotations .spec .commentable .comment-btn { display: none !important; }
body.sidebar-mode-comments .spec .pc-add { display: none !important; }
body.sidebar-mode-comments .spec .rh-marker { display: none !important; }

.spec table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.875rem; }
.spec th { background: var(--cp-surface-soft); padding: 8px 12px; text-align: left; font-weight: 600; border: 1px solid var(--cp-border); }
.spec td { padding: 8px 12px; border: 1px solid var(--cp-border); }
.spec tr:nth-child(even) td { background: var(--cp-surface-soft); }
.spec code { background: var(--cp-surface-soft); padding: 1px 5px; border-radius: 4px; font-family: Consolas, "Courier New", monospace; font-size: 13px; border: 1px solid var(--cp-border); }
.spec pre { background: var(--cp-code-bg); color: var(--cp-code-fg); border: 1px solid var(--cp-border); padding: 16px; border-radius: 10px; overflow-x: auto; margin: 1rem 0; }
.spec pre code { background: none; padding: 0; color: inherit; border: none; font-size: 13px; }
.spec ul, .spec ol { padding-left: 1.5rem; margin-bottom: 0.75rem; }
.spec li { margin-bottom: 0.2rem; line-height: 1.6; }
.spec strong { font-weight: 600; }
.spec blockquote { border-left: 3px solid var(--cp-accent); padding-left: 1rem; margin: 1rem 0; color: var(--cp-text-soft); }
.spec img { max-width: 100%; border-radius: 8px; }

/* Right sidebar — comments */
.sidebar-right { width: 320px; flex-shrink: 0; border-left: 1px solid var(--cp-border); background: var(--cp-bg-elevated); overflow-y: auto; padding: 16px; }
/* Shared <<>> collapse rails for PR and staged-file panes in view and edit modes. */
.tp-pane-head { display: flex; align-items: center; gap: 8px; }
.tp-pane-head .sidebar-section-label { margin: 0 !important; flex: 1 1 auto; }
.sidebar-right .tp-pane-head .sidebar-section-label { text-align: right; }
.tp-collapse-btn { background: none; border: none; cursor: pointer; color: var(--cp-text-muted); font-size: 14px; line-height: 1; padding: 2px 5px; border-radius: 6px; }
.tp-collapse-btn:hover { color: var(--cp-text); background: var(--cp-bg); }
.tp-rail { display: none; }
.tp-rail-label { writing-mode: vertical-rl; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
.layout.bl-collapsed .sidebar-left { width: 38px !important; align-items: center; }
.layout.bl-collapsed .sidebar-left .sidebar-left-scroll { display: none; }
.layout.bl-collapsed .sidebar-left .tp-rail { display: flex; flex-direction: column; align-items: center; gap: 10px; padding-top: 12px; width: 38px; background: none; border: none; cursor: pointer; color: var(--cp-text-muted); font-size: 14px; }
.layout.bl-collapsed .sidebar-left .tp-rail:hover { color: var(--cp-text); }
.layout.bl-collapsed #resizeLeft { display: none; }
.layout.br-collapsed .sidebar-right { width: 38px !important; padding: 12px 0 0; align-items: center; overflow: hidden; }
.layout.br-collapsed .sidebar-right > *:not(.tp-rail) { display: none; }
.layout.br-collapsed .sidebar-right .tp-rail { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 38px; background: none; border: none; cursor: pointer; color: var(--cp-text-muted); font-size: 14px; }
.layout.br-collapsed .sidebar-right .tp-rail:hover { color: var(--cp-text); }
.layout.br-collapsed #resizeRight { display: none; }
.empty-comments { font-size: 13px; color: var(--cp-text-muted); font-style: italic; padding: 12px 0; }
.comment-thread { background: var(--cp-surface); border: 1px solid var(--cp-border); border-radius: 16px; padding: 16px; margin-bottom: 10px; font-size: 13px; transition: box-shadow 0.15s; overflow: hidden; min-width: 0; }
/* Item 9: cap a thread's comment list so a long thread doesn't push the last
   reply + reply box off-screen — older comments scroll internally; the latest
   comment stays visible. Scrollbar only appears when the list exceeds the cap. */
.thread-comments { max-height: 42vh; overflow-y: auto; overflow-x: hidden; resize: vertical; }
/* Dragging the resize handle writes an inline height — once the user has
   resized, lift the 42vh cap so the list can GROW past it, not only shrink. */
.thread-comments[style*="height"] { max-height: none; }
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
/* Per-comment expand/collapse (state persisted per PR+file in localStorage). */
.thread-head { display: flex; align-items: flex-start; gap: 6px; }
.thread-head .comment-anchor { flex: 1 1 auto; min-width: 0; }
.thread-collapse-btn { flex-shrink: 0; width: 18px; height: 18px; line-height: 1; padding: 0; border: none; background: none; color: var(--cp-text-muted); cursor: pointer; font-size: 12px; border-radius: 4px; transition: transform 0.12s, color 0.12s, background 0.12s; }
.thread-collapse-btn:hover { color: var(--cp-text); background: var(--cp-surface-soft); }
.comment-thread.thread-collapsed .thread-collapse-btn { transform: rotate(-90deg); }
.comment-thread.thread-collapsed .thread-body { display: none; }
.comment-thread.thread-collapsed .comment-anchor { margin-bottom: 0; }
.resolved-check { font-weight: 600; }
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

/* Inline reply form (Phase 0: keyboard nav, #42) */
.reply-form { display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--cp-border); }
.reply-form.open { display: block; }
.reply-textarea { width: 100%; box-sizing: border-box; font-family: inherit; font-size: 13px; padding: 8px; border: 1px solid var(--cp-border); border-radius: 6px; background: var(--cp-surface-soft); color: var(--cp-text); resize: vertical; min-height: 64px; }
.reply-textarea:focus { outline: none; border-color: var(--cp-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--cp-accent) 25%, transparent); }
.reply-form-actions { display: flex; gap: 8px; margin-top: 8px; }
.reply-btn-post { background: var(--cp-accent); color: #fff; border: none; font-size: 12px; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-weight: 500; }
.reply-btn-post:hover { opacity: 0.9; }
.reply-btn-cancel { background: none; border: 1px solid var(--cp-border); color: var(--cp-text-muted); font-size: 12px; padding: 5px 12px; border-radius: 6px; cursor: pointer; }
.reply-btn-cancel:hover { color: var(--cp-text); }
.reply-external-badge { font-size: 11px; color: var(--cp-accent); background: color-mix(in srgb, var(--cp-accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--cp-accent) 30%, transparent); border-radius: 6px; padding: 4px 8px; margin-bottom: 6px; }
.comment-thread.thread-focused { box-shadow: 0 0 0 2px #6d071a; border-color: #6d071a !important; cursor: pointer; }
/* Item 2/8: persistent Bordeaux-red highlight on the source section tied to the focused thread (no timeout). */
.spec .section-focused { box-shadow: 0 0 0 2px #6d071a; border-radius: 6px; }
[data-theme="dark"] .comment-thread.thread-focused { box-shadow: 0 0 0 2px #b23a58; border-color: #b23a58 !important; }
[data-theme="dark"] .spec .section-focused { box-shadow: 0 0 0 2px #b23a58; }
/* Task 2 (clickstop 2): Personal Comments margin — lifted verbatim from the
   read-only review experience (buildReadonlySpecPage), scoped to branch mode so
   the PR threads pane is untouched. Cards float beside their anchor block and the
   pane scrolls in lockstep with #mainContent. */
.pc-margin { position: relative; overflow: hidden !important; padding: 0 !important; }
.pc-margin .tp-pane-head { position: sticky; top: 0; z-index: 6; background: var(--cp-bg-elevated); padding: 12px 14px; border-bottom: 1px solid var(--cp-border); }
.pc-margin .tp-pane-head .sidebar-section-label { text-align: right; }
.pc-margin-body { position: relative; }
.ro-empty { font-size: 12px; color: var(--cp-text-muted); padding: 12px; }
.rh-thread { position: absolute; left: 10px; right: 10px; padding: 8px 10px; border: 1px solid var(--cp-border); border-radius: 10px; background: var(--cp-surface); cursor: pointer; transition: box-shadow 0.15s, border-color 0.15s; }
.rh-thread:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
.rh-thread.rh-focused { box-shadow: 0 0 0 2px #6d071a; border-color: #6d071a; z-index: 3; }
[data-theme="dark"] .rh-thread.rh-focused { box-shadow: 0 0 0 2px #b23a58; border-color: #b23a58; }
.rh-head { display: flex; align-items: center; gap: 6px; }
.rh-badge { font-size: 10px; font-weight: 700; color: var(--cp-accent); white-space: nowrap; }
.rh-hline { font-size: 10px; color: var(--cp-text-muted); }
.rh-count { margin-left: auto; font-size: 10px; font-weight: 700; min-width: 16px; height: 16px; padding: 0 5px; border-radius: 8px; background: var(--cp-surface-soft); color: var(--cp-text-muted); display: inline-flex; align-items: center; justify-content: center; }
.rh-res { color: #2f8f4e; font-size: 12px; }
.pc-drift { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; padding: 0 4px; border-radius: 6px; margin-left: 4px; cursor: help; }
.pc-drift-stale { background: rgba(220, 38, 38, 0.12); color: var(--cp-danger); }
.pc-drift-moved { background: rgba(245, 158, 11, 0.14); color: var(--cp-warning); }
.rh-summary { font-size: 12px; color: var(--cp-text-muted); margin-top: 5px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rh-thread.rh-expanded .rh-summary { display: none; }
.rh-full { display: none; margin-top: 6px; }
.rh-thread.rh-expanded .rh-full { display: block; }
.rh-thread.rh-expanded:not(.pc-card) .rh-full { max-height: 55vh; overflow-y: auto; }
.pc-card .rh-summary { display: none; }
.pc-card .rh-full { display: block; }
.pc-card .pc-view .rh-body { max-height: calc(100vh - 160px); overflow-y: auto; resize: vertical; }
.pc-replies { margin-top: 8px; border-top: 1px dashed var(--cp-border); padding-top: 6px; }
.pc-reply { margin-top: 6px; padding-left: 8px; border-left: 2px solid var(--cp-accent); }
.pc-reply-meta { font-size: 10px; font-weight: 700; color: var(--cp-accent); margin-bottom: 2px; }
.pc-reply .rh-body { font-size: 12px; }
.rh-anchor { font-size: 11px; color: var(--cp-text-muted); margin-bottom: 6px; }
.rh-comment { margin: 6px 0; }
.rh-comment + .rh-comment { border-top: 1px dashed var(--cp-border); padding-top: 6px; }
.rh-cmeta { display: flex; align-items: baseline; gap: 6px; }
.rh-who { font-size: 12px; font-weight: 600; color: var(--cp-text); }
.rh-when { font-size: 11px; color: var(--cp-text-muted); }
.rh-body { font-size: 13px; margin-top: 2px; line-height: 1.45; overflow-wrap: anywhere; }
.rh-body p { margin: 4px 0; }
.rh-body code { font-family: var(--cp-mono, ui-monospace, monospace); font-size: 12px; background: var(--cp-surface-2, rgba(127,127,127,0.14)); padding: 1px 4px; border-radius: 4px; }
.rh-body pre { background: var(--cp-surface-2, rgba(127,127,127,0.14)); padding: 8px 10px; border-radius: 6px; overflow-x: auto; }
.rh-body pre code { background: none; padding: 0; }
.rh-body ul, .rh-body ol { margin: 4px 0; padding-left: 18px; }
.rh-body img { max-width: 100%; }
.rh-marker { display: none; position: absolute; top: 2px; width: 20px; height: 20px; border-radius: 50%; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; cursor: pointer; z-index: 4; border: none; font-family: inherit; transition: transform 0.12s; }
.rh-marker:hover { transform: scale(1.15); }
.rh-marker-active { background: var(--cp-accent); color: var(--cp-accent-fg); }
.rh-marker-resolved { background: var(--cp-success); color: #fff; }
body.show-markers .rh-marker { display: inline-flex; }
.spec .ro-commentable.pc-hover, .spec .ro-commentable.pc-active { box-shadow: 0 0 0 2px var(--cp-accent); border-radius: 6px; }
[data-theme="dark"] .spec .ro-commentable.pc-hover, [data-theme="dark"] .spec .ro-commentable.pc-active { box-shadow: 0 0 0 2px #b23a58; }
.pc-add { position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; border-radius: 50%; border: none; background: var(--cp-accent); color: #fff; font-size: 14px; font-weight: 700; line-height: 1; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; z-index: 6; box-shadow: 0 1px 5px rgba(0,0,0,0.25); }
.pc-add:hover { transform: scale(1.12); }
.pc-card .rh-count { display: none; }
.pc-card .pc-ico { flex: 0 0 auto; margin-left: 4px; padding: 2px 4px; font-size: 13px; line-height: 1; border: none; background: none; color: var(--cp-text-muted); cursor: pointer; border-radius: 4px; }
.pc-card .pc-ico:hover { color: var(--cp-accent); background: var(--cp-surface-soft); }
.pc-card .pc-del:hover { color: #c0392b; }
.pc-card .pc-resolve:hover { color: #2f8f4e; }
.pc-card .pc-save { display: none; font-family: "Segoe MDL2 Assets", "Segoe Fluent Icons"; font-size: 14px; }
.pc-card.pc-editing .pc-save { display: inline-flex; }
.pc-card.pc-editing .pc-edit { display: none; }
.pc-card.pc-resolved .rh-badge { text-decoration: line-through; color: var(--cp-text-muted); }
.pc-text { width: 100%; min-height: 66px; font-family: inherit; font-size: 13px; padding: 8px; border: 1px solid var(--cp-border); border-radius: 6px; background: var(--cp-bg); color: var(--cp-text); resize: vertical; box-sizing: border-box; }
.pc-reply-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px; }
.pc-reply-actions button { font-family: inherit; font-size: 12px; padding: 4px 9px; border: 1px solid var(--cp-border); border-radius: 5px; background: var(--cp-surface); color: var(--cp-text); cursor: pointer; }
.pc-reply-actions .pc-reply-submit { border-color: var(--cp-accent); background: var(--cp-accent); color: var(--cp-accent-fg); }
/* Phase 119: rendered Mermaid diagrams. */
.mermaid-block { margin: 14px 0; text-align: center; overflow-x: auto; }
.mermaid-block svg { max-width: 100%; height: auto; }
.mermaid-block.mermaid-error { text-align: left; }
.mermaid-error-note { font-size: 12px; color: var(--cp-text-muted); margin-bottom: 6px; }
/* Item 3: Current / Diff / Proposed view toggle. */
.view-toggle { display: inline-flex; border: 1px solid var(--cp-border); border-radius: 7px; overflow: hidden; margin-right: 6px; }
.view-btn { font-family: inherit; font-size: 12px; padding: 4px 8px; border: none; background: var(--cp-surface); color: var(--cp-text-muted); cursor: pointer; border-right: 1px solid var(--cp-border); }
.view-btn:last-child { border-right: none; }
.view-btn:hover { background: var(--cp-accent-soft); color: var(--cp-text); }
.view-btn.active { background: var(--cp-accent); color: var(--cp-accent-fg); font-weight: 600; }
.view-btn:disabled { opacity: 0.4; cursor: default; }
.kbd-hint { font-size: 11px; color: var(--cp-text-muted); padding: 6px 12px; border-top: 1px solid var(--cp-border); background: var(--cp-surface-soft); }
.kbd-hint kbd { background: var(--cp-surface); border: 1px solid var(--cp-border); border-bottom-width: 2px; border-radius: 3px; padding: 0 4px; font-family: ui-monospace, monospace; font-size: 10px; }

/* Bottom review bar */
.review-bar { height: 64px; display: flex; align-items: center; justify-content: center; gap: 12px; background: var(--cp-panel-strong); backdrop-filter: blur(16px); border-top: 1px solid var(--cp-border); flex-shrink: 0; z-index: 50; }
.review-btn { padding: 10px 28px; font-size: 14px; font-weight: 700; border-radius: 8px; border: none; cursor: pointer; transition: all 0.15s; font-family: inherit; }
.review-btn-approve { background: var(--cp-success); color: #fff; }
.review-btn-approve:hover { opacity: 0.9; }
.review-btn-changes { background: transparent; color: var(--cp-text); border: 1.5px solid var(--cp-border-strong); }
.review-btn-changes:hover { background: var(--cp-surface-soft); color: var(--cp-text); }

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
/* Spec-edit diff overlay (GitHub-style current/proposed boxes + right gutter marker) */
.docdiff-hidden { display: none !important; }
.docdiff-widget { position: relative; margin: 6px 0 16px; }
.docdiff-widget::after { content: ''; position: absolute; top: 2px; bottom: 2px; right: -18px; width: 4px; border-radius: 2px; background: var(--cp-text-muted); opacity: .45; }
.docdiff-widget.docdiff-active::after { background: var(--cp-accent); opacity: 1; }
.proposal-source { font-size: 12px; color: var(--cp-text-muted); align-self: center; margin-right: 2px; white-space: nowrap; }
.docdiff-box { border-radius: 8px; border: 1px solid; padding: 4px 14px 8px; }
.docdiff-box > :first-child { margin-top: 6px; }
.docdiff-box::before { display: block; font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; margin: 6px 0 2px; }
.docdiff-old { background: color-mix(in srgb, #d93f0b 12%, transparent); border-color: color-mix(in srgb, #d93f0b 34%, transparent); }
.docdiff-old::before { content: 'Current'; color: #d93f0b; }
.docdiff-new { background: color-mix(in srgb, var(--cp-success) 12%, transparent); border-color: color-mix(in srgb, var(--cp-success) 34%, transparent); margin-top: 6px; }
.docdiff-new::before { content: 'Proposed'; color: var(--cp-success); }
    .docdiff-widget.docdiff-personal .docdiff-new { background: color-mix(in srgb, var(--cp-accent) 12%, transparent); border-color: color-mix(in srgb, var(--cp-accent) 40%, transparent); }
    .docdiff-widget.docdiff-personal .docdiff-new::before { content: 'Your edit'; color: var(--cp-accent); }
    .docdiff-widget.docdiff-personal.docdiff-active::after { background: var(--cp-accent); }
.docdiff-merged { padding: 0 0 0 22px; border: none; background: transparent; overflow: visible; }
.docdiff-merged::before { display: none; }
.docdiff-table { border-collapse: collapse; width: 100%; font-size: 13px; }
.docdiff-table th, .docdiff-table td { border: 1px solid var(--cp-border); padding: 6px 10px; text-align: left; vertical-align: top; background: transparent; }
.docdiff-table tr.row-del > td { background: color-mix(in srgb, #d93f0b 14%, transparent); }
.docdiff-table tr.row-add > td { background: color-mix(in srgb, var(--cp-success) 16%, transparent); }
.docdiff-table tr.row-del > td:first-child, .docdiff-table tr.row-add > td:first-child { position: relative; }
.docdiff-table tr.row-del > td:first-child::before { content: '−'; position: absolute; left: -20px; color: #d93f0b; font-weight: 700; }
.docdiff-table tr.row-add > td:first-child::before { content: '+'; position: absolute; left: -20px; color: var(--cp-success); font-weight: 700; }
.diff-msg-row { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
.diff-msg-row label { font-size: 12px; font-weight: 600; color: var(--cp-text-muted); white-space: nowrap; }
.diff-msg-row input { flex: 1; font-family: inherit; font-size: 13px; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--cp-border); background: var(--cp-bg); color: var(--cp-text); }
.save-btn { background: var(--cp-accent); color: var(--cp-accent-fg); border-color: var(--cp-accent); }
.save-btn:hover:not(:disabled) { background: var(--cp-accent-hover); }
.save-btn:disabled { opacity: 0.5; cursor: default; }
.dirty-dot { color: var(--cp-accent); font-size: 12px; line-height: 1; margin-right: 2px; }
.conflict-msg { font-size: 13px; line-height: 1.55; color: var(--cp-text); margin-bottom: 6px; }

/* Toast */
.toast { position: fixed; bottom: 80px; right: 24px; background: var(--cp-surface); color: var(--cp-text); padding: 10px 18px; border-radius: 10px; font-size: 13px; display: none; z-index: 200; border: 1px solid var(--cp-border); box-shadow: var(--cp-shadow); max-width: 440px; }
    .toast.show { display: flex; align-items: flex-start; gap: 12px; }
    .toast.toast-error { border-color: var(--cp-danger); color: var(--cp-danger); }
    .toast .toast-x { flex: 0 0 auto; margin-left: auto; background: none; border: none; color: inherit; font-size: 16px; line-height: 1; cursor: pointer; opacity: .7; padding: 0 2px; }
    .toast .toast-x:hover { opacity: 1; }
<\/style>
<script>
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme = 'dark';
<\/script>
</head>
<body class="${ctx ? "branch-mode" : ""}${dualMode ? " sidebar-mode-comments" : ""}" style="display:flex;flex-direction:column;">
${ctx ? renderCrumbBar([{ label: "Home", href: "/discovery" }, { label: ctx.backLabel || "Branch", href: ctx.backHref || "/discovery" }, { label: _clipName(specPath) }], { right: headerActions }) : renderCrumbBar([{ label: "Home", href: "/discovery" }, { label: `PR #${prId}`, href: "/" }, { label: _clipName(changedFiles[currentFileIndex]?.path || specPath) }], { right: headerActions })}

<div class="spec-head">
  <h1>${prTitle}</h1>
  <div class="pr-meta">${ctx ? `${escHtml(ctx.subtitle || "")} ${ctx.badge || ""}` : `PR #${prId} by ${author}
    <span class="hdr-sep">·</span>
    <span class="comment-count-active">${activeThreads.length} active</span>
    ${resolvedThreads.length > 0 ? `<span class="comment-count-resolved">· ${resolvedThreads.length} resolved</span>` : ""}`}
  </div>
</div>

<div class="layout" id="layout">
  <nav class="sidebar-left" id="sidebarLeft">
    <div class="sidebar-left-scroll">
      <div class="tp-pane-head"><span class="sidebar-section-label">Contents</span><button type="button" class="tp-collapse-btn" onclick="tpPaneCollapse('left')" title="Collapse" aria-label="Collapse contents">«</button></div>
      ${tocHtml}
      ${ctx ? "" : `<div class="sidebar-section-label sidebar-section-label-sub">Files in PR</div>
      ${filesNavHtml}`}
    </div>
    <button type="button" class="tp-rail" onclick="tpPaneCollapse('left')" title="Expand contents" aria-label="Expand contents"><span>»</span><span class="tp-rail-label">Contents</span></button>
  </nav>

  <div class="resize-handle" id="resizeLeft"></div>

  <main class="main-content" id="mainContent">
    ${canEdit ? `<div class="fmt-toolbar" id="fmtToolbar" role="toolbar" aria-label="Formatting" aria-orientation="horizontal" style="display:none">
      <span class="fmt-group">
        <button class="fmt-btn fmt-heading-btn" id="fmtHeading" aria-haspopup="listbox" aria-expanded="false" title="Block type" aria-label="Block type">¶</button>
        <ul class="fmt-dropdown" id="fmtHeadingMenu" role="listbox" aria-label="Block type" style="display:none">
          <li role="option" data-level="0" aria-selected="true">Paragraph</li>
          <li role="option" data-level="1">Heading 1</li>
          <li role="option" data-level="2">Heading 2</li>
          <li role="option" data-level="3">Heading 3</li>
          <li role="option" data-level="4">Heading 4</li>
        </ul>
      </span>
      <span class="fmt-sep" role="separator"></span>
      <span class="fmt-group">
        <button class="fmt-btn" id="fmtBold" aria-pressed="false" title="Bold (⌘B)" aria-label="Bold" tabindex="-1"><b>B</b></button>
        <button class="fmt-btn" id="fmtItalic" aria-pressed="false" title="Italic (⌘I)" aria-label="Italic" tabindex="-1"><i>I</i></button>
        <button class="fmt-btn" id="fmtStrike" aria-pressed="false" title="Strikethrough (⌘⇧S)" aria-label="Strikethrough" tabindex="-1"><s>S</s></button>
        <button class="fmt-btn" id="fmtCode" aria-pressed="false" title="Inline code (⌘E)" aria-label="Inline code" tabindex="-1"><code>&lt;&gt;</code></button>
      </span>
      <span class="fmt-sep" role="separator"></span>
      <span class="fmt-group">
        <button class="fmt-btn" id="fmtBullet" aria-pressed="false" title="Bullet list (⌘⇧8)" aria-label="Bullet list" tabindex="-1">•</button>
        <button class="fmt-btn" id="fmtOrdered" aria-pressed="false" title="Ordered list (⌘⇧7)" aria-label="Ordered list" tabindex="-1">1.</button>
        <button class="fmt-btn" id="fmtTask" aria-pressed="false" title="Task list (⌘⇧9)" aria-label="Task list" tabindex="-1">☐</button>
      </span>
      <span class="fmt-sep" role="separator"></span>
      <span class="fmt-group">
        <button class="fmt-btn" id="fmtQuote" aria-pressed="false" title="Blockquote (⌘⇧.)" aria-label="Blockquote" tabindex="-1">❝</button>
        <button class="fmt-btn" id="fmtCodeBlock" aria-pressed="false" title="Code block (⌘⇧K)" aria-label="Code block" tabindex="-1">▤</button>
        <button class="fmt-btn" id="fmtHR" title="Horizontal rule" aria-label="Horizontal rule" tabindex="-1">―</button>
      </span>
      <span class="fmt-sep" role="separator"></span>
      <span class="fmt-group">
        <button class="fmt-btn" id="fmtLink" title="Link (⌘K)" aria-label="Insert link" tabindex="-1">🔗</button>
        <button class="fmt-btn" id="fmtImage" title="Image" aria-label="Insert image" tabindex="-1">🖼</button>
        ${pcCtx ? '<button class="fmt-btn" id="fmtComment" title="Add annotation at cursor" aria-label="Add annotation at cursor" tabindex="-1">💬</button>' : ""}
      </span>
      <span class="fmt-sep" role="separator"></span>
      <span class="fmt-group">
        <button class="fmt-btn" id="fmtIndent" title="Indent (Tab)" aria-label="Indent" tabindex="-1">⇥</button>
        <button class="fmt-btn" id="fmtOutdent" title="Outdent (⇧Tab)" aria-label="Outdent" tabindex="-1">⇤</button>
      </span>
    </div>` : ""}
    ${viewedWarning(viewedError)}
    <div class="spec" id="spec-content">
      ${specHtml}
    </div>
    <div class="spec spec-edit" id="spec-editor" style="display:none"></div>
    <div class="spec" id="spec-current" style="display:none"></div>
  </main>

  <div class="resize-handle" id="resizeRight"></div>

  <aside class="sidebar-right${pcCtx && !dualMode ? " pc-margin" : ""}" id="sidebarRight">
    <div class="tp-pane-head"><button type="button" class="tp-collapse-btn" onclick="tpPaneCollapse('right')" title="Collapse" aria-label="Collapse comments">»</button>${dualMode
      ? `<div class="sidebar-mode-toggle" role="tablist" aria-label="Sidebar view">
        <button type="button" class="sidebar-mode-btn active" id="sidebarModeComments" role="tab" aria-selected="true" onclick="setSidebarMode('comments')">Comments <span class="comment-count-badge">${activeThreads.length} active</span></button>
        <button type="button" class="sidebar-mode-btn" id="sidebarModeAnnotations" role="tab" aria-selected="false" onclick="setSidebarMode('annotations')">Annotations</button>
      </div>`
      : `<span class="sidebar-section-label">${pcCtx ? "Annotations" : `Comments <span class="comment-count-badge">${activeThreads.length} active</span>`}</span>`}</div>
    ${dualMode
      ? `<div id="sidebarComments"><div class="kbd-hint"><kbd>J</kbd>/<kbd>K</kbd> next/prev · <kbd>R</kbd> reply · <kbd>S</kbd> skip · <kbd>⌘↵</kbd> post &amp; next</div>
    ${threadsHtml}</div>
    <div id="sidebarAnnotations" style="display:none"><div class="pc-margin-body" id="pcMarginBody"><div class="ro-empty">No annotations yet.</div></div></div>`
      : (pcCtx
        ? `<div class="pc-margin-body" id="pcMarginBody"><div class="ro-empty">No annotations yet.</div></div>`
        : `<div class="kbd-hint"><kbd>J</kbd>/<kbd>K</kbd> next/prev · <kbd>R</kbd> reply · <kbd>S</kbd> skip · <kbd>⌘↵</kbd> post &amp; next</div>
    ${threadsHtml}`)}
    <button type="button" class="tp-rail" onclick="tpPaneCollapse('right')" title="Expand comments" aria-label="Expand comments"><span>«</span><span class="tp-rail-label" id="sidebarRailLabel">${pcCtx && !dualMode ? "Annotations" : "Comments"}</span></button>
  </aside>
</div>

<div class="sync-bar" id="syncBar">
  <span class="sync-status" id="syncStatus"></span>
  <button class="sync-btn" id="syncBtn" onclick="syncPending()">Sync to ADO</button>
</div>

${reviewing ? `<div class="review-bar">
  <button class="review-btn review-btn-approve" onclick="submitReview('approve')">Approve</button>
  <button class="review-btn review-btn-changes" onclick="submitReview('request-changes')">Request Changes</button>
</div>` : ``}

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
<script>${MERMAID_VIEW_JS}</script>
<script>
// #47 edit/view toggle. Read-only rendered view is the default; editing is opt-in.
// The CM editor is mounted lazily on first entry and reused, so edits persist
// across toggle cycles within the session. Cmd/Ctrl+E toggles.
window.tippani = (function () {
  // Mutable baseline: updated after a successful save so the editor is no longer
  // dirty and the next diff is measured against the saved state.
  let RAW_MARKDOWN = ${jsonForScript(rawMarkdown || "")};
  const CURRENT_MARKDOWN = ${jsonForScript(ctx && ctx.save && typeof ctx.save.currentMarkdown === "string" ? ctx.save.currentMarkdown : (rawMarkdown || ""))};
  const SPEC_FILE_PATH = ${jsonForScript(specPath)};
  const FILENAME = SPEC_FILE_PATH.split("/").pop();
  // Branch tip at load time — sent on save so ADO rejects a stale push (#49).
  const BASE_OBJECT_ID = ${jsonForScript(baseObjectId || null)};
  // Branch (clickstop 2) staged-edit context. Null for real PRs → PR behavior
  // is byte-unchanged. When set, Save stages the edit and the reading views
  // source the original/proposed from the client buffer (stateless preview).
  const BRANCH = ${jsonForScript(ctx && ctx.save ? ctx.save : null)};
  window.__BRANCH = BRANCH;
  // Personal Comments payload: branch mode (ctx.pc) or a real PR page that also
  // offers annotations (reviewPc). BRANCH stays null for real PRs either way, so
  // existing PR-only behavior (no BRANCH) is unaffected.
  window.__PC = ${jsonForScript(pcCtx)};
  const ORIG_TITLE = document.title;
  let editor = null;
  let editMode = false;
  let saving = false;

  const el = (id) => document.getElementById(id);
  const isDirty = () => !!editor && editor.getMarkdown() !== RAW_MARKDOWN;
  const comparisonOriginal = () => (BRANCH && BRANCH.pureStaged ? "" : CURRENT_MARKDOWN);
  const toast = (m, o) => window.showToast && window.showToast(m, o);
  const toastError = (m) => { if (window.showToast) window.showToast(m, { persist: true, error: true }); };

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
    // setViewButtonsEnabled lives in the separate view <script> block (a global
    // function); refresh Diff/Proposed enablement whenever dirty state changes.
    if (typeof setViewButtonsEnabled === 'function') { try { setViewButtonsEnabled(); } catch (e) {} }
  }

  function ensureEditor() {
    if (!editor && window.TippaniEditor)
      editor = window.TippaniEditor.mount(el("spec-editor"), RAW_MARKDOWN, {
        onChange: onEditorChange,
      });
    return editor;
  }

  // --- Formatting toolbar wiring (#55) ----------------------------------------
  // Each button dispatches a command via window.TippaniEditor.commands and
  // refocuses the editor so the user can keep typing.
  function fmtCmd(cmdName, ...args) {
    if (!editor) return;
    const cmds = window.TippaniEditor.commands;
    const fn = typeof cmds[cmdName] === "function" ? cmds[cmdName] : null;
    if (!fn) return;
    // setHeading returns a command function, others are direct commands.
    if (cmdName === "setHeading") {
      cmds.setHeading(args[0])(editor.view);
    } else {
      fn(editor.view);
    }
    editor.view.focus();
  }

  // Wire toolbar buttons after DOM is ready.
  function wireToolbar() {
    const bindings = {
      fmtBold: "toggleBold", fmtItalic: "toggleItalic",
      fmtStrike: "toggleStrikethrough", fmtCode: "toggleInlineCode",
      fmtBullet: "toggleBulletList", fmtOrdered: "toggleOrderedList",
      fmtTask: "toggleTaskList", fmtQuote: "toggleBlockquote",
      fmtCodeBlock: "toggleCodeBlock", fmtHR: "insertHorizontalRule",
      fmtLink: "insertLink", fmtImage: "insertImage",
      fmtIndent: "indentMore", fmtOutdent: "indentLess",
    };
    for (const [id, cmd] of Object.entries(bindings)) {
      const btn = el(id);
      if (btn) btn.addEventListener("click", () => fmtCmd(cmd));
    }
    const commentBtn = el("fmtComment");
    if (commentBtn) commentBtn.addEventListener("click", () => {
      if (!editor || typeof window.__tpPcCreateDraft !== "function") return;
      const editLine = editor.view.state.doc.lineAt(editor.view.state.selection.main.head).number;
      let currentLine = null, oldLine = 0, newLine = 0;
      const diff = window.TippaniEditor.diffLines(comparisonOriginal(), editor.getMarkdown());
      for (const part of diff) {
        if (part.type === "ctx") {
          oldLine++; newLine++;
          if (newLine === editLine) { currentLine = oldLine; break; }
        } else if (part.type === "del") oldLine++;
        else if (part.type === "add") {
          newLine++;
          if (newLine === editLine) break;
        }
      }
      window.__tpPcCreateDraft({ editLine, currentLine });
    });

    // Heading dropdown.
    const headBtn = el("fmtHeading");
    const headMenu = el("fmtHeadingMenu");
    if (headBtn && headMenu) {
      headBtn.addEventListener("click", () => {
        const open = headMenu.style.display !== "none";
        headMenu.style.display = open ? "none" : "";
        headBtn.setAttribute("aria-expanded", open ? "false" : "true");
        if (!open) {
          // Close on click-outside.
          const close = (e) => {
            if (!headMenu.contains(e.target) && e.target !== headBtn) {
              headMenu.style.display = "none";
              headBtn.setAttribute("aria-expanded", "false");
              document.removeEventListener("pointerdown", close);
            }
          };
          setTimeout(() => document.addEventListener("pointerdown", close), 0);
          // Close on Escape.
          const esc = (e) => {
            if (e.key === "Escape") {
              headMenu.style.display = "none";
              headBtn.setAttribute("aria-expanded", "false");
              headBtn.focus();
              document.removeEventListener("keydown", esc);
            }
          };
          document.addEventListener("keydown", esc);
        }
      });
      headMenu.addEventListener("click", (e) => {
        const li = e.target.closest("li[data-level]");
        if (!li) return;
        fmtCmd("setHeading", Number(li.dataset.level));
        headMenu.style.display = "none";
        headBtn.setAttribute("aria-expanded", "false");
      });
    }

    // Roving tabindex: arrow keys move focus within toolbar.
    const tb = el("fmtToolbar");
    if (tb) {
      tb.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
        const btns = Array.from(tb.querySelectorAll(".fmt-btn"));
        const idx = btns.indexOf(document.activeElement);
        if (idx < 0) return;
        e.preventDefault();
        let next;
        if (e.key === "ArrowRight") next = (idx + 1) % btns.length;
        else if (e.key === "ArrowLeft") next = (idx - 1 + btns.length) % btns.length;
        else if (e.key === "Home") next = 0;
        else next = btns.length - 1;
        btns[idx].tabIndex = -1;
        btns[next].tabIndex = 0;
        btns[next].focus();
      });
    }
  }

  // Initialize toolbar wiring on first load.
  wireToolbar();

  function enterEdit() {
    if (!ensureEditor()) return;
    el("spec-content").style.display = "none";
    el("spec-editor").style.display = "";
    { const sc = el("spec-current"); if (sc) sc.style.display = "none"; }
    const tb = el("fmtToolbar");
    if (tb) tb.style.display = "";
    el("mainContent").classList.add("editing");
    const btn = el("editToggle");
    if (btn) btn.textContent = "View";
    const save = el("saveBtn");
    if (save) save.style.display = "";
    { const find = el("findBtn"); if (find) find.style.display = ""; }
    updateSaveState();
    updateDirtyIndicator();
    editMode = true;
    maybeSeedProposal();
    editor.view.focus();
    if (window.__tpPcRelayout) requestAnimationFrame(window.__tpPcRelayout);
  }
  function exitEdit(silent, targetView) {
    // Unsaved-changes prompt on an explicit mode switch (the View toggle). Edits
    // are kept for the session (not discarded) so they survive toggle cycles;
    // saving is via the Save button. Cancel keeps you in edit mode. A view-button
    // click passes silent=true — it's just switching reading views, edits kept.
    if (!silent && isDirty() && !confirm("You have unsaved changes. Switch to read view? Your edits are kept for this session.")) return;
    el("spec-editor").style.display = "none";
    el("spec-content").style.display = "";
    const tb = el("fmtToolbar");
    if (tb) tb.style.display = "none";
    el("mainContent").classList.remove("editing");
    const btn = el("editToggle");
    if (btn) btn.textContent = "Edit";
    const save = el("saveBtn");
    if (save) save.style.display = "none";
    { const find = el("findBtn"); if (find) find.style.display = "none"; }
    editMode = false;
    if (window.__tpPcRelayout) requestAnimationFrame(window.__tpPcRelayout);
    // Land on the requested view, else the current one — but if you have unsaved
    // edits and were on Current (committed), switch to Proposed so your edit
    // stays visible instead of vanishing behind the committed text.
    let v = targetView;
    if (!v) {
      const cur = (typeof getSpecView === "function") ? getSpecView() : "current";
      v = (isDirty() && cur === "current") ? "proposed" : cur;
    }
    if (typeof applyView === "function") applyView(v);
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

  // Once the user commits their own buffer, any staged agent proposal is stale:
  // drop it server-side and clear the diff overlay so a later commit_spec or
  // page reload can't resurface the superseded proposal.
  async function dropStagedProposal() {
    try { await fetch('/api/v1/specs/' + CURRENT_FILE_INDEX + '/draft', { method: 'DELETE' }); } catch {}
    if (typeof clearDiffOverlay === 'function') clearDiffOverlay();
    const b = el('discardProposalBtn'); if (b) b.style.display = 'none';
  }

  // Save (#48): diff preview (with editable commit message) → commit to PR branch.
  async function save() {
    if (saving || !isDirty()) return;
    const newMd = editor.getMarkdown();
    const msgRow = el("diffMsgRow");
    const msgInput = el("commitMsg");
    const defaultMsg = "tippani: update " + FILENAME;
    if (msgInput) msgInput.value = defaultMsg;
    if (msgRow) msgRow.style.display = BRANCH ? "none" : "flex";
    const ok = await showDiff(RAW_MARKDOWN, newMd);
    if (msgRow) msgRow.style.display = "none";
    if (!ok) return;
    const message = (msgInput && msgInput.value.trim()) || defaultMsg;

    // Branch mode: stage the edit into the pending (not-yet-pushed) store and
    // refresh the top-row staged-changes tag. No ADO commit.
    if (BRANCH) {
      saving = true;
      const bbtn = el("saveBtn");
      if (bbtn) bbtn.textContent = "Saving\u2026";
      updateSaveState();
      try {
        const r = await fetch(BRANCH.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ org: BRANCH.org, project: BRANCH.project, repo: BRANCH.repo, repoName: BRANCH.repoName, branch: BRANCH.branch, path: BRANCH.path, content: newMd, baseObjectId: BRANCH.baseObjectId }),
        });
        const data = await r.json();
        if (data && data.ok) {
          RAW_MARKDOWN = newMd;
          BRANCH.hasStagedEdit = !BRANCH.pureStaged;
          if (typeof setViewButtonsEnabled === 'function') setViewButtonsEnabled();
          toast("Staged");
          if (window.__tpStagedRefresh) window.__tpStagedRefresh();
        } else {
          toastError("Stage failed: " + ((data && data.error) || "unknown") + " \u2014 your edits are kept");
        }
      } catch (e) {
        toastError("Stage failed: " + e.message + " \u2014 your edits are kept");
      } finally {
        saving = false;
        if (bbtn) bbtn.textContent = "Save";
        updateSaveState();
        updateDirtyIndicator();
      }
      return;
    }

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
        await dropStagedProposal(); // committed buffer supersedes any staged proposal
        toast("Saved — commit " + (data.commitId ? String(data.commitId).slice(0, 8) : "ok"));
      } else if (data.conflict) {
        // Branch moved underneath us — never overwrite blindly (#49).
        showConflict();
      } else if (data.queued) {
        RAW_MARKDOWN = newMd; // safely persisted to the queue; will retry on sync
        await dropStagedProposal(); // committed buffer supersedes any staged proposal
        if (data.error) toastError("Push failed (" + data.error + ") — queued, will retry on sync");
        else toast(data.message || "Saved locally — will sync");
      } else {
        toastError("Save failed: " + (data.error || "unknown") + " — your edits are kept");
      }
    } catch (e) {
      toastError("Save failed: " + e.message + " — your edits are kept");
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

  // If a whole-file proposal is staged and the editor is still pristine, seed
  // the editor with the proposal so Edit mode becomes "accept & refine". Guarded
  // so it never clobbers the user's own unsaved edits.
  async function maybeSeedProposal() {
    if (isDirty()) return;
    try {
      const r = await fetch('/api/v1/specs/' + CURRENT_FILE_INDEX + '/draft');
      if (!r.ok) return;
      const data = await r.json();
      const content = data && data.draft && data.draft.content;
      if (content && content !== RAW_MARKDOWN && !isDirty() && editor && editor.setMarkdown) {
        editor.setMarkdown(content);
        updateSaveState();
        updateDirtyIndicator();
      }
    } catch {}
  }

  // Reject a staged proposal: clear the server-side draft and drop the overlay.
  async function discardProposal() {
    if (!confirm('Discard the proposed edit for this file? The document returns to its committed version.')) return;
    try { await fetch('/api/v1/specs/' + CURRENT_FILE_INDEX + '/draft', { method: 'DELETE' }); } catch {}
    if (typeof clearDiffOverlay === 'function') clearDiffOverlay();
    const b = el('discardProposalBtn'); if (b) b.style.display = 'none';
    // If we're in edit mode the editor still holds the seeded proposal — reset it
    // to the committed baseline so "returns to its committed version" is true.
    if (editMode && editor && editor.setMarkdown) {
      editor.setMarkdown(RAW_MARKDOWN);
      updateSaveState();
      updateDirtyIndicator();
    }
  }

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
    discardProposal,
    // Original (last-loaded) markdown — the baseline a save diffs against.
    getOriginal: comparisonOriginal,
    // For the write path (#48): current editor buffer (or the original if the
    // editor was never opened).
    getMarkdown: () => (editor ? editor.getMarkdown() : RAW_MARKDOWN),
    getEditor: () => editor,
    // True while the spec editor is open — drives the edit lock heartbeat.
    isEditing: () => editMode,
    // Open the Find & Replace panel (manual equivalent of edit_spec's find kind).
    search: () => { if (ensureEditor() && editor) { if (editor.toggleSearch) editor.toggleSearch(); else if (editor.openSearch) editor.openSearch(); } },
    // Switch the spec reading view (item 3). Applies locally at once + records it
    // server-side so the agent's set_view and the manual toggle share one state.
    setView: (v) => {
      // The reading-view buttons work in View mode. If clicked while editing,
      // leave the editor first (keeping edits) so the view actually swaps in and
      // Proposed/Diff can show the uncommitted buffer.
      if (editMode) exitEdit(true, v);
      else if (typeof applyView === "function") applyView(v);
      fetch("/api/v1/commands/view", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ view: v }) }).catch(() => {});
    },
  };
})();
</script>
<script>
const SPEC_PATH = ${jsonForScript(specPath)};
const PR_ID = ${jsonForScript(prId)};
const CURRENT_FILE_INDEX = ${jsonForScript(currentFileIndex)};
const SOURCE_MAP = ${jsonForScript(sourceMap)};
const TOC_DATA = ${jsonForScript(toc)};
const THREADS_DATA = ${jsonForScript(allThreads.map(t => ({
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
// Branch Personal-Comments mode replaces the PR "+" affordance with the read-only
// review margin's hover/add-dot; keep the block list + source-map alignment either way.
const PC_MODE = !!window.__PC;
document.querySelectorAll(commentableSelector).forEach((el, i) => {
  if (el.closest('.commentable') || el.closest('.ro-commentable')) return;
  const blockIdx = commentableEls.length;
  el.style.position = 'relative';
  el.dataset.blockIdx = blockIdx;
  commentableEls.push(el);
  if (PC_MODE) el.classList.add('ro-commentable');
  // Branch/file-editor mode (window.__BRANCH set) is annotations-only — no PR
  // comment affordance. A real PR page keeps the "+" button even when personal
  // annotations are also available, toggled via the Comments/Annotations switch.
  if (PC_MODE && window.__BRANCH) return;
  el.classList.add('commentable');
  const btn = document.createElement('button');
  btn.className = 'comment-btn';
  btn.textContent = '+';
  btn.setAttribute('aria-label', 'Add comment');
  btn.title = 'Add comment';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const mapping = SOURCE_MAP[blockIdx];
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

// ---- Branch Personal Comments margin (task 2) ---------------------------------
// A faithful port of the read-only review margin (buildReadonlySpecPage): the right
// pane hosts floating cards anchored beside their block; the pane tracks #mainContent
// scroll. Reuses commentableEls (index-aligned to SOURCE_MAP) as the anchor blocks.
if (PC_MODE && window.__PC) (function () {
  var RO_SOURCE_MAP = SOURCE_MAP || [];
  var RO_REPO = window.__PC.repo || '';
  var RO_BRANCH = window.__PC.branch || '';
  var RO_PATH = window.__PC.path || '';
  var RO_USER = window.__PC.user || 'You';
  var RO_PERSONAL_COMMENTS = window.__PC.comments || [];
  var RO_PC_DATASEQ = Number(window.__PC.dataSeq) || 0;
  var marginEl = document.getElementById('sidebarRight');
  var bodyEl = document.getElementById('pcMarginBody');
  var docEl = document.getElementById('spec-content');
  var scrollEl = document.getElementById('mainContent');
  var layoutEl = document.getElementById('layout');
  if (!marginEl || !bodyEl || !docEl || !scrollEl) return;
  var blocks = commentableEls;
  var cards = [];
  function editing() { return !!(scrollEl && scrollEl.classList.contains('editing')); }
  function marginCollapsed() { return !!(layoutEl && layoutEl.classList.contains('br-collapsed')); }
  function revealMargin() { if (layoutEl) layoutEl.classList.remove('br-collapsed'); }
  function blockForLine(line) {
    var bestKey = null, bestDist = Infinity;
    for (var k = 0; k < RO_SOURCE_MAP.length; k++) {
      var sm = RO_SOURCE_MAP[k];
      if (!sm) continue;
      if (line >= sm.startLine && line <= sm.endLine) return blocks[k] || null;
      var dist = line < sm.startLine ? sm.startLine - line : line - sm.endLine;
      if (dist < bestDist) { bestDist = dist; bestKey = k; }
    }
    return bestKey != null ? (blocks[bestKey] || null) : null;
  }
  function cardLine(card) {
    var value = editing() ? card.getAttribute('data-edit-line') : card.getAttribute('data-line');
    if (value == null && editing()) value = card.getAttribute('data-line');
    var line = parseInt(value, 10);
    return Number.isFinite(line) ? line : null;
  }
  function editorTopForLine(line, bodyTop) {
    var ed = window.tippani && window.tippani.getEditor && window.tippani.getEditor();
    var view = ed && ed.view;
    if (!view || !Number.isFinite(line)) return null;
    try {
      var n = Math.max(1, Math.min(line, view.state.doc.lines));
      var pos = view.state.doc.line(n).from;
      return view.contentDOM.getBoundingClientRect().top + view.lineBlockAt(pos).top - bodyTop;
    } catch (e) { return null; }
  }
  // Viewport-relative layout: position each card beside its anchor block's current
  // on-screen position; stack downward to avoid overlap. Recomputed on scroll so the
  // cards track their blocks as #mainContent scrolls (overflow:hidden clips off-screen).
  function layout() {
    var bt = bodyEl.getBoundingClientRect().top;
    var items = cards.filter(function (c) { return !c.hidden; }).map(function (card) {
      var line = cardLine(card);
      var b = !editing() && line != null ? blockForLine(line) : null;
      var editorY = editing() ? editorTopForLine(line, bt) : null;
      var y = editorY != null ? editorY : b ? (b.getBoundingClientRect().top - bt) : 8;
      var hline = card.querySelector('.rh-hline'); if (hline) hline.textContent = line != null ? ':' + line : '';
      return { card: card, y: y };
    });
    items.sort(function (a, b) { return a.y - b.y; });
    var cursor = -1e9;
    items.forEach(function (it) {
      var top = Math.max(it.y, cursor);
      it.card.style.top = top + 'px';
      cursor = top + it.card.offsetHeight + 8;
    });
  }
  var _raf = 0;
  function relayout() { if (_raf) return; _raf = requestAnimationFrame(function () { _raf = 0; layout(); }); }
  function clearFocus() {
    cards.forEach(function (c) { c.classList.remove('rh-focused', 'rh-expanded'); });
    docEl.querySelectorAll('.section-focused').forEach(function (e) { e.classList.remove('section-focused'); });
  }
  function focus(card, scrollTo) {
    clearFocus();
    card.classList.add('rh-focused', 'rh-expanded');
    var line = cardLine(card);
    var b = !editing() && line != null ? blockForLine(line) : null;
    if (b) b.classList.add('section-focused');
    layout();
    if (editing() && line != null) { scrollEditorToLine(line); return; }
    var dest = b || card;
    if (dest && dest.scrollIntoView) dest.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function makeMarkers() {
    if (editing()) return;
    cards.forEach(function (card) {
      var line = parseInt(card.getAttribute('data-line'), 10);
      if (!Number.isFinite(line)) return;
      var b = blockForLine(line);
      if (!b) return;
      b.style.position = 'relative';
      var n = b.__mk || 0; b.__mk = n + 1;
      var mk = document.createElement('button');
      mk.type = 'button';
      mk.className = 'rh-marker ' + (card.querySelector('.rh-res') ? 'rh-marker-resolved' : 'rh-marker-active');
      var cnt = card.querySelector('.rh-count');
      mk.textContent = cnt ? cnt.textContent : '';
      mk.title = 'Annotation \u2014 jump to note';
      mk.style.right = (-10 - n * 22) + 'px';
      mk.addEventListener('click', function (e) { e.stopPropagation(); focus(card, 'card'); });
      b.appendChild(mk);
    });
  }
  var pcBody = function () { return document.getElementById('pcMarginBody'); };
  var pcDraft = null;
  var pcShowResolvedState = true;
  var pcLastDataSeq = RO_PC_DATASEQ;
  var pcLastCmdSeq = 0;
  var pcPollInit = false;
  function pcEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pcWhen(iso) { try { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function pcSnippet(t) {
    var s = String(t || ''), out = '', prevWs = false;
    var TAB = String.fromCharCode(9), LF = String.fromCharCode(10), CR = String.fromCharCode(13), FF = String.fromCharCode(12), VT = String.fromCharCode(11);
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === ' ' || ch === TAB || ch === LF || ch === CR || ch === FF || ch === VT) { if (!prevWs && out) out += ' '; prevWs = true; }
      else { out += ch; prevWs = false; }
    }
    return pcEsc(out.replace(/^ +| +$/g, '').slice(0, 90));
  }
  function pcLineForBlock(b) { var i = blocks.indexOf(b); var sm = RO_SOURCE_MAP[i]; return sm ? sm.startLine : null; }
  function clearMarkers() { docEl.querySelectorAll('.rh-marker').forEach(function (m) { m.remove(); }); blocks.forEach(function (b) { b.__mk = 0; }); }
  function pcRefresh() {
    cards = [].slice.call(marginEl.querySelectorAll('.pc-card'));
    if (!cards.length) { var b = pcBody(); if (b && !b.querySelector('.ro-empty')) b.innerHTML = '<div class="ro-empty">No annotations yet.</div>'; }
    clearMarkers();
    makeMarkers();
    cards.forEach(function (card) { if (card.classList.contains('pc-resolved')) card.hidden = !pcShowResolvedState; });
    if (!pcShowResolvedState) docEl.querySelectorAll('.rh-marker-resolved').forEach(function (m) { m.style.display = 'none'; });
    document.body.classList.toggle('show-markers', !marginCollapsed() && cards.length > 0);
    layout(); setTimeout(layout, 60);
  }
  function pcApplyShowResolved(show) { pcShowResolvedState = (show !== false); pcRefresh(); }
  function pcReportSelected(id) { pcApi('POST', '/api/v1/personal-comments/select', { id: id || '' }); }
  function pcFocusById(id) {
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].getAttribute('data-id') === id) {
        revealMargin();
        if (cards[i].hidden) { pcShowResolvedState = true; cards[i].hidden = false; }
        focus(cards[i], 'card');
        return true;
      }
    }
    return false;
  }
  function pcReloadComments() {
    var q = '?repo=' + encodeURIComponent(RO_REPO) + '&branch=' + encodeURIComponent(RO_BRANCH) + '&path=' + encodeURIComponent(RO_PATH);
    return fetch('/api/v1/personal-comments' + q).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.ok) return;
      if (pcDraft || marginEl.querySelector('.pc-editing, .pc-replying')) return;
      var body = pcBody(); if (body) body.innerHTML = '';
      (d.comments || []).forEach(function (c) { pcBody().appendChild(pcBuildCard(c, false)); });
      if (!(d.comments || []).length && body) body.innerHTML = '<div class="ro-empty">No annotations yet.</div>';
      pcRefresh();
    }).catch(function () {});
  }
  function pcPoll() {
    fetch('/api/v1/state').then(function (r) { return r.ok ? r.json() : null; }).then(function (s) {
      if (!s) return;
      if (!pcPollInit) { pcPollInit = true; if (typeof s.pcCommandSeq === 'number') pcLastCmdSeq = s.pcCommandSeq; if (typeof s.pcDataSeq === 'number') pcLastDataSeq = Math.max(pcLastDataSeq, s.pcDataSeq); return; }
      if (typeof s.pcDataSeq === 'number' && s.pcDataSeq > pcLastDataSeq) { pcLastDataSeq = s.pcDataSeq; pcReloadComments(); }
      if (typeof s.pcCommandSeq === 'number' && s.pcCommandSeq > pcLastCmdSeq) {
        pcLastCmdSeq = s.pcCommandSeq;
        var cmd = s.pcCommand;
        if (cmd && cmd.type === 'focus' && cmd.id) { if (!pcFocusById(cmd.id)) { pcReloadComments().then(function () { pcFocusById(cmd.id); }); } }
        else if (cmd && cmd.type === 'showResolved') pcApplyShowResolved(cmd.show !== false);
        else if (cmd && cmd.type === 'reload') location.reload();
      }
    }).catch(function () {});
  }
  function pcRepliesHtml(c) {
    var reps = (c && c.replies) || [];
    if (!reps.length) return '';
    var items = reps.map(function (r) {
      return '<div class="pc-reply"><div class="pc-reply-meta">' + pcEsc(r.author || '') + ' \u00b7 ' + pcWhen(r.createdAt || new Date().toISOString()) + '</div>'
        + '<div class="rh-body">' + (r.html || pcEsc(r.content || '')) + '</div></div>';
    }).join('');
    return '<div class="pc-replies">' + items + '</div>';
  }
  function pcBuildCard(c, isDraft) {
    var card = document.createElement('div');
    card.className = 'rh-thread pc-card' + (isDraft ? ' pc-draft' : '') + (c.resolved ? ' pc-resolved' : '') + (c.anchorState === 'stale' ? ' pc-stale' : c.anchorState === 'moved' ? ' pc-moved' : '');
    if (c.line != null) card.setAttribute('data-line', c.line);
    if (c.editLine != null) card.setAttribute('data-edit-line', c.editLine);
    if (c.id) card.setAttribute('data-id', c.id);
    card.__data = c;
    var resolveIco = isDraft ? '' : '<button type="button" class="pc-ico pc-resolve" title="' + (c.resolved ? 'Reopen' : 'Resolve') + '">' + (c.resolved ? '\u21ba' : '\u2713') + '</button>';
    var replyIco = isDraft ? '' : '<button type="button" class="pc-ico pc-reply-btn" title="Reply">\u21a9</button>';
    var resTag = c.resolved ? '<span class="rh-res" title="Resolved">\u2713</span>' : '';
    var driftTag = c.anchorState === 'stale'
      ? '<span class="pc-drift pc-drift-stale" title="The block this note anchored to was edited away or removed \u2014 the position is approximate.">moved?</span>'
      : c.anchorState === 'moved'
      ? '<span class="pc-drift pc-drift-moved" title="The block text changed; tracked to its heading section.">tracked</span>'
      : '';
    card.innerHTML =
      '<div class="rh-head"><span class="rh-badge">' + pcEsc(c.author || RO_USER) + ' \u00b7 ' + pcWhen(c.updatedAt || c.createdAt || new Date().toISOString()) + '</span>'
      + '<span class="rh-hline">' + (c.line != null ? ':' + c.line : '') + '</span>' + driftTag + resTag + '<span class="rh-count">1</span>'
      + '<button type="button" class="pc-ico pc-save" title="Save">\ue74e</button>'
      + replyIco
      + resolveIco
      + '<button type="button" class="pc-ico pc-edit" title="Edit">\u270e</button>'
      + '<button type="button" class="pc-ico pc-del" title="Delete">\u{1f5d1}</button></div>'
      + '<div class="rh-summary"><span class="rh-who"></span> ' + pcSnippet(c.content) + '</div>'
      + '<div class="rh-full">'
      + '<div class="pc-view"><div class="rh-body">' + (c.html || pcEsc(c.content)) + '</div>' + pcRepliesHtml(c) + '</div>'
      + '<div class="pc-editbox" hidden><textarea class="pc-text" placeholder="Add a comment\u2026 (saves when you click away)"></textarea></div>'
      + '<div class="pc-replybox" hidden><textarea class="pc-text pc-reply-text" placeholder="Write a reply\u2026"></textarea><div class="pc-reply-actions"><button type="button" class="pc-reply-cancel">Cancel</button><button type="button" class="pc-reply-submit">Reply</button></div></div>'
      + '</div>';
    pcWireCard(card);
    return card;
  }
  function pcShowEdit(card, open) {
    card.querySelector('.pc-view').hidden = open;
    card.querySelector('.pc-editbox').hidden = !open;
    card.querySelector('.pc-replybox').hidden = true;
    card.classList.toggle('pc-editing', open);
    card.classList.remove('pc-replying');
    card.classList.toggle('rh-expanded', true);
  }
  function pcShowReply(card, open) {
    card.querySelector('.pc-view').hidden = false;
    card.querySelector('.pc-editbox').hidden = true;
    card.querySelector('.pc-replybox').hidden = !open;
    card.classList.remove('pc-editing');
    card.classList.toggle('pc-replying', open);
    card.classList.toggle('rh-expanded', true);
  }
  function pcApi(method, url, body) {
    return fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json().catch(function () { return {}; }); });
  }
  function pcCoords() { return { repo: RO_REPO, branch: RO_BRANCH, path: RO_PATH }; }
  function pcRemoveDraft() {
    if (!pcDraft) return;
    var b = pcDraft.__block; if (b) b.classList.remove('pc-active');
    pcDraft.remove(); pcDraft = null; pcRefresh();
  }
  function pcCommit(card) {
    if (card.__saving || !card.isConnected) return;
    var ta = card.querySelector('.pc-text'); if (!ta) return;
    var text = ta.value.trim();
    var isDraft = card.classList.contains('pc-draft');
    var orig = (card.__data && card.__data.content) || '';
    if (isDraft) {
      if (!text) { pcRemoveDraft(); return; }
      card.__saving = true;
      var payload = Object.assign({}, pcCoords(), { line: card.__data.line, editLine: card.__data.editLine, content: text });
      pcApi('POST', '/api/v1/personal-comments', payload).then(function (d) {
        card.__saving = false;
        if (!d || !d.ok || !d.comment) { return; }
        if (typeof d.dataSeq === 'number') pcLastDataSeq = d.dataSeq;
        card.classList.remove('pc-draft');
        var b = card.__block; if (b) b.classList.remove('pc-active');
        var nb = card.__block; card = pcReplace(card, d.comment); if (nb) card.__block = nb;
        pcDraft = null; pcRefresh();
      });
    } else {
      if (text === orig) { pcShowEdit(card, false); return; }
      card.__saving = true;
      var pl = Object.assign({}, pcCoords(), { content: text });
      pcApi('PUT', '/api/v1/personal-comments/' + encodeURIComponent(card.getAttribute('data-id')), pl).then(function (d) {
        card.__saving = false;
        if (!d || !d.ok) return;
        if (typeof d.dataSeq === 'number') pcLastDataSeq = d.dataSeq;
        if (d.deleted) { pcRemoveCardDom(card); return; }
        pcReplace(card, d.comment); pcRefresh();
      });
    }
  }
  function pcReplace(card, c) { var fresh = pcBuildCard(c, false); card.replaceWith(fresh); return fresh; }
  function pcCommitReply(card) {
    if (card.__replying || !card.isConnected) return;
    var ta = card.querySelector('.pc-reply-text');
    var text = ta ? ta.value.trim() : '';
    if (!text) return;
    card.__replying = true;
    var payload = Object.assign({}, pcCoords(), { content: text });
    pcApi('POST', '/api/v1/personal-comments/' + encodeURIComponent(card.getAttribute('data-id')) + '/reply', payload).then(function (d) {
      card.__replying = false;
      if (!d || !d.ok || !d.comment) return;
      if (typeof d.dataSeq === 'number') pcLastDataSeq = d.dataSeq;
      var block = card.__block;
      card = pcReplace(card, d.comment);
      if (block) card.__block = block;
      pcRefresh();
    });
  }
  function pcRemoveCardDom(card) { card.remove(); pcRefresh(); }
  function pcDelete(card) {
    if (card.classList.contains('pc-draft')) { pcRemoveDraft(); return; }
    var id = card.getAttribute('data-id');
    pcApi('DELETE', '/api/v1/personal-comments/' + encodeURIComponent(id), pcCoords()).then(function (d) { if (d && typeof d.dataSeq === 'number') pcLastDataSeq = d.dataSeq; pcRemoveCardDom(card); });
  }
  function pcToggleResolved(card) {
    if (card.classList.contains('pc-draft') || card.__resolving) return;
    var id = card.getAttribute('data-id'); if (!id) return;
    var next = !(card.__data && card.__data.resolved);
    card.__resolving = true;
    pcApi('POST', '/api/v1/personal-comments/' + encodeURIComponent(id) + '/resolve', Object.assign({}, pcCoords(), { resolved: next })).then(function (d) {
      card.__resolving = false;
      if (!d || !d.ok || !d.comment) return;
      if (typeof d.dataSeq === 'number') pcLastDataSeq = d.dataSeq;
      card.__data = d.comment;
      card.classList.toggle('pc-resolved', !!d.comment.resolved);
      var resBtn = card.querySelector('.pc-resolve');
      if (resBtn) { resBtn.textContent = d.comment.resolved ? '\u21ba' : '\u2713'; resBtn.title = d.comment.resolved ? 'Reopen' : 'Resolve'; }
      var head = card.querySelector('.rh-head');
      var res = head.querySelector('.rh-res');
      if (d.comment.resolved && !res) { var span = document.createElement('span'); span.className = 'rh-res'; span.title = 'Resolved'; span.textContent = '\u2713'; head.insertBefore(span, head.querySelector('.rh-count')); }
      else if (!d.comment.resolved && res) { res.remove(); }
      pcRefresh();
    });
  }
  function pcWireCard(card) {
    card.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('button, textarea, a')) return;
      if (card.classList.contains('rh-expanded')) { clearFocus(); layout(); pcReportSelected(null); return; }
      focus(card, 'block'); pcReportSelected(card.getAttribute('data-id'));
    });
    var editBtn = card.querySelector('.pc-edit'); if (editBtn) editBtn.addEventListener('click', function (e) { e.stopPropagation(); var ta = card.querySelector('.pc-text'); ta.value = (card.__data && card.__data.content) || ''; pcShowEdit(card, true); ta.focus(); });
    var replyBtn = card.querySelector('.pc-reply-btn'); if (replyBtn) replyBtn.addEventListener('click', function (e) { e.stopPropagation(); pcShowReply(card, true); var replyTa = card.querySelector('.pc-reply-text'); if (replyTa) replyTa.focus(); });
    var replySubmit = card.querySelector('.pc-reply-submit'); if (replySubmit) replySubmit.addEventListener('click', function (e) { e.stopPropagation(); pcCommitReply(card); });
    var replyCancel = card.querySelector('.pc-reply-cancel'); if (replyCancel) replyCancel.addEventListener('click', function (e) { e.stopPropagation(); var replyTa = card.querySelector('.pc-reply-text'); if (replyTa) replyTa.value = ''; pcShowReply(card, false); });
    var delBtn = card.querySelector('.pc-del'); if (delBtn) delBtn.addEventListener('click', function (e) { e.stopPropagation(); pcDelete(card); });
    var resBtn = card.querySelector('.pc-resolve'); if (resBtn) resBtn.addEventListener('click', function (e) { e.stopPropagation(); pcToggleResolved(card); });
    var saveBtn = card.querySelector('.pc-save'); if (saveBtn) saveBtn.addEventListener('click', function (e) { e.stopPropagation(); pcCommit(card); });
    var ta = card.querySelector('.pc-text');
    if (ta) {
      ta.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); ta.blur(); } });
      ta.addEventListener('blur', function () { setTimeout(function () { var ae = document.activeElement; if (ae && card.contains(ae)) return; pcCommit(card); }, 150); });
    }
    var replyTa = card.querySelector('.pc-reply-text');
    if (replyTa) replyTa.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); pcCommitReply(card); } });
  }
  function pcCreateDraft(block, line, editLine) {
    if (pcDraft) { var ta0 = pcDraft.querySelector('.pc-text'); if (ta0 && ta0.value.trim()) { pcCommit(pcDraft); } else { pcRemoveDraft(); } }
    revealMargin();
    var empty = pcBody().querySelector('.ro-empty'); if (empty) empty.remove();
    var c = { id: '', line: line, editLine: editLine, author: RO_USER, content: '', createdAt: new Date().toISOString() };
    var card = pcBuildCard(c, true);
    card.__block = block;
    pcBody().appendChild(card);
    pcDraft = card;
    if (block) block.classList.add('pc-active');
    pcShowEdit(card, true);
    pcRefresh();
    var ta = card.querySelector('.pc-text'); if (ta) ta.focus();
    focus(card, 'card');
  }
  function pcAddDot(block) {
    if (block.querySelector('.pc-add')) return;
    block.style.position = 'relative';
    var dot = document.createElement('button');
    dot.type = 'button'; dot.className = 'pc-add'; dot.textContent = '\uff0b';
    dot.title = 'Add annotation';
    dot.addEventListener('click', function (e) { e.stopPropagation(); pcCreateDraft(block, pcLineForBlock(block)); });
    block.appendChild(dot);
  }
  function pcWireHover() {
    blocks.forEach(function (b) {
      b.addEventListener('mouseenter', function () { b.classList.add('pc-hover'); pcAddDot(b); });
      b.addEventListener('mouseleave', function () {
        b.classList.remove('pc-hover');
        var dot = b.querySelector('.pc-add'); if (dot) dot.remove();
        if (pcDraft && pcDraft.__block === b) {
          var ta = pcDraft.querySelector('.pc-text');
          if (ta && !ta.value.trim() && document.activeElement !== ta) pcRemoveDraft();
        }
      });
    });
  }
  function pcCardForBlock(block) {
    var line = pcLineForBlock(block);
    if (line == null) return null;
    for (var i = 0; i < cards.length; i++) { if (parseInt(cards[i].getAttribute('data-line'), 10) === line) return cards[i]; }
    return null;
  }
  function pcWireContentClicks() {
    docEl.addEventListener('click', function (e) {
      if (e.target.closest('.pc-add, .rh-marker, a, button, textarea, input')) return;
      var focusedBlock = docEl.querySelector('.section-focused');
      var block = e.target.closest('.ro-commentable');
      if (block && block === focusedBlock) return;
      var card = block ? pcCardForBlock(block) : null;
      if (card) { focus(card, 'card'); pcReportSelected(card.getAttribute('data-id')); }
      else if (focusedBlock) { clearFocus(); layout(); pcReportSelected(null); }
    });
  }
  window.__tpPcCreateDraft = function (anchor) {
    var editLine = Number(anchor && anchor.editLine);
    var currentLine = anchor && anchor.currentLine != null ? Number(anchor.currentLine) : null;
    var block = Number.isFinite(currentLine) ? blockForLine(currentLine) : null;
    pcCreateDraft(block, Number.isFinite(currentLine) ? currentLine : null, Number.isFinite(editLine) ? editLine : null);
  };
  window.__tpPcRelayout = function () { pcRefresh(); };
  function pcLoad() {
    var body = pcBody();
    if (body) body.innerHTML = '';
    (RO_PERSONAL_COMMENTS || []).forEach(function (c) { pcBody().appendChild(pcBuildCard(c, false)); });
    if (!(RO_PERSONAL_COMMENTS || []).length && body) body.innerHTML = '<div class="ro-empty">No annotations yet.</div>';
    pcWireHover();
    pcWireContentClicks();
    pcRefresh();
    setInterval(pcPoll, 1200); pcPoll();
  }
  // Track #mainContent scroll so cards stay beside their anchor blocks; relayout on
  // resize and whenever the margin is revealed (cards have no height while collapsed).
  scrollEl.addEventListener('scroll', relayout, { passive: true });
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(layout, 150); });
  if (layoutEl) {
    var mo = new MutationObserver(function () {
      var shown = !marginCollapsed();
      document.body.classList.toggle('show-markers', shown && cards.length > 0);
      if (shown) { layout(); setTimeout(layout, 60); }
    });
    mo.observe(layoutEl, { attributes: true, attributeFilter: ['class'] });
  }
  pcLoad();
})();

// Collect the outermost commentable blocks under 'container' in document
// order, skipping a match already covered by an ancestor match (e.g. a 'pre'
// nested inside a 'blockquote') — mirrors the dedup commentableEls applies via
// its '.commentable'/'.ro-commentable' class check, without needing to mark up
// content that isn't the primary #spec-content (e.g. a Proposed-view render).
function collectCommentableBlocks(container) {
  const blocks = [];
  container.querySelectorAll(commentableSelector).forEach((el) => {
    if (blocks.some((b) => b.contains(el))) return;
    blocks.push(el);
  });
  return blocks;
}

// Place inline comment bubbles for every reviewer thread onto 'blocks', using
// 'rangeMap' (a SOURCE_MAP-shaped {blockIdx: {startLine,endLine}}) to find each
// thread's target block. Reusable so the bubbles can be re-placed against the
// Proposed view's own freshly-rendered blocks/ranges (#spec-current), not just
// the initially-rendered #spec-content — otherwise Proposed view shows no
// reviewer-comment anchors at all, since the initial placement's bubbles are
// children of #spec-content, which stays hidden while Proposed is active.
function placeInlineBubbles(blocks, rangeMap) {
  THREADS_DATA.forEach(td => {
    if (!td.line) return;
    const threadEl = document.querySelector('.comment-thread[data-thread-id="' + td.id + '"]');
    const header = threadEl ? (threadEl.querySelector('.comment-anchor') || threadEl) : null;

    // Thread on another file: header navigates to that file (and focuses the thread).
    const sameFile = !td.file || !SPEC_PATH || td.file === SPEC_PATH;
    if (!sameFile) {
      if (header && !header._inlineBubbleWired) {
        header._inlineBubbleWired = true;
        header.style.cursor = 'pointer';
        header.title = 'Open this file and thread';
        header.addEventListener('click', () => { location.href = '/goto/thread/' + td.id; });
      }
      return;
    }

    // Find the commentable block whose source-map range contains this line; if the
    // exact line isn't inside a block (e.g. a heading or blank line), fall back to
    // the nearest block so the thread still scrolls somewhere sensible.
    let targetEl = null, bestKey = null, bestDist = Infinity;
    for (const key of Object.keys(rangeMap)) {
      const sm = rangeMap[key];
      if (td.line >= sm.startLine && td.line <= sm.endLine) { targetEl = blocks[parseInt(key)]; break; }
      const dist = td.line < sm.startLine ? sm.startLine - td.line : td.line - sm.endLine;
      if (dist < bestDist) { bestDist = dist; bestKey = key; }
    }
    if (!targetEl && bestKey != null) targetEl = blocks[parseInt(bestKey)];
    if (!targetEl) return;
    const bubble = document.createElement('button');
    bubble.className = 'inline-bubble ' + (td.resolved ? 'inline-bubble-resolved' : 'inline-bubble-active');
    bubble.setAttribute('data-thread-id', td.id);
    bubble.textContent = td.count;
    bubble.title = (td.resolved ? 'Resolved' : 'Active') + ' — ' + td.count + ' comment' + (td.count > 1 ? 's' : '');
    bubble.setAttribute('aria-label', (td.resolved ? 'Resolved' : 'Active') + ' thread, ' + td.count + ' comment' + (td.count > 1 ? 's' : ''));
    bubble.addEventListener('click', (e) => {
      e.stopPropagation();
      if (threadEl) {
        threadEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        threadEl.style.boxShadow = '0 0 0 2px ' + (td.resolved ? 'var(--cp-success)' : 'var(--cp-accent)');
        setTimeout(() => threadEl.style.boxShadow = '', 2000);
      }
    });
    targetEl.appendChild(bubble);

    // Reverse direction: clicking the thread header scrolls the document to the
    // corresponding content block and flashes it. Wired once — the header lives
    // in the persistent sidebar, not the swapped view content, so a later
    // re-placement (e.g. entering Proposed view) must not double-wire it.
    if (header && !header._inlineBubbleWired) {
      header._inlineBubbleWired = true;
      header.style.cursor = 'pointer';
      header.title = 'Jump to this location in the document';
      header.addEventListener('click', () => { scrollDocToThread(td.id); });
    }
  });
}
placeInlineBubbles(commentableEls, SOURCE_MAP);

// GitHub-style diff overlay for a staged spec edit: for each change hunk, hide
// the affected rendered block and show a red "Current" box + green "Proposed"
// box in its place, with a change marker in the right gutter. Server renders
// the HTML; we only place it against the source-mapped block.
function clearDiffOverlay() {
  document.querySelectorAll('.docdiff-widget').forEach((e) => e.remove());
  document.querySelectorAll('.docdiff-hidden').forEach((e) => { e._diffDest = null; e.classList.remove('docdiff-hidden'); });
}
async function applyDiffOverlay(opts) {
  opts = opts || {};
  const personal = !!opts.personal;
  try {
    let data;
    if (personal) {
      const previewUrl = window.__BRANCH ? '/api/v1/spec-preview' : '/api/v1/specs/' + CURRENT_FILE_INDEX + '/preview';
      const r = await fetch(previewUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ original: window.tippani.getOriginal(), proposed: window.tippani.getMarkdown() }) });
      if (!r.ok) return;
      data = await r.json();
    } else {
      const r = await fetch('/api/v1/specs/' + CURRENT_FILE_INDEX + '/diff');
      if (!r.ok) return;
      data = await r.json();
    }
    clearDiffOverlay();
    const hunks = (data && data.hunks) || [];
    const db0 = document.getElementById('discardProposalBtn');
    const ps0 = document.getElementById('proposalSource');
    if (!hunks.length) { if (db0) db0.style.display = 'none'; if (ps0) ps0.style.display = 'none'; return; }
    for (const h of hunks) {
      // Find the rendered block overlapping the hunk's original line range;
      // fall back to the nearest block if the exact line isn't in a block.
      let target = null, bestKey = null, bestDist = Infinity;
      for (const key of Object.keys(SOURCE_MAP)) {
        const sm = SOURCE_MAP[key];
        if (h.startLine <= sm.endLine && h.endLine >= sm.startLine) { target = commentableEls[parseInt(key)]; break; }
        const dist = Math.min(Math.abs(sm.startLine - h.endLine), Math.abs(h.startLine - sm.endLine));
        if (dist < bestDist) { bestDist = dist; bestKey = key; }
      }
      if (!target && bestKey != null) target = commentableEls[parseInt(bestKey)];

      const wrap = document.createElement('div');
      wrap.className = 'docdiff-widget' + (personal ? ' docdiff-personal' : '');
      wrap.dataset.start = h.startLine;
      wrap.dataset.end = h.endLine;
      if (h.mergedHtml) {
        const box = document.createElement('div');
        box.className = 'docdiff-box docdiff-merged';
        box.innerHTML = h.mergedHtml;
        wrap.appendChild(box);
      } else {
        if (h.oldHtml) {
          const oldBox = document.createElement('div');
          oldBox.className = 'docdiff-box docdiff-old';
          oldBox.innerHTML = h.oldHtml;
          wrap.appendChild(oldBox);
        }
        if (h.newHtml) {
          const newBox = document.createElement('div');
          newBox.className = 'docdiff-box docdiff-new';
          newBox.innerHTML = h.newHtml;
          wrap.appendChild(newBox);
        }
      }
      if (target && target.parentNode) {
        target.classList.add('docdiff-hidden');
        target.parentNode.insertBefore(wrap, target.nextSibling);
        target._diffDest = wrap;
      } else {
        const spec = document.getElementById('spec-content');
        if (spec) spec.appendChild(wrap);
      }
    }
    updateDiffMarkers();
    const db = document.getElementById('discardProposalBtn');
    if (db) db.style.display = hunks.length ? '' : 'none';
    const ps = document.getElementById('proposalSource');
    if (ps) {
      const who = /user/i.test(data.source || '') ? 'you' : 'the agent';
      ps.textContent = 'Proposed by ' + who;
      ps.title = data.updatedAt ? ('Last updated ' + new Date(data.updatedAt).toLocaleString()) : '';
      ps.style.display = '';
    }
  } catch {}
}
// Color each diff widget's right-gutter marker: pink for the change tied to the
// active (focused) thread, gray for the rest. A thread is tied to a hunk when
// its line falls within the hunk's line range.
function updateDiffMarkers() {
  let line = null;
  const act = THREADS_DATA.find((t) => Number(t.id) === Number(_focusedThreadId));
  if (act) line = act.line;
  document.querySelectorAll('.docdiff-widget').forEach((w) => {
    const s = Number(w.dataset.start), e = Number(w.dataset.end);
    const on = line != null && line >= s && line <= e;
    w.classList.toggle('docdiff-active', on);
  });
}
// Scroll the document content to a source line (respecting the diff overlay's
// replacement widget). In edit mode, scroll the CodeMirror editor to that line.
function scrollToLine(line) {
  if (!Number.isFinite(line)) return;
  const main = document.getElementById('mainContent');
  if (main && main.classList.contains('editing')) { scrollEditorToLine(line); return; }
  let target = null, bestKey = null, bestDist = Infinity;
  for (const key of Object.keys(SOURCE_MAP)) {
    const sm = SOURCE_MAP[key];
    if (line >= sm.startLine && line <= sm.endLine) { target = commentableEls[parseInt(key)]; break; }
    const dist = line < sm.startLine ? sm.startLine - line : line - sm.endLine;
    if (dist < bestDist) { bestDist = dist; bestKey = key; }
  }
  if (!target && bestKey != null) target = commentableEls[parseInt(bestKey)];
  if (!target) return;
  const dest = target._diffDest || target;
  dest.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
// Scroll the document to a thread's location so opening/focusing a thread syncs the doc.
function scrollDocToThread(threadId) {
  const td = THREADS_DATA.find((t) => Number(t.id) === Number(threadId));
  if (!td || !td.line) return;
  if (td.file && SPEC_PATH && td.file !== SPEC_PATH) return;
  scrollToLine(td.line);
}
// Edit mode uses a CodeMirror 6 editor showing the markdown source. Its
// .cm-scroller isn't the overflow element (#mainContent is), so scroll
// #mainContent to the target line using the line block's geometry.
function scrollEditorToLine(lineNo) {
  const ed = window.tippani && window.tippani.getEditor && window.tippani.getEditor();
  const view = ed && ed.view;
  const main = document.getElementById('mainContent');
  if (!view || !view.state || !view.contentDOM || !main || !Number.isFinite(lineNo)) return;
  try {
    const n = Math.max(1, Math.min(lineNo, view.state.doc.lines));
    const pos = view.state.doc.line(n).from;
    const block = view.lineBlockAt(pos);
    const lineViewportTop = view.contentDOM.getBoundingClientRect().top + block.top;
    const mainRect = main.getBoundingClientRect();
    const delta = lineViewportTop - mainRect.top - main.clientHeight / 2 + block.height / 2;
    main.scrollBy({ top: delta, behavior: 'smooth' });
  } catch {}
}
// Item 3: Current / Diff / Proposed reading view. Server-pushed (set_view) or
// clicked; it never auto-flips when a draft is staged. 'proposed' renders the
// proposed draft clean into #spec-current; 'diff' overlays; 'current' is the
// committed #spec-content.
let _currentView = 'current';
let _hasAgentDraft = false;
// Exposed so the editor <script> block can read the active reading view when it
// leaves edit mode (the two blocks don't share a lexical scope).
function getSpecView() { return _currentView; }
async function applyView(view) {
  if (!['current','diff','proposed'].includes(view)) return;
  _currentView = view;
  document.querySelectorAll('.view-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  const content = document.getElementById('spec-content');
  const current = document.getElementById('spec-current');
  const editing = !!(document.getElementById('mainContent') && document.getElementById('mainContent').classList.contains('editing'));
  const personal = !!(window.tippani && ((window.tippani.isDirty && window.tippani.isDirty()) || (window.__BRANCH && ((window.__BRANCH.pureStaged && window.tippani.getMarkdown && window.tippani.getMarkdown()) || window.__BRANCH.hasStagedEdit))));
  // Always clear any prior diff overlay first — switching to Proposed/Current
  // must not leave the Diff boxes lingering. The 'diff' branch re-applies it.
  clearDiffOverlay();
  if (view === 'proposed') {
    try {
      let d = null;
      if (personal) {
        const previewUrl = window.__BRANCH ? '/api/v1/spec-preview' : '/api/v1/specs/' + CURRENT_FILE_INDEX + '/preview';
        const r = await fetch(previewUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ original: window.tippani.getOriginal(), proposed: window.tippani.getMarkdown() }) });
        if (r.ok) d = await r.json();
      } else {
        const r = await fetch('/api/v1/specs/' + CURRENT_FILE_INDEX + '/render?draft=1');
        if (r.ok) d = await r.json();
      }
      if (d && current) {
        current.innerHTML = d.html || '';
        if (window.tippaniRenderMermaid) window.tippaniRenderMermaid(current);
        // Re-anchor reviewer comment bubbles onto the Proposed content's own
        // blocks/ranges — the initial placement's bubbles live on #spec-content,
        // which is now hidden, so without this Proposed view shows none at all.
        placeInlineBubbles(collectCommentableBlocks(current), d.ranges || {});
      }
    } catch {}
    if (!editing) { if (content) content.style.display = 'none'; if (current) current.style.display = ''; }
  } else {
    if (current) current.style.display = 'none';
    if (!editing && content) content.style.display = '';
    if (view === 'diff') { try { await applyDiffOverlay({ personal }); } catch {} }
  }
}
// Item 2: persistent dark-red highlight on the source section tied to a thread.
function highlightSectionForThread(threadId) {
  document.querySelectorAll('.spec .section-focused').forEach((e) => e.classList.remove('section-focused'));
  const td = THREADS_DATA.find((t) => Number(t.id) === Number(threadId));
  if (!td || !td.line) return;
  if (td.file && SPEC_PATH && td.file !== SPEC_PATH) return;
  let target = null, bestKey = null, bestDist = Infinity;
  for (const key of Object.keys(SOURCE_MAP)) {
    const sm = SOURCE_MAP[key];
    if (td.line >= sm.startLine && td.line <= sm.endLine) { target = commentableEls[parseInt(key)]; break; }
    const dist = td.line < sm.startLine ? sm.startLine - td.line : td.line - sm.endLine;
    if (dist < bestDist) { bestDist = dist; bestKey = key; }
  }
  if (!target && bestKey != null) target = commentableEls[parseInt(bestKey)];
  const dest = target && (target._diffDest || target);
  if (dest && dest.classList) dest.classList.add('section-focused');
}
// Enable Diff/Proposed when a staged proposal, unsaved edit, or saved new staged
// file provides content to compare. Current is always available.
function setViewButtonsEnabled(hasDraft) {
  if (typeof hasDraft === 'boolean') _hasAgentDraft = hasDraft;
  const branchProposal = !!(window.__BRANCH && (window.__BRANCH.hasStagedEdit || (window.__BRANCH.pureStaged && window.tippani && window.tippani.getMarkdown && window.tippani.getMarkdown())));
  const avail = _hasAgentDraft || branchProposal || !!(window.tippani && window.tippani.isDirty && window.tippani.isDirty());
  document.querySelectorAll('.view-btn').forEach((b) => {
    if (b.dataset.view === 'diff' || b.dataset.view === 'proposed') {
      b.disabled = !avail;
      b.title = avail ? '' : 'No changes to preview yet';
    }
  });
  if (!avail && (_currentView === 'diff' || _currentView === 'proposed')) applyView('current');
}
applyView('current');
(async () => {
  // Branch mode has no PR draft store — skip the probe; dirtiness drives Diff/Proposed.
  if (!window.__BRANCH) {
    try {
      const r = await fetch('/api/v1/specs/' + CURRENT_FILE_INDEX + '/draft');
      if (r.ok) { const d = await r.json(); setViewButtonsEnabled(!!(d && d.draft && d.draft.content)); }
    } catch {}
  }
  setViewButtonsEnabled();
})();

// Shared <<>> collapse for the TOC and comments panes in PR and staged views.
function tpPaneCollapse(side) {
  const layout = document.getElementById('layout');
  if (!layout) return;
  const cls = side === 'left' ? 'bl-collapsed' : 'br-collapsed';
  const on = layout.classList.toggle(cls);
  try { localStorage.setItem('tp-pane-' + side + '-collapsed', on ? '1' : '0'); } catch {}
}

// Comments/Annotations toggle for a real PR page that also has personal
// annotations available (dualMode — see buildSpecPage). Switches which panel
// is visible in the right sidebar and which per-block affordance is active.
function setSidebarMode(mode) {
  const aside = document.getElementById('sidebarRight');
  const commentsPane = document.getElementById('sidebarComments');
  const annotationsPane = document.getElementById('sidebarAnnotations');
  if (!aside || !commentsPane || !annotationsPane) return;
  const toAnnotations = mode === 'annotations';
  aside.classList.toggle('pc-margin', toAnnotations);
  commentsPane.style.display = toAnnotations ? 'none' : '';
  annotationsPane.style.display = toAnnotations ? '' : 'none';
  document.body.classList.toggle('sidebar-mode-annotations', toAnnotations);
  document.body.classList.toggle('sidebar-mode-comments', !toAnnotations);
  const commentsBtn = document.getElementById('sidebarModeComments');
  const annotationsBtn = document.getElementById('sidebarModeAnnotations');
  if (commentsBtn) { commentsBtn.classList.toggle('active', !toAnnotations); commentsBtn.setAttribute('aria-selected', toAnnotations ? 'false' : 'true'); }
  if (annotationsBtn) { annotationsBtn.classList.toggle('active', toAnnotations); annotationsBtn.setAttribute('aria-selected', toAnnotations ? 'true' : 'false'); }
  const rail = document.getElementById('sidebarRailLabel'); if (rail) rail.textContent = toAnnotations ? 'Annotations' : 'Comments';
  try { localStorage.setItem('tp-sidebar-mode', mode); } catch {}
  if (toAnnotations && typeof window.__tpPcRelayout === 'function') window.__tpPcRelayout();
}
(function () {
  if (!document.getElementById('sidebarModeAnnotations')) return; // not dualMode
  try { const saved = localStorage.getItem('tp-sidebar-mode'); if (saved === 'annotations') setSidebarMode('annotations'); } catch {}
})();
(function () {
  const layout = document.getElementById('layout');
  if (!layout) return;
  try {
    const left = localStorage.getItem('tp-pane-left-collapsed') ?? localStorage.getItem('tp-branch-left-collapsed');
    const right = localStorage.getItem('tp-pane-right-collapsed') ?? localStorage.getItem('tp-branch-right-collapsed');
    if (left === '1') layout.classList.add('bl-collapsed');
    if (right === '1') layout.classList.add('br-collapsed');
  } catch {}
})();

// open_file deep-link: /file/<idx>?line=N scrolls to that line once the view settles.
(function () {
  const q = new URLSearchParams(location.search).get('line');
  const n = q ? parseInt(q, 10) : NaN;
  if (Number.isFinite(n)) setTimeout(() => { try { scrollToLine(n); } catch {} }, 400);
})();


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

function showToast(msg, opts) {
  opts = opts || {};
  const t = document.getElementById('toast');
  if (!t) return;
  if (window.__toastTimer) { clearTimeout(window.__toastTimer); window.__toastTimer = null; }
  t.classList.toggle('toast-error', !!opts.error);
  if (opts.persist) {
    // Stays until the user dismisses it with the × (used for push/save failures).
    t.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = msg;
    t.appendChild(span);
    const x = document.createElement('button');
    x.className = 'toast-x';
    x.type = 'button';
    x.setAttribute('aria-label', 'Dismiss');
    x.textContent = '\u00d7';
    x.addEventListener('click', () => t.classList.remove('show'));
    t.appendChild(x);
    t.classList.add('show');
  } else {
    t.textContent = msg;
    t.classList.add('show');
    window.__toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
  }
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
  // Back-compat shim: open the inline reply form instead of prompt().
  openReply(threadId);
}

// --- Phase 0 keyboard nav (#42) ---
// Tracks which active thread is "focused" for J/K/R/S shortcuts.
let _focusedThreadId = null;

function _getActiveThreadIds() {
  return Array.from(document.querySelectorAll('.comment-thread.thread-active'))
    .map(el => Number(el.getAttribute('data-thread-id')))
    .filter(n => Number.isFinite(n));
}

function focusThread(threadId, { scroll = true } = {}) {
  // Look up by element so a RESOLVED thread can be focused/navigated too.
  // _getActiveThreadIds() is J/K-navigation only and must NOT gate focus, or
  // MCP navigation and clicking a resolved comment would silently no-op.
  const el = document.querySelector('.comment-thread[data-thread-id="' + threadId + '"]');
  if (!el) return false;
  document.querySelectorAll('.comment-thread.thread-focused')
    .forEach(e => e.classList.remove('thread-focused'));
  el.classList.add('thread-focused');
  // Reveal a collapsed thread when it's focused so a selected/navigated comment
  // is readable (transient — not persisted, so a reload restores the saved state).
  if (el.classList.contains('thread-collapsed')) {
    el.classList.remove('thread-collapsed');
    const cbtn = el.querySelector('.thread-collapse-btn');
    if (cbtn) cbtn.setAttribute('aria-expanded', 'true');
  }
  if (scroll) scrollSidebarThreadToTop(el);
  if (scroll && typeof scrollDocToThread === 'function') scrollDocToThread(threadId);
  _focusedThreadId = threadId;
  if (typeof updateDiffMarkers === 'function') updateDiffMarkers();
  if (typeof highlightSectionForThread === 'function') highlightSectionForThread(threadId);
  return true;
}

// Scroll the right sidebar so the selected comment sits at the TOP of the pane
// (not centered). getBoundingClientRect delta works regardless of card nesting.
function scrollSidebarThreadToTop(el) {
  const pane = document.getElementById('sidebarRight');
  if (!pane || !el) { if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const delta = el.getBoundingClientRect().top - pane.getBoundingClientRect().top;
  pane.scrollTo({ top: Math.max(0, pane.scrollTop + delta - 12), behavior: 'smooth' });
}

// --- Per-comment expand/collapse, persisted per PR + file ---------------------
// Stored map is { [threadId]: collapsed(bool) } — an explicit user choice that
// overrides the default (resolved threads start collapsed, active expanded).
const THREAD_COLLAPSE_KEY = 'tippani.threadCollapse:' + PR_ID + ':' + (SPEC_PATH || '');
function loadThreadCollapse() {
  try { return JSON.parse(localStorage.getItem(THREAD_COLLAPSE_KEY)) || {}; } catch (e) { return {}; }
}
function saveThreadCollapse(map) {
  try { localStorage.setItem(THREAD_COLLAPSE_KEY, JSON.stringify(map)); } catch (e) {}
}
function threadDefaultCollapsed(id) {
  const td = THREADS_DATA.find((t) => Number(t.id) === Number(id));
  return !!(td && td.resolved);
}
function setThreadCollapsed(el, collapsed) {
  el.classList.toggle('thread-collapsed', collapsed);
  const btn = el.querySelector('.thread-collapse-btn');
  if (btn) btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}
function applyThreadCollapse() {
  const map = loadThreadCollapse();
  document.querySelectorAll('.comment-thread').forEach((el) => {
    const id = Number(el.getAttribute('data-thread-id'));
    const collapsed = Object.prototype.hasOwnProperty.call(map, id) ? !!map[id] : threadDefaultCollapsed(id);
    setThreadCollapsed(el, collapsed);
  });
}
function toggleThreadCollapse(e, id) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  const el = document.querySelector('.comment-thread[data-thread-id="' + id + '"]');
  if (!el) return;
  const collapsed = !el.classList.contains('thread-collapsed');
  setThreadCollapsed(el, collapsed);
  const map = loadThreadCollapse();
  map[id] = collapsed;
  saveThreadCollapse(map);
}
applyThreadCollapse();

// Item 8: click a thread card (but not its buttons/textarea/links) to focus it —
// Bordeaux border on the thread + its source section, and scroll the doc there.
function onThreadClick(e, id) {
  if (e && e.target && e.target.closest('button, textarea, input, a, .reply-form, summary')) return;
  focusThread(id);
}
// Item 9: scroll each thread's comment list to its latest comment on load so the
// most recent reply is visible without scrolling the pane.
(function () {
  const scrollLatest = () => document.querySelectorAll('.thread-comments').forEach((c) => { c.scrollTop = c.scrollHeight; });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scrollLatest);
  else scrollLatest();
})();

function gotoNext() {
  const ids = _getActiveThreadIds();
  if (ids.length === 0) return false;
  const cur = ids.indexOf(_focusedThreadId);
  const next = ids[(cur + 1) % ids.length];
  return focusThread(next);
}

function gotoPrev() {
  const ids = _getActiveThreadIds();
  if (ids.length === 0) return false;
  const cur = ids.indexOf(_focusedThreadId);
  const prev = cur <= 0 ? ids[ids.length - 1] : ids[cur - 1];
  return focusThread(prev);
}

function openReply(threadId) {
  focusThread(threadId);
  const form = document.querySelector('.reply-form[data-thread-id="' + threadId + '"]');
  if (!form) return;
  form.classList.add('open');
  const ta = form.querySelector('.reply-textarea');
  if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; }
}

// Clicking anywhere on a thread makes it the active/focused thread (and repaints
// the diff-gutter markers so only the active thread's edit shows pink).
document.addEventListener('click', (e) => {
  const th = e.target.closest && e.target.closest('.comment-thread');
  if (!th) return;
  const id = Number(th.getAttribute('data-thread-id'));
  if (!Number.isFinite(id)) return;
  document.querySelectorAll('.comment-thread.thread-focused').forEach((el) => el.classList.remove('thread-focused'));
  th.classList.add('thread-focused');
  _focusedThreadId = id;
  if (typeof updateDiffMarkers === 'function') updateDiffMarkers();
});

function closeReply(threadId) {
  const form = document.querySelector('.reply-form[data-thread-id="' + threadId + '"]');
  if (!form) return;
  form.classList.remove('open');
  const ta = form.querySelector('.reply-textarea');
  if (ta) ta.value = '';
}

// Discard an agent-staged reply draft: delete it server-side and clear the form.
async function discardDraft(threadId) {
  try { await fetch('/api/v1/threads/' + threadId + '/draft', { method: 'DELETE' }); } catch (e) {}
  const form = document.querySelector('.reply-form[data-thread-id="' + threadId + '"]');
  if (!form) return;
  const ta = form.querySelector('.reply-textarea');
  if (ta) { ta.value = ''; delete ta.dataset.externalContent; }
  const badge = form.querySelector('.reply-external-badge');
  if (badge) badge.remove();
  const db = form.querySelector('.reply-btn-discard');
  if (db) db.style.display = 'none';
  const cb = form.querySelector('.reply-btn-close');
  if (cb) cb.style.display = '';
}

// Toggle a thread's durable "viewed" marker, then reload to reflect the tag.
async function toggleViewed(threadId, isViewed) {
  try {
    const r = await fetch('/api/v1/threads/' + threadId + '/viewed', { method: isViewed ? 'DELETE' : 'POST' });
    if (r.ok) { location.reload(); }
    else { const e = await r.json().catch(() => ({})); alert('Failed: ' + (e.error || r.status)); }
  } catch (e) { alert('Failed: ' + e); }
}

async function submitReply(threadId) {
  const form = document.querySelector('.reply-form[data-thread-id="' + threadId + '"]');
  if (!form) return;
  const ta = form.querySelector('.reply-textarea');
  const text = (ta?.value || '').trim();
  if (!text) { ta?.focus(); return; }
  const postBtn = form.querySelector('.reply-btn-post');
  if (postBtn) postBtn.disabled = true;
  try {
    const res = await fetch('/api/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, content: text })
    });
    if (!res.ok) throw new Error('Failed');
    const result = await res.json();
    showToast(result.synced ? 'Reply posted — next thread' : 'Reply queued — next thread');
    updateSyncStatus();
    // Advance before reload so the next thread is pre-focused on reload via hash.
    const ids = _getActiveThreadIds();
    const cur = ids.indexOf(threadId);
    const nextId = ids.length > 1 ? ids[(cur + 1) % ids.length] : null;
    if (nextId != null) {
      try { sessionStorage.setItem('tippani.focusThread', String(nextId)); } catch {}
    }
    setTimeout(() => location.reload(), 400);
  } catch (e) {
    showToast('Failed to reply');
    if (postBtn) postBtn.disabled = false;
  }
}

// Restore focused thread across reloads.
(function() {
  try {
    const saved = sessionStorage.getItem('tippani.focusThread');
    if (saved) {
      sessionStorage.removeItem('tippani.focusThread');
      setTimeout(() => focusThread(Number(saved)), 50);
    }
  } catch {}
})();

document.addEventListener('keydown', (e) => {
  // Cmd/Ctrl+Enter inside a reply textarea: post & advance.
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    const ta = e.target.closest && e.target.closest('.reply-textarea');
    if (ta) {
      const form = ta.closest('.reply-form');
      const tid = Number(form?.getAttribute('data-thread-id'));
      if (Number.isFinite(tid)) { e.preventDefault(); submitReply(tid); }
      return;
    }
  }
  // Escape inside a reply textarea: cancel.
  if (e.key === 'Escape') {
    const ta = e.target.closest && e.target.closest('.reply-textarea');
    if (ta) {
      const form = ta.closest('.reply-form');
      const tid = Number(form?.getAttribute('data-thread-id'));
      if (Number.isFinite(tid)) { e.preventDefault(); closeReply(tid); }
      return;
    }
  }
  // Global shortcuts: only when not typing in a text input/textarea/contenteditable.
  const a = document.activeElement;
  const inEditable = a && (
    a.tagName === 'INPUT' ||
    a.tagName === 'TEXTAREA' ||
    a.isContentEditable
  );
  if (inEditable) return;
  // Ignore modifier-laden keys (let other handlers own them).
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'j') { e.preventDefault(); gotoNext(); }
  else if (k === 'k') { e.preventDefault(); gotoPrev(); }
  else if (k === 's') { e.preventDefault(); gotoNext(); }
  else if (k === 'r') {
    e.preventDefault();
    const ids = _getActiveThreadIds();
    if (ids.length === 0) return;
    if (_focusedThreadId == null) focusThread(ids[0]);
    if (_focusedThreadId != null) openReply(_focusedThreadId);
  }
});

// --- Control-API integration (#42 Phase 1) ---
// Poll the server's control-API state every 1.5s. When focus changes from
// an external client (LLM/script), scroll to that thread; when a draft is
// staged externally, populate the textarea and badge it.
(function() {
  let lastVersion = -1;
  let lastViewSeq = -1;
  let lastLineSeq = null;   // baselined on first poll so a stale go_to_line doesn't yank a fresh open
  let lastSpecDraftKey = null;
  const seenDraftKey = (id, d) => id + ':' + (d ? d.updatedAt : '0');
  const lastDraftSeen = new Map();

  // Spec-edit drafts are presentation-only in the file view: the staged
  // proposal drives the diff overlay (applyDiffOverlay) and seeds the editor
  // for accept-&-refine (maybeSeedProposal). It is never auto-committed — the
  // user commits their refinements via Save, and an agent commits explicit
  // content via commit_spec. There is no buffer-to-draft mirror.

  function applyExternalDraft(threadId, draft) {
    const form = document.querySelector('.reply-form[data-thread-id="' + threadId + '"]');
    if (!form) return;
    const ta = form.querySelector('.reply-textarea');
    if (!ta) return;
    // Don't clobber user-typed content: only fill if textarea is empty OR the
    // existing content matches a prior external draft (i.e., user hasn't touched it).
    const priorKey = lastDraftSeen.get(threadId);
    const userTouched = ta.value && (!priorKey || !ta.dataset.externalContent || ta.dataset.externalContent !== ta.value);
    if (userTouched) return;
    form.classList.add('open');
    ta.value = draft.content;
    ta.dataset.externalContent = draft.content;
    let badge = form.querySelector('.reply-external-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'reply-external-badge';
      badge.textContent = '✨ Draft from external client — edit or post';
      form.insertBefore(badge, form.firstChild);
    }
    const discardBtn = form.querySelector('.reply-btn-discard');
    if (discardBtn) discardBtn.style.display = '';
    const closeBtn = form.querySelector('.reply-btn-close');
    if (closeBtn) closeBtn.style.display = 'none';
  }

  function clearExternalBadge(threadId) {
    const form = document.querySelector('.reply-form[data-thread-id="' + threadId + '"]');
    if (!form) return;
    const badge = form.querySelector('.reply-external-badge');
    if (badge) badge.remove();
    const ta = form.querySelector('.reply-textarea');
    if (ta) delete ta.dataset.externalContent;
    const discardBtn = form.querySelector('.reply-btn-discard');
    if (discardBtn) discardBtn.style.display = 'none';
    const closeBtn = form.querySelector('.reply-btn-close');
    if (closeBtn) closeBtn.style.display = '';
  }

  async function poll() {
    try {
      const r = await fetch('/api/v1/state');
      if (!r.ok) return;
      const s = await r.json();
      if (s.version !== lastVersion) {
        lastVersion = s.version;
        // The steady-state poll omits draft bodies; fetch them only now that
        // something changed, so 1.2s polls don't ship every draft every time.
        let full = s;
        if (full.drafts === undefined || full.specDrafts === undefined) {
          try { const rf = await fetch('/api/v1/state?full=1'); if (rf.ok) full = await rf.json(); } catch {}
        }
        // Focus change from external client.
        if (s.focusedThreadId != null && s.focusedThreadId !== _focusedThreadId) {
          focusThread(s.focusedThreadId);
        }
        // Apply / clear drafts.
        const seenThisRound = new Set();
        Object.entries(full.drafts || {}).forEach(([id, d]) => {
          const tid = Number(id);
          seenThisRound.add(tid);
          const k = seenDraftKey(tid, d);
          if (lastDraftSeen.get(tid) !== k) {
            lastDraftSeen.set(tid, k);
            applyExternalDraft(tid, d);
          }
        });
        // Drafts that disappeared server-side.
        for (const tid of Array.from(lastDraftSeen.keys())) {
          if (!seenThisRound.has(tid)) {
            lastDraftSeen.delete(tid);
            clearExternalBadge(tid);
          }
        }
        // View switch pushed by the agent (set_view) — the browser NEVER
        // auto-flips on a stage; it only changes when viewSeq bumps.
        if (typeof s.viewSeq === 'number' && s.viewSeq !== lastViewSeq) {
          lastViewSeq = s.viewSeq;
          if (s.view) { try { applyView(s.view); } catch {} }
        } else {
          // A staged spec edit for THIS file changed: refresh only the CURRENT
          // view (don't switch it) and, if editing, auto-load it into the editor
          // (item 4, last-write-wins).
          const sd = (full.specDrafts || {})[CURRENT_FILE_INDEX];
          const key = sd ? sd.updatedAt : 0;
          if (key !== lastSpecDraftKey) {
            lastSpecDraftKey = key;
            if (typeof setViewButtonsEnabled === 'function') setViewButtonsEnabled(!!sd);
            if (_currentView === 'diff' || _currentView === 'proposed') { try { applyView(_currentView); } catch {} }
            // Belt-and-suspenders for the lock-acquisition lag: the server now
            // 409s an agent edit while the user holds the edit lock, but never
            // swap a DIRTY buffer out from under the user (option (c)).
            if (sd && window.tippani && window.tippani.isEditing && window.tippani.isEditing()
                && !(window.tippani.isDirty && window.tippani.isDirty()) && window.tippani.getEditor) {
              const ed = window.tippani.getEditor(); if (ed && ed.setMarkdown) ed.setMarkdown(sd.content);
            }
          }
        }
      }
      // go_to_line: scroll THIS open file to a source line (same-page, no reopen).
      // Baseline on the first poll so a stale command doesn't scroll on load.
      if (typeof s.lineSeq === 'number') {
        if (lastLineSeq === null) lastLineSeq = s.lineSeq;
        else if (s.lineSeq > lastLineSeq) { lastLineSeq = s.lineSeq; try { scrollToLine(s.line); } catch {} }
      }
    } catch {}
  }
  setInterval(poll, 1500);
  poll();
})();

// User-editing lock heartbeat: while the user types in a reply textarea,
// touch the server-side lock every 3s so external clients get a 409 if they
// try to PUT a draft. Lock TTL on the server is 10s.
(function() {
  let lastTouchTid = null;
  let lastTouchAt = 0;
  document.addEventListener('input', (e) => {
    const ta = e.target.closest && e.target.closest('.reply-textarea');
    if (!ta) return;
    const form = ta.closest('.reply-form');
    const tid = Number(form?.getAttribute('data-thread-id'));
    if (!Number.isFinite(tid)) return;
    const now = Date.now();
    if (tid === lastTouchTid && (now - lastTouchAt) < 3000) return;
    lastTouchTid = tid;
    lastTouchAt = now;
    fetch('/api/v1/threads/' + tid + '/lock', { method: 'POST' }).catch(() => {});
  });
})();

// Spec-edit lock heartbeat: while the user is refining a spec in edit mode,
// touch the server-side file lock every ~3s so a concurrent agent stage_spec_edit
// gets a 409 instead of swapping the proposal under review. The staged draft is
// presentation-only — the user's edits live in the editor and are committed by
// Save, never mirrored back to the draft store.
(function() {
  let lastTouch = 0;
  setInterval(() => {
    const t = window.tippani;
    if (!t || typeof t.isEditing !== 'function' || !t.isEditing()) return;
    const now = Date.now();
    if (now - lastTouch < 3000) return;
    lastTouch = now;
    fetch('/api/v1/specs/' + CURRENT_FILE_INDEX + '/lock', { method: 'POST' }).catch(() => {});
  }, 1500);
})();

async function resolveThread(threadId) {
  const el = document.querySelector('.comment-thread[data-thread-id="' + threadId + '"]');
  const btn = el ? el.querySelector('.btn-thread-resolve') : null;
  const prevLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Resolving\u2026'; }
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
    // In-place: flip status + color only, keep the card expanded and in position
    // so the pane never jumps. No reload (which would collapse + re-lay-out).
    markThreadResolvedInPlace(threadId);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = prevLabel; }
    showToast('Failed to resolve');
  }
}

// Flip a thread to resolved WITHOUT reloading: swap the status class (recolors
// via .thread-resolved CSS), prefix the anchor with a checkmark, and disable the
// Resolve button. Position, expand state, and comment content are untouched.
function markThreadResolvedInPlace(threadId) {
  const el = document.querySelector('.comment-thread[data-thread-id="' + threadId + '"]');
  if (!el) return;
  el.classList.remove('thread-active');
  el.classList.add('thread-resolved');
  const anchor = el.querySelector('.comment-anchor');
  if (anchor && !anchor.querySelector('.resolved-check')) {
    const chk = document.createElement('span');
    chk.className = 'resolved-check';
    chk.textContent = '\u2713 ';
    anchor.insertBefore(chk, anchor.firstChild);
  }
  const btn = el.querySelector('.btn-thread-resolve');
  if (btn) { btn.disabled = true; btn.textContent = '\u2713 Resolved'; }
  const td = THREADS_DATA.find((t) => Number(t.id) === Number(threadId));
  if (td) td.resolved = true;
  // ALL matching bubbles: the initial placement lives in #spec-content and a
  // Proposed-view re-placement in #spec-current — the visible one may be either.
  document.querySelectorAll('.inline-bubble[data-thread-id="' + threadId + '"]').forEach((bubble) => {
    bubble.classList.remove('inline-bubble-active'); bubble.classList.add('inline-bubble-resolved');
  });
}

async function submitReview(type) {
  const btns = document.querySelectorAll('.review-btn');
  btns.forEach(b => b.disabled = true);
  try {
    const res = await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type })
    });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON error body */ }
    // The server is the source of truth for whether the vote landed — never
    // report success just because the request completed.
    if (!res.ok || !data || !data.ok) {
      showToast((data && data.error) || 'Failed to submit review');
      return;
    }
    showToast(data.message || 'Review submitted');
  } catch (e) {
    showToast('Failed to submit review');
  } finally {
    btns.forEach(b => b.disabled = false);
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
${NAV_WATCHER}
</body>
</html>`;
}

// --- Module-level state ---
let _conn, _pr, _prId, _branch, _changedFiles, _otherChangedFiles = [], _cache, _isOffline, _canEdit = false;
// True when this portal was launched in browse mode (no PR on the command line).
// A browse portal is anchored on the Discovery home: opening a PR from the queue
// binds it (setting _prId) but must NOT make the home unreachable, so the home
// routes gate on this flag, not on the absence of _prId. Without it, the first
// /open is a one-way door — the tabbed home can never be returned to.
let _browseMode = false;
let _adoToken = null;

// True when the embedding host injected an ADO token at spawn (--ado-token /
// TIPPANI_ADO_TOKEN). In host-token mode tippani NEVER switches to another
// identity (saved PAT / az CLI / Git Credential Manager) — a provided token that
// later expires must be REFRESHED by the host (POST /api/v1/ado-token), never
// silently swapped for whatever a CLI is signed into. Standalone mode (no host
// token) keeps the tokenless CLI/PAT fallback chain.
let HOST_TOKEN_MODE = false;

// Swap the live ADO bearer token at runtime. The host is the token authority and
// pushes a freshly-minted token here (POST /api/v1/ado-token) before the old one
// expires, so a long-lived portal never makes ADO calls with a stale token.
// Rebuilds the connection so every subsequent ADO call uses the new bearer.
function applyAdoToken(token) {
  if (typeof token !== "string" || !token) return false;
  // Reject a stale bearer instead of binding it and failing later ADO calls.
  // The whole point of the push is "fresh before the old one expires", so an
  // already-expired JWT is exactly the case to turn away (surfaces as 400).
  if (isExpiredJwt(token)) return false;
  _adoToken = token;
  _conn = getAdoConnectionBearer(token);
  return true;
}

// Control API state (#42 Phase 1). All in-memory, ephemeral by design.
const _focus = createFocusStore();
const _drafts = createDraftStore({ onChange: () => _focus.bumpVersion() });
const _locks = createLockStore({ ttlMs: 10_000 });
// Proposed spec-edit drafts, keyed by fileIndex (mirrors the reply-draft
// store): an external client stages a whole-file markdown proposal the user
// reviews/edits in the portal editor before committing.
const _specDrafts = createDraftStore({ onChange: () => _focus.bumpVersion() });
const _specLocks = createLockStore({ ttlMs: 10_000 });
const _inflight = createInflightStore();
// Pre-PR remote-authoring sessions (clickstop 2, step 10). A `(repo, branch)`
// session with no PR yet; token bound only after a successful build so a failed
// open never clobbers another session's shared state. Consumed by the remote
// write path (create_branch / stage / push).
const _authSessions = createSessionTokens();
function openAuthoringSession({ id, repo, branch, files = [], path = null, tokenPath = null }) {
  const session = makeRepoSession({ repo, branch, files, path });
  if (id && tokenPath) _authSessions.bind(id, tokenPath);
  return session;
}

// Remote spec-authoring staged drafts (clickstop 2, step 11). Durable on disk
// (atomic write + quarantine-on-corrupt via spec-draft-store), keyed by
// (repo,branch,path). An in-memory index maps the control-API's composite key
// back to (repo,branch,path) so /state?full=1 and the push can enumerate them.
const SPEC_DRAFTS_DIR = path.join(CONFIG_DIR, "spec-drafts");
const _remoteSpecLocks = createKeyedLockStore({ ttlMs: 10_000 });
const _remoteDraftIndex = new Map(); // key -> {project,repo,branch,path}
// Disk store id: scope by project so a same-named repo in another project can't
// collide on disk either (the store hashes this id + branch + path).
function _draftDiskId(project, repo) { return `${project}::${repo}`; }
const _remoteSpecDrafts = {
  put(key, { project, repo, branch, path: filePath, body, baseObjectId }, meta = {}) {
    const rec = saveSpecDraft(SPEC_DRAFTS_DIR, _draftDiskId(project, repo), branch, filePath, {
      body, baseObjectId, updatedAt: new Date().toISOString(),
    });
    _remoteDraftIndex.set(key, { project, repo, branch, path: filePath });
    return { ...rec, source: meta.source || "external" };
  },
  get(key) {
    const loc = _remoteDraftIndex.get(key);
    if (!loc) return null;
    try { return loadSpecDraft(SPEC_DRAFTS_DIR, _draftDiskId(loc.project, loc.repo), loc.branch, loc.path); }
    catch { return null; } // corrupt file already quarantined by the store
  },
  delete(key) {
    const loc = _remoteDraftIndex.get(key);
    if (!loc) return false;
    deleteSpecDraft(SPEC_DRAFTS_DIR, _draftDiskId(loc.project, loc.repo), loc.branch, loc.path);
    _remoteDraftIndex.delete(key);
    return true;
  },
  list() {
    const out = {};
    for (const [key, loc] of _remoteDraftIndex) {
      try { const d = loadSpecDraft(SPEC_DRAFTS_DIR, _draftDiskId(loc.project, loc.repo), loc.branch, loc.path); if (d) out[key] = d; }
      catch { /* quarantined; omit */ }
    }
    return out;
  },
  forBranch(project, repo, branch) {
    const items = [];
    for (const [, loc] of _remoteDraftIndex) {
      if (loc.project === project && loc.repo === repo && loc.branch === branch) {
        try { const d = loadSpecDraft(SPEC_DRAFTS_DIR, _draftDiskId(loc.project, loc.repo), loc.branch, loc.path); if (d) items.push(d); }
        catch { /* quarantined; omit */ }
      }
    }
    return items;
  },
};

// Build an ADO connection for an org. Reuses the live review connection when the
// org matches (or none is given); otherwise builds one for that org with the
// same credentials, so a write can target a repo in a different org. Honors the
// host-token invariant: in host-token mode it uses the live bearer or nothing —
// it never falls back to a PAT/CLI identity (selectAdoAuthSource enforces this).
function buildConnForOrg(org) {
  if (_hostKind === "github") return null;
  if ((!org || org === ADO_ORG) && _conn) return _conn;
  // Only consult a saved PAT in standalone mode; in host-token mode a missing
  // live token must fail, not switch identity.
  const pat = HOST_TOKEN_MODE ? null : loadPat();
  const sel = selectAdoAuthSource({ hostTokenMode: HOST_TOKEN_MODE, token: _adoToken, pat });
  if (sel.source === "token") return new azdev.WebApi(org, azdev.getBearerHandler(sel.token));
  if (sel.source === "pat") return new azdev.WebApi(org, azdev.getPersonalAccessTokenHandler(sel.pat));
  return null; // "none" (host token gone — never switch) or "cli" (no minting here)
}

// Resolve explicit write coordinates to a live per-call target. `org`, `project`,
// AND `repo` are ALL REQUIRED (resolveWriteTarget throws otherwise — a write
// never guesses any coordinate); NONE default to the configured org/project/repo,
// which apply only to PR review. Resolves the repo to its GUID via getRepository
// so downstream calls are unambiguous. NEVER reads ADO_ORG/ADO_REPO/ADO_PROJECT —
// the review globals play no part in an authoring write.
async function resolveTarget({ org, project, repo } = {}) {
  const t = resolveWriteTarget({ org, project, repo });
  if (_hostKind === "github") {
    if (t.org.toLowerCase() !== "https://github.com") {
      const error = new Error(
        "GitHub writes require org=https://github.com",
      );
      error.code = "WRITE_TARGET";
      throw error;
    }
    const info = await _githubRepoContent.resolveRepository(t.repo, t.project);
    const owner = info?.project?.id || t.project;
    if (String(owner).toLowerCase() !== t.project.toLowerCase()) {
      const error = new Error(
        `repo ${t.repo} does not belong to GitHub owner ${t.project}`,
      );
      error.code = "WRITE_TARGET";
      throw error;
    }
    return {
      conn: _conn,
      org: t.org,
      project: owner,
      repo: t.repo,
      repoId: info?.id || `${owner}/${t.repo}`,
      projectId: owner,
      repoName: info?.name || t.repo,
    };
  }
  const conn = buildConnForOrg(t.org);
  if (!conn) { const e = new Error("no ADO connection for " + t.org); e.noConn = true; throw e; }
  const info = await adoRepoContent(conn).resolveRepository(t.repo, t.project);
  return {
    conn, org: t.org, project: t.project, repo: t.repo,
    repoId: info?.id || t.repo,
    projectId: info?.project?.id || t.project,
    repoName: info?.name || t.repo,
  };
}
function _writeErrStatus(e) { return e && e.code === "WRITE_TARGET" ? 400 : e && e.noConn ? 503 : 502; }

// Push every staged draft for (project,repo,branch) as ONE commit
// (all-or-nothing). Writes target the EXPLICIT (org?,project,repo) coordinates,
// resolved per call — never the review globals. Optimistic concurrency: if the
// branch moved since the caller staged, 409.
async function pushRemoteSpec({ org, project, repo, branch, message, oldObjectId } = {}) {
  let target;
  try { target = await resolveTarget({ org, project, repo }); }
  catch (e) { return { ok: false, status: _writeErrStatus(e), body: { ok: false, error: e.message } }; }
  const branchRef = normalizeBranchRef(branch);
  const staged = _remoteSpecDrafts.forBranch(target.project, target.repo, branch);
  if (staged.length === 0) return { ok: false, status: 400, body: { ok: false, error: "no staged drafts for this branch" } };
  let currentTip;
  try { currentTip = await getBranchTip(target.conn, branchRef, target.repoId, target.project); }
  catch (e) { return { ok: false, status: 502, body: { ok: false, error: "failed to read branch tip: " + (e?.message || e) } }; }
  if (oldObjectId && oldObjectId !== currentTip) {
    return { ok: false, status: 409, body: { ok: false, error: "branch moved; re-stage against the new tip", currentTip } };
  }
  // Split into ADO adds (new files) vs edits (existing) by whether the draft
  // captured a base object id when it was opened.
  const adds = staged.filter((d) => !d.baseObjectId).map((d) => ({ path: d.path, content: d.body }));
  const edits = staged.filter((d) => d.baseObjectId).map((d) => ({ path: d.path, content: d.body }));
  let pushed;
  try {
    pushed = await repoContentProvider(target.conn).pushFiles(
      target.repoId,
      target.project,
      {
        adds,
        edits,
        message: message || "Update spec",
        branchRef,
        oldObjectId: currentTip,
      },
    );
  } catch (e) {
    return { ok: false, status: 502, body: { ok: false, error: "push failed: " + (e?.message || e) } };
  }
  const commitId = pushed.commitId;
  for (const d of staged) _remoteSpecDrafts.delete(draftKeyOf({ project: target.project, repo: target.repo, branch, path: d.path }));
  return { ok: true, status: 200, body: { ok: true, repo: target.repo, project: target.project, commitId, pushedFiles: staged.map((d) => d.path) } };
}

// Open a PR for the authored branch and find-or-create-and-link a Spec review
// work item (clickstop 2, step 12). Targets the EXPLICIT (org?,project,repo)
// coordinates, resolved per call. Pure request shapes live in pr-open.js; here
// we inject the real ADO calls, each bounded by the adoCall timeout. Title/type
// come from the caller — never inferred.
async function openPr(args = {}) {
  let target;
  try { target = await resolveTarget({ org: args.org, project: args.project, repo: args.repo }); }
  catch (e) { return { ok: false, error: e.message }; }
  if (_hostKind === "github") {
    if (args.workItemTitle) {
      return {
        ok: false,
        error: "Work-item linking is not available for GitHub pull requests.",
      };
    }
    try {
      const pr = await authoringProvider(target.conn).createPullRequest(
        target.repoId,
        target.project,
        args,
      );
      return {
        ok: true,
        pullRequestId: pr.pullRequestId,
        url: pr.url,
        isDraft: pr.isDraft,
        workItemId: null,
        workItemCreated: false,
        linked: false,
      };
    } catch (e) {
      return {
        ok: false,
        error: "open PR failed: " + (e?.message || e),
      };
    }
  }
  const authoring = adoAuthoring(target.conn);
  const workItems = adoWorkItems(target.conn);
  try {
    return await openSpecReviewPr({
      call: (fn) => adoCall(fn, { label: "pr-open" }),
      createPr: (req) => authoring.createPullRequest(
        target.repoId, target.project, req,
      ),
      findWorkItems: async (wiql) => {
        const refs = await workItems.queryWorkItemRefs(target.project, wiql);
        return refs.map((w) => ({ id: w.id }));
      },
      createWorkItem: async (patch, type) =>
        workItems.createWorkItem(target.project, type, patch),
      linkWorkItem: async (id, link) =>
        workItems.linkToPullRequest(id, link),
    }, { ...args, projectId: target.projectId, repositoryId: target.repoId });
  } catch (e) {
    return { ok: false, error: "open PR failed: " + (e?.message || e) };
  }
}

// Create (or adopt) a branch for remote spec authoring (clickstop 2, step 13).
// Targets the EXPLICIT (org?,project,repo) coordinates, resolved per call — never
// the review globals. Pure ref-shaping lives in ado-refs.js. Idempotent: an
// existing branch is adopted (created:false), not re-created.
async function mcpCreateBranch({ org, project, repo, branch, base } = {}) {
  if (!branch) return { ok: false, error: "branch is required" };
  let target;
  try { target = await resolveTarget({ org, project, repo }); }
  catch (e) { return { ok: false, error: e.message }; }
  const branchRef = normalizeBranchRef(branch);
  const repoContent = repoContentProvider(target.conn);
  // Already exists? Adopt it (idempotent), don't fail or clobber.
  try {
    const tip = await getBranchTip(target.conn, branchRef, target.repoId, target.project);
    if (tip) {
      openAuthoringSession({ id: branchRef, repo: target.repo, branch });
      return { ok: true, org: target.org, project: target.project, repo: target.repo, branch, branchRef, created: false, objectId: tip };
    }
  } catch (e) {
    if (_hostKind === "github" && e?.status !== 404) {
      return {
        ok: false,
        error: "failed to read branch: " + (e?.message || e),
      };
    }
    // Not found -> create below. ADO's SDK does not expose a stable 404 shape.
  }
  // Resolve the base branch + its tip.
  let available = [];
  try {
    const refs = await repoContent.listBranches(
      target.repoId, target.project, { filter: "heads/" },
    );
    available = (refs || []).map((r) => String(r.name).replace("refs/heads/", ""));
  } catch (e) { return { ok: false, error: "failed to list branches: " + (e?.message || e) }; }
  const baseName = resolveBaseBranch(available, base);
  if (!baseName) return { ok: false, error: "could not resolve a base branch" + (base ? ` (requested '${base}')` : "") };
  let baseTip;
  try { baseTip = await getBranchTip(target.conn, normalizeBranchRef(baseName), target.repoId, target.project); }
  catch (e) { return { ok: false, error: "failed to read base branch tip: " + (e?.message || e) }; }
  let result;
  try {
    result = await repoContent.createBranch(
      target.repoId, target.project, { branch, baseTip },
    );
  }
  catch (e) {
    const message = e?.message || String(e);
    // Preserve the pre-provider user-facing distinction: ADO explicitly
    // rejecting the ref update was "create branch rejected: <status>";
    // transport/other failures were "create branch failed: <error>".
    return {
      ok: false,
      error: message.startsWith("create branch rejected:")
        ? message
        : "create branch failed: " + message,
    };
  }
  openAuthoringSession({ id: branchRef, repo: target.repo, branch });
  return { ok: true, org: target.org, project: target.project, repo: target.repo, branch, branchRef: result.branchRef, base: baseName, created: true, objectId: result.objectId };
}

// Clickstop 2: staged branches, files, folders, PR intents, and PR-publish
// intents live only in memory until pushed — extracted to _inventory
// (staged-inventory.js). The pure state operations below are destructured
// straight off it so every existing caller (registerControlApi,
// registerMcpTools, and the routes below) keeps using the same bare names
// with no other change.
const {
  stageBranch, unstageBranch, resolveEffectiveBranch,
  stageFile, unstageFile, updateStagedFileContent, saveExistingEdit,
  stageSpecPr, unstageSpecPr,
  stagePrPublish, unstagePrPublish,
  createStagedFolder, deleteStagedFolder, renameStagedFolder,
  listStagedBranches, stagedTotal,
} = _inventory;

// The three functions below stay in index.js because they orchestrate several
// provider capabilities (repo content + authoring) with the local staged
// inventory. Backend calls themselves now live behind those providers;
// inventory access is only via snapshot() (read) and removeXMatching() /
// setPrPublishes() (write-after-success), never via a raw array.
async function pushStagedBranches() {
  const results = [];
  const { branches, files, folders, prs } = _inventory.snapshot();
  const groups = planStagedPushes({ branches, files, folders, prs });
  const sameTarget = (item, group) =>
    String(item.org || "").replace(/\/+$/, "") === group.org &&
    item.project === group.project && item.repo === group.repo &&
    String(item.branch || "").replace(/^refs\/heads\//, "") === group.branch;
  for (const group of groups) {
    if (group.errors.length) {
      results.push({ project: group.project, repo: group.repo, branch: group.branch, ok: false, error: group.errors.join("; ") });
      continue;
    }
    let created = false;
    if (group.stagedBranch) {
      let branchResult;
      try {
        branchResult = await mcpCreateBranch({ org: group.org, project: group.project, repo: group.repo, branch: group.branch, base: group.stagedBranch.base || undefined });
      } catch (e) {
        branchResult = { ok: false, error: e?.message || String(e) };
      }
      if (!branchResult || !branchResult.ok) {
        results.push({ project: group.project, repo: group.repo, branch: group.branch, ok: false, error: branchResult?.error || "branch creation failed" });
        continue;
      }
      created = !!branchResult.created;
    }
    let target;
    try { target = await resolveTarget(group); }
    catch (e) {
      results.push({ project: group.project, repo: group.repo, branch: group.branch, ok: false, error: e.message });
      continue;
    }
    const branchRef = normalizeBranchRef(group.branch);
    let currentTip;
    try { currentTip = await getBranchTip(target.conn, branchRef, target.repoId, target.project); }
    catch (e) {
      results.push({ project: group.project, repo: group.repo, branch: group.branch, ok: false, error: "failed to read branch tip: " + (e?.message || e) });
      continue;
    }
    if (group.expectedOldObjectId && group.expectedOldObjectId !== currentTip) {
      results.push({ project: group.project, repo: group.repo, branch: group.branch, ok: false, conflict: true, error: "branch moved; reload and re-stage updates" });
      continue;
    }
    let commitId = null;
    if (group.adds.length || group.edits.length) {
      try {
        const pushed = await repoContentProvider(target.conn).pushFiles(
          target.repoId,
          target.project,
          {
            adds: group.adds,
            edits: group.edits,
            message: `Tippani: publish ${group.branch}`,
            branchRef,
            oldObjectId: currentTip,
            label: "push staged content",
          },
        );
        commitId = pushed.commitId;
      } catch (e) {
        results.push({ project: group.project, repo: group.repo, branch: group.branch, ok: false, error: "content push failed: " + (e?.message || e) });
        continue;
      }
    }
    _inventory.removeBranchesMatching((item) => sameTarget(item, group));
    _inventory.removeFilesMatching((item) => sameTarget(item, group));
    _inventory.removeFoldersMatching((item) => sameTarget(item, group));
    let prResult = null;
    if (group.prs.length) {
      try { prResult = await openPr(group.prs[0]); }
      catch (e) { prResult = { ok: false, error: e?.message || String(e) }; }
      if (!prResult || !prResult.ok) {
        results.push({ project: group.project, repo: group.repo, branch: group.branch, ok: false, created, commitId, error: prResult?.error || "PR creation failed" });
        continue;
      }
      _inventory.removePrsMatching((item) => sameTarget(item, group));
    }
    results.push({
      project: group.project, repo: group.repo, branch: group.branch, ok: true, created, commitId,
      pushedFiles: group.adds.length + group.edits.length, pullRequestId: prResult?.pullRequestId || null,
    });
  }
  return { ok: results.every((result) => result.ok), count: stagedTotal(), results };
}
async function publishStagedPrs() {
  const results = [];
  const remaining = [];
  for (const item of _inventory.snapshot().prPublishes) {
    try {
      const target = await resolveTarget({ org: item.org, project: item.project, repo: item.repo });
      const publish = () => authoringProvider(target.conn).publishPullRequest(
        target.repoId, target.project, item.pullRequestId,
      );
      if (_hostKind === "github") await publish();
      else await adoCall(publish, { label: "publish PR" });
      results.push({ pullRequestId: item.pullRequestId, ok: true });
    } catch (e) {
      results.push({ pullRequestId: item.pullRequestId, ok: false, error: e?.message || String(e) });
      remaining.push(item);
    }
  }
  _inventory.setPrPublishes(remaining);
  return { ok: results.every((r) => r.ok), count: stagedTotal(), results };
}

// Clickstop 2: folder picker. Real ADO folders always contain committed files
// (git tracks no empty dirs), so brand-new folders live only in memory in
// _inventory, scoped to a (repo, branch), until a spec is staged into them
// and the branch pushed. A staged branch has no ADO branch yet, so its folder
// tree is read from the parent (base) branch — walking the base chain when
// the parent is also staged (resolveEffectiveBranch).
async function listBranchFolders({ project, repo, branch, scope } = {}) {
  const scopeN = normFolder(scope);
  const proj = project || _adoProjectDisplayName || ADO_PROJECT;
  const eff = resolveEffectiveBranch(repo, branch);
  const version = String(eff).replace(/^refs\/heads\//, "");
  const out = new Map();
  let adoError = null;
  let repoContent = null;
  if (!_isOffline && _conn && repo) {
    try {
      repoContent = repoContentProvider(_conn);
      const scopePath = scopeN ? "/" + scopeN : "/";
      const items = await repoContent.listItems(
        repo,
        proj,
        { scopePath, branch: version, recursionLevel: 1 },
      );
      for (const it of items || []) {
        if (!it || !it.isFolder || !it.path) continue;
        const pn = normFolder(it.path);
        if (!pn || pn === scopeN || parentFolder(pn) !== scopeN) continue;
        out.set(pn, { path: pn, name: pn.split("/").pop(), created: false, empty: false, hasChildren: false, _ado: true });
      }
    } catch (e) { adoError = e?.message || String(e); }
  }
  for (const f of _inventory.stagedFoldersUnder(repo, branch, scopeN)) {
    const pn = normFolder(f.path);
    const empty = !_inventory._folderHasStagedFile(repo, branch, pn) && !_inventory._folderHasChild(repo, branch, pn);
    const existing = out.get(pn);
    if (existing) { existing.created = true; existing.empty = empty; }
    else out.set(pn, { path: pn, name: pn.split("/").pop(), created: true, empty, hasChildren: false, _ado: false });
  }
  const folders = [...out.values()];
  // Mark parents: a folder shows an expander if it has ADO subfolders or created subfolders.
  for (const folder of folders) { if (_inventory._folderHasChild(repo, branch, folder.path)) folder.hasChildren = true; }
  if (repoContent) {
    await Promise.all(folders.map(async (folder) => {
      if (folder.hasChildren || !folder._ado) return;
      try {
        const sub = await repoContent.listItems(
          repo,
          proj,
          {
            scopePath: "/" + folder.path,
            branch: version,
            recursionLevel: 1,
          },
        );
        folder.hasChildren = (sub || []).some((it) => it && it.isFolder && parentFolder(normFolder(it.path)) === folder.path);
      } catch (e) { /* ignore probe failure */ }
    }));
  }
  folders.forEach((f) => { delete f._ado; });
  folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  return { ok: true, scope: scopeN, effectiveBranch: eff, folders, adoError };
}


// --- Express server ---
async function main() {
  // Parse PR ID (first non-flag argument)
  const args = process.argv.slice(2);
  const positional = args.filter(a => !a.startsWith("--"));

  // --demo boots the portal on sample data: no ADO, no credentials, no clone.
  // Checked before every other requirement so it is always reachable.
  if (args.includes("--demo")) {
    const { startDemo } = await import("./demo.js");
    const portArg = args.find(a => a.startsWith("--port="));
    await startDemo({
      port: portArg ? parseInt(portArg.split("=")[1], 10) || 3847 : 3847,
      headless: args.includes("--headless"),
    });
    return;
  }

  const githubTarget = parseGitHubTarget(args, process.env);
  if (githubTarget.error) {
    console.error(`Error: ${githubTarget.error}`);
    process.exit(1);
  }
  if (githubTarget.isGitHub) {
    _hostKind = "github";
    _githubOwner = githubTarget.owner;
    _githubRepo = githubTarget.repo;
    _prId = githubTarget.prId;
  } else {
    _prId = parseInt(positional[0]);
  }
  const explicitFile = args.find((a) => a.startsWith("--file="))?.split("=").slice(1).join("=") || positional[1] || null;

  const browseMode = args.includes("--browse");
  // A local repo can be reviewed with no ADO PR: --local-repo populates the
  // Local tab and (alone) boots the portal in browse mode.
  const localRepoArg = (args.find(a => a.startsWith("--local-repo="))?.split("=").slice(1).join("=")) || process.env.TIPPANI_LOCAL_REPO || null;
  _localRepoPath = localRepoArg ? String(localRepoArg).trim() : "";
  if (_localRepoPath) approveLocalRoot(_localRepoPath); // --local-repo is an explicit user approval
  const browseModeEffective = browseMode || (!!_localRepoPath && !_prId);
  _browseMode = browseModeEffective;
  if (!_prId && !browseModeEffective) {
    console.log("Usage: tippani <PR_ID> [options]");
    console.log("");
    console.log("Try it with no setup:");
    console.log("  tippani --demo    Open the portal on a sample spec (no ADO, no login)");
    console.log("");
    console.log("Options:");
    console.log("  --org=<url>       ADO org URL (e.g. https://dev.azure.com/myorg)");
    console.log("  --project=<name>  ADO project name");
    console.log("  --repo=<name>     ADO repo name (optional; auto-detected from the PR)");
    console.log("  --local-repo=<p>  Review a LOCAL git repo (populates the Local tab)");
    console.log("  --file=<path>     Open a specific file directly");
    console.log("  --refresh         Force re-fetch from ADO (ignore cache)");
    console.log("  --offline         Work from cache only, no ADO connection needed");
    console.log("  --save-config     Save --org/--project/--repo to ~/.tippani/config.json");
    console.log("  --port=<n>        Serve on a specific port (default 3847)");
    console.log("  --headless        Don't open a browser (agent-only session)");
    console.log("  --ado-token=<t>   Use a bearer token for ADO (skip PAT / az CLI)");
    console.log("  --github=o/r      Review GitHub PR <PR_ID> in owner/repo");
    console.log("  --gh-token=<t>    GitHub token (else TIPPANI_GH_TOKEN / gh auth token)");
    console.log("");
    console.log("Examples:");
    console.log("  tippani --demo");
    console.log("  tippani 992661");
    console.log("  tippani 992661 --org=https://dev.azure.com/myorg --project='My Project'");
    console.log("  tippani 992661 --offline");
    console.log("  tippani github:owner/repo#123");
    console.log("  tippani 123 --github=owner/repo");
    console.log("");
    console.log("Config: ~/.tippani/config.json (set defaults to avoid repeated flags)");
    process.exit(1);
  }

  // Resolve host configuration. Existing templates still use these context
  // variables for labels/links; in GitHub mode they carry owner/full repo.
  const adoConfig = getConfig();
  if (_hostKind === "github") {
    ADO_ORG = "https://github.com";
    ADO_PROJECT = _githubOwner;
    ADO_REPO = `${_githubOwner}/${_githubRepo}`;
  } else {
    if ((!adoConfig.org || !adoConfig.project) && !_localRepoPath) {
      console.error("Error: --org and --project are required (or set in ~/.tippani/config.json).");
      console.error("Run: tippani <PR_ID> --org=https://dev.azure.com/YOURORG --project='YOUR PROJECT' --save-config");
      process.exit(1);
    }
    ADO_ORG = (adoConfig.org || "").replace(/\/+$/, "");
    if (ADO_ORG && !ADO_ORG.startsWith("https://")) ADO_ORG = "https://" + ADO_ORG;
    ADO_PROJECT = adoConfig.project || "";
    ADO_REPO = adoConfig.repo || adoConfig.project || "";
  }

  // Save config if requested
  if (args.includes("--save-config") && _hostKind === "ado") {
    saveConfig({ org: ADO_ORG, project: ADO_PROJECT, repo: ADO_REPO });
    console.log("Config saved to ~/.tippani/config.json");
  }

  if (_hostKind === "github") {
    console.log(`  GitHub: ${_githubOwner}/${_githubRepo}`);
  } else {
    console.log(`  Org: ${ADO_ORG} | Project: ${ADO_PROJECT} | Repo: ${ADO_REPO}`);
  }

  const forceRefresh = args.includes("--refresh");
  _isOffline = args.includes("--offline");

  // Host integration: --port / --headless / --ado-token (or the
  // TIPPANI_* env equivalents). Port lets multiple PRs run at once; headless
  // skips opening a browser (agent-only sessions); ado-token accepts a bearer
  // (e.g. an Entra token) so no PAT / az CLI is needed.
  const portArg = args.find(a => a.startsWith("--port="));
  const portVal = portArg ? parseInt(portArg.split("=")[1], 10) : parseInt(process.env.TIPPANI_PORT || "", 10);
  if (Number.isFinite(portVal) && portVal > 0) PORT = portVal;
  const headless = args.includes("--headless") || process.env.TIPPANI_HEADLESS === "1";
  const externalClientName =
    String(process.env.TIPPANI_CLIENT_NAME || "tippani-external").trim() ||
    "tippani-external";
  const localClientAuth = createLocalClientAuth({ port: PORT });
  const appBearer = localClientAuth.createBearerSession({
    clientName: externalClientName,
  });
  const adoToken = (args.find(a => a.startsWith("--ado-token="))?.split("=").slice(1).join("=")) || process.env.TIPPANI_ADO_TOKEN || null;
  let githubToken = null;
  if (_hostKind === "github" && !_isOffline) {
    const { execSync } = await import("node:child_process");
    const selected = selectGitHubToken({
      args,
      env: process.env,
      execGh: () => execSync("gh auth token", {
        encoding: "utf8",
        timeout: 15000,
        stdio: ["ignore", "pipe", "ignore"],
      }),
    });
    githubToken = selected.token;
    if (!githubToken) {
      console.error("GitHub authentication required. Set TIPPANI_GH_TOKEN, pass --gh-token, or run `gh auth login`.");
      process.exit(1);
    }
    initGitHubProviders(githubToken, githubTarget);
    console.log(`Authenticated to GitHub via ${selected.source}.`);
  }

  // Host-token mode: the embedding host injected a token. Latch it so the auth
  // path never switches to a PAT/CLI identity later (a stale token gets refreshed
  // via POST /api/v1/ado-token, not swapped). Seed _adoToken from it so a write
  // to a NON-default org can build a connection off the provided token — startup
  // otherwise only binds the default-org _conn.
  HOST_TOKEN_MODE = _hostKind === "ado" && !!(adoToken && adoToken.trim());
  if (HOST_TOKEN_MODE) _adoToken = adoToken;

  // Browse mode: a PR-less portal that lists/searches work before a PR is open.
  // ADO reads org/project from config; GitHub is anchored by --github=owner/repo
  // so repository-relative authoring still has an explicit default.
  // Discovery: the browse portal is the SAME server as a PR-bound portal, just
  // with no PR loaded yet. It authenticates, serves the Discovery home ("/"),
  // and re-drives into PR-bound mode at runtime via GET /open/:prId (bindPr).
  // So browse mode only sets up the connection + empty PR state here, then falls
  // through to the shared app below.
  if (browseModeEffective) {
    if (_hostKind === "ado") {
      if (adoToken) _conn = getAdoConnectionBearer(adoToken);
      else { const pat = loadPat(); if (pat) _conn = getAdoConnection(pat); }
    }
    if (!_conn && !_localRepoPath) {
      console.error(_hostKind === "github"
        ? "GitHub browse mode requires authentication."
        : "Browse mode requires an ADO token (--ado-token / TIPPANI_ADO_TOKEN).");
      process.exit(1);
    }
    _prId = 0;
    _pr = null;
    _branch = null;
    _changedFiles = [];
    _otherChangedFiles = [];
  }

  let openIndex = null;

  // PR-bound startup: authenticate, then load the PR into module state. Skipped
  // in browse mode (no PR yet) — the Discovery home binds a PR later via /open.
  if (!browseModeEffective) {

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
    applyRepoContextFromPR(_pr);
    _branch = _cache.branch;
    _changedFiles = _cache.changedFiles;
    _otherChangedFiles = _cache.otherChangedFiles || [];

    // Establish connection for live actions (comment sync etc.)
    if (_hostKind === "ado") {
      let pat = loadPat();
      if (adoToken) {
        _conn = getAdoConnectionBearer(adoToken);
      } else if (pat) {
        _conn = getAdoConnection(pat);
      } else {
        const token = await getTokenFromAzCli();
        if (token) {
          _conn = getAdoConnectionBearer(token);
        }
        // If no auth available, operate with cached data only
      }
    }
  } else if (_isOffline) {
    // Pure offline — skip auth entirely
    console.log("  Offline mode — using cached data (cached " + new Date(_cache.cachedAt).toLocaleString() + ")");
    _pr = _cache.pr;
    applyRepoContextFromPR(_pr);
    _branch = _cache.branch;
    _changedFiles = _cache.changedFiles;
    _otherChangedFiles = _cache.otherChangedFiles || [];
    _conn = null;
  } else {
    // Need to fetch from the host. GitHub providers were initialized above;
    // ADO retains its existing PAT/az CLI authentication flow.
    if (_hostKind === "ado") {
      let pat = loadPat();
      if (adoToken) {
        console.log("Authenticated via provided ADO token.");
        _conn = getAdoConnectionBearer(adoToken);
      } else if (pat) {
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
            console.log("\nNo credentials found. Recommended: run 'az login' in another terminal, then re-run tippani (no PAT needed).");
            console.log("Otherwise, generate a PAT at:");
            console.log(`  ${ADO_ORG}/_usersSettings/tokens`);
            console.log("  Scope: Code (Read & Write). Note: PAT creation may be blocked by your tenant policy.\n");
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
    }

    console.log(`Loading ${_hostKind === "github" ? "GitHub " : ""}PR #${_prId}...`);
    try {
      _pr = await getPullRequest(_conn, _prId);
    } catch (e) {
      console.error(`\n  Error: ${friendlyAdoError(e, "Loading PR")}\n`);
      process.exit(1);
    }
    console.log(`  "${_pr.title}" by ${_pr.createdBy?.displayName}`);

    // Re-point at the PR's real repository before any repo-scoped calls.
    const _ctx = applyRepoContextFromPR(_pr);
    if (_ctx.source === "pr" && _ctx.repoName) {
      console.log(`  Repository: ${_ctx.projectName || ADO_PROJECT}/${_ctx.repoName}`);
    }

    // Warn if PR is abandoned or completed
    if (_pr.status === 2) console.log("  ⚠ This PR is abandoned. Comments may not be actionable.");
    if (_pr.status === 3) console.log("  ⚠ This PR is completed. Comments may not be actionable.");

    _branch = _pr.sourceRefName;

    console.log("  Fetching changed files...");
    let _fileResult;
    try {
      _fileResult = await getPRChangedFiles(_conn, _prId);
    } catch (e) {
      console.error(`\n  Error: ${friendlyAdoError(e, "Fetching changed files")}\n`);
      process.exit(1);
    }
    _changedFiles = _fileResult.mdFiles;
    _otherChangedFiles = _fileResult.otherFiles;
    console.log(`  ${_changedFiles.length} .md file(s) changed.`);

    // Cache file contents and threads
    console.log("  Caching file contents...");
    const fileContents = {};
    for (const f of _changedFiles) {
      try {
        fileContents[f.path] = await getFileContent(_conn, f.path, contentVersion());
      } catch (e) {
        console.log("    \u26A0 Could not cache " + f.path);
      }
    }
    const threads = await getCommentThreads(_conn, _prId);
    _cache = { pr: _pr, branch: _branch, changedFiles: _changedFiles, otherChangedFiles: _otherChangedFiles, fileContents, threads, cachedAt: new Date().toISOString() };
    saveCache(_prId, _cache);
    console.log("  Cached to " + getCachePath(_prId));
  }

  if (_changedFiles.length === 0) {
    const others = _otherChangedFiles || [];
    if (others.length > 0) {
      const summary = summarizeNonMarkdown(others);
      console.error(`\n  No markdown (.md) files changed in PR #${_prId}.`);
      console.error(`  tippani reviews markdown specs only, but this PR changed ${others.length} non-markdown file(s):`);
      console.error(`    ${summary.join(", ")}`);
      for (const f of others.slice(0, 5)) console.error(`      - ${f.path}`);
      if (others.length > 5) console.error(`      … and ${others.length - 5} more`);
      console.error(`\n  If the spec is a .docx/.pdf or other format, tippani can't render it yet.`);
      console.error(`  If you expected .md changes, double-check the PR id and that you're on the right repo.\n`);
    } else {
      console.error(`\n  PR #${_prId} has no reviewable changed files (it may be empty, or all changes were deletions).\n`);
    }
    process.exit(1);
  }

  // Determine push access once — gates the Edit affordance in every spec view.
  _canEdit = await computeCanEdit(_conn, _pr, _isOffline);

  // Resolve explicit file to an index
  if (explicitFile) {
    const idx = _changedFiles.findIndex((f) => f.path === explicitFile);
    openIndex = idx >= 0 ? idx : 0;
  }

  } // end if (!browseMode)

  // Start server
  const app = express();
  app.use(express.json());

  // DNS-rebinding guard: the portal binds loopback only, so a legitimate
  // request's Host is always localhost / 127.0.0.1 / [::1]. A rebind attack
  // reaches us with the attacker's hostname in Host (it resolves to 127.0.0.1
  // in the victim's browser), so reject any other Host outright — this runs on
  // EVERY request, including the GETs that set review context. The predicate is
  // the tested isAllowedHost (src/host-guard.js).
  app.use((req, res, next) => {
    if (!isAllowedHost(req.headers.host)) {
      return res.status(403).json({ error: "Forbidden: host not allowed" });
    }
    next();
  });

  // One boundary covers current and legacy browser routes. Control API routes
  // use the same manager for browser cookies or scoped headless bearers.
  localClientAuth.mount(app);

  // Phase 119: serve the vendored Mermaid runtime (embedded string) for the
  // spec page's lazy diagram rendering. Offline-safe; long-cache immutable.
  app.get("/vendor/mermaid.min.js", (_req, res) => {
    res.type("application/javascript")
       .set("Cache-Control", "public, max-age=31536000, immutable")
       .send(MERMAID_JS);
  });

  // Rendered-markdown links open in the OS default browser instead of navigating
  // the portal (a relative doc link like docs/x.md would otherwise 404 and
  // replace the reader). A single delegated interceptor is injected into every
  // HTML page; it fires ONLY for links inside rendered content (.ro-doc / .spec /
  // comment bodies), so app navigation (breadcrumbs, TOC, cards) and in-page
  // #anchors are untouched.
  const LINK_OPENER_SCRIPT =
    "<script>(function(){if(window.__tpLinkOpener)return;window.__tpLinkOpener=true;" +
    "function ofp(){try{return new URLSearchParams(location.search).get('path')||'';}catch(e){return '';}}" +
    "document.addEventListener('click',function(ev){if(ev.defaultPrevented||ev.button!==0)return;" +
    "var a=ev.target&&ev.target.closest?ev.target.closest('a[href]'):null;if(!a)return;" +
    "var href=a.getAttribute('href')||'';if(!href||href.charAt(0)==='#')return;" +
    "if(/^(javascript|data|vbscript):/i.test(href))return;" +
    "if(!a.closest('.ro-doc,.spec,.fb-comment-body,.rh-body,.tc-body,.pc-body'))return;" +
    "ev.preventDefault();" +
    "fetch('/open-external?href='+encodeURIComponent(href)+'&base='+encodeURIComponent(ofp())).then(function(r){return r.json();}).then(function(d){if(d&&d.action==='tippani'&&d.href){location.href=d.href;}}).catch(function(){});" +
    "},true);})();</script>";
  app.use((req, res, next) => {
    const origSend = res.send.bind(res);
    res.send = (body) => {
      try {
        const ct = res.get("Content-Type") || "";
        if (typeof body === "string" && ct.includes("text/html") && body.includes("</body>")) {
          body = body.replace("</body>", LINK_OPENER_SCRIPT + "</body>");
        }
      } catch { /* never block a response on injection failure */ }
      return origSend(body);
    };
    next();
  });

  // Open a link from rendered markdown in the OS default browser. http(s)/mailto
  // open as-is; a relative link resolves against the open file's directory and
  // must stay inside that document's folder tree (or an approved root) before it
  // is handed to the OS opener. Loopback-only (the host guard already ran).
  app.get("/open-external", async (req, res) => {
    const r = resolveLinkAction(req.query.href, req.query.base, { isContained, containingRoot, fs, path });
    if (r.error) return res.status(r.status || 400).json({ error: r.error });
    // A markdown file under the current file's root folder opens inside Tippani
    // (the read-only reviewing view); anything else opens in the OS browser.
    if (r.action === "tippani") {
      return res.json({ action: "tippani", href: "/open-file-view?path=" + encodeURIComponent(r.path) });
    }
    try {
      const openPkg = (await import("open")).default;
      await openPkg(r.target);
      return res.json({ action: "external", ok: true, opened: r.target });
    } catch (e) {
      return res.status(500).json({ error: String((e && e.message) || e) });
    }
  });

  // Home. In browse mode (no PR bound) this is the Discovery home — the review
  // queue (specs I'm authoring + reviewing), whose cards open a PR in-portal via
  // /open/:prId. Once a PR is bound it behaves as the PR file picker / redirect.
  app.get("/", async (_req, res) => {
    if (_browseMode) {
      try {
        const d = await doListPrs({ role: "queue" });
        const projects = _conn ? await listAdoProjects(_conn) : [ADO_PROJECT];
        const placeholder = branchNamePlaceholder(identityFromAdoToken(_adoToken));
        return res.type("html").send(buildHomePage(
          d.prs || [],
          _adoProjectDisplayName || ADO_PROJECT,
          projects,
          placeholder,
          "",
          _hostKind,
        ));
      } catch (e) {
        console.error("Home (review queue) error:", e.message);
        return res.status(500).send("Error loading the Discovery home.");
      }
    }
    res.type("html").send(buildPickerPage(_pr, _changedFiles, _cache?.threads || []));
  });

  // Terminal "closed" page. close_tippani steers the open tab here (via
  // /api/v1/nav) just before the portal process is stopped, so the browser lands
  // on a clear closed state instead of a dead-connection error. window.close()
  // only works for script-opened tabs; otherwise the message stands.
  app.get("/closed", (_req, res) => {
    res.type("html").send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Tippani \u2014 closed</title>
<style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;font-family:"Segoe UI",system-ui,sans-serif;background:#1a1a1a;color:#e8e8e8}.box{text-align:center;max-width:360px;padding:24px}.t{font-size:18px;font-weight:600;margin-bottom:6px}.s{font-size:13px;color:#9a9a9a;line-height:1.6}</style>
</head><body><div class="box"><div class="t">Tippani closed</div><div class="s">The review portal has shut down. You can close this tab.</div></div>
<script>try{window.close();}catch(e){}</script></body></html>`);
  });

  // Discovery re-drive: bind a PR into this (browse) portal at runtime and jump
  // to its spec view — the review-queue cards point here so a PR opens INSIDE
  // Tippani instead of bouncing to ADO. Re-binding a different PR just swaps the
  // loaded PR.
  app.get("/open/:prId", async (req, res) => {
    const prId = parseInt(req.params.prId, 10);
    if (!Number.isFinite(prId) || prId <= 0) return res.redirect("/");
    if (_isOffline || !_conn) return res.status(503).send("Cannot open a PR while offline.");
    try {
      if (_hostKind === "github") {
        const target = normalizeGitHubCoordinates({
          owner: req.query.owner || _githubOwner,
          repo: req.query.repo || _githubRepo,
        });
        if (!target.owner || !target.repo) {
          return res.status(400).send("GitHub owner and repository are required.");
        }
        if (target.owner !== _githubOwner || target.repo !== _githubRepo) {
          _githubOwner = target.owner;
          _githubRepo = target.repo;
          ADO_PROJECT = target.owner;
          ADO_REPO = `${target.owner}/${target.repo}`;
          initGitHubProviders(githubToken, target);
        }
      }
      await bindPr(prId);
      _browseMode = false;
      _canEdit = await computeCanEdit(_conn, _pr, _isOffline);
      // Always land on the PR overview (feedback card + changed md files), never
      // straight into a file — even for single-file PRs (which `/` would bounce
      // to /file/0). The Review Queue tiles point here.
      return res.type("html").send(buildPickerPage(_pr, _changedFiles, _cache?.threads || []));
    } catch (e) {
      console.error(`/open/${prId} failed:`, e.message);
      return res.status(502).send("Could not open PR #" + prId + ". Check the server console.");
    }
  });

  // Cross-PR feedback triage page (all threads across the PR, no file drill-in).
  app.get("/feedback", async (_req, res) => {
    let threads = _cache?.threads || [];
    if (!_isOffline && _conn) {
      try {
        threads = await getCommentThreads(_conn, _prId);
        if (_cache) { _cache.threads = threads; saveCache(_prId, _cache); }
      } catch { /* use cached threads */ }
    }
    const { map: viewedMap, error: viewedError } = await loadViewedState(_conn, _prId, _isOffline);
    res.type("html").send(buildFeedbackPage(_pr, applyPendingResolves(threads), _changedFiles, viewedMap, viewedError));
  });

  // Single-thread view + reply page (used for PR-level threads that have no
  // file anchor, so they still get a "jump in and reply" experience).
  app.get("/thread/:id", async (req, res) => {
    let threads = _cache?.threads || [];
    if (!_isOffline && _conn) {
      try {
        threads = await getCommentThreads(_conn, _prId);
        if (_cache) { _cache.threads = threads; saveCache(_prId, _cache); }
      } catch { /* use cached threads */ }
    }
    const t = (threads || []).find((x) => x.id === Number(req.params.id));
    if (!t) return res.redirect("/feedback");
    const { map: viewedMap, error: viewedError } = await loadViewedState(_conn, _prId, _isOffline);
    const lastId = (t.comments || []).reduce((m, c) => Math.max(m, c.id || 0), 0);
    const isViewed = viewedMap[String(t.id)] != null && Number(viewedMap[String(t.id)]) === lastId;
    res.type("html").send(buildThreadPage(_pr, t, _drafts.get(t.id), isViewed, viewedError));
  });

  // Route a thread to the right view: a FILE thread opens in the file view,
  // focused on that thread (so it shows in the context of the file, with any
  // staged draft inline); a PR-level thread opens the standalone thread page.
  app.get("/goto/thread/:id", async (req, res) => {
    let threads = _cache?.threads || [];
    if (!_isOffline && _conn) {
      try {
        threads = await getCommentThreads(_conn, _prId);
        if (_cache) { _cache.threads = threads; saveCache(_prId, _cache); }
      } catch { /* use cached threads */ }
    }
    const id = Number(req.params.id);
    const t = (threads || []).find((x) => x.id === id);
    if (!t) return res.redirect("/feedback");
    const filePath = t.threadContext?.filePath || null;
    const idx = filePath ? (_changedFiles || []).findIndex((f) => f.path === filePath) : -1;
    if (idx >= 0) {
      // Focus the thread so the freshly-loaded file page scrolls to it and
      // fills any staged draft on its first control-API poll.
      try { _focus.set(id); } catch { /* best effort */ }
      return res.redirect(`/file/${idx}`);
    }
    return res.redirect(`/thread/${id}`);
  });

  // The Discovery page. Works on any portal that has an ADO connection
  // (PR-bound or browse) so the MCP tools can navigate here.
  app.get("/discovery", async (_req, res) => {
    try {
      // Discovery is the launchpad Home for every page: pick a finished spec to
      // read, a review to pick up, a work item, or a branch. It renders the same
      // whether or not a PR is bound, so the "Home" breadcrumb always lands on
      // the same clickable launchpad (never the legacy PR-list).
      const d = await doListPrs({ role: "queue" });
      const projects = _conn ? await listAdoProjects(_conn) : [ADO_PROJECT];
      const placeholder = branchNamePlaceholder(identityFromAdoToken(_adoToken));
      res.type("html").send(buildHomePage(
        d.prs || [],
        _adoProjectDisplayName || ADO_PROJECT,
        projects,
        placeholder,
        d.error || "",
        _hostKind,
      ));
    }
    catch (e) { res.status(500).send("Error loading Discovery. Check the server console."); console.error("Discovery page error:", e.message); }
  });
  // Backward-compatible alias: the page used to live at /prs. Redirect (keeping
  // the query string) so old links / bookmarks still land on Discovery.
  app.get("/prs", (req, res) => res.redirect(req.originalUrl.replace(/^\/prs/, "/discovery")));

  // Discovery spec read-only view: open a spec found by the spec search at a
  // fixed branch (main), rendered read-only — no edit/comment affordances, no
  // branch selector. Repo is a GUID from the Code Search hit; project/repoName
  // are optional (only for the "open in ADO" link). Relative images are proxied
  // through /spec/media (repo-scoped, main).
  app.get("/spec", async (req, res) => {
    const repoId = String(req.query.repo || "").trim();
    const specPath = String(req.query.path || "").trim();
    const repoName = String(req.query.repoName || "").trim();
    const project = String(req.query.project || ADO_PROJECT).trim();
    const branch = String(req.query.branch || "main").trim().replace(/^refs\/heads\//, "") || "main";
    // Fully-local review: `local` is the clone's absolute path. Content comes from
    // the clone via real git (working tree for the checked-out branch, else
    // `git show`), rendered read-only with the Personal Comments pane. NEVER
    // touches ADO/_conn — local mode is entirely offline.
    const localPath = String(req.query.local || "").trim();
    if (localPath) {
      if (!specPath || !specPath.toLowerCase().endsWith(".md")) return res.redirect("/discovery?tab=branches");
      try {
        const got = await readLocalSpecContent({ path: localPath, branch, filePath: specPath });
        if (!got.ok) return res.status(502).send(got.error || "Could not open the local spec.");
        const { metadata, body } = stripFrontmatter(got.raw);
        const { toc } = buildSourceMap(body);
        const { html, ranges } = await renderSpecBody(body, specSanitizeSchema, { includeHeadings: true });
        const bodyHtml = html.replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/gi, (m, pre, src, post) => {
          if (/^(https?:|data:|\/\/|\/spec\/media)/i.test(src)) return m;
          return pre + `/spec/media?local=${encodeURIComponent(localPath)}&spec=${encodeURIComponent(specPath)}&branch=${encodeURIComponent(branch)}&src=${encodeURIComponent(src)}` + post;
        });
        const title = metadata.title || specPath.split("/").pop();
        const backParam = String(req.query.back || "");
        const safeBack = /^\/[^/]/.test(backParam) ? backParam : "";
        const backHref = safeBack || "/discovery?tab=branches";
        const localRepoKey = await localRepoKeyFor(localPath, branch, specPath);
        const personalComments = (await listPersonalComments({ repo: localRepoKey, branch, path: specPath, rawText: body, sourceMap: ranges })).comments || [];
        const commentCount = personalComments.length;
        _focus.setPcContext({ repo: localRepoKey, branch, path: specPath });
        const pcDataSeq = _focus.get().pcDataSeq;
        return res.type("html").send(buildReadonlySpecPage({ title, bodyHtml, toc, specPath, repo: title, adoUrl: "", backHref, backLabel: "Branch", historyUrl: "", sourceMap: ranges, reviewing: true, editMode: "local", commentCount, reviewRepo: localRepoKey, reviewBranch: branch, reviewPath: specPath, currentUser: "You", personalComments, pcDataSeq }));
      } catch (e) {
        console.error(`/spec local failed for ${specPath}:`, e.message);
        return res.status(502).send("Could not open the local spec. Check the server console.");
      }
    }
    const validRepo = _hostKind === "github"
      ? /^[^/\s]+\/[^/\s]+$/.test(repoId)
      : isValidRepoId(repoId);
    if (!validRepo || !specPath || !specPath.toLowerCase().endsWith(".md")) return res.redirect("/discovery?tab=specs");
    if (_isOffline || !_conn) return res.status(503).send("Cannot open a spec while offline.");
    try {
      const raw = await repoContentProvider(_conn).getText(
        repoId, specPath, branch, project,
      );
      const { metadata, body } = stripFrontmatter(raw);
      const { toc } = buildSourceMap(body);
      const { html, ranges } = await renderSpecBody(body, specSanitizeSchema, { includeHeadings: true });
      const bodyHtml = html.replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/gi, (m, pre, src, post) => {
        if (/^(https?:|data:|\/\/|\/spec\/media)/i.test(src)) return m;
        return pre + `/spec/media?repo=${encodeURIComponent(repoId)}&spec=${encodeURIComponent(specPath)}&branch=${encodeURIComponent(branch)}&src=${encodeURIComponent(src)}` + post;
      });
      const title = metadata.title || specPath.split("/").pop();
      const adoUrl = _hostKind === "github"
        ? `https://github.com/${repoId}/blob/${encodeURIComponent(branch)}/${String(specPath).replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/")}`
        : repoName ? buildSpecWebUrl(ADO_ORG, project, repoName, specPath) : "";
      // Back to the specs tab with the originating search re-run, unless a caller
      // (e.g. the branch page) passes an explicit relative `back` to return to.
      const backParam = String(req.query.back || "");
      const safeBack = /^\/[^/]/.test(backParam) ? backParam : "";
      const backQ = String(req.query.q || "");
      const backHref = safeBack || ("/discovery?tab=specs" + (backQ ? "&q=" + encodeURIComponent(backQ) : "") + (project ? "&project=" + encodeURIComponent(project) : ""));
      // Label the back link for where it actually goes (a branch page vs. Specs).
      const backLabel = safeBack.startsWith("/branch") ? "Branch" : "Specs";
      // File-reviewing mode = opened from a branch: the margin becomes a Reviewer
      // Comments pane and the corner shows the editing-mode badge. `mode` is
      // remote/local, threaded from the branch file link.
      const reviewing = safeBack.startsWith("/branch");
      const modeParam = String(req.query.mode || "");
      const editMode = reviewing && (modeParam === "remote" || modeParam === "local") ? modeParam : null;
      // Personal comments are file/branch scoped; load them + the signed-in user so
      // the page can render existing notes and stamp new ones.
      const personalComments = reviewing ? (await listPersonalComments({ repo: repoId, branch, path: specPath, rawText: body, sourceMap: ranges })).comments || [] : [];
      const me = reviewing ? await getMe() : null;
      const commentCount = personalComments.length;
      // Record which file the open reviewing page shows so param-less MCP tools
      // ("read all comments", "add comment") act on it. The data-seq baseline
      // lets the page ignore its OWN mutations and only re-fetch on external ones.
      if (reviewing) _focus.setPcContext({ repo: repoId, branch, path: specPath });
      const pcDataSeq = _focus.get().pcDataSeq;
      // History is fetched asynchronously by the page (see /spec/history) so the
      // spec paints without waiting on the ADO commit->PR->threads round-trips.
      const historyUrl = _hostKind === "github"
        ? ""
        : "/spec/history?repo=" + encodeURIComponent(repoId) + "&path=" + encodeURIComponent(specPath) + "&branch=" + encodeURIComponent(branch);
      res.type("html").send(buildReadonlySpecPage({ title, bodyHtml, toc, specPath, repo: repoName, adoUrl, backHref, backLabel, historyUrl, sourceMap: ranges, reviewing, editMode, commentCount, reviewRepo: repoId, reviewBranch: branch, reviewPath: specPath, currentUser: me?.displayName || "You", personalComments, pcDataSeq }));
    } catch (e) {
      console.error(`/spec read-only failed for ${specPath}:`, e.message);
      res.status(502).type("html").send(errorPage({ title: "Couldn't open the spec", message: "Check the server console for details.", backHref: "/", backLabel: "Back to files" }));
    }
  });

  // Clickstop 2 (Open file): read-only review of a single, arbitrary .md file by
  // absolute path — no branch, no ADO. Gated by the SAME approved-root containment
  // as local review (a caller path never reads outside an approved root). Reuses
  // the read-only spec page + Personal Comments pane; comments key file:<realpath>.
  app.get("/open-file-view", async (req, res) => {
    const cls = classifyOpenFilePath(req.query.path, { fs, path, isContained });
    if (!cls.ok) return res.status(cls.reason === "outside-root" || cls.reason === "symlink-escape" ? 403 : 400)
      .send(cls.error || "Cannot open that file.");
    const real = cls.realpath;
    try {
      const raw = fs.readFileSync(real, "utf8");
      const { metadata, body } = stripFrontmatter(raw);
      const { toc } = buildSourceMap(body);
      const { html, ranges } = await renderSpecBody(body, specSanitizeSchema, { includeHeadings: true });
      // Relative images resolve against the file's own directory (still inside an
      // approved root); reuse the local media route with the file's dir as `local`.
      const fileDir = path.dirname(real);
      const baseName = path.basename(real);
      const bodyHtml = html.replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/gi, (m, pre, src, post) => {
        if (/^(https?:|data:|\/\/|\/spec\/media)/i.test(src)) return m;
        return pre + `/spec/media?local=${encodeURIComponent(fileDir)}&spec=${encodeURIComponent(baseName)}&branch=&src=${encodeURIComponent(src)}` + post;
      });
      const title = metadata.title || baseName;
      const ctx = fileReviewContext(real);
      const personalComments = (await listPersonalComments({ repo: ctx.repo, branch: ctx.branch, path: ctx.path, rawText: body, sourceMap: ranges })).comments || [];
      const commentCount = personalComments.length;
      _focus.setPcContext({ repo: ctx.repo, branch: ctx.branch, path: ctx.path });
      const pcDataSeq = _focus.get().pcDataSeq;
      return res.type("html").send(buildReadonlySpecPage({
        title, bodyHtml, toc, specPath: real, repo: title, adoUrl: "", backHref: "/discovery?tab=openfile",
        backLabel: "My spec list", historyUrl: "", sourceMap: ranges, reviewing: true, editMode: "local",
        commentCount, reviewRepo: ctx.repo, reviewBranch: ctx.branch, reviewPath: ctx.path,
        currentUser: "You", personalComments, pcDataSeq,
      }));
    } catch (e) {
      console.error(`/open-file-view failed for ${real}:`, e.message);
      return res.status(502).send("Could not open the file. Check the server console.");
    }
  });

  // Clickstop 2 (staged authoring): open a staged (not-yet-pushed) .md file in a
  // lightweight Markdown editor. Content lives in the in-memory staged store until
  // the branch is pushed to ADO. No ADO round-trip.
  app.get("/staged-file", async (req, res) => {
    const repo = String(req.query.repo || "").trim();
    const branch = String(req.query.branch || "").trim().replace(/^refs\/heads\//, "");
    const filePath = String(req.query.path || "").trim();
    const project = String(req.query.project || "").trim();
    const repoName = String(req.query.repoName || "").trim();
    if (!repo || !filePath) return res.redirect("/discovery?tab=branches");
    let file = _inventory.findFile(repo, branch, filePath);
    let kind, hasStagedEdit = false;
    if (file) { kind = file.existing ? "existing" : "staged-new"; hasStagedEdit = true; }
    else {
      if (_isOffline || !_conn) return res.redirect("/discovery?tab=branches");
      let content = null;
      try { content = await getSpecContentAt(_conn, repo, filePath, branch); } catch (e) { content = null; }
      if (content == null) return res.redirect("/discovery?tab=branches");
      kind = "existing"; hasStagedEdit = false;
      let baseObjectId = null;
      try { baseObjectId = await getBranchTip(_conn, normalizeBranchRef(branch), repo, project); } catch { /* save will reject a missing base */ }
      file = { org: ADO_ORG, project, repo, repoName, branch, path: filePath, title: filePath.split("/").pop().replace(/\.md$/i, ""), content, baseObjectId };
    }
    const isStagedBranch = _inventory.snapshot().branches.some((s) => s.repo === file.repo && s.branch === file.branch);
    const backHref = "/branch?project=" + encodeURIComponent(file.project || project || "") + "&repo=" + encodeURIComponent(file.repo) + "&repoName=" + encodeURIComponent(file.repoName || repoName || "") + "&ref=" + encodeURIComponent(file.branch) + (isStagedBranch ? "&staged=1" : "");
    try {
      let remoteContent = "";
      if (kind === "existing" && hasStagedEdit) {
        remoteContent = await getSpecContentAt(_conn, repo, filePath, branch);
        if (remoteContent == null) return res.status(502).send("Could not load the remote file for comparison.");
      }
      const comparison = stagedFileComparison({ content: file.content, existing: kind === "existing", hasStagedEdit, remoteContent });
      const { metadata, body } = stripFrontmatter(comparison.current);
      const { toc } = buildSourceMap(body);
      const { html: specHtml, ranges: sourceMap } = await renderSpecBody(body, specSanitizeSchema, { includeHeadings: true });
      const badgeText = kind === "existing" ? (hasStagedEdit ? "Edited" : "Remote") : "Staged";
      const badge = `<span style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:99px;text-transform:uppercase;letter-spacing:0.4px;background:var(--cp-border);color:var(--cp-text-muted);">${badgeText}</span>`;
      const subtitle = filePath.replace(/^\/+/, "");
      const pr = { title: file.title || filePath.split("/").pop(), createdBy: { displayName: "" }, pullRequestId: null, isDraft: true };
      const pureStaged = comparison.pureStaged;
      const save = { url: pureStaged ? "/api/v1/files/content" : "/api/v1/files/edit", org: file.org || ADO_ORG, project: file.project || project || "", repo: file.repo, repoName: file.repoName || repoName || "", branch: file.branch, path: filePath, baseObjectId: file.baseObjectId || null, pureStaged, hasStagedEdit: comparison.hasStagedEdit, currentMarkdown: comparison.current };
      // Personal Comments (file/branch scoped) — the right pane mirrors the
      // read-only review margin. Load existing notes + the signed-in user, and
      // register this file as the focused PC context for the param-less MCP tools.
      let pcComments = [];
      try { pcComments = (await listPersonalComments({ repo: file.repo, branch: file.branch, path: filePath, rawText: body, sourceMap })).comments || []; } catch { pcComments = []; }
      let pcUser = "You";
      try { const me = await getMe(); if (me && me.displayName) pcUser = me.displayName; } catch { /* offline → "You" */ }
      try { _focus.setPcContext({ repo: file.repo, branch: file.branch, path: filePath }); } catch { /* best-effort */ }
      let pcDataSeq = 0;
      try { pcDataSeq = _focus.get().pcDataSeq || 0; } catch { pcDataSeq = 0; }
      const pc = { repo: file.repo, branch: file.branch, path: filePath, user: pcUser, comments: pcComments, dataSeq: pcDataSeq };
      const ctx = { backHref, backLabel: "Branch", subtitle, badge, save, pc };
      res.type("html").send(buildSpecPage(specHtml, toc, metadata, pr, [], filePath, sourceMap, [{ path: filePath }], 0, comparison.proposed, true, null, {}, null, false, ctx));
    } catch (e) {
      console.error("staged-file render error:", e.message);
      res.status(500).send("Error rendering the file editor.");
    }
  });

  // Fully-local branch page: list a local branch's changed markdown files (vs.
  // its base), read from the clone with real git. No ADO. `path` is the clone's
  // absolute path (from the native picker), `ref` the branch. Display-only for
  // now; opening a file is a later step.
  app.get("/local-branch", async (req, res) => {
    const repoPath = String(req.query.path || "").trim();
    const ref = String(req.query.ref || req.query.branch || "").trim().replace(/^refs\/heads\//, "");
    const backHref = "/discovery?tab=branches";
    const displayName = repoPath ? (repoPath.split(/[\\/]/).filter(Boolean).pop() || repoPath) : "";
    if (!repoPath || !ref) return res.redirect("/discovery?tab=branches");
    try {
      const result = await listLocalBranchOnlyMd({ path: repoPath, branch: ref });
      if (!result.ok) {
        return res.type("html").send(buildBranchPage({ repoName: displayName, project: "", ref, rows: [], backHref, adoUrl: "", error: result.error, mode: "local" }));
      }
      const selfHref = `/local-branch?path=${encodeURIComponent(repoPath)}&ref=${encodeURIComponent(ref)}`;
      const rows = branchFileRows(result.paths, { localPath: repoPath, ref, back: selfHref });
      res.type("html").send(buildBranchPage({ repoName: displayName, project: "", ref, rows, backHref, adoUrl: "", error: null, mode: "local" }));
    } catch (e) {
      console.error(`/local-branch failed for ${repoPath}@${ref}:`, e.message);
      res.type("html").send(buildBranchPage({ repoName: displayName, project: "", ref, rows: [], backHref, adoUrl: "", error: "Could not open the local branch. Check the server console.", mode: "local" }));
    }
  });

  // Discovery branch page: list a branch's UNIQUE markdown files as a read-only
  // review surface (README hidden by default). Each file opens the /spec view
  // pinned to this branch. Reached from a remote branch card (repo=GUID) or a
  // local branch card mapped to its ADO origin (repo=name + project).
  app.get("/branch", async (req, res) => {
    const repoParam = String(req.query.repo || req.query.repoName || "").trim();
    const project = String(req.query.project || ADO_PROJECT).trim();
    const ref = String(req.query.ref || "").trim().replace(/^refs\/heads\//, "");
    if (!repoParam || !ref) return res.redirect("/discovery?tab=branches");
    const backHref = "/discovery?tab=branches";
    // A remote card passes repo=<GUID>; a local card maps to its ADO origin and
    // passes only repoName. That distinction is the editing mode we badge on /spec.
    const editMode = isValidRepoId(String(req.query.repo || "").trim()) ? "remote" : "local";
    const orgBase = ADO_ORG.replace(/\/+$/, "");
    const adoUrlFor = (name) => name ? `${orgBase}/${encodeURIComponent(project)}/_git/${encodeURIComponent(name)}?version=GB${encodeURIComponent(ref)}` : "";
    // A staged (not-yet-pushed) branch has no ADO ref — open the empty file view.
    if (req.query.staged === "1" || _inventory.snapshot().branches.some((s) => s.branch === ref && (s.repo === repoParam || s.repoName === repoParam))) {
      const displayName = String(req.query.repoName || repoParam);
      return res.type("html").send(buildBranchPage({ repoName: displayName, project, ref, rows: [], backHref, adoUrl: "", error: null, mode: editMode, staged: true }));
    }
    try {
      const result = await listBranchFiles({ project, repo: repoParam, ref });
      if (!result.ok) {
        const displayName = String(req.query.repoName || repoParam);
        return res.type("html").send(buildBranchPage({ repoName: displayName, project, ref, rows: [], backHref, adoUrl: adoUrlFor(displayName), error: result.error }));
      }
      const { repoId, repoName } = result;
      // Files link back to this exact branch page (not the Specs tab).
      const selfHref = `/branch?project=${encodeURIComponent(project)}&repo=${encodeURIComponent(repoId)}&repoName=${encodeURIComponent(repoName)}&ref=${encodeURIComponent(ref)}`;
      const ctx = { repoId, repoName, project, ref, back: selfHref, mode: editMode };
      const rows = branchFileRows(result.paths, ctx);
      res.type("html").send(buildBranchPage({ repoName, project, ref, rows, backHref, adoUrl: adoUrlFor(repoName), error: null, mode: editMode }));
    } catch (e) {
      console.error(`/branch failed for ${repoParam}@${ref}:`, e.message);
      const displayName = String(req.query.repoName || repoParam);
      res.type("html").send(buildBranchPage({ repoName: displayName, project, ref, rows: [], backHref, adoUrl: adoUrlFor(displayName), error: "Could not open the branch. Check the server console." }));
    }
  });

  // Async review history for the read-only spec view: returns the pre-rendered
  // thread-card HTML for the margin. Split out from /spec so the page paints fast.
  app.get("/spec/history", async (req, res) => {
    try {
      const repoId = String(req.query.repo || "").trim();
      const specPath = String(req.query.path || "").trim();
      const branch = String(req.query.branch || "main").trim().replace(/^refs\/heads\//, "") || "main";
      const validRepo = _hostKind === "github"
        ? /^[^/\s]+\/[^/\s]+$/.test(repoId)
        : isValidRepoId(repoId);
      if (!validRepo || !specPath) return res.json({ html: "" });
      if (_isOffline || !_conn) return res.json({ html: '<div class="ro-empty">Review history is unavailable offline.</div>' });
      const history = await getFileReviewHistory(_conn, repoId, specPath, branch);
      res.json({ html: buildHistoryCardsHtml(history, specPath) });
    } catch (e) {
      console.error(`/spec/history failed for ${req.query.path}:`, e.message);
      res.json({ html: '<div class="ro-empty">Could not load review history.</div>' });
    }
  });

  // Image proxy for the read-only spec view: resolve a repo-relative image src
  // against the spec's directory and stream the blob from the given repo at main.
  // Repo-scoped by GUID; image-extension gated so it can't read arbitrary files.
  app.get("/spec/media", async (req, res) => {
    try {
      // Fully-local image: resolve relative to the spec and read from the clone's
      // working tree on disk. No ADO.
      const localPath = String(req.query.local || "").trim();
      if (localPath) {
        const cls = classifyLocalMedia(
          { local: localPath, spec: req.query.spec, src: req.query.src },
          { isContained });
        if (!cls.ok) return res.status(404).end();
        let buf;
        try { buf = fs.readFileSync(cls.abs); } catch { return res.status(404).end(); }
        if (!buf || buf.length === 0) return res.status(404).end();
        if (isLfsPointer(buf)) return res.status(502).end();
        // Local working-tree files change while a doc is being reviewed, so they
        // must never be cached (the shared header's max-age would serve stale
        // bytes after an edit). Override to no-store; keep the security headers.
        return res.set("Content-Type", cls.type).set(secureImageHeaders())
                  .set("Cache-Control", "no-store").send(buf);
      }
      const repoId = String(req.query.repo || "").trim();
      const specPath = String(req.query.spec || "").trim();
      const validRepo = _hostKind === "github"
        ? /^[^/\s]+\/[^/\s]+$/.test(repoId)
        : isValidRepoId(repoId);
      if (!validRepo || !specPath) return res.status(404).end();
      const resolved = resolveImagePath(specPath, req.query.src);
      if (!resolved) return res.status(404).end();
      const type = imageContentType(resolved);
      if (!type) return res.status(404).end();
      if (_isOffline || !_conn) return res.status(503).end();
      const branch = String(req.query.branch || "main").trim().replace(/^refs\/heads\//, "") || "main";
      const buf = _hostKind === "github"
        ? await blobProvider(_conn).getBlob(
            resolved, { version: branch }, { repo: repoId },
          )
        : await getSpecBlobAt(_conn, repoId, resolved, branch);
      if (!buf || buf.length === 0) return res.status(404).end();
      if (isLfsPointer(buf)) {
        console.error(`Spec image proxy: LFS pointer not resolved for ${resolved}`);
        return res.status(502).end();
      }
      res.set("Content-Type", type).set(secureImageHeaders()).send(buf);
    } catch (e) {
      console.error("Spec image proxy error:", e.message);
      res.status(404).end();
    }
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
        try {
          raw = await getFileContent(_conn, filePath, contentVersion());
          if (_cache) {
            _cache.fileContents = _cache.fileContents || {};
            _cache.fileContents[filePath] = raw;
            saveCache(_prId, _cache);
          }
        } catch (e) {
          // Content unreadable (e.g. the PR's source branch AND commit are gone).
          // Render a clean placeholder rather than leaking the raw ADO error JSON.
          raw = "# File unavailable\n\nThis file couldn't be loaded from Azure DevOps.\n\n> "
            + String((e && e.message) || e).replace(/\s+/g, " ").trim()
            + "\n\nThe pull request's source branch or commit may no longer exist in the repository.";
        }
      } else {
        return res.status(503).send("File not in cache and running offline.");
      }

      const { metadata, body } = stripFrontmatter(raw);
      const { toc } = buildSourceMap(body);
      const { html: specHtml, ranges: sourceMap } = await renderSpecBody(body, specSanitizeSchema, { rewriteImagesForFileIndex: idx });

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

      const allThreads = applyPendingResolves([...threads, ...pendingThreads]);

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
      const { map: viewedMap, error: viewedError } = await loadViewedState(_conn, _prId, _isOffline);

      // Personal Comments (annotations) — also offered on real PR pages, letting a
      // reviewer keep private notes alongside official PR threads. Best-effort:
      // on failure the sidebar just stays Comments-only (no toggle), same as before.
      // Branch is stored bare (no "refs/heads/" prefix) — same convention as the
      // branch/file-editor and read-only spec routes — so annotations added while
      // reviewing a PR are the SAME notes seen when browsing that branch directly.
      let pcForReview = null;
      try {
        const pcBranch = String(_branch || "").replace(/^refs\/heads\//, "");
        const pcResult = await listPersonalComments({ repo: ADO_REPO, branch: pcBranch, path: filePath, rawText: body, sourceMap });
        const pcComments = pcResult.comments || [];
        let pcUser = "You";
        try { const me = await getMe(); if (me && me.displayName) pcUser = me.displayName; } catch { /* offline → "You" */ }
        try { _focus.setPcContext({ repo: ADO_REPO, branch: pcBranch, path: filePath }); } catch { /* best-effort */ }
        let pcDataSeq = 0;
        try { pcDataSeq = _focus.get().pcDataSeq || 0; } catch { pcDataSeq = 0; }
        pcForReview = { repo: ADO_REPO, branch: pcBranch, path: filePath, user: pcUser, comments: pcComments, dataSeq: pcDataSeq };
      } catch { pcForReview = null; }

      res.type("html").send(buildSpecPage(specHtml, toc, metadata, _pr, allThreads, filePath, sourceMap, _changedFiles, idx, body, canEdit, baseObjectId, viewedMap, viewedError, !!_pr && !_pr.isDraft, null, pcForReview));
    } catch (e) {
      res.status(500).type("html").send(errorPage({ title: "Couldn't render this file", message: "The spec failed to render. Check the server console for details.", backHref: "/", backLabel: "Back to files" }));
      console.error("Spec render error:", e.message);
    }
  });

  // Image proxy: serve an embedded image a spec references with a repo-relative
  // path (e.g. `Images/foo.png`). The spec's rendered `<img src>` is rewritten
  // to this route; here we resolve the path against that file's directory, fetch
  // the blob from ADO with the server-side token (the browser can't — the token
  // isn't in the page and the user's ADO cookies are SameSite), and stream it
  // with the right content-type. Limited to image extensions so it can't be used
  // as a general repo file-read proxy.
  app.get("/file/:index/media", async (req, res) => {
    try {
      const idx = parseInt(req.params.index);
      if (isNaN(idx) || idx < 0 || idx >= _changedFiles.length) return res.status(404).end();
      const specPath = _changedFiles[idx].path;
      const resolved = resolveImagePath(specPath, req.query.src);
      if (!resolved) return res.status(404).end();
      const type = imageContentType(resolved);
      if (!type) return res.status(404).end();
      if (_isOffline || !_conn) return res.status(503).end();
      const buf = await getImageBlob(_conn, resolved, contentVersion());
      if (!buf || buf.length === 0) return res.status(404).end();
      if (isLfsPointer(buf)) {
        // resolveLfs was requested but ADO still returned the pointer — better
        // to fail loudly than stream a text pointer mislabeled as an image.
        console.error(`Image proxy: LFS pointer not resolved for ${resolved}`);
        return res.status(502).end();
      }
      res.set("Content-Type", type)
         // nosniff + sandboxed deny-by-default CSP: defense-in-depth against an
         // attacker-authored blob (esp. a script-capable SVG served top-level).
         // Shared with /spec/media via secureImageHeaders() — the single source
         // of truth so a copy can't silently drop the hardening.
         .set(secureImageHeaders())
         .send(buf);
    } catch (e) {
      console.error("Image proxy error:", e.message);
      res.status(404).end();
    }
  });

  // GitHub-style diff of a staged spec edit for one file. Returns change hunks
  // (rendered "current" + "proposed" HTML, anchored to original line ranges) so
  // the file view can overlay red/green boxes without swapping the whole doc.
  // Registered on the control API (with requireAuth) via the specDiff dep below;
  // this is the closure that does the work.
  async function computeSpecDiff(idx) {
    const files = _changedFiles || [];
    if (!Number.isFinite(idx) || idx < 0 || idx >= files.length) return { hunks: [] };
    const draft = _specDrafts.get(idx);
    if (!draft || !draft.content || draft.source === "user-mirror") return { hunks: [] };
    const filePath = files[idx].path;
    let raw = _cache?.fileContents?.[filePath];
    if (!raw && !_isOffline && _conn) {
      try { raw = await getFileContent(_conn, filePath, contentVersion()); } catch { /* fall through */ }
    }
    if (!raw) return { hunks: [] };
    const { body } = stripFrontmatter(raw);
    const { body: draftBody } = stripFrontmatter(draft.content);
    if (body === draftBody) return { hunks: [] };
    const hunks = await computeSpecDiffHunks(body, draftBody);
    return { hunks, source: draft.source || null, updatedAt: draft.updatedAt || null };
  }

  // Rendered HTML of a file's proposed draft (draft=true) or committed body,
  // for the Original / Current view toggle (item 3). The reading view swaps
  // #spec-content to this HTML.
  async function renderSpecDraft(idx, { draft: wantDraft } = {}) {
    const files = _changedFiles || [];
    if (!Number.isFinite(idx) || idx < 0 || idx >= files.length) return { html: "" };
    const filePath = files[idx].path;
    let content = null;
    if (wantDraft) {
      const d = _specDrafts.get(idx);
      if (d && typeof d.content === "string") content = d.content;
    }
    if (content == null) {
      let raw = _cache?.fileContents?.[filePath];
      if (!raw && !_isOffline && _conn) { try { raw = await getFileContent(_conn, filePath, contentVersion()); } catch {} }
      content = raw || "";
    }
    const { body } = stripFrontmatter(content);
    const { html, ranges } = await renderSpecBody(body, specSanitizeSchema, { rewriteImagesForFileIndex: idx });
    return { html, ranges };
  }

  // Stateless preview of the user's LIVE (uncommitted) editor buffer for the
  // reading views — renders the buffer clean (Proposed) and diffs it against the
  // committed baseline the client sends (Diff). No draft-store side effects, so
  // it never touches the agent's staged proposal; the client colors these hunks
  // as personal edits, distinct from agent edits.
  async function computeSpecPreview(idx, { original = "", proposed = "" } = {}) {
    const { body: propBody } = stripFrontmatter(String(proposed || ""));
    const { body: origBody } = stripFrontmatter(String(original || ""));
    const { html, ranges } = await renderSpecBody(propBody, specSanitizeSchema, { rewriteImagesForFileIndex: idx });
    let hunks = [];
    try { hunks = await computeSpecDiffHunks(origBody, propBody); } catch { hunks = []; }
    return { html, hunks, source: "user", ranges };
  }

  // List PRs to review (item 6). Defaults to the authenticated user's active
  // PRs; widen via query.creator = 'any'. Returns summarized PRs for the /prs
  // page + list_prs tool.
  async function doListPrs(query = {}) {
    if (_isOffline || !_conn) return { prs: [], error: "offline" };
    let currentUserId = null;
    let identityError = null;
    try { currentUserId = (await reviewProvider(_conn).getCurrentUser())?.id || null; }
    catch (e) { identityError = friendlyAdoError(e, "Review queue"); }
    const top = Number.isFinite(query.top) ? query.top : 50;

    // Review queue (Discovery home): specs I'm authoring + specs I'm reviewing,
    // merged and de-duped. ADO PR criteria ANDs creator+reviewer, so the two
    // roles are two separate queries unioned via mergeRolePrs.
    if (query.role === "queue") {
      // Without a resolved identity, "creator = me" silently drops its filter and
      // listOrgPullRequests returns EVERY active PR in the org, all mis-tagged
      // "authoring". Fail closed rather than leak the whole org into the queue.
      if (!currentUserId) return { prs: [], role: "queue", project: ADO_PROJECT, error: identityError || "Could not resolve the signed-in ADO identity." };
      const status = query.status || "active";
      const authoredCrit = buildPrCriteria({ status, creator: "me" }, { currentUserId });
      const reviewingCrit = buildPrCriteria({ status, creator: "any", reviewer: currentUserId }, { currentUserId });
      const [authoredRaw, reviewingRaw] = await Promise.all([
        listOrgPullRequests(_conn, authoredCrit, top),
        currentUserId ? listOrgPullRequests(_conn, reviewingCrit, top) : Promise.resolve([]),
      ]);
      const prs = mergeRolePrs(authoredRaw, reviewingRaw);
      return { prs, role: "queue", project: ADO_PROJECT };
    }

    const crit = buildPrCriteria(query, { currentUserId });
    const raw = _hostKind === "github"
      ? await listOrgPullRequests(_conn, crit, top)
      : await listPullRequests(_conn, crit, top);
    const prs = _hostKind === "github" ? raw : raw.map(summarizePr);
    return { prs, mine: !!crit.creatorId, status: crit.status, project: ADO_PROJECT };
  }

  // Discovery work-item search: run a read-only WIQL query against ADO and
  // return compact rows (id/title/type/state/assignedTo + ADO web url). The UI
  // picks the project; the MCP client passes the freeform WIQL. Read-only: the
  // query is gated to a SELECT before it reaches ADO.
  async function searchWorkItems({ project, wiql } = {}) {
    if (_hostKind === "github") {
      return {
        workItems: [],
        error: "Work-item search is not available for GitHub repositories.",
      };
    }
    if (_isOffline || !_conn) return { workItems: [], error: "offline" };
    if (!isReadOnlyWiql(wiql)) return { workItems: [], error: "WIQL must be a read-only SELECT query." };
    const proj = (project && String(project).trim()) || ADO_PROJECT;
    try {
      const provider = adoWorkItems(_conn);
      const refs = await provider.queryWorkItemRefs(proj, wiql);
      const ids = refs.map((w) => w.id).filter((n) => Number.isFinite(n)).slice(0, 100);
      if (ids.length === 0) return { workItems: [], project: proj, count: 0 };
      const rows = [];
      // ADO getWorkItems caps at 200 ids per call.
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const items = await provider.getWorkItems(proj, chunk, WORK_ITEM_FIELDS);
        for (const it of items || []) {
          rows.push(summarizeWorkItem(it, buildWorkItemUrl(ADO_ORG, proj, it.id)));
        }
      }
      return { workItems: rows, project: proj, count: rows.length };
    } catch (e) {
      const detail = friendlyAdoError(e, "Work-item search");
      console.error("Work-item search failed:", detail);
      return { workItems: [], project: proj, error: detail };
    }
  }

  // Discovery spec search: full-text over specs via ADO Code Search (almssearch).
  // Returns .md hits in Git repos, each carrying its repo so the result opens
  // read-only at main — no repo picker, no branch selector. The UI/MCP client
  // passes freeform text; the project scopes the search. `ext:md` restricts to
  // markdown and results are post-filtered to Git repos (TFVC hits can't be
  // opened via the Git item API).
  async function searchSpecs({ project, query, enrich = false, top } = {}) {
    if (_isOffline || !_conn) return { specs: [], error: "offline" };
    const q = (query == null ? "" : String(query)).trim();
    const proj = (project && String(project).trim()) || ADO_PROJECT;
    if (!q) return { specs: [], project: proj, count: 0 };
    // Page size: the MCP path (no enrichment) takes the full Code Search page and
    // limits itself; the browser UI enriches each hit, so it keeps the page tighter.
    const pageTop = Number.isFinite(top) && top > 0 ? Math.min(top, 1000) : (enrich ? 100 : 1000);
    let result;
    try {
      result = await searchProvider(_conn).searchSpecs(proj, q, pageTop);
    } catch (e) {
      // search_specs relies on ADO Code Search (almsearch.dev.azure.com), a
      // per-org extension. A brand-new org without it provisioned fails here
      // even though Git-based reads (open_branch, open_branch_file) work fine.
      // Surface the true cause + the Code Search hint instead of a generic
      // "check the server console" so the caller (and the model) can act.
      const detail = friendlyAdoError(e, "Spec search");
      console.error("Spec search failed:", detail);
      const message = _hostKind === "github"
        ? detail
        : specSearchUnavailableMessage(detail, ADO_ORG);
      return {
        specs: [],
        project: proj,
        error: message,
      };
    }
    const specs = (result || []).map((hit) => ({
      ...hit,
      name: hit.path.split("/").pop(),
      repo: hit.repoName,
      url: hit.url || (_hostKind === "github"
        ? `https://github.com/${hit.repoId}/blob/${hit.branch || "main"}/${String(hit.path).replace(/^\/+/, "")}`
        : buildSpecWebUrl(
            ADO_ORG, hit.project, hit.repoName, hit.path,
          )),
    }));
    // The MCP path takes the results raw — no cap and no implicit per-file commit
    // lookups. The agent limits result size itself and asks for authorship only if
    // it wants it, so Tippani must not interfere. Only the browser UI enriches each
    // hit with a "Last modified by" (a top-1 commit lookup), run with bounded
    // concurrency so a large result set doesn't fan out unboundedly against ADO.
    if (enrich) {
      const CONCURRENCY = 8;
      const repoContent = repoContentProvider(_conn);
      for (let i = 0; i < specs.length; i += CONCURRENCY) {
        await Promise.all(specs.slice(i, i + CONCURRENCY).map(async (s) => {
          s.lastModifiedBy = await repoContent.getLastCommitAuthor(
            s.repoId, s.path, s.branch, s.project,
          );
        }));
      }
    }
    return { specs, project: proj, count: specs.length };
  }

  // Bulk commit lookup for spec files. Returns the raw commit records (author,
  // committer, date, message, change counts, url) for up to 25 files in one call
  // — everything ADO carries, not just the "last modified by" the UI enriches
  // with. The agent asks for this only when it wants authorship/history; it isn't
  // on any search path. Order-preserving with bounded concurrency.
  async function getFileCommits({ files, top } = {}) {
    if (_isOffline || !_conn) return { files: [], error: "offline" };
    const list = Array.isArray(files) ? files.slice(0, 25) : [];
    if (!list.length) return { files: [], count: 0 };
    const perFile = Number.isFinite(top) && top > 0 ? Math.min(Math.floor(top), 50) : 10;
    const repoContent = repoContentProvider(_conn);
    const out = new Array(list.length);
    const one = async (f) => {
      const repoId = String((f && (f.repo || f.repoId)) || "").trim();
      const filePath = String((f && f.path) || "").trim();
      const branch = (String((f && f.branch) || "main").trim().replace(/^refs\/heads\//, "")) || "main";
      if (!repoId || !filePath) return { repo: repoId, path: filePath, branch, error: "missing repo or path" };
      try {
        const commits = await repoContent.getFileCommits(
          repoId, filePath, branch, perFile,
        );
        return {
          repo: repoId,
          path: filePath,
          branch,
          commits: (commits || []).map((c) => ({
            commitId: c.commitId || null,
            author: c.author ? { name: c.author.name || null, date: c.author.date || null } : null,
            committer: c.committer ? { name: c.committer.name || null, date: c.committer.date || null } : null,
            comment: c.comment || null,
            changeCounts: c.changeCounts || null,
            url: c.remoteUrl || c.url || null,
          })),
        };
      } catch (e) {
        console.error(`Commit lookup failed for ${filePath}:`, friendlyAdoError(e, "Commit lookup"));
        return { repo: repoId, path: filePath, branch, error: "Commit lookup failed. Check the server console." };
      }
    };
    // Bounded concurrency over the (≤25) files, preserving input order.
    let cursor = 0;
    const worker = async () => {
      for (;;) {
        const i = cursor++;
        if (i >= list.length) break;
        out[i] = await one(list[i]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, list.length) }, worker));
    return { files: out, count: out.length };
  }

  // Discovery Branches tab: list the signed-in user's branches across the repos
  // in a project. ADO's getRefs(includeMyBranches=true) returns the caller's
  // own/favorited branches (+ default) per repo; branchesForRepo drops the
  // default and shapes rows. When none remain, fall back to main branches; if
  // no repo has main, return every repo for the New branch picker.
  async function listMyBranches({ project } = {}) {
    if (_isOffline || !_conn) return { branches: [], error: "offline" };
    const proj = (project && String(project).trim()) || ADO_PROJECT;
    const repoContent = repoContentProvider(_conn);
    let repos;
    try {
      repos = await repoContent.listRepositories(proj);
    } catch (e) {
      const error = friendlyAdoError(e, "List repositories");
      console.error("List repositories failed:", error);
      return { branches: [], project: proj, error };
    }
    const list = (repos || []).filter((r) => r && r.id);
    const all = [];
    let cursor = 0;
    const worker = async () => {
      for (;;) {
        const i = cursor++;
        if (i >= list.length) break;
        const repo = list[i];
        try {
          const refs = await repoContent.listBranches(
            repo.id, proj, { includeMyBranches: true },
          );
          for (const row of branchesForRepo(refs, repo, ADO_ORG)) all.push(row);
        } catch (e) {
          console.error(`getRefs failed for ${repo.name}:`, friendlyAdoError(e, "List branches"));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, list.length) }, worker));
    const branches = sortBranches(all);
    if (branches.length) return { branches, project: proj, count: branches.length };

    const mains = [];
    cursor = 0;
    const mainWorker = async () => {
      for (;;) {
        const i = cursor++;
        if (i >= list.length) break;
        const repo = list[i];
        try {
          const refs = await repoContent.listBranches(
            repo.id, proj, { filter: "heads/main" },
          );
          const main = (refs || []).find((ref) => ref && ref.name === "refs/heads/main");
          const row = summarizeBranchRef(main, repo, ADO_ORG);
          if (row) mains.push(row);
        } catch (e) {
          console.error(`main ref lookup failed for ${repo.name}:`, friendlyAdoError(e, "List branches"));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, list.length) }, mainWorker));
    const mainBranches = sortBranches(mains);
    if (mainBranches.length) return { branches: mainBranches, project: proj, count: mainBranches.length };
    return { branches: [], repos: repoOptions(list), project: proj, count: 0 };
  }

  // Personal Comments (read-only spec page, file-reviewing mode): the signed-in
  // user's own notes on a draft file, stored locally per (repo, branch, path).
  // Identity is the ADO authenticated user; content is rendered safely.
  let _me = null;
  async function getMe() {
    if (_me) return _me;
    if (_isOffline || !_conn) return { displayName: "You", id: null };
    try {
      const user = await reviewProvider(_conn).getCurrentUser();
      _me = {
        displayName: user?.displayName || "You",
        uniqueName: user?.uniqueName || null,
        id: user?.id || null,
      };
    } catch { _me = { displayName: "You", uniqueName: null, id: null }; }
    return _me;
  }
  async function _pcWithHtml(comment) {
    const replies = [];
    for (const r of comment.replies || []) replies.push({ ...r, html: await renderMarkdownSafe(r.content || "") });
    return { ...comment, html: await renderMarkdownSafe(comment.content || ""), replies };
  }
  // A bare-file reviewing context (open_local_file, clickstop 2 step 3/4) keys
  // comments by realpath under a "file:" repo scheme and legitimately has NO
  // branch; every other context still needs repo + branch + path. Without this,
  // the one-off local-file comment loop failed over MCP with "Missing repo/branch/path."
  function _pcTargetOk(repo, branch, filePath) {
    if (!repo || !filePath) return false;
    if (!branch && !String(repo).startsWith("file:")) return false;
    return true;
  }
  async function listPersonalComments({ repo, branch, path: filePath, rawText, sourceMap } = {}) {
    if (!_pcTargetOk(repo, branch, filePath)) return { ok: false, error: "Missing repo/branch/path." };
    let list;
    try { list = loadPersonalComments(repo, branch, filePath); }
    catch (e) { return { ok: false, error: `Could not read comments: ${e.code || e.message}` }; }
    // When the caller supplies the current source (a page render), re-resolve
    // each comment's content anchor against it — backfilling a fresh comment's
    // anchor and re-pointing any that drifted when the file was edited — and
    // persist if anything moved so the on-disk line tracks the block.
    if (rawText != null && Array.isArray(sourceMap)) {
      const ra = pcReanchor(list, rawText, sourceMap);
      if (ra.changed) {
        // Re-anchor persistence is derived data (recomputed each render), so a
        // write failure isn't fatal — but it must NOT be swallowed silently
        // (clickstop 2, step 6: the last silent catch, closed). savePersonalComments
        // throws on write failure; surface it and keep serving the in-memory list.
        try { savePersonalComments(repo, branch, filePath, ra.comments); }
        catch (e) { console.warn(`personal-comments: re-anchor persist failed for ${filePath}: ${e && (e.code || e.message)}`); }
      }
      list = ra.comments;
    }
    list = pcSort(list);
    const comments = [];
    for (const c of list) comments.push(await _pcWithHtml(c));
    return { ok: true, comments };
  }
  async function createPersonalComment({ repo, branch, path: filePath, line, editLine, content } = {}) {
    if (!_pcTargetOk(repo, branch, filePath)) return { ok: false, error: "Missing repo/branch/path." };
    const text = String(content == null ? "" : content).trim();
    if (!text) return { ok: false, error: "Empty comment." };
    const me = await getMe();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const c = pcNew({ id, line, editLine, author: me.displayName, content: text, now: new Date().toISOString() });
    try {
      savePersonalComments(repo, branch, filePath, pcAdd(loadPersonalComments(repo, branch, filePath), c));
    } catch (e) {
      return { ok: false, error: `Could not save comment: ${e.code || e.message}` };
    }
    return { ok: true, comment: await _pcWithHtml(c), dataSeq: _focus.bumpPcData() };
  }
  async function editPersonalComment({ repo, branch, path: filePath, id, content } = {}) {
    if (!_pcTargetOk(repo, branch, filePath) || !id) return { ok: false, error: "Missing repo/branch/path/id." };
    try {
      const cur = loadPersonalComments(repo, branch, filePath);
      if (!pcFind(cur, id)) return { ok: false, error: "Not found." };
      // Editing an existing comment to empty is allowed — it saves an empty comment
      // (deletion is an explicit action, not a side effect of clearing the text).
      const text = String(content == null ? "" : content).trim();
      const list = pcUpdate(cur, id, text, new Date().toISOString());
      savePersonalComments(repo, branch, filePath, list);
      return { ok: true, comment: await _pcWithHtml(pcFind(list, id)), dataSeq: _focus.bumpPcData() };
    } catch (e) {
      return { ok: false, error: `Could not edit comment: ${e.code || e.message}` };
    }
  }
  async function deletePersonalComment({ repo, branch, path: filePath, id } = {}) {
    if (!_pcTargetOk(repo, branch, filePath) || !id) return { ok: false, error: "Missing repo/branch/path/id." };
    try {
      savePersonalComments(repo, branch, filePath, pcRemove(loadPersonalComments(repo, branch, filePath), id));
    } catch (e) {
      return { ok: false, error: `Could not delete comment: ${e.code || e.message}` };
    }
    return { ok: true, id, dataSeq: _focus.bumpPcData() };
  }
  async function resolvePersonalComment({ repo, branch, path: filePath, id, resolved } = {}) {
    if (!_pcTargetOk(repo, branch, filePath) || !id) return { ok: false, error: "Missing repo/branch/path/id." };
    try {
      const cur = loadPersonalComments(repo, branch, filePath);
      if (!pcFind(cur, id)) return { ok: false, error: "Not found." };
      const list = pcSetResolved(cur, id, !!resolved, new Date().toISOString());
      savePersonalComments(repo, branch, filePath, list);
      return { ok: true, comment: await _pcWithHtml(pcFind(list, id)), dataSeq: _focus.bumpPcData() };
    } catch (e) {
      return { ok: false, error: `Could not resolve comment: ${e.code || e.message}` };
    }
  }
  // Append a reply (a follow-up note) to a comment — e.g. the assistant recording
  // how it addressed the feedback before resolving.
  async function replyPersonalComment({ repo, branch, path: filePath, id, author, content } = {}) {
    if (!_pcTargetOk(repo, branch, filePath) || !id) return { ok: false, error: "Missing repo/branch/path/id." };
    const text = String(content == null ? "" : content).trim();
    if (!text) return { ok: false, error: "Empty reply." };
    try {
      const cur = loadPersonalComments(repo, branch, filePath);
      if (!pcFind(cur, id)) return { ok: false, error: "Not found." };
      const replyAuthor = author || (await getMe()).displayName;
      const list = pcAddReply(cur, id, { author: replyAuthor, content: text, now: new Date().toISOString() });
      savePersonalComments(repo, branch, filePath, list);
      return { ok: true, comment: await _pcWithHtml(pcFind(list, id)), dataSeq: _focus.bumpPcData() };
    } catch (e) {
      return { ok: false, error: `Could not reply: ${e.code || e.message}` };
    }
  }

  // --- Personal Comments: MCP-facing operations ---------------------------------
  // These default to the file the open reviewing page reported (pcContext) and
  // to the selected comment (pcSelectedId), and push UI commands (focus a
  // comment, hide/show resolved) so MCP actions reflect live in the open page.
  function pcSummary(c) {
    return { id: c.id, line: c.line == null ? null : c.line, anchorState: c.anchorState || "ok", author: c.author, content: c.content, resolved: !!c.resolved, createdAt: c.createdAt, updatedAt: c.updatedAt, replies: (c.replies || []).map((r) => ({ author: r.author, content: r.content, createdAt: r.createdAt })) };
  }
  function pcCtx(args = {}) {
    const cur = _focus.get().pcContext;
    // Nullish (not ||) so an explicit empty-string branch — the correct value
    // for a file:-scheme local file — is preserved rather than coerced to the
    // (possibly null) fallback, which would point reads at the wrong store key.
    return { repo: args.repo ?? cur?.repo, branch: args.branch ?? cur?.branch, path: args.path ?? cur?.path };
  }
  async function mcpReadPersonalComments(args = {}) {
    const { repo, branch, path: filePath } = pcCtx(args);
    if (!_pcTargetOk(repo, branch, filePath)) return { ok: false, error: "No open reviewing file \u2014 open a file first or pass repo/branch/path." };
    let list;
    try { list = pcSort(loadPersonalComments(repo, branch, filePath)); }
    catch (e) { return { ok: false, error: `Could not read comments: ${e.code || e.message}` }; }
    return { ok: true, file: { repo, branch, path: filePath }, selected: _focus.get().pcSelectedId, count: list.length, resolvedCount: list.filter((c) => c.resolved).length, comments: list.map(pcSummary) };
  }
  async function mcpAddPersonalComment(args = {}) {
    const { repo, branch, path: filePath } = pcCtx(args);
    const r = await createPersonalComment({ repo, branch, path: filePath, line: args.line, content: args.content });
    if (!r.ok) return r;
    _focus.setPcSelected(r.comment.id);
    _focus.setPcCommand({ type: "focus", id: r.comment.id });
    return { ok: true, comment: pcSummary(r.comment), file: { repo, branch, path: filePath } };
  }
  async function mcpEditPersonalComment(args = {}) {
    const { repo, branch, path: filePath } = pcCtx(args);
    const id = args.id || _focus.get().pcSelectedId;
    if (!id) return { ok: false, error: "No comment id and none selected." };
    const r = await editPersonalComment({ repo, branch, path: filePath, id, content: args.content });
    return r.ok ? { ok: true, comment: pcSummary(r.comment), file: { repo, branch, path: filePath } } : r;
  }
  async function mcpDeletePersonalComment(args = {}) {
    const { repo, branch, path: filePath } = pcCtx(args);
    const id = args.id || _focus.get().pcSelectedId;
    if (!id) return { ok: false, error: "No comment id and none selected." };
    const r = await deletePersonalComment({ repo, branch, path: filePath, id });
    if (r.ok && _focus.get().pcSelectedId === id) _focus.setPcSelected(null);
    return r.ok ? { ...r, file: { repo, branch, path: filePath } } : r;
  }
  async function mcpResolvePersonalComment(args = {}) {
    const { repo, branch, path: filePath } = pcCtx(args);
    const id = args.id || _focus.get().pcSelectedId;
    if (!id) return { ok: false, error: "No comment id and none selected." };
    if (!_pcTargetOk(repo, branch, filePath)) return { ok: false, error: "No open reviewing file \u2014 open a file first or pass repo/branch/path." };
    // Post the "how it was addressed" note (if any) AND flip resolved in a
    // SINGLE load/apply/save, so the store is written once — previously this ran
    // reply then resolve as two separate load→save cycles (a lost-update race).
    const note = String(args.note == null ? "" : args.note).trim();
    const now = new Date().toISOString();
    try {
      let list = loadPersonalComments(repo, branch, filePath);
      if (!pcFind(list, id)) return { ok: false, error: "Not found." };
      if (note) list = pcAddReply(list, id, { author: args.author || "Assistant", content: note, now });
      list = pcSetResolved(list, id, args.resolved !== false, now);
      savePersonalComments(repo, branch, filePath, list);
      _focus.bumpPcData();
      return { ok: true, comment: pcSummary(pcFind(list, id)), file: { repo, branch, path: filePath } };
    } catch (e) {
      return { ok: false, error: `Could not resolve comment: ${e.code || e.message}` };
    }
  }
  async function mcpReplyPersonalComment(args = {}) {
    const { repo, branch, path: filePath } = pcCtx(args);
    const id = args.id || _focus.get().pcSelectedId;
    if (!id) return { ok: false, error: "No comment id and none selected." };
    const r = await replyPersonalComment({ repo, branch, path: filePath, id, author: args.author || "Assistant", content: args.content });
    if (r.ok) { _focus.setPcSelected(id); _focus.setPcCommand({ type: "focus", id }); return { ok: true, comment: pcSummary(r.comment), file: { repo, branch, path: filePath } }; }
    return r;
  }
  async function mcpDeleteResolvedPersonalComments(args = {}) {
    const { repo, branch, path: filePath } = pcCtx(args);
    if (!_pcTargetOk(repo, branch, filePath)) return { ok: false, error: "No open reviewing file." };
    const cur = loadPersonalComments(repo, branch, filePath);
    const kept = cur.filter((c) => !c.resolved);
    savePersonalComments(repo, branch, filePath, kept);
    _focus.bumpPcData();
    return { ok: true, removed: cur.length - kept.length, remaining: kept.length };
  }
  async function mcpClearPersonalComments(args = {}) {
    const { repo, branch, path: filePath } = pcCtx(args);
    if (!_pcTargetOk(repo, branch, filePath)) return { ok: false, error: "No open reviewing file." };
    const n = loadPersonalComments(repo, branch, filePath).length;
    savePersonalComments(repo, branch, filePath, []);
    _focus.setPcSelected(null);
    _focus.bumpPcData();
    return { ok: true, removed: n };
  }
  async function mcpNavPersonalComment(args = {}) {
    const { repo, branch, path: filePath } = pcCtx(args);
    if (!_pcTargetOk(repo, branch, filePath)) return { ok: false, error: "No open reviewing file." };
    const list = pcSort(loadPersonalComments(repo, branch, filePath));
    if (!list.length) return { ok: false, error: "No comments to navigate." };
    const targetId = pcNavTarget(list, _focus.get().pcSelectedId, args.direction || "next");
    _focus.setPcSelected(targetId);
    _focus.setPcCommand({ type: "focus", id: targetId });
    const c = pcFind(list, targetId);
    return { ok: true, selected: targetId, comment: c ? pcSummary(c) : null };
  }
  async function mcpJumpPersonalComment(args = {}) {
    const { repo, branch, path: filePath } = pcCtx(args);
    if (!_pcTargetOk(repo, branch, filePath)) return { ok: false, error: "No open reviewing file." };
    const list = pcSort(loadPersonalComments(repo, branch, filePath));
    let target = null;
    if (args.id) target = pcFind(list, args.id);
    else if (args.line != null) target = list.find((c) => c.line === Number(args.line)) || null;
    if (!target) return { ok: false, error: "Comment not found." };
    _focus.setPcSelected(target.id);
    _focus.setPcCommand({ type: "focus", id: target.id });
    return { ok: true, selected: target.id, comment: pcSummary(target) };
  }
  async function mcpSetPcResolvedVisibility(args = {}) {
    const show = args.show !== false;
    _focus.setPcCommand({ type: "showResolved", show });
    return { ok: true, showResolved: show };
  }
  // Ask the open reviewing page to reload its file (re-fetch from ADO) so a push
  // made outside Tippani becomes visible — the Copilot-callable remote refresh.
  async function mcpRefreshSpec() {
    _focus.setPcCommand({ type: "reload" });
    return { ok: true };
  }
  // Open the Branches file-list page for a repo+branch in the user's browser.
  // A localPath opens the fully-local branch view (no ADO); otherwise remote.
  async function mcpOpenBranch({ project, repo, branch, localPath } = {}) {
    const b = String(branch || "").replace(/^refs\/heads\//, "").trim();
    const lp = String(localPath || "").trim();
    if (lp) {
      if (!b) return { ok: false, error: "branch required." };
      const p = `/local-branch?path=${encodeURIComponent(lp)}&ref=${encodeURIComponent(b)}`;
      _focus.setNav(p);
      return { ok: true, opened: p };
    }
    const proj = (project && String(project).trim()) || ADO_PROJECT;
    if (!repo || !b) return { ok: false, error: "repo and branch required." };
    const p = `/branch?project=${encodeURIComponent(proj)}&repo=${encodeURIComponent(repo)}&ref=${encodeURIComponent(b)}`;
    _focus.setNav(p);
    return { ok: true, opened: p };
  }
  // Open one spec file read-only in the reviewing view (so the user + the
  // personal-comment tools have a target). A localPath reads from the on-disk
  // clone (mode=local, no ADO); otherwise resolves the ADO repo to its canonical
  // id/name and pins the review context (back=/branch, mode=remote).
  async function mcpOpenBranchFile({ project, repo, repoName, branch, path: filePath, localPath } = {}) {
    const b = String(branch || "").replace(/^refs\/heads\//, "").trim();
    const lp = String(localPath || "").trim();
    if (lp) {
      if (!b || !filePath) return { ok: false, error: "branch and path required." };
      const back = `/local-branch?path=${encodeURIComponent(lp)}&ref=${encodeURIComponent(b)}`;
      const p = buildSpecHref({ localPath: lp, ref: b, path: filePath, back });
      // Set the reviewing context up front (mirrors what the /spec page reports
      // on load) so a follow-up read/resolve/reply works immediately, without
      // waiting for the browser to navigate and report back.
      _focus.setPcContext({ repo: await localRepoKeyFor(lp, b, filePath), branch: b, path: filePath });
      _focus.setPcSelected(null);
      _focus.setNav(p);
      return { ok: true, opened: p, localPath: lp };
    }
    if (_isOffline || !_conn) return { ok: false, error: "offline" };
    const proj = (project && String(project).trim()) || ADO_PROJECT;
    const repoRef = String(repo || repoName || "").trim();
    if (!repoRef || !b || !filePath) return { ok: false, error: "repo, branch and path required." };
    let info;
    try { info = await repoContentProvider(_conn).resolveRepository(repoRef, proj); }
    catch (e) { return { ok: false, error: "Could not find that repository." }; }
    if (!info || !info.id) return { ok: false, error: "Could not find that repository." };
    const back = `/branch?project=${encodeURIComponent(proj)}&repo=${encodeURIComponent(info.id)}&repoName=${encodeURIComponent(info.name)}&ref=${encodeURIComponent(b)}`;
    const p = `/spec?repo=${encodeURIComponent(info.id)}&path=${encodeURIComponent(filePath)}&repoName=${encodeURIComponent(info.name)}&project=${encodeURIComponent(proj)}&branch=${encodeURIComponent(b)}&back=${encodeURIComponent(back)}&mode=remote`;
    _focus.setPcContext({ repo: info.id, branch: b, path: filePath });
    _focus.setPcSelected(null);
    _focus.setNav(p);
    return { ok: true, opened: p, repo: info.id, repoName: info.name };
  }

  // Clickstop 2: open ONE arbitrary .md by absolute path read-only in the
  // reviewing view (so the user + the personal-comment tools have a target).
  // Gated by the SAME approved-root containment as local review; sets the
  // file:<realpath> reviewing context up front so a follow-up comment call
  // resolves immediately, then navigates the portal to /open-file-view.
  async function mcpOpenFile({ path: filePath } = {}) {
    const cls = classifyOpenFilePath(filePath, { fs, path, isContained });
    if (!cls.ok) return { ok: false, error: cls.error, reason: cls.reason };
    const real = cls.realpath;
    const ctx = fileReviewContext(real);
    const p = `/open-file-view?path=${encodeURIComponent(real)}`;
    _focus.setPcContext({ repo: ctx.repo, branch: ctx.branch, path: ctx.path });
    _focus.setPcSelected(null);
    _focus.setNav(p);
    // Return the annotation addressing so the caller can target this file
    // explicitly on the annotation tools (a local file is keyed
    // repo="file:<realpath>", branch="").
    return { ok: true, opened: p, realpath: real, repo: ctx.repo, branch: ctx.branch, path: ctx.path };
  }

  // Discovery branch page: list the markdown files that are UNIQUE to a branch —
  // i.e. the files it changed relative to where it forked from the repo's default
  // branch (not every file in the tree). Diffs default..branch at the common
  // commit via the ADO Git API; row shaping / README classification is pure
  // (branch-files.js). `repo` may be a GUID (remote card) or a name (local card
  // mapped from its ADO origin) — it's resolved to the canonical repo here.
  async function listBranchFiles({ project, repo, ref } = {}) {
    if (_isOffline || !_conn) return { ok: false, error: "offline" };
    const repoRef = String(repo || "").trim();
    if (!repoRef) return { ok: false, error: "Missing repo." };
    const proj = (project && String(project).trim()) || ADO_PROJECT;
    const version = String(ref || "").replace(/^refs\/heads\//, "").trim();
    if (!version) return { ok: false, error: "Missing branch." };
    try {
      const repoContent = repoContentProvider(_conn);
      // Resolve the repo (accepts id or name) to its canonical id/name + default.
      let repoInfo;
      try {
        repoInfo = await repoContent.resolveRepository(repoRef, proj);
      } catch (e) {
        console.error(`getRepository failed for ${repoRef}:`, friendlyAdoError(e, "Resolve repo"));
        return { ok: false, error: "Could not find that repository." };
      }
      if (!repoInfo || !repoInfo.id) return { ok: false, error: "Could not find that repository." };
      const repoId = repoInfo.id;
      const repoName = repoInfo.name || repoRef;
      const base = shortBranchName(repoInfo.defaultBranch || "");
      if (!base || base === version) {
        // No default to diff against (or this IS the default): nothing unique.
        return { ok: true, project: proj, ref: version, repoId, repoName, base, paths: [], count: 0 };
      }
      // diffCommonCommit=true -> compare merge-base(base, branch)..branch, so the
      // result is exactly what the branch changed since it forked.
      const diffs = await repoContent.diffBranches(
        repoId,
        proj,
        { base, target: version, top: 2000 },
      );
      const paths = mdPathsFromChanges(diffs && diffs.changes);
      return { ok: true, project: proj, ref: version, repoId, repoName, base, paths, count: paths.length };
    } catch (e) {
      console.error(`listBranchFiles failed for ${repoRef}@${version}:`, friendlyAdoError(e, "List branch files"));
      return { ok: false, error: "Could not list the branch's files. Check the server console." };
    }
  }

  // Discovery "local repo" tile: validate a local clone path and report its
  // current branch. Also records it as the current local repo so the Branches
  // "Local" tab (and an MCP/CLI caller) can drive off a single path. Pure
  // validation lives in local-repo.js.
  async function openLocalRepo({ path: repoPath } = {}) {
    const v = validateLocalRepo(repoPath);
    if (v.ok) { _localRepoPath = String(repoPath || "").trim(); approveLocalRoot(_localRepoPath); }
    return v;
  }

  // Discovery Branches tab (Local mode): list the branches of a local clone by
  // reading its refs from disk — loose refs under .git/refs/heads plus
  // .git/packed-refs — and flagging the checked-out branch. No `git` shell-out;
  // pure parsing lives in local-repo.js.
  async function listLocalBranches({ path: repoPath } = {}) {
    const resolved = resolveGitDir(repoPath);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    // Listing a clone's branches is the deliberate "open this repo" action, so
    // it approves the root for the subsequent file-content reads (allow-list).
    approveLocalRoot(repoPath);
    const gitDir = resolved.gitDir;
    let headBranch = null;
    try { headBranch = parseGitHead(fs.readFileSync(path.join(gitDir, "HEAD"), "utf8")); } catch { /* detached / unreadable */ }
    // Loose refs: every file under refs/heads is a branch; its path (with '/')
    // is the branch name.
    const loose = [];
    const walk = (dir, prefix) => {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        const name = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) walk(full, name);
        else loose.push(name);
      }
    };
    walk(path.join(gitDir, "refs", "heads"), "");
    // Packed refs (branches git has packed away).
    let packed = [];
    try { packed = parsePackedRefs(fs.readFileSync(path.join(gitDir, "packed-refs"), "utf8")); } catch { /* none */ }
    const all = mergeLocalBranches(loose, packed, headBranch);
    // Only the user's own branches: drop the clone's default (from
    // refs/remotes/origin/HEAD, else main/master).
    let originDefault = null;
    try { originDefault = parseOriginHeadDefault(fs.readFileSync(path.join(gitDir, "refs", "remotes", "origin", "HEAD"), "utf8")); } catch { /* none */ }
    const branches = userCreatedBranches(all, originDefault);
    return { ok: true, path: String(repoPath || "").trim(), branches, count: branches.length, current: headBranch };
  }

  // Open a native OS folder-picker dialog on the user's desktop and return the
  // chosen absolute repo path. The portal runs locally, so the server can show
  // the dialog; the browser folder picker hides the real path, which server-side
  // git needs. Windows-only. Uses the modern Win10/11 IFileOpenDialog (the same
  // dialog Explorer uses) via COM interop, falling back to the classic
  // FolderBrowserDialog if the modern one can't be created. The script is
  // written to a temp .ps1 (avoids shell-escaping the embedded C#).
  async function pickLocalFolder() {
    if (process.platform !== "win32") {
      return { ok: false, error: "The folder picker is Windows-only here." };
    }
    const script = `$ErrorActionPreference = 'Stop'
$path = $null
$modernOk = $false
try {
  $src = @'
using System;
using System.Runtime.InteropServices;
public static class TippaniFolderPicker {
  [ComImport, ClassInterface(ClassInterfaceType.None), Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
  private class FileOpenDialogRCW { }
  [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IFileOpenDialog {
    [PreserveSig] uint Show(IntPtr parent);
    void SetFileTypes(); void SetFileTypeIndex(uint i); void GetFileTypeIndex(out uint i);
    void Advise(); void Unadvise();
    void SetOptions(uint fos); void GetOptions(out uint fos);
    void SetDefaultFolder(IntPtr psi); void SetFolder(IntPtr psi); void GetFolder(out IntPtr ppsi);
    void GetCurrentSelection(out IntPtr ppsi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string n); void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string n);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string t);
    void SetOkButtonLabel(); void SetFileNameLabel();
    void GetResult(out IShellItem ppsi);
    void AddPlace(); void SetDefaultExtension(); void Close(); void SetClientGuid(); void ClearClientData(); void SetFilter();
    void GetResults(); void GetSelectedItems();
  }
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IShellItem {
    void BindToHandler(); void GetParent();
    void GetDisplayName(uint sigdn, [MarshalAs(UnmanagedType.LPWStr)] out string name);
    void GetAttributes(); void Compare();
  }
  public static string Pick() {
    var dlg = (IFileOpenDialog)new FileOpenDialogRCW();
    dlg.SetOptions(0x20u | 0x40u);
    dlg.SetTitle("Select a local git repository");
    uint hr = dlg.Show(IntPtr.Zero);
    if (hr != 0) { return null; }
    IShellItem item; dlg.GetResult(out item);
    string p; item.GetDisplayName(0x80058000u, out p);
    return p;
  }
}
'@
  Add-Type -TypeDefinition $src -Language CSharp | Out-Null
  $path = [TippaniFolderPicker]::Pick()
  $modernOk = $true
} catch {
  $modernOk = $false
}
if (-not $modernOk) {
  try {
    Add-Type -AssemblyName System.Windows.Forms | Out-Null
    $o = New-Object System.Windows.Forms.Form; $o.TopMost = $true; $o.ShowInTaskbar = $false; $o.Opacity = 0; $o.Show()
    $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Select a local git repository'; $d.ShowNewFolderButton = $false
    $r = $d.ShowDialog($o); $o.Close()
    if ($r -eq [System.Windows.Forms.DialogResult]::OK) { $path = $d.SelectedPath }
  } catch { $path = $null }
}
if ($path) { [Console]::Out.Write($path) }
`;
    const tmp = path.join(os.tmpdir(), `tippani-pick-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
    try { fs.writeFileSync(tmp, script, "utf8"); } catch (e) { return { ok: false, error: "Could not stage the folder picker." }; }
    return await new Promise((resolve) => {
      execFile("powershell", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", tmp],
        { windowsHide: true, timeout: 5 * 60 * 1000 }, (err, stdout) => {
          try { fs.unlinkSync(tmp); } catch { /* best effort */ }
          const picked = String(stdout || "").trim();
          if (!picked) return resolve({ ok: false, canceled: true });
          const v = validateLocalRepo(picked);
          if (!v.ok) return resolve({ ok: false, error: "That folder isn't a git repository.", path: picked });
          resolve({ ok: true, path: picked, branch: v.branch });
        });
    });
  }

  // Native OS file-picker dialog: pick a single .md, the SAME mechanism as the
  // folder picker above (modern IFileOpenDialog via COM, classic OpenFileDialog
  // fallback). Returns { ok, path } | { ok:false, canceled }. Validation (exists /
  // .md / readable) happens on Add via classifyAddFile, so no filter is enforced.
  async function pickLocalMdFile() {
    if (process.platform !== "win32") {
      return { ok: false, error: "The file picker is Windows-only here." };
    }
    const script = `$ErrorActionPreference = 'Stop'
$path = $null
$modernOk = $false
try {
  $src = @'
using System;
using System.Runtime.InteropServices;
public static class TippaniFilePicker {
  [ComImport, ClassInterface(ClassInterfaceType.None), Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
  private class FileOpenDialogRCW { }
  [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IFileOpenDialog {
    [PreserveSig] uint Show(IntPtr parent);
    void SetFileTypes(); void SetFileTypeIndex(uint i); void GetFileTypeIndex(out uint i);
    void Advise(); void Unadvise();
    void SetOptions(uint fos); void GetOptions(out uint fos);
    void SetDefaultFolder(IntPtr psi); void SetFolder(IntPtr psi); void GetFolder(out IntPtr ppsi);
    void GetCurrentSelection(out IntPtr ppsi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string n); void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string n);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string t);
    void SetOkButtonLabel(); void SetFileNameLabel();
    void GetResult(out IShellItem ppsi);
    void AddPlace(); void SetDefaultExtension(); void Close(); void SetClientGuid(); void ClearClientData(); void SetFilter();
    void GetResults(); void GetSelectedItems();
  }
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IShellItem {
    void BindToHandler(); void GetParent();
    void GetDisplayName(uint sigdn, [MarshalAs(UnmanagedType.LPWStr)] out string name);
    void GetAttributes(); void Compare();
  }
  public static string Pick() {
    var dlg = (IFileOpenDialog)new FileOpenDialogRCW();
    dlg.SetOptions(0x40u | 0x1000u);
    dlg.SetTitle("Select a Markdown file");
    uint hr = dlg.Show(IntPtr.Zero);
    if (hr != 0) { return null; }
    IShellItem item; dlg.GetResult(out item);
    string p; item.GetDisplayName(0x80058000u, out p);
    return p;
  }
}
'@
  Add-Type -TypeDefinition $src -Language CSharp | Out-Null
  $path = [TippaniFilePicker]::Pick()
  $modernOk = $true
} catch {
  $modernOk = $false
}
if (-not $modernOk) {
  try {
    Add-Type -AssemblyName System.Windows.Forms | Out-Null
    $o = New-Object System.Windows.Forms.Form; $o.TopMost = $true; $o.ShowInTaskbar = $false; $o.Opacity = 0; $o.Show()
    $d = New-Object System.Windows.Forms.OpenFileDialog; $d.Title = 'Select a Markdown file'; $d.Filter = 'Markdown (*.md)|*.md|All files (*.*)|*.*'; $d.Multiselect = $false
    $r = $d.ShowDialog($o); $o.Close()
    if ($r -eq [System.Windows.Forms.DialogResult]::OK) { $path = $d.FileName }
  } catch { $path = $null }
}
if ($path) { [Console]::Out.Write($path) }
`;
    const tmp = path.join(os.tmpdir(), `tippani-pickmd-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
    try { fs.writeFileSync(tmp, script, "utf8"); } catch (e) { return { ok: false, error: "Could not stage the file picker." }; }
    return await new Promise((resolve) => {
      execFile("powershell", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", tmp],
        { windowsHide: true, timeout: 5 * 60 * 1000 }, (err, stdout) => {
          try { fs.unlinkSync(tmp); } catch { /* best effort */ }
          const picked = String(stdout || "").trim();
          if (!picked) return resolve({ ok: false, canceled: true });
          resolve({ ok: true, path: picked });
        });
    });
  }

  // A local-only git runner: invokes the system git in the clone's directory.
  // Read-only subcommands only (symbolic-ref, rev-parse, diff), no network.
  function runGit(repoPath) {
    return (args) => new Promise((resolve) => {
      // A 15s timeout so a wedged git (network prompt, lock contention) can't
      // hang the request forever — the picker shell already sets one; this path
      // didn't. A killed/timed-out process surfaces as a non-zero code.
      execFile("git", ["-C", repoPath, ...args], { maxBuffer: 64 * 1024 * 1024, windowsHide: true, timeout: 15000 },
        (err, stdout, stderr) => resolve({
          code: err ? (err.code ?? 1) : 0,
          stdout: stdout || "",
          stderr: (stderr || "") + (err && err.killed ? " [git timed out]" : ""),
        }));
    });
  }

  // A STABLE personal-comments repo id for a local clone: its origin URL
  // (survives moving/renaming the clone), falling back to the realpath'd clone
  // path when there's no origin. Migrates any notes stored under the old
  // absolute-path key for this (branch,file) to the stable key, so re-keying
  // never orphans existing notes. Returns the id to pass as `repo`.
  async function localRepoKeyFor(localPath, branch, filePath) {
    const raw = String(localPath || "").trim();
    let id = null;
    try {
      const r = await runGit(raw)(["config", "--get", "remote.origin.url"]);
      if (r.code === 0 && r.stdout.trim()) {
        id = "localorigin:" + r.stdout.trim().replace(/\.git$/i, "").replace(/[/\\]+$/, "").toLowerCase();
      }
    } catch { /* fall through to a path-based id */ }
    let real = raw;
    try { real = fs.realpathSync(raw); } catch { /* keep raw */ }
    if (!id) id = "local:" + real;
    // Lazy per-file migration from the legacy raw-path / realpath keys.
    if (branch != null && filePath != null) {
      for (const legacy of new Set(["local:" + raw, "local:" + real])) {
        try { pcStoreMigrate(PERSONAL_COMMENTS_DIR, legacy, id, branch, filePath); } catch { /* best-effort */ }
      }
    }
    return id;
  }

  // Resolve the base revision to diff a branch against: the clone's origin
  // default (refs/remotes/origin/HEAD) first, then main/master/develop/trunk
  // (local or origin/). baseCandidates() owns the ordering and rejects
  // leading-`-` names; it no longer dead-ends when the default is develop/trunk.
  async function resolveLocalBase(run) {
    let originDefault = "";
    const sr = await run(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
    if (sr.code === 0 && sr.stdout.trim()) originDefault = sr.stdout.trim();
    for (const c of baseCandidates(originDefault)) {
      const v = await run(["rev-parse", "--verify", "--quiet", `${c}^{commit}`]);
      if (v.code === 0 && v.stdout.trim()) return c;
    }
    return null;
  }

  // The markdown files a local branch changed vs. its base, using the real git
  // in the clone (git diff base...branch). Correct on any repo layout — packs,
  // multi-pack-index, cruft packs, deltas. No ADO. Returns
  // { ok, path, branch, base, paths, count } or { ok:false, error }.
  async function listLocalBranchOnlyMd({ path: repoPath, branch } = {}) {
    const br = String(branch || "").trim();
    if (!br || br.startsWith("-")) return { ok: false, error: "Invalid branch name." };
    const v = validateLocalRepo(repoPath);
    if (!v.ok) return { ok: false, error: v.error };
    if (!isApprovedRoot(repoPath)) return { ok: false, error: "Repo not approved for local review \u2014 open it in Tippani (the Repo box) first." };
    const run = runGit(String(repoPath).trim());
    const base = await resolveLocalBase(run);
    if (!base) return { ok: false, error: "Could not resolve a base branch (main/master) in this clone." };
    const r = await run(["diff", "--name-only", "--diff-filter=ACMR", `${base}...${br}`, "--"]);
    if (r.code !== 0) return { ok: false, error: "Could not diff the branch. Check the server console." };
    const seen = new Set();
    const paths = [];
    for (const raw of r.stdout.split(/\r?\n/)) {
      const p = raw.trim();
      if (!p || !p.toLowerCase().endsWith(".md")) continue;
      if (seen.has(p)) continue;
      seen.add(p);
      paths.push(p);
    }
    return { ok: true, path: String(repoPath).trim(), branch: br, base, paths, count: paths.length };
  }

  // Read a spec's content from the local clone — working tree for the checked-out
  // branch (so uncommitted edits are reviewed), else `git show <branch>:<file>`.
  // Real git; no ADO. Returns { ok, raw, isCurrent } or { ok:false, error }.
  async function readLocalSpecContent({ path: repoPath, branch, filePath } = {}) {
    const br = String(branch || "").trim();
    const fp = String(filePath || "").trim().replace(/^\/+/, "");
    if (!br || br.startsWith("-")) return { ok: false, error: "Invalid branch." };
    if (!fp || fp.startsWith("-") || fp.includes("\0") || /(^|[\\/])\.\.([\\/]|$)/.test(fp)) return { ok: false, error: "Invalid file path." };
    const v = validateLocalRepo(repoPath);
    if (!v.ok) return { ok: false, error: v.error };
    if (!isApprovedRoot(repoPath)) return { ok: false, error: "Repo not approved for local review \u2014 open it in Tippani (the Repo box) first." };
    const cleanRepo = String(repoPath).trim();
    const run = runGit(cleanRepo);
    const cur = await run(["rev-parse", "--abbrev-ref", "HEAD"]);
    const isCurrent = cur.code === 0 && cur.stdout.trim() === br;
    if (isCurrent) {
      // Symlink-safe: resolve the path and prove it stays inside the clone
      // (an in-repo symlink pointing outside must not leak arbitrary files).
      const safe = safeLocalPath(cleanRepo, fp);
      if (!safe) return { ok: false, error: "Invalid file path." };
      try { return { ok: true, raw: fs.readFileSync(safe, "utf8"), isCurrent: true }; }
      catch { return { ok: false, error: "Could not read the file from disk." }; }
    }
    const show = await run(["show", `${br}:${fp}`]);
    if (show.code !== 0) return { ok: false, error: "Could not read the file from the branch." };
    return { ok: true, raw: show.stdout, isCurrent: false };
  }

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

  // Shared reply/resolve helpers — wraps the inflight guard + pending-queue
  // bookkeeping so both /api/reply (legacy) and /api/v1/threads/:id/reply
  // (control API) share one path.
  async function doReply(threadId, content) {
    const tid = Number(threadId);
    if (Number.isFinite(tid) && !_inflight.acquire(tid)) {
      return { ok: false, status: 409, body: { error: "another reply is already in flight for this thread" } };
    }
    const action = addPending(_prId, { type: 'reply', threadId, content });
    if (!_isOffline && _conn) {
      try {
        await replyToThread(_conn, _prId, threadId, content);
        action.synced = true;
        const pending = loadPending(_prId);
        const i = pending.findIndex(p => p.id === action.id);
        if (i >= 0) pending[i].synced = true;
        savePending(_prId, pending);
        if (Number.isFinite(tid)) { _drafts.delete(tid); _inflight.release(tid); }
        return { ok: true, status: 200, body: { ok: true, synced: true } };
      } catch {
        if (Number.isFinite(tid)) _inflight.release(tid);
        return { ok: true, status: 200, body: { ok: true, synced: false, queued: true } };
      }
    }
    if (Number.isFinite(tid)) { _drafts.delete(tid); _inflight.release(tid); }
    return { ok: true, status: 200, body: { ok: true, synced: false, queued: true } };
  }
  async function doResolve(threadId) {
    const action = addPending(_prId, { type: 'resolve', threadId });
    if (!_isOffline && _conn) {
      try {
        await resolveThread(_conn, _prId, threadId);
        action.synced = true;
        const pending = loadPending(_prId);
        const i = pending.findIndex(p => p.id === action.id);
        if (i >= 0) pending[i].synced = true;
        savePending(_prId, pending);
        return { ok: true, status: 200, body: { ok: true, synced: true } };
      } catch {
        return { ok: true, status: 200, body: { ok: true, synced: false, queued: true } };
      }
    }
    return { ok: true, status: 200, body: { ok: true, synced: false, queued: true } };
  }

  // Queue a resolve locally (pending) WITHOUT pushing to ADO. Finalize's sync
  // pushes it via the existing type:'resolve' handler. Mirrors stage_draft.
  function doStageResolve(threadId) {
    addPending(_prId, { type: 'resolve', threadId });
    return { ok: true, status: 200, body: { ok: true, staged: true, synced: false } };
  }
  // Thread ids with an unsynced pending resolve (staged, not yet pushed).
  function pendingResolvedIds() {
    const set = new Set();
    try {
      for (const p of loadPending(_prId)) {
        if (p.type === 'resolve' && !p.synced) set.add(Number(p.threadId));
      }
    } catch { /* best effort */ }
    return set;
  }
  // Overlay staged resolves onto a thread list so the portal shows them as
  // resolved (pending) before Finalize pushes them.
  function applyPendingResolves(threads) {
    const ids = pendingResolvedIds();
    if (!ids.size) return threads || [];
    return (threads || []).map((t) => ids.has(Number(t.id)) ? { ...t, status: 2, pendingResolve: true } : t);
  }
  // Requires a live provider. ADO persists shared PR properties; GitHub uses
  // private durable local state (no public timeline comment/notification).
  async function doSetViewed(threadId, commentId) {
    if (_isOffline || !_conn) {
      return { ok: false, status: 503, body: { error: "offline: viewed state needs a live provider" } };
    }
    try {
      // Strict read: if the read fails, updateViewed propagates and NO write
      // happens, so a transient failure can't erase other threads' markers.
      const viewedCommentId = commentId == null ? null : String(commentId);
      await updateViewed({
        read: () => readViewedMap(_conn, _prId),
        write: (map) => setViewedMap(_conn, _prId, map),
        threadId,
        commentId,
      });
      return { ok: true, status: 200, body: { ok: true, viewedCommentId } };
    } catch (e) {
      return { ok: false, status: 502, body: { error: friendlyAdoError(e, "mark viewed") } };
    }
  }


  // Commit an explicit spec version to the PR source branch, then clear any
  // staged draft for that file. Commit is ALWAYS explicit: the caller passes the
  // exact content to commit. The staged draft is review-only (drives the diff
  // overlay and seeds the editor); it is never committed implicitly, so a stale
  // proposal can't silently overwrite the user's saved edits.
  async function doCommitSpec(fileIndex, content, message) {
    const files = _changedFiles || [];
    const idx = Number(fileIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx >= files.length) {
      return { ok: false, status: 404, body: { error: "file index out of range" } };
    }
    const filePath = files[idx].path;
    if (typeof content !== "string") {
      return { ok: false, status: 400, body: { error: "commit_spec requires explicit content (the staged draft is review-only)" } };
    }
    // Re-attach the original YAML frontmatter (stripped from the editor buffer)
    // so committing an edited spec never drops it (data loss on Learn docs).
    const bodyContent = reattachFrontmatter(_cache?.fileContents?.[filePath], content);
    const commitMessage = (message && String(message).trim()) || `tippani: update ${filePath.split("/").pop()}`;
    if (_isOffline || !_conn) {
      addPending(_prId, { type: "save", filePath, content: bodyContent, message: commitMessage });
      _specDrafts.delete(idx);
      return { ok: true, status: 200, body: { ok: true, synced: false, queued: true } };
    }
    try {
      const commitId = await pushFileToBranch(_conn, _branch, filePath, bodyContent, commitMessage);
      if (_cache && _cache.fileContents) { _cache.fileContents[filePath] = bodyContent; saveCache(_prId, _cache); }
      _specDrafts.delete(idx);
      _specLocks.release(idx);
      return { ok: true, status: 200, body: { ok: true, synced: true, commitId } };
    } catch (e) {
      if (isConflict(e)) {
        return { ok: false, status: 409, body: { conflict: true, error: "branch moved; reload before committing" } };
      }
      return { ok: false, status: 502, body: { error: friendlyAdoError(e, "commit spec") } };
    }
  }

  app.post("/api/reply", async (req, res) => {
    const r = await doReply(req.body.threadId, req.body.content);
    res.status(r.status).json(r.body);
  });

  app.post("/api/resolve", async (req, res) => {
    const r = await doResolve(req.body.threadId);
    res.status(r.status).json(r.body);
  });

  // Save an edited spec: commit the markdown to the PR source branch (#48).
  app.post("/api/save", async (req, res) => {
    const { filePath, content, message, baseObjectId } = req.body || {};
    if (typeof content !== "string" || !filePath) {
      return res.status(400).json({ ok: false, error: "filePath and content are required" });
    }
    const commitMessage = (message && String(message).trim()) || `tippani: update ${filePath.split("/").pop()}`;
    // Re-attach the original YAML frontmatter (stripped from the editor buffer)
    // so saving an edited spec never drops it (data loss on Learn docs). Done
    // before queuing so the offline queue carries the full content too.
    const fullContent = reattachFrontmatter(_cache?.fileContents?.[filePath], content);
    // Queue first so a failure/offline never loses the edit.
    const action = addPending(_prId, { type: "save", filePath, content: fullContent, message: commitMessage });

    if (_isOffline || !_conn) {
      return res.json({ ok: true, synced: false, queued: true, message: "Saved locally (offline) — will push on sync." });
    }
    try {
      // Pass the load-time tip as oldObjectId (#49) — ADO rejects the push if the
      // branch moved underneath the editor (optimistic concurrency).
      const commitId = await pushFileToBranch(_conn, _branch, filePath, fullContent, commitMessage, baseObjectId || undefined);
      const pending = loadPending(_prId);
      const idx = pending.findIndex((p) => p.id === action.id);
      if (idx >= 0) pending[idx].synced = true;
      savePending(_prId, pending);
      // Refresh the local cache so a reload shows the saved content.
      if (_cache && _cache.fileContents) {
        _cache.fileContents[filePath] = fullContent;
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

  // Approve / Request changes. This is a WRITE to ADO and is deliberately not
  // queued offline: a stale vote synced later could approve a PR whose content
  // has since moved on. Orchestration (validate -> precheck -> vote) lives in
  // handleReviewRequest (review-vote.js) so it's testable with a fake ADO
  // connection — this route is just the HTTP<->function adapter.
  app.post("/api/review", async (req, res) => {
    const { status, body } = await handleReviewRequest({
      type: req.body && req.body.type,
      isOffline: _isOffline,
      hasConn: !!_conn,
      prId: _prId,
      conn: _conn,
      submitVote: submitReviewVote,
      formatError: friendlyAdoError,
    });
    res.status(status).json(body);
  });

  // Sync pending actions to ADO
  async function syncPendingChanges({ includeDrafts = false } = {}) {
    if (_isOffline || !_conn) {
      return { ok: false, synced: 0, failed: 0, message: "Cannot sync in offline mode" };
    }
    const pending = loadPending(_prId);
    const unsynced = pending.filter(p => !p.synced);
    let synced = 0, failed = 0;
    const errors = [];

    if (includeDrafts) {
      for (const [threadId, draft] of Object.entries(_drafts.list())) {
        try {
          await replyToThread(_conn, _prId, Number(threadId), draft.content);
          _drafts.delete(Number(threadId));
          synced++;
        } catch (e) {
          failed++;
          errors.push({ threadId: Number(threadId), type: "reply", error: e.message });
        }
      }
      for (const [fileIndex, draft] of Object.entries(_specDrafts.list())) {
        const result = await doCommitSpec(Number(fileIndex), draft.content);
        if (result.ok && result.body?.synced) {
          synced++;
        } else {
          failed++;
          errors.push({ fileIndex: Number(fileIndex), type: "save", error: result.body?.error || "spec edit did not sync" });
        }
      }
    }

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

    return { ok: failed === 0, synced, failed, total: unsynced.length, errors };
  }

  async function pushAllStagedChanges() {
    const review = await syncPendingChanges({ includeDrafts: true });
    const authoring = await pushStagedBranches();
    const publishes = await publishStagedPrs();
    return { ok: review.ok && authoring.ok && publishes.ok, review, publishes, ...authoring };
  }

  app.post("/api/sync", async (_req, res) => {
    res.json(await syncPendingChanges());
  });

  // Get pending count for status bar
  app.get("/api/pending", (_req, res) => {
    const pending = loadPending(_prId);
    const unsynced = pending.filter(p => !p.synced);
    res.json({ count: unsynced.length, isOffline: _isOffline });
  });

  // ----- Control API (#42 Phase 1) ---------------------------------------
  // Routes live in src/control-api.js so they're mountable in tests without
  // bootstrapping the full ADO flow. Token is generated above; external
  // clients send `Authorization: Bearer <token>` + `X-Tippani-Client: <name>`
  // for mutations, just `X-Tippani-Client` for reads.
  registerControlApi(app, {
    clientAuth: localClientAuth,
    setAdoToken: applyAdoToken,
    focus: _focus,
    drafts: _drafts,
    locks: _locks,
    getThreads: () => _cache?.threads || [],
    getChangedFiles: () => _changedFiles || [],
    getTriage: async () => {
      const threads = applyPendingResolves((_cache?.threads || []).filter((t) => (t.comments?.length || 0) > 0));
      const viewedMap = (!_isOffline && _conn) ? await getViewedMap(_conn, _prId) : {};
      const author = _pr?.createdBy?.displayName || "";
      const items = threads.map((t) => {
        const { resolved, waiting, lastBy } = classifyThread(t, author, viewedMap);
        const file = t.threadContext?.filePath || null;
        const line = t.threadContext?.rightFileStart?.line || null;
        const anchor = file ? `${file.split("/").pop()}${line ? ":" + line : ""}` : "PR-level";
        const last = (t.comments || [])[t.comments.length - 1];
        const gist = stripMarkdown((last?.content || "").replace(/\s+/g, " ")).slice(0, 160);
        return { id: t.id, anchor, waiting, resolved, lastBy, gist };
      });
      const counts = { total: items.length, needsYou: 0, awaitingReviewer: 0, viewed: 0, fyi: 0, resolved: 0 };
      for (const it of items) {
        if (it.waiting === "you") counts.needsYou++;
        else if (it.waiting === "reviewer") counts.awaitingReviewer++;
        else if (it.waiting === "viewed") counts.viewed++;
        else if (it.waiting === "fyi") counts.fyi++;
        else if (it.waiting === "resolved") counts.resolved++;
      }
      return { counts, threads: items };
    },
    readFileMarkdown: async (filePath) => {
      if (_cache?.fileContents?.[filePath]) return _cache.fileContents[filePath];
      if (!_isOffline && _conn) {
        const md = await getFileContent(_conn, filePath, contentVersion());
        _cache.fileContents = _cache.fileContents || {};
        _cache.fileContents[filePath] = md;
        return md;
      }
      return "";
    },
    postReply: doReply,
    resolveThread: doResolve,
    stageResolve: doStageResolve,
    setViewed: doSetViewed,
    specDrafts: _specDrafts,
    specLocks: _specLocks,
    commitSpec: doCommitSpec,
    specDiff: computeSpecDiff,
    specPreview: computeSpecPreview,
    renderDraft: renderSpecDraft,
    listPrs: doListPrs,
    searchWorkItems,
    searchSpecs,
    getFileCommits,
    listMyBranches,
    openLocalRepo,
    listLocalBranches,
    pickLocalFolder,
    pickLocalMdFile,
    resolveOpenFile: ({ path: p } = {}) => classifyOpenFilePath(p, { fs, path, isContained }),
    // Clickstop 2 (Custom list): shape the durable file list into tiles, and
    // add/remove entries. Add validates a readable .md (no containment gate — the
    // add IS the approval); the file's folder then becomes an approved root via
    // the custom-roots union, so opening it (and the open_file MCP tool) passes.
    customFilesList: () => buildReadingList({ entries: _customFiles.list(), readmePath: README_PATH, fs, path }),
    customFileAdd: ({ path: p } = {}) => {
      const cls = classifyAddFile(p, { fs, path });
      if (!cls.ok) return cls;
      _customFiles.add(cls.realpath);
      return {
        ok: true,
        files: buildReadingList({ entries: _customFiles.list(), readmePath: README_PATH, fs, path }),
      };
    },
    customFileRemove: ({ path: p } = {}) => {
      const target = String(p || "").trim();
      // The pinned user manual can never be removed.
      if (isPinnedManual(target, { readmePath: README_PATH, fs, path })) {
        return {
          ok: false,
          error: "The user manual is pinned and cannot be removed.",
          files: buildReadingList({ entries: _customFiles.list(), readmePath: README_PATH, fs, path }),
        };
      }
      _customFiles.remove(target);
      return {
        ok: true,
        files: buildReadingList({ entries: _customFiles.list(), readmePath: README_PATH, fs, path }),
      };
    },
    remoteSpecDrafts: _remoteSpecDrafts,
    remoteSpecLocks: _remoteSpecLocks,
    pushRemoteSpec,
    openPr,
    mcpCreateBranch,
    stageBranch,
    listStagedBranches,
    pushStagedBranches: pushAllStagedChanges,
    stageSpecPr,
    unstageBranch,
    unstageSpecPr,
    stagePrPublish,
    unstagePrPublish,
    stageFile,
    unstageFile,
    updateStagedFileContent,
    listBranchFolders,
    createStagedFolder,
    deleteStagedFolder,
    renameStagedFolder,
    renderMarkdown,
    saveExistingEdit,
    listPersonalComments,
    createPersonalComment,
    editPersonalComment,
    deletePersonalComment,
    resolvePersonalComment,
    replyPersonalComment,
    mcpReadPersonalComments,
    mcpAddPersonalComment,
    mcpEditPersonalComment,
    mcpDeletePersonalComment,
    mcpResolvePersonalComment,
    mcpReplyPersonalComment,
    mcpDeleteResolvedPersonalComments,
    mcpClearPersonalComments,
    mcpNavPersonalComment,
    mcpJumpPersonalComment,
    mcpSetPcResolvedVisibility,
    mcpRefreshSpec,
    mcpOpenBranch,
    mcpOpenBranchFile,
    mcpOpenFile,
  });

  const server = app.listen(PORT, "127.0.0.1", () => {
    const base = `http://localhost:${PORT}`;
    // Persist the session token ONLY after we own the port, so an instance
    // that fails to bind (EADDRINUSE) never deletes the running server's
    // token on exit. 0600 perms; overwritten on each successful startup.
    // Per-PORT filename: a shared path would be clobbered by a second portal
    // and unlink'd out from under a still-running one under the multi-portal
    // model. The MCP shim discovers tokens via the per-port registry, not this
    // file; this file is the external-client affordance.
    try {
      fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
      const tokenPath = path.join(CONFIG_DIR, `session-token-${PORT}`);
      const persistAppSession = (session) => {
        const registered = writeInstance({
          port: PORT,
          prId: _prId,
          provider: _hostKind,
          owner: _githubOwner,
          repo: _githubRepo,
          token: session.token,
          tokenExpiresAt: session.expiresAt,
          clientName: externalClientName,
          pid: process.pid,
          url: base,
          shimPid: Number(process.env.TIPPANI_SHIM_PID) || null,
        });
        if (!registered) throw new Error("could not update the portal registry");
        fs.writeFileSync(tokenPath, session.token + "\n", { mode: 0o600 });
      };
      persistAppSession(appBearer);
      const rotation = createAppSessionRotation({
        session: appBearer,
        createSession: () =>
          localClientAuth.createBearerSession({ clientName: externalClientName }),
        revokeSession: (token) => localClientAuth.revokeBearerSession(token),
        persist: persistAppSession,
        onWarn: (message) => console.warn(`  Warning: ${message}`),
      });
      const rotationTimer = setInterval(() => rotation.rotateIfDue(), ROTATION_INTERVAL_MS);
      rotationTimer.unref?.();
      const cleanup = () => {
        clearInterval(rotationTimer);
        rotation.revokeCurrent();
        try { fs.unlinkSync(tokenPath); } catch {}
        removeInstance(PORT);
      };
      process.on("exit", cleanup);
      process.on("SIGINT", () => { cleanup(); process.exit(0); });
      process.on("SIGTERM", () => { cleanup(); process.exit(0); });
      // Spawned by the shim over an IPC pipe (stdio ipc). When the shim dies for
      // ANY reason, the OS closes the pipe and this fires — so a portal never
      // outlives the shim that owns it. No timer, no polling.
      if (process.channel) {
        process.on("disconnect", () => { cleanup(); process.exit(0); });
      }
    } catch (e) {
      console.warn(`  Warning: could not persist session token: ${e.message}`);
    }
    console.log(`\n  Tippani running at ${base}`);
    console.log(`  App session file: ${path.join(CONFIG_DIR, `session-token-${PORT}`)}`);
    console.log(`  External client name: ${externalClientName}\n`);
    if (!headless) {
      const bootstrap = localClientAuth.createBrowserBootstrap({
        returnTo: openIndex !== null ? `/file/${openIndex}` : "/",
      });
      open(bootstrap.url);
    }
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
