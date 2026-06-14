// Phase 1 control API (#42) — Express route registration extracted from
// src/index.js so the routes can be mounted in tests without bootstrapping
// the full ADO connection / file watcher / browser flow.
//
// Dependencies are injected so callers can supply real ADO-backed accessors
// in production and in-memory fakes in tests.

export function registerControlApi(app, deps) {
  const {
    port,
    sessionToken,
    focus,
    drafts,
    locks,
    getThreads,         // () => Array<thread>
    getChangedFiles,    // () => Array<{path, changeType}>
    readFileMarkdown,   // async (filePath) => string
    postReply,          // async (threadId, content) => {ok, status, body}
    resolveThread: doResolveDep, // async (threadId) => {ok, status, body}
  } = deps;

  const LOCAL_PREFIXES = [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
  ];

  function isSameOrigin(req) {
    const origin = req.headers.origin || req.headers.referer || "";
    return LOCAL_PREFIXES.some((p) => origin.startsWith(p));
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

  app.get("/api/v1/threads", requireAuth(), (_req, res) => {
    const all = (getThreads() || []).filter((t) => t.comments?.length > 0);
    res.json({ threads: all.map(summarizeThread), focus: focus.get() });
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

  app.get("/api/v1/state", requireAuth(), (_req, res) => {
    const f = focus.get();
    res.json({
      focusedThreadId: f.focusedThreadId,
      version: f.version,
      drafts: drafts.list(),
    });
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
}
