#!/usr/bin/env node
// Tippani MCP shim — exposes the control API as an MCP stdio server so LLM
// clients (Claude Desktop, GitHub Copilot, etc.) can drive tippani
// via tool calls.
//
// Architecture: this is a thin HTTP client. The real state lives in a tippani
// portal process (default http://localhost:3847). Unlike the original shim,
// this one does NOT require a portal to already be running — it launches and
// owns one on demand via the `open_pr` tool (see portal-launcher.js), so the
// MCP tool surface always exists and an agent can start a review from cold.
// The portal opens a visible browser for the user; the shim drives it.
//
// Auth: the embedding host injects the ADO REST/git token as TIPPANI_ADO_TOKEN.
// The launcher forwards it to the portal via env. The host may also set
// TIPPANI_ADO_AUDIENCE to have the shim verify the token's audience on startup.
//
// Usage in an MCP client config:
//   { "mcpServers": { "tippani": { "command": "tippani-mcp" } } }

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildTools, createHttpClient } from "./mcp-tools.js";
import {
  AUTHOR_SPEC_INSTRUCTIONS,
  AUTHOR_SPEC_PROMPT_NAME,
  authorSpecPromptConfig,
  authorSpecPromptMessages,
} from "./routing-directive.js";
import { createPortalSession } from "./portal-launcher.js";
import { inspectAdoToken, tokenRejectionMessage } from "./ado-token-check.js";
import { cliFallbackEnabled, acquireAdoTokenFromCli } from "./ado-token-cli.js";

// Give MCP "Test connection" real meaning: validate the bound account's ADO
// token before serving. If it isn't an Azure DevOps git/REST token (wrong
// account bound, e.g. GitHub), exit so Test fails with a clear reason instead
// of a false success.
//
// When no token was injected, mint one from the user's already-signed-in CLI
// first (Git Credential Manager, then Azure CLI). This is on by default and lets
// a standalone VS Code user run Tippani without a host injecting a token; disable
// it with TIPPANI_ADO_TOKEN_CLI_FALLBACK=0 in the MCP server's env.
if (!process.env.TIPPANI_ADO_TOKEN && cliFallbackEnabled()) {
  const cliToken = await acquireAdoTokenFromCli({ audience: process.env.TIPPANI_ADO_AUDIENCE });
  if (cliToken) process.env.TIPPANI_ADO_TOKEN = cliToken;
}
// A token is required only for the ADO surface (open_pr, list_prs, PR review).
// Local review (open_branch / open_branch_file / personal comments) reads a git
// clone with NO ADO at all — the portal already boots local-only without a
// token — so a MISSING token must not stop the server: it starts in local-only
// mode and the ADO tools return a clear "needs a token" error if used. A token
// that IS supplied but is the wrong kind (a GitHub token, expired, wrong
// audience) is still a misconfiguration, so we fail fast there and Test
// connection surfaces it instead of silently degrading.
if (process.env.TIPPANI_ADO_TOKEN) {
  const adoCheck = inspectAdoToken(process.env.TIPPANI_ADO_TOKEN, process.env.TIPPANI_ADO_AUDIENCE);
  if (!adoCheck.ok) {
    console.error(tokenRejectionMessage(adoCheck));
    process.exit(1);
  }
} else {
  console.error(
    "tippani-mcp: no Azure DevOps token \u2014 starting in local-only mode. " +
        "Local review (open_branch / open_branch_file / annotations) works " +
    "without one; ADO tools (open_pr, list_prs) will need a token."
  );
}

const session = createPortalSession({ reapOnStart: true });
const http = createHttpClient({
  getBaseUrl: session.getBaseUrl,
  getToken: session.getToken,
  clientName: session.clientName,
  fetch,
});
const tools = buildTools(http, session);

const server = new McpServer(
  { name: "tippani", version: "0.1.0" },
  // `instructions` is sent in the initialize response — the first guidance the
  // host model sees: author specs through Tippani's tools, never raw git/ADO.
  { capabilities: { tools: {}, prompts: {} }, instructions: AUTHOR_SPEC_INSTRUCTIONS }
);

// The author-spec prompt carries the same routing directive on demand.
server.registerPrompt(
  AUTHOR_SPEC_PROMPT_NAME,
  authorSpecPromptConfig,
  (args) => ({ messages: authorSpecPromptMessages(args || {}) })
);

for (const t of tools) {
  server.registerTool(
    t.name,
    { description: t.description, inputSchema: t.inputSchema },
    async (args) => {
      try {
        const result = await t.handler(args || {});
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e) {
        return {
          isError: true,
          content: [{ type: "text", text: String(e?.message || e) }],
        };
      }
    }
  );
}

// Tear our portals down however the host shuts us down. MCP hosts typically
// stop a stdio server by CLOSING stdin (not by sending a signal), so listening
// only for SIGINT/SIGTERM leaked every portal we owned. Cover all paths:
// signals, normal exit, and stdin EOF/close.
let stopped = false;
function shutdown(exit) {
  if (!stopped) { stopped = true; try { session.stop(); } catch {} }
  if (exit) process.exit(0);
}
process.on("SIGINT", () => shutdown(true));
process.on("SIGTERM", () => shutdown(true));
process.on("exit", () => shutdown(false));
process.stdin.on("end", () => shutdown(true));
process.stdin.on("close", () => shutdown(true));

const transport = new StdioServerTransport();
await server.connect(transport);
