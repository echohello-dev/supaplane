# `.agents/skills/`

Auto-installed (machine-local) copies of third-party agent skills, in the same
`SKILL.md` shape as the root `skills/` tree.

## Why this exists

Tools like opencode, Claude Code, Codex, and lefthook-installed hooks may drop
agent skills into this directory. Keeping every skill — curated or auto-installed
— in the same shape (a directory with a `SKILL.md` per skill) means:

- Every skill is machine-parseable the same way (frontmatter `name` + `description`).
- Skills can be referenced uniformly from documentation, CI, and AI agents.
- The gitignore doesn't have to blanket-ignore the whole `.agents/` tree —
  only caches/`node_modules`/dist inside per-skill subdirs.

## What goes here

| Source                                                                  | Convention                               |
| ----------------------------------------------------------------------- | ---------------------------------------- |
| Tool auto-installed (e.g. `impeccable`, `github-clone`, vendor plugins) | `<tool-name>/` or just `<skill-name>/`   |
| Supaplane-authored, machine-only                                          | `<skill-name>/` (same as root `skills/`) |

## What does NOT go here

Supaplane's curated, published skills (the ones discoverable via
`npx skills add echohello-dev/supaplane`) belong in the **root** `skills/`
tree. See `../../skills/supaplane/SKILL.md` for the worked example.

## Skills convention

Each skill is a directory with:

```
.agents/skills/<skill-name>/
├── SKILL.md              # YAML frontmatter (name, description) + body
├── scripts/              # optional; executable helpers
├── reference/            # optional; reference documents
└── README.md             # optional; human-readable notes
```

`SKILL.md` frontmatter:

```yaml
---
name: <skill-name>
description: <one-line trigger description — what it does and when to use it>
---
```

## Caches / build artifacts

`node_modules/`, `.cache/`, `dist/`, logs, and `.DS_Store` inside any
skill subdirectory are still ignored. See the root `.gitignore` for the
scoped patterns.

## Reference

- `../../skills/supaplane/SKILL.md` — the Supaplane daemon skill, for comparison.
- `../../AGENTS.md` — operating manual.
- Root convention reference: Paseo / open-source `skills/` README conventions.
