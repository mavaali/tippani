// Tests for the pure write-target resolver (clickstop 2). Pure.
import { resolveWriteTarget, draftKeyOf, WriteTargetError } from "./ado-target.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }
function threw(name, fn, code) { let e = null; try { fn(); } catch (x) { e = x; } ok(name, e && (!code || e.code === code)); }

const ORG = "https://dev.azure.com/powerbi";

// Happy path: ALL three coordinates explicit; org is normalized (https prefix).
eq("resolves with all coords explicit",
  resolveWriteTarget({ org: ORG, project: "Big Data", repo: "sandbox" }),
  { org: ORG, project: "Big Data", repo: "sandbox" });

// org is honored + normalized (https + trailing slash stripped).
eq("org normalized",
  resolveWriteTarget({ org: "dev.azure.com/other/", project: "P", repo: "R" }),
  { org: "https://dev.azure.com/other", project: "P", repo: "R" });

// A WRITE never guesses ANY coordinate — org, project, and repo are all required.
threw("missing org throws WriteTargetError", () => resolveWriteTarget({ project: "P", repo: "R" }), "WRITE_TARGET");
threw("missing project throws WriteTargetError", () => resolveWriteTarget({ org: ORG, repo: "R" }), "WRITE_TARGET");
threw("missing repo throws WriteTargetError", () => resolveWriteTarget({ org: ORG, project: "P" }), "WRITE_TARGET");
threw("blank org throws", () => resolveWriteTarget({ org: "   ", project: "P", repo: "R" }));
threw("blank project throws", () => resolveWriteTarget({ org: ORG, project: "   ", repo: "R" }));
ok("error is a WriteTargetError instance", (() => { try { resolveWriteTarget({}); } catch (e) { return e instanceof WriteTargetError; } })());

// No silent fallback: an empty coordinate set must NOT invent an org/project/repo.
threw("empty coords never fall back to any default", () => resolveWriteTarget({}));

// trims whitespace on all coordinates
eq("trims coords", resolveWriteTarget({ org: " " + ORG + " ", project: " P ", repo: " R " }), { org: ORG, project: "P", repo: "R" });

// draftKeyOf is project+repo+branch+path scoped and stable.
eq("draft key composes project/repo/branch/path", draftKeyOf({ project: "P", repo: "R", branch: "b", path: "docs/x.md" }), "P\nR\nb\ndocs/x.md");
ok("same-named repo in another project keys differently",
  draftKeyOf({ project: "P1", repo: "R", branch: "b", path: "x" }) !== draftKeyOf({ project: "P2", repo: "R", branch: "b", path: "x" }));

console.log(`ado-target: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
