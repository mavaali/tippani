import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { createGitHubViewedStore } from "./github-viewed-store.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tippani-gh-viewed-"));
const file = path.join(dir, "viewed.json");
let requestedDirectoryMode;
let requestedFileMode;
const fsImpl = {
  existsSync: fs.existsSync,
  readFileSync: fs.readFileSync,
  mkdirSync(target, options) {
    requestedDirectoryMode = options?.mode;
    return fs.mkdirSync(target, options);
  },
  writeFileSync(target, data, options) {
    requestedFileMode = options?.mode;
    return fs.writeFileSync(target, data, options);
  },
  renameSync: fs.renameSync,
};
try {
  const store = createGitHubViewedStore(file, { fsImpl });
  eq("missing store -> empty", await store.read("o/r#1"), {});
  await store.write("o/r#1", { 101: 5 });
  eq("round trip", await store.read("o/r#1"), { 101: 5 });
  await store.write("o/r#2", { 202: 9 });
  eq("second PR does not overwrite first", await store.read("o/r#1"), { 101: 5 });
  ok("directory requests private mode", requestedDirectoryMode === 0o700);
  ok("file requests private mode", requestedFileMode === 0o600);
  if (process.platform !== "win32") {
    ok("file mode is private", (fs.statSync(file).mode & 0o777) === 0o600);
  }
  ok("no temp file remains after atomic rename",
    !fs.readdirSync(dir).some((name) => name.includes(".tmp-")));

  fs.writeFileSync(file, "[]");
  let threw = false;
  try { await store.read("o/r#1"); } catch { threw = true; }
  ok("corrupt top-level store throws", threw);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\ngithub-viewed-store.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
