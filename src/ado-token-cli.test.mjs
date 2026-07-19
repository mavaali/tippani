// Tests for the CLI token fallback: the enable/disable gate, source ordering,
// and that only a valid AAD JWT (not a Git Credential Manager PAT) is accepted.
import { cliFallbackEnabled, acquireAdoTokenFromCli } from "./ado-token-cli.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (aud = "499b84ac-1321-427f-aa17-267ca6975798") => `${b64u({ alg: "none" })}.${b64u({ aud })}.sig`;
const gitOut = (pw) => `protocol=https\nhost=dev.azure.com\nusername=x\npassword=${pw}\n`;

// runner stub keyed by command; value is stdout string, or an Error to throw.
function runStub(map) {
  return async (cmd) => {
    const key = cmd.startsWith("az") ? "az" : cmd;
    const v = map[key];
    if (v === undefined) throw new Error("not stubbed: " + cmd);
    if (v instanceof Error) throw v;
    return { stdout: v };
  };
}

// --- cliFallbackEnabled ------------------------------------------------------
ok("default on (unset)", cliFallbackEnabled({}));
ok("default on (empty)", cliFallbackEnabled({ TIPPANI_ADO_TOKEN_CLI_FALLBACK: "" }));
for (const v of ["0", "false", "off", "no", "FALSE", " Off "]) {
  ok(`disabled by '${v}'`, cliFallbackEnabled({ TIPPANI_ADO_TOKEN_CLI_FALLBACK: v }) === false);
}
for (const v of ["1", "true", "yes", "on"]) {
  ok(`enabled by '${v}'`, cliFallbackEnabled({ TIPPANI_ADO_TOKEN_CLI_FALLBACK: v }) === true);
}

// --- acquireAdoTokenFromCli --------------------------------------------------
const AUD = "499b84ac-1321-427f-aa17-267ca6975798";

// GCM yields a valid AAD JWT -> used, az never consulted (order).
eq("gcm jwt wins",
  await acquireAdoTokenFromCli({ audience: AUD, run: runStub({ git: gitOut(jwt()), az: jwt("other") }) }),
  jwt());

// GCM yields a PAT (opaque, not a JWT) -> rejected; az JWT used.
eq("pat falls through to az",
  await acquireAdoTokenFromCli({ audience: AUD, run: runStub({ git: gitOut("pat_opaque_token"), az: jwt() }) }),
  jwt());

// Neither source yields a usable token -> "".
eq("both junk -> empty",
  await acquireAdoTokenFromCli({ audience: AUD, run: runStub({ git: gitOut("pat"), az: "not-a-jwt" }) }),
  "");

// A CLI that isn't installed (throws) is skipped, not fatal.
eq("missing git -> az",
  await acquireAdoTokenFromCli({ audience: AUD, run: runStub({ git: new Error("ENOENT"), az: jwt() }) }),
  jwt());

// Wrong-audience JWT is rejected when an audience is expected.
eq("wrong audience rejected",
  await acquireAdoTokenFromCli({ audience: AUD, run: runStub({ git: gitOut(jwt("wrong")), az: "x" }) }),
  "");

// No audience configured -> any well-formed JWT passes.
eq("no audience accepts any jwt",
  await acquireAdoTokenFromCli({ run: runStub({ git: gitOut(jwt("anything")), az: "x" }) }),
  jwt("anything"));

console.log(`ado-token-cli: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
