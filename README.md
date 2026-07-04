# supaplane

Local-first, multi-surface coding-agent workbench. Built for daily use across desktop, web, and mobile, with a single supervised daemon that owns agent lifecycle, worktrees, and remote access.

Supaplane (née Spanner, née Pidex, née OpenPi) is a personal project under the [echohello](https://echohello.dev) org. Companion installer: [`hoist`](https://github.com/echohello-dev/hoist).

## Status

🚧 Greenfield scaffold. See the build-research notes in `docs/` for the architectural decisions:

- `docs/architecture.md` — overall architecture
- `docs/onboarding-relay.md` — pairing, relay, settings sync
- `docs/providers.md` — agent runtime integrations

## Surfaces (MVP)

- **Desktop** — Electron shell that spawns and supervises the daemon.
- **PWA** — `@echohello/web` serves as a PWA; also reachable over the E2E-encrypted relay from any browser.
- **Mobile** — `@echohello/app` is a native Expo / React Native iOS + Android client.

## Quick start

```bash
# Toolchain (mise installs node + bun)
mise install

# Install deps (bun workspaces)
bun install

# Build the dependency chain (protocol → client → server)
bun run build

# Run the daemon (dev)
mise run dev:daemon

# In another terminal — start the web renderer
mise run dev:web

# In another terminal — start the desktop shell (with daemon already running)
mise run dev:desktop
```

## Monorepo layout

```
packages/
├── protocol/   # Zod schemas + binary frame codecs — the contract everything hangs off
├── client/     # WS driver + SupaplaneClient facade (used by web, desktop, app, cli)
├── server/     # Standalone supervised daemon — Express 5 + ws 8 + Pino
├── cli/        # Commander-style commands (daemon, agent, provider, worktree)
├── web/        # Vite 8 + React 19 + Tailwind 4 + Pretext (desktop + PWA renderer)
├── desktop/    # Electron 41 shell (spawns/supervises daemon)
├── app/        # Expo 54 + RN 0.81 mobile renderer
└── relay/      # E2E-encrypted relay (post-MVP)

skills/         # Published agent skills (installed via npx skills)
docs/           # Architecture, onboarding, provider maps
```

## Provider priorities (MVP)

1. **OpenCode** (`@opencode-ai/sdk`) — first provider
2. **Cursor** (`@agentclientprotocol/sdk`) — proves the ACP path
3. **Claude Code** (`@anthropic-ai/claude-agent-sdk`)
4. **MCP server** (`@modelcontextprotocol/sdk`) for agent-to-agent orchestration
5. Codex, Copilot, Pi/OMP — Paseo parity, post-MVP

## License

MIT. See `LICENSE`.
