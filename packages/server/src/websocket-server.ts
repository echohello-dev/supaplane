import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import type { Logger } from "pino";
import {
  type ClientCommand,
  ClientCommandSchema,
  type ClientType,
  EnvelopeSchema,
  type HelloAckMessage,
  type ServerEvent,
} from "@echohello/protocol";

import { handleHello, type DaemonIdentity } from "./handshake.js";

interface SessionRecord {
  clientId: string;
  clientType: ClientType;
  socket: WebSocket;
  connectedAt: number;
  subscribedTopics: Set<string>;
}

export interface WebsocketServerOptions {
  httpServer: HttpServer;
  logger: Logger;
  identity: DaemonIdentity;
  authToken?: string;
  daemonLabel?: string;
  serverVersion: string;
  onCommand?: (cmd: ClientCommand, session: SessionRecord) => void;
}

/**
 * Attach a WebSocket server to an existing HTTP server, perform the
 * `hello`/`hello_ack` handshake, and route incoming envelopes to
 * subscribers / command handlers.
 *
 * The server is append-only (backward-compatible envelope additions) and
 * forwards the server's `ServerEvent` stream back to the client over the
 * same socket.
 */
export class SupaplaneWebsocketServer {
  #wss: WebSocketServer;
  #sessions = new Map<WebSocket, SessionRecord>();
  #logger: Logger;
  #identity: DaemonIdentity;
  #authToken: string | undefined;
  #serverVersion: string;
  #daemonLabel: string | undefined;
  #onCommand?: (cmd: ClientCommand, session: SessionRecord) => void;

  constructor(options: WebsocketServerOptions) {
    this.#logger = options.logger.child({ module: "ws-server" });
    this.#identity = options.identity;
    this.#authToken = options.authToken;
    this.#serverVersion = options.serverVersion;
    this.#daemonLabel = options.daemonLabel;
    if (options.onCommand) {
      this.#onCommand = options.onCommand;
    }
    this.#wss = new WebSocketServer({ noServer: true });
    this.#wss.on("connection", (socket, request) => this.#onConnection(socket, request));
    options.httpServer.on("upgrade", (request, socket, head) => {
      const url = request.url ?? "/";
      if (!url.startsWith("/ws") && url !== "/") {
        socket.destroy();
        return;
      }
      this.#wss.handleUpgrade(request, socket as Duplex, head, (ws) => {
        this.#wss.emit("connection", ws, request);
      });
    });
  }

  get sessions(): ReadonlyMap<WebSocket, SessionRecord> {
    return this.#sessions;
  }

  /** Broadcast a server event to all connected sessions that have subscribed to its topic. */
  broadcast(event: ServerEvent): void {
    const payload = JSON.stringify({ event });
    for (const [socket, session] of this.#sessions) {
      if (socket.readyState !== socket.OPEN) continue;
      // For now, deliver to every session; topic gating comes when subscriptions are wired.
      void session;
      socket.send(payload);
    }
  }

  /** Send a one-way command to a specific session (used by the daemon to drive RPC replies). */
  sendTo(socket: WebSocket, payload: Record<string, unknown>): void {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify(payload));
  }

  #onConnection(socket: WebSocket, request: IncomingMessage): void {
    const log = this.#logger.child({ remote: request.socket.remoteAddress });
    socket.once("message", (data) => {
      try {
        const text = data.toString();
        const envelope = EnvelopeSchema.parse(JSON.parse(text));
        if ("type" in envelope && envelope.type === "hello") {
          const result = handleHello({
            payload: envelope,
            ctx: {
              serverId: this.#identity.serverId,
              serverVersion: this.#serverVersion,
              ...(this.#daemonLabel ? { daemonLabel: this.#daemonLabel } : {}),
              logger: log,
            },
            ...(this.#authToken ? { authToken: this.#authToken } : {}),
          });
          if (!result.ok || !result.reply) {
            socket.send(
              JSON.stringify({
                type: "error",
                code: "unauthorized",
                message: result.error ?? "Handshake failed",
              }),
            );
            socket.close(1008, result.error ?? "Handshake failed");
            return;
          }
          const ack = result.reply as unknown as HelloAckMessage;
          socket.send(JSON.stringify(ack));
          const session: SessionRecord = {
            clientId: result.hello?.clientId ?? "unknown",
            clientType: result.hello?.clientType ?? "cli",
            socket,
            connectedAt: Date.now(),
            subscribedTopics: new Set(),
          };
          this.#sessions.set(socket, session);
          log.info(
            { clientId: session.clientId, clientType: session.clientType },
            "session opened",
          );
          this.#wireSession(socket, session);
          return;
        }
        socket.close(1008, "hello required first");
      } catch (err) {
        log.warn({ err }, "handshake parse failure");
        socket.close(1008, "Invalid hello frame");
      }
    });
    socket.on("close", () => {
      this.#sessions.delete(socket);
    });
  }

  #wireSession(socket: WebSocket, session: SessionRecord): void {
    socket.on("message", (data) => {
      try {
        const envelope = EnvelopeSchema.parse(JSON.parse(data.toString()));
        if ("cmd" in envelope) {
          const cmd = ClientCommandSchema.parse(envelope.cmd);
          if (cmd.type === "subscribe") {
            for (const topic of cmd.topics) session.subscribedTopics.add(topic);
          } else if (cmd.type === "unsubscribe") {
            for (const topic of cmd.topics) session.subscribedTopics.delete(topic);
          } else if (cmd.type === "ping") {
            socket.send(JSON.stringify({ kind: "pong", ts: Date.now() }));
            return;
          }
          this.#onCommand?.(cmd, session);
        }
        // RPC request/response envelopes are routed via SupaplaneClient.rpc(), not here.
        // Server events flow outbound via broadcast(). `hello`/`hello_ack` are
        // handshake-only and are caught at the connection boundary above.
      } catch (err) {
        this.#logger.warn({ err, sessionId: session.clientId }, "bad envelope");
      }
    });
  }
}
