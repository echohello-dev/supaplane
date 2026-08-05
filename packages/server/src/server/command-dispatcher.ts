import type { Logger } from "pino";
import {
  AgentError,
  SupaplaneError,
  type ClientCommand,
  type ServerEvent,
} from "@echohello/protocol";

import type { AgentManager } from "./agent/agent-manager.js";
import type { WorkspaceRegistry } from "./workspace-registry.js";
import type { WorktreeService } from "./worktree-service.js";

export interface CommandContext {
  clientId: string;
  /** Report an error back to the originating socket (no ack frames exist for one-way commands). */
  sendError: (error: { code: string; message: string }) => void;
}

export interface CommandDispatcherOptions {
  workspaces: WorkspaceRegistry;
  agents: AgentManager;
  worktrees: WorktreeService;
  broadcast: (event: ServerEvent) => void;
  logger: Logger;
}

/**
 * Routes validated `ClientCommand`s from the WebSocket server to the
 * workspace registry / agent manager, and broadcasts resulting state.
 *
 * Commands that are valid per the protocol but not yet implemented at the
 * daemon layer are answered with a `bad_request` error frame, never dropped.
 */
export class CommandDispatcher {
  readonly #workspaces: WorkspaceRegistry;
  readonly #agents: AgentManager;
  readonly #worktrees: WorktreeService;
  readonly #broadcast: (event: ServerEvent) => void;
  readonly #logger: Logger;

  constructor(options: CommandDispatcherOptions) {
    this.#workspaces = options.workspaces;
    this.#agents = options.agents;
    this.#worktrees = options.worktrees;
    this.#broadcast = options.broadcast;
    this.#logger = options.logger.child({ module: "command-dispatcher" });
  }

  handle(cmd: ClientCommand, ctx: CommandContext): void {
    switch (cmd.type) {
      case "workspace.open": {
        const workspace = this.#workspaces.open(cmd.cwd);
        this.#broadcast({ kind: "workspace_state", workspace });
        return;
      }
      case "workspace.refresh": {
        const workspace = this.#workspaces.refresh(cmd.workspaceId);
        if (workspace === undefined) {
          this.#fail(
            ctx,
            new AgentError({
              code: "not_found",
              message: `Unknown workspace: ${cmd.workspaceId}`,
            }),
          );
          return;
        }
        this.#broadcast({ kind: "workspace_state", workspace });
        return;
      }
      case "session.start": {
        void this.#guard(ctx, async () => {
          const workspace = this.#requireWorkspace(cmd.workspaceId);
          const state = await this.#agents.startSession({
            workspaceId: workspace.workspaceId,
            cwd: workspace.cwd,
            providerId: cmd.providerId,
            ...(cmd.modelId !== undefined ? { modelId: cmd.modelId } : {}),
            ...(cmd.modeId !== undefined ? { modeId: cmd.modeId } : {}),
            ...(cmd.initialPrompt !== undefined ? { initialPrompt: cmd.initialPrompt } : {}),
          });
          this.#broadcast({ kind: "session_state", session: state });
        });
        return;
      }
      case "session.resume": {
        void this.#guard(ctx, async () => {
          const cwd =
            typeof cmd.handle.metadata?.cwd === "string" ? cmd.handle.metadata.cwd : process.cwd();
          const workspace = this.#workspaces.open(cwd);
          const state = await this.#agents.resumeSession({
            workspaceId: workspace.workspaceId,
            cwd: workspace.cwd,
            handle: cmd.handle,
            ...(cmd.overrides !== undefined ? { overrides: cmd.overrides } : {}),
          });
          this.#broadcast({ kind: "session_state", session: state });
        });
        return;
      }
      case "session.send": {
        void this.#guard(ctx, async () => {
          await this.#agents.send(cmd.sessionId, cmd.prompt, cmd.attachments);
        });
        return;
      }
      case "session.abort": {
        void this.#guard(ctx, async () => {
          await this.#agents.abort(cmd.sessionId);
        });
        return;
      }
      case "git.checkout": {
        void this.#guard(ctx, async () => {
          const target =
            cmd.target.kind === "pr"
              ? { kind: "pr" as const, number: cmd.target.number }
              : { kind: cmd.target.kind, name: cmd.target.name };
          const affected = await this.#worktrees.checkout(cmd.workspaceId, target);
          for (const workspace of affected) {
            this.#broadcast({ kind: "workspace_state", workspace });
          }
        });
        return;
      }
      case "session.fork":
      case "diff.open":
      case "file.open":
      case "permission.resolve": {
        this.#fail(
          ctx,
          new AgentError({ code: "bad_request", message: `${cmd.type} is not implemented yet` }),
        );
        return;
      }
      case "ping":
      case "pong":
      case "subscribe":
      case "unsubscribe": {
        // Handled by the WebSocket server transport layer.
        return;
      }
    }
  }

  #requireWorkspace(workspaceId: string) {
    const workspace = this.#workspaces.get(workspaceId);
    if (workspace === undefined) {
      throw new AgentError({ code: "not_found", message: `Unknown workspace: ${workspaceId}` });
    }
    return workspace;
  }

  async #guard(ctx: CommandContext, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      this.#fail(ctx, err);
    }
  }

  #fail(ctx: CommandContext, err: unknown): void {
    if (err instanceof SupaplaneError) {
      this.#logger.warn(
        { clientId: ctx.clientId, code: err.code, err: err.message },
        "command failed",
      );
      ctx.sendError({ code: err.code, message: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    this.#logger.warn({ clientId: ctx.clientId, err: message }, "command failed");
    ctx.sendError({ code: "internal", message });
  }
}
