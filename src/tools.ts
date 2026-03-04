import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  exportNodeAsImage,
  isConnected,
  getChannel,
  connectToFigma,
  joinChannel,
} from "./figma.js";
import {
  storeSnapshot,
  getSnapshotPair,
  listSnapshots,
  clearSnapshots,
} from "./storage.js";
import { compareImages } from "./compare.js";

export function registerTools(server: McpServer, channel: string | null) {
  // ── connect ──────────────────────────────────────────────────────
  server.tool(
    "connect",
    "Connect to Figma WebSocket and join a channel",
    {
      channel: z
        .string()
        .describe("Channel name to join (must match ClaudeTalkToFigma)"),
    },
    async ({ channel: ch }) => {
      try {
        if (!isConnected()) {
          await connectToFigma();
        }
        await joinChannel(ch);
        return {
          content: [
            {
              type: "text",
              text: `Connected and joined channel: ${ch}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error connecting: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ── take_snapshot ────────────────────────────────────────────────
  server.tool(
    "take_snapshot",
    "Export a Figma node as PNG and store it as a before/after snapshot for comparison",
    {
      nodeId: z.string().describe("Figma node ID to export"),
      label: z
        .string()
        .describe(
          "Label for this snapshot pair (e.g. 'page', 'header', 'pool-row')"
        ),
      type: z.enum(["before", "after"]).describe("Snapshot type"),
      scale: z
        .number()
        .positive()
        .default(2)
        .describe("Export scale (default 2)"),
    },
    async ({ nodeId, label, type, scale }) => {
      try {
        if (!isConnected() || !getChannel()) {
          return {
            content: [
              {
                type: "text",
                text: "Not connected to Figma. Use the 'connect' tool first with your channel name.",
              },
            ],
          };
        }

        const { imageData } = await exportNodeAsImage(nodeId, scale);

        storeSnapshot({
          nodeId,
          label,
          type,
          imageData,
          scale,
          timestamp: Date.now(),
        });

        // Estimate image size
        const sizeKb = Math.round((imageData.length * 3) / 4 / 1024);

        return {
          content: [
            {
              type: "text",
              text: `Snapshot stored: "${label}" (${type}) — node ${nodeId} at ${scale}x (~${sizeKb} KB)`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error taking snapshot: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ── compare_snapshots ────────────────────────────────────────────
  server.tool(
    "compare_snapshots",
    "Compare before/after snapshots for a label. Returns pixel diff statistics and optional diff image path.",
    {
      label: z.string().describe("Label of the snapshot pair to compare"),
      threshold: z
        .number()
        .min(0)
        .max(1)
        .default(0.1)
        .describe(
          "Color difference threshold (0 = exact, 1 = lenient). Default 0.1"
        ),
    },
    async ({ label, threshold }) => {
      try {
        const pair = getSnapshotPair(label);
        if (!pair) {
          return {
            content: [
              {
                type: "text",
                text: `No snapshots found for label "${label}". Use take_snapshot first.`,
              },
            ],
          };
        }

        if (!pair.before) {
          return {
            content: [
              {
                type: "text",
                text: `Missing "before" snapshot for "${label}". Take a before snapshot first.`,
              },
            ],
          };
        }

        if (!pair.after) {
          return {
            content: [
              {
                type: "text",
                text: `Missing "after" snapshot for "${label}". Take an after snapshot first.`,
              },
            ],
          };
        }

        const result = compareImages(
          pair.before.imageData,
          pair.after.imageData,
          label,
          threshold
        );

        const lines = [
          `Comparison result for "${label}":`,
          `  Match: ${result.matchPercentage}%`,
          `  Different pixels: ${result.differentPixels.toLocaleString()} / ${result.totalPixels.toLocaleString()}`,
          `  Dimensions match: ${result.dimensionsMatch}`,
          `  Before: ${result.beforeDimensions.width}x${result.beforeDimensions.height}`,
          `  After: ${result.afterDimensions.width}x${result.afterDimensions.height}`,
        ];

        if (result.diffImagePath) {
          lines.push(`  Diff image: ${result.diffImagePath}`);
        }

        if (result.matchPercentage === 100) {
          lines.push("  Result: PERFECT MATCH");
        } else if (result.matchPercentage >= 99.5) {
          lines.push("  Result: ACCEPTABLE (>99.5%)");
        } else {
          lines.push("  Result: MISMATCH — review diff image");
        }

        return {
          content: [
            {
              type: "text",
              text: lines.join("\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error comparing: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ── list_snapshots ───────────────────────────────────────────────
  server.tool(
    "list_snapshots",
    "List all stored snapshot pairs",
    {},
    async () => {
      const pairs = listSnapshots();
      if (pairs.length === 0) {
        return {
          content: [{ type: "text", text: "No snapshots stored." }],
        };
      }

      const lines = pairs.map(
        (p) =>
          `  ${p.label}: before=${p.hasBefore ? "yes" : "no"}, after=${p.hasAfter ? "yes" : "no"}`
      );

      return {
        content: [
          {
            type: "text",
            text: `Stored snapshots:\n${lines.join("\n")}`,
          },
        ],
      };
    }
  );

  // ── clear_snapshots ──────────────────────────────────────────────
  server.tool(
    "clear_snapshots",
    "Clear stored snapshots",
    {
      label: z
        .string()
        .optional()
        .describe(
          "Clear only this label. If omitted, clears all snapshots."
        ),
    },
    async ({ label }) => {
      const count = clearSnapshots(label);
      return {
        content: [
          {
            type: "text",
            text: label
              ? `Cleared snapshots for "${label}" (${count} removed).`
              : `Cleared all snapshots (${count} removed).`,
          },
        ],
      };
    }
  );

  // Auto-connect if channel was provided via CLI
  if (channel) {
    (async () => {
      try {
        await connectToFigma();
        await joinChannel(channel);
      } catch {
        // Will retry when user calls connect tool
      }
    })();
  }
}
