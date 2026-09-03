/**
 * Bridge MCP over Streamable HTTP.
 *
 * Stateful session transport: initialize requests mint a session id, later
 * tool calls carry it in the `Mcp-Session-Id` header. The API key is only
 * ever inside the Bridge instance (server-side); nothing here reads or logs it.
 */

import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import { Bridge } from "@hypa/bridge-core";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpConfig } from "./config.js";
import { createBridgeMcpServer } from "./server.js";

export interface BridgeMcpHandle {
  app: express.Express;
  listen(port?: number, host?: string): Promise<{
    url: string;
    close: () => Promise<void>;
  }>;
}

const sendError = (res: express.Response, code: number, message: string): void => {
  res.status(code).json({ jsonrpc: "2.0", error: { code, message }, id: null });
};

export function createBridgeMcp(
  config: McpConfig,
  bridge: Bridge = new Bridge({ apiUrl: config.hypaApiUrl, apiKey: config.hypaApiKey }),
): BridgeMcpHandle {
  const { server } = createBridgeMcpServer(bridge);
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const app = express();

  app.use(express.json({ limit: "30mb" }));

  app.all("/mcp", async (req, res) => {
    const header = req.headers["mcp-session-id"];
    const sessionId = typeof header === "string" ? header : undefined;
    try {
      if (sessionId) {
        const transport = transports.get(sessionId);
        if (transport) {
          await transport.handleRequest(req, res, req.body);
          return;
        }
        sendError(res, 404, "Session not found");
        return;
      }
      if (req.method === "POST" && isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport);
          },
        });
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) transports.delete(sid);
        };
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }
      sendError(res, 400, "Bad Request: missing or unknown Mcp-Session-Id");
    } catch (error) {
      console.error("MCP request failed:", error);
      if (!res.headersSent) sendError(res, 500, "Internal server error");
    }
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "hypa-bridge-mcp" });
  });

  const listen = (port = 0, host = "127.0.0.1") =>
    new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
      const listener: Server = app.listen(port, host, () => {
        const address = listener.address();
        const actualPort =
          address && typeof address === "object" ? address.port : port;
        resolve({
          url: `http://${host}:${actualPort}/mcp`,
          close: () =>
            new Promise<void>((done) => listener.close(() => done())),
        });
      });
    });

  return { app, listen };
}
