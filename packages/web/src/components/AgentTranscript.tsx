import { useEffect, useRef, useState } from "react";
import type { SupaplaneClient } from "@echohello/client";
import type { AgentEvent } from "@echohello/protocol";

interface Props {
  client: SupaplaneClient | null;
}

/**
 * The agent transcript renderer.
 *
 * TODO: integrate Pretext (`@chenglou/pretext`) for DOM-free text measurement
 * so long-running transcripts stay performant — the prepare → layout API is
 * expected to be wired in once the streaming path is finalised (see
 * `docs/architecture.md` and the long-session perf notes).
 * TODO: replace the simple list with a virtualised list (`@tanstack/react-virtual`)
 * once transcript sizes start exceeding a few hundred events.
 */
export function AgentTranscript({ client }: Props) {
  const [lines, setLines] = useState<Array<{ id: string; text: string; kind: AgentEvent["type"] }>>(
    [],
  );
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!client) return;
    const off = client.onAgentEvent((event) => {
      setLines((prev) => [
        ...prev,
        {
          id: `${event.type}-${event.ts}-${Math.random().toString(36).slice(2, 6)}`,
          text: describeEvent(event),
          kind: event.type,
        },
      ]);
    });
    return off;
  }, [client]);

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
        <div key={line.id} className="whitespace-pre-wrap text-neutral-200">
          <span className="mr-3 text-xs text-neutral-600">{line.kind}</span>
          {line.text}
        </div>
      ))}
    </section>
  );
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
