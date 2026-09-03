/**
 * Hypa developer-API payload shapes (mirrors apps/hypa-api DTOs).
 */

export type ChatRole = "system" | "user" | "assistant";

export interface MtRequest {
  text: string;
  source_lang?: string;
  target_lang: string;
  thinking?: boolean;
  provider: string;
  model: string;
  stream: false;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
  repetition_penalty?: number;
  client_request_id?: string;
}

export interface ChatRequest {
  messages: { role: ChatRole; content: string }[];
  thinking?: boolean;
  provider: string;
  model: string;
  stream: false;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
  repetition_penalty?: number;
}

export interface TtsRequest {
  text: string;
  language: string; // lowercased label, e.g. "english"
  voice?: string;
  provider: string;
  model: string;
}

export interface AsrRequest {
  audio: string; // raw base64, data-URL, or URL
  audio_type: "base64" | "url";
  provider: string;
  model: string;
}

export interface DictionaryRequest {
  word: string;
  language: string;
  model?: string;
  seeMore?: boolean;
  cultural_context?: boolean;
  fun_facts?: boolean;
  output_length?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
}

export interface MtResponse {
  text: string;
}

export interface ChatResponse {
  text: string;
}

export interface TtsResponse {
  audioBase64: string;
  sampleRate?: number;
  voice: string;
  model: string;
}

export interface AsrResponse {
  text: string;
  model: string;
}

/** Live model list item as returned by GET /v2/developer/models. */
export interface ModelListItem {
  name: string;
  default?: boolean;
  languages?: string[];
  notes?: string | null;
}

export interface ModelCatalogResponse {
  data: Record<string, ModelListItem[]> | ModelListItem[];
  meta?: unknown;
}

export interface DictionaryDefinition {
  type?: string;
  text: string;
}

export interface DictionaryUsage {
  type?: string;
  text: string;
}

export interface DictionaryResult {
  word: string;
  language?: string;
  definitions?: DictionaryDefinition[];
  usage?: DictionaryUsage[];
  usageExamples?: { partOfSpeech?: string; example: string }[];
  syms?: string[];
  antm?: string[];
  synonyms?: string[];
  antonyms?: string[];
  exampleSentences?: string[];
  translations?: Record<string, string>;
  cultural_context?: DictionaryUsage[];
  culturalContext?: string;
  fun_facts?: DictionaryUsage[];
  funFacts?: string;
}
