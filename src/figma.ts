import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
  lastActivity: number;
}

let ws: WebSocket | null = null;
let currentChannel: string | null = null;
const pendingRequests = new Map<string, PendingRequest>();

const WS_PORT = 3055;
const WS_URL = `ws://localhost:${WS_PORT}`;

export function connectToFigma(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }

    if (ws) {
      ws.removeAllListeners();
      ws = null;
    }

    ws = new WebSocket(WS_URL);

    const connectionTimeout = setTimeout(() => {
      if (ws && ws.readyState === WebSocket.CONNECTING) {
        ws.terminate();
        reject(new Error("Connection to Figma timed out"));
      }
    }, 10000);

    ws.on("open", () => {
      clearTimeout(connectionTimeout);
      currentChannel = null;
      resolve();
    });

    ws.on("message", (data: WebSocket.Data) => {
      try {
        const json = JSON.parse(data.toString());

        // Handle progress updates — reset timeout
        if (json.type === "progress_update") {
          const requestId = json.id || "";
          if (requestId && pendingRequests.has(requestId)) {
            const request = pendingRequests.get(requestId)!;
            request.lastActivity = Date.now();
            clearTimeout(request.timeout);
            request.timeout = setTimeout(() => {
              if (pendingRequests.has(requestId)) {
                pendingRequests.delete(requestId);
                request.reject(new Error("Request timed out during progress"));
              }
            }, 120000);
          }
          return;
        }

        // Handle regular responses
        const myResponse = json.message;
        if (
          myResponse?.id &&
          pendingRequests.has(myResponse.id) &&
          myResponse.result
        ) {
          const request = pendingRequests.get(myResponse.id)!;
          clearTimeout(request.timeout);

          if (myResponse.error) {
            request.reject(new Error(myResponse.error));
          } else {
            request.resolve(myResponse.result);
          }

          pendingRequests.delete(myResponse.id);
        }
      } catch {
        // Ignore parse errors
      }
    });

    ws.on("error", () => {
      // Let close handler deal with cleanup
    });

    ws.on("close", () => {
      clearTimeout(connectionTimeout);
      ws = null;

      for (const [id, request] of pendingRequests.entries()) {
        clearTimeout(request.timeout);
        request.reject(new Error("Connection closed"));
        pendingRequests.delete(id);
      }
    });
  });
}

export async function joinChannel(channelName: string): Promise<void> {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error("Not connected to Figma");
  }

  await sendCommand("join", { channel: channelName });
  currentChannel = channelName;

  // Verify the channel is live
  try {
    await sendCommand("ping", {}, 12000);
  } catch {
    currentChannel = null;
    throw new Error(
      `Failed to verify channel "${channelName}". Is the Figma plugin connected?`
    );
  }
}

export function sendCommand(
  command: string,
  params: Record<string, unknown> = {},
  timeoutMs: number = 60000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error("Not connected to Figma"));
      return;
    }

    if (command !== "join" && !currentChannel) {
      reject(new Error("Must join a channel before sending commands"));
      return;
    }

    const id = uuidv4();
    const request = {
      id,
      type: command === "join" ? "join" : "message",
      ...(command === "join"
        ? { channel: (params as { channel: string }).channel }
        : { channel: currentChannel }),
      message: {
        id,
        command,
        params: { ...params, commandId: id },
      },
    };

    const timeout = setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Request timed out after ${timeoutMs / 1000}s`));
      }
    }, timeoutMs);

    pendingRequests.set(id, {
      resolve,
      reject,
      timeout,
      lastActivity: Date.now(),
    });

    ws.send(JSON.stringify(request));
  });
}

export async function exportNodeAsImage(
  nodeId: string,
  scale: number = 2
): Promise<{ imageData: string; mimeType: string }> {
  const result = (await sendCommand(
    "export_node_as_image",
    { nodeId, format: "PNG", scale },
    120000
  )) as { imageData: string; mimeType: string };

  return result;
}

export function isConnected(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

export function getChannel(): string | null {
  return currentChannel;
}
