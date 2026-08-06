// Tests for the self-acquired token refresh gate: only self-acquired tokens
// near expiry are re-minted; host-injected tokens are never touched.
import { maybeRefreshToken } from "./token-refresh.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

const NOW = 1_000_000;
const expiringSoon = (t, at) => at >= NOW + 4 * 60 * 1000; // "expires within ~5m of NOW"

// Host-injected token: never refreshed even if expiring.
{
  let applied = null;
  const r = await maybeRefreshToken({
    selfAcquired: false, currentToken: "host", nowMs: NOW,
    isExpiring: expiringSoon, acquire: async () => "new", apply: async (t) => { applied = t; },
  });
  eq("host token: not refreshed", r.refreshed, false);
  ok("host token: apply not called", applied === null);
}

// Self-acquired but still valid: no refresh.
{
  let acquired = false;
  const r = await maybeRefreshToken({
    selfAcquired: true, currentToken: "cur", nowMs: NOW, skewMs: 60 * 1000,
    isExpiring: () => false, acquire: async () => { acquired = true; return "new"; }, apply: async () => {},
  });
  eq("valid token: not refreshed", r.refreshed, false);
  ok("valid token: acquire not called", acquired === false);
}

// Self-acquired + near expiry: re-mints and applies.
{
  let applied = null;
  const r = await maybeRefreshToken({
    selfAcquired: true, currentToken: "old", nowMs: NOW,
    isExpiring: expiringSoon, acquire: async () => "fresh", apply: async (t) => { applied = t; },
  });
  eq("expiring token: refreshed", r.refreshed, true);
  eq("expiring token: returns new", r.token, "fresh");
  eq("expiring token: applied new", applied, "fresh");
}

// Self-acquired + near expiry but CLI yields nothing (or same token): no apply.
{
  let applied = null;
  const r1 = await maybeRefreshToken({
    selfAcquired: true, currentToken: "old", nowMs: NOW,
    isExpiring: expiringSoon, acquire: async () => "", apply: async (t) => { applied = t; },
  });
  eq("no new token: not refreshed", r1.refreshed, false);
  ok("no new token: apply not called", applied === null);

  const r2 = await maybeRefreshToken({
    selfAcquired: true, currentToken: "same", nowMs: NOW,
    isExpiring: expiringSoon, acquire: async () => "same", apply: async (t) => { applied = t; },
  });
  eq("same token: not refreshed", r2.refreshed, false);
  ok("same token: apply not called", applied === null);
}

console.log(`token-refresh: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
