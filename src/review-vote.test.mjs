// Tests for the review vote mapping + preconditions.
import { VOTE, voteForReviewType, voteLabel, reviewPrecheck } from "./review-vote.js";

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }

try {
  // --- voteForReviewType ---------------------------------------------------
  check("approve -> 10", voteForReviewType("approve") === 10);
  check("request-changes -> -5", voteForReviewType("request-changes") === -5);
  check("reject -> -10", voteForReviewType("reject") === -10);
  check("reset -> 0", voteForReviewType("reset") === 0);
  check("approve-with-suggestions -> 5", voteForReviewType("approve-with-suggestions") === 5);

  check("case insensitive", voteForReviewType("APPROVE") === 10);
  check("trims whitespace", voteForReviewType("  approve  ") === 10);

  // The old code did `type === "approve" ? 10 : -5`, so ANY unknown string
  // silently became a -5. An unknown type must now be rejected, not voted.
  check("unknown type -> null", voteForReviewType("lgtm") === null);
  check("empty string -> null", voteForReviewType("") === null);
  check("null -> null", voteForReviewType(null) === null);
  check("undefined -> null", voteForReviewType(undefined) === null);
  check("object -> null", voteForReviewType({}) === null);

  // reset maps to 0, which is falsy — callers must compare against null, not
  // truthiness. This test pins that 0 is a real, returnable vote.
  check("reset is 0 not null", voteForReviewType("reset") !== null);

  // prototype keys must not leak through as valid types
  check("constructor -> null", voteForReviewType("constructor") === null);
  check("toString -> null", voteForReviewType("toString") === null);

  // --- voteLabel -----------------------------------------------------------
  check("label approve", voteLabel(VOTE.approve) === "Approved");
  check("label request changes", voteLabel(VOTE.requestChanges) === "Changes requested");
  check("label reject", voteLabel(VOTE.reject) === "Rejected");
  check("label reset", voteLabel(VOTE.reset) === "Vote cleared");
  check("label suggestions", voteLabel(VOTE.approveWithSuggestions) === "Approved with suggestions");
  check("label unknown -> empty", voteLabel(99) === "" && voteLabel(undefined) === "");

  // --- reviewPrecheck ------------------------------------------------------
  check("ok when online + conn + pr", reviewPrecheck({ isOffline: false, hasConn: true, prId: 12 }).ok === true);

  const off = reviewPrecheck({ isOffline: true, hasConn: true, prId: 12 });
  check("offline blocked", off.ok === false && off.code === "offline");
  check("offline error mentions not queued", /not queued/i.test(off.error));

  const noConn = reviewPrecheck({ isOffline: false, hasConn: false, prId: 12 });
  check("no connection blocked", noConn.ok === false && noConn.code === "no-connection");

  // browse mode parks _prId at 0 — voting has no target there
  const noPr = reviewPrecheck({ isOffline: false, hasConn: true, prId: 0 });
  check("no pr blocked", noPr.ok === false && noPr.code === "no-pr");

  check("empty args blocked", reviewPrecheck().ok === false);
  check("offline wins over missing conn", reviewPrecheck({ isOffline: true, hasConn: false, prId: 0 }).code === "offline");
} catch (e) {
  fail++;
  console.error("  FAIL: threw " + e.message);
} finally {
  console.log(`\nreview-vote.test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
