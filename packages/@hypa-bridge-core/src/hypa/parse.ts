/**
 * Parsers for Hypa developer-API text responses.
 *
 * The developer MT and Chat endpoints are annotated `@Sse()` and therefore
 * return Server-Sent Events framing even when `stream:false` — a single
 * `data:` frame whose payload is a JSON string of an OpenAI-style
 * `{ choices: [{ message: { content } }], usage, model, provider }` object.
 *
 * Content may include `<think>…</think>` reasoning. Errors surface either as a
 * non-2xx HTTP response or as an SSE `event: error` frame.
 */

import { BridgeError } from "../errors";

const THINK_RE = /<\|?think>[\s\S]*?<\/think>/gi;

/** Remove reasoning blocks left in content. */
export const stripThinkingTags = (content: string): string =>
  content.replace(THINK_RE, "").trim();

const SENTENCE_RE = /[^.!?…]+[.!?…]+|[^.!?…]+$/g;

/**
 * Clip runaway repetition — a degraded upstream model can loop the same
 * sentences. Once a previously-seen sentence repeats (with at least one full
 * sentence of context before it and more than one sentence after it), keep only
 * the text up to the repetition. Cheap, generic, and safe for real answers.
 */
export const clipRepeatedContent = (text: string): string => {
  const parts = (text.match(SENTENCE_RE) ?? [text])
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 5) return text;

  const firstSeen = new Map<string, number>();
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i]!.toLowerCase();
    const first = firstSeen.get(key);
    if (first !== undefined && i - first >= 1 && parts.length - i >= 2) {
      return parts.slice(0, i).join(" ").trim() || text;
    }
    firstSeen.set(key, i);
  }
  return text;
};

/** Split SSE text into its `data:` payloads (raw, unsplit). */
export const sseDataFrames = (text: string): string[] => {
  const frames: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      const value = line.slice(5).trim();
      if (value && value !== "[DONE]") frames.push(value);
    }
  }
  return frames;
};

/** Detect an `event: error` frame and throw BridgeError when present. */
const throwSseError = (text: string): void => {
  let inErrorEvent = false;
  const payloads: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      inErrorEvent = line.slice(6).trim() === "error";
      if (inErrorEvent) payloads.length = 0;
      continue;
    }
    if (!inErrorEvent) continue;
    if (line.startsWith("data:")) payloads.push(line.slice(5).trim());
  }
  if (!inErrorEvent || payloads.length === 0) return;

  const raw = payloads.join("\n").trim();
  let message = raw;
  let upstream: string | undefined;
  try {
    const parsed = JSON.parse(raw) as { message?: unknown; code?: unknown };
    if (typeof parsed.code === "string") {
      upstream = parsed.code;
      if (typeof parsed.message === "string") message = parsed.message;
    }
  } catch {
    // raw may be a bare code like "MODEL_UNAVAILABLE"
    if (/^[A-Z0-9_]+$/.test(raw)) upstream = raw;
  }

  const code =
    raw === "MODEL_UNAVAILABLE"
      ? "MODEL_UNAVAILABLE"
      : upstream === "MODEL_UNAVAILABLE"
        ? "MODEL_UNAVAILABLE"
        : "UPSTREAM";

  throw new BridgeError({
    code,
    message:
      code === "MODEL_UNAVAILABLE"
        ? "The translation model is temporarily unavailable. Please try again."
        : message,
    status: 502,
    upstream,
  });
};

const tryJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

type JsonRecord = Record<string, unknown>;

const firstContentString = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // A string that itself holds a JSON payload (nested data field).
    const nested = tryJson(trimmed);
    if (nested && typeof nested === "object") {
      return firstContentString(nested) ?? trimmed;
    }
    return trimmed;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as JsonRecord;

  const choices = record.choices;
  if (Array.isArray(choices)) {
    const choice = choices[0];
    if (choice && typeof choice === "object") {
      const msg = (choice as JsonRecord).message;
      const delta = (choice as JsonRecord).delta;
      if (msg && typeof msg === "object") {
        const content = (msg as JsonRecord).content;
        if (typeof content === "string" && content.trim()) return content.trim();
      }
      if (delta && typeof delta === "object") {
        const content = (delta as JsonRecord).content;
        if (typeof content === "string" && content.trim()) return content.trim();
      }
    }
  }

  const direct = record.data;
  if (direct !== undefined) return firstContentString(direct);

  for (const key of ["text", "translation", "translated_text", "content", "output"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  // streamed non-stream payloads can carry the full text on the last frame
  if (record.complete === true && typeof record.fullContent === "string") {
    return record.fullContent.trim();
  }

  return null;
};

/**
 * Extract the assistant's message content from a full SSE (or plain JSON)
 * developer MT/Chat response text. Returns null when nothing parseable exists.
 */
export const extractResponseContent = (text: string): string | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;

  throwSseError(trimmed);

  // Plain JSON without SSE framing.
  const direct = tryJson(trimmed);
  if (direct && typeof direct === "object") {
    const content = firstContentString(direct);
    if (content) return stripThinkingTags(content);
  }

  // SSE frames — try each payload in order, take the first with content.
  for (const frame of sseDataFrames(trimmed)) {
    const parsed = tryJson(frame);
    const content =
      parsed === undefined
        ? firstContentString(frame)
        : firstContentString(parsed);
    if (content) return stripThinkingTags(content);
  }

  return null;
};
