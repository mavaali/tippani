// Phase 1 control API (#42) — Express route registration extracted from
// src/index.js so the routes can be mounted in tests without bootstrapping
// the full ADO connection / file watcher / browser flow.
//
// Dependencies are injected so callers can supply real ADO-backed accessors
// in production and in-memory fakes in tests.

import { applyEdits, SpecEditError } from "./spec-edit.js";

export function registerControlApi(app, deps) {
  const {
    port,
    sessionToken,
    setAdoToken,        // (token) => bool — swap the live ADO bearer (Coforce token push, optional)
    focus,
    drafts,
    locks,
    getThreads,         // () => Array<thread>
    getChangedFiles,    // () => Array<{path, changeType}>
    getTriage,          // async () => {counts, threads} (optional)
    readFileMarkdown,   // async (filePath) => string
    postReply,          // async (threadId, content) => {ok, status, body}
    resolveThread: doResolveDep, // async (threadId) => {ok, status, body}
    stageResolve,       // (threadId) => {ok, status, body} — queue a resolve, no push (optional)
    setViewed,          // async (threadId, commentId|null) => {ok, status, body}
    specDrafts,         // draft store keyed by fileIndex (optional)
    specLocks,          // lock store keyed by fileIndex (optional)
    commitSpec,         // async (fileIndex, content, message) => {ok, status, body}
    specDiff,           // async (fileIndex) => {hunks, source?, updatedAt?} (optional)
    renderDraft,        // async (fileIndex, {draft}) => {html} (optional) — item 3 Current view
    listPrs,            // async (query) => {prs, ...} (optional) — item 6 list PRs
    searchWorkItems,    // async ({project, wiql}) => {workItems, ...} (optional) — Discovery WIQL search
    searchSpecs,        // async ({project, query}) => {specs, ...} (optional) — Discovery spec full-text search
    getFileCommits,     // async ({files, top}) => {files:[{repo,path,branch,commits}]} (optional) — bulk commit info
    listMyBranches,     // async ({project}) => {branches, ...} (optional) — Discovery Branches tab
    openLocalRepo,      // async ({path}) => {ok, path, branch} (optional) — Discovery local-repo tile
    listLocalBranches,  // async ({path}) => {ok, path, branches} (optional) — Discovery Branches tab (Local)
    pickLocalFolder,    // async () => {ok, path, branch} | {canceled} (optional) — native folder dialog
    resolveOpenFile,    // ({path}) => {ok, realpath} | {ok:false, reason, error} (optional) — clickstop 2 Open file
    listPersonalComments,   // async ({repo, branch, path}) => {ok, comments} (optional) — Personal Comments
    createPersonalComment,  // async ({repo, branch, path, line, content}) => {ok, comment} (optional)
    editPersonalComment,    // async ({repo, branch, path, id, content}) => {ok, comment|deleted} (optional)
    deletePersonalComment,  // async ({repo, branch, path, id}) => {ok, id} (optional)
    resolvePersonalComment, // async ({repo, branch, path, id, resolved}) => {ok, comment} (optional)
    mcpReadPersonalComments, mcpAddPersonalComment, mcpEditPersonalComment, mcpDeletePersonalComment,
    mcpResolvePersonalComment, mcpReplyPersonalComment, mcpDeleteResolvedPersonalComments, mcpClearPersonalComments,
    mcpNavPersonalComment, mcpJumpPersonalComment, mcpSetPcResolvedVisibility, // MCP personal-comment ops
    mcpRefreshSpec, mcpOpenBranch, mcpOpenBranchFile, // MCP: refresh + open review surface
  } = deps;

  const ALLOWED_ORIGINS = new Set([
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
  ]);

  // Same-origin means the request's Origin (or Referer) resolves to EXACTLY one
  // of this portal's origins. Compare parsed origins, never string prefixes: a
  // `startsWith` check let `http://localhost:${port}0` (a different port),
  // `http://localhost:${port}.evil.com`, and `http://localhost:${port}@evil.com`
  // all pass — and same-origin skips the session-token requirement on mutations.
  function isSameOrigin(req) {
    const header = req.headers.origin || req.headers.referer || "";
    if (!header) return false;
    let origin;
    try {
      origin = new URL(header).origin;
    } catch {
      return false;
    }
    return ALLOWED_ORIGINS.has(origin);
  }

  function requireAuth(opts = { mutation: false }) {
    return (req, res, next) => {
      const sameOrigin = isSameOrigin(req);
      if (!sameOrigin && !req.headers["x-tippani-client"]) {
        return res.status(403).json({ error: "missing X-Tippani-Client header" });
      }
      if (opts.mutation && !sameOrigin) {
        const auth = req.headers.authorization || "";
        const m = auth.match(/^Bearer\s+(.+)$/);
        if (!m || m[1] !== sessionToken) {
          return res.status(401).json({ error: "invalid or missing session token" });
        }
      }
      next();
    };
  }

  function summarizeThread(t) {
    return {
      id: t.id,
      status: t.status,
      resolved: t.status === 2 || t.status === 4,
      file: t.threadContext?.filePath || null,
      line: t.threadContext?.rightFileStart?.line || null,
      count: (t.comments || []).length,
      lastUpdated: t.lastUpdatedDate || null,
      hasDraft: !!drafts.get(t.id),
    };
  }
  function fullThread(t) {
    return {
      ...summarizeThread(t),
      comments: (t.comments || []).map((c) => ({
        id: c.id,
        author: c.author?.displayName || null,
        publishedDate: c.publishedDate || null,
        content: c.content || "",
      })),
      draft: drafts.get(t.id),
    };
  }
  function findThread(id) {
    const tid = Number(id);
    if (!Number.isFinite(tid)) return null;
    return (getThreads() || []).find((t) => t.id === tid) || null;
  }

  // Validate a spec file index against the PR's changed-file list.
  function validSpecIndex(raw) {
    const files = getChangedFiles() || [];
    const idx = parseInt(raw);
    if (!Number.isFinite(idx) || idx < 0 || idx >= files.length) return null;
    return idx;
  }

  app.get("/api/v1/threads", requireAuth(), (_req, res) => {
    const all = (getThreads() || []).filter((t) => t.comments?.length > 0);
    res.json({ threads: all.map(summarizeThread), focus: focus.get() });
  });

  app.get("/api/v1/triage", requireAuth(), async (_req, res) => {
    if (typeof getTriage !== "function") {
      return res.status(501).json({ error: "triage not wired in this deployment" });
    }
    try {
      res.json(await getTriage());
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.get("/api/v1/threads/:id", requireAuth(), (req, res) => {
    const t = findThread(req.params.id);
    if (!t) return res.status(404).json({ error: "thread not found" });
    res.json(fullThread(t));
  });

  app.put("/api/v1/threads/:id/draft", requireAuth({ mutation: true }), (req, res) => {
    const t = findThread(req.params.id);
    if (!t) return res.status(404).json({ error: "thread not found" });
    if (locks.isLocked(t.id)) {
      return res.status(409).json({ error: "user is editing this thread", retryAfterMs: 10_000 });
    }
    const { content, source } = req.body || {};
    if (typeof content !== "string") {
      return res.status(400).json({ error: "content (string) required" });
    }
    const d = drafts.put(t.id, content, { source: source || "external" });
    res.json({ ok: true, threadId: t.id, draft: d, version: focus.get().version });
  });

  app.delete("/api/v1/threads/:id/draft", requireAuth({ mutation: true }), (req, res) => {
    const t = findThread(req.params.id);
    if (!t) return res.status(404).json({ error: "thread not found" });
    const had = drafts.delete(t.id);
    res.json({ ok: true, removed: had, version: focus.get().version });
  });

  app.post("/api/v1/threads/:id/lock", requireAuth({ mutation: true }), (req, res) => {
    const t = findThread(req.params.id);
    if (!t) return res.status(404).json({ error: "thread not found" });
    const exp = locks.touch(t.id);
    res.json({ ok: true, threadId: t.id, expiresAt: exp });
  });

  app.post("/api/v1/commands/focus", requireAuth({ mutation: true }), (req, res) => {
    const { threadId } = req.body || {};
    if (threadId !== null && !Number.isFinite(Number(threadId))) {
      return res.status(400).json({ error: "threadId (number|null) required" });
    }
    if (threadId !== null) {
      const t = findThread(threadId);
      if (!t) return res.status(404).json({ error: "thread not found" });
    }
    const next = focus.set(threadId);
    res.json({ ok: true, focus: next });
  });

  // POST /api/v1/nav { path } — single-tab navigation. Records a navigation
  // target the browser's open tab should move to (the client poll reads navUrl
  // + navSeq from /api/v1/state and does window.location = navUrl once per bump).
  // Separate-tabs mode never calls this; it opens a fresh browser tab instead.
  app.post("/api/v1/nav", requireAuth({ mutation: true }), (req, res) => {
    const { path } = req.body || {};
    if (typeof path !== "string" || !path) {
      return res.status(400).json({ error: "path (non-empty string) required" });
    }
    // Must be a same-origin ABSOLUTE PATH ("/…"). Reject absolute URLs, a
    // protocol-relative "//host", schemes like javascript:, and backslash paths
    // (browsers fold "\" to "/"). The client watcher also refuses to navigate
    // off-origin, but reject at this seam too so a hostile nav value never
    // reaches the one open tab.
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
      return res.status(400).json({ error: "path must be a same-origin absolute path (starts with a single /)" });
    }
    const nav = focus.setNav(path);
    res.json({ ok: true, nav });
  });

  // POST /api/v1/commands/view { view } — set the spec view (original|diff|current)
  // the browser should switch to (item 3). Server-side so the agent drives it and
  // it survives a reload; the browser never auto-flips on a stage.
  app.post("/api/v1/commands/view", requireAuth({ mutation: true }), (req, res) => {
    const { view } = req.body || {};
    try { res.json({ ok: true, view: focus.setView(view) }); }
    catch (e) { res.status(400).json({ error: String(e?.message || e) }); }
  });

  // POST /api/v1/commands/filter { filter } — set (or clear with null) the
  // feedback-page filter the browser should apply (item 5).
  app.post("/api/v1/commands/filter", requireAuth({ mutation: true }), (req, res) => {
    const { filter } = req.body || {};
    try { res.json({ ok: true, filter: focus.setFilter(filter ?? null) }); }
    catch (e) { res.status(400).json({ error: String(e?.message || e) }); }
  });

  // POST /api/v1/ado-token { token } — Coforce pushes a freshly-minted ADO
  // bearer here before the old one expires, so a long-lived portal never makes
  // ADO calls with a stale token. Swaps the connection in place. The token is
  // never echoed back.
  app.post("/api/v1/ado-token", requireAuth({ mutation: true }), (req, res) => {
    const { token } = req.body || {};
    if (typeof token !== "string" || !token) {
      return res.status(400).json({ error: "token (non-empty string) required" });
    }
    if (typeof setAdoToken !== "function") {
      return res.status(501).json({ error: "ado-token swap not wired in this deployment" });
    }
    const ok = setAdoToken(token);
    if (!ok) return res.status(400).json({ error: "token rejected" });
    res.json({ ok: true });
  });

  app.get("/api/v1/specs/:fileIndex", requireAuth(), async (req, res) => {
    const files = getChangedFiles() || [];
    const idx = parseInt(req.params.fileIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx >= files.length) {
      return res.status(404).json({ error: "file index out of range" });
    }
    const file = files[idx];
    let markdown = "";
    try {
      markdown = await readFileMarkdown(file.path);
    } catch (e) {
      return res.status(502).json({ error: "failed to read file: " + (e?.message || e) });
    }
    const sections = [];
    const lines = (markdown || "").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (m) sections.push({ level: m[1].length, text: m[2], line: i + 1 });
    }
    res.json({
      fileIndex: idx,
      path: file.path,
      changeType: file.changeType || null,
      markdown,
      sections,
    });
  });

  // ----- Spec-edit drafts (agent proposes a file edit; user reviews/edits
  // in the portal before committing) --------------------------------------
  // GitHub-style diff of a staged spec edit for one file: rendered change hunks
  // anchored to original line ranges. requireAuth() keeps it consistent with the
  // rest of the control API (the CSRF middleware early-returns for /api/v1/*, so
  // without this a local process could read the staged draft with no headers).
  app.get("/api/v1/specs/:fileIndex/diff", requireAuth(), async (req, res) => {
    if (typeof specDiff !== "function") return res.status(501).json({ error: "spec diff not wired" });
    const idx = validSpecIndex(req.params.fileIndex);
    if (idx === null) return res.json({ hunks: [] });
    try {
      res.json(await specDiff(idx));
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.get("/api/v1/specs/:fileIndex/draft", requireAuth(), (req, res) => {
    const idx = validSpecIndex(req.params.fileIndex);
    if (idx === null) return res.status(404).json({ error: "file index out of range" });
    const d = specDrafts ? specDrafts.get(idx) : null;
    res.json({ fileIndex: idx, draft: d });
  });

  // Rendered HTML of a file's proposed (draft=1) or committed body (item 3
  // Current view). The reading view swaps #spec-content to this HTML.
  app.get("/api/v1/specs/:fileIndex/render", requireAuth(), async (req, res) => {
    if (typeof renderDraft !== "function") return res.status(501).json({ error: "render not wired" });
    const idx = validSpecIndex(req.params.fileIndex);
    if (idx === null) return res.status(404).json({ error: "file index out of range" });
    try { res.json(await renderDraft(idx, { draft: req.query.draft === "1" })); }
    catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
  });

  app.put("/api/v1/specs/:fileIndex/draft", requireAuth({ mutation: true }), (req, res) => {
    if (!specDrafts) return res.status(501).json({ error: "spec drafts not wired" });
    const idx = validSpecIndex(req.params.fileIndex);
    if (idx === null) return res.status(404).json({ error: "file index out of range" });
    const { content, source } = req.body || {};
    // The user's own mirror writes (source 'user-mirror') bypass the lock —
    // the lock exists to block an external agent while the user is editing.
    if (specLocks && specLocks.isLocked(idx) && source !== "user-mirror") {
      return res.status(409).json({ error: "user is editing this file", retryAfterMs: 10_000 });
    }
    if (typeof content !== "string") {
      return res.status(400).json({ error: "content (string) required" });
    }
    const d = specDrafts.put(idx, content, { source: source || "external" });
    res.json({ ok: true, fileIndex: idx, draft: d, version: focus.get().version });
  });

  app.delete("/api/v1/specs/:fileIndex/draft", requireAuth({ mutation: true }), (req, res) => {
    if (!specDrafts) return res.status(501).json({ error: "spec drafts not wired" });
    const idx = validSpecIndex(req.params.fileIndex);
    if (idx === null) return res.status(404).json({ error: "file index out of range" });
    const had = specDrafts.delete(idx);
    res.json({ ok: true, removed: had, version: focus.get().version });
  });

  app.post("/api/v1/specs/:fileIndex/lock", requireAuth({ mutation: true }), (req, res) => {
    if (!specLocks) return res.status(501).json({ error: "spec locks not wired" });
    const idx = validSpecIndex(req.params.fileIndex);
    if (idx === null) return res.status(404).json({ error: "file index out of range" });
    const exp = specLocks.touch(idx);
    res.json({ ok: true, fileIndex: idx, expiresAt: exp });
  });

  // Surgical anchored edits (#edit_spec): apply edits to the current snapshot
  // (the staged draft if present, else the committed body) and STAGE the result
  // as a review-only draft. Never commits. HONORS THE EDIT LOCK: while the user
  // holds the file open in edit mode (the 3s heartbeat), staging is blocked with a
  // 409 so the agent never overwrites the proposal under review. The agent should
  // report and wait rather than retry. Merging the agent's edits onto the user's
  // saved text is a possible future improvement.
  app.post("/api/v1/specs/:fileIndex/edit", requireAuth({ mutation: true }), async (req, res) => {
    if (!specDrafts) return res.status(501).json({ error: "spec drafts not wired" });
    const idx = validSpecIndex(req.params.fileIndex);
    if (idx === null) return res.status(404).json({ error: "file index out of range" });
    if (specLocks && specLocks.isLocked(idx)) {
      return res.status(409).json({ error: "user is editing this file", code: "locked", retryAfterMs: 10_000 });
    }
    const { edits, source } = req.body || {};
    const existing = specDrafts.get(idx);
    let base;
    if (existing && typeof existing.content === "string") {
      base = existing.content;
    } else {
      try { base = await readFileMarkdown((getChangedFiles() || [])[idx].path); }
      catch (e) { return res.status(502).json({ error: "failed to read file: " + (e?.message || e) }); }
    }
    try {
      const { content, applied, replacements } = applyEdits(base, edits);
      const d = specDrafts.put(idx, content, { source: source || "external" });
      res.json({ ok: true, fileIndex: idx, applied, replacements, draft: d, version: focus.get().version });
    } catch (e) {
      if (e instanceof SpecEditError) {
        return res.status(422).json({ error: e.message, code: e.code, editIndex: e.editIndex });
      }
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.post("/api/v1/specs/:fileIndex/commit", requireAuth({ mutation: true }), async (req, res) => {
    if (typeof commitSpec !== "function") return res.status(501).json({ error: "commit not wired" });
    const idx = validSpecIndex(req.params.fileIndex);
    if (idx === null) return res.status(404).json({ error: "file index out of range" });
    const { content, message } = req.body || {};
    const r = await commitSpec(idx, content, message);
    res.status(r.status).json(r.body);
  });

  // GET /api/v1/prs — list pull requests to review (item 6). Query: status,
  // creator ('me' default / 'any'), reviewer, target, top. Defaults to the
  // authenticated user's active PRs.
  app.get("/api/v1/prs", requireAuth(), async (req, res) => {
    if (typeof listPrs !== "function") return res.status(501).json({ error: "list PRs not wired" });
    try {
      const q = {
        status: req.query.status,
        creator: req.query.creator,
        reviewer: req.query.reviewer,
        target: req.query.target,
        top: req.query.top ? parseInt(req.query.top, 10) : undefined,
      };
      res.json(await listPrs(q));
    } catch (e) {
      res.status(502).json({ error: String(e?.message || e) });
    }
  });

  // Discovery work-item search: POST a freeform WIQL (+ optional project); the
  // portal runs it against ADO read-only and returns compact rows. POST because
  // the WIQL is a body; same-origin (browser) or bearer (MCP) authorized.
  app.post("/api/v1/workitems/search", requireAuth({ mutation: true }), async (req, res) => {
    if (typeof searchWorkItems !== "function") return res.status(501).json({ error: "work-item search not wired" });
    try {
      const { wiql, project } = req.body || {};
      res.json(await searchWorkItems({ wiql, project }));
    } catch (e) {
      res.status(502).json({ error: String(e?.message || e) });
    }
  });

  // Discovery spec search: POST freeform text (+ optional project); the portal
  // runs a full-text ADO Code Search and returns .md hits (repo + path) that
  // open read-only at main. POST because the query is a body; same-origin
  // (browser) or bearer (MCP) authorized.
  app.post("/api/v1/specs/search", requireAuth({ mutation: true }), async (req, res) => {
    if (typeof searchSpecs !== "function") return res.status(501).json({ error: "spec search not wired" });
    try {
      const { query, project, enrich, top } = req.body || {};
      res.json(await searchSpecs({ query, project, enrich, top }));
    } catch (e) {
      res.status(502).json({ error: String(e?.message || e) });
    }
  });

  // Bulk commit info for spec files (max 25). Returns full commit records for
  // each file — everything ADO carries, not just a "last modified by". POST body
  // { files:[{repo,path,branch?}], top? }; same-origin (browser) or bearer (MCP).
  app.post("/api/v1/commits/info", requireAuth({ mutation: true }), async (req, res) => {
    if (typeof getFileCommits !== "function") return res.status(501).json({ error: "commit info not wired" });
    try {
      const { files, top } = req.body || {};
      res.json(await getFileCommits({ files, top }));
    } catch (e) {
      res.status(502).json({ error: String(e?.message || e) });
    }
  });

  // Discovery Branches tab: POST { project } -> the signed-in user's branches
  // across that project's repos. same-origin (browser) or bearer (MCP).
  app.post("/api/v1/branches", requireAuth({ mutation: true }), async (req, res) => {
    if (typeof listMyBranches !== "function") return res.status(501).json({ error: "branch listing not wired" });
    try {
      const { project } = req.body || {};
      res.json(await listMyBranches({ project }));
    } catch (e) {
      res.status(502).json({ error: String(e?.message || e) });
    }
  });

  // Discovery local-repo tile: POST { path } -> validate a local clone and
  // report its current branch. same-origin (browser) or bearer (MCP).
  app.post("/api/v1/local-repo", requireAuth({ mutation: true }), async (req, res) => {
    if (typeof openLocalRepo !== "function") return res.status(501).json({ error: "local repo not wired" });
    try {
      const { path: repoPath } = req.body || {};
      res.json(await openLocalRepo({ path: repoPath }));
    } catch (e) {
      res.status(502).json({ error: String(e?.message || e) });
    }
  });

  // Discovery Branches tab (Local mode): POST { path } -> the local clone's
  // branches (loose + packed refs), current flagged. same-origin or bearer.
  app.post("/api/v1/local-branches", requireAuth({ mutation: true }), async (req, res) => {
    if (typeof listLocalBranches !== "function") return res.status(501).json({ error: "local branches not wired" });
    try {
      const { path: repoPath } = req.body || {};
      res.json(await listLocalBranches({ path: repoPath }));
    } catch (e) {
      res.status(502).json({ error: String(e?.message || e) });
    }
  });

  // Discovery Branches tab (Local mode): POST -> pop a native OS folder dialog
  // on the user's desktop and return the chosen local repo path (server-side git
  // needs a real path; the browser picker hides it). same-origin or bearer.
  app.post("/api/v1/local-pick", requireAuth({ mutation: true }), async (_req, res) => {
    if (typeof pickLocalFolder !== "function") return res.status(501).json({ error: "folder picker not wired" });
    try {
      res.json(await pickLocalFolder());
    } catch (e) {
      res.status(502).json({ error: String(e?.message || e) });
    }
  });

  // Clickstop 2 (Open file tab): resolve a caller-typed path to a one-off .md.
  // Returns the classification { ok, realpath } or { ok:false, reason, error } so
  // the box renders a clickable card or an inline error. resolveOpenFile enforces
  // the approved-root containment (a path is never read outside an approved root).
  // same-origin (browser) or bearer (MCP). Missing handler -> 501.
  app.post("/api/v1/open-file", requireAuth({ mutation: true }), async (req, res) => {
    if (typeof resolveOpenFile !== "function") return res.status(501).json({ error: "open file not wired" });
    try {
      const { path: filePath } = req.body || {};
      res.json(await resolveOpenFile({ path: filePath }));
    } catch (e) {
      res.status(502).json({ error: String(e?.message || e) });
    }
  });

  // Personal Comments (read-only spec page, file-reviewing mode): a spec author's
  // own notes on a draft file, scoped to (repo, branch, path). GET reads; POST
  // creates; PUT edits (empty content deletes); DELETE removes. same-origin
  // (browser) or bearer (MCP). Missing handlers -> 501.
  app.get("/api/v1/personal-comments", requireAuth(), async (req, res) => {
    if (typeof listPersonalComments !== "function") return res.status(501).json({ error: "personal comments not wired" });
    try {
      const { repo, branch, path: filePath } = req.query || {};
      res.json(await listPersonalComments({ repo, branch, path: filePath }));
    } catch (e) {
      res.status(502).json({ error: String(e?.message || e) });
    }
  });

  app.post("/api/v1/personal-comments", requireAuth({ mutation: true }), async (req, res) => {
    if (typeof createPersonalComment !== "function") return res.status(501).json({ error: "personal comments not wired" });
    try {
      const { repo, branch, path: filePath, line, content } = req.body || {};
      const result = await createPersonalComment({ repo, branch, path: filePath, line, content });
      res.status(result.ok ? 200 : 400).json(result);
    } catch (e) {
      res.status(502).json({ error: String(e?.message || e) });
    }
  });

  app.put("/api/v1/personal-comments/:id", requireAuth({ mutation: true }), async (req, res) => {
    if (typeof editPersonalComment !== "function") return res.status(501).json({ error: "personal comments not wired" });
    try {
      const { repo, branch, path: filePath, content } = req.body || {};
      const result = await editPersonalComment({ repo, branch, path: filePath, id: String(req.params.id), content });
      res.status(result.ok ? 200 : 400).json(result);
    } catch (e) {
      res.status(502).json({ error: String(e?.message || e) });
    }
  });

  app.delete("/api/v1/personal-comments/:id", requireAuth({ mutation: true }), async (req, res) => {
    if (typeof deletePersonalComment !== "function") return res.status(501).json({ error: "personal comments not wired" });
    try {
      const src = { ...(req.query || {}), ...(req.body || {}) };
      const result = await deletePersonalComment({ repo: src.repo, branch: src.branch, path: src.path, id: String(req.params.id) });
      res.status(result.ok ? 200 : 400).json(result);
    } catch (e) {
      res.status(502).json({ error: String(e?.message || e) });
    }
  });

  // The browser reports which comment card is selected (focused) so MCP
  // "edit/delete selected" act on the user's choice. same-origin (browser).
  app.post("/api/v1/personal-comments/select", requireAuth({ mutation: true }), (req, res) => {
    focus.setPcSelected((req.body || {}).id);
    res.json({ ok: true });
  });

  // MCP-facing personal-comment operations: default to the open reviewing file +
  // selected comment and push UI commands so actions reflect live in the page.
  // Registered BEFORE the parameterized "/:id/resolve" route so "/mcp/resolve"
  // isn't captured as id="mcp".
  const mcpAc = (fn, label) => async (req, res) => {
    if (typeof fn !== "function") return res.status(501).json({ error: label + " not wired" });
    try {
      const src = req.method === "GET" ? (req.query || {}) : (req.body || {});
      const result = await fn(src);
      res.status(result && result.ok === false ? 400 : 200).json(result);
    } catch (e) {
      res.status(502).json({ error: String(e?.message || e) });
    }
  };
  app.get("/api/v1/personal-comments/all", requireAuth(), mcpAc(mcpReadPersonalComments, "read personal comments"));
  app.post("/api/v1/personal-comments/mcp/add", requireAuth({ mutation: true }), mcpAc(mcpAddPersonalComment, "add personal comment"));
  app.post("/api/v1/personal-comments/mcp/edit", requireAuth({ mutation: true }), mcpAc(mcpEditPersonalComment, "edit personal comment"));
  app.post("/api/v1/personal-comments/mcp/delete", requireAuth({ mutation: true }), mcpAc(mcpDeletePersonalComment, "delete personal comment"));
  app.post("/api/v1/personal-comments/mcp/resolve", requireAuth({ mutation: true }), mcpAc(mcpResolvePersonalComment, "resolve personal comment"));
  app.post("/api/v1/personal-comments/mcp/reply", requireAuth({ mutation: true }), mcpAc(mcpReplyPersonalComment, "reply to personal comment"));
  app.post("/api/v1/personal-comments/mcp/delete-resolved", requireAuth({ mutation: true }), mcpAc(mcpDeleteResolvedPersonalComments, "delete resolved personal comments"));
  app.post("/api/v1/personal-comments/mcp/clear", requireAuth({ mutation: true }), mcpAc(mcpClearPersonalComments, "clear personal comments"));
  app.post("/api/v1/personal-comments/mcp/nav", requireAuth({ mutation: true }), mcpAc(mcpNavPersonalComment, "navigate personal comments"));
  app.post("/api/v1/personal-comments/mcp/jump", requireAuth({ mutation: true }), mcpAc(mcpJumpPersonalComment, "jump to personal comment"));
  app.post("/api/v1/personal-comments/mcp/show-resolved", requireAuth({ mutation: true }), mcpAc(mcpSetPcResolvedVisibility, "show/hide resolved personal comments"));

  // Reviewing surface: refresh the open file (remote push -> visible) and open a
  // branch / spec file for review from MCP.
  app.post("/api/v1/spec/refresh", requireAuth({ mutation: true }), mcpAc(mcpRefreshSpec, "refresh spec"));
  app.post("/api/v1/spec/open-branch", requireAuth({ mutation: true }), mcpAc(mcpOpenBranch, "open branch"));
  app.post("/api/v1/spec/open-branch-file", requireAuth({ mutation: true }), mcpAc(mcpOpenBranchFile, "open branch file"));

  app.post("/api/v1/personal-comments/:id/resolve", requireAuth({ mutation: true }), async (req, res) => {
    if (typeof resolvePersonalComment !== "function") return res.status(501).json({ error: "personal comments not wired" });
    try {
      const { repo, branch, path: filePath, resolved } = req.body || {};
      const result = await resolvePersonalComment({ repo, branch, path: filePath, id: String(req.params.id), resolved });
      res.status(result.ok ? 200 : 400).json(result);
    } catch (e) {
      res.status(502).json({ error: String(e?.message || e) });
    }
  });

  app.get("/api/v1/state", requireAuth(), (req, res) => {
    const f = focus.get();
    const body = {
      focusedThreadId: f.focusedThreadId,
      version: f.version,
      navUrl: f.navUrl,
      navSeq: f.navSeq,
      view: f.view,
      viewSeq: f.viewSeq,
      filter: f.filter,
      filterSeq: f.filterSeq,
      pcContext: f.pcContext,
      pcSelectedId: f.pcSelectedId,
      pcCommand: f.pcCommand,
      pcCommandSeq: f.pcCommandSeq,
      pcDataSeq: f.pcDataSeq,
    };
    // The heavy draft bodies are only needed when something actually changed;
    // the 1.2s pollers compare seqs/version and re-fetch with ?full=1 on a bump,
    // so the steady-state poll ships just the small header, not every draft.
    if (req.query && (req.query.full === "1" || req.query.full === "true")) {
      body.drafts = drafts.list();
      body.specDrafts = specDrafts ? specDrafts.list() : {};
    }
    res.json(body);
  });

  // POST /api/v1/threads/:id/reply — token-gated wrapper over the same
  // pending-queue path as legacy /api/reply. Returns 409 if a concurrent
  // reply for the same thread is already in flight.
  app.post("/api/v1/threads/:id/reply", requireAuth({ mutation: true }), async (req, res) => {
    const t = findThread(req.params.id);
    if (!t) return res.status(404).json({ error: "thread not found" });
    const { content } = req.body || {};
    if (typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ error: "content (non-empty string) required" });
    }
    if (typeof postReply !== "function") {
      return res.status(501).json({ error: "reply not wired in this deployment" });
    }
    const r = await postReply(t.id, content);
    res.status(r.status).json(r.body);
  });

  // POST /api/v1/threads/:id/resolve — token-gated wrapper.
  app.post("/api/v1/threads/:id/resolve", requireAuth({ mutation: true }), async (req, res) => {
    const t = findThread(req.params.id);
    if (!t) return res.status(404).json({ error: "thread not found" });
    if (typeof doResolveDep !== "function") {
      return res.status(501).json({ error: "resolve not wired in this deployment" });
    }
    const r = await doResolveDep(t.id);
    res.status(r.status).json(r.body);
  });

  // POST /api/v1/threads/:id/stage-resolve — queue a resolve locally (pending),
  // NOT pushed to ADO until Finalize. Mirrors stage_draft/stage_spec_edit.
  app.post("/api/v1/threads/:id/stage-resolve", requireAuth({ mutation: true }), async (req, res) => {
    const t = findThread(req.params.id);
    if (!t) return res.status(404).json({ error: "thread not found" });
    if (typeof stageResolve !== "function") {
      return res.status(501).json({ error: "stage-resolve not wired in this deployment" });
    }
    const r = await stageResolve(t.id);
    res.status(r.status).json(r.body);
  });

  // POST /api/v1/threads/:id/viewed — mark the thread viewed at its current last
  // comment (durable ADO thread property). DELETE un-views it.
  app.post("/api/v1/threads/:id/viewed", requireAuth({ mutation: true }), async (req, res) => {
    const t = findThread(req.params.id);
    if (!t) return res.status(404).json({ error: "thread not found" });
    if (typeof setViewed !== "function") {
      return res.status(501).json({ error: "viewed not wired in this deployment" });
    }
    const lastId = (t.comments || []).reduce((m, c) => Math.max(m, c.id || 0), 0);
    const r = await setViewed(t.id, lastId);
    res.status(r.status).json(r.body);
  });
  app.delete("/api/v1/threads/:id/viewed", requireAuth({ mutation: true }), async (req, res) => {
    const t = findThread(req.params.id);
    if (!t) return res.status(404).json({ error: "thread not found" });
    if (typeof setViewed !== "function") {
      return res.status(501).json({ error: "viewed not wired in this deployment" });
    }
    const r = await setViewed(t.id, null);
    res.status(r.status).json(r.body);
  });
}
