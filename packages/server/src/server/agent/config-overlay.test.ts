import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadConfigOverlay, providerOverridesFromOverlay } from "./config-overlay.js";

describe("loadConfigOverlay", () => {
  it("returns an empty overlay when config.json is absent", async () => {
    const home = await mkdtemp(join(tmpdir(), "supaplane-overlay-"));
    const overlay = await loadConfigOverlay(home);
    expect(overlay.agents.providers).toEqual({});
  });

  it("parses provider overrides from config.json", async () => {
    const home = await mkdtemp(join(tmpdir(), "supaplane-overlay-"));
    await writeFile(
      join(home, "config.json"),
      JSON.stringify({
        agents: {
          providers: {
            "gemini-cli": { extends: "acp", command: ["gemini", "--acp"] },
            "claude-work": { extends: "claude", label: "Work Claude" },
          },
        },
      }),
    );
    const overlay = await loadConfigOverlay(home);
    const overrides = providerOverridesFromOverlay(overlay);
    expect(overrides).toHaveLength(2);
    expect(overrides.find((o) => o.id === "gemini-cli")).toMatchObject({
      extends: "acp",
      command: ["gemini", "--acp"],
    });
    expect(overrides.find((o) => o.id === "claude-work")).toMatchObject({
      extends: "claude",
      label: "Work Claude",
    });
  });

  it("rejects an invalid overlay", async () => {
    const home = await mkdtemp(join(tmpdir(), "supaplane-overlay-"));
    await writeFile(
      join(home, "config.json"),
      JSON.stringify({ agents: { providers: { bad: { extends: "nope" } } } }),
    );
    await expect(loadConfigOverlay(home)).rejects.toThrow();
  });
});
