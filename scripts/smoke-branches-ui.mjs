// smoke-branches-ui — Discovery "Branches" tab UI + endpoint smoke (headless,
// jsdom). Boots a real tippani portal (offline, from the cached ADO PR), asserts
// the Branches tab / pane / project picker / local-repo tile are present and
// wired in the rendered /discovery page, then drives both new endpoints:
//   POST /api/v1/branches   -> offline-degraded { branches:[], error:"offline" }
//   POST /api/v1/local-repo -> validates a path (bogus -> error; the tippani
//                              repo root -> ok + its current branch)
// NEVER writes anything; read-only.
//
// Usage:  node scripts/smoke-branches-ui.mjs [--pr <id>] [--port <p>]

import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const argVal = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const PORT = parseInt(argVal("--port", "3907"), 10);
const BASE = `http://127.0.0.1:${PORT}`;
const CLIENT = "smoke-branches-ui";

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name); console.error("  FAIL: " + name + (detail ? ` — ${detail}` : "")); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function tokenFor(port) {
  const p = join(homedir(), ".tippani", `session-token-${port}`);
  return existsSync(p) ? readFileSync(p, "utf8").trim() : "";
}
async function getPage(path) {
  const res = await fetch(BASE + path, { headers: { "X-Tippani-Client": CLIENT } });
  return { status: res.status, html: await res.text() };
}
async function api(method, path, body) {
  const headers = { "X-Tippani-Client": CLIENT };
  if (method !== "GET") { headers["Authorization"] = `Bearer ${tokenFor(PORT)}`; headers["Content-Type"] = "application/json"; }
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
async function waitReady(timeoutMs = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { const r = await fetch(BASE + "/api/v1/state", { headers: { "X-Tippani-Client": CLIENT } }); if (r.ok) return true; } catch {}
    await sleep(400);
  }
  return false;
}

async function main() {
  // Browse mode (no PR) is what renders the Discovery home (buildHomePage), which
  // hosts the Branches tab. Offline + headless: no ADO calls, no browser. Browse
  // mode requires *a* token to build a connection object; offline never uses it.
  const child = spawn(process.execPath, [join(ROOT, "src", "index.js"), "--browse", `--port=${PORT}`, "--offline", "--headless", "--ado-token=smoke.fake.token", "--org=https://dev.azure.com/smoke", "--project=SmokeProject"], {
    cwd: ROOT, stdio: ["ignore", "ignore", "inherit"],
  });
  let exited = false; child.on("exit", () => { exited = true; });

  try {
    const ready = await waitReady();
    check("portal boots offline and serves pages", ready);
    if (!ready) throw new Error("portal did not become ready");

    // ---- /discovery : Branches tab + pane present and wired ----
    const disc = await getPage("/discovery");
    check("/discovery renders (200)", disc.status === 200, `status=${disc.status}`);
    const doc = new JSDOM(disc.html).window.document;

    // Guard: the Branches client script must PARSE. A regex or string with a
    // backslash lives inside the server template literal, which eats the
    // backslash unless doubled — producing an invalid regex that breaks the
    // WHOLE inline script in a real browser (jsdom/node-check don't catch it).
    const scripts = [...disc.html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const branchesScript = scripts.find((s) => s.includes("runBranches"));
    let scriptErr = null;
    try { new Function(branchesScript || ""); } catch (e) { scriptErr = String(e); }
    check("Branches client script parses (no client-JS syntax error)", !!branchesScript && scriptErr === null, scriptErr);

    check("Branches tab button present", !!doc.querySelector('.tab[data-tab="branches"]'));
    check("Branches pane present", !!doc.querySelector('.pane[data-pane="branches"]'));
    check("project picker present (#brProject)", !!doc.getElementById("brProject"));
    check("results container present (#brResults)", !!doc.getElementById("brResults"));
    check("Refresh button present (#brRefreshBtn)", !!doc.getElementById("brRefreshBtn"));
    check("Remote/Local mode toggle present", doc.querySelectorAll(".br-mode-btn").length === 2 &&
      !!doc.querySelector('.br-mode-btn[data-mode="remote"]') && !!doc.querySelector('.br-mode-btn[data-mode="local"]'));
    check("remote + local source panes present", !!doc.querySelector('.br-source[data-source="remote"]') && !!doc.querySelector('.br-source[data-source="local"]'));
    check("Repo field present + editable (not read-only)", !!doc.getElementById("brLocalPath") && !doc.getElementById("brLocalPath").hasAttribute("readonly"));
    check("field labeled 'Repo' (not 'Workspace')", /wi-label">Repo</.test(disc.html) && !/wi-label">Workspace</.test(disc.html));
    check("Browse button present (#brBrowseBtn)", !!doc.getElementById("brBrowseBtn"));
    check("Browse wired to the native folder picker (/api/v1/local-pick)",
      /pickWorkspace/.test(disc.html) && /\/api\/v1\/local-pick/.test(disc.html));
    check("local branches read server-side from the repo path",
      /runLocalBranches/.test(disc.html) && /\/api\/v1\/local-branches/.test(disc.html));
    check("local branch cards open the fully-local /local-branch page",
      /\/local-branch\?path=/.test(disc.html));
    check("SERVER_LOCAL_REPO empty by default (no --local-repo)", /SERVER_LOCAL_REPO = "";/.test(disc.html));

    check("runBranches wired to /api/v1/branches", /runBranches/.test(disc.html) && /\/api\/v1\/branches/.test(disc.html));
    check("branches tab activatable from ?tab", /=== 'branches'/.test(disc.html));

    // ---- POST /api/v1/branches : offline-degraded ----
    const br = await api("POST", "/api/v1/branches", { project: "AnyProject" });
    check("/api/v1/branches responds 200", br.status === 200, `status=${br.status}`);
    check("branches offline-degraded (empty + error)", Array.isArray(br.json?.branches) && br.json.branches.length === 0 && br.json.error === "offline", JSON.stringify(br.json));

    // ---- POST /api/v1/local-repo : validation (bogus + real) ----
    const bad = await api("POST", "/api/v1/local-repo", { path: join(ROOT, "no-such-dir-xyz") });
    check("local-repo rejects a bad path", bad.status === 200 && bad.json?.ok === false && !!bad.json?.error, JSON.stringify(bad.json));

    const good = await api("POST", "/api/v1/local-repo", { path: ROOT });
    check("local-repo accepts the tippani working tree", good.status === 200 && good.json?.ok === true, JSON.stringify(good.json));
    check("local-repo reports a current branch", good.json?.ok === true && typeof good.json.branch === "string" && good.json.branch.length > 0, JSON.stringify(good.json));

    // ---- POST /api/v1/local-branches : list the clone's branches ----
    const lbBad = await api("POST", "/api/v1/local-branches", { path: join(ROOT, "no-such-dir-xyz") });
    check("local-branches rejects a bad path", lbBad.status === 200 && lbBad.json?.ok === false && !!lbBad.json?.error, JSON.stringify(lbBad.json));

    const lb = await api("POST", "/api/v1/local-branches", { path: ROOT });
    check("local-branches lists the tippani working tree's branches",
      lb.status === 200 && lb.json?.ok === true && Array.isArray(lb.json?.branches) && lb.json.branches.length > 0, JSON.stringify(lb.json?.branches?.slice(0, 3)));
    check("local-branches flags exactly one current branch",
      lb.json?.ok === true && lb.json.branches.filter((b) => b.current).length === 1 && typeof lb.json.current === "string",
      JSON.stringify({ current: lb.json?.current }));

    // ---- openLocalRepo stores the path (CLI/MCP): the Discovery page then
    // injects it as SERVER_LOCAL_REPO so the Repo box prefills. ----
    const discAfter = await getPage("/discovery?tab=branches");
    check("openLocalRepo stores the path -> SERVER_LOCAL_REPO injected",
      /SERVER_LOCAL_REPO = "[^"]*tippani[^"]*";/.test(discAfter.html), "not injected");

    // ---- GET /local-branch : fully-local branch file list via real git ----
    const curBranch = good.json?.branch;
    const lbp = await getPage(`/local-branch?path=${encodeURIComponent(ROOT)}&ref=${encodeURIComponent(curBranch)}`);
    check("/local-branch renders the local branch page (200)", lbp.status === 200, `status=${lbp.status}`);
    check("/local-branch is a branch-page shell (bp-wrap), no ADO link",
      /bp-wrap/.test(lbp.html) && !/Open in Azure DevOps/.test(lbp.html));
    const lbpNoRef = await getPage(`/local-branch?path=${encodeURIComponent(ROOT)}`);
    check("/local-branch with no ref redirects to the Branches tab",
      lbpNoRef.status === 200 && /data-pane="branches"/.test(lbpNoRef.html), `status=${lbpNoRef.status}`);
    check("/local-branch shows the Local mode badge", /ro-mode ro-mode-local/.test(lbp.html) && /class="ro-mode ro-mode-local">Local</.test(lbp.html));

    // ---- Local review (/spec?local=): read a working-tree file with real git,
    // rendered read-only with the Personal Comments pane + Local badge. No ADO.
    const specLocal = await getPage(`/spec?local=${encodeURIComponent(ROOT)}&path=${encodeURIComponent("README.md")}&branch=${encodeURIComponent(curBranch)}&back=${encodeURIComponent("/local-branch")}&mode=local`);
    check("/spec local renders the review page (200)", specLocal.status === 200, `status=${specLocal.status}`);
    check("/spec local is reviewing + Personal Comments + Local badge",
      /RO_REVIEWING = true/.test(specLocal.html) && /Personal Comments/.test(specLocal.html) && /ro-mode-local/.test(specLocal.html));
    check("/spec local never proxies images via ADO",
      !/spec\/media\?repo=/.test(specLocal.html) && (!/spec\/media\?/.test(specLocal.html) || /spec\/media\?local=/.test(specLocal.html)));

    // ---- MCP open tools accept a local clone path (fully-local, no ADO) ----
    const mcpOpenLocal = await api("POST", "/api/v1/spec/open-branch", { localPath: ROOT, branch: curBranch });
    check("MCP open-branch (localPath) navigates to the local branch view",
      mcpOpenLocal.status === 200 && mcpOpenLocal.json?.ok === true &&
      String(mcpOpenLocal.json?.opened || "").startsWith(`/local-branch?path=${encodeURIComponent(ROOT)}`),
      JSON.stringify(mcpOpenLocal.json));
    const mcpOpenLocalFile = await api("POST", "/api/v1/spec/open-branch-file", { localPath: ROOT, branch: curBranch, path: "README.md" });
    check("MCP open-branch-file (localPath) navigates to the local /spec review",
      mcpOpenLocalFile.status === 200 && mcpOpenLocalFile.json?.ok === true &&
      /^\/spec\?local=/.test(String(mcpOpenLocalFile.json?.opened || "")) &&
      /mode=local/.test(String(mcpOpenLocalFile.json?.opened || "")),
      JSON.stringify(mcpOpenLocalFile.json));

    // ---- Branches tab wires remote cards to the in-app /branch page ----
    check("remote branch cards open the in-app /branch page",
      /\/branch\?project=/.test(disc.html));
    check("no 'Open in Azure DevOps' link anywhere on the discovery page",
      !/Open in Azure DevOps/.test(disc.html));

    // ---- GET /branch : the branch file-list review page ----
    const FAKE_REPO = "00000000-0000-0000-0000-000000000000";
    const bp = await getPage(`/branch?repo=${FAKE_REPO}&repoName=specs-repo&project=SmokeProject&ref=dev/kay/x`);
    check("/branch renders (200)", bp.status === 200, `status=${bp.status}`);
    const bpDoc = new JSDOM(bp.html).window.document;
    check("/branch has a back-to-Branches link", !!bpDoc.querySelector(".ro-back") && /Branches/.test(bpDoc.querySelector(".ro-back")?.textContent || ""));
    check("/branch shows the repo \u00b7 branch title", /specs-repo/.test(bp.html) && /dev\/kay\/x/.test(bp.html));
    check("/branch degrades gracefully offline (empty/error state, no crash)", !!bpDoc.querySelector(".bp-wrap") && !!bpDoc.querySelector(".bp-empty"));
    check("/branch has no 'Open in Azure DevOps' link", !/Open in Azure DevOps/.test(bp.html));

    // Guard: the branch page's inline README-toggle script must PARSE (same
    // template-literal backslash hazard as the Branches tab script).
    const bpScripts = [...bp.html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const bpScript = bpScripts.find((s) => s.includes("bpShowReadme"));
    let bpErr = null;
    try { new Function(bpScript || ""); } catch (e) { bpErr = String(e); }
    check("/branch README-toggle script parses", !!bpScript && bpErr === null, bpErr);
    check("/branch README toggle persists under tippani.brShowReadme", /tippani\.brShowReadme/.test(bp.html));
    check("/branch applies the dark theme (prefers-color-scheme script)", /prefers-color-scheme: dark/.test(bp.html) && /document\.documentElement\.dataset\.theme/.test(bp.html));
    check("/branch hides files via [hidden] (not overridden by display:block)", /\.bp-file\[hidden\]\s*\{\s*display:\s*none/.test(bp.html));

    // Missing ref -> redirected back to the Branches tab (not a crash).
    const bpNoRef = await getPage(`/branch?repo=${FAKE_REPO}&repoName=specs-repo`);
    check("/branch with no ref redirects to the Branches tab",
      bpNoRef.status === 200 && /data-pane="branches"/.test(bpNoRef.html), `status=${bpNoRef.status}`);
    // A repo name (local-origin mapping) is accepted, not just a GUID; offline it
    // still renders the branch page shell gracefully.
    const bpByName = await getPage("/branch?project=SmokeProject&repoName=some-repo&ref=dev/x");
    check("/branch accepts a repo name (local-origin mapping)", bpByName.status === 200 && /bp-wrap/.test(bpByName.html), `status=${bpByName.status}`);
  } catch (e) {
    fail++; failures.push("UNEXPECTED THROW: " + (e?.message || e));
    console.error("UNEXPECTED THROW:", e?.stack || e);
  } finally {
    if (!exited) { try { child.kill("SIGTERM"); } catch {} }
  }

  console.log(`\nsmoke-branches-ui: ${pass} passed, ${fail} failed`);
  if (fail > 0) { console.error("Failures:\n  - " + failures.join("\n  - ")); process.exit(1); }
}

main();
