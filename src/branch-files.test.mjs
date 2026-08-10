// Tests for the branch-page file helpers: README detection, path split, the
// read-only /spec link, row shaping, and the visible-count helper.
import { isReadmeFile, splitSpecPath, buildSpecHref, buildEditorHref, branchFileRows, visibleFileCount, mdPathsFromChanges, stagedFileComparison } from "./branch-files.js";

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
eq("spec href threads the editing mode",
  buildSpecHref({ repoId: "R1", path: "/foo.md", mode: "local" }),
  "/spec?repo=R1&path=%2Ffoo.md&mode=local");
eq("spec href strips heads prefix from plain ref",
  buildSpecHref({ repoId: "R1", ref: "feature/x", path: "/foo.md" }),
  "/spec?repo=R1&path=%2Ffoo.md&branch=feature%2Fx");
eq("spec href local variant carries clone path, not ADO id, mode=local",
  buildSpecHref({ localPath: "C:/repos/specs", ref: "dev/kay/x", path: "docs/foo.md", back: "/local-branch" }),
  "/spec?local=C%3A%2Frepos%2Fspecs&path=docs%2Ffoo.md&branch=dev%2Fkay%2Fx&back=%2Flocal-branch&mode=local");
eq("spec href local ignores ADO fields when localPath present",
  buildSpecHref({ localPath: "/r", repoId: "R1", repoName: "n", project: "P", ref: "b", path: "/f.md" }),
  "/spec?local=%2Fr&path=%2Ff.md&branch=b&mode=local");

// --- branchFileRows ----------------------------------------------------------
const ctx = { repoId: "R1", repoName: "specs-repo", project: "PBI", ref: "dev/x" };
const paths = ["/docs/b.md", "/README.md", "/docs/a.md", "/notes.txt", "/docs/readme.md"];
const rows = branchFileRows(paths, ctx);
eq("drops non-md, sorts by path", rows.map(r => r.path), ["/docs/a.md", "/docs/b.md", "/docs/readme.md", "/README.md"]);
eq("flags readmes", rows.map(r => r.isReadme), [false, false, true, true]);
eq("row carries dir + name", rows[0], { path: "/docs/a.md", dir: "docs", name: "a.md", isReadme: false, href: buildEditorHref({ ...ctx, path: "/docs/a.md" }) });
eq("remote rows link to the editor", rows[0].href.startsWith("/staged-file?"), true);
eq("editor href pins repo/branch/path", buildEditorHref({ repoId: "R1", repoName: "n", project: "P", ref: "refs/heads/dev/x", path: "/d/f.md" }), "/staged-file?project=P&repo=R1&repoName=n&branch=dev%2Fx&path=%2Fd%2Ff.md");
eq("staged edit keeps remote and proposed separate", stagedFileComparison({ content: "new", existing: true, hasStagedEdit: true, remoteContent: "old" }), { current: "old", proposed: "new", pureStaged: false, hasStagedEdit: true });
eq("unstaged remote file has no proposal", stagedFileComparison({ content: "old", existing: true }), { current: "old", proposed: "old", pureStaged: false, hasStagedEdit: false });
eq("new staged file compares against empty remote", stagedFileComparison({ content: "new" }), { current: "", proposed: "new", pureStaged: true, hasStagedEdit: false });
eq("local rows stay read-only (/spec)", branchFileRows(["/d/a.md"], { localPath: "/r", ref: "b" })[0].href.startsWith("/spec?"), true);
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
