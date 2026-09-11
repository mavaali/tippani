import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const image = path.resolve(process.argv[2] || "");
if (!fs.statSync(image).isFile()) throw new Error("Pass the native DMG or NSIS installer.");
const work = path.join(root, ".desktop-validation", `installed-${process.pid}`);
const destination = path.join(work, "Installed Apps नमस्ते");
fs.mkdirSync(destination, { recursive: true });
async function run(file, args, options = {}) {
  const result = await exec(file, args, { cwd: root, timeout: 180000, maxBuffer: 2 * 1024 * 1024, ...options });
  if (result.stdout) process.stdout.write(result.stdout);
}
async function smoke(app) {
  await run(process.execPath, ["scripts/smoke-desktop.mjs", app]);
}
try {
  if (process.platform === "darwin") {
    const mount = path.join(work, "mounted");
    fs.mkdirSync(mount);
    let mounted = false;
    try {
      await run("hdiutil", ["verify", image]);
      await run("hdiutil", ["attach", "-readonly", "-nobrowse", "-mountpoint", mount, image]);
      mounted = true;
      await run("ditto", [path.join(mount, "Tippani.app"), path.join(destination, "Tippani.app")]);
    } finally {
      if (mounted) await run("hdiutil", ["detach", mount]);
    }
    await smoke(path.join(destination, "Tippani.app"));
  } else if (process.platform === "win32") {
    const app = path.join(destination, "Tippani");
    // electron-builder reads /D with StdUtils.GetParameter, which needs normal
    // Windows argument quoting to preserve a destination containing spaces.
    const install = () => run(image, ["/S", "/currentuser", `/D=${app}`]);
    await install();
    try {
      if (!fs.existsSync(path.join(app, "Tippani.exe")) || !fs.existsSync(path.join(app, "resources", "app.asar"))) {
        throw new Error(`NSIS did not install the executable and application archive at the requested destination: ${app}`);
      }
      await smoke(app);
      await install();
      await smoke(app);
    } finally {
      const uninstall = path.join(app, "Uninstall Tippani.exe");
      if (fs.existsSync(uninstall)) await run(uninstall, ["/S"]);
      for (let n = 0; n < 100 && fs.existsSync(path.join(app, "Tippani.exe")); n++) await new Promise(resolve => setTimeout(resolve, 100));
      if (fs.existsSync(path.join(app, "Tippani.exe"))) throw new Error("NSIS uninstall did not remove the installed executable.");
    }
  } else throw new Error("Installed-app smoke must run on macOS or Windows.");
} finally {
  // Async rm handles Windows read-only-file EPERM recovery as well as retries.
  await fs.promises.rm(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}
console.log("Native installer: installed path with spaces/Unicode and actual GUI/runtime smoke passed.");
