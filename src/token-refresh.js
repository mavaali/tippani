// Mid-session refresh for a SELF-ACQUIRED ADO bearer.
//
// When no token is injected, the MCP shim mints an AAD bearer from the user's
// CLI once at startup (see ado-token-cli.js). AAD tokens expire in ~1h, so a
// long session would start failing ADO calls until restart. This re-mints the
// bearer when it is near expiry — but ONLY for the self-acquired case. A
// host-injected token is the host's to refresh (it never gets swapped from
// under the host), so callers pass selfAcquired=false for it and this is a
// no-op.
//
// Pure and dependency-injected so it is unit-testable without a portal or CLI:
// the caller supplies isExpiring (usually isExpiredJwt with an expiry skew),
// acquire (re-run the CLI fallback), and apply (persist + push the new token).
//
// A failed acquisition is COOLED DOWN via lastFailedAt: the CLI fallback runs
// external commands with multi-second timeouts, and this gate sits in front of
// EVERY tool call — without a cooldown, an expired token plus a signed-out CLI
// (e.g. `az login` lapsed) would stall every call, including purely local ones,
// forever. Callers persist the returned failedAt and pass it back.

export async function maybeRefreshToken({
  selfAcquired,
  currentToken,
  nowMs = Date.now(),
  skewMs = 5 * 60 * 1000,
  isExpiring,
  acquire,
  apply,
  lastFailedAt = 0,
  failureCooldownMs = 5 * 60 * 1000,
}) {
  if (!selfAcquired || !currentToken) return { refreshed: false, reason: "not-self-acquired" };
  if (!isExpiring(currentToken, nowMs + skewMs)) return { refreshed: false, reason: "still-valid" };
  if (lastFailedAt && nowMs - lastFailedAt < failureCooldownMs) {
    return { refreshed: false, reason: "cooldown" };
  }

  const fresh = await acquire();
  if (!fresh || fresh === currentToken) {
    return { refreshed: false, reason: "no-new-token", failedAt: nowMs };
  }

  await apply(fresh);
  return { refreshed: true, token: fresh };
}
