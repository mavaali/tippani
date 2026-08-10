// Tests for the pure ADO auth-source selector (the "never switch auth methods
// once a host token was provided" invariant). Pure.
import { selectAdoAuthSource } from "./ado-auth-source.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

// A live token is always used, regardless of mode.
eq("live token wins (host mode)",
  selectAdoAuthSource({ hostTokenMode: true, token: "T", pat: "P" }), { source: "token", token: "T" });
eq("live token wins (standalone)",
  selectAdoAuthSource({ hostTokenMode: false, token: "T" }), { source: "token", token: "T" });

// THE INVARIANT: host-token mode with no live token must NOT fall back to PAT/CLI.
eq("host mode, no token -> none (never switch to PAT)",
  selectAdoAuthSource({ hostTokenMode: true, token: null, pat: "P" }), { source: "none" });
eq("host mode, no token, no pat -> none (never switch to CLI)",
  selectAdoAuthSource({ hostTokenMode: true, token: null, pat: null }), { source: "none" });
eq("host mode, empty-string token -> none (not a usable token)",
  selectAdoAuthSource({ hostTokenMode: true, token: "", pat: "P" }), { source: "none" });

// Standalone mode keeps the tokenless fallback chain: PAT then CLI.
eq("standalone, no token, has pat -> pat",
  selectAdoAuthSource({ hostTokenMode: false, token: null, pat: "P" }), { source: "pat", pat: "P" });
eq("standalone, nothing -> cli",
  selectAdoAuthSource({ hostTokenMode: false, token: null, pat: null }), { source: "cli" });
eq("defaults: no args -> cli (standalone, nothing)",
  selectAdoAuthSource({}), { source: "cli" });

console.log(`ado-auth-source: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
