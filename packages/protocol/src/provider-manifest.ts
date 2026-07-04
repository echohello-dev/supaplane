import { z } from "zod";

/**
 * Provider manifest — declares which agent runtimes Supaplane ships with
 * and their default modes. Users may override or extend via
 * `~/.supaplane/config.json` (`agents.providers` map).
 */

export const ProviderModeSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  description: z.string().optional(),
  /** True for modes that should auto-accept actions without prompting (e.g. bypassPermissions). */
  isUnattended: z.boolean().default(false),
  /** Optional ACL of features the mode toggles. */
  features: z.array(z.string()).default([]),
});
export type ProviderMode = z.infer<typeof ProviderModeSchema>;

export const ProviderModelSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  /** True if the model supports reasoning/thinking configuration. */
  reasoning: z.boolean().default(false),
  /** True if the model supports vision/image inputs. */
  vision: z.boolean().default(false),
  /** Optional context window in tokens, if known. */
  contextWindow: z.number().int().positive().optional(),
});
export type ProviderModel = z.infer<typeof ProviderModelSchema>;

export const ProviderDefinitionSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  /** Short blurb shown in the provider picker. */
  description: z.string().optional(),
  /** Source of truth for mode definitions. Some providers discover modes at runtime. */
  modes: z.array(ProviderModeSchema).default([]),
  models: z.array(ProviderModelSchema).default([]),
  /** When `true`, modes/models are fully runtime-discovered and the static lists above are fallbacks. */
  dynamic: z.boolean().default(false),
  /** Whether the provider is enabled by default. Users can toggle per-machine. */
  enabledByDefault: z.boolean().default(true),
  /** Default mode id (must be present in `modes` when `dynamic === false`). */
  defaultModeId: z.string().nullable().optional(),
  /** Default model id (must be present in `models` when `dynamic === false`). */
  defaultModelId: z.string().nullable().optional(),
  /** Where Supaplane resolves the binary on disk. */
  command: z.array(z.string()).optional(),
  /** Env vars Supaplane overlays on the provider CLI (provider reads its own keys). */
  env: z.record(z.string(), z.string()).default({}),
  /** Provider-specific config knobs. */
  providerParams: z.record(z.string(), z.unknown()).default({}),
});
export type ProviderDefinition = z.infer<typeof ProviderDefinitionSchema>;

/**
 * Built-in provider IDs (extend via config `agents.providers`).
 * Order is the default display order in the UI.
 */
export const BUILTIN_PROVIDER_IDS = ["opencode", "claude", "cursor"] as const;
export type BuiltinProviderId = (typeof BUILTIN_PROVIDER_IDS)[number];

/**
 * Override/derivation for a single provider, declared in
 * `~/.supaplane/config.json` under `agents.providers`.
 *
 * - `extends: "opencode" | "claude" | "cursor"` clones the built-in factory with merged settings.
 * - `extends: "acp"` constructs a generic ACP provider from `command`.
 */
export const ProviderOverrideSchema = z.object({
  id: z.string().min(1),
  extends: z.enum(["opencode", "claude", "cursor", "acp"]),
  label: z.string().optional(),
  description: z.string().optional(),
  command: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).default({}),
  providerParams: z.record(z.string(), z.unknown()).default({}),
  enabledByDefault: z.boolean().optional(),
});
export type ProviderOverride = z.infer<typeof ProviderOverrideSchema>;

/**
 * The mode id token used to indicate "no mode" for providers whose modes
 * are entirely runtime-discovered (Pi/OMP today).
 */
export const NO_MODE = Symbol.for("supaplane.noMode");
