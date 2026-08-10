// Tests for the Custom-list store (clickstop 2). In-memory fake fs so no real
// files are touched; POSIX-style fake path so it runs the same on any platform.
// Mirrors the durability contract of personal-comments-store: atomic writes that
// throw on failure, and a corrupt store is quarantined + throws (never silently
// read as empty).
import { createCustomFiles } from "./custom-files.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

const P = {
  sep: "/",
  dirname: (p) => { const s = String(p).replace(/\/+$/, ""); const i = s.lastIndexOf("/"); return i <= 0 ? (i === 0 ? "/" : ".") : s.slice(0, i); },
};

// In-memory fs. `files` is the backing store; `renames` / `removed` record the
// quarantine + temp-cleanup paths so tests can assert them.
function memFs({ initial = {}, failWrite = false } = {}) {
  const files = { ...initial };
  const renames = [];
  const removed = [];
  return {
    files, renames, removed,
    readFileSync(p) { if (!(p in files)) { const e = new Error("ENOENT"); e.code = "ENOENT"; throw e; } return files[p]; },
    writeFileSync(p, data) { if (failWrite) { const e = new Error("ENOSPC"); e.code = "ENOSPC"; throw e; } files[p] = data; },
    renameSync(a, b) { renames.push([a, b]); files[b] = files[a]; delete files[a]; },
    rmSync(p) { removed.push(p); delete files[p]; },
    mkdirSync() {},
  };
}

const FILE = "/cfg/custom-files.json";
const mk = (fs) => createCustomFiles({ fs, path: P, file: FILE, configDir: "/cfg" });

// --- absent store -> empty --------------------------------------------------
{
  const fs = memFs();
  const cf = mk(fs);
  eq("absent store lists empty", cf.list(), []);
  eq("absent store no roots", cf.customRoots(), []);
}

// --- add persists + derives the folder root ---------------------------------
{
  const fs = memFs();
  const cf = mk(fs);
  cf.add("/home/kay/specs/a.md", { addedAt: "T0" });
  eq("added one", cf.list(), [{ path: "/home/kay/specs/a.md", addedAt: "T0" }]);
  eq("root is the file's folder", cf.customRoots(), ["/home/kay/specs"]);
  ok("persisted to disk", FILE in fs.files);
  eq("persisted content", JSON.parse(fs.files[FILE]), [{ path: "/home/kay/specs/a.md", addedAt: "T0" }]);
}

// --- add is idempotent (no dup, no extra write) -----------------------------
{
  const fs = memFs();
  const cf = mk(fs);
  cf.add("/x/a.md", { addedAt: "T0" });
  const writesBefore = fs.files[FILE];
  cf.add("/x/a.md", { addedAt: "T1" }); // same path
  eq("no duplicate entry", cf.list().length, 1);
  ok("second add did not rewrite", fs.files[FILE] === writesBefore);
}

// --- two files, same folder -> one root; removing one keeps the root --------
{
  const fs = memFs();
  const cf = mk(fs);
  cf.add("/x/a.md", { addedAt: "T0" });
  cf.add("/x/b.md", { addedAt: "T1" });
  eq("two files", cf.list().length, 2);
  eq("shared folder is one root", cf.customRoots(), ["/x"]);
  cf.remove("/x/a.md");
  eq("folder still approved (b remains)", cf.customRoots(), ["/x"]);
  cf.remove("/x/b.md");
  eq("folder revoked when last file gone", cf.customRoots(), []);
  eq("list empty after both removed", cf.list(), []);
}

// --- distinct folders -> distinct roots -------------------------------------
{
  const fs = memFs();
  const cf = mk(fs);
  cf.add("/x/a.md"); cf.add("/y/b.md");
  eq("two distinct roots", cf.customRoots().sort(), ["/x", "/y"]);
  cf.remove("/x/a.md");
  eq("only the emptied folder revoked", cf.customRoots(), ["/y"]);
}

// --- persistence round-trips across a reload --------------------------------
{
  const fs = memFs();
  mk(fs).add("/x/a.md", { addedAt: "T0" });
  const cf2 = mk(fs); // reloads from fs.files[FILE]
  eq("reloaded entries survive restart", cf2.list(), [{ path: "/x/a.md", addedAt: "T0" }]);
  eq("reloaded roots survive restart", cf2.customRoots(), ["/x"]);
}

// --- corrupt store -> quarantine + throw (never silently empty) -------------
{
  const fs = memFs({ initial: { [FILE]: "{ this is not json" } });
  let threw = null;
  try { mk(fs); } catch (e) { threw = e; }
  ok("corrupt store throws", threw && threw.code === "CUSTOM_FILES_CORRUPT");
  ok("corrupt store quarantined (renamed)", fs.renames.some(([a]) => a === FILE));
  ok("original path cleared by quarantine", !(FILE in fs.files));
}

// --- write failure throws + cleans the temp file ----------------------------
{
  const fs = memFs({ failWrite: true });
  const cf = mk(fs);
  let threw = null;
  try { cf.add("/x/a.md"); } catch (e) { threw = e; }
  ok("write failure surfaces (throws)", threw && threw.code === "ENOSPC");
  ok("temp file cleaned up on failure", fs.removed.length >= 1);
}

// --- legacy shapes: bare-string array + { files: [...] } ---------------------
{
  const fs = memFs({ initial: { [FILE]: JSON.stringify(["/x/a.md", "/x/a.md", "/y/b.md"]) } });
  const cf = mk(fs);
  eq("bare-string array deduped", cf.list().map((e) => e.path), ["/x/a.md", "/y/b.md"]);
}
{
  const fs = memFs({ initial: { [FILE]: JSON.stringify({ files: [{ path: "/z/c.md", addedAt: "T9" }] }) } });
  const cf = mk(fs);
  eq("{files:[]} shape accepted", cf.list(), [{ path: "/z/c.md", addedAt: "T9" }]);
}

console.log(`custom-files: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
