// Review vote mapping + preconditions for the Approve / Request changes bar.
// Pure — no ADO calls, so the mapping and the guards are testable without a
// connection. The transport lives in index.js (`submitReviewVote`).
//
// ADO vote scale (GitInterfaces.IdentityRefWithVote.vote):
//   10 approved | 5 approved with suggestions | 0 no vote
//   -5 waiting for author | -10 rejected
// "Request changes" maps to -5 (waiting for author), not -10 (rejected):
// tippani's bottom bar is a routine spec-review action, and -10 in ADO is the
// hard block. Matches the button's own wording.

export const VOTE = {
  approve: 10,
  approveWithSuggestions: 5,
  reset: 0,
  requestChanges: -5,
  reject: -10,
};

const BY_TYPE = {
  approve: VOTE.approve,
  "approve-with-suggestions": VOTE.approveWithSuggestions,
  "request-changes": VOTE.requestChanges,
  reject: VOTE.reject,
  reset: VOTE.reset,
};

// Map a review button type to an ADO vote. Returns null for an unknown type so
// the caller can 400 instead of silently voting.
export function voteForReviewType(type) {
  if (type === null || type === undefined) return null;
  const key = String(type).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(BY_TYPE, key) ? BY_TYPE[key] : null;
}

export function voteLabel(vote) {
  switch (vote) {
    case VOTE.approve: return "Approved";
    case VOTE.approveWithSuggestions: return "Approved with suggestions";
    case VOTE.reset: return "Vote cleared";
    case VOTE.requestChanges: return "Changes requested";
    case VOTE.reject: return "Rejected";
    default: return "";
  }
}

// Guard the preconditions a vote needs. Voting is a WRITE to ADO, so unlike a
// comment it is never queued offline — a stale vote posted later could approve
// a PR whose content has since changed.
export function reviewPrecheck({ isOffline = false, hasConn = false, prId = 0 } = {}) {
  if (isOffline) return { ok: false, code: "offline", error: "Can't submit a review offline — votes are not queued. Reconnect and try again." };
  if (!hasConn) return { ok: false, code: "no-connection", error: "Not connected to Azure DevOps." };
  if (!prId) return { ok: false, code: "no-pr", error: "No pull request is open." };
  return { ok: true };
}

// Orchestrates the /api/review request end to end: validate the type, guard
// the preconditions, and — only if both pass — actually invoke the vote.
//
// This exists as its own function (not left inline in the Express handler)
// specifically because the shipped bug in this route was structural: the old
// handler computed a vote and returned {ok:true} WITHOUT ever calling ADO.
// A test against voteForReviewType/reviewPrecheck alone cannot catch that
// class of bug — both would still report correctly while the handler quietly
// skips the call. Testing this function with a spy `submitVote` proves the
// call actually happens, with the right (conn, prId, vote) arguments, and
// only on the success path.
//
// `submitVote(conn, prId, vote)` and `formatError(err, context)` are injected
// rather than imported so this stays ADO-agnostic and unit-testable without a
// real connection; index.js passes the real `submitReviewVote` /
// `friendlyAdoError`, tests pass fakes.
export async function handleReviewRequest({ type, isOffline, hasConn, prId, conn, submitVote, formatError } = {}) {
  const vote = voteForReviewType(type);
  if (vote === null) {
    return { status: 400, body: { ok: false, code: "bad-type", error: "Unknown review type." } };
  }
  const pre = reviewPrecheck({ isOffline, hasConn, prId });
  if (!pre.ok) {
    return { status: 409, body: { ok: false, code: pre.code, error: pre.error } };
  }
  try {
    await submitVote(conn, prId, vote);
    return { status: 200, body: { ok: true, vote, message: voteLabel(vote) } };
  } catch (e) {
    return { status: 502, body: { ok: false, code: "ado-error", error: formatError(e, "submit review") } };
  }
}
