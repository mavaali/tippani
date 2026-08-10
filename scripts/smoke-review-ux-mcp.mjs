// smoke-review-ux-mcp — Phase 118 MCP/control-API smoke.
//
// Boots a real tippani portal (offline, from the cached ADO PR) and drives the
// four review-UX tools end-to-end through the control-API surface the MCP tools
// forward to: list_prs, edit_spec (each `where` + guard-mismatch + overlap),
// set_view (state parity), set_feedback_filter (state parity). Asserts server
// state and return shapes. NEVER finalizes/commits — staging only.
//
// Usage:  node scripts/smoke-review-ux-mcp.mjs [--pr <id>] [--port <p>]
// Requires the PR to be cached once (…/.tippani/cache/pr-<id>.json), which the
// normal live run produces.

import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const argVal = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const PR = argVal("--pr", "920770");
const PORT = parseInt(argVal("--port", "3902"), 10);
const BASE = `http://127.0.0.1:${PORT}`;
const CLIENT = "smoke-review-ux-mcp";

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : "")); console.error("  FAIL: " + name + (detail ? ` — ${detail}` : "")); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tokenFor(port) {
  const p = join(homedir(), ".tippani", `session-token-${port}`);
  return existsSync(p) ? readFileSync(p, "utf8").trim() : "";
}

async function api(method, path, body) {
  const headers = { "X-Tippani-Client": CLIENT };
  const tok = tokenFor(PORT);
  if (method !== "GET") { headers["Authorization"] = `Bearer ${tok}`; headers["Content-Type"] = "application/json"; }
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function waitReady(timeoutMs = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(BASE + "/api/v1/state", { headers: { "X-Tippani-Client": CLIENT } });
      if (r.ok) return true;
    } catch {}
    await sleep(400);
  }
  return false;
}

async function main() {
  const cachePath = join(homedir(), ".tippani", "cache", `pr-${PR}.json`);
  if (!existsSync(cachePath)) {
    console.error(`No cache for PR ${PR} at ${cachePath}. Run tippani online against it once first.`);
    process.exit(2);
  }

  const child = spawn(process.execPath, [join(ROOT, "src", "index.js"), PR, `--port=${PORT}`, "--offline", "--headless"], {
    cwd: ROOT, stdio: ["ignore", "ignore", "inherit"],
  });
  let exited = false; child.on("exit", () => { exited = true; });

  try {
    const ready = await waitReady();
    check("portal boots offline and serves /api/v1/state", ready);
    if (!ready) throw new Error("portal did not become ready");

    // --- baseline state parity (item 3/5 fields present) ---
    const st0 = await api("GET", "/api/v1/state");
    check("state exposes view/viewSeq/filter/filterSeq", st0.status === 200 &&
      ["view", "viewSeq", "filter", "filterSeq"].every((k) => k in st0.json),
      JSON.stringify(Object.keys(st0.json || {})));
    // Draft bodies are only in the ?full=1 view (the steady-state poll is slim).
    const st0f = await api("GET", "/api/v1/state?full=1");
    check("state?full=1 exposes specDrafts", st0f.status === 200 && "specDrafts" in st0f.json,
      JSON.stringify(Object.keys(st0f.json || {})));

    // --- list_prs (item 6) ---
    const prs = await api("GET", "/api/v1/prs");
    // Offline can't reach ADO, so a clean 502 is acceptable; online returns { prs: [] }.
    check("list_prs endpoint wired (200 w/ prs[] or clean 502 offline)",
      (prs.status === 200 && Array.isArray(prs.json?.prs)) || (prs.status === 502 && !!prs.json?.error),
      `status=${prs.status}`);

    // --- edit_spec: find/replace each `where` (item 1) ---
    await api("DELETE", "/api/v1/specs/0/draft");
    const eFirst = await api("POST", "/api/v1/specs/0/edit", { edits: [{ kind: "find", find: "Overview", replace: "OVERVIEW_SMOKE_FIRST", where: "first" }] });
    check("edit_spec find/where=first stages a draft", eFirst.status === 200 && eFirst.json?.applied >= 1 &&
      eFirst.json?.draft?.content?.includes("OVERVIEW_SMOKE_FIRST"), `status=${eFirst.status}`);

    await api("DELETE", "/api/v1/specs/0/draft");
    const eAll = await api("POST", "/api/v1/specs/0/edit", { edits: [{ kind: "find", find: "Import", replace: "IMPORT_SMOKE", where: "all" }] });
    check("edit_spec find/where=all replaces every occurrence", eAll.status === 200 && (eAll.json?.replacements ?? 0) >= 2,
      `replacements=${eAll.json?.replacements}`);

    await api("DELETE", "/api/v1/specs/0/draft");
    const eLast = await api("POST", "/api/v1/specs/0/edit", { edits: [{ kind: "find", find: "Direct Lake", replace: "DIRECTLAKE_SMOKE_LAST", where: "last" }] });
    check("edit_spec find/where=last stages a draft", eLast.status === 200 && eLast.json?.applied >= 1 &&
      eLast.json?.draft?.content?.includes("DIRECTLAKE_SMOKE_LAST"), `status=${eLast.status}`);

    // --- edit_spec: guard mismatch → 422 guard_mismatch ---
    await api("DELETE", "/api/v1/specs/0/draft");
    const eGuard = await api("POST", "/api/v1/specs/0/edit", { edits: [{ kind: "range", startLine: 1, endLine: 1, oldString: "__DOES_NOT_MATCH_LINE_1__", newString: "x" }] });
    check("edit_spec guard mismatch → 422 guard_mismatch", eGuard.status === 422 && eGuard.json?.code === "guard_mismatch",
      `status=${eGuard.status} code=${eGuard.json?.code}`);

    // --- edit_spec: overlapping edits → 422 overlap ---
    await api("DELETE", "/api/v1/specs/0/draft");
    const eOverlap = await api("POST", "/api/v1/specs/0/edit", { edits: [
      { kind: "find", find: "Overview", replace: "A", where: "first" },
      { kind: "find", find: "Overview", replace: "B", where: "first" },
    ] });
    check("edit_spec overlapping edits → 422 overlap", eOverlap.status === 422 && eOverlap.json?.code === "overlap",
      `status=${eOverlap.status} code=${eOverlap.json?.code}`);

    // nothing left staged after a failed call
    const afterFail = await api("GET", "/api/v1/specs/0/draft");
    check("failed edit stages nothing", afterFail.status === 200 && !afterFail.json?.draft);

    // --- set_view (item 3): each view reflected in /api/v1/state, no auto-flip ---
    for (const v of ["diff", "current", "proposed"]) {
      const before = (await api("GET", "/api/v1/state")).json?.viewSeq ?? 0;
      const sv = await api("POST", "/api/v1/commands/view", { view: v });
      const st = await api("GET", "/api/v1/state");
      check(`set_view "${v}" reflected in state (+viewSeq bump)`, sv.status === 200 && st.json?.view === v && st.json?.viewSeq > before,
        `view=${st.json?.view} seq=${st.json?.viewSeq}`);
    }
    const badView = await api("POST", "/api/v1/commands/view", { view: "bogus" });
    check("set_view rejects an invalid view (400)", badView.status === 400, `status=${badView.status}`);

    // --- set_feedback_filter (item 5): state reflected, clearable ---
    const beforeF = (await api("GET", "/api/v1/state")).json?.filterSeq ?? 0;
    const sf = await api("POST", "/api/v1/commands/filter", { filter: { states: ["resolved"] } });
    const stF = await api("GET", "/api/v1/state");
    check("set_feedback_filter reflected in state", sf.status === 200 &&
      JSON.stringify(stF.json?.filter?.states) === JSON.stringify(["resolved"]) && stF.json?.filterSeq > beforeF,
      JSON.stringify(stF.json?.filter));
    const cf = await api("POST", "/api/v1/commands/filter", { filter: null });
    const stC = await api("GET", "/api/v1/state");
    check("set_feedback_filter clears with null", cf.status === 200 && (stC.json?.filter === null || stC.json?.filter === undefined),
      JSON.stringify(stC.json?.filter));

    // --- cleanup: leave nothing staged; NEVER finalize ---
    await api("DELETE", "/api/v1/specs/0/draft");
    const clean = await api("GET", "/api/v1/specs/0/draft");
    check("cleanup: draft removed (nothing committed/finalized)", clean.status === 200 && !clean.json?.draft);
  } catch (e) {
    fail++; failures.push("UNEXPECTED THROW: " + (e?.message || e));
    console.error("UNEXPECTED THROW:", e?.stack || e);
  } finally {
    if (!exited) { try { child.kill("SIGTERM"); } catch {} }
  }

  console.log(`\nsmoke-review-ux-mcp: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
