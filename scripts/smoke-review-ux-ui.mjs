// smoke-review-ux-ui — Phase 118 UI smoke (headless, jsdom).
//
// Boots a real tippani portal (offline, from the cached ADO PR) and loads the
// rendered pages, asserting the manual review-UX affordances are present and
// wired: the 3-view toggle, Find button + editor toolbar band, the persistent
// dark-red (Bordeaux) focus highlight CSS (and that it is not on a timer), the
// capped thread-comments pane, the feedback filter bar, and the client-side
// auto-load path. Also verifies the server side of a live-staged draft that the
// open editor auto-loads (last-write-wins). NEVER finalizes — staging only.
//
// Usage:  node scripts/smoke-review-ux-ui.mjs [--pr <id>] [--port <p>]

import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const argVal = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const PR = argVal("--pr", "920770");
const PORT = parseInt(argVal("--port", "3903"), 10);
const BASE = `http://127.0.0.1:${PORT}`;
const CLIENT = "smoke-review-ux-ui";

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
  const html = await res.text();
  return { status: res.status, html };
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
  const cachePath = join(homedir(), ".tippani", "cache", `pr-${PR}.json`);
  if (!existsSync(cachePath)) { console.error(`No cache for PR ${PR} at ${cachePath}.`); process.exit(2); }

  const child = spawn(process.execPath, [join(ROOT, "src", "index.js"), PR, `--port=${PORT}`, "--offline", "--headless"], {
    cwd: ROOT, stdio: ["ignore", "ignore", "inherit"],
  });
  let exited = false; child.on("exit", () => { exited = true; });

  try {
    const ready = await waitReady();
    check("portal boots offline and serves pages", ready);
    if (!ready) throw new Error("portal did not become ready");

    // ---- /file/0 : editor + view controls ----
    const file = await getPage("/file/0");
    check("/file/0 renders (200)", file.status === 200, `status=${file.status}`);
    const fdoc = new JSDOM(file.html).window.document;

    const views = [...fdoc.querySelectorAll(".view-btn")].map((b) => b.getAttribute("data-view"));
    check("3-view toggle present (current/diff/proposed)",
      ["current", "diff", "proposed"].every((v) => views.includes(v) || fdoc.querySelector(`[onclick*="setView('${v}')"]`)),
      views.join(","));
    check("Find button present", !!fdoc.getElementById("findBtn"));
    check("Edit toggle present", !!fdoc.getElementById("editToggle"));
    check("Editor formatting toolbar band present", !!fdoc.getElementById("fmtToolbar"));
    check("Editor + current-view containers present", !!fdoc.getElementById("spec-editor") && !!fdoc.getElementById("spec-current"));

    check("NAV_WATCHER uses the ?edit=1-safe guard (navShouldNavigate)", /navShouldNavigate/.test(file.html));
    check("editor auto-load path wired (isEditing + setMarkdown in poll)",
      /isEditing\(\)/.test(file.html) && /setMarkdown\(/.test(file.html));
    check("comment threads are click-to-focus (onThreadClick)", /onThreadClick/.test(file.html));

    // Persistent Bordeaux highlight, light + dark, and NOT on a timer.
    check("focus highlight uses Bordeaux (light #6d071a, dark #b23a58)",
      file.html.includes("#6d071a") && file.html.includes("#b23a58"));
    check("thread + section focus classes styled", /\.thread-focused/.test(file.html) && /\.section-focused/.test(file.html));
    check("highlight is persistent (no setTimeout clears .thread-focused/.section-focused)",
      !/setTimeout[^;]*(thread-focused|section-focused)/.test(file.html));
    check("thread-comments pane is height-capped (max-height 42vh)",
      /\.thread-comments\s*\{[^}]*max-height:\s*42vh/.test(file.html));

    // ---- /feedback : filter bar ----
    const fb = await getPage("/feedback");
    check("/feedback renders (200)", fb.status === 200, `status=${fb.status}`);
    const fbdoc = new JSDOM(fb.html).window.document;
    check("feedback state chips present (5 states)", !!fbdoc.querySelector(".fb-chip-group") &&
      ["you", "reviewer", "viewed", "fyi", "resolved"].every((s) => fb.html.includes(`value="${s}"`) || fb.html.includes(`"${s}"`)));
    check("feedback reviewer filter present", !!fbdoc.getElementById("fbReviewer"));
    check("feedback file filter present", !!fbdoc.getElementById("fbFile"));
    check("feedback search present", !!fbdoc.getElementById("fbSearch"));
    check("feedback filter apply logic wired", /applyFeedbackFilter\s*\(/.test(fb.html));

    // ---- /discovery : Discovery page (offline can't reach ADO; assert mounted) ----
    const disc = await getPage("/discovery");
    check("/discovery route mounted (200 tiles, or offline-degraded non-404)", disc.status !== 404, `status=${disc.status}`);
    if (disc.status === 200) {
      check("/discovery shows a filter bar", /pr-filter|filter/i.test(disc.html));
    }
    // /prs is a backward-compatible alias that redirects to /discovery.
    const prsRedirect = await fetch(BASE + "/prs", { headers: { "X-Tippani-Client": CLIENT }, redirect: "manual" });
    check("/prs redirects to /discovery", prsRedirect.status >= 300 && prsRedirect.status < 400 && (prsRedirect.headers.get("location") || "").startsWith("/discovery"), `status=${prsRedirect.status} loc=${prsRedirect.headers.get("location")}`);

    // ---- auto-load (last-write-wins) server side ----
    await api("DELETE", "/api/v1/specs/0/draft");
    const before = (await api("GET", "/api/v1/state?full=1")).json?.specDrafts?.["0"];
    const staged = await api("POST", "/api/v1/specs/0/edit", { edits: [{ kind: "find", find: "Overview", replace: "UISMOKE_AUTOLOAD", where: "first" }] });
    const st = await api("GET", "/api/v1/state?full=1");
    check("live-staged draft appears in state for the open editor to auto-load",
      staged.status === 200 && !!st.json?.specDrafts?.["0"] &&
      st.json.specDrafts["0"].content.includes("UISMOKE_AUTOLOAD") &&
      st.json.specDrafts["0"].updatedAt !== before?.updatedAt);
    await api("DELETE", "/api/v1/specs/0/draft"); // cleanup, never finalize
  } catch (e) {
    fail++; failures.push("UNEXPECTED THROW: " + (e?.message || e));
    console.error("UNEXPECTED THROW:", e?.stack || e);
  } finally {
    if (!exited) { try { child.kill("SIGTERM"); } catch {} }
  }

  console.log(`\nsmoke-review-ux-ui: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
