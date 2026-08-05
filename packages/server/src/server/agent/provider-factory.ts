import type { Logger } from "pino";
import type { ProviderOverride } from "@echohello/protocol";

import type { AgentClient } from "./agent-sdk-types.js";
import { AcpAgentClient } from "./providers/acp/acp-provider.js";
import { ClaudeAgentClient } from "./providers/claude/claude-provider.js";
import { CursorAgentClient } from "./providers/cursor/cursor-provider.js";
import { OpenCodeAgentClient } from "./providers/opencode/opencode-provider.js";

/**
 * Builds the provider set: the three built-ins, overlaid with user overrides
 * from `~/.supaplane/config.json`. Overrides with the same id replace the
 * built-in; `extends: "acp"` creates a generic ACP provider from `command`.
 */
export function buildProviders(overrides: ProviderOverride[], logger: Logger): AgentClient[] {
  const log = logger.child({ module: "provider-factory" });
  const providers = new Map<string, AgentClient>();
  providers.set("claude", new ClaudeAgentClient());
  providers.set("opencode", new OpenCodeAgentClient());
  providers.set("cursor", new CursorAgentClient());

  for (const override of overrides) {
    if (override.enabledByDefault === false) {
      providers.delete(override.id);
      continue;
    }
    try {
      providers.set(override.id, buildFromOverride(override));
    } catch (err) {
      log.warn({ err, providerId: override.id }, "skipping invalid provider override");
    }
  }
  return [...providers.values()];
}

function buildFromOverride(override: ProviderOverride): AgentClient {
  switch (override.extends) {
    case "claude":
      return new ClaudeAgentClient({
        id: override.id,
        ...(override.command !== undefined ? { command: override.command } : {}),
      });
    case "opencode":
      return new OpenCodeAgentClient({
        id: override.id,
        ...(override.command !== undefined ? { command: override.command } : {}),
      });
    case "cursor":
      return new CursorAgentClient({
        id: override.id,
        ...(override.command !== undefined ? { command: override.command } : {}),
      });
    case "acp":
      if (override.command === undefined || override.command.length === 0) {
        throw new Error(`provider ${override.id} extends "acp" but has no command`);
      }
      return new AcpAgentClient({
        id: override.id,
        command: override.command,
        env: override.env,
      });
  }
}
