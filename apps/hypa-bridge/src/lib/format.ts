import type { Language } from "./types";

/** Match a server language label case-insensitively (labels like "Yorùbá"). */
export const languageKey = (label: string): string => label.trim().toLowerCase();

export const sameLanguage = (a?: string, b?: string): boolean =>
  Boolean(a && b && languageKey(a) === languageKey(b));

/** Given a list of languages, find by label (case-insensitive). */
export const findLanguage = (list: Language[], label?: string): Language | undefined =>
  label ? list.find((l) => languageKey(l.label) === languageKey(label)) : undefined;

/** Human-friendly "English ⇄ Yorùbá" conversation title. */
export const conversationTitle = (a: string, b: string): string => `${a} ⇄ ${b}`;

export const formatClock = (ts: number): string =>
  new Date(ts).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

export const formatDay = (ts: number): string =>
  new Date(ts).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

/** Is `ts` today? */
export const isToday = (ts: number): boolean => {
  const d = new Date(ts);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
};
