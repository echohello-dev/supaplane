# Development

How to work on Supaplane day-to-day.

## Toolchain

```bash
mise install      # installs node 22.23 + bun 1.3.14
bun install       # installs all workspace deps
```

Both are pinned in `mise.toml`. Use `mise run <task>` for the convenience wrappers, or `bun run <script>` directly from the root.

## Build

```bash
# Full build (protocol → client → server-deps → server → web → desktop)
bun run build

# Just protocol + client (fast iteration on the wire types)
bun run build:client

# Watch a single package
bun run watch:server
```

## Type-check

```bash
bun run typecheck
```

Uses `@typescript/native-preview` (tsgo) for fast native type-checking.

## Lint + format

```bash
bun run lint         # oxlint
bun run lint:fix     # auto-fix
bun run format       # oxfmt write
bun run format:check # CI check (no write)
```

Both are enforced on commit via lefthook (`.lefthook.yml`).

## Test

```bash
bun test             # vitest across all workspaces
bun run knip         # dead-code detection
```

## Dev loops

```bash
# Run the daemon in dev mode (auto-reload on src/ changes)
mise run dev:daemon

# Run the web renderer (Vite HMR on http://127.0.0.1:5179)
mise run dev:web

# Run the desktop shell (Electron + the running daemon)
mise run dev:desktop

# All three concurrently
mise run dev:all
```

The Vite dev server proxies `/api` and `/ws` to `http://127.0.0.1:17687` (the daemon). The desktop shell expects the daemon to be running separately. Default ports avoid conflicts with Paseo (6767), Vite default (5173), Metro/Expo (8081, 19000), and other well-known dev tools.

## Day-to-day workflow

1. Make a change in a package (e.g. `packages/server/src/handshake.ts`).
2. `bun run watch:server` for type-check feedback.
3. Restart the daemon (`mise run dev:daemon`) — `--watch` reloads on save.
4. Run tests in that package: `bun test --cwd packages/server`.
5. Commit. Lefthook runs format + lint + typecheck on staged files.

## Adding a new package

1. `mkdir packages/foo`
2. Add `package.json` (private, `"type": "module"`).
3. Add `tsconfig.json` extending `../../tsconfig.base.json`, with references to the packages it depends on.
4. Add `tsconfig.typecheck.json` with `"noEmit": true`.
5. Add `src/index.ts` as the entry.
6. Add `packages/foo` to the root `package.json` `workspaces` array (auto-picked-up by Bun glob, but explicit is clearer).
7. Add `docs/<concern>.md` describing the package.

## Adding a new provider

1. Create `packages/server/src/server/agent/providers/<id>/agent.ts` implementing `AgentClient`.
2. Register in `packages/server/src/server/agent/provider-registry.ts`'s `PROVIDER_CLIENT_FACTORIES` map.
3. Add the provider id to `BUILTIN_PROVIDER_IDS` in `packages/protocol/src/provider-manifest.ts`.
4. Declare default modes/models in `packages/protocol/src/provider-manifest.ts`.
5. Add a `getDiagnostic()` probe so the onboarding wizard can show status.
6. Document in `docs/providers.md`.

## Reference

- `AGENTS.md` — operating manual for AI agents
- `docs/architecture.md`
- `docs/onboarding-relay.md`
- `docs/providers.md`
