import { useEffect, useState } from "react";
import type { SupaplaneClient } from "@echohello/client";
import type { WorkspaceState } from "@echohello/protocol";

interface Props {
  client: SupaplaneClient | null;
}

export function WorkspaceSidebar({ client }: Props) {
  const [workspaces, setWorkspaces] = useState<WorkspaceState[]>([]);

  useEffect(() => {
    if (!client) return;
    const off = client.onWorkspaceState((ws) => {
      setWorkspaces((prev) => {
        const idx = prev.findIndex((w) => w.workspaceId === ws.workspaceId);
        if (idx === -1) return [...prev, ws];
        const next = prev.slice();
        next[idx] = ws;
        return next;
      });
    });
    return off;
  }, [client]);

  return (
    <aside className="flex w-72 flex-col border-r border-neutral-800 bg-neutral-900/40">
      <div className="border-b border-neutral-800 px-4 py-2 text-xs uppercase tracking-wider text-neutral-500">
        Workspaces
      </div>
      <ul className="flex-1 overflow-y-auto">
        {workspaces.length === 0 && (
          <li className="px-4 py-3 text-sm text-neutral-500">
            No workspaces yet. Run{" "}
            <code className="rounded bg-neutral-800 px-1">supaplane agent start</code> to create one.
          </li>
        )}
        {workspaces.map((ws) => (
          <li
            key={ws.workspaceId}
            className="border-b border-neutral-900 px-4 py-3 text-sm hover:bg-neutral-800/40"
          >
            <div className="flex items-center justify-between">
              <span className="truncate font-medium">{ws.repoName ?? ws.cwd}</span>
              <span
                className={`text-xs ${
                  ws.freshness === "active"
                    ? "text-emerald-400"
                    : ws.freshness === "blocked"
                      ? "text-amber-400"
                      : ws.freshness === "done"
                        ? "text-sky-400"
                        : "text-neutral-500"
                }`}
              >
                {ws.freshness}
              </span>
            </div>
            <div className="truncate text-xs text-neutral-500">{ws.branch ?? "no branch"}</div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
