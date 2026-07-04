import pino from "pino";

export interface CreateLoggerOptions {
  level?: string;
  pretty?: boolean;
  /** Path to the rotating log file. If omitted, only stdout is written. */
  filePath?: string;
}

/**
 * Build the daemon's root Pino logger. Always includes a `module` field on
 * child loggers via `logger.child({ module: "..." })` for grep-ability.
 */
export function createLogger(options: CreateLoggerOptions = {}): pino.Logger {
  const level = options.level ?? process.env.SUPAPLANE_LOG_LEVEL ?? "info";
  const useFile = Boolean(options.filePath);

  const targets: Array<pino.TransportTargetOptions> = [];
  if (options.pretty ?? process.stdout.isTTY ?? false) {
    targets.push({
      target: "pino-pretty",
      level,
      options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
    });
  } else {
    targets.push({ target: "pino/file", level, options: { destination: 1 } });
  }
  if (useFile && options.filePath) {
    targets.push({ target: "pino/file", level, options: { destination: options.filePath } });
  }

  return pino(
    {
      level,
      base: { pid: process.pid },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.transport({ targets }),
  );
}
