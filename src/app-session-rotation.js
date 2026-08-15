// App-session rotation policy for the long-lived portal process.
//
// index.js starts a server on import, so it cannot be imported by a test. The
// rotation decision and its failure ordering live here instead: a persist that
// fails must leave the OLD session usable, never a half-published new one.

export const ROTATION_INTERVAL_MS = 15 * 60_000;
export const ROTATION_REFRESH_WINDOW_MS = 60 * 60_000;

export function createAppSessionRotation({
  session,
  createSession,
  revokeSession,
  persist,
  now = () => Date.now(),
  onWarn = () => {},
  refreshWindowMs = ROTATION_REFRESH_WINDOW_MS,
} = {}) {
  if (!session?.token) throw new TypeError("session with a token is required");
  for (const [name, fn] of [
    ["createSession", createSession],
    ["revokeSession", revokeSession],
    ["persist", persist],
  ]) {
    if (typeof fn !== "function") throw new TypeError(`${name} must be a function`);
  }

  let current = session;

  function rotateIfDue() {
    if (current.expiresAt - now() > refreshWindowMs) return "skipped";
    const previous = current;
    const replacement = createSession();
    try {
      persist(replacement);
    } catch (error) {
      // Drop the unpublished replacement and keep serving the old session.
      revokeSession(replacement.token);
      // persist may have HALF-published the replacement before throwing (e.g.
      // the token file was written but the registry write failed). Re-persist
      // the still-valid previous session best-effort so no store is left
      // advertising the token we just revoked.
      try { persist(previous); } catch { /* stores unavailable; keep serving */ }
      onWarn(`could not rotate app session: ${error.message}`);
      return "failed";
    }
    current = replacement;
    revokeSession(previous.token);
    return "rotated";
  }

  return {
    get current() { return current; },
    rotateIfDue,
    revokeCurrent: () => revokeSession(current.token),
  };
}
