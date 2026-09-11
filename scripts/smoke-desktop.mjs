// Run with the packaged executable's own Node runtime, not the developer's
// Node. All fixture data lives under the repository, never the user's profile.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { smokeGui } from "./smoke-desktop-gui.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const supplied = process.argv[2];
const appPath = supplied ? path.resolve(supplied) : process.platform === "darwin"
  ? path.join(root, "installers", process.arch === "arm64" ? "mac-arm64" : "mac", "Tippani.app")
  : path.join(root, "installers", "win-unpacked");
const runtime = process.platform === "darwin" ? path.join(appPath, "Contents", "MacOS", "Tippani") : path.join(appPath, "Tippani.exe");
const archive = process.platform === "darwin" ? path.join(appPath, "Contents", "Resources", "app.asar") : path.join(appPath, "resources", "app.asar");
if (!fs.existsSync(runtime) || !fs.existsSync(archive)) throw new Error("Build the native desktop installer first (npm run package:desktop).");
const home = path.join(root, ".desktop-validation", `packaged-${process.pid} space-नमस्ते`);
fs.mkdirSync(home, { recursive: true });
try {
  const child = spawn(runtime, [path.join(root, "scripts", "desktop-smoke-worker.cjs"), archive, home], {
    cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", HOME: home, USERPROFILE: home },
    stdio: "inherit", windowsHide: true,
  });
  const interrupted = () => { child.kill("SIGKILL"); process.exit(143); };
  process.once("SIGTERM", interrupted);
  process.once("SIGINT", interrupted);
  const code = await new Promise((resolve, reject) => {
    let force;
    const timer = setTimeout(() => {
      child.kill();
      force = setTimeout(() => child.kill("SIGKILL"), 3000);
    }, 90000);
    const cleanup = () => { clearTimeout(timer); clearTimeout(force); };
    child.once("error", error => { cleanup(); reject(error); });
    child.once("exit", code => { cleanup(); resolve(code); });
  });
  process.off("SIGTERM", interrupted);
  process.off("SIGINT", interrupted);
  if (code !== 0) throw new Error(`Packaged smoke failed (${code}).`);
  await smokeGui(runtime, home);
} finally { fs.rmSync(home, { recursive: true, force: true }); }
