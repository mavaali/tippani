import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
execFileSync(process.execPath, ["scripts/build.js", "--bundle-only"], { cwd: root, stdio: "inherit" });
const app = path.join(root, "dist", "desktop-app");
fs.mkdirSync(app, { recursive: true });
fs.cpSync(path.join(root, "desktop"), path.join(app, "desktop"), { recursive: true });
await build({ entryPoints: ["azure-auth.cjs", "settings.cjs"].map(file => path.join(root, "desktop", file)),
  outdir: path.join(app, "desktop"), outExtension: { ".js": ".cjs" }, bundle: true, platform: "node", format: "cjs", target: "node22" });
fs.copyFileSync(path.join(root, "dist", "cli.cjs"), path.join(app, "cli.cjs"));
fs.copyFileSync(path.join(root, "LICENSE"), path.join(app, "LICENSE"));
const { name, version, description, author, license } = JSON.parse(fs.readFileSync(path.join(root, "package.json")));
fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({
  name, version, description, author, license, main: "desktop/main.cjs",
}, null, 2));
// Bound electron-builder's dependency/workspace discovery to this self-contained
// app; the CLI is bundled, so none of the development workspace ships.
fs.writeFileSync(path.join(app, "package-lock.json"), JSON.stringify({
  name, version, lockfileVersion: 3, packages: { "": { name, version, license } },
}));
