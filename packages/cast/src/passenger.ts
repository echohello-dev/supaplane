import {
  armShape,
  clamp,
  crease,
  eyePath,
  fmt,
  halfWidthAt,
  ik,
  mix,
  mouthPath,
  outline,
  PLANE,
  PLANE_CREASE,
  ptStr,
  smoothClosed,
  ss,
  type Deform,
} from "./geometry.js";
import {
  ACTIONS,
  restHands,
  type Action,
  type ActionHost,
  type ActionName,
  type FaceState,
} from "./actions.js";
import {
  BASE,
  rng,
  shoulderPoints,
  withMetrics,
  type PassengerParams,
  type RuntimeParams,
} from "./params.js";
import { CHANNELS, zeroChannels, type ChannelName, type Targets } from "./springs.js";

const NS = "http://www.w3.org/2000/svg";
const TAU = Math.PI * 2;

/** Outline thickness (local units) drawn behind each passenger to separate overlapping ones. */
export const HALO = 3.4;

/** How the current yaw maps rest coordinates onto the page, plus face/eye visibility. */
export interface View {
  yaw: number;
  c: number;
  s: number;
  side: number;
  body: Deform;
  project: (q: Pt, z?: number) => Pt;
  front: Deform;
  eyes: [number, number];
  face: number;
}

export interface PassengerOpts {
  name?: string;
  x?: number;
  ground?: number;
  dir?: number;
  phase?: number;
  seed?: number;
  action?: ActionName;
}

export interface Burst {
  type: string;
  x: number;
  y: number;
}

export interface ArmChain {
  S: [number, number];
  E: [number, number];
  H: [number, number];
  reach: number;
}

export interface Pose {
  D: Deform;
  shoulders: Array<[number, number]>;
  hands: Array<[number, number]>;
  links?: Array<[number, number]>;
}

type Pt = [number, number];

interface ArmEls {
  fill: SVGPathElement;
  crease: SVGPathElement;
}

interface PassengerEls {
  balloon: SVGGElement;
  string: SVGPathElement;
  ball: SVGPathElement;
  knot: SVGPathElement;
  pack: SVGGElement;
  packBody: SVGPathElement;
  halo: SVGGElement;
  hBody: SVGPathElement;
  hLegs: [SVGPathElement, SVGPathElement];
  hArms: [SVGPathElement, SVGPathElement];
  goo: SVGGElement;
  body: SVGPathElement;
  legL: SVGPathElement;
  legR: SVGPathElement;
  goo2: SVGGElement;
  body2: SVGPathElement;
  arms: ArmEls[];
  straps: SVGPathElement;
  hat: SVGGElement;
  hatBand: SVGPathElement;
  hatBrim: SVGPathElement;
  hatMark: SVGPathElement;
  face: SVGGElement;
  blushL: SVGEllipseElement;
  blushR: SVGEllipseElement;
  eyeL: SVGPathElement;
  eyeR: SVGPathElement;
  brows: SVGPathElement;
  mouth: SVGPathElement;
  shades: SVGPathElement;
  prop: SVGGElement;
  case: SVGGElement;
  handleO: SVGPathElement;
  handle: SVGPathElement;
  caseBody: SVGRectElement;
  caseLine: SVGPathElement;
  wheels: SVGPathElement;
  held: SVGGElement;
  plane: SVGGElement;
  cup: SVGGElement;
  cupBody: SVGPathElement;
  steam: SVGPathElement;
  pass: SVGGElement;
  orbit: SVGGElement;
  rig: SVGGElement;
}

let UID = 0;

export class Passenger implements ActionHost {
  readonly id: number;
  name: string;
  p: RuntimeParams;
  X: number;
  G: number;
  dir: number;
  phase: number;
  propSide: number;
  waveSide: number;
  pace = 0;
  flight = 0;
  orbit = 0;
  inPlace = false;
  action: ActionName = "idle";
  act: Action = ACTIONS.idle;
  lt = 0;
  then: ActionName | null = null;
  speed = 0;
  lookAt: Pt | null = null;
  bursts: Burst[] = [];
  el: SVGGElement;
  rest: Pt[] = [];
  sh: [Pt, Pt] = [
    [0, 0],
    [0, 0],
  ];
  armL = 0;
  handsW: Pt[] = [];
  rand: () => number;
  private els: PassengerEls;
  private v = zeroChannels();
  private vel = zeroChannels();
  private face: FaceState = { eyes: "dot", mouth: "smile" };
  private open = 1;
  private blinkAt = 1;
  private blinkEnd = 0;
  private glanceAt = 2;
  private glance: [number, number] = [0, 0];
  private caseTilt = 0;
  private bInit = false;
  private planeW: Pt | null = null;
  private now = 0;
  private layerKey = "";

  constructor(params: Partial<PassengerParams> = {}, opts: PassengerOpts = {}) {
    this.id = ++UID;
    this.name = opts.name ?? "Passenger";
    this.p = withMetrics({ ...BASE, ...params });
    this.X = opts.x ?? 0;
    this.G = opts.ground ?? 0;
    this.dir = opts.dir ?? 1;
    this.phase = opts.phase ?? Math.random() * 6;
    this.rand = opts.seed != null ? rng(opts.seed) : rng(this.id * 977);
    this.propSide = this.p.propSide;
    this.waveSide = this.p.propSide === 1 ? -1 : 1;
    this.el = document.createElementNS(NS, "g");
    this.el.classList.add("passenger");
    this.els = this.build();
    this.setParams(this.p);
    this.play(opts.action ?? "idle");
    const rh = restHands(this.p);
    this.v.lhx = rh["lhx"] ?? 0;
    this.v.lhy = rh["lhy"] ?? 0;
    this.v.rhx = rh["rhx"] ?? 0;
    this.v.rhy = rh["rhy"] ?? 0;
    this.blinkAt = 1 + this.rand() * 3;
    this.glanceAt = 2 + this.rand() * 4;
  }

  burst(type: string, n: number, at: Pt, spread: number): void {
    for (let i = 0; i < n; i++) {
      this.bursts.push({
        type,
        x: at[0] + (this.rand() - 0.5) * spread,
        y: at[1] + (this.rand() - 0.5) * spread * 0.4,
      });
    }
  }

  setParams(p: Partial<PassengerParams>): void {
    this.p = withMetrics({ ...this.p, ...p });
    this.rest = outline(this.p);
    this.waveSide = this.p.propSide === 1 ? -1 : 1;
    this.propSide = this.p.propSide;
    this.sh = shoulderPoints(this.p);
    this.armL = this.p._armL;
    this.els.prop.setAttribute("class", `prop prop-${this.p.prop}`);
    this.el.dataset["prop"] = this.p.prop;
    this.el.dataset["hat"] = this.p.hat;
  }

  play(name: ActionName, opts: { then?: ActionName | null; dir?: number } = {}): this {
    let a: Action = ACTIONS[name] ?? ACTIONS.idle;
    let n: ActionName = name;
    if (a.needs && this.p.prop !== a.needs) {
      n = "wave";
      a = ACTIONS.wave;
    }
    this.action = n;
    this.act = a;
    this.lt = 0;
    this.then = opts.then !== undefined ? opts.then : a.loop ? null : "idle";
    this.orbit = 0;
    if (opts.dir) this.dir = opts.dir;
    if (n !== "throw") this.flight = 0;
    return this;
  }

  step(dt: number, t: number): void {
    const p = this.p;
    this.now = t;
    this.lt += dt;
    if (!this.act.loop && this.act.dur && this.lt > this.act.dur) this.play(this.then ?? "idle");
    const r = this.act.fn({ p, t, lt: this.lt, dt, c: this });
    const T: Targets = { ...r.T };
    this.face = r.F;
    this.speed = r.speed ?? 0;
    for (const k of ["mouth", "blush", "brow"] as const) {
      const rv = r[k];
      if (rv != null && T[k] == null) T[k] = rv;
    }
    // idle life: blink + glances
    if (t > this.blinkAt) {
      this.blinkAt = t + 2 + this.rand() * 3.5;
      this.blinkEnd = t + 0.13;
    }
    this.open = t < this.blinkEnd ? 0.12 : 1;
    if (t > this.glanceAt) {
      this.glanceAt = t + 1.5 + this.rand() * 3.5;
      this.glance =
        this.rand() < 0.45 ? [0, 0] : [(this.rand() - 0.5) * 6, (this.rand() - 0.5) * 3];
    }
    if (T["lx"] == null) {
      T["lx"] = this.glance[0];
      T["ly"] = this.glance[1];
    }
    if (this.lookAt && ["idle", "wave", "cheer", "love", "laugh"].includes(this.action)) {
      const [wx, wy] = this.lookAt;
      const ex = this.X;
      const ey = this.G - p.h * p.eyeY * p.scale;
      T["lx"] = clamp((wx - ex) / (80 * p.scale), -1, 1) * 3.2;
      T["ly"] = clamp((wy - ey) / (80 * p.scale), -1, 1) * 2.4;
    }
    if (this.flight > 0 && this.flight < 1 && this.planeW) {
      T["lx"] = clamp(this.planeW[0] / 60, -1, 1) * 3.4;
      T["ly"] = clamp((this.planeW[1] + p.h * p.eyeY) / 60, -1, 1) * 3;
    }
    // springs (substepped)
    const n = Math.ceil(dt / (1 / 120));
    const h = dt / n;
    const rh = restHands(p);
    for (let i = 0; i < n; i++) {
      for (const k of Object.keys(CHANNELS) as ChannelName[]) {
        const [K, D] = CHANNELS[k];
        const tgt = T[k] ?? (k in rh ? (rh[k] ?? 0) : k === "bx" || k === "by" ? this.v[k] : 0);
        this.vel[k] += (K * (tgt - this.v[k]) - D * this.vel[k]) * h;
        this.v[k] += this.vel[k] * h;
      }
    }
    if (this.act.travel && !this.inPlace) this.X += this.dir * this.speed * dt;
  }

  deform(): Deform {
    const p = this.p;
    const P = this.v;
    const sy = 1 + P.stretch;
    const sx = 1 - P.stretch * 0.55;
    return (x: number, y: number): Pt => {
      const u = clamp(-y / p.h, 0, 1.3);
      return [
        x * sx * (1 + P.bulge * (1 - u)) + P.lean * p.h * u * u + P.x,
        y * sy + P.y + P.bob - p.legLen,
      ];
    };
  }

  pose(): Pose {
    const P = this.v;
    const D = this.deform();
    const shoulders = this.sh.map((s) => D(s[0], s[1]));
    const hands: Pt[] = [D(P.lhx, P.lhy), D(P.rhx, P.rhy)];
    return { D, shoulders, hands };
  }

  /** Turnaround projection for the current yaw: body width, limb depth, face placement. */
  view(D: Deform): View {
    const p = this.p;
    const P = this.v;
    const yaw = ((((p.yaw + 180) % 360) + 360) % 360) - 180;
    const a = (yaw * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const side = Math.abs(s) < 0.001 ? 0 : Math.sign(s);
    const width = Math.hypot(c, p.depth * s);
    const body: Deform = (x, y) => D(x * width, y);
    const project = (q: Pt, z = 0): Pt => {
      const y = (q[1] - P.y - P.bob + p.legLen) / (1 + P.stretch);
      const mid = D(0, y)[0];
      return [mid + (q[0] - mid) * c + z * s, q[1]];
    };
    const front: Deform = (x, y) => {
      const hw = Math.max(p.eyeGap + 1, halfWidthAt(this.rest, y));
      const z = p.depth * 0.82 * Math.sqrt(Math.max(0, hw * hw - x * x));
      return D(x * c + z * s, y);
    };
    const eyeAngle = Math.asin(
      clamp(p.eyeGap / Math.max(p.eyeGap + 1, halfWidthAt(this.rest, -p.h * p.eyeY)), 0, 0.95),
    );
    const eyes: [number, number] = [
      ss(-0.05, 0.2, Math.cos(a - eyeAngle)),
      ss(-0.05, 0.2, Math.cos(a + eyeAngle)),
    ];
    return { yaw, c, s, side, body, project, front, eyes, face: 1 - ss(93, 108, Math.abs(yaw)) };
  }

  /** Re-stack arms and props when the passenger turns so far-side parts sit behind the body. */
  private orderView(V: View): void {
    const e = this.els;
    const key = `${V.side}:${this.p.propSide}:${V.c < 0}`;
    if (key === this.layerKey) return;
    this.layerKey = key;
    e.arms.forEach((arm, i) => {
      const far = V.side !== 0 && (i ? 1 : -1) === V.side;
      e.goo2.insertBefore(arm.fill, far ? e.body2 : null);
      this.el.insertBefore(arm.crease, e.straps);
    });
    const propFar = this.p.propSide * V.side > 0;
    for (const el of [e.prop, e.held]) this.el.insertBefore(el, propFar ? e.goo : e.orbit);
    this.el.insertBefore(e.balloon, e.goo);
    this.el.insertBefore(e.pack, V.c < 0 ? e.straps : e.goo);
  }

  render(pose: Pose, rigOn: boolean): void {
    const p = this.p;
    const P = this.v;
    const e = this.els;
    const { D } = pose;
    const V = this.view(D);
    const DB = V.body;
    this.orderView(V);
    this.el.setAttribute("transform", `translate(${fmt(this.X)} ${fmt(this.G)}) scale(${p.scale})`);
    const bodyD = smoothClosed(this.rest.map((q) => DB(q[0], q[1])));
    e.body.setAttribute("d", bodyD);
    e.body2.setAttribute("d", bodyD);
    e.hBody.setAttribute("d", bodyD);
    e.hBody.style.strokeWidth = String(HALO * 2);
    // legs
    const legs: Array<[Pt, Pt]> = (
      [
        [-1, P.lfx, P.llift],
        [1, P.rfx, P.rlift],
      ] as Array<[number, number, number]>
    ).map(([s, fx, lift]) => {
      const hip = V.project(D((s * p.legGap) / 2, -p.legW * 0.7));
      const foot: Pt = [((s * p.legGap) / 2) * V.c + fx * V.s + P.x, P.y - p.legW / 2 - lift];
      hip[1] = Math.min(hip[1], foot[1] - 3);
      return [hip, foot];
    });
    legs.forEach((leg, i) => {
      const d = `M${ptStr(leg[0])}L${ptStr(leg[1])}`;
      const el = i ? e.legR : e.legL;
      el.setAttribute("d", d);
      el.style.strokeWidth = String(p.legW);
      const halo = e.hLegs[i === 0 ? 0 : 1];
      halo.setAttribute("d", d);
      halo.style.strokeWidth = String(p.legW + HALO * 2);
      halo.style.setProperty("--lw", `${p.legW}px`);
    });
    // arms (IK), then projected for the current view
    const gap = Math.max(2.6, p.armW * 0.27);
    const rh = restHands(p);
    const arms: ArmChain[] = pose.shoulders.map((S, i) => {
      const side = i ? 1 : -1;
      const linked = pose.links?.[i];
      const H: Pt = linked ?? pose.hands[i] ?? [0, 0];
      const L = this.armL * (linked ? 1.3 : 1);
      const raw = ik(S, H, L * 0.5, L * 0.5, side);
      const k = i ? "rhx" : "lhx";
      // the authored frontal swing gains a forward/back component in profile
      const swing = this.act.travel
        ? side * ((P[k] ?? 0) - (rh[k] ?? 0)) * 1.35
        : Math.max(0, S[1] - raw.H[1]) * 0.16;
      const z = -p.w * 0.05 + swing;
      return {
        S: V.project(S),
        E: V.project(raw.E, z * 0.5 - p.armW * 0.5 * Math.abs(V.s)),
        H: V.project(raw.H, z),
        reach: raw.reach,
      };
    });
    this.handsW = arms.map((a) => a.H);
    const bodyC = DB(0, -p.h * 0.42);
    arms.forEach((a, i) => {
      const A = e.arms[i];
      if (!A) return;
      // control point through the elbow, clamped so sharp folds don't balloon the curve
      const M: Pt = [(a.S[0] + a.H[0]) / 2, (a.S[1] + a.H[1]) / 2];
      const dv: Pt = [a.E[0] - M[0], a.E[1] - M[1]];
      const ck = Math.min(1, (this.armL * 0.22) / (Math.hypot(dv[0], dv[1]) || 1));
      const C: Pt = [a.E[0] + dv[0] * ck, a.E[1] + dv[1] * ck];
      const shape = armShape(p, a.S, C, a.H);
      A.fill.setAttribute("d", shape);
      const halo = e.hArms[i === 0 ? 0 : 1];
      halo.setAttribute("d", shape);
      halo.style.strokeWidth = String(HALO * 2);
      const screenSide = Math.abs(V.c) < 0.15 ? -V.side : (i ? 1 : -1) * Math.sign(V.c);
      // the far arm's line thins away as it turns behind the body (solid ink, never a grey fade)
      const fade = (i ? 1 : -1) * V.s > 0 ? 1 - ss(0.05, 0.75, Math.abs(V.s)) : 1;
      A.crease.setAttribute(
        "d",
        fade < 0.08 ? "" : crease(p, a.S, C, a.H, gap * fade, screenSide, bodyC),
      );
      A.crease.style.strokeWidth = String(gap * fade);
    });
    // face
    const eyeY = -p.h * p.eyeY;
    const lk = [P.lx, P.ly] as const;
    e.face.style.opacity = String(V.face);
    const eyes: Pt[] = [-1, 1].map((s) => {
      const q = V.front(s * p.eyeGap, eyeY);
      return [q[0] + lk[0] * Math.abs(V.c), q[1] + lk[1]];
    });
    const m = V.front(0, eyeY + p.eyeR * 1.7);
    m[0] += lk[0] * 0.9 * Math.abs(V.c);
    m[1] += lk[1] * 0.9;
    const eyeType = p.hat === "shades" ? "dot" : this.face.eyes;
    [e.eyeL, e.eyeR].forEach((el, i) => {
      const eye = eyes[i] ?? [0, 0];
      const ep = eyePath(
        eyeType,
        eye[0],
        eye[1],
        p.eyeR,
        eyeType === "dot" || eyeType === "wide" ? this.open : 1,
        this.now,
      );
      el.setAttribute("d", ep.d);
      el.classList.toggle("stroke", !!ep.stroke);
      el.style.strokeWidth = String(p.eyeR * 0.72);
      el.style.display = p.hat === "shades" ? "none" : "";
      el.style.opacity = String(V.eyes[i === 0 ? 0 : 1]);
    });
    const mp = mouthPath(
      this.face.mouth,
      m[0],
      m[1],
      p.mouthW * Math.max(0.35, Math.abs(V.c)),
      clamp(P.mouth, 0, 1.2),
    );
    e.mouth.setAttribute("d", mp.d);
    e.mouth.classList.toggle("stroke", !!mp.stroke);
    e.mouth.style.strokeWidth = String(p.eyeR * 0.6);
    const bw = P.brow;
    e.brows.setAttribute(
      "d",
      Math.abs(bw) < 0.06
        ? ""
        : eyes
            .map(([x, y], i) => {
              if (V.eyes[i === 0 ? 0 : 1] < 0.1) return "";
              const s = i ? 1 : -1;
              const r = p.eyeR;
              const by = y - r * 2.5;
              return `M${fmt(x + s * r * 1.5)} ${fmt(by + Math.max(0, bw) * r * 0.4)}L${fmt(x - s * r * 0.4)} ${fmt(
                by - bw * r * 1.1,
              )}`;
            })
            .join(""),
    );
    e.brows.style.strokeWidth = String(p.eyeR * 0.6);
    [e.blushL, e.blushR].forEach((el, i) => {
      const eye = eyes[i] ?? [0, 0];
      el.setAttribute("cx", String(fmt(eye[0] + (i ? 1 : -1) * p.eyeR * 1.4)));
      el.setAttribute("cy", String(fmt(eye[1] + p.eyeR * 2.1)));
      el.setAttribute("rx", String(fmt(p.eyeR * 1.6)));
      el.setAttribute("ry", String(fmt(p.eyeR * 0.8)));
      el.style.opacity = String(clamp(P.blush, 0, 1) * 0.22 * V.eyes[i === 0 ? 0 : 1]);
    });
    // hats + shades
    if (p.hat !== "shades") e.shades.setAttribute("d", "");
    else {
      const r = p.eyeR * 2.1;
      const lens = eyes
        .map(([x, y], i) =>
          V.eyes[i === 0 ? 0 : 1] < 0.1
            ? ""
            : `M${fmt(x - r)} ${fmt(y - r * 0.6)}h${fmt(r * 2)}v${fmt(r * 0.7)}q0 ${fmt(r * 0.7)} ${fmt(-r)} ${fmt(
                r * 0.7,
              )}q${fmt(-r)} 0 ${fmt(-r)} ${fmt(-r * 0.7)}Z`,
        )
        .join("");
      const a = eyes[0] ?? [0, 0];
      const b = eyes[1] ?? [0, 0];
      const bridge = V.eyes.every((v) => v > 0.1)
        ? `M${fmt(a[0] + r)} ${fmt(a[1] - r * 0.4)}L${fmt(b[0] - r)} ${fmt(b[1] - r * 0.4)}`
        : "";
      e.shades.setAttribute("d", lens + bridge);
    }
    this.renderHat(DB);
    e.hatMark.style.opacity = p.hat === "beanie" ? "1" : String(V.face);
    e.hatBrim.style.opacity = p.hat === "beanie" ? "1" : String(V.face);
    e.straps.setAttribute(
      "d",
      p.prop !== "backpack"
        ? ""
        : [-1, 1]
            .map((s) => {
              const a = V.front(s * p.w * 0.27, -p.h * 0.66);
              const b = V.front(s * p.w * 0.38, -p.h * 0.5);
              const c = V.front(s * p.w * 0.33, -p.h * 0.3);
              return `M${ptStr(a)}Q${ptStr(b)} ${ptStr(c)}`;
            })
            .join(""),
    );
    e.straps.style.strokeWidth = String(p.armW * 0.45);
    e.straps.style.opacity = String(V.face);
    e.pack.style.display = p.prop === "backpack" ? "" : "none";
    if (p.prop === "backpack") {
      const c = V.project(D(0, -p.h * 0.47), -p.w * p.depth * 0.48);
      const w = p.w * 0.5 * Math.max(0.25, Math.abs(V.c));
      const h = p.h * 0.43;
      const r = Math.min(8, w / 3);
      const x = c[0] - w / 2;
      const y = c[1] - h / 2;
      e.packBody.setAttribute(
        "d",
        `M${fmt(x + r)} ${fmt(y)}h${fmt(w - 2 * r)}q${r} 0 ${r} ${r}v${fmt(h - 2 * r)}q0 ${r} ${-r} ${r}h${fmt(
          -w + 2 * r,
        )}q${-r} 0 ${-r} ${-r}v${fmt(-h + 2 * r)}q0 ${-r} ${r} ${-r}Z`,
      );
    }
    this.renderProps(arms);
    e.orbit.style.display = this.orbit ? "" : "none";
    if (this.orbit) {
      const top = D(0, -p.h * 1.06);
      const tt = this.now;
      [...e.orbit.children].forEach((s, i) => {
        const a = tt * 3 + (i * TAU) / 3;
        s.setAttribute(
          "transform",
          `translate(${fmt(top[0] + Math.cos(a) * p.w * 0.42)} ${fmt(top[1] + Math.sin(a) * 9)}) scale(.9)`,
        );
      });
    }
    this.renderRig(rigOn, arms, legs, DB);
  }

  private renderHat(D: Deform): void {
    const p = this.p;
    const e = this.els;
    const hat = p.hat;
    e.hat.style.display = hat === "none" || hat === "shades" ? "none" : "";
    if (e.hat.style.display) return;
    // filled crown in the face ink: the top of the body outline down to a gently curved band
    const yb = -p.h * (hat === "beanie" ? 0.83 : hat === "pilot" ? 0.85 : 0.87);
    const cy = -p.h * 0.93;
    const grow = 1.03;
    const crown = this.rest
      .filter((q) => q[1] < yb)
      .map(([x, y]) => D(x * grow, cy + (y - cy) * grow));
    const hw = halfWidthAt(this.rest, yb) * grow;
    const band: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      band.push(D(-hw + 2 * hw * u, yb + Math.sin(u * Math.PI) * p.h * 0.03));
    }
    e.hatBand.setAttribute("d", `M${[...crown, ...band].map(ptStr).join("L")}Z`);
    e.hatBand.setAttribute("class", "hatfill");
    const facing = Math.sin((p.yaw * Math.PI) / 180);
    const s = Math.abs(facing) > 0.15 ? Math.sign(facing) : this.dir || 1;
    if (hat === "cap") {
      const a = D(s * hw * 0.15, yb + p.h * 0.02);
      const b = D(s * (hw + p.w * 0.3), yb + p.h * 0.045);
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt;
      e.hatBrim.setAttribute(
        "d",
        `M${ptStr(a)}Q${fmt(m[0])} ${fmt(m[1] - 7)} ${ptStr(b)}Q${fmt(b[0] + s * 2)} ${fmt(b[1] + 4)} ${fmt(
          b[0] - s * 4,
        )} ${fmt(b[1] + 4)}Q${fmt(m[0])} ${fmt(m[1] + 3)} ${fmt(a[0] - s * 8)} ${fmt(a[1] + 5)}Z`,
      );
      e.hatBrim.setAttribute("class", "hatfill");
    } else if (hat === "pilot") {
      const a = D(-hw * 0.75, yb + 4);
      const b = D(hw * 0.75, yb + 4);
      e.hatBrim.setAttribute(
        "d",
        `M${ptStr(a)}Q${fmt((a[0] + b[0]) / 2)} ${fmt(a[1] + 11)} ${ptStr(b)}`,
      );
      e.hatBrim.setAttribute("class", "gapline thick");
    } else {
      const a = D(-hw * 0.92, yb - p.h * 0.035);
      const b = D(hw * 0.92, yb - p.h * 0.035);
      e.hatBrim.setAttribute(
        "d",
        `M${ptStr(a)}Q${fmt((a[0] + b[0]) / 2)} ${fmt(a[1] + p.h * 0.06)} ${ptStr(b)}`,
      );
      e.hatBrim.setAttribute("class", "bodyline");
    }
    const c = D(0, yb - p.h * 0.055);
    const t = D(0, -p.h * 1.01);
    e.hatMark.setAttribute(
      "d",
      hat === "pilot"
        ? `M${fmt(c[0] + 8)} ${fmt(c[1] - 1)}L${fmt(c[0] - 6)} ${fmt(c[1] - 5)}L${fmt(c[0] - 2)} ${fmt(c[1] - 1)}L${fmt(
            c[0] - 6,
          )} ${fmt(c[1] + 3)}Z`
        : hat === "beanie"
          ? `M${fmt(t[0] - 6)} ${fmt(t[1])}a6 6 0 1 0 12 0a6 6 0 1 0-12 0Z`
          : "",
    );
    e.hatMark.setAttribute("class", hat === "beanie" ? "hatfill" : "b");
  }

  private renderProps(arms: ArmChain[]): void {
    const p = this.p;
    const e = this.els;
    const prop = p.prop;
    const hi = p.propSide < 0 ? 0 : 1;
    const H: Pt = arms[hi]?.H ?? [0, 0];
    const walking = !!this.act.travel;
    e.case.style.display = prop === "case" ? "" : "none";
    e.balloon.style.display = prop === "balloon" ? "" : "none";
    e.plane.style.display = prop === "plane" ? "" : "none";
    e.cup.style.display = prop === "coffee" ? "" : "none";
    e.pass.style.display = prop === "passport" ? "" : "none";
    if (prop === "case") {
      const cw = p.w * 0.32;
      const ch = p.h * 0.34;
      const wr = 4.5;
      const hmin = 6;
      const hmax = p.h * 0.3;
      const hx = cw * 0.23;
      const tilt = walking ? this.dir * 0.3 : 0;
      this.caseTilt = mix(this.caseTilt || 0, tilt, 0.08);
      let th = this.caseTilt;
      const top = ch + 2 * wr;
      let L = -H[1] / Math.cos(th) - top;
      let B: Pt;
      if (L < hmin) {
        L = hmin;
        th *= 0.3;
        B = [H[0] - Math.sin(th) * (top + L), H[1] + Math.cos(th) * (top + L)];
      } else {
        if (L > hmax) L = hmax;
        B = [H[0] - Math.sin(th) * (top + L), H[1] + Math.cos(th) * (top + L)];
      }
      if (B[1] > 0) B[1] = 0; // never sink below the floor
      e.case.setAttribute("transform", `translate(${ptStr(B)}) rotate(${fmt(th * 57.3)})`);
      const hd = `M${-hx} ${-top + 2}V${fmt(-top - L)}H${hx}V${-top + 2}`;
      e.handleO.setAttribute("d", hd);
      e.handle.setAttribute("d", hd);
      e.handleO.style.strokeWidth = "7";
      e.handle.style.strokeWidth = "3.4";
      e.caseBody.setAttribute("x", String(-cw / 2));
      e.caseBody.setAttribute("y", String(-top));
      e.caseBody.setAttribute("width", String(cw));
      e.caseBody.setAttribute("height", String(ch));
      e.caseBody.setAttribute("rx", "7");
      e.caseLine.setAttribute("d", "");
      e.wheels.setAttribute(
        "d",
        `M${-cw * 0.3 - wr} ${-wr}a${wr} ${wr} 0 1 0 ${2 * wr} 0a${wr} ${wr} 0 1 0 ${-2 * wr} 0ZM${
          cw * 0.3 - wr
        } ${-wr}a${wr} ${wr} 0 1 0 ${2 * wr} 0a${wr} ${wr} 0 1 0 ${-2 * wr} 0Z`,
      );
    }
    if (prop === "balloon") {
      // pendulum-ish balloon on a spring, lagging the hand
      const tx = H[0] + p.propSide * 14 + Math.sin(this.now * 1.1 + this.phase) * 6;
      const ty = H[1] - 78;
      if (!this.bInit) {
        this.v.bx = tx;
        this.v.by = ty;
        this.bInit = true;
      }
      this.v.bx = mix(this.v.bx, tx, 0.05);
      this.v.by = mix(this.v.by, ty, 0.07);
      const bx = this.v.bx;
      const by = this.v.by;
      const r = 17;
      e.string.setAttribute(
        "d",
        `M${ptStr(H)}Q${fmt((H[0] + bx) / 2 + 8)} ${fmt((H[1] + by) / 2)} ${fmt(bx)} ${fmt(by + r * 1.15)}`,
      );
      e.ball.setAttribute(
        "d",
        `M${fmt(bx)} ${fmt(by + r * 1.18)}C${fmt(bx - r * 1.35)} ${fmt(by + r * 0.6)} ${fmt(bx - r * 1.1)} ${fmt(
          by - r * 1.1,
        )} ${fmt(bx)} ${fmt(by - r * 1.1)}C${fmt(bx + r * 1.1)} ${fmt(by - r * 1.1)} ${fmt(bx + r * 1.35)} ${fmt(
          by + r * 0.6,
        )} ${fmt(bx)} ${fmt(by + r * 1.18)}Z`,
      );
      e.knot.setAttribute(
        "d",
        `M${fmt(bx - 3)} ${fmt(by + r * 1.35)}L${fmt(bx + 3)} ${fmt(by + r * 1.35)}L${fmt(bx)} ${fmt(by + r * 1.1)}Z`,
      );
    }
    if (prop === "plane") {
      let x = H[0] + p.propSide * 6;
      let y = H[1] - 8;
      let rot = p.propSide < 0 ? 180 + 20 : -20;
      if (this.flight > 0 && this.flight < 1) {
        const fl = this.flight;
        const pos = (q: number): Pt => {
          const a = q * TAU;
          const O: Pt = [(p.propSide * p.w) / 5, -p.h * 1.55];
          return [O[0] + Math.sin(a) * p.w * 1.3, O[1] + Math.sin(a * 2) * p.h * 0.28];
        };
        const blend = ss(0, 0.12, fl) * (1 - ss(0.88, 1, fl));
        const a = pos(fl);
        const b = pos(fl + 0.01);
        x = mix(x, a[0], blend);
        y = mix(y, a[1], blend);
        rot = mix(rot, Math.atan2(b[1] - a[1], b[0] - a[0]) * 57.3, blend);
        this.planeW = [x, y];
        if (this.rand() < 0.25) this.bursts.push({ type: "trail", x, y });
      } else this.planeW = null;
      e.plane.setAttribute(
        "transform",
        `translate(${fmt(x)} ${fmt(y)}) rotate(${fmt(rot)}) scale(${this.flight > 0 && this.flight < 1 ? 1.25 : 1})`,
      );
    }
    if (prop === "coffee") {
      const x = H[0] + p.propSide * 3;
      const y = H[1] - 4;
      const t = this.now;
      e.cupBody.setAttribute(
        "d",
        `M${fmt(x - 7)} ${fmt(y - 9)}H${fmt(x + 7)}L${fmt(x + 5.5)} ${fmt(y + 9)}H${fmt(x - 5.5)}ZM${fmt(x - 8)} ${fmt(
          y - 12,
        )}H${fmt(x + 8)}V${fmt(y - 9)}H${fmt(x - 8)}Z`,
      );
      e.steam.setAttribute(
        "d",
        [0, 1]
          .map((i) => {
            const sx = x - 2.5 + i * 5;
            const o = Math.sin(t * 3 + i * 2) * 2.5;
            return `M${fmt(sx)} ${fmt(y - 15)}q${fmt(o)} -5 0 -9t0 -9`;
          })
          .join(""),
      );
    }
    if (prop === "passport") {
      e.pass.setAttribute(
        "transform",
        `translate(${fmt(H[0] + p.propSide * 4)} ${fmt(H[1] - 6)}) rotate(${p.propSide * 12})`,
      );
    }
  }

  private renderRig(on: boolean, arms: ArmChain[], legs: Array<[Pt, Pt]>, D: Deform): void {
    const e = this.els.rig;
    e.style.display = on ? "" : "none";
    if (!on) return;
    const p = this.p;
    const bits: string[] = [];
    for (const a of arms) {
      bits.push(`<path d="M${ptStr(a.S)}L${ptStr(a.E)}L${ptStr(a.H)}"/>`);
      for (const q of [a.S, a.E, a.H])
        bits.push(`<circle cx="${fmt(q[0])}" cy="${fmt(q[1])}" r="2.6"/>`);
    }
    for (const [h, ft] of legs) {
      bits.push(`<path d="M${ptStr(h)}L${ptStr(ft)}"/>`);
      bits.push(`<circle cx="${fmt(h[0])}" cy="${fmt(h[1])}" r="2.6"/>`);
      bits.push(`<circle cx="${fmt(ft[0])}" cy="${fmt(ft[1])}" r="2.6"/>`);
    }
    const spine: Pt[] = [0, 0.25, 0.5, 0.75, 1].map((u) => D(0, -p.h * u));
    bits.push(`<path class="spine" d="M${spine.map(ptStr).join("L")}"/>`);
    for (const q of spine)
      bits.push(`<rect x="${fmt(q[0] - 2.5)}" y="${fmt(q[1] - 2.5)}" width="5" height="5"/>`);
    this.rest.forEach((q, i) => {
      if (i % 4 === 0) {
        const r = D(q[0], q[1]);
        bits.push(`<circle class="cp" cx="${fmt(r[0])}" cy="${fmt(r[1])}" r="1.5"/>`);
      }
    });
    e.innerHTML = bits.join("");
  }

  private build(): PassengerEls {
    const parent = this.el;
    const mk = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      cls: string,
      into: SVGElement = parent,
    ): SVGElementTagNameMap[K] => {
      const el = document.createElementNS(NS, tag);
      if (cls) el.setAttribute("class", cls);
      into.appendChild(el);
      return el;
    };
    const balloon = mk("g", "balloon");
    const string = mk("path", "string", balloon);
    const ball = mk("path", "b", balloon);
    const knot = mk("path", "b", balloon);
    const pack = mk("g", "pack");
    const packBody = mk("path", "b outlined", pack);
    // separation halo: a slightly fatter silhouette in the gap colour (outline) or an offset dark
    // copy (shadow); it only reads where this passenger overlaps someone behind it
    const halo = mk("g", "halo");
    const hBody = mk("path", "hb", halo);
    const hLegs: [SVGPathElement, SVGPathElement] = [
      mk("path", "hl", halo),
      mk("path", "hl", halo),
    ];
    const hArms: [SVGPathElement, SVGPathElement] = [
      mk("path", "ha", halo),
      mk("path", "ha", halo),
    ];
    const goo = mk("g", "goo");
    const body = mk("path", "b", goo);
    const legL = mk("path", "leg", goo);
    const legR = mk("path", "leg", goo);
    // arms fuse through a softer second goo pass with a body copy, which rounds the shoulders
    const goo2 = mk("g", "goo2");
    const body2 = mk("path", "b", goo2);
    const arms: ArmEls[] = [0, 1].map(() => {
      const fill = mk("path", "b", goo2);
      const creaseEl = mk("path", "crease");
      return { fill, crease: creaseEl };
    });
    const straps = mk("path", "strap");
    const hat = mk("g", "hat");
    const hatBand = mk("path", "gapline", hat);
    const hatBrim = mk("path", "brim", hat);
    const hatMark = mk("path", "ink", hat);
    const face = mk("g", "faceview");
    const blushL = mk("ellipse", "blush", face);
    const blushR = mk("ellipse", "blush", face);
    const eyeL = mk("path", "eye", face);
    const eyeR = mk("path", "eye", face);
    const brows = mk("path", "brow", face);
    const mouth = mk("path", "mouth", face);
    const shades = mk("path", "shades", face);
    const prop = mk("g", "prop");
    const caseEl = mk("g", "case", prop);
    const handleO = mk("path", "limb-o", caseEl);
    const handle = mk("path", "limb-f", caseEl);
    const caseBody = mk("rect", "b", caseEl);
    const caseLine = mk("path", "gapline", caseEl);
    const wheels = mk("path", "b", caseEl);
    const held = mk("g", "held");
    const plane = mk("g", "plane", held);
    mk("path", "b", plane).setAttribute("d", PLANE);
    mk("path", "gapline thin", plane).setAttribute("d", PLANE_CREASE);
    const cup = mk("g", "cup", held);
    const cupBody = mk("path", "b outlined", cup);
    const steam = mk("path", "steam", cup);
    const pass = mk("g", "passport", held);
    const passRect = mk("rect", "b outlined", pass);
    passRect.setAttribute("x", "-7");
    passRect.setAttribute("y", "-10");
    passRect.setAttribute("width", "14");
    passRect.setAttribute("height", "19");
    passRect.setAttribute("rx", "2");
    mk("path", "ink", pass).setAttribute("d", "M4.5 -1.5L-3.5 -4.5L-1.5 -1.5L-3.5 1.5Z");
    const orbit = mk("g", "orbit");
    for (let i = 0; i < 3; i++) mk("path", "fxs", orbit).setAttribute("d", FX_SPARK);
    const rig = mk("g", "rigview");
    return {
      balloon,
      string,
      ball,
      knot,
      pack,
      packBody,
      halo,
      hBody,
      hLegs,
      hArms,
      goo,
      body,
      legL,
      legR,
      goo2,
      body2,
      arms,
      straps,
      hat,
      hatBand,
      hatBrim,
      hatMark,
      face,
      blushL,
      blushR,
      eyeL,
      eyeR,
      brows,
      mouth,
      shades,
      prop,
      case: caseEl,
      handleO,
      handle,
      caseBody,
      caseLine,
      wheels,
      held,
      plane,
      cup,
      cupBody,
      steam,
      pass,
      orbit,
      rig,
    };
  }
}

const FX_SPARK = "M0-8L2-2L8 0L2 2L0 8L-2 2L-8 0L-2-2Z";
