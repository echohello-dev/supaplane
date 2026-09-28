import { halfWidthAt, outline, type Pt } from "./geometry.js";

export type PropName = "none" | "case" | "plane" | "balloon" | "coffee" | "backpack" | "passport";
export type HatName = "none" | "cap" | "pilot" | "shades" | "beanie";
export type BodyShape = "tall" | "round" | "bean";

export interface PassengerParams {
  h: number;
  w: number;
  topN: number;
  botN: number;
  egg: number;
  /** Round top cap height as a multiple of the half-width (egg bodies; 0 = plain egg). */
  dome: number;
  /** Ghost silhouette head radius as a fraction of the half-width (0 = egg outline). */
  head: number;
  /** Ghost silhouette straight-neck length as a fraction of the height. */
  neck: number;
  /** Ghost silhouette: where the flare reaches the belly. */
  bellyAt: number;
  legLen: number;
  legW: number;
  legGap: number;
  armK: number;
  armW: number;
  armTaper: number;
  shoulderY: number;
  eyeY: number;
  eyeGap: number;
  eyeR: number;
  mouthW: number;
  scale: number;
  /** Viewing angle in degrees: 0 front, ±90 profile, 180 back. */
  yaw: number;
  /** Front-to-back depth relative to width, used when turning. */
  depth: number;
  prop: PropName;
  propSide: number;
  hat: HatName;
}

export interface RuntimeParams extends PassengerParams {
  _sh: [number, number];
  _armL: number;
}

/** Defaults are the classic passenger: the tall one on the left of the family sheet. */
export const BASE: PassengerParams = {
  h: 186,
  w: 116,
  topN: 2,
  botN: 2.3,
  egg: 0.13,
  dome: 0.92,
  head: 0.86,
  neck: 0.1,
  bellyAt: 0.62,
  legLen: 28,
  legW: 22,
  legGap: 43,
  armK: 0.42,
  armW: 20,
  armTaper: 1.35,
  shoulderY: 0.6,
  eyeY: 0.78,
  eyeGap: 20,
  eyeR: 4.8,
  mouthW: 7,
  scale: 1,
  yaw: 0,
  depth: 0.72,
  prop: "none",
  propSide: -1,
  hat: "none",
};

export const PRESETS = {
  classic: {
    h: 186,
    w: 116,
    topN: 2,
    botN: 2.3,
    egg: 0.13,
    dome: 0.92,
    head: 0.86,
    neck: 0.1,
    bellyAt: 0.62,
    legLen: 28,
    legW: 22,
    legGap: 43,
    armK: 0.42,
    armW: 20,
    shoulderY: 0.6,
    eyeY: 0.78,
    eyeGap: 20,
    eyeR: 4.8,
    mouthW: 7,
    yaw: 18,
  },
  tall: {
    dome: 0,
    head: 0,
    h: 186,
    w: 112,
    topN: 2.05,
    botN: 3.4,
    egg: 0.1,
    legLen: 20,
    legW: 25,
    legGap: 37,
    eyeY: 0.79,
    eyeGap: 13,
    armK: 0.38,
  },
  round: {
    dome: 0,
    head: 0,
    h: 142,
    w: 136,
    topN: 2.35,
    botN: 2.7,
    egg: 0,
    legLen: 15,
    legW: 27,
    legGap: 42,
    eyeY: 0.7,
    eyeGap: 14,
    armK: 0.44,
  },
  bean: {
    dome: 0,
    head: 0,
    h: 170,
    w: 122,
    topN: 2.2,
    botN: 3.1,
    egg: 0.13,
    legLen: 18,
    legW: 25,
    legGap: 38,
    eyeY: 0.76,
    armK: 0.4,
  },
  kid: {
    dome: 0,
    head: 0,
    h: 118,
    w: 100,
    topN: 2.25,
    botN: 2.6,
    egg: 0.06,
    legLen: 13,
    legW: 24,
    legGap: 34,
    eyeY: 0.7,
    eyeGap: 11,
    eyeR: 4.4,
    mouthW: 7,
    armW: 15,
    armK: 0.4,
    scale: 0.6,
  },
} satisfies Record<string, Partial<PassengerParams>>;

export type PresetName = keyof typeof PRESETS;

/** Arm-length stops for pickers: `armK` scales the arm against the body height. */
export const ARM_LENGTHS = [
  { label: "Short", armK: 0.24 },
  { label: "Classic", armK: 0.42 },
  { label: "Long", armK: 0.62 },
  { label: "Extra long", armK: 0.82 },
] as const;

/** Named turnaround angles for a model sheet. */
export const VIEWS = [
  { label: "Front", yaw: 0 },
  { label: "Three-quarter right", yaw: 45 },
  { label: "Right profile", yaw: 90 },
  { label: "Rear three-quarter", yaw: 135 },
  { label: "Back", yaw: 180 },
  { label: "Rear three-quarter left", yaw: -135 },
  { label: "Left profile", yaw: -90 },
  { label: "Three-quarter left", yaw: -45 },
] as const;

export const PROPS: readonly PropName[] = [
  "none",
  "case",
  "plane",
  "balloon",
  "coffee",
  "backpack",
  "passport",
];
export const HATS: readonly HatName[] = ["none", "cap", "pilot", "shades", "beanie"];
export const NAMES = [
  "Pip",
  "Loaf",
  "Bun",
  "Mochi",
  "Tater",
  "Dot",
  "Pebble",
  "Noodle",
  "Biscuit",
  "Puff",
  "Scone",
  "Wren",
  "Tofu",
  "Gus",
  "Bea",
  "Olo",
  "Nib",
  "Pudding",
  "Juno",
  "Kip",
  "Momo",
  "Ferg",
  "Lulu",
  "Taro",
] as const;

export type Rng = () => number;

export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomParams(r: Rng): PassengerParams {
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(r() * arr.length)] as T;
  const h = 118 + r() * 78;
  const w = 94 + r() * 46;
  const legW = 21 + r() * 8;
  const prop = r() < 0.72 ? pick(PROPS.slice(1)) : "none";
  // field order matters: it fixes the rng call sequence, so a seed always makes the same passenger
  const topN = 1.9 + r() * 0.8;
  const botN = 2.4 + r() * 1.6;
  const egg = -0.04 + r() * 0.2;
  const legLen = 10 + r() * 14;
  const legGap = legW + 9 + r() * 16;
  const dome = r() < 0.5 ? 0 : 0.95 + r() * 0.6;
  const head = r() < 0.45 ? 0.74 + r() * 0.16 : 0;
  const neck = 0.04 + r() * 0.14;
  const bellyAt = 0.5 + r() * 0.25;
  const armK = 0.24 + r() * 0.58;
  const armW = w * (0.13 + r() * 0.04);
  const armTaper = 1.2 + r() * 0.35;
  const shoulderY = 0.46 + r() * 0.1;
  const eyeY = 0.68 + r() * 0.12;
  const eyeGap = 10 + r() * 7;
  const eyeR = 3.1 + r() * 1.6;
  const mouthW = 6 + r() * 4;
  const propSide = r() < 0.5 ? -1 : 1;
  const hat = r() < 0.35 ? pick(HATS.slice(1)) : "none";
  const scale = r() < 0.18 ? 0.55 + r() * 0.15 : 0.85 + r() * 0.25;
  return {
    h,
    w,
    topN,
    botN,
    egg,
    dome,
    head,
    neck,
    bellyAt,
    legLen,
    legW,
    legGap,
    armK,
    armW,
    armTaper,
    shoulderY,
    eyeY,
    eyeGap,
    eyeR,
    mouthW,
    scale,
    yaw: 0,
    depth: 0.72,
    prop,
    propSide,
    hat,
  };
}

export function describe(p: PassengerParams): string[] {
  const a = p.h / p.w;
  const shape: BodyShape = a > 1.5 ? "tall" : a < 1.12 ? "round" : "bean";
  const arms =
    p.armK < 0.33
      ? "short arms"
      : p.armK > 0.72
        ? "extra-long arms"
        : p.armK > 0.52
          ? "long arms"
          : "classic arms";
  return [
    p.scale < 0.72 ? "tot" : shape,
    arms,
    p.prop !== "none" && p.prop,
    p.hat !== "none" && p.hat,
  ].filter(Boolean) as string[];
}

/** Shoulder anchors and arm length derived from the silhouette. */
export function withMetrics(p: PassengerParams): RuntimeParams {
  const rest = outline(p);
  const sy = -p.h * p.shoulderY;
  const hw = halfWidthAt(rest, sy);
  const shx = Math.max(hw * 0.5, hw - p.armW * p.armTaper * 0.3);
  return { ...p, _sh: [shx, sy] as [number, number], _armL: p.h * p.armK * 0.75 };
}

export const shoulderPoints = (p: RuntimeParams): [Pt, Pt] => {
  const [sx, sy] = p._sh;
  return [
    [-sx, sy],
    [sx, sy],
  ];
};
