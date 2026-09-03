/**
 * Server environment / config.
 *
 * Loads env vars from the process environment and, as a convenience for local
 * development, from `.env` / `.env.local` in the server's working directory
 * (Node's built-in `process.loadEnvFile`, no dotenv dependency). Values are
 * read by name only — secrets are never logged.
 */

import { HOSTED_API_URL } from "@hypa/bridge-core";

export interface ServerConfig {
  host: string;
  port: number;
  /** Comma-separated allowed browser origins for CORS. */
  corsOrigins: string[];
  apiUrl: string;
  apiKey: string;
  /** Human-readable name for the TTS voice chosen per language (set by UI). */
  maxBodyBytes: number;
}

const boolish = (v: string | undefined, fallback: boolean): boolean =>
  v === undefined ? fallback : /^(1|true|yes|on)$/i.test(v);

const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Try to load .env.local then .env from cwd — ignore if absent. */
export function tryLoadEnvFiles(): void {
  try {
    const { loadEnvFile } = process as unknown as {
      loadEnvFile?: (path?: string) => void;
    };
    if (!loadEnvFile) return;
    try {
      loadEnvFile(".env.local");
    } catch {
      /* optional */
    }
    try {
      loadEnvFile(".env");
    } catch {
      /* optional */
    }
  } catch {
    /* optional */
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const apiKey = (env.HYPA_API_KEY ?? "").trim();
  const apiUrl = (env.HYPA_API_URL ?? "").trim() || HOSTED_API_URL;

  const origins = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    host: env.HOST ?? "0.0.0.0",
    port: num(env.PORT, 5182),
    corsOrigins: origins.length > 0 ? origins : ["http://localhost:5181", "http://127.0.0.1:5181"],
    apiUrl,
    apiKey,
    maxBodyBytes: num(env.MAX_BODY_BYTES, 12 * 1024 * 1024),
  };
}

export { boolish };
