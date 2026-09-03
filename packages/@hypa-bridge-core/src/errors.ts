/**
 * Bridge error model.
 *
 * Upstream (Hypa developer API) errors are normalised into BridgeError with a
 * stable `code` the UI / MCP can branch on, plus a human `message`.
 */

export type BridgeErrorCode =
  | "UNAUTHORIZED" // invalid / expired API key
  | "FORBIDDEN" // key valid but account/balance blocked
  | "INSUFFICIENT_BALANCE" // INSUFFICIENT_BALANCE upstream
  | "INVALID_LANGUAGE" // target_lang / language not supported
  | "INVALID_VOICE" // voice not in the model's per-language list
  | "INVALID_FORMAT" // audio format sniffed as non-audio / bad payload
  | "INVALID_MODEL" // model / provider not available
  | "MODEL_UNAVAILABLE" // upstream model temporarily down
  | "UPSTREAM" // any other upstream failure (4xx/5xx)
  | "TIMEOUT"
  | "NETWORK"
  | "BAD_REQUEST"; // our own validation failure

export interface BridgeErrorBody {
  code: BridgeErrorCode;
  message: string;
  status: number;
  /** raw upstream code, when known (e.g. INVALID_LANGUAGE). */
  upstream?: string;
}

export class BridgeError extends Error {
  readonly code: BridgeErrorCode;
  readonly status: number;
  readonly upstream?: string;

  constructor(body: BridgeErrorBody) {
    super(body.message);
    this.name = "BridgeError";
    this.code = body.code;
    this.status = body.status;
    this.upstream = body.upstream;
  }
}

const RAW_TO_CODE: Record<string, BridgeErrorCode> = {
  INVALID_EXPIRED_API_KEY: "UNAUTHORIZED",
  INVALID_API_KEY: "UNAUTHORIZED",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  INVALID_LANGUAGE: "INVALID_LANGUAGE",
  INVALID_VOICE: "INVALID_VOICE",
  INVALID_FORMAT: "INVALID_FORMAT",
  INVALID_PROVIDER: "INVALID_MODEL",
  INVALID_MODEL: "INVALID_MODEL",
  INVALID_MODEL_TYPE: "INVALID_MODEL",
  MODEL_UNAVAILABLE: "MODEL_UNAVAILABLE",
  INCOMPLETE_RESPONSE: "UPSTREAM",
  INVALID_REQUEST: "BAD_REQUEST",
  INVALID_REQUEST_ID: "BAD_REQUEST",
};

/** Map a raw upstream error code string to a stable Bridge code. */
export const mapUpstreamCode = (raw?: string): BridgeErrorCode =>
  (raw && RAW_TO_CODE[raw.toUpperCase()]) || "UPSTREAM";

/**
 * Extract an error body from an upstream HTTP error payload
 * (NestJS style `{ message, code, error, statusCode }` or raw text).
 */
export const parseUpstreamError = (
  bodyText: string,
  status: number,
): BridgeError => {
  let parsed: { message?: unknown; code?: unknown; error?: unknown } = {};
  try {
    const candidate = JSON.parse(bodyText) as {
      message?: unknown;
      code?: unknown;
      error?: unknown;
    };
    if (candidate && typeof candidate === "object") parsed = candidate;
  } catch {
    // not JSON — treat the raw text as the message
  }

  const code = mapUpstreamCode(
    typeof parsed.code === "string" ? parsed.code : undefined,
  );

  let message: string;
  if (Array.isArray(parsed.message)) message = parsed.message.join(", ");
  else if (typeof parsed.message === "string") message = parsed.message;
  else if (typeof parsed.error === "string") message = parsed.error;
  else if (bodyText.trim()) message = bodyText.trim().slice(0, 500);
  else message = `Hypa API request failed (HTTP ${status})`;

  // Surface the specific supported-language detail when the code is noisy.
  if (message.includes("Supported languages")) {
    return new BridgeError({
      code: "INVALID_LANGUAGE",
      message,
      status,
      upstream: typeof parsed.code === "string" ? parsed.code : undefined,
    });
  }

  return new BridgeError({
    code,
    message,
    status,
    upstream: typeof parsed.code === "string" ? parsed.code : undefined,
  });
};

/** Wrap an arbitrary thrown value into a BridgeError. */
export const toBridgeError = (e: unknown): BridgeError => {
  if (e instanceof BridgeError) return e;
  if (e instanceof Error) {
    if (e.name === "TimeoutError" || /timed? ?out/i.test(e.message)) {
      return new BridgeError({ code: "TIMEOUT", message: "The request timed out", status: 504 });
    }
    if (e.name === "AbortError") {
      return new BridgeError({ code: "TIMEOUT", message: "The request timed out", status: 504 });
    }
    return new BridgeError({ code: "UPSTREAM", message: e.message, status: 502 });
  }
  return new BridgeError({ code: "UPSTREAM", message: "Unknown error", status: 502 });
};
