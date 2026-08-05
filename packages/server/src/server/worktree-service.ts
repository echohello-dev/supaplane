import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";

import type { Logger } from "pino";
import { DaemonError, type WorkspaceState } from "@echohello/protocol";

import type { WorkspaceRegistry } from "./workspace-registry.js";

export interface CheckoutTarget {
  kind: "branch" | "worktree" | "pr";
  name?: string;
  number?: number;
}

export interface WorktreeInfo {
  path: string;
  branch: string | null;
  bare: boolean;
}

export interface WorktreeServiceOptions {
  workspaces: WorkspaceRegistry;
  logger: Logger;
}

/**
 * Git checkout/worktree operations backing the `git.checkout` command.
 * Shells out to the user's `git` binary; never manages credentials.
 */
export class WorktreeService {
  readonly #workspaces: WorkspaceRegistry;
  readonly #logger: Logger;

  constructor(options: WorktreeServiceOptions) {
    this.#workspaces = options.workspaces;
    this.#logger = options.logger.child({ module: "worktree-service" });
  }

  /**
   * Apply a checkout target to a workspace. Returns the affected workspace
   * states (the refreshed workspace for branch/pr, or the refreshed workspace
   * plus the new worktree workspace for worktree targets).
   */
  async checkout(workspaceId: string, target: CheckoutTarget): Promise<WorkspaceState[]> {
    const workspace = this.#workspaces.get(workspaceId);
    if (workspace === undefined) {
      throw new DaemonError({ code: "not_found", message: `Unknown workspace: ${workspaceId}` });
    }
    switch (target.kind) {
      case "branch": {
        const name = requireName(target);
        await git(workspace.cwd, ["checkout", name]);
        return [await this.#refreshWithBranch(workspaceId)];
      }
      case "pr": {
        const number = target.number;
        if (number === undefined) {
          throw new DaemonError({ code: "bad_request", message: "pr target requires a number" });
        }
        const branch = `pr-${number}`;
        await git(workspace.cwd, ["fetch", "origin", `pull/${number}/head:${branch}`]);
        await git(workspace.cwd, ["checkout", branch]);
        return [await this.#refreshWithBranch(workspaceId)];
      }
      case "worktree": {
        const name = requireName(target);
        const path = defaultWorktreePath(workspace.cwd, name);
        await git(workspace.cwd, ["worktree", "add", path, name]);
        const created = this.#workspaces.open(path);
        return [await this.#refreshWithBranch(workspaceId), created];
      }
    }
  }

  async listWorktrees(workspaceId: string): Promise<WorktreeInfo[]> {
    const workspace = this.#workspaces.get(workspaceId);
    if (workspace === undefined) {
      throw new DaemonError({ code: "not_found", message: `Unknown workspace: ${workspaceId}` });
    }
    const { stdout } = await git(workspace.cwd, ["worktree", "list", "--porcelain"]);
    return parseWorktreeList(stdout);
  }

  async #refreshWithBranch(workspaceId: string): Promise<WorkspaceState> {
    const workspace = this.#workspaces.get(workspaceId);
    if (workspace === undefined) {
      throw new DaemonError({ code: "not_found", message: `Unknown workspace: ${workspaceId}` });
    }
    let branch: string | undefined;
    try {
      const { stdout } = await git(workspace.cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
      branch = stdout.trim();
    } catch (err) {
      this.#logger.warn({ err, cwd: workspace.cwd }, "failed to read branch");
    }
    const updated = this.#workspaces.update(workspaceId, {
      ...(branch !== undefined && branch.length > 0 ? { branch } : {}),
    });
    return updated ?? workspace;
  }
}

function requireName(target: CheckoutTarget): string {
  if (target.name === undefined || target.name.length === 0) {
    throw new DaemonError({
      code: "bad_request",
      message: `${target.kind} target requires a name`,
    });
  }
  return target.name;
}

function defaultWorktreePath(cwd: string, name: string): string {
  const repo = resolve(cwd);
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "-");
  return resolve(dirname(repo), `${repo.split("/").pop() ?? "repo"}-${safe}`);
}

export function parseWorktreeList(porcelain: string): WorktreeInfo[] {
  const worktrees: WorktreeInfo[] = [];
  let current: { path?: string; branch?: string | null; bare?: boolean } = {};
  const flush = () => {
    if (current.path === undefined) return;
    worktrees.push({
      path: current.path,
      branch: current.branch ?? null,
      bare: current.bare === true,
    });
    current = {};
  };
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) {
      flush();
      current = { path: line.slice("worktree ".length) };
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    } else if (line === "detached") {
      current.branch = null;
    } else if (line === "bare") {
      current.bare = true;
    }
  }
  flush();
  return worktrees;
}

function git(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile("git", ["-C", cwd, ...args], { timeout: 60_000 }, (err, stdout, stderr) => {
      if (err) {
        rejectPromise(
          new DaemonError({
            code: "internal",
            message: `git ${args.join(" ")} failed: ${stderr.trim() || err.message}`,
            cause: err,
          }),
        );
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });
}
