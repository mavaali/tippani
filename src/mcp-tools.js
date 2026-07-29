// MCP tool definitions and HTTP client for the tippani shim.
// Extracted from src/mcp.js so the tool surface can be unit-tested without
// spawning an MCP transport.

import fs from "fs";
import { z } from "zod";
import { withHints, NEVER_RAW_RULE } from "./tool-hints.js";

export function loadSessionToken(tokenPath) {
  try {
    const t = fs.readFileSync(tokenPath, "utf-8").trim();
    return t || null;
  } catch {
    return null;
  }
}

export function createHttpClient({ baseUrl, getBaseUrl, token, getToken, clientName, fetch: fetchImpl = fetch }) {
  const resolveToken = typeof getToken === "function" ? getToken : () => token;
  const resolveBaseUrl = typeof getBaseUrl === "function" ? getBaseUrl : () => baseUrl;
  function headers(extra = {}) {
    const t = resolveToken();
    if (!t) {
      const err = new Error(
        "No tippani session yet — call open_pr first to launch the review portal."
      );
      err.status = 0;
      throw err;
    }
    return {
      "X-Tippani-Client": clientName,
      "Authorization": `Bearer ${t}`,
      ...extra,
    };
  }
  async function req(method, path, body) {
    const init = { method, headers: headers() };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const r = await fetchImpl(resolveBaseUrl() + path, init);
    let parsed = null;
    try { parsed = await r.json(); } catch {}
    if (!r.ok) {
      const msg = (parsed && parsed.error) || r.statusText || ("HTTP " + r.status);
      const err = new Error(msg);
      err.status = r.status;
      err.body = parsed;
      throw err;
    }
    return parsed;
  }
  return {
    get: (p) => req("GET", p),
    post: (p, b) => req("POST", p, b),
    put: (p, b) => req("PUT", p, b),
    delete: (p) => req("DELETE", p),
  };
}

export function buildTools(http, session) {
  // Move the user to a portal path. Single-tab mode (default) steers the one
  // open browser tab in place via the control API; separate-tabs mode opens a
  // fresh browser tab per nav (TIPPANI_SEPARATE_TABS=1).
  async function navigate(path) {
    if (session && session.separateTabs && typeof session.openUrl === "function") {
      await session.openUrl(path);
    } else {
      try { await http.post("/api/v1/nav", { path }); } catch {}
    }
  }
  // POST that first makes sure a browse portal is live, self-healing a dropped
  // session. Used by the reviewing / personal-comment tools which operate on an
  // already-open portal but — unlike open_branch* — have no natural launch step,
  // so without this they hard-fail "No tippani session yet" once a portal is
  // reaped. (Context-defaulting tools still need a file open to resolve which
  // comment/file they target; this only guarantees the portal itself is up.)
  async function ensuredPost(path, body) {
    if (session && typeof session.ensureBrowsePortal === "function") await session.ensureBrowsePortal();
    return http.post(path, body || {});
  }
  async function ensuredPut(path, body) {
    if (session && typeof session.ensureBrowsePortal === "function") await session.ensureBrowsePortal();
    return http.put(path, body || {});
  }
  return [
    {
      name: "open_pr",
      description:
        "Open a spec PR in the tippani review portal — launches a VISIBLE " +
        "browser window so the user watches the review — and load its comment " +
        "threads and changed files. Call this FIRST, before any other tippani " +
        "tool; every other tool operates on the PR opened here. Returns the " +
        "open comment threads. This is the only supported way to review a spec " +
        "PR; do not use the Azure DevOps MCP or git for PR review.",
      inputSchema: {
        prId: z.number().describe("Azure DevOps pull request id"),
        org: z.string().optional().describe(
          "ADO org URL, e.g. https://dev.azure.com/myorg (falls back to saved config)"),
        project: z.string().optional().describe(
          "ADO project name (falls back to saved config)"),
        repo: z.string().optional().describe(
          "ADO repo name (optional; auto-detected from the PR)"),
        refresh: z.boolean().optional().describe(
          "Force re-fetch from ADO, ignoring any cache"),
      },
      handler: async ({ prId, org, project, repo, refresh }) => {
        if (!session || typeof session.ensurePortal !== "function") {
          throw new Error("Portal launcher unavailable in this context.");
        }
        const bind = await session.ensurePortal({ prId, org, project, repo, refresh });
        const data = await http.get("/api/v1/threads");
        const threads = (data && data.threads) || [];
        const openThreads = threads.filter((t) => !t.resolved);
        return {
          prId: Number(prId),
          portalUrl: bind && bind.url,
          openThreadCount: openThreads.length,
          threads,
        };
      },
    },
    {
      name: "list_threads",
      description:
        "List every comment thread on the open PR with status, file, line, " +
        "and comment count. Use this first to see what's open.",
      inputSchema: {},
      handler: () => http.get("/api/v1/threads"),
    },
    {
      name: "triage_summary",
      description:
        "Get a categorized triage summary of every thread on the PR: counts of " +
        "needs-your-reply / awaiting-reviewer / viewed / for-your-information / resolved, " +
        "plus a per-thread list (anchor, category, gist). Use right after show_feedback to " +
        "give the user a brief spoken summary (e.g. 'X resolved, Y need your reply, Z can be " +
        "ignored') and offer to mark the ignorable (FYI) threads as viewed via mark_viewed.",
      inputSchema: {},
      handler: () => http.get("/api/v1/triage"),
    },
    {
      name: "open_thread",
      description:
        "Open a specific comment thread in the user's browser — a single-thread view " +
        "with the comments and a reply box that shows any staged draft. Use to bring the " +
        "user to a thread you want them to look at, or right after stage_draft so they can " +
        "review and post your proposed reply.",
      inputSchema: { threadId: z.number() },
      handler: async ({ threadId }) => {
        await navigate(`/goto/thread/${threadId}`);
        return { ok: true, opened: `/goto/thread/${threadId}` };
      },
    },
    {
      name: "show_feedback",
      description:
        "Open the Feedback page in the user's browser — a cross-thread triage list of every " +
        "comment thread on the PR with its status (needs your reply / awaiting reviewer / " +
        "viewed / resolved) and expandable full threads. Use when the user wants to triage " +
        "the whole PR at a glance rather than drilling into a single file or thread.",
      inputSchema: {},
      handler: async () => {
        await navigate(`/feedback`);
        return { ok: true, opened: `/feedback` };
      },
    },
    {
      name: "set_view",
      description:
        "Switch the spec reading view the user sees for a file: 'current' (the " +
        "committed text), 'diff' (proposed changes overlaid), or 'proposed' (the " +
        "proposed draft rendered clean). The browser view NEVER auto-flips when " +
        "you stage an edit \u2014 call this after edit_spec / stage_spec_edit so the " +
        "user actually sees the change. Optionally pass fileIndex to navigate to " +
        "that file first.",
      inputSchema: {
        view: z.enum(["current", "diff", "proposed"]).describe("Which view to show"),
        fileIndex: z.number().optional().describe("0-based changed-file index to navigate to first"),
      },
      handler: async ({ view, fileIndex }) => {
        if (typeof fileIndex === "number") await navigate(`/file/${fileIndex}`);
        return http.post("/api/v1/commands/view", { view });
      },
    },
    {
      name: "set_feedback_filter",
      description:
        "Focus the user's Feedback page on a subset of comment threads by pushing " +
        "a filter to the browser: by state(s), reviewer, file, and/or a text query. " +
        "Pass clear=true (or omit everything) to show all. Pair with show_feedback " +
        "to bring the user there. States: 'you' (needs your reply), 'reviewer' " +
        "(awaiting reviewer), 'viewed', 'fyi', 'resolved'.",
      inputSchema: {
        states: z.array(z.enum(["you", "reviewer", "viewed", "fyi", "resolved"])).optional()
          .describe("Thread states to show"),
        reviewer: z.string().optional().describe("Only threads this person authored a comment in"),
        file: z.string().optional().describe("Only threads on this file path"),
        query: z.string().optional().describe("Text search over thread content"),
        clear: z.boolean().optional().describe("Clear the filter (show all)"),
      },
      handler: ({ states, reviewer, file, query, clear }) => {
        const filter = clear ? null : { states, reviewer, file, query };
        return http.post("/api/v1/commands/filter", { filter });
      },
    },
    {
      name: "open_file",
      description:
        "Open a changed file in the user's browser at the file view, optionally scrolled to a " +
        "line. Use to bring the user to a file or section that isn't tied to a comment (e.g. " +
        "\"show me the Meta-programming section\") — resolve a heading to its line with get_spec " +
        "first. Read-only: opens the view, changes nothing.",
      inputSchema: {
        fileIndex: z.number().describe("0-based index into the PR's changed files"),
        line: z.number().optional().describe("1-based line to scroll to"),
      },
      handler: async ({ fileIndex, line }) => {
        const path = `/file/${fileIndex}` + (line ? `?line=${line}` : "");
        await navigate(path);
        return { ok: true, opened: path };
      },
    },
    {
      name: "get_thread",
      description:
        "Get full content of one thread: every comment plus any staged draft. " +
        "Use after list_threads to read what a reviewer actually said.",
      inputSchema: { threadId: z.number().describe("Thread id from list_threads") },
      handler: ({ threadId }) => http.get(`/api/v1/threads/${threadId}`),
    },
    {
      name: "focus_thread",
      description:
        "Scroll the user's browser to a thread and highlight it. RPC command — " +
        "user sees the change within ~1.5s (browser polls). Pass threadId=null " +
        "to clear focus.",
      inputSchema: { threadId: z.number().nullable().describe("Thread id, or null to clear") },
      handler: ({ threadId }) => http.post("/api/v1/commands/focus", { threadId }),
    },
    {
      name: "stage_draft",
      description:
        "Stage a draft reply for the user to review in tippani's UI. The user " +
        "edits or posts it; you never auto-post. Returns 409 if the user is " +
        "currently typing in that thread's textarea (try again in ~10s).",
      inputSchema: {
        threadId: z.number(),
        content: z.string().describe("Markdown body of the suggested reply"),
        source: z.string().optional().describe("Free-form attribution e.g. model name"),
      },
      handler: ({ threadId, content, source }) =>
        http.put(`/api/v1/threads/${threadId}/draft`, { content, source }),
    },
    {
      name: "clear_draft",
      description: "Remove a staged draft. Idempotent.",
      inputSchema: { threadId: z.number() },
      handler: ({ threadId }) => http.delete(`/api/v1/threads/${threadId}/draft`),
    },
    {
      name: "post_reply",
      description:
        "Post a reply to ADO directly (bypasses staging). Use only when the user " +
        "has explicitly approved a reply via this tool's caller. Returns 409 if " +
        "another reply is already in flight for the same thread.",
      inputSchema: {
        threadId: z.number(),
        content: z.string().describe("Reply body to post to ADO"),
      },
      handler: ({ threadId, content }) =>
        http.post(`/api/v1/threads/${threadId}/reply`, { content }),
    },
    {
      name: "resolve_thread",
      description: "Mark a comment thread resolved in ADO.",
      inputSchema: { threadId: z.number() },
      handler: ({ threadId }) =>
        http.post(`/api/v1/threads/${threadId}/resolve`, {}),
    },
    {
      name: "stage_resolve_thread",
      description:
        "Stage a thread resolution LOCALLY without pushing to ADO — it shows as resolved " +
        "(pending) in the portal and is pushed only at Finalize. Use this (not resolve_thread) " +
        "during review so resolves stay local and undoable until the user finalizes.",
      inputSchema: { threadId: z.number() },
      handler: ({ threadId }) =>
        http.post(`/api/v1/threads/${threadId}/stage-resolve`, {}),
    },
    {
      name: "mark_viewed",
      description:
        "Mark a comment thread as viewed/acknowledged WITHOUT resolving it: it drops out " +
        "of the \"needs your reply\" triage but stays open in ADO, and resurfaces if a newer " +
        "comment is added. Durable (stored as an ADO thread property). Use for threads the " +
        "user has read and intentionally left open. Pass clear=true to un-view.",
      inputSchema: {
        threadId: z.number(),
        clear: z.boolean().optional().describe("Un-view the thread instead of marking it viewed"),
      },
      handler: ({ threadId, clear }) =>
        clear
          ? http.delete(`/api/v1/threads/${threadId}/viewed`)
          : http.post(`/api/v1/threads/${threadId}/viewed`, {}),
    },
    {
      name: "get_spec",
      description:
        "Read the rendered markdown of one file in the PR, with a flat list of " +
        "headings (level, text, 1-based line). Use to ground replies in the " +
        "actual spec content. fileIndex matches the order in tippani's file picker.",
      inputSchema: { fileIndex: z.number().describe("0-based index into the PR's changed files") },
      handler: ({ fileIndex }) => http.get(`/api/v1/specs/${fileIndex}`),
    },
    {
      name: "stage_spec_edit",
      description:
        "Stage a proposed whole-file edit for the user to review in tippani's " +
        "editor before committing. The staged draft is review-only: the user sees " +
        "your version as a diff and can load it into the editor to refine, then " +
        "either commits their own version via Save or tells you to commit_spec with " +
        "explicit content. You never commit without the user. Returns 409 if the " +
        "user is currently editing that file (try again in ~10s).",
      inputSchema: {
        fileIndex: z.number().describe("0-based index into the PR's changed files"),
        content: z.string().describe("Full proposed markdown for the file"),
        source: z.string().optional().describe("Free-form attribution e.g. model name"),
      },
      handler: ({ fileIndex, content, source }) =>
        http.put(`/api/v1/specs/${fileIndex}/draft`, { content, source }),
    },
    {
      name: "get_spec_draft",
      description:
        "Read the current staged spec proposal for a file (the version you staged " +
        "via stage_spec_edit). Review-only — it does not reflect unsaved edits the " +
        "user is making in the portal editor. To commit, pass explicit content to " +
        "commit_spec.",
      inputSchema: { fileIndex: z.number() },
      handler: ({ fileIndex }) => http.get(`/api/v1/specs/${fileIndex}/draft`),
    },
    {
      name: "clear_spec_edit",
      description: "Remove a staged spec edit. Idempotent.",
      inputSchema: { fileIndex: z.number() },
      handler: ({ fileIndex }) => http.delete(`/api/v1/specs/${fileIndex}/draft`),
    },
    {
      name: "commit_spec",
      description:
        "Commit a spec file to the PR's source branch. You must pass the full " +
        "content to commit — the staged draft is review-only and is never committed " +
        "implicitly (this prevents a stale proposal from overwriting the user's " +
        "saved edits). Use only after the user approves. Returns 409 if the branch " +
        "moved since load (reload and retry).",
      inputSchema: {
        fileIndex: z.number(),
        content: z.string().describe("Full markdown to commit (required)"),
        message: z.string().optional().describe("Commit message"),
      },
      handler: ({ fileIndex, content, message }) =>
        http.post(`/api/v1/specs/${fileIndex}/commit`, { content, message }),
    },
    {
      name: "edit_spec",
      description:
        "Make surgical edits to one spec file without resending the whole body. " +
        "Applies one or more anchored edits and STAGES the result as a review-only " +
        "draft (like stage_spec_edit \u2014 it never commits; use commit_spec to commit). " +
        "Edits apply to the file's current staged draft if one exists, else the " +
        "committed body, so successive calls accumulate. All edits in a call are " +
        "atomic: if any can't be located, its guard doesn't match, or two overlap, " +
        "nothing is staged. After staging, call set_view('diff') or set_view('current') " +
        "so the user sees the change \u2014 the browser view does not auto-flip. Prefer " +
        "this over stage_spec_edit for anything short of a full rewrite.",
      inputSchema: {
        fileIndex: z.number().describe("0-based index into the PR's changed files"),
        edits: z.array(z.object({
          kind: z.enum(["range", "find"]).describe(
            "'range' = line-range replace guarded by oldString; 'find' = find/replace"),
          startLine: z.number().int().optional().describe("range: 1-based first line (inclusive)"),
          endLine: z.number().int().optional().describe("range: 1-based last line (inclusive)"),
          oldString: z.string().optional().describe(
            "range: exact current text of lines [startLine..endLine]; the edit fails if it doesn't match"),
          newString: z.string().optional().describe("range: replacement text"),
          find: z.string().optional().describe("find: text to locate"),
          replace: z.string().optional().describe("find: replacement text"),
          where: z.enum(["first", "all", "last"]).optional().describe(
            "find: which occurrence(s) to replace (default first)"),
        })).min(1).describe("Edits applied atomically against one snapshot, right-to-left"),
        source: z.string().optional().describe("Free-form attribution e.g. model name"),
      },
      handler: ({ fileIndex, edits, source }) =>
        http.post(`/api/v1/specs/${fileIndex}/edit`, { edits, source }),
    },
    {
      name: "list_prs",
      description:
        "List pull requests to review and open the Discovery page in the user's " +
        "browser (tiles, each links to open the PR). Defaults to YOUR open " +
        "(active) PRs; widen with creator:'any' to find anyone's open PRs, or " +
        "filter by status / reviewer / target branch. Use this to pick a PR " +
        "before open_pr.",
      inputSchema: {
        status: z.enum(["active", "completed", "abandoned", "all"]).optional()
          .describe("PR status (default active)"),
        creator: z.string().optional().describe("'me' (default), 'any'/'all', or an ADO identity id"),
        reviewer: z.string().optional().describe("ADO identity id to filter by reviewer"),
        target: z.string().optional().describe("Target branch (e.g. main)"),
        top: z.number().optional().describe("Max results (default 50)"),
      },
      handler: async ({ status, creator, reviewer, target, top }) => {
        if (session && typeof session.ensureBrowsePortal === "function") {
          await session.ensureBrowsePortal();
        }
        const qs = new URLSearchParams();
        if (status) qs.set("status", status);
        if (creator) qs.set("creator", creator);
        if (reviewer) qs.set("reviewer", reviewer);
        if (target) qs.set("target", target);
        if (typeof top === "number") qs.set("top", String(top));
        const data = await http.get("/api/v1/prs" + (qs.toString() ? "?" + qs.toString() : ""));
        await navigate("/discovery");
        return data;
      },
    },
    {
      name: "search_work_items",
      description:
        "Search Azure DevOps work items with a WIQL query and open the Work items " +
        "tab of the Discovery home in the user's browser. Pass a read-only WIQL " +
        "SELECT (e.g. \"SELECT [System.Id],[System.Title],[System.State] FROM " +
        "workitems WHERE [System.WorkItemType]='Bug' AND [System.State]='Active' " +
        "ORDER BY [System.ChangedDate] DESC\"); optionally a project (defaults to " +
        "the configured project). Use to find the work item a spec belongs to — " +
        "results link out to ADO.",
      inputSchema: {
        wiql: z.string().describe("A read-only WIQL SELECT query against workitems"),
        project: z.string().optional().describe("ADO project to run against (defaults to the configured project)"),
      },
      handler: async ({ wiql, project }) => {
        if (session && typeof session.ensureBrowsePortal === "function") {
          await session.ensureBrowsePortal();
        }
        const data = await http.post("/api/v1/workitems/search", { wiql, project });
        // Carry the query in the URL so the Work items tab prefills it and
        // auto-runs, showing the same results the tool returned to the agent.
        const qs = new URLSearchParams({ tab: "workitems" });
        if (typeof wiql === "string") qs.set("wiql", wiql);
        if (project) qs.set("project", project);
        await navigate("/discovery?" + qs.toString());
        return data;
      },
    },
    {
      name: "search_specs",
      description:
        "Full-text search specs (Markdown) across Azure DevOps and open the Specs " +
        "tab of the Discovery home in the user's browser. Pass freeform search " +
        "text; optionally a project (defaults to the configured project). Results " +
        "are .md specs that open read-only at main; use to find an existing spec " +
        "by its content.",
      inputSchema: {
        query: z.string().describe("Freeform full-text search over spec content"),
        project: z.string().optional().describe("ADO project to search (defaults to the configured project)"),
      },
      handler: async ({ query, project }) => {
        if (session && typeof session.ensureBrowsePortal === "function") {
          await session.ensureBrowsePortal();
        }
        const data = await http.post("/api/v1/specs/search", { query, project });
        // Carry the query in the URL so the Specs tab prefills it and auto-runs,
        // showing the same results the tool returned to the agent.
        const qs = new URLSearchParams({ tab: "specs" });
        if (typeof query === "string") qs.set("q", query);
        if (project) qs.set("project", project);
        await navigate("/discovery?" + qs.toString());
        return data;
      },
    },
    {
      name: "get_file_commits",
      description:
        "Get the raw commit history for one or more spec files in bulk (max 25 " +
        "files per call). Returns full commit records per file — commit id, " +
        "author and committer (name, email, date), message, change counts, and " +
        "url — not just a 'last modified by'. Use when you need authorship or " +
        "history beyond what search_specs carries. Pass `files` as an array of " +
        "{ repo, path, branch? } where `repo` is the repository GUID and `path` " +
        "is the file path (both come straight from search_specs); `branch` " +
        "defaults to the file's default branch. Optionally `top` = commits per " +
        "file (default 10, max 50). Read-only; opens nothing.",
      inputSchema: {
        files: z
          .array(
            z.object({
              repo: z.string().describe("Repository GUID (from search_specs)"),
              path: z.string().describe("File path within the repo (from search_specs)"),
              branch: z.string().optional().describe("Branch (defaults to the file's default branch)"),
            })
          )
          .max(25)
          .describe("Files to fetch commits for (max 25)"),
        top: z.number().int().positive().optional().describe("Commits per file (default 10, max 50)"),
      },
      handler: async ({ files, top }) => {
        if (session && typeof session.ensureBrowsePortal === "function") {
          await session.ensureBrowsePortal();
        }
        return await http.post("/api/v1/commits/info", { files, top });
      },
    },
    // --- Personal Comments (read-only spec page opened from a branch) -----------
    // These act on the file the user has open in the reviewing page and on the
    // selected comment, so most take no coordinates. Navigation/jump/visibility
    // steer the open page (it polls ~1.2s).
    {
      name: "read_personal_comments",
      description:
        "Read ALL personal comments on the spec file the user currently has open " +
        "in the reviewing page (opened from a branch). Returns every comment " +
        "(id, anchor line, author, text, resolved) plus which one is selected. " +
        "Read-only. Optionally target a specific file with repo+branch+path.",
      inputSchema: {
        repo: z.string().optional().describe("Repo GUID (defaults to the open file)"),
        branch: z.string().optional().describe("Branch (defaults to the open file)"),
        path: z.string().optional().describe("File path (defaults to the open file)"),
      },
      handler: async ({ repo, branch, path }) => {
        if (session && typeof session.ensureBrowsePortal === "function") await session.ensureBrowsePortal();
        const q = [["repo", repo], ["branch", branch], ["path", path]]
          .filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
        return http.get("/api/v1/personal-comments/all" + (q ? "?" + q : ""));
      },
    },
    {
      name: "add_personal_comment",
      description:
        "Add a personal comment to the open spec file, anchored to a source line " +
        "(get_spec resolves headings/sections to lines). Saves immediately and " +
        "selects the new comment in the open page.",
      inputSchema: {
        content: z.string().describe("Comment text (markdown allowed)"),
        line: z.number().int().positive().optional().describe("1-based source line to anchor to"),
        repo: z.string().optional(), branch: z.string().optional(), path: z.string().optional(),
      },
      handler: (args) => ensuredPost("/api/v1/personal-comments/mcp/add", args),
    },
    {
      name: "edit_personal_comment",
      description:
        "Edit a personal comment's text. Defaults to the SELECTED comment; pass " +
        "id to target a specific one. Emptying the text keeps an empty comment " +
        "(use delete to remove).",
      inputSchema: {
        content: z.string().describe("New comment text"),
        id: z.string().optional().describe("Comment id (defaults to the selected comment)"),
        repo: z.string().optional(), branch: z.string().optional(), path: z.string().optional(),
      },
      handler: (args) => ensuredPost("/api/v1/personal-comments/mcp/edit", args),
    },
    {
      name: "delete_personal_comment",
      description:
        "Delete a personal comment. Defaults to the SELECTED comment; pass id to " +
        "target a specific one.",
      inputSchema: { id: z.string().optional().describe("Comment id (defaults to the selected comment)"), repo: z.string().optional(), branch: z.string().optional(), path: z.string().optional() },
      handler: (args) => ensuredPost("/api/v1/personal-comments/mcp/delete", args),
    },
    {
      name: "reply_personal_comment",
      description:
        "Post a reply on a personal comment — a follow-up note recorded under the " +
        "comment (e.g. how you addressed the feedback). Defaults to the SELECTED " +
        "comment; pass id to target a specific one. Reflects live in the open page.",
      inputSchema: {
        content: z.string().describe("The reply text (Markdown), e.g. what you changed to address the comment"),
        id: z.string().optional().describe("Comment id (defaults to the selected comment)"),
        repo: z.string().optional(), branch: z.string().optional(), path: z.string().optional(),
      },
      handler: async (args) => {
        if (session && typeof session.ensureBrowsePortal === "function") await session.ensureBrowsePortal();
        return http.post("/api/v1/personal-comments/mcp/reply", args);
      },
    },
    {
      name: "resolve_personal_comment",
      description:
        "Mark a personal comment resolved (or reopen it with resolved=false). " +
        "Defaults to the SELECTED comment; pass id to target a specific one. When " +
        "resolving after addressing feedback, pass `note` with a short summary of " +
        "what you changed — it's posted as a reply on the comment BEFORE resolving, " +
        "so the reviewer sees how it was handled (don't just silently resolve).",
      inputSchema: {
        id: z.string().optional().describe("Comment id (defaults to the selected comment)"),
        resolved: z.boolean().optional().describe("true = resolve (default), false = reopen"),
        note: z.string().optional().describe("Short summary of how you addressed the comment; posted as a reply before resolving"),
        repo: z.string().optional(), branch: z.string().optional(), path: z.string().optional(),
      },
      handler: async (args) => {
        if (session && typeof session.ensureBrowsePortal === "function") await session.ensureBrowsePortal();
        return http.post("/api/v1/personal-comments/mcp/resolve", args);
      },
    },
    {
      name: "delete_resolved_personal_comments",
      description:
        "Delete ALL resolved personal comments on the open spec file. Returns how " +
        "many were removed. Reflects live in the open page.",
      inputSchema: {},
      handler: (args) => ensuredPost("/api/v1/personal-comments/mcp/delete-resolved", args || {}),
    },
    {
      name: "delete_all_personal_comments",
      description:
        "Delete EVERY personal comment on the open spec file (resolved or not). " +
        "Irreversible. Reflects live in the open page.",
      inputSchema: {},
      handler: (args) => ensuredPost("/api/v1/personal-comments/mcp/clear", args || {}),
    },
    {
      name: "navigate_personal_comments",
      description:
        "Move the selection to the next/previous personal comment (or first/last) " +
        "and scroll the open page to it. next/prev wrap around.",
      inputSchema: {
        direction: z.enum(["next", "prev", "first", "last"]).describe("Which comment to select"),
      },
      handler: ({ direction }) => ensuredPost("/api/v1/personal-comments/mcp/nav", { direction }),
    },
    {
      name: "jump_to_personal_comment",
      description:
        "Select and scroll the open page to a specific personal comment — by id, " +
        "or by the source line it's anchored to.",
      inputSchema: {
        id: z.string().optional().describe("Comment id"),
        line: z.number().int().positive().optional().describe("Anchor line to jump to"),
      },
      handler: (args) => ensuredPost("/api/v1/personal-comments/mcp/jump", args),
    },
    {
      name: "show_resolved_personal_comments",
      description:
        "Hide or show resolved personal comments in the open reviewing page. " +
        "show=false hides resolved ones; show=true (default) shows them all.",
      inputSchema: { show: z.boolean().optional().describe("true = show resolved (default), false = hide") },
      handler: ({ show }) => ensuredPost("/api/v1/personal-comments/mcp/show-resolved", { show: show !== false }),
    },
    {
      name: "open_branch",
      description:
        "Open the Branches file-list page for a branch in the user's browser " +
        "(the read-only review entry). Use to steer the user to a branch's " +
        "changed specs. For a remote (ADO) branch pass project, repo (GUID or " +
        "name) and branch. For a fully-local clone pass localPath (the clone " +
        "path on disk) and branch instead — no ADO is touched.",
      inputSchema: {
        project: z.string().optional().describe("ADO project (defaults to the portal's project)"),
        repo: z.string().optional().describe("Repo GUID or name (remote mode)"),
        branch: z.string().describe("Branch name (e.g. dev/kay/x)"),
        localPath: z.string().optional().describe("Local clone path on disk (local mode; overrides repo/project)"),
      },
      handler: async (args) => {
        if (session && typeof session.ensureBrowsePortal === "function") {
          await session.ensureBrowsePortal();
        }
        return http.post("/api/v1/spec/open-branch", args);
      },
    },
    {
      name: "open_branch_file",
      description:
        "Open ONE spec file read-only in the reviewing view for a branch, so the " +
        "user can read it and the personal-comment tools have a target. For a " +
        "remote (ADO) branch pass project, repo (GUID or name), branch and path. " +
        "For a fully-local clone pass localPath, branch and path instead — the " +
        "file is read from disk and no ADO is touched. Read-only.",
      inputSchema: {
        project: z.string().optional().describe("ADO project (defaults to the portal's project)"),
        repo: z.string().optional().describe("Repo GUID or name (remote mode)"),
        branch: z.string().describe("Branch name"),
        path: z.string().describe("File path within the repo (e.g. /Specs/Foo.md)"),
        localPath: z.string().optional().describe("Local clone path on disk (local mode; overrides repo/project)"),
      },
      handler: async (args) => {
        if (session && typeof session.ensureBrowsePortal === "function") {
          await session.ensureBrowsePortal();
        }
        return http.post("/api/v1/spec/open-branch-file", args);
      },
    },
    {
      name: "open_local_file",
      description:
        "Open ONE arbitrary .md file read-only in the reviewing view by its " +
        "absolute path on disk (no branch, no ADO), so the user can read it and " +
        "the personal-comment tools have a target. The file must sit inside a " +
        "folder the user has opened in Tippani (an approved root) — a path " +
        "outside every approved root is rejected, never read. Read-only.",
      inputSchema: {
        path: z.string().describe("Absolute path to a .md file inside an approved root"),
      },
      handler: async (args) => {
        if (session && typeof session.ensureBrowsePortal === "function") {
          await session.ensureBrowsePortal();
        }
        return http.post("/api/v1/spec/open-file", args);
      },
    },
    {
      name: "refresh_spec",
      description:
        "Refresh the spec file the user has open in the reviewing page — reloads " +
        "it from source (ADO for a PR, or the local clone's branch/working tree " +
        "in local review) so a change made outside Tippani becomes visible. Use " +
        "after making a change the user asked for, to show them the result.",
      inputSchema: {},
      handler: (args) => ensuredPost("/api/v1/spec/refresh", args || {}),
    },
    // ---- Remote spec authoring write tools (clickstop 2, step 13) ----
    {
      name: "create_branch",
      description:
        "Create (or adopt) a branch to author a spec on, in an EXPLICIT project + " +
        "repo (Tippani never guesses the repo). Resolves a base branch " +
        "(main/master/develop/trunk unless you pass one) and returns the new " +
        "branch and its tip. Idempotent: an existing branch is adopted, not " +
        "re-created. " + NEVER_RAW_RULE,
      inputSchema: {
        project: z.string().describe("ADO project name (required — the write target)"),
        repo: z.string().describe("ADO repository name (required — the write target)"),
        branch: z.string().describe("Branch name to create/adopt, e.g. spec/my-feature"),
        base: z.string().optional().describe("Base branch to fork from (defaults to main/master/develop/trunk)"),
        org: z.string().optional().describe("ADO org URL (defaults to the configured org)"),
      },
      handler: async ({ org, project, repo, branch, base }) => {
        const r = await ensuredPost("/api/v1/spec/create-branch", { org, project, repo, branch, base });
        return withHints("create_branch", r, { repo: r.repo, branch: r.branch, path: null });
      },
    },
    {
      name: "stage_spec",
      description:
        "Stage a whole-file spec markdown draft for (project, repo, branch, path). " +
        "The draft is written durably but NOT committed — call push_spec to commit. " +
        "Collides with a 409 if the user is editing the same file. " + NEVER_RAW_RULE,
      inputSchema: {
        project: z.string().describe("ADO project name (required — the write target)"),
        repo: z.string().describe("ADO repository name (required — the write target)"),
        branch: z.string().describe("Branch to author on (from create_branch)"),
        path: z.string().describe("Spec file path within the repo, e.g. docs/spec.md"),
        body: z.string().describe("Full markdown body of the spec"),
        baseObjectId: z.string().optional().describe("Object id the draft is based on (set for an existing file; omit for a new file)"),
        org: z.string().optional().describe("ADO org URL (defaults to the configured org)"),
      },
      handler: async ({ org, project, repo, branch, path, body, baseObjectId }) => {
        const r = await ensuredPut("/api/v1/specs/draft", { org, project, repo, branch, path, body, baseObjectId });
        return withHints("stage_spec", r, { repo, branch, path });
      },
    },
    {
      name: "push_spec",
      description:
        "Commit EVERY staged draft for (project, repo, branch) as one " +
        "all-or-nothing commit. Fails with 409 if the branch moved since you " +
        "staged (re-stage against the new tip). " + NEVER_RAW_RULE,
      inputSchema: {
        project: z.string().describe("ADO project name (required — the write target)"),
        repo: z.string().describe("ADO repository name (required — the write target)"),
        branch: z.string().describe("Branch to commit to"),
        message: z.string().optional().describe("Commit message"),
        oldObjectId: z.string().optional().describe("Branch tip you staged against, for optimistic concurrency"),
        org: z.string().optional().describe("ADO org URL (defaults to the configured org)"),
      },
      handler: async ({ org, project, repo, branch, message, oldObjectId }) => {
        const r = await ensuredPost("/api/v1/specs/draft/push", { org, project, repo, branch, message, oldObjectId });
        return withHints("push_spec", r, { repo, branch, path: null });
      },
    },
    {
      name: "create_spec_pr",
      description:
        "Open a pull request for the authored branch (in an EXPLICIT project + " +
        "repo — Tippani never guesses the repo) and find-or-create-and-link a Spec " +
        "review work item. Title and work-item type are yours to supply — Tippani " +
        "never infers them. " + NEVER_RAW_RULE,
      inputSchema: {
        project: z.string().describe("ADO project name (required — the write target)"),
        repo: z.string().describe("ADO repository name (required — the write target)"),
        title: z.string().describe("PR title (never inferred)"),
        sourceBranch: z.string().describe("Branch to merge from (the authored branch)"),
        targetBranch: z.string().describe("Branch to merge into, e.g. main"),
        description: z.string().optional().describe("PR description"),
        isDraft: z.boolean().optional().describe("Open as a draft PR (default true)"),
        workItemTitle: z.string().optional().describe("Spec review work item title to find or create"),
        workItemType: z.string().optional().describe("Work item type (required when workItemTitle is set; never inferred)"),
        org: z.string().optional().describe("ADO org URL (defaults to the configured org)"),
      },
      handler: async (args) => {
        const r = await ensuredPost("/api/v1/pr/open", args);
        return withHints("create_spec_pr", r, { repo: null, branch: args.sourceBranch, path: null });
      },
    },
  ];
}
