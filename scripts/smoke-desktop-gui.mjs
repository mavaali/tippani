import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function smokeGui(runtime, home) {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  const cliDir = path.join(home, "azure-cli-fixture");
  fs.mkdirSync(cliDir, { recursive: true });
  const cli = path.join(cliDir, process.platform === "win32" ? "az.cmd" : "az");
  fs.copyFileSync(path.join(import.meta.dirname, "fixtures", process.platform === "win32" ? "azure cli.cmd" : "azure-cli/az"), cli);
  if (process.platform !== "win32") fs.chmodSync(cli, 0o755);
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === "path") || "PATH";
  env[pathKey] = `${cliDir}${path.delimiter}${env[pathKey] || ""}`;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  const child = spawn(runtime, [`--user-data-dir=${path.join(home, "window-profile")}`, `--remote-debugging-port=${port}`], {
    env, cwd: home, stdio: ["ignore", "ignore", "pipe"], windowsHide: false,
  });
  const interrupted = () => { child.kill("SIGKILL"); process.exit(143); };
  process.once("SIGTERM", interrupted);
  process.once("SIGINT", interrupted);
  let diagnostics = "";
  child.stderr.on("data", chunk => { diagnostics = (diagnostics + chunk.toString()).slice(-16384); });
  let spawnError;
  const ended = new Promise(resolve => {
    child.once("error", error => { spawnError = error; resolve(); });
    child.once("exit", resolve);
  });
  let socket;
  try {
    let target;
    for (let n = 0; n < 100; n++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error("Desktop GUI exited before displaying setup.");
      try {
        const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) })).json();
        target = pages.find(page => page.type === "page" && page.url.endsWith("/desktop/index.html"));
        if (target) break;
      } catch {}
      await sleep(100);
    }
    assert(target, "packaged graphical setup window should load");
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Desktop debugger connection timed out.")), 10000);
      socket.onopen = () => { clearTimeout(timer); resolve(); };
      socket.onerror = () => { clearTimeout(timer); reject(new Error("Desktop debugger connection failed.")); };
    });
    let id = 0;
    async function command(method, params = {}) {
      const key = ++id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.removeEventListener("message", listen); reject(new Error("Desktop GUI test timed out.")); }, 10000);
        const listen = event => {
          const data = JSON.parse(event.data);
          if (data.id !== key) return;
          socket.removeEventListener("message", listen);
          clearTimeout(timer);
          if (data.error || data.result?.exceptionDetails) reject(new Error(`Desktop renderer evaluation failed: ${JSON.stringify(data.error || data.result.exceptionDetails)}`));
          else resolve(data.result);
        };
        socket.addEventListener("message", listen);
        socket.send(JSON.stringify({ id: key, method, params }));
      });
    }
    async function evaluate(expression) {
      return (await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;
    }
    for (let n = 0; n < 100; n++) {
      if (await evaluate("document.readyState === 'complete' && !!document.getElementById('token') && typeof window.tippani?.start === 'function'")) break;
      await sleep(100);
    }
    const setup = await evaluate(`(async () => {
      document.getElementById('target').value = 'https://dev.azure.com/org/project/_git/repo/pullrequest/1';
      document.getElementById('target').dispatchEvent(new Event('input'));
      return ({
      title: document.title,
      node: typeof require,
      bridge: typeof window.tippani?.start,
      password: document.getElementById('token')?.type,
      accounts: typeof window.tippani?.accounts,
      signIn: typeof window.tippani?.signIn,
      adoRequiresToken: document.getElementById('token')?.required,
      loaded: await window.tippani?.load(),
      cliAccounts: await window.tippani?.accounts(),
      cliSignIn: await window.tippani?.signIn(),
      invalid: await window.tippani?.start({ target: 'https://evil.example/', token: 'fixture' })
    }); })()`);
    assert.equal(setup.title, "Tippani");
    assert.equal(setup.node, "undefined");
    assert.equal(setup.bridge, "function");
    assert.equal(setup.password, "password");
    assert.equal(setup.accounts, "function");
    assert.equal(setup.signIn, "function");
    assert.equal(setup.adoRequiresToken, false);
    assert.equal(setup.cliAccounts.ok, true);
    assert.equal(setup.cliAccounts.accounts[0].name, "fixture@example.com");
    assert.equal(setup.cliSignIn.ok, true);
    assert.equal(setup.loaded.ok, true);
    assert.equal(setup.invalid.ok, false);
    assert(!JSON.stringify(setup.loaded).includes("token"));
    const local = await evaluate(`(() => {
      document.getElementById('mode-local').click();
      return {
        picker: typeof window.tippani.pickLocal,
        accountHidden: document.getElementById('connection').hidden,
        targetRequired: document.getElementById('target').required,
        tokenRequired: document.getElementById('token').required
      };
    })()`);
    assert.equal(local.picker, "function");
    assert.equal(local.accountHidden, true);
    assert.equal(local.targetRequired, false);
    assert.equal(local.tokenRequired, false);
    if (process.env.TIPPANI_SCREENSHOT_DIR) {
      await evaluate(`document.getElementById('target').value = ''; document.getElementById('target').dispatchEvent(new Event('input'));`);
      const directory = path.resolve(process.env.TIPPANI_SCREENSHOT_DIR);
      fs.mkdirSync(directory, { recursive: true });
      const { data } = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
      fs.writeFileSync(path.join(directory, `tippani-local-${process.arch}.png`), Buffer.from(data, "base64"));
    }
    socket.send(JSON.stringify({ id: ++id, method: "Runtime.evaluate", params: { expression: "window.tippani.quit()" } }));
    await Promise.race([ended, sleep(10000).then(() => { throw new Error("GUI did not quit cleanly."); })]);
    assert.equal(child.exitCode, 0);
    console.log("packaged desktop GUI: actual window, sandboxed preload, validated IPC, token-free saved setup and Quit passed");
  } catch (error) {
    throw new Error(`${error.message}\nDesktop startup diagnostics:\n${diagnostics || "(no stderr output)"}`, { cause: error });
  } finally {
    process.off("SIGTERM", interrupted);
    process.off("SIGINT", interrupted);
    socket?.close();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await Promise.race([ended, sleep(3000)]);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await Promise.race([ended, sleep(3000)]);
    }
  }
}
