/**
 * Self-check for the Bridge MCP server (npm run test).
 *
 * Boots the real HTTP server on an ephemeral port and drives it with an SDK
 * client: initialize, list tools, then one live tool call. Requires
 * HYPA_API_KEY (+ optional HYPA_API_URL) — skipped when the key is absent.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadConfig } from "./config.js";
import { createBridgeMcp } from "./http.js";

const EXPECTED_TOOLS = [
  "translate_message",
  "understand_message",
  "generate_response",
  "translate_and_speak",
  "process_voice_message",
  "look_up_term",
  "conversation_summary",
];

const fail = (message: string): never => {
  throw new Error(message);
};

interface ToolCallLike {
  content?: unknown;
  isError?: boolean;
}

/** Pull the plain-text pieces out of an MCP tool result. */
const resultText = (result: ToolCallLike): string => {
  if (!Array.isArray(result.content)) return "";
  return result.content
    .filter((item): item is { text?: unknown } => !!item && typeof item === "object")
    .map((item) => (typeof item.text === "string" ? item.text : ""))
    .join("\n");
};

async function run(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch {
    console.log("SKIP — HYPA_API_KEY not set (set it to run the live self-check)");
    return;
  }

  const http = createBridgeMcp(config);
  const { url, close } = await http.listen(0);
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const client = new Client(
    { name: "hypa-bridge-selfcheck", version: "0.0.0" },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    for (const expected of [...EXPECTED_TOOLS].sort()) {
      if (!names.includes(expected)) fail(`missing tool ${expected}`);
    }
    console.log(`PASS tools/list — ${names.length} tools registered`);

    // Validation errors need no network — verify first so upstream hiccups
    // can't mask broken input handling.
    const rawBad = await client.callTool({
      name: "translate_message",
      arguments: { text: "Good morning" },
    });
    const bad = rawBad as unknown as ToolCallLike;
    if (!bad.isError) fail("expected a validation error for missing targetLang");
    console.log("PASS tools/call invalid input → structured error");

    const rawOk = await client.callTool({
      name: "translate_message",
      arguments: { text: "Good morning", targetLang: "French" },
    });
    const ok = rawOk as unknown as ToolCallLike;
    if (ok.isError) fail(`translate failed: ${resultText(ok)}`);
    const translation = resultText(ok);
    if (!translation.includes("Bonjour")) fail(`unexpected translation: ${translation}`);
    console.log(`PASS tools/call translate_message — ${translation.slice(0, 60)}`);

    console.log("SELFCHECK PASS");
  } finally {
    await client.close().catch(() => undefined);
    await close();
  }
}

run().catch((error: unknown) => {
  console.error("SELFCHECK FAIL:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
