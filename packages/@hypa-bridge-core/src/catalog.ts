/**
 * Language / voice catalog.
 *
 * The live `GET /v2/developer/models` response contains language labels but
 * deliberately omits per-language TTS voices (verified in the parent repo's
 * `DeveloperSharedService.getAvailableModels`, which maps models without their
 * `voices`). Bridge therefore merges live languages with the pinned voice map
 * from config.ts. Live fetches are cached in memory and always fall back to
 * the pinned catalog rather than failing.
 */

import { DEFAULT_LANGUAGES, languageKey, VOICES, voicesForLanguage } from "./config";
import type { HypaClient } from "./hypa/client";

export interface Language {
  /** Human label as the MT API expects it, e.g. "Yoruba". */
  label: string;
  /** Lowercased label — the voice/language key convention. */
  code: string;
  /** Available TTS voice names for this language. */
  voices: string[];
}

const CACHE_TTL_MS = 30 * 60 * 1000;

export class Catalog {
  private cache: { languages: Language[]; fetchedAt: number } | null = null;
  private inflight: Promise<Language[]> | null = null;

  constructor(private readonly client: HypaClient) {}

  private pinned(): Language[] {
    return DEFAULT_LANGUAGES.map((label) => ({
      label,
      code: languageKey(label),
      voices: [...voicesForLanguage(label)],
    }));
  }

  private async fetchLive(): Promise<Language[]> {
    const { providerModels } = await this.client.listModels("MT", "hypaai");
    const defaultModel =
      providerModels.find((m) => m.default) ??
      providerModels.find((m) => m.languages?.length) ??
      providerModels[0];
    const labels = defaultModel?.languages?.filter(Boolean) ?? DEFAULT_LANGUAGES;

    // Prefer the live list, but union in any pinned language the model omitted
    // so the UI never drops an option the model actually supports.
    const seen = new Set(labels.map((l) => languageKey(l)));
    const merged = [...labels];
    for (const label of DEFAULT_LANGUAGES) {
      const key = languageKey(label);
      if (!seen.has(key)) {
        merged.push(label);
        seen.add(key);
      }
    }

    return merged.map((label) => ({
      label,
      code: languageKey(label),
      voices: [...voicesForLanguage(label)],
    }));
  }

  /** Languages + voices. Never rejects — falls back to the pinned catalog. */
  getLanguages(): Promise<Language[]> {
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      return Promise.resolve(this.cache.languages);
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.fetchLive()
      .then((languages) => {
        this.cache = { languages, fetchedAt: Date.now() };
        return languages;
      })
      .catch(() => {
        // Upstream degraded/unreachable — serve the pinned catalog and cache it
        // so the UI doesn't hang on a fresh network attempt for every call.
        const languages = this.pinned();
        this.cache = { languages, fetchedAt: Date.now() };
        return languages;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  /** Force a refresh (settings screen "refresh catalog" not exposed in v1). */
  async refresh(): Promise<Language[]> {
    this.cache = null;
    return this.getLanguages();
  }
}

export { languageKey, VOICES, voicesForLanguage };
