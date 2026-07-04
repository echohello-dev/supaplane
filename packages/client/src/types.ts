import type { ClientCapabilities, ClientType, HelloAckMessage } from "@echohello/protocol";

export interface SupaplaneClientOptions {
  /** Local or relay daemon endpoint. e.g. `ws://127.0.0.1:6767` or `wss://relay.supaplane.com/ws`. */
  endpoint: string;
  clientId: string;
  clientType: ClientType;
  capabilities?: Partial<ClientCapabilities>;
  /** Optional bearer token for local daemon auth (post-MVP). */
  authToken?: string;
  /** Auto-reconnect on unexpected close (default: true). */
  reconnect?: boolean;
  /** Maximum reconnect attempts before giving up (default: 10). */
  maxReconnectAttempts?: number;
  /** Backoff base in ms (default: 500). */
  reconnectBackoffMs?: number;
}

export interface SupaplaneClientEventMap {
  open: HelloAckMessage;
  close: { code: number; reason: string };
  error: Error;
  reconnecting: { attempt: number; delayMs: number };
  exhausted: void;
}

export type SupaplaneClientListener<E extends keyof SupaplaneClientEventMap> = (
  payload: SupaplaneClientEventMap[E],
) => void;

export type Unsubscribe = () => void;
