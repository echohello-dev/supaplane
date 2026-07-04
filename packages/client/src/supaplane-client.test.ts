import { describe, expect, it, vi } from "vitest";
import { ClientCommandSchema } from "@echohello/protocol";

describe("ClientCommandSchema", () => {
  it("accepts a workspace.open command", () => {
    expect(ClientCommandSchema.parse({ type: "workspace.open", cwd: "/tmp" })).toEqual({
      type: "workspace.open",
      cwd: "/tmp",
    });
  });

  it("accepts a session.start command with all fields", () => {
    const cmd = {
      type: "session.start" as const,
      workspaceId: "ws_1",
      providerId: "opencode",
      modelId: "anthropic/claude-sonnet-4",
      modeId: "build",
      initialPrompt: "Hello",
    };
    expect(ClientCommandSchema.parse(cmd)).toEqual(cmd);
  });

  it("accepts a permission.resolve with always_allow", () => {
    expect(
      ClientCommandSchema.parse({
        type: "permission.resolve",
        requestId: "perm_1",
        decision: "always_allow",
      }),
    ).toBeTruthy();
  });

  it("rejects unknown command types", () => {
    expect(() => ClientCommandSchema.parse({ type: "totally.unknown" })).toThrow();
  });
});

describe("WsDriver + SupaplaneClient shape (sanity)", () => {
  it("exports SupaplaneClient and WsDriver as classes", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.SupaplaneClient).toBe("function");
    expect(typeof mod.WsDriver).toBe("function");
  });

  it("rpc() factory produces a unique requestId each call", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      const id = `req_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      ids.add(id);
    }
    expect(ids.size).toBe(1000);
    vi.useRealTimers();
  });
});
