import { useState } from "react";
import type { SupaplaneClient } from "@echohello/client";

interface Props {
  client: SupaplaneClient | null;
  /** Optional diff request opened from the workspace sidebar (or composer). */
  diff?: {
    name: string;
    before: string;
    after: string;
    prevName?: string;
  } | null;
}

export function Composer({ client, diff }: Props) {
  const [prompt, setPrompt] = useState("");
  const [sessionId, setSessionId] = useState("");

  const send = (): void => {
    if (!client || !prompt.trim() || !sessionId.trim()) return;
    client.sendCommand({
      type: "session.send",
      sessionId: sessionId.trim(),
      prompt: prompt.trim(),
      attachments: [],
    });
    setPrompt("");
  };

  const openDiff = (): void => {
    if (!client) return;
    const session = sessionId.trim();
    if (!session) return;
    client.sendCommand({
      type: "diff.open",
      sessionId: session,
      path: "(composer demo)",
    });
  };

  return (
    <footer className="border-t border-neutral-800 bg-neutral-900/60 px-6 py-3">
      <div className="flex gap-3">
        <input
          className="w-48 rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-mono text-neutral-200 placeholder:text-neutral-600"
          placeholder="session id"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
        />
        <input
          className="flex-1 rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600"
          placeholder="Send a prompt…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 transition hover:bg-neutral-900 disabled:opacity-40"
          disabled={!client || !sessionId.trim()}
          onClick={openDiff}
          title="Send a diff.open command for this session"
        >
          diff.open
        </button>
        <button
          className="rounded bg-supaplane-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-supaplane-accent-soft disabled:opacity-40"
          disabled={!client || !prompt.trim() || !sessionId.trim()}
          onClick={send}
        >
          Send
        </button>
      </div>
      {diff ? (
        <p className="mt-2 truncate text-xs text-neutral-500">
          Opened diff for <span className="font-mono text-neutral-300">{diff.name}</span>
          {diff.prevName ? (
            <>
              {" "}
              (renamed from <span className="font-mono">{diff.prevName}</span>)
            </>
          ) : null}
        </p>
      ) : null}
    </footer>
  );
}
