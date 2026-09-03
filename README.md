# Hypa Bridge

**Speak. Understand. Respond.** A calm web app where two people who speak
different languages hold a real voice/text conversation on one device — with an
**MCP server** so an AI agent (ChatGPT connector, Claude, …) can use the same
product capabilities.

Everything needed to build, run, and host it lives in this repository.

## Layout

| Path | What it is | Local port |
| --- | --- | --- |
| `apps/hypa-bridge` | Vite + React 19 web app (the UI) | 5181 |
| `apps/hypa-bridge-server` | Express 5 server — `/api` BFF **and** the prod host | 5182 |
| `packages/@hypa-bridge-core` | Server-side capability layer (the **Bridge** facade over Hypa) | — |
| `packages/@hypa-bridge-mcp` | MCP server — same capabilities as tools for AI agents | 5183 |

In development the pieces run separately. In production a single process serves
**everything from one URL**:

```
https://your-app.onrender.com/
├── /          the built web app (SPA)
├── /api/*     the BFF routes (translate, understand, asr, tts, …)
└── /mcp       the MCP endpoint (Streamable HTTP) → point ChatGPT/Claude here
        │
        ▼
   @hypa/bridge-core  ── the only place the HYPA_API_KEY lives ──▶ Hypa developer API
```

The web app talks only to the same origin (`/api`) — the Hypa key never enters
the browser, the bundle, or `localStorage`. The MCP server holds the key
server-side and only ever returns answers.

## Requirements

- Node ≥ 22, Yarn v1 (for local dev). No lockfiles are committed.

## Local development

```sh
yarn                              # install workspace deps

# one-time: point the server at your Hypa developer key
cp apps/hypa-bridge-server/.env.example apps/hypa-bridge-server/.env.local
# edit HYPA_API_KEY (gitignored, never committed)

# three terminals, or just #2 and #3 for the web app
yarn dev:mcp                       # MCP   → http://localhost:5183/mcp
yarn dev                           # BFF   → http://localhost:5182
yarn dev:web                       # web   → http://localhost:5181 (proxy → 5182)
```

Open http://localhost:5181.

## Environment variables

| Var | Used by | Default | Notes |
| --- | --- | --- | --- |
| `HYPA_API_KEY` | server, MCP | — | **Required.** Hypa developer key (server-side only). |
| `HYPA_API_URL` | server, MCP | `https://api.hypaintelligence.com` | Hypa developer-API origin. |
| `PORT` | server / MCP | `5182` / `5183` | Your host injects this in production. |
| `HOST` | server | `0.0.0.0` | Listen host. |
| `CORS_ORIGINS` | server | `http://localhost:5181,…` | Allowed browser origins. Same-origin prod needs none. |
| `MAX_BODY_BYTES` | server | `12582912` | JSON body limit (raise for large audio). |
| `STATIC_DIR` | server | `apps/hypa-bridge/dist` | Where the web build lives (prod host). |

## Hosting it (get a live URL)

### Option A — Render (recommended, one service)

1. Push this repo to GitHub.
2. In Render: **New → Blueprint** → pick the repo. `render.yaml` is included, so
   Render proposes the `hypa-bridge` web service automatically.
3. Add the **`HYPA_API_KEY`** secret (and `HYPA_API_URL` if not the hosted API)
   in the service's *Environment* tab. `HOST=0.0.0.0` and the build/start commands
   are already set by `render.yaml`.
4. Deploy. Render runs `yarn workspace hypa-bridge build`, then
   `yarn workspace hypa-bridge-server serve`. You get
   `https://hypa-bridge.onrender.com`.

That one URL serves the app (`/`), the API (`/api/*`), **and** the MCP endpoint
(`/mcp`). No lockfile is needed — the deploy runs `yarn`, and the generated
lockfile is ephemeral (and gitignored).

> Free Render services spin down after ~15 min idle and cold-start in ~30 s —
> fine for a demo. Upgrade the plan or set it to `paid` in `render.yaml` to keep
> it warm.

### Option B — Railway

1. Push the repo to GitHub; in Railway create a new project → **Deploy from repo**
   (root directory `.`, Nixpacks). `railway.toml` is included with the start
   command.
2. Add `HYPA_API_KEY` (+ optional `HYPA_API_URL`) in *Variables*.
3. Railway builds the web app and runs the same single service. Your URL serves
   `/`, `/api`, and `/mcp`.

> If Railway does not auto-run the web build, add the build step in the service
> settings, or deploy via a Dockerfile (see below).

### Option C — anything that runs Node (Fly, a VPS)

Point any Node runner at the root with:

```sh
yarn && yarn workspace hypa-bridge build && yarn workspace hypa-bridge-server serve
```

set `HOST=0.0.0.0`, let it inject `PORT`, add `HYPA_API_KEY`, and put it behind
HTTPS (required for ChatGPT).

## Hooking ChatGPT / Claude up to `/mcp`

The MCP endpoint is **server-to-server**, so it must be a public HTTPS URL —
ChatGPT cannot reach your laptop.

1. Deploy per above, confirm `POST https://your-app.com/mcp` is live
   (`GET /api/health` should return `{"ok":true}`).
2. In ChatGPT (paid plan) register the MCP server at
   `https://your-app.com/mcp` and authenticate it with a **scoped token** you add
   in front of `/mcp` (the built-in MCP endpoint has no auth of its own — put a
   gateway/token in front before exposing it broadly). Claude and any other MCP
   client use the same URL.
3. Tools exposed: `translate_message`, `understand_message`, `generate_response`,
   `translate_and_speak`, `process_voice_message`, `look_up_term`,
   `conversation_summary`. OpenAI/Anthropic menus for adding MCP change — check
   their current docs when you connect.

## Testing & checks

```sh
yarn test          # core (27) + BFF (9) + MCP (5), all offline
yarn selfcheck     # MCP over live Hypa (needs HYPA_API_KEY)
yarn typecheck
yarn build         # production web build → apps/hypa-bridge/dist
```

Product details (feature tour, BFF API table, design) are in
[`apps/hypa-bridge/README.md`](apps/hypa-bridge/README.md).

## Security

- The Hypa developer key is **server-side only** — never in the browser bundle,
  client JS, or `localStorage`. `@hypa/bridge-core` is the only module that sets
  the `x-api-key` header.
- The MCP endpoint is open by default (it still requires a valid Hypa key behind
  the scenes). Before exposing it publicly beyond a trusted client, add a bearer
  token / gateway in front.
