import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getOrCreateServerId } from "../src/server-id.js";
import { loadOrCreateDaemonKeyPair } from "../src/daemon-keypair.js";
import { loadOrCreateIdentity } from "../src/handshake.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "supaplane-identity-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("identity anchors", () => {
  it("server-id is stable across calls", () => {
    const a = getOrCreateServerId(tmp);
    const b = getOrCreateServerId(tmp);
    expect(a).toBe(b);
    expect(a.startsWith("srv_")).toBe(true);
  });

  it("keypair is stable and carries a fingerprint", () => {
    const a = loadOrCreateDaemonKeyPair(tmp);
    const b = loadOrCreateDaemonKeyPair(tmp);
    expect(a.publicKeyB64).toBe(b.publicKeyB64);
    expect(a.secretKeyB64).toBe(b.secretKeyB64);
    expect(a.fingerprint).toMatch(/^[0-9a-f]{32}$/);
  });

  it("loadOrCreateIdentity returns both serverId and keypair", () => {
    const id = loadOrCreateIdentity(tmp);
    expect(id.serverId.startsWith("srv_")).toBe(true);
    expect(id.publicKeyB64.length).toBeGreaterThan(0);
    expect(id.publicKeyFingerprint).toMatch(/^[0-9a-f]{32}$/);
  });
});
