export const TAU = Math.PI * 2;

export type Pt = [number, number];

/** Maps body-rest coordinates to the deformed pose space. */
export type Deform = (x: number, y: number) => Pt;

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
export const ss = (a: number, b: number, t: number): number => {
  const k = clamp((t - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
export const fmt = (n: number): number => Math.round(n * 10) / 10;
export const ptStr = (p: Pt): string => `${fmt(p[0])} ${fmt(p[1])}`;

export interface OutlineParams {
  h: number;
  w: number;
  topN: number;
  botN: number;
  egg: number;
  /** Egg bodies: height of a round top cap as a multiple of the half-width (0 = plain egg). */
  dome?: number;
  /** Ghost bodies: head radius as a fraction of the half-width (0 = use the egg outline). */
  head?: number;
  /** Ghost bodies: straight neck length as a fraction of the height. */
  neck?: number;
  /** Ghost bodies: where the flare reaches the belly, as a fraction of the lower body. */
  bellyAt?: number;
}

export interface ArmParams {
  armW: number;
  armTaper: number;
}

export interface IkResult {
  E: Pt;
  H: Pt;
  reach: number;
}

export interface ShapePath {
  d: string;
  stroke?: boolean;
}

export type EyeType = "dot" | "happy" | "closed" | "spiral" | "heart" | "wide";
export type MouthType = "smile" | "grin" | "o" | "frown" | "flat" | "wavy";

/**
 * Ghost profile (head > 0): a slightly squashed round dome, a straight neck, a smooth flare out to
 * the belly and a round bottom. Every joint is tangent-continuous, so there are no kinks.
 */
function ghostProfile(p: OutlineParams): Pt[] {
  const h = p.h;
  const B = p.w / 2;
  const R = B * (p.head ?? 0);
  const dH = R * (p.dome || 1);
  const yDome = -h + dH;
  const yNeck = Math.min(yDome + h * (p.neck ?? 0), -h * 0.3);
  const L = -yNeck;
  const tb = p.bellyAt ?? 0.62;
  const n = p.botN || 2.4;
  const prof: Pt[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = ((i / 12) * Math.PI) / 2;
    prof.push([R * Math.sin(a), yDome - dH * Math.cos(a)]);
  }
  if (yNeck > yDome + 1) prof.push([R, (yDome + yNeck) / 2], [R, yNeck]);
  for (let i = 1; i <= 10; i++) {
    const t = (i / 10) * tb;
    prof.push([R + (B - R) * ss(0, tb, t), yNeck + L * t]);
  }
  for (let i = 1; i <= 9; i++) {
    const a = ((i / 9) * Math.PI) / 2;
    prof.push([
      B * Math.pow(Math.cos(a), 2 / n),
      yNeck + L * (tb + (1 - tb) * Math.pow(Math.sin(a), 2 / n)),
    ]);
  }
  prof[prof.length - 1] = [0, 0];
  // ring order matches the egg outline: right middle → over the top → down the left → back up the right
  let m = prof.findIndex((q) => q[1] >= -h / 2);
  if (m < 1) m = 1;
  const mirror = (q: Pt): Pt => [-q[0], q[1]];
  return [
    ...prof.slice(0, m + 1).reverse(),
    ...prof.slice(1).map(mirror),
    ...prof.slice(m + 1, -1).reverse(),
  ];
}

/**
 * Body silhouette in body-rest coordinates (origin bottom centre, -y up). Ghost bodies use the
 * dome/neck/belly profile; otherwise a superellipse with a domed top, flatter base and taper.
 */
export function outline(p: OutlineParams, N = 56): Pt[] {
  if ((p.head ?? 0) > 0) return ghostProfile(p);
  const pts: Pt[] = [];
  // dome > 0: the top is a round cap sized to the width on straight sides, so heads stay broad
  const rTop = (p.dome ?? 0) > 0 ? Math.min(p.h / 2, ((p.dome ?? 0) * p.w) / 2) : p.h / 2;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const c = Math.cos(a);
    const s = -Math.sin(a);
    const n = s < 0 ? p.topN : p.botN;
    const yy = Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    let x = (p.w / 2) * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    x *= 1 + p.egg * yy;
    pts.push([x, s < 0 ? -p.h + rTop + rTop * yy : -p.h / 2 + (p.h / 2) * yy]);
  }
  return pts;
}

/** Half-width of the outline at height y, intersecting segments so sparse samples never miss. */
export function halfWidthAt(pts: Pt[], y: number): number {
  let best = 0;
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length] ?? a;
    if (y < Math.min(a[1], b[1]) || y > Math.max(a[1], b[1])) return;
    const x =
      Math.abs(b[1] - a[1]) < 0.0001
        ? Math.max(Math.abs(a[0]), Math.abs(b[0]))
        : Math.abs(mix(a[0], b[0], (y - a[1]) / (b[1] - a[1])));
    best = Math.max(best, x);
  });
  return best;
}

export function smoothClosed(pts: Pt[]): string {
  const n = pts.length;
  const first = pts[0] ?? [0, 0];
  let d = `M${ptStr(first)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n] ?? first;
    const p1 = pts[i] ?? first;
    const p2 = pts[(i + 1) % n] ?? first;
    const p3 = pts[(i + 2) % n] ?? first;
    d += `C${fmt(p1[0] + (p2[0] - p0[0]) / 6)} ${fmt(p1[1] + (p2[1] - p0[1]) / 6)} ${fmt(
      p2[0] - (p3[0] - p1[0]) / 6,
    )} ${fmt(p2[1] - (p3[1] - p1[1]) / 6)} ${ptStr(p2)}`;
  }
  return d + "Z";
}

/** Two-bone IK; `side` picks the elbow direction. */
export function ik(S: Pt, T: Pt, L1: number, L2: number, side: number): IkResult {
  let dx = T[0] - S[0];
  let dy = T[1] - S[1];
  let d = Math.hypot(dx, dy) || 0.001;
  const max = (L1 + L2) * 0.995;
  const min = Math.abs(L1 - L2) + 2;
  const k = clamp(d, min, max) / d;
  dx *= k;
  dy *= k;
  d = Math.hypot(dx, dy);
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const hh = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const ux = dx / d;
  const uy = dy / d;
  let px = -uy;
  let py = ux;
  if (px * side < 0) {
    px = -px;
    py = -py;
  }
  return {
    E: [S[0] + ux * a + px * hh, S[1] + uy * a + py * hh],
    H: [S[0] + dx, S[1] + dy],
    reach: k,
  };
}

/**
 * Sweep a variable-width ribbon along the quadratic S→C→H with a round tip.
 * `off(t)` is the half-width at t; `t0` trims the shoulder end; `roundStart`
 * bulges a half-disc behind the root so the shoulder rounds out of the body.
 */
export function sweep(
  S: Pt,
  C: Pt,
  H: Pt,
  off: (t: number) => number,
  t0 = 0,
  roundStart = false,
): string {
  const n = 18;
  const samples: Array<{ x: number; y: number; t: number; nx: number; ny: number }> = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((1 - t0) * i) / n;
    const u = 1 - t;
    const dx = 2 * u * (C[0] - S[0]) + 2 * t * (H[0] - C[0]);
    const dy = 2 * u * (C[1] - S[1]) + 2 * t * (H[1] - C[1]);
    const l = Math.hypot(dx, dy) || 1;
    samples.push({
      x: u * u * S[0] + 2 * u * t * C[0] + t * t * H[0],
      y: u * u * S[1] + 2 * u * t * C[1] + t * t * H[1],
      t,
      nx: -dy / l,
      ny: dx / l,
    });
  }
  const a: Pt[] = [];
  const b: Pt[] = [];
  for (const q of samples) {
    const o = off(q.t);
    a.push([q.x + q.nx * o, q.y + q.ny * o]);
    b.push([q.x - q.nx * o, q.y - q.ny * o]);
  }
  const last = samples[n] ?? { x: H[0], y: H[1], t: 1, nx: 0, ny: 1 };
  const o = off(1);
  const tip: Pt[] = [];
  for (let k = 1; k < 10; k++) {
    const th = (k / 10) * Math.PI;
    tip.push([
      H[0] + (last.nx * Math.cos(th) + last.ny * Math.sin(th)) * o,
      H[1] + (last.ny * Math.cos(th) - last.nx * Math.sin(th)) * o,
    ]);
  }
  const back: Pt[] = [];
  if (roundStart) {
    const first = samples[0] ?? { x: S[0], y: S[1], t: t0, nx: 0, ny: 1 };
    const r = off(t0);
    for (let k = 1; k < 10; k++) {
      const th = (k / 10) * Math.PI;
      back.push([
        first.x + (-first.nx * Math.cos(th) - first.ny * Math.sin(th)) * r,
        first.y + (-first.ny * Math.cos(th) + first.nx * Math.sin(th)) * r,
      ]);
    }
  }
  return `M${[...a, ...tip, ...b.reverse(), ...back].map(ptStr).join("L")}Z`;
}

/** Thick even sausage: flares slightly at the shoulder, round tip. */
export const armWidth = (p: ArmParams, t: number): number =>
  mix(p.armW * p.armTaper, p.armW, ss(0, 0.35, t)) / 2;

export function armShape(p: ArmParams, S: Pt, C: Pt, H: Pt): string {
  return sweep(S, C, H, (t) => armWidth(p, t), 0, true);
}

/**
 * The negative line: round-ended at the armpit, down the body-facing edge and a short way around
 * the underside of the tip, so it opens into the background where the tip parts from the belly.
 * The inner side is chosen once per arm (toward `bodyC`, else away from `side`) and kept along the
 * whole curve, so folded or raised arms never flip the line across the arm mid-way.
 */
export function crease(
  p: ArmParams,
  S: Pt,
  C: Pt,
  H: Pt,
  gm: number,
  side: number,
  bodyC?: Pt,
): string {
  const at = (t: number): { x: number; y: number; tx: number; ty: number } => {
    const u = 1 - t;
    const dx = 2 * u * (C[0] - S[0]) + 2 * t * (H[0] - C[0]);
    const dy = 2 * u * (C[1] - S[1]) + 2 * t * (H[1] - C[1]);
    const l = Math.hypot(dx, dy) || 1;
    return {
      x: u * u * S[0] + 2 * u * t * C[0] + t * t * H[0],
      y: u * u * S[1] + 2 * u * t * C[1] + t * t * H[1],
      tx: dx / l,
      ty: dy / l,
    };
  };
  const m = at(0.5);
  const toward: Pt = bodyC ? [bodyC[0] - m.x, bodyC[1] - m.y] : [-side, 0];
  const sg = -m.ty * toward[0] + m.tx * toward[1] >= 0 ? 1 : -1;
  const pts: Pt[] = [];
  let last = { nx: 0, ny: 1, tx: 1, ty: 0 };
  for (let i = 0; i <= 18; i++) {
    const t = 0.3 + (0.7 * i) / 18;
    const q = at(t);
    const nx = -q.ty * sg;
    const ny = q.tx * sg;
    const o = armWidth(p, t) + gm * 0.38;
    pts.push([q.x + nx * o, q.y + ny * o]);
    last = { nx, ny, tx: q.tx, ty: q.ty };
  }
  const o = armWidth(p, 1) + gm * 0.38;
  for (let k = 1; k <= 6; k++) {
    const th = (k / 6) * 1.75;
    pts.push([
      H[0] + (last.nx * Math.cos(th) + last.tx * Math.sin(th)) * o,
      H[1] + (last.ny * Math.cos(th) + last.ty * Math.sin(th)) * o,
    ]);
  }
  return `M${pts.map(ptStr).join("L")}`;
}

export function eyePath(
  type: EyeType,
  x: number,
  y: number,
  r: number,
  open: number,
  t = 0,
): ShapePath {
  switch (type) {
    case "happy":
      return {
        d: `M${fmt(x - r * 1.3)} ${fmt(y + r * 0.5)}Q${fmt(x)} ${fmt(y - r * 1.5)} ${fmt(x + r * 1.3)} ${fmt(y + r * 0.5)}`,
        stroke: true,
      };
    case "closed":
      return {
        d: `M${fmt(x - r * 1.3)} ${fmt(y - r * 0.1)}Q${fmt(x)} ${fmt(y + r * 1.1)} ${fmt(x + r * 1.3)} ${fmt(y - r * 0.1)}`,
        stroke: true,
      };
    case "spiral": {
      let d = "";
      for (let i = 0; i <= 22; i++) {
        const a = i * 0.55 + t * 6;
        const rr = (r * 1.5 * i) / 22;
        d += (i ? "L" : "M") + fmt(x + Math.cos(a) * rr) + " " + fmt(y + Math.sin(a) * rr);
      }
      return { d, stroke: true };
    }
    case "heart": {
      const s = r * 1.55;
      return {
        d: `M${fmt(x)} ${fmt(y + s * 0.9)}C${fmt(x - s * 1.6)} ${fmt(y - s * 0.1)} ${fmt(x - s * 0.7)} ${fmt(
          y - s * 1.2,
        )} ${fmt(x)} ${fmt(y - s * 0.35)}C${fmt(x + s * 0.7)} ${fmt(y - s * 1.2)} ${fmt(x + s * 1.6)} ${fmt(
          y - s * 0.1,
        )} ${fmt(x)} ${fmt(y + s * 0.9)}Z`,
      };
    }
    case "wide":
      r *= 1.4;
      break;
  }
  const ry = Math.max(0.35, r * open * (type === "wide" ? 1.1 : 1));
  return {
    d: `M${fmt(x - r)} ${fmt(y)}A${fmt(r)} ${fmt(ry)} 0 1 0 ${fmt(x + r)} ${fmt(y)}A${fmt(r)} ${fmt(ry)} 0 1 0 ${fmt(
      x - r,
    )} ${fmt(y)}Z`,
  };
}

export function mouthPath(type: MouthType, x: number, y: number, w: number, o: number): ShapePath {
  switch (type) {
    case "grin":
      return {
        d: `M${fmt(x - w)} ${fmt(y - w * 0.1)}L${fmt(x + w)} ${fmt(y - w * 0.1)}Q${fmt(x + w * 0.9)} ${fmt(
          y + w * (0.5 + o * 0.9),
        )} ${fmt(x)} ${fmt(y + w * (0.6 + o * 0.9))}Q${fmt(x - w * 0.9)} ${fmt(y + w * (0.5 + o * 0.9))} ${fmt(
          x - w,
        )} ${fmt(y - w * 0.1)}Z`,
      };
    case "o": {
      const rx = w * 0.38;
      const ry = w * (0.3 + o * 0.45);
      return {
        d: `M${fmt(x - rx)} ${fmt(y + ry * 0.6)}A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(x + rx)} ${fmt(
          y + ry * 0.6,
        )}A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(x - rx)} ${fmt(y + ry * 0.6)}Z`,
      };
    }
    case "frown":
      return {
        d: `M${fmt(x - w * 0.8)} ${fmt(y + w * 0.6)}Q${fmt(x)} ${fmt(y - w * 0.1)} ${fmt(x + w * 0.8)} ${fmt(y + w * 0.6)}`,
        stroke: true,
      };
    case "flat":
      return {
        d: `M${fmt(x - w * 0.6)} ${fmt(y + w * 0.25)}L${fmt(x + w * 0.6)} ${fmt(y + w * 0.2)}`,
        stroke: true,
      };
    case "wavy":
      return {
        d: `M${fmt(x - w * 0.8)} ${fmt(y + w * 0.3)}q${fmt(w * 0.27)} ${fmt(-w * 0.3)} ${fmt(w * 0.53)} 0t${fmt(
          w * 0.53,
        )} 0t${fmt(w * 0.53)} 0`,
        stroke: true,
      };
    default:
      return {
        d: `M${fmt(x - w)} ${fmt(y)}Q${fmt(x)} ${fmt(y + w * 0.75)} ${fmt(x + w)} ${fmt(y)}`,
        stroke: true,
      };
  }
}

export const PLANE = "M22 0L-11 -9L-4 0L-11 8Z";
export const PLANE_CREASE = "M22 0L-4 0";

export const FX_SHAPES: Record<string, string> = {
  heart: "M0 6C-9 0-5-7 0-3C5-7 9 0 0 6Z",
  spark: "M0-8L2-2L8 0L2 2L0 8L-2 2L-8 0L-2-2Z",
  tear: "M0-5C3 0 4 3 0 5C-4 3-3 0 0-5Z",
  sweat: "M0-6C4 0 5 4 0 6C-5 4-4 0 0-6Z",
  dot: "M-3 0A3 3 0 1 0 3 0A3 3 0 1 0-3 0Z",
  puff: "M-5 0A5 5 0 1 0 5 0A5 5 0 1 0-5 0Z",
};
