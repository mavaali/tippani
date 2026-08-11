// Unit tests for the MCP portal launcher (portal-launcher.js).
// Uses a fake spawn + in-memory instance registry + fake fetch so no real
// portal or network is touched. Verifies: adopt an existing same-PR portal,
// launch a new one when none exists, launch on the NEXT free port when the
// base port is held by a different PR, reuse the bound portal, and reject bad
// input.

import { EventEmitter } from "events";
import { parseGitHubTarget } from "./github-target.js";
import { createPortalSession, openInBrowser } from "./portal-launcher.js";

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) pass++;
  else { fail++; console.error("  FAIL: " + name); }
}

// In-memory instance registry the fake portal writes into on boot.
let registry = [];
// Ports that are "held" (a launch attempt there fails with EADDRINUSE).
let busyPorts = new Set();
let spawnCalls = [];
let openedUrls = [];

const listInstancesFn = () => registry.map((r) => ({ ...r }));

// healthy iff the base URL matches a live registry entry.
const fetchImpl = async (url) => {
  const base = url.replace("/api/v1/threads", "");
  const ok = registry.some((i) => (i.url || `http://localhost:${i.port}`) === base);
  return { ok, json: async () => ({ threads: [] }) };
};

function fakeSpawn(bin, args, opts) {
  const port = Number(args.find((a) => a.startsWith("--port=")).split("=")[1]);
  const githubTarget = parseGitHubTarget(args.slice(1));
  const github = githubTarget.isGitHub && !githubTarget.error
    ? githubTarget
    : null;
  const browse = args.includes("--browse");
  const prId = browse ? 0 : github ? github.prId : Number(args[1]);
  const provider = github ? "github" : "ado";
  const child = new EventEmitter();
  child.killed = false;
  child.kill = () => { child.killed = true; child.emit("exit", 0); };
  spawnCalls.push({ bin, args, opts, child });
  setTimeout(() => {
    if (busyPorts.has(port)) { child.emit("exit", 1); return; } // EADDRINUSE
    registry.push({
      port,
      prId,
      provider,
      owner: github?.owner || null,
      repo: github?.repo || null,
      token: `tok-${port}`,
      url: `http://localhost:${port}`,
    });
    busyPorts.add(port); // a launched portal now holds its port (mirror reality)
  }, 15);
  return child;
}

function newSession(overrides = {}) {
  return createPortalSession({
    basePort: 3847,
    portSpan: 5,
    adoToken: "ado-test-token",
    clientName: "tippani-mcp-test",
    nodeBin: "node",
    portalEntry: "/fake/index.js",
    spawnFn: fakeSpawn,
    fetchImpl,
    listInstancesFn,
    openBrowserFn: (url) => { openedUrls.push(url); },
    readyTimeoutMs: 3000,
    // A busy port is reported as not-free so the launcher skips it without spawning.
    isPortFreeFn: (port) => !busyPorts.has(port),
    ...overrides,
  });
}

function reset() { registry = []; busyPorts = new Set(); spawnCalls = []; openedUrls = []; }

try {
  // --- adopt an existing portal already open for this PR ---
  {
    reset();
    registry.push({ port: 3847, prId: 952607, token: "existing", url: "http://localhost:3847" });
    const s = newSession();
    const r = await s.ensurePortal({ prId: 952607, headless: false });
    check("adopt: reused + adopted", r.reused === true && r.adopted === true);
    check("adopt: no spawn", spawnCalls.length === 0);
    check("adopt: bound to existing url", s.getBaseUrl() === "http://localhost:3847");
    check("adopt: uses existing token", s.getToken() === "existing");
    check("adopt: opened browser to adopted portal (headless:false)", openedUrls.includes("http://localhost:3847"));
    s.stop();
  }

  // --- launch a new portal when none exists ---
  {
    reset();
    const s = newSession();
    const r = await s.ensurePortal({ prId: 111, org: "https://dev.azure.com/o", project: "P", repo: "R", headless: false });
    check("launch: not reused", r.reused === false && r.prId === 111);
    check("launch: spawned once", spawnCalls.length === 1);
    check("launch: on base port 3847", s.getBaseUrl() === "http://localhost:3847");
    check("launch: passes --port", spawnCalls[0].args.includes("--port=3847"));
    check("launch: forwards --org/--project/--repo",
      spawnCalls[0].args.includes("--org=https://dev.azure.com/o") &&
      spawnCalls[0].args.includes("--project=P") &&
      spawnCalls[0].args.includes("--repo=R"));
    check("launch: injects ADO token env", spawnCalls[0].opts.env.TIPPANI_ADO_TOKEN === "ado-test-token");
    check("launch: portal headless (shim owns browser)", spawnCalls[0].args.includes("--headless"));
    check("launch: opened browser once to portal (headless:false)", openedUrls.length === 1 && openedUrls[0] === "http://localhost:3847");
    s.stop();
  }

  // --- headless is the default: return the URL, open NO browser on the host ---
  {
    reset();
    const s = newSession();
    const r = await s.ensurePortal({ prId: 4242, org: "https://dev.azure.com/o", project: "P", repo: "R" });
    check("headless default: launched + returns url", r.reused === false && r.url === "http://localhost:3847");
    check("headless default: spawned the portal", spawnCalls.length === 1);
    check("headless default: opened NO browser", openedUrls.length === 0);
    s.stop();
  }

  // --- GitHub target launches with shorthand + token and never adopts an ADO
  //     portal that merely shares the same numeric PR id ---
  {
    reset();
    registry.push({
      port: 3847,
      prId: 77,
      provider: "ado",
      token: "ado-77",
      url: "http://localhost:3847",
    });
    busyPorts.add(3847);
    const s = newSession({ githubToken: "gh-test-token" });
    const r = await s.ensurePortal({
      prId: 77,
      provider: "github",
      owner: "mavaali",
      repo: "tippani",
    });
    check("github: doesn't adopt same-number ADO portal",
      !r.adopted && r.reused === false);
    check("github: launches on next free port", r.url === "http://localhost:3848");
    check("github: passes shorthand target",
      spawnCalls[0].args.includes("github:mavaali/tippani#77"));
    check("github: injects token env",
      spawnCalls[0].opts.env.TIPPANI_GH_TOKEN === "gh-test-token");
    s.stop();
  }

  // --- different PR launches on the NEXT free port (base port held) ---
  {
    reset();
    // PR 111 is live on 3847, and 3847 is held (in use).
    registry.push({ port: 3847, prId: 111, token: "t111", url: "http://localhost:3847" });
    busyPorts.add(3847);
    const s = newSession();
    const r = await s.ensurePortal({ prId: 222 });
    check("parallel: launched (not adopted)", r.reused === false && r.prId === 222);
    check("parallel: on next port 3848", s.getBaseUrl() === "http://localhost:3848");
    // Fast pre-check skips the busy base port WITHOUT spawning a doomed child.
    check("parallel: only spawned on the free port 3848",
      spawnCalls.length === 1 && spawnCalls[0].args.includes("--port=3848"));
    check("parallel: left PR 111 portal alone", registry.some((i) => i.port === 3847 && i.prId === 111));
    s.stop();
  }

  // --- GitHub coordinates use the same normalization as the child portal ---
  {
    reset();
    const s = newSession({ githubToken: "gh-test-token" });
    const r = await s.ensurePortal({
      prId: 77,
      provider: "github",
      owner: "MAVAALI",
      repo: "Tippani.git",
    });
    check("github normalization: child becomes ready", r.reused === false);
    check("github normalization: launches canonical shorthand",
      spawnCalls[0].args.includes("github:mavaali/tippani#77"));
    s.stop();
  }

  // --- an unhealthy GitHub browse portal reconnects as GitHub, not ADO ---
  {
    reset();
    const s = newSession({ githubToken: "gh-test-token" });
    await s.ensureBrowsePortal({
      provider: "github",
      owner: "mavaali",
      repo: "tippani",
    });
    registry = [];
    const r = await s.ensureActivePortal();
    check("github browse reconnect: launches replacement", r.reused === false);
    check("github browse reconnect: keeps provider coordinates",
      spawnCalls.length === 2 &&
      spawnCalls[1].args.includes("--browse") &&
      spawnCalls[1].args.includes("--github=mavaali/tippani"));
    s.stop();
  }

  // --- ADO discovery never reuses an active GitHub portal ---
  {
    reset();
    const s = newSession({ githubToken: "gh-test-token" });
    await s.ensurePortal({
      prId: 77,
      provider: "github",
      owner: "mavaali",
      repo: "tippani",
    });
    const r = await s.ensureBrowsePortal();
    check("browse isolation: launches an ADO browse portal", r.reused === false);
    check("browse isolation: uses --browse on another port",
      spawnCalls.length === 2 &&
      spawnCalls[1].args.includes("--browse") &&
      spawnCalls[1].args.includes("--port=3848"));
    s.stop();
  }

  // --- ADO discovery reuses the active PR-bound portal ---
  {
    reset();
    const s = newSession();
    await s.ensurePortal({ prId: 992661 });
    const r = await s.ensureBrowsePortal();
    check("ADO PR browse: reuses active portal", r.reused === true);
    check("ADO PR browse: keeps review binding",
      spawnCalls.length === 1 &&
      s.getBaseUrl() === "http://localhost:3847");
    s.stop();
  }

  // --- GitHub discovery reuses the active matching PR-bound portal ---
  {
    reset();
    const s = newSession({ githubToken: "gh-test-token" });
    await s.ensurePortal({
      prId: 77,
      provider: "github",
      owner: "mavaali",
      repo: "tippani",
    });
    const r = await s.ensureBrowsePortal({
      provider: "github",
      owner: "mavaali",
      repo: "tippani",
    });
    check("GitHub PR browse: reuses active portal", r.reused === true);
    check("GitHub PR browse: keeps review binding",
      spawnCalls.length === 1 &&
      s.getBaseUrl() === "http://localhost:3847");
    s.stop();
  }

  // --- GitHub discovery launches and reuses a repository-anchored browse portal ---
  {
    reset();
    const s = newSession({ githubToken: "gh-test-token" });
    const first = await s.ensureBrowsePortal({
      provider: "github",
      owner: "MAVAALI",
      repo: "Tippani.git",
    });
    check("github browse: launches", first.reused === false);
    check("github browse: passes canonical coordinates",
      spawnCalls[0].args.includes("--browse") &&
      spawnCalls[0].args.includes("--github=mavaali/tippani"));
    const second = await s.ensureBrowsePortal({
      provider: "github",
      owner: "mavaali",
      repo: "tippani",
    });
    check("github browse: reuses matching portal", second.reused === true);
    s.stop();
  }

  {
    reset();
    const s = newSession({ githubToken: "gh-test-token" });
    let threw = false;
    try {
      await s.ensureBrowsePortal({ provider: "github" });
    } catch {
      threw = true;
    }
    check("github browse: rejects missing coordinates", threw);
    s.stop();
  }

  // --- authoring mutations stay on the active GitHub portal ---
  {
    reset();
    const s = newSession({ githubToken: "gh-test-token" });
    await s.ensurePortal({
      prId: 77,
      provider: "github",
      owner: "mavaali",
      repo: "tippani",
    });
    const spawnBefore = spawnCalls.length;
    const r = await s.ensureActivePortal();
    check("active mutation portal: reuses GitHub portal", r.reused === true);
    check("active mutation portal: does not launch ADO browse",
      spawnCalls.length === spawnBefore &&
      s.getBaseUrl() === "http://localhost:3847");
    s.stop();
  }

  // --- a provider-tagged GitHub prId=0 entry is not an ADO browse portal ---
  {
    reset();
    registry.push({
      port: 3847,
      prId: 0,
      provider: "github",
      owner: "mavaali",
      repo: "tippani",
      token: "github-zero",
      url: "http://localhost:3847",
    });
    busyPorts.add(3847);
    const s = newSession();
    const r = await s.ensureBrowsePortal();
    check("browse adoption: ignores GitHub prId=0 entry", r.reused === false);
    check("browse adoption: launches ADO on next port",
      spawnCalls.length === 1 &&
      spawnCalls[0].args.includes("--browse") &&
      spawnCalls[0].args.includes("--port=3848"));
    s.stop();
  }

  // --- multi-PR session: every launched portal is torn down on stop() ---
  {
    reset();
    const s = newSession();
    await s.ensurePortal({ prId: 111 }); // launches on 3847
    await s.ensurePortal({ prId: 222 }); // launches on 3848 (A not adopted, different PR)
    const childA = spawnCalls.find((c) => c.args.includes("--port=3847")).child;
    const childB = spawnCalls.find((c) => c.args.includes("--port=3848")).child;
    check("multi-pr: launched two portals", !!childA && !!childB && childA !== childB);
    check("multi-pr: neither killed before stop", !childA.killed && !childB.killed);
    s.stop();
    check("multi-pr: stop killed BOTH owned portals (no orphan)", childA.killed && childB.killed);
  }

  // --- stop() removes each owned portal's registry entry itself (on Windows
  //     proc.kill() is a hard TerminateProcess, so the portal's own exit handler
  //     never runs to delete it — the shim must, or it leaks a zombie file) ---
  {
    reset();
    const removed = [];
    const s = newSession({ removeInstanceFn: (port) => removed.push(Number(port)) });
    await s.ensurePortal({ prId: 111 }); // launches on 3847
    await s.ensurePortal({ prId: 222 }); // launches on 3848
    check("stop-cleanup: nothing removed before stop", removed.length === 0);
    s.stop();
    check("stop-cleanup: stop removed BOTH owned registry entries",
      removed.includes(3847) && removed.includes(3848));
  }

  // --- host token rotation replaces the shim/portal, then reuses the same
  //     configured base port with the fresh launch token ---
  {
    reset();
    const releasePortal = (port) => {
      const numericPort = Number(port);
      registry = registry.filter((entry) => Number(entry.port) !== numericPort);
      busyPorts.delete(numericPort);
    };

    const first = newSession({
      adoToken: "token-a",
      removeInstanceFn: releasePortal,
    });
    await first.ensurePortal({ prId: 777 });
    const firstSpawn = spawnCalls.at(-1);
    check("token-restart: first shim uses base port 3847",
      first.getBaseUrl() === "http://localhost:3847");
    check("token-restart: first portal receives token A",
      firstSpawn.opts.env.TIPPANI_ADO_TOKEN === "token-a");

    first.stop();
    check("token-restart: old portal registry entry removed",
      !registry.some((entry) => Number(entry.port) === 3847));
    check("token-restart: old portal releases base port",
      !busyPorts.has(3847));

    const second = newSession({
      adoToken: "token-b",
      removeInstanceFn: releasePortal,
    });
    await second.ensurePortal({ prId: 777 });
    const secondSpawn = spawnCalls.at(-1);
    check("token-restart: replacement reuses base port 3847",
      second.getBaseUrl() === "http://localhost:3847");
    check("token-restart: replacement portal receives token B",
      secondSpawn.opts.env.TIPPANI_ADO_TOKEN === "token-b");
    second.stop();
  }

  // --- adopted portals are NOT killed on stop (they belong to others) ---
  {
    reset();
    registry.push({ port: 3849, prId: 555, token: "other", url: "http://localhost:3849" });
    const s = newSession();
    await s.ensurePortal({ prId: 555 }); // adopts, no spawn
    check("adopt-stop: no spawn on adopt", spawnCalls.length === 0);
    s.stop(); // must not throw and must not touch the adopted portal's registry entry
    check("adopt-stop: adopted portal left in registry", registry.some((i) => i.port === 3849 && i.prId === 555));
  }

  // --- reuse the already-bound portal on a repeat open_pr ---
  {
    reset();
    const s = newSession();
    await s.ensurePortal({ prId: 333 });
    const spawnBefore = spawnCalls.length;
    const openBefore = openedUrls.length;
    const r2 = await s.ensurePortal({ prId: 333 });
    check("reuse: same PR reused", r2.reused === true);
    check("reuse: no extra spawn", spawnCalls.length === spawnBefore);
    check("reuse: no extra browser open", openedUrls.length === openBefore);
    s.stop();
  }

  // --- adopt takes precedence over launching (another process opened it) ---
  {
    reset();
    const s = newSession();
    registry.push({ port: 3850, prId: 444, token: "other", url: "http://localhost:3850" });
    const r = await s.ensurePortal({ prId: 444 });
    check("adopt-precedence: adopted, no spawn", r.adopted === true && spawnCalls.length === 0);
    check("adopt-precedence: bound to other's port", s.getBaseUrl() === "http://localhost:3850");
    s.stop();
  }

  // --- bad input ---
  {
    reset();
    const s = newSession();
    let threw = false;
    try { await s.ensurePortal({ prId: 0 }); } catch { threw = true; }
    check("input: rejects missing prId", threw);
    s.stop();
  }

  // --- openInBrowser: native default-browser open only (no host command) ---
  {
    let openedUrl = null;
    const res = await openInBrowser("http://localhost:3847/prs", {
      openFn: (u) => { openedUrl = u; },
    });
    check("open: uses the OS default browser (openFn)", res.via === "open" && openedUrl === "http://localhost:3847/prs");
  }
} catch (e) {
  // A thrown block used to be masked by the bare try/finally + process.exit(0),
  // silently skipping every later check. Count it as a failure so it surfaces.
  fail++;
  console.error("UNEXPECTED THROW:", e && e.stack);
} finally {
  console.log(`\nportal-launcher.test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
