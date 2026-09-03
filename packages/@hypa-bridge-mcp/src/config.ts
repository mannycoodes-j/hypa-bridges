/**
 * Environment for the Bridge MCP server.
 *
 * Values are read by name only — secrets are never logged or echoed. The API
 * key stays server-side; it is passed straight to @hypa/bridge-core which is
 * the only layer that talks to Hypa.
 */

export interface McpConfig {
  hypaApiUrl: string;
  hypaApiKey: string;
  port: number;
  host: string;
}

/** Best-effort .env loading (process.loadEnvFile throws when missing). */
const tryLoadEnvFiles = (): void => {
  for (const path of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(path);
    } catch {
      /* not present — rely on the environment */
    }
  }
};

export const loadConfig = (): McpConfig => {
  tryLoadEnvFiles();
  const hypaApiKey = process.env.HYPA_API_KEY;
  if (!hypaApiKey) {
    throw new Error(
      "HYPA_API_KEY is not set. Start the MCP server with a server-side Hypa developer key (see .env.example).",
    );
  }
  const parsedPort = Number.parseInt(process.env.PORT ?? "5183", 10);
  return {
    hypaApiKey,
    hypaApiUrl: process.env.HYPA_API_URL ?? "https://api.hypaintelligence.com",
    port: Number.isFinite(parsedPort) ? parsedPort : 5183,
    host: process.env.HOST ?? "127.0.0.1",
  };
};
