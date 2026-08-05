import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";
import { ProviderOverrideSchema, type ProviderOverride } from "@echohello/protocol";

/**
 * `~/.supaplane/config.json` overlay. Users extend/override agent providers
 * here (see docs/providers.md). Hot-reload is intentionally out of scope —
 * the overlay is read once at daemon boot.
 */
export const ConfigOverlaySchema = z.object({
  agents: z
    .object({
      providers: z.record(z.string(), ProviderOverrideSchema.omit({ id: true })).default({}),
    })
    .default({ providers: {} }),
});
export type ConfigOverlay = z.infer<typeof ConfigOverlaySchema>;

/** Load `<supaplaneHome>/config.json`. Returns an empty overlay when absent. */
export async function loadConfigOverlay(supaplaneHome: string): Promise<ConfigOverlay> {
  let raw: string;
  try {
    raw = await readFile(join(supaplaneHome, "config.json"), "utf8");
  } catch {
    return ConfigOverlaySchema.parse({});
  }
  return ConfigOverlaySchema.parse(JSON.parse(raw));
}

/** Flatten the overlay's provider map into `ProviderOverride`s (map key becomes `id`). */
export function providerOverridesFromOverlay(overlay: ConfigOverlay): ProviderOverride[] {
  return Object.entries(overlay.agents.providers).map(([id, override]) => ({
    ...override,
    id,
  }));
}
