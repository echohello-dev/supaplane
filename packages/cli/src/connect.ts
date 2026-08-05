import { SupaplaneClient } from "@echohello/client";

export const DEFAULT_HTTP_ENDPOINT = "http://127.0.0.1:17687";

/** Convert an HTTP daemon endpoint (or explicit ws:// URL) to a WS endpoint. */
export function toWsEndpoint(endpoint: string): string {
  if (endpoint.startsWith("ws://") || endpoint.startsWith("wss://")) return endpoint;
  return endpoint.replace(/^http/, "ws");
}

/** Connect a CLI client to the daemon, failing fast with a useful message. */
export async function connectCli(endpoint: string, clientId: string): Promise<SupaplaneClient> {
  const client = new SupaplaneClient({
    endpoint: toWsEndpoint(endpoint),
    clientId,
    clientType: "cli",
    reconnect: false,
  });
  try {
    await client.connect();
  } catch (err) {
    client.close();
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `Failed to connect to daemon at ${endpoint}: ${message}\nIs the daemon running? (supaplane daemon start)\n`,
    );
    process.exit(1);
  }
  return client;
}
