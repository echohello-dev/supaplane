import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";

import { ClaudeToolCallMapper } from "./tool-call-mapper.js";

function assistantMessage(content: unknown[]): SDKMessage {
  return {
    type: "assistant",
    uuid: "u-1",
    session_id: "s-1",
    parent_tool_use_id: null,
    message: { role: "assistant", content },
  } as unknown as SDKMessage;
}

describe("ClaudeToolCallMapper", () => {
  it("maps text blocks to message.final", () => {
    const mapper = new ClaudeToolCallMapper();
    const events = mapper.map(assistantMessage([{ type: "text", text: "hello" }]));
    expect(events).toEqual([
      { type: "message.final", partId: "u-1:0", text: "hello", ts: expect.any(Number) },
    ]);
  });

  it("maps thinking blocks to reasoning deltas", () => {
    const mapper = new ClaudeToolCallMapper();
    const events = mapper.map(assistantMessage([{ type: "thinking", thinking: "hmm" }]));
    expect(events).toEqual([
      {
        type: "message.delta",
        partId: "u-1:0",
        text: "hmm",
        reasoning: true,
        ts: expect.any(Number),
      },
    ]);
  });

  it("maps tool_use to tool.start and tool_result to tool.result with duration", () => {
    const mapper = new ClaudeToolCallMapper();
    const [start] = mapper.map(
      assistantMessage([{ type: "tool_use", id: "tool-1", name: "Read", input: { path: "/x" } }]),
    );
    expect(start).toMatchObject({ type: "tool.start", toolCallId: "tool-1", name: "Read" });

    const userMessage = {
      type: "user",
      uuid: "u-2",
      session_id: "s-1",
      parent_tool_use_id: null,
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tool-1", content: "file contents" }],
      },
    } as unknown as SDKMessage;
    const [result] = mapper.map(userMessage);
    expect(result).toMatchObject({
      type: "tool.result",
      toolCallId: "tool-1",
      output: "file contents",
    });
    expect(result?.type === "tool.result" && result.durationMs >= 0).toBe(true);
  });

  it("maps result success to idle status and errors to error events", () => {
    const mapper = new ClaudeToolCallMapper();
    const success = {
      type: "result",
      subtype: "success",
      uuid: "u-3",
      session_id: "s-1",
    } as unknown as SDKMessage;
    expect(mapper.map(success)).toEqual([
      { type: "status", status: "idle", ts: expect.any(Number) },
    ]);

    const failure = {
      type: "result",
      subtype: "error_during_execution",
      errors: ["boom"],
      uuid: "u-4",
      session_id: "s-1",
    } as unknown as SDKMessage;
    expect(mapper.map(failure)).toEqual([
      {
        type: "error",
        code: "provider_error",
        message: "error_during_execution: boom",
        ts: expect.any(Number),
      },
    ]);
  });

  it("maps session_state_changed to status events", () => {
    const mapper = new ClaudeToolCallMapper();
    const changed = {
      type: "system",
      subtype: "session_state_changed",
      state: "requires_action",
      uuid: "u-5",
      session_id: "s-1",
    } as unknown as SDKMessage;
    expect(mapper.map(changed)).toEqual([
      { type: "status", status: "waiting", ts: expect.any(Number) },
    ]);
  });

  it("ignores unrelated message types", () => {
    const mapper = new ClaudeToolCallMapper();
    const other = { type: "system", subtype: "init", session_id: "s-1" } as unknown as SDKMessage;
    expect(mapper.map(other)).toEqual([]);
  });
});
