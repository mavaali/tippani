const { fork } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");

async function freePort() {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function createController({ runtime = process.execPath, home, openExternal, onExit = () => {}, timeout = 90000, envOverrides = {} } = {}) {
  let child = null, session = null;
  let busy = false;
  function clearRegistry(port, pid) {
    if (!port) return;
    // Windows terminates children without Node exit handlers. Only remove
    // files belonging to OUR pid, never a CLI or another launcher instance.
    const dir = path.join(home, ".tippani");
    const entry = path.join(dir, "instances", `${port}.json`);
    try {
      if (JSON.parse(fs.readFileSync(entry, "utf8")).pid !== pid) return;
      fs.rmSync(entry);
      fs.rmSync(path.join(dir, `session-token-${port}`), { force: true });
    } catch (error) {
      if (error.code !== "ENOENT") onExit("Tippani stopped, but its session record could not be removed. Restart Tippani to retry.");
    }
  }
  async function stop() {
    const owned = child;
    const previous = session;
    child = null;
    session = null;
    if (!owned?.pid) return;
    if (owned.exitCode === null && owned.signalCode === null) {
      await new Promise(resolve => {
        const timer = setTimeout(() => owned.kill("SIGKILL"), 3000);
        owned.once("exit", () => { clearTimeout(timer); resolve(); });
        if (owned.connected) owned.disconnect();
        else owned.kill();
      });
    }
    clearRegistry(previous?.port, owned.pid);
  }
  async function open() {
    if (!session || !child) throw new Error("Start a review first.");
    // Re-read our own registry for rotated sessions; do not expose credentials
    // or bootstrap links to the launcher renderer.
    const record = JSON.parse(fs.readFileSync(path.join(home, ".tippani", "instances", `${session.port}.json`), "utf8"));
    if (record.pid !== child.pid) throw new Error("The review session changed. Start it again.");
    const base = `http://localhost:${session.port}`;
    const response = await fetch(`${base}/api/v1/auth/browser-bootstrap`, {
      method: "POST",
      headers: { Authorization: `Bearer ${record.token}`, "X-Tippani-Client": "tippani-desktop", "Content-Type": "application/json" },
      body: JSON.stringify({ returnTo: "/" }),
      signal: AbortSignal.timeout(10000),
    });
    const value = await response.json();
    const url = new URL(value.url);
    if (!response.ok || url.origin !== base || url.pathname !== "/auth/bootstrap" ||
        url.username || url.password || !url.searchParams.get("token")) {
      throw new Error("Browser sign-in failed. Start the review again.");
    }
    await openExternal(url.href);
  }
  async function updateAdoToken(token) {
    if (!session || !child) throw new Error("The review stopped.");
    const record = JSON.parse(fs.readFileSync(path.join(home, ".tippani", "instances", `${session.port}.json`), "utf8"));
    if (record.pid !== child.pid) throw new Error("The review session changed.");
    const response = await fetch(`http://localhost:${session.port}/api/v1/ado-token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${record.token}`, "X-Tippani-Client": "tippani-desktop", "Content-Type": "application/json" },
      body: JSON.stringify({ token }), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Azure DevOps token renewal failed.");
  }
  async function start(setup) {
    if (busy) throw new Error("A review is already starting. Please wait.");
    busy = true;
    try {
      await stop();
      const port = await freePort();
      const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1", HOME: home, USERPROFILE: home,
        TIPPANI_DESKTOP: "1", TIPPANI_HEADLESS: "1", TIPPANI_CLIENT_NAME: "tippani-desktop" };
      for (const key of ["TIPPANI_ADO_TOKEN", "TIPPANI_ADO_PAT", "TIPPANI_GH_TOKEN", "GITHUB_TOKEN", "TIPPANI_GITHUB_REPO", "TIPPANI_GH_REPO", "TIPPANI_LOCAL_REPO", "TIPPANI_SHIM_PID", "TIPPANI_GITHUB_API_BASE", "NODE_OPTIONS", "NODE_EXTRA_CA_CERTS"]) delete env[key];
      Object.assign(env, envOverrides);
      const owned = fork(path.join(__dirname, "server.cjs"), [], {
        execPath: runtime, env, cwd: home, execArgv: [], windowsHide: true,
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      });
      child = owned;
      // Provider error bodies may contain secrets. Never display, retain, or
      // log raw server output in the desktop host.
      const failure = "Could not open this review. Check your internet connection, review URL, token expiry and repository permissions, then retry.";
      owned.stderr.on("data", () => {});
      owned.on("exit", () => {
        clearRegistry(port, owned.pid);
        if (child === owned) {
          child = null; session = null;
          onExit(setup.provider === "local" ? "The local review server stopped. Check folder access and reopen the repository; no sign-in is needed." : "The local review server stopped. Check sign-in and choose Start review to retry.");
        }
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => done(new Error("Starting the review timed out. Check your connection and token, then retry.")), timeout);
        function done(error) {
          clearTimeout(timer);
          owned.off("error", failed);
          owned.off("exit", exited);
          owned.off("message", ready);
          error ? reject(error) : resolve();
        }
        const failed = () => done(new Error("The bundled review server could not start. Reinstall Tippani and retry."));
        const exited = () => done(new Error(failure));
        const ready = message => {
          if (message?.type === "desktop-ready" && message.port === port) {
            session = { port };
            done();
          }
        };
        owned.once("error", failed);
        owned.once("exit", exited);
        owned.on("message", ready);
        owned.send({ args: [...setup.args, "--headless", `--port=${port}`], credentials: setup.credentials }, error => { if (error) failed(); });
      });
      await open();
      return { ok: true };
    } catch (error) {
      await stop();
      throw error;
    } finally { busy = false; }
  }
  return { start, open, stop, updateAdoToken };
}

module.exports = { createController };
