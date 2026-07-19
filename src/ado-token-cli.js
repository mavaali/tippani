// CLI fallback for the ADO bearer token.
//
// The MCP shim normally receives the token as TIPPANI_ADO_TOKEN (the embedding
// host injects it). When it is absent — e.g. a standalone VS Code user who added
// Tippani via the MCP install link and never had a host inject a token — the shim
// mints one from the user's already-signed-in CLI instead of refusing to start.
// Enabled by default; disable by setting TIPPANI_ADO_TOKEN_CLI_FALLBACK to a
// falsy value (0/false/off/no) in the MCP server's env config.
//
// The client sends the token as `Authorization: Bearer`, so it must be an AAD
// access token (a JWT). Sources are tried in order and each candidate is gated by
// inspectAdoToken, so a Git Credential Manager PAT (opaque, not a JWT) is rejected
// and the next source is tried.

import { spawn } from "node:child_process";
import { inspectAdoToken } from "./ado-token-check.js";

// Azure DevOps resource app id — the audience `az` mints the bearer for.
const ADO_RESOURCE = "499b84ac-1321-427f-aa17-267ca6975798";

const FALSY = new Set(["0", "false", "off", "no"]);

/** Fallback is on unless explicitly disabled via TIPPANI_ADO_TOKEN_CLI_FALLBACK. */
export function cliFallbackEnabled(env = process.env) {
  const v = env.TIPPANI_ADO_TOKEN_CLI_FALLBACK;
  if (v == null || v === "") return true;
  return !FALSY.has(String(v).trim().toLowerCase());
}

// Git Credential Manager: `git credential fill` for dev.azure.com. GCM returns an
// AAD token OR a PAT as the password; a PAT (opaque) is filtered out downstream by
// inspectAdoToken.
async function fromGitCredential(run) {
  try {
    const { stdout } = await run("git", ["credential", "fill"], {
      input: "protocol=https\nhost=dev.azure.com\n\n",
    });
    const m = /(^|\n)password=([^\n\r]+)/.exec(stdout || "");
    return m ? m[2].trim() : "";
  } catch {
    return "";
  }
}

// Azure CLI: always mints an AAD bearer for the ADO resource (`az login` first).
async function fromAzureCli(run) {
  try {
    const az = process.platform === "win32" ? "az.cmd" : "az";
    const { stdout } = await run(az, [
      "account", "get-access-token",
      "--resource", ADO_RESOURCE,
      "--query", "accessToken", "-o", "tsv",
    ], {});
    return (stdout || "").trim();
  } catch {
    return "";
  }
}

const SOURCES = [fromGitCredential, fromAzureCli];

/**
 * Acquire an ADO bearer from the user's CLI. Tries Git Credential Manager then
 * Azure CLI, returning the first token that passes inspectAdoToken (a valid AAD
 * JWT). Returns "" when none work.
 * @param {object} [opts]
 * @param {string} [opts.audience] expected audience (TIPPANI_ADO_AUDIENCE)
 * @param {function} [opts.run] runner: (cmd, args, {input}) => Promise<{stdout}>
 * @param {function[]} [opts.sources] override the source list (tests)
 * @returns {Promise<string>}
 */
export async function acquireAdoTokenFromCli({ audience, run = defaultRun, sources = SOURCES } = {}) {
  for (const source of sources) {
    const token = await source(run);
    if (token && inspectAdoToken(token, audience).ok) return token;
  }
  return "";
}

// Default runner: spawn the CLI, feed optional stdin, collect stdout. Rejects on
// non-zero exit, spawn error, or a 20s timeout — every rejection is swallowed by
// the source, so a missing CLI just means "this source produced nothing".
function defaultRun(cmd, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("timeout")); }, 20_000);
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`exit ${code}`));
    });
    if (input != null) child.stdin.write(input);
    child.stdin.end();
  });
}
