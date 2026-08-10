// Version resolution for reading a PR's file content from Azure DevOps.
//
// Tippani used to fetch changed-file content by the PR's *source branch name*
// (GitVersionType.Branch). That breaks the moment the source branch is deleted
// or the PR is completed: ADO can't resolve the ref and returns
// `TF401175 GitUnresolvableToCommitException` — and, worse, streams that error
// JSON as if it were the file body. ADO retains the PR's *source commit*
// (`lastMergeSourceCommit.commitId`) even after the branch is gone, so we read
// content at that commit and fall back to the branch only when no commit exists.
//
// GitVersionType: Branch = 0, Tag = 1, Commit = 2.

/**
 * Version descriptor for reading a PR's file content. Prefers the source commit
 * (survives branch deletion / PR completion), else the source branch name.
 * @param {{ lastMergeSourceCommit?: { commitId?: string }, sourceRefName?: string }} pr
 * @returns {{ version: string, versionType: number }}
 */
export function prContentVersion(pr) {
  const commitId = pr && pr.lastMergeSourceCommit && pr.lastMergeSourceCommit.commitId;
  if (commitId) return { version: commitId, versionType: 2 };
  const branch = ((pr && pr.sourceRefName) || "").replace("refs/heads/", "");
  return { version: branch, versionType: 0 };
}

/**
 * Normalize a content-version argument that may be a bare branch string (legacy
 * call sites) OR an already-built { version, versionType } descriptor.
 * @param {string | { version: string, versionType: number }} v
 * @returns {{ version: string, versionType: number }}
 */
export function toVersionDescriptor(v) {
  if (v && typeof v === "object" && "versionType" in v) {
    return { version: v.version, versionType: v.versionType };
  }
  return { version: String(v || "").replace("refs/heads/", ""), versionType: 0 };
}

/**
 * Detect an Azure DevOps error envelope that arrived as a content stream. When a
 * version can't be resolved, `getItemContent` streams the error JSON instead of
 * throwing, so tippani would otherwise render it as the "file body". Returns the
 * ADO error message when the text is such an envelope, else null (real content).
 * @param {string} text
 * @returns {string | null}
 */
export function adoErrorInContent(text) {
  if (typeof text !== "string") return null;
  const t = text.trimStart();
  if (t[0] !== "{") return null; // real markdown virtually never starts with '{'
  let o;
  try { o = JSON.parse(t); }
  catch { return null; } // not parseable JSON → real content
  if (o && typeof o === "object" && typeof o.message === "string"
      && (typeof o.typeKey === "string" || typeof o.typeName === "string")) {
    return o.message;
  }
  return null;
}
