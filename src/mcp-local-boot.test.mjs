// Integration test: the MCP shim boots WITHOUT an ADO token (local-only mode).
//
// Local review reads a git clone with no ADO, so a missing token must NOT stop
// the server — it starts, registers its tools, and waits on stdio. This spawns
// the REAL shim with no TIPPANI_ADO_TOKEN and the CLI fallback disabled (so it
// can't mint one), asserts it's still running (didn't process.exit), then closes
// stdin for a clean shutdown.
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHIM = path.join(HERE, "mcp.js");

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const env = { ...process.env, TIPPANI_ADO_TOKEN: "", TIPPANI_ADO_TOKEN_CLI_FALLBACK: "0", TIPPANI_ADO_AUDIENCE: "" };
  delete env.TIPPANI_ADO_TOKEN; // the whole point: no token at all

  const child = spawn(process.execPath, [SHIM], { stdio: ["pipe", "pipe", "pipe"], env });

  let exited = false;
  let exitCode = null;
  let stderr = "";
  child.on("exit", (code) => { exited = true; exitCode = code; });
  child.stderr.on("data", (d) => { stderr += d.toString(); });

  await wait(1500);
  check("shim boots without an ADO token (did not exit)", !exited);

  child.stdin.end();
  const deadline = Date.now() + 6000;
  while (!exited && Date.now() < deadline) await wait(50);

  check("shim exits cleanly on stdin close", exited && exitCode === 0);
  // Assert the local-only banner AFTER exit, so stderr is fully flushed.
  check("shim logs local-only mode", /local-only mode/i.test(stderr));

  if (!exited) { try { child.kill(); } catch {} }
} catch (e) {
  fail++;
  console.error("UNEXPECTED THROW:", e && e.stack);
} finally {
  console.log(`\nmcp-local-boot.test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
