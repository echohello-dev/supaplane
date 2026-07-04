import type { Logger } from "pino";
import {
  ClientCapabilitiesSchema,
  type ClientCapabilities,
  type ClientType,
  HelloAckMessageSchema,
  HelloMessageSchema,
  type HelloMessage,
  SUPAPLANE_PROTOCOL_VERSION,
} from "@echohello/protocol";

import { loadOrCreateDaemonKeyPair } from "./daemon-keypair.js";
import { getOrCreateServerId } from "./server-id.js";

export interface WebsocketSessionContext {
  serverId: string;
  serverVersion: string;
  daemonLabel?: string;
  logger: Logger;
}

export interface HandshakeResult {
  ok: boolean;
  hello?: HelloMessage;
  error?: string;
  reply?: Record<string, unknown>;
}

/**
 * Validate an incoming `hello` envelope and produce the matching `hello_ack`.
 * Enforces protocol version and (optionally) the bearer token.
 */
export function handleHello(args: {
  payload: unknown;
  ctx: WebsocketSessionContext;
  authToken?: string;
}): HandshakeResult {
  const parseResult = HelloMessageSchema.safeParse(args.payload);
  if (!parseResult.success) {
    return { ok: false, error: `Invalid hello: ${parseResult.error.message}` };
  }
  const hello = parseResult.data;
  if (args.authToken && hello.authToken !== args.authToken) {
    return { ok: false, error: "Unauthorized" };
  }
  const capabilities: ClientCapabilities = ClientCapabilitiesSchema.parse(hello.capabilities);
  void capabilities;
  const ack = HelloAckMessageSchema.parse({
    type: "hello_ack",
    serverId: args.ctx.serverId,
    serverVersion: args.ctx.serverVersion,
    protocolVersion: SUPAPLANE_PROTOCOL_VERSION,
    capabilities: {
      providers: ["opencode", "claude", "cursor"],
      relay: false,
      worktrees: false,
      scheduling: false,
      voice: false,
      settingsSync: false,
    },
    daemon: {
      ...(args.ctx.daemonLabel ? { label: args.ctx.daemonLabel } : {}),
      startedAt: Date.now(),
      platform: process.platform,
      arch: process.arch,
    },
  });
  return { ok: true, hello, reply: ack };
}

/**
 * Ensure the daemon's identity anchors (server-id + Curve25519 keypair) exist
 * on disk and return both, with the public key base64-encoded for the
 * pairing offer.
 */
export interface DaemonIdentity {
  serverId: string;
  publicKeyB64: string;
  publicKeyFingerprint: string;
}

export function loadOrCreateIdentity(supaplaneHome: string): DaemonIdentity {
  const serverId = getOrCreateServerId(supaplaneHome);
  const kp = loadOrCreateDaemonKeyPair(supaplaneHome);
  return {
    serverId,
    publicKeyB64: kp.publicKeyB64,
    publicKeyFingerprint: kp.fingerprint,
  };
}

export const SUPPORTED_CLIENT_TYPES: readonly ClientType[] = [
  "mobile",
  "web",
  "desktop",
  "cli",
  "mcp",
] as const;
