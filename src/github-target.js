// Pure GitHub target/auth selection helpers for CLI boot.

export function normalizeGitHubCoordinates({ owner, repo } = {}) {
  return {
    owner: String(owner || "").trim().toLowerCase(),
    repo: String(repo || "").trim().replace(/\.git$/i, "").toLowerCase(),
  };
}

export function parseGitHubTarget(args = [], env = {}) {
  const positional = args.filter((arg) => !String(arg).startsWith("--"));
  const explicit = args.find((arg) => String(arg).startsWith("--github="));
  const configured = explicit
    ? explicit.split("=").slice(1).join("=")
    : env.TIPPANI_GITHUB_REPO || env.TIPPANI_GH_REPO || null;

  let owner = null, repo = null, prId = null;
  const first = String(positional[0] || "");
  const shorthand = first.match(/^github:([^/]+)\/([^#]+)#(\d+)$/i);
  const url = first.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/i,
  );
  if (shorthand || url) {
    const match = shorthand || url;
    [, owner, repo, prId] = match;
  } else if (configured) {
    const coordinate = String(configured).match(/^([^/]+)\/([^/#]+)$/);
    if (!coordinate) {
      return {
        isGitHub: true,
        error: "--github must be owner/repo",
      };
    }
    [, owner, repo] = coordinate;
    prId = positional.find((value) => /^\d+$/.test(String(value))) || null;
  } else {
    return { isGitHub: false };
  }
  ({ owner, repo } = normalizeGitHubCoordinates({ owner, repo }));
  const id = Number(prId);
  if (!owner || !repo || !Number.isFinite(id) || id <= 0) {
    return {
      isGitHub: true,
      error: "GitHub target needs owner/repo and a pull-request number",
    };
  }
  return {
    isGitHub: true,
    owner,
    repo,
    prId: id,
  };
}

export function selectGitHubToken({
  args = [],
  env = {},
  execGh,
} = {}) {
  const cli = args.find((arg) => String(arg).startsWith("--gh-token="));
  const direct = cli
    ? cli.split("=").slice(1).join("=")
    : env.TIPPANI_GH_TOKEN || env.GITHUB_TOKEN || null;
  if (direct) return { token: String(direct).trim(), source: cli ? "cli" : "env" };
  if (typeof execGh === "function") {
    try {
      const token = String(execGh()).trim();
      if (token) return { token, source: "gh-cli" };
    } catch {
      // Caller surfaces the no-token error.
    }
  }
  return { token: null, source: "none" };
}
