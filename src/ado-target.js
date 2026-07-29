// Pure write-target resolver (clickstop 2, repo-agnostic authoring).
//
// The review flow keeps a single "current target" in the module globals
// ADO_REPO/ADO_PROJECT because a review session is scoped to one open PR. The
// authoring write path has NO PR to define the repo, so it must never lean on
// those globals — it would inherit the last-opened PR's repo or the boot-config
// default (an invisible, wrong target). Instead every write names its target
// explicitly. This module validates + normalizes those coordinates; index.js
// resolves them to a live {conn, repoId, projectId} via getRepository.
//
// The rule: `project` and `repo` are REQUIRED for a write (a missing one is an
// error, not a guess). `org` defaults to the configured ADO org. There is NO
// fallback to the configured default repo for a write.

export class WriteTargetError extends Error {
  constructor(message) { super(message); this.name = "WriteTargetError"; this.code = "WRITE_TARGET"; }
}

function normalizeOrg(org) {
  let o = String(org || "").trim().replace(/\/+$/, "");
  if (o && !/^https?:\/\//i.test(o)) o = "https://" + o;
  return o;
}

/** Validate + normalize explicit write coordinates. Throws WriteTargetError when
 *  project or repo is missing (never falls back to a configured default repo).
 *  `org` defaults to defaultOrg (the configured ADO org) when omitted. */
export function resolveWriteTarget({ org, project, repo } = {}, { defaultOrg } = {}) {
  const project2 = typeof project === "string" ? project.trim() : "";
  const repo2 = typeof repo === "string" ? repo.trim() : "";
  if (!project2) throw new WriteTargetError("project is required for a write (Tippani never guesses the repo)");
  if (!repo2) throw new WriteTargetError("repo is required for a write (Tippani never guesses the repo)");
  const org2 = normalizeOrg(org) || normalizeOrg(defaultOrg);
  if (!org2) throw new WriteTargetError("no ADO org configured and none provided");
  return { org: org2, project: project2, repo: repo2 };
}

/** Stable composite key for the staged-draft store, scoped by project+repo so a
 *  same-named repo in another project can't collide. Branch + path complete it. */
export function draftKeyOf({ project, repo, branch, path } = {}) {
  return `${project || ""}\n${repo || ""}\n${branch || ""}\n${path || ""}`;
}
