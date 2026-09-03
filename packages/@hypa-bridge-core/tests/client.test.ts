/**
 * Contract tests for the Hypa developer-API client.
 *
 * Every fixture mirrors a response shape the real API returns (verified during
 * Phase 3 live runs): MT/Chat are SSE-framed even at stream:false, TTS/ASR are
 * plain JSON, errors are `{ code, message }` with HTTP status. fetch is mocked
 * so the suite never touches the network.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { BridgeError, HypaClient } from "../src/index.js";

const SSE = (content: string): string =>
  `data: ${JSON.stringify({
    choices: [{ message: { content } }],
    usage: { total_tokens: 8 },
    model: "Hypa-Llama3.1-8b-SFT",
    provider: "hypaai",
  })}\n\ndata: [DONE]\n\n`;

const JSON_RES = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

const clientWith = (impl: (url: string, init?: RequestInit) => Response | Promise<Response>) =>
  new HypaClient({
    apiUrl: "https://api.hypaintelligence.com",
    apiKey: "test-key-server-side-only",
    fetchImpl: async (url, init) => impl(String(url), init),
  });

const LAST_BODY = (init?: RequestInit): Record<string, unknown> =>
  JSON.parse(String(init?.body)) as Record<string, unknown>;

test("mt: parses SSE, strips think tags, sends the pinned request", async () => {
  let seen: { url: string; body: Record<string, unknown>; key?: string } | undefined;
  const client = clientWith((url, init) => {
    seen = { url, body: LAST_BODY(init), key: init?.headers?.["x-api-key"] };
    return new Response(
      SSE("<think>Translate it.</think>Bonjour le matin"),
      { status: 200 },
    );
  });

  const res = await client.mt({ text: "Good morning", targetLang: "French" });

  assert.equal(res.text, "Bonjour le matin");
  assert.ok(seen?.url.endsWith("/v2/developer/mt"));
  assert.equal(seen?.key, "test-key-server-side-only");
  assert.equal(seen?.body.target_lang, "French");
  assert.equal(seen?.body.text, "Good morning");
  assert.equal(seen?.body.stream, false);
  assert.equal(seen?.body.thinking, false);
  assert.equal(seen?.body.provider, "hypaai");
  assert.equal(seen?.body.model, "Hypa-Llama3.1-8b-SFT");
});

test("mt: error frame surfaces as MODEL_UNAVAILABLE", async () => {
  const client = clientWith(() =>
    new Response("event: error\ndata: MODEL_UNAVAILABLE\n\n", { status: 200 }),
  );
  await assert.rejects(
    () => client.mt({ text: "hello", targetLang: "French" }),
    (e: unknown) =>
      e instanceof BridgeError && e.code === "MODEL_UNAVAILABLE" && e.status === 502,
  );
});

test("mt: plain JSON payload (no SSE) is also parsed", async () => {
  const client = clientWith(() =>
    new Response(JSON.stringify({ choices: [{ message: { content: "Bonjour" } }] })),
  );
  assert.equal((await client.mt({ text: "hi", targetLang: "French" })).text, "Bonjour");
});

test("mt: empty content is an UPSTREAM error", async () => {
  const client = clientWith(() => new Response("data: [DONE]\n\n", { status: 200 }));
  await assert.rejects(
    () => client.mt({ text: "hi", targetLang: "French" }),
    (e: unknown) => e instanceof BridgeError && e.code === "UPSTREAM",
  );
});

test("chat: parses an aggregated SSE answer", async () => {
  const client = clientWith(() =>
    new Response(
      "data: " + JSON.stringify({ choices: [{ message: { content: "Hello there!" } }] }) + "\n\n" +
      "data: [DONE]\n\n",
      { status: 200 },
    ),
  );
  const res = await client.chat({ messages: [{ role: "user", content: "hi" }] });
  assert.equal(res.text, "Hello there!");
});

test("chat: skips empty frames and takes the first with content", async () => {
  const client = clientWith(() =>
    new Response(
      "data: " + JSON.stringify({ choices: [{ delta: {} }] }) + "\n\n" +
      "data: " + JSON.stringify({ choices: [{ delta: { content: "Bonjour" } }] }) + "\n\n",
      { status: 200 },
    ),
  );
  const res = await client.chat({ messages: [{ role: "user", content: "hi" }] });
  assert.equal(res.text, "Bonjour");
});

test("tts: parses audio payload and echoes chosen voice", async () => {
  const client = clientWith(() =>
    JSON_RES({
      response: { audio_b64: "UklGRgAAAA==", sample_rate: 24000, audio_type: "audio/wav" },
      voice: "Eniola",
      model: "hypa-orpheus-3b-tts-vc-flt",
    }),
  );
  const res = await client.tts({ text: "Bonjour", language: "french" });
  assert.equal(res.audioBase64, "UklGRgAAAA==");
  assert.equal(res.sampleRate, 24000);
  assert.equal(res.voice, "Eniola");
});

test("tts: missing audio is an UPSTREAM error", async () => {
  const client = clientWith(() => JSON_RES({ response: {} }));
  await assert.rejects(
    () => client.tts({ text: "Bonjour", language: "french" }),
    (e: unknown) => e instanceof BridgeError && e.code === "UPSTREAM",
  );
});

test("asr: trims the transcript and defaults audio_type to base64", async () => {
  let body: Record<string, unknown> | undefined;
  const client = clientWith((_url, init) => {
    body = LAST_BODY(init);
    return JSON_RES({ response: { text: "  Hello world  " }, model: "wspr" });
  });
  const res = await client.asr({ audio: "AAAA" });
  assert.equal(res.text, "Hello world");
  assert.equal(body?.audio_type, "base64");
  assert.equal(body?.audio, "AAAA");
});

test("asr: https audio is sent as a url", async () => {
  let body: Record<string, unknown> | undefined;
  const client = clientWith((_url, init) => {
    body = LAST_BODY(init);
    return JSON_RES({ response: { text: "hi" } });
  });
  await client.asr({ audio: "https://cdn.example/voice.wav" });
  assert.equal(body?.audio_type, "url");
  assert.equal(body?.audio, "https://cdn.example/voice.wav");
});

test("dictionary: returns content as-is and normalises language", async () => {
  let body: Record<string, unknown> | undefined;
  const client = clientWith((_url, init) => {
    body = LAST_BODY(init);
    return JSON_RES({
      word: "salut",
      definitions: [{ type: "noun", text: "a greeting" }],
    });
  });
  const res = await client.dictionary({ word: "salut", language: "english" });
  assert.ok(Array.isArray(res.definitions));
  assert.equal((res.definitions?.[0] as { text?: string } | undefined)?.text, "a greeting");
  assert.equal(body?.language, "english");
});

test("dictionary: unusable result is a 422 UPSTREAM error", async () => {
  const client = clientWith(() => JSON_RES({ word: "" }));
  await assert.rejects(
    () => client.dictionary({ word: "zzzz" }),
    (e: unknown) => e instanceof BridgeError && e.code === "UPSTREAM" && e.status === 422,
  );
});

test("upstream 401 maps to UNAUTHORIZED", async () => {
  const client = clientWith(() =>
    JSON_RES({ code: "INVALID_EXPIRED_API_KEY", message: "Key expired" }, 401),
  );
  await assert.rejects(
    () => client.mt({ text: "hi", targetLang: "French" }),
    (e: unknown) => e instanceof BridgeError && e.code === "UNAUTHORIZED" && e.status === 401,
  );
});

test("network failure maps to NETWORK", async () => {
  const client = clientWith(() => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(
    () => client.mt({ text: "hi", targetLang: "French" }),
    (e: unknown) => e instanceof BridgeError && e.code === "NETWORK",
  );
});

test("missing apiKey fails fast at construction", () => {
  assert.throws(
    () => new HypaClient({ apiKey: "" }),
    (e: unknown) => e instanceof BridgeError && e.code === "BAD_REQUEST",
  );
});
