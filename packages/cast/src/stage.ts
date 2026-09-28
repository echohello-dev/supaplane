import { fmt, ss, FX_SHAPES, type Pt } from "./geometry.js";
import { HALO, Passenger, type PassengerOpts, type Pose } from "./passenger.js";
import { resolvePalette, type Palette, type PaletteName } from "./palettes.js";
import { rng, type PassengerParams } from "./params.js";

const NS = "http://www.w3.org/2000/svg";

/**
 * How overlapping passengers separate: an outline in the background colour (the brand default,
 * matching the source art), an offset darker shadow, or nothing.
 */
export type OverlapMode = "outline" | "shadow" | "none";

export interface StageOpts {
  seed?: number;
  overlap?: OverlapMode;
  palette?: PaletteName | string;
  grain?: boolean;
  wrap?: (c: Passenger) => void;
}

export interface Link {
  a: Passenger;
  ai: number;
  b: Passenger;
  bi: number;
  off?: boolean;
  held?: number;
}

interface FxParticle {
  el: SVGElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  s: number;
  type: string;
  rot: number;
}

export class Stage {
  static all: Stage[] = [];

  svg: SVGSVGElement;
  chars: Passenger[] = [];
  links: Link[] = [];
  fx: FxParticle[] = [];
  rig = false;
  paused = false;
  speed = 1;
  palette: string;
  overlap: OverlapMode;
  vb: [number, number, number, number] = [0, 0, 0, 0];
  pointer: Pt | null = null;
  pointerT = 0;
  label = "";
  deco: SVGGElement;
  world: SVGGElement;
  private rand: () => number;
  private wrap?: (c: Passenger) => void;
  private style: SVGStyleElement;
  private fxg: SVGGElement;
  private gid: string;

  constructor(svg: SVGSVGElement, opts: StageOpts = {}) {
    this.svg = svg;
    this.palette = opts.palette ?? "navy";
    this.overlap = opts.overlap ?? "outline";
    this.rand = opts.seed != null ? rng(opts.seed) : rng(7);
    if (opts.wrap) this.wrap = opts.wrap;
    svg.classList.add("cast");
    const gid = `goo${++UID}`;
    const grain = `grain${UID}`;
    svg.innerHTML = `<defs><filter id="${gid}" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2.3"/><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 24 -11"/></filter>
      <filter id="${gid}s" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation="5.5"/><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 20 -9"/></filter>
      <filter id="${grain}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 -.18"/></filter></defs>
      <style></style><rect class="bg"/><g class="deco"></g><g class="world"></g><g class="fx"></g><rect class="grain" filter="url(#${grain})"/>`;
    this.style = svg.querySelector("style") as unknown as SVGStyleElement;
    this.world = svg.querySelector(".world") as SVGGElement;
    this.fxg = svg.querySelector(".fx") as SVGGElement;
    this.deco = svg.querySelector(".deco") as SVGGElement;
    this.gid = gid;
    this.fit();
    this.setPalette(this.palette);
    this.setGrain(opts.grain ?? true);
    svg.addEventListener("pointermove", (ev) => {
      this.pointer = this.toLocal(ev as PointerEvent);
      this.pointerT = Date.now();
    });
    svg.addEventListener("pointerleave", () => {
      this.pointer = null;
    });
    Stage.all.push(this);
  }

  toLocal(ev: { clientX: number; clientY: number }): Pt | null {
    const m = this.svg.getScreenCTM();
    if (!m) return null;
    const q = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
    return [q.x, q.y];
  }

  setPalette(id: string): void {
    const c = resolvePalette(id);
    this.palette = id;
    this.style.textContent = haloCss(this.overlap, c) + paletteCss(this.gid, c);
    this.svg.style.background = c.bg;
  }

  setOverlap(mode: OverlapMode): void {
    this.overlap = mode;
    this.setPalette(this.palette);
  }

  fit(vb?: number[]): void {
    if (vb) this.svg.setAttribute("viewBox", vb.join(" "));
    const raw = this.svg.getAttribute("viewBox") ?? "0 0 100 100";
    const [x, y, w, h] = raw.split(/\s+/).map(Number) as [number, number, number, number];
    for (const r of this.svg.querySelectorAll(":scope>.bg,:scope>.grain")) {
      r.setAttribute("x", String(x));
      r.setAttribute("y", String(y));
      r.setAttribute("width", String(w));
      r.setAttribute("height", String(h));
    }
    this.vb = [x, y, w, h];
  }

  hit(q: Pt): Passenger | null {
    let best: Passenger | null = null;
    let bd = 1e9;
    for (const c of this.chars) {
      const cy = c.G - (c.p.h / 2 + c.p.legLen) * c.p.scale;
      const d = Math.hypot(q[0] - c.X, (q[1] - cy) * 0.7);
      if (d < bd && d < c.p.w * c.p.scale * 0.9) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  setGrain(on: boolean): void {
    (this.svg.querySelector(".grain") as SVGElement).style.display = on ? "" : "none";
  }

  add(
    params: PassengerParams | Partial<PassengerParams> | Passenger,
    opts: PassengerOpts = {},
  ): Passenger {
    const c = params instanceof Passenger ? params : new Passenger(params, opts);
    this.chars.push(c);
    this.world.appendChild(c.el);
    return c;
  }

  clear(): void {
    for (const c of this.chars) c.el.remove();
    this.chars = [];
    this.links = [];
    for (const q of this.fx) q.el.remove();
    this.fx = [];
  }

  link(a: Passenger, ai: number, b: Passenger, bi: number): void {
    this.links.push({ a, ai, b, bi });
  }

  step(dt: number, t: number): void {
    if (this.paused) return;
    dt *= this.speed;
    const look = this.pointer && Date.now() - this.pointerT < 4000 ? this.pointer : null;
    for (const c of this.chars) {
      c.lookAt = look;
      c.step(dt, t);
      if (this.wrap) this.wrap(c);
    }
    const poses = this.chars.map((c) => c.pose());
    // hand-holding: meet halfway (world space), then back to each char's local space
    for (const L of this.links) {
      const ia = this.chars.indexOf(L.a);
      const ib = this.chars.indexOf(L.b);
      if (ia < 0 || ib < 0 || L.off) continue;
      const pa = poses[ia];
      const pb = poses[ib];
      if (!pa || !pb) continue;
      const wa = this.w(L.a, pa.hands[L.ai] ?? [0, 0]);
      const wb = this.w(L.b, pb.hands[L.bi] ?? [0, 0]);
      const Sa = this.w(L.a, pa.shoulders[L.ai] ?? [0, 0]);
      const Sb = this.w(L.b, pb.shoulders[L.bi] ?? [0, 0]);
      const ra = L.a.armL * L.a.p.scale * 1.24;
      const rb = L.b.armL * L.b.p.scale * 1.24;
      const dx = Sb[0] - Sa[0];
      const dy = Sb[1] - Sa[1];
      const d = Math.hypot(dx, dy);
      if (d > ra + rb) {
        L.held = 0;
        continue;
      }
      const k = ra / (ra + rb);
      const sag = (ra + rb - d) * 0.5;
      const sw = ((wa[0] + wb[0]) / 2 - (Sa[0] + dx * k)) * 0.15;
      const mid: Pt = [Sa[0] + dx * k + sw, Sa[1] + dy * k + sag];
      L.held = 1;
      (pa.links ??= [])[L.ai] = this.l(L.a, mid);
      (pb.links ??= [])[L.bi] = this.l(L.b, mid);
    }
    this.chars.forEach((c, i) => {
      const pose = poses[i];
      if (pose) c.render(pose, this.rig);
      for (const b of c.bursts.splice(0)) this.spawn(b.type, this.w(c, [b.x, b.y]), c.p.scale);
    });
    this.stepFx(dt);
  }

  w(c: Passenger, q: Pt): Pt {
    return [c.X + q[0] * c.p.scale, c.G + q[1] * c.p.scale];
  }

  l(c: Passenger, q: Pt): Pt {
    return [(q[0] - c.X) / c.p.scale, (q[1] - c.G) / c.p.scale];
  }

  spawn(type: string, at: Pt, s = 1): void {
    const textish = type === "z" || type === "note" || type === "bang";
    const el = document.createElementNS(NS, textish ? "text" : "path") as SVGElement;
    if (textish) el.textContent = type === "z" ? "z" : type === "note" ? "♪" : "!";
    else el.setAttribute("d", FX_SHAPES[type] ?? FX_SHAPES["spark"] ?? "");
    if (type === "trail") el.setAttribute("class", "trail");
    this.fxg.appendChild(el);
    const r = this.rand;
    const up =
      (
        {
          heart: -40,
          spark: -30,
          z: -26,
          note: -34,
          bang: -10,
          dot: -18,
          puff: -22,
          tear: 60,
          sweat: 50,
          trail: 0,
        } as Record<string, number>
      )[type] ?? -20;
    this.fx.push({
      el,
      x: at[0],
      y: at[1],
      vx: (r() - 0.5) * (type === "spark" ? 90 : 24) + (type === "z" ? 14 : 0),
      vy: up + (type === "spark" ? (r() - 0.8) * 80 : 0),
      life:
        ({ tear: 1.1, sweat: 1, bang: 0.9, trail: 0.6, spark: 0.9 } as Record<string, number>)[
          type
        ] ?? 1.8,
      age: 0,
      s: s * (({ bang: 2.2, z: 1.2, trail: 0.5, puff: 1.2 } as Record<string, number>)[type] ?? 1),
      type,
      rot: (r() - 0.5) * 40,
    });
  }

  stepFx(dt: number): void {
    this.fx = this.fx.filter((q) => {
      q.age += dt;
      const k = q.age / q.life;
      if (k >= 1) {
        q.el.remove();
        return false;
      }
      if (q.type === "tear" || q.type === "sweat") q.vy += 160 * dt;
      q.x +=
        q.vx * dt +
        (q.type === "z" || q.type === "heart" || q.type === "note" ? Math.sin(q.age * 4) * 0.4 : 0);
      q.y += q.vy * dt;
      const sc =
        q.s *
        (q.type === "puff" ? 0.6 + k * 1.4 : q.type === "bang" ? ss(0, 0.15, k) : 1 - k * 0.3) *
        (q.type === "z" ? 0.7 + k * 0.8 : 1);
      q.el.setAttribute(
        "transform",
        `translate(${fmt(q.x)} ${fmt(q.y)}) rotate(${fmt(q.rot * k)}) scale(${fmt(sc * 100) / 100})`,
      );
      q.el.style.opacity = String(
        fmt((1 - ss(0.6, 1, k)) * (q.type === "puff" ? 0.6 : 1) * 100) / 100,
      );
      return true;
    });
  }

  serialize(): string {
    const clone = this.svg.cloneNode(true) as SVGSVGElement;
    for (const n of clone.querySelectorAll(".rigview")) n.remove();
    clone.setAttribute("xmlns", NS);
    return new XMLSerializer().serializeToString(clone);
  }
}

let UID = 0;

export const clock = { t: 0, fixed: false, last: 0, speed: 1 };

export function stepAll(dt: number): void {
  clock.t += dt;
  for (const s of Stage.all) s.step(dt, clock.t);
}

let running = false;

/** Drive every Stage via requestAnimationFrame. Idempotent. */
export function startClock(onFrame?: (t: number) => void): void {
  if (running || typeof requestAnimationFrame !== "function") return;
  running = true;
  const frame = (now: number): void => {
    const dt = Math.min(0.05, (now - (clock.last || now)) / 1000) * clock.speed;
    clock.last = now;
    if (!clock.fixed) stepAll(dt);
    onFrame?.(clock.t);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

const darken = (hex: string, k: number): string =>
  `#${[1, 3, 5]
    .map((i) =>
      Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - k))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

function haloCss(mode: OverlapMode, c: Palette): string {
  if (mode === "none") return ".halo{display:none}";
  if (mode === "shadow") {
    const sh = darken(c.bg, 0.38);
    return `.halo{transform:translate(4px,3px)}.halo path{fill:${sh};stroke:${sh};stroke-linejoin:round;stroke-linecap:round}.halo .hb,.halo .ha{stroke-width:0!important}.halo .hl{stroke-width:var(--lw)!important}`;
  }
  return `.halo path{fill:${c.gap};stroke:${c.gap};stroke-linejoin:round;stroke-linecap:round}.case .b{stroke:${c.gap};stroke-width:${HALO * 2}px;paint-order:stroke;stroke-linejoin:round}`;
}

function paletteCss(gid: string, c: Palette): string {
  return `.bg{fill:${c.bg}}.b,.leg{fill:${c.body}}.leg{stroke:${c.body};stroke-linecap:round;fill:none}
      .goo{filter:url(#${gid})}.goo2{filter:url(#${gid}s)}.limb-o{fill:none;stroke:${c.gap};stroke-linecap:round;stroke-linejoin:round}.limb-f{fill:none;stroke:${c.body};stroke-linecap:round;stroke-linejoin:round}.armf{fill:none;stroke:${c.body};stroke-linecap:round}.crease{fill:none;stroke:${c.gap};stroke-linecap:round;stroke-linejoin:round}
      .eye,.mouth{fill:${c.face}}.eye.stroke,.mouth.stroke{fill:none;stroke:${c.face};stroke-linecap:round;stroke-linejoin:round}.brow{fill:none;stroke:${c.face};stroke-linecap:round}
      .blush{fill:${c.face}}.shades{fill:${c.face};stroke:${c.face};stroke-width:2}.strap,.gapline{fill:none;stroke:${c.gap};stroke-linecap:round}.gapline.thick{stroke-width:4}.bodyline{fill:none;stroke:${c.body};stroke-width:2.2;stroke-linecap:round;opacity:.9}.gapline.thin{stroke-width:1.4}
      .ink{fill:${c.face}}.hatfill{fill:${c.face};stroke:${c.body};stroke-width:2.6;stroke-linejoin:round}.outlined{stroke:${c.gap};stroke-width:1.6}.brim-o{stroke:${c.gap};stroke-width:2}.string,.steam{fill:none;stroke:${c.body};stroke-width:1.3;stroke-linecap:round}.steam{opacity:.6}
      .fxs,.fx path{fill:${c.fx}}.fx text{fill:${c.fx};font:700 16px 'Avenir Next',system-ui,sans-serif}.fx .trail{opacity:.5}
      .rigview path{fill:none;stroke:${c.rig};stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.rigview circle,.rigview rect{fill:${c.rig}}.rigview .spine{stroke-dasharray:3 3}.rigview .cp{fill:${c.rig};opacity:.7}
      .grain{mix-blend-mode:soft-light;pointer-events:none}.deco *{fill:none;stroke:${c.body};opacity:.14}`;
}

export type { Pose };
