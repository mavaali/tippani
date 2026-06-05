// Decide whether the Edit affordance should be offered (#47/#48 deferred the real
// check). A completed/abandoned PR is never editable. Offline editing IS allowed —
// per #48, offline edits queue and sync on reconnect, where push access is reconciled
// (a real rejection then surfaces at save time). Online, push access is gated up front:
// unauthenticated can't push, otherwise the ADO GenericContribute probe decides.
// `probe` is the ADO answer — true|false definitive, null/undefined when the probe was
// skipped or errored (fail open). Pure + unit-tested (canedit.test.mjs); the async probe
// lives in index.js.
export function decideCanEdit({ isOffline, hasConn, prStatus, probe }) {
  if (prStatus !== 1) return false; // only an active PR is editable
  if (isOffline) return true; // offline edits queue and sync on reconnect (#48)
  if (!hasConn) return false; // online but unauthenticated => can't push
  if (probe === false) return false; // definitive deny from ADO
  return true; // probe true OR indeterminate => fail open
}
