// HTTP integration test for the Phase 1 control API (#42).
// Mounts the routes via registerControlApi() against an Express app with
// in-memory fakes, listens on an ephemeral port, and exercises each
// endpoint via global fetch. No ADO, no real cache.

import express from "express";
import {
  createFocusStore,
  createDraftStore,
  createLockStore,
  createKeyedLockStore,
} from "./api-state.js";
import { registerControlApi } from "./control-api.js";

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("  FAIL: " + name); }
}

const SESSION_TOKEN = "test-token-abc";
const PORT_FOR_PREFIXES = 65535;  // doesn't matter; tests use 127.0.0.1:<ephemeral>

// Fixture threads — minimal ADO shape.
const threads = [
  {
    id: 101, status: 1, lastUpdatedDate: "2026-06-13T00:00:00Z",
    threadContext: { filePath: "/docs/spec.md", rightFileStart: { line: 12 } },
    comments: [
      { id: 1, author: { displayName: "Reviewer" }, publishedDate: "2026-06-13T00:00:00Z", content: "Latency budget?" },
    ],
  },
  {
    id: 102, status: 2, lastUpdatedDate: "2026-06-12T00:00:00Z",
    threadContext: { filePath: "/docs/spec.md", rightFileStart: { line: 40 } },
    comments: [
      { id: 2, author: { displayName: "Reviewer" }, publishedDate: "2026-06-12T00:00:00Z", content: "Resolved." },
    ],
  },
  {
    // No comments — must be filtered out of GET /api/v1/threads.
    id: 103, status: 1, comments: [],
  },
];

const changedFiles = [
  { path: "/docs/spec.md", changeType: "edit" },
];

const SPEC_MD = "# Title\n\nIntro paragraph.\n\n## Section A\n\nBody.\n\n### Sub\n\nMore.\n";

const focus = createFocusStore();
const drafts = createDraftStore({ onChange: () => focus.bumpVersion() });
const locks = createLockStore({ ttlMs: 60_000 });
const specDrafts = createDraftStore({ onChange: () => focus.bumpVersion() });
const specLocks = createLockStore({ ttlMs: 60_000 });

// Clickstop 2 step 11: fake durable remote-draft store (in-memory) + push dep.
const remoteDraftMap = new Map();
const remoteSpecDrafts = {
  put(key, val, meta = {}) {
    if (val.path === "/fail/write.md") throw new Error("disk full"); // forced write failure
    const rec = { repo: val.repo, branch: val.branch, path: val.path, body: val.body, baseObjectId: val.baseObjectId || null, updatedAt: "t", source: meta.source || "external" };
    remoteDraftMap.set(key, rec);
    return rec;
  },
  get(key) { return remoteDraftMap.get(key) || null; },
  delete(key) { return remoteDraftMap.delete(key); },
  list() { return Object.fromEntries(remoteDraftMap); },
  forBranch(repo, branch) { return [...remoteDraftMap.values()].filter((d) => d.repo === repo && d.branch === branch); },
};
const remoteSpecLocks = createKeyedLockStore({ ttlMs: 60_000 });
const pushRemoteSpec = async ({ repo, branch, oldObjectId }) => {
  if (oldObjectId === "stale") return { ok: false, status: 409, body: { ok: false, error: "branch moved; re-stage" } };
  const staged = remoteSpecDrafts.forBranch(repo, branch);
  if (staged.length === 0) return { ok: false, status: 400, body: { ok: false, error: "nothing staged" } };
  const files = staged.map((d) => d.path);
  for (const d of staged) remoteSpecDrafts.delete(`${repo}\n${branch}\n${d.path}`);
  return { ok: true, status: 200, body: { ok: true, commitId: "c1", pushedFiles: files } };
};

let lastAdoToken = null;
const app = express();
app.use(express.json());
registerControlApi(app, {
  port: PORT_FOR_PREFIXES,
  sessionToken: SESSION_TOKEN,
  setAdoToken: (t) => { lastAdoToken = t; return t !== "reject-me"; },
  focus, drafts, locks,
  getThreads: () => threads,
  getChangedFiles: () => changedFiles,
  readFileMarkdown: async (p) => (p === "/docs/spec.md" ? SPEC_MD : ""),
  specDrafts,
  specLocks,
  specDiff: async (idx) => ({ hunks: [{ startLine: 3, endLine: 3, oldHtml: "<p>a</p>", newHtml: "<p>b</p>" }], source: "test", updatedAt: 1 }),
  renderDraft: async (idx, { draft } = {}) => ({ html: draft ? "<p>DRAFT</p>" : "<p>COMMITTED</p>" }),
  listPrs: async (q) => ({ prs: [{ id: 1, title: "PR One", author: "Kay" }], mine: q.creator !== "any", status: 1 }),
  // Clickstop 2: Open file resolve. Fake classifier — "/ok/a.md" resolves, else error.
  resolveOpenFile: ({ path: p } = {}) =>
    p === "/ok/a.md"
      ? { ok: true, realpath: "/ok/a.md" }
      : { ok: false, reason: "outside-root", error: "outside every approved folder" },
  remoteSpecDrafts,
  remoteSpecLocks,
  pushRemoteSpec,
});

const server = await new Promise((resolve) => {
  const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const { port } = server.address();
const BASE = `http://127.0.0.1:${port}`;

async function call(path, opts = {}) {
  const headers = { "X-Tippani-Client": "test", ...(opts.headers || {}) };
  if (opts.body && typeof opts.body !== "string") {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  const r = await fetch(BASE + path, { ...opts, headers });
  let body = null;
  try { body = await r.json(); } catch {}
  return { status: r.status, body };
}
const authHeaders = { Authorization: `Bearer ${SESSION_TOKEN}` };

try {
  // --- Auth guards ---
  {
    const r = await fetch(BASE + "/api/v1/threads");
    check("auth: missing X-Tippani-Client -> 403", r.status === 403);
  }
  {
    const r = await fetch(BASE + "/api/v1/commands/focus", {
      method: "POST",
      headers: { "X-Tippani-Client": "test", "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: 101 }),
    });
    check("auth: mutation without bearer -> 401", r.status === 401);
  }
  {
    const r = await fetch(BASE + "/api/v1/commands/focus", {
      method: "POST",
      headers: { "X-Tippani-Client": "test", "Content-Type": "application/json", Authorization: "Bearer wrong" },
      body: JSON.stringify({ threadId: 101 }),
    });
    check("auth: wrong bearer -> 401", r.status === 401);
  }
  // Same-origin bypass: include Origin header that matches LOCAL_PREFIXES for `port`
  // configured at registration time (PORT_FOR_PREFIXES). It's not 127.0.0.1:<this server>,
  // but per the auth design, same-origin means matching the configured base. We just
  // need to verify that the bypass *exists* — sending matching Origin omits both guards.
  {
    const r = await fetch(BASE + "/api/v1/threads", {
      headers: { Origin: `http://localhost:${PORT_FOR_PREFIXES}` },
    });
    check("auth: same-origin bypass (no X-Tippani-Client needed)", r.status === 200);
  }

  // --- GET /api/v1/specs/:fileIndex/diff (now behind requireAuth) ---
  {
    const r = await fetch(BASE + "/api/v1/specs/0/diff");
    check("diff: missing X-Tippani-Client -> 403", r.status === 403);
  }
  {
    const r = await call("/api/v1/specs/0/diff");
    check("diff: with client header -> 200", r.status === 200);
    check("diff: returns hunks", Array.isArray(r.body.hunks) && r.body.hunks.length === 1);
  }
  {
    const r = await call("/api/v1/specs/99/diff");
    check("diff: out-of-range index -> empty hunks", r.status === 200 && Array.isArray(r.body.hunks) && r.body.hunks.length === 0);
  }

  // --- GET /api/v1/threads ---
  {
    const r = await call("/api/v1/threads");
    check("threads: 200", r.status === 200);
    check("threads: filters empty-comment threads", r.body.threads.length === 2);
    const ids = r.body.threads.map(t => t.id).sort();
    check("threads: includes 101 and 102", ids[0] === 101 && ids[1] === 102);
    const active = r.body.threads.find(t => t.id === 101);
    check("threads: 101 resolved=false", active.resolved === false);
    const resolved = r.body.threads.find(t => t.id === 102);
    check("threads: 102 resolved=true (status=2)", resolved.resolved === true);
    check("threads: includes focus.version=0 initially", r.body.focus.version === 0);
    check("threads: hasDraft=false initially", active.hasDraft === false);
  }

  // --- GET /api/v1/threads/:id ---
  {
    const r = await call("/api/v1/threads/101");
    check("thread/:id: 200", r.status === 200);
    check("thread/:id: includes comments", r.body.comments.length === 1);
    check("thread/:id: comment content present", r.body.comments[0].content === "Latency budget?");
    check("thread/:id: draft is null initially", r.body.draft === null);
  }
  {
    const r = await call("/api/v1/threads/999");
    check("thread/:id: unknown id -> 404", r.status === 404);
  }

  // --- POST /api/v1/commands/focus ---
  {
    const r = await call("/api/v1/commands/focus", { method: "POST", headers: authHeaders, body: { threadId: 101 } });
    check("focus: 200", r.status === 200);
    check("focus: focusedThreadId set", r.body.focus.focusedThreadId === 101);
    check("focus: version bumped to 1", r.body.focus.version === 1);
  }
  {
    const r = await call("/api/v1/commands/focus", { method: "POST", headers: authHeaders, body: { threadId: 999 } });
    check("focus: unknown thread -> 404", r.status === 404);
  }
  {
    const r = await call("/api/v1/commands/focus", { method: "POST", headers: authHeaders, body: { threadId: "nope" } });
    check("focus: bad threadId -> 400", r.status === 400);
  }
  {
    const r = await call("/api/v1/commands/focus", { method: "POST", headers: authHeaders, body: { threadId: null } });
    check("focus: null clears", r.status === 200 && r.body.focus.focusedThreadId === null);
  }

  // --- POST /api/v1/nav (single-tab navigation) ---
  {
    const r = await call("/api/v1/nav", { method: "POST", headers: authHeaders, body: { path: "/goto/thread/101" } });
    check("nav: 200", r.status === 200);
    check("nav: records url", r.body.nav.navUrl === "/goto/thread/101");
    check("nav: seq >= 1", r.body.nav.navSeq >= 1);
  }
  {
    const r = await call("/api/v1/state");
    check("nav: state exposes navUrl", r.body.navUrl === "/goto/thread/101");
    check("nav: state exposes navSeq", typeof r.body.navSeq === "number" && r.body.navSeq >= 1);
  }
  {
    const r = await call("/api/v1/nav", { method: "POST", headers: authHeaders, body: {} });
    check("nav: missing path -> 400", r.status === 400);
  }
  {
    const r = await call("/api/v1/nav", { method: "POST", body: { path: "/feedback" } });
    check("nav: requires auth -> 401", r.status === 401);
  }
  // Reject nav targets that would steer the tab OFF-origin or into a scheme.
  {
    const r = await call("/api/v1/nav", { method: "POST", headers: authHeaders, body: { path: "//evil.com/x" } });
    check("nav: protocol-relative //host -> 400", r.status === 400);
  }
  {
    const r = await call("/api/v1/nav", { method: "POST", headers: authHeaders, body: { path: "https://evil.com/x" } });
    check("nav: absolute foreign URL -> 400", r.status === 400);
  }
  {
    const r = await call("/api/v1/nav", { method: "POST", headers: authHeaders, body: { path: "javascript:alert(1)" } });
    check("nav: javascript: scheme -> 400", r.status === 400);
  }
  {
    const r = await call("/api/v1/nav", { method: "POST", headers: authHeaders, body: { path: "/ok\\..\\evil" } });
    check("nav: backslash path -> 400", r.status === 400);
  }

  // --- POST /api/v1/ado-token (Coforce token push) ---
  {
    const r = await call("/api/v1/ado-token", { method: "POST", headers: authHeaders, body: { token: "fresh-bearer-xyz" } });
    check("ado-token: 200", r.status === 200 && r.body.ok === true);
    check("ado-token: swaps the live token", lastAdoToken === "fresh-bearer-xyz");
  }
  {
    const r = await call("/api/v1/ado-token", { method: "POST", headers: authHeaders, body: {} });
    check("ado-token: missing token -> 400", r.status === 400);
  }
  {
    const r = await call("/api/v1/ado-token", { method: "POST", body: { token: "x" } });
    check("ado-token: requires auth -> 401", r.status === 401);
  }
  {
    // setAdoToken rejects the token (e.g. expired bearer) → endpoint returns 400,
    // exercising the previously-dead "token rejected" branch.
    const r = await call("/api/v1/ado-token", { method: "POST", headers: authHeaders, body: { token: "reject-me" } });
    check("ado-token: rejected token -> 400", r.status === 400);
  }

  // --- PUT /api/v1/threads/:id/draft ---
  {
    const r = await call("/api/v1/threads/101/draft", { method: "PUT", headers: authHeaders, body: { content: "Drafted reply" } });
    check("draft put: 200", r.status === 200);
    check("draft put: returns draft content", r.body.draft.content === "Drafted reply");
    check("draft put: default source=external", r.body.draft.source === "external");
  }
  {
    const r = await call("/api/v1/threads/101");
    check("thread/:id: now shows hasDraft=true via comments fetch", r.body.hasDraft === true);
    check("thread/:id: now exposes draft.content", r.body.draft.content === "Drafted reply");
  }
  {
    const r = await call("/api/v1/threads/101/draft", { method: "PUT", headers: authHeaders, body: { content: 123 } });
    check("draft put: non-string content -> 400", r.status === 400);
  }
  {
    const r = await call("/api/v1/threads/999/draft", { method: "PUT", headers: authHeaders, body: { content: "x" } });
    check("draft put: unknown thread -> 404", r.status === 404);
  }

  // --- POST /api/v1/threads/:id/lock then PUT draft -> 409 ---
  {
    const r = await call("/api/v1/threads/101/lock", { method: "POST", headers: authHeaders });
    check("lock touch: 200", r.status === 200);
    check("lock touch: returns expiresAt", typeof r.body.expiresAt === "number");
  }
  {
    const r = await call("/api/v1/threads/101/draft", { method: "PUT", headers: authHeaders, body: { content: "blocked" } });
    check("draft put while locked: 409", r.status === 409);
  }

  // --- DELETE /api/v1/threads/:id/draft ---
  // Manually release the lock so delete works without lock interference (delete
  // doesn't check the lock by design — only PUT does).
  locks.release(101);
  {
    const r = await call("/api/v1/threads/101/draft", { method: "DELETE", headers: authHeaders });
    check("draft delete: 200", r.status === 200);
    check("draft delete: removed=true", r.body.removed === true);
  }
  {
    const r = await call("/api/v1/threads/101/draft", { method: "DELETE", headers: authHeaders });
    check("draft delete (second): removed=false", r.body.removed === false);
  }

  // --- GET /api/v1/state ---
  {
    const r = await call("/api/v1/state");
    check("state: 200", r.status === 200);
    check("state: focusedThreadId reflects last focus", r.body.focusedThreadId === null);
    // The steady-state poll omits the heavy draft bodies...
    check("state: slim poll omits drafts", r.body.drafts === undefined);
    check("state: version is a number", typeof r.body.version === "number");
    // ...and ?full=1 includes them.
    const rf = await call("/api/v1/state?full=1");
    check("state?full: drafts empty after delete", Object.keys(rf.body.drafts).length === 0);
    check("state?full: specDrafts present", typeof rf.body.specDrafts === "object");
  }

  // --- GET /api/v1/specs/:fileIndex ---
  {
    const r = await call("/api/v1/specs/0");
    check("specs: 200", r.status === 200);
    check("specs: returns markdown", r.body.markdown === SPEC_MD);
    check("specs: extracts headings", r.body.sections.length === 3);
    check("specs: level 1 first", r.body.sections[0].level === 1 && r.body.sections[0].text === "Title");
    check("specs: level 2 second", r.body.sections[1].level === 2 && r.body.sections[1].text === "Section A");
    check("specs: line numbers 1-based", r.body.sections[0].line === 1);
  }
  {
    const r = await call("/api/v1/specs/99");
    check("specs: out of range -> 404", r.status === 404);
  }

  // --- Version bumps cover focus + drafts ---
  {
    const v0 = (await call("/api/v1/state")).body.version;
    await call("/api/v1/threads/101/draft", { method: "PUT", headers: authHeaders, body: { content: "new" } });
    const v1 = (await call("/api/v1/state")).body.version;
    check("state: version bumps on draft put", v1 > v0);
    await call("/api/v1/commands/focus", { method: "POST", headers: authHeaders, body: { threadId: 102 } });
    const v2 = (await call("/api/v1/state")).body.version;
    check("state: version bumps on focus change", v2 > v1);
  }

  // --- Surgical spec edits (/edit, #edit_spec) ---
  {
    const r = await call("/api/v1/specs/0/edit", { method: "POST", headers: authHeaders,
      body: { edits: [{ kind: "range", startLine: 3, endLine: 3, oldString: "Intro paragraph.", newString: "Intro EDITED." }], source: "test-agent" } });
    check("edit: range stages draft (200)", r.status === 200 && r.body.ok === true);
    check("edit: applied count", r.body.applied === 1);
    check("edit: draft reflects the edit", /Intro EDITED\./.test(r.body.draft.content));
  }
  {
    const r = await call("/api/v1/specs/0/edit", { method: "POST", headers: authHeaders,
      body: { edits: [{ kind: "find", find: "Body.", replace: "Body!" }] } });
    check("edit: accumulates on the staged draft", /Body!/.test(r.body.draft.content));
    check("edit: prior edit persists across calls", /Intro EDITED\./.test(r.body.draft.content));
  }
  {
    const before = (await call("/api/v1/specs/0/draft")).body.draft.content;
    const r = await call("/api/v1/specs/0/edit", { method: "POST", headers: authHeaders,
      body: { edits: [{ kind: "range", startLine: 1, endLine: 1, oldString: "WRONG", newString: "x" }] } });
    check("edit: guard mismatch -> 422 code", r.status === 422 && r.body.code === "guard_mismatch");
    const after = (await call("/api/v1/specs/0/draft")).body.draft.content;
    check("edit: failed call stages nothing (draft unchanged)", before === after);
  }
  {
    const r = await call("/api/v1/specs/0/edit", { method: "POST", headers: authHeaders,
      body: { edits: [{ kind: "find", find: "zzz-not-present", replace: "x" }] } });
    check("edit: not found -> 422 code", r.status === 422 && r.body.code === "not_found");
  }
  {
    const r = await call("/api/v1/specs/99/edit", { method: "POST", headers: authHeaders,
      body: { edits: [{ kind: "find", find: "x", replace: "y" }] } });
    check("edit: bad file index -> 404", r.status === 404);
  }

  // --- /edit honors the editor lock (option (c)): 409 while the user is editing ---
  {
    const r = await call("/api/v1/specs/0/lock", { method: "POST", headers: authHeaders });
    check("spec lock touch: 200", r.status === 200);
  }
  {
    const r = await call("/api/v1/specs/0/edit", { method: "POST", headers: authHeaders,
      body: { edits: [{ kind: "find", find: "More.", replace: "BLOCKED" }] } });
    check("edit while user is editing (locked) -> 409 code=locked", r.status === 409 && r.body.code === "locked");
  }
  {
    const before = (await call("/api/v1/specs/0/draft")).body.draft.content;
    const r = await call("/api/v1/specs/0/edit", { method: "POST", headers: authHeaders,
      body: { edits: [{ kind: "find", find: "More.", replace: "BLOCKED" }] } });
    const after = (await call("/api/v1/specs/0/draft")).body.draft.content;
    check("edit blocked by lock stages nothing", r.status === 409 && before === after);
  }
  specLocks.release(0);
  {
    const r = await call("/api/v1/specs/0/edit", { method: "POST", headers: authHeaders,
      body: { edits: [{ kind: "find", find: "More.", replace: "AfterUnlock" }] } });
    check("edit after the user stops editing -> 200", r.status === 200 && /AfterUnlock/.test(r.body.draft.content));
  }

  // --- View + filter control state (items 3 / 5) ---
  {
    const r = await call("/api/v1/commands/view", { method: "POST", headers: authHeaders, body: { view: "diff" } });
    check("view: set diff -> ok", r.status === 200 && r.body.view.view === "diff");
    const s = (await call("/api/v1/state")).body;
    check("state: exposes view", s.view === "diff" && s.viewSeq >= 1);
    const bad = await call("/api/v1/commands/view", { method: "POST", headers: authHeaders, body: { view: "nope" } });
    check("view: bad view -> 400", bad.status === 400);
  }
  {
    const r = await call("/api/v1/commands/filter", { method: "POST", headers: authHeaders, body: { filter: { states: ["you"] } } });
    check("filter: set -> ok", r.status === 200 && r.body.filter.filter.states[0] === "you");
    const s = (await call("/api/v1/state")).body;
    check("state: exposes filter", !!s.filter && s.filter.states[0] === "you");
    const cl = await call("/api/v1/commands/filter", { method: "POST", headers: authHeaders, body: { filter: null } });
    check("filter: clear -> null", cl.body.filter.filter === null);
  }
  {
    const r = await call("/api/v1/specs/0/render?draft=1", { headers: authHeaders });
    check("render: draft=1 renders draft html", r.status === 200 && /DRAFT/.test(r.body.html));
    const r2 = await call("/api/v1/specs/0/render", { headers: authHeaders });
    check("render: committed html by default", /COMMITTED/.test(r2.body.html));
  }

  // --- list PRs (item 6) ---
  {
    const r = await call("/api/v1/prs", { headers: authHeaders });
    check("prs: lists my active PRs by default", r.status === 200 && Array.isArray(r.body.prs) && r.body.prs[0].id === 1);
    check("prs: mine true by default", r.body.mine === true);
    const r2 = await call("/api/v1/prs?creator=any", { headers: authHeaders });
    check("prs: creator=any widens", r2.body.mine === false);
  }

  // --- Open file resolve (clickstop 2, step 2) ---
  {
    const r = await fetch(BASE + "/api/v1/open-file", { method: "POST" });
    check("open-file: missing X-Tippani-Client -> 403", r.status === 403);
  }
  {
    const r = await fetch(BASE + "/api/v1/open-file", {
      method: "POST",
      headers: { "X-Tippani-Client": "test", "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/ok/a.md" }),
    });
    check("open-file: mutation without bearer -> 401", r.status === 401);
  }
  {
    const r = await call("/api/v1/open-file", { method: "POST", headers: authHeaders, body: { path: "/ok/a.md" } });
    check("open-file: valid -> ok + realpath", r.status === 200 && r.body.ok === true && r.body.realpath === "/ok/a.md");
  }
  {
    const r = await call("/api/v1/open-file", { method: "POST", headers: authHeaders, body: { path: "/etc/passwd.md" } });
    check("open-file: invalid -> ok:false + reason + error", r.status === 200 && r.body.ok === false && r.body.reason === "outside-root" && typeof r.body.error === "string");
  }

  // --- Remote (pre-PR) spec authoring (clickstop 2, step 11) ---
  const RREPO = "MyRepo", RBRANCH = "spec/x";
  {
    const r = await fetch(BASE + "/api/v1/specs/draft", { method: "PUT" });
    check("remote-draft: missing X-Tippani-Client -> 403", r.status === 403);
  }
  {
    const r = await fetch(BASE + "/api/v1/specs/draft", {
      method: "PUT", headers: { "X-Tippani-Client": "test", "Content-Type": "application/json" },
      body: JSON.stringify({ repo: RREPO, branch: RBRANCH, path: "docs/spec.md", body: "x" }),
    });
    check("remote-draft: mutation without bearer -> 401", r.status === 401);
  }
  {
    const r = await call("/api/v1/specs/draft", { method: "PUT", headers: authHeaders, body: { repo: RREPO, branch: RBRANCH } });
    check("remote-draft: missing path -> 400", r.status === 400);
    const r2 = await call("/api/v1/specs/draft", { method: "PUT", headers: authHeaders, body: { repo: RREPO, branch: RBRANCH, path: "docs/spec.md" } });
    check("remote-draft: non-string body -> 400", r2.status === 400);
  }
  {
    // Stage sets the draft; GET round-trips it.
    const r = await call("/api/v1/specs/draft", { method: "PUT", headers: authHeaders, body: { repo: RREPO, branch: RBRANCH, path: "docs/spec.md", body: "# Spec\n\nhi", baseObjectId: "base1" } });
    check("remote-draft: stage -> ok", r.status === 200 && r.body.ok === true && r.body.draft.body === "# Spec\n\nhi");
    const g = await call(`/api/v1/specs/draft?repo=${RREPO}&branch=${RBRANCH}&path=docs/spec.md`, { headers: authHeaders });
    check("remote-draft: GET round-trips the staged body", g.status === 200 && g.body.draft && g.body.draft.body === "# Spec\n\nhi");
  }
  {
    // Two-writer collision: while the user holds the file, an agent stage 409s;
    // the user's own mirror write bypasses the lock.
    await call("/api/v1/specs/draft/lock", { method: "POST", headers: authHeaders, body: { repo: RREPO, branch: RBRANCH, path: "docs/lock.md" } });
    const agent = await call("/api/v1/specs/draft", { method: "PUT", headers: authHeaders, body: { repo: RREPO, branch: RBRANCH, path: "docs/lock.md", body: "agent" } });
    check("remote-draft: agent-vs-user collision -> 409 (not a silent overwrite)", agent.status === 409);
    const mirror = await call("/api/v1/specs/draft", { method: "PUT", headers: authHeaders, body: { repo: RREPO, branch: RBRANCH, path: "docs/lock.md", body: "user", source: "user-mirror" } });
    check("remote-draft: user-mirror bypasses the lock", mirror.status === 200);
  }
  {
    // A forced store write failure returns {ok:false} (no false success).
    const r = await call("/api/v1/specs/draft", { method: "PUT", headers: authHeaders, body: { repo: RREPO, branch: RBRANCH, path: "/fail/write.md", body: "x" } });
    check("remote-draft: write failure -> {ok:false}", r.status === 500 && r.body.ok === false);
  }
  {
    // /state omits the heavy draft bodies without ?full=1.
    const slim = (await call("/api/v1/state", { headers: authHeaders })).body;
    check("remote-draft: /state omits bodies without full", slim.remoteSpecDrafts === undefined);
    const full = (await call("/api/v1/state?full=1", { headers: authHeaders })).body;
    check("remote-draft: /state?full=1 includes staged drafts", full.remoteSpecDrafts && typeof full.remoteSpecDrafts === "object");
  }
  {
    // Multi-file push is one call (all-or-nothing): stage a second file on the
    // same branch, push -> both land in a single push.
    await call("/api/v1/specs/draft", { method: "PUT", headers: authHeaders, body: { repo: RREPO, branch: RBRANCH, path: "docs/two.md", body: "second" } });
    const staged = (await call("/api/v1/state?full=1", { headers: authHeaders })).body.remoteSpecDrafts;
    check("remote-draft: two files staged on the branch", Object.keys(staged).length >= 2);
    const push = await call("/api/v1/specs/draft/push", { method: "POST", headers: authHeaders, body: { repo: RREPO, branch: RBRANCH, message: "Add specs" } });
    check("remote-draft: push -> ok, all files in one commit", push.status === 200 && push.body.ok === true && push.body.pushedFiles.length >= 2 && !!push.body.commitId);
  }
  {
    // Stale oldObjectId -> 409 (someone moved the branch), not a lost write.
    await call("/api/v1/specs/draft", { method: "PUT", headers: authHeaders, body: { repo: RREPO, branch: RBRANCH, path: "docs/stale.md", body: "z" } });
    const push = await call("/api/v1/specs/draft/push", { method: "POST", headers: authHeaders, body: { repo: RREPO, branch: RBRANCH, oldObjectId: "stale" } });
    check("remote-draft: stale oldObjectId -> 409", push.status === 409 && push.body.ok === false);
  }

} finally {
  server.close();
}

console.log(`control-api.test: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
