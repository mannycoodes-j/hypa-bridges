/** Shared domain types for the Hypa Bridge web app. */

/** Canonical language shape from GET /api/models (mirrors bridge-core Language). */
export interface Language {
  label: string;
  /** Short ISO-style code when the server provides one. */
  code?: string;
  /** TTS voice names available for this language. */
  voices?: string[];
}

export type Role = "you" | "them";

export type MessageSource = "text" | "voice";

/** A single exchange in a conversation. Original is always kept with its translation. */
export interface BridgeMessage {
  id: string;
  role: Role;
  source: MessageSource;
  createdAt: number;
  /** The message as actually spoken/typed, in `textLang`. */
  text: string;
  /** Canonical language label the message was spoken/typed in. */
  textLang: string;
  /** Translation into the other person's language ('' while pending). */
  translation: string;
  /** Canonical language label of `translation`. */
  translationLang: string;
  /** Optional cached "what they really meant" explanation, in `meaningLang`. */
  meaning?: string;
  meaningLang?: string;
}

export interface Conversation {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** User-facing label, e.g. "English ⇄ Yorùbá". */
  title: string;
  /** The two participants' languages. youLang = "You", themLang = "Them". */
  youLang: string;
  themLang: string;
  /** Optional pinned TTS voice per side (falls back to each language default). */
  youVoice?: string;
  themVoice?: string;
  messages: BridgeMessage[];
}

export type Theme = "system" | "light" | "dark";

export interface Settings {
  theme: Theme;
  /** Last language pair used, pre-fills the setup screen. */
  youLang?: string;
  themLang?: string;
}

export interface PipelineState {
  stage:
    | "idle"
    | "listening"
    | "transcribing"
    | "translating"
    | "understanding"
    | "ready";
  /** Who the in-flight pipeline belongs to. */
  role?: Role;
  /** Transcribed text once listening → transcribing resolves. */
  transcript?: string;
  error?: string | null;
}

/** Which side of the shared device is currently composing. */
export type SpeakerMode = Role;

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
};

export const STORAGE_KEY = "hypa-bridge:v1";
