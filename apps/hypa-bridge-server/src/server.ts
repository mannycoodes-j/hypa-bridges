/**
 * Bridge BFF entry point.
 *
 * Usage (from this directory):
 *   yarn dev          # tsx watch, loads .env.local / .env
 *
 * Env:
 *   HYPA_API_URL   Hypa developer-API origin (default https://api.hypaintelligence.com)
 *   HYPA_API_KEY   Hypa developer API key (required — server-side only)
 *   PORT           listen port (default 5182)
 *   HOST           listen host (default 0.0.0.0)
 *   CORS_ORIGINS   comma-separated browser origins (default the Vite dev origin)
 */

import { Bridge } from "@hypa/bridge-core";
import { createApp } from "./app";
import { loadConfig, tryLoadEnvFiles } from "./config";

tryLoadEnvFiles();

const config = loadConfig();

if (!config.apiKey) {
  console.error(
    "[bridge-server] HYPA_API_KEY is not set. The server cannot reach the Hypa API.",
  );
  console.error(
    "[bridge-server] Create apps/hypa-bridge-server/.env.local with HYPA_API_KEY=<key> " +
      "(and HYPA_API_URL if not the hosted API), then restart.",
  );
  process.exit(1);
}

const bridge = new Bridge({
  apiUrl: config.apiUrl,
  apiKey: config.apiKey,
});

const app = createApp(bridge, config);

app.listen(config.port, config.host, () => {
  console.log(
    `[bridge-server] listening on http://${config.host}:${config.port} (api: ${config.apiUrl})`,
  );
});
