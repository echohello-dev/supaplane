import { useEffect, useState } from "react";
import { SupaplaneClient, type SupaplaneClient as SupaplaneClientType } from "@echohello/client";

import { ConnectionBanner } from "./components/ConnectionBanner.js";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar.js";
import { AgentTranscript } from "./components/AgentTranscript.js";
import { Composer } from "./components/Composer.js";

const DAEMON_WS = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;
const CLIENT_ID = `web-${Math.random().toString(36).slice(2, 10)}`;

export function App() {
  const [client, setClient] = useState<SupaplaneClientType | null>(null);
  const [helloAck, setHelloAck] = useState<Awaited<
    ReturnType<SupaplaneClientType["connect"]>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <WorkspaceSidebar client={client} />
        <main className="flex flex-1 flex-col">
          <AgentTranscript client={client} />
          <Composer client={client} />
        </main>
      </div>
    </div>
  );
}
