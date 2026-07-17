import { describe, expect, it } from "vitest";
import { loadDaemonConfig } from "../src/config.js";

describe("loadDaemonConfig", () => {
  it("returns defaults when no env vars are set", () => {
    const cfg = loadDaemonConfig({});
    expect(cfg.listenHost).toBe("127.0.0.1");
    expect(cfg.listenPort).toBe(17687);
    expect(cfg.logLevel).toBe("info");
    expect(cfg.relayEnabled).toBe(false);
    expect(cfg.appBaseUrl).toBe("https://app.supaplane.com");
  });

  it("parses env overrides", () => {
    const cfg = loadDaemonConfig({
      SUPAPLANE_LISTEN_PORT: "9999",
      SUPAPLANE_RELAY_ENABLED: "true",
      SUPAPLANE_RELAY_ENDPOINT: "relay.example.com:443",
      SUPAPLANE_AUTH_TOKEN: "secret",
    });
    expect(cfg.listenPort).toBe(9999);
    expect(cfg.relayEnabled).toBe(true);
    expect(cfg.relayEndpoint).toBe("relay.example.com:443");
    expect(cfg.daemonAuthToken).toBe("secret");
  });

  it("rejects invalid log levels", () => {
    expect(() => loadDaemonConfig({ SUPAPLANE_LOG_LEVEL: "loud" })).toThrow();
  });
});
