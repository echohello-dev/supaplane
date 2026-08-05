import { mkdtemp, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SupaplaneClient } from "@echohello/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { startDaemon, type DaemonHandle } from "../../daemon.js";

describe("daemon e2e: provider config overlay", () => {
  let daemon: DaemonHandle;
  let client: SupaplaneClient;

  beforeEach(async () => {
    const supaplaneHome = await mkdtemp(join(tmpdir(), "supaplane-e2e-overlay-"));
    await writeFile(
      join(supaplaneHome, "config.json"),
      JSON.stringify({
        agents: {
          providers: {
            "claude-work": { extends: "claude", label: "Work Claude" },
            "gemini-cli": { extends: "acp", command: ["gemini", "--acp"] },
          },
        },
      }),
    );
    daemon = await startDaemon({
      config: { listenPort: 0, logLevel: "error" },
      supaplaneHome,
    });
    const { port } = daemon.httpServer.address() as AddressInfo;
    client = new SupaplaneClient({
      endpoint: `ws://127.0.0.1:${port}`,
      clientId: "e2e-overlay-client",
      clientType: "cli",
      reconnect: false,
    });
    await client.connect();
  });

  afterEach(async () => {
    client.close();
    await daemon.stop();
  });

  it("hello_ack advertises built-ins plus overlay providers", () => {
    const providers = client.helloAck?.capabilities.providers ?? [];
    expect(providers).toEqual(expect.arrayContaining(["claude", "opencode", "cursor"]));
    expect(providers).toContain("claude-work");
    expect(providers).toContain("gemini-cli");
  });

  it("provider.list rpc reflects the overlay", async () => {
    const result = await client.rpc<never, { providers: string[] }>("provider.list");
    expect(result.providers).toContain("claude-work");
    expect(result.providers).toContain("gemini-cli");
  });
});
