const fs = require("node:fs");
const path = require("node:path");
const { validateLocalRepo } = require("../src/local-repo.js");

function validateSetup(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Enter a review URL.");
  if (input.mode === "local") {
    if (typeof input.localPath !== "string" || !path.isAbsolute(input.localPath) || /[\0\r\n]/.test(input.localPath)) {
      throw new Error("Choose a local Git repository folder.");
    }
    let localPath;
    try { localPath = fs.realpathSync(input.localPath); }
    catch { throw new Error("The selected folder is no longer accessible. Choose it again."); }
    const result = validateLocalRepo(localPath);
    if (!result.ok) throw new Error(`Cannot open this folder: ${result.error} Choose the root of a Git repository.`);
    return { provider: "local", localPath, target: "", args: [`--local-repo=${localPath}`, "--local-only", "--offline"], credentials: {} };
  }
  if (input.mode && input.mode !== "remote") throw new Error("Choose local repository or remote review.");
  const { target, token } = input;
  if (typeof target !== "string" || target.length > 2048) throw new Error("Enter a review URL.");
  let url;
  try { url = new URL(target.trim()); } catch { throw new Error("Paste the full HTTPS pull request URL from your browser."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) {
    throw new Error("Use an HTTPS pull request URL without credentials, query parameters, or a fragment.");
  }
  const github = url.hostname === "github.com" && url.pathname.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/([1-9]\d*)\/?$/);
  if (github) {
    if (typeof token !== "string" || !token.trim() || token.length > 16384 || /[\r\n\0]/.test(token)) throw new Error("Enter a valid GitHub access token.");
    return { provider: "github", target: url.href, args: [`github:${github[1]}/${github[2]}#${github[3]}`], credentials: { TIPPANI_GH_TOKEN: token.trim() } };
  }
  const ado = url.hostname === "dev.azure.com" && url.pathname.match(/^\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/([1-9]\d*)\/?$/i);
  if (ado) {
    let parts;
    try { parts = ado.slice(1, 4).map(decodeURIComponent); } catch { throw new Error("The review URL contains invalid escaping."); }
    if (parts.some(p => !p || /[/\\\0\r\n]/.test(p))) throw new Error("The review URL contains an invalid organization, project, or repository.");
    return {
      target: url.href,
      args: [ado[4], `--org=https://dev.azure.com/${encodeURIComponent(parts[0])}`, `--project=${parts[1]}`, `--repo=${parts[2]}`],
      provider: "ado", account: input.account, credentials: {},
    };
  }
  throw new Error("Use a github.com/owner/repo/pull/123 or dev.azure.com/org/project/_git/repo/pullrequest/123 URL.");
}

function saveTarget(home, target, localPath = "") {
  const dir = path.join(home, ".tippani");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, "desktop.json"), JSON.stringify({ target, localPath, mode: localPath ? "local" : "remote" }), { mode: 0o600 });
}

function loadTarget(home) {
  return loadSetup(home).target;
}

function loadSetup(home) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(home, ".tippani", "desktop.json"), "utf8"));
    return { target: typeof value.target === "string" ? value.target : "",
      localPath: typeof value.localPath === "string" ? value.localPath : "",
      mode: value.mode === "local" ? "local" : "remote" };
  } catch (error) {
    if (error.code === "ENOENT") return { target: "", localPath: "", mode: "remote" };
    throw new Error("Saved desktop setup could not be read. You can enter the review URL again; existing review data is unchanged.");
  }
}

module.exports = { validateSetup, saveTarget, loadTarget, loadSetup };
