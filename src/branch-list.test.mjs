// Tests for the Discovery Branches-tab helpers: ref shaping, default-branch
// drop, ADO web URL, and sort.
import { shortBranchName, buildBranchWebUrl, summarizeBranchRef, branchesForRepo, sortBranches } from "./branch-list.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

const ORG = "https://dev.azure.com/contoso";
const repo = { id: "R1", name: "specs-repo", project: { name: "PBI" }, defaultBranch: "refs/heads/main" };

// --- shortBranchName ---------------------------------------------------------
eq("strips heads prefix", shortBranchName("refs/heads/dev/kay/x"), "dev/kay/x");
eq("leaves plain name", shortBranchName("dev/kay/x"), "dev/kay/x");
eq("null -> empty", shortBranchName(null), "");

// --- buildBranchWebUrl -------------------------------------------------------
eq("branch url",
  buildBranchWebUrl(ORG, "PBI", "specs-repo", "dev/kay/x"),
  "https://dev.azure.com/contoso/PBI/_git/specs-repo?version=GBdev%2Fkay%2Fx");
eq("trims trailing slash on org",
  buildBranchWebUrl("https://dev.azure.com/contoso/", "PBI", "r", "b"),
  "https://dev.azure.com/contoso/PBI/_git/r?version=GBb");
eq("missing parts -> null", buildBranchWebUrl(ORG, "PBI", "", "b"), null);

// --- summarizeBranchRef ------------------------------------------------------
eq("shape a head ref",
  summarizeBranchRef({ name: "refs/heads/dev/kay/x", objectId: "abc" }, repo, ORG),
  { name: "dev/kay/x", ref: "refs/heads/dev/kay/x", repo: "specs-repo", repoId: "R1", project: "PBI", objectId: "abc", url: "https://dev.azure.com/contoso/PBI/_git/specs-repo?version=GBdev%2Fkay%2Fx" });
ok("non-head ref -> null", summarizeBranchRef({ name: "refs/tags/v1" }, repo, ORG) === null);
ok("missing ref -> null", summarizeBranchRef(null, repo, ORG) === null);

// --- branchesForRepo (drops default) ----------------------------------------
const refs = [
  { name: "refs/heads/main", objectId: "m" },
  { name: "refs/heads/dev/kay/a", objectId: "a" },
  { name: "refs/heads/dev/kay/b", objectId: "b" },
  { name: "refs/tags/rel", objectId: "t" },
];
const rows = branchesForRepo(refs, repo, ORG);
eq("drops default + tags, keeps 2", rows.map(r => r.name), ["dev/kay/a", "dev/kay/b"]);
eq("empty refs -> []", branchesForRepo([], repo, ORG), []);
eq("null refs -> []", branchesForRepo(null, repo, ORG), []);

// no defaultBranch configured -> keep everything (still drops tags)
eq("no default branch keeps all heads",
  branchesForRepo(refs, { id: "R", name: "r", project: { name: "P" } }, ORG).map(r => r.name),
  ["main", "dev/kay/a", "dev/kay/b"]);

// --- sortBranches ------------------------------------------------------------
const unsorted = [
  { repo: "beta", name: "zeta" },
  { repo: "alpha", name: "b" },
  { repo: "alpha", name: "A" },
];
eq("sort by repo then name (ci)",
  sortBranches(unsorted).map(r => r.repo + "/" + r.name),
  ["alpha/A", "alpha/b", "beta/zeta"]);
eq("sort null -> []", sortBranches(null), []);

console.log(`branch-list: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
