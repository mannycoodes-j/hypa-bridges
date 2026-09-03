/**
 * Bridge MCP server — high-level, product-shaped tools over @hypa/bridge-core.
 * Each tool maps 1:1 to a Bridge capability, so behaviour stays identical to
 * the HTTP BFF. The API key never appears here; it lives inside the core
 * HypaClient (server-side only).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeError } from "@hypa/bridge-core";
import type { Bridge } from "@hypa/bridge-core";
import {
  conversationSummaryOutputSchema,
  conversationSummarySchema,
  generateResponseOutputSchema,
  generateResponseSchema,
  lookUpTermOutputSchema,
  lookUpTermSchema,
  processVoiceMessageOutputSchema,
  processVoiceMessageSchema,
  translateAndSpeakOutputSchema,
  translateAndSpeakSchema,
  translateMessageOutputSchema,
  translateMessageSchema,
  understandMessageOutputSchema,
  understandMessageSchema,
} from "./schemas.js";

export interface BridgeMcpServer {
  server: McpServer;
  bridge: Bridge;
}

const jsonContent = (value: unknown) => ({ type: "text" as const, text: JSON.stringify(value) });

// Every Bridge tool queries a live external AI service and mutates no state, so
// all of them are read-only, open-world, non-destructive. Declared once so the
// seven registrations below stay small.
const toolAnnotations = {
  readOnlyHint: true,
  openWorldHint: true,
  destructiveHint: false,
};

/** Catch core errors and surface them as MCP errors instead of raw throws. */
const guard = async <T>(fn: () => Promise<T>): Promise<{
  content: { type: "text"; text: string }[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}> => {
  try {
    const value = await fn();
    // The tool's outputSchema makes the SDK validate structuredContent, so hand
    // it the same object we render as text — models get both a readable message
    // and typed fields.
    return {
      content: [jsonContent(value)],
      structuredContent: value as Record<string, unknown>,
    };
  } catch (e) {
    if (e instanceof BridgeError) {
      return {
        content: [jsonContent({ error: { code: e.code, message: e.message } })],
        isError: true,
      };
    }
    return {
      content: [jsonContent({ error: { code: "INTERNAL", message: e instanceof Error ? e.message : "Unknown error" } })],
      isError: true,
    };
  }
};

export function createBridgeMcpServer(bridge: Bridge): BridgeMcpServer {
  const server = new McpServer(
    {
      name: "hypa-bridge",
      version: "0.1.0",
    },
    { capabilities: {} },
  );

  server.registerTool(
    "translate_message",
    {
      title: "Translate a message",
      description:
        "Translate a short spoken or written message into another language. Use this whenever one person needs to understand the other in a cross-language conversation.",
      annotations: toolAnnotations,
      outputSchema: translateMessageOutputSchema,
      inputSchema: translateMessageSchema,
    },
    ({ text, sourceLang, targetLang }) =>
      guard(() => bridge.translateMessage({ text, sourceLang, targetLang })),
  );

  server.registerTool(
    "understand_message",
    {
      title: "Explain the meaning of a message",
      description:
        "Explain what a message really means — including tone, idiom and cultural nuance — in plain language the reader understands. For when a literal translation isn't enough.",
      annotations: toolAnnotations,
      outputSchema: understandMessageOutputSchema,
      inputSchema: understandMessageSchema,
    },
    ({ text, textLang, meaningLang, context }) =>
      guard(() => bridge.understandMessage({ text, textLang, meaningLang, context })),
  );

  server.registerTool(
    "generate_response",
    {
      title: "Suggest how to reply",
      description:
        "Write 3 short, natural replies (in replyLang) to a received message, differing in tone: one light, one warm, one that asks a follow-up. For the 'help me respond' moment.",
      annotations: toolAnnotations,
      outputSchema: generateResponseOutputSchema,
      inputSchema: generateResponseSchema,
    },
    ({ text, textLang, replyLang, context }) =>
      guard(() => bridge.generateResponse({ text, textLang, replyLang, context })),
  );

  server.registerTool(
    "translate_and_speak",
    {
      title: "Translate and speak aloud",
      description:
        "Translate a message and synthesise speech of the translation (WAV audio). Use when the other person should hear the message in their own language.",
      annotations: toolAnnotations,
      outputSchema: translateAndSpeakOutputSchema,
      inputSchema: translateAndSpeakSchema,
    },
    ({ text, sourceLang, targetLang, voice }) =>
      guard(() => bridge.translateAndSpeak({ text, sourceLang, targetLang, voice })),
  );

  server.registerTool(
    "process_voice_message",
    {
      title: "Process a voice message",
      description:
        "Transcribe a recorded voice message into text, optionally translating the transcript into another language in one step.",
      annotations: toolAnnotations,
      outputSchema: processVoiceMessageOutputSchema,
      inputSchema: processVoiceMessageSchema,
    },
    ({ audio, audioType, sourceLang, targetLang }) =>
      guard(() =>
        bridge.processVoiceMessage({ audio, audioType, sourceLang, targetLang }),
      ),
  );

  server.registerTool(
    "look_up_term",
    {
      title: "Look up a word or phrase",
      description:
        "Look up a word in the Hypa dictionary: meanings, usage, similar/opposite words, and cultural context.",
      annotations: toolAnnotations,
      outputSchema: lookUpTermOutputSchema,
      inputSchema: lookUpTermSchema,
    },
    ({ word, language }) => guard(() => bridge.lookUpTerm({ word, language })),
  );

  server.registerTool(
    "conversation_summary",
    {
      title: "Summarise a conversation",
      description:
        "Write a short recap of a two-person conversation — what was discussed, decisions, questions left open, and the mood — in a chosen language.",
      annotations: toolAnnotations,
      outputSchema: conversationSummaryOutputSchema,
      inputSchema: conversationSummarySchema,
    },
    ({ turns, targetLang }) =>
      guard(() => bridge.summariseConversation({ turns, targetLang })),
  );

  return { server, bridge };
}
