// Pure next-step hints + context echo for the remote-authoring MCP write tools
// (clickstop 2, step 13). Keeping these strings in one importable, tested module
// means every mutating tool ends with an honest "what to do next" line and
// echoes the resolved {repo,branch,path} so a stale ambient context is visible
// rather than silently acted on.

// The single source of the "author through tippani, never raw git/ADO" rule.
// Embedded in every write tool's description and (step 14) in the author-spec
// prompt + initialize.instructions, so a description lint can prove none drift.
export const NEVER_RAW_RULE =
  "Author specs through tippani's tools only — never edit files, push commits, " +
  "or open PRs with raw git or the Azure DevOps MCP.";

// The next step after each write tool succeeds.
export const NEXT_STEP_HINTS = {
  stage_branch: "Branch staged locally. Stage files and an optional PR intent, then call push_staged_changes when ready.",
  stage_spec: "File staged locally. Stage more changes or call push_staged_changes when ready.",
  stage_spec_pr: "PR intent staged locally. Call push_staged_changes when the branch and files are ready.",
  push_staged_changes: "Staged changes published. Review the per-target results and retry only failures.",
};

export function nextStep(tool) {
  return Object.prototype.hasOwnProperty.call(NEXT_STEP_HINTS, tool) ? NEXT_STEP_HINTS[tool] : null;
}

// Normalise the resolved context that a write tool echoes back.
export function echoContext({ repo = null, branch = null, path = null } = {}) {
  return { repo: repo || null, branch: branch || null, path: path || null };
}

// Attach the echoed context + next-step hint to a tool result.
export function withHints(tool, result = {}, context = {}) {
  return { ...result, context: echoContext(context), nextStep: nextStep(tool) };
}
