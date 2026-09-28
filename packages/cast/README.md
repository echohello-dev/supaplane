# @echohello/cast

Procedural, rigged vector passengers: the Supaplane mascots as live SVG. Zero runtime
dependencies; used by the web renderer and marketing surfaces.

```bash
bun run --cwd packages/cast dev    # demo playground on http://127.0.0.1:5182
bun run --cwd packages/cast test   # rig unit tests
```

## How a passenger is drawn

- **Silhouette.** `outline()` builds the body in body-rest units (origin at the bottom centre,
  `-y` up). The default is the _classic_ passenger from the family sheet: a slightly squashed round
  dome, a straight neck and a smooth flare to the belly (`head`, `dome`, `neck`, `bellyAt`). Set
  `head: 0` for the older egg bodies (`topN`, `botN`, `egg`, `dome`).
- **Goo.** Body and legs share one blur/threshold filter so legs fuse into the silhouette. Arms go
  through a second, softer pass with a copy of the body, which rounds the shoulders.
- **Arms.** Two-bone IK chains drawn as thick sausages (`armW`, `armTaper`, `armK` for length).
  The navy crease is an even stroke along the body-facing edge: round-ended at the armpit, curling
  under the tip so it opens into the background. The inner side is chosen once per arm, so folded
  or raised arms never flip it.
- **Springs.** Every pose value (hands, feet, stretch, lean, face) is a damped spring, so actions
  blend with follow-through.
- **Turnaround.** `yaw` (degrees) and `depth` project the rig for three-quarter, profile and back
  views; far-side limbs and props re-stack behind the body.
- **Overlap.** Each passenger draws a halo behind itself. `Stage.setOverlap()` picks `outline`
  (background-coloured line, the brand default, matching the source art), `shadow` or `none`.

## API sketch

```ts
import { PRESETS, Stage, startClock } from "@echohello/cast";

const stage = new Stage(svgElement, { palette: "navy", overlap: "outline" });
const pip = stage.add({ ...PRESETS.classic }, { x: 200, ground: 300 });
pip.play("wave");
startClock();
```

Actions: idle, walk, run, hop, wave, cheer, jump, dance, love, shy, think, sad, surprised, scared,
grumpy, sleepy, laugh, dizzy, throw (needs the plane prop). Props: case, plane, balloon, coffee,
backpack, passport. Hats: cap, pilot, shades, beanie. Palettes: navy, cream, bronze, charcoal,
sky, dusk.

The demo exposes `?clean=family|turnaround|parade|lab&ratio=16:9&palette=navy&overlap=outline` for
bare embeds, and `&fixed=1` adds `window.__castStep(dt)` for deterministic frame capture.
