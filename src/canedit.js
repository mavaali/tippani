// Decide whether the Edit affordance should be offered (#47/#48 deferred the real
// check). Gating push access proactively: offline or unauthenticated can't push;
// completed/abandoned PRs aren't editable; otherwise the ADO GenericContribute probe
// decides. `probe` is the ADO answer — true|false definitive, null/undefined when the
// probe was skipped or errored (fail open, since the save path surfaces real rejection).
// Pure + unit-tested (canedit.test.mjs); the async probe lives in index.js.
export function decideCanEdit({ isOffline, hasConn, prStatus, probe }) {
  if (isOffline || !hasConn) return false; // can't push
  if (prStatus !== 1) return false; // 1 = active; completed (2) / abandoned (3) => no edit
  if (probe === false) return false; // definitive deny from ADO
  return true; // probe true OR indeterminate => fail open
}
