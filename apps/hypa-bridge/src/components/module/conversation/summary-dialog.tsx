/**
 * Conversation summary dialog. Generates a short "what happened" recap in your
 * language from the raw message list, with copy + listen actions.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Copy, RefreshCw, ScrollText, Square, Volume2, X } from "lucide-react";
import { api, friendlyMessage } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import type { Conversation } from "../../../lib/types";
import type { UseAudioEngine } from "../../../hooks/use-audio-engine";
import { Spinner } from "../../ui/spinner";

export interface SummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation;
  engine: UseAudioEngine;
}

export function SummaryDialog({
  open,
  onOpenChange,
  conversation,
  engine,
}: SummaryDialogProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inFlight = useRef(false);
  const key = `${conversation.id}:summary`;
  const playing = engine.playingKey === key;

  const generate = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const turns = conversation.messages.map((m) => ({
        speaker: m.role === "you" ? "You" : "They",
        language: m.textLang,
        text: m.text,
      }));
      const { summary: text } = await api.summarise({
        turns,
        targetLang: conversation.youLang,
      });
      setSummary(text);
    } catch (e) {
      setError(friendlyMessage(e));
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [conversation]);

  useEffect(() => {
    if (open && !summary && !inFlight.current) void generate();
  }, [open, summary, generate]);

  const copy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked */
    }
  };

  const toggleListen = () => {
    if (!summary) return;
    if (playing) {
      engine.stop(key);
      return;
    }
    void engine
      .speak({
        key,
        text: summary,
        language: conversation.youLang,
        voice: conversation.youVoice,
      })
      .catch(() => undefined);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,460px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border bg-popover p-5 text-popover-foreground shadow-xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:p-6"
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
                <span className="flex size-7 items-center justify-center rounded-lg bg-tertiary/15 text-tertiary">
                  <ScrollText className="size-4" aria-hidden />
                </span>
                Conversation summary
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
                A quick recap in {conversation.youLang}
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

          <div className="mt-4 min-h-24">
            {loading && (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Spinner /> Reading back the conversation…
              </div>
            )}
            {error && !loading && (
              <div className="flex flex-col items-start gap-3 py-4">
                <p className="text-sm text-muted-foreground">{error}</p>
                <button
                  type="button"
                  onClick={() => void generate()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                >
                  <RefreshCw className="size-3.5" aria-hidden /> Try again
                </button>
              </div>
            )}
            {summary && !loading && (
              <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                {summary}
              </p>
            )}
          </div>

          <div className="mt-4 flex items-center justify-end gap-1.5 border-t border-border pt-3">
            <button
              type="button"
              onClick={toggleListen}
              disabled={!summary || loading}
              aria-label={playing ? "Stop" : "Listen to summary"}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                playing
                  ? "bg-tertiary text-tertiary-foreground"
                  : "border border-border hover:bg-secondary",
                (!summary || loading) && "opacity-50",
              )}
            >
              {playing ? (
                <Square className="size-3.5 fill-current" aria-hidden />
              ) : (
                <Volume2 className="size-3.5" aria-hidden />
              )}
              {playing ? "Stop" : "Listen"}
            </button>
            <button
              type="button"
              onClick={() => void copy()}
              disabled={!summary || loading}
              aria-label="Copy summary"
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                copied
                  ? "bg-tertiary text-tertiary-foreground"
                  : "border border-border hover:bg-secondary",
                (!summary || loading) && "opacity-50",
              )}
            >
              {copied ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
