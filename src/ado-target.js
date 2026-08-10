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
// The rule: `org`, `project`, AND `repo` are ALL REQUIRED for a write (a missing
// one is an error, not a guess). A write NEVER inherits a configured default for
// any coordinate — the saved config org/project/repo apply ONLY to PR review
// (open a PR by id, list PRs), never to an authoring write.

export class WriteTargetError extends Error {
  constructor(message) { super(message); this.name = "WriteTargetError"; this.code = "WRITE_TARGET"; }
}

function normalizeOrg(org) {
  let o = String(org || "").trim().replace(/\/+$/, "");
  if (o && !/^https?:\/\//i.test(o)) o = "https://" + o;
  return o;
}

/** Validate + normalize explicit write coordinates. Throws WriteTargetError when
 *  ANY of org / project / repo is missing — a write never inherits a configured
 *  default for any coordinate (defaults are for PR review only). */
export function resolveWriteTarget({ org, project, repo } = {}) {
  const org2 = normalizeOrg(org);
  const project2 = typeof project === "string" ? project.trim() : "";
  const repo2 = typeof repo === "string" ? repo.trim() : "";
  if (!org2) throw new WriteTargetError("org is required for a write (defaults apply only to PR review, never to a write)");
  if (!project2) throw new WriteTargetError("project is required for a write (Tippani never guesses the target)");
  if (!repo2) throw new WriteTargetError("repo is required for a write (Tippani never guesses the target)");
  return { org: org2, project: project2, repo: repo2 };
}

/** Stable composite key for the staged-draft store, scoped by project+repo so a
 *  same-named repo in another project can't collide. Branch + path complete it. */
export function draftKeyOf({ project, repo, branch, path } = {}) {
  return `${project || ""}\n${repo || ""}\n${branch || ""}\n${path || ""}`;
}
