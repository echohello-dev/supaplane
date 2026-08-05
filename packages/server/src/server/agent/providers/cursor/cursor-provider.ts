import { AcpAgentClient } from "../acp/acp-provider.js";

/**
 * Cursor provider — ACP over `cursor-agent acp`. Plain `AcpAgentClient`
 * with the cursor defaults; override the command via `~/.supaplane/config.json`.
 */
export class CursorAgentClient extends AcpAgentClient {
  constructor(options: { id?: string; command?: string[] } = {}) {
    super({
      id: options.id ?? "cursor",
      command: options.command ?? ["cursor-agent", "acp"],
    });
  }
}
