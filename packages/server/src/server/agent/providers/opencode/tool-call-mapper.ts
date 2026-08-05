import type { Event, Part, ToolPart } from "@opencode-ai/sdk";

import type { SessionScopedEvent } from "../../agent-sdk-types.js";

/**
 * Maps OpenCode server-sent events onto Supaplane `SessionScopedEvent`s.
 * Stateful: tool.start is emitted once per call id, and tool durations are
 * taken from the part's own timestamps when present.
 */
export class OpenCodeToolCallMapper {
  readonly #startedToolCalls = new Map<string, number>();

  map(event: Event): SessionScopedEvent[] {
    const ts = Date.now();
    switch (event.type) {
      case "message.part.updated": {
        const { part, delta } = event.properties;
        return this.#mapPart(part, delta, ts);
      }
      case "session.status": {
        const status = event.properties.status;
        if (status.type === "busy") return [{ type: "status", status: "running", ts }];
        if (status.type === "idle") return [{ type: "status", status: "idle", ts }];
        return [{ type: "status", status: "waiting", ts }];
      }
      case "session.idle":
        return [{ type: "status", status: "idle", ts }];
      case "session.error": {
        const message = extractErrorMessage(event.properties.error);
        return [{ type: "error", code: "provider_error", message, ts }];
      }
      default:
        return [];
    }
  }

  #mapPart(part: Part, delta: string | undefined, ts: number): SessionScopedEvent[] {
    if (part.type === "text") {
      const text = delta ?? part.text;
      if (text.length === 0) return [];
      return [{ type: "message.delta", partId: part.id, text, ts }];
    }
    if (part.type === "reasoning") {
      const text = delta ?? part.text;
      if (text.length === 0) return [];
      return [{ type: "message.delta", partId: part.id, text, reasoning: true, ts }];
    }
    if (part.type === "tool") {
      return this.#mapToolPart(part, ts);
    }
    return [];
  }

  #mapToolPart(part: ToolPart, ts: number): SessionScopedEvent[] {
    const state = part.state;
    if (state.status === "running") {
      if (this.#startedToolCalls.has(part.callID)) return [];
      this.#startedToolCalls.set(part.callID, state.time.start);
      return [
        {
          type: "tool.start",
          toolCallId: part.callID,
          name: part.tool,
          input: state.input,
          ts,
        },
      ];
    }
    if (state.status === "completed") {
      this.#startedToolCalls.delete(part.callID);
      return [
        {
          type: "tool.result",
          toolCallId: part.callID,
          output: state.output,
          durationMs: Math.max(0, state.time.end - state.time.start),
          ts,
        },
      ];
    }
    if (state.status === "error") {
      this.#startedToolCalls.delete(part.callID);
      return [
        {
          type: "tool.result",
          toolCallId: part.callID,
          output: state.error,
          durationMs: Math.max(0, state.time.end - state.time.start),
          ts,
        },
      ];
    }
    return [];
  }
}

function extractErrorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null) return "unknown session error";
  const record = error as Record<string, unknown>;
  const data = record.data;
  if (typeof data === "object" && data !== null) {
    const message = (data as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  const name = record.name;
  return typeof name === "string" ? name : "unknown session error";
}
