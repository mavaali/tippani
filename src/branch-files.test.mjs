// Tests for the branch-page file helpers: README detection, path split, the
// read-only /spec link, row shaping, and the visible-count helper.
import { isReadmeFile, splitSpecPath, buildSpecHref, branchFileRows, visibleFileCount, mdPathsFromChanges } from "./branch-files.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

// --- isReadmeFile ------------------------------------------------------------
ok("readme at root", isReadmeFile("/README.md"));
ok("readme nested, mixed case", isReadmeFile("/docs/ReadMe.md"));
ok("plain md is not readme", !isReadmeFile("/docs/design.md"));
ok("readme substring is not readme", !isReadmeFile("/docs/readme-notes.md"));
ok("empty -> not readme", !isReadmeFile(""));

// --- splitSpecPath -----------------------------------------------------------
eq("split nested", splitSpecPath("/docs/specs/foo.md"), { dir: "docs/specs", name: "foo.md" });
eq("split top-level", splitSpecPath("/foo.md"), { dir: "", name: "foo.md" });
eq("split no leading slash", splitSpecPath("a/b.md"), { dir: "a", name: "b.md" });
eq("split trailing slash trimmed", splitSpecPath("/a/b/"), { dir: "a", name: "b" });

// --- buildSpecHref -----------------------------------------------------------
eq("spec href encodes + pins branch",
  buildSpecHref({ repoId: "R1", repoName: "specs-repo", project: "Power BI", ref: "refs/heads/dev/kay/x", path: "/docs/foo.md" }),
  "/spec?repo=R1&path=%2Fdocs%2Ffoo.md&repoName=specs-repo&project=Power%20BI&branch=dev%2Fkay%2Fx");
eq("spec href drops empty parts",
  buildSpecHref({ repoId: "R1", path: "/foo.md" }),
  "/spec?repo=R1&path=%2Ffoo.md");
eq("spec href threads a relative back link",
  buildSpecHref({ repoId: "R1", path: "/foo.md", back: "/branch?repo=R1&ref=b" }),
  "/spec?repo=R1&path=%2Ffoo.md&back=%2Fbranch%3Frepo%3DR1%26ref%3Db");
eq("spec href strips heads prefix from plain ref",
  buildSpecHref({ repoId: "R1", ref: "feature/x", path: "/foo.md" }),
  "/spec?repo=R1&path=%2Ffoo.md&branch=feature%2Fx");

// --- branchFileRows ----------------------------------------------------------
const ctx = { repoId: "R1", repoName: "specs-repo", project: "PBI", ref: "dev/x" };
const paths = ["/docs/b.md", "/README.md", "/docs/a.md", "/notes.txt", "/docs/readme.md"];
const rows = branchFileRows(paths, ctx);
eq("drops non-md, sorts by path", rows.map(r => r.path), ["/docs/a.md", "/docs/b.md", "/docs/readme.md", "/README.md"]);
eq("flags readmes", rows.map(r => r.isReadme), [false, false, true, true]);
eq("row carries dir + name", rows[0], { path: "/docs/a.md", dir: "docs", name: "a.md", isReadme: false, href: buildSpecHref({ ...ctx, path: "/docs/a.md" }) });
eq("empty -> []", branchFileRows([], ctx), []);
eq("null -> []", branchFileRows(null, ctx), []);

// --- visibleFileCount --------------------------------------------------------
eq("count hides readmes by default", visibleFileCount(rows, false), 2);
eq("count shows all when readmes on", visibleFileCount(rows, true), 4);
eq("count null -> 0", visibleFileCount(null, false), 0);

// --- mdPathsFromChanges (branch-unique files from an ADO commit diff) --------
const changes = [
  { item: { path: "/docs/new.md" }, changeType: 1 },              // Add
  { item: { path: "/docs/edited.md" }, changeType: 2 },           // Edit
  { item: { path: "/docs/gone.md" }, changeType: 16 },            // Delete -> drop
  { item: { path: "/docs", isFolder: true }, changeType: 2 },     // folder -> drop
  { item: { path: "/notes.txt" }, changeType: 1 },                // non-md -> drop
  { item: { path: "/docs/new.md" }, changeType: 2 },              // dup -> drop
  { item: { path: "/docs/renamed.md" }, changeType: "rename, edit" }, // string type -> keep
  { item: { path: "/docs/removed2.md" }, changeType: "delete" },  // string delete -> drop
];
eq("keeps only branch-changed md files that still exist",
  mdPathsFromChanges(changes),
  ["/docs/new.md", "/docs/edited.md", "/docs/renamed.md"]);
eq("empty changes -> []", mdPathsFromChanges([]), []);
eq("null changes -> []", mdPathsFromChanges(null), []);

console.log(`branch-files: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
