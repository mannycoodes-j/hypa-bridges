/**
 * Public Bridge domain types — the capability-layer contract shared by the
 * HTTP BFF and the MCP server.
 */

export interface TranslateInput {
  text: string;
  sourceLang?: string;
  targetLang: string;
}

export interface TranslateResult {
  translation: string;
}

export interface UnderstandInput {
  text: string;
  textLang: string;
  meaningLang: string;
  context?: string;
}

export interface UnderstandResult {
  meaning: string;
}

export interface GenerateResponseInput {
  text: string;
  /** Language of `text` when it differs from `replyLang`. */
  textLang?: string;
  replyLang: string;
  context?: string;
}

export interface GenerateResponseResult {
  suggestions: string[];
}

export interface ConversationTurn {
  /** "you" or "them" — used to attribute speakers in the summary. */
  speaker: string;
  language: string;
  text: string;
}

export interface SummariseInput {
  turns: ConversationTurn[];
  targetLang: string;
}

export interface SummariseResult {
  summary: string;
}

export interface LookUpInput {
  word: string;
  language?: string;
}

export interface SpeechInput {
  audio: string;
  audioType?: "base64" | "url";
  sourceLang?: string;
  targetLang?: string;
}

export interface ProcessVoiceResult {
  transcript: string;
  translatedText?: string;
  model?: string;
}

export interface SpeakInput {
  text: string;
  language: string;
  voice?: string;
}

export interface SpeakResult {
  audioBase64: string;
  sampleRate?: number;
  voice: string;
  /** Hypa returns WAV audio. */
  mime: "audio/wav";
}
