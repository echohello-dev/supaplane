import { useState } from "react";
import type { SupaplaneClient } from "@echohello/client";

interface Props {
  client: SupaplaneClient | null;
}

export function Composer({ client }: Props) {
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
          className="rounded bg-supaplane-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-supaplane-accent-soft disabled:opacity-40"
          disabled={!client || !prompt.trim() || !sessionId.trim()}
          onClick={send}
        >
          Send
        </button>
      </div>
    </footer>
  );
}
