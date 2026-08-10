// Tests for the one-off file reviewing-context key (clickstop 2, step 3).
import { fileReviewContext } from "./comment-key.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

eq("file: scheme + realpath, no branch",
  fileReviewContext("/r/Specs/a.md"),
  { repo: "file:/r/Specs/a.md", branch: "", path: "/r/Specs/a.md" });

// Different realpaths → different repo keys (no collision).
ok("distinct files get distinct keys",
  fileReviewContext("/r/a.md").repo !== fileReviewContext("/r/b.md").repo);

// A file: key is not a local:/localorigin:/remote key — its own namespace.
ok("file: namespace is distinct",
  fileReviewContext("/r/a.md").repo.startsWith("file:") &&
  fileReviewContext("/r/a.md").branch === "");

eq("null/empty tolerated", fileReviewContext(null), { repo: "file:", branch: "", path: "" });

console.log(`comment-key: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
