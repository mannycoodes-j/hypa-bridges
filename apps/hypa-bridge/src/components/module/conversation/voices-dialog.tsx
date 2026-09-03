/**
 * Voice settings dialog — pick which TTS voice each side uses. Voices come from
 * the live catalog (per language). "Default" lets the server choose.
 */

import * as Dialog from "@radix-ui/react-dialog";
import { AudioLines, X } from "lucide-react";
import { cn } from "../../../lib/cn";
import { findLanguage } from "../../../lib/format";
import type { Conversation, Language } from "../../../lib/types";

export interface VoicesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation;
  languages: Language[];
  onVoiceChange: (side: "you" | "them", voice?: string) => void;
}

type VoiceOption = { label: string; value: string };

const optionsFor = (
  languageLabel: string,
  languages: Language[],
): VoiceOption[] => {
  const language = findLanguage(languages, languageLabel);
  const voices = language?.voices ?? [];
  return [
    { label: "Default", value: "" },
    ...voices.map((v) => ({ label: v, value: v })),
  ];
};

function VoiceSide({
  title,
  lang,
  current,
  languages,
  onChange,
}: {
  title: string;
  lang: string;
  current?: string;
  languages: Language[];
  onChange: (voice?: string) => void;
}) {
  const options = optionsFor(lang, languages);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-xs font-medium text-foreground">
        {title} <span className="font-normal text-muted-foreground">· {lang}</span>
      </legend>
      <div
        role="radiogroup"
        aria-label={`Voice for ${title}`}
        className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto"
      >
        {options.map((option) => {
          const selected =
            current === option.value ||
            (!current && option.value === "");
          return (
            <button
              key={option.value || "default"}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value || undefined)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                selected
                  ? "border-transparent bg-tertiary text-tertiary-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
        {options.length === 1 && (
          <p className="text-xs text-muted-foreground">
            No named voices listed — the default will be used.
          </p>
        )}
      </div>
    </fieldset>
  );
}

export function VoicesDialog({
  open,
  onOpenChange,
  conversation,
  languages,
  onVoiceChange,
}: VoicesDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,460px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border bg-popover p-5 text-popover-foreground shadow-xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
                <span className="flex size-7 items-center justify-center rounded-lg bg-tertiary/15 text-tertiary">
                  <AudioLines className="size-4" aria-hidden />
                </span>
                Voices
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
                Choose the voice you hear for each side
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-5 flex flex-col gap-5">
            <VoiceSide
              title="You"
              lang={conversation.youLang}
              current={conversation.youVoice}
              languages={languages}
              onChange={(voice) => onVoiceChange("you", voice)}
            />
            <div className="h-px bg-border" />
            <VoiceSide
              title="They"
              lang={conversation.themLang}
              current={conversation.themVoice}
              languages={languages}
              onChange={(voice) => onVoiceChange("them", voice)}
            />
          </div>

          <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
            Voices only affect new audio. If the list looks short for a language,
            “Default” is always available.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
