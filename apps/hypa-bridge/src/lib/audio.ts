/**
 * Browser audio for Hypa Bridge.
 *
 * Input:  mic → PCM → WAV (16 kHz, mono, PCM16) → base64, the exact shape the
 *         Hypa ASR model expects. Mirrors the @hypa/audio capture + encodeWAV
 *         pattern locally so Bridge stays independent of parent packages.
 * Output: WAV (from TTS) decoded and played through a shared AudioContext with
 *         iOS unlock, plus a stop controller for pause/cancel.
 *
 * Everything is gesture-initiated (recording, playback) so the context can be
 * unlocked on the user's tap, per mobile Safari's autoplay policy.
 */

export type CaptureErrorKind = "unsupported" | "denied" | "notfound" | "aborted";

export class CaptureError extends Error {
  readonly kind: CaptureErrorKind;
  constructor(kind: CaptureErrorKind, message: string) {
    super(message);
    this.name = "CaptureError";
    this.kind = kind;
  }
}

// --- shared AudioContext singleton ------------------------------------------

let sharedContext: AudioContext | null = null;

export const getAudioContext = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) sharedContext = new Ctor();
  return sharedContext;
};

/** Call from a user gesture to make sure the context is running (iOS). */
export const warmUpAudio = (): void => {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
};

// --- WAV encoding -----------------------------------------------------------

const WAV_HEADER_BYTES = 44;

const writeString = (view: DataView, offset: number, text: string): number => {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  return offset + text.length;
};

/** Encode 16-bit PCM mono samples as a WAV file (Uint8Array). */
export const encodeWav = (samples: Float32Array, sampleRate: number): Uint8Array => {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataSize);
  const view = new DataView(buffer);

  let offset = writeString(view, 0, "RIFF");
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  offset = writeString(view, offset, "WAVE");
  offset = writeString(view, offset, "fmt ");
  view.setUint32(offset, 16, true); // fmt chunk size
  offset += 4;
  view.setUint16(offset, 1, true); // PCM
  offset += 2;
  view.setUint16(offset, 1, true); // mono
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate * 2, true); // byte rate
  offset += 4;
  view.setUint16(offset, 2, true); // block align
  offset += 2;
  view.setUint16(offset, 16, true); // bits per sample
  offset += 2;
  offset = writeString(view, offset, "data");
  view.setUint32(offset, dataSize, true);
  offset += 4;

  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
};

/** Linear-interpolation resample to `targetRate`. */
export const resample = (
  input: Float32Array,
  fromRate: number,
  targetRate: number,
): Float32Array => {
  if (fromRate === targetRate) return input;
  const length = Math.max(1, Math.round(input.length * (targetRate / fromRate)));
  const out = new Float32Array(length);
  const spacing = fromRate / targetRate; // input-domain advance per output sample
  for (let i = 0; i < length; i++) {
    const pos = i * spacing;
    const i0 = Math.floor(pos);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const frac = pos - i0;
    out[i] = (input[i0] ?? 0) * (1 - frac) + (input[i1] ?? 0) * frac;
  }
  return out;
};

export const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

// --- mic capture ------------------------------------------------------------

export interface CaptureController {
  /** Finish recording and resolve with base64 WAV audio + sample rate. */
  stop: () => Promise<{ audioBase64: string; sampleRate: number }>;
  /** Abort without producing audio. */
  cancel: () => void;
}

interface StreamHandle {
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  chunks: Float32Array[];
  audioContext: AudioContext;
  recording: boolean;
}

const TARGET_RATE = 16_000;

export const startCapture = async (): Promise<CaptureController> => {
  const ctx = getAudioContext();
  if (!ctx || !navigator.mediaDevices?.getUserMedia) {
    throw new CaptureError(
      "unsupported",
      "This browser doesn't support microphone recording.",
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      throw new CaptureError("denied", "Microphone access was denied.");
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      throw new CaptureError("notfound", "No microphone was found.");
    }
    throw new CaptureError("aborted", "Couldn't start the microphone.");
  }

  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);

  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  const handle: StreamHandle = {
    stream,
    source,
    processor,
    chunks,
    audioContext: ctx,
    recording: true,
  };

  processor.onaudioprocess = (event) => {
    if (!handle.recording) return;
    const data = event.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(data));
  };

  source.connect(processor);
  processor.connect(ctx.destination);

  return {
    stop: async () => {
      handle.recording = false;
      source.disconnect();
      processor.disconnect();
      stream.getTracks().forEach((t) => t.stop());

      const total = chunks.reduce((sum, c) => sum + c.length, 0);
      const merged = new Float32Array(total);
      let at = 0;
      for (const chunk of chunks) {
        merged.set(chunk, at);
        at += chunk.length;
      }

      const effectiveRate = ctx.sampleRate || TARGET_RATE;
      const samples = resample(merged, effectiveRate, TARGET_RATE);
      const wav = encodeWav(samples, TARGET_RATE);
      return { audioBase64: bytesToBase64(wav), sampleRate: TARGET_RATE };
    },
    cancel: () => {
      handle.recording = false;
      source.disconnect();
      processor.disconnect();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
};

// --- playback ---------------------------------------------------------------

export interface AudioPlayback {
  stop: () => void;
  done: Promise<void>;
  playing: boolean;
}

const base64ToBlob = (base64: string, mime: string): Blob => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

/** Decode + play WAV audio from base64. Resolves once playback *starts*. */
export const playBase64Audio = (base64: string, mime = "audio/wav"): Promise<AudioPlayback> =>
  new Promise<AudioPlayback>((resolve, reject) => {
    const ctx = getAudioContext();
    if (!ctx) {
      reject(new CaptureError("unsupported", "Audio playback isn't supported here."));
      return;
    }
    const blob = base64ToBlob(base64, mime);
    const objectUrl = URL.createObjectURL(blob);

    void ctx
      .resume()
      .then(() => fetch(objectUrl))
      .then((res) => res.arrayBuffer())
      .then((buffer) => ctx.decodeAudioData(buffer))
      .then((decoded) => {
        URL.revokeObjectURL(objectUrl);
        if (!decoded || decoded.length === 0) throw new Error("Empty audio");
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = decoded;
        source.connect(gain);
        gain.connect(ctx.destination);

        let stopped = false;
        let ended = false;
        const cleanup = () => {
          try {
            source.disconnect();
          } catch {
            /* noop */
          }
          try {
            gain.disconnect();
          } catch {
            /* noop */
          }
        };

        const playback: AudioPlayback = {
          playing: true,
          stop: () => {
            if (stopped) return;
            stopped = true;
            try {
              source.stop();
            } catch {
              /* already stopped */
            }
          },
          done: new Promise<void>((doneResolve) => {
            source.onended = () => {
              if (!ended) {
                ended = true;
                stopped = true;
                playback.playing = false;
              }
              cleanup();
              doneResolve();
            };
          }),
        };

        source.start();
        resolve(playback);
      })
      .catch((e) => {
        URL.revokeObjectURL(objectUrl);
        reject(e instanceof Error ? e : new Error("Couldn't play audio."));
      });
  });
