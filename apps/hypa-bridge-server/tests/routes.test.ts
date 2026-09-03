/**
 * Route contract tests for the Bridge BFF.
 *
 * createApp is mounted with a stubbed Bridge so the HTTP contract (paths,
 * payloads, error normalisation to `{ error: { code, message } }`, CORS) is
 * verified offline against the real express app.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { BridgeError } from "@hypa/bridge-core";
import type { Bridge } from "@hypa/bridge-core";
import { createApp } from "../src/app.js";
import type { ServerConfig } from "../src/config.js";
import type express from "express";
import type { Server } from "node:http";

/** A stub Bridge whose capabilities we control. */
const stubBridge = (overrides: Partial<Record<keyof Bridge, unknown>> = {}): Bridge => {
  const stub: Record<string, unknown> = {
    languages: async () => [
      { label: "English", code: "english", voices: ["Eniola"] },
      { label: "French", code: "french", voices: [] },
    ],
    translateMessage: async () => ({ translation: "Bonjour" }),
    understandMessage: async () => ({ meaning: "They are being polite." }),
    generateResponse: async () => ({ suggestions: ["Yes please"] }),
    summariseConversation: async () => ({ summary: "They said hello." }),
    lookUpTerm: async () => ({ result: { word: "salut" } }),
    transcribe: async () => ({ text: "Bonjour" }),
    speak: async () => ({ audioBase64: "V0FW", voice: "Eniola", mime: "audio/wav" }),
    ...overrides,
  };
  return stub as unknown as Bridge;
};

const config: ServerConfig = {
  host: "127.0.0.1",
  port: 0,
  corsOrigins: ["http://localhost:5181", "http://127.0.0.1:5181"],
  apiUrl: "https://api.hypaintelligence.com",
  apiKey: "test-key",
  maxBodyBytes: 1024 * 1024,
};

let app: express.Express;
let baseUrl: string;
let server: Server;

before(async () => {
  app = createApp(stubBridge(), config);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const get = (path: string, headers: Record<string, string> = {}) =>
  fetch(`${baseUrl}${path}`, { method: "GET", headers });

test("GET /api/health", async () => {
  const res = await get("/api/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, version: "0.1.0" });
});

test("GET /api/models returns the language catalog", async () => {
  const res = await get("/api/models");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { languages: { label: string }[] };
  assert.ok(body.languages.some((l) => l.label === "French"));
});

test("POST /api/translate returns the bridge result", async () => {
  const res = await post("/api/translate", { text: "hi", targetLang: "French" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { translation: "Bonjour" });
});

test("POST /api/translate validates required fields", async () => {
  const res = await post("/api/translate", { targetLang: "French" });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: { code: string } };
  assert.equal(body.error.code, "BAD_REQUEST");
});

test("POST /api/tts trims + forwards voice", async () => {
  const res = await post("/api/tts", { text: " Bonjour ", language: "French" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { mime: string };
  assert.equal(body.mime, "audio/wav");
});

test("unknown API route → 404 with a normalised error", async () => {
  const res = await get("/api/nope");
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: { code: string } };
  assert.equal(body.error.code, "BAD_REQUEST");
});

test("malformed JSON body → 400", async () => {
  const res = await post("/api/translate", "{ not json", { "content-type": "application/json" });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: { code: string } };
  assert.equal(body.error.code, "BAD_REQUEST");
});

test("BridgeError propagates with its status and code", async () => {
  const failing = createApp(
    stubBridge({
      translateMessage: async () => {
        throw new BridgeError({
          code: "UNAUTHORIZED",
          message: "Key rejected",
          status: 401,
        });
      },
    }),
    config,
  );
  const srv = failing.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => srv.once("listening", resolve));
  const addr = srv.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${addr.port}/api/translate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hi", targetLang: "French" }),
    });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), {
      error: { code: "UNAUTHORIZED", message: "Key rejected" },
    });
  } finally {
    await new Promise<void>((resolve) => srv.close(() => resolve()));
  }
});

test("CORS: allowed origin is echoed, others are not", async () => {
  const allowed = await get("/api/health", { origin: "http://localhost:5181" });
  assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:5181");

  const blocked = await get("/api/health", { origin: "https://evil.example" });
  assert.equal(blocked.headers.get("access-control-allow-origin"), null);
});
