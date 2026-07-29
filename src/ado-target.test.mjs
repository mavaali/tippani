// Tests for the pure write-target resolver (clickstop 2). Pure.
import { resolveWriteTarget, draftKeyOf, WriteTargetError } from "./ado-target.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }
function threw(name, fn, code) { let e = null; try { fn(); } catch (x) { e = x; } ok(name, e && (!code || e.code === code)); }

const ORG = "https://dev.azure.com/powerbi";

// Happy path: explicit project + repo; org defaults to the configured org.
eq("resolves with default org",
  resolveWriteTarget({ project: "Big Data", repo: "sandbox" }, { defaultOrg: ORG }),
  { org: ORG, project: "Big Data", repo: "sandbox" });

// org override is honored + normalized (https + trailing slash stripped).
eq("org override normalized",
  resolveWriteTarget({ org: "dev.azure.com/other/", project: "P", repo: "R" }, { defaultOrg: ORG }),
  { org: "https://dev.azure.com/other", project: "P", repo: "R" });

// A WRITE never guesses the repo/project.
threw("missing project throws WriteTargetError", () => resolveWriteTarget({ repo: "R" }, { defaultOrg: ORG }), "WRITE_TARGET");
threw("missing repo throws WriteTargetError", () => resolveWriteTarget({ project: "P" }, { defaultOrg: ORG }), "WRITE_TARGET");
threw("blank project throws", () => resolveWriteTarget({ project: "   ", repo: "R" }, { defaultOrg: ORG }));
threw("no org anywhere throws", () => resolveWriteTarget({ project: "P", repo: "R" }, {}));
ok("error is a WriteTargetError instance", (() => { try { resolveWriteTarget({}, { defaultOrg: ORG }); } catch (e) { return e instanceof WriteTargetError; } })());

// No silent fallback: passing only defaultOrg + nothing else must NOT invent a repo.
threw("empty coords never fall back to a default repo", () => resolveWriteTarget({}, { defaultOrg: ORG }));

// trims whitespace on project/repo
eq("trims project/repo", resolveWriteTarget({ project: " P ", repo: " R " }, { defaultOrg: ORG }), { org: ORG, project: "P", repo: "R" });

// draftKeyOf is project+repo+branch+path scoped and stable.
eq("draft key composes project/repo/branch/path", draftKeyOf({ project: "P", repo: "R", branch: "b", path: "docs/x.md" }), "P\nR\nb\ndocs/x.md");
ok("same-named repo in another project keys differently",
  draftKeyOf({ project: "P1", repo: "R", branch: "b", path: "x" }) !== draftKeyOf({ project: "P2", repo: "R", branch: "b", path: "x" }));

console.log(`ado-target: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
