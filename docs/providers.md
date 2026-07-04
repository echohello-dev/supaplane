# Providers

How Supaplane integrates each agent runtime. The provider seam lives under `packages/server/src/server/agent/providers/`. Each provider implements the `AgentClient` interface declared in `agent-sdk-types.ts`.

## MVP providers

1. **OpenCode** (`@opencode-ai/sdk`)
2. **Cursor** (`@agentclientprotocol/sdk` — ACP)
3. **Claude Code** (`@anthropic-ai/claude-agent-sdk`)

## Post-MVP

- **Codex** (custom JSON-RPC over stdio via `codex app-server`)
- **GitHub Copilot** (ACP via `copilot --acp`)
- **Pi / OMP** (custom line-JSON RPC via `pi --mode rpc` / `omp`)
- **Generic ACP** — any user-defined `extends: "acp"` provider via `~/.supaplane/config.json`

## Provider abstractions

### `AgentClient` interface

Every provider implements:

```ts
interface AgentClient {
  createSession(args): Promise<{ session: AgentSession; handle: PersistenceHandle }>;
  resumeSession(handle, overrides?): Promise<...>;
  listModels(): Promise<ProviderModel[]>;
  listModes(): Promise<ProviderMode[]>;
  listImportableSessions(): Promise<ImportableSession[]>;
  getDiagnostic?(): Promise<{ diagnostic: string }>;
}
```

### `PersistenceHandle`

```ts
interface PersistenceHandle {
  provider: string; // "opencode" | "claude" | ...
  sessionId: string; // the upstream provider's session id
  metadata?: Record<string, unknown>; // cwd, model, modeId, thinkingOption, systemPrompt
}
```

Stored per-session at `~/.supaplane/agents/<sanitized-cwd>/<session-id>.json`. Lets clients resume across daemon restarts without re-supplying config.

### Two integration styles

| Style                         | Mechanism                                                                                                                                           | Used by                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Direct (custom transport)** | Spawn the provider binary and speak a provider-specific protocol over stdio                                                                         | OpenCode (HTTP SDK), Claude (SDK), Codex (JSON-RPC), Pi/OMP (RPC) |
| **ACP**                       | Spawn the provider's ACP binary and speak [Agent Client Protocol](https://agentclientprotocol.com) NDJSON over stdio via `@agentclientprotocol/sdk` | Copilot, Cursor, generic `extends: "acp"`                         |

### Adding a new provider via config (Paseo pattern)

```jsonc
// ~/.supaplane/config.json
{
  "agents": {
    "providers": {
      "cursor": {
        "extends": "cursor",
        "command": ["cursor-agent", "acp"],
      },
      "gemini-cli": {
        "extends": "acp",
        "command": ["gemini", "--acp"],
      },
    },
  },
}
```

`extends: "acp"` is the extensibility escape hatch — any ACP-speaking agent CLI works without code changes.

## Auth stance

**Supaplane never manages API keys.** Each provider CLI reads its own creds (`~/.claude`, `~/.codex/auth.json`, etc.). The daemon inherits the user's shell env via `createProviderEnvSpec`.

## Tool-call normalisation

Provider-native tool calls are mapped to `ToolCallDetail` via per-provider mappers. ACP providers use the base class's `toolSnapshotTransformer` hook; direct providers implement their own mappers (e.g. `claude/tool-call-mapper.ts`, `opencode/tool-call-mapper.ts`, `pi/tool-call-mapper.ts`).

## Reference

- Protocol types: `packages/protocol/src/provider-manifest.ts`
- Research notes (one-obsidian): `Notes/2026-06-26 - Spanner - Paseo Agent Runtime Integrations (provider map).md`
