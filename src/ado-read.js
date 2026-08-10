// ADO read helpers for Discovery's read-only spec view. Extracted from index.js
// because — unlike the rest of the ADO layer — these take the repo explicitly
// (a repo GUID from a Code Search hit is globally unique, so no ADO_REPO/PROJECT
// module state is needed). Being decoupled, they are unit-testable in isolation.
// getFileReviewHistory is intentionally NOT here: it couples to the markdown
// renderer and is only covered by the live smokes, so it stays in index.js.

import { createAdoRepoContentProvider } from "./ado-repo-content-provider.js";

const providers = new WeakMap();
function repoContent(conn) {
  let provider = providers.get(conn);
  if (!provider) {
    provider = createAdoRepoContentProvider(conn);
    providers.set(conn, provider);
  }
  return provider;
}

// Read a spec's markdown from an ARBITRARY Git repo at a fixed branch (Discovery
// spec search opens results read-only off main). Unlike getFileContent, the repo
// is passed explicitly (a repo GUID from the Code Search hit), not the configured
// ADO_REPO — a repo GUID is globally unique so the project arg is left undefined.
export async function getSpecContentAt(conn, repoId, filePath, branch = "main") {
  return repoContent(conn).getText(repoId, filePath, branch);
}

// Fetch an embedded image from an arbitrary Git repo at a fixed branch (the
// read-only spec view's image proxy). Same shape as getImageBlob but repo-scoped
// by GUID and branch — download=true (raw bytes), resolveLfs=true (real blob).
export async function getSpecBlobAt(conn, repoId, filePath, branch = "main") {
  const gitApi = await conn.getGitApi();
  const item = await gitApi.getItemContent(
    repoId, filePath, undefined,
    undefined, undefined, undefined, undefined,
    true,                                     // download — raw bytes
    { version: branch, versionType: 0 },
    undefined,
    true                                      // resolveLfs — real blob, not pointer
  );
  const chunks = [];
  for await (const chunk of item) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

// Build the ADO web URL for a spec file so a result can open in Azure DevOps.
export function buildSpecWebUrl(org, project, repoName, filePath) {
  const base = String(org || "").replace(/\/+$/, "");
  const p = filePath.startsWith("/") ? filePath : "/" + filePath;
  return `${base}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repoName)}?path=${encodeURIComponent(p)}`;
}

// Who last changed a file: the author of its most recent commit on `branch`.
// Code Search doesn't return this, so the Discovery spec results enrich each hit
// with one top-1 commit lookup. Best-effort — returns "" on any failure so a
// single unreachable repo never fails the whole result set.
export async function getLastCommitAuthor(conn, repoId, filePath, branch = "main") {
  return repoContent(conn).getLastCommitAuthor(repoId, filePath, branch);
}
