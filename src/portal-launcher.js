// Portal lifecycle for the tippani MCP shim.
//
// The MCP shim is a thin HTTP client of a running tippani portal. Historically
// it *required* an already-running portal and exited if none was found, which
// left the MCP server with zero tools — so an agent given the tippani MCP had
// nothing to call and fell back to raw ADO. This module lets the shim launch
// (and own) its own portal on demand: the `open_pr` tool calls `ensurePortal`,
// which spawns the portal as a child process, waits for it to write a fresh
// session token and answer an authenticated request, then hands the shim a
// live token. The portal runs headless and `open_pr` returns its URL; the
// client (LLM or user) decides how to surface it, so tippani stays
// host-agnostic and never launches a browser on the host by default. A caller
// can opt into a native default-browser open with `open_pr { headless: false }`.
//
// Auth: the ADO REST/git token is passed to the portal via the
// TIPPANI_ADO_TOKEN env var (the embedding host injects it). It is never placed
// on the command line.

import { spawn as defaultSpawn } from "child_process";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import openDefault from "open";
import { listInstances, removeInstance, reapInstances } from "./portal-registry.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORTAL_ENTRY = path.join(HERE, "index.js");

// Fast check whether a TCP port is free on the loopback the portal binds to
// (127.0.0.1). Used to skip already-occupied ports WITHOUT spawning a portal
// that would run a full ADO fetch before discovering EADDRINUSE.
function defaultIsPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

// Open a URL in the OS default browser. tippani is host-agnostic and never runs
// a host-supplied opener command: the client (LLM/user) decides how to surface
// the portal URL. This native open is used only when a caller explicitly opts in
// via `open_pr { headless: false }`. The URL is always tippani's own localhost
// portal — never a caller-supplied URL — so there is no arbitrary-command or
// arbitrary-URL surface to lock down.
export function openInBrowser(url, { openFn = openDefault } = {}) {
  return Promise.resolve(openFn(url)).then(() => ({ via: "open" }));
}

/**
 * Create a portal session the MCP shim uses to discover, adopt, or launch a
 * tippani portal per PR. Returns { ensurePortal, getToken, getBaseUrl, stop,
 * clientName }.
 */
export function createPortalSession({
  basePort = Number(process.env.TIPPANI_PORT) || 3847,
  portSpan = 20,
  adoToken = process.env.TIPPANI_ADO_TOKEN || null,
  githubToken = process.env.TIPPANI_GH_TOKEN ||
    process.env.GITHUB_TOKEN || null,
  clientName = process.env.TIPPANI_CLIENT_NAME || "tippani-mcp",
  nodeBin = process.execPath,
  portalEntry = PORTAL_ENTRY,
  spawnFn = defaultSpawn,
  fetchImpl = fetch,
  listInstancesFn = listInstances,
  openBrowserFn = (url) => openInBrowser(url),
  readyTimeoutMs = Number(process.env.TIPPANI_READY_TIMEOUT_MS) || 60_000,
  isPortFreeFn = defaultIsPortFree,
  // When true, reap orphaned/stale portals from the registry at startup (dead
  // portal files, and live portals whose spawning shim is gone). The shim turns
  // this on; tests leave it off so they never touch the real registry.
  reapOnStart = false,
  reapFn = reapInstances,
  // Remove a portal's registry entry (injectable for tests). stop() calls this
  // for each owned portal because on Windows proc.kill() is TerminateProcess (a
  // hard kill) — the portal's own exit handler never runs, so the shim must
  // delete the entry itself or it leaks as a stale "zombie" file.
  removeInstanceFn = removeInstance,
  // Navigation mode. Default (false) = single tab: nav tools steer the one open
  // browser tab in place. true = separate tabs: each nav opens a new browser tab.
  // Opt in via TIPPANI_SEPARATE_TABS=1.
  separateTabs = process.env.TIPPANI_SEPARATE_TABS === "1" ||
    process.env.TIPPANI_SEPARATE_TABS === "true",
} = {}) {
  // Backstop cleanup of portals leaked by past crashes / hard-killed shims.
  // reapInstances is async (it probes ports to avoid killing a recycled PID);
  // run it fire-and-forget so session creation never blocks on it.
  if (reapOnStart) {
    try { Promise.resolve(reapFn()).catch(() => { /* best effort */ }); }
    catch { /* best effort */ }
  }
  // active = the portal we're currently bound to:
  //   { port, url, token, prId, owned }  (owned = we launched it)
  let active = null;
  // Every portal WE launched, tracked by port so stop() can tear them ALL down.
  // A single `child` var lost the handle to earlier portals across a multi-PR
  // session (open PR A then B), leaking A's process and its held port.
  const ownedChildren = new Map(); // port -> child process
  // The portal URL we last opened a browser to — so repeated open_pr calls in
  // one session don't spam browser tabs, but every NEW binding (launch or
  // adopt) does bring the review portal up for the user.
  let lastOpenedUrl = null;

  async function healthyAt(url, token) {
    if (!url || !token) return false;
    try {
      const r = await fetchImpl(url + "/api/v1/threads", {
        headers: { Authorization: `Bearer ${token}`, "X-Tippani-Client": clientName },
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  // A live portal already open for this PR (any process), or null.
  function sameTarget(inst, {
    prId, provider = "ado", owner = null, repo = null,
  }) {
    const instProvider = inst.provider || "ado"; // backward-compatible entries
    return Number(inst.prId) === Number(prId) &&
      instProvider === provider &&
      (provider !== "github" ||
        (inst.owner === owner && inst.repo === repo));
  }

  async function findLivePortalForPr(target) {
    for (const inst of listInstancesFn()) {
      if (!sameTarget(inst, target)) continue;
      const url = inst.url || `http://localhost:${inst.port}`;
      if (await healthyAt(url, inst.token)) {
        return {
          port: Number(inst.port),
          url,
          token: inst.token,
          ...target,
          owned: false,
        };
      }
    }
    return null;
  }

  async function ensurePortal({
    prId, org, project, repo, refresh, headless = true,
    provider = "ado", owner,
  } = {}) {
    const id = Number(prId);
    if (!id) throw new Error("open_pr requires a numeric prId.");
    if (provider === "github" && (!owner || !repo)) {
      throw new Error("GitHub open_pr requires owner and repo.");
    }
    const target = {
      prId: id,
      provider,
      owner: provider === "github" ? owner : null,
      repo: provider === "github" ? repo : null,
    };

    let result;
    // 1. Already bound to a live portal for this PR.
    if (active && sameTarget(active, target) &&
        (await healthyAt(active.url, active.token))) {
      result = { reused: true, prId: id, url: active.url };
    } else {
      // 2. Adopt another process's live portal already open for this PR — don't
      //    spawn a duplicate or collide on its port.
      const found = await findLivePortalForPr(target);
      if (found) {
        active = found;
        result = { reused: true, adopted: true, prId: id, url: found.url };
      } else {
        // 3. Launch a new portal on a free port, leaving other PRs' portals alone.
        active = await launchNew({
          prId: id, org, project, repo, refresh, provider, owner,
        });
        result = { reused: false, prId: id, url: active.url };
      }
    }

    // Headless by default: tippani returns the URL and lets the client (LLM or
    // user) open it — no browser is popped on the host. Only when the caller
    // opts in with `open_pr { headless: false }` does tippani open the portal in
    // the OS default browser itself.
    if (!headless) await maybeOpenBrowser();
    return result;
  }

  // Open the browser to the active portal once per binding.
  async function maybeOpenBrowser() {
    if (active && active.url && active.url !== lastOpenedUrl) {
      lastOpenedUrl = active.url;
      try { await openBrowserFn(active.url); } catch { /* best effort */ }
    }
  }

  // Ensure a portal exists for cross-PR browsing (list_prs). Reuses the active
  // portal (PR-bound OR browse — both serve /prs + /api/v1/prs), or an existing
  // browse portal (prId 0) in the registry, else launches a PR-less browse
  // portal (reads org/project from ~/.tippani/config.json).
  async function ensureBrowsePortal({ headless = true } = {}) {
    if (active && (await healthyAt(active.url, active.token))) {
      if (!headless) await maybeOpenBrowser();
      return { reused: true, url: active.url };
    }
    for (const inst of listInstancesFn()) {
      if (Number(inst.prId) !== 0) continue;
      const url = inst.url || `http://localhost:${inst.port}`;
      if (await healthyAt(url, inst.token)) {
        active = { port: Number(inst.port), url, token: inst.token, prId: 0, owned: false };
        if (!headless) await maybeOpenBrowser();
        return { reused: true, adopted: true, url };
      }
    }
    active = await launchNew({ browse: true });
    if (!headless) await maybeOpenBrowser();
    return { reused: false, url: active.url };
  }

  async function launchNew({
    prId, org, project, repo, refresh, browse,
    provider = "ado", owner,
  } = {}) {
    let lastErr = null;
    for (let port = basePort; port < basePort + portSpan; port++) {
      // Fast pre-check: skip ports already in use WITHOUT spawning. A spawned
      // portal runs the full ADO fetch before it binds and hits EADDRINUSE, so
      // probing here avoids a full fetch (or the ready timeout) per busy port.
      if (!(await isPortFreeFn(port))) { lastErr = `port ${port} in use`; continue; }
      const res = await tryLaunchOnPort(port, {
        prId, org, project, repo, refresh, browse, provider, owner,
      });
      if (res.ok) {
        // Track so stop() can tear down every portal we own, not just the last.
        ownedChildren.set(port, res.child);
        res.child.on("exit", () => {
          if (ownedChildren.get(port) === res.child) ownedChildren.delete(port);
        });
        return {
          port,
          url: `http://localhost:${port}`,
          token: res.token,
          prId: browse ? 0 : prId,
          provider,
          owner: provider === "github" ? owner : null,
          repo: provider === "github" ? repo : null,
          owned: true,
        };
      }
      lastErr = res.error;
      // Port busy (another PR's portal or a stale entry) → try the next one.
    }
    throw new Error(
      `could not start a tippani portal on ports ${basePort}-${basePort + portSpan - 1}` +
      (lastErr ? ` (${lastErr})` : "")
    );
  }

  function tryLaunchOnPort(port, {
    prId, org, project, repo, refresh, browse, provider, owner,
  }) {
    // The portal launches headless — the shim owns browser-opening (see
    // maybeOpenBrowser) so both launch and adopt bring the portal up uniformly.
    const args = browse
      ? [portalEntry, "--browse", `--port=${port}`, "--headless"]
      : provider === "github"
        ? [
            portalEntry,
            `github:${owner}/${repo}#${prId}`,
            `--port=${port}`,
            "--headless",
          ]
        : [portalEntry, String(prId), `--port=${port}`, "--headless"];
    if (provider !== "github") {
      if (org) args.push(`--org=${org}`);
      if (project) args.push(`--project=${project}`);
      if (repo) args.push(`--repo=${repo}`);
    }
    if (refresh) args.push("--refresh");

    const env = { ...process.env };
    if (adoToken) env.TIPPANI_ADO_TOKEN = adoToken;
    if (githubToken) env.TIPPANI_GH_TOKEN = githubToken;
    // Tell the portal who spawned it so startup reaping can detect orphans.
    env.TIPPANI_SHIM_PID = String(process.pid);

    // stdio ipc gives the portal a pipe tied to THIS shim's lifetime: when the
    // shim dies (any cause), the OS closes it and the portal's `disconnect`
    // handler exits it. That's what stops portals outliving the shim.
    const proc = spawnFn(nodeBin, args, {
      env,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      detached: false,
    });
    let exited = false;
    proc.on("exit", () => { exited = true; });

    return new Promise((resolve) => {
      const deadline = Date.now() + readyTimeoutMs;
      const poll = async () => {
        // We pre-checked the port as free before spawning, so an early exit here
        // means a lost race for the port or an auth rejection at startup → move
        // on to the next candidate port.
        if (exited) { resolve({ ok: false, error: `port ${port} unavailable` }); return; }
        // Match OUR portal: same port AND our prId. A different PR already on
        // this port must NOT be adopted here — our child will hit EADDRINUSE
        // and exit, and we move on.
        const inst = listInstancesFn().find((i) =>
          Number(i.port) === port &&
          sameTarget(i, browse ? {
            prId: 0, provider: "ado", owner: null, repo: null,
          } : {
            prId, provider, owner: provider === "github" ? owner : null,
            repo: provider === "github" ? repo : null,
          }));
        if (inst && (await healthyAt(inst.url || `http://localhost:${port}`, inst.token))) {
          resolve({ ok: true, token: inst.token, child: proc });
          return;
        }
        if (Date.now() > deadline) {
          try { proc.kill(); } catch {}
          resolve({ ok: false, error: `portal on ${port} not ready within ${readyTimeoutMs}ms` });
          return;
        }
        setTimeout(poll, 400);
      };
      poll();
    });
  }

  function getToken() { return active?.token ?? null; }
  function getBaseUrl() { return active?.url ?? `http://localhost:${basePort}`; }

  function stop() {
    // Tear down every portal WE launched (adopted portals belong to others).
    // Snapshot + clear first so nothing perturbs iteration. On Windows proc.kill()
    // is TerminateProcess (a hard kill), so the portal's own exit handler never
    // runs to delete its registry entry — the shim removes it here itself, then
    // disconnects (graceful ipc close) and kills the child as a fallback.
    const entries = [...ownedChildren.entries()];
    ownedChildren.clear();
    for (const [port, proc] of entries) {
      try { removeInstanceFn(port); } catch {}
      try { if (proc.connected) proc.disconnect(); } catch {}
      try { proc.kill(); } catch {}
    }
  }

  return {
    ensurePortal,
    ensureBrowsePortal,
    getToken,
    getBaseUrl,
    stop,
    // Navigation mode (see createPortalSession options). Read by the nav tools.
    separateTabs: !!separateTabs,
    // Open a specific portal path in the user's browser (e.g. "/thread/123").
    openUrl: (path) => {
      const base = (getBaseUrl() || "").replace(/\/+$/, "");
      const p = String(path || "/").startsWith("/") ? path : "/" + path;
      try { return Promise.resolve(openBrowserFn(base + p)).catch(() => {}); }
      catch { return Promise.resolve(); }
    },
    get clientName() { return clientName; },
  };
}
