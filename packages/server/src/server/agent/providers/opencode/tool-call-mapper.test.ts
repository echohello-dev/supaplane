import type { Event, ToolPart } from "@opencode-ai/sdk";
import { describe, expect, it } from "vitest";

import { OpenCodeToolCallMapper } from "./tool-call-mapper.js";

function partUpdated(part: unknown, delta?: string): Event {
  return {
    type: "message.part.updated",
    properties: { part, ...(delta !== undefined ? { delta } : {}) },
  } as unknown as Event;
}

function toolPart(status: string, extra: Record<string, unknown> = {}): ToolPart {
  return {
    id: "part-1",
    sessionID: "s-1",
    messageID: "m-1",
    type: "tool",
    callID: "call-1",
    tool: "bash",
    state: { status, ...extra },
  } as unknown as ToolPart;
}

describe("OpenCodeToolCallMapper", () => {
  it("maps text part deltas to message.delta", () => {
    const mapper = new OpenCodeToolCallMapper();
    const events = mapper.map(
      partUpdated({ type: "text", id: "p1", text: "hello world" }, "hello"),
    );
    expect(events).toEqual([
      { type: "message.delta", partId: "p1", text: "hello", ts: expect.any(Number) },
    ]);
  });

  it("maps reasoning parts to reasoning deltas", () => {
    const mapper = new OpenCodeToolCallMapper();
    const events = mapper.map(partUpdated({ type: "reasoning", id: "p2", text: "thinking hard" }));
    expect(events).toEqual([
      {
        type: "message.delta",
        partId: "p2",
        text: "thinking hard",
        reasoning: true,
        ts: expect.any(Number),
      },
    ]);
  });

  it("emits tool.start once per call id, then tool.result on completion", () => {
    const mapper = new OpenCodeToolCallMapper();
    const running = toolPart("running", { input: { cmd: "ls" }, time: { start: 1000 } });
    expect(mapper.map(partUpdated(running))).toEqual([
      {
        type: "tool.start",
        toolCallId: "call-1",
        name: "bash",
        input: { cmd: "ls" },
        ts: expect.any(Number),
      },
    ]);
    expect(mapper.map(partUpdated(running))).toEqual([]);

    const completed = toolPart("completed", {
      input: { cmd: "ls" },
      output: "file.txt",
      time: { start: 1000, end: 1500 },
    });
    expect(mapper.map(partUpdated(completed))).toEqual([
      {
        type: "tool.result",
        toolCallId: "call-1",
        output: "file.txt",
        durationMs: 500,
        ts: expect.any(Number),
      },
    ]);
  });

  it("maps session.status and session.idle to status events", () => {
    const mapper = new OpenCodeToolCallMapper();
    const busy = {
      type: "session.status",
      properties: { sessionID: "s-1", status: { type: "busy" } },
    } as unknown as Event;
    expect(mapper.map(busy)).toEqual([
      { type: "status", status: "running", ts: expect.any(Number) },
    ]);

    const idle = { type: "session.idle", properties: { sessionID: "s-1" } } as unknown as Event;
    expect(mapper.map(idle)).toEqual([{ type: "status", status: "idle", ts: expect.any(Number) }]);
  });

  it("maps session.error to an error event", () => {
    const mapper = new OpenCodeToolCallMapper();
    const errorEvent = {
      type: "session.error",
      properties: { sessionID: "s-1", error: { name: "ApiError", data: { message: "boom" } } },
    } as unknown as Event;
    expect(mapper.map(errorEvent)).toEqual([
      { type: "error", code: "provider_error", message: "boom", ts: expect.any(Number) },
    ]);
  });
});
