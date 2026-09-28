export const CHANNELS = {
  x: [90, 15],
  y: [520, 30],
  bob: [300, 22],
  stretch: [240, 13],
  lean: [130, 12],
  bulge: [200, 16],
  lhx: [170, 15],
  lhy: [170, 15],
  rhx: [170, 15],
  rhy: [170, 15],
  lfx: [900, 55],
  llift: [900, 55],
  rfx: [900, 55],
  rlift: [900, 55],
  lx: [160, 18],
  ly: [160, 18],
  mouth: [320, 26],
  blush: [50, 13],
  brow: [220, 22],
  tilt: [90, 10],
  bx: [26, 3.2],
  by: [26, 3.2],
} as const satisfies Record<string, readonly [number, number]>;

export type ChannelName = keyof typeof CHANNELS;
export type ChannelValues = Record<ChannelName, number>;
export type Targets = Record<string, number>;

export function zeroChannels(): ChannelValues {
  const out = {} as ChannelValues;
  for (const k of Object.keys(CHANNELS) as ChannelName[]) out[k] = 0;
  return out;
}

export interface SpringState {
  v: ChannelValues;
  vel: ChannelValues;
}

export function createSpringState(): SpringState {
  return { v: zeroChannels(), vel: zeroChannels() };
}
