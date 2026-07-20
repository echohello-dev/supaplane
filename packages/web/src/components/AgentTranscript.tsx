import { useEffect, useRef, useState } from "react";
import type { SupaplaneClient } from "@echohello/client";
import type { AgentEvent } from "@echohello/protocol";

import { MarkdownView } from "./MarkdownView.js";

interface Props {
  client: SupaplaneClient | null;
}

/**
 * The agent transcript renderer.
 *
 * Long message events stream through markdown-it (token-stream parser with
 * safe defaults) for agent text, and small line entries cover the meta
 * events (tool.start, status, error, permission_request).
 *
 * TODO: integrate Pretext for DOM-free text measurement so long-running
 * transcripts stay performant — see docs/architecture.md.
 * TODO: replace the simple list with a virtualised list
 * (`@tanstack/react-virtual`) once transcript sizes start exceeding a few
 * hundred events.
 */
export function AgentTranscript({ client }: Props) {
  const [lines, setLines] = useState<
    Array<{
      id: string;
      text: string;
      kind: AgentEvent["type"];
      markdown?: boolean;
    }>
  >([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!client) return;
    const off = client.onAgentEvent((event) => {
      setLines((prev) => {
        // Coalesce streaming `message.delta` into the latest open message
        // line so the transcript doesn't fragment on every token push.
        const last = prev[prev.length - 1];
        if (event.type === "message.delta" && last && last.kind === "message.delta") {
          const next = prev.slice();
          next[next.length - 1] = {
            ...last,
            text: last.text + event.text,
          };
          return next;
        }
        return [
          ...prev,
          {
            id: `${event.type}-${event.ts}-${Math.random().toString(36).slice(2, 6)}`,
            text: describeEvent(event),
            kind: event.type,
            markdown: isMarkdown(event),
          },
        ];
      });
    });
    return off;
  }, [client]);

  useEffect(() => {
    if (lines.length === 0) return;
    const id = setTimeout(() => containerRef.current?.scrollTo({ top: 9e9 }), 50);
    return () => clearTimeout(id);
  }, [lines.length]);

  return (
    <section
      ref={containerRef}
      className="flex-1 overflow-y-auto bg-neutral-950 px-6 py-4 font-mono text-sm leading-relaxed"
    >
      {lines.length === 0 && (
        <p className="text-neutral-500">
          Transcript is empty. Start an agent session from the CLI to see events stream here.
        </p>
      )}
      {lines.map((line) => (
        <article key={line.id} className="border-b border-neutral-900/60 pb-3">
          <header className="mb-1 flex items-center gap-2 text-xs text-neutral-600">
            <span>{line.kind}</span>
            {!line.markdown && line.kind !== "message.delta" ? (
              <span className="text-neutral-300">{line.text}</span>
            ) : null}
          </header>
          {line.markdown ? (
            <MarkdownView source={line.text} />
          ) : line.kind === "message.delta" ? null : (
            <pre className="whitespace-pre-wrap text-neutral-200">{line.text}</pre>
          )}
        </article>
      ))}
    </section>
  );
}

function isMarkdown(event: AgentEvent): boolean {
  return event.type === "message.delta" || event.type === "message.final";
}

function describeEvent(event: AgentEvent): string {
  switch (event.type) {
    case "message.delta":
      return event.text;
    case "message.final":
      return event.text;
    case "tool.start":
      return `${event.name}`;
    case "tool.progress":
      return `${event.toolCallId} · progress`;
    case "tool.result":
      return `${event.toolCallId} · done (${event.durationMs}ms)`;
    case "status":
      return `status: ${event.status}`;
    case "error":
      return `${event.code}: ${event.message}`;
    case "permission_request":
      return `permission: ${event.reason}`;
    default: {
      const _exhaustive: never = event;
      return String(_exhaustive);
    }
  }
}
