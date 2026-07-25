// Tests for the Personal Comments store helpers (pure list operations).
import { newComment, addComment, updateComment, removeComment, findComment, sortComments, setResolved, addReply, navTargetId } from "./personal-comments.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

// --- newComment --------------------------------------------------------------
const c1 = newComment({ id: "a", line: 12, author: "Kay", content: "hi", now: "2026-01-01T00:00:00Z" });
eq("newComment shape", c1, { id: "a", line: 12, author: "Kay", content: "hi", resolved: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", replies: [] });
eq("newComment null line", newComment({ id: "b", line: null, author: "", content: "", now: "t" }).line, null);
eq("newComment coerces line", newComment({ id: "c", line: "7", author: "", content: "", now: "t" }).line, 7);

// --- addComment --------------------------------------------------------------
const l1 = addComment([], c1);
eq("addComment appends", l1.length, 1);
eq("addComment immutable", [].length, 0);

// --- updateComment -----------------------------------------------------------
const l2 = updateComment(l1, "a", "edited", "2026-02-02T00:00:00Z");
eq("updateComment content", findComment(l2, "a").content, "edited");
eq("updateComment bumps updatedAt", findComment(l2, "a").updatedAt, "2026-02-02T00:00:00Z");
eq("updateComment keeps createdAt", findComment(l2, "a").createdAt, "2026-01-01T00:00:00Z");
eq("updateComment unknown id -> unchanged", updateComment(l1, "zzz", "x", "t"), l1);

// --- removeComment -----------------------------------------------------------
eq("removeComment drops it", removeComment(l1, "a"), []);
eq("removeComment unknown -> unchanged", removeComment(l1, "zzz").length, 1);

// --- setResolved -------------------------------------------------------------
const l3 = setResolved(l1, "a", true, "2026-03-03T00:00:00Z");
eq("setResolved flips flag", findComment(l3, "a").resolved, true);
eq("setResolved bumps updatedAt", findComment(l3, "a").updatedAt, "2026-03-03T00:00:00Z");
eq("setResolved back to false", setResolved(l3, "a", false, "t").find((c) => c.id === "a").resolved, false);
eq("setResolved unknown -> unchanged", setResolved(l1, "zzz", true, "t"), l1);

// --- findComment -------------------------------------------------------------
ok("findComment hit", findComment(l1, "a") != null);
ok("findComment miss -> null", findComment(l1, "nope") === null);

// --- addReply ----------------------------------------------------------------
const lr = addReply(l1, "a", { author: "Assistant", content: "Addressed: added target user.", now: "2026-04-04T00:00:00Z" });
eq("addReply appends a reply", findComment(lr, "a").replies, [{ author: "Assistant", content: "Addressed: added target user.", createdAt: "2026-04-04T00:00:00Z" }]);
eq("addReply bumps updatedAt", findComment(lr, "a").updatedAt, "2026-04-04T00:00:00Z");
eq("addReply keeps createdAt", findComment(lr, "a").createdAt, "2026-01-01T00:00:00Z");
eq("addReply trims + keeps original list immutable", findComment(l1, "a").replies, []);
eq("addReply empty content -> unchanged", addReply(l1, "a", { author: "x", content: "   " }), l1);
eq("addReply unknown id -> unchanged", addReply(l1, "zzz", { author: "x", content: "y" }), l1);
const lr2 = addReply(lr, "a", { author: "You", content: "second", now: "2026-05-05T00:00:00Z" });
eq("addReply appends in order", findComment(lr2, "a").replies.map((r) => r.content), ["Addressed: added target user.", "second"]);

// --- sortComments ------------------------------------------------------------
const unsorted = [
  { id: "3", line: null, createdAt: "2026-01-01" },
  { id: "1", line: 5, createdAt: "2026-01-02" },
  { id: "2", line: 5, createdAt: "2026-01-01" },
  { id: "0", line: 2, createdAt: "2026-01-09" },
];
eq("sort by line then createdAt (unanchored last)",
  sortComments(unsorted).map((c) => c.id), ["0", "2", "1", "3"]);
eq("sort null -> []", sortComments(null), []);

// --- navTargetId -------------------------------------------------------------
const nav = [{ id: "a" }, { id: "b" }, { id: "c" }];
eq("nav next from a -> b", navTargetId(nav, "a", "next"), "b");
eq("nav next wraps c -> a", navTargetId(nav, "c", "next"), "a");
eq("nav prev from b -> a", navTargetId(nav, "b", "prev"), "a");
eq("nav prev wraps a -> c", navTargetId(nav, "a", "prev"), "c");
eq("nav first", navTargetId(nav, "b", "first"), "a");
eq("nav last", navTargetId(nav, "b", "last"), "c");
eq("nav next with no current -> first", navTargetId(nav, null, "next"), "a");
eq("nav prev with no current -> last", navTargetId(nav, null, "prev"), "c");
eq("nav empty -> null", navTargetId([], "a", "next"), null);

console.log(`personal-comments: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
