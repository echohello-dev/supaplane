import { execFile } from "node:child_process";

import {
  listSessions,
  query,
  type Options,
  type PermissionMode,
  type Query,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { ProviderError, type ProviderModel, type ProviderMode } from "@echohello/protocol";

import type {
  AgentClient,
  AgentEventSink,
  AgentSession,
  AgentSessionHandle,
  CreateSessionArgs,
  ImportableSession,
  ResumeSessionArgs,
} from "../../agent-sdk-types.js";
import { ClaudeToolCallMapper } from "./tool-call-mapper.js";

const CLAUDE_MODELS: ProviderModel[] = [
  { id: "sonnet", label: "Claude Sonnet", reasoning: true, vision: true },
  { id: "opus", label: "Claude Opus", reasoning: true, vision: true },
  { id: "haiku", label: "Claude Haiku", reasoning: false, vision: true },
];

const CLAUDE_MODES: ProviderMode[] = [
  { id: "default", label: "Default", isUnattended: false, features: [] },
  { id: "plan", label: "Plan", isUnattended: false, features: ["read-only"] },
  { id: "accept-edits", label: "Accept edits", isUnattended: false, features: ["auto-edit"] },
  {
    id: "bypass",
    label: "Bypass permissions",
    description: "Auto-accept all tool calls. Unattended runs only.",
    isUnattended: true,
    features: ["unattended"],
  },
];

const MODE_TO_PERMISSION: Record<string, PermissionMode> = {
  default: "default",
  plan: "plan",
  "accept-edits": "acceptEdits",
  bypass: "bypassPermissions",
};

export interface ClaudeAgentClientOptions {
  /** Override the provider id (used by config overlays that alias the provider). */
  id?: string;
  /** Provider binary + args, e.g. `["claude"]`. */
  command?: string[];
}

/**
 * Claude Code provider (`@anthropic-ai/claude-agent-sdk`). Spawns one
 * streaming-input `query()` per session; user prompts are pushed through an
 * async queue after the `system/init` message yields the upstream session id.
 */
export class ClaudeAgentClient implements AgentClient {
  readonly providerId: string;
  readonly #command: string[];

  constructor(options: ClaudeAgentClientOptions = {}) {
    this.providerId = options.id ?? "claude";
    this.#command = options.command ?? ["claude"];
  }

  createSession(args: CreateSessionArgs, emit: AgentEventSink): Promise<AgentSessionHandle> {
    return this.#spawn(args, emit);
  }

  resumeSession(args: ResumeSessionArgs, emit: AgentEventSink): Promise<AgentSessionHandle> {
    const modelId =
      args.overrides?.modelId ??
      (typeof args.handle.metadata?.modelId === "string"
        ? args.handle.metadata.modelId
        : undefined);
    const modeId =
      args.overrides?.modeId ??
      (typeof args.handle.metadata?.modeId === "string" ? args.handle.metadata.modeId : undefined);
    return this.#spawn(
      {
        cwd: args.cwd,
        ...(modelId !== undefined ? { modelId } : {}),
        ...(modeId !== undefined ? { modeId } : {}),
      },
      emit,
      args.handle.sessionId,
    );
  }

  listModels(): Promise<ProviderModel[]> {
    return Promise.resolve(CLAUDE_MODELS);
  }

  listModes(): Promise<ProviderMode[]> {
    return Promise.resolve(CLAUDE_MODES);
  }

  async listImportableSessions(): Promise<ImportableSession[]> {
    try {
      const sessions = await listSessions();
      return sessions.map((s) => {
        const title = s.customTitle ?? s.summary;
        return {
          sessionId: s.sessionId,
          ...(title.length > 0 ? { title } : {}),
          ...(s.cwd !== undefined ? { cwd: s.cwd } : {}),
          updatedAt: s.lastModified,
        };
      });
    } catch {
      return [];
    }
  }

  async getDiagnostic(): Promise<{ diagnostic: string }> {
    const [bin, ...baseArgs] = this.#command;
    if (bin === undefined) {
      throw new ProviderError({ message: "claude provider has no command configured" });
    }
    return new Promise((resolvePromise, rejectPromise) => {
      execFile(bin, [...baseArgs, "--version"], { timeout: 5000 }, (err, stdout, stderr) => {
        if (err) {
          rejectPromise(
            new ProviderError({
              code: "provider_unavailable",
              message: `claude CLI unavailable: ${stderr || err.message}`,
              cause: err,
            }),
          );
          return;
        }
        resolvePromise({ diagnostic: `claude ${stdout.trim()}` });
      });
    });
  }

  async #spawn(
    args: CreateSessionArgs,
    emit: AgentEventSink,
    resumeSessionId?: string,
  ): Promise<AgentSessionHandle> {
    const queue = new MessageQueue();
    const abortController = new AbortController();
    const options: Options = {
      cwd: args.cwd,
      abortController,
      permissionMode: resolvePermissionMode(args.modeId),
      ...(args.modelId !== undefined ? { model: args.modelId } : {}),
      ...(resumeSessionId !== undefined ? { resume: resumeSessionId } : {}),
    };

    let upstreamSessionId: string | undefined;
    let upstreamModel: string | undefined;
    const mapper = new ClaudeToolCallMapper();

    let resolveInit!: () => void;
    let rejectInit!: (err: unknown) => void;
    const initSeen = new Promise<void>((resolvePromise, rejectPromise) => {
      resolveInit = resolvePromise;
      rejectInit = rejectPromise;
    });

    let q: Query;
    try {
      q = query({ prompt: queue.iterate(), options });
    } catch (err) {
      throw new ProviderError({ message: "failed to start claude session", cause: err });
    }

    const consume = async (): Promise<void> => {
      try {
        for await (const message of q) {
          if (message.type === "system" && message.subtype === "init") {
            upstreamSessionId = message.session_id;
            upstreamModel = message.model;
            resolveInit();
          }
          for (const event of mapper.map(message)) {
            emit(event);
          }
        }
      } catch (err) {
        const error =
          err instanceof Error ? err : new ProviderError({ message: String(err), cause: err });
        if (abortController.signal.aborted) return;
        rejectInit(error);
        emit({
          type: "error",
          code: "provider_error",
          message: error.message,
          ts: Date.now(),
        });
      }
    };
    void consume();

    const timeout = setTimeout(() => {
      rejectInit(new ProviderError({ code: "timeout", message: "claude init timed out" }));
    }, 30_000);
    try {
      await initSeen;
    } catch (err) {
      queue.close();
      q.close();
      throw err instanceof Error ? new ProviderError({ message: err.message, cause: err }) : err;
    } finally {
      clearTimeout(timeout);
    }

    if (upstreamSessionId === undefined) {
      throw new ProviderError({ message: "claude init did not yield a session id" });
    }
    const sessionId = upstreamSessionId;
    const session = new ClaudeAgentSession(q, queue, abortController, () => sessionId);

    return {
      session,
      handle: {
        provider: this.providerId,
        sessionId,
        metadata: {
          cwd: args.cwd,
          ...(upstreamModel !== undefined ? { modelId: upstreamModel } : {}),
          ...(args.modeId !== undefined ? { modeId: args.modeId } : {}),
        },
      },
    };
  }
}

class ClaudeAgentSession implements AgentSession {
  readonly #query: Query;
  readonly #queue: MessageQueue;
  readonly #abortController: AbortController;
  readonly #sessionId: () => string;

  constructor(
    query_: Query,
    queue: MessageQueue,
    abortController: AbortController,
    sessionId: () => string,
  ) {
    this.#query = query_;
    this.#queue = queue;
    this.#abortController = abortController;
    this.#sessionId = sessionId;
  }

  send(prompt: string, attachments?: unknown[]): Promise<void> {
    void attachments;
    const message: SDKUserMessage = {
      type: "user",
      session_id: this.#sessionId(),
      parent_tool_use_id: null,
      message: { role: "user", content: prompt },
    };
    this.#queue.push(message);
    return Promise.resolve();
  }

  async abort(): Promise<void> {
    try {
      await this.#query.interrupt();
    } catch {
      this.#abortController.abort();
    }
  }

  dispose(): Promise<void> {
    this.#queue.close();
    this.#query.close();
    this.#abortController.abort();
    return Promise.resolve();
  }
}

function resolvePermissionMode(modeId: string | undefined): PermissionMode {
  if (modeId === undefined) return "default";
  return MODE_TO_PERMISSION[modeId] ?? "default";
}

class MessageQueue {
  readonly #pending: SDKUserMessage[] = [];
  #waiter: (() => void) | null = null;
  #closed = false;

  push(message: SDKUserMessage): void {
    if (this.#closed) return;
    this.#pending.push(message);
    this.#wake();
  }

  close(): void {
    this.#closed = true;
    this.#wake();
  }

  async *iterate(): AsyncIterable<SDKUserMessage> {
    for (;;) {
      const next = this.#pending.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      if (this.#closed) return;
      await new Promise<void>((resolvePromise) => {
        this.#waiter = resolvePromise;
      });
      this.#waiter = null;
    }
  }

  #wake(): void {
    const waiter = this.#waiter;
    this.#waiter = null;
    waiter?.();
  }
}
