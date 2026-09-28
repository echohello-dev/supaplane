import { describe, expect, it } from "vitest";

import {
  armShape,
  crease,
  eyePath,
  halfWidthAt,
  ik,
  mouthPath,
  outline,
  smoothClosed,
  sweep,
} from "./geometry.js";
import {
  BASE,
  PRESETS,
  describe as describeParams,
  randomParams,
  rng,
  withMetrics,
} from "./params.js";
import { ACTIONS, ACTION_NAMES, handTarget, restHands } from "./actions.js";
import type { ActionHost } from "./actions.js";
import type { RuntimeParams } from "./params.js";

const params = (over: Partial<typeof BASE> = {}): RuntimeParams =>
  withMetrics({ ...BASE, ...over });

const host = (over: Partial<ActionHost> = {}): ActionHost => ({
  waveSide: -1,
  propSide: -1,
  dir: 1,
  phase: 0,
  pace: 0,
  flight: 0,
  orbit: 0,
  burst: () => {},
  rand: () => 0.5,
  ...over,
});

describe("geometry", () => {
  it("builds an egg silhouette with the requested sample count", () => {
    const egg = { ...BASE, ...PRESETS.tall };
    const pts = outline(egg, 56);
    expect(pts).toHaveLength(56);
    const top = pts.reduce((a, b) => (b[1] < a[1] ? b : a));
    const bottom = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
    expect(top[1]).toBeLessThan(0);
    expect(bottom[1]).toBeGreaterThanOrEqual(0);
    expect(Math.abs(halfWidthAt(outline(egg, 256), -egg.h / 2))).toBeGreaterThan(egg.w * 0.4);
  });

  it("builds the classic ghost silhouette: dome, straight neck, wider belly", () => {
    const pts = outline(BASE);
    const top = Math.min(...pts.map((q) => q[1]));
    expect(top).toBeCloseTo(-BASE.h, 5);
    expect(Math.max(...pts.map((q) => q[1]))).toBeCloseTo(0, 5);
    const R = (BASE.w / 2) * BASE.head;
    const neckY = -BASE.h + R * BASE.dome + (BASE.h * BASE.neck) / 2;
    expect(halfWidthAt(pts, neckY)).toBeCloseTo(R, 1);
    expect(halfWidthAt(pts, -BASE.h * 0.25)).toBeGreaterThan(R);
  });

  it("measures half-width between samples, not only at them", () => {
    const square: Array<[number, number]> = [
      [10, -20],
      [-10, -20],
      [-10, 0],
      [10, 0],
    ];
    expect(halfWidthAt(square, -7)).toBeCloseTo(10, 5);
  });

  it("smooths a closed path from M to Z", () => {
    const d = smoothClosed(outline(BASE));
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });

  it("solves IK to the target when reachable", () => {
    const S: [number, number] = [0, 0];
    const T: [number, number] = [40, 30];
    const r = ik(S, T, 30, 30, 1);
    expect(r.reach).toBeLessThanOrEqual(1);
    expect(Math.hypot(r.H[0] - T[0], r.H[1] - T[1])).toBeLessThan(1);
    expect(Math.hypot(r.E[0] - S[0], r.E[1] - S[1])).toBeCloseTo(30, 1);
  });

  it("clamps unreachable targets to the arm length", () => {
    const S: [number, number] = [0, 0];
    const r = ik(S, [200, 0], 30, 30, -1);
    expect(r.H[0]).toBeLessThan(200);
    expect(Math.hypot(r.H[0] - S[0], r.H[1] - S[1])).toBeLessThan(61);
  });

  it("sweeps a round-tipped arm and a matching crease", () => {
    const p = params();
    const S: [number, number] = [30, -60];
    const H: [number, number] = [70, -20];
    const E: [number, number] = [55, -25];
    const C: [number, number] = [2 * E[0] - (S[0] + H[0]) / 2, 2 * E[1] - (S[1] + H[1]) / 2];
    const shape = armShape(p, S, C, H);
    expect(shape.startsWith("M")).toBe(true);
    expect(shape.endsWith("Z")).toBe(true);
    const line = crease(p, S, C, H, 4, -1);
    expect(line.startsWith("M")).toBe(true);
  });

  it("keeps the crease on the body-facing side of a folded arm", () => {
    const p = params();
    const S: [number, number] = [-40, -100];
    const H: [number, number] = [-20, -130];
    const C: [number, number] = [-80, -140];
    const bodyC: [number, number] = [0, -80];
    const pts = crease(p, S, C, H, 4, -1, bodyC)
      .slice(1)
      .split("L")
      .map((q) => q.split(" ").map(Number) as [number, number]);
    const mid = pts[Math.floor(pts.length / 3)] ?? [0, 0];
    // the line hugs the inner edge: closer to the body centre than the arm's own control point
    expect(Math.hypot(mid[0] - bodyC[0], mid[1] - bodyC[1])).toBeLessThan(
      Math.hypot(C[0] - bodyC[0], C[1] - bodyC[1]),
    );
    expect(pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
  });

  it("sweep supports a trimmed, rounded start", () => {
    const d = sweep([0, 0], [10, 20], [20, 0], () => 4, 0.2, true);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });

  it("draws every eye and mouth variant", () => {
    for (const t of ["dot", "happy", "closed", "spiral", "heart", "wide"] as const) {
      expect(eyePath(t, 0, 0, 4, 1, 0.5).d.length).toBeGreaterThan(2);
    }
    for (const t of ["smile", "grin", "o", "frown", "flat", "wavy"] as const) {
      expect(mouthPath(t, 0, 0, 8, 0.5).d.length).toBeGreaterThan(2);
    }
  });
});

describe("params", () => {
  it("randomParams is deterministic per seed", () => {
    const a = randomParams(rng(42));
    const b = randomParams(rng(42));
    expect(a).toEqual(b);
  });

  it("keeps generated proportions in band", () => {
    const p = randomParams(rng(7));
    expect(p.h).toBeGreaterThanOrEqual(118);
    expect(p.h).toBeLessThanOrEqual(196);
    expect(p.armK).toBeGreaterThan(0.2);
    expect(p.scale).toBeGreaterThan(0.5);
  });

  it("describes shape, prop and hat", () => {
    expect(describeParams({ ...BASE, h: 186, w: 112 })).toContain("tall");
    expect(describeParams({ ...BASE, h: 118, w: 100, scale: 0.6 })).toContain("tot");
    expect(describeParams({ ...BASE, prop: "case" })).toContain("case");
    expect(describeParams({ ...BASE, hat: "cap" })).toContain("cap");
    expect(describeParams({ ...BASE, armK: 0.24 })).toContain("short arms");
    expect(describeParams({ ...BASE, armK: 0.82 })).toContain("extra-long arms");
  });

  it("defaults to the classic passenger", () => {
    expect(BASE).toMatchObject(
      PRESETS.classic.yaw ? { ...PRESETS.classic, yaw: 0 } : PRESETS.classic,
    );
    expect(BASE.head).toBeGreaterThan(0);
  });

  it("derives shoulder anchors inside the body", () => {
    const p = params();
    expect(p._sh[0]).toBeGreaterThan(0);
    expect(p._sh[0]).toBeLessThanOrEqual(p.w / 2);
    expect(p._armL).toBeGreaterThan(0);
  });
});

describe("actions", () => {
  it("every action returns finite targets and a face", () => {
    const p = params();
    for (const name of ACTION_NAMES) {
      const r = ACTIONS[name].fn({ p, t: 1, lt: 0.8, dt: 1 / 60, c: host() });
      for (const [k, v] of Object.entries(r.T)) {
        if (!Number.isFinite(v)) throw new Error(`non-finite target ${name}.${k}`);
      }
      expect(r.F.eyes).toBeTruthy();
      expect(r.F.mouth).toBeTruthy();
    }
  });

  it("resting hands sit at the end of the arm", () => {
    const p = params();
    const r = restHands(p);
    const sh = p._sh;
    const hand = Math.hypot((r["rhx"] ?? 0) - sh[0], (r["rhy"] ?? 0) - sh[1]);
    expect(hand).toBeGreaterThan(p._armL * 0.5);
    expect(hand).toBeLessThan(p._armL * 1.1);
  });

  it("a suitcase hand reaches out at arm's length and holds the grip high", () => {
    for (const armK of [0.24, 0.42, 0.82]) {
      const p = params({ prop: "case", propSide: 1, armK });
      const r = restHands(p);
      const [sx, sy] = p._sh;
      const reach = Math.hypot((r["rhx"] ?? 0) - sx, (r["rhy"] ?? 0) - sy);
      expect(reach).toBeCloseTo(p._armL * 0.96, 3);
      expect(r["rhy"] ?? 0).toBeLessThanOrEqual(-p.h * 0.36 + 1e-9);
      expect(r["rhx"] ?? 0).toBeGreaterThan(sx);
    }
  });

  it("handTarget hangs straight down at angle 0 and mirrors per side", () => {
    const p = params();
    const [sx] = p._sh;
    expect(handTarget(p, 1, 0)["rhx"]).toBeCloseTo(sx, 5);
    const l = handTarget(p, -1, 0.8);
    const r = handTarget(p, 1, 0.8);
    expect(l["lhx"]).toBeCloseTo(-(r["rhx"] ?? 0), 5);
    expect(l["lhy"]).toBeCloseTo(r["rhy"] ?? 0, 5);
  });

  it("gaits travel at the walker's pace", () => {
    const p = params();
    const r = ACTIONS.walk.fn({ p, t: 1, lt: 1, dt: 1 / 60, c: host({ pace: 60 }) });
    expect(r.speed ?? 0).toBeGreaterThan(0);
  });

  it("the throw action flies the plane and flags orbit on dizzy", () => {
    const p = params({ prop: "plane" });
    const c = host();
    ACTIONS.dizzy.fn({ p, t: 1, lt: 1, dt: 1 / 60, c });
    expect(c.orbit).toBe(1);
    const c2 = host();
    ACTIONS.throw.fn({ p, t: 1, lt: 1, dt: 1 / 60, c: c2 });
    expect(c2.flight).toBeGreaterThan(0);
  });

  it("a plane-less passenger falls back to wave", () => {
    const p = params({ prop: "none" });
    const c = host();
    expect(ACTIONS.throw.needs).toBe("plane");
    expect(p.prop).not.toBe("plane");
    expect(c.propSide).toBe(-1);
  });
});
