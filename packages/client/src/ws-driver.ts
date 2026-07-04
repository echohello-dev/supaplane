import {
  ClientCapabilitiesSchema,
  type ClientCapabilities,
  type ClientType,
  type Envelope,
  type HelloAckMessage,
  HelloMessageSchema,
  type ServerEvent,
} from "@echohello/protocol";

import type { SupaplaneClientListener, SupaplaneClientEventMap, Unsubscribe } from "./types.js";

/**
 * Low-level WebSocket driver for the Supaplane daemon protocol.
 *
 * Encodes the wire envelope as a single JSON text frame per message (binary
 * frames for terminal I/O are out of scope for this scaffold; add when
 * terminal/PTY integration lands).
 *
 * Handles: connect, `hello`/`hello_ack` handshake, incoming envelope routing,
 * app-level ping/pong, and exponential-backoff reconnect.
 *
 * Use `SupaplaneClient` for the high-level facade with typed RPC + subscribe APIs.
 */
export class WsDriver {
  #endpoint: string;
  #clientId: string;
  #clientType: ClientType;
  #capabilities: ClientCapabilities;
  #authToken: string | undefined;
  #ws: WebSocket | null = null;
  #listeners = new Map<keyof SupaplaneClientEventMap, Set<(payload: unknown) => void>>();
  #incomingListeners = new Set<(event: ServerEvent) => void>();
  #reconnectEnabled: boolean;
  #maxReconnectAttempts: number;
  #reconnectBackoffMs: number;
  #attempt = 0;
  #helloAck: HelloAckMessage | null = null;
  #disposed = false;
  #onEnvelope: ((envelope: Envelope) => void) | undefined;

  constructor(args: {
    endpoint: string;
    clientId: string;
    clientType: ClientType;
    capabilities: ClientCapabilities;
    authToken?: string;
    reconnect?: boolean;
    maxReconnectAttempts?: number;
    reconnectBackoffMs?: number;
    onEnvelope?: (envelope: Envelope) => void;
  }) {
    this.#endpoint = args.endpoint;
    this.#clientId = args.clientId;
    this.#clientType = args.clientType;
    this.#capabilities = args.capabilities;
    this.#authToken = args.authToken;
    this.#reconnectEnabled = args.reconnect ?? true;
    this.#maxReconnectAttempts = args.maxReconnectAttempts ?? 10;
    this.#reconnectBackoffMs = args.reconnectBackoffMs ?? 500;
    this.#onEnvelope = args.onEnvelope;
  }

  connect(): void {
    if (this.#disposed) return;
    const ws = new WebSocket(this.#endpoint);
    this.#ws = ws;
    ws.addEventListener("open", () => {
      this.#attempt = 0;
      const hello = HelloMessageSchema.parse({
        type: "hello",
        clientId: this.#clientId,
        clientType: this.#clientType,
        protocolVersion: 1,
        capabilities: ClientCapabilitiesSchema.parse(this.#capabilities),
        ...(this.#authToken ? { authToken: this.#authToken } : {}),
      });
      ws.send(JSON.stringify(hello));
    });
    ws.addEventListener("message", (evt) => {
      const data =
        typeof evt.data === "string" ? evt.data : new TextDecoder().decode(evt.data as ArrayBuffer);
      let envelope: Envelope;
      try {
        envelope = JSON.parse(data) as Envelope;
      } catch {
        this.#emit("error", new Error(`Failed to parse envelope: ${data.slice(0, 256)}`));
        return;
      }
      this.#onEnvelope?.(envelope);
      if ("type" in envelope && envelope.type === "hello_ack") {
        this.#helloAck = envelope;
        this.#emit("open", envelope);
        return;
      }
      if ("event" in envelope && envelope.event) {
        this.#routeServerEvent(envelope.event);
      }
    });
    ws.addEventListener("error", () => {
      this.#emit("error", new Error(`WebSocket error connecting to ${this.#endpoint}`));
    });
    ws.addEventListener("close", (evt) => {
      this.#emit("close", { code: evt.code, reason: evt.reason });
      this.#ws = null;
      if (this.#disposed || !this.#reconnectEnabled) return;
      if (this.#attempt >= this.#maxReconnectAttempts) {
        this.#emit("exhausted", undefined);
        return;
      }
      this.#attempt += 1;
      const delay = this.#reconnectBackoffMs * 2 ** (this.#attempt - 1);
      this.#emit("reconnecting", { attempt: this.#attempt, delayMs: delay });
      setTimeout(() => this.connect(), delay);
    });
  }

  /** Send a typed envelope over the WebSocket. Throws if not yet connected. */
  send(envelope: Envelope): void {
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) {
      throw new Error("Supaplane WS driver is not connected");
    }
    this.#ws.send(JSON.stringify(envelope));
  }

  /** The most recent `hello_ack` from the server (null until connected). */
  get helloAck(): HelloAckMessage | null {
    return this.#helloAck;
  }

  get isConnected(): boolean {
    return this.#ws?.readyState === WebSocket.OPEN;
  }

  on<E extends keyof SupaplaneClientEventMap>(
    event: E,
    listener: SupaplaneClientListener<E>,
  ): Unsubscribe {
    const set = this.#listeners.get(event) ?? new Set();
    set.add(listener as (payload: unknown) => void);
    this.#listeners.set(event, set);
    return () => set.delete(listener as (payload: unknown) => void);
  }

  /** Subscribe to incoming server events (post-`hello_ack`). */
  onServerEvent(listener: (event: ServerEvent) => void): Unsubscribe {
    this.#incomingListeners.add(listener);
    return () => this.#incomingListeners.delete(listener);
  }

  close(): void {
    this.#disposed = true;
    this.#reconnectEnabled = false;
    this.#ws?.close();
    this.#ws = null;
  }

  #routeServerEvent(event: ServerEvent): void {
    for (const listener of this.#incomingListeners) {
      try {
        listener(event);
      } catch (err) {
        this.#emit("error", err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  #emit<E extends keyof SupaplaneClientEventMap>(event: E, payload: SupaplaneClientEventMap[E]): void {
    const set = this.#listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch {
        /* swallow listener errors to keep the driver alive */
      }
    }
  }
}
