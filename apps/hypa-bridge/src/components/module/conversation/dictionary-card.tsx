/**
 * Dictionary card shown in the word-lookup popover. Fetches on open and lays
 * out whatever the Hypa dictionary returned — definitions, usage, synonyms,
 * antonyms and any cultural notes — tolerantly (some words legitimately come
 * back without `definitions`).
 */

import { useEffect, useState } from "react";
import { BookOpen, Check, Copy, Square, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { api, friendlyMessage, type DictionaryResult } from "../../../lib/api";
import { Spinner } from "../../ui/spinner";
import type { UseAudioEngine } from "../../../hooks/use-audio-engine";

export interface DictionaryCardProps {
  word: string;
  language: string;
  voice?: string;
  engine: UseAudioEngine;
}

const section = (title: string) => (
  <h4 className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
    {title}
  </h4>
);

export function DictionaryCard({ word, language, voice, engine }: DictionaryCardProps) {
  const [result, setResult] = useState<DictionaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .dictionary({ word, language })
      .then(({ result: r }) => {
        if (alive) setResult(r);
      })
      .catch((e) => {
        if (alive) setError(friendlyMessage(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [word, language]);

  const dictKey = `dict:${word}:${language}`;
  const playing = engine.playingKey === dictKey;

  const toggleListen = () => {
    if (playing) {
      engine.stop(dictKey);
      return;
    }
    void engine.speak({ key: dictKey, text: word, language, voice }).catch((e) => {
      toast.error(friendlyMessage(e));
    });
  };

  const copyWord = async () => {
    try {
      await navigator.clipboard.writeText(word);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  if (loading) {
    return (
      <div className="flex w-72 items-center gap-2 px-1 py-6 text-sm text-muted-foreground">
        <Spinner /> Looking up “{word}”…
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="w-72 px-1 py-4 text-sm text-muted-foreground">
        {error || `No dictionary entry for “${word}”.`}
      </div>
    );
  }

  const definitions = (result.definitions ?? []).filter((d) => d?.text?.trim());
  const usage = result.usage ?? [];
  const synonyms = result.synonyms ?? result.syms ?? [];
  const antonyms = result.antonyms ?? result.antm ?? [];

  return (
    <div data-dict className="w-72">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold leading-tight">{result.word}</p>
          <p className="text-[11px] uppercase tracking-wide text-tertiary">{language}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={toggleListen}
            aria-label={playing ? "Stop" : "Pronounce word"}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {playing ? (
              <Square className="size-3.5 fill-current" aria-hidden />
            ) : (
              <Volume2 className="size-3.5" aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={() => void copyWord()}
            aria-label="Copy word"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {copied ? (
              <Check className="size-3.5 text-tertiary" aria-hidden />
            ) : (
              <Copy className="size-3.5" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {definitions.length > 0 && (
        <div>
          {section(definitions.length > 1 ? "Meanings" : "Meaning")}
          <ul className="mt-1 space-y-1">
            {definitions.map((d, i) => (
              <li key={i} className="flex gap-2 text-sm leading-snug">
                {d.type && (
                  <span className="shrink-0 rounded bg-tertiary/12 px-1 py-px text-[10px] font-medium uppercase text-tertiary">
                    {d.type}
                  </span>
                )}
                <span>{d.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {usage.length > 0 && (
        <div>
          {section("In use")}
          {usage.map((u, i) => (
            <p key={i} className="mt-1 text-sm italic leading-snug text-foreground/90">
              “{u}”
            </p>
          ))}
        </div>
      )}

      {(synonyms.length > 0 || antonyms.length > 0) && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 pt-2">
          {synonyms.length > 0 && (
            <ChipGroup label="Similar" values={synonyms.slice(0, 6)} />
          )}
          {antonyms.length > 0 && (
            <ChipGroup label="Opposite" values={antonyms.slice(0, 6)} tone="muted" />
          )}
        </div>
      )}

      {(result.cultural_context || result.fun_facts) && (
        <p className="mt-3 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">
          <BookOpen className="mr-1 inline size-3" aria-hidden />
          {result.cultural_context || result.fun_facts}
        </p>
      )}
    </div>
  );
}

function ChipGroup({
  label,
  values,
  tone = "tertiary",
}: {
  label: string;
  values: string[];
  tone?: "tertiary" | "muted";
}) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="flex max-w-[16rem] flex-wrap gap-1">
        {values.map((v) => (
          <span
            key={v}
            className={
              tone === "tertiary"
                ? "rounded-full bg-tertiary/12 px-2 py-px text-xs text-tertiary"
                : "rounded-full bg-secondary px-2 py-px text-xs text-muted-foreground"
            }
          >
            {v}
          </span>
        ))}
      </span>
    </span>
  );
}
