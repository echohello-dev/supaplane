import express, { type Express } from "express";
import type { Logger } from "pino";
import { SUPAPLANE_PROTOCOL_VERSION } from "@echohello/protocol";

export interface CreateHttpAppOptions {
  logger: Logger;
  serverVersion: string;
  serverId: string;
  startedAt: number;
}

/**
 * Build the HTTP app: health, version, server info. The WebSocket upgrade
 * endpoint is wired separately by SupaplaneWebsocketServer on the same server.
 */
export function createHttpApp(options: CreateHttpAppOptions): Express {
  const app = express();
  const log = options.logger.child({ module: "http" });
  app.disable("x-powered-by");

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", serverId: options.serverId, ts: Date.now() });
  });

  app.get("/api/version", (_req, res) => {
    res.json({
      serverVersion: options.serverVersion,
      protocolVersion: SUPAPLANE_PROTOCOL_VERSION,
    });
  });

  app.get("/api/server-info", (_req, res) => {
    res.json({
      serverId: options.serverId,
      serverVersion: options.serverVersion,
      protocolVersion: SUPAPLANE_PROTOCOL_VERSION,
      startedAt: options.startedAt,
      uptimeSeconds: Math.floor((Date.now() - options.startedAt) / 1000),
      platform: process.platform,
      arch: process.arch,
    });
  });

  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      log.error({ err }, "unhandled http error");
      res.status(500).json({ error: { code: "internal", message: err.message } });
    },
  );

  return app;
}
