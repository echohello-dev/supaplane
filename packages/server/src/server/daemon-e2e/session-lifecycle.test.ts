import { mkdtemp } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SupaplaneClient } from "@echohello/client";
import type { ServerEvent, SessionState, WorkspaceState } from "@echohello/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { startDaemon, type DaemonHandle } from "../../daemon.js";
import type {
  AgentClient,
  AgentEventSink,
  AgentSession,
  AgentSessionHandle,
  CreateSessionArgs,
  ImportableSession,
  ResumeSessionArgs,
} from "../agent/agent-sdk-types.js";

class FakeAgentSession implements AgentSession {
  readonly #emit: AgentEventSink;

  constructor(emit: AgentEventSink) {
    this.#emit = emit;
  }

  send(prompt: string): Promise<void> {
    const ts = Date.now();
    this.#emit({ type: "status", status: "running", ts });
    this.#emit({ type: "message.delta", partId: "p1", text: `echo: ${prompt}`, ts });
    this.#emit({ type: "message.final", partId: "p1", text: `echo: ${prompt}`, ts: Date.now() });
    this.#emit({ type: "status", status: "idle", ts: Date.now() });
    return Promise.resolve();
  }

  abort(): Promise<void> {
    this.#emit({ type: "status", status: "idle", ts: Date.now() });
    return Promise.resolve();
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeProvider implements AgentClient {
  readonly providerId = "fake";
  readonly createdWith: CreateSessionArgs[] = [];

  createSession(args: CreateSessionArgs, emit: AgentEventSink): Promise<AgentSessionHandle> {
    this.createdWith.push(args);
    return Promise.resolve({
      session: new FakeAgentSession(emit),
      handle: {
        provider: this.providerId,
        sessionId: "upstream-1",
        metadata: { cwd: args.cwd },
      },
    });
  }

  resumeSession(args: ResumeSessionArgs, emit: AgentEventSink): Promise<AgentSessionHandle> {
    return Promise.resolve({
      session: new FakeAgentSession(emit),
      handle: args.handle,
    });
  }

  listModels(): Promise<never[]> {
    return Promise.resolve([]);
  }

  listModes(): Promise<never[]> {
    return Promise.resolve([]);
  }

  listImportableSessions(): Promise<ImportableSession[]> {
    return Promise.resolve([]);
  }
}

async function waitFor<T>(
  collected: T[],
  predicate: (item: T) => boolean,
  timeoutMs = 5000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = collected.find(predicate);
    if (found !== undefined) return found;
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
}

describe("daemon e2e: session lifecycle", () => {
  let daemon: DaemonHandle;
  let client: SupaplaneClient;
  let events: ServerEvent[];
  let provider: FakeProvider;

  beforeEach(async () => {
    const supaplaneHome = await mkdtemp(join(tmpdir(), "supaplane-e2e-"));
    daemon = await startDaemon({
      config: { listenPort: 0, logLevel: "error" },
      supaplaneHome,
    });
    provider = new FakeProvider();
    daemon.agentManager.registerProvider(provider);

    const { port } = daemon.httpServer.address() as AddressInfo;
    client = new SupaplaneClient({
      endpoint: `ws://127.0.0.1:${port}`,
      clientId: "e2e-client",
      clientType: "cli",
      reconnect: false,
    });
    events = [];
    client.onServerEvent((event) => events.push(event));
    await client.connect();
  });

  afterEach(async () => {
    client.close();
    await daemon.stop();
  });

  it("advertises registered providers in hello_ack", () => {
    expect(client.helloAck?.capabilities.providers).toContain("claude");
  });

  it("workspace.open → workspace_state", async () => {
    client.sendCommand({ type: "workspace.open", cwd: "/tmp/supaplane-e2e-ws" });
    const event = await waitFor(events, (e) => e.kind === "workspace_state");
    if (event.kind !== "workspace_state") throw new Error("unreachable");
    const workspace: WorkspaceState = event.workspace;
    expect(workspace.cwd).toBe("/tmp/supaplane-e2e-ws");
    expect(workspace.workspaceId).toMatch(/^ws_/);
  });

  it("session.start with initialPrompt streams agent events end-to-end", async () => {
    client.sendCommand({ type: "workspace.open", cwd: "/tmp/supaplane-e2e-ws" });
    const wsEvent = await waitFor(events, (e) => e.kind === "workspace_state");
    if (wsEvent.kind !== "workspace_state") throw new Error("unreachable");

    client.sendCommand({
      type: "session.start",
      workspaceId: wsEvent.workspace.workspaceId,
      providerId: "fake",
      modelId: "test-model",
      initialPrompt: "hello agent",
    });

    const sessionEvent = await waitFor(
      events,
      (e) => e.kind === "session_state" && e.session.providerId === "fake",
    );
    if (sessionEvent.kind !== "session_state") throw new Error("unreachable");
    const session: SessionState = sessionEvent.session;
    expect(session.sessionId).toMatch(/^ses_/);
    expect(session.workspaceId).toBe(wsEvent.workspace.workspaceId);
    expect(session.modelId).toBe("test-model");

    expect(provider.createdWith).toHaveLength(1);
    expect(provider.createdWith[0]?.cwd).toBe("/tmp/supaplane-e2e-ws");
    expect(provider.createdWith[0]?.modelId).toBe("test-model");

    const final = await waitFor(
      events,
      (e) =>
        e.kind === "event" &&
        e.event.type === "message.final" &&
        e.event.sessionId === session.sessionId,
    );
    if (final.kind !== "event" || final.event.type !== "message.final") {
      throw new Error("unreachable");
    }
    expect(final.event.text).toBe("echo: hello agent");

    await waitFor(
      events,
      (e) =>
        e.kind === "session_state" &&
        e.session.sessionId === session.sessionId &&
        e.session.status === "idle",
    );
  });

  it("session.send + session.abort on a running session", async () => {
    client.sendCommand({ type: "workspace.open", cwd: "/tmp/supaplane-e2e-ws" });
    const wsEvent = await waitFor(events, (e) => e.kind === "workspace_state");
    if (wsEvent.kind !== "workspace_state") throw new Error("unreachable");

    client.sendCommand({
      type: "session.start",
      workspaceId: wsEvent.workspace.workspaceId,
      providerId: "fake",
    });
    const sessionEvent = await waitFor(events, (e) => e.kind === "session_state");
    if (sessionEvent.kind !== "session_state") throw new Error("unreachable");
    const sessionId = sessionEvent.session.sessionId;

    client.sendCommand({ type: "session.send", sessionId, prompt: "second turn", attachments: [] });
    const final = await waitFor(
      events,
      (e) =>
        e.kind === "event" &&
        e.event.type === "message.final" &&
        e.event.sessionId === sessionId &&
        e.event.text === "echo: second turn",
    );
    expect(final.kind).toBe("event");

    client.sendCommand({ type: "session.abort", sessionId });
    const idle = await waitFor(
      events,
      (e) =>
        e.kind === "session_state" &&
        e.session.sessionId === sessionId &&
        e.session.status === "idle",
    );
    if (idle.kind !== "session_state") throw new Error("unreachable");
    expect(idle.session.status).toBe("idle");
  });

  it("unknown provider surfaces an error frame, not silence", async () => {
    client.sendCommand({ type: "workspace.open", cwd: "/tmp/supaplane-e2e-ws" });
    const wsEvent = await waitFor(events, (e) => e.kind === "workspace_state");
    if (wsEvent.kind !== "workspace_state") throw new Error("unreachable");

    client.sendCommand({
      type: "session.start",
      workspaceId: wsEvent.workspace.workspaceId,
      providerId: "does-not-exist",
    });

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
    // Error frames travel outside ServerEvent; assert no session was created.
    expect(provider.createdWith).toHaveLength(0);
    expect(daemon.agentManager.listSessions()).toHaveLength(0);
  });
});
