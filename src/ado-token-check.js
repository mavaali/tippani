// Startup validation of the ADO token the MCP shim was handed.
//
// The MCP shim registers its tools without contacting Azure DevOps (the portal
// launches lazily on open_pr). That means an MCP "Test connection" — which only
// lists tools — could succeed even when the WRONG token was bound and it can't
// authenticate to ADO. This check gives Test real teeth.
//
// It inspects the token OFFLINE (no network, so no false "anonymous 200" from
// ADO and no offline flakiness): the token must be an Azure DevOps git/REST
// access token — a JWT whose audience matches the one the host expects (supplied
// via the TIPPANI_ADO_AUDIENCE env var; typically the Azure DevOps git/REST
// resource app id). A GitHub OAuth token (gho_…) is not a JWT and is rejected; a
// JWT minted for a different resource is rejected too. When no expected audience
// is configured, any well-formed JWT is allowed (audience unverified).

/**
 * Inspect the bound account's token (offline).
 * @param {string} token
 * @param {string} [expectedAudience] Audience the host expects the token to
 *   carry (e.g. the Azure DevOps git/REST resource app id). When omitted or
 *   empty, the audience is not checked and any well-formed JWT passes.
 * @returns {{ok: boolean, reason: string, aud?: string}}
 *   ok=false with reason "no-token" | "not-a-jwt" | "wrong-audience".
 */
export function inspectAdoToken(token, expectedAudience) {
  if (!token) return { ok: false, reason: "no-token" };
  const parts = token.split(".");
  // GitHub OAuth tokens (gho_/ghp_/ghu_…) and other opaque tokens aren't JWTs.
  if (parts.length !== 3) return { ok: false, reason: "not-a-jwt" };
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    // Shaped like a JWT but unparseable — don't false-fail a valid-but-odd token.
    return { ok: true, reason: "unparseable-jwt-allow" };
  }
  const aud = String(payload.aud ?? "");
  if (!expectedAudience) return { ok: true, reason: "ado-jwt-unverified", aud };
  if (aud.includes(expectedAudience)) return { ok: true, reason: "ado-git", aud };
  return { ok: false, reason: "wrong-audience", aud };
}

/** Human-readable reason for a rejected token, for stderr/Test surfacing. */
export function tokenRejectionMessage(result) {
  if (result.reason === "no-token") {
    return "tippani-mcp: no Azure DevOps token was provided. Enable this server " +
      "with an Azure DevOps (Tippani) account bound to it.";
  }
  if (result.reason === "not-a-jwt") {
    return "tippani-mcp: the bound account is not an Azure DevOps account (its " +
      "token is not an ADO access token). Bind the Tippani (Azure DevOps) " +
      "account to this server, not a GitHub or other account.";
  }
  return "tippani-mcp: the bound account's token has the wrong audience " +
    `(${result.aud || "unknown"}) for the Azure DevOps git/REST API. Bind the ` +
    "Tippani (Azure DevOps) account to this server.";
}

/**
 * True only when `token` is a JWT whose `exp` claim is already in the past.
 * Non-JWT tokens (PATs, opaque tokens) and JWTs without a numeric `exp` return
 * false — they can't be judged expired offline, so they are not turned away.
 * Used by the /api/v1/ado-token hot-swap to reject a stale bearer up front
 * instead of binding it and only failing on the next ADO call.
 * @param {string} token
 * @param {number} [nowMs] current time in ms (injectable for tests)
 * @returns {boolean}
 */
export function isExpiredJwt(token, nowMs = Date.now()) {
  if (typeof token !== "string" || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return false;
  }
  if (typeof payload.exp !== "number") return false;
  return payload.exp * 1000 <= nowMs;
}

/** Return the signed-in identity carried by an ADO JWT, or null. */
export function identityFromAdoToken(token) {
  if (typeof token !== "string" || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const identity = payload.upn || payload.unique_name || payload.preferred_username || payload.email || payload.name;
    return typeof identity === "string" && identity.trim() ? identity.trim() : null;
  } catch {
    return null;
  }
}
