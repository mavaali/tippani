// Tests for the pure tool-hints module (clickstop 2, step 13).
import { NEVER_RAW_RULE, NEXT_STEP_HINTS, nextStep, echoContext, withHints } from "./tool-hints.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

// The rule exists and names the forbidden tools.
ok("rule forbids raw git", /raw git/.test(NEVER_RAW_RULE));
ok("rule forbids the ADO MCP", /Azure DevOps MCP/.test(NEVER_RAW_RULE));

// Each write tool has a next-step chain.
ok("create_branch -> stage_spec", /stage_spec/.test(nextStep("create_branch")));
ok("stage_spec -> push_spec", /push_spec/.test(nextStep("stage_spec")));
ok("push_spec -> create_spec_pr", /create_spec_pr/.test(nextStep("push_spec")));
ok("create_spec_pr -> review", /review/i.test(nextStep("create_spec_pr")));
ok("unknown tool -> null", nextStep("nope") === null);
ok("every write tool is covered", ["create_branch", "stage_spec", "push_spec", "create_spec_pr"].every((t) => typeof NEXT_STEP_HINTS[t] === "string"));

// Context echo normalises missing fields to null.
eq("echoContext fills nulls", echoContext({ repo: "R" }), { repo: "R", branch: null, path: null });
eq("echoContext empty", echoContext(), { repo: null, branch: null, path: null });

// withHints merges result + context + hint.
const r = withHints("stage_spec", { ok: true, staged: 1 }, { repo: "R", branch: "spec/x", path: "docs/spec.md" });
ok("withHints keeps the result", r.ok === true && r.staged === 1);
eq("withHints echoes context", r.context, { repo: "R", branch: "spec/x", path: "docs/spec.md" });
ok("withHints carries the next step", /push_spec/.test(r.nextStep));

console.log(`tool-hints: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
