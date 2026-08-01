import { planStagedPushes } from "./staged-push-plan.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, actual, expected) { ok(name + ` (got ${JSON.stringify(actual)})`, JSON.stringify(actual) === JSON.stringify(expected)); }

const target = { org: "https://dev.azure.com/example", project: "P", repo: "R", branch: "spec/x" };

{
  const [group] = planStagedPushes({
    branches: [{ ...target, base: "main" }],
    files: [
      { ...target, path: "Specs/New.md", content: "new" },
      { ...target, path: "/README.md", content: "edited", existing: true, baseObjectId: "abc" },
    ],
    folders: [{ ...target, path: "Specs" }, { ...target, path: "Images" }],
    prs: [{ ...target, title: "Review spec", sourceBranch: "spec/x", targetBranch: "main" }],
  });
  eq("one target becomes one push group", [group.org, group.project, group.repo, group.branch], [target.org, "P", "R", "spec/x"]);
  eq("new files and empty folders are adds", group.adds, [
    { path: "/Specs/New.md", content: "new" },
    { path: "/Images/.gitkeep", content: "" },
  ]);
  eq("existing files are edits", group.edits, [{ path: "/README.md", content: "edited" }]);
  eq("edit base retained", group.expectedOldObjectId, "abc");
  eq("PR intent joins its branch group", group.prs.map((pr) => pr.title), ["Review spec"]);
  eq("valid group has no errors", group.errors, []);
}

{
  const [group] = planStagedPushes({ prs: [
    { ...target, title: "One" },
    { ...target, title: "Two" },
  ] });
  ok("multiple PR intents reject the group", group.errors.some((error) => /only one staged PR/.test(error)));
}

{
  const groups = planStagedPushes({ branches: [
    { ...target, branch: "a" },
    { ...target, branch: "b" },
  ] });
  eq("separate branches become separate groups", groups.map((group) => group.branch), ["a", "b"]);
}

{
  const [group] = planStagedPushes({
    files: [
      { ...target, path: "a.md", existing: true, baseObjectId: "one" },
      { ...target, path: "b.md", existing: true, baseObjectId: "two" },
    ],
  });
  ok("different edit bases reject the group", group.errors.some((error) => /different branch tips/.test(error)));
}

{
  const [group] = planStagedPushes({ folders: [
    { ...target, path: "Specs" },
    { ...target, path: "Specs/Feature" },
  ] });
  eq("only an empty leaf folder needs a marker", group.adds, [{ path: "/Specs/Feature/.gitkeep", content: "" }]);
}

console.log(`staged-push-plan: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);