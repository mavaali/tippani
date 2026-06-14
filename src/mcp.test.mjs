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
});

const server = await new Promise((res) => {
  const s = app.listen(0, "127.0.0.1", () => res(s));
});
const { port } = server.address();
const BASE = `http://127.0.0.1:${port}`;

// --- MCP tool surface under test ---
const http = createHttpClient({ baseUrl: BASE, token: TOKEN, clientName: "mcp-test", fetch });
const tools = buildTools(http);
const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

try {
  // --- Surface checks ---
  const expected = [
    "list_threads", "get_thread", "focus_thread",
    "stage_draft", "clear_draft", "post_reply",
    "resolve_thread", "get_spec",
  ];
  check("tools: exactly 8 registered", tools.length === 8);
  for (const n of expected) {
    check(`tools: includes ${n}`, !!byName[n]);
    check(`tools: ${n} has description`, typeof byName[n].description === "string" && byName[n].description.length > 20);
  }

  // --- list_threads ---
  {
    const r = await byName.list_threads.handler({});
    check("list_threads: returns both threads", r.threads.length === 2);
    check("list_threads: focus reported", r.focus.focusedThreadId === null);
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

  // --- loadSessionToken ---
  {
    const tmp = path.join(os.tmpdir(), `tippani-mcp-test-${process.pid}.tok`);
    fs.writeFileSync(tmp, "secret-value\n", { mode: 0o600 });
    check("loadSessionToken: trims newline", loadSessionToken(tmp) === "secret-value");
    fs.unlinkSync(tmp);
    check("loadSessionToken: missing file -> null", loadSessionToken(tmp) === null);
  }

} finally {
  server.close();
}

console.log(`mcp.test: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
