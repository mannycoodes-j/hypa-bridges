/**
 * Zod schemas for the Bridge MCP tools. High-level, product-shaped — agents ask
 * for meaning or a reply, never raw model parameters. Output schemas describe
 * the JSON payload each tool returns (mirroring the @hypa/bridge-core result
 * types) so models know what to expect.
 */

import { z } from "zod";

const language = (hint: string) =>
  z
    .string()
    .min(1)
    .max(40)
    .describe(
      `${hint} A Hypa language label such as "English", "Yoruba", "French", "Hausa", "Igbo", "Spanish" (from the 22-language catalog).`,
    );

const textField = (max: number, hint: string) =>
  z.string().min(1).max(max).describe(hint);

const contextField = z
  .string()
  .max(4000)
  .optional()
  .describe(
    'Optional short transcript of earlier turns, e.g. "[You] hello\\n[They] good morning", to ground the answer in the conversation.',
  );

const audioField = z
  .string()
  .min(1)
  .max(20_000_000)
  .describe(
    "Base64-encoded audio, or an https URL when audioType is 'url'. Best results with WAV (16 kHz mono, PCM16).",
  );

export const translateMessageSchema = z.object({
  text: textField(5000, "The message to translate."),
  sourceLang: language("The language the text is written in. Omit to auto-detect.").optional(),
  targetLang: language("The language to translate into."),
});

export const understandMessageSchema = z.object({
  text: textField(5000, "The message to explain."),
  textLang: language("The language the message is written in."),
  meaningLang: language(
    "The language the meaning should be explained in (the reader's language).",
  ),
  context: contextField,
});

export const generateResponseSchema = z.object({
  text: textField(5000, "The received message the user wants to reply to."),
  textLang: language(
    "The language the received message is written in. Omit if it is already in replyLang.",
  ).optional(),
  replyLang: language("The language the reply suggestions should be written in."),
  context: contextField,
});

export const translateAndSpeakSchema = z.object({
  text: textField(5000, "The text to translate and speak."),
  sourceLang: language("The language the text is written in. Omit to auto-detect.").optional(),
  targetLang: language("The language to translate into and speak."),
  voice: z
    .string()
    .max(80)
    .optional()
    .describe("Optional voice name for targetLang (e.g. 'Eniola' for English). Omit for the language default."),
});

export const processVoiceMessageSchema = z.object({
  audio: audioField,
  audioType: z
    .enum(["base64", "url"])
    .optional()
    .describe("How `audio` is provided. Defaults to base64."),
  sourceLang: language("The language spoken in the audio. Omit to let Hypa auto-detect.").optional(),
  targetLang: language(
    "Optionally translate the transcript into this language after recognition.",
  ).optional(),
});

export const lookUpTermSchema = z.object({
  word: textField(120, "The word or short phrase to look up."),
  language: language("The language the word belongs to. Omit to default to English.").optional(),
});

export const conversationSummarySchema = z.object({
  turns: z
    .array(
      z.object({
        speaker: z
          .string()
          .max(40)
          .default("speaker")
          .describe('A label like "You" or "They" (or a name).'),
        language: language("The language that turn was spoken in."),
        text: textField(5000, "The turn's text, in its original language."),
      }),
    )
    .min(1)
    .max(200)
    .describe("The conversation turns in chronological order."),
  targetLang: language("The language the summary should be written in."),
});

// --- output schemas ----------------------------------------------------------
// Describe the JSON payload each tool returns (the object passed to
// JSON.stringify in server.ts). Shapes mirror the result types in
// @hypa/bridge-core so models know what a successful call hands back.

export const translateMessageOutputSchema = z.object({
  translation: z.string().describe("The message translated into targetLang."),
});

export const understandMessageOutputSchema = z.object({
  meaning: z
    .string()
    .describe("Plain-language explanation of the message's meaning, tone and cultural nuance."),
});

export const generateResponseOutputSchema = z.object({
  suggestions: z
    .array(z.string())
    .describe("Three short suggested replies in replyLang, differing in tone."),
});

export const translateAndSpeakOutputSchema = z.object({
  translatedText: z.string().describe("The message translated into targetLang."),
  audioBase64: z.string().describe("WAV audio of the translation, base64-encoded."),
  sampleRate: z.number().optional().describe("Audio sample rate in Hz."),
  voice: z.string().describe("The voice that synthesised the audio."),
  mime: z.literal("audio/wav").describe("Audio MIME type."),
});

export const processVoiceMessageOutputSchema = z.object({
  transcript: z.string().describe("The recognised text of the voice message."),
  translatedText: z
    .string()
    .optional()
    .describe("The transcript translated into targetLang, when a target was requested."),
  model: z.string().optional().describe("The ASR model that produced the transcript."),
});

export const lookUpTermOutputSchema = z.object({
  result: z
    .object({
      word: z.string().describe("The term that was looked up."),
      language: z.string().optional().describe("The language of the term."),
      // The dictionary payload is model-generated and varies in shape, so the
      // content-bearing fields are kept permissive here — the schema is a hint
      // for models, and a genuine result must never fail output validation.
      definitions: z
        .array(z.unknown())
        .optional()
        .describe("Senses of the term, each usually with a part-of-speech `type` and `text`."),
      usage: z
        .array(z.unknown())
        .optional()
        .describe("How the term is used in context, usually `type` + `text` entries."),
      synonyms: z.array(z.string()).optional().describe("Words with a similar meaning."),
      antonyms: z.array(z.string()).optional().describe("Words with an opposite meaning."),
      exampleSentences: z.array(z.string()).optional(),
      translations: z
        .record(z.string(), z.string())
        .optional()
        .describe("Translations of the term into other languages."),
      culturalContext: z.string().optional().describe("Cultural background of the term."),
      funFacts: z.string().optional().describe("Notable facts about the term."),
    })
    .describe("The dictionary entry for the looked-up term."),
});

export const conversationSummaryOutputSchema = z.object({
  summary: z
    .string()
    .describe("A short recap of the conversation, written in targetLang."),
});
