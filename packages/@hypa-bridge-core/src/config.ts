/**
 * Bridge configuration.
 *
 * Everything here is pinned *by value* from Hypa's published model catalog
 * (`packages/@hypa-config/json/models.json` in the parent repo) so that Bridge
 * never imports the parent repo's config module. The live catalog is also
 * fetched at runtime from `GET /v2/developer/models` when available; these
 * values are the offline / cold-start fallback and the source for TTS voice
 * names (the live `/models` endpoint does not return per-language voices).
 */

export const BRIDGE_VERSION = "0.1.0";

/** Hosted Hypa developer-API origin. Overridable via HYPA_API_URL. */
export const HOSTED_API_URL = "https://api.hypaintelligence.com";

export const DEFAULT_PROVIDER = "hypaai" as const;

/** Default models, mirroring @hypa/config/json/models.json defaults. */
export const DEFAULT_MODELS = {
  mt: "Hypa-Llama3.1-8b-SFT",
  ac: "Hypa-Llama3.1-8b-SFT",
  tts: "hypa-orpheus-3b-tts-vc-flt",
  asr: "wspr-small-2025-11-11-12-12--mpk",
} as const;

export type ModelGroup = "MT" | "AC" | "TTS" | "ASR";

/**
 * Language labels of the default MT/AC model (`Hypa-Llama3.1-8b-SFT`),
 * exactly as declared in the parent repo's models.json. The developer MT API
 * requires `target_lang` to case-insensitively match one of these.
 */
export const DEFAULT_LANGUAGES: readonly string[] = [
  "Annang",
  "Arabic",
  "Ebira",
  "Efik",
  "Eggon",
  "English",
  "Fongbe",
  "French",
  "Hausa",
  "Ibibio",
  "Idoma",
  "Igala",
  "Igbo",
  "Nupe",
  "Pidgin",
  "Portuguese",
  "Spanish",
  "Swahili",
  "Tiv",
  "Twi",
  "Urhobo",
  "Yoruba",
];

/**
 * Per-language TTS voice names for the default hypaai TTS model
 * (`hypa-orpheus-3b-tts-vc-flt`). Keyed by the lowercased language label —
 * the same convention the developer TTS API expects in its `language` field.
 */
export const VOICES: Record<string, readonly string[]> = {
  annang: ["Deborah", "Enoima", "Inimform", "Ntakidara", "Uduak", "Utibeima"],
  arabic: ["Aliyu", "Dauda", "Idrees", "Rufa'i"],
  ebira: ["Amoto"],
  efik: [
    "Augustine",
    "Beatrice",
    "Daniel",
    "ImaBong",
    "Imaobong",
    "Jemimah",
    "Kooffreh",
    "Lilly",
    "Tabitha",
    "Udofot",
    "Umoh",
  ],
  eggon: ["Esla", "Faith"],
  english: ["Eniola", "Tara", "Alloy", "Juliet", "Beatrice", "Eunice", "Dan"],
  fongbe: ["Assogba", "Mahutin", "Sèdjlo"],
  french: [
    "Adaugo",
    "Alloy",
    "Balah",
    "Ballad",
    "Biakath",
    "Doualla",
    "Mercy",
    "Nguekem",
    "Prisca",
    "Randy",
    "Woubinwou",
  ],
  hausa: ["Juliet", "Asha", "Elisha", "Emmanuel", "Eunice", "Fatima", "Tapshak"],
  ibibio: ["Aitee", "Albert", "Comfort", "Edet", "Harrison"],
  idoma: ["Edache", "Ochekwu", "Roseline", "Shettima"],
  igala: ["Ojochegbe", "Ojodunwene", "Omachoko", "Zainab"],
  igbo: ["Amarachi", "Chinenye", "Enoch", "Gift", "Henrietta", "Oluchukwu", "Prince"],
  nupe: ["Alhassan", "Isah"],
  pidgin: ["Prince", "Eniola", "Asha", "Favour"],
  portuguese: ["Gbamwuan", "Hakeemat", "Salvador", "Temitope"],
  spanish: [
    "Alloy",
    "Ash",
    "Ballad",
    "Coral",
    "Karin",
    "Light",
    "Sokoudjou",
    "Ubenga",
    "Valeria",
  ],
  swahili: [
    "Kamau",
    "Kamojo",
    "Kangethe",
    "Lealo",
    "Lukoye",
    "Mukami",
    "Muriuki",
    "Njeri",
    "Siwa",
    "Wambui",
    "Wanjiru",
  ],
  tiv: ["David", "Fabian", "Ilioko", "Mercie", "Tovshima", "Victor"],
  twi: ["Nyarkoh"],
  urhobo: ["Happy"],
  yoruba: [
    "Eniola",
    "Favour",
    "Gbemisola",
    "Moyo",
    "Nofisat",
    "Olushola",
    "Oyeniyi",
    "Pauline",
    "Toyin",
  ],
};

/** Lowercases a language label into the voice-key / language-key convention. */
export const languageKey = (label: string): string =>
  label.trim().toLowerCase();

/** Human labels of every language that has TTS voices (== MT languages). */
export const voiceLanguages = (): string[] =>
  DEFAULT_LANGUAGES.filter((l) => languageKey(l) in VOICES);

/** Voice names available for a language label, or the server default if none. */
export const voicesForLanguage = (
  label: string,
): readonly string[] => VOICES[languageKey(label)] ?? [];

/** Sanitize a possibly-untouched raw label before sending upstream. */
export const normalizeLanguageLabel = (label: string | null | undefined): string =>
  (label ?? "").trim();
