// Azure DevOps implementation of the ReviewProvider capability from
// docs/plans/2026-08-09-provider-contract-v2.md.
//
// One provider instance is bound to one ADO WebApi connection. The repo/project
// defaults are getters rather than captured strings because index.js re-points
// its review context after getPullRequestById reveals the PR's authoritative
// repository. Authoring may also create a provider against a different
// connection and pass explicit repo/project overrides to getBranchTip.
//
// This module owns ADO transport and response mapping only. Markdown rendering,
// caching, route state, and UI behavior stay above the provider line.

import { adoCall } from "./ado-call.js";
import { extOf } from "./config-util.js";
import { buildPushChangeSet } from "./push-changeset.js";
import { adoErrorInContent, toVersionDescriptor } from "./pr-version.js";
import { parseViewedMap } from "./viewed-map.js";

const VIEWED_PR_PROP = "tippani.viewed";

async function readStream(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function normPath(p) {
  let s = String(p || "").replace(/\\/g, "/");
  if (!s.startsWith("/")) s = "/" + s;
  return s.toLowerCase();
}

export function createAdoReviewProvider(conn, {
  getRepo = () => null,
  getProject = () => null,
  logger = console,
} = {}) {
  if (!conn) throw new Error("ADO review provider requires a connection");

  const repo = (override) => override ?? getRepo();
  const project = (override) => override ?? getProject();

  async function getGitApi() {
    return conn.getGitApi();
  }

  async function getPullRequest(prId) {
    const gitApi = await getGitApi();
    return gitApi.getPullRequestById(prId);
  }

  async function listPullRequests(criteria, top = 50) {
    const gitApi = await getGitApi();
    const prs = await gitApi.getPullRequestsByProject(
      project(), criteria, undefined, undefined, top,
    );
    return prs || [];
  }

  async function getFileContent(filePath, ver, options = {}) {
    const gitApi = await getGitApi();
    const item = await gitApi.getItemContent(
      repo(options.repo),
      filePath,
      project(options.project),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      toVersionDescriptor(ver),
    );
    const text = (await readStream(item)).toString("utf-8");
    // ADO can stream its JSON error envelope as the apparent file body when a
    // version is unresolvable. Never let callers cache or render that envelope.
    const adoErr = adoErrorInContent(text);
    if (adoErr) throw new Error(adoErr);
    return text;
  }

  async function listChangedFiles(prId, options = {}) {
    const gitApi = await getGitApi();
    const targetRepo = repo(options.repo);
    const targetProject = project(options.project);
    const iterations = await gitApi.getPullRequestIterations(
      targetRepo, prId, targetProject,
    );
    if (!iterations || iterations.length === 0) {
      return { mdFiles: [], otherFiles: [] };
    }
    const lastIteration = iterations[iterations.length - 1];
    const changes = await gitApi.getPullRequestIterationChanges(
      targetRepo, prId, lastIteration.id, targetProject,
    );
    const entries = (changes.changeEntries || []).filter(
      (c) => c.item?.path && !c.item.isFolder && c.changeType !== 16,
    );
    return {
      mdFiles: entries
        .filter((c) => c.item.path.toLowerCase().endsWith(".md"))
        .map((c) => ({ path: c.item.path, changeType: c.changeType })),
      otherFiles: entries
        .filter((c) => !c.item.path.toLowerCase().endsWith(".md"))
        .map((c) => ({ path: c.item.path, ext: extOf(c.item.path) })),
    };
  }

  async function listThreads(prId, options = {}) {
    const gitApi = await getGitApi();
    return gitApi.getThreads(
      repo(options.repo), prId, project(options.project),
    );
  }

  async function createComment(prId, {
    filePath, line, body,
  }, options = {}) {
    const gitApi = await getGitApi();
    const thread = {
      comments: [{ content: body, commentType: 1 }],
      status: 1,
      threadContext: {
        filePath,
        rightFileStart: { line, offset: 1 },
        rightFileEnd: { line, offset: 1 },
      },
    };
    return gitApi.createThread(
      thread, repo(options.repo), prId, project(options.project),
    );
  }

  async function replyToThread(prId, threadId, body, options = {}) {
    const gitApi = await getGitApi();
    return gitApi.createComment(
      { content: body, commentType: 1 },
      repo(options.repo),
      prId,
      threadId,
      project(options.project),
    );
  }

  async function resolveThread(prId, threadId, options = {}) {
    const gitApi = await getGitApi();
    return gitApi.updateThread(
      { status: 2 },
      repo(options.repo),
      prId,
      threadId,
      project(options.project),
    );
  }

  async function submitReview(prId, vote, options = {}) {
    const cd = await conn.connect();
    const reviewerId = cd?.authenticatedUser?.id;
    if (!reviewerId) {
      throw new Error(
        "Could not resolve your Azure DevOps identity, so the vote was not recorded.",
      );
    }
    const gitApi = await getGitApi();
    return gitApi.createPullRequestReviewer(
      { vote },
      repo(options.repo),
      prId,
      reviewerId,
      project(options.project),
    );
  }

  // Strict read. Throws on corrupt/transient reads so callers doing
  // read-modify-write never overwrite good markers with an accidental {}.
  async function readViewed(prId, options = {}) {
    const gitApi = await getGitApi();
    const props = await gitApi.getPullRequestProperties(
      repo(options.repo), prId, project(options.project),
    );
    const raw =
      props?.value?.[VIEWED_PR_PROP]?.$value ??
      props?.[VIEWED_PR_PROP]?.$value ??
      null;
    return parseViewedMap(raw);
  }

  // Lenient display-only read. Never use this result for a write.
  async function getViewed(prId, options = {}) {
    try {
      return await readViewed(prId, options);
    } catch {
      return {};
    }
  }

  async function setViewed(prId, map, options = {}) {
    const gitApi = await getGitApi();
    const patch = [{
      op: "add",
      path: "/" + VIEWED_PR_PROP,
      value: JSON.stringify(map),
    }];
    return gitApi.updatePullRequestProperties(
      { "Content-Type": "application/json-patch+json" },
      patch,
      repo(options.repo),
      prId,
      project(options.project),
    );
  }

  async function loadViewedState(prId, isOffline, options = {}) {
    if (isOffline) return { map: {}, error: null };
    try {
      return { map: await readViewed(prId, options), error: null };
    } catch (e) {
      const auth = /401|unauthor|expired|credential|token/i.test(e?.message || "");
      return {
        map: {},
        error: auth ? "ADO sign-in expired." : "Couldn't reach Azure DevOps.",
      };
    }
  }

  // Review history for one file across closed PRs that touched its commits.
  // Returns raw comments. Rendering stays above the provider line.
  async function getFileReviewHistory(repoId, filePath, branch = "main") {
    const target = normPath(filePath);
    try {
      const gitApi = await getGitApi();
      const commits = await gitApi.getCommits(
        repoId,
        {
          itemPath: filePath,
          itemVersion: { version: branch, versionType: 0 },
        },
        undefined,
        0,
        100,
      );
      const commitIds = (commits || []).map((c) => c.commitId).filter(Boolean);
      if (!commitIds.length) return [];

      let results = [];
      try {
        const q = await gitApi.getPullRequestQuery({
          queries: [
            { type: 1, items: commitIds },
            { type: 2, items: commitIds },
          ],
        }, repoId);
        results = q?.results || [];
      } catch (e) {
        logger.error("getPullRequestQuery failed:", e.message);
      }

      const prMap = new Map();
      for (const result of results) {
        for (const cid of Object.keys(result || {})) {
          for (const pr of result[cid] || []) {
            if (pr?.pullRequestId && !prMap.has(pr.pullRequestId)) {
              prMap.set(pr.pullRequestId, pr);
            }
          }
        }
      }
      const isActive = (s) =>
        s === 1 || s === 0 || s === "active" || s === "notSet";
      let prs = [...prMap.values()].filter((pr) => !isActive(pr.status));
      prs.sort(
        (a, b) =>
          new Date(b.closedDate || b.creationDate || 0) -
          new Date(a.closedDate || a.creationDate || 0),
      );
      prs = prs.slice(0, 10);

      const history = [];
      for (const pr of prs) {
        let threads = [];
        try {
          threads = await gitApi.getThreads(repoId, pr.pullRequestId);
        } catch {
          // One unreadable PR must not fail the whole history.
        }
        const fileThreads = (threads || []).filter(
          (t) =>
            t.comments?.length &&
            t.threadContext &&
            normPath(t.threadContext.filePath) === target,
        );
        if (fileThreads.length) history.push({ pr, threads: fileThreads });
      }
      return history;
    } catch (e) {
      logger.error("getFileReviewHistory failed:", e.message);
      return [];
    }
  }

  async function getBranchTip(branchRef, options = {}) {
    const gitApi = await getGitApi();
    const shortBranch = branchRef.replace("refs/heads/", "");
    const refs = await adoCall(
      () => gitApi.getRefs(
        repo(options.repo), project(options.project), `heads/${shortBranch}`,
      ),
      { label: "getRefs" },
    );
    const ref = (refs || []).find((r) => r.name === branchRef);
    if (!ref) throw new Error(`Branch ref not found: ${branchRef}`);
    return ref.objectId;
  }

  async function commitFile(branchRef, {
    filePath,
    content,
    message,
    expectedOldObjectId,
    repo: repoOverride,
    project: projectOverride,
  }) {
    const gitApi = await getGitApi();
    const options = { repo: repoOverride, project: projectOverride };
    const oldObjectId =
      expectedOldObjectId || await getBranchTip(branchRef, options);
    const push = buildPushChangeSet({
      edits: [{ path: filePath, content }],
      message,
      branchRef,
      oldObjectId,
    });
    const result = await gitApi.createPush(
      push, repo(repoOverride), project(projectOverride),
    );
    return (
      result?.commits?.[0]?.commitId ||
      result?.refUpdates?.[0]?.newObjectId ||
      null
    );
  }

  return {
    getPullRequest,
    listPullRequests,
    getFileContent,
    listChangedFiles,
    listThreads,
    createComment,
    replyToThread,
    resolveThread,
    submitReview,
    readViewed,
    getViewed,
    setViewed,
    loadViewedState,
    getFileReviewHistory,
    getBranchTip,
    commitFile,
  };
}
