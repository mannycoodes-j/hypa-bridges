/**
 * Single-at-a-time audio playback for message listening.
 *
 * Only one clip plays at any moment; starting a new clip stops the previous.
 * The caller passes a stable `key` (message id + language) so the UI can show
 * per-message playing/loading states.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { playBase64Audio, type AudioPlayback } from "../lib/audio";

export interface UseAudioEngine {
  /** The key currently audible, if any. */
  playingKey: string | null;
  /** The key currently fetching TTS for. */
  loadingKey: string | null;
  /** Fetch TTS for text and play it. */
  speak: (input: { key: string; text: string; language: string; voice?: string }) => Promise<void>;
  /** Stop whatever is playing (optionally only if it matches `key`). */
  stop: (key?: string) => void;
}

export function useAudioEngine(): UseAudioEngine {
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const playbackRef = useRef<AudioPlayback | null>(null);
  const keyRef = useRef<string | null>(null);

  const stop = useCallback((key?: string) => {
    const current = playbackRef.current;
    const currentKey = keyRef.current;
    if (!current) return;
    if (key && currentKey && currentKey !== key) return;
    current.stop();
    playbackRef.current = null;
    keyRef.current = null;
    setPlayingKey((k) => (k && key && k !== key ? k : null));
  }, []);

  useEffect(() => {
    return () => {
      playbackRef.current?.stop();
    };
  }, []);

  const speak = useCallback(
    async ({ key, text, language, voice }: { key: string; text: string; language: string; voice?: string }) => {
      // Tapping a playing message stops it instead of replaying.
      if (keyRef.current === key && playbackRef.current) {
        stop(key);
        return;
      }
      stop();
      setLoadingKey(key);
      try {
        const { audioBase64 } = await api.tts({ text, language, voice });
        keyRef.current = key;
        const playback = await playBase64Audio(audioBase64, "audio/wav");
        playbackRef.current = playback;
        setLoadingKey(null);
        setPlayingKey(key);
        await playback.done;
        if (keyRef.current === key) {
          keyRef.current = null;
          playbackRef.current = null;
          setPlayingKey(null);
        }
      } catch {
        setLoadingKey(null);
        // Stop quietly — caller surfaces errors via toast.
        keyRef.current = null;
        playbackRef.current = null;
        setPlayingKey((k) => (k === key ? null : k));
      }
    },
    [stop],
  );

  return { playingKey, loadingKey, speak, stop };
}
