#!/usr/bin/env node
// Build script: bundles CLI into a single file and creates platform executables.
// Usage: npm run build

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit", ...opts });
}

console.log("\n=== tippani — Build ===\n");

// Clean
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, "bin"), { recursive: true });

// 0. Build the browser-side editor bundle (inlined into the server)
console.log("0. Building client editor bundle...");
run("node scripts/build-client.js");

// 1. Bundle with esbuild
console.log("1. Bundling with esbuild...");
run(
  `npx esbuild src/index.js --bundle --platform=node --target=node18 --format=cjs ` +
  `--outfile=dist/cli.cjs ` +
  `--banner:js="const __import_meta_url = require('url').pathToFileURL(__filename).href;" ` +
  `--define:import.meta.url=__import_meta_url ` +
  `--minify-syntax`
);

// 2. Create Windows .bat launcher
console.log("2. Creating Windows launcher...");
fs.writeFileSync(
  path.join(DIST, "tippani.bat"),
  `@echo off\r\nwhere node >nul 2>nul\r\nif %ERRORLEVEL% NEQ 0 (\r\n    echo Node.js not found. Install from https://nodejs.org\r\n    exit /b 1\r\n)\r\nnode "%~dp0cli.cjs" %*\r\n`
);

// 3. Create shell launcher
console.log("3. Creating shell launcher...");
const sh = `#!/bin/bash\nDIR="$(cd "$(dirname "$0")" && pwd)"\nnode "$DIR/cli.cjs" "$@"\n`;
fs.writeFileSync(path.join(DIST, "tippani.sh"), sh, { mode: 0o755 });

// 4. macOS SEA (only on macOS)
if (process.platform === "darwin") {
  console.log("4. Building macOS standalone binary (SEA)...");
  const seaConfig = { main: "dist/cli.cjs", output: "dist/sea-prep.blob", disableExperimentalSEAWarning: true };
  fs.writeFileSync(path.join(DIST, "sea-config.json"), JSON.stringify(seaConfig));
  try {
    run("node --experimental-sea-config dist/sea-config.json");
    run(`cp $(which node) dist/bin/tippani`);
    run("chmod 755 dist/bin/tippani");
    run("codesign --remove-signature dist/bin/tippani");
    run(
      `npx postject dist/bin/tippani NODE_SEA_BLOB dist/sea-prep.blob ` +
      `--sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA`
    );
    run("codesign --sign - dist/bin/tippani");
    console.log("   ✓ macOS binary: dist/bin/tippani");
  } catch (e) {
    console.log("   ⚠ SEA build failed, falling back to shell launcher only:", e.message);
  }
} else {
  console.log("4. Skipping SEA (not on macOS)");
}

// Summary
const cjsSize = (fs.statSync(path.join(DIST, "cli.cjs")).size / 1024 / 1024).toFixed(1);
console.log(`\n=== Build complete ===`);
console.log(`  dist/cli.cjs              ${cjsSize} MB (bundled, runs with any Node.js 18+)`);
console.log(`  dist/tippani.bat         (Windows launcher)`);
console.log(`  dist/tippani.sh          (macOS/Linux launcher)`);
if (fs.existsSync(path.join(DIST, "bin", "tippani"))) {
  const binSize = (fs.statSync(path.join(DIST, "bin", "tippani")).size / 1024 / 1024).toFixed(0);
  console.log(`  dist/bin/tippani         ${binSize} MB (macOS standalone, no Node required)`);
}
console.log(`\nTo share with Windows users: send dist/cli.cjs + dist/tippani.bat`);
console.log(`To share with macOS users:   send dist/bin/tippani (standalone)\n`);
