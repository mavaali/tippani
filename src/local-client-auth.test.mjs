import express from "express";
import {
  BROWSER_SESSION_COOKIE,
  createLocalClientAuth,
  normalizeRequestOrigin,
} from "./local-client-auth.js";

let pass = 0, fail = 0;
function check(name, condition) {
  if (condition) pass++;
  else { fail++; console.error("  FAIL: " + name); }
}

let clock = 1_000_000;
let sequence = 0;
const randomBytes = (size) => Buffer.alloc(size, ++sequence);
const auth = createLocalClientAuth({
  port: 3847,
  now: () => clock,
  randomBytes,
  bootstrapTtlMs: 1_000,
  browserIdleTtlMs: 2_000,
  browserAbsoluteTtlMs: 5_000,
  bearerTtlMs: 3_000,
});

check("origin: exact localhost allowed", auth.isAllowedOrigin("http://localhost:3847"));
check("origin: exact loopback allowed", auth.isAllowedOrigin("http://127.0.0.1:3847"));
for (const value of [
  "",
  "null",
  "http://localhost:38470",
  "http://localhost:3847.evil.com",
  "http://localhost:3847@evil.com",
  "https://localhost:3847",
  "http://localhost:3847/path",
  " http://localhost:3847",
]) {
  check(`origin: rejects ${JSON.stringify(value)}`, !auth.isAllowedOrigin(value));
}
check("origin: normalization is explicit", normalizeRequestOrigin("http://LOCALHOST:3847/") === "http://localhost:3847");

const firstBootstrap = auth.createBrowserBootstrap({ returnTo: "/file/1?view=current" });
check("bootstrap: points at local exchange", firstBootstrap.url.startsWith("http://localhost:3847/auth/bootstrap?token="));
const exchanged = auth.exchangeBrowserBootstrap(firstBootstrap.token);
check("bootstrap: preserves safe return path", exchanged.returnTo === "/file/1?view=current");
check("bootstrap: one-time replay rejected", auth.exchangeBrowserBootstrap(firstBootstrap.token) === null);

// The bootstrap exchange 303-redirects to returnTo, so an attacker-supplied
// value must never leave this origin.
for (const hostile of [
  "//evil.com",
  "http://evil.com/",
  "https://evil.com/path",
  "////evil.com",
  "javascript:alert(1)",
  "file:///etc/passwd",
  // Dot-segment resolution must not reintroduce a protocol-relative "//host":
  // these pass a raw-prefix check but resolve to pathname "//evil.com".
  "/..//evil.com",
  "/./..//evil.com",
  "/x/../..//attacker.example/path",
  "/\\evil.com",
]) {
  const attempt = auth.createBrowserBootstrap({ returnTo: hostile });
  const result = auth.exchangeBrowserBootstrap(attempt.token);
  check(`bootstrap: rejects off-origin returnTo ${JSON.stringify(hostile)}`, result.returnTo === "/");
}

const expiredBootstrap = auth.createBrowserBootstrap();
clock += 1_001;
check("bootstrap: expired token rejected", auth.exchangeBrowserBootstrap(expiredBootstrap.token) === null);

const bearer = auth.createBearerSession({
  clientName: "mcp",
  capabilities: ["read", "browser:bootstrap"],
});
const app = express();
app.use(express.json());
auth.mount(app);
app.get("/api/v1/read", auth.requireControlAuth(), (_req, res) => res.json({ ok: true }));
app.post("/api/v1/write", auth.requireControlAuth({ mutation: true }), (_req, res) => res.json({ ok: true }));
app.post(
  "/api/v1/bootstrap",
  auth.requireControlAuth({ mutation: true, capability: "browser:bootstrap" }),
  (_req, res) => res.json({ ok: true }),
);
// Mirrors the production credential/bootstrap routes: a browser session must
// never be able to mint bootstraps or swap provider credentials.
app.post(
  "/api/v1/broker-only",
  auth.requireControlAuth({
    mutation: true,
    capability: "provider:credential",
    allowBrowser: false,
  }),
  (_req, res) => res.json({ ok: true }),
);
app.get("/", (_req, res) => res.type("html").send("<h1>Portal</h1>"));
app.post("/api/legacy", (_req, res) => res.json({ ok: true }));

const server = await new Promise((resolve) => {
  const value = app.listen(0, "127.0.0.1", () => resolve(value));
});
const base = `http://127.0.0.1:${server.address().port}`;

async function request(path, options = {}) {
  return fetch(base + path, options);
}

try {
  let response = await request("/");
  check("page: fresh profile gets authentication-required surface", response.status === 401 && (await response.text()).includes("Authentication required"));

  const browserBootstrap = auth.createBrowserBootstrap({ returnTo: "/" });
  response = await request(new URL(browserBootstrap.url).pathname + new URL(browserBootstrap.url).search, { redirect: "manual" });
  const setCookie = response.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  check("bootstrap route: redirects after exchange", response.status === 303 && response.headers.get("location") === "/");
  check("bootstrap route: cookie is HttpOnly SameSite Strict", setCookie.includes("HttpOnly") && setCookie.includes("SameSite=Strict"));
  check("bootstrap route: uses named app-session cookie", cookie.startsWith(BROWSER_SESSION_COOKIE + "="));

  response = await request("/", { headers: { Cookie: cookie } });
  check("page: browser session unlocks portal", response.status === 200);

  response = await request("/api/legacy", {
    method: "POST",
    headers: { Cookie: cookie, Origin: "http://localhost:3847" },
  });
  check("legacy mutation: exact origin plus session accepted", response.status === 200);

  response = await request("/api/legacy", {
    method: "POST",
    headers: { Cookie: cookie, Origin: "http://localhost:38470" },
  });
  check("legacy mutation: lookalike origin rejected", response.status === 403);

  response = await request("/api/legacy", {
    method: "POST",
    headers: { Origin: "http://localhost:3847" },
  });
  check("legacy mutation: origin alone rejected", response.status === 401);

  response = await request("/api/v1/read", {
    headers: { "X-Tippani-Client": "mcp", Authorization: `Bearer ${bearer.token}` },
  });
  check("bearer: matching client and read capability accepted", response.status === 200);

  response = await request("/api/v1/write", {
    method: "POST",
    headers: { "X-Tippani-Client": "mcp", Authorization: `Bearer ${bearer.token}` },
  });
  check("bearer: insufficient capability rejected", response.status === 401);

  response = await request("/api/v1/bootstrap", {
    method: "POST",
    headers: { "X-Tippani-Client": "other", Authorization: `Bearer ${bearer.token}` },
  });
  check("bearer: bound client identity enforced", response.status === 401);

  const rotated = auth.rotateBearerSession(bearer.token);
  response = await request("/api/v1/read", {
    headers: { "X-Tippani-Client": "mcp", Authorization: `Bearer ${bearer.token}` },
  });
  check("bearer: rotation revokes old token", response.status === 401);
  response = await request("/api/v1/read", {
    headers: { "X-Tippani-Client": "mcp", Authorization: `Bearer ${rotated.token}` },
  });
  check("bearer: rotated token works", response.status === 200);
  check("bearer: explicit revocation succeeds", auth.revokeBearerSession(rotated.token));
  response = await request("/api/v1/read", {
    headers: { "X-Tippani-Client": "mcp", Authorization: `Bearer ${rotated.token}` },
  });
  check("bearer: revoked token rejected", response.status === 401);

  const expiring = auth.createBearerSession({ clientName: "mcp", capabilities: ["read"] });
  response = await request("/api/v1/broker-only", {
    method: "POST",
    headers: { Cookie: cookie, Origin: "http://localhost:3847" },
  });
  check("broker-only: browser session cannot reach credential routes", response.status === 403);

  const credentialBearer = auth.createBearerSession({
    clientName: "mcp",
    capabilities: ["provider:credential"],
  });
  response = await request("/api/v1/broker-only", {
    method: "POST",
    headers: {
      "X-Tippani-Client": "mcp",
      Authorization: `Bearer ${credentialBearer.token}`,
    },
  });
  check("broker-only: capability bearer accepted", response.status === 200);

  // A second, independent browser session so rotate/logout do not disturb the
  // idle-expiry assertion below.
  const second = auth.createBrowserBootstrap({ returnTo: "/" });
  response = await request(`/auth/bootstrap?token=${encodeURIComponent(second.token)}`, {
    redirect: "manual",
  });
  let secondCookie = (response.headers.get("set-cookie") || "").split(";")[0];

  response = await request("/auth/session/rotate", {
    method: "POST",
    headers: { Cookie: secondCookie, Origin: "http://localhost:3847" },
  });
  const rotatedCookie = (response.headers.get("set-cookie") || "").split(";")[0];
  check("browser session: rotate issues a new cookie",
    response.status === 200 && rotatedCookie.startsWith(BROWSER_SESSION_COOKIE + "=") &&
    rotatedCookie !== secondCookie);

  response = await request("/", { headers: { Cookie: secondCookie } });
  check("browser session: pre-rotation cookie is dead", response.status === 401);
  response = await request("/", { headers: { Cookie: rotatedCookie } });
  check("browser session: rotated cookie works", response.status === 200);

  response = await request("/auth/logout", {
    method: "POST",
    headers: { Cookie: rotatedCookie, Origin: "http://localhost:3847" },
  });
  check("browser session: logout clears the cookie",
    response.status === 200 && (response.headers.get("set-cookie") || "").includes("Max-Age=0"));
  response = await request("/", { headers: { Cookie: rotatedCookie } });
  check("browser session: logout revokes server-side", response.status === 401);

  clock += 3_001;
  response = await request("/api/v1/read", {
    headers: { "X-Tippani-Client": "mcp", Authorization: `Bearer ${expiring.token}` },
  });
  check("bearer: expired token rejected", response.status === 401);

  response = await request("/auth/session/rotate", {
    method: "POST",
    headers: { Cookie: cookie, Origin: "http://localhost:3847" },
  });
  check("browser session: idle expiry enforced", response.status === 401);
  check("audit: rejection events contain no token fields",
    auth.getAuditEvents().every((event) => !Object.hasOwn(event, "token")));
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log(`local-client-auth: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
