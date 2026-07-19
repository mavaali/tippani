// Tests for the local-repo tile helpers: .git/HEAD parsing + working-tree
// validation (via an injected fake fs).
import { parseGitHead, parsePackedRefs, mergeLocalBranches, resolveGitDir, validateLocalRepo } from "./local-repo.js";
import path from "node:path";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

// --- parseGitHead ------------------------------------------------------------
eq("branch head", parseGitHead("ref: refs/heads/dev/kay/x\n"), "dev/kay/x");
eq("branch head no newline", parseGitHead("ref: refs/heads/main"), "main");
eq("detached -> null", parseGitHead("68d04272abc123\n"), null);
eq("empty -> null", parseGitHead(""), null);
eq("null -> null", parseGitHead(null), null);

// --- validateLocalRepo (fake fs) --------------------------------------------
function fakeFs(tree) {
  // tree: { "<path>": { dir?:bool, content?:string } }
  return {
    statSync(p) {
      const e = tree[p];
      if (!e) { const err = new Error("ENOENT"); throw err; }
      return { isDirectory: () => !!e.dir };
    },
    readFileSync(p) {
      const e = tree[p];
      if (!e || e.dir) { throw new Error("EISDIR"); }
      return e.content;
    },
  };
}
const G = (p) => path.join("/repo", p);

eq("no path", validateLocalRepo("", fakeFs({})), { ok: false, error: "No path provided." });
eq("missing path", validateLocalRepo("/nope", fakeFs({})), { ok: false, error: "Path not found." });

eq("file not dir",
  validateLocalRepo("/file", fakeFs({ "/file": { dir: false } })),
  { ok: false, error: "Path is not a directory." });

eq("dir without .git",
  validateLocalRepo("/repo", fakeFs({ "/repo": { dir: true } })),
  { ok: false, error: "Not a git repository (no .git)." });

// happy path: .git dir + HEAD on a branch
eq("valid repo on a branch",
  validateLocalRepo("/repo", fakeFs({
    "/repo": { dir: true },
    [G(".git")]: { dir: true },
    [G(path.join(".git", "HEAD"))]: { content: "ref: refs/heads/dev/kay/spec\n" },
  })),
  { ok: true, path: "/repo", branch: "dev/kay/spec", detached: false });

// detached HEAD
eq("valid repo detached",
  validateLocalRepo("/repo", fakeFs({
    "/repo": { dir: true },
    [G(".git")]: { dir: true },
    [G(path.join(".git", "HEAD"))]: { content: "abc123def\n" },
  })),
  { ok: true, path: "/repo", branch: null, detached: true });

// .git file pointer (worktree/submodule)
const wtHead = path.join("/actual/gitdir", "HEAD");
eq("valid repo via .git file pointer",
  validateLocalRepo("/repo", fakeFs({
    "/repo": { dir: true },
    [G(".git")]: { dir: false, content: "gitdir: /actual/gitdir\n" },
    [wtHead]: { content: "ref: refs/heads/feature\n" },
  })),
  { ok: true, path: "/repo", branch: "feature", detached: false });

// --- parsePackedRefs ---------------------------------------------------------
eq("packed heads only",
  parsePackedRefs("# pack-refs with: peeled\nabc123 refs/heads/main\ndef456 refs/heads/dev/x\n789aaa refs/tags/v1\n^cccccc"),
  ["main", "dev/x"]);
eq("empty packed -> []", parsePackedRefs(""), []);
eq("null packed -> []", parsePackedRefs(null), []);

// --- mergeLocalBranches ------------------------------------------------------
eq("merge + dedupe + sort + current flag",
  mergeLocalBranches(["main", "dev/b"], ["dev/a", "main"], "dev/b"),
  [{ name: "dev/a", current: false }, { name: "dev/b", current: true }, { name: "main", current: false }]);
eq("no head -> none current",
  mergeLocalBranches(["main"], [], null),
  [{ name: "main", current: false }]);
eq("empty -> []", mergeLocalBranches([], [], "x"), []);

// --- resolveGitDir -----------------------------------------------------------
eq("resolve .git dir",
  resolveGitDir("/repo", fakeFs({ "/repo": { dir: true }, [G(".git")]: { dir: true } })),
  { ok: true, gitDir: G(".git") });
eq("resolve missing repo", resolveGitDir("/nope", fakeFs({})), { ok: false, error: "Path not found." });
eq("resolve no .git",
  resolveGitDir("/repo", fakeFs({ "/repo": { dir: true } })),
  { ok: false, error: "Not a git repository (no .git)." });
eq("resolve .git file pointer",
  resolveGitDir("/repo", fakeFs({ "/repo": { dir: true }, [G(".git")]: { dir: false, content: "gitdir: /actual/gitdir\n" } })),
  { ok: true, gitDir: "/actual/gitdir" });

console.log(`local-repo: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
