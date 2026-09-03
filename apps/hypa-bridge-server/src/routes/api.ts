/**
 * JSON route handlers for the Bridge BFF.
 *
 * Routes are thin: they validate the request body, call one Bridge capability,
 * and respond. All Hypa communication happens in @hypa/bridge-core; the API key
 * never crosses this boundary. Errors are normalised to `{ error: { code,
 * message } }` by the app-level error middleware.
 */

import { Router, type Request } from "express";
import { Bridge, BridgeError } from "@hypa/bridge-core";

type Json = Record<string, unknown>;

function required(body: Json, field: string, label = field): string {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new BridgeError({
      code: "BAD_REQUEST",
      message: `${label} is required`,
      status: 400,
    });
  }
  return value.trim();
}

function optionalString(body: Json, field: string): string | undefined {
  const value = body[field];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function buildRouter(bridge: Bridge): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.get("/models", async (_req, res, next) => {
    try {
      const languages = await bridge.languages();
      res.json({ languages });
    } catch (e) {
      next(e);
    }
  });

  router.post("/translate", async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Json;
      const text = required(body, "text");
      const targetLang = required(body, "targetLang");
      const result = await bridge.translateMessage({
        text,
        sourceLang: optionalString(body, "sourceLang"),
        targetLang,
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  router.post("/understand", async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Json;
      const text = required(body, "text");
      const textLang = required(body, "textLang");
      const meaningLang = required(body, "meaningLang");
      const result = await bridge.understandMessage({
        text,
        textLang,
        meaningLang,
        context: optionalString(body, "context"),
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  router.post("/suggest", async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Json;
      const text = required(body, "text");
      const replyLang = required(body, "replyLang");
      const result = await bridge.generateResponse({
        text,
        textLang: optionalString(body, "textLang"),
        replyLang,
        context: optionalString(body, "context"),
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  router.post("/summarise", async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Json;
      const rawTurns = body.turns;
      if (!Array.isArray(rawTurns) || rawTurns.length === 0) {
        throw new BridgeError({
          code: "BAD_REQUEST",
          message: "turns must be a non-empty array",
          status: 400,
        });
      }
      const turns = rawTurns
        .filter((t): t is Json => Boolean(t) && typeof t === "object")
        .map((t) => ({
          speaker: optionalString(t, "speaker") ?? "speaker",
          language: optionalString(t, "language") ?? "English",
          text: optionalString(t, "text") ?? "",
        }));
      const targetLang = required(body, "targetLang");
      const result = await bridge.summariseConversation({ turns, targetLang });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  router.post("/dictionary", async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Json;
      const word = required(body, "word");
      const result = await bridge.lookUpTerm({
        word,
        language: optionalString(body, "language"),
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  router.post("/asr", async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Json;
      const audio = required(body, "audio");
      const audioType = body.audioType;
      const result = await bridge.transcribe({
        audio,
        audioType: audioType === "url" ? "url" : "base64",
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  router.post("/tts", async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Json;
      const text = required(body, "text");
      const language = required(body, "language");
      const result = await bridge.speak({
        text,
        language,
        voice: optionalString(body, "voice"),
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

export function requestOrigin(req: Request): string | undefined {
  const origin = req.headers.origin;
  return typeof origin === "string" ? origin : undefined;
}

export function isAllowedOrigin(origin: string, allowed: string[]): boolean {
  return allowed.some((a) => a === origin || (a === "*" && origin.startsWith("http")));
}
