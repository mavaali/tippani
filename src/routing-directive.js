// Routing directive surfaces (clickstop 2, step 14). The single, pure source of
// the "author a spec through Tippani's tools, never raw git/ADO" guidance that
// appears in three places so a model can't miss it: the MCP `initialize`
// instructions (sent the moment the server connects), the `author-spec` prompt,
// and — via NEVER_RAW_RULE — every write tool's description. Keeping the text
// here (not inline in mcp.js, which connects a transport on import and so can't
// be unit-tested) lets routing-directive.test.mjs assert every surface carries
// it and that no tool description has drifted.
import { NEVER_RAW_RULE } from "./tool-hints.js";

// The end-to-end authoring flow, named so the model follows the tool chain.
export const AUTHORING_FLOW =
  "create_branch → stage_spec → push_spec → create_spec_pr";

// The core directive, embedded in the instructions and the prompt.
export const ROUTING_DIRECTIVE =
  `${NEVER_RAW_RULE} To author or change a spec, use the Tippani tools in order: ${AUTHORING_FLOW}. ` +
  "Each tool echoes the resolved {repo, branch, path} and tells you the next step; " +
  "follow that chain rather than reaching for git or the Azure DevOps MCP.";

// Sent as the MCP server's `initialize.instructions` — the first thing the host
// model sees on connect.
export const AUTHOR_SPEC_INSTRUCTIONS =
  "Tippani is the review + spec-authoring portal. " + ROUTING_DIRECTIVE;

export const AUTHOR_SPEC_PROMPT_NAME = "author-spec";

export const authorSpecPromptConfig = {
  title: "Author a spec",
  description:
    "Guide for authoring or editing a spec end-to-end through Tippani's tools. " +
    ROUTING_DIRECTIVE,
};

// The messages returned when the host invokes the author-spec prompt.
export function authorSpecPromptMessages({ repo, branch, path } = {}) {
  const target = [repo && `repo ${repo}`, branch && `branch ${branch}`, path && `file ${path}`]
    .filter(Boolean).join(", ");
  const scope = target ? ` Target: ${target}.` : "";
  return [
    {
      role: "user",
      content: {
        type: "text",
        text:
          `Author the spec through Tippani.${scope} ${ROUTING_DIRECTIVE} ` +
          "Start by calling create_branch (unless a branch is already open), then stage_spec, " +
          "then push_spec, then create_spec_pr. Do not edit files or push with raw git or the " +
          "Azure DevOps MCP.",
      },
    },
  ];
}

// Description lint: every remote-authoring write tool must carry the never-raw
// rule so the guidance can't drift out of a tool. Returns the offending tool
// names (empty = all good).
export const WRITE_TOOL_NAMES = ["create_branch", "stage_spec", "push_spec", "create_spec_pr"];
export function findToolsMissingDirective(tools) {
  const byName = Object.fromEntries((tools || []).map((t) => [t.name, t]));
  return WRITE_TOOL_NAMES.filter((n) => {
    const d = byName[n] && byName[n].description;
    return !d || !d.includes(NEVER_RAW_RULE);
  });
}
