// Tests for the approved-roots gate (clickstop 2, step 1). Behavior must match the
// logic previously inline in index.js. Uses an injected fake fs so no real files
// are touched.
import { createApprovedRoots } from "./approved-roots.js";
import path from "node:path";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

// Fake fs: realpath maps aliases to targets; everything else is inert. Uses POSIX
// separators so the test is platform-independent.
const P = { sep: "/", resolve: (p) => p, join: (...a) => a.join("/") };
function fakeFs({ links = {}, roots = null, writes = {} } = {}) {
  return {
    realpathSync(p) {
      const s = String(p).trim();
      if (!s) { const e = new Error("ENOENT"); e.code = "ENOENT"; throw e; } // real fs throws on ""
      if (links[s]) return links[s];
      return s; // identity when not a known symlink
    },
    readFileSync() {
      if (roots == null) { throw new Error("ENOENT"); }
      return JSON.stringify(roots);
    },
    mkdirSync() {},
    writeFileSync(f, data) { writes[f] = data; },
  };
}

// --- load + containment (the index.js gate, preserved) ----------------------
{
  const fs = fakeFs({ roots: ["/home/kay/repo"] });
  const ar = createApprovedRoots({ fs, path: P, rootsFile: "/roots.json", configDir: "/cfg" });
  ok("root itself is approved", ar.isApprovedRoot("/home/kay/repo"));
  ok("file under root approved", ar.isApprovedRoot("/home/kay/repo/Specs/a.md"));
  ok("sibling prefix NOT approved", !ar.isApprovedRoot("/home/kay/repo-evil/a.md"));
  ok("unrelated path NOT approved", !ar.isApprovedRoot("/etc/passwd"));
  ok("empty NOT approved", !ar.isApprovedRoot(""));
}

// --- realpath: a symlink alias of an approved root still matches -------------
{
  const fs = fakeFs({ roots: ["/real/repo"], links: { "/link/repo": "/real/repo", "/link/repo/a.md": "/real/repo/a.md" } });
  const ar = createApprovedRoots({ fs, path: P, rootsFile: "/roots.json", configDir: "/cfg" });
  ok("symlinked alias of root approved", ar.isApprovedRoot("/link/repo/a.md"));
}

// --- isContained is pure (no realpath) --------------------------------------
{
  const fs = fakeFs({ roots: ["/r"] });
  const ar = createApprovedRoots({ fs, path: P, rootsFile: "/roots.json", configDir: "/cfg" });
  ok("contained: under root", ar.isContained("/r/x/y.md"));
  ok("contained: exact root", ar.isContained("/r"));
  ok("not contained: sibling", !ar.isContained("/r-evil/x"));
  ok("not contained: empty", !ar.isContained(""));
}

// --- approveLocalRoot persists + de-dupes -----------------------------------
{
  const writes = {};
  const fs = fakeFs({ roots: [], writes });
  const ar = createApprovedRoots({ fs, path: P, rootsFile: "/roots.json", configDir: "/cfg" });
  ok("newly approved is contained", (ar.approveLocalRoot("/new/repo"), ar.isContained("/new/repo/a.md")));
  eq("persisted to roots file", JSON.parse(writes["/roots.json"]), ["/new/repo"]);
  ar.approveLocalRoot("/new/repo"); // idempotent
  eq("no dup on re-approve", JSON.parse(writes["/roots.json"]), ["/new/repo"]);
  ok("bad path returns null", ar.approveLocalRoot("") === null || ar.approveLocalRoot(null) === null);
}

// --- extraRoots (Custom-list folders) union into containment, dynamically ----
{
  const fs = fakeFs({ roots: ["/clone/repo"] });
  let extra = [];
  const ar = createApprovedRoots({ fs, path: P, rootsFile: "/roots.json", configDir: "/cfg", extraRoots: () => extra });
  ok("local-clone root still approved", ar.isContained("/clone/repo/a.md"));
  ok("custom folder NOT approved before add", !ar.isContained("/custom/dir/x.md"));
  extra = ["/custom/dir"]; // the custom list gains a file under /custom/dir
  ok("custom folder approved after add (dynamic)", ar.isContained("/custom/dir/x.md"));
  ok("custom root itself contained", ar.isContained("/custom/dir"));
  ok("sibling of custom root NOT approved", !ar.isContained("/custom/dir-evil/x.md"));
  extra = []; // last file removed -> folder revoked
  ok("custom folder revoked after removal", !ar.isContained("/custom/dir/x.md"));
  ok("local-clone root unaffected by custom churn", ar.isContained("/clone/repo/a.md"));
}

console.log(`approved-roots: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);