import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const { validateSetup, saveTarget, loadTarget, loadSetup } = require("../desktop/settings.cjs");
const { createAzureAuth, findAzureCli, commandFor, classifyAzureError, terminateCli, RESOURCE } = require("../desktop/azure-auth.cjs");
const root = path.resolve(import.meta.dirname, "..");
const home = path.join(root, ".desktop-validation", `unit-${process.pid} space-नमस्ते`);
fs.mkdirSync(home, { recursive: true });
try {
  const ownedChild = { pid: 12345, exitCode: null, signalCode: null };
  let finishKill;
  let killFinished = false;
  const killing = terminateCli(ownedChild, { platform: "win32", execute: (file, args, options, done) => {
    assert.match(file, /\\System32\\taskkill.exe$/);
    assert.deepEqual(args, ["/PID", "12345", "/T", "/F"]);
    assert.equal(options.windowsHide, true);
    finishKill = done;
  } }).then(() => { killFinished = true; });
  await Promise.resolve();
  assert.equal(killFinished, false, "wait for process-tree termination");
  finishKill(null);
  await killing;
  await assert.rejects(terminateCli(ownedChild, { platform: "win32", execute: (_file, _args, _opts, done) => done(new Error("failed")) }), /could not stop/);
  await terminateCli({ ...ownedChild, exitCode: 0 }, { platform: "win32", execute: () => assert.fail("must not kill exited PID") });
  const localRepo = path.join(home, "local repo");
  fs.mkdirSync(path.join(localRepo, ".git"), { recursive: true });
  fs.writeFileSync(path.join(localRepo, ".git", "HEAD"), "ref: refs/heads/main\n");
  const local = validateSetup({ mode: "local", localPath: localRepo });
  assert.equal(local.provider, "local");
  assert.deepEqual(local.credentials, {});
  assert(local.args.includes("--local-only"));
  assert(local.args.includes("--offline"));
  assert.throws(() => validateSetup({ mode: "local", localPath: home }), /Git repository/);
  assert.throws(() => validateSetup({ mode: "local", localPath: "." }), /Choose a local/);
  saveTarget(home, "", local.localPath);
  assert.deepEqual(loadSetup(home), { mode: "local", target: "", localPath: local.localPath });
  fs.unlinkSync(path.join(home, ".tippani", "desktop.json"));
  const token = "test-secret-do-not-persist";
  const github = validateSetup({ target: "https://github.com/team/spec/pull/123", token });
  assert.deepEqual(github.args, ["github:team/spec#123"]);
  assert.deepEqual(github.credentials, { TIPPANI_GH_TOKEN: token });
  const ado = validateSetup({ target: "https://dev.azure.com/org/Project%20Name/_git/Repo%20Name/pullrequest/42", account: "0" });
  assert.deepEqual(ado.args, ["42", "--org=https://dev.azure.com/org", "--project=Project Name", "--repo=Repo Name"]);
  assert.deepEqual(ado.credentials, {});
  assert.equal(ado.provider, "ado");
  assert.equal(ado.account, "0");
  assert.equal(findAzureCli({ platform: "darwin", env: { PATH: "/usr/bin" }, exists: file => file === "/opt/homebrew/bin/az" }), "/opt/homebrew/bin/az");
  assert.equal(findAzureCli({ platform: "win32", env: { ProgramFiles: "C:\\Program Files" }, exists: file => file.endsWith("\\wbin\\az.cmd") }), "C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd");
  assert.throws(() => findAzureCli({ env: {}, exists: () => false }), /Install it/);
  const command = commandFor("C:\\Program Files\\Azure\\az.cmd", ["account", "list"], "win32", {});
  assert.equal(command[0], "C:\\Windows\\System32\\cmd.exe");
  assert.match(command[1][3], /""C:\\Program Files\\Azure\\az.cmd"/);
  assert.throws(() => commandFor("C:\\bad&path\\az.cmd", [], "win32", {}), /unsupported/);
  const cliFixture = path.join(root, "scripts", "fixtures", "azure-cli", "cli.cjs");
  const conflicting = spawnSync(process.execPath, [cliFixture, "account", "get-access-token", "--tenant", "tenant", "--subscription", "subscription"], { encoding: "utf8" });
  assert.equal(conflicting.status, 1);
  assert.equal(conflicting.stderr.trim(), "ERROR: Please specify only one of subscription and tenant, not both");
  let cliFailure = "";
  const commandAuth = createAzureAuth({ find: () => process.execPath,
    spawnProcess: (file, args, options) => spawn(file, [cliFixture, ...args], {
      ...options, windowsVerbatimArguments: false, env: { ...options.env, TIPPANI_TEST_AZ_ERROR: cliFailure },
    }),
  });
  await commandAuth.list();
  assert.match(await commandAuth.select("0"), /\.fixture$/, "real subprocess rejects conflicting CLI flags, so desktop must not send both");
  cliFailure = conflicting.stderr + "\nfixture-secret-never-display";
  await assert.rejects(commandAuth.list(), error => error.category === "cli-arguments" &&
    error.operation === "list" && /listing accounts/.test(error.message) && !JSON.stringify(error).includes("fixture-secret"));
  cliFailure = "AADSTS53003: blocked by conditional access fixture-secret-never-display";
  await assert.rejects(commandAuth.signIn(), error => error.category === "organization-policy" &&
    error.operation === "login" && !error.message.includes("fixture-secret"));
  commandAuth.stop();
  for (const [stderr, category] of [
    ["AADSTS50076: MFA required", "additional-authentication"],
    ["Please run 'az login' to setup account.", "sign-in-required"],
    ["CERTIFICATE_VERIFY_FAILED", "connection"],
    ["ModuleNotFoundError: azure.cli", "cli-installation"],
    ["User cancelled authentication", "cancelled"],
    ["unclassified failure fixture-secret-never-display", "cli-failed"],
  ]) {
    const error = classifyAzureError("token", stderr, 1);
    assert.equal(error.category, category);
    assert.match(error.message, /obtaining the Azure DevOps token/);
    assert(!error.message.includes("fixture-secret"));
  }
  if (process.platform === "win32") {
    const shim = path.join(home, "azure cli.cmd");
    fs.copyFileSync(path.join(root, "scripts", "fixtures", "azure cli.cmd"), shim);
    const windowsAuth = createAzureAuth({ find: () => shim });
    assert.equal((await windowsAuth.list())[0].name, "fixture@example.com", "Windows .cmd runs from spaces/Unicode path");
  }
  let principal = "person-a", exp = Math.floor(Date.now() / 1000) + 100, calls = [], rejectAcquire = false;
  const jwt = () => `e30.${Buffer.from(JSON.stringify({ aud: RESOURCE, tid: "tenant", oid: principal, upn: "reader@example.com", exp })).toString("base64url")}.signature`;
  const auth = createAzureAuth({ run: async args => {
    calls.push(args);
    if (args[0] === "login") return "";
    if (args[1] === "list") return JSON.stringify([{ id: "subscription", tenantId: "tenant", user: { type: "user", name: "reader@example.com" } }]);
    if (rejectAcquire) throw new Error("raw-secret-error");
    return JSON.stringify({ accessToken: jwt() });
  } });
  assert.equal((await auth.list())[0].name, "reader@example.com");
  await assert.rejects(auth.select("not-selected"), /select/);
  await auth.select("0");
  let applied;
  principal = "person-b";
  await assert.rejects(auth.refresh(async token => { applied = token; }), /account changed/);
  assert.equal(applied, undefined);
  principal = "person-a";
  await auth.select("0");
  exp += 3600;
  assert.equal((await auth.refresh(async token => { applied = token; })).refreshed, true);
  assert.equal(applied, jwt());
  assert.equal((await auth.refresh(() => assert.fail("unneeded refresh"))).reason, "still-valid");
  assert(calls.some(args => args.includes("--subscription") && args.includes("subscription") && args.includes(RESOURCE)));
  assert(!calls.some(args => args.includes("--tenant")), "subscription identifies selected account; tenant remains validated from claims");
  assert(!calls.some(args => args.some(value => value.includes(".signature"))));
  await auth.signIn();
  assert(calls.some(args => args[0] === "login" && args.includes("--allow-no-subscriptions")));
  exp = Math.floor(Date.now() / 1000) + 100;
  await auth.select("0");
  rejectAcquire = true;
  await assert.rejects(auth.refresh(() => assert.fail("failed renewal must not apply")), /could not obtain/);
  assert.equal((await auth.refresh(() => assert.fail("cooldown must not apply"))).reason, "cooldown");
  const now = Date.now;
  try {
    const later = now() + 60001;
    Date.now = () => later;
    await assert.rejects(auth.refresh(() => assert.fail("failed retry must not apply")), /could not obtain/);
  } finally { Date.now = now; }
  await assert.rejects(auth.select("0"), error => error.safeMessage && !error.message.includes("raw-secret"));
  auth.stop();
  assert.equal((await auth.refresh(() => assert.fail("stopped auth"))).reason, "not-self-acquired");
  for (const target of [
    "http://github.com/team/spec/pull/123", "https://evil.example/team/spec/pull/123",
    "https://github.com@evil.example/team/spec/pull/123", "https://user:secret@github.com/team/spec/pull/123",
    "https://github.com/team/spec/pull/123?token=secret", "https://github.com/team/spec/pull/123#secret",
    "file:///etc/passwd", "https://github.com/team/spec/pull/0",
    "https://dev.azure.com/org/Bad%2FProject/_git/repo/pullrequest/1",
    "https://dev.azure.com/org/project/_git/%ZZ/pullrequest/1",
  ]) assert.throws(() => validateSetup({ target, token }));
  for (const token of ["", " ", "a\nb", "\0", 42]) assert.throws(() => validateSetup({ target: github.target, token }));
  assert.equal(loadTarget(home), "");
  fs.writeFileSync(path.join(home, ".preserve"), "existing notes");
  saveTarget(home, github.target);
  const saved = fs.readFileSync(path.join(home, ".tippani", "desktop.json"), "utf8");
  assert.equal(saved.includes(token), false);
  assert.equal(JSON.stringify(github.args).includes(token), false);
  assert.equal(loadTarget(home), github.target);
  assert.equal(fs.readFileSync(path.join(home, ".preserve"), "utf8"), "existing notes");
  fs.writeFileSync(path.join(home, ".tippani", "desktop.json"), "{broken");
  assert.throws(() => loadTarget(home), /could not be read/);

  const html = fs.readFileSync(path.join(root, "desktop", "index.html"), "utf8");
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /type="password"/);
  const dom = new JSDOM(html, { runScripts: "outside-only" });
  let sent, onStatus;
  dom.window.tippani = {
    load: async () => ({ ok: true, target: github.target, version: "1.8.2" }),
    start: async input => { sent = input; return { ok: false, error: "Check token and retry." }; },
    open: async () => ({ ok: true }), stop: async () => ({ ok: true }), quit: async () => ({}),
    onStatus: fn => { onStatus = fn; },
    onAuthStatus: () => {},
    pickLocal: async () => ({ ok: true, localPath: localRepo }),
    accounts: async () => ({ ok: true, accounts: [{ key: "0", name: "Reader", tenant: "Tenant" }] }),
    signIn: async () => ({ ok: false, error: "Install Azure CLI." }), cliHelp: async () => ({}),
  };
  dom.window.eval(fs.readFileSync(path.join(root, "desktop", "renderer.js"), "utf8"));
  await new Promise(resolve => setImmediate(resolve));
  dom.window.document.getElementById("token").value = token;
  dom.window.document.getElementById("setup").dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.token, token);
  assert.equal(dom.window.document.getElementById("token").value, "");
  assert.equal(dom.window.document.getElementById("status").textContent, "Check token and retry.");
  assert.equal(dom.window.document.getElementById("session").dataset.state, "error");
  assert.equal(dom.window.document.getElementById("state-label").textContent, "Needs attention");
  assert.equal(dom.window.document.getElementById("start").disabled, false);
  dom.window.document.getElementById("target").value = ado.target;
  dom.window.document.getElementById("target").dispatchEvent(new dom.window.Event("input"));
  assert.equal(dom.window.document.getElementById("token").required, false);
  assert.equal(dom.window.document.getElementById("github").hidden, true);
  dom.window.document.getElementById("accounts").click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dom.window.document.getElementById("account").options.length, 2);
  assert.equal(dom.window.document.getElementById("account").value, "", "no silent account selection");
  assert.equal(dom.window.document.activeElement.id, "account");
  dom.window.document.getElementById("sign-in").click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dom.window.document.getElementById("status").textContent, "Install Azure CLI.");
  onStatus("<script>not HTML</script>");
  assert.equal(dom.window.document.querySelector("#status script"), null);
  dom.window.tippani.start = async () => ({ ok: true });
  dom.window.document.getElementById("setup").dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dom.window.document.getElementById("session").dataset.state, "running");
  assert.equal(dom.window.document.getElementById("start").hidden, true);
  assert.equal(dom.window.document.getElementById("session-actions").hidden, false);
  assert.equal(dom.window.document.activeElement.id, "open");
  dom.window.document.getElementById("stop").click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dom.window.document.getElementById("session-actions").hidden, true);
  assert.equal(dom.window.document.getElementById("start").hidden, false);
  assert.equal(dom.window.document.activeElement.id, "start");
  dom.window.document.getElementById("mode-local").checked = true;
  dom.window.document.getElementById("mode-local").dispatchEvent(new dom.window.Event("change"));
  assert.equal(dom.window.document.getElementById("connection").hidden, true);
  assert.equal(dom.window.document.getElementById("target").required, false);
  assert.equal(dom.window.document.getElementById("token").required, false);
  dom.window.document.getElementById("pick-local").click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dom.window.document.getElementById("local-path").value, localRepo);
  dom.window.tippani.pickLocal = async () => ({ ok: true, cancelled: true });
  dom.window.document.getElementById("pick-local").click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dom.window.document.getElementById("local-path").value, localRepo, "cancel keeps selection");
  dom.window.tippani.start = async input => { sent = input; return { ok: true }; };
  dom.window.document.getElementById("setup").dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.mode, "local");
  assert.equal(sent.localPath, localRepo);
  assert.match(dom.window.document.getElementById("status").textContent, /Local-only/);
  dom.window.close();
  const main = fs.readFileSync(path.join(root, "desktop", "main.cjs"), "utf8");
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /contextIsolation: true, sandbox: true/);
  assert.match(main, /event.senderFrame === window.webContents.mainFrame/);
  assert.match(main, /event.senderFrame.url === page/);
  const config = require("../electron-builder.cjs");
  assert.equal(config.mac.identity, null);
  assert.equal(config.nsis.deleteAppDataOnUninstall, false);
  assert.equal(config.nsis.perMachine, false);
  assert.equal(config.nsis.createStartMenuShortcut, true);
  process.env.TIPPANI_RELEASE = "1";
  delete require.cache[require.resolve("../electron-builder.cjs")];
  const release = require("../electron-builder.cjs");
  assert.equal(release.forceCodeSigning, true);
  assert.equal(release.mac.notarize, true);
  assert.equal(release.mac.identity, undefined);
  const oldLink = process.env.CSC_LINK;
  delete process.env.CSC_LINK;
  await assert.rejects(release.beforePack({ electronPlatformName: "darwin" }), /CSC_LINK/);
  await assert.rejects(release.beforePack({ electronPlatformName: "win32" }), /CSC_LINK/);
  if (oldLink) process.env.CSC_LINK = oldLink;
  delete process.env.TIPPANI_RELEASE;
  console.log("desktop: URL/token validation, data preservation, renderer retry, isolation and fail-closed signing tests passed");
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}
