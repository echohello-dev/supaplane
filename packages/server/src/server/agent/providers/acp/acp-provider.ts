import { spawn, type ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";

import {
  ClientApp,
  ndJsonStream,
  type ActiveSession,
  type ClientConnection,
  type SessionUpdate,
  type ToolCall,
  type ToolCallUpdate,
} from "@agentclientprotocol/sdk";
import { ProviderError, type ProviderModel, type ProviderMode } from "@echohello/protocol";

import type {
  AgentClient,
  AgentEventSink,
  AgentSession,
  AgentSessionHandle,
  CreateSessionArgs,
  ImportableSession,
  ResumeSessionArgs,
  SessionScopedEvent,
} from "../../agent-sdk-types.js";

export interface AcpAgentClientOptions {
  /** Provider id (e.g. "cursor", or any user-defined id via `extends: "acp"`). */
  id: string;
  /** Binary + args that starts the agent in ACP mode, e.g. ["cursor-agent", "acp"]. */
  command: string[];
  /** Extra env overlaid on the daemon's environment for the agent process. */
  env?: Record<string, string>;
}

/**
 * Generic ACP provider: spawns the agent binary and speaks Agent Client
 * Protocol NDJSON over stdio. Cursor and user-defined `extends: "acp"`
 * providers are this class with different `command`s.
 *
 * Subclasses may override `toolSnapshotTransformer` to reshape provider-native
 * tool call payloads before they are emitted as `tool.start`/`tool.result`.
 */
export class AcpAgentClient implements AgentClient {
  readonly providerId: string;
  readonly #command: string[];
  readonly #env: Record<string, string> | undefined;

  constructor(options: AcpAgentClientOptions) {
    this.providerId = options.id;
    this.#command = options.command;
    this.#env = options.env;
  }

  createSession(args: CreateSessionArgs, emit: AgentEventSink): Promise<AgentSessionHandle> {
    return this.#spawn(args.cwd, emit, args);
  }

  resumeSession(args: ResumeSessionArgs, emit: AgentEventSink): Promise<AgentSessionHandle> {
    // ACP `session/load` support varies by agent; spawn fresh and let the
    // agent's own history surface via its UI for now.
    return this.#spawn(args.cwd, emit, {
      cwd: args.cwd,
      ...(args.overrides?.modelId !== undefined ? { modelId: args.overrides.modelId } : {}),
      ...(args.overrides?.modeId !== undefined ? { modeId: args.overrides.modeId } : {}),
    });
  }

  listModels(): Promise<ProviderModel[]> {
    // ACP has no model-listing method; models are runtime/session-scoped.
    return Promise.resolve([]);
  }

  listModes(): Promise<ProviderMode[]> {
    // Modes arrive on `session/new` (SessionModeState); surfaced post-connect.
    return Promise.resolve([]);
  }

  listImportableSessions(): Promise<ImportableSession[]> {
    return Promise.resolve([]);
  }

  /** Hook for subclasses: reshape ACP tool payloads before emission. */
  protected toolSnapshotTransformer(
    snapshot: ToolCall | ToolCallUpdate,
  ): ToolCall | ToolCallUpdate {
    return snapshot;
  }

  async #spawn(
    cwd: string,
    emit: AgentEventSink,
    args: CreateSessionArgs,
  ): Promise<AgentSessionHandle> {
    const [bin, ...binArgs] = this.#command;
    if (bin === undefined) {
      throw new ProviderError({ message: `${this.providerId} provider has no command configured` });
    }

    const child = spawn(bin, binArgs, {
      cwd,
      env: { ...process.env, ...this.#env },
      stdio: ["ignore", "pipe", "inherit"],
    });
    child.on("error", (err) => {
      emit({ type: "error", code: "provider_unavailable", message: err.message, ts: Date.now() });
    });
    if (child.stdout === null || child.stdin === null) {
      throw new ProviderError({ message: `${this.providerId} agent stdio unavailable` });
    }

    const app = new ClientApp();
    this.#registerPermissionHandler(app, emit);

    const stream = ndJsonStream(
      Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    );
    const connection = app.connect(stream);

    let active: ActiveSession;
    try {
      active = await connection.agent.buildSession(cwd).start();
    } catch (err) {
      child.kill();
      throw new ProviderError({
        code: "provider_unavailable",
        message: `${this.providerId} agent failed to start an ACP session`,
        cause: err,
      });
    }

    void this.#pumpUpdates(active, emit);

    return {
      session: new AcpAgentSession(connection, active, child, emit),
      handle: {
        provider: this.providerId,
        sessionId: active.sessionId,
        metadata: {
          cwd,
          ...(args.modelId !== undefined ? { modelId: args.modelId } : {}),
          ...(args.modeId !== undefined ? { modeId: args.modeId } : {}),
        },
      },
    };
  }

  #registerPermissionHandler(app: ClientApp, emit: AgentEventSink): void {
    // Auto-approve once (local-first, user-supervised daemon) and surface the
    // request as an event so renderers can show what was approved.
    app.onRequest("session/request_permission", async (ctx) => {
      const params = ctx.params;
      const allow =
        params.options.find((o) => o.kind === "allow_once") ??
        params.options.find((o) => o.kind === "allow_always") ??
        params.options[0];
      emit({
        type: "permission_request",
        requestId: String(ctx.requestId ?? Date.now()),
        reason: params.toolCall.title ?? "permission requested",
        payload: params,
        ts: Date.now(),
      });
      if (allow === undefined) {
        return { outcome: { outcome: "cancelled" } };
      }
      return { outcome: { outcome: "selected", optionId: allow.optionId } };
    });
  }

  async #pumpUpdates(active: ActiveSession, emit: AgentEventSink): Promise<void> {
    try {
      for (;;) {
        const message = await active.nextUpdate();
        if (message.kind === "stop") {
          emit({ type: "status", status: "idle", ts: Date.now() });
          continue;
        }
        for (const event of this.#mapUpdate(message.update)) {
          emit(event);
        }
      }
    } catch {
      // Connection closed or session disposed.
    }
  }

  #mapUpdate(update: SessionUpdate): SessionScopedEvent[] {
    const ts = Date.now();
    switch (update.sessionUpdate) {
      case "agent_message_chunk": {
        const text = contentText(update.content);
        if (text.length === 0) return [];
        return [{ type: "message.delta", partId: update.messageId ?? "msg", text, ts }];
      }
      case "agent_thought_chunk": {
        const text = contentText(update.content);
        if (text.length === 0) return [];
        return [
          {
            type: "message.delta",
            partId: update.messageId ?? "thought",
            text,
            reasoning: true,
            ts,
          },
        ];
      }
      case "tool_call": {
        const snapshot = this.toolSnapshotTransformer(update);
        return [
          {
            type: "tool.start",
            toolCallId: snapshot.toolCallId,
            name: toolName(snapshot),
            input: toolInput(snapshot),
            ts,
          },
        ];
      }
      case "tool_call_update": {
        const snapshot = this.toolSnapshotTransformer(update);
        if (snapshot.status !== "completed" && snapshot.status !== "failed") return [];
        return [
          {
            type: "tool.result",
            toolCallId: snapshot.toolCallId,
            output: toolOutput(snapshot),
            durationMs: 0,
            ts,
          },
        ];
      }
      default:
        return [];
    }
  }
}

class AcpAgentSession implements AgentSession {
  readonly #connection: ClientConnection;
  readonly #active: ActiveSession;
  readonly #child: ChildProcess;
  readonly #emit: AgentEventSink;

  constructor(
    connection: ClientConnection,
    active: ActiveSession,
    child: ChildProcess,
    emit: AgentEventSink,
  ) {
    this.#connection = connection;
    this.#active = active;
    this.#child = child;
    this.#emit = emit;
  }

  async send(prompt: string, attachments?: unknown[]): Promise<void> {
    void attachments;
    this.#emit({ type: "status", status: "running", ts: Date.now() });
    await this.#active.prompt(prompt).catch((err: unknown) => {
      this.#emit({
        type: "error",
        code: "provider_error",
        message: err instanceof Error ? err.message : String(err),
        ts: Date.now(),
      });
    });
  }

  async abort(): Promise<void> {
    await this.#connection.agent
      .notify("session/cancel", { sessionId: this.#active.sessionId })
      .catch(() => undefined);
  }

  dispose(): Promise<void> {
    this.#active.dispose();
    this.#connection.close();
    this.#child.kill();
    return Promise.resolve();
  }
}

function contentText(content: unknown): string {
  if (typeof content !== "object" || content === null) return "";
  const block = content as Record<string, unknown>;
  if (block.type === "text" && typeof block.text === "string") return block.text;
  return "";
}

function toolName(snapshot: ToolCall | ToolCallUpdate): string {
  return snapshot.title ?? "tool";
}

function toolInput(snapshot: ToolCall | ToolCallUpdate): unknown {
  return "rawInput" in snapshot ? snapshot.rawInput : undefined;
}

function toolOutput(snapshot: ToolCall | ToolCallUpdate): unknown {
  if ("rawOutput" in snapshot && snapshot.rawOutput !== undefined) return snapshot.rawOutput;
  return snapshot.content;
}
