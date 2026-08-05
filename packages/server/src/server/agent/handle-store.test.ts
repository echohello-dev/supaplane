import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { HandleStore, sanitizeCwd } from "./handle-store.js";

describe("sanitizeCwd", () => {
  it("replaces path separators and collapses dashes", () => {
    expect(sanitizeCwd("/Users/foo/my-project")).toBe("Users-foo-my-project");
  });

  it("returns 'root' for an all-symbol cwd", () => {
    expect(sanitizeCwd("///")).toBe("root");
  });
});

describe("HandleStore", () => {
  it("round-trips a persistence handle", async () => {
    const home = await mkdtemp(join(tmpdir(), "supaplane-handles-"));
    const store = new HandleStore(home);
    const handle = {
      provider: "claude",
      sessionId: "abc-123",
      metadata: { cwd: "/tmp/proj", modelId: "sonnet" },
    };
    await store.save("/tmp/proj", handle);

    const loaded = await store.load("/tmp/proj", "claude", "abc-123");
    expect(loaded).toEqual(handle);

    const raw = await readFile(join(home, "agents", "tmp-proj", "abc-123.json"), "utf8");
    expect(JSON.parse(raw)).toEqual(handle);
  });

  it("returns null for missing or mismatched handles", async () => {
    const home = await mkdtemp(join(tmpdir(), "supaplane-handles-"));
    const store = new HandleStore(home);
    await store.save("/tmp/proj", { provider: "claude", sessionId: "abc-123" });

    expect(await store.load("/tmp/proj", "claude", "nope")).toBeNull();
    expect(await store.load("/tmp/other", "claude", "abc-123")).toBeNull();
    expect(await store.load("/tmp/proj", "opencode", "abc-123")).toBeNull();
  });
});
