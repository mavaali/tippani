// Small injected-fetch GitHub REST/GraphQL client. Node 18+ already provides
// fetch, so Phase 1 doesn't add an SDK dependency just to wrap HTTP.

export class GitHubApiError extends Error {
  constructor(message, {
    status = 0,
    method = "",
    url = "",
    body = null,
  } = {}) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.method = method;
    this.url = url;
    this.body = body;
  }
}

function encodeQuery(query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function githubPath(...segments) {
  return "/" + segments
    .flatMap((segment) => String(segment).split("/"))
    .filter((segment) => segment !== "")
    .map(encodeURIComponent)
    .join("/");
}

export function createGitHubClient({
  token,
  fetchImpl = globalThis.fetch,
  apiBase = "https://api.github.com",
} = {}) {
  if (!fetchImpl) throw new Error("GitHub client requires fetch");
  if (!token) throw new Error("GitHub client requires a token");
  const base = String(apiBase).replace(/\/+$/, "");

  async function request(method, path, {
    query,
    body,
    accept = "application/vnd.github+json",
    responseType = "json",
  } = {}) {
    const url = `${base}${path}${encodeQuery(query)}`;
    const headers = {
      Accept: accept,
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "tippani",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let parsed = null;
    if (responseType === "buffer") {
      if (response.ok) return Buffer.from(await response.arrayBuffer());
    } else if (responseType === "text") {
      if (response.ok) return response.text();
    } else if (response.status !== 204) {
      const text = await response.text();
      if (text) {
        try { parsed = JSON.parse(text); } catch { parsed = text; }
      }
    }
    if (!response.ok) {
      const detail =
        (parsed && typeof parsed === "object" && parsed.message) ||
        (typeof parsed === "string" && parsed) ||
        `${response.status} ${response.statusText}`;
      throw new GitHubApiError(
        `GitHub ${method} ${path} failed: ${detail}`,
        { status: response.status, method, url, body: parsed },
      );
    }
    return parsed;
  }

  async function graphql(document, variables = {}) {
    const result = await request("POST", "/graphql", {
      body: { query: document, variables },
    });
    if (result?.errors?.length) {
      throw new GitHubApiError(
        "GitHub GraphQL failed: " +
          result.errors.map((error) => error.message).join("; "),
        { status: 200, method: "POST", url: `${base}/graphql`, body: result },
      );
    }
    return result?.data || null;
  }

  async function paginate(path, {
    query = {},
    perPage = 100,
    maxPages = 30,
  } = {}) {
    const rows = [];
    for (let page = 1; page <= maxPages; page++) {
      const batch = await request("GET", path, {
        query: { ...query, per_page: perPage, page },
      });
      if (!Array.isArray(batch)) return rows;
      rows.push(...batch);
      if (batch.length < perPage) break;
    }
    return rows;
  }

  return { request, graphql, paginate, apiBase: base };
}
