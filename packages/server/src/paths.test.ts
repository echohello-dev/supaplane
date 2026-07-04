import { describe, expect, it } from "vitest";
import { resolveSupaplaneHome, SUPAPLANE_VERSION } from "../src/paths.js";

describe("paths", () => {
  it("exports a non-empty version", () => {
    expect(SUPAPLANE_VERSION.length).toBeGreaterThan(0);
  });

  it("resolves $SUPAPLANE_HOME when set", () => {
    const result = resolveSupaplaneHome({ SUPAPLANE_HOME: "/custom/supaplane/home" });
    expect(result).toContain("custom");
    expect(result.endsWith("supaplane/home") || result.endsWith("supaplane")).toBe(true);
  });

  it("falls back to $HOME/.supaplane when unset", () => {
    const result = resolveSupaplaneHome({ HOME: "/Users/test", SUPAPLANE_HOME: "" });
    expect(result.endsWith(".supaplane")).toBe(true);
  });
});
