// Tests for the open-a-.md-file path validator (clickstop 2, step 1). Pure: every
// rejection class is classified, and only an existing readable .md inside an
// approved root is accepted. Injected fake fs — no real files touched.
import { classifyOpenFilePath } from "./open-file-path.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

const P = { resolve: (p) => p, sep: "/" };
// Root "/r" is approved; containment is pure string prefix.
const isContained = (p) => p === "/r" || (typeof p === "string" && p.startsWith("/r/"));

// tree: realpath -> { dir?, readable?=true }; links: input -> realpath target.
function fakeFs(tree, links = {}) {
  const enoent = () => { const e = new Error("ENOENT"); e.code = "ENOENT"; throw e; };
  return {
    constants: { R_OK: 4 },
    realpathSync(p) {
      const real = links[String(p)] || String(p);
      if (!(real in tree)) enoent();
      return real;
    },
    statSync(real) {
      const e = tree[real]; if (!e) enoent();
      return { isDirectory: () => !!e.dir, isFile: () => !e.dir };
    },
    accessSync(real) {
      const e = tree[real];
      if (!e || e.readable === false) { const err = new Error("EACCES"); err.code = "EACCES"; throw err; }
    },
  };
}

function classify(input, tree, links) {
  return classifyOpenFilePath(input, { fs: fakeFs(tree, links), path: P, isContained });
}

// --- accept ------------------------------------------------------------------
eq("valid .md in root",
  classify("/r/Specs/a.md", { "/r/Specs/a.md": {} }),
  { ok: true, realpath: "/r/Specs/a.md" });

// --- reject classes ----------------------------------------------------------
eq("empty", classify("", {}).reason, "empty");
eq("whitespace only", classify("   ", {}).reason, "empty");
eq("not .md", classify("/r/a.txt", { "/r/a.txt": {} }).reason, "not-md");
eq("missing file", classify("/r/nope.md", {}).reason, "missing");
eq("directory", classify("/r/dir.md", { "/r/dir.md": { dir: true } }).reason, "directory");
eq("unreadable", classify("/r/locked.md", { "/r/locked.md": { readable: false } }).reason, "unreadable");

// outside every approved root (real path not under /r)
eq("outside root",
  classify("/other/a.md", { "/other/a.md": {} }).reason, "outside-root");

// symlink escape: lexically under /r, real target outside /r
eq("symlink escapes root",
  classify("/r/link.md", { "/other/a.md": {} }, { "/r/link.md": "/other/a.md" }).reason,
  "symlink-escape");

// a symlink that stays inside the root is fine (real target under /r)
eq("symlink inside root ok",
  classify("/r/link.md", { "/r/real.md": {} }, { "/r/link.md": "/r/real.md" }),
  { ok: true, realpath: "/r/real.md" });

// every rejection carries a human message
ok("rejections have an error string",
  ["", "/r/a.txt", "/r/nope.md", "/other/a.md"].every(
    (p) => typeof classify(p, { "/r/a.txt": {} }).error === "string"));

console.log(`open-file-path: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
