// Pure selector for tippani's ADO auth source.
//
// The invariant it enforces: once the embedding host injects a token
// (host-token mode), tippani NEVER switches to a different identity (a saved
// PAT, `az` CLI, or Git Credential Manager). A provided token that later expires
// must be REFRESHED by the host (POST /api/v1/ado-token) — never silently swapped
// for whatever identity a CLI happens to be signed into, which would act as the
// wrong user against ADO. In standalone mode (no host token — the tokenless npx
// install) the CLI/PAT fallback chain is allowed.
//
// Kept pure + importable (index.js runs a server on import and isn't testable),
// so the "never switch auth methods" rule has real unit coverage.

/**
 * @param {object} opts
 * @param {boolean} opts.hostTokenMode  true when the host injected a token at spawn.
 * @param {string|null} [opts.token]    the current live bearer (fresh or seeded), if any.
 * @param {string|null} [opts.pat]      a saved PAT, if any (standalone only).
 * @returns {{source: "token"|"pat"|"cli"|"none", token?: string, pat?: string}}
 *   - "token": use the live bearer.
 *   - "none":  host-token mode with no usable token — do NOT fall back; the host
 *              must refresh. Callers surface an error, never switch identity.
 *   - "pat"/"cli": standalone fallbacks (only when NOT host-token mode).
 */
export function selectAdoAuthSource({ hostTokenMode, token = null, pat = null } = {}) {
  if (token) return { source: "token", token };
  // A host token was provided but is now gone/expired: never switch methods.
  if (hostTokenMode) return { source: "none" };
  if (pat) return { source: "pat", pat };
  return { source: "cli" };
}
