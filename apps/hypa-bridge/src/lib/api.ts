/**
 * Typed client for the Bridge BFF. The browser only ever talks to this
 * same-origin server — no API key, no direct Hypa calls. Response and error
 * shapes mirror apps/hypa-bridge-server/src/routes/api.ts exactly.
 */

import type { Language } from "./types";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

type Json = Record<string, unknown>;

/** Map of upstream/system codes to calm, human copy. */
const USER_MESSAGES: Record<string, string> = {
  BAD_REQUEST: "That request wasn't quite right. Please try again.",
  NETWORK: "Couldn't reach the Bridge server. Is it running on port 5182?",
  TIMEOUT: "The request took too long. Please try again.",
  MODEL_UNAVAILABLE:
    "The model is temporarily unavailable. Please wait a moment and try again.",
  UPSTREAM: "Hypa couldn't complete that just now. Please try again.",
  INSUFFICIENT_BALANCE:
    "This account has run out of Hypa credit. Top up at labs.hypaintelligence.com.",
  INVALID_EXPIRED_API_KEY:
    "The server's Hypa key was rejected. Check HYPA_API_KEY on the server.",
};

export const friendlyMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return USER_MESSAGES[error.code] ?? error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    throw new ApiError("NETWORK", "Network request failed", 0);
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } })?.error;
    throw new ApiError(
      err?.code ?? "UPSTREAM",
      err?.message ?? `Request failed (${res.status})`,
      res.status,
    );
  }
  return body as T;
}

const post = <T>(path: string, payload: Json): Promise<T> =>
  request<T>(path, { method: "POST", body: JSON.stringify(payload) });

// --- public API -------------------------------------------------------------

export const api = {
  health: (): Promise<{ ok: boolean }> => request("/api/health"),

  models: (): Promise<{ languages: Language[] }> => request("/api/models"),

  translate: (payload: { text: string; sourceLang?: string; targetLang: string }) =>
    post<{ translation: string }>("/api/translate", payload),

  understand: (payload: {
    text: string;
    textLang: string;
    meaningLang: string;
    context?: string;
  }) => post<{ meaning: string }>("/api/understand", payload),

  suggest: (payload: {
    text: string;
    textLang?: string;
    replyLang: string;
    context?: string;
  }) => post<{ suggestions: string[] }>("/api/suggest", payload),

  summarise: (payload: {
    turns: { speaker: string; language: string; text: string }[];
    targetLang: string;
  }) => post<{ summary: string }>("/api/summarise", payload),

  dictionary: (payload: { word: string; language?: string }) =>
    post<{ result: DictionaryResult }>("/api/dictionary", payload),

  asr: (payload: { audio: string; audioType?: "base64" | "url" }) =>
    post<{ text: string }>("/api/asr", payload),

  tts: (payload: { text: string; language: string; voice?: string }) =>
    post<{ audioBase64: string; sampleRate?: number; voice: string; mime: string }>(
      "/api/tts",
      payload,
    ),
};

// --- dictionary result (mirrors bridge-core DictionaryResult, lenient) ------

export interface DictDefinition {
  type?: string;
  text?: string;
}

export interface DictionaryResult {
  word: string;
  definitions?: DictDefinition[];
  usage?: string[];
  syms?: string[];
  antm?: string[];
  synonyms?: string[];
  antonyms?: string[];
  cultural_context?: string;
  fun_facts?: string;
  exampleSentences?: string[];
  [key: string]: unknown;
}

/** Build a short "recent transcript" context string for understand/suggest. */
export const buildContext = (
  turns: { speaker: string; text: string }[],
  max = 4,
): string | undefined => {
  const recent = turns.filter((t) => t.text.trim()).slice(-max);
  if (recent.length === 0) return undefined;
  return recent.map((t) => `[${t.speaker}] ${t.text.trim()}`).join("\n");
};
