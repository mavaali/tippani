// Azure DevOps SearchProvider transport. Owns the two raw REST calls that have
// no typed azure-devops-node-api equivalent in this codebase:
// - org-wide PR search on dev.azure.com
// - ADO Code Search on almsearch.dev.azure.com
//
// Provider projects backend envelopes to neutral PR/spec hits. UI-only fields
// (web URL, last-modified enrichment) and user-facing failure policy remain in
// index.js.

import { summarizePr } from "./pr-criteria.js";

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
    return (response?.result?.value || []).map(summarizePr);
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
    const hits = response?.result?.results || [];
    const seen = new Set();
    const specs = [];
    for (const hit of hits) {
      const path = hit.path || "";
      if (!path.toLowerCase().endsWith(".md")) continue;
      const repoId = hit.repository?.id;
      const repoName = hit.repository?.name || "";
      // TFVC hits cannot be opened through Git item APIs. ADO Git repository
      // ids are GUIDs; project/repo names alone are not sufficient.
      if (!repoId || !/^[0-9a-f-]{36}$/i.test(repoId)) continue;
      const key = `${repoId}|${path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      specs.push({
        path,
        repoId,
        repoName,
        project: hit.project?.name || project,
        branch: (
          hit.versions?.[0]?.branchName || "main"
        ).replace(/^refs\/heads\//, ""),
      });
    }
    return specs;
  }

  return { searchPullRequests, searchSpecs };
}
