# Architecture

Supaplane is a local-first, multi-surface coding-agent workbench. This document describes the package boundaries and the run-time topology.

## Goals

- **Local-first.** All agent CLIs run on the user's machine. The daemon is supervised; the user's shell environment is inherited. No telemetry.
- **Multi-surface.** Desktop (Electron), PWA (browser), mobile (Expo / React Native), CLI. All surfaces consume the same daemon over WebSocket.
- **Multi-provider.** OpenCode, Claude Code, Cursor (via ACP) at MVP. Codex, Copilot, Pi/OMP, plus any user-defined ACP agent, post-MVP.
- **Seamless onboarding.** New client connects to a daemon via QR + TOFU-pinned public-key fingerprint. Zero inbound ports on the host (relay dials outbound).
- **MIT-licensed.** The Paseo daemon is AGPL-3.0 — we mirror its architecture clean-room rather than fork its code.

## Package layout

```
@echohello/protocol   Zod schemas + binary frame codecs. The contract.
                    No deps on other packages.
@echohello/client     WS driver + SupaplaneClient facade.
                    Depends on @echohello/protocol.
@echohello/server     Standalone supervised daemon (Express 5 + ws + Pino).
                    Depends on @echohello/protocol + @echohello/client.
@echohello/cli        Commander CLI over the daemon's WS API.
                    Depends on @echohello/protocol + @echohello/client.
@echohello/web        Vite 8 + React 19 + Tailwind 4 + Pretext renderer.
                    Also serves as the PWA. Depends on @echohello/protocol + @echohello/client.
@echohello/desktop    Electron 41 shell that spawns and supervises the daemon.
                    Depends on @echohello/server + @echohello/web.
@echohello/app        Expo 54 + RN 0.81 mobile renderer.
                    Depends on @echohello/protocol + @echohello/client.
@echohello/relay      (post-MVP) tweetnacl-box E2E relay.
                    Depends on @echohello/protocol.
```

The dependency direction is strictly downward. Never import backwards — if you find yourself needing to import `@echohello/web` from `@echohello/server`, you have a design problem.

## Run-time topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User's machine                                │
│                                                                       │
│  ┌────────────────────────────┐    ┌────────────────────────────────┐ │
│  │  @echohello/desktop          │    │  @echohello/app (mobile)         │ │
│  │  Electron 41 shell         │    │  Expo 54 / RN 0.81            │ │
│  │  spawns + supervises       │    │  connects via relay          │ │
│  │  the daemon                │    │                                │ │
│  │  hosts @echohello/web        │    │                                │ │
│  └────────────┬───────────────┘    └────────────────┬───────────────┘ │
│               │                                       │                │
│               │ (direct WS)                           │ (relay WS)     │
│               ▼                                       ▼                │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │                  @echohello/server (daemon)                       │   │
│  │  Express 5 + ws 8 + Pino                                         │   │
│  │  agent-manager {opencode, claude, cursor-acp, ...}              │   │
│  │  worktree-service, project-registry, chat                       │   │
│  └─────────────────────────────────────┬──────────────────────────┘   │
│                                        │                              │
│                                        │ spawns + supervises          │
│                                        ▼                              │
│                       agent CLIs (claude, codex, opencode, ...)        │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                  @echohello/web (browser)                         │  │
│  │  Vite 8 + React 19 + Tailwind 4 + Pretext                       │  │
│  │  PWA installable, also reachable via relay                     │  │
│  └────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘

                            (zero inbound ports)

                              ┌───────────────┐
                              │ relay.supaplane │
                              │  .run:443     │   ← sees only ciphertext
                              │  (post-MVP)   │
                              └───────────────┘
```

## Build order

```
protocol  →  client  →  server-deps  →  server  →  web  →  desktop
                                                       │
                                                       →  app (via client)
```

`@echohello/protocol` builds first (no deps). `@echohello/client` depends on `@echohello/protocol`. `@echohello/server` depends on both. `@echohello/web` and `@echohello/app` depend on the client + protocol. `@echohello/desktop` depends on the server (to spawn it) and `@echohello/web` (to load it inside Electron).

## Reference

- `docs/onboarding-relay.md` — pairing, QR, relay, settings sync
- `docs/providers.md` — agent runtime integrations
