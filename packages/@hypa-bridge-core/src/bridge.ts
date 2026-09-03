/**
 * The Bridge facade — high-level product capabilities over the Hypa developer
 * API. This single object is consumed by both the HTTP BFF and the MCP server,
 * so product behaviour lives in exactly one place.
 */

import { Catalog, type Language } from "./catalog";
import { DEFAULT_LANGUAGES, normalizeLanguageLabel } from "./config";
import { BridgeError } from "./errors";
import { HypaClient, type HypaClientOptions } from "./hypa/client";
import { clipRepeatedContent } from "./hypa/parse";
import type { DictionaryResult } from "./hypa/types";
import type {
  GenerateResponseInput,
  GenerateResponseResult,
  LookUpInput,
  ProcessVoiceResult,
  SpeakInput,
  SpeakResult,
  SpeechInput,
  SummariseInput,
  SummariseResult,
  TranslateInput,
  TranslateResult,
  UnderstandInput,
  UnderstandResult,
} from "./types";

export interface BridgeOptions extends HypaClientOptions {}

const SUGGESTION_COUNT = 3;

export class Bridge {
  readonly client: HypaClient;
  readonly catalog: Catalog;

  constructor(options: BridgeOptions) {
    this.client = new HypaClient(options);
    this.catalog = new Catalog(this.client);
  }

  // --- catalog -------------------------------------------------------------

  /** All supported languages with their TTS voices (live-merged, cached). */
  languages(): Promise<Language[]> {
    return this.catalog.getLanguages();
  }

  // --- translation ---------------------------------------------------------

  async translateMessage(input: TranslateInput): Promise<TranslateResult> {
    const text = input.text.trim();
    if (!text) throw this.invalid("text is required");
    if (!normalizeLanguageLabel(input.targetLang)) throw this.invalid("targetLang is required");
    const res = await this.client.mt({
      text,
      sourceLang: input.sourceLang
        ? normalizeLanguageLabel(input.sourceLang)
        : undefined,
      targetLang: normalizeLanguageLabel(input.targetLang),
    });
    return { translation: res.text };
  }

  // --- understanding / meaning ----------------------------------------------

  async understandMessage(input: UnderstandInput): Promise<UnderstandResult> {
    const text = input.text.trim();
    if (!text) throw this.invalid("text is required");
    const textLang = normalizeLanguageLabel(input.textLang) || "English";
    const meaningLang = normalizeLanguageLabel(input.meaningLang) || "English";

    const res = await this.client.chat({
      messages: [
        {
          role: "system",
          content: [
            "You are a warm, precise cross-language communication assistant. ",
            "You explain the meaning of a message to someone who speaks ",
            `${meaningLang}.`,
            "Write in natural, plain ",
            `${meaningLang}.`,
            "In 1-3 short sentences explain what the speaker means and their tone, ",
            "including any idiom or cultural nuance a non-native listener would miss.",
            "Do not repeat a verbatim translation of the message.",
            "Do not say you are an AI. No headings, no markdown, no quotes.",
          ].join(""),
        },
        {
          role: "user",
          content: this.withContext(
            `Message (said in ${textLang}):\n"""\n${text}\n"""\n\nWhat do they really mean?`,
            input.context,
          ),
        },
      ],
    });
    const meaning = this.singleLine(clipRepeatedContent(res.text));
    if (!meaning) throw new BridgeError({ code: "UPSTREAM", message: "Empty meaning response", status: 502 });
    return { meaning };
  }

  // --- help me respond -----------------------------------------------------

  async generateResponse(input: GenerateResponseInput): Promise<GenerateResponseResult> {
    const text = input.text.trim();
    if (!text) throw this.invalid("text is required");
    const replyLang = normalizeLanguageLabel(input.replyLang);
    if (!replyLang) throw this.invalid("replyLang is required");

    // The reply suggestions must read naturally in replyLang. If the inbound
    // message is in a different language, translate it first (the same step the
    // conversation pipeline performs before showing it to the recipient).
    const textLang = input.textLang ? normalizeLanguageLabel(input.textLang) : undefined;
    const inbound =
      textLang && textLang.toLowerCase() !== replyLang.toLowerCase()
        ? (await this.client.mt({ text, sourceLang: textLang, targetLang: replyLang })).text
        : text;

    const res = await this.client.chat({
      messages: [
        {
          role: "system",
          content: [
            "You help someone reply warmly in ",
            `${replyLang}.`,
            "They received the message below and want to respond in ",
            `${replyLang}.`,
            "Write ",
            `${SUGGESTION_COUNT},`,
            " short, human, natural replies they could send.",
            "One reply per line, each starting with exactly \"- \". No numbers, no numbering, no preamble.",
            "Make the replies differ in tone: one short and light, one warm and thoughtful, one that gently asks a follow-up question.",
            "Plain conversational words only. No markdown, no quotes around the text.",
            "Do not translate the received message; only give possible replies.",
          ].join(""),
        },
        {
          role: "user",
          content: this.withContext(
            `Message they received (in ${replyLang}):\n"""\n${inbound}\n"""\n\nWrite ${SUGGESTION_COUNT} replies I could send.`,
            input.context,
          ),
        },
      ],
    });

    const suggestions = this.parseSuggestions(res.text);
    if (suggestions.length === 0) {
      throw new BridgeError({ code: "UPSTREAM", message: "No reply suggestions returned", status: 502 });
    }
    return { suggestions };
  }

  // --- conversation summary --------------------------------------------------

  async summariseConversation(input: SummariseInput): Promise<SummariseResult> {
    const targetLang = normalizeLanguageLabel(input.targetLang) || "English";
    const turns = input.turns.filter((t) => t.text && t.text.trim());
    if (turns.length === 0) throw this.invalid("turns must contain at least one message");

    const transcript = turns
      .map((t, i) => `${i + 1}. [${t.speaker || "Speaker"} · ${normalizeLanguageLabel(t.language) || "?"}] ${t.text.trim()}`)
      .join("\n");

    const res = await this.client.chat({
      messages: [
        {
          role: "system",
          content: [
            "You summarise a short conversation for someone who speaks ",
            `${targetLang}.`,
            `Write the summary in ${targetLang}.`,
            "Keep it to 3-6 short sentences. Capture what was discussed, any decisions or questions, and the overall mood. Do not use names; refer to the two people as \"the speaker\" and \"the listener\" only when needed — otherwise avoid attributing.",
            "Plain natural language. No headings, no bullets, no markdown.",
          ].join(""),
        },
        { role: "user", content: `Conversation:\n${transcript}\n\nSummarise it.` },
      ],
    });
    const summary = this.singleLine(clipRepeatedContent(res.text));
    if (!summary) throw new BridgeError({ code: "UPSTREAM", message: "Empty summary response", status: 502 });
    return { summary };
  }

  // --- dictionary -------------------------------------------------------------

  async lookUpTerm(input: LookUpInput): Promise<{ result: DictionaryResult }> {
    const result = await this.client.dictionary({
      word: input.word,
      language: normalizeLanguageLabel(input.language) || undefined,
    });
    return { result };
  }

  // --- audio ------------------------------------------------------------------

  /** Text → speech for the given language (language is the text's language). */
  async speak(input: SpeakInput): Promise<SpeakResult> {
    const text = input.text.trim();
    if (!text) throw this.invalid("text is required");
    const language = normalizeLanguageLabel(input.language);
    if (!language) throw this.invalid("language is required for speech");
    const res = await this.client.tts({
      text,
      language,
      voice: input.voice?.trim() || undefined,
    });
    return {
      audioBase64: res.audioBase64,
      sampleRate: res.sampleRate,
      voice: res.voice,
      mime: "audio/wav",
    };
  }

  /** Speech → text using the Hypa ASR model. */
  async transcribe(input: SpeechInput): Promise<{ text: string; model?: string }> {
    if (!input.audio) throw this.invalid("audio is required");
    const res = await this.client.asr({
      audio: input.audio,
      audioType: input.audioType,
    });
    return { text: res.text, model: res.model };
  }

  /** Transcribe voice, optionally translating it into the other language. */
  async processVoiceMessage(input: SpeechInput): Promise<ProcessVoiceResult> {
    const res = await this.client.asr({
      audio: input.audio,
      audioType: input.audioType,
    });
    const result: ProcessVoiceResult = { transcript: res.text, model: res.model };
    if (input.targetLang && normalizeLanguageLabel(input.targetLang)) {
      const translated = await this.client.mt({
        text: res.text,
        sourceLang: input.sourceLang
          ? normalizeLanguageLabel(input.sourceLang)
          : undefined,
        targetLang: normalizeLanguageLabel(input.targetLang),
      });
      result.translatedText = translated.text;
    }
    return result;
  }

  /** Translate text and return speech audio of the translation. */
  async translateAndSpeak(input: TranslateInput & { voice?: string }): Promise<SpeakResult & { translatedText: string }> {
    const translated = await this.translateMessage(input);
    const speech = await this.speak({
      text: translated.translation,
      language: normalizeLanguageLabel(input.targetLang),
      voice: input.voice,
    });
    return { ...speech, translatedText: translated.translation };
  }

  // --- helpers --------------------------------------------------------------

  private invalid(message: string): BridgeError {
    return new BridgeError({ code: "BAD_REQUEST", message, status: 400 });
  }

  private withContext(prompt: string, context?: string): string {
    return context && context.trim()
      ? `${prompt}\n\nAdditional context from the listener:\n${context.trim()}`
      : prompt;
  }

  /** Collapse chat text into one tight sentence/paragraph. */
  private singleLine(text: string): string {
    return text
      .replace(/\s+/g, " ")
      .replace(/\s([,.;:!?])/g, "$1")
      .trim();
  }

  /** Parse "- item" (or numbered) reply suggestions out of a chat response. */
  private parseSuggestions(text: string): string[] {
    const stripOuterQuotes = (s: string): string =>
      s.replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "").trim();

    const lines = text.split(/\r?\n/);
    const picked: string[] = [];
    let inList = false;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const bullet = line.match(/^(?:[-–—*•]|\d+[.)])\s*(.+)$/);
      if (bullet) {
        inList = true;
        const item = stripOuterQuotes(bullet[1]!);
        if (item) picked.push(item);
        if (picked.length >= SUGGESTION_COUNT) break;
        continue;
      }
      if (inList) {
        // Keep natural multi-line continuations attached to the last item.
        if (picked.length > 0) {
          const last = picked.pop()!;
          const merged = `${last} ${line}`.trim();
          picked.push(merged);
        }
      }
    }
    // Model didn't use bullets — fall back to sentences, dropping any preamble.
    if (picked.length === 0) {
      for (const raw of lines) {
        const line = stripOuterQuotes(raw.trim());
        if (!line || /^[a-z]+\s*:/i.test(line) || line.startsWith("Here") || line.startsWith("Sure")) continue;
        picked.push(line);
        if (picked.length >= SUGGESTION_COUNT) break;
      }
    }
    return picked.slice(0, SUGGESTION_COUNT).map((s) => s.trim()).filter(Boolean);
  }
}

// re-export the pinned language list for consumers that need a static preview
export { DEFAULT_LANGUAGES as STATIC_LANGUAGES };
