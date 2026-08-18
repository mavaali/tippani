import crypto from "crypto";

export const BROWSER_SESSION_COOKIE = "tippani_app_session";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_CAPABILITIES = ["read", "mutate", "browser:bootstrap", "provider:credential"];

function tokenDigest(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function parseBearer(value) {
  const match = String(value || "").match(/^Bearer\s+([A-Za-z0-9_-]+)$/);
  return match ? match[1] : null;
}

function readCookie(header, name) {
  for (const part of String(header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim() || null;
    }
  }
  return null;
}

function normalizeReturnTo(value) {
  const input = String(value || "/");
  if (!input.startsWith("/") || input.startsWith("//")) return "/";
  try {
    const parsed = new URL(input, "http://tippani.local");
    if (parsed.origin !== "http://tippani.local") return "/";
    const resolved = parsed.pathname + parsed.search + parsed.hash;
    // Re-check the RESOLVED path: dot-segment resolution can turn a value that
    // passed the raw-input guards into a protocol-relative "//host" redirect
    // (e.g. "/..//evil.com" resolves to pathname "//evil.com").
    if (!resolved.startsWith("/") || resolved.startsWith("//")) return "/";
    return resolved;
  } catch {
    return "/";
  }
}

export function normalizeRequestOrigin(value) {
  if (typeof value !== "string" || !value || value.trim() !== value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (parsed.pathname && parsed.pathname !== "/") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function createLocalClientAuth({
  port,
  now = () => Date.now(),
  randomBytes = crypto.randomBytes,
  bootstrapTtlMs = 2 * 60_000,
  browserIdleTtlMs = 30 * 60_000,
  browserAbsoluteTtlMs = 8 * 60 * 60_000,
  bearerTtlMs = 8 * 60 * 60_000,
  maxAuditEvents = 200,
  onAudit = null,
} = {}) {
  if (!Number.isInteger(Number(port)) || Number(port) <= 0) {
    throw new TypeError("port must be a positive integer");
  }

  const baseUrl = `http://localhost:${Number(port)}`;
  const allowedOrigins = new Set([
    baseUrl,
    `http://127.0.0.1:${Number(port)}`,
  ]);
  const bootstrapTokens = new Map();
  const browserSessions = new Map();
  const bearerSessions = new Map();
  const auditEvents = [];

  function mintToken() {
    return randomBytes(32).toString("base64url");
  }

  function audit(type, details = {}) {
    const event = { type, at: now(), ...details };
    auditEvents.push(event);
    if (auditEvents.length > maxAuditEvents) auditEvents.shift();
    if (typeof onAudit === "function") onAudit(event);
  }

  function isAllowedOrigin(value) {
    const normalized = normalizeRequestOrigin(value);
    return normalized !== null && allowedOrigins.has(normalized);
  }

  function setBrowserCookie(res, token, maxAgeMs) {
    const maxAge = Math.max(0, Math.floor(maxAgeMs / 1000));
    res.setHeader(
      "Set-Cookie",
      `${BROWSER_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`,
    );
  }

  function clearBrowserCookie(res) {
    res.setHeader(
      "Set-Cookie",
      `${BROWSER_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
    );
  }

  function createBrowserBootstrap({ returnTo = "/" } = {}) {
    const current = now();
    for (const [key, value] of bootstrapTokens) {
      if (value.expiresAt <= current) bootstrapTokens.delete(key);
    }
    const token = mintToken();
    const expiresAt = current + bootstrapTtlMs;
    bootstrapTokens.set(tokenDigest(token), {
      expiresAt,
      returnTo: normalizeReturnTo(returnTo),
    });
    audit("bootstrap_created", { expiresAt });
    return {
      token,
      expiresAt,
      url: `${baseUrl}/auth/bootstrap?token=${encodeURIComponent(token)}`,
    };
  }

  function createBrowserSession() {
    const token = mintToken();
    const createdAt = now();
    const record = {
      createdAt,
      lastSeenAt: createdAt,
      expiresAt: createdAt + browserAbsoluteTtlMs,
    };
    browserSessions.set(tokenDigest(token), record);
    audit("browser_session_created", { expiresAt: record.expiresAt });
    return { token, ...record };
  }

  function exchangeBrowserBootstrap(token) {
    const key = tokenDigest(token);
    const bootstrap = bootstrapTokens.get(key);
    bootstrapTokens.delete(key);
    if (!bootstrap) {
      audit("bootstrap_rejected", { reason: "unknown_or_replayed" });
      return null;
    }
    if (bootstrap.expiresAt <= now()) {
      audit("bootstrap_rejected", { reason: "expired" });
      return null;
    }
    const session = createBrowserSession();
    audit("bootstrap_consumed");
    return { ...session, returnTo: bootstrap.returnTo };
  }

  function browserSessionFromRequest(req) {
    const token = readCookie(req.headers.cookie, BROWSER_SESSION_COOKIE);
    if (!token) return null;
    const key = tokenDigest(token);
    const record = browserSessions.get(key);
    if (!record) return null;
    const current = now();
    if (
      record.expiresAt <= current ||
      record.lastSeenAt + browserIdleTtlMs <= current
    ) {
      browserSessions.delete(key);
      audit("browser_session_expired");
      return null;
    }
    record.lastSeenAt = current;
    return { token, key, record };
  }

  function revokeBrowserSession(req) {
    const session = browserSessionFromRequest(req);
    if (!session) return false;
    browserSessions.delete(session.key);
    audit("browser_session_revoked");
    return true;
  }

  function rotateBrowserSession(req, res) {
    const session = browserSessionFromRequest(req);
    if (!session) return null;
    browserSessions.delete(session.key);
    const replacement = createBrowserSession();
    setBrowserCookie(res, replacement.token, browserAbsoluteTtlMs);
    audit("browser_session_rotated");
    return replacement;
  }

  function createBearerSession({
    clientName,
    capabilities = DEFAULT_CAPABILITIES,
    ttlMs = bearerTtlMs,
  } = {}) {
    const normalizedClient = String(clientName || "").trim();
    if (!normalizedClient) throw new TypeError("clientName is required");
    const token = mintToken();
    const createdAt = now();
    const record = {
      clientName: normalizedClient,
      capabilities: new Set(capabilities),
      createdAt,
      expiresAt: createdAt + ttlMs,
      ttlMs,
    };
    bearerSessions.set(tokenDigest(token), record);
    audit("bearer_session_created", {
      clientName: normalizedClient,
      capabilities: [...record.capabilities],
      expiresAt: record.expiresAt,
    });
    return {
      token,
      clientName: normalizedClient,
      capabilities: [...record.capabilities],
      expiresAt: record.expiresAt,
    };
  }

  function bearerSession(token, clientName, capability) {
    const key = tokenDigest(token);
    const record = bearerSessions.get(key);
    if (!record) return null;
    if (record.expiresAt <= now()) {
      bearerSessions.delete(key);
      audit("bearer_session_expired", { clientName: record.clientName });
      return null;
    }
    if (record.clientName !== String(clientName || "")) return null;
    if (capability && !record.capabilities.has(capability)) return null;
    return { key, record };
  }

  function rotateBearerSession(token) {
    const key = tokenDigest(token);
    const current = bearerSessions.get(key);
    if (!current || current.expiresAt <= now()) {
      bearerSessions.delete(key);
      return null;
    }
    bearerSessions.delete(key);
    const replacement = createBearerSession({
      clientName: current.clientName,
      capabilities: [...current.capabilities],
      ttlMs: current.ttlMs,
    });
    audit("bearer_session_rotated", { clientName: current.clientName });
    return replacement;
  }

  function revokeBearerSession(token) {
    const key = tokenDigest(token);
    const record = bearerSessions.get(key);
    if (!record) return false;
    bearerSessions.delete(key);
    audit("bearer_session_revoked", { clientName: record.clientName });
    return true;
  }

  function requireControlAuth({
    mutation = false,
    capability = null,
    allowBrowser = true,
  } = {}) {
    return (req, res, next) => {
      const browser = browserSessionFromRequest(req);
      if (browser) {
        if (!allowBrowser) {
          return res.status(403).json({ error: "This operation requires a brokered client session" });
        }
        if (mutation && !isAllowedOrigin(req.headers.origin)) {
          audit("browser_request_rejected", { reason: "origin", path: req.path });
          return res.status(403).json({ error: "Forbidden: exact Origin required" });
        }
        return next();
      }

      const clientName = req.headers["x-tippani-client"];
      if (!clientName) {
        return res.status(403).json({ error: "missing X-Tippani-Client header" });
      }
      const token = parseBearer(req.headers.authorization);
      if (!token) {
        return res.status(401).json({ error: "invalid or missing app session bearer" });
      }
      const requiredCapability = capability || (mutation ? "mutate" : "read");
      if (!bearerSession(token, clientName, requiredCapability)) {
        audit("bearer_request_rejected", {
          clientName: String(clientName),
          capability: requiredCapability,
          path: req.path,
        });
        return res.status(401).json({ error: "invalid, expired, or insufficient app session bearer" });
      }
      next();
    };
  }

  function requireBrowserMutation(req, res, next) {
    if (SAFE_METHODS.has(req.method) || req.path.startsWith("/api/v1/")) return next();
    if (!isAllowedOrigin(req.headers.origin)) {
      audit("browser_request_rejected", { reason: "origin", path: req.path });
      return res.status(403).json({ error: "Forbidden: exact Origin required" });
    }
    if (!browserSessionFromRequest(req)) {
      audit("browser_request_rejected", { reason: "session", path: req.path });
      return res.status(401).json({ error: "Authentication required" });
    }
    next();
  }

  function requireBrowserPage(req, res, next) {
    if (req.path.startsWith("/api/v1/") || req.path.startsWith("/auth/")) return next();
    if (!SAFE_METHODS.has(req.method)) return next();
    if (browserSessionFromRequest(req)) return next();
    res
      .status(401)
      .set("Cache-Control", "no-store")
      .type("html")
      .send(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>Authentication required</title></head>" +
        "<body><main><h1>Authentication required</h1>" +
        "<p>Open Tippani from the CLI or authenticated client to start a browser session.</p></main></body></html>",
      );
  }

  function mount(app) {
    // Express automatically routes HEAD through a matching GET handler when no
    // explicit HEAD route exists. Link checkers commonly probe hyperlinks with
    // HEAD; letting that reach the exchange would consume the one-time token
    // before the browser navigates. Confirm the local endpoint exists without
    // validating or exchanging the credential.
    app.head("/auth/bootstrap", (_req, res) => {
      res.status(200).set("Cache-Control", "no-store").end();
    });
    app.get("/auth/bootstrap", (req, res) => {
      const result = exchangeBrowserBootstrap(req.query.token);
      if (!result) {
        return res
          .status(401)
          .set("Cache-Control", "no-store")
          .type("html")
          .send("<!doctype html><html><body><h1>Bootstrap link expired or already used</h1></body></html>");
      }
      revokeBrowserSession(req);
      setBrowserCookie(res, result.token, result.expiresAt - now());
      res.set("Cache-Control", "no-store").redirect(303, result.returnTo);
    });
    app.post("/auth/session/rotate", requireBrowserMutation, (req, res) => {
      const replacement = rotateBrowserSession(req, res);
      if (!replacement) return res.status(401).json({ error: "Authentication required" });
      res.json({ ok: true, expiresAt: replacement.expiresAt });
    });
    app.post("/auth/logout", requireBrowserMutation, (req, res) => {
      revokeBrowserSession(req);
      clearBrowserCookie(res);
      res.json({ ok: true });
    });
    app.use(requireBrowserMutation);
    app.use(requireBrowserPage);
  }

  return {
    baseUrl,
    isAllowedOrigin,
    createBrowserBootstrap,
    exchangeBrowserBootstrap,
    createBearerSession,
    rotateBearerSession,
    revokeBearerSession,
    requireControlAuth,
    mount,
    getAuditEvents: () => auditEvents.map((event) => ({ ...event })),
  };
}
