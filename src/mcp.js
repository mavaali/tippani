#!/usr/bin/env node
// Tippani MCP shim — exposes the control API (#42 Phase 2) as an MCP
// stdio server so LLM clients (Claude Desktop, GitHub Copilot, etc.)
// can drive tippani via tool calls.
//
// Architecture: this is a thin client. The real state lives in the running
// tippani process (default http://localhost:3847). The shim reads the
// session token from ~/.tippani/session-token (written by tippani at
// startup) and proxies every tool call to an HTTP endpoint under
// /api/v1/*. No business logic here.
//
// Usage in Claude Desktop config:
//   {
//     "mcpServers": {
//       "tippani": { "command": "npx", "args": ["-y", "tippani-mcp"] }
//     }
//   }

import fs from "fs";
import path from "path";
import os from "os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  buildTools,
  createHttpClient,
  loadSessionToken,
} from "./mcp-tools.js";

const BASE_URL = process.env.TIPPANI_URL || "http://localhost:3847";
const TOKEN_PATH = process.env.TIPPANI_TOKEN_FILE
  || path.join(os.homedir(), ".tippani", "session-token");
const CLIENT_NAME = process.env.TIPPANI_CLIENT_NAME || "tippani-mcp";

const token = loadSessionToken(TOKEN_PATH);
if (!token) {
  console.error(
    `tippani-mcp: no session token at ${TOKEN_PATH}.\n` +
    `Start tippani first (it writes the token at boot).`
  );
  process.exit(1);
}

const http = createHttpClient({ baseUrl: BASE_URL, token, clientName: CLIENT_NAME, fetch });
const tools = buildTools(http);

const server = new McpServer(
  { name: "tippani", version: "0.1.0" },
  { capabilities: { tools: {} } }
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

const transport = new StdioServerTransport();
await server.connect(transport);
