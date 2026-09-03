/**
 * Bridge facade tests — product behaviour over a mocked fetch: request
 * shaping (validation), prompt composition counts, and normalisation
 * (singleLine, suggestions parsing, empty-guards). All offline.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { Bridge, BridgeError } from "../src/index.js";

const SSE = (content: string): string =>
  `data: ${JSON.stringify({
    choices: [{ message: { content } }],
    usage: { total_tokens: 4 },
  })}\n\ndata: [DONE]\n\n`;

const JSON_RES = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

type RouteHandler = (body: Record<string, unknown>) => Response;
const jsonBody = (init?: RequestInit): Record<string, unknown> =>
  JSON.parse(String(init?.body)) as Record<string, unknown>;

/** fetch stub dispatching on the request path. */
const makeFetch = (routes: Record<string, RouteHandler>) =>
  async (url: string, init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "").split("?")[0]!;
    const handler = routes[path];
    if (!handler) throw new Error(`Unexpected fetch: ${path}`);
    return handler(jsonBody(init));
  };

const bridgeWith = (routes: Record<string, RouteHandler>): Bridge =>
  new Bridge({
    apiUrl: "https://api.hypaintelligence.com",
    apiKey: "test-key-server-side-only",
    fetchImpl: makeFetch(routes),
  });

test("translateMessage trims text and returns the translation", async () => {
  const bridge = bridgeWith({
    "/v2/developer/mt": () => new Response(SSE("Bonjour")),
  });
  const res = await bridge.translateMessage({ text: "  hi  ", targetLang: "French" });
  assert.equal(res.translation, "Bonjour");
});

test("translateMessage rejects empty text / missing target", async () => {
  const bridge = bridgeWith({});
  await assert.rejects(
    () => bridge.translateMessage({ text: "   ", targetLang: "French" }),
    (e: unknown) => e instanceof BridgeError && e.code === "BAD_REQUEST",
  );
  await assert.rejects(
    () => bridge.translateMessage({ text: "hi", targetLang: "" }),
    (e: unknown) => e instanceof BridgeError && e.code === "BAD_REQUEST",
  );
});

test("understandMessage collapses content to one clean sentence", async () => {
  const bridge = bridgeWith({
    "/v2/developer/chat": () => new Response(SSE("They are   just\nbeing polite .")),
  });
  const res = await bridge.understandMessage({
    text: "Ça va",
    textLang: "French",
    meaningLang: "English",
  });
  assert.equal(res.meaning, "They are just being polite.");
});

test("understandMessage passes context through into the prompt", async () => {
  let prompt = "";
  const bridge = bridgeWith({
    "/v2/developer/chat": (body) => {
      const messages = body.messages as { role: string; content: string }[];
      prompt = messages.at(-1)?.content ?? "";
      return new Response(SSE("They are happy"));
    },
  });
  await bridge.understandMessage({
    text: "Merci",
    textLang: "French",
    meaningLang: "English",
    context: "[You] hello",
  });
  assert.match(prompt, /Additional context from the listener/);
  assert.match(prompt, /\[You\] hello/);
});

test("generateResponse parses exactly 3 bullet suggestions", async () => {
  const bridge = bridgeWith({
    "/v2/developer/chat": () =>
      new Response(
        SSE("- Good morning!\n- How have you been?\n- Want to grab lunch later?"),
      ),
  });
  const res = await bridge.generateResponse({
    text: "Good morning",
    replyLang: "English",
  });
  assert.equal(res.suggestions.length, 3);
  assert.equal(res.suggestions[0], "Good morning!");
});

test("generateResponse translates the inbound message first when languages differ", async () => {
  const calls: string[] = [];
  const bridge = bridgeWith({
    "/v2/developer/mt": () => {
      calls.push("mt");
      return new Response(SSE("Good morning"));
    },
    "/v2/developer/chat": () => {
      calls.push("chat");
      return new Response(SSE("- Good morning!\n- How are you?\n- Let's talk soon."));
    },
  });
  const res = await bridge.generateResponse({
    text: "Buenos días",
    textLang: "Spanish",
    replyLang: "English",
  });
  assert.deepEqual(calls, ["mt", "chat"]);
  assert.equal(res.suggestions.length, 3);
});

test("generateResponse falls back to sentences when bullets are missing", async () => {
  const bridge = bridgeWith({
    "/v2/developer/chat": () =>
      new Response(SSE("Here are some options:\nSounds good!\nLet me check and get back to you.")),
  });
  const res = await bridge.generateResponse({ text: "ok", replyLang: "English" });
  assert.ok(res.suggestions.length >= 2, "expected a fallback list");
  assert.ok(!res.suggestions.some((s) => s.startsWith("Here")), "preamble dropped");
});

test("summariseConversation requires turns and collapses the summary", async () => {
  const bridge = bridgeWith({
    "/v2/developer/chat": () =>
      new Response(SSE("They discussed lunch.\nThey will meet   tomorrow.")),
  });
  const res = await bridge.summariseConversation({
    turns: [
      { speaker: "you", language: "English", text: "Lunch tomorrow?" },
      { speaker: "them", language: "French", text: "Oui, à midi." },
    ],
    targetLang: "English",
  });
  assert.equal(res.summary, "They discussed lunch. They will meet tomorrow.");
  await assert.rejects(
    () => bridge.summariseConversation({ turns: [], targetLang: "English" }),
    (e: unknown) => e instanceof BridgeError && e.code === "BAD_REQUEST",
  );
});

test("speak returns WAV audio with the chosen language/voice", async () => {
  let body: Record<string, unknown> | undefined;
  const bridge = new Bridge({
    apiUrl: "https://api.hypaintelligence.com",
    apiKey: "k",
    fetchImpl: async (url, init) => {
      body = JSON.parse(String(init?.body));
      return JSON_RES({
        response: { audio_b64: "V0FW", sample_rate: 24000, audio_type: "audio/wav" },
        voice: "Eniola",
      });
    },
  });
  const res = await bridge.speak({ text: "Bonjour", language: "french", voice: "Eniola" });
  assert.equal(res.audioBase64, "V0FW");
  assert.equal(res.mime, "audio/wav");
  assert.equal(body?.language, "french");
});

test("processVoiceMessage transcribes, and translates when targetLang is set", async () => {
  const seen: string[] = [];
  const bridge = bridgeWith({
    "/v2/developer/asr": () => {
      seen.push("asr");
      return JSON_RES({ response: { text: "Bonjour" } });
    },
    "/v2/developer/mt": () => {
      seen.push("mt");
      return new Response(SSE("Good morning"));
    },
  });

  const plain = await bridge.processVoiceMessage({ audio: "AAAA" });
  assert.deepEqual(seen, ["asr"]);
  assert.equal(plain.transcript, "Bonjour");
  assert.equal(plain.translatedText, undefined);

  const translated = await bridge.processVoiceMessage({
    audio: "AAAA",
    targetLang: "English",
    sourceLang: "French",
  });
  assert.deepEqual(seen, ["asr", "asr", "mt"]);
  assert.equal(translated.transcript, "Bonjour");
  assert.equal(translated.translatedText, "Good morning");
});

test("translateAndSpeak returns both the translation and its audio", async () => {
  const bridge = bridgeWith({
    "/v2/developer/mt": () => new Response(SSE("Bonjour")),
    "/v2/developer/tts": () =>
      JSON_RES({ response: { audio_b64: "V0FW", sample_rate: 24000 }, voice: "Dauda" }),
  });
  const res = await bridge.translateAndSpeak({
    text: "Good morning",
    targetLang: "French",
  });
  assert.equal(res.translatedText, "Bonjour");
  assert.equal(res.audioBase64, "V0FW");
});

test("catalog exposes all 22 pinned languages offline", async () => {
  const bridge = bridgeWith({});
  const languages = await bridge.languages();
  assert.ok(languages.length >= 22);
  assert.ok(languages.some((l) => l.label === "English"));
});
