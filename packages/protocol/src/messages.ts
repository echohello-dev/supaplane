import { z } from "zod";

/** Current wire-protocol version. Bump on breaking changes. */
export const SUPAPLANE_PROTOCOL_VERSION = 1 as const;

/**
 * Client identity types (mobile, web, desktop, cli, mcp).
 * Drives capability negotiation in the `hello` handshake.
 */
export const ClientTypeSchema = z.enum(["mobile", "web", "desktop", "cli", "mcp"]);
export type ClientType = z.infer<typeof ClientTypeSchema>;

export const ClientCapabilitiesSchema = z.object({
  reconnect: z.boolean().default(true),
  binaryFrames: z.boolean().default(true),
  compressedStreams: z.boolean().default(false),
  voiceInput: z.boolean().default(false),
  pushNotifications: z.boolean().default(false),
  webauthn: z.boolean().default(false),
});
export type ClientCapabilities = z.infer<typeof ClientCapabilitiesSchema>;

export const ServerCapabilitiesSchema = z.object({
  providers: z.array(z.string()).default([]),
  relay: z.boolean().default(false),
  worktrees: z.boolean().default(false),
  scheduling: z.boolean().default(false),
  voice: z.boolean().default(false),
  settingsSync: z.boolean().default(false),
});
export type ServerCapabilities = z.infer<typeof ServerCapabilitiesSchema>;

/**
 * The `hello` handshake. First frame sent by the client after the WebSocket opens.
 * The server replies with a `hello_ack` carrying the server id and capabilities.
 */
export const HelloMessageSchema = z.object({
  type: z.literal("hello"),
  clientId: z.string().min(1),
  clientType: ClientTypeSchema,
  protocolVersion: z.literal(SUPAPLANE_PROTOCOL_VERSION),
  capabilities: ClientCapabilitiesSchema.default({}),
  authToken: z.string().optional(),
});
export type HelloMessage = z.infer<typeof HelloMessageSchema>;

export const HelloAckMessageSchema = z.object({
  type: z.literal("hello_ack"),
  serverId: z.string().min(1),
  serverVersion: z.string(),
  protocolVersion: z.literal(SUPAPLANE_PROTOCOL_VERSION),
  capabilities: ServerCapabilitiesSchema,
  daemon: z.object({
    label: z.string().optional(),
    startedAt: z.number().int(),
    platform: z.string(),
    arch: z.string(),
  }),
  pairing: z
    .object({
      serverPublicKeyFingerprint: z.string(),
      trusted: z.boolean(),
    })
    .optional(),
});
export type HelloAckMessage = z.infer<typeof HelloAckMessageSchema>;

/**
 * Server-pushed state for workspaces (the unit the agent operates on).
 */
export const WorkspaceKindSchema = z.enum(["local_checkout", "worktree", "directory"]);
export type WorkspaceKind = z.infer<typeof WorkspaceKindSchema>;

export const WorkspaceStateSchema = z.object({
  workspaceId: z.string().min(1),
  cwd: z.string(),
  repoRemote: z.string().nullable().optional(),
  repoName: z.string().optional(),
  branch: z.string().optional(),
  dirty: z.boolean().default(false),
  lastCommit: z.string().optional(),
  freshness: z.enum(["active", "stale", "blocked", "done"]).default("stale"),
  activeSessionId: z.string().nullable().optional(),
  summary: z.string().optional(),
  updatedAt: z.number().int(),
});
export type WorkspaceState = z.infer<typeof WorkspaceStateSchema>;

/**
 * A single agent session (a chat/agent run scoped to a workspace).
 */
export const SessionStatusSchema = z.enum([
  "idle",
  "running",
  "waiting",
  "paused",
  "error",
  "done",
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionStateSchema = z.object({
  sessionId: z.string().min(1),
  workspaceId: z.string().min(1),
  providerId: z.string(),
  modelId: z.string().optional(),
  modeId: z.string().optional(),
  status: SessionStatusSchema,
  startedAt: z.number().int(),
  updatedAt: z.number().int(),
  parentSessionId: z.string().nullable().optional(),
  forkCount: z.number().int().nonnegative().default(0),
  title: z.string().optional(),
  summary: z.string().optional(),
});
export type SessionState = z.infer<typeof SessionStateSchema>;

/**
 * Discriminated union of agent events streamed to subscribed clients.
 */
export const AgentEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message.delta"),
    sessionId: z.string(),
    partId: z.string(),
    text: z.string(),
    reasoning: z.boolean().optional(),
    ts: z.number().int(),
  }),
  z.object({
    type: z.literal("message.final"),
    sessionId: z.string(),
    partId: z.string(),
    text: z.string(),
    ts: z.number().int(),
  }),
  z.object({
    type: z.literal("tool.start"),
    sessionId: z.string(),
    toolCallId: z.string(),
    name: z.string(),
    input: z.unknown(),
    ts: z.number().int(),
  }),
  z.object({
    type: z.literal("tool.progress"),
    sessionId: z.string(),
    toolCallId: z.string(),
    progress: z.unknown(),
    ts: z.number().int(),
  }),
  z.object({
    type: z.literal("tool.result"),
    sessionId: z.string(),
    toolCallId: z.string(),
    output: z.unknown(),
    durationMs: z.number().int().nonnegative(),
    ts: z.number().int(),
  }),
  z.object({
    type: z.literal("status"),
    sessionId: z.string(),
    status: SessionStatusSchema,
    ts: z.number().int(),
  }),
  z.object({
    type: z.literal("error"),
    sessionId: z.string(),
    code: z.string(),
    message: z.string(),
    ts: z.number().int(),
  }),
  z.object({
    type: z.literal("permission_request"),
    sessionId: z.string(),
    requestId: z.string(),
    toolCallId: z.string().optional(),
    reason: z.string(),
    payload: z.unknown(),
    ts: z.number().int(),
  }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;

/**
 * Top-level protocol messages exchanged over the WebSocket.
 * Discriminated on `type`. Server-to-client events are prefixed with `kind: "event"`.
 */
export const ServerEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("event"), event: AgentEventSchema }),
  z.object({
    kind: z.literal("workspace_state"),
    workspace: WorkspaceStateSchema,
  }),
  z.object({
    kind: z.literal("session_state"),
    session: SessionStateSchema,
  }),
  z.object({ kind: z.literal("ping"), ts: z.number().int() }),
  z.object({ kind: z.literal("pong"), ts: z.number().int() }),
]);
export type ServerEvent = z.infer<typeof ServerEventSchema>;

export const ClientCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping"), ts: z.number().int() }),
  z.object({ type: z.literal("pong"), ts: z.number().int() }),
  z.object({
    type: z.literal("workspace.open"),
    cwd: z.string(),
    requestId: z.string().optional(),
  }),
  z.object({
    type: z.literal("workspace.refresh"),
    workspaceId: z.string(),
    requestId: z.string().optional(),
  }),
  z.object({
    type: z.literal("session.start"),
    workspaceId: z.string(),
    providerId: z.string(),
    modelId: z.string().optional(),
    modeId: z.string().optional(),
    initialPrompt: z.string().optional(),
    requestId: z.string().optional(),
  }),
  z.object({
    type: z.literal("session.resume"),
    handle: z.object({
      provider: z.string(),
      sessionId: z.string(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
    overrides: z
      .object({
        modelId: z.string().optional(),
        modeId: z.string().optional(),
      })
      .optional(),
    requestId: z.string().optional(),
  }),
  z.object({
    type: z.literal("session.fork"),
    sessionId: z.string(),
    requestId: z.string().optional(),
  }),
  z.object({
    type: z.literal("session.send"),
    sessionId: z.string(),
    prompt: z.string(),
    attachments: z.array(z.unknown()).default([]),
    requestId: z.string().optional(),
  }),
  z.object({
    type: z.literal("session.abort"),
    sessionId: z.string(),
    requestId: z.string().optional(),
  }),
  z.object({
    type: z.literal("diff.open"),
    sessionId: z.string().optional(),
    path: z.string().optional(),
    requestId: z.string().optional(),
  }),
  z.object({
    type: z.literal("file.open"),
    path: z.string(),
    requestId: z.string().optional(),
  }),
  z.object({
    type: z.literal("git.checkout"),
    workspaceId: z.string(),
    target: z.union([
      z.object({ kind: z.literal("branch"), name: z.string() }),
      z.object({ kind: z.literal("worktree"), name: z.string() }),
      z.object({ kind: z.literal("pr"), number: z.number().int() }),
    ]),
    requestId: z.string().optional(),
  }),
  z.object({
    type: z.literal("subscribe"),
    topics: z.array(z.string()),
  }),
  z.object({
    type: z.literal("unsubscribe"),
    topics: z.array(z.string()),
  }),
  z.object({
    type: z.literal("permission.resolve"),
    requestId: z.string(),
    decision: z.enum(["allow", "deny", "always_allow"]),
  }),
]);
export type ClientCommand = z.infer<typeof ClientCommandSchema>;

/**
 * Generic request/response envelope. Used for one-shot RPCs initiated by the client.
 */
export const RpcRequestSchema = z.object({
  rpc: z.string().min(1),
  requestId: z.string().min(1),
  args: z.unknown().optional(),
});
export type RpcRequest = z.infer<typeof RpcRequestSchema>;

export const RpcResponseSchema = z.object({
  rpc: z.string(),
  requestId: z.string(),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    })
    .optional(),
});
export type RpcResponse = z.infer<typeof RpcResponseSchema>;

/** Wire envelope that wraps either an RPC or a one-way command. */
export const EnvelopeSchema = z.union([
  RpcRequestSchema,
  RpcResponseSchema,
  z.object({ cmd: ClientCommandSchema }),
  z.object({ event: ServerEventSchema }),
  HelloMessageSchema,
  HelloAckMessageSchema,
]);
export type Envelope = z.infer<typeof EnvelopeSchema>;
