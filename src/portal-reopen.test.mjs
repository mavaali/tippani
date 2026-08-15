import {
  BOOTSTRAP_PATH,
  PortalReopenError,
  parseReopenArgs,
  reopenPortal,
  requestBootstrapUrl,
  runReopenCommand,
  selectInstance,
} from "./portal-reopen.js";

let pass = 0, fail = 0;
function check(name, condition) {
  if (condition) pass++;
  else { fail++; console.error("  FAIL: " + name); }
}

const NOW = 1_000_000;

function instance(overrides = {}) {
  return {
    port: 3847,
    prId: 42,
    provider: "ado",
    token: "bearer-abc",
    tokenExpiresAt: NOW + 60_000,
    clientName: "tippani-external",
    url: "http://localhost:3847",
    ...overrides,
  };
}

function codeOf(fn) {
  try { fn(); return null; }
  catch (e) { return e instanceof PortalReopenError ? e.code : "wrong_error_type"; }
}

async function asyncCodeOf(fn) {
  try { await fn(); return null; }
  catch (e) { return e instanceof PortalReopenError ? e.code : "wrong_error_type"; }
}

// ---- selectInstance ---------------------------------------------------------
{
  const only = instance();
  check("a single running portal is adopted", selectInstance([only]) === only);
}

{
  check("no running portal is reported as such",
    codeOf(() => selectInstance([])) === "no_portal");
  check("an entry without a token is not adoptable",
    codeOf(() => selectInstance([instance({ token: null })])) === "no_portal");
}

{
  // Steering a reconnect at an arbitrary portal would open the wrong review.
  const many = [instance({ port: 3847 }), instance({ port: 3848 })];
  let error = null;
  try { selectInstance(many); } catch (e) { error = e; }
  check("several portals require an explicit port", error?.code === "ambiguous_portal");
  check("the ambiguity names the ports to choose from",
    error?.ports.join(",") === "3847,3848" && error.message.includes("--port="));
}

{
  const many = [instance({ port: 3847 }), instance({ port: 3848 })];
  check("--port picks one of several portals",
    selectInstance(many, { port: 3848 }).port === 3848);
  check("--port on an unregistered port fails",
    codeOf(() => selectInstance(many, { port: 4000 })) === "no_portal_on_port");
}

// ---- requestBootstrapUrl ----------------------------------------------------
function fetchStub({ status = 200, body = { ok: true, url: "http://localhost:3847/auth/bootstrap?token=fresh", expiresAt: NOW + 120_000 }, throws = false } = {}) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    if (throws) throw new Error("ECONNREFUSED");
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  };
  return { impl, calls };
}

{
  const { impl, calls } = fetchStub();
  const result = await requestBootstrapUrl({
    instance: instance(),
    returnTo: "/feedback",
    fetchImpl: impl,
    now: () => NOW,
  });
  check("a fresh sign-in link is returned", result.url.endsWith("token=fresh"));
  check("the adopted port is reported", result.port === 3847);
  check("the bootstrap endpoint is called", calls[0].url === "http://localhost:3847" + BOOTSTRAP_PATH);
  check("the registered app session authenticates the request",
    calls[0].options.headers.Authorization === "Bearer bearer-abc");
  check("the request carries the registered client name",
    calls[0].options.headers["X-Tippani-Client"] === "tippani-external");
  check("the requested page is forwarded",
    JSON.parse(calls[0].options.body).returnTo === "/feedback");
}

{
  // Restarting is the only cure here, so say so instead of failing obscurely.
  const { impl, calls } = fetchStub();
  const code = await asyncCodeOf(() => requestBootstrapUrl({
    instance: instance({ tokenExpiresAt: NOW - 1 }),
    fetchImpl: impl,
    now: () => NOW,
  }));
  check("an expired registered session is refused before any call",
    code === "stale_session" && calls.length === 0);
}

{
  const { impl } = fetchStub({ status: 401, body: { error: "invalid" } });
  check("a rejected bearer reports a stale session",
    await asyncCodeOf(() => requestBootstrapUrl({
      instance: instance(), fetchImpl: impl, now: () => NOW,
    })) === "stale_session");
}

{
  const { impl } = fetchStub({ throws: true });
  check("an unreachable portal is distinguished from a refusal",
    await asyncCodeOf(() => requestBootstrapUrl({
      instance: instance(), fetchImpl: impl, now: () => NOW,
    })) === "portal_unreachable");
}

{
  const { impl } = fetchStub({ status: 200, body: { ok: true } });
  check("a response without a url is refused",
    await asyncCodeOf(() => requestBootstrapUrl({
      instance: instance(), fetchImpl: impl, now: () => NOW,
    })) === "bootstrap_refused");
}

{
  const { impl, calls } = fetchStub();
  const result = await requestBootstrapUrl({
    instance: instance({ url: null, port: 3900 }),
    fetchImpl: impl,
    now: () => NOW,
  });
  check("a registry entry without a url falls back to its port",
    calls[0].url === "http://localhost:3900" + BOOTSTRAP_PATH && result.port === 3900);
}

// ---- reopenPortal -----------------------------------------------------------
{
  // The whole point: the server keeps running and its live state survives.
  const { impl, calls } = fetchStub();
  const result = await reopenPortal({
    listInstancesFn: () => [instance()],
    fetchImpl: impl,
    now: () => NOW,
  });
  check("reopen adopts the running portal without restarting it",
    result.url.endsWith("token=fresh") && calls.length === 1);
}

{
  check("reopen with nothing running reports no portal",
    await asyncCodeOf(() => reopenPortal({
      listInstancesFn: () => [], fetchImpl: fetchStub().impl, now: () => NOW,
    })) === "no_portal");
}

// ---- parseReopenArgs --------------------------------------------------------
{
  const parsed = parseReopenArgs(["open", "--port=3900", "--headless", "--path=/feedback"]);
  check("port is parsed", parsed.port === 3900);
  check("headless is parsed", parsed.headless === true);
  check("path is parsed", parsed.returnTo === "/feedback");
}

{
  const parsed = parseReopenArgs(["reopen"]);
  check("no port means adopt the only portal", parsed.port === null);
  check("a browser is opened by default", parsed.headless === false);
  check("the default page is the portal root", parsed.returnTo === "/");
}

{
  check("a non-numeric port is ignored", parseReopenArgs(["--port=abc"]).port === null);
  check("a relative path is normalized", parseReopenArgs(["--path=feedback"]).returnTo === "/feedback");
}

// ---- runReopenCommand -------------------------------------------------------
function commandHarness({ instances = [instance()], fetch = fetchStub(), openThrows = false } = {}) {
  const out = { log: [], error: [], opened: [] };
  return {
    out,
    run: (args) => runReopenCommand({
      args,
      listInstancesFn: () => instances,
      fetchImpl: fetch.impl,
      openFn: async (url) => {
        if (openThrows) throw new Error("no browser");
        out.opened.push(url);
      },
      log: (m) => out.log.push(m),
      logError: (m) => out.error.push(m),
      now: () => NOW,
    }),
  };
}

{
  const { out, run } = commandHarness();
  const code = await run(["open"]);
  check("a successful reopen exits zero", code === 0);
  check("the link is printed for the user",
    out.log.some((line) => line.includes("token=fresh")));
  check("the link is opened in a browser by default",
    out.opened.length === 1 && out.opened[0].endsWith("token=fresh"));
  check("the user is told the link is single use",
    out.log.some((line) => line.includes("works once")));
}

{
  const { out, run } = commandHarness();
  const code = await run(["open", "--headless"]);
  check("--headless still succeeds", code === 0);
  check("--headless prints the link without opening a browser",
    out.opened.length === 0 && out.log.some((line) => line.includes("token=fresh")));
}

{
  const { out, run } = commandHarness({ instances: [] });
  const code = await run(["open"]);
  check("reopen without a running portal exits non-zero", code === 1);
  check("the failure explains how to start one",
    out.error.length === 1 && out.error[0].includes("No Tippani portal is running"));
  check("no link is printed on failure", out.log.length === 0);
}

{
  // A missing browser must not turn a valid link into a failed command.
  const { out, run } = commandHarness({ openThrows: true });
  const code = await run(["open"]);
  check("a failed browser launch still exits zero", code === 0);
  check("a failed browser launch falls back to the printed link",
    out.log.some((line) => line.includes("Could not open a browser")));
}

console.log(`portal-reopen: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
