/**
 * Zod input schemas for the Bridge MCP tools. High-level, product-shaped —
 * agents ask for meaning or a reply, never raw model parameters.
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
