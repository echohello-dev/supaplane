# Brand

Public-facing brand assets for [Supaplane](https://github.com/supaplane/supaplane) — the local-first, multi-surface coding-agent workbench. This directory is the source of truth for how the project presents itself outside the codebase: in the GitHub repo header, on the website, in docs, on social media, and in app store listings.

The **in-app** visual system (the Fold design language, surface tokens, motion timings) lives separately in [`docs/design.md`](../docs/design.md) and [`docs/fold-tokens.css`](../docs/fold-tokens.css). When the two overlap — for example the colour palette or iconography — the brand layer is the public-facing abstraction, and the design system layer is the implementation inside the renderers.

![Cover overview](cover/cover-overview.png)

*Cover lockup, brand field, and the four brand palettes (Paper 100, Signal, Crash, Fly).*

## Contents

```
brand/
├── BRAND.md                   # this file
├── cover/
│   └── cover-overview.png     # 1440×900 visual reference of the lockup
└── mark/
    ├── brand-mark-on-light.svg   # dark mark, for paper surfaces (#2C2C2C fill)
    └── brand-mark-on-dark.svg    # cream mark, for dark surfaces (#EDE3C4 fill)
```

The full kit also includes naked-mark variants (×4), tile variants (×5 at 100×100, ×5 at 512×512), iOS app icon colourways (×12 at 1024×1024), and wordmark variants (×12). Those will land in this directory in a follow-up PR once the colour palette is locked to canonical hex values in the design system.

## Mark

The mark is a stylised paper plane / supine arrowhead — drawn from the apex of a triangle out into two trailing vector tails. The stroke is a single closed path; no gradients, no strokes, no fills other than the silhouette.

### Variants

| File | When to use | Fill |
| --- | --- | --- |
| [`brand/mark/brand-mark-on-light.svg`](mark/brand-mark-on-light.svg) | Paper / light surfaces (Paper 100, white cards, light app chrome) | `#2C2C2C` |
| [`brand/mark/brand-mark-on-dark.svg`](mark/brand-mark-on-dark.svg) | Dark surfaces (Signal palette, dark app chrome, dark docs) | `#EDE3C4` |

**Do not** recolour the mark outside of these two variants without raising an issue first. The silhouette is the brand; the colour is contextual.

### Minimum sizes

- **Print**: 12 mm
- **Screen**: 24 px
- **Favicon / iOS icon**: 16 px is fine because the silhouette stays legible — the inner curves do not collapse until ~12 px

### Clear space

Reserve a margin equal to **one half of the mark's bounding-box width** on every side. No other element — text, image, edge of canvas — should enter that margin.

### Don'ts

- Don't rotate the mark.
- Don't apply a gradient, drop shadow, outer glow, or 3D effect.
- Don't outline the silhouette or fill it with a stroke.
- Don't place the cream variant on paper, or the dark variant on Signal/Supaplane `bg`. They wash out at every size we've tested.
- Don't animate the silhouette (no morphs, no parallax). The cover lockup may have a single subtle motion — anything beyond that loses recognisability fast.

## Cover lockup

The cover lockup is the canonical wordmark + mark combination used in the GitHub repo header, README hero, and the public website. The lockup uses the dark mark on a Paper 100 background by default; the wordmark is set in the typeface chosen by the design system (see [`docs/design.md`](../docs/design.md)).

The lockup uses a centred mark above a wordmark and a one-line surface-metadata strip beneath. The layout proportions are:

```
        ┌──────────────────────────────────┐
        │           mark (square)          │
        │                                  │
        │          wordmark (wide)         │
        │                                  │
        │   surface metadata (caption)     │
        └──────────────────────────────────┘
```

Reserve **two mark-widths** of vertical space between the mark and the wordmark, and **one mark-width** between the wordmark and the caption. The lockup is left-aligned within its container.

## Brand palettes

The brand ships four named palettes, each pairing a base surface with a complementary accent. They are designed for public-facing surfaces and do not overlap with the in-app semantic tokens.

| Palette | Surface | Accent | Use |
| --- | --- | --- | --- |
| **Paper 100** | Near-white (#F5F5F0 family) | Supaplane bg | Default brand surface — GitHub banner, docs cover, README hero |
| **Signal** | Supaplane bg | Cream wordmark | Dark brand surface — website hero, social cards, conference slides |
| **Crash** | Emerald 950 | Amber 400 accent | Status / launch announcements — limited use |
| **Fly** | Sky 400 | Cream accent | Promotional / feature reveals — limited use |

The semantic palette underneath is shared with the in-app design system. See [`docs/design.md`](../docs/design.md) for the canonical token names once it lands.

## Colour tokens

This section mirrors the tokens used inside the renderers so brand and product stay aligned. Hex values are locked in the design system; this table is the index, not the source of truth.

### Primitives

| Group | Tokens |
| --- | --- |
| `supaplane` | `bg`, `surface` |
| `neutral` | `200`, `300`, `400`, `500`, `600`, `700`, `800`, `800-40`, `900`, `950` |
| `white` | `1000` |
| `purple` | `500`, `700` |
| `red` | `200`, `950` |
| `emerald` | `200`, `400`, `950` |
| `amber` | `400` |
| `sky` | `400` |

### Semantic

| Group | Tokens |
| --- | --- |
| `color/bg` | `app`, `surface`, `input`, `subtle`, `accent`, `accent-hover`, `error`, `success`, `workspace-hover` |
| `color/text` | `primary`, `secondary`, `tertiary`, `muted`, `on-accent`, `error`, `success` |
| `color/border` | `default`, `strong`, `subtle` |
| `color/icon` | `default` |
| `color/status` | `active`, `blocked`, `done` |

## Voice

Brand copy is direct, technical, and assumes the reader can read code. Avoid hype, avoid exclamation marks, avoid "excited to announce". When something ships, say what it is, what it replaced, and what it doesn't yet do.

See [`../AGENTS.md`](../AGENTS.md) for tone rules inside the repo. The same rules apply here.

## Source of truth

- **Figma file**: `1NrT8IG0Td40yzapRGVwPY/Supaplane` (Cover page → Mark + Wordmark + Tile variants + Colours)
- **Source PR**: see the brand kit ship PR linked from the most recent weekly wrap (search `Weekly Notes/` for "brand kit")
- **Updates**: any change to a colour, wordmark, or layout rule requires an ADR or a wrap note entry. Don't drift silently.

## See also

- [`../AGENTS.md`](../AGENTS.md) — repo operating manual
- [`../docs/architecture.md`](../docs/architecture.md) — Supaplane architecture
- [`../docs/design.md`](../docs/design.md) — in-app Fold design system (when it lands)
