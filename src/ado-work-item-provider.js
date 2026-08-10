// Azure DevOps WorkItemProvider transport. WIQL validation, PR artifact URI
// construction, JSON-patch building, and compact row shaping stay in the
// existing pure modules above this seam.

export function createAdoWorkItemProvider(conn) {
  if (!conn) throw new Error("ADO work-item provider requires a connection");

  let cachedApi = null;
  async function getApi() {
    if (cachedApi) return cachedApi;
    const api = await conn.getWorkItemTrackingApi();
    cachedApi = api;
    return api;
  }

  async function queryWorkItemRefs(project, wiql) {
    const api = await getApi();
    const result = await api.queryByWiql({ query: wiql }, { project });
    return result?.workItems || [];
  }

  async function getWorkItems(project, ids, fields) {
    const api = await getApi();
    return (
      await api.getWorkItems(
        ids, fields, undefined, undefined, undefined, project,
      )
    ) || [];
  }

  async function createWorkItem(project, type, patch) {
    const api = await getApi();
    return api.createWorkItem(null, patch, project, type);
  }

  async function updateWorkItem(id, patch, project) {
    const api = await getApi();
    return api.updateWorkItem(null, patch, id, project);
  }

  async function linkToPullRequest(workItemId, patch, project) {
    return updateWorkItem(workItemId, patch, project);
  }

  return {
    queryWorkItemRefs,
    getWorkItems,
    createWorkItem,
    updateWorkItem,
    linkToPullRequest,
  };
}
