# Hypa Bridge

**Speak. Understand. Respond.** A calm, small web app where two people who speak
different languages hold a real voice or text conversation on one device.

This repository is the complete product: the web app here, an API server
(`apps/hypa-bridge-server`), a shared capability layer (`@hypa/bridge-core`), and
an MCP server for AI agents (`@hypa/bridge-mcp`). See the root [README](../../README.md)
for architecture, running, and hosting.

## What it does

- **Setup** — pick who speaks what from the full 22-language Hypa catalog, then start.
- **Conversation** — the composer is a two-sided input: switch between **You** and
  **They** (each side writes/speaks its own language). Every message is stored and
  shown with its original text *plus* the translation the other person reads.
- **Visible pipeline** — recording runs *listening → transcribing → translating → ready*;
  messages appear only when complete, never half-translated.
- **Per message** — listen (TTS in the reader's language, per-side voice), copy,
  *"What do they mean?"* (tone, idiom, cultural nuance in context), and
  word/phrase selection opens a dictionary popover for that region's language.
- **Help me respond** — suggested replies in your language, each listenable and
  editable before you send it.
- **Voice first** — record (WAV 16 kHz mono, iOS-safe), replay, cancel; a single
  playback engine means only one thing plays at a time.
- **Conversation summary**, **recent conversations** stored on-device, **voice
  pickers** per side, light/dark theme.
- No accounts, no cloud sync — conversations and settings live in the browser.

## Architecture

Four pieces, all TypeScript, no runtime dependency outside this repository:

| Piece | Port | Role |
| --- | --- | --- |
| `apps/hypa-bridge` | 5181 | Vite + React 19 web app (the UI above) |
| `apps/hypa-bridge-server` | 5182 | Express 5 BFF — thin JSON `/api` routes |
| `packages/@hypa-bridge-core` | — | Server-side capability layer (the **Bridge** facade over Hypa) |
| `packages/@hypa-bridge-mcp` | 5183 | MCP server exposing the same capabilities as tools |

```
browser ──same-origin /api──▶ hypa-bridge-server ──▶ @hypa/bridge-core ──▶ Hypa developer API
                                  │                          │
                                  │                 (the ONLY place the
                                  │                    HYPA_API_KEY lives)
                                  ▼
                          @hypa/bridge-mcp  ◀── MCP clients
```

### Security

The Hypa developer key is **server-side only**:

- It lives in `apps/hypa-bridge-server/.env.local` (and the MCP package's env).
- `@hypa/bridge-core` sets the `x-api-key` header; nothing else knows the key.
- The browser only ever talks to the same-origin BFF — the Vite dev server proxies
  `/api` to 5182, so the key never enters client code, `localStorage`, or the bundle.

## Running locally

Requirements: Node ≥ 22 and Yarn v1 at the repository root.

```sh
# 1. one-time: point the BFF at your Hypa developer key
cp apps/hypa-bridge-server/.env.example apps/hypa-bridge-server/.env.local
#    then edit HYPA_API_KEY / HYPA_API_URL (gitignored, never committed)

# 2. install workspace deps
yarn

# 3. start the BFF and the web app (two terminals)
yarn workspace hypa-bridge-server dev   # http://localhost:5182 (BFF)
yarn workspace hypa-bridge dev          # http://localhost:5181 (web, proxy → 5182)
```

Open http://localhost:5181. Choose your language pair and start talking.

### The BFF API (all JSON; errors are `{ "error": { "code", "message" } }`)

| Route | Body | Returns |
| --- | --- | --- |
| `GET /api/health` | — | `{ ok, version }` |
| `GET /api/models` | — | `{ languages: [{ label, code, voices[] }] }` (catalog, cached; falls back to the pinned 22) |
| `POST /api/translate` | `{ text, sourceLang?, targetLang }` | `{ translation }` |
| `POST /api/understand` | `{ text, textLang, meaningLang, context? }` | `{ meaning }` |
| `POST /api/suggest` | `{ text, textLang?, replyLang, context? }` | `{ suggestions: string[] }` |
| `POST /api/summarise` | `{ turns: [{ speaker, language, text }], targetLang }` | `{ summary }` |
| `POST /api/dictionary` | `{ word, language? }` | `{ result }` (word, definitions, usage, similar/opposite, cultural notes) |
| `POST /api/asr` | `{ audio, audioType? }` (base64 WAV 16 kHz mono, or `https` url) | `{ text, model? }` |
| `POST /api/tts` | `{ text, language, voice? }` | `{ audioBase64, sampleRate, voice, mime: "audio/wav" }` |

## The MCP server

See `packages/@hypa-bridge-mcp/.env.example`. Start it with:

```sh
yarn workspace @hypa/bridge-mcp dev          # Streamable HTTP on 5183
yarn workspace @hypa/bridge-mcp selfcheck    # live end-to-end self-check (needs HYPA_API_KEY)
```

Tools (one per Bridge capability, so agent behaviour matches the product):
`translate_message`, `understand_message`, `generate_response`,
`translate_and_speak`, `process_voice_message`, `look_up_term`,
`conversation_summary`. Endpoint: `POST http://localhost:5183/mcp`.

## Testing

```sh
yarn workspace @hypa/bridge-core test   # client + facade contract tests (mocked fetch, offline)
yarn workspace hypa-bridge-server test  # BFF route contract tests (stubbed Bridge)
yarn workspace @hypa/bridge-mcp test    # MCP transport/tool tests (stubbed Bridge, offline)
yarn workspace @hypa/bridge-mcp selfcheck  # same over live Hypa (needs the key)
```

## Design

Premium and calm. Colour is limited to three roles — `primary` (ink actions),
`secondary` (soft surfaces) and `tertiary` (a quiet teal reserved for the "other"
speaker, meaning, focus and selection) — derived from oklch tokens in
[`src/index.css`](src/index.css). Motion is subtle, `prefers-reduced-motion` is
honoured, focus is always visible, and screen-reader states cover the pipeline
and recording. Fonts: Geist Variable.
