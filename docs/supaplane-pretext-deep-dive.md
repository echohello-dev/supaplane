# Pretext Deep-Dive for Supaplane

## What Pretext Actually Is

[Pretext](https://github.com/chenglou/pretext) (~39K GitHub stars, MIT, ~15KB gzipped, zero dependencies) is a pure TypeScript library that measures multiline text dimensions without touching the DOM. Created by Cheng Lou (ex-Meta React Core team, now Midjourney). The core insight: split text measurement into a one-time **prepare** phase (uses Canvas to measure segment widths) and an ultra-cheap **layout** phase (pure arithmetic over cached widths).

It is **not** a rendering engine. It returns layout data — heights, line counts, line text slices — and leaves rendering entirely to the caller. This means it works with DOM, Canvas, SVG, WebGL, or any other rendering target.

## Install

```sh
npm install @chenglou/pretext
```

Package name is `@chenglou/pretext`. The npm registry has it under this scoped name; some blog posts use `pretext` as shorthand but the real import path is `@chenglou/pretext`.

##Core API

Pretext serves two use cases. Both matter for Supaplane.

### Use case 1: Measure a paragraph's height without the DOM

```ts
import { prepare, layout } from '@chenglou/pretext'

// One-time preparation: analyze + measure
const prepared = prepare('hello world this is some long text...', '14px Inter')

// Ultra-cheap hot path: pure arithmetic, no DOM, no reflow
const { height, lineCount } = layout(prepared, containerWidth, lineHeight)
```

- `prepare(text, font)` does normalization, Intl.Segmenter segmentation, glue rules, and canvas-based width measurement. Returns an opaque `PreparedText` handle.
- `layout(prepared, maxWidth, lineHeight)` walks cached widths, inserts breaks, returns `{ height, lineCount }`. **Pure arithmetic.**
- You call `prepare` once per text+font pair. You call `layout` any number of times at different widths.
- Options: `{ whiteSpace: 'pre-wrap' }` for textarea-like text (preserves spaces, tabs, hard breaks), `{ wordBreak: 'keep-all' }` for CJK/Hangul.

### Use case 2: Lay out paragraph lines yourself

```ts
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'

const prepared = prepareWithSegments('some text...', '14px Inter')
const { lines } = layoutWithLines(prepared, 320, 20)

for (let i = 0; i < lines.length; i++) {
  console.log(lines[i].text, lines[i].width) // actual text and pixel width per line
}
```

For variable-width layouts (text flowing around obstacles, shrinkwrap):

```ts
import { layoutNextLineRange, materializeLineRange } from '@chenglou/pretext'

let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
while (true) {
  const width = computeWidthAtY(currentY) // width can change per line
  const range = layoutNextLineRange(prepared, cursor, width)
  if (range === null) break

  const line = materializeLineRange(prepared, range)
  // render line.text at currentY
  cursor = range.end
}
```

### Shrinkwrap: find the narrowest container width

This is a capability CSS does **not** have. It's useful for session cards, tool output, and status labels.

```ts
import { walkLineRanges } from '@chenglou/pretext'

let maxW = 0
walkLineRanges(prepared, 320, (line) => {
  if (line.width > maxW) maxW = line.width
})
// maxW is now the widest line = narrowest container that still fits
```

`walkLineRanges` is the non-materializing counterpart to `layoutWithLines` — it skips building line text strings, so it's cheap to call repeatedly during binary search over candidate widths.

Other helpers:

```ts
measureLineStats(prepared, width)    // → { lineCount, maxLineWidth }
measureNaturalWidth(prepared)        // → widest forced line (hard breaks still count)
clearCache()                         // releases accumulated font measurements
```

## The Two-Phase Architecture

```
Phase 1: prepare()  →  Canvas API  →  segment width cache  →  ~19ms for 500 words (once)
Phase 2: layout()   →  arithmetic   →  height + lineCount    →  ~0.0002ms per call
```

The speed comes from what layout() **avoids**: no DOM reads, no getBoundingClientRect, no offsetHeight, no reflow. Every layout() call after prepare() walks an array of pre-measured segment widths and does integer arithmetic.

## Accuracy

Pretext validates against real browser DOM layout. Checked-in accuracy snapshots show:

| Browser | Correct / Total |
|---|---|
| Chrome | 7680 / 7680 |
| Safari | 7680 / 7680 |
| Firefox | 7680 / 7680 |

It targets `white-space: normal`, `word-break: normal`, `overflow-wrap: break-word`, `line-break: auto`. The line-breaking algorithm was refined through iterative automated browser testing — write logic, test against real browsers, compare, repeat.

## How It Measures Text Without the DOM

Pretext uses `canvas.measureText()`. The Canvas font engine is the same HarfBuzz-based engine the browser uses to lay out DOM text. Canvas does **not** trigger layout reflow — it uses the font engine directly.

Font context order of preference:
1. `OffscreenCanvas` (works in Web Workers — allows measurement off main thread)
2. `document.createElement('canvas')` (standard browser environment)

For server-side rendering: Pretext works with `node-canvas` or `@napi-rs/canvas` to get the Canvas font engine in Node.js. SSR support is still on the roadmap.

### Critical: fonts must be loaded before `prepare()`

Pretext does **not** wait for fonts. If web fonts haven't loaded when `prepare()` runs, measurements will be wrong because the Canvas font engine falls back to whatever is available. You must ensure fonts are loaded before calling `prepare()`. In Electron, this should not be a problem because you ship fonts with the app.

## Rich Inline Helper

For mixing multiple fonts/styles in a single line (code spans, mentions, chips, link labels):

```ts
import { prepareRichInline, walkRichInlineLineRanges, materializeRichInlineLineRange } from '@chenglou/pretext/rich-inline'

const prepared = prepareRichInline([
  { text: 'Fix ', font: '500 14px Inter' },
  { text: '#123', font: '600 13px JetBrains Mono', break: 'never', extraWidth: 16 },
  { text: ' in api handler', font: '500 14px Inter' },
])

walkRichInlineLineRanges(prepared, 320, (range) => {
  const line = materializeRichInlineLineRange(prepared, range)
  // line.fragments[i] has itemIndex, text, occupiedWidth, start/end cursors
})
```

Designed to be narrow: `white-space: normal` only, caller-owned extraWidth for pill/button chrome, `break: 'never'` for atomic items. Not a general CSS inline formatting engine.

## Performance Numbers (From Source)

| Metric | Value |
|---|---|
| prepare() per 500-word batch | ~19ms |
| layout() per call | ~0.0002ms |
| Speedup vs DOM measurement | ~600× |
| Bundle size | ~15KB gzipped |
| Dependencies | Zero |

### When to call prepare()

- When content changes (new text, different string)
- When font properties change (family, size, weight, style)
- On application initialization

### When NOT to call prepare()

- When container width changes (call `layout()` instead)
- On every render frame
- Inside a React render function

## Caveats That Matter for Supaplane

1. **Font loading**: Fonts must be loaded before `prepare()`. Not a problem in Electron since you ship fonts locally.

2. **`system-ui` is unsafe on macOS** for layout() accuracy. Use a named font. Supaplane should bundle Inter and JetBrains Mono.

3. **Not a bidi layout engine**. Segment widths are canvas widths for line breaking only. Not precise enough for custom Arabic or mixed-direction text reconstruction. Adequate for most coding-tool UI.

4. **Canvas Text API limitations**: Some advanced font features (alternate glyphs, OpenType layout tables) may not be reflected in canvas measurements. Simple UI text (code, labels, summaries) won't be affected.

5. **No rendering output**: Pretext returns layout data only. You must render it yourself. This is actually a design feature, not a limitation — it works with any rendering target.

6. **Version note**: The API changed significantly between early 2026 previews and the current npm release. The current API uses: `prepare(text, font)` returning opaque handle, `layout(prepared, maxWidth, lineHeight)` with `lineHeight` as a layout-time input (not in prepare).

## Where Pretext Fits in Supaplane

### High-impact areas

| UI Surface | What Pretext Does | Why It Matters |
|---|---|---|
| **Session timeline** | Precompute card heights for virtualized list | Thousands of messages over long sessions; avoid per-message DOM measurement |
| **Workspace summaries** | Measure variable-length status text | Workspace list updates frequently (branch changes, dirty state); keep rows lightweight |
| **Diff previews** | Size file-change cards, per-file summaries | Diffs generate lots of variable-length text; keep preview fast even with many files |
| **Tool output cards** | Measure edit/write/bash output text | Tool results can be any length; stable card sizing prevents layout shift |
| **Search results** | Measure long labels and snippets | Search over sessions produces variable-length text; virtualized list needs cheap height estimation |
| **Status labels** | Shrinkwrap branch, commit, task labels | One-line labels should be exact width without DOM measurement |

### Lower-impact areas (don't bother)

- Single-line inputs, buttons, static labels
- Fixed-height UI elements
- Charts, graphs, or non-text content
- Any text that is already rendered by the browser and32on't need pre-measurement

### Practical integration pattern

```ts
// In the renderer: a memoized view-model layer
const workspacePretextCache = new Map<string, PreparedText>()

function getPrepared(text: string, font: string): PreparedText {
  const key = `${text}|${font}`
  if (!workspacePretextCache.has(key)) {
    workspacePretextCache.set(key, prepare(text, font))
  }
  return workspacePretextCache.get(key)!
}

function computeWorkspaceCardHeight(
  summary: string,
  branchLabel: string,
  containerWidth: number
): number {
  const summaryPrepared = getPrepared(summary, '13px Inter')
  const branchPrepared = getPrepared(branchLabel, '12px JetBrains Mono')

  const summaryHeight = layout(summaryPrepared, containerWidth - padding, lineHeight).height
  const branchHeight = layout(branchPrepared, containerWidth - padding, lineHeight).height

  return totalCardChrome + summaryHeight + branchHeight + gap
}
```

Key point: **this lives in a view-model layer, not in React render**. Computed once when data changes, cached, and consumed by the virtual list for stable positioning.

### What Pretext should NOT replace

- Stream token management (use a streaming buffer)
- Virtual list library (use react-window, react-virtuoso, or equivalent)
- React state management
- Git/diff logic (keep in main process)
- IPC events (keep typed and minimal)

## Decision: Why Pretext Over DOM Measurement

| Approach | Prepare cost | Per-item layout | Triggers reflow | Works in workers | Accuracy |
|---|---|---|---|---|---|
| **Pretext** | ~19ms (once) | ~0.0002ms | No | Yes (OffscreenCanvas) | Validated 7680/7680 |
| DOM `getBoundingClientRect` | ~0ms (skip prepare) | ~1ms+ | Yes | No | Ground truth (but slow) |
| Heuristic/guesswork | ~0ms | ~0ms | No | N/A | Unreliable (causes jank) |

For Supaplane's workload (thousands of messages, dozens of workspaces, frequent updates), the one-time prepare cost pays off immediately. The alternative — repeated DOM reads on scroll, resize, or data update — compounds into the exact kind of lag that Supaplane is trying to eliminate.

## What Pretext Enables That CSS Can't

Pretext uniquely enables **shrinkwrap text measurement**: finding the minimum container width that fits a paragraph without changing line count. CSS has `fit-content` which gives the widest line's width, but no equivalent for "find the narrowest width that still produces exactly N lines". Pretext's `walkLineRanges()` + binary search gives you this in pure arithmetic.

In Supaplane, this means:
- Workspace status cards that size to content without wasted space
- Tool output cards that fit text exactly, even with variable-length content
- Balanced text layout for session summaries
- Multiline "shrinkwrap" that has been missing from the web

## Recommended Implementation Order for Supaplane

1. Session timeline cards (most text, most updates)
2. Workspace summary list
3. Diff file-change previews
4. Tool output cards
5. Search result snippets
6. Status labels and badges