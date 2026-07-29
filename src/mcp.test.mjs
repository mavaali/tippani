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
const stubSession = {
  ensurePortal: async (opts) => { ensurePortalCalls.push(opts); return { reused: false, prId: opts.prId }; },
  ensureBrowsePortal: async () => { browsePortalCalls.push(1); },
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
    "stage_draft", "clear_draft", "post_reply",
    "resolve_thread", "stage_resolve_thread", "mark_viewed", "get_spec",
    "stage_spec_edit", "get_spec_draft", "clear_spec_edit", "commit_spec",
    "edit_spec", "set_view", "set_feedback_filter",
    "list_prs", "search_work_items", "search_specs", "get_file_commits",
    "read_personal_comments", "add_personal_comment", "edit_personal_comment",
    "delete_personal_comment", "resolve_personal_comment", "reply_personal_comment", "delete_resolved_personal_comments",
    "delete_all_personal_comments", "navigate_personal_comments", "jump_to_personal_comment",
    "show_resolved_personal_comments", "open_branch", "open_branch_file", "open_local_file", "refresh_spec",
    "create_branch", "stage_spec", "push_spec", "create_spec_pr",
  ];
  check("tools: exactly 45 registered", tools.length === 45);
  for (const n of expected) {
    check(`tools: includes ${n}`, !!byName[n]);
    check(`tools: ${n} has description`, typeof byName[n].description === "string" && byName[n].description.length > 20);
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

  // --- Remote authoring write tools (clickstop 2, step 13) ---
  const WPROJ = "Big Data", WREPO = "MyRepo";
  {
    const r = await byName.create_branch.handler({ project: WPROJ, repo: WREPO, branch: "spec/x" });
    check("create_branch: creates + echoes repo/branch", r.ok === true && r.context.repo === "MyRepo" && r.context.branch === "spec/x");
    check("create_branch: next-step points at stage_spec", /stage_spec/.test(r.nextStep));
    // Missing project/repo -> the dep refuses (never guesses the repo).
    let refused = false;
    try { const bad = await byName.create_branch.handler({ branch: "spec/x" }); refused = bad.ok === false; }
    catch (e) { refused = e.status === 400; }
    check("create_branch: refuses without project/repo (never guessed)", refused);
  }
  {
    const r = await byName.stage_spec.handler({ project: WPROJ, repo: WREPO, branch: "spec/x", path: "docs/spec.md", body: "# Spec\n\nhi" });
    check("stage_spec: stages + echoes full context", r.ok === true && r.context.repo === "MyRepo" && r.context.branch === "spec/x" && r.context.path === "docs/spec.md");
    check("stage_spec: next-step points at push_spec", /push_spec/.test(r.nextStep));
    // Verify the body reached the store via a second file, then a multi-file push.
    await byName.stage_spec.handler({ project: WPROJ, repo: WREPO, branch: "spec/x", path: "docs/two.md", body: "second" });
  }
  {
    const r = await byName.push_spec.handler({ project: WPROJ, repo: WREPO, branch: "spec/x", message: "Add specs" });
    check("push_spec: commits all staged files in one commit", r.ok === true && r.commitId === "c1" && r.pushedFiles.length === 2);
    check("push_spec: next-step points at create_spec_pr", /create_spec_pr/.test(r.nextStep));
  }
  {
    const r = await byName.create_spec_pr.handler({ project: WPROJ, repo: WREPO, title: "Add spec", sourceBranch: "spec/x", targetBranch: "main", isDraft: true, workItemTitle: "Spec review", workItemType: "Task" });
    check("create_spec_pr: opens PR + links work item", r.ok === true && r.pullRequestId === 77 && r.workItemId === 88 && r.linked === true);
    check("create_spec_pr: echoes the source branch", r.context.branch === "spec/x");
    check("create_spec_pr: next-step points at review", /review/i.test(r.nextStep));
  }
  {
    // Every write tool description carries the never-raw-git/ADO rule (step 14
    // lint asserts the same; here we prove step 13 embedded it).
    for (const n of ["create_branch", "stage_spec", "push_spec", "create_spec_pr"]) {
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

  // --- post_reply ---
  {
    const r = await byName.post_reply.handler({ threadId: 202, content: "Agreed." });
    check("post_reply: ok+synced", r.ok === true && r.synced === true);
    check("post_reply: backend received reply", postedReplies.length === 1 && postedReplies[0].threadId === 202);
  }
  {
    // empty content -> 400 from server
    let bad = false;
    try { await byName.post_reply.handler({ threadId: 202, content: "  " }); }
    catch (e) { bad = e.status === 400; }
    check("post_reply: 400 on empty content", bad);
  }

  // --- resolve_thread ---
  {
    const r = await byName.resolve_thread.handler({ threadId: 202 });
    check("resolve_thread: ok+synced", r.ok === true && r.synced === true);
    check("resolve_thread: backend received resolve", resolvedThreads.includes(202));
  }

  // --- mark_viewed ---
  {
    const r = await byName.mark_viewed.handler({ threadId: 202 });
    check("mark_viewed: ok", r.ok === true);
    // thread 202's last comment id is 12 → viewed at 12
    check("mark_viewed: backend viewed at last comment id",
      viewedCalls.some((c) => c.threadId === 202 && c.commentId === 12));
    const r2 = await byName.mark_viewed.handler({ threadId: 202, clear: true });
    check("mark_viewed: clear un-views (commentId null)",
      r2.ok === true && viewedCalls.some((c) => c.threadId === 202 && c.commentId === null));
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
