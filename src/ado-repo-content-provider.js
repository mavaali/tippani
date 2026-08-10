// Azure DevOps implementation of RepoContentProvider from
// docs/plans/2026-08-09-provider-contract-v2.md.
//
// This capability owns repository/branch/content operations that are not tied
// to a pull request: repository resolution/listing, branch refs, arbitrary text
// reads, item/folder listing, commit history, branch diffs, branch creation,
// and atomic multi-file pushes.
//
// Blob/LFS reads stay in BlobProvider (next slice). PR-bound single-file commit
// stays available on ReviewProvider because its optimistic-concurrency contract
// is part of the review/editor flow; both capabilities may use the same ADO
// createPush primitive without pretending they're the same product operation.

import { adoCall } from "./ado-call.js";
import { buildCreateBranchRef, normalizeBranchRef } from "./ado-refs.js";
import { buildPushChangeSet } from "./push-changeset.js";

async function readStream(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function createAdoRepoContentProvider(conn) {
  if (!conn) throw new Error("ADO repo-content provider requires a connection");

  let cachedGitApi = null;
  let cachedCoreApi = null;
  async function getGitApi() {
    if (cachedGitApi) return cachedGitApi;
    // Cache only a successful acquisition. A transient getGitApi rejection
    // must remain retryable on the next request rather than poisoning this
    // provider instance forever.
    const api = await conn.getGitApi();
    cachedGitApi = api;
    return api;
  }
  async function getCoreApi() {
    if (cachedCoreApi) return cachedCoreApi;
    const api = await conn.getCoreApi();
    cachedCoreApi = api;
    return api;
  }

  async function listProjects() {
    const coreApi = await getCoreApi();
    return (await coreApi.getProjects()) || [];
  }

  async function resolveRepository(repoRef, project) {
    const gitApi = await getGitApi();
    return adoCall(
      () => gitApi.getRepository(repoRef, project),
      { label: "getRepository" },
    );
  }

  async function listRepositories(project) {
    const gitApi = await getGitApi();
    return (await gitApi.getRepositories(project)) || [];
  }

  async function listBranches(repoId, project, {
    filter,
    includeLinks = false,
    includeStatuses = false,
    includeMyBranches = false,
  } = {}) {
    const gitApi = await getGitApi();
    return adoCall(
      () => gitApi.getRefs(
        repoId,
        project,
        filter,
        includeLinks,
        includeStatuses,
        includeMyBranches,
      ),
      { label: "getRefs" },
    );
  }

  async function getBranchTip(repoId, project, branchRef) {
    const refName = normalizeBranchRef(branchRef);
    const shortBranch = refName.replace("refs/heads/", "");
    const refs = await listBranches(repoId, project, {
      filter: `heads/${shortBranch}`,
    });
    const ref = (refs || []).find((r) => r.name === refName);
    if (!ref) throw new Error(`Branch ref not found: ${refName}`);
    return ref.objectId;
  }

  async function createBranch(repoId, project, {
    branch,
    baseTip,
  } = {}) {
    const gitApi = await getGitApi();
    const refUpdate = buildCreateBranchRef({ branch, baseTip });
    const result = await adoCall(
      () => gitApi.updateRefs([refUpdate], repoId, project),
      { label: "updateRefs" },
    );
    const update = Array.isArray(result) ? result[0] : result;
    if (update?.success === false) {
      throw new Error(
        "create branch rejected: " + (update.updateStatus || "unknown"),
      );
    }
    return {
      branchRef: normalizeBranchRef(branch),
      objectId: baseTip,
      update,
    };
  }

  // Arbitrary repository text read (Discovery/local branch review), unlike
  // ReviewProvider.getFileContent which uses the current PR review context.
  async function getText(repoId, filePath, branch = "main", project) {
    const gitApi = await getGitApi();
    const item = await gitApi.getItemContent(
      repoId,
      filePath,
      project,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { version: branch, versionType: 0 },
    );
    return (await readStream(item)).toString("utf-8");
  }

  // Raw item listing. Folder projection, staged-folder merging, and hasChildren
  // UI shaping remain above the provider line in index.js.
  async function listItems(repoId, project, {
    scopePath = "/",
    branch = "main",
    recursionLevel = 1,
  } = {}) {
    const gitApi = await getGitApi();
    return (
      await gitApi.getItems(
        repoId,
        project,
        scopePath,
        recursionLevel,
        false,
        false,
        false,
        false,
        { version: branch, versionType: 0 },
      )
    ) || [];
  }

  async function getFileCommits(
    repoId,
    filePath,
    branch = "main",
    top = 10,
    project,
  ) {
    const gitApi = await getGitApi();
    return (
      await gitApi.getCommits(
        repoId,
        {
          itemPath: filePath,
          itemVersion: { version: branch, versionType: 0 },
        },
        project,
        0,
        top,
      )
    ) || [];
  }

  async function getLastCommitAuthor(
    repoId,
    filePath,
    branch = "main",
    project,
  ) {
    try {
      const commits = await getFileCommits(
        repoId, filePath, branch, 1, project,
      );
      const commit = commits[0];
      return (
        commit?.author?.name ||
        commit?.committer?.name ||
        ""
      );
    } catch {
      return "";
    }
  }

  async function diffBranches(
    repoId,
    project,
    { base, target, top = 2000 } = {},
  ) {
    const gitApi = await getGitApi();
    return gitApi.getCommitDiffs(
      repoId,
      project,
      true,
      top,
      0,
      { version: base, versionType: 0 },
      { version: target, versionType: 0 },
    );
  }

  // Atomic multi-file push. ADO's createPush accepts one commit carrying an
  // array of add/edit changes, preserving clickstop-2's "one publication
  // boundary" promise.
  async function pushFiles(
    repoId,
    project,
    {
      branchRef,
      oldObjectId,
      adds = [],
      edits = [],
      message,
      label = "createPush",
    } = {},
  ) {
    const gitApi = await getGitApi();
    const push = buildPushChangeSet({
      adds,
      edits,
      message,
      branchRef,
      oldObjectId,
    });
    const result = await adoCall(
      () => gitApi.createPush(push, repoId, project),
      { label },
    );
    return {
      commitId:
        result?.commits?.[0]?.commitId ||
        result?.refUpdates?.[0]?.newObjectId ||
        null,
      result,
    };
  }

  return {
    listProjects,
    resolveRepository,
    listRepositories,
    listBranches,
    getBranchTip,
    createBranch,
    getText,
    listItems,
    getFileCommits,
    getLastCommitAuthor,
    diffBranches,
    pushFiles,
  };
}
