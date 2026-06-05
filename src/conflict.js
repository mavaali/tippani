// Detect an optimistic-concurrency failure from an ADO push (#49). When a save
// pushes with a stale oldObjectId because the branch moved underneath the editor,
// ADO rejects it; we surface that as a conflict (reload / copy) rather than a
// generic error, and never blindly overwrite. Pure + unit-tested (conflict.test.mjs).
export function isConflict(err) {
  if (!err) return false;
  const status = err.statusCode || err.status;
  if (status === 409) return true;
  const msg = err.message || String(err);
  return /TF401028|has already been updated|non-fast-forward|cannot be fast-forwarded|stale|updated by another/i.test(
    msg
  );
}
