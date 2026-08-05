import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Logger } from "pino";

import { WorkspaceRegistry } from "./workspace-registry.js";
import { parseWorktreeList, WorktreeService } from "./worktree-service.js";

const silentLogger = {
  child: () => silentLogger,
  warn: () => undefined,
  info: () => undefined,
} as unknown as Logger;

function initRepo(path: string): void {
  execFileSync("git", ["init", "-b", "main", path]);
  execFileSync("git", ["-C", path, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", path, "config", "user.name", "Test"]);
  execFileSync("git", ["-C", path, "commit", "--allow-empty", "-m", "init"]);
  execFileSync("git", ["-C", path, "branch", "feature-x"]);
}

describe("parseWorktreeList", () => {
  it("parses porcelain output", () => {
    const parsed = parseWorktreeList(
      [
        "worktree /repo",
        "HEAD abc123",
        "branch refs/heads/main",
        "",
        "worktree /repo-feature",
        "HEAD def456",
        "branch refs/heads/feature-x",
        "",
      ].join("\n"),
    );
    expect(parsed).toEqual([
      { path: "/repo", branch: "main", bare: false },
      { path: "/repo-feature", branch: "feature-x", bare: false },
    ]);
  });
});

describe("WorktreeService", () => {
  let repoDir: string;
  let workspaces: WorkspaceRegistry;
  let service: WorktreeService;
  let workspaceId: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), "supaplane-git-"));
    initRepo(repoDir);
    workspaces = new WorkspaceRegistry();
    service = new WorktreeService({ workspaces, logger: silentLogger });
    workspaceId = workspaces.open(repoDir).workspaceId;
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
    const sibling = `${repoDir}-feature-x`;
    await rm(sibling, { recursive: true, force: true });
  });

  it("checks out a branch and reports it in workspace state", async () => {
    const [updated] = await service.checkout(workspaceId, { kind: "branch", name: "feature-x" });
    expect(updated?.branch).toBe("feature-x");
  });

  it("creates a worktree and registers it as a workspace", async () => {
    const affected = await service.checkout(workspaceId, { kind: "worktree", name: "feature-x" });
    expect(affected).toHaveLength(2);
    const created = affected[1];
    expect(created?.cwd).toBe(`${repoDir}-feature-x`);

    const realWorktreePath = realpathSync(`${repoDir}-feature-x`);
    const worktrees = await service.listWorktrees(workspaceId);
    expect(worktrees.map((w) => w.path)).toContain(realWorktreePath);
    expect(worktrees.find((w) => w.path === realWorktreePath)?.branch).toBe("feature-x");
  });

  it("rejects unknown workspaces", async () => {
    await expect(service.checkout("ws_nope", { kind: "branch", name: "x" })).rejects.toThrow(
      "Unknown workspace",
    );
  });

  it("rejects a missing branch with a git error", async () => {
    await expect(
      service.checkout(workspaceId, { kind: "branch", name: "does-not-exist" }),
    ).rejects.toThrow("git checkout does-not-exist failed");
  });
});
