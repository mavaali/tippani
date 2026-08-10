// Tests for the ADO createPush change-set builder (clickstop 2, step 8). Pure.
import { buildPushChangeSet } from "./push-changeset.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }
function threw(name, fn) { let t = false; try { fn(); } catch { t = true; } ok(name, t); }

const BASE = "abc123";
const REF = "refs/heads/spec/x";

// --- adds + edits get the right change types + content types ---
{
  const push = buildPushChangeSet({
    adds: [{ path: "/Specs/A/Foo Functional Spec.md", content: "# Foo" }],
    edits: [{ path: "/Specs/A/README.md", content: "readme" }],
    message: "author Foo",
    branchRef: REF,
    oldObjectId: BASE,
  });
  eq("refUpdates carries branch + base", push.refUpdates, [{ name: REF, oldObjectId: BASE }]);
  eq("one commit with the message", [push.commits.length, push.commits[0].comment], [1, "author Foo"]);
  const ch = push.commits[0].changes;
  eq("add -> changeType 1, RawText 0", [ch[0].changeType, ch[0].newContent.contentType], [1, 0]);
  eq("add path preserved", ch[0].item.path, "/Specs/A/Foo Functional Spec.md");
  eq("edit -> changeType 2, RawText 0", [ch[1].changeType, ch[1].newContent.contentType], [2, 0]);
}

// --- binary add -> base64 content type ---
{
  const push = buildPushChangeSet({
    adds: [{ path: "/Specs/A/Images/x.png", content: "AAAA", base64: true }],
    branchRef: REF, oldObjectId: BASE,
  });
  eq("binary add -> contentType 1 (base64)", push.commits[0].changes[0].newContent.contentType, 1);
}

// --- guards ---
threw("missing branchRef throws", () => buildPushChangeSet({ edits: [{ path: "/a.md", content: "x" }], oldObjectId: BASE }));
threw("edit without base oldObjectId throws", () => buildPushChangeSet({ edits: [{ path: "/a.md", content: "x" }], branchRef: REF }));
threw("no changes throws", () => buildPushChangeSet({ branchRef: REF, oldObjectId: BASE }));
threw("add without a path throws", () => buildPushChangeSet({ adds: [{ content: "x" }], branchRef: REF, oldObjectId: BASE }));

console.log(`push-changeset: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
