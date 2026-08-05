import type { Logger } from "pino";
import { describe, expect, it } from "vitest";
import type { ProviderOverride } from "@echohello/protocol";

import { buildProviders } from "./provider-factory.js";

const silentLogger = {
  child: () => silentLogger,
  warn: () => undefined,
  info: () => undefined,
} as unknown as Logger;

describe("buildProviders", () => {
  it("registers the three built-ins by default", () => {
    const providers = buildProviders([], silentLogger);
    expect(providers.map((p) => p.providerId).sort()).toEqual(["claude", "cursor", "opencode"]);
  });

  it("aliases a built-in via extends with a new id", () => {
    const overrides: ProviderOverride[] = [
      { id: "claude-work", extends: "claude", env: {}, providerParams: {} },
    ];
    const providers = buildProviders(overrides, silentLogger);
    expect(providers.map((p) => p.providerId)).toContain("claude-work");
    expect(providers.map((p) => p.providerId)).toContain("claude");
  });

  it("replaces a built-in when the override reuses its id", () => {
    const overrides: ProviderOverride[] = [
      {
        id: "claude",
        extends: "claude",
        command: ["/opt/custom/claude"],
        env: {},
        providerParams: {},
      },
    ];
    const providers = buildProviders(overrides, silentLogger);
    expect(providers.filter((p) => p.providerId === "claude")).toHaveLength(1);
  });

  it("builds a generic acp provider from extends: acp", () => {
    const overrides: ProviderOverride[] = [
      {
        id: "gemini-cli",
        extends: "acp",
        command: ["gemini", "--acp"],
        env: {},
        providerParams: {},
      },
    ];
    const providers = buildProviders(overrides, silentLogger);
    expect(providers.map((p) => p.providerId)).toContain("gemini-cli");
  });

  it("skips extends: acp overrides without a command", () => {
    const overrides: ProviderOverride[] = [
      { id: "broken", extends: "acp", env: {}, providerParams: {} },
    ];
    const providers = buildProviders(overrides, silentLogger);
    expect(providers.map((p) => p.providerId)).not.toContain("broken");
  });

  it("drops providers marked enabledByDefault: false", () => {
    const overrides: ProviderOverride[] = [
      { id: "cursor", extends: "cursor", enabledByDefault: false, env: {}, providerParams: {} },
    ];
    const providers = buildProviders(overrides, silentLogger);
    expect(providers.map((p) => p.providerId)).not.toContain("cursor");
  });
});
