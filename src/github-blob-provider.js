// GitHub BlobProvider: authenticated raw content bytes. GitHub's raw media type
// normally resolves LFS-backed content server-side; the caller retains the
// defensive pointer check and HTTP response policy.

import { githubPath } from "./github-client.js";

function coordinate(repoRef, defaultOwner, defaultRepo) {
  const value = String(repoRef || "");
  if (value.includes("/")) {
    const [owner, ...rest] = value.split("/");
    return { owner, repo: rest.join("/") };
  }
  return {
    owner: defaultOwner,
    repo: value || defaultRepo,
  };
}

export function createGitHubBlobProvider(client, {
  owner,
  repo,
} = {}) {
  if (!client) throw new Error("GitHub blob provider requires a client");

  async function getBlob(filePath, ref, options = {}) {
    const target = coordinate(options.repo, owner, repo);
    if (!target.owner || !target.repo) {
      throw new Error("GitHub blob provider requires owner and repo");
    }
    const path = String(filePath).replace(/^\/+/, "");
    return client.request(
      "GET",
      githubPath("repos", target.owner, target.repo, "contents",
        ...path.split("/")),
      {
        query: { ref: String(ref?.version || ref).replace(/^refs\/heads\//, "") },
        accept: "application/vnd.github.raw+json",
        responseType: "buffer",
      },
    );
  }

  return { getBlob };
}
