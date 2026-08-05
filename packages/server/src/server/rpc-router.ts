import { z } from "zod";
import type { Logger } from "pino";
import { SupaplaneError, type RpcRequest, type RpcResponse } from "@echohello/protocol";

import type { AgentManager } from "./agent/agent-manager.js";
import type { WorkspaceRegistry } from "./workspace-registry.js";

export interface RpcRouterOptions {
  workspaces: WorkspaceRegistry;
  agents: AgentManager;
  logger: Logger;
}

const ProviderArgsSchema = z.object({ providerId: z.string().min(1) });
const SessionListArgsSchema = z.object({ workspaceId: z.string().optional() });

/**
 * Answers one-shot client RPCs (`SupaplaneClient.rpc()`). Read-only views
 * over the provider registry, workspace registry, and session table.
 * Unknown RPCs get an `ok: false` response, never silence.
 */
export class RpcRouter {
  readonly #workspaces: WorkspaceRegistry;
  readonly #agents: AgentManager;
  readonly #logger: Logger;

  constructor(options: RpcRouterOptions) {
    this.#workspaces = options.workspaces;
    this.#agents = options.agents;
    this.#logger = options.logger.child({ module: "rpc-router" });
  }

  async handle(req: RpcRequest): Promise<RpcResponse> {
    try {
      const result = await this.#route(req);
      return { kind: "rpc_response", rpc: req.rpc, requestId: req.requestId, ok: true, result };
    } catch (err) {
      const code = err instanceof SupaplaneError ? err.code : "internal";
      const message = err instanceof Error ? err.message : String(err);
      this.#logger.warn({ rpc: req.rpc, code, err: message }, "rpc failed");
      return {
        kind: "rpc_response",
        rpc: req.rpc,
        requestId: req.requestId,
        ok: false,
        error: { code, message },
      };
    }
  }

  async #route(req: RpcRequest): Promise<unknown> {
    switch (req.rpc) {
      case "provider.list":
        return { providers: this.#agents.providerIds() };
      case "provider.models":
        return { models: await this.#agents.listModels(this.#providerId(req)) };
      case "provider.modes":
        return { modes: await this.#agents.listModes(this.#providerId(req)) };
      case "provider.diagnostic":
        return this.#agents.getDiagnostic(this.#providerId(req));
      case "workspace.list":
        return { workspaces: this.#workspaces.list() };
      case "session.list": {
        const args = SessionListArgsSchema.parse(req.args ?? {});
        return { sessions: this.#agents.listSessions(args.workspaceId) };
      }
      default:
        throw new SupaplaneError({ code: "not_found", message: `Unknown rpc: ${req.rpc}` });
    }
  }

  #providerId(req: RpcRequest): string {
    return ProviderArgsSchema.parse(req.args).providerId;
  }
}
