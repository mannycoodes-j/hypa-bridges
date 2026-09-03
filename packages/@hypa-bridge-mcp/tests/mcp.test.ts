/**
 * Offline MCP tests — drive the real Streamable HTTP transport with a stubbed
 * Bridge, so tool discovery, schema validation, and error normalisation are
 * verified deterministically without the network. (The live self-check covers
 * real Hypa calls separately.)
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { BridgeError } from "@hypa/bridge-core";
import type { Bridge } from "@hypa/bridge-core";
import { createBridgeMcp } from "../src/http.js";
import type { McpConfig } from "../src/config.js";

const EXPECTED_TOOLS = [
  "translate_message",
  "understand_message",
  "generate_response",
  "translate_and_speak",
  "process_voice_message",
  "look_up_term",
  "conversation_summary",
];

const stubBridge = (): Bridge =>
  ({
    translateMessage: async () => {
      throw new BridgeError({ code: "UNAUTHORIZED", message: "Key rejected", status: 401 });
    },
    understandMessage: async () => ({ meaning: "They are being polite." }),
    generateResponse: async () => ({ suggestions: ["Yes please", "Tell me more"] }),
    translateAndSpeak: async () => ({
      translatedText: "Bonjour",
      audioBase64: "V0FW",
      voice: "Dauda",
      mime: "audio/wav",
    }),
    processVoiceMessage: async () => ({ transcript: "Bonjour" }),
    lookUpTerm: async () => ({ result: { word: "salut" } }),
    summariseConversation: async () => ({ summary: "They said hello." }),
  }) as unknown as Bridge;

const config: McpConfig = {
  hypaApiUrl: "https://api.hypaintelligence.com",
  hypaApiKey: "test-key",
  port: 0,
  host: "127.0.0.1",
};

interface ToolCallLike {
  content?: unknown;
  isError?: boolean;
}

const textOf = (result: ToolCallLike): string => {
  if (!Array.isArray(result.content)) return "";
  return result.content
    .filter((item): item is { text?: unknown } => !!item && typeof item === "object")
    .map((item) => (typeof item.text === "string" ? item.text : ""))
    .join("\n");
};

let client: Client;
let close: () => Promise<void>;

before(async () => {
  const http = createBridgeMcp(config, stubBridge());
  const { url, close: stop } = await http.listen(0);
  close = stop;
  client = new Client(
    { name: "hypa-bridge-test", version: "0.0.0" },
    { capabilities: {} },
  );
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
});

after(async () => {
  await client.close().catch(() => undefined);
  await close();
});

test("tools/list exposes the seven bridge tools", async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [...EXPECTED_TOOLS].sort());
});

test("validation rejects missing required fields", async () => {
  const result = (await client.callTool({
    name: "translate_message",
    arguments: { text: "Good morning" },
  })) as unknown as ToolCallLike;
  assert.equal(result.isError, true);
  assert.match(textOf(result), /targetLang|Required|invalid/i);
});

test("BridgeError becomes a structured, non-secret tool error", async () => {
  const result = (await client.callTool({
    name: "translate_message",
    arguments: { text: "Good morning", targetLang: "French" },
  })) as unknown as ToolCallLike;
  assert.equal(result.isError, true);
  const text = textOf(result);
  const parsed = JSON.parse(text) as { error: { code: string; message: string } };
  assert.equal(parsed.error.code, "UNAUTHORIZED");
  assert.equal(parsed.error.message, "Key rejected");
});

test("a successful tool call returns its JSON result", async () => {
  const result = (await client.callTool({
    name: "understand_message",
    arguments: {
      text: "Ça va",
      textLang: "French",
      meaningLang: "English",
    },
  })) as unknown as ToolCallLike;
  assert.equal(result.isError, undefined);
  const parsed = JSON.parse(textOf(result)) as { meaning: string };
  assert.equal(parsed.meaning, "They are being polite.");
});

test("audio payload is accepted (large body)", async () => {
  const result = (await client.callTool({
    name: "process_voice_message",
    arguments: { audio: "AAAA", sourceLang: "French" },
  })) as unknown as ToolCallLike;
  assert.equal(result.isError, undefined);
  const parsed = JSON.parse(textOf(result)) as { transcript: string };
  assert.equal(parsed.transcript, "Bonjour");
});
