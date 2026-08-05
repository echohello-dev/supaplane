import { randomBytes } from "node:crypto";

import type { Logger } from "pino";
import { AgentError, type AgentEvent, type SessionState } from "@echohello/protocol";

import type {
  AgentClient,
  AgentEventSink,
  AgentSession,
  PersistenceHandle,
  SessionScopedEvent,
} from "./agent-sdk-types.js";
import { HandleStore } from "./handle-store.js";

export interface AgentManagerOptions {
  handleStore: HandleStore;
  logger: Logger;
}

interface ManagedSession {
  state: SessionState;
  session: AgentSession;
  handle: PersistenceHandle;
}

export interface StartSessionArgs {
  workspaceId: string;
  cwd: string;
  providerId: string;
  modelId?: string;
  modeId?: string;
  initialPrompt?: string;
}

export interface ResumeSessionArgs {
  workspaceId: string;
  cwd: string;
  handle: PersistenceHandle;
  overrides?: {
    modelId?: string | undefined;
    modeId?: string | undefined;
  };
}

/**
 * Owns agent session lifecycle: provider registry, Supaplane-side session ids,
 * event stamping/forwarding, status bookkeeping, and handle persistence.
 *
 * Wire events out via `onAgentEvent` / `onSessionState` (set by the daemon
 * before any session can be created).
 */
export class AgentManager {
  readonly #providers = new Map<string, AgentClient>();
  readonly #sessions = new Map<string, ManagedSession>();
  readonly #handleStore: HandleStore;
  readonly #logger: Logger;

  onAgentEvent: ((event: AgentEvent) => void) | undefined;
  onSessionState: ((state: SessionState) => void) | undefined;

  constructor(options: AgentManagerOptions) {
    this.#handleStore = options.handleStore;
    this.#logger = options.logger.child({ module: "agent-manager" });
  }

  registerProvider(client: AgentClient): void {
    if (this.#providers.has(client.providerId)) {
      throw new AgentError({
        code: "conflict",
        message: `Provider already registered: ${client.providerId}`,
      });
    }
    this.#providers.set(client.providerId, client);
  }

  providerIds(): string[] {
    return [...this.#providers.keys()];
  }

  getProvider(providerId: string): AgentClient {
    const provider = this.#providers.get(providerId);
    if (!provider) {
      throw new AgentError({
        code: "provider_unavailable",
        message: `Unknown provider: ${providerId}`,
      });
    }
    return provider;
  }

  async startSession(args: StartSessionArgs): Promise<SessionState> {
    const provider = this.getProvider(args.providerId);
    const sessionId = newSessionId();
    const emit = this.#makeSink(sessionId);

    const { session, handle } = await provider.createSession(
      {
        cwd: args.cwd,
        ...(args.modelId !== undefined ? { modelId: args.modelId } : {}),
        ...(args.modeId !== undefined ? { modeId: args.modeId } : {}),
      },
      emit,
    );

    const now = Date.now();
    const state: SessionState = {
      sessionId,
      workspaceId: args.workspaceId,
      providerId: args.providerId,
      ...(args.modelId !== undefined ? { modelId: args.modelId } : {}),
      ...(args.modeId !== undefined ? { modeId: args.modeId } : {}),
      status: "idle",
      startedAt: now,
      updatedAt: now,
      forkCount: 0,
    };
    this.#sessions.set(sessionId, { state, session, handle });
    await this.#persistHandle(args.cwd, handle);
    this.#emitSessionState(state);

    if (args.initialPrompt !== undefined && args.initialPrompt.length > 0) {
      void this.send(sessionId, args.initialPrompt).catch((err: unknown) => {
        this.#logger.warn({ err, sessionId }, "initial prompt failed");
      });
    }
    return state;
  }

  async resumeSession(args: ResumeSessionArgs): Promise<SessionState> {
    const provider = this.getProvider(args.handle.provider);
    const sessionId = newSessionId();
    const emit = this.#makeSink(sessionId);

    const stored = await this.#handleStore
      .load(args.cwd, args.handle.provider, args.handle.sessionId)
      .catch(() => null);
    const metadata = { ...stored?.metadata, ...args.handle.metadata };

    const { session, handle } = await provider.resumeSession(
      {
        handle: {
          provider: args.handle.provider,
          sessionId: args.handle.sessionId,
          ...(metadata !== undefined && Object.keys(metadata).length > 0 ? { metadata } : {}),
        },
        cwd: args.cwd,
        ...(args.overrides !== undefined ? { overrides: args.overrides } : {}),
      },
      emit,
    );

    const now = Date.now();
    const state: SessionState = {
      sessionId,
      workspaceId: args.workspaceId,
      providerId: args.handle.provider,
      ...(args.overrides?.modelId !== undefined ? { modelId: args.overrides.modelId } : {}),
      ...(args.overrides?.modeId !== undefined ? { modeId: args.overrides.modeId } : {}),
      status: "idle",
      startedAt: now,
      updatedAt: now,
      forkCount: 0,
    };
    this.#sessions.set(sessionId, { state, session, handle });
    await this.#persistHandle(args.cwd, handle);
    this.#emitSessionState(state);
    return state;
  }

  async send(sessionId: string, prompt: string, attachments?: unknown[]): Promise<void> {
    const managed = this.#requireSession(sessionId);
    this.#setStatus(sessionId, "running");
    try {
      await managed.session.send(prompt, attachments);
    } catch (err) {
      this.#setStatus(sessionId, "error");
      throw err;
    }
  }

  async abort(sessionId: string): Promise<void> {
    const managed = this.#requireSession(sessionId);
    await managed.session.abort();
    this.#setStatus(sessionId, "idle");
  }

  async disposeSession(sessionId: string): Promise<void> {
    const managed = this.#sessions.get(sessionId);
    if (!managed) return;
    this.#sessions.delete(sessionId);
    await managed.session.dispose().catch((err: unknown) => {
      this.#logger.warn({ err, sessionId }, "session dispose failed");
    });
  }

  async disposeAll(): Promise<void> {
    const ids = [...this.#sessions.keys()];
    await Promise.all(ids.map((id) => this.disposeSession(id)));
  }

  getSession(sessionId: string): SessionState | undefined {
    return this.#sessions.get(sessionId)?.state;
  }

  listSessions(workspaceId?: string): SessionState[] {
    const all = [...this.#sessions.values()].map((s) => s.state);
    return workspaceId === undefined ? all : all.filter((s) => s.workspaceId === workspaceId);
  }

  #makeSink(sessionId: string): AgentEventSink {
    return (event: SessionScopedEvent) => {
      const stamped = { ...event, sessionId } as AgentEvent;
      if (stamped.type === "status") {
        this.#setStatus(sessionId, stamped.status);
      } else if (stamped.type === "error") {
        this.#setStatus(sessionId, "error");
      }
      this.onAgentEvent?.(stamped);
    };
  }

  #setStatus(sessionId: string, status: SessionState["status"]): void {
    const managed = this.#sessions.get(sessionId);
    if (!managed || managed.state.status === status) return;
    managed.state = { ...managed.state, status, updatedAt: Date.now() };
    this.#emitSessionState(managed.state);
  }

  #requireSession(sessionId: string): ManagedSession {
    const managed = this.#sessions.get(sessionId);
    if (!managed) {
      throw new AgentError({ code: "not_found", message: `Unknown session: ${sessionId}` });
    }
    return managed;
  }

  async #persistHandle(cwd: string, handle: PersistenceHandle): Promise<void> {
    try {
      await this.#handleStore.save(cwd, handle);
    } catch (err) {
      this.#logger.warn({ err, cwd }, "failed to persist session handle");
    }
  }

  #emitSessionState(state: SessionState): void {
    this.onSessionState?.(state);
  }
}

function newSessionId(): string {
  return `ses_${randomBytes(9).toString("base64url")}`;
}
