// Azure DevOps implementation of AuthoringProvider from
// docs/plans/2026-08-09-provider-contract-v2.md.
//
// Authoring owns pull-request lifecycle only: create a PR and publish a draft
// PR (isDraft:false). Work-item query/create/link is deliberately a separate
// WorkItemProvider capability — the surrounding openSpecReviewPr orchestrator
// composes both without making AuthoringProvider pretend WIQL is universal.
//
// Timeout/error mapping stays in the application orchestrator for this slice:
// openSpecReviewPr already wraps every injected operation with adoCall, and
// publishStagedPrs does the same. Keeping the provider transport-only avoids
// double timeout wrappers while preserving the exact existing behavior.

export function createAdoAuthoringProvider(conn) {
  if (!conn) throw new Error("ADO authoring provider requires a connection");

  let cachedGitApi = null;
  async function getGitApi() {
    if (cachedGitApi) return cachedGitApi;
    const api = await conn.getGitApi();
    cachedGitApi = api;
    return api;
  }

  async function createPullRequest(repoId, project, request) {
    const gitApi = await getGitApi();
    return gitApi.createPullRequest(request, repoId, project);
  }

  async function publishPullRequest(repoId, project, pullRequestId) {
    const gitApi = await getGitApi();
    return gitApi.updatePullRequest(
      { isDraft: false },
      repoId,
      pullRequestId,
      project,
    );
  }

  return {
    createPullRequest,
    publishPullRequest,
  };
}
