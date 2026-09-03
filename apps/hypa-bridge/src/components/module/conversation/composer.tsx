/**
 * The composer bar: who is speaking, the text/mic input, and the send action.
 * Recording swaps the textarea for a focused capture surface with a live
 * equalizer and a running timer.
 */

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Mic, Square, X } from "lucide-react";
import { cn } from "../../../lib/cn";
import { Button } from "../../ui/button";
import type { SpeakerMode } from "../../../lib/types";

export interface ComposerProps {
  youLang: string;
  themLang: string;
  speaker: SpeakerMode;
  onSpeakerChange: (s: SpeakerMode) => void;
  disabled: boolean;
  busyLabel?: string | null;
  micError?: string | null;
  recording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  draft: string;
  onDraftChange: (value: string) => void;
  onSendText: () => void;
}

function useElapsed(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return seconds;
}

const formatSeconds = (s: number): string => {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
};

export function Composer({
  youLang,
  themLang,
  speaker,
  onSpeakerChange,
  disabled,
  busyLabel,
  micError,
  recording,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  draft,
  onDraftChange,
  onSendText,
}: ComposerProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const elapsed = useElapsed(recording);

  // auto-grow the textarea up to 6 lines
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = `${Math.min(ta.scrollHeight, 150)}px`;
  }, [draft]);

  const speakingLabel =
    speaker === "you" ? `You — speak in ${youLang}` : `They — speak in ${themLang}`;

  const submitText = () => {
    if (!draft.trim() || disabled || recording) return;
    onSendText();
  };

  return (
    <div className="border-t border-border/80 bg-background/85 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-sm sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
        {/* speaker switch */}
        <div
          role="radiogroup"
          aria-label="Who is speaking"
          className="mx-auto mb-2 grid w-full grid-cols-2 gap-1 rounded-full border border-border bg-secondary p-1 sm:max-w-sm"
        >
          {(["you", "them"] as const).map((side) => {
            const active = speaker === side;
            const label =
              side === "you" ? `You · ${youLang}` : `They · ${themLang}`;
            return (
              <button
                key={side}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled || recording}
                onClick={() => onSpeakerChange(side)}
                className={cn(
                  "h-8 truncate rounded-full px-3 text-xs font-medium transition-colors",
                  active
                    ? side === "you"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-tertiary text-tertiary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {recording ? (
          /* --- capture surface --- */
          <div className="flex flex-col items-center gap-3 py-3">
            <p className="text-sm font-medium" aria-live="polite">
              {speakingLabel}
            </p>
            <div
              className="relative flex items-center justify-center"
              aria-live="polite"
              aria-label={`Recording ${formatSeconds(elapsed)}`}
            >
              <span className="absolute h-16 w-16 animate-ping rounded-full bg-tertiary/25" />
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-tertiary text-tertiary-foreground shadow-md">
                <span className="eq text-white" aria-hidden>
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
              </span>
            </div>
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {formatSeconds(elapsed)}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancelRecording}
                aria-label="Discard recording"
              >
                <X className="size-4" aria-hidden /> Discard
              </Button>
              <Button
                variant="primary"
                onClick={onStopRecording}
                aria-label="Stop recording and transcribe"
              >
                <Square className="size-4 fill-current" aria-hidden /> Done
              </Button>
            </div>
            {micError && (
              <p className="max-w-sm text-center text-xs text-destructive" role="alert">
                {micError}
              </p>
            )}
          </div>
        ) : (
          /* --- text + mic --- */
          <div className="flex items-end gap-2 rounded-3xl border border-border bg-card p-1.5 shadow-xs focus-within:border-ring/70">
            <textarea
              ref={taRef}
              rows={1}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitText();
                }
              }}
              disabled={disabled}
              placeholder={`Message in ${speaker === "you" ? youLang : themLang}…`}
              aria-label={speakingLabel}
              className="max-h-[150px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            {micError && (
              <p className="sr-only" role="alert">
                {micError}
              </p>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onStartRecording}
              disabled={disabled || Boolean(draft.trim())}
              aria-label="Record a voice message"
              title="Record voice"
              className="shrink-0 rounded-full"
            >
              <Mic className="size-5" aria-hidden />
            </Button>
            <Button
              size="icon"
              onClick={submitText}
              disabled={disabled || !draft.trim()}
              aria-label="Send message"
              className="shrink-0 rounded-full bg-tertiary text-tertiary-foreground hover:bg-tertiary/90"
            >
              <ArrowUp className="size-5" aria-hidden />
            </Button>
          </div>
        )}

        {/* pipeline status line */}
        {busyLabel && !recording && (
          <p
            className="flex items-center justify-center gap-2 pt-2 text-xs font-medium text-muted-foreground"
            aria-live="polite"
          >
            <span
              aria-hidden
              className="size-1.5 animate-pulse rounded-full bg-tertiary"
            />
            {busyLabel}
          </p>
        )}
      </div>
    </div>
  );
}
