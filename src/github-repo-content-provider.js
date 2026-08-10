// GitHub RepoContentProvider. "Project" maps to repository owner (user/org).
// Multi-file writes use the Git Data API (blobs -> tree -> commit -> ref)
// so one staged publication crosses the remote as one atomic commit.

import {
  GitHubApiError,
  githubPath,
} from "./github-client.js";

function branchName(ref) {
  return String(ref || "").replace(/^refs\/heads\//, "");
}

function repoCoordinate(repoRef, project) {
  const value = String(repoRef || "").replace(/^\/+|\/+$/g, "");
  if (value.includes("/")) {
    const [owner, ...rest] = value.split("/");
    return { owner, repo: rest.join("/") };
  }
  if (!project) throw new Error(`Repository owner required for ${value}`);
  return { owner: String(project), repo: value };
}

function mapRepository(raw) {
  const owner = raw.owner?.login || "";
  return {
    id: raw.full_name || `${owner}/${raw.name || ""}`,
    name: raw.name || "",
    project: { id: owner, name: owner },
    defaultBranch: raw.default_branch
      ? `refs/heads/${raw.default_branch}`
      : null,
    webUrl: raw.html_url || null,
    permissions: raw.permissions || null,
  };
}

export function createGitHubRepoContentProvider(client) {
  if (!client) throw new Error("GitHub repo-content provider requires a client");

  const pathFor = (repoRef, project, ...segments) => {
    const { owner, repo } = repoCoordinate(repoRef, project);
    return githubPath("repos", owner, repo, ...segments);
  };

  // Owner namespaces are the closest GitHub equivalent to ADO projects.
  async function listProjects() {
    const [user, orgs] = await Promise.all([
      client.request("GET", "/user"),
      client.paginate("/user/orgs"),
    ]);
    const rows = [{
      id: user.login,
      name: user.login,
    }];
    for (const org of orgs) {
      if (!rows.some((row) => row.id === org.login)) {
        rows.push({ id: org.login, name: org.login });
      }
    }
    return rows;
  }

  async function resolveRepository(repoRef, project) {
    const raw = await client.request(
      "GET", pathFor(repoRef, project),
    );
    return mapRepository(raw);
  }

  async function listRepositories(project) {
    const rows = await client.paginate("/user/repos", {
      query: {
        affiliation: "owner,collaborator,organization_member",
        sort: "updated",
        direction: "desc",
      },
    });
    return rows
      .filter((repo) => !project || repo.owner?.login === project)
      .map(mapRepository);
  }

  async function listBranches(repoRef, project, {
    filter,
  } = {}) {
    const branches = await client.paginate(
      pathFor(repoRef, project, "branches"),
    );
    const prefix = String(filter || "")
      .replace(/^refs\/heads\//, "")
      .replace(/^heads\//, "");
    return branches
      .filter((branch) => !prefix || branch.name.startsWith(prefix))
      .map((branch) => ({
        name: `refs/heads/${branch.name}`,
        objectId: branch.commit?.sha || null,
        isLocked: false,
        isProtected: !!branch.protected,
      }));
  }

  async function getBranchTip(repoRef, project, branchRef) {
    const name = branchName(branchRef);
    const ref = await client.request(
      "GET",
      pathFor(repoRef, project, "git", "ref", "heads",
        ...name.split("/")),
    );
    if (!ref?.object?.sha) {
      throw new Error(`Branch ref not found: refs/heads/${name}`);
    }
    return ref.object.sha;
  }

  async function createBranch(repoRef, project, {
    branch,
    baseTip,
  } = {}) {
    const name = branchName(branch);
    const result = await client.request(
      "POST", pathFor(repoRef, project, "git", "refs"),
      {
        body: {
          ref: `refs/heads/${name}`,
          sha: baseTip,
        },
      },
    );
    return {
      branchRef: result?.ref || `refs/heads/${name}`,
      objectId: result?.object?.sha || baseTip,
      update: result,
    };
  }

  async function getText(repoRef, filePath, branch = "main", project) {
    return client.request(
      "GET",
      pathFor(repoRef, project, "contents",
        ...String(filePath).replace(/^\/+/, "").split("/")),
      {
        query: { ref: branchName(branch) },
        accept: "application/vnd.github.raw+json",
        responseType: "text",
      },
    );
  }

  async function listItems(repoRef, project, {
    scopePath = "/",
    branch = "main",
  } = {}) {
    const clean = String(scopePath).replace(/^\/+|\/+$/g, "");
    const result = await client.request(
      "GET",
      pathFor(repoRef, project, "contents",
        ...(clean ? clean.split("/") : [])),
      { query: { ref: branchName(branch) } },
    );
    const rows = Array.isArray(result) ? result : [result];
    return rows.filter(Boolean).map((item) => ({
      path: item.path?.startsWith("/") ? item.path : `/${item.path || ""}`,
      isFolder: item.type === "dir",
      objectId: item.sha || null,
      url: item.html_url || null,
    }));
  }

  async function getFileCommits(
    repoRef,
    filePath,
    branch = "main",
    top = 10,
    project,
  ) {
    const rows = await client.paginate(
      pathFor(repoRef, project, "commits"),
      {
        query: {
          path: String(filePath).replace(/^\/+/, ""),
          sha: branchName(branch),
        },
        perPage: Math.min(100, top),
        maxPages: Math.max(1, Math.ceil(top / 100)),
      },
    );
    return rows.slice(0, top).map((commit) => ({
      commitId: commit.sha || null,
      author: commit.commit?.author
        ? {
            name: commit.commit.author.name || null,
            date: commit.commit.author.date || null,
          }
        : null,
      committer: commit.commit?.committer
        ? {
            name: commit.commit.committer.name || null,
            date: commit.commit.committer.date || null,
          }
        : null,
      comment: commit.commit?.message || null,
      changeCounts: null,
      remoteUrl: commit.html_url || null,
      url: commit.url || null,
    }));
  }

  async function getLastCommitAuthor(
    repoRef,
    filePath,
    branch = "main",
    project,
  ) {
    try {
      const commits = await getFileCommits(
        repoRef, filePath, branch, 1, project,
      );
      return commits[0]?.author?.name ||
        commits[0]?.committer?.name ||
        "";
    } catch {
      return "";
    }
  }

  async function diffBranches(
    repoRef,
    project,
    { base, target } = {},
  ) {
    const result = await client.request(
      "GET",
      pathFor(repoRef, project, "compare",
        `${branchName(base)}...${branchName(target)}`),
    );
    return {
      changes: (result?.files || []).map((file) => ({
        item: {
          path: file.filename?.startsWith("/")
            ? file.filename
            : `/${file.filename || ""}`,
          isFolder: false,
        },
        changeType: file.status === "removed"
          ? 16
          : file.status === "added" || file.status === "copied"
            ? 1
            : file.status === "renamed"
              ? 8
              : 2,
      })),
    };
  }

  async function pushFiles(
    repoRef,
    project,
    {
      branchRef,
      oldObjectId,
      adds = [],
      edits = [],
      message,
    } = {},
  ) {
    const baseCommit = await client.request(
      "GET", pathFor(repoRef, project, "git", "commits", oldObjectId),
    );
    if (!baseCommit?.tree?.sha) {
      throw new Error(`GitHub base commit not found: ${oldObjectId}`);
    }
    const changes = [...adds, ...edits];
    const blobs = await Promise.all(changes.map((change) =>
      client.request(
        "POST", pathFor(repoRef, project, "git", "blobs"),
        {
          body: {
            content: change.content,
            encoding: change.base64 ? "base64" : "utf-8",
          },
        },
      )));
    const tree = await client.request(
      "POST", pathFor(repoRef, project, "git", "trees"),
      {
        body: {
          base_tree: baseCommit.tree.sha,
          tree: changes.map((change, index) => ({
            path: String(change.path).replace(/^\/+/, ""),
            mode: "100644",
            type: "blob",
            sha: blobs[index].sha,
          })),
        },
      },
    );
    const commit = await client.request(
      "POST", pathFor(repoRef, project, "git", "commits"),
      {
        body: {
          message: message || "Update specs",
          tree: tree.sha,
          parents: [oldObjectId],
        },
      },
    );
    try {
      await client.request(
        "PATCH",
        pathFor(repoRef, project, "git", "refs", "heads",
          ...branchName(branchRef).split("/")),
        { body: { sha: commit.sha, force: false } },
      );
    } catch (error) {
      const detail = [
        error?.message,
        error?.body?.message,
      ].filter(Boolean).join(" ");
      if (
        error?.status === 422 &&
        /not.?fast.?forward|reference update failed|stale ref/i.test(detail)
      ) {
        throw new GitHubApiError(
          "Branch has already been updated",
          {
            status: 409,
            method: "PATCH",
            url: pathFor(repoRef, project, "git", "refs"),
            body: error.body,
          },
        );
      }
      throw error;
    }
    return { commitId: commit.sha || null, result: commit };
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

export { mapRepository, repoCoordinate };
