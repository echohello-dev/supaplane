<div align="center">

# Supaplane

**Bring your coding agents and friends.**
Import your harnesses and fly them in parallel from desktop, web, or phone.

[Website](https://supaplane.com) · [Architecture](docs/architecture.md) · [Onboarding](docs/onboarding-relay.md) · [Providers](docs/providers.md) · [Development](docs/development.md)

[![License: MIT](https://img.shields.io/github/license/echohello-dev/supaplane)](LICENSE)
[![Node 22+](https://img.shields.io/badge/node-22%2B-blue)](https://nodejs.org)
[![Bun](https://img.shields.io/badge/package%20manager-bun-f9f1e1)](https://bun.sh)

</div>

## What this is

Supaplane is a multi-surface workbench for coding agents. Bring Claude Code, Codex, OpenCode, Cursor, and friends. Import the harnesses you already use, get back to speed, and run them in parallel from desk, browser, or phone.

A single supervised daemon owns agent lifecycle, worktrees, and remote access. Surfaces are thin clients over that daemon, not separate apps fighting for the same repo.

Formerly Spanner (née Pidex, née OpenPi). Personal project under [echohello](https://echohello.dev). Companion installer: [`hoist`](https://github.com/echohello-dev/hoist).

## How it sits in the sky

| | Local / self-hosted | Multi-vendor | Multi-surface | Open source |
|---|---|---|---|---|
| **T3 Code** | yes | yes | web / desktop | MIT |
| **Paseo** | yes | yes | desk + phone | AGPL |
| **Conductor** | yes (Mac) | yes | desktop | closed |
| **Superconductor** | cloud-first | yes | desk + mobile + Slack | closed |
| **OpenChamber** | yes | OpenCode-first | desk + web + phone | MIT |
| **Supaplane** | yes (daemon you control) | yes | desk + web + phone | MIT |

The open lane is local control, any harness, every surface. That is the runway we are on.

## Surfaces (MVP)

| Surface | Package | Role |
|---|---|---|
| Desktop | `@echohello/desktop` | Electron shell that spawns and supervises the daemon |
| PWA / web | `@echohello/web` | Vite + React renderer; works on the relay too |
| Mobile | `@echohello/app` | Expo / React Native companion |
| CLI | `@echohello/cli` | `supaplane` commands for daemon, agent, provider, worktree |

## Quick start

Greenfield scaffold. Expect rough edges.

```bash
mise install          # node + bun via mise
bun install           # workspace deps
bun run build         # protocol → client → server → cli
mise run dev:daemon   # supervised daemon
```

In other terminals:

```bash
mise run dev:web      # web / PWA renderer
mise run dev:desktop  # Electron shell (daemon already running)
```

More detail in [docs/development.md](docs/development.md).

## Monorepo layout

```
packages/
├── protocol/   # Zod schemas + frame codecs (the contract)
├── client/     # WS driver + SupaplaneClient facade
├── server/     # Standalone daemon (Express 5 + ws + Pino)
├── cli/        # Commander-style commands
├── web/        # Vite 8 + React 19 + Tailwind 4 + Pretext
├── desktop/    # Electron 41 shell
├── app/        # Expo 54 + RN mobile
└── relay/      # E2E-encrypted relay (post-MVP)

docs/           # Architecture, onboarding, providers, development
```

## Provider priorities (MVP)

1. **OpenCode** (`@opencode-ai/sdk`) - first provider
2. **Cursor** (`@agentclientprotocol/sdk`) - proves the ACP path
3. **Claude Code** (`@anthropic-ai/claude-agent-sdk`)
4. **MCP server** (`@modelcontextprotocol/sdk`) for agent-to-agent work
5. Codex, Copilot, Pi/OMP - later, Paseo parity

See [docs/providers.md](docs/providers.md).

## Project status

Alpha scaffold. Daemon, protocol, client, and surface stubs are in place. CI runs on every PR; calver `YYYY.MM.DD[-N]` release tags are stamped on every push to main. Architecture decisions live in `docs/` and the build-research notes that fed this repo.

## License

MIT. See [LICENSE](LICENSE).

Made to fly with open harnesses and a daemon you own.
