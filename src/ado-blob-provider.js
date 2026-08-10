// Azure DevOps BlobProvider transport: authenticated binary reads with
// download=true and resolveLfs=true. Path resolution/containment, MIME type,
// security headers, and defensive isLfsPointer rejection stay above the seam.

import { toVersionDescriptor } from "./pr-version.js";

export function createAdoBlobProvider(
  conn,
  {
    getRepo = () => null,
    getProject = () => null,
  } = {},
) {
  if (!conn) throw new Error("ADO blob provider requires a connection");

  let cachedGitApi = null;
  async function getGitApi() {
    if (cachedGitApi) return cachedGitApi;
    const api = await conn.getGitApi();
    cachedGitApi = api;
    return api;
  }

  async function getBlob(
    filePath,
    version,
    options = {},
  ) {
    const gitApi = await getGitApi();
    const targetRepo = Object.prototype.hasOwnProperty.call(options, "repo")
      ? options.repo
      : getRepo();
    const targetProject =
      Object.prototype.hasOwnProperty.call(options, "project")
        ? options.project
        : getProject();
    const item = await gitApi.getItemContent(
      targetRepo,
      filePath,
      targetProject,
      undefined,
      undefined,
      undefined,
      undefined,
      true,                      // download: raw bytes
      toVersionDescriptor(version),
      undefined,
      true,                      // resolveLfs: real object, not pointer text
    );
    const chunks = [];
    for await (const chunk of item) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  return { getBlob };
}
