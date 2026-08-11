// Tests for the review vote mapping + preconditions, plus the /api/review
// orchestrator that decides whether the vote actually gets sent.
import express from "express";
import { VOTE, voteForReviewType, voteLabel, reviewPrecheck, handleReviewRequest } from "./review-vote.js";

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
}

// ===========================================================================
// handleReviewRequest — proves the ORCHESTRATION, not just the pieces.
//
// The bug that actually shipped was structural: the old /api/review handler
// computed a vote, never called ADO, and still returned {ok:true}. A test of
// voteForReviewType and reviewPrecheck alone — both correct in isolation —
// would not have caught that; the handler could pass both checks and still
// silently skip the call. These tests use a spy in place of the real ADO call
// so a regression back to "compute and discard" fails loudly: the spy simply
// won't have been invoked.
// ===========================================================================

function spy(impl) {
  const fn = async (...args) => { fn.calls.push(args); return impl ? impl(...args) : undefined; };
  fn.calls = [];
  return fn;
}
const noopFormatError = (e) => `formatted: ${e.message}`;

try {
  // Unknown type -> 400, and the vote is never attempted.
  {
    const submitVote = spy();
    const r = await handleReviewRequest({ type: "lgtm", isOffline: false, hasConn: true, prId: 12, submitVote, formatError: noopFormatError });
    check("handleReviewRequest: unknown type -> 400", r.status === 400 && r.body.ok === false && r.body.code === "bad-type");
    check("handleReviewRequest: unknown type never calls submitVote", submitVote.calls.length === 0);
  }

  // Offline -> 409, and the vote is never attempted (votes are never queued).
  {
    const submitVote = spy();
    const r = await handleReviewRequest({ type: "approve", isOffline: true, hasConn: true, prId: 12, submitVote, formatError: noopFormatError });
    check("handleReviewRequest: offline -> 409", r.status === 409 && r.body.code === "offline");
    check("handleReviewRequest: offline never calls submitVote", submitVote.calls.length === 0);
  }

  // No connection -> 409, never attempted.
  {
    const submitVote = spy();
    const r = await handleReviewRequest({ type: "approve", isOffline: false, hasConn: false, prId: 12, submitVote, formatError: noopFormatError });
    check("handleReviewRequest: no connection -> 409", r.status === 409 && r.body.code === "no-connection");
    check("handleReviewRequest: no-connection never calls submitVote", submitVote.calls.length === 0);
  }

  // No PR -> 409, never attempted.
  {
    const submitVote = spy();
    const r = await handleReviewRequest({ type: "approve", isOffline: false, hasConn: true, prId: 0, submitVote, formatError: noopFormatError });
    check("handleReviewRequest: no PR -> 409", r.status === 409 && r.body.code === "no-pr");
    check("handleReviewRequest: no-pr never calls submitVote", submitVote.calls.length === 0);
  }

  // The success path: this is the actual regression test. Prove submitVote
  // IS called, exactly once, with the resolved (conn, prId, vote) — not just
  // that the response looks right.
  {
    const fakeConn = { marker: "fake-conn" };
    const submitVote = spy();
    const r = await handleReviewRequest({ type: "approve", isOffline: false, hasConn: true, prId: 42, conn: fakeConn, submitVote, formatError: noopFormatError });
    check("handleReviewRequest: approve -> 200", r.status === 200 && r.body.ok === true && r.body.vote === 10);
    check("handleReviewRequest: approve -> message 'Approved'", r.body.message === "Approved");
    check("handleReviewRequest: approve DOES call submitVote exactly once", submitVote.calls.length === 1);
    check("handleReviewRequest: submitVote called with (conn, prId, vote)",
      submitVote.calls[0][0] === fakeConn && submitVote.calls[0][1] === 42 && submitVote.calls[0][2] === 10);
  }

  // request-changes maps to -5 through the whole orchestrator, and the spy
  // proves it's the value actually sent, not just the value in the response.
  {
    const submitVote = spy();
    const r = await handleReviewRequest({ type: "request-changes", isOffline: false, hasConn: true, prId: 7, conn: {}, submitVote, formatError: noopFormatError });
    check("handleReviewRequest: request-changes sends -5, not -10", r.body.vote === -5 && submitVote.calls[0][2] === -5);
  }

  // ADO throwing -> 502, ok:false, and the thrown error is what gets formatted.
  {
    const boom = new Error("network down");
    const submitVote = spy(() => { throw boom; });
    const r = await handleReviewRequest({ type: "approve", isOffline: false, hasConn: true, prId: 5, conn: {}, submitVote, formatError: noopFormatError });
    check("handleReviewRequest: ADO throw -> 502", r.status === 502 && r.body.ok === false && r.body.code === "ado-error");
    check("handleReviewRequest: formats the actual thrown error", r.body.error === "formatted: network down");
  }
} catch (e) {
  fail++;
  console.error("  FAIL: handleReviewRequest threw " + e.message);
}

// ===========================================================================
// HTTP-level integration test — mounts /api/review exactly the way index.js
// wires it (adapter calls handleReviewRequest, maps {status,body} to the
// response) and exercises it over a real socket via fetch. This is the
// "route integration test" proving the wiring itself — not just the function
// in isolation — actually invokes the backend on the way to a 200.
// ===========================================================================

{
  const app = express();
  app.use(express.json());

  let _isOffline = false, _hasConn = true, _prId = 99;
  const submitVoteSpy = spy();

  app.post("/api/review", async (req, res) => {
    const { status, body } = await handleReviewRequest({
      type: req.body && req.body.type,
      isOffline: _isOffline,
      hasConn: _hasConn,
      prId: _prId,
      conn: { marker: "http-fake-conn" },
      submitVote: submitVoteSpy,
      formatError: noopFormatError,
    });
    res.status(status).json(body);
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    // Success over real HTTP: the spy must have been invoked by the route,
    // not just by a unit test calling the function directly.
    {
      const res = await fetch(`${base}/api/review`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "approve" }),
      });
      const json = await res.json();
      check("HTTP /api/review approve -> 200", res.status === 200 && json.ok === true && json.vote === 10);
      check("HTTP /api/review approve -> backend actually invoked", submitVoteSpy.calls.length === 1 && submitVoteSpy.calls[0][2] === 10);
    }

    // Bad type over real HTTP -> 400, and no additional call was made.
    {
      const before = submitVoteSpy.calls.length;
      const res = await fetch(`${base}/api/review`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "not-a-real-type" }),
      });
      const json = await res.json();
      check("HTTP /api/review bad type -> 400", res.status === 400 && json.ok === false);
      check("HTTP /api/review bad type -> backend NOT invoked", submitVoteSpy.calls.length === before);
    }

    // Flip to offline -> 409 over real HTTP, backend not invoked.
    {
      _isOffline = true;
      const before = submitVoteSpy.calls.length;
      const res = await fetch(`${base}/api/review`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "approve" }),
      });
      const json = await res.json();
      check("HTTP /api/review offline -> 409", res.status === 409 && json.code === "offline");
      check("HTTP /api/review offline -> backend NOT invoked", submitVoteSpy.calls.length === before);
      _isOffline = false;
    }
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

console.log(`\nreview-vote.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;

