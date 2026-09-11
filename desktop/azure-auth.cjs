const fs = require("node:fs");
const path = require("node:path");
const { spawn, execFile } = require("node:child_process");
const { isExpiredJwt } = require("../src/ado-token-check.js");
const { maybeRefreshToken } = require("../src/token-refresh.js");
const RESOURCE = "499b84ac-1321-427f-aa17-267ca6975798";
const safeError = message => Object.assign(new Error(message), { safeMessage: message });

function classifyAzureError(operation, stderr = "", exitCode) {
  const stage = { list: "listing accounts", login: "Microsoft sign-in", token: "obtaining the Azure DevOps token" }[operation] || "the requested operation";
  let category, message;
  if (/only one of subscription and tenant, not both|unrecognized arguments|not allowed with argument|invalid choice/i.test(stderr)) {
    category = "cli-arguments";
    message = `Azure CLI rejected Tippani's request while ${stage}. This is an application/CLI compatibility error, not a cancelled sign-in. Update Tippani and Azure CLI, then retry.`;
  } else if (/AADSTS(?:53000|53001|53002|53003|53004|50105)\b/i.test(stderr)) {
    category = "organization-policy";
    const code = stderr.match(/AADSTS(?:53000|53001|53002|53003|53004|50105)\b/i)[0].toUpperCase();
    message = `Your organization blocked ${stage} (${code}). Follow your organization's device and access requirements, or contact IT. Tippani cannot bypass this policy.`;
  } else if (/AADSTS(?:50076|50079|50158)\b|interaction_required|multi.factor|MFA/i.test(stderr)) {
    category = "additional-authentication";
    message = `Microsoft requires additional authentication while ${stage}. Choose Sign in with Microsoft, complete the browser/account-picker prompts, then select your account and retry.`;
  } else if (/CERTIFICATE_VERIFY_FAILED|SSLError|certificate verify|connection.*(?:failed|refused)|proxy.*(?:error|failed)|timed out/i.test(stderr)) {
    category = "connection";
    message = `Azure CLI could not connect while ${stage}. Check your connection and your organization's VPN/proxy/certificate setup, then retry. Do not disable certificate verification.`;
  } else if (["ENOENT", "EACCES"].includes(exitCode) || /bad interpreter|No module named|ModuleNotFoundError|ImportError|Library not loaded|dyld:|env:.*(?:bash|python).*No such/i.test(stderr)) {
    category = "cli-installation";
    message = `Azure CLI could not run while ${stage}. Repair its installation using Microsoft's Azure CLI instructions, then quit and reopen Tippani.`;
  } else if (/user_cancel|user.*cancelled|user.*canceled|authentication.*cancel/i.test(stderr)) {
    category = "cancelled";
    message = `Microsoft sign-in was cancelled while ${stage}. Choose Sign in with Microsoft when ready, then select your account and retry.`;
  } else if (/az login|not logged in|no accounts|AADSTS(?:700082|700084|70043)\b/i.test(stderr)) {
    category = "sign-in-required";
    message = `Microsoft sign-in is required while ${stage}. Choose Sign in with Microsoft, select your account and retry.`;
  } else {
    category = "cli-failed";
    message = `Azure CLI failed while ${stage}. Check its installation and your organization's connection/sign-in requirements, then retry. If this continues, report this stage to your administrator.`;
  }
  return Object.assign(safeError(message), { category, operation });
}

function findAzureCli({ platform = process.platform, env = process.env, exists = fs.existsSync } = {}) {
  const p = platform === "win32" ? path.win32 : path.posix;
  const dirs = (env.PATH || env.Path || "").split(platform === "win32" ? ";" : ":").filter(Boolean);
  if (platform === "darwin") dirs.push("/opt/homebrew/bin", "/usr/local/bin");
  if (platform === "win32") {
    for (const base of [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA]) {
      if (base) dirs.push(p.join(base, "Microsoft SDKs", "Azure", "CLI2", "wbin"));
    }
  }
  for (const dir of dirs) {
    if (!p.isAbsolute(dir)) continue;
    for (const name of platform === "win32" ? ["az.exe", "az.cmd"] : ["az"]) {
      const file = p.join(dir, name);
      if (exists(file)) return file;
    }
  }
  throw safeError("Azure CLI was not found. Install it from Microsoft's Azure CLI instructions, then quit and reopen Tippani. Tippani will not install software for you.");
}

function commandFor(file, args, platform = process.platform, env = process.env) {
  if (platform !== "win32" || !/\.(cmd|bat)$/i.test(file)) return [file, args];
  // cmd shims need cmd.exe on Windows. No credentials enter argv, and shell
  // metacharacters are rejected, including in discovered executable paths.
  if ([file, ...args].some(value => /["%!\r\n&|<>^]/.test(value))) throw safeError("Azure CLI's path or account contains unsupported characters. Use the standard Microsoft Azure CLI installation.");
  return [env.ComSpec || "C:\\Windows\\System32\\cmd.exe", ["/d", "/s", "/c", `"${[file, ...args].map(value => `"${value}"`).join(" ")}"`]];
}

async function terminateCli(child, { platform = process.platform, execute = execFile } = {}) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (platform !== "win32") {
    child.kill("SIGKILL");
    return;
  }
  // az.cmd starts Python beneath cmd.exe. Kill only this owned PID's tree,
  // and wait for taskkill before allowing the desktop app to exit.
  await new Promise((resolve, reject) => {
    execute(path.win32.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe"),
      ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 10000 },
      error => {
        if (error && child.exitCode === null && child.signalCode === null) {
          reject(safeError("Tippani could not stop its Azure CLI sign-in process. Close that sign-in before retrying or quitting."));
        } else resolve();
      });
  });
}

function createAzureAuth({ find = findAzureCli, spawnProcess = spawn, run: injectedRun } = {}) {
  let active = null, selected = null, currentToken = null, pinned = null, failedAt = 0, generation = 0;
  let accounts = [];
  async function run(args, timeout = 20000) {
    if (injectedRun) return injectedRun(args);
    if (active?.pid && active.exitCode === null && active.signalCode === null) {
      throw safeError("An Azure CLI operation is still running. Stop it before starting another sign-in.");
    }
    const operation = args[0] === "login" ? "login" : args[1] === "list" ? "list" : "token";
    const [file, argv] = commandFor(find(), args);
    return new Promise((resolve, reject) => {
      const child = spawnProcess(file, argv, {
        windowsHide: true, windowsVerbatimArguments: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, AZURE_CORE_LOGIN_EXPERIENCE_V2: "off", AZURE_CORE_COLLECT_TELEMETRY: "no" },
      });
      active = child;
      let output = "", diagnostics = "", settled = false, terminating = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (active === child && (!child.pid || child.exitCode !== null || child.signalCode !== null)) active = null;
        diagnostics = "";
        error ? reject(error) : resolve(value);
      };
      const abort = error => {
        if (terminating || settled) return;
        terminating = true;
        clearTimeout(timer);
        terminateCli(child).then(() => finish(error), finish);
      };
      const timer = setTimeout(() => {
        abort(operation === "login"
          ? safeError("Microsoft sign-in timed out. Complete the browser/account-picker prompts and retry.")
          : classifyAzureError(operation, "connection timed out"));
      }, timeout);
      child.stdout.on("data", data => {
        output += data;
        if (output.length > 2 * 1024 * 1024) {
          abort(safeError("Azure CLI returned an unexpected response. Sign in again."));
        }
      });
      // Inspect bounded stderr only in memory; never log/return provider text.
      child.stderr.on("data", data => { if (!settled) diagnostics = (diagnostics + data.toString()).slice(-16384); });
      child.once("error", error => finish(classifyAzureError(operation, "", error.code)));
      child.once("close", code => {
        if (active === child) active = null;
        finish(code === 0 ? null : classifyAzureError(operation, diagnostics, code), output);
      });
    });
  }
  async function list() {
    let values;
    try { values = JSON.parse(await run(["account", "list", "--all", "--output", "json"])); }
    catch (error) { throw error.safeMessage ? error : safeError("Azure CLI accounts could not be read. Sign in and retry."); }
    accounts = [];
    for (const value of values) {
      if (value.user?.type !== "user" || !value.user.name || !value.tenantId || !value.id) continue;
      if (accounts.some(a => a.name === value.user.name && a.tenant === value.tenantId)) continue;
      accounts.push({ key: String(accounts.length), name: value.user.name, tenant: value.tenantId, subscription: value.id });
    }
    return accounts.map(({ key, name, tenant }) => ({ key, name, tenant }));
  }
  async function signIn() {
    await run(["login", "--allow-no-subscriptions", "--output", "none"], 180000);
    return list();
  }
  async function acquire(account, expectedIdentity) {
    let token, claims;
    try {
      // Azure CLI rejects --tenant with --subscription. The subscription selects
      // the account profile; validate the returned tenant and identity below.
      const value = JSON.parse(await run(["account", "get-access-token", "--resource", RESOURCE,
        "--subscription", account.subscription, "--output", "json"]));
      token = value.accessToken;
      claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    } catch (error) { throw error.safeMessage ? error : safeError("Azure CLI could not obtain an Azure DevOps token. Sign in again and check your organization's access policy."); }
    if (claims.aud !== RESOURCE || typeof claims.exp !== "number" || isExpiredJwt(token) ||
        claims.tid !== account.tenant || typeof claims.oid !== "string" || !claims.oid) {
      throw safeError("Azure CLI returned an invalid or expired Azure DevOps identity. Sign in again.");
    }
    const identity = `${claims.tid}:${claims.oid}`;
    if (expectedIdentity && expectedIdentity !== identity) throw safeError("Azure CLI's account changed. Renewal was stopped to protect your identity. Save your edits, stop the review, and select the intended account.");
    const names = [claims.upn, claims.unique_name, claims.preferred_username, claims.email];
    if (!expectedIdentity && !names.some(name => typeof name === "string" && name.toLowerCase() === account.name.toLowerCase())) {
      throw safeError("Azure CLI's token does not match the selected account. Sign in with the intended account and retry.");
    }
    return { token, identity };
  }
  async function select(key) {
    const account = accounts.find(value => value.key === key);
    if (!account) throw safeError("Check Azure CLI accounts, then select the Microsoft account to use.");
    const value = await acquire(account);
    selected = account; currentToken = value.token; pinned = value.identity; failedAt = 0;
    return currentToken;
  }
  async function refresh(apply) {
    const epoch = generation;
    try {
      const result = await maybeRefreshToken({
        selfAcquired: true, currentToken, isExpiring: isExpiredJwt, lastFailedAt: failedAt,
        failureCooldownMs: 60000,
        acquire: async () => (await acquire(selected, pinned)).token,
        apply: async token => { if (epoch !== generation) throw new Error("Review stopped."); await apply(token); },
      });
      if (epoch !== generation) return { refreshed: false, reason: "stopped" };
      if (result.refreshed) { currentToken = result.token; failedAt = 0; }
      else if (result.failedAt) { failedAt = result.failedAt; throw safeError("Azure DevOps sign-in could not renew. Save your edits, stop the review, then sign in again."); }
      return result;
    } catch (error) { if (epoch === generation) failedAt = Date.now(); throw error; }
  }
  async function stop() {
    generation++;
    const child = active;
    selected = null; currentToken = null; pinned = null; failedAt = 0;
    await terminateCli(child);
  }
  return { list, signIn, select, refresh, stop };
}
module.exports = { createAzureAuth, findAzureCli, commandFor, classifyAzureError, terminateCli, RESOURCE };
