/**
 * Thin HTTP client for the Hypa developer API.
 *
 * This is the only place in Bridge that talks to Hypa and the only place that
 * knows the `x-api-key` header. It runs exclusively server-side; it must never
 * be imported by browser code. Uses Node's global fetch (node >= 22).
 */

import {
  DEFAULT_PROVIDER,
  DEFAULT_MODELS,
  HOSTED_API_URL,
  normalizeLanguageLabel,
} from "../config";
import { BridgeError, parseUpstreamError } from "../errors";
import { extractResponseContent } from "./parse";
import type {
  AsrRequest,
  AsrResponse,
  ChatRequest,
  ChatResponse,
  DictionaryRequest,
  DictionaryResult,
  ModelCatalogResponse,
  ModelListItem,
  MtRequest,
  MtResponse,
  TtsRequest,
  TtsResponse,
} from "./types";

const DEFAULT_TIMEOUT_MS = 45_000;

export interface HypaClientOptions {
  /** Base origin, e.g. https://api.hypaintelligence.com (no trailing slash). */
  apiUrl?: string;
  /** Developer API key. Server-side only — never expose to the browser. */
  apiKey: string;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

const stripDataUrl = (value: string): string =>
  value.includes(",") ? value.split(",").pop() || value : value;

export class HypaClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HypaClientOptions) {
    if (!options.apiKey) {
      throw new BridgeError({
        code: "BAD_REQUEST",
        message: "HYPA_API_KEY is not configured on the server",
        status: 500,
      });
    }
    this.apiUrl = (options.apiUrl || HOSTED_API_URL).replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "x-api-key": this.apiKey,
    };
  }

  private async requestText(
    path: string,
    body: unknown,
  ): Promise<string> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.apiUrl}${path}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") {
        throw new BridgeError({ code: "TIMEOUT", message: "The request timed out", status: 504 });
      }
      throw new BridgeError({
        code: "NETWORK",
        message: e instanceof Error ? e.message : "Network request failed",
        status: 502,
      });
    }

    const text = await res.text();
    if (!res.ok) throw parseUpstreamError(text, res.status);
    return text;
  }

  private async requestJson<T>(
    path: string,
    body: unknown,
  ): Promise<T> {
    const text = await this.requestText(path, body);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new BridgeError({
        code: "UPSTREAM",
        message: "Hypa returned an unparseable response",
        status: 502,
      });
    }
  }

  /** POST /v2/developer/mt (SSE even at stream:false). */
  async mt(
    params: { text: string; sourceLang?: string; targetLang: string; thinking?: boolean },
  ): Promise<MtResponse> {
    const targetLang = normalizeLanguageLabel(params.targetLang);
    if (!targetLang) {
      throw new BridgeError({ code: "BAD_REQUEST", message: "targetLang is required", status: 400 });
    }
    const body: MtRequest = {
      text: params.text,
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODELS.mt,
      target_lang: targetLang,
      source_lang: params.sourceLang
        ? normalizeLanguageLabel(params.sourceLang)
        : undefined,
      thinking: params.thinking ?? false,
      stream: false,
      temperature: 0.3,
      top_p: 0.95,
      top_k: 20,
      max_tokens: 1000,
      repetition_penalty: 1,
    };
    const text = await this.requestText("/v2/developer/mt", body);
    const content = extractResponseContent(text);
    if (!content) {
      throw new BridgeError({ code: "UPSTREAM", message: "Empty translation response", status: 502 });
    }
    return { text: content };
  }

  /** POST /v2/developer/chat (SSE even at stream:false). */
  async chat(
    params: { messages: { role: "system" | "user" | "assistant"; content: string }[]; thinking?: boolean },
  ): Promise<ChatResponse> {
    const body: ChatRequest = {
      messages: params.messages,
      thinking: params.thinking ?? false,
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODELS.ac,
      stream: false,
      temperature: 0.5,
      top_p: 0.95,
      top_k: 40,
      max_tokens: 700,
      repetition_penalty: 1.15,
    };
    const text = await this.requestText("/v2/developer/chat", body);
    const content = extractResponseContent(text);
    if (!content) {
      throw new BridgeError({ code: "UPSTREAM", message: "Empty chat response", status: 502 });
    }
    return { text: content };
  }

  /** POST /v2/developer/tts. */
  async tts(
    params: { text: string; language: string; voice?: string },
  ): Promise<TtsResponse> {
    const language = normalizeLanguageLabel(params.language).toLowerCase();
    if (!language) {
      throw new BridgeError({ code: "BAD_REQUEST", message: "language is required for TTS", status: 400 });
    }
    const body: TtsRequest = {
      text: params.text,
      language,
      voice: params.voice || undefined,
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODELS.tts,
    };
    const json = await this.requestJson<{
      response?: { audio_b64?: string; sample_rate?: number; audio_type?: string };
      voice?: string;
      model?: string;
    }>("/v2/developer/tts", body);
    const response = json.response;
    const audioBase64 = response?.audio_b64;
    if (!audioBase64) {
      throw new BridgeError({ code: "UPSTREAM", message: "TTS returned no audio", status: 502 });
    }
    return {
      audioBase64,
      sampleRate: response.sample_rate,
      voice: json.voice || params.voice || language,
      model: json.model || DEFAULT_MODELS.tts,
    };
  }

  /** POST /v2/developer/asr. `audio` is raw base64, a data-URL, or a URL. */
  async asr(
    params: { audio: string; audioType?: "base64" | "url" },
  ): Promise<AsrResponse> {
    const isUrl = /^https?:\/\//i.test(params.audio);
    const audioType = isUrl ? "url" : params.audioType ?? "base64";
    const body: AsrRequest = {
      audio: audioType === "url" ? params.audio : stripDataUrl(params.audio),
      audio_type: audioType,
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODELS.asr,
    };
    const json = await this.requestJson<{
      response?: { text?: string };
      model?: string;
    }>("/v2/developer/asr", body);
    const text = json.response?.text?.trim();
    if (!text) {
      throw new BridgeError({ code: "UPSTREAM", message: "Speech-to-text returned no text", status: 502 });
    }
    return { text, model: json.model || DEFAULT_MODELS.asr };
  }

  /** POST /v2/dictionary (anonymous-allowed product route). */
  async dictionary(
    params: { word: string; language?: string },
  ): Promise<DictionaryResult> {
    const word = params.word.trim();
    if (!word) {
      throw new BridgeError({ code: "BAD_REQUEST", message: "word is required", status: 400 });
    }
    const body: DictionaryRequest = {
      word,
      language: normalizeLanguageLabel(params.language) || "English",
      seeMore: true,
      temperature: 0.3,
      top_p: 0.95,
      output_length: 400,
    };
    const json = await this.requestJson<Partial<DictionaryResult>>(
      "/v2/dictionary",
      body,
    );
    const hasAnyContent = ["definitions", "usage", "syms", "antm", "synonyms", "antonyms", "exampleSentences"]
      .some((key) => Array.isArray((json as Record<string, unknown>)[key]) && ((json as Record<string, unknown>)[key] as unknown[]).length > 0);
    if (typeof json.word !== "string" || !json.word.trim() || !hasAnyContent) {
      throw new BridgeError({
        code: "UPSTREAM",
        message: "The dictionary returned no usable result for that word",
        status: 422,
      });
    }
    return json as DictionaryResult;
  }

  /** GET /v2/developer/models (catalog). */
  async listModels(
    type?: "MT" | "AC" | "TTS" | "ASR",
    provider?: string,
  ): Promise<{ providerModels: ModelListItem[]; raw: ModelCatalogResponse }> {
    const query = new URLSearchParams();
    if (type) query.set("type", type);
    if (provider) query.set("provider", provider);
    const qs = query.toString();
    const url = `/v2/developer/models${qs ? `?${qs}` : ""}`;

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.apiUrl}${url}`, {
        method: "GET",
        headers: this.headers(),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      throw new BridgeError({
        code: "NETWORK",
        message: e instanceof Error ? e.message : "Network request failed",
        status: 502,
      });
    }
    const text = await res.text();
    if (!res.ok) throw parseUpstreamError(text, res.status);
    const raw = JSON.parse(text) as ModelCatalogResponse;

    // Response is `{ data: { provider: [models] } }` (or a bare array).
    const data = raw.data;
    const entries = Array.isArray(data) ? data : Object.values(data).flat();
    const providerModels = entries
      .filter((m): m is ModelListItem => Boolean(m) && typeof m.name === "string")
      .map((m) => ({ name: m.name, default: m.default, languages: m.languages, notes: m.notes }));

    if (providerModels.length === 0) {
      throw new BridgeError({ code: "UPSTREAM", message: "No models returned", status: 502 });
    }
    return { providerModels, raw };
  }
}
