import { mkdtemp } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SupaplaneClient } from "@echohello/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { startDaemon, type DaemonHandle } from "../../daemon.js";

describe("daemon e2e: rpc", () => {
  let daemon: DaemonHandle;
  let client: SupaplaneClient;

  beforeEach(async () => {
    const supaplaneHome = await mkdtemp(join(tmpdir(), "supaplane-e2e-rpc-"));
    daemon = await startDaemon({
      config: { listenPort: 0, logLevel: "error" },
      supaplaneHome,
    });
    const { port } = daemon.httpServer.address() as AddressInfo;
    client = new SupaplaneClient({
      endpoint: `ws://127.0.0.1:${port}`,
      clientId: "e2e-rpc-client",
      clientType: "cli",
      reconnect: false,
    });
    await client.connect();
  });

  afterEach(async () => {
    client.close();
    await daemon.stop();
  });

  it("provider.list round-trips", async () => {
    const result = await client.rpc<never, { providers: string[] }>("provider.list");
    expect(result.providers).toContain("claude");
  });

  it("provider.models returns the claude model list", async () => {
    const result = await client.rpc<{ providerId: string }, { models: { id: string }[] }>(
      "provider.models",
      { providerId: "claude" },
    );
    expect(result.models.map((m) => m.id)).toContain("sonnet");
  });

  it("unknown rpc rejects with an error", async () => {
    await expect(client.rpc("no.such.rpc")).rejects.toThrow("Unknown rpc");
  });

  it("unknown provider rejects with an error", async () => {
    await expect(client.rpc("provider.models", { providerId: "does-not-exist" })).rejects.toThrow(
      "Unknown provider",
    );
  });
});
