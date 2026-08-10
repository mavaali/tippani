// GitHub implementation of ReviewProvider.
//
// Public thread handles remain numeric because Tippani's current MCP/control
// schemas use numbers. GitHub's review-thread id is an opaque GraphQL node ID,
// so the provider exposes the root review-comment's numeric database id as the
// stable handle and privately maps it back to the thread node id for resolve.

import { extOf } from "./config-util.js";
import {
  GitHubApiError,
  githubPath,
} from "./github-client.js";

function branchName(ref) {
  return String(ref || "").replace(/^refs\/heads\//, "");
}

function mapStatus(pr) {
  if (pr.merged_at || pr.merged) return 3; // ADO completed
  return pr.state === "open" ? 1 : 2;      // active / abandoned
}

function mapPullRequest(pr, { owner, repo } = {}) {
  const repoInfo = pr.base?.repo || pr.head?.repo || {};
  const repoName = repoInfo.name || repo || "";
  const repoOwner = repoInfo.owner?.login || owner || "";
  return {
    pullRequestId: pr.number,
    title: pr.title || "",
    description: pr.body || "",
    createdBy: {
      // Tippani feeds this id back into provider list filters. GitHub list
      // responses expose creator/reviewer identity as login, not node_id.
      id: pr.user?.login || null,
      displayName: pr.user?.login || "",
      uniqueName: pr.user?.login || null,
    },
    sourceRefName: `refs/heads/${pr.head?.ref || ""}`,
    targetRefName: `refs/heads/${pr.base?.ref || ""}`,
    status: mapStatus(pr),
    isDraft: !!pr.draft,
    creationDate: pr.created_at || null,
    closedDate: pr.closed_at || null,
    lastMergeSourceCommit: pr.head?.sha
      ? { commitId: pr.head.sha }
      : null,
    repository: {
      id: repoInfo.full_name || `${repoOwner}/${repoName}`,
      name: repoName,
      project: { id: repoOwner, name: repoOwner },
      webUrl: repoInfo.html_url || null,
    },
    _links: { web: { href: pr.html_url || null } },
    _githubNodeId: pr.node_id || null,
    _githubHeadRepository: {
      id: pr.head?.repo?.full_name || null,
      owner: pr.head?.repo?.owner?.login || null,
      name: pr.head?.repo?.name || null,
      ref: pr.head?.ref || null,
      sha: pr.head?.sha || null,
    },
  };
}

function normalizePath(path) {
  const value = String(path || "").replace(/\\/g, "/");
  return (value.startsWith("/") ? value : `/${value}`).toLowerCase();
}

function mapChangeType(status) {
  if (status === "added" || status === "copied") return 1;
  if (status === "renamed") return 8;
  return 2;
}

const THREADS_QUERY = `
  query TippaniReviewThreads(
    $owner: String!, $repo: String!, $number: Int!, $after: String
  ) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 100, after: $after) {
          nodes {
            id
            isResolved
            path
            line
            originalLine
            startLine
            comments(first: 100) {
              nodes {
                id
                fullDatabaseId
                author { login }
                body
                createdAt
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

const RESOLVE_THREAD_MUTATION = `
  mutation ResolveTippaniThread($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) {
      thread { id isResolved }
    }
  }
`;

const UNRESOLVE_THREAD_MUTATION = `
  mutation UnresolveTippaniThread($threadId: ID!) {
    unresolveReviewThread(input: { threadId: $threadId }) {
      thread { id isResolved }
    }
  }
`;

export function createGitHubReviewProvider(client, {
  owner,
  repo,
  viewedStore,
} = {}) {
  if (!client) throw new Error("GitHub review provider requires a client");
  if (!owner || !repo) {
    throw new Error("GitHub review provider requires owner and repo");
  }

  const threadNodeByHandle = new Map();
  const rootCommentByHandle = new Map();
  const localViewed = new Map();
  let activeHeadOwner = owner;
  let activeHeadRepo = repo;
  const repoByCommit = new Map();
  const viewed = viewedStore || {
    read: async (key) => localViewed.get(key) || {},
    write: async (key, map) => { localViewed.set(key, { ...map }); },
  };

  const repoPath = (...segments) =>
    githubPath("repos", owner, repo, ...segments);
  const contentRepoPath = (...segments) =>
    githubPath("repos", activeHeadOwner, activeHeadRepo, ...segments);

  function bindPullRequest(pr) {
    const head = pr?._githubHeadRepository;
    if (head?.owner && head?.name) {
      activeHeadOwner = head.owner;
      activeHeadRepo = head.name;
      if (head.sha) {
        repoByCommit.set(head.sha, {
          owner: head.owner,
          repo: head.name,
        });
      }
    }
    return pr;
  }

  function rememberPr(raw) {
    return bindPullRequest(mapPullRequest(raw, { owner, repo }));
  }

  async function getRawPullRequest(number) {
    const raw = await client.request(
      "GET", repoPath("pulls", number),
    );
    rememberPr(raw);
    return raw;
  }

  async function getCurrentUser() {
    const user = await client.request("GET", "/user");
    return {
      id: user.login || null,
      displayName: user.name || user.login || "",
      uniqueName: user.login || null,
    };
  }

  async function getPullRequest(number) {
    return rememberPr(await client.request(
      "GET", repoPath("pulls", number),
    ));
  }

  async function listPullRequests(criteria = {}, top = 50) {
    const state = criteria.status === 4
      ? "all"
      : criteria.status === 3 || criteria.status === 2
        ? "closed"
        : "open";
    const rows = await client.paginate(repoPath("pulls"), {
      query: {
        state,
        base: criteria.targetRefName
          ? branchName(criteria.targetRefName)
          : undefined,
        sort: "updated",
        direction: "desc",
      },
      maxPages: Math.max(1, Math.ceil(top / 100)),
    });
    const basic = rows.filter((pr) => {
        if (criteria.creatorId && pr.user?.login !== criteria.creatorId) {
          return false;
        }
        if (criteria.status === 3 && !pr.merged_at) return false;
        if (criteria.status === 2 && (pr.merged_at || pr.state !== "closed")) {
          return false;
        }
        return true;
      });
    let filtered = basic;
    if (criteria.reviewerId) {
      const reviewer = criteria.reviewerId;
      const matches = new Array(basic.length).fill(false);
      let cursor = 0;
      const worker = async () => {
        for (;;) {
          const index = cursor++;
          if (index >= basic.length) return;
          const pr = basic[index];
          if ((pr.requested_reviewers || []).some((item) =>
            item.login === reviewer)) {
            matches[index] = true;
            continue;
          }
          const reviews = await client.paginate(
            repoPath("pulls", pr.number, "reviews"),
            { maxPages: 10 },
          );
          matches[index] = reviews.some((review) =>
            review.user?.login === reviewer);
        }
      };
      await Promise.all(Array.from({
        length: Math.min(8, basic.length),
      }, worker));
      filtered = basic.filter((_pr, index) => matches[index]);
    }
    return filtered.slice(0, top).map((pr) =>
      mapPullRequest(pr, { owner, repo }));
  }

  async function getFileContent(filePath, ref) {
    const version = branchName(ref?.version || ref);
    const target = repoByCommit.get(version) || {
      owner: activeHeadOwner,
      repo: activeHeadRepo,
    };
    // The PR body/comments live on the base repo; file bytes live on the
    // contributor's head repo for fork PRs.
    return client.request("GET", githubPath(
      "repos", target.owner, target.repo,
      "contents", ...String(filePath).replace(/^\/+/, "").split("/"),
    ), {
      query: { ref: version },
      accept: "application/vnd.github.raw+json",
      responseType: "text",
    });
  }

  async function listChangedFiles(number) {
    const files = await client.paginate(
      repoPath("pulls", number, "files"),
    );
    const kept = files.filter((file) => file.status !== "removed");
    return {
      mdFiles: kept
        .filter((file) => file.filename.toLowerCase().endsWith(".md"))
        .map((file) => ({
          path: `/${file.filename}`,
          changeType: mapChangeType(file.status),
        })),
      otherFiles: kept
        .filter((file) => !file.filename.toLowerCase().endsWith(".md"))
        .map((file) => ({
          path: `/${file.filename}`,
          ext: extOf(file.filename),
        })),
    };
  }

  function mapThread(node) {
    const comments = node.comments?.nodes || [];
    const rootId = Number(comments[0]?.fullDatabaseId);
    if (!Number.isSafeInteger(rootId) || rootId <= 0) {
      throw new Error(
        `GitHub review thread ${node.id} has no safe numeric root comment id`,
      );
    }
    threadNodeByHandle.set(rootId, node.id);
    rootCommentByHandle.set(rootId, rootId);
    const line = node.line || node.originalLine || node.startLine || 1;
    return {
      id: rootId,
      status: node.isResolved ? 2 : 1,
      threadContext: {
        filePath: node.path.startsWith("/") ? node.path : `/${node.path}`,
        rightFileStart: { line, offset: 1 },
        rightFileEnd: { line, offset: 1 },
      },
      comments: comments.map((comment) => ({
        id: Number(comment.fullDatabaseId),
        author: {
          id: comment.author?.login || null,
          displayName: comment.author?.login || "",
        },
        publishedDate: comment.createdAt,
        content: comment.body || "",
        commentType: 1,
      })),
    };
  }

  async function listThreads(number) {
    const nodes = [];
    let after = null;
    do {
      const data = await client.graphql(THREADS_QUERY, {
        owner, repo, number: Number(number), after,
      });
      const connection =
        data?.repository?.pullRequest?.reviewThreads;
      if (!connection) return [];
      nodes.push(...(connection.nodes || []));
      after = connection.pageInfo?.hasNextPage
        ? connection.pageInfo.endCursor
        : null;
    } while (after);
    return nodes
      .filter((node) => node.comments?.nodes?.length)
      .map(mapThread);
  }

  async function ensureHeadSha(number) {
    // The author may push while the portal is open. Fetch immediately before
    // every anchored comment; a process-lifetime cache would post against the
    // old commit and produce outdated comments or 422s.
    const pr = await getRawPullRequest(number);
    return pr.head.sha;
  }

  async function createComment(number, {
    filePath, line, body,
  }) {
    const comment = await client.request(
      "POST", repoPath("pulls", number, "comments"),
      {
        body: {
          body,
          commit_id: await ensureHeadSha(number),
          path: String(filePath).replace(/^\/+/, ""),
          line,
          side: "RIGHT",
        },
      },
    );
    const threads = await listThreads(number);
    return threads.find((thread) =>
      thread.comments.some((item) => item.id === Number(comment.id))) ||
      null;
  }

  async function replyToThread(number, threadHandle, body) {
    const rootCommentId =
      rootCommentByHandle.get(Number(threadHandle)) ||
      Number(threadHandle);
    return client.request(
      "POST",
      repoPath(
        "pulls", number, "comments", rootCommentId, "replies",
      ),
      { body: { body } },
    );
  }

  async function threadNodeId(number, threadHandle) {
    const handle = Number(threadHandle);
    if (!threadNodeByHandle.has(handle)) await listThreads(number);
    const nodeId = threadNodeByHandle.get(handle);
    if (!nodeId) throw new Error(`GitHub review thread not found: ${handle}`);
    return nodeId;
  }

  async function resolveThread(number, threadHandle) {
    const threadId = await threadNodeId(number, threadHandle);
    await client.graphql(RESOLVE_THREAD_MUTATION, { threadId });
    return { id: Number(threadHandle), status: 2 };
  }

  async function unresolveThread(number, threadHandle) {
    const threadId = await threadNodeId(number, threadHandle);
    await client.graphql(UNRESOLVE_THREAD_MUTATION, { threadId });
    return { id: Number(threadHandle), status: 1 };
  }

  async function submitReview(number, vote) {
    let event;
    let body;
    if (vote > 0) event = "APPROVE";
    else if (vote < 0) {
      event = "REQUEST_CHANGES";
      body = "Changes requested via Tippani.";
    } else {
      throw new Error("GitHub does not support clearing a submitted review");
    }
    return client.request(
      "POST", repoPath("pulls", number, "reviews"),
      { body: { event, ...(body ? { body } : {}) } },
    );
  }

  async function probePushPermission() {
    const repository = await client.request("GET", contentRepoPath());
    return repository?.permissions?.push ?? null;
  }

  const viewedKey = (number) => `${owner}/${repo}#${Number(number)}`;

  async function readViewed(number) {
    const map = await viewed.read(viewedKey(number));
    if (map == null) return {};
    if (!map || typeof map !== "object" || Array.isArray(map)) {
      throw new Error("Corrupt local GitHub viewed state");
    }
    return { ...map };
  }

  async function getViewed(number) {
    try { return await readViewed(number); } catch { return {}; }
  }

  async function setViewed(number, map) {
    await viewed.write(viewedKey(number), { ...map });
    return map;
  }

  async function loadViewedState(number, isOffline) {
    if (isOffline) return { map: {}, error: null };
    try {
      return { map: await readViewed(number), error: null };
    } catch {
      return {
        map: {},
        error: "Couldn't load local GitHub viewed state.",
      };
    }
  }

  async function getFileReviewHistory(
    _repoId,
    filePath,
    branch = "main",
  ) {
    try {
      const commits = await client.paginate(repoPath("commits"), {
        query: {
          path: String(filePath).replace(/^\/+/, ""),
          sha: branchName(branch),
        },
        perPage: 100,
        maxPages: 1,
      });
      const byNumber = new Map();
      for (const commit of commits.slice(0, 100)) {
        const pulls = await client.request(
          "GET", repoPath("commits", commit.sha, "pulls"),
        );
        for (const pr of pulls || []) {
          if (pr.state !== "open" && !byNumber.has(pr.number)) {
            byNumber.set(pr.number, pr);
          }
        }
      }
      const prs = [...byNumber.values()]
        .sort((a, b) =>
          new Date(b.closed_at || b.created_at || 0) -
          new Date(a.closed_at || a.created_at || 0))
        .slice(0, 10);
      const target = normalizePath(filePath);
      const history = [];
      for (const raw of prs) {
        const threads = (await listThreads(raw.number)).filter((thread) =>
          normalizePath(thread.threadContext?.filePath) === target);
        if (threads.length) {
          history.push({
            pr: rememberPr(raw),
            threads,
          });
        }
      }
      return history;
    } catch {
      return [];
    }
  }

  async function getBranchTip(branchRef) {
    const ref = await client.request(
      "GET",
      contentRepoPath(
        "git", "ref", "heads", ...branchName(branchRef).split("/")),
    );
    if (!ref?.object?.sha) {
      throw new Error(`Branch ref not found: ${branchRef}`);
    }
    return ref.object.sha;
  }

  async function commitFile(branchRef, {
    filePath,
    content,
    message,
    expectedOldObjectId,
  }) {
    const branch = branchName(branchRef);
    if (expectedOldObjectId) {
      const current = await getBranchTip(branch);
      if (current !== expectedOldObjectId) {
        throw new GitHubApiError(
          "Branch has already been updated",
          { status: 409, method: "PUT", url: contentRepoPath("contents") },
        );
      }
    }
    const path = String(filePath).replace(/^\/+/, "");
    const metadata = await client.request(
      "GET", contentRepoPath("contents", ...path.split("/")),
      { query: { ref: branch } },
    );
    if (!metadata?.sha || Array.isArray(metadata)) {
      throw new Error(`GitHub file not found: ${filePath}`);
    }
    // Close the race between the first tip check and metadata read. If the
    // branch moved during that interval, reject before constructing the PUT.
    // A file edit after this second check is still rejected by GitHub's blob
    // sha precondition; an unrelated commit is safe to preserve.
    if (expectedOldObjectId) {
      const afterMetadata = await getBranchTip(branch);
      if (afterMetadata !== expectedOldObjectId) {
        throw new GitHubApiError(
          "Branch has already been updated",
          { status: 409, method: "PUT", url: contentRepoPath("contents") },
        );
      }
    }
    const result = await client.request(
      // writes always target the PR head repository (fork or same-repo)
      "PUT", contentRepoPath("contents", ...path.split("/")),
      {
        body: {
          message,
          content: Buffer.from(String(content)).toString("base64"),
          branch,
          sha: metadata.sha,
        },
      },
    );
    return result?.commit?.sha || null;
  }

  return {
    bindPullRequest,
    getCurrentUser,
    getPullRequest,
    listPullRequests,
    getFileContent,
    listChangedFiles,
    listThreads,
    createComment,
    replyToThread,
    resolveThread,
    unresolveThread,
    submitReview,
    probePushPermission,
    readViewed,
    getViewed,
    setViewed,
    loadViewedState,
    getFileReviewHistory,
    getBranchTip,
    commitFile,
  };
}

export { mapPullRequest };
