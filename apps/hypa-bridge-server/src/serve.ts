/**
 * Production entrypoint — serves the whole product from one process and one URL.
 *
 *   /             the built web app (apps/hypa-bridge/dist), with SPA fallback
 *   /api/*        the Bridge BFF routes
 *   /mcp          the Bridge MCP endpoint (Streamable HTTP) for AI agents
 *
 * This is the process a host (Render, Railway, Fly, a VPS) runs so that a single
 * public HTTPS URL serves the UI, the API, and the ChatGPT/Claude MCP endpoint.
 *
 * Usage:
 *   yarn workspace hypa-bridge build        # once — produces apps/hypa-bridge/dist
 *   yarn workspace hypa-bridge-server serve
 *
 * Env: same as the BFF (HYPA_API_KEY, HYPA_API_URL, PORT, HOST, CORS_ORIGINS,
 * MAX_BODY_BYTES), plus:
 *   STATIC_DIR  optional — where the web build lives (default ../hypa-bridge/dist
 *               relative to this workspace's directory).
 */

import express from "express";
import type { Express } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { Bridge } from "@hypa/bridge-core";
import { createApp } from "./app";
import { loadConfig, tryLoadEnvFiles } from "./config";

tryLoadEnvFiles();
const config = loadConfig();

if (!config.apiKey) {
  console.error(
    "[bridge-server] HYPA_API_KEY is not set. The server cannot reach the Hypa API.",
  );
  process.exit(1);
}

const bridge = new Bridge({
  apiUrl: config.apiUrl,
  apiKey: config.apiKey,
});

// Load the MCP factory at runtime (not via a static import): type-checking the
// @hypa/bridge-mcp package pulls the whole MCP SDK into this project's type
// graph, which is heavy. Here the BFF and the MCP layer stay type-independent —
// they meet only inside this process.
const requireFromThisPackage = createRequire(
  path.join(process.cwd(), "package.json"),
);
const { createBridgeMcp } = requireFromThisPackage(
  "@hypa/bridge-mcp",
) as {
  createBridgeMcp: (
    mcpConfig: { hypaApiUrl: string; hypaApiKey: string; port: number; host: string },
    bridge: Bridge,
  ) => { app: Express };
};

// One Express app, mounted left to right.
const server: Express = express();
server.disable("x-powered-by");
server.use(express.json({ limit: config.maxBodyBytes }));

// 1) MCP for AI agents — reachable at /mcp on this same URL.
const mcp = createBridgeMcp(
  {
    hypaApiUrl: config.apiUrl,
    hypaApiKey: config.apiKey,
    port: 0,
    host: "127.0.0.1",
  },
  bridge,
);
server.use(mcp.app);

// 2) The Bridge BFF routes — /api/* (health, models, translate, …).
server.use(createApp(bridge, config));

// 3) The built web app, with SPA fallback for client-side routes (/c/:id).
const staticDir = (
  process.env.STATIC_DIR ||
  path.join(process.cwd(), "..", "hypa-bridge", "dist")
).trim();
const indexFile = path.join(staticDir, "index.html");

if (existsSync(indexFile)) {
  server.use(express.static(staticDir));
  server.use((req, res, next) => {
    if (
      req.method === "GET" &&
      !req.path.startsWith("/api") &&
      !req.path.startsWith("/mcp")
    ) {
      res.sendFile(indexFile);
      return;
    }
    next();
  });
} else {
  console.warn(
    `[bridge-server] web build not found at ${staticDir}. Run \`yarn workspace hypa-bridge build\`. Serving /api and /mcp only.`,
  );
}

server.listen(config.port, config.host, () => {
  console.log(
    `[bridge-server] live on http://${config.host}:${config.port}  (web + /api + /mcp → ${config.apiUrl})`,
  );
});
