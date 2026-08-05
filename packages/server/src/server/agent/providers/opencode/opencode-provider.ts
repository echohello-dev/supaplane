import { execFile } from "node:child_process";

import { createOpencode, type OpencodeClient } from "@opencode-ai/sdk";
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
import { OpenCodeToolCallMapper } from "./tool-call-mapper.js";

const OPENCODE_MODES: ProviderMode[] = [
  { id: "build", label: "Build", isUnattended: false, features: [] },
  { id: "plan", label: "Plan", isUnattended: false, features: ["read-only"] },
];

export interface OpenCodeAgentClientOptions {
  /** Override the provider id (used by config overlays that alias the provider). */
  id?: string;
  /** Binary used for diagnostics (the SDK spawns its own server). */
  command?: string[];
}

interface SessionSubscriber {
  emit: AgentEventSink;
  mapper: OpenCodeToolCallMapper;
  modelId?: string;
}

/**
 * OpenCode provider (`@opencode-ai/sdk`). Lazily spawns one shared
 * `opencode serve` per provider instance; sessions are created against it
 * per workspace cwd. Events stream over a single SSE subscription and are
 * routed to per-session sinks by session id.
 */
export class OpenCodeAgentClient implements AgentClient {
  readonly providerId: string;
  readonly #command: string[];

  #client: OpencodeClient | undefined;
  #closeServer: (() => void) | undefined;
  #eventPumpStarted = false;
  readonly #subscribers = new Map<string, SessionSubscriber>();

  constructor(options: OpenCodeAgentClientOptions = {}) {
    this.providerId = options.id ?? "opencode";
    this.#command = options.command ?? ["opencode"];
  }

  async createSession(args: CreateSessionArgs, emit: AgentEventSink): Promise<AgentSessionHandle> {
    const client = await this.#ensureClient();
    const created = await client.session.create({ query: { directory: args.cwd } });
    const sessionId = created.data?.id;
    if (sessionId === undefined) {
      throw new ProviderError({ message: "opencode did not return a session id" });
    }
    this.#subscribe(sessionId, emit, args.modelId);
    return {
      session: this.#makeSession(sessionId, emit),
      handle: {
        provider: this.providerId,
        sessionId,
        metadata: {
          cwd: args.cwd,
          ...(args.modelId !== undefined ? { modelId: args.modelId } : {}),
          ...(args.modeId !== undefined ? { modeId: args.modeId } : {}),
        },
      },
    };
  }

  async resumeSession(args: ResumeSessionArgs, emit: AgentEventSink): Promise<AgentSessionHandle> {
    const client = await this.#ensureClient();
    const existing = await client.session.get({
      path: { id: args.handle.sessionId },
      query: { directory: args.cwd },
    });
    if (existing.data === undefined) {
      throw new ProviderError({
        code: "not_found",
        message: `opencode session not found: ${args.handle.sessionId}`,
      });
    }
    this.#subscribe(
      args.handle.sessionId,
      emit,
      typeof args.handle.metadata?.modelId === "string" ? args.handle.metadata.modelId : undefined,
    );
    return {
      session: this.#makeSession(args.handle.sessionId, emit),
      handle: args.handle,
    };
  }

  async listModels(): Promise<ProviderModel[]> {
    try {
      const client = await this.#ensureClient();
      const response = await client.provider.list();
      const providers = response.data?.all ?? [];
      return providers.flatMap((p) =>
        Object.entries(p.models).map(([modelId, model]) => ({
          id: `${p.id}/${modelId}`,
          label: model.name ?? modelId,
          reasoning: model.reasoning,
          vision: model.modalities?.input.includes("image") === true,
        })),
      );
    } catch {
      return [];
    }
  }

  listModes(): Promise<ProviderMode[]> {
    return Promise.resolve(OPENCODE_MODES);
  }

  async listImportableSessions(): Promise<ImportableSession[]> {
    try {
      const client = await this.#ensureClient();
      const response = await client.session.list();
      return (response.data ?? []).map((s) => ({
        sessionId: s.id,
        ...(s.title !== undefined && s.title.length > 0 ? { title: s.title } : {}),
        ...(s.directory !== undefined ? { cwd: s.directory } : {}),
        updatedAt: s.time.updated,
      }));
    } catch {
      return [];
    }
  }

  async getDiagnostic(): Promise<{ diagnostic: string }> {
    const [bin, ...baseArgs] = this.#command;
    if (bin === undefined) {
      throw new ProviderError({ message: "opencode provider has no command configured" });
    }
    return new Promise((resolvePromise, rejectPromise) => {
      execFile(bin, [...baseArgs, "--version"], { timeout: 5000 }, (err, stdout, stderr) => {
        if (err) {
          rejectPromise(
            new ProviderError({
              code: "provider_unavailable",
              message: `opencode CLI unavailable: ${stderr || err.message}`,
              cause: err,
            }),
          );
          return;
        }
        resolvePromise({ diagnostic: `opencode ${stdout.trim()}` });
      });
    });
  }

  async dispose(): Promise<void> {
    this.#subscribers.clear();
    this.#closeServer?.();
    this.#client = undefined;
    this.#closeServer = undefined;
    this.#eventPumpStarted = false;
  }

  #subscribe(sessionId: string, emit: AgentEventSink, modelId?: string): void {
    this.#subscribers.set(sessionId, {
      emit,
      mapper: new OpenCodeToolCallMapper(),
      ...(modelId !== undefined ? { modelId } : {}),
    });
  }

  #makeSession(sessionId: string, emit: AgentEventSink): AgentSession {
    const requireClient = (): OpencodeClient => {
      if (this.#client === undefined) {
        throw new ProviderError({ message: "opencode server is not running" });
      }
      return this.#client;
    };
    return {
      send: async (prompt: string, attachments?: unknown[]): Promise<void> => {
        void attachments;
        const model = parseModelId(this.#subscribers.get(sessionId)?.modelId);
        await requireClient().session.promptAsync({
          path: { id: sessionId },
          body: {
            parts: [{ type: "text", text: prompt }],
            ...(model !== undefined ? { model } : {}),
          },
        });
      },
      abort: async (): Promise<void> => {
        await requireClient().session.abort({ path: { id: sessionId } });
        emit({ type: "status", status: "idle", ts: Date.now() });
      },
      dispose: (): Promise<void> => {
        this.#subscribers.delete(sessionId);
        return Promise.resolve();
      },
    };
  }

  async #ensureClient(): Promise<OpencodeClient> {
    if (this.#client !== undefined) return this.#client;
    try {
      const { client, server } = await createOpencode({ hostname: "127.0.0.1" });
      this.#client = client;
      this.#closeServer = () => server.close();
      this.#startEventPump(client);
      return client;
    } catch (err) {
      throw new ProviderError({
        code: "provider_unavailable",
        message: "failed to start opencode server",
        cause: err,
      });
    }
  }

  #startEventPump(client: OpencodeClient): void {
    if (this.#eventPumpStarted) return;
    this.#eventPumpStarted = true;
    void (async () => {
      try {
        const { stream } = await client.event.subscribe();
        for await (const event of stream) {
          const sessionId = eventSessionId(event);
          if (sessionId === undefined) continue;
          const subscriber = this.#subscribers.get(sessionId);
          if (subscriber === undefined) continue;
          for (const mapped of subscriber.mapper.map(event)) {
            subscriber.emit(mapped);
          }
        }
      } catch {
        // Server closed or stream dropped; sessions surface errors on next send.
      }
    })();
  }
}

function parseModelId(
  modelId: string | undefined,
): { providerID: string; modelID: string } | undefined {
  if (modelId === undefined) return undefined;
  const slash = modelId.indexOf("/");
  if (slash <= 0) return undefined;
  return { providerID: modelId.slice(0, slash), modelID: modelId.slice(slash + 1) };
}

function eventSessionId(event: {
  type: string;
  properties: Record<string, unknown>;
}): string | undefined {
  const props = event.properties;
  if (typeof props.sessionID === "string") return props.sessionID;
  const part = props.part;
  if (typeof part === "object" && part !== null) {
    const id = (part as Record<string, unknown>).sessionID;
    if (typeof id === "string") return id;
  }
  return undefined;
}
