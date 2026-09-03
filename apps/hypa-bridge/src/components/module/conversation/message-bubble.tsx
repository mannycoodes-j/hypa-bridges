/**
 * A single message bubble. You-messages are filled and right-aligned;
 * Them-messages are card surfaces with the tertiary accent reserved for the
 * "other" speaker. Each bubble keeps original + translation together and offers
 * listen / copy / explain / word lookup. Selecting any word or phrase inside a
 * bubble surfaces a dictionary popover for that region's language.
 */

import { memo, useEffect, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  BookOpen,
  Check,
  Copy,
  Square,
  Sparkles,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../../lib/cn";
import { api, friendlyMessage } from "../../../lib/api";
import { formatClock, languageKey } from "../../../lib/format";
import type { BridgeMessage, Conversation } from "../../../lib/types";
import type { UseAudioEngine } from "../../../hooks/use-audio-engine";
import { DictionaryCard } from "./dictionary-card";

export interface MessageBubbleProps {
  message: BridgeMessage;
  conversation: Conversation;
  isYou: boolean;
  engine: UseAudioEngine;
  /** Recent transcript context (previous turns) for meaning requests. */
  context?: string;
  onMeaning: (messageId: string, meaning: string, meaningLang: string) => void;
}

const LangChip = ({
  label,
  tone,
}: {
  label: string;
  tone: "you" | "them";
}) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide",
      tone === "them" ? "text-tertiary" : "opacity-70",
    )}
  >
    <span
      aria-hidden
      className={cn(
        "size-1.5 rounded-full",
        tone === "them" ? "bg-tertiary" : "bg-current",
      )}
    />
    {label}
  </span>
);

function BubbleAction({
  icon: Icon,
  label,
  onClick,
  active,
  children,
}: {
  icon?: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  children?: ReactNode;
}) {
  const Comp = Icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-1.5 text-[11px] font-medium transition-colors",
        active
          ? "bg-tertiary text-tertiary-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {Comp && <Comp className="size-3" aria-hidden />}
      {children}
    </button>
  );
}

interface LookupTarget {
  x: number;
  y: number;
  text: string;
  lang: string;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  conversation,
  isYou,
  engine,
  context,
  onMeaning,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [meaningOpen, setMeaningOpen] = useState(Boolean(message.meaning));
  const [meaningLoading, setMeaningLoading] = useState(false);
  const [lookup, setLookup] = useState<LookupTarget | null>(null);

  const original = message.text;
  const translation = message.translation;
  const speakLang = message.translationLang;
  const voice =
    (isYou ? conversation.themVoice : conversation.youVoice) || undefined;
  const listenKey = `${message.id}:listen`;
  const playing = engine.playingKey === listenKey;
  const loading = engine.loadingKey === listenKey;

  const dictVoice =
    lookup && languageKey(lookup.lang) === languageKey(conversation.youLang)
      ? conversation.youVoice
      : conversation.themVoice;

  // --- selection → dictionary lookup ---------------------------------------

  const clearLookup = () => {
    setLookup(null);
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) sel.removeAllRanges();
  };

  useEffect(() => {
    if (!lookup) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.closest("[data-dict]") || target.closest("[data-lookup-pill]"))
      ) {
        return;
      }
      clearLookup();
    };
    window.addEventListener("pointerdown", onPointer, true);
    return () => window.removeEventListener("pointerdown", onPointer, true);
  }, [lookup]);

  const openLookup = (lang: string, el: HTMLElement) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setLookup(null);
      return;
    }
    const anchor = sel.anchorNode;
    const focus = sel.focusNode;
    if (!anchor || !focus) return;
    const aEl =
      anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement;
    const fEl =
      focus.nodeType === Node.ELEMENT_NODE ? focus : focus.parentElement;
    if (!aEl || !fEl || !el.contains(aEl) || !el.contains(fEl)) {
      setLookup(null);
      return;
    }
    const text = sel.toString().trim().replace(/\s+/g, " ");
    if (!text || text.length > 60 || text.includes("\n")) {
      setLookup(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      setLookup(null);
      return;
    }
    setLookup({ x: rect.left + rect.width / 2, y: rect.bottom + 6, text, lang });
  };

  // --- copy / listen / meaning ---------------------------------------------

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error("Couldn't copy — the clipboard is blocked.");
    }
  };

  const toggleListen = () => {
    if (playing || loading) {
      engine.stop(listenKey);
      return;
    }
    if (!translation) return;
    void engine
      .speak({ key: listenKey, text: translation, language: speakLang, voice })
      .catch((e) => toast.error(friendlyMessage(e)));
  };

  const toggleMeaning = async () => {
    if (meaningOpen) {
      setMeaningOpen(false);
      return;
    }
    if (message.meaning) {
      setMeaningOpen(true);
      return;
    }
    if (!translation) return;
    setMeaningLoading(true);
    try {
      const { meaning } = await api.understand({
        text: original,
        textLang: message.textLang,
        meaningLang: message.translationLang,
        context,
      });
      onMeaning(message.id, meaning, message.translationLang);
      setMeaningOpen(true);
    } catch (e) {
      toast.error(friendlyMessage(e));
    } finally {
      setMeaningLoading(false);
    }
  };

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1.5 fade-up",
        isYou ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "flex max-w-[86%] flex-col gap-0.5 sm:max-w-[76%]",
          isYou && "items-end",
        )}
      >
        <LangChip
          label={isYou ? `You · ${message.textLang}` : message.textLang}
          tone={isYou ? "you" : "them"}
        />

        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 shadow-xs",
            isYou
              ? "rounded-br-md bg-primary text-primary-foreground"
              : "rounded-bl-md border border-border bg-card text-card-foreground",
          )}
        >
          {/* the message as the other person will read it */}
          <p
            data-lang={speakLang}
            onMouseUp={(e) => openLookup(speakLang, e.currentTarget)}
            onTouchEnd={(e) => openLookup(speakLang, e.currentTarget)}
            className="whitespace-pre-wrap break-words text-[15px] leading-relaxed select-text"
          >
            {translation || original}
          </p>
          {/* the original alongside it */}
          {translation && translation !== original && (
            <p
              data-lang={message.textLang}
              onMouseUp={(e) => openLookup(message.textLang, e.currentTarget)}
              onTouchEnd={(e) => openLookup(message.textLang, e.currentTarget)}
              className={cn(
                "mt-2 border-t pt-2 text-[13px] leading-relaxed select-text",
                isYou
                  ? "border-primary-foreground/15 text-primary-foreground/70"
                  : "border-border text-muted-foreground",
              )}
            >
              <span className="mr-1.5 text-[10px] uppercase tracking-wide opacity-70">
                orig · {message.textLang}
              </span>
              {original}
            </p>
          )}
        </div>

        {/* per-message actions */}
        <div
          className={cn(
            "mt-0.5 flex items-center gap-0.5",
            isYou ? "flex-row-reverse" : "flex-row",
          )}
        >
          {translation && (
            <BubbleAction
              icon={playing ? Square : Volume2}
              label={playing ? "Stop" : loading ? "Preparing audio…" : "Listen in " + speakLang}
              onClick={toggleListen}
              active={playing || loading}
            >
              {loading ? "…" : undefined}
            </BubbleAction>
          )}
          <BubbleAction
            icon={copied ? Check : Copy}
            label="Copy original"
            onClick={() => void copy(original)}
          />
          {!isYou && translation && (
            <button
              type="button"
              onClick={() => void toggleMeaning()}
              disabled={meaningLoading}
              aria-busy={meaningLoading}
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium text-tertiary transition-colors hover:bg-tertiary/10 disabled:cursor-default disabled:opacity-70"
            >
              <Sparkles className="size-3" aria-hidden />
              {meaningLoading
                ? "Understanding…"
                : message.meaning && meaningOpen
                  ? "Hide meaning"
                  : "What do they mean?"}
            </button>
          )}
          <span className="px-1.5 text-[10px] text-muted-foreground">
            {formatClock(message.createdAt)}
          </span>
        </div>
      </div>

      {/* meaning panel (them messages only) */}
      {!isYou && meaningOpen && message.meaning && (
        <div className="max-w-[86%] rounded-r-xl rounded-bl-md border-l-2 border-tertiary bg-tertiary/8 py-2 pl-3 pr-4 sm:max-w-[76%]">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-tertiary">
            <Sparkles className="size-3" aria-hidden />
            What they meant
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {message.meaning}
          </p>
        </div>
      )}

      {/* selection → dictionary popover */}
      {lookup && (
        <Popover.Root
          onOpenChange={(open) => {
            if (!open) clearLookup();
          }}
        >
          <Popover.Anchor asChild>
            <span
              aria-hidden
              className="fixed h-0 w-0"
              style={{ left: lookup.x, top: lookup.y }}
            />
          </Popover.Anchor>
          <Popover.Trigger asChild>
            <button
              type="button"
              data-lookup-pill
              style={{ left: lookup.x, top: lookup.y + 2 }}
              className="fixed z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-popover px-2.5 py-1 text-xs font-medium text-foreground shadow-md transition-transform hover:scale-105"
            >
              <BookOpen className="size-3.5 text-tertiary" aria-hidden />
              Look up “{lookup.text.length > 28 ? lookup.text.slice(0, 28) + "…" : lookup.text}”
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="bottom"
              align="center"
              sideOffset={8}
              className="z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-popover p-3.5 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
            >
              <DictionaryCard
                word={lookup.text}
                language={lookup.lang}
                voice={dictVoice}
                engine={engine}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </div>
  );
});
