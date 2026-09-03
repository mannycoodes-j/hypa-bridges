/**
 * @hypa/bridge-core
 *
 * Server-side capability layer for Hypa Bridge. It is the ONLY module that
 * talks to the Hypa developer API and the ONLY place the API key is known.
 * Never import this package from browser code — it must run on a server.
 */

export { Bridge, type BridgeOptions } from "./bridge";
export { Catalog, type Language } from "./catalog";
export { HypaClient, type HypaClientOptions } from "./hypa/client";
export { BridgeError, toBridgeError, mapUpstreamCode, type BridgeErrorCode, type BridgeErrorBody } from "./errors";
export {
  BRIDGE_VERSION,
  DEFAULT_LANGUAGES,
  DEFAULT_MODELS,
  DEFAULT_PROVIDER,
  HOSTED_API_URL,
  languageKey,
  normalizeLanguageLabel,
  VOICES,
  voicesForLanguage,
} from "./config";
export type {
  TranslateInput,
  TranslateResult,
  UnderstandInput,
  UnderstandResult,
  GenerateResponseInput,
  GenerateResponseResult,
  ConversationTurn,
  SummariseInput,
  SummariseResult,
  LookUpInput,
  SpeechInput,
  ProcessVoiceResult,
  SpeakInput,
  SpeakResult,
} from "./types";
export type { DictionaryResult } from "./hypa/types";
