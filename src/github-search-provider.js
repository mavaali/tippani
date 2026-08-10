// GitHub SearchProvider. Pull-request discovery uses GraphQL search so branch,
// draft, merge, and repository fields arrive in one result. Spec search uses the
// REST code-search endpoint because GitHub's GraphQL API has no code search.

import { githubPath } from "./github-client.js";

const SEARCH_PRS = `
  query TippaniPullRequestSearch(
    $query: String!, $first: Int!, $after: String
  ) {
    search(query: $query, type: ISSUE, first: $first, after: $after) {
      nodes {
        ... on PullRequest {
          number
          title
          url
          state
          isDraft
          mergedAt
          createdAt
          headRefName
          baseRefName
          author { login }
          repository { name owner { login } }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

function branchName(ref) {
  return String(ref || "").replace(/^refs\/heads\//, "");
}

function mapPullRequest(pr) {
  const owner = pr.repository?.owner?.login || "";
  return {
    id: pr.number,
    title: pr.title || "",
    author: pr.author?.login || "",
    status: pr.mergedAt ? 3 : pr.state === "OPEN" ? 1 : 2,
    isDraft: !!pr.isDraft,
    source: pr.headRefName || "",
    target: pr.baseRefName || "",
    repo: pr.repository?.name || null,
    project: owner || null,
    created: pr.createdAt || null,
    webUrl: pr.url || null,
  };
}

export function createGitHubSearchProvider(client, {
  owner,
} = {}) {
  if (!client) throw new Error("GitHub search provider requires a client");
  if (!owner) throw new Error("GitHub search provider requires an owner");

  const ownerTypes = new Map();

  async function scopeFor(rawOwner) {
    const login = String(rawOwner || owner).trim();
    if (!login) throw new Error("GitHub search requires an owner");
    let type = ownerTypes.get(login.toLowerCase());
    if (!type) {
      const account = await client.request(
        "GET", githubPath("users", login),
      );
      type = account?.type === "Organization" ? "org" : "user";
      ownerTypes.set(login.toLowerCase(), type);
    }
    return `${type}:${login}`;
  }

  async function graphqlPullRequests(searchQuery, top) {
    const rows = [];
    let after = null;
    do {
      const first = Math.min(100, Math.max(1, top - rows.length));
      const data = await client.graphql(SEARCH_PRS, {
        query: searchQuery,
        first,
        after,
      });
      const search = data?.search;
      const batch = (search?.nodes || []).filter((node) =>
        Number.isFinite(node?.number));
      rows.push(...batch);
      after = search?.pageInfo?.hasNextPage
        ? search.pageInfo.endCursor
        : null;
    } while (after && rows.length < top);
    return rows.slice(0, top);
  }

  async function searchPullRequests(criteria = {}, top = 50) {
    const limit = Number.isFinite(top) && top > 0
      ? Math.min(Math.floor(top), 1000)
      : 50;
    const qualifiers = [
      "is:pr",
      await scopeFor(owner),
    ];
    if (criteria.status === 3) qualifiers.push("is:merged");
    else if (criteria.status === 2) qualifiers.push("is:closed", "is:unmerged");
    else if (criteria.status !== 4) qualifiers.push("is:open");
    if (criteria.creatorId) {
      qualifiers.push(`author:${criteria.creatorId}`);
    }
    if (criteria.targetRefName) {
      qualifiers.push(`base:${branchName(criteria.targetRefName)}`);
    }

    const searches = criteria.reviewerId
      ? [
          [...qualifiers, `review-requested:${criteria.reviewerId}`],
          [...qualifiers, `reviewed-by:${criteria.reviewerId}`],
        ]
      : [qualifiers];
    const batches = await Promise.all(searches.map((parts) =>
      graphqlPullRequests(parts.join(" "), limit)));
    const seen = new Set();
    const results = [];
    for (const pr of batches.flat()) {
      const key = `${pr.repository?.owner?.login || ""}/` +
        `${pr.repository?.name || ""}#${pr.number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(mapPullRequest(pr));
      if (results.length >= limit) break;
    }
    return results;
  }

  async function searchSpecs(project, query, top = 100) {
    const limit = Number.isFinite(top) && top > 0
      ? Math.min(Math.floor(top), 1000)
      : 100;
    const searchQuery = `${String(query || "").trim()} extension:md ` +
      await scopeFor(project);
    const seen = new Set();
    const specs = [];
    const perPage = Math.min(100, limit);
    for (let page = 1; specs.length < limit; page++) {
      const response = await client.request("GET", "/search/code", {
        query: {
          q: searchQuery,
          per_page: perPage,
          page,
        },
      });
      const items = response?.items || [];
      for (const item of items) {
        const path = String(item?.path || "");
        const fullName = item?.repository?.full_name || "";
        if (!path.toLowerCase().endsWith(".md") || !fullName) continue;
        const key = `${fullName}|${path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        specs.push({
          path: path.startsWith("/") ? path : `/${path}`,
          repoId: fullName,
          repoName: item.repository?.name || fullName.split("/").pop(),
          project: item.repository?.owner?.login ||
            fullName.split("/")[0],
          branch: item.repository?.default_branch || "main",
          url: item.html_url || null,
        });
        if (specs.length >= limit) break;
      }
      if (items.length < perPage) break;
    }
    return specs;
  }

  return { searchPullRequests, searchSpecs };
}
