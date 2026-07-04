# AGENTS.md — Operating manual for AI coding agents working on Supaplane

## What this project is

Supaplane is a local-first, multi-surface coding-agent workbench. A single supervised daemon (`@echohello/server`) owns agent lifecycle, worktree management, and remote access. Three renderers consume the daemon over WebSocket: `@echohello/web` (desktop + PWA, Vite + React), `@echohello/desktop` (Electron shell), `@echohello/app` (Expo + React Native, mobile).

The architectural decisions are documented in `docs/` — read them before making non-trivial changes:

- `docs/architecture.md` — overall architecture, package boundaries, build order
- `docs/onboarding-relay.md` — pairing, relay, settings sync model
- `docs/providers.md` — agent runtime integrations (OpenCode, Claude Code, Cursor, MCP)

If you need to know _why_ a decision was made, the build-research notes in the operator's Obsidian vault (`/Users/johnny/projects/github.com/johnnyhuy/one-obsidian/Notes/2026-06-26 - Spanner*.md`) contain the full reasoning.

## Build / dev commands

```bash
mise install          # node 22.23 + bun 1.3.14
bun install           # install all workspaces
bun run build         # full build (protocol → client → server-deps → server → web → desktop)
bun run typecheck     # tsgo over all workspaces
bun run lint          # oxlint
bun run format        # oxfmt
bun test              # vitest tests across all packages

# Dev loops
mise run dev:daemon   # daemon only
mise run dev:web      # Vite renderer
mise run dev:desktop  # Electron shell (requires daemon running)
mise run dev:all      # all three concurrently
```

## Package layout & dependency direction

```
protocol   ← client ← server ← cli, web, desktop, app
                      ↑
                     relay (post-MVP)
```

- `@echohello/protocol` has zero deps on other packages. It owns Zod schemas and binary frame codecs.
- `@echohello/client` depends on `@echohello/protocol`. It owns the WS driver.
- `@echohello/server` depends on `@echohello/protocol` + `@echohello/client`. It owns the daemon.
- `@echohello/cli` depends on `@echohello/protocol` + `@echohello/client`. It is a thin CLI over the daemon's WS API.
- `@echohello/web` depends on `@echohello/protocol` + `@echohello/client`. It is the Vite + React renderer.
- `@echohello/desktop` depends on `@echohello/server` + `@echohello/web`. It is the Electron shell that supervises the daemon.
- `@echohello/app` depends on `@echohello/protocol` + `@echohello/client`. It is the Expo + RN mobile renderer.
- `@echohello/relay` (post-MVP) depends on `@echohello/protocol`. It is the relay server + client SDK for E2E-encrypted remote access.

Never import backwards — if you find yourself needing to import `@echohello/web` from `@echohello/server`, you have a design problem.

## Style & conventions

- **TypeScript:** `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. ESM (`"type": "module"`).
- **Runtime:** Node 22 LTS, Bun for package management + scripts, tsgo (native TypeScript) for type checking, tsc for emits.
- **Logging:** Pino + pino-pretty. Child loggers with `{module: "..."}`. Structured fields over message templating.
- **Validation:** Zod for all wire types. Define schemas once in `@echohello/protocol`, derive types with `z.infer<typeof Schema>`. Never use `any`; reach for `unknown` + Zod parse at boundaries.
- **Errors:** Custom error classes per layer (e.g. `DaemonError`, `AgentError`, `ProviderError`). Never throw plain `Error`.
- **Async:** `async`/`await` only. No raw `.then()` chains outside of event handlers.
- **Naming:** `camelCase` for variables/functions, `PascalCase` for types/classes, `SCREAMING_SNAKE_CASE` for constants, `kebab-case` for filenames.
- **Comments:** Code comments only when the intent isn't obvious from reading the code. No banner comments.
- **Pretext:** Used in the web renderer for long-transcript performance. NOT a replacement for any renderer — sits under the React tree as a measurement primitive.
- **CodeMirror 6:** Used in the web renderer's file editor pane. Different concern from Pretext.
- **Do NOT use OAuth.** Do NOT roll crypto. Do NOT manage API keys for agent CLIs — each agent reads its own creds.

## Testing

- Vitest across all packages.
- Test files colocated: `*.test.ts` next to source.
- E2E tests for the daemon under `packages/server/src/server/daemon-e2e/`.
- Playwright for web E2E (post-MVP).

## Git

- Branch from `main`. Conventional commits (release-please manages versions).
- PRs target `main`. CI runs typecheck + lint + test.
- Never commit `.env`, `dist/`, `node_modules/`, `*.log`, `daemon-keypair.json`, `server-id`.

## Skill system

Supaplane ships agent skills in two locations, both using the Paseo/Supaplane `SKILL.md` convention:

| Location                         | Audience                                                                                                              | Installed via                                  | Tracked?                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------- |
| `skills/<name>/SKILL.md` (root)  | **External** users — published for the world to install                                                               | `npx skills add echohello-dev/supaplane`         | ✅ committed                                  |
| `.agents/skills/<name>/SKILL.md` | **Internal** — auto-installed machine-local copies of third-party skills (e.g. `impeccable`, vendor-specific tooling) | Tool hooks (lefthook, opencode, claude, codex) | ✅ committed, with scoped `.gitignore` inside |

The `.agents/skills/` convention keeps every skill in the same shape regardless of which tool installed it, so the same `SKILL.md` frontmatter (name + description) is machine-parseable everywhere. **Do not blanket-ignore `.agents/`** — only ignore caches/`node_modules`/dist inside the per-skill subdirs (the gitignore already does this scoped).

When you auto-install a third-party skill, drop it under `.agents/skills/<name>/` with a `SKILL.md` and any scripts/references it needs, then commit. The root `skills/` tree stays curated; the `.agents/skills/` tree is the sink for everything auto-installed.

The skill content teaches an external AI agent how to drive the Supaplane daemon via its MCP server tools (planned post-MVP).
