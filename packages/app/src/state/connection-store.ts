import { create } from "zustand";
import { SupaplaneClient } from "@echohello/client";
import type {
  AgentEvent,
  HelloAckMessage,
  SessionState,
  WorkspaceState,
} from "@echohello/protocol";

import {
  clearConnection,
  loadSavedConnection,
  loadTrustedServer,
  saveConnection,
  saveTrustedServer,
  type SavedConnection,
} from "../storage.js";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error"
  | "reconnecting"
  | "exhausted";

interface ConnectionState {
  status: ConnectionStatus;
  error: string | null;
  serverId: string | null;
  serverLabel: string | null;
  serverVersion: string | null;
  fingerprint: string | null;
  trusted: boolean;
  client: SupaplaneClient | null;
  endpoint: string | null;
  reconnectAttempt: number;

  workspaces: Map<string, WorkspaceState>;
  sessions: Map<string, SessionState>;
  events: Map<string, AgentEvent[]>;

  saved: SavedConnection | null;

  hydrate: () => Promise<void>;
  connect: (input: { endpoint: string; label?: string }) => Promise<void>;
  disconnect: () => void;
  forget: () => Promise<void>;
  recordEvent: (event: AgentEvent) => void;
  clearEvents: (sessionId: string) => void;
}

const makeClientId = (): string =>
  `mobile-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  status: "idle",
  error: null,
  serverId: null,
  serverLabel: null,
  serverVersion: null,
  fingerprint: null,
  trusted: false,
  client: null,
  endpoint: null,
  reconnectAttempt: 0,
  workspaces: new Map(),
  sessions: new Map(),
  events: new Map(),
  saved: null,

  async hydrate() {
    const saved = await loadSavedConnection();
    set({ saved });
    if (saved) {
      await get().connect({ endpoint: saved.endpoint, label: saved.label });
    }
  },

  async connect({ endpoint, label }) {
    const previous = get().client;
    previous?.close();

    set({
      status: "connecting",
      error: null,
      endpoint,
      serverId: null,
      serverLabel: label ?? null,
      serverVersion: null,
      fingerprint: null,
      trusted: false,
      client: null,
      workspaces: new Map(),
      sessions: new Map(),
      events: new Map(),
      reconnectAttempt: 0,
    });

    const client = new SupaplaneClient({
      endpoint,
      clientId: makeClientId(),
      clientType: "mobile",
      capabilities: { reconnect: true, binaryFrames: false },
    });

    client.on("error", (err) => {
      set({ status: "error", error: err.message });
    });
    client.on("reconnecting", ({ attempt }) => {
      set({ status: "reconnecting", reconnectAttempt: attempt });
    });
    client.on("exhausted", () => {
      set({ status: "exhausted", error: "Reconnect attempts exhausted" });
    });

    client.onWorkspaceState((workspace) => {
      set((state) => {
        const next = new Map(state.workspaces);
        next.set(workspace.workspaceId, workspace);
        return { workspaces: next };
      });
    });
    client.onSessionState((session) => {
      set((state) => {
        const next = new Map(state.sessions);
        next.set(session.sessionId, session);
        return { sessions: next };
      });
    });

    set({ client });

    try {
      const ack: HelloAckMessage = await client.connect();
      const fingerprint = ack.pairing?.serverPublicKeyFingerprint ?? null;
      const trusted = ack.pairing?.trusted ?? false;

      const savedServer = fingerprint ? await loadTrustedServer() : null;
      const isTrusted =
        fingerprint !== null &&
        savedServer !== null &&
        savedServer.fingerprint === fingerprint;

      if (fingerprint && isTrusted) {
        await saveTrustedServer({ serverId: ack.serverId, fingerprint });
      }

      set({
        status: "connected",
        serverId: ack.serverId,
        serverLabel: ack.daemon.label ?? label ?? null,
        serverVersion: ack.serverVersion,
        fingerprint,
        trusted: trusted || isTrusted,
      });

      const saved: SavedConnection = { endpoint, label: label ?? "" };
      await saveConnection(saved);
      set({ saved });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ status: "error", error: message, client: null });
    }
  },

  disconnect() {
    get().client?.close();
    set({
      status: "disconnected",
      client: null,
      workspaces: new Map(),
      sessions: new Map(),
      events: new Map(),
    });
  },

  async forget() {
    get().client?.close();
    await clearConnection();
    set({
      status: "idle",
      client: null,
      endpoint: null,
      serverId: null,
      serverLabel: null,
      serverVersion: null,
      fingerprint: null,
      trusted: false,
      workspaces: new Map(),
      sessions: new Map(),
      events: new Map(),
      saved: null,
      error: null,
    });
  },

  recordEvent(event) {
    set((state) => {
      const next = new Map(state.events);
      const list = next.get(event.sessionId) ?? [];
      next.set(event.sessionId, [...list, event]);
      return { events: next };
    });
  },

  clearEvents(sessionId) {
    set((state) => {
      if (!state.events.has(sessionId)) return state;
      const next = new Map(state.events);
      next.delete(sessionId);
      return { events: next };
    });
  },
}));
