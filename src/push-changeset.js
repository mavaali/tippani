// ADO createPush change-set builder (clickstop 2, step 8). Pure: maps a set of
// file operations to the `changes[]` an ADO push expects, so the remote authoring
// path can ADD new files (not only EDIT files already tracked in a PR). No I/O.
//
// VersionControlChangeType: Add = 1, Edit = 2.
// ItemContentType:          RawText = 0, Base64Encoded = 1 (binary, e.g. Images/).
//
// The push's `oldObjectId` is the optimistic-concurrency base — the commit the
// change set applies onto (the branch tip, or all-zeros for a brand-new ref). It
// is REQUIRED: pushing an edit onto an unknown base is how two writers clobber
// each other, so a build without it throws rather than silently racing.
export function buildPushChangeSet({ adds = [], edits = [], message = "", branchRef, oldObjectId } = {}) {
  if (!branchRef) throw new Error("buildPushChangeSet: branchRef required");
  if (!oldObjectId) throw new Error("buildPushChangeSet: oldObjectId (base) required");

  const changes = [];
  for (const a of adds) changes.push(toChange(1, a, "add"));
  for (const e of edits) changes.push(toChange(2, e, "edit"));
  if (changes.length === 0) throw new Error("buildPushChangeSet: no changes");

  return {
    refUpdates: [{ name: branchRef, oldObjectId }],
    commits: [{ comment: message, changes }],
  };
}

function toChange(changeType, f, kind) {
  if (!f || !f.path) throw new Error(`buildPushChangeSet: ${kind} requires a path`);
  const contentType = f.base64 ? 1 : 0; // Base64Encoded for binary, else RawText
  return {
    changeType,
    item: { path: f.path },
    newContent: { content: f.content == null ? "" : String(f.content), contentType },
  };
}
