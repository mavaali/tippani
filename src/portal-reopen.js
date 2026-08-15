// Adopt a portal that is ALREADY running and mint a fresh one-time browser
// sign-in link for it.
//
// The local client boundary is authenticated: a bare portal URL is refused as
// unauthenticated, and a browser only gets a session by consuming a single-use
// /auth/bootstrap link. The running portal is the only thing that can mint one,
// and it mints exactly one at startup when it is not headless. So a user whose
// portal is already up — started headless, or whose browser session expired,
// or who simply closed the tab and lost the cookie — had no way back in: the
// port is taken, a second `tippani <pr>` dies on EADDRINUSE, and restarting
// throws away the live review state.
//
// This adopts the running portal over its registered app-session bearer and
// asks it for a new bootstrap link, so reconnecting never requires a restart.

import { listInstances as defaultListInstances } from "./portal-registry.js";

export const BOOTSTRAP_PATH = "/api/v1/auth/browser-bootstrap";

export class PortalReopenError extends Error {
  constructor(message, { code = "reopen_failed", ports = [] } = {}) {
    super(message);
    this.name = "PortalReopenError";
    this.code = code;
    this.ports = ports;
  }
}

function usable(instance) {
  return Boolean(
    instance &&
    Number.isFinite(Number(instance.port)) &&
    Number(instance.port) > 0 &&
    instance.token,
  );
}

function instanceUrl(instance) {
  return instance.url || `http://localhost:${Number(instance.port)}`;
}

/**
 * Pick the running portal to adopt. With no --port, exactly one candidate must
 * exist: silently steering a reconnect at an arbitrary one of several portals
 * would drop the user into the wrong review.
 */
export function selectInstance(instances, { port = null } = {}) {
  const candidates = (Array.isArray(instances) ? instances : []).filter(usable);
  if (port != null) {
    const wanted = Number(port);
    const match = candidates.find((item) => Number(item.port) === wanted);
    if (!match) {
      throw new PortalReopenError(
        `No Tippani portal is registered on port ${wanted}.`,
        { code: "no_portal_on_port", ports: candidates.map((i) => Number(i.port)) },
      );
    }
    return match;
  }
  if (candidates.length === 0) {
    throw new PortalReopenError(
      "No Tippani portal is running. Start one first, for example `tippani <PR_ID>` or `tippani --browse`.",
      { code: "no_portal" },
    );
  }
  if (candidates.length > 1) {
    const ports = candidates.map((item) => Number(item.port)).sort((a, b) => a - b);
    throw new PortalReopenError(
      `Several Tippani portals are running (ports ${ports.join(", ")}). Re-run with --port=<n>.`,
      { code: "ambiguous_portal", ports },
    );
  }
  return candidates[0];
}

/** Ask one running portal for a fresh single-use browser sign-in link. */
export async function requestBootstrapUrl({
  instance,
  returnTo = "/",
  fetchImpl = fetch,
  now = () => Date.now(),
} = {}) {
  if (!usable(instance)) {
    throw new PortalReopenError("No usable Tippani portal was supplied.", {
      code: "no_portal",
    });
  }
  if (instance.tokenExpiresAt != null && Number(instance.tokenExpiresAt) <= now()) {
    throw new PortalReopenError(
      "The registered app session for that portal has expired. Restart Tippani to get a new one.",
      { code: "stale_session", ports: [Number(instance.port)] },
    );
  }
  const base = instanceUrl(instance);
  let response;
  try {
    response = await fetchImpl(base + BOOTSTRAP_PATH, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${instance.token}`,
        "X-Tippani-Client": String(instance.clientName || "tippani-external"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ returnTo }),
    });
  } catch {
    throw new PortalReopenError(
      `Could not reach the Tippani portal at ${base}. It may have exited; the registry entry is stale.`,
      { code: "portal_unreachable", ports: [Number(instance.port)] },
    );
  }
  let body = null;
  try { body = await response.json(); } catch { /* non-JSON error page */ }
  if (response.status === 401 || response.status === 403) {
    throw new PortalReopenError(
      "The registered app session for that portal was rejected. Restart Tippani to get a new one.",
      { code: "stale_session", ports: [Number(instance.port)] },
    );
  }
  if (!response.ok || !body?.url) {
    throw new PortalReopenError(
      body?.error || "The Tippani portal refused to create a browser session.",
      { code: "bootstrap_refused", ports: [Number(instance.port)] },
    );
  }
  return {
    url: body.url,
    expiresAt: body.expiresAt ?? null,
    port: Number(instance.port),
    prId: instance.prId ?? null,
    provider: instance.provider || "ado",
  };
}

/** Adopt the running portal and return a fresh one-time browser sign-in link. */
export async function reopenPortal({
  port = null,
  returnTo = "/",
  listInstancesFn = defaultListInstances,
  fetchImpl = fetch,
  now = () => Date.now(),
} = {}) {
  const instance = selectInstance(listInstancesFn(), { port });
  return requestBootstrapUrl({ instance, returnTo, fetchImpl, now });
}

export function parseReopenArgs(args = []) {
  const list = Array.isArray(args) ? args.map(String) : [];
  const portArg = list.find((a) => a.startsWith("--port="));
  const parsedPort = portArg ? parseInt(portArg.split("=")[1], 10) : NaN;
  const pathArg = list.find((a) => a.startsWith("--path="));
  const returnTo = pathArg ? pathArg.split("=").slice(1).join("=") : "/";
  return {
    port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : null,
    headless: list.includes("--headless"),
    returnTo: returnTo.startsWith("/") ? returnTo : "/" + returnTo,
  };
}

async function defaultOpen(url) {
  const { default: open } = await import("open");
  return open(url);
}

/**
 * `tippani open` / `tippani reopen`. Resolves to a process exit code so the
 * caller decides how to exit.
 */
export async function runReopenCommand({
  args = [],
  listInstancesFn = defaultListInstances,
  fetchImpl = fetch,
  openFn = defaultOpen,
  log = console.log,
  logError = console.error,
  now = () => Date.now(),
} = {}) {
  const { port, headless, returnTo } = parseReopenArgs(args);
  let result;
  try {
    result = await reopenPortal({ port, returnTo, listInstancesFn, fetchImpl, now });
  } catch (e) {
    logError(`\n  ${e.message}\n`);
    return 1;
  }
  log(`\n  Tippani portal on port ${result.port} — one-time sign-in link:`);
  log(`  ${result.url}`);
  log("  This link works once and expires shortly. Re-run `tippani open` for another.\n");
  if (!headless) {
    try { await openFn(result.url); }
    catch { log("  Could not open a browser automatically — use the link above.\n"); }
  }
  return 0;
}
