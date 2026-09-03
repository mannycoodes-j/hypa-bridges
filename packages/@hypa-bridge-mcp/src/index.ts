/**
 * Bridge MCP server entrypoint.
 *
 * Exposes high-level Bridge tools (translate, understand, respond, speak,
 * voice, dictionary, summary) over Streamable HTTP on port 5183 by default.
 * Requires a server-side HYPA_API_KEY (see .env.example); the key is never
 * exposed by the MCP server itself — it lives only inside @hypa/bridge-core.
 */

import { loadConfig } from "./config.js";
import { createBridgeMcp } from "./http.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const http = createBridgeMcp(config);
  const { url } = await http.listen(config.port, config.host);
  console.log(`hypa-bridge MCP listening on ${url}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
