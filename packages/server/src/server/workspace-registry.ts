import { basename, resolve } from "node:path";

import type { WorkspaceState } from "@echohello/protocol";

/**
 * In-memory registry of open workspaces. Keyed by workspace id; `open()`
 * dedupes on the resolved cwd so the same directory never yields two
 * workspaces.
 */
export class WorkspaceRegistry {
  readonly #byId = new Map<string, WorkspaceState>();
  readonly #idByCwd = new Map<string, string>();
  #counter = 0;

  open(cwd: string): WorkspaceState {
    const resolved = resolve(cwd);
    const existingId = this.#idByCwd.get(resolved);
    if (existingId !== undefined) {
      const existing = this.#byId.get(existingId);
      if (existing !== undefined) return existing;
    }
    const now = Date.now();
    const workspace: WorkspaceState = {
      workspaceId: `ws_${++this.#counter}`,
      cwd: resolved,
      repoName: basename(resolved),
      dirty: false,
      freshness: "active",
      updatedAt: now,
    };
    this.#byId.set(workspace.workspaceId, workspace);
    this.#idByCwd.set(resolved, workspace.workspaceId);
    return workspace;
  }

  refresh(workspaceId: string): WorkspaceState | undefined {
    const workspace = this.#byId.get(workspaceId);
    if (workspace === undefined) return undefined;
    const updated: WorkspaceState = { ...workspace, updatedAt: Date.now() };
    this.#byId.set(workspaceId, updated);
    return updated;
  }

  get(workspaceId: string): WorkspaceState | undefined {
    return this.#byId.get(workspaceId);
  }

  update(
    workspaceId: string,
    patch: Partial<Omit<WorkspaceState, "workspaceId" | "cwd">>,
  ): WorkspaceState | undefined {
    const workspace = this.#byId.get(workspaceId);
    if (workspace === undefined) return undefined;
    const updated: WorkspaceState = { ...workspace, ...patch, updatedAt: Date.now() };
    this.#byId.set(workspaceId, updated);
    return updated;
  }

  list(): WorkspaceState[] {
    return [...this.#byId.values()];
  }
}
