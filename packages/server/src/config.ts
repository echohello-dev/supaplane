import { z } from "zod";

/**
 * Daemon runtime configuration. Resolved from environment + CLI flags at
 * boot, then exposed to other subsystems as an immutable object.
 *
 * TODO: layer a `~/.supaplane/config.json` overlay on top of this, with hot-reload
 * for non-listen-port settings.
 */

export const DaemonConfigSchema = z.object({
  /** Bind host for the WebSocket + HTTP listener. Default `127.0.0.1` (no LAN). */
  listenHost: z.string().default("127.0.0.1"),
  /** Bind port. Default 17687 (avoids Paseo on 6767 and other well-known dev ports). */
  listenPort: z.number().int().positive().default(17687),
  /** Log level. */
  logLevel: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  /** Path to the daemon log file (rotated by `rotating-file-stream` if set). */
  logFile: z.string().optional(),
  /** Whether to print the pairing QR to stdout on start (auto on TTY). */
  pairingQr: z.boolean().optional(),
  /** Whether to enable the E2E-encrypted relay (post-MVP). */
  relayEnabled: z.boolean().default(false),
  /** Relay endpoint, e.g. `relay.supaplane.com:443`. */
  relayEndpoint: z.string().default("relay.supaplane.com:443"),
  /** Public relay endpoint encoded in the pairing offer (may differ from the daemon-side). */
  relayPublicEndpoint: z.string().optional(),
  /** Use TLS when dialling the relay. */
  relayUseTls: z.boolean().default(true),
  /** Public app URL used to encode `#offer=` fragments. */
  appBaseUrl: z.string().default("https://app.supaplane.com"),
  /** Optional bearer token for local daemon auth. */
  daemonAuthToken: z.string().optional(),
});

export type DaemonConfig = z.infer<typeof DaemonConfigSchema>;

export function loadDaemonConfig(env: NodeJS.ProcessEnv = process.env): DaemonConfig {
  const raw = {
    listenHost: env.SUPAPLANE_LISTEN_HOST,
    listenPort: env.SUPAPLANE_LISTEN_PORT
      ? Number.parseInt(env.SUPAPLANE_LISTEN_PORT, 10)
      : undefined,
    logLevel: env.SUPAPLANE_LOG_LEVEL,
    logFile: env.SUPAPLANE_LOG_FILE,
    pairingQr: env.SUPAPLANE_PAIRING_QR
      ? env.SUPAPLANE_PAIRING_QR === "true" || env.SUPAPLANE_PAIRING_QR === "1"
      : undefined,
    relayEnabled: env.SUPAPLANE_RELAY_ENABLED === "true" || env.SUPAPLANE_RELAY_ENABLED === "1",
    relayEndpoint: env.SUPAPLANE_RELAY_ENDPOINT,
    relayPublicEndpoint: env.SUPAPLANE_RELAY_PUBLIC_ENDPOINT,
    relayUseTls: env.SUPAPLANE_RELAY_USE_TLS
      ? env.SUPAPLANE_RELAY_USE_TLS === "true" || env.SUPAPLANE_RELAY_USE_TLS === "1"
      : undefined,
    appBaseUrl: env.SUPAPLANE_APP_BASE_URL,
    daemonAuthToken: env.SUPAPLANE_AUTH_TOKEN,
  };
  return DaemonConfigSchema.parse(raw);
}
