import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import type { SessionScopedEvent } from "../../agent-sdk-types.js";

interface TextBlock {
  type: "text";
  text: string;
}
interface ThinkingBlock {
  type: "thinking";
  thinking: string;
}
interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}
interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
}
type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock;

/**
 * Maps provider-native Claude Agent SDK messages onto Supaplane
 * `SessionScopedEvent`s. Stateful: tracks tool_use start times so
 * `tool.result` events can carry `durationMs`.
 */
export class ClaudeToolCallMapper {
  readonly #toolStarts = new Map<string, number>();

  map(message: SDKMessage): SessionScopedEvent[] {
    const ts = Date.now();
    switch (message.type) {
      case "assistant": {
        if (message.error !== undefined) {
          return [
            {
              type: "error",
              code: "provider_error",
              message: `assistant message error: ${message.error}`,
              ts,
            },
          ];
        }
        const blocks = message.message.content as unknown as ContentBlock[];
        const events: SessionScopedEvent[] = [];
        blocks.forEach((block, index) => {
          if (block.type === "text" && block.text.length > 0) {
            events.push({
              type: "message.final",
              partId: `${message.uuid}:${index}`,
              text: block.text,
              ts,
            });
          } else if (block.type === "thinking" && block.thinking.length > 0) {
            events.push({
              type: "message.delta",
              partId: `${message.uuid}:${index}`,
              text: block.thinking,
              reasoning: true,
              ts,
            });
          } else if (block.type === "tool_use") {
            this.#toolStarts.set(block.id, ts);
            events.push({
              type: "tool.start",
              toolCallId: block.id,
              name: block.name,
              input: block.input,
              ts,
            });
          }
        });
        return events;
      }
      case "user": {
        const content = message.message.content;
        if (typeof content === "string") return [];
        const blocks = content as unknown as ContentBlock[];
        const events: SessionScopedEvent[] = [];
        for (const block of blocks) {
          if (block.type !== "tool_result") continue;
          const startedAt = this.#toolStarts.get(block.tool_use_id);
          this.#toolStarts.delete(block.tool_use_id);
          events.push({
            type: "tool.result",
            toolCallId: block.tool_use_id,
            output: block.content,
            durationMs: startedAt === undefined ? 0 : Math.max(0, ts - startedAt),
            ts,
          });
        }
        return events;
      }
      case "result": {
        if (message.subtype === "success") {
          return [{ type: "status", status: "idle", ts }];
        }
        return [
          {
            type: "error",
            code: "provider_error",
            message: `${message.subtype}: ${message.errors.join("; ")}`,
            ts,
          },
        ];
      }
      case "system": {
        if (message.subtype === "session_state_changed") {
          if (message.state === "running") return [{ type: "status", status: "running", ts }];
          if (message.state === "idle") return [{ type: "status", status: "idle", ts }];
          return [{ type: "status", status: "waiting", ts }];
        }
        return [];
      }
      default:
        return [];
    }
  }
}
