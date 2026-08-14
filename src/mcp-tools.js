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
    delete: (p, b) => req("DELETE", p, b),
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
      await http.post("/api/v1/nav", { path });
    }
  }
  // Best-effort variant for tools whose PRIMARY result is fetched data and the
  // browser steer is a courtesy (list_prs, search_specs, search_work_items): a
  // failed steer must not discard the successfully-fetched result as a tool
  // error. Returns {} on success or { navError } to merge into the result.
  // Tools whose purpose IS navigation (open_thread, open_file, show_feedback,
  // set_view) keep the strict navigate() so a failed move is reported as one.
  async function navigateBestEffort(path) {
    try { await navigate(path); return {}; }
    catch (e) { return { navError: String(e?.message || e) }; }
  }
  // POST that first keeps the current provider portal live, self-healing a
  // dropped GitHub review instead of silently switching mutations to ADO.
  async function ensuredPost(path, body) {
    if (session && typeof session.ensureActivePortal === "function") {
      await session.ensureActivePortal();
    } else if (session && typeof session.ensureBrowsePortal === "function") {
      await session.ensureBrowsePortal();
    }
    return http.post(path, body || {});
  }
  async function ensuredPut(path, body) {
    if (session && typeof session.ensureBrowsePortal === "function") await session.ensureBrowsePortal();
    return http.put(path, body || {});
  }
  async function ensuredDelete(path, body) {
    if (session && typeof session.ensureBrowsePortal === "function") await session.ensureBrowsePortal();
    return http.delete(path, body || {});
  }
  // A user-facing portal link must be a single-use sign-in URL: the portal
  // refuses an unauthenticated browser, so the bare base URL is never usable.
  async function browserSessionUrl(returnTo = "/") {
    if (!session || typeof session.createBrowserSessionUrl !== "function") return null;
    return session.createBrowserSessionUrl(returnTo);
  }
  return [
    {
      name: "open_pr",
      description:
        "Open a spec PR in the tippani review portal and load its comment " +
        "threads and changed files. The portal runs headless: this returns a " +
        "`portalUrl` for the review — SHOW that URL to the user (a clickable " +
        "link) or open it yourself in a code block so they can watch the " +
        "review. This opens a specific PR for review; the PR-review reading and " +
        "comment tools (list_threads, get_thread, get_spec, set_view, and the " +
        "reply/resolve tools) act on the PR opened here, so open the PR before " +
        "using them. It is not the only entry point: to browse first use " +
        "list_prs / search_specs / search_work_items, and to read branch or " +
        "local files use open_branch / open_branch_file / open_local_file " +
        "(those launch the portal themselves). This is the only supported way " +
        "to review a spec PR; do not use the Azure DevOps MCP or git for PR " +
        "review. For Azure DevOps call this with ONLY prId — the signed-in account supplies the " +
        "org and project automatically. Do NOT pass org/project yourself: " +
        "guessing them sends the portal to the wrong org and it fails to launch. " +
        "Supply org/project ONLY if a previous open_pr call returned an error " +
        "saying the org or project could not be determined.",
      inputSchema: {
        prId: z.number().describe("Pull request id/number"),
        provider: z.enum(["ado", "github"]).optional().describe(
          "Repository host. Defaults to ado. For GitHub also pass owner and repo."),
        owner: z.string().optional().describe(
          "GitHub repository owner (required when provider=github)."),
        org: z.string().optional().describe(
          "Do NOT set this normally — the signed-in account supplies the org. " +
          "Only pass it (e.g. https://dev.azure.com/myorg) if a previous open_pr " +
          "call failed because the org could not be determined."),
        project: z.string().optional().describe(
          "Do NOT set this normally — the signed-in account supplies the project. " +
          "Only pass it if a previous open_pr call failed because the project " +
          "could not be determined."),
        repo: z.string().optional().describe(
          "ADO repo name (optional; auto-detected from the PR)"),
        refresh: z.boolean().optional().describe(
          "Force re-fetch from ADO, ignoring any cache"),
        headless: z.boolean().optional().describe(
          "Default true: the portal is not opened on the host — you get the " +
          "portalUrl back to show or open yourself. Set false ONLY if the user " +
          "wants tippani to pop the portal in their OS default browser."),
      },
      handler: async ({
        prId, provider, owner, org, project, repo, refresh, headless,
      }) => {
        if (!session || typeof session.ensurePortal !== "function") {
          throw new Error("Portal launcher unavailable in this context.");
        }
        const bind = await session.ensurePortal({
          prId,
          provider: provider || "ado",
          owner,
          org,
          project,
          repo,
          refresh,
          headless,
        });
        const data = await http.get("/api/v1/threads");
        const threads = (data && data.threads) || [];
        const openThreads = threads.filter((t) => !t.resolved);
        const isHeadless = headless !== false;
        return {
          prId: Number(prId),
          portalUrl: bind && bind.url,
          headless: isHeadless,
          note: isHeadless
            ? "The review portal is running HEADLESS in the background — it is NOT open on the " +
              "user's screen and you did NOT open it. Do not say it is 'open in the portal', " +
              "'opened', or that a window/browser is up. Give the user the portalUrl as a " +
              "clickable link so they can open it themselves if they want to watch, e.g. \"PR #" +
              Number(prId) + " is loaded and ready in Tippani (running in the background) — open " +
              "it to review: " + (bind && bind.url) + "\"."
            : "Opened the portal in the user's default browser; you may also share the portalUrl.",
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
        "ignored') and help the user decide which threads need staged replies or resolutions.",
      inputSchema: {},
      handler: () => http.get("/api/v1/triage"),
    },
    {
      name: "open_thread",
      description:
        "Select one comment thread for both the user and yourself. For a file-anchored " +
        "thread, the browser opens its file and scrolls both the thread pane and file " +
        "contents to the anchor; a PR-level thread opens its standalone view. Returns the " +
        "full thread content and any staged draft, so do not follow it with get_thread. " +
        "Use whenever the user names, selects, or asks to inspect a specific thread, and " +
        "right after stage_draft so they can review the proposed reply.",
      inputSchema: { threadId: z.number() },
      handler: async ({ threadId }) => {
        const thread = await http.get(`/api/v1/threads/${threadId}`);
        const opened = `/goto/thread/${threadId}`;
        await navigate(opened);
        return { ok: true, opened, thread };
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
        "you stage an edit — call this after edit_spec so the " +
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
      name: "go_to_line",
      description:
        "Scroll the file the user ALREADY has open to a 1-based source line, without " +
        "reopening or switching files. Use for \"scroll to line 130\" / \"jump to that " +
        "section\" once a file is open (any surface: a PR file, a branch file, or a " +
        "local file). Read-only same-page scroll — creates no annotation and changes " +
        "nothing. The open page acts within ~1.5s (it polls).",
      inputSchema: {
        line: z.number().int().min(1).describe("1-based source line to scroll to"),
      },
      handler: ({ line }) => http.post("/api/v1/commands/go-to-line", { line }),
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
      name: "stage_resolve_thread",
      description:
        "Stage a thread resolution LOCALLY without pushing to ADO — it shows as resolved " +
        "(pending) in the portal and is pushed only with push_staged_changes. " +
        "during review so resolves stay local and undoable until the user finalizes.",
      inputSchema: { threadId: z.number() },
      handler: ({ threadId }) =>
        http.post(`/api/v1/threads/${threadId}/stage-resolve`, {}),
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
      name: "get_spec_draft",
      description:
        "Read the current staged spec proposal for a PR file. Review-only — it " +
        "does not reflect unsaved edits the user is making in the portal editor.",
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
      name: "edit_spec",
      description:
        "Make surgical edits to one spec file without resending the whole body. " +
        "Applies one or more anchored edits and STAGES the result as a review-only " +
        "draft. It never commits; publish staged work only through " +
        "push_staged_changes. " +
        "Edits apply to the file's current staged draft if one exists, else the " +
        "committed body, so successive calls accumulate. All edits in a call are " +
        "atomic: if any can't be located, its guard doesn't match, or two overlap, " +
        "nothing is staged. After staging, call set_view('diff') or set_view('current') " +
        "so the user sees the change \u2014 the browser view does not auto-flip. Prefer " +
        "this for PR-bound surgical edits.",
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
        "filter by status / reviewer / target branch. Supports Azure DevOps by " +
        "default; for GitHub pass provider:'github', owner, and repo.",
      inputSchema: {
        provider: z.enum(["ado", "github"]).optional()
          .describe("Repository host. Defaults to ado."),
        owner: z.string().optional()
          .describe("GitHub owner (required when provider=github)"),
        repo: z.string().optional()
          .describe("GitHub repository anchor (required when provider=github)"),
        status: z.enum(["active", "completed", "abandoned", "all"]).optional()
          .describe("PR status (default active)"),
        creator: z.string().optional().describe("'me' (default), 'any'/'all', or a host identity id/login"),
        reviewer: z.string().optional().describe("Host identity id/login to filter by reviewer"),
        target: z.string().optional().describe("Target branch (e.g. main)"),
        top: z.number().optional().describe("Max results (default 50)"),
      },
      handler: async ({
        provider, owner, repo, status, creator, reviewer, target, top,
      }) => {
        if (session && typeof session.ensureBrowsePortal === "function") {
          await session.ensureBrowsePortal({
            provider: provider || "ado",
            owner,
            repo,
          });
        }
        const qs = new URLSearchParams();
        if (status) qs.set("status", status);
        if (creator) qs.set("creator", creator);
        if (reviewer) qs.set("reviewer", reviewer);
        if (target) qs.set("target", target);
        if (typeof top === "number") qs.set("top", String(top));
        const data = await http.get("/api/v1/prs" + (qs.toString() ? "?" + qs.toString() : ""));
        const nav = await navigateBestEffort("/discovery");
        return { ...data, ...nav };
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
          await session.ensureBrowsePortal({ provider: "ado" });
        }
        const data = await http.post("/api/v1/workitems/search", { wiql, project });
        // Carry the query in the URL so the Work items tab prefills it and
        // auto-runs, showing the same results the tool returned to the agent.
        const qs = new URLSearchParams({ tab: "workitems" });
        if (typeof wiql === "string") qs.set("wiql", wiql);
        if (project) qs.set("project", project);
        const nav = await navigateBestEffort("/discovery?" + qs.toString());
        return { ...data, ...nav };
      },
    },
    {
      name: "search_specs",
      description:
        "Full-text search Markdown specs and open the Specs tab of Discovery. " +
        "Supports Azure DevOps by default; for GitHub pass provider:'github', " +
        "owner, and repo. The project field scopes ADO to a project or GitHub to " +
        "an owner namespace.",
      inputSchema: {
        provider: z.enum(["ado", "github"]).optional()
          .describe("Repository host. Defaults to ado."),
        owner: z.string().optional()
          .describe("GitHub owner (required when provider=github)"),
        repo: z.string().optional()
          .describe("GitHub repository anchor (required when provider=github)"),
        query: z.string().describe("Freeform full-text search over spec content"),
        project: z.string().optional().describe("ADO project or GitHub owner namespace"),
      },
      handler: async ({ provider, owner, repo, query, project }) => {
        if (session && typeof session.ensureBrowsePortal === "function") {
          await session.ensureBrowsePortal({
            provider: provider || "ado",
            owner,
            repo,
          });
        }
        const data = await http.post("/api/v1/specs/search", { query, project });
        // Carry the query in the URL so the Specs tab prefills it and auto-runs,
        // showing the same results the tool returned to the agent.
        const qs = new URLSearchParams({ tab: "specs" });
        if (typeof query === "string") qs.set("q", query);
        if (project) qs.set("project", project);
        const nav = await navigateBestEffort("/discovery?" + qs.toString());
        return { ...data, ...nav };
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
      name: "read_annotations",
      description:
        "Read ALL annotations on the spec file the user currently has open " +
        "in the reviewing page. Returns every annotation (id, anchor line, " +
        "author, text, resolved) plus which one is selected. Read-only. " +
        "Defaults to the open file; to target one explicitly pass repo+branch+path. " +
        "For a LOCAL file (opened with open_local_file) the addressing is " +
        "repo=\"file:<absolute path>\", branch=\"\" (empty), path=\"<absolute path>\" " +
        "\u2014 open_local_file returns exactly these fields, so pass them back verbatim.",
      inputSchema: {
        repo: z.string().optional().describe("Repo GUID, or file:<absolute path> for a local file (defaults to the open file)"),
        branch: z.string().optional().describe("Branch; empty string \"\" for a local file (defaults to the open file)"),
        path: z.string().optional().describe("File path (defaults to the open file)"),
      },
      handler: async ({ repo, branch, path }) => {
        if (session && typeof session.ensureBrowsePortal === "function") await session.ensureBrowsePortal();
        // Keep an explicit empty-string branch (correct for a file: local file);
        // only drop genuinely-absent (null/undefined) coordinates.
        const q = [["repo", repo], ["branch", branch], ["path", path]]
          .filter(([, v]) => v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
        return http.get("/api/v1/annotations/all" + (q ? "?" + q : ""));
      },
    },
    {
      name: "add_annotation",
      description:
        "Add an annotation to the open spec file, anchored to a source line " +
        "(get_spec resolves headings/sections to lines). Saves immediately and " +
        "selects the new annotation in the open page.",
      inputSchema: {
        content: z.string().describe("Annotation text (markdown allowed)"),
        line: z.number().int().positive().optional().describe("1-based source line to anchor to"),
        repo: z.string().optional(), branch: z.string().optional(), path: z.string().optional(),
      },
      handler: (args) => ensuredPost("/api/v1/annotations/mcp/add", args),
    },
    {
      name: "edit_annotation",
      description:
        "Edit an annotation's text. Defaults to the SELECTED annotation; pass " +
        "id to target a specific one. Emptying the text keeps an empty annotation " +
        "(use delete to remove).",
      inputSchema: {
        content: z.string().describe("New annotation text"),
        id: z.string().optional().describe("Annotation id (defaults to the selected annotation)"),
        repo: z.string().optional(), branch: z.string().optional(), path: z.string().optional(),
      },
      handler: (args) => ensuredPost("/api/v1/annotations/mcp/edit", args),
    },
    {
      name: "delete_annotation",
      description:
        "Delete an annotation. Defaults to the SELECTED annotation; pass id to " +
        "target a specific one.",
      inputSchema: { id: z.string().optional().describe("Annotation id (defaults to the selected annotation)"), repo: z.string().optional(), branch: z.string().optional(), path: z.string().optional() },
      handler: (args) => ensuredPost("/api/v1/annotations/mcp/delete", args),
    },
    {
      name: "reply_annotation",
      description:
        "Post a reply on an annotation — a follow-up note recorded under the " +
        "annotation (e.g. how you addressed the feedback). Defaults to the SELECTED " +
        "annotation; pass id to target a specific one. Reflects live in the open page.",
      inputSchema: {
        content: z.string().describe("The reply text (Markdown), e.g. what you changed to address the annotation"),
        id: z.string().optional().describe("Annotation id (defaults to the selected annotation)"),
        repo: z.string().optional(), branch: z.string().optional(), path: z.string().optional(),
      },
      handler: async (args) => {
        if (session && typeof session.ensureBrowsePortal === "function") await session.ensureBrowsePortal();
        return http.post("/api/v1/annotations/mcp/reply", args);
      },
    },
    {
      name: "resolve_annotation",
      description:
        "Mark an annotation resolved (or reopen it with resolved=false). " +
        "Defaults to the SELECTED annotation; pass id to target a specific one. When " +
        "resolving after addressing feedback, pass `note` with a short summary of " +
        "what you changed — it's posted as a reply on the annotation BEFORE resolving, " +
        "so the reviewer sees how it was handled (don't just silently resolve).",
      inputSchema: {
        id: z.string().optional().describe("Annotation id (defaults to the selected annotation)"),
        resolved: z.boolean().optional().describe("true = resolve (default), false = reopen"),
        note: z.string().optional().describe("Short summary of how you addressed the annotation; posted as a reply before resolving"),
        repo: z.string().optional(), branch: z.string().optional(), path: z.string().optional(),
      },
      handler: async (args) => {
        if (session && typeof session.ensureBrowsePortal === "function") await session.ensureBrowsePortal();
        return http.post("/api/v1/annotations/mcp/resolve", args);
      },
    },
    {
      name: "delete_resolved_annotations",
      description:
        "Delete ALL resolved annotations on the open spec file. Returns how " +
        "many were removed. Reflects live in the open page.",
      inputSchema: {},
      handler: (args) => ensuredPost("/api/v1/annotations/mcp/delete-resolved", args || {}),
    },
    {
      name: "delete_all_annotations",
      description:
        "Delete EVERY annotation on the open spec file (resolved or not). " +
        "Irreversible. Reflects live in the open page.",
      inputSchema: {},
      handler: (args) => ensuredPost("/api/v1/annotations/mcp/clear", args || {}),
    },
    {
      name: "navigate_annotations",
      description:
        "Move the selection to the next/previous annotation (or first/last) " +
        "and scroll the open page to it. next/prev wrap around.",
      inputSchema: {
        direction: z.enum(["next", "prev", "first", "last"]).describe("Which annotation to select"),
      },
      handler: ({ direction }) => ensuredPost("/api/v1/annotations/mcp/nav", { direction }),
    },
    {
      name: "jump_to_annotation",
      description:
        "Select and scroll the open page to a specific annotation — by id, " +
        "or by the source line it's anchored to.",
      inputSchema: {
        id: z.string().optional().describe("Annotation id"),
        line: z.number().int().positive().optional().describe("Anchor line to jump to"),
      },
      handler: (args) => ensuredPost("/api/v1/annotations/mcp/jump", args),
    },
    {
      name: "show_resolved_annotations",
      description:
        "Hide or show resolved annotations in the open reviewing page. " +
        "show=false hides resolved ones; show=true (default) shows them all.",
      inputSchema: { show: z.boolean().optional().describe("true = show resolved (default), false = hide") },
      handler: ({ show }) => ensuredPost("/api/v1/annotations/mcp/show-resolved", { show: show !== false }),
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
        "the annotation tools have a target. The file must sit inside a " +
        "folder the user has opened in Tippani (an approved root) \u2014 a path " +
        "outside every approved root is rejected, never read. Read-only. Returns " +
        "the file's annotation addressing (repo=\"file:<abs path>\", branch=\"\", " +
        "path) \u2014 pass those back to read_annotations/add_annotation to target it.",
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
      name: "open_local_only",
      description:
        "Start Tippani in local-only mode on the Discovery page — no Azure DevOps " +
        "and NO token required, and no arguments. Brings the portal up (reusing a " +
        "running one) and returns a `portalUrl`; SHOW that as a clickable link. It " +
        "is a SINGLE-USE sign-in link — the portal refuses an unauthenticated " +
        "browser, so it works once and then expires; use get_portal_url for a new " +
        "one. Use this to open Tippani for local review (open_branch / " +
        "open_branch_file / open_local_file) without signing in to ADO. The ADO " +
        "discovery tools (list_prs / open_pr) still need a token.",
      inputSchema: {},
      handler: async () => {
        if (!session || typeof session.ensureBrowsePortal !== "function") {
          throw new Error("Portal launcher unavailable in this context.");
        }
        await session.ensureBrowsePortal();
        return {
          portalUrl: await browserSessionUrl(),
          running: !!(typeof session.getToken === "function" && session.getToken()),
          singleUse: true,
          note: "Local-only mode — no ADO token required. The portalUrl is a one-time sign-in link.",
        };
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
    // ---- Staged spec authoring tools -------------------------------------
    {
      name: "stage_branch",
      description:
        "Stage a branch creation in Tippani without creating anything remotely. " +
        "push_staged_changes creates it later. " + NEVER_RAW_RULE,
      inputSchema: {
        project: z.string().describe("ADO project or GitHub owner (required — the write target)"),
        repo: z.string().describe("Repository id/name or owner/name (required — the write target)"),
        repoName: z.string().optional().describe("Repository display name"),
        branch: z.string().describe("Branch name to stage, e.g. spec/my-feature"),
        base: z.string().optional().describe("Base branch to fork from (defaults to main/master/develop/trunk)"),
        org: z.string().describe("Host org URL; use https://github.com for GitHub (required — never inferred for writes)"),
      },
      handler: async (args) => {
        const r = await ensuredPost("/api/v1/branches/stage", args);
        return withHints("stage_branch", r, { repo: args.repo, branch: args.branch, path: null });
      },
    },
    {
      name: "stage_spec",
      description:
        "Stage a whole-file spec in the same aggregate store used by the portal. " +
        "Set existing=true and pass the load-time branch tip when updating an " +
        "existing file. Nothing is written remotely until push_staged_changes. " + NEVER_RAW_RULE,
      inputSchema: {
        project: z.string().describe("ADO project or GitHub owner (required — the write target)"),
        repo: z.string().describe("Repository id/name or owner/name (required — the write target)"),
        repoName: z.string().optional().describe("Repository display name"),
        branch: z.string().describe("Branch to author on"),
        path: z.string().describe("Spec file path within the repo, e.g. docs/spec.md"),
        body: z.string().describe("Full markdown body of the spec"),
        existing: z.boolean().optional().describe("True when updating an existing remote file"),
        baseObjectId: z.string().optional().describe("Load-time branch tip; required for an existing file"),
        org: z.string().describe("Host org URL; use https://github.com for GitHub (required — never inferred for writes)"),
      },
      handler: async ({ org, project, repo, repoName, branch, path, body, existing, baseObjectId }) => {
        if (existing && !baseObjectId) throw new Error("baseObjectId is required when existing=true");
        const target = { org, project, repo, repoName, branch, path };
        const r = existing
          ? await ensuredPost("/api/v1/files/edit", { ...target, content: body, baseObjectId })
          : await ensuredPost("/api/v1/files/stage", target);
        if (!existing && r && r.ok) await ensuredPost("/api/v1/files/content", { repo, branch, path, content: body });
        return withHints("stage_spec", r, { repo, branch, path });
      },
    },
    {
      name: "stage_spec_pr",
      description:
        "Stage a pull-request intent without creating a remote PR or work item. " +
        "push_staged_changes publishes it after its staged branch and files. " + NEVER_RAW_RULE,
      inputSchema: {
        project: z.string().describe("ADO project or GitHub owner (required — the write target)"),
        repo: z.string().describe("Repository name or owner/name (required — the write target)"),
        title: z.string().describe("PR title (never inferred)"),
        sourceBranch: z.string().describe("Branch to merge from"),
        targetBranch: z.string().describe("Branch to merge into, e.g. main"),
        description: z.string().optional().describe("PR description"),
        isDraft: z.boolean().optional().describe("Open as a draft PR (default true)"),
        workItemTitle: z.string().optional().describe("ADO-only: Spec review work item title to find or create"),
        workItemType: z.string().optional().describe("ADO-only: required when workItemTitle is set"),
        org: z.string().describe("Host org URL; use https://github.com for GitHub (required — never inferred for writes)"),
      },
      handler: async (args) => {
        const r = await ensuredPost("/api/v1/pr/stage", args);
        return withHints("stage_spec_pr", r, { repo: args.repo, branch: args.sourceBranch, path: null });
      },
    },
    {
      name: "push_staged_changes",
      description:
        "Publish every currently staged branch, folder, file update, PR intent, " +
        "reply, and resolution. This is the sole MCP authoring operation that " +
        "writes staged changes remotely; failures remain staged. " + NEVER_RAW_RULE,
      inputSchema: {},
      handler: async () => {
        const r = await ensuredPost("/api/v1/branches/push", {});
        return withHints("push_staged_changes", r, {});
      },
    },
    {
      name: "start_tippani",
      description:
        "Start the Tippani portal (browse mode) without opening a specific PR and " +
        "return a `portalUrl`. That URL is a SINGLE-USE sign-in link: the portal " +
        "refuses an unauthenticated browser, so the bare address will not work and " +
        "the link stops working once opened or after it expires. SHOW it to the " +
        "user as a clickable link, never a plain address, and call this again for " +
        "a fresh one rather than reusing an old link. The portal runs in the " +
        "background. The entry tools (open_pr, list_prs, search_specs, " +
        "open_branch, …) also start the portal themselves — this is the explicit " +
        "start. Safe to call when already running (adopts it and mints a new link).",
      inputSchema: {},
      handler: async () => {
        if (!session || typeof session.ensureBrowsePortal !== "function") {
          throw new Error("Portal launcher unavailable in this context.");
        }
        await session.ensureBrowsePortal();
        const portalUrl = await browserSessionUrl();
        return {
          portalUrl,
          running: !!(typeof session.getToken === "function" && session.getToken()),
          singleUse: true,
          note:
            "Tippani is running in the background. The portalUrl is a one-time " +
            "sign-in link — share it as a clickable link; it works once and then " +
            "expires. Call start_tippani (or get_portal_url) again for a new one.",
        };
      },
    },
    {
      name: "get_portal_url",
      description:
        "Return a fresh SINGLE-USE Tippani sign-in `portalUrl` and whether the " +
        "portal is currently `running`. Use this to reconnect a user whose link " +
        "was already used, expired, or whose browser session ended — the portal " +
        "rejects an unauthenticated browser, so there is no reusable address to " +
        "hand out and an old link cannot be resent. This does NOT start the " +
        "portal: when `running` is false, `portalUrl` is null and you must call " +
        "start_tippani (or an entry tool like open_pr) first.",
      inputSchema: {},
      handler: async () => {
        const running = !!(session && typeof session.getToken === "function" && session.getToken());
        if (!running) {
          return {
            portalUrl: null,
            running: false,
            singleUse: true,
            note: "Tippani is not running — call start_tippani to launch it and get a sign-in link.",
          };
        }
        return {
          portalUrl: await browserSessionUrl(),
          running: true,
          singleUse: true,
          note:
            "One-time sign-in link — share it as a clickable link. It works once " +
            "and then expires; call get_portal_url again for a new one.",
        };
      },
    },
    {
      name: "add_reading_list_file",
      description:
        "Add a local .md file to the Discovery \"Reading list\" so it persists " +
        "as a reopenable tile. Its folder becomes an approved read root, so " +
        "open_local_file can then open .md files there. `path` is an absolute " +
        "path to a readable .md on disk. Launches the portal if it isn't running.",
      inputSchema: {
        path: z.string().describe("Absolute path to a readable .md file to add"),
      },
      handler: (args) => ensuredPost("/api/v1/custom-files", { path: args.path }),
    },
    {
      name: "remove_reading_list_file",
      description:
        "Remove a .md file from the Discovery \"Reading list\" (revoking its " +
        "folder as an approved read root if it was the last file there). The " +
        "pinned \"User Manual\" tile cannot be removed. `path` is the absolute " +
        "file path as it appears in the list.",
      inputSchema: {
        path: z.string().describe("Absolute path of the reading-list .md to remove"),
      },
      handler: (args) => ensuredDelete("/api/v1/custom-files", { path: args.path }),
    },
    {
      name: "close_tippani",
      description:
        "Close Tippani explicitly when the review session is finished: steer the " +
        "open browser tab to a closed page, then shut down the background " +
        "review-portal process(es) gracefully and clear their registry entries. " +
        "A later open_pr / open_branch / discovery call relaunches a fresh portal.",
      inputSchema: {},
      handler: async () => {
        // Best-effort: land the open tab on the terminal /closed page before the
        // server goes away, so the browser shows a clean closed state rather than
        // a dead-connection error. Skipped silently if no portal is up.
        let browserNudged = false;
        try {
          await http.post("/api/v1/nav", { path: "/closed" });
          browserNudged = true;
          // Wait at least one full NAV_WATCHER poll period (1500ms) so the tab
          // is guaranteed a poll before the portal dies under it.
          await new Promise((r) => setTimeout(r, 1700));
        } catch {}
        // Tear down every portal this shim owns (graceful: kills the background
        // process and removes its registry entry).
        let closed = false;
        if (session && typeof session.stop === "function") {
          try { session.stop(); closed = true; } catch {}
        }
        return { ok: true, closed, browserNudged };
      },
    },
  ];
}
