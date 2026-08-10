// Azure DevOps SearchProvider transport. Owns the two raw REST calls that have
// no typed azure-devops-node-api equivalent in this codebase:
// - org-wide PR search on dev.azure.com
// - ADO Code Search on almsearch.dev.azure.com
//
// Result shaping, dedupe, Git-only filtering, enrichment, and user-facing
// failure policy remain in index.js.

export function createAdoSearchProvider(conn, { org } = {}) {
  if (!conn?.rest) throw new Error("ADO search provider requires a REST connection");
  const orgBase = String(org || "").replace(/\/+$/, "");

  async function searchPullRequests(criteria = {}, top = 50) {
    const statusName = {
      1: "active",
      2: "abandoned",
      3: "completed",
      4: "all",
    }[criteria.status] || "active";
    const params = new URLSearchParams();
    params.set("api-version", "7.1");
    params.set("$top", String(top));
    params.set("searchCriteria.status", statusName);
    if (criteria.creatorId) {
      params.set("searchCriteria.creatorId", criteria.creatorId);
    }
    if (criteria.reviewerId) {
      params.set("searchCriteria.reviewerId", criteria.reviewerId);
    }
    if (criteria.targetRefName) {
      params.set(
        "searchCriteria.targetRefName", criteria.targetRefName,
      );
    }
    const url = `${orgBase}/_apis/git/pullrequests?${params.toString()}`;
    const response = await conn.rest.get(url);
    return response?.result?.value || [];
  }

  async function searchSpecs(project, query, top) {
    const searchBase = orgBase.replace(
      "://dev.azure.com", "://almsearch.dev.azure.com",
    );
    const url =
      `${searchBase}/_apis/search/codesearchresults?api-version=7.1`;
    const body = {
      searchText: `${query} ext:md`,
      "$skip": 0,
      "$top": top,
      filters: { Project: [project] },
    };
    const response = await conn.rest.create(url, body);
    return response?.result || null;
  }

  return { searchPullRequests, searchSpecs };
}
