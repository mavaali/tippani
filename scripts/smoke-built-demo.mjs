// smoke-built-demo — proves the BUNDLED CLI actually boots --demo cleanly.
//
// Why this exists: an esbuild bundling bug shipped and passed every source-
// level test. `scripts/build.js` bundles src/index.js into dist/cli.cjs with
// `--define:import.meta.url=__import_meta_url`, which rewrites
// `import.meta.url` to the BUNDLE's own file path. src/demo.js's direct-run
// guard (`process.argv[1] === import.meta.url`, now also basename-gated)
// depended on that comparison being false when demo.js is imported rather
// than run directly — inside the bundle it evaluated true, so `main()` in
// index.js started the demo AND demo.js's own direct-run branch started a
// SECOND demo server on the same port, which then crashed on EADDRINUSE.
//
// No unit test of src/demo.js or src/index.js in isolation can reproduce
// this: it only exists once esbuild has rewritten import.meta.url inside the
// single bundled file. This script builds the real artifact and boots it,
// the way a user running `npx tippani --demo` after `npm i -g tippani`
// actually would.
//
// Usage: node scripts/smoke-built-demo.mjs [--port <p>] [--skip-build]

import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const argVal = (name, def) => {
  const eq = args.find((a) => a === name || a.startsWith(name + "="));
  if (eq === undefined) return def;
  if (eq.includes("=")) return eq.split("=").slice(1).join("=");
  const i = args.indexOf(eq);
  return args[i + 1] !== undefined ? args[i + 1] : def;
};
const PORT = parseInt(argVal("--port", "3913"), 10);
const BASE = `http://127.0.0.1:${PORT}`;
const SKIP_BUILD = args.includes("--skip-build");
const CLI = join(ROOT, "dist", "cli.cjs");

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name); console.error("  FAIL: " + name + (detail ? ` — ${detail}` : "")); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady(timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { const r = await fetch(BASE + "/"); if (r.ok) return true; } catch {}
    await sleep(300);
  }
  return false;
}

// Count how many processes are actually listening on PORT. The shipped bug's
// failure mode was a SECOND server binding the same port and then losing the
// EADDRINUSE race — checking the HTTP response alone can't distinguish "one
// healthy server" from "two servers, one of which crashed after the other
// grabbed the port first." lsof is the same check used to verify this by
// hand during the original fix.
function listenerPidsOnPort(port) {
  try {
    // -sTCP:LISTEN matters: without it, lsof -i :port also matches this
    // script's OWN fetch() client connections to that port, which would
    // misreport a single healthy server as "two processes on the port."
    const out = execFileSync("lsof", ["-ti", `:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    if (e.code === "ENOENT") return null; // lsof not installed — caller treats as unknown, not a failure
    return []; // lsof ran but found nothing listening (its normal non-zero exit)
  }
}

async function main() {
  if (!SKIP_BUILD) {
    console.log("Building dist/cli.cjs (npm run build)...");
    execFileSync(process.execPath, [join(ROOT, "scripts", "build.js")], { cwd: ROOT, stdio: "inherit" });
  }
  check("dist/cli.cjs exists after build", existsSync(CLI));
  if (!existsSync(CLI)) throw new Error("build did not produce dist/cli.cjs");

  const child = spawn(process.execPath, [CLI, "--demo", "--headless", `--port=${PORT}`], {
    cwd: ROOT, stdio: ["ignore", "pipe", "inherit"],
  });
  let stdout = "";
  child.stdout.on("data", (d) => { stdout += d.toString(); });
  let exited = false, exitCode = null;
  child.on("exit", (code) => { exited = true; exitCode = code; });

  try {
    const ready = await waitReady();
    check("bundled --demo boots and serves the home page", ready);
    if (!ready) throw new Error("bundled demo did not become ready — stdout: " + stdout);

    // The actual regression: exactly one process should be listening, not two
    // racing for the port and one dying with EADDRINUSE. (This check is
    // best-effort: `null` means lsof isn't installed on this machine — e.g.
    // some CI images — and is skipped rather than failed, since the boot /
    // stdout checks above already catch the regression independently.)
    const pids = listenerPidsOnPort(PORT);
    if (pids === null) {
      console.error("  (skip: lsof not available — relying on boot + stdout checks above)");
    } else {
      check("exactly one process is listening on the port (no double-boot)", pids.length === 1, `pids=[${pids.join(",")}]`);
    }
    check("child process has not exited (would have if it lost an EADDRINUSE race)", !exited, `exitCode=${exitCode}`);
    check("stdout did not print the 'port already in use' error", !/already in use/i.test(stdout), stdout);

    const home = await fetch(BASE + "/");
    check("GET / -> 200", home.status === 200, `status=${home.status}`);

    const spec = await fetch(BASE + "/file/0");
    check("GET /file/0 -> 200", spec.status === 200, `status=${spec.status}`);

    // The demo's /api/review stub should share the SAME vote contract as the
    // real route (both built from review-vote.js) — proves the bundle didn't
    // silently drop that shared module.
    const review = await fetch(BASE + "/api/review", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "approve" }),
    });
    const reviewJson = await review.json();
    check("POST /api/review approve -> 200, vote 10", review.status === 200 && reviewJson.ok === true && reviewJson.vote === 10, JSON.stringify(reviewJson));

    const badReview = await fetch(BASE + "/api/review", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "not-a-real-type" }),
    });
    check("POST /api/review bad type -> 400", badReview.status === 400, `status=${badReview.status}`);
  } finally {
    if (!exited) child.kill("SIGTERM");
    // Best-effort: also reap anything else still bound to the port (e.g. the
    // second server from a reintroduced double-boot bug, which the parent
    // process here wouldn't otherwise know how to kill).
    await sleep(300);
    for (const pid of listenerPidsOnPort(PORT) || []) {
      try { process.kill(parseInt(pid, 10), "SIGKILL"); } catch {}
    }
  }
}

main()
  .catch((e) => { fail++; console.error("  FAIL: threw " + e.message); })
  .finally(() => {
    console.log(`\nsmoke-built-demo: ${pass} passed, ${fail} failed`);
    if (failures.length) console.error("Failures:\n" + failures.map((f) => "  - " + f).join("\n"));
    process.exit(fail > 0 ? 1 : 0);
  });
