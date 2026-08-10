// Tests for the pre-PR authoring session (clickstop 2, step 10). Pure.
import { makeRepoSession, createSessionTokens, openRepoSession } from "./repo-session.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }
function threw(name, fn) { let t = false; try { fn(); } catch { t = true; } ok(name, t); }

// --- makeRepoSession: shape & validation ---
const s = makeRepoSession({ repo: "MyRepo", branch: "spec/x" });
ok("no-PR session has no PR", s.pr === null && s.hasPr === false);
eq("carries repo", s.repo, "MyRepo");
eq("carries branch", s.branch, "spec/x");
eq("derives branchRef", s.branchRef, "refs/heads/spec/x");
eq("empty-but-valid file list", s.files, []);
ok("qualified branch stays", makeRepoSession({ repo: "R", branch: "refs/heads/dev/y" }).branchRef === "refs/heads/dev/y");
threw("missing repo throws", () => makeRepoSession({ branch: "spec/x" }));
threw("missing branch throws", () => makeRepoSession({ repo: "R" }));

// file list is populated (not a silent empty)
const sf = makeRepoSession({ repo: "R", branch: "b", files: ["docs/spec.md", { path: "docs/two.md", staged: true }] });
eq("string file normalized to {path}", sf.files[0], { path: "docs/spec.md" });
eq("object file keeps extras + path", sf.files[1], { path: "docs/two.md", staged: true });
ok("file count preserved", sf.files.length === 2);
threw("file without a path throws (no silent drop)", () => makeRepoSession({ repo: "R", branch: "b", files: [{}] }));

// immutability
threw("session is frozen", () => { "use strict"; makeRepoSession({ repo: "R", branch: "b" }).repo = "X"; });

// --- token registry isolation ---
const t = createSessionTokens();
t.bind("A", "/cfg/token-A");
t.bind("B", "/cfg/token-B");
eq("A token present", t.get("A"), "/cfg/token-A");
t.release("A");
ok("releasing A leaves B untouched", t.get("A") === null && t.get("B") === "/cfg/token-B");
threw("bind without id throws", () => t.bind("", "/x"));
threw("bind without token path throws", () => t.bind("C", ""));

// --- openRepoSession: a failed open does not delete another session's token ---
const tk = createSessionTokens();
tk.bind("A", "/cfg/token-A");
threw("bad open throws", () => openRepoSession({ id: "B", branch: "b", tokenPath: "/cfg/token-B" }, tk)); // no repo
ok("A's token survives B's failed open", tk.get("A") === "/cfg/token-A");
ok("B was never bound on failure", tk.get("B") === null);
// a successful open binds only after building
const good = openRepoSession({ id: "C", repo: "R", branch: "spec/z", tokenPath: "/cfg/token-C" }, tk);
ok("successful open binds token", tk.get("C") === "/cfg/token-C");
eq("open returns a real session", good.branchRef, "refs/heads/spec/z");

console.log(`repo-session: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
