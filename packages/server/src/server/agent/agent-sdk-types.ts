import type { AgentEvent, ProviderModel, ProviderMode } from "@echohello/protocol";

/**
 * The seam between the daemon and agent runtimes (see docs/providers.md).
 * Each provider (claude, opencode, cursor-acp, ...) implements `AgentClient`;
 * the agent-manager owns session lifecycle on top of it.
 */

/**
 * Everything needed to resume an upstream session after a daemon restart.
 * Persisted per-session at `<supaplaneHome>/agents/<sanitized-cwd>/<session-id>.json`.
 */
export interface PersistenceHandle {
  /** Provider id, e.g. "claude". */
  provider: string;
  /** The upstream provider's own session id. */
  sessionId: string;
  /** cwd, model, modeId, thinkingOption, systemPrompt, ... */
  metadata?: Record<string, unknown> | undefined;
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/**
 * An `AgentEvent` without `sessionId`. Providers emit these; the agent-manager
 * stamps the Supaplane-side session id before broadcasting.
 */
export type SessionScopedEvent = DistributiveOmit<AgentEvent, "sessionId">;

export type AgentEventSink = (event: SessionScopedEvent) => void;

/** A live agent session. Implementations wrap one upstream conversation. */
export interface AgentSession {
  /** Send a user prompt into the session. Resolves once accepted, not when the turn ends. */
  send(prompt: string, attachments?: unknown[]): Promise<void>;
  /** Interrupt the in-flight turn, if any. */
  abort(): Promise<void>;
  /** Tear down the underlying provider process/resources. */
  dispose(): Promise<void>;
}

export interface AgentSessionHandle {
  session: AgentSession;
  handle: PersistenceHandle;
}

export interface CreateSessionArgs {
  cwd: string;
  modelId?: string;
  modeId?: string;
  signal?: AbortSignal;
}

export interface ResumeSessionArgs {
  handle: PersistenceHandle;
  cwd: string;
  overrides?: {
    modelId?: string | undefined;
    modeId?: string | undefined;
  };
}

export interface ImportableSession {
  sessionId: string;
  title?: string;
  cwd?: string;
  updatedAt: number;
}

export interface AgentClient {
  readonly providerId: string;
  createSession(args: CreateSessionArgs, emit: AgentEventSink): Promise<AgentSessionHandle>;
  resumeSession(args: ResumeSessionArgs, emit: AgentEventSink): Promise<AgentSessionHandle>;
  listModels(): Promise<ProviderModel[]>;
  listModes(): Promise<ProviderMode[]>;
  listImportableSessions(): Promise<ImportableSession[]>;
  getDiagnostic?(): Promise<{ diagnostic: string }>;
}
