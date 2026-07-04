#!/usr/bin/env node
import { startDaemon } from "./daemon.js";

const handle = await startDaemon();

const shutdown = async (signal: NodeJS.Signals) => {
  handle.logger.info({ signal }, "received signal, shutting down");
  await handle.stop();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export * from "./server/exports.js";
