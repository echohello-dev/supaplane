import {
  ACTIONS,
  ACTION_NAMES,
  ARM_LENGTHS,
  BASE,
  clock,
  describe as describeParams,
  HATS,
  NAMES,
  PALETTES,
  Passenger,
  PRESETS,
  PROPS,
  randomParams,
  rng,
  Stage,
  startClock,
  stepAll,
  VIEWS,
  type ActionName,
  type OverlapMode,
  type PassengerParams,
  type PresetName,
  type Rng,
} from "../src/index.js";

const $ = <T extends Element>(sel: string): T => document.querySelector(sel) as T;
const $$ = <T extends Element>(sel: string): T[] => [...document.querySelectorAll(sel)] as T[];

type Tagged = Passenger & { base?: ActionName; autoAt?: number; autoUntil?: number };

const q = new URLSearchParams(location.search);
const R: Rng = rng(Number(q.get("seed")) || 20260927);
const pick = <T>(arr: readonly T[], r: Rng = R): T => arr[Math.floor(r() * arr.length)] as T;
const EMOTE: ActionName[] = [
  "wave",
  "cheer",
  "jump",
  "dance",
  "love",
  "shy",
  "think",
  "laugh",
  "surprised",
  "sleepy",
  "sad",
  "grumpy",
  "scared",
  "dizzy",
];
const LOOPS = new Set<ActionName>(ACTION_NAMES.filter((k) => ACTIONS[k].loop));
let palette = q.get("palette") ?? "navy";

function chips(el: Element, names: readonly ActionName[], onPick: (n: ActionName) => void): void {
  el.innerHTML = "";
  for (const n of names) {
    const b = document.createElement("button");
    b.textContent = ACTIONS[n].label;
    b.dataset["action"] = n;
    b.onclick = () => onPick(n);
    el.appendChild(b);
  }
}

interface PilotOpts {
  gap?: number;
  first?: number;
}

function autopilot(
  stage: Stage,
  pool: readonly ActionName[],
  opts: PilotOpts = {},
): (t: number) => void {
  // every passenger gets its own rhythm: an emotion now and then, back to its base action after
  return (t) => {
    for (const c of stage.chars as Tagged[]) {
      const base = c.base ?? "idle";
      if (c.autoUntil && t > c.autoUntil && c.action !== base) {
        c.play(base);
        c.autoUntil = 0;
      }
      if (!c.autoAt) c.autoAt = t + 1 + R() * (opts.first ?? 4);
      if (t > c.autoAt && c.action === base) {
        const a = pick(pool.filter((n) => !ACTIONS[n].needs || c.p.prop === ACTIONS[n].needs));
        c.play(a, { then: base });
        c.autoUntil = LOOPS.has(a) ? t + 2.8 + R() * 2 : 0;
        c.autoAt = t + (opts.gap ?? 4) + R() * (opts.gap ?? 4);
      }
    }
  };
}

const ticks: Array<(t: number) => void> = [];
startClock((t) => {
  if (!clock.fixed) ticks.forEach((fn) => fn(t));
});

function save(text: string, name: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- family ---------- */
const fam = new Stage($<SVGSVGElement>("#familyStage"), {
  seed: 11,
  palette,
  wrap: (c) => {
    if (c.X > 850) c.X -= 940;
    if (c.X < -90) c.X += 940;
  },
});
fam.fit([0, 0, 760, 380]);
const G = 318;
fam.add({ ...PRESETS.classic }, { x: 150, ground: G, phase: 0 });
fam.add({ ...PRESETS.round, prop: "case", propSide: -1 }, { x: 338, ground: G, phase: 1.3 });
const K = fam.add({ ...PRESETS.kid }, { x: 522, ground: G, phase: 2.1 }) as Tagged;
const D = fam.add({ ...PRESETS.bean, h: 176, w: 124 }, { x: 612, ground: G, phase: 0.6 }) as Tagged;
fam.link(D, 0, K, 1);
fam.world.appendChild(K.el); // the tot stands in front, as in the source art
let famWalking = false;
let famAuto = true;
const famPilot = autopilot(
  fam,
  ["wave", "cheer", "jump", "dance", "love", "shy", "think", "laugh", "surprised", "sleepy"],
  { gap: 3.5 },
);
ticks.push((t) => {
  if (famAuto && !famWalking) famPilot(t);
});
chips(
  $<Element>("#familyActions"),
  [
    "idle",
    "wave",
    "cheer",
    "jump",
    "dance",
    "love",
    "shy",
    "think",
    "laugh",
    "surprised",
    "sad",
    "grumpy",
    "scared",
    "sleepy",
    "dizzy",
  ],
  (n) => {
    famWalking = false;
    $<HTMLButtonElement>("#familyWalk").setAttribute("aria-pressed", "false");
    fam.chars.forEach((c, i) => {
      const tc = c as Tagged;
      setTimeout(() => {
        tc.base = LOOPS.has(n) ? n : "idle";
        tc.play(n, { then: "idle" });
        tc.autoAt = clock.t + 6;
      }, i * 90);
    });
  },
);
$<HTMLButtonElement>("#familyWalk").onclick = (e) => {
  famWalking = !famWalking;
  (e.currentTarget as HTMLButtonElement).setAttribute("aria-pressed", String(famWalking));
  for (const c of fam.chars as Tagged[]) {
    c.pace = famWalking ? 52 : 0;
    c.base = famWalking ? "walk" : "idle";
    c.play(c.base, { dir: 1 });
  }
};
$<HTMLInputElement>("#familyHold").onchange = (e) => {
  const off = !(e.target as HTMLInputElement).checked;
  for (const l of fam.links) l.off = off;
};
$<HTMLInputElement>("#familyAuto").onchange = (e) => {
  famAuto = (e.target as HTMLInputElement).checked;
};
fam.svg.addEventListener("click", (ev) => {
  const hit = fam.hit(fam.toLocal(ev) ?? [0, 0]);
  if (!hit) return;
  const c = hit as Tagged;
  c.play(pick(["surprised", "laugh", "jump", "love", "cheer"] as const), {
    then: c.base ?? "idle",
  });
  c.autoUntil = LOOPS.has(c.action) ? clock.t + 2.5 : 0;
  c.autoAt = clock.t + 5;
});

/* ---------- turnaround ---------- */
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const turn = new Stage($<SVGSVGElement>("#turnStage"), { seed: 17, palette });
const turnHero = turn.add(
  { ...PRESETS.classic, yaw: 30 },
  { x: 220, ground: 295, phase: 0, seed: 17 },
);
turnHero.inPlace = true;
let turnParams: PassengerParams = { ...BASE, ...PRESETS.classic };
let turnAction: ActionName = "idle";
let turnSpinning = !q.has("yaw") && q.get("spin") !== "0" && !reduceMotion;
let turnLast = clock.t;
const turnViews = VIEWS.map((view) => {
  const fig = document.createElement("figure");
  fig.className = "card";
  fig.innerHTML = `<svg viewBox="0 0 300 300" role="img" aria-label="${view.label} passenger"></svg><figcaption><span><b>${view.label}</b><span class="tags">${view.yaw}°</span></span><span class="acts"><button>View</button></span></figcaption>`;
  $<Element>("#turnGrid").appendChild(fig);
  const st = new Stage(fig.querySelector("svg") as unknown as SVGSVGElement, { seed: 17, palette });
  const c = st.add({ ...turnParams, yaw: view.yaw }, { x: 150, ground: 251, phase: 0, seed: 17 });
  c.inPlace = true;
  fig.querySelector<HTMLButtonElement>("button")!.onclick = () => {
    setTurnAngle(view.yaw, true);
    $<HTMLElement>("#turnStage").scrollIntoView({ block: "center" });
  };
  st.label = view.label;
  return st;
});
function setTurnAngle(yaw: number, manual = false): void {
  if (manual) turnSpinning = false;
  turnHero.p.yaw = yaw;
  $<HTMLInputElement>("#turnAngle").value = String(Math.round(yaw));
  $<HTMLOutputElement>("#turnAngleValue").value = `${Math.round(yaw)}°`;
  $<HTMLButtonElement>("#turnSpin").setAttribute("aria-pressed", String(turnSpinning));
  for (const b of $$<HTMLButtonElement>("#turnViews button")) {
    b.setAttribute("aria-pressed", String(Math.abs(Number(b.dataset["yaw"]) - yaw) < 0.5));
  }
}
function updateTurn(p: Partial<PassengerParams>): void {
  turnParams = { ...turnParams, ...p };
  const extent = turnParams.w / 2 + turnParams.h * turnParams.armK * 0.75 + turnParams.armW;
  const tall = turnParams.h + turnParams.legLen;
  turnHero.setParams({
    ...turnParams,
    yaw: turnHero.p.yaw,
    scale: Math.min(1.12, 180 / extent, 240 / tall),
  });
  turnViews.forEach((st, i) =>
    st.chars[0]?.setParams({
      ...turnParams,
      yaw: VIEWS[i]?.yaw ?? 0,
      scale: Math.min(0.95, 130 / extent, 195 / tall),
    }),
  );
}
function playTurn(n: ActionName): void {
  turnAction = n;
  for (const st of [turn, ...turnViews]) st.chars[0]?.play(n, { then: n });
  for (const b of $$<HTMLButtonElement>("#turnActions button")) {
    b.setAttribute("aria-pressed", String(b.dataset["action"] === n));
  }
}
for (const k of Object.keys(PRESETS) as PresetName[]) {
  $<HTMLSelectElement>("#turnShape").add(new Option(k[0]!.toUpperCase() + k.slice(1), k));
}
$<HTMLSelectElement>("#turnShape").add(new Option("Custom from lab", "custom"));
for (const a of ARM_LENGTHS)
  $<HTMLSelectElement>("#turnArms").add(new Option(a.label, String(a.armK)));
$<HTMLSelectElement>("#turnArms").add(new Option("Custom from lab", "custom"));
$<HTMLSelectElement>("#turnArms").value = String(turnParams.armK);
$<HTMLSelectElement>("#turnShape").onchange = (e) => {
  const v = (e.target as HTMLSelectElement).value;
  if (v === "custom") useLabTurn();
  else updateTurn({ ...BASE, ...PRESETS[v as PresetName], armK: turnParams.armK });
};
$<HTMLSelectElement>("#turnArms").onchange = (e) => {
  const v = (e.target as HTMLSelectElement).value;
  updateTurn({ armK: v === "custom" ? L.p.armK : Number(v) });
};
$<HTMLInputElement>("#turnAngle").oninput = (e) =>
  setTurnAngle(Number((e.target as HTMLInputElement).value), true);
$<HTMLButtonElement>("#turnSpin").onclick = () => {
  turnSpinning = !turnSpinning;
  setTurnAngle(turnHero.p.yaw);
};
for (const view of VIEWS.filter((v) => [0, 45, 90, 180, -90].includes(v.yaw))) {
  const b = document.createElement("button");
  b.textContent = view.label;
  b.dataset["yaw"] = String(view.yaw);
  b.onclick = () => setTurnAngle(view.yaw, true);
  $<Element>("#turnViews").appendChild(b);
}
chips($<Element>("#turnActions"), ["idle", "walk", "wave", "run", "dance"], playTurn);
const qAction = q.get("action");
playTurn(qAction && qAction in ACTIONS ? (qAction as ActionName) : "idle");
updateTurn({});
setTurnAngle(q.has("yaw") && Number.isFinite(Number(q.get("yaw"))) ? Number(q.get("yaw")) : 30);
ticks.push((t) => {
  const dt = Math.max(0, Math.min(0.1, t - turnLast));
  turnLast = t;
  if (turnSpinning) setTurnAngle(((turnHero.p.yaw + dt * 24 + 180) % 360) - 180);
});
function useLabTurn(): void {
  updateTurn({ ...L.p });
  $<HTMLSelectElement>("#turnShape").value = "custom";
  $<HTMLSelectElement>("#turnArms").value = ARM_LENGTHS.some((a) => a.armK === L.p.armK)
    ? String(L.p.armK)
    : "custom";
  setTurnAngle(L.p.yaw, true);
  playTurn(turnAction);
}
$<HTMLButtonElement>("#turnFromLab").onclick = useLabTurn;
$<HTMLButtonElement>("#turnToLab").onclick = () => {
  setLab({ ...turnParams, yaw: turnHero.p.yaw, scale: 1 });
  $<HTMLElement>("#lab").scrollIntoView();
};
$<HTMLButtonElement>("#turnDownload").onclick = () => {
  const NS = "http://www.w3.org/2000/svg";
  const big = document.createElementNS(NS, "svg");
  big.setAttribute("xmlns", NS);
  big.setAttribute("viewBox", "0 0 1200 660");
  turnViews.forEach((st, i) => {
    const n = st.svg.cloneNode(true) as SVGSVGElement;
    n.querySelectorAll(".rigview").forEach((el) => el.remove());
    const box: Record<string, string | number> = {
      x: (i % 4) * 300,
      y: Math.floor(i / 4) * 330,
      width: 300,
      height: 330,
      viewBox: "0 0 300 330",
    };
    for (const [k, v] of Object.entries(box)) n.setAttribute(k, String(v));
    n.querySelectorAll(":scope > rect").forEach((el) => el.setAttribute("height", "330"));
    const label = document.createElementNS(NS, "text");
    label.textContent = `${st.label} · ${VIEWS[i]?.yaw ?? 0}°`;
    const attrs: Record<string, string | number> = {
      x: 150,
      y: 303,
      "text-anchor": "middle",
      fill: PALETTES[palette as keyof typeof PALETTES]?.body ?? "#EDE3C4",
      "font-family": "Avenir Next, sans-serif",
      "font-size": 12,
    };
    for (const [k, v] of Object.entries(attrs)) label.setAttribute(k, String(v));
    n.appendChild(label);
    big.appendChild(n);
  });
  save(new XMLSerializer().serializeToString(big), "supaplane-turnaround.svg");
};

/* ---------- arm lengths ---------- */
const armStudies = ARM_LENGTHS.map(({ label, armK }) => {
  const fig = document.createElement("figure");
  fig.className = "card";
  fig.innerHTML = `<svg viewBox="0 0 300 300" role="img" aria-label="${label} rounded arms"></svg><figcaption><span><b>${label}</b><span class="tags">${Math.round((armK / 0.42) * 100)}% of classic length</span></span><span class="acts"><button>Edit</button></span></figcaption>`;
  $<Element>("#armGrid").appendChild(fig);
  const st = new Stage(fig.querySelector("svg") as unknown as SVGSVGElement, { seed: 17, palette });
  const c = st.add(
    { ...PRESETS.bean, h: 166, w: 112, armK, armW: 19, scale: 0.95 },
    { x: 150, ground: 256, seed: 17, phase: 0 },
  );
  c.inPlace = true;
  fig.querySelector<HTMLButtonElement>("button")!.onclick = () => {
    setLab({ ...c.p, scale: 1 });
    $<HTMLElement>("#lab").scrollIntoView();
  };
  return st;
});
function compareArms(n: ActionName): void {
  for (const st of armStudies) st.chars[0]?.play(n, { then: n });
  for (const b of $$<HTMLButtonElement>("#armActions button")) {
    b.setAttribute("aria-pressed", String(b.dataset["action"] === n));
  }
}
chips($<Element>("#armActions"), ["idle", "walk", "wave"], compareArms);
compareArms("idle");

/* ---------- variants ---------- */
let baseSeed = Number(q.get("seed")) || Math.floor(Math.random() * 1e6);
interface Card {
  fig: HTMLElement;
  st: Stage;
  seed: number;
  i: number;
}
const cards: Card[] = [];
const gridPool: ActionName[] = [...EMOTE, "walk", "hop", "throw"];
let gridAuto = true;
let everyone = "";

function roll(card: Card, seed: number): void {
  card.seed = seed;
  card.st.clear();
  const r = rng(seed);
  const p = randomParams(r);
  const tags = describeParams(p);
  p.scale = Math.max(0.62, p.scale);
  // fit height and arm reach (plus a held case or plane) inside the card
  const tall = (p.h + p.legLen) * p.scale;
  const held = p.prop === "case" ? p.w * 0.16 : p.prop === "plane" ? 24 : 0;
  const reach = (p.w / 2 + p.h * p.armK * 0.75 + p.armW + held) * p.scale;
  p.scale *= Math.min(1, 190 / tall, 122 / reach);
  const c = card.st.add(p, { x: 130, ground: 226, seed, phase: r() * 6 }) as Tagged;
  c.inPlace = true;
  c.base = "idle";
  c.name = NAMES[seed % NAMES.length] ?? "Pip";
  if (everyone) c.play(everyone as ActionName);
  card.fig.querySelector("b")!.textContent = c.name;
  card.fig.querySelector(".tags")!.textContent = tags.join(" · ");
}

function makeCard(i: number): Card {
  const fig = document.createElement("figure");
  fig.className = "card";
  fig.innerHTML = `<span class="now"></span><svg viewBox="0 0 260 250" role="img"></svg><figcaption><span><b></b> <span class="tags"></span></span><span class="acts"><button data-r>↻</button><button data-e>Edit</button></span></figcaption>`;
  $<Element>("#grid").appendChild(fig);
  const st = new Stage(fig.querySelector("svg") as unknown as SVGSVGElement, {
    seed: i + 3,
    palette,
  });
  const card: Card = { fig, st, seed: 0, i };
  (fig.querySelector("svg") as unknown as SVGSVGElement).onclick = () => {
    const c = st.chars[0] as Tagged;
    const order = ACTION_NAMES.filter((n) => n !== "run") as ActionName[];
    const n = order[(order.indexOf(c.action) + 1) % order.length] ?? "idle";
    c.play(n, c.base ? { then: c.base } : {});
    c.autoAt = clock.t + 8;
    c.autoUntil = LOOPS.has(n) ? clock.t + 6 : 0;
  };
  fig.querySelector<HTMLButtonElement>("[data-r]")!.onclick = () =>
    roll(card, Math.floor(Math.random() * 1e6));
  fig.querySelector<HTMLButtonElement>("[data-e]")!.onclick = () => {
    setLab({ ...(st.chars[0] as Tagged).p });
    $<HTMLElement>("#lab").scrollIntoView();
  };
  cards.push(card);
  return card;
}

function rollAll(): void {
  cards.forEach((c, i) => roll(c, baseSeed + i * 7919));
  $<HTMLElement>("#seedLabel").textContent = `seed ${baseSeed}`;
}
for (let i = 0; i < 12; i++) makeCard(i);
rollAll();
const gridPilots = cards.map((c) => autopilot(c.st, gridPool, { gap: 3 }));
ticks.push((t) => {
  if (gridAuto && !everyone) gridPilots.forEach((fn) => fn(t));
  for (const c of cards) {
    const a = (c.st.chars[0] as Tagged | undefined)?.action ?? "idle";
    const el = c.fig.querySelector<HTMLElement>(".now");
    if (el && el.textContent !== a) el.textContent = a;
  }
});
$<HTMLButtonElement>("#reroll").onclick = () => {
  baseSeed = Math.floor(Math.random() * 1e6);
  rollAll();
};
$<HTMLInputElement>("#gridAuto").onchange = (e) => {
  gridAuto = (e.target as HTMLInputElement).checked;
};
for (const n of ACTION_NAMES) {
  const o = document.createElement("option");
  o.value = n;
  o.textContent = ACTIONS[n].label;
  $<HTMLSelectElement>("#everyone").appendChild(o);
}
$<HTMLSelectElement>("#everyone").onchange = (e) => {
  everyone = (e.target as HTMLSelectElement).value;
  cards.forEach((c, i) => {
    const p = c.st.chars[0] as Tagged;
    setTimeout(() => {
      p.base = everyone && LOOPS.has(everyone as ActionName) ? (everyone as ActionName) : "idle";
      p.play((everyone as ActionName) || "idle", { then: "idle" });
    }, i * 60);
  });
};

/* ---------- rig lab ---------- */
const lab = new Stage($<SVGSVGElement>("#labStage"), { seed: 5, palette });
lab.fit([0, 0, 400, 350]);
lab.rig = true;
const L = lab.add({ ...PRESETS.classic }, { x: 200, ground: 300, phase: 0 }) as Tagged;
L.base = "idle";
const SL: Array<[keyof PassengerParams, string, number, number, number]> = [
  ["yaw", "Viewing angle", -180, 180, 1],
  ["depth", "Body depth", 0.5, 1, 0.01],
  ["h", "Height", 100, 220, 1],
  ["w", "Width", 80, 150, 1],
  ["topN", "Dome", 1.6, 3.2, 0.05],
  ["botN", "Base flat", 2, 5, 0.05],
  ["egg", "Taper", -0.1, 0.3, 0.01],
  ["dome", "Dome (0 = egg)", 0, 2, 0.05],
  ["head", "Head (0 = egg)", 0, 1, 0.01],
  ["neck", "Neck", 0, 0.3, 0.01],
  ["legLen", "Leg length", 4, 34, 1],
  ["legW", "Leg width", 16, 34, 1],
  ["legGap", "Stance", 26, 64, 1],
  ["armK", "Arm length", 0.22, 0.85, 0.01],
  ["armW", "Arm thickness", 7, 26, 0.5],
  ["armTaper", "Shoulder flare", 1, 2.2, 0.05],
  ["shoulderY", "Shoulder", 0.36, 0.7, 0.01],
  ["eyeY", "Eye height", 0.6, 0.88, 0.01],
  ["eyeGap", "Eye gap", 7, 22, 0.5],
  ["eyeR", "Eye size", 2.4, 6, 0.1],
  ["mouthW", "Smile", 4, 14, 0.5],
  ["scale", "Scale", 0.45, 1.2, 0.01],
];
for (const [k, label, min, max, step] of SL) {
  const row = document.createElement("label");
  row.className = "sl";
  row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" data-k="${k}"><output></output>`;
  row.querySelector("input")!.oninput = (e) => {
    setLab({ [k]: Number((e.target as HTMLInputElement).value) } as Partial<PassengerParams>);
  };
  $<Element>("#sliders").appendChild(row);
}
for (const { label, armK } of ARM_LENGTHS) {
  const b = document.createElement("button");
  b.textContent = label;
  b.dataset["armK"] = String(armK);
  b.onclick = () => setLab({ armK });
  $<Element>("#armPresets").appendChild(b);
}
for (const { label, yaw } of VIEWS.filter((v) => [0, 45, 90, 180, -90].includes(v.yaw))) {
  const b = document.createElement("button");
  b.textContent = label;
  b.dataset["yaw"] = String(yaw);
  b.onclick = () => setLab({ yaw });
  $<Element>("#viewPresets").appendChild(b);
}
for (const p of PROPS) $<HTMLSelectElement>("#labProp").add(new Option(p, p));
for (const p of HATS) $<HTMLSelectElement>("#labHat").add(new Option(p, p));
$<HTMLSelectElement>("#labProp").onchange = (e) =>
  setLab({ prop: (e.target as HTMLSelectElement).value as PassengerParams["prop"] });
$<HTMLSelectElement>("#labHat").onchange = (e) =>
  setLab({ hat: (e.target as HTMLSelectElement).value as PassengerParams["hat"] });
$<HTMLSelectElement>("#labSide").onchange = (e) =>
  setLab({ propSide: Number((e.target as HTMLSelectElement).value) });

function setLab(p: Partial<PassengerParams>): void {
  L.setParams(p);
  for (const inp of $$<HTMLInputElement>("#sliders input")) {
    const k = inp.dataset["k"] as keyof PassengerParams;
    const v = L.p[k];
    inp.value = String(v);
    const out = inp.nextElementSibling as HTMLOutputElement;
    out.textContent = typeof v === "number" ? v.toFixed(Number(inp.step) < 1 ? 2 : 0) : String(v);
  }
  $<HTMLSelectElement>("#labProp").value = L.p.prop;
  $<HTMLSelectElement>("#labHat").value = L.p.hat;
  $<HTMLSelectElement>("#labSide").value = String(L.p.propSide);
  for (const b of $$<HTMLButtonElement>("#armPresets button")) {
    b.setAttribute("aria-pressed", String(Math.abs(Number(b.dataset["armK"]) - L.p.armK) < 0.005));
  }
  for (const b of $$<HTMLButtonElement>("#viewPresets button")) {
    b.setAttribute("aria-pressed", String(Math.abs(Number(b.dataset["yaw"]) - L.p.yaw) < 0.5));
  }
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(BASE) as Array<keyof PassengerParams>) {
    const v = L.p[k];
    out[k] = typeof v === "number" ? Math.round(v * 100) / 100 : v;
  }
  $<HTMLElement>("#labJson").textContent = JSON.stringify(out, null, 1);
}
setLab({});
chips($<Element>("#labActions"), ACTION_NAMES, (n) => {
  L.base = LOOPS.has(n) && !ACTIONS[n].travel ? n : "idle";
  L.inPlace = true;
  L.play(n, { then: "idle" });
});
L.inPlace = true;
$<HTMLButtonElement>("#labRandom").onclick = () => {
  const p = randomParams(rng(Math.floor(Math.random() * 1e6)));
  p.scale = 1;
  setLab(p);
};
const presetNames = Object.keys(PRESETS) as PresetName[];
$<HTMLButtonElement>("#labPreset").onclick = (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  const i = (Number(btn.dataset["i"]) + 1) % presetNames.length;
  btn.dataset["i"] = String(i);
  const name = presetNames[i] ?? "classic";
  btn.textContent = "Preset: " + name;
  setLab({ ...BASE, ...PRESETS[name], scale: 1, prop: L.p.prop, hat: L.p.hat });
};
$<HTMLButtonElement>("#labCopy").onclick = () =>
  navigator.clipboard?.writeText($<HTMLElement>("#labJson").textContent ?? "");
$<SVGSVGElement>("#labStage").addEventListener("click", () => {
  L.play(pick(["surprised", "laugh", "jump", "cheer"] as const), { then: L.base ?? "idle" });
});

/* ---------- parade ---------- */
const par = new Stage($<SVGSVGElement>("#paradeStage"), {
  seed: 9,
  palette,
  wrap: (c) => {
    if (c.X > 1760) c.X -= 1960;
  },
});
par.fit([0, 0, 1600, 440]);
par.deco.innerHTML =
  '<path d="M0 402H1600" stroke-width="3" stroke-dasharray="2 14" stroke-linecap="round"/>';
let parPilot: (t: number) => void = () => {};
function crowd(seed: number): void {
  par.clear();
  const r = rng(seed);
  let x = 40;
  for (let i = 0; i < 6; i++) {
    const p = randomParams(r);
    if (i === 3) {
      p.prop = "plane";
      p.scale = 1;
    }
    const c = par.add(p, { x, ground: 400, seed: seed + i, phase: r() * 6, dir: 1 }) as Tagged;
    c.pace = 60 + r() * 4;
    c.base = "walk";
    c.play("walk");
    if (i === 5) {
      c.pace = 150;
      c.base = "run";
      c.play("run");
    }
    x += 240 + r() * 30;
  }
  // a parent + tot pair holding hands
  const pa = par.add(
    { ...PRESETS.bean, prop: "case", propSide: 1 },
    { x: x + 70, ground: 400, seed: seed + 20, dir: 1 },
  ) as Tagged;
  const kid = par.add(
    { ...PRESETS.kid },
    { x: x - 40, ground: 400, seed: seed + 21, dir: 1 },
  ) as Tagged;
  pa.pace = kid.pace = 60;
  pa.base = kid.base = "walk";
  pa.play("walk");
  kid.play("walk");
  par.link(pa, 0, kid, 1);
  parPilot = autopilot(par, ["wave", "cheer", "jump", "throw", "laugh", "hop"], {
    gap: 5,
    first: 6,
  });
}
crowd(Number(q.get("seed")) || 42);
ticks.push((t) => parPilot(t));
$<HTMLInputElement>("#paradeSpeed").oninput = (e) => {
  par.speed = Number((e.target as HTMLInputElement).value);
};
$<HTMLButtonElement>("#paradeShuffle").onclick = () => crowd(Math.floor(Math.random() * 1e6));

/* ---------- pose sheet ---------- */
const KEY: Record<ActionName, number> = {
  idle: 1,
  walk: 0.4,
  run: 0.3,
  hop: 0.34,
  wave: 0.95,
  cheer: 0.75,
  jump: 0.62,
  dance: 0.5,
  love: 1.1,
  shy: 1,
  think: 1.3,
  sad: 1.5,
  surprised: 0.45,
  scared: 1,
  grumpy: 1.2,
  sleepy: 1.9,
  laugh: 0.55,
  dizzy: 1,
  throw: 1.4,
};
let sheet: Stage[] = [];
function buildSheet(): void {
  $<Element>("#sheetGrid").innerHTML = "";
  for (const s of sheet) {
    const i = Stage.all.indexOf(s);
    if (i >= 0) Stage.all.splice(i, 1);
  }
  sheet = [];
  for (const n of ACTION_NAMES) {
    const fig = document.createElement("figure");
    fig.innerHTML = `<svg viewBox="0 0 240 290"></svg><figcaption>${ACTIONS[n].label}</figcaption>`;
    $<Element>("#sheetGrid").appendChild(fig);
    const st = new Stage(fig.querySelector("svg") as unknown as SVGSVGElement, {
      seed: 1,
      palette,
    });
    const p = { ...L.p } as PassengerParams;
    const tall = (p.h + p.legLen) * p.scale;
    p.scale *= Math.min(1, 140 / tall);
    const c = st.add(p, { x: 120, ground: 268, phase: 0, seed: 3 });
    c.inPlace = true;
    c.play(n, { then: n });
    for (let k = 0; k < (KEY[n] ?? 1) * 60; k++) st.step(1 / 60, k / 60);
    st.paused = true;
    st.label = ACTIONS[n].label;
    sheet.push(st);
  }
}
buildSheet();
$<HTMLButtonElement>("#sheetRefresh").onclick = () => buildSheet();
$<HTMLButtonElement>("#labToSheet").onclick = () => {
  buildSheet();
  $<HTMLElement>("#sheet").scrollIntoView();
};
$<HTMLButtonElement>("#sheetDownload").onclick = () => {
  const NS = "http://www.w3.org/2000/svg";
  const cols = 5;
  const W = 240;
  const H = 290;
  const big = document.createElementNS(NS, "svg");
  big.setAttribute("xmlns", NS);
  big.setAttribute("viewBox", `0 0 ${cols * W} ${Math.ceil(sheet.length / cols) * H}`);
  for (const [i, s] of sheet.entries()) {
    const n = s.svg.cloneNode(true) as SVGSVGElement;
    for (const x of n.querySelectorAll(".rigview")) x.remove();
    n.setAttribute("x", String((i % cols) * W));
    n.setAttribute("y", String(Math.floor(i / cols) * H));
    n.setAttribute("width", String(W));
    n.setAttribute("height", String(H));
    big.appendChild(n);
  }
  save(new XMLSerializer().serializeToString(big), "supaplane-pose-sheet.svg");
};

/* ---------- shared controls ---------- */
for (const b of $$<HTMLButtonElement>("[data-download]")) {
  b.onclick = () => {
    const s = Stage.all.find((x) => x.svg.id === b.dataset["download"]);
    if (s)
      save(s.serialize(), `supaplane-${(b.dataset["download"] ?? "").replace("Stage", "")}.svg`);
  };
}
const stagesIn = (el: Element): Stage[] => Stage.all.filter((s) => el.contains(s.svg));
for (const t of $$<HTMLInputElement>(".rigToggle")) {
  const apply = (): void => {
    for (const s of stagesIn(t.closest(".block") as Element)) s.rig = t.checked;
  };
  t.onchange = apply;
  apply();
}
for (const t of $$<HTMLInputElement>(".grainToggle")) {
  const apply = (): void => {
    for (const s of stagesIn(t.closest(".block") as Element)) s.setGrain(t.checked);
  };
  t.onchange = apply;
  apply();
}
for (const [id, p] of Object.entries(PALETTES))
  $<HTMLSelectElement>("#palette").add(new Option(p.label, id));
$<HTMLSelectElement>("#palette").value = palette;
$<HTMLSelectElement>("#palette").onchange = (e) => {
  palette = (e.target as HTMLSelectElement).value;
  for (const s of Stage.all) s.setPalette(palette);
};
const overlapSel = $<HTMLSelectElement>("#overlap");
overlapSel.value = q.get("overlap") ?? "outline";
overlapSel.onchange = () => {
  for (const s of Stage.all) s.setOverlap(overlapSel.value as OverlapMode);
};
for (const s of Stage.all) {
  s.setOverlap(overlapSel.value as OverlapMode);
  s.setPalette(palette);
}

/* ---------- clean embed / video capture ---------- */
const clean = q.get("clean");
if (clean) {
  document.body.classList.add("clean");
  const sec = $<HTMLElement>(`#${clean}`);
  sec.classList.add("on");
  const st = stagesIn(sec)[0];
  if (st) {
    const [x, y, w, h] = st.vb;
    const ratio = (q.get("ratio") ?? "").split(":").map(Number);
    if (ratio.length === 2 && ratio[0]) {
      const want = ratio[0] / (ratio[1] ?? 1);
      // widen or heighten around the ground-weighted centre so nobody is cropped
      if (w / h > want && clean === "parade") {
        const nw = h * want;
        st.fit([x + (w - nw) / 2, y, nw, h]);
      } else if (w / h > want) {
        const nh = w / want;
        st.fit([x, y - (nh - h) * 0.6, w, nh]);
      } else {
        const nw = h * want;
        st.fit([x - (nw - w) / 2, y, nw, h]);
      }
      st.svg.style.aspectRatio = `${ratio[0]}/${ratio[1]}`;
    }
    if (q.get("rig")) st.rig = true;
    if (q.get("walk") && clean === "family") $<HTMLButtonElement>("#familyWalk").click();
    if (q.get("fixed")) {
      clock.fixed = true;
      (window as unknown as { __castStep?: (dt: number) => void }).__castStep = (dt) => {
        stepAll(dt);
        ticks.forEach((fn) => fn(clock.t));
      };
    }
  }
}
// capture hooks for review/asset scripts (same surface the prototype exposed)
(window as unknown as Record<string, unknown>)["__cast"] = {
  Stage,
  Passenger,
  ACTIONS,
  PALETTES,
  PRESETS,
  PROPS,
  HATS,
  NAMES,
  BASE,
  rng,
  randomParams,
  describe: describeParams,
  clock,
  stepAll,
};
(window as unknown as { __castReady?: boolean }).__castReady = true;
