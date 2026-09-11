const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { fork, execFileSync } = require("node:child_process");
const [archive, home] = process.argv.slice(2);
const { createController } = require(path.join(archive, "desktop", "controller.cjs"));
const { validateSetup, saveTarget, loadTarget } = require(path.join(archive, "desktop", "settings.cjs"));
const { createAzureAuth, RESOURCE } = require(path.join(archive, "desktop", "azure-auth.cjs"));

async function main() {
  assert(process.versions.electron, "must run using packaged runtime");
  const staged = path.join(__dirname, "..", "dist", "desktop-app");
  for (const file of fs.readdirSync(path.join(staged, "desktop"))) {
    assert(fs.readFileSync(path.join(archive, "desktop", file)).equals(fs.readFileSync(path.join(staged, "desktop", file))),
      `packaged desktop/${file} must match current staged source`);
  }
  assert(fs.readFileSync(path.join(archive, "cli.cjs")).equals(fs.readFileSync(path.join(staged, "cli.cjs"))),
    "packaged CLI must match current staged source");
  let expiry = Math.floor(Date.now() / 1000) + 100;
  const azure = createAzureAuth({ run: async args => {
    if (args[1] === "list") return JSON.stringify([{ id: "subscription", tenantId: "tenant", user: { type: "user", name: "reader@example.com" } }]);
    return JSON.stringify({ accessToken: `e30.${Buffer.from(JSON.stringify({ aud: RESOURCE, tid: "tenant", oid: "reader", unique_name: "reader@example.com", exp: expiry })).toString("base64url")}.signature` });
  } });
  await azure.list();
  await azure.select("0");
  let accepted = true, requests = 0, opened, lastPort, lastPid;
  const token = "fixture-token-not-a-real-credential";
  const api = http.createServer(async (req, res) => {
    requests++;
    let body = "";
    for await (const chunk of req) body += chunk;
    res.setHeader("Content-Type", "application/json");
    const json = value => res.end(JSON.stringify(value));
    if (!accepted || req.headers.authorization !== `Bearer ${token}`) {
      res.statusCode = 401; return json({ message: "Bad credentials" });
    }
    const url = new URL(req.url, "http://fixture");
    const repo = { name: "specs", full_name: "team/specs", owner: { login: "team" }, html_url: "https://github.com/team/specs" };
    if (url.pathname === "/user") return json({ login: "reader", name: "Reader" });
    if (url.pathname === "/repos/team/specs") return json({ ...repo, default_branch: "main", permissions: { push: true } });
    if (url.pathname === "/repos/team/specs/pulls/7") return json({
      number: 7, node_id: "PR_7", title: "Desktop real portal fixture", body: "", state: "open", draft: false,
      created_at: "2026-01-01T00:00:00Z", user: { login: "author" },
      head: { ref: "spec/change", sha: "abc", repo }, base: { ref: "main", repo },
      html_url: "https://github.com/team/specs/pull/7",
    });
    if (url.pathname === "/repos/team/specs/pulls/7/files") return json([{ filename: "spec.md", status: "modified" }]);
    if (url.pathname === "/repos/team/specs/contents/spec.md") {
      res.setHeader("Content-Type", "text/plain");
      return res.end("# Packaged desktop spec\n\nA real provider-backed review.");
    }
    if (url.pathname === "/graphql") return json({
      data: { repository: { pullRequest: { reviewThreads: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } },
    });
    res.statusCode = 404; json({ message: "Fixture endpoint not found" });
  });
  await new Promise(resolve => api.listen(0, "127.0.0.1", resolve));
  const controller = createController({
    home, timeout: 20000, envOverrides: { TIPPANI_GITHUB_API_BASE: `http://127.0.0.1:${api.address().port}` },
    openExternal: async url => { opened = url; },
  });
  const setup = validateSetup({ target: "https://github.com/team/specs/pull/7", token });
  const records = () => fs.readdirSync(path.join(home, ".tippani", "instances")).map(file => JSON.parse(fs.readFileSync(path.join(home, ".tippani", "instances", file))));
  async function verifyPortal() {
    const record = records()[0];
    lastPort = record.port; lastPid = record.pid;
    const base = `http://localhost:${record.port}`;
    assert.equal((await fetch(`${base}/api/v1/threads`, { headers: { "X-Tippani-Client": "tippani-desktop" } })).status, 401);
    const auth = await fetch(opened, { redirect: "manual" });
    assert.equal(auth.status, 303);
    const cookie = auth.headers.get("set-cookie").split(";")[0];
    assert.equal((await fetch(opened, { redirect: "manual" })).status, 401, "bootstrap is single-use");
    const page = await fetch(`${base}/file/0`, { headers: { cookie } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Packaged desktop spec/);
    assert(!opened.includes(token));
    const forbidden = await new Promise((resolve, reject) => {
      http.get(`${base}/api/v1/threads`, { headers: { cookie, Host: "evil.example" } }, response => {
        response.resume(); resolve(response.statusCode);
      }).on("error", reject);
    });
    assert.equal(forbidden, 403);
  }
  try {
    fs.mkdirSync(path.join(home, ".tippani"), { recursive: true });
    fs.writeFileSync(path.join(home, ".tippani", "preserve-notes"), "existing user data");
    saveTarget(home, setup.target);
    await controller.start(setup);
    await verifyPortal();
    assert(requests > 0);
    expiry += 3600;
    assert.equal((await azure.refresh(token => controller.updateAdoToken(token))).refreshed, true);
    console.log("packaged desktop: Azure CLI fixture acquisition and authenticated live token renewal passed");
    const first = opened;
    await controller.open();
    assert.notEqual(opened, first, "reopen mints a fresh sign-in");
    await controller.stop();
    azure.stop();
    assert.deepEqual(records(), []);
    await assert.rejects(fetch(`http://localhost:${lastPort}/`));
    assert.throws(() => process.kill(lastPid, 0));
    assert.equal(fs.readFileSync(path.join(home, ".tippani", "preserve-notes"), "utf8"), "existing user data");
    assert.equal(loadTarget(home), setup.target);
    // Force provider fetch, not the fresh PR cache, for the auth-failure test.
    fs.rmSync(path.join(home, ".tippani", "cache"), { recursive: true, force: true });
    accepted = false;
    await assert.rejects(controller.start(setup), /token|permissions/);
    assert.deepEqual(records(), []);
    accepted = true;
    await controller.start(setup);
    await verifyPortal();
    await controller.stop();
    const localRepo = path.join(home, "local repo नमस्ते");
    fs.mkdirSync(localRepo, { recursive: true });
    const git = args => execFileSync("git", ["-C", localRepo, ...args], { stdio: "pipe" });
    git(["init", "--initial-branch=main"]);
    fs.writeFileSync(path.join(localRepo, "spec.md"), "# Local desktop fixture\n\nNo remote credentials needed.");
    git(["add", "spec.md"]);
    git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "Local fixture"]);
    // Existing saved credentials must not turn a local-only session online.
    fs.writeFileSync(path.join(home, ".tippani", "pat"), "fixture-saved-pat");
    const beforeLocal = requests;
    await controller.start(validateSetup({ mode: "local", localPath: localRepo }));
    const localRecord = records()[0];
    const bootstrap = await fetch(opened, { redirect: "manual" });
    const localCookie = bootstrap.headers.get("set-cookie").split(";")[0];
    const localBase = `http://localhost:${localRecord.port}`;
    const localPage = await fetch(`${localBase}/spec?${new URLSearchParams({ local: localRepo, branch: "main", path: "spec.md" })}`, { headers: { cookie: localCookie } });
    assert.equal(localPage.status, 200);
    assert.match(await localPage.text(), /Local desktop fixture/);
    assert.equal((await fetch(`${localBase}/open/7`, { headers: { cookie: localCookie } })).status, 503);
    const validBearer = `e30.${Buffer.from(JSON.stringify({ aud: RESOURCE, tid: "tenant", oid: "reader", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.signature`;
    await assert.rejects(controller.updateAdoToken(validBearer), /renewal failed/);
    assert.equal(requests, beforeLocal, "local mode must not contact the remote provider");
    await controller.stop();
    assert.equal(fs.readFileSync(path.join(localRepo, "spec.md"), "utf8").includes("No remote"), true);
    console.log("packaged desktop: local Git content, saved-PAT isolation, blocked remote review/token updates and stop passed");
    // Parent disappearance before startup also kills the owned server.
    const orphan = fork(path.join(archive, "desktop", "server.cjs"), [], {
      execPath: process.execPath, execArgv: [], env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    const exited = new Promise(resolve => orphan.once("exit", resolve));
    orphan.disconnect();
    await exited;
    assert.throws(() => process.kill(orphan.pid, 0));
    console.log("packaged desktop: bundled runtime, private IPC credentials, real GitHub fixture, loopback auth, reopen, auth failure/retry, stop/disconnect and preserved data passed");
  } finally {
    await controller.stop();
    api.closeAllConnections();
    await new Promise(resolve => api.close(resolve));
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
