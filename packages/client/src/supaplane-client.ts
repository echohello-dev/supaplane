import {
  type AgentEvent,
  type ClientCommand,
  type Envelope,
  type HelloAckMessage,
  type RpcRequest,
  type RpcResponse,
  type ServerEvent,
  type WorkspaceState,
  type SessionState,
} from "@echohello/protocol";

import { WsDriver } from "./ws-driver.js";
import type {
  SupaplaneClientOptions,
  SupaplaneClientListener,
  SupaplaneClientEventMap,
  Unsubscribe,
} from "./types.js";

interface RpcPending {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
}

export type { SupaplaneClientOptions };

/**
 * High-level facade over the Supaplane daemon protocol.
 *
 * Wraps `WsDriver` and adds:
 *  - typed RPC with promise-based request/response correlation
 *  - ergonomic helpers for the common one-way commands (`session.send`, etc.)
 *  - typed event subscriptions (`onAgentEvent`, `onWorkspaceState`, ...)
 *
 * Lifecycle:
 *  - construct
 *  - `await connect()` resolves once `hello_ack` is received
 *  - subscribe / send commands
 *  - `close()` on teardown
 */
export class SupaplaneClient {
  #driver: WsDriver;
  #rpcPending = new Map<string, RpcPending>();
  #serverEventListeners = new Set<(event: ServerEvent) => void>();
  #connectedPromise: Promise<HelloAckMessage>;
  #resolveConnected!: (helloAck: HelloAckMessage) => void;
  #rejectConnected!: (err: unknown) => void;

  constructor(options: SupaplaneClientOptions) {
    this.#connectedPromise = new Promise<HelloAckMessage>((resolve, reject) => {
      this.#resolveConnected = resolve;
      this.#rejectConnected = reject;
    });
    const capabilities = {
      reconnect: true,
      binaryFrames: true,
      compressedStreams: false,
      voiceInput: false,
      pushNotifications: false,
      webauthn: false,
      ...options.capabilities,
    };
    this.#driver = new WsDriver({
      endpoint: options.endpoint,
      clientId: options.clientId,
      clientType: options.clientType,
      capabilities,
      ...(options.authToken ? { authToken: options.authToken } : {}),
      reconnect: options.reconnect ?? true,
      ...(options.maxReconnectAttempts !== undefined
        ? { maxReconnectAttempts: options.maxReconnectAttempts }
        : {}),
      ...(options.reconnectBackoffMs !== undefined
        ? { reconnectBackoffMs: options.reconnectBackoffMs }
        : {}),
      onEnvelope: (envelope) => this.#onEnvelope(envelope),
    });
  }

  connect(): Promise<HelloAckMessage> {
    this.#driver.connect();
    return this.#connectedPromise;
  }

  get helloAck(): HelloAckMessage | null {
    return this.#driver.helloAck;
  }

  get isConnected(): boolean {
    return this.#driver.isConnected;
  }

  close(): void {
    this.#rejectConnected(new Error("Client closed before hello_ack"));
    for (const pending of this.#rpcPending.values()) {
      pending.reject(new Error("Client closed"));
    }
    this.#rpcPending.clear();
    this.#driver.close();
  }

  on<E extends keyof SupaplaneClientEventMap>(
    event: E,
    listener: SupaplaneClientListener<E>,
  ): Unsubscribe {
    return this.#driver.on(event, listener);
  }

  onServerEvent(listener: (event: ServerEvent) => void): Unsubscribe {
    this.#serverEventListeners.add(listener);
    return () => this.#serverEventListeners.delete(listener);
  }

  onAgentEvent(listener: (event: AgentEvent) => void): Unsubscribe {
    return this.onServerEvent((serverEvent) => {
      if (serverEvent.kind === "event") listener(serverEvent.event);
    });
  }

  onWorkspaceState(listener: (workspace: WorkspaceState) => void): Unsubscribe {
    return this.onServerEvent((serverEvent) => {
      if (serverEvent.kind === "workspace_state") listener(serverEvent.workspace);
    });
  }

  onSessionState(listener: (session: SessionState) => void): Unsubscribe {
    return this.onServerEvent((serverEvent) => {
      if (serverEvent.kind === "session_state") listener(serverEvent.session);
    });
  }

  sendCommand(cmd: ClientCommand): void {
    this.#driver.send({ cmd });
  }

  /** Send a typed RPC and await the matching response (correlated by `requestId`). */
  async rpc<TArgs = unknown, TResult = unknown>(rpc: string, args?: TArgs): Promise<TResult> {
    const requestId = makeRequestId();
    const request: RpcRequest = { rpc, requestId, ...(args !== undefined ? { args } : {}) };
    const promise = new Promise<TResult>((resolve, reject) => {
      this.#rpcPending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
    });
    this.#driver.send(request);
    return promise;
  }

  #onEnvelope(envelope: Envelope): void {
    if ("type" in envelope) {
      if (envelope.type === "hello_ack") {
        this.#resolveConnected(envelope);
        return;
      }
    }
    if ("kind" in envelope && envelope.kind === "rpc_response") {
      const response = envelope as unknown as RpcResponse;
      const pending = this.#rpcPending.get(response.requestId);
      if (!pending) return;
      this.#rpcPending.delete(response.requestId);
      if (response.ok) {
        pending.resolve(response.result);
      } else {
        pending.reject(new Error(response.error?.message ?? `RPC ${response.rpc} failed`));
      }
      return;
    }
    if ("event" in envelope && envelope.event) {
      for (const listener of this.#serverEventListeners) {
        try {
          listener(envelope.event);
        } catch {
          /* swallow */
        }
      }
    }
  }
}

function makeRequestId(): string {
  return `req_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
