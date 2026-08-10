// Tests for the routing directive surfaces (clickstop 2, step 14).
import {
  AUTHORING_FLOW,
  AUTH_RECOVERY_DIRECTIVE,
  ROUTING_DIRECTIVE,
  AUTHOR_SPEC_INSTRUCTIONS,
  AUTHOR_SPEC_PROMPT_NAME,
  authorSpecPromptConfig,
  authorSpecPromptMessages,
  findToolsMissingDirective,
  WRITE_TOOL_NAMES,
} from "./routing-directive.js";
import { NEVER_RAW_RULE } from "./tool-hints.js";
import { buildTools } from "./mcp-tools.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }

// The directive names the flow and forbids raw git/ADO.
ok("flow names all four tools in order", AUTHORING_FLOW === "stage_branch → stage_spec → stage_spec_pr → push_staged_changes");
ok("directive embeds the never-raw rule", ROUTING_DIRECTIVE.includes(NEVER_RAW_RULE));
ok("directive names the flow", ROUTING_DIRECTIVE.includes(AUTHORING_FLOW));

// initialize.instructions carries the directive.
ok("instructions carry the directive", AUTHOR_SPEC_INSTRUCTIONS.includes(ROUTING_DIRECTIVE));
ok("instructions forbid raw git/ADO", /raw git/.test(AUTHOR_SPEC_INSTRUCTIONS) && /Azure DevOps MCP/.test(AUTHOR_SPEC_INSTRUCTIONS));
ok("instructions carry auth recovery", AUTHOR_SPEC_INSTRUCTIONS.includes(AUTH_RECOVERY_DIRECTIVE));
ok("auth recovery is triggered by ADO 401", /ADO-backed tool fails with HTTP 401/.test(AUTH_RECOVERY_DIRECTIVE));
ok("auth recovery closes portals before restart", /close_tippani/.test(AUTH_RECOVERY_DIRECTIVE));
ok("auth recovery permits host lifecycle or local termination", /host's MCP lifecycle controls/.test(AUTH_RECOVERY_DIRECTIVE) && /terminate.*tippani-mcp process/.test(AUTH_RECOVERY_DIRECTIVE));
ok("auth recovery retries exactly once", /Retry the original tool exactly once/.test(AUTH_RECOVERY_DIRECTIVE));
ok("auth recovery never round-trips tokens", /Never pass access tokens through chat or MCP tool arguments/.test(AUTH_RECOVERY_DIRECTIVE));

// The author-spec prompt.
ok("prompt name is author-spec", AUTHOR_SPEC_PROMPT_NAME === "author-spec");
ok("prompt config description carries the directive", authorSpecPromptConfig.description.includes(ROUTING_DIRECTIVE));
{
  const msgs = authorSpecPromptMessages({ repo: "MyRepo", branch: "spec/x", path: "docs/spec.md" });
  ok("prompt returns a user message", Array.isArray(msgs) && msgs[0].role === "user");
  ok("prompt message carries the directive", msgs[0].content.text.includes(NEVER_RAW_RULE));
  ok("prompt message echoes the target", /MyRepo/.test(msgs[0].content.text) && /spec\/x/.test(msgs[0].content.text));
  const bare = authorSpecPromptMessages();
  ok("prompt with no target still carries the directive", bare[0].content.text.includes(NEVER_RAW_RULE));
}

// Description lint: no write tool has drifted away from the directive.
{
  const tools = buildTools({}, {});
  const missing = findToolsMissingDirective(tools);
  ok("every write tool description carries the never-raw rule", missing.length === 0);
  // Sanity: the lint actually inspects the four tools (a typo'd name would make it vacuous).
  const names = new Set(tools.map((t) => t.name));
  ok("lint targets tools that exist", WRITE_TOOL_NAMES.every((n) => names.has(n)));
  // And it CATCHES drift: a stripped description is flagged.
  const drifted = tools.map((t) => (t.name === "stage_spec" ? { ...t, description: "no rule here" } : t));
  ok("lint catches a drifted description", findToolsMissingDirective(drifted).includes("stage_spec"));
}

console.log(`routing-directive: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
