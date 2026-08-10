// MCP shim integration test (#42 Phase 2).
// Spins up the Phase 1 control API on an ephemeral port with in-memory
// fakes, builds the MCP tool surface from src/mcp-tools.js, and invokes
// each tool's handler end-to-end. Skips the actual MCP transport — we
// only verify that the tool layer correctly wraps the HTTP API.

import express from "express";
import os from "os";
import fs from "fs";
import path from "path";
import {
  createFocusStore,
  createDraftStore,
  createLockStore,
  createKeyedLockStore,
} from "./api-state.js";
import { registerControlApi } from "./control-api.js";
import { buildTools, createHttpClient, loadSessionToken } from "./mcp-tools.js";

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) pass++;
  else { fail++; console.error("  FAIL: " + name); }
}

const TOKEN = "mcp-test-token";

// --- Fake tippani backend ---
const threads = [
  {
    id: 201, status: 1,
    threadContext: { filePath: "/spec.md", rightFileStart: { line: 5 } },
    comments: [{ id: 11, author: { displayName: "Alice" }, publishedDate: "2026-06-13T00:00:00Z", content: "Add metric" }],
  },
  {
    id: 202, status: 1,
    threadContext: { filePath: "/spec.md", rightFileStart: { line: 20 } },
    comments: [{ id: 12, author: { displayName: "Bob" }, publishedDate: "2026-06-13T00:00:00Z", content: "Clarify scope" }],
  },
];
const changedFiles = [{ path: "/spec.md", changeType: "edit" }];
const SPEC_MD = "# Hello\n\n## World\n";

const focus = createFocusStore();
const drafts = createDraftStore({ onChange: () => focus.bumpVersion() });
const locks = createLockStore({ ttlMs: 60_000 });
const specDrafts = createDraftStore({ onChange: () => focus.bumpVersion() });

// Clickstop 2 step 13: in-memory remote-draft store backing the write tools.
// Scoped by (project,repo,branch).
const _remoteDraftMap = new Map();
const remoteDraftStore = {
  put(key, val, meta = {}) { const rec = { project: val.project, repo: val.repo, branch: val.branch, path: val.path, body: val.body, baseObjectId: val.baseObjectId || null, updatedAt: "t", source: meta.source || "external" }; _remoteDraftMap.set(key, rec); return rec; },
  get(key) { return _remoteDraftMap.get(key) || null; },
  delete(key) { return _remoteDraftMap.delete(key); },
  list() { return Object.fromEntries(_remoteDraftMap); },
  forBranch(project, repo, branch) { return [..._remoteDraftMap.values()].filter((d) => d.project === project && d.repo === repo && d.branch === branch); },
};

// Stub reply/resolve helpers that match the doReply/doResolve contract.
const postedReplies = [];
const resolvedThreads = [];
async function fakePostReply(threadId, content) {
  postedReplies.push({ threadId, content });
  drafts.delete(threadId);
  return { ok: true, status: 200, body: { ok: true, synced: true } };
}
async function fakeResolve(threadId) {
  resolvedThreads.push(threadId);
  return { ok: true, status: 200, body: { ok: true, synced: true } };
}
const viewedCalls = [];
const stageResolveCalls = [];
const stagedBranches = [];
const stagedFiles = [];
const stagedPrs = [];
let aggregatePushCalls = 0;
async function fakeSetViewed(threadId, commentId) {
  viewedCalls.push({ threadId, commentId });
  return { ok: true, status: 200, body: { ok: true, viewedCommentId: commentId == null ? null : String(commentId) } };
}
const app = express();
app.use(express.json());
registerControlApi(app, {
  port: 0,
  sessionToken: TOKEN,
  focus, drafts, locks,
  getThreads: () => threads,
  getChangedFiles: () => changedFiles,
  readFileMarkdown: async () => SPEC_MD,
  postReply: fakePostReply,
  resolveThread: fakeResolve,
  stageResolve: (threadId) => { stageResolveCalls.push(threadId); return { ok: true, status: 200, body: { ok: true, staged: true, synced: false } }; },
  setViewed: fakeSetViewed,
  specDrafts,
  listPrs: async (q) => ({ prs: [{ id: 7, title: "Demo PR", author: "Kay" }], mine: q.creator !== "any", status: 1 }),
  // Clickstop 2: open_local_file forwards here.
  mcpOpenFile: async ({ path: p } = {}) =>
    p === "/ok/a.md"
      ? { ok: true, opened: "/open-file-view?path=" + p, realpath: p }
      : { ok: false, reason: "outside-root", error: "outside every approved folder" },
  // Clickstop 2 step 13: remote-authoring write deps (in-memory fakes).
  mcpCreateBranch: async ({ org, project, repo, branch, base }) =>
    (branch && project && repo) ? { ok: true, org: org || "https://dev.azure.com/powerbi", project, repo, branch, branchRef: `refs/heads/${branch}`, base: base || "main", created: true, objectId: "tip1" } : { ok: false, error: "project, repo, branch are required" },
  remoteSpecDrafts: remoteDraftStore,
  remoteSpecLocks: createKeyedLockStore({ ttlMs: 60_000 }),
  pushRemoteSpec: async ({ project, repo, branch }) => ({ ok: true, status: 200, body: { ok: true, commitId: "c1", pushedFiles: remoteDraftStore.forBranch(project, repo, branch).map((d) => d.path) } }),
  openPr: async (args) => ({ ok: true, pullRequestId: 77, url: "http://pr/77", isDraft: !!args.isDraft, workItemId: args.workItemTitle ? 88 : null, workItemCreated: !!args.workItemTitle, linked: !!args.workItemTitle }),
  stageBranch: (args) => { stagedBranches.push(args); return { ok: true, branches: stagedBranches }; },
  stageFile: (args) => { stagedFiles.push({ ...args, content: "" }); return { ok: true, files: stagedFiles }; },
  updateStagedFileContent: ({ repo, branch, path: filePath, content }) => {
    const file = stagedFiles.find((item) => item.repo === repo && item.branch === branch && item.path === filePath);
    if (!file) return { ok: false, error: "staged file not found" };
    file.content = content;
    return { ok: true };
  },
  saveExistingEdit: (args) => { stagedFiles.push({ ...args, existing: true }); return { ok: true, files: stagedFiles }; },
  stageSpecPr: (args) => { stagedPrs.push(args); return { ok: true, prs: stagedPrs }; },
  pushStagedBranches: async () => { aggregatePushCalls++; return { ok: true, count: 0, results: [{ ok: true, pushedFiles: stagedFiles.length, pullRequestId: 77 }] }; },
});

const server = await new Promise((res) => {
  const s = app.listen(0, "127.0.0.1", () => res(s));
});
const { port } = server.address();
const BASE = `http://127.0.0.1:${port}`;

// --- MCP tool surface under test ---
const http = createHttpClient({ baseUrl: BASE, token: TOKEN, clientName: "mcp-test", fetch });
// Stub portal session: open_pr calls ensurePortal (recorded) instead of
// spawning a real portal, then reads threads through the live control API.
const ensurePortalCalls = [];
const openUrlCalls = [];
const browsePortalCalls = [];
const activePortalCalls = [];
const stubSession = {
  ensurePortal: async (opts) => { ensurePortalCalls.push(opts); return { reused: false, prId: opts.prId }; },
  ensureBrowsePortal: async () => { browsePortalCalls.push(1); },
  ensureActivePortal: async () => { activePortalCalls.push(1); },
  openUrl: async (path) => { openUrlCalls.push(path); },
};
const tools = buildTools(http, stubSession);
const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

try {
  // --- Surface checks ---
  const expected = [
    "open_pr",
    "list_threads", "triage_summary", "show_feedback",
    "open_thread", "open_file", "get_thread", "focus_thread",
    "stage_draft", "clear_draft", "stage_resolve_thread", "get_spec",
    "get_spec_draft", "clear_spec_edit",
    "edit_spec", "set_view", "set_feedback_filter",
    "list_prs", "search_work_items", "search_specs", "get_file_commits",
      "read_annotations", "add_annotation", "edit_annotation",
      "delete_annotation", "resolve_annotation", "reply_annotation", "delete_resolved_annotations",
      "delete_all_annotations", "navigate_annotations", "jump_to_annotation",
      "show_resolved_annotations", "open_branch", "open_branch_file", "open_local_file", "refresh_spec",
    "stage_branch", "stage_spec", "stage_spec_pr", "push_staged_changes",
  ];
  check("tools: exactly 40 registered", tools.length === 40);
  for (const n of expected) {
    check(`tools: includes ${n}`, !!byName[n]);
    check(`tools: ${n} has description`, typeof byName[n].description === "string" && byName[n].description.length > 20);
  }
  for (const n of ["post_reply", "resolve_thread", "mark_viewed", "stage_spec_edit", "commit_spec", "create_branch", "push_spec", "create_spec_pr"]) {
    check(`tools: excludes direct/redundant ${n}`, !byName[n]);
  }

  // --- open_pr ---
  {
    const r = await byName.open_pr.handler({ prId: 952607, org: "https://dev.azure.com/o", project: "P" });
    check("open_pr: calls ensurePortal with prId", ensurePortalCalls.length === 1 && ensurePortalCalls[0].prId === 952607);
    check("open_pr: forwards org/project", ensurePortalCalls[0].org === "https://dev.azure.com/o" && ensurePortalCalls[0].project === "P");
    check("open_pr: returns threads after launch", r.threads.length === 2);
    check("open_pr: carries no embedded instructions (driving is via skills/instructions)",
      r.instructions === undefined);
    check("open_pr: reports open thread count", r.openThreadCount === 2);
  }
  {
    await byName.open_pr.handler({
      prId: 82,
      provider: "github",
      owner: "mavaali",
      repo: "tippani",
    });
    const call = ensurePortalCalls.at(-1);
    check("open_pr GitHub: forwards provider/owner/repo",
      call.provider === "github" &&
      call.owner === "mavaali" &&
      call.repo === "tippani" &&
      call.prId === 82);
  }

  // --- list_threads ---
  {
    const r = await byName.list_threads.handler({});
    check("list_threads: returns both threads", r.threads.length === 2);
    check("list_threads: focus reported", r.focus.focusedThreadId === null);
  }

  // --- open_file (single-tab default: steers the open tab via /api/v1/nav) ---
  {
    const r1 = await byName.open_file.handler({ fileIndex: 2 });
    check("open_file: opens /file/<idx>", r1.opened === "/file/2" && focus.get().navUrl === "/file/2");
    check("open_file: single-tab does NOT open a new browser tab", !openUrlCalls.includes("/file/2"));
    const r2 = await byName.open_file.handler({ fileIndex: 0, line: 47 });
    check("open_file: appends ?line when given", r2.opened === "/file/0?line=47" && focus.get().navUrl === "/file/0?line=47");
  }

  // --- open_local_file (clickstop 2: one-off .md by path, gated to approved roots) ---
  {
    const before = browsePortalCalls.length;
    const r = await byName.open_local_file.handler({ path: "/ok/a.md" });
    check("open_local_file: valid path -> ok + realpath", r.ok === true && r.realpath === "/ok/a.md");
    check("open_local_file: ensured a browse portal", browsePortalCalls.length === before + 1);
    let rejected = false, rejStatus = 0;
    try { await byName.open_local_file.handler({ path: "/etc/passwd.md" }); }
    catch (e) { rejected = true; rejStatus = e.status; }
    check("open_local_file: outside-root rejected (400, not read)", rejected && rejStatus === 400);
  }

  // --- Staged-only authoring tools ---
  const WPROJ = "Big Data", WREPO = "MyRepo";
  {
    const r = await byName.stage_branch.handler({ org: "https://dev.azure.com/o", project: WPROJ, repo: WREPO, branch: "spec/x" });
    check("stage_branch: stages + echoes repo/branch", r.ok === true && r.context.repo === WREPO && r.context.branch === "spec/x");
    check("stage_branch: does not cross ADO boundary", aggregatePushCalls === 0);
  }
  {
    const r = await byName.stage_spec.handler({ org: "https://dev.azure.com/o", project: WPROJ, repo: WREPO, branch: "spec/x", path: "docs/spec.md", body: "# Spec\n\nhi" });
    check("stage_spec: stages + echoes full context", r.ok === true && r.context.repo === "MyRepo" && r.context.branch === "spec/x" && r.context.path === "docs/spec.md");
    check("stage_spec: body reaches aggregate store", stagedFiles[0].content === "# Spec\n\nhi");
    check("stage_spec: does not cross ADO boundary", aggregatePushCalls === 0);
  }
  {
    const before = activePortalCalls.length;
    const r = await byName.stage_spec_pr.handler({ org: "https://dev.azure.com/o", project: WPROJ, repo: WREPO, title: "Add spec", sourceBranch: "spec/x", targetBranch: "main" });
    check("stage_spec_pr: stages intent", r.ok === true && stagedPrs.length === 1);
    check("stage_spec_pr: does not cross ADO boundary", aggregatePushCalls === 0);
    check("stage_spec_pr: stays on active provider portal",
      activePortalCalls.length === before + 1);
  }
  {
    const r = await byName.push_staged_changes.handler({});
    check("push_staged_changes: crosses aggregate boundary once", r.ok === true && aggregatePushCalls === 1);
    check("push_staged_changes: returns per-target result", r.results[0].pushedFiles === 1 && r.results[0].pullRequestId === 77);
  }
  {
    for (const n of ["stage_branch", "stage_spec", "stage_spec_pr", "push_staged_changes"]) {
      check(`${n}: description embeds the never-raw rule`, /never edit files|never .* raw git|Azure DevOps MCP/i.test(byName[n].description));
    }
  }

  // --- stage_resolve_thread ---
  {
    const r = await byName.stage_resolve_thread.handler({ threadId: 201 });
    check("stage_resolve_thread: stages locally (no ADO push)", r.staged === true && r.synced === false);
    check("stage_resolve_thread: calls stageResolve, not resolve", stageResolveCalls.includes(201) && !resolvedThreads.includes(201));
  }

  // --- get_thread ---
  {
    const r = await byName.get_thread.handler({ threadId: 201 });
    check("get_thread: returns comments", r.comments[0].content === "Add metric");
    check("get_thread: draft null initially", r.draft === null);
  }
  {
    let threw = false;
    try { await byName.get_thread.handler({ threadId: 999 }); } catch (e) { threw = e.status === 404; }
    check("get_thread: 404 surfaces as throw", threw);
  }

  // --- focus_thread ---
  {
    const r = await byName.focus_thread.handler({ threadId: 201 });
    check("focus_thread: sets focus", r.focus.focusedThreadId === 201);
    const r2 = await byName.focus_thread.handler({ threadId: null });
    check("focus_thread: null clears", r2.focus.focusedThreadId === null);
  }

  // --- stage_draft + clear_draft ---
  {
    const r = await byName.stage_draft.handler({ threadId: 201, content: "How about 200ms p99?", source: "test-llm" });
    check("stage_draft: ok=true", r.ok === true);
    check("stage_draft: source recorded", r.draft.source === "test-llm");
    const r2 = await byName.get_thread.handler({ threadId: 201 });
    check("stage_draft: visible via get_thread", r2.draft.content === "How about 200ms p99?");
  }
  {
    // 409 when user locked
    locks.touch(201);
    let conflict = false;
    try {
      await byName.stage_draft.handler({ threadId: 201, content: "blocked" });
    } catch (e) {
      conflict = e.status === 409;
    }
    check("stage_draft: 409 when user editing", conflict);
    locks.release(201);
  }
  {
    const r = await byName.clear_draft.handler({ threadId: 201 });
    check("clear_draft: removed=true on hit", r.removed === true);
    const r2 = await byName.clear_draft.handler({ threadId: 201 });
    check("clear_draft: idempotent (removed=false on miss)", r2.removed === false);
  }

  // --- open_thread (single-tab default) ---
  {
    const r = await byName.open_thread.handler({ threadId: 14974588 });
    check("open_thread: steers tab to /goto/thread url", r.ok === true && focus.get().navUrl === "/goto/thread/14974588");
    check("open_thread: single-tab does NOT open a new browser tab", !openUrlCalls.includes("/goto/thread/14974588"));
  }

  // --- separate-tabs mode: nav tools open a fresh browser tab instead ---
  {
    const tabUrlCalls = [];
    const tabSession = {
      ensurePortal: async () => ({ reused: false }),
      openUrl: async (path) => { tabUrlCalls.push(path); },
      separateTabs: true,
    };
    const tabTools = Object.fromEntries(buildTools(http, tabSession).map((t) => [t.name, t]));
    await tabTools.open_thread.handler({ threadId: 42 });
    await tabTools.open_file.handler({ fileIndex: 1 });
    await tabTools.show_feedback.handler({});
    check("separate-tabs: open_thread opens a new tab", tabUrlCalls.includes("/goto/thread/42"));
    check("separate-tabs: open_file opens a new tab", tabUrlCalls.includes("/file/1"));
    check("separate-tabs: show_feedback opens a new tab", tabUrlCalls.includes("/feedback"));
  }

  // --- get_spec ---
  {
    const r = await byName.get_spec.handler({ fileIndex: 0 });
    check("get_spec: returns markdown", r.markdown === SPEC_MD);
    check("get_spec: extracts headings", r.sections.length === 2);
  }
  {
    let bad = false;
    try { await byName.get_spec.handler({ fileIndex: 99 }); } catch (e) { bad = e.status === 404; }
    check("get_spec: 404 on out-of-range", bad);
  }

  // --- edit_spec ---
  {
    const r = await byName.edit_spec.handler({ fileIndex: 0, edits: [{ kind: "find", find: "Hello", replace: "Hi" }], source: "test-llm" });
    check("edit_spec: stages a draft", r.ok === true && /# Hi/.test(r.draft.content));
    const r2 = await byName.get_spec_draft.handler({ fileIndex: 0 });
    check("edit_spec: draft retrievable via get_spec_draft", /# Hi/.test(r2.draft.content));
  }
  {
    let bad = false;
    try { await byName.edit_spec.handler({ fileIndex: 0, edits: [{ kind: "find", find: "nope-zzz", replace: "x" }] }); }
    catch (e) { bad = e.status === 422; }
    check("edit_spec: 422 on unlocatable edit", bad);
  }

  // --- set_view / set_feedback_filter ---
  {
    const r = await byName.set_view.handler({ view: "diff" });
    check("set_view: posts view", r.ok === true && r.view.view === "diff");
  }
  {
    const r = await byName.set_feedback_filter.handler({ states: ["you"], reviewer: "Alice" });
    check("set_feedback_filter: posts filter", r.ok === true && r.filter.filter.states[0] === "you");
    const r2 = await byName.set_feedback_filter.handler({ clear: true });
    check("set_feedback_filter: clear -> null", r2.filter.filter === null);
  }

  // --- list_prs ---
  {
    const r = await byName.list_prs.handler({});
    check("list_prs: returns prs", Array.isArray(r.prs) && r.prs[0].id === 7);
    const r2 = await byName.list_prs.handler({ creator: "any" });
    check("list_prs: creator=any widens", r2.mine === false);
  }

  // --- loadSessionToken ---
  {
    const tmp = path.join(os.tmpdir(), `tippani-mcp-test-${process.pid}.tok`);
    fs.writeFileSync(tmp, "secret-value\n", { mode: 0o600 });
    check("loadSessionToken: trims newline", loadSessionToken(tmp) === "secret-value");
    fs.unlinkSync(tmp);
    check("loadSessionToken: missing file -> null", loadSessionToken(tmp) === null);
  }

  // --- open_branch / open_branch_file ensure a browse portal before posting ---
  {
    const before = browsePortalCalls.length;
    try { await byName.open_branch.handler({ localPath: "C:/repos/specs", branch: "dev/x" }); } catch {}
    check("open_branch: ensures a browse portal first", browsePortalCalls.length === before + 1);
    const before2 = browsePortalCalls.length;
    try { await byName.open_branch_file.handler({ localPath: "C:/repos/specs", branch: "dev/x", path: "/a.md" }); } catch {}
    check("open_branch_file: ensures a browse portal first", browsePortalCalls.length === before2 + 1);
  }

} finally {
  server.close();
}

console.log(`mcp.test: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
