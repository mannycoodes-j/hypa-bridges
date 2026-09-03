/**
 * The conversation experience — the heart of Hypa Bridge.
 *
 * One device, two people: the composer lets either side type or speak in their
 * own language. Each message is stored with its original plus the translation
 * the other person reads. Sending runs the visible pipeline
 * (listening → transcribing → translating → ready) and updates the store only
 * when a message is complete, so bubbles never show half-translated text.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { ChevronLeft, Plus, Languages, Sparkles, ScrollText, AudioLines, Square, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "../store";
import { api, buildContext, friendlyMessage } from "../lib/api";
import { uid } from "../lib/id";
import { sameLanguage } from "../lib/format";
import { cn } from "../lib/cn";
import {
  CaptureError,
  startCapture,
  warmUpAudio,
  type CaptureController,
} from "../lib/audio";
import type {
  BridgeMessage,
  Conversation,
  PipelineState,
  SpeakerMode,
} from "../lib/types";
import { Composer } from "../components/module/conversation/composer";
import { MessageBubble } from "../components/module/conversation/message-bubble";
import { SummaryDialog } from "../components/module/conversation/summary-dialog";
import { VoicesDialog } from "../components/module/conversation/voices-dialog";
import { BridgeMark } from "../components/shared/logo";
import { ThemeToggle } from "../components/shared/theme-toggle";
import { useAudioEngine } from "../hooks/use-audio-engine";

const micErrorCopy = (e: CaptureError): string => {
  switch (e.kind) {
    case "denied":
      return "Microphone access was denied. Allow it for this site, then try again.";
    case "notfound":
      return "No microphone was found on this device.";
    case "unsupported":
      return "This browser doesn't support voice recording.";
    default:
      return e.message || "Couldn't start the microphone.";
  }
};

const stageLabel = (stage: PipelineState["stage"], target: string): string => {
  switch (stage) {
    case "listening":
      return "Listening…";
    case "transcribing":
      return "Writing down what was said…";
    case "translating":
      return `Translating into ${target}…`;
    case "understanding":
      return "Reading between the lines…";
    case "ready":
      return "Ready";
    default:
      return "";
  }
};

export function ConversationPage() {
  const { id } = useParams();
  const store = useStore();
  const conversation = id ? store.getConversation(id) : undefined;

  if (!conversation) {
    return <Navigate to="/" replace />;
  }
  return <ConversationView key={conversation.id} conversation={conversation} />;
}

function ConversationView({ conversation }: { conversation: Conversation }) {
  const navigate = useNavigate();
  const store = useStore();

  const [speaker, setSpeaker] = useState<SpeakerMode>("you");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<PipelineState>({ stage: "idle" });
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [voicesOpen, setVoicesOpen] = useState(false);
  const [suggest, setSuggest] = useState<{
    open: boolean;
    loading: boolean;
    items: string[];
  }>({ open: false, loading: false, items: [] });

  const captureRef = useRef<CaptureController | null>(null);
  const busyRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const engine = useAudioEngine();

  const youLang = conversation.youLang;
  const themLang = conversation.themLang;
  const conversationId = conversation.id;

  // --- helpers -------------------------------------------------------------

  const patchMessages = useCallback(
    (fn: (list: BridgeMessage[]) => BridgeMessage[]) => {
      store.updateConversation(conversationId, (c) => ({
        ...c,
        updatedAt: Date.now(),
        messages: fn(c.messages),
      }));
    },
    [conversationId, store],
  );

  const appendMessage = useCallback(
    (message: BridgeMessage) => patchMessages((list) => [...list, message]),
    [patchMessages],
  );

  const applyMeaning = useCallback(
    (messageId: string, meaning: string, meaningLang: string) =>
      patchMessages((list) =>
        list.map((m) => (m.id === messageId ? { ...m, meaning, meaningLang } : m)),
      ),
    [patchMessages],
  );

  const contextTurns = useMemo(
    () =>
      conversation.messages.map((m) => ({
        speaker: m.role === "you" ? "You" : "They",
        text: m.text,
      })),
    [conversation.messages],
  );

  // --- help me respond --------------------------------------------------------

  const closeSuggest = useCallback(() => {
    engine.stop();
    setSuggest({ open: false, loading: false, items: [] });
  }, [engine]);

  const requestSuggestions = useCallback(async () => {
    if (suggest.loading) return;
    const last = conversation.messages[conversation.messages.length - 1];
    if (!last || last.role !== "them" || !last.translation) return;
    setSuggest({ open: true, loading: true, items: [] });
    try {
      const { suggestions } = await api.suggest({
        text: last.text,
        textLang: last.textLang,
        replyLang: youLang,
        context: buildContext(contextTurns.slice(0, -1)),
      });
      setSuggest({ open: true, loading: false, items: suggestions });
    } catch (e) {
      toast.error(friendlyMessage(e));
      setSuggest({ open: true, loading: false, items: [] });
    }
  }, [suggest.loading, conversation.messages, youLang, contextTurns]);

  const useSuggestion = useCallback(
    (text: string) => {
      setSpeaker("you");
      setDraft(text);
      closeSuggest();
    },
    [closeSuggest],
  );

  const previewSuggestion = useCallback(
    (index: number, text: string) => {
      const key = `suggest:${conversationId}:${index}`;
      if (engine.playingKey === key) {
        engine.stop(key);
        return;
      }
      void engine
        .speak({
          key,
          text,
          language: youLang,
          voice: conversation.youVoice,
        })
        .catch((e) => toast.error(friendlyMessage(e)));
    },
    [conversationId, engine, youLang, conversation.youVoice],
  );

  const setVoice = useCallback(
    (side: "you" | "them", voice?: string) => {
      store.updateConversation(conversationId, (c) =>
        side === "you" ? { ...c, youVoice: voice } : { ...c, themVoice: voice },
      );
    },
    [conversationId, store],
  );

  // --- text send -------------------------------------------------------------

  const sendText = useCallback(async () => {
    const text = draft.trim();
    if (!text || busyRef.current) return;
    busyRef.current = true;
    setDraft("");

    const sourceLang = speaker === "you" ? youLang : themLang;
    const targetLang = speaker === "you" ? themLang : youLang;
    setBusy({ stage: "translating", role: speaker });
    try {
      const translation =
        sameLanguage(sourceLang, targetLang)
          ? text
          : (await api.translate({ text, sourceLang, targetLang })).translation;
      appendMessage({
        id: uid(),
        role: speaker,
        source: "text",
        createdAt: Date.now(),
        text,
        textLang: sourceLang,
        translation,
        translationLang: targetLang,
      });
      setBusy({ stage: "ready", role: speaker });
      window.setTimeout(() => setBusy((b) => (b.stage === "ready" ? { stage: "idle" } : b)), 450);
    } catch (e) {
      toast.error(friendlyMessage(e));
      setDraft(text);
      setBusy({ stage: "idle" });
    } finally {
      busyRef.current = false;
    }
  }, [draft, speaker, youLang, themLang, appendMessage]);

  // --- voice ----------------------------------------------------------------

  const startRecording = useCallback(async () => {
    if (busyRef.current || recording) return;
    warmUpAudio();
    try {
      const capture = await startCapture();
      captureRef.current = capture;
      setMicError(null);
      setRecording(true);
      setBusy({ stage: "listening", role: speaker });
    } catch (e) {
      const copy = e instanceof CaptureError ? micErrorCopy(e) : "Couldn't record audio.";
      setMicError(copy);
      toast.error(copy);
    }
  }, [recording, speaker]);

  const cancelRecording = useCallback(() => {
    captureRef.current?.cancel();
    captureRef.current = null;
    setRecording(false);
    setBusy({ stage: "idle" });
    setMicError(null);
  }, []);

  const finishRecording = useCallback(async () => {
    const capture = captureRef.current;
    captureRef.current = null;
    setRecording(false);
    if (!capture || busyRef.current) return;
    busyRef.current = true;

    const sourceLang = speaker === "you" ? youLang : themLang;
    const targetLang = speaker === "you" ? themLang : youLang;
    try {
      setBusy({ stage: "transcribing", role: speaker });
      const { audioBase64 } = await capture.stop();
      const { text } = await api.asr({ audio: audioBase64, audioType: "base64" });
      if (!text.trim()) {
        toast.error("I couldn't make out any words — try speaking a little closer to the mic.");
        setBusy({ stage: "idle" });
        return;
      }
      setBusy({ stage: "translating", role: speaker });
      const translation =
        sameLanguage(sourceLang, targetLang)
          ? text
          : (await api.translate({ text, sourceLang, targetLang })).translation;
      appendMessage({
        id: uid(),
        role: speaker,
        source: "voice",
        createdAt: Date.now(),
        text,
        textLang: sourceLang,
        translation,
        translationLang: targetLang,
      });
      setBusy({ stage: "ready", role: speaker });
      window.setTimeout(() => setBusy((b) => (b.stage === "ready" ? { stage: "idle" } : b)), 450);
    } catch (e) {
      toast.error(friendlyMessage(e));
      setBusy({ stage: "idle" });
    } finally {
      busyRef.current = false;
    }
  }, [speaker, youLang, themLang, appendMessage]);

  // --- scroll to bottom when the list grows --------------------------------

  const messageCount = conversation.messages.length;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messageCount, conversationId]);

  const isBusy = busy.stage !== "idle" && busy.stage !== "ready";
  const busyLabel =
    busy.stage === "idle"
      ? null
      : stageLabel(busy.stage, speaker === "you" ? themLang : youLang);

  const lastMessage = conversation.messages[conversation.messages.length - 1];
  const canSuggest =
    Boolean(lastMessage && lastMessage.role === "them" && lastMessage.translation) &&
    !isBusy &&
    !recording;

  return (
    <div className="paper flex h-dvh flex-col">
      {/* --- header --- */}
      <header className="flex items-center gap-1 border-b border-border/80 bg-background/85 px-2.5 py-2.5 backdrop-blur-sm sm:px-5">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="Back to start"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="hidden h-7 w-7 items-center justify-center rounded-full bg-tertiary/15 text-tertiary sm:flex">
            <Languages className="size-3.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{conversation.title}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              You speak {youLang} · They speak {themLang}
            </p>
          </div>
        </div>

        <Link
          to="/"
          className="hidden items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-secondary/70 sm:inline-flex"
        >
          <Plus className="size-3.5" aria-hidden />
          New
        </Link>
        <Link
          to="/"
          aria-label="Start a new conversation"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary sm:hidden"
        >
          <Plus className="size-5" aria-hidden />
        </Link>
        <div className="flex shrink-0 items-center">
          {conversation.messages.length > 0 && (
            <button
              type="button"
              onClick={() => setSummaryOpen(true)}
              aria-label="Summarise conversation"
              title="Conversation summary"
              className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ScrollText className="size-[18px]" aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={() => setVoicesOpen(true)}
            aria-label="Voice settings"
            title="Voices"
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
          >
            <AudioLines className="size-[18px]" aria-hidden />
          </button>
        </div>
        <ThemeToggle compact />
      </header>

      {/* --- messages --- */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5 sm:px-6"
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          {conversation.messages.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <div className="flex size-16 items-center justify-center rounded-3xl border border-border bg-card shadow-xs">
                <BridgeMark className="size-9" />
              </div>
              <h2 className="text-lg font-semibold tracking-tight">
                You speak {youLang}. They speak {themLang}.
              </h2>
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                Everything you say is translated for the other person, and
                everything they say is translated for you. Type or record your
                side, then hand the device over — choose{" "}
                <span className="font-medium text-foreground">“They”</span> when
                it's their turn.
              </p>
            </div>
          ) : (
            conversation.messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                conversation={conversation}
                isYou={message.role === "you"}
                engine={engine}
                context={buildContext(contextTurns.slice(0, index))}
                onMeaning={applyMeaning}
              />
            ))
          )}

          {/* working indicator bubble */}
          {isBusy && !recording && (
            <div
              className="flex items-center gap-2 self-start rounded-2xl rounded-bl-md border border-border bg-card px-4 py-2.5 text-xs text-muted-foreground"
              aria-hidden
            >
              <span className="flex gap-0.5" aria-hidden>
                <span className="size-1 animate-bounce rounded-full bg-tertiary [animation-delay:-160ms]" />
                <span className="size-1 animate-bounce rounded-full bg-tertiary [animation-delay:-80ms]" />
                <span className="size-1 animate-bounce rounded-full bg-tertiary" />
              </span>
              {busy.stage === "translating"
                ? `Translating into ${speaker === "you" ? themLang : youLang}…`
                : stageLabel(busy.stage, "")}
            </div>
          )}
        </div>
      </div>

      {/* --- help me respond --- */}
      {canSuggest && (
        <div className="px-3 pb-1.5 sm:px-6">
          <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-1.5">
            {suggest.open ? (
              suggest.loading ? (
                <p className="flex items-center gap-2 rounded-full bg-secondary/70 px-3 py-1 text-xs font-medium text-muted-foreground">
                  <span className="size-1.5 animate-pulse rounded-full bg-tertiary" aria-hidden />
                  Thinking of replies…
                </p>
              ) : suggest.items.length > 0 ? (
                <div className="w-full rounded-2xl border border-border/80 bg-card/80 p-2 shadow-xs backdrop-blur-sm">
                  <div className="flex items-center justify-between px-1.5 pb-1">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Sparkles className="size-3.5 text-tertiary" aria-hidden />
                      Suggested replies
                    </p>
                    <button
                      type="button"
                      onClick={closeSuggest}
                      aria-label="Close suggestions"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </div>
                  <ul className="flex flex-col gap-1">
                    {suggest.items.map((item, i) => {
                      const sKey = `suggest:${conversationId}:${i}`;
                      const sPlaying = engine.playingKey === sKey;
                      return (
                        <li key={i} className="group flex items-center gap-1 rounded-xl px-1.5 transition-colors hover:bg-secondary/70">
                          <button
                            type="button"
                            onClick={() => useSuggestion(item)}
                            className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-[13px] leading-snug text-foreground/90"
                          >
                            {item}
                          </button>
                          <button
                            type="button"
                            onClick={() => previewSuggestion(i, item)}
                            aria-label={sPlaying ? "Stop preview" : "Preview reply"}
                            title={sPlaying ? "Stop" : "Hear it"}
                            className={cn(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                              sPlaying
                                ? "bg-tertiary text-tertiary-foreground"
                                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                            )}
                          >
                            {sPlaying ? (
                              <Square className="size-3.5 fill-current" aria-hidden />
                            ) : (
                              <Volume2 className="size-3.5" aria-hidden />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="px-2 pb-1 pt-1.5 text-[10px] text-muted-foreground">
                    Tap a reply to edit it before sending.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={closeSuggest}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  No suggestions came back — close
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => void requestSuggestions()}
                className="inline-flex items-center gap-1.5 rounded-full border border-tertiary/25 bg-tertiary/8 px-3.5 py-1.5 text-xs font-medium text-tertiary transition-colors hover:bg-tertiary/15"
              >
                <Sparkles className="size-3.5" aria-hidden />
                Help me respond
              </button>
            )}
          </div>
        </div>
      )}

      {/* --- composer --- */}
      <Composer
        youLang={youLang}
        themLang={themLang}
        speaker={speaker}
        onSpeakerChange={(s) => {
          engine.stop();
          setSpeaker(s);
          setMicError(null);
        }}
        disabled={isBusy || recording}
        busyLabel={recording ? null : busyLabel}
        micError={micError}
        recording={recording}
        onStartRecording={() => void startRecording()}
        onStopRecording={() => void finishRecording()}
        onCancelRecording={cancelRecording}
        draft={draft}
        onDraftChange={setDraft}
        onSendText={() => void sendText()}
      />

      {/* --- dialogs --- */}
      <SummaryDialog
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        conversation={conversation}
        engine={engine}
      />
      <VoicesDialog
        open={voicesOpen}
        onOpenChange={setVoicesOpen}
        conversation={conversation}
        languages={store.languages}
        onVoiceChange={setVoice}
      />
    </div>
  );
}
