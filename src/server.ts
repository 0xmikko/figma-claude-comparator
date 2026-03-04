#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

// Parse CLI args
const args = process.argv.slice(2);
const channelArg = args.find((a) => a.startsWith("--channel="));
const channel = channelArg ? channelArg.split("=")[1] : null;

async function main() {
  const server = new McpServer({
    name: "FigmaPixelCompare",
    description:
      "Pixel-perfect comparison of Figma node snapshots (before/after)",
    version: "1.0.0",
  });

  registerTools(server, channel);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(
    `Fatal: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
