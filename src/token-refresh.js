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

export async function maybeRefreshToken({
  selfAcquired,
  currentToken,
  nowMs = Date.now(),
  skewMs = 5 * 60 * 1000,
  isExpiring,
  acquire,
  apply,
}) {
  if (!selfAcquired || !currentToken) return { refreshed: false, reason: "not-self-acquired" };
  if (!isExpiring(currentToken, nowMs + skewMs)) return { refreshed: false, reason: "still-valid" };

  const fresh = await acquire();
  if (!fresh || fresh === currentToken) return { refreshed: false, reason: "no-new-token" };

  await apply(fresh);
  return { refreshed: true, token: fresh };
}
