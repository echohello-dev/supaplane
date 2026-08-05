import { Command } from "commander";
import type { WorkspaceState } from "@echohello/protocol";

import { connectCli, DEFAULT_HTTP_ENDPOINT } from "../connect.js";

interface WorktreeInfo {
  path: string;
  branch: string | null;
  bare: boolean;
}

export const worktreeCommand = new Command("worktree")
  .description("Manage git worktrees")
  .addCommand(
    new Command("create")
      .description("Create a worktree for the given branch")
      .argument("<name>", "branch name for the worktree")
      .option("--cwd <path>", "repo to branch from (defaults to process cwd)", process.cwd())
      .option("--endpoint <url>", "daemon HTTP endpoint", DEFAULT_HTTP_ENDPOINT)
      .action(async (name: string, opts) => {
        const client = await connectCli(String(opts.endpoint), "cli-worktree-create");
        try {
          const created = new Promise<WorkspaceState>((resolvePromise, rejectPromise) => {
            const timer = setTimeout(
              () => rejectPromise(new Error("timed out waiting for the daemon")),
              30_000,
            );
            client.onWorkspaceState((workspace) => {
              if (!workspace.cwd.endsWith(`-${sanitize(name)}`)) return;
              clearTimeout(timer);
              resolvePromise(workspace);
            });
          });
          client.sendCommand({ type: "workspace.open", cwd: String(opts.cwd) });
          const workspace = await waitForWorkspace(client);
          client.sendCommand({
            type: "git.checkout",
            workspaceId: workspace.workspaceId,
            target: { kind: "worktree", name },
          });
          const worktree = await created;
          process.stdout.write(`${worktree.workspaceId}\t${worktree.cwd}\n`);
        } catch (err) {
          process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
          process.exitCode = 1;
        } finally {
          client.close();
        }
      }),
  )
  .addCommand(
    new Command("list")
      .description("List worktrees for a workspace")
      .option("--cwd <path>", "repo path (defaults to process cwd)", process.cwd())
      .option("--endpoint <url>", "daemon HTTP endpoint", DEFAULT_HTTP_ENDPOINT)
      .action(async (opts) => {
        const client = await connectCli(String(opts.endpoint), "cli-worktree-list");
        try {
          client.sendCommand({ type: "workspace.open", cwd: String(opts.cwd) });
          const workspace = await waitForWorkspace(client);
          const { worktrees } = await client.rpc<
            { workspaceId: string },
            { worktrees: WorktreeInfo[] }
          >("worktree.list", { workspaceId: workspace.workspaceId });
          for (const worktree of worktrees) {
            process.stdout.write(`${worktree.path}\t${worktree.branch ?? "(detached)"}\n`);
          }
        } finally {
          client.close();
        }
      }),
  );

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function waitForWorkspace(client: {
  onWorkspaceState: (listener: (workspace: WorkspaceState) => void) => unknown;
}): Promise<WorkspaceState> {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(
      () => rejectPromise(new Error("timed out waiting for workspace_state")),
      10_000,
    );
    client.onWorkspaceState((workspace) => {
      clearTimeout(timer);
      resolvePromise(workspace);
    });
  });
}
