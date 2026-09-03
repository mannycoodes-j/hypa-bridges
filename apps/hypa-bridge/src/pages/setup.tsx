/**
 * Home / setup — the "new conversation" experience. Pick who speaks what and
 * start talking; recent conversations are listed beneath for quick resume.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, ArrowUpDown, History, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "../store";
import { Button } from "../components/ui/button";
import { LanguagePicker } from "../components/shared/language-picker";
import { ThemeToggle } from "../components/shared/theme-toggle";
import { BridgeMark, Wordmark } from "../components/shared/logo";
import { formatClock, isToday, languageKey } from "../lib/format";

export function SetupPage() {
  const navigate = useNavigate();
  const store = useStore();
  const {
    languages,
    languagesLoading,
    languagesError,
    conversations,
    settings,
    setSettings,
    createConversation,
    removeConversation,
  } = store;

  const [youLang, setYouLang] = useState<string>(settings.youLang ?? "");
  const [themLang, setThemLang] = useState<string>(settings.themLang ?? "");
  const [starting, setStarting] = useState(false);

  const samePair =
    Boolean(youLang && themLang) && languageKey(youLang) === languageKey(themLang);
  const ready = Boolean(youLang && themLang) && !samePair;

  const recent = useMemo(
    () =>
      [...conversations].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
    [conversations],
  );

  const start = async () => {
    if (!ready || starting) return;
    setStarting(true);
    try {
      const conversation = createConversation({ youLang, themLang });
      setSettings({ youLang, themLang });
      navigate(`/c/${conversation.id}`);
    } finally {
      setStarting(false);
    }
  };

  const deleteConversation = (id: string, title: string) => {
    if (window.confirm(`Delete “${title}”? This can't be undone.`)) {
      removeConversation(id);
      toast.success("Conversation deleted.");
    }
  };

  return (
    <div className="paper flex min-h-dvh flex-col">
      {/* header */}
      <header className="flex items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" aria-label="Hypa Bridge home" className="flex items-center">
          <Wordmark />
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-10 px-4 py-8 sm:px-6">
        {/* hero */}
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <BridgeMark className="size-14 drop-shadow-sm" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Two people. Two languages.
            <br />
            <span className="text-tertiary">One conversation.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            Hypa Bridge translates each line as it's spoken or typed, so neither
            of you ever needs to stop and switch. Speak. Understand. Respond.
          </p>
        </div>

        {/* pair picker */}
        <section
          aria-label="Choose your languages"
          className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6"
        >
          {languagesLoading ? (
            <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
              <span className="flex gap-1" aria-hidden>
                <span className="size-1.5 animate-bounce rounded-full bg-tertiary [animation-delay:-160ms]" />
                <span className="size-1.5 animate-bounce rounded-full bg-tertiary [animation-delay:-80ms]" />
                <span className="size-1.5 animate-bounce rounded-full bg-tertiary" />
              </span>
              Loading languages…
            </div>
          ) : languagesError || languages.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {languagesError
                  ? "Couldn't load the language list."
                  : "No languages available."}
              </p>
              <p className="text-xs text-muted-foreground/80">
                Make sure the Bridge server is running on port 5182, then retry.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void store.refreshLanguages()}
              >
                Retry
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
                <Field label="You speak" hint="your language">
                  <LanguagePicker
                    languages={languages}
                    value={youLang}
                    onValueChange={setYouLang}
                    placeholder="Choose…"
                  />
                </Field>
                <div className="flex justify-center sm:pb-1">
                  <button
                    type="button"
                    onClick={() => {
                      setYouLang(themLang);
                      setThemLang(youLang);
                    }}
                    aria-label="Swap languages"
                    disabled={!youLang && !themLang}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
                  >
                    <ArrowUpDown className="size-4" aria-hidden />
                  </button>
                </div>
                <Field label="They speak" hint="their language">
                  <LanguagePicker
                    languages={languages}
                    value={themLang}
                    onValueChange={setThemLang}
                    placeholder="Choose…"
                    align="end"
                  />
                </Field>
              </div>

              {samePair && (
                <p className="text-center text-xs text-muted-foreground">
                  Both sides would speak {youLang} — pick two different languages
                  to translate between.
                </p>
              )}

              <Button
                size="lg"
                className="mt-1 w-full"
                disabled={!ready}
                onClick={() => void start()}
              >
                Start talking
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            </div>
          )}
        </section>
      </main>

      {/* recent conversations */}
      {recent.length > 0 && (
        <section
          aria-label="Recent conversations"
          className="mx-auto w-full max-w-xl px-4 pb-14 sm:px-6"
        >
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <History className="size-3.5" aria-hidden /> Recent
          </h2>
          <ul className="flex flex-col gap-1.5">
            {recent.map((c) => (
              <li key={c.id}>
                <div className="group flex items-center gap-3 rounded-2xl border border-transparent bg-card/70 px-3 py-2.5 transition-colors hover:border-border hover:bg-card">
                  <button
                    type="button"
                    onClick={() => navigate(`/c/${c.id}`)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-tertiary/12 text-tertiary">
                      <BridgeMark className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {c.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {c.messages.length} {c.messages.length === 1 ? "message" : "messages"}
                        {" · "}
                        {isToday(c.updatedAt)
                          ? `today at ${formatClock(c.updatedAt)}`
                          : new Date(c.updatedAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteConversation(c.id, c.title)}
                    aria-label={`Delete ${c.title}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
        <span className="ml-1.5 normal-case opacity-70">· {hint}</span>
      </span>
      {children}
    </label>
  );
}
