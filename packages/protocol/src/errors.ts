import { z } from "zod";

/**
 * Error codes shared across the daemon/client/protocol boundary.
 * Each layer (daemon, agent, provider) may define its own more specific codes
 * but should map them onto one of these where possible.
 */

export const ErrorCodeSchema = z.enum([
  /** Catch-all for unspecified failures. Prefer a more specific code. */
  "unknown",
  /** Caller sent a malformed or invalid request (4xx-style). */
  "bad_request",
  /** Caller failed authentication or authorization. */
  "unauthorized",
  /** Requested resource does not exist or is not visible to the caller. */
  "not_found",
  /** Caller is not allowed to perform the action. */
  "forbidden",
  /** Resource conflict (e.g. creating an agent with a duplicate id). */
  "conflict",
  /** The provider or required dependency is unavailable on this machine. */
  "provider_unavailable",
  /** The provider binary was found but failed its self-test. */
  "provider_unhealthy",
  /** The provider returned an error during a turn. */
  "provider_error",
  /** Operation timed out. */
  "timeout",
  /** Operation was cancelled (by the user or by the daemon). */
  "cancelled",
  /** Internal daemon error — likely a bug. */
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const SupaplaneErrorPayloadSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
  stack: z.string().optional(),
});
export type SupaplaneErrorPayload = z.infer<typeof SupaplaneErrorPayloadSchema>;

export interface SupaplaneErrorOptions {
  code: ErrorCode;
  message: string;
  details?: unknown;
  cause?: unknown;
}

export class SupaplaneError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;
  constructor(args: SupaplaneErrorOptions) {
    super(args.message, args.cause === undefined ? undefined : { cause: args.cause });
    this.name = "SupaplaneError";
    this.code = args.code;
    this.details = args.details;
  }

  toPayload(): SupaplaneErrorPayload {
    return SupaplaneErrorPayloadSchema.parse({
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack,
    });
  }
}

const LAYER_DEFAULT_CODE: Record<string, ErrorCode> = {
  DaemonError: "internal",
  AgentError: "internal",
  ProviderError: "provider_error",
};

interface LayerErrorOptions {
  message: string;
  code?: ErrorCode;
  details?: unknown;
  cause?: unknown;
}

function makeLayerError(layer: "DaemonError" | "AgentError" | "ProviderError") {
  return class extends SupaplaneError {
    constructor(args: LayerErrorOptions) {
      const code = args.code ?? LAYER_DEFAULT_CODE[layer] ?? "unknown";
      super({ ...args, code });
      this.name = layer;
    }
  };
}

export class DaemonError extends SupaplaneError {
  constructor(args: LayerErrorOptions) {
    super({ ...args, code: args.code ?? "internal" });
    this.name = "DaemonError";
  }
}

export class AgentError extends SupaplaneError {
  constructor(args: LayerErrorOptions) {
    super({ ...args, code: args.code ?? "internal" });
    this.name = "AgentError";
  }
}

export class ProviderError extends SupaplaneError {
  constructor(args: LayerErrorOptions) {
    super({ ...args, code: args.code ?? "provider_error" });
    this.name = "ProviderError";
  }
}

// `makeLayerError` is kept available for future layers that need the pattern
// in a less repetitive way.
void makeLayerError;
