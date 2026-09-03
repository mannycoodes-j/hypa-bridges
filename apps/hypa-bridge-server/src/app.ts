/**
 * Express application factory for the Bridge BFF.
 *
 * Kept separate from the listen entry point so tests can mount the app on an
 * ephemeral port. CORS is restricted to the configured web origins and the API
 * key never appears on this side — it lives in @hypa/bridge-core.
 */

import express, { type NextFunction, type Request, type Response } from "express";
import { Bridge, BridgeError, toBridgeError, BRIDGE_VERSION } from "@hypa/bridge-core";
import type { ServerConfig } from "./config";
import { buildRouter, isAllowedOrigin, requestOrigin } from "./routes/api";

export function createApp(bridge: Bridge, config: ServerConfig): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: config.maxBodyBytes }));

  // CORS — allow only the configured web origins.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = requestOrigin(req);
    if (origin && isAllowedOrigin(origin, config.corsOrigins)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Accept",
      );
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, version: BRIDGE_VERSION });
  });

  app.use("/api", buildRouter(bridge));

  // 404 for unknown /api routes.
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({
      error: { code: "BAD_REQUEST", message: "Unknown API route" },
    });
  });

  // JSON parse errors (oversized / malformed bodies).
  app.use(
    (
      err: unknown,
      _req: Request,
      res: Response,
      next: NextFunction,
    ) => {
      if (res.headersSent) {
        next(err);
        return;
      }
      const parsed = err as { type?: string; status?: number; message?: string };
      if (parsed.type === "entity.too.large") {
        res.status(413).json({
          error: { code: "BAD_REQUEST", message: "Request body too large" },
        });
        return;
      }
      if (parsed.type === "entity.parse.failed") {
        res.status(400).json({
          error: { code: "BAD_REQUEST", message: "Malformed JSON body" },
        });
        return;
      }
      next(err);
    },
  );

  // Final error handler — normalise BridgeErrors to `{ error }`.
  app.use(
    (err: unknown, _req: Request, res: Response, next: NextFunction) => {
      if (res.headersSent) {
        next(err);
        return;
      }
      const bridgeErr =
        err instanceof BridgeError ? err : toBridgeError(err);
      const status = bridgeErr.status >= 400 && bridgeErr.status <= 599 ? bridgeErr.status : 502;
      res.status(status).json({
        error: {
          code: bridgeErr.code,
          message: bridgeErr.message,
        },
      });
    },
  );

  return app;
}
