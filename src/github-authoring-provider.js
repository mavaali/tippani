// GitHub implementation of AuthoringProvider.

import { githubPath } from "./github-client.js";
import { repoCoordinate } from "./github-repo-content-provider.js";

const PUBLISH_DRAFT_MUTATION = `
  mutation PublishTippaniPullRequest($pullRequestId: ID!) {
    markPullRequestReadyForReview(
      input: { pullRequestId: $pullRequestId }
    ) {
      pullRequest {
        id
        number
        isDraft
        url
      }
    }
  }
`;

function branchName(ref) {
  return String(ref || "").replace(/^refs\/heads\//, "");
}

function mapPullRequest(raw) {
  return {
    pullRequestId: raw?.number ?? null,
    url: raw?.html_url || raw?.url || null,
    isDraft: !!(raw?.draft ?? raw?.isDraft),
  };
}

export function createGitHubAuthoringProvider(client) {
  if (!client) throw new Error("GitHub authoring provider requires a client");

  const pathFor = (repoRef, project, ...segments) => {
    const { owner, repo } = repoCoordinate(repoRef, project);
    return githubPath("repos", owner, repo, ...segments);
  };

  async function createPullRequest(repoRef, project, request = {}) {
    const title = String(request.title || "").trim();
    const head = branchName(request.sourceBranch || request.sourceRefName);
    const base = branchName(request.targetBranch || request.targetRefName);
    if (!title) throw new Error("PR title is required");
    if (!head) throw new Error("PR sourceBranch is required");
    if (!base) throw new Error("PR targetBranch is required");
    if (head === base) {
      throw new Error("PR sourceBranch and targetBranch must be different");
    }
    const raw = await client.request(
      "POST", pathFor(repoRef, project, "pulls"),
      {
        body: {
          title,
          body: request.description || "",
          head,
          base,
          draft: !!request.isDraft,
        },
      },
    );
    return mapPullRequest(raw);
  }

  async function publishPullRequest(repoRef, project, pullRequestId) {
    const raw = await client.request(
      "GET", pathFor(repoRef, project, "pulls", pullRequestId),
    );
    if (!raw?.draft) return mapPullRequest(raw);
    if (!raw.node_id) {
      throw new Error(
        `GitHub pull request #${pullRequestId} has no GraphQL node id`,
      );
    }
    const data = await client.graphql(PUBLISH_DRAFT_MUTATION, {
      pullRequestId: raw.node_id,
    });
    const published = data?.markPullRequestReadyForReview?.pullRequest;
    if (!published) {
      throw new Error(
        `GitHub did not return published pull request #${pullRequestId}`,
      );
    }
    return mapPullRequest(published);
  }

  return {
    createPullRequest,
    publishPullRequest,
  };
}
