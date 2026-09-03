/**
 * Client-side store for Hypa Bridge.
 *
 * Holds the language catalog, settings, and the conversation list. Everything
 * persists to localStorage only — there are no accounts and the server stays
 * stateless. Audio is never persisted (only text); blobs live for the session.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "./lib/api";
import { uid } from "./lib/id";
import { conversationTitle } from "./lib/format";
import {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  type Conversation,
  type Settings,
  type Theme,
  type Language,
} from "./lib/types";

const SYSTEM_DARK =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-color-scheme: dark)").matches;

function loadPersisted(): { conversations: Conversation[]; settings: Settings } {
  const fallback = { conversations: [] as Conversation[], settings: DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as {
      conversations?: Conversation[];
      settings?: Partial<Settings>;
    };
    const conversations = Array.isArray(parsed.conversations)
      ? parsed.conversations
      : [];
    return {
      conversations,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    };
  } catch {
    return fallback;
  }
}

interface CreateConversationInput {
  youLang: string;
  themLang: string;
  youVoice?: string;
  themVoice?: string;
}

export interface BridgeStore {
  // catalog
  languages: Language[];
  languagesLoading: boolean;
  languagesError: string | null;
  refreshLanguages: () => Promise<void>;
  // settings + theme
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  effectiveDark: boolean;
  // conversations
  conversations: Conversation[];
  getConversation: (id: string) => Conversation | undefined;
  createConversation: (input: CreateConversationInput) => Conversation;
  updateConversation: (id: string, updater: (c: Conversation) => Conversation) => void;
  removeConversation: (id: string) => void;
}

const StoreContext = createContext<BridgeStore | null>(null);

export const useStore = (): BridgeStore => {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used within <StoreProvider>");
  return store;
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const initial = useRef(loadPersisted()).current;

  const [conversations, setConversations] = useState<Conversation[]>(
    initial.conversations,
  );
  const [settings, setSettingsState] = useState<Settings>(initial.settings);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [languagesLoading, setLanguagesLoading] = useState(true);
  const [languagesError, setLanguagesError] = useState<string | null>(null);

  // persist on change (whole list is small — messages are plain text)
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ conversations, settings }),
      );
    } catch {
      /* storage full / private mode — degrade silently */
    }
  }, [conversations, settings]);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((s) => ({ ...s, ...patch }));
  }, []);

  const refreshLanguages = useCallback(async () => {
    setLanguagesLoading(true);
    setLanguagesError(null);
    try {
      const { languages: list } = await api.models();
      setLanguages(list);
    } catch (e) {
      setLanguagesError(e instanceof Error ? e.message : "Couldn't load languages");
    } finally {
      setLanguagesLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshLanguages();
  }, [refreshLanguages]);

  const getConversation = useCallback(
    (id: string) => conversations.find((c) => c.id === id),
    [conversations],
  );

  const createConversation = useCallback((input: CreateConversationInput) => {
    const now = Date.now();
    const conversation: Conversation = {
      id: uid(),
      createdAt: now,
      updatedAt: now,
      title: conversationTitle(input.youLang, input.themLang),
      youLang: input.youLang,
      themLang: input.themLang,
      youVoice: input.youVoice,
      themVoice: input.themVoice,
      messages: [],
    };
    setConversations((list) => [conversation, ...list]);
    // remember this pair for next time
    setSettingsState((s) => ({ ...s, youLang: input.youLang, themLang: input.themLang }));
    return conversation;
  }, []);

  const updateConversation = useCallback(
    (id: string, updater: (c: Conversation) => Conversation) => {
      setConversations((list) =>
        list.map((c) => (c.id === id ? updater(c) : c)),
      );
    },
    [],
  );

  const removeConversation = useCallback((id: string) => {
    setConversations((list) => list.filter((c) => c.id !== id));
  }, []);

  // --- theme ----------------------------------------------------------------
  const [systemDark, setSystemDark] = useState<boolean>(SYSTEM_DARK);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const theme: Theme = settings.theme ?? "system";
  const effectiveDark =
    theme === "dark" || (theme === "system" && systemDark);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme ?? "system";
    root.classList.toggle("dark", effectiveDark);
  }, [effectiveDark, settings.theme]);

  const value = useMemo<BridgeStore>(
    () => ({
      languages,
      languagesLoading,
      languagesError,
      refreshLanguages,
      settings,
      setSettings,
      effectiveDark,
      conversations,
      getConversation,
      createConversation,
      updateConversation,
      removeConversation,
    }),
    [
      languages,
      languagesLoading,
      languagesError,
      refreshLanguages,
      settings,
      setSettings,
      effectiveDark,
      conversations,
      getConversation,
      createConversation,
      updateConversation,
      removeConversation,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
