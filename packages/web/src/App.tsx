import { useEffect, useState } from "react";
import { SupaplaneClient, type SupaplaneClient as SupaplaneClientType } from "@echohello/client";

import { AgentTranscript } from "./components/AgentTranscript.js";
import { Composer } from "./components/Composer.js";
import { ConnectionBanner } from "./components/ConnectionBanner.js";
import { DiffView } from "./components/DiffView.js";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar.js";

const DAEMON_WS = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;
const CLIENT_ID = `web-${Math.random().toString(36).slice(2, 10)}`;

interface OpenDiff {
  name: string;
  before: string;
  after: string;
  prevName?: string;
  source: "command" | "demo";
}

export function App() {
  const [client, setClient] = useState<SupaplaneClientType | null>(null);
  const [helloAck, setHelloAck] = useState<Awaited<
    ReturnType<SupaplaneClientType["connect"]>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openDiff, setOpenDiff] = useState<OpenDiff | null>(null);

  useEffect(() => {
    const c = new SupaplaneClient({
      endpoint: DAEMON_WS,
      clientId: CLIENT_ID,
      clientType: "web",
      capabilities: { reconnect: true, binaryFrames: true },
    });
    c.on("error", (err) => setError(err.message));
    c.connect()
      .then((ack) => {
        setHelloAck(ack);
        setClient(c);
      })
      .catch((err: Error) => setError(err.message));
    return () => c.close();
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <ConnectionBanner
        connected={!!helloAck}
        serverId={helloAck?.serverId ?? null}
        error={error}
      />
      <div className="flex flex-1 overflow-hidden">
        <WorkspaceSidebar
          client={client}
          onDemoDiff={(wsId) =>
            setOpenDiff({
              name: `${wsId}/README.md`,
              before: SAMPLE_BEFORE,
              after: SAMPLE_AFTER,
              source: "demo",
            })
          }
        />
        <main className="flex flex-1 flex-col">
          {openDiff ? (
            <DiffPanel diff={openDiff} onClose={() => setOpenDiff(null)} />
          ) : (
            <AgentTranscript client={client} />
          )}
          <Composer
            client={client}
            diff={
              openDiff && openDiff.source === "command"
                ? {
                    name: openDiff.name,
                    before: openDiff.before,
                    after: openDiff.after,
                    ...(openDiff.prevName ? { prevName: openDiff.prevName } : {}),
                  }
                : null
            }
          />
        </main>
      </div>
    </div>
  );
}

function DiffPanel({ diff, onClose }: { diff: OpenDiff; onClose: () => void }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col bg-neutral-950">
      <header className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/60 px-4 py-2">
        <div className="flex items-center gap-3">
          <h2 className="font-mono text-sm text-neutral-200">{diff.name}</h2>
          {diff.prevName ? (
            <span className="text-xs text-neutral-500">from {diff.prevName}</span>
          ) : null}
          <span className="rounded bg-neutral-800 px-2 py-0.5 text-[10px] uppercase text-neutral-400">
            {diff.source}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded border border-neutral-700 bg-neutral-950 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
        >
          Close
        </button>
      </header>
      <div className="min-h-0 flex-1">
        <DiffView
          name={diff.name}
          before={diff.before}
          after={diff.after}
          {...(diff.prevName ? { prevName: diff.prevName } : {})}
        />
      </div>
    </section>
  );
}

const SAMPLE_BEFORE = `export function greet(name: string) {
  return "Hello, " + name;
}
`;

const SAMPLE_AFTER = `export function greet(name: string, title = "Hello"): string {
  return \`\${title}, \${name}\`;
}

export function shout(greeting: string): string {
  return greeting.toUpperCase();
}
`;
