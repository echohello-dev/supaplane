export const PALETTE_NAMES = ["navy", "cream", "bronze", "charcoal", "sky", "dusk"] as const;
export type PaletteName = (typeof PALETTE_NAMES)[number];

export interface Palette {
  label: string;
  bg: string;
  body: string;
  gap: string;
  face: string;
  fx: string;
  rig: string;
}

export const PALETTES: Record<PaletteName, Palette> = {
  navy: {
    label: "Navy / cream",
    bg: "#163A5F",
    body: "#EDE3C4",
    gap: "#163A5F",
    face: "#163A5F",
    fx: "#EDE3C4",
    rig: "#F08A6A",
  },
  cream: {
    label: "Cream / navy",
    bg: "#EDE3C4",
    body: "#163A5F",
    gap: "#EDE3C4",
    face: "#EDE3C4",
    fx: "#163A5F",
    rig: "#E0645A",
  },
  bronze: {
    label: "Bronze",
    bg: "#1A1408",
    body: "#C4A04A",
    gap: "#1A1408",
    face: "#1A1408",
    fx: "#E8C56A",
    rig: "#F08A6A",
  },
  charcoal: {
    label: "Charcoal",
    bg: "#C4A04A",
    body: "#2A2A2A",
    gap: "#C4A04A",
    face: "#EDE3C4",
    fx: "#2A2A2A",
    rig: "#E0645A",
  },
  sky: {
    label: "Sky",
    bg: "#8FC4E6",
    body: "#FFFBF0",
    gap: "#8FC4E6",
    face: "#163A5F",
    fx: "#FFFBF0",
    rig: "#E0645A",
  },
  dusk: {
    label: "Dusk",
    bg: "#E9866B",
    body: "#FFF0D6",
    gap: "#E9866B",
    face: "#3A1E2C",
    fx: "#FFF0D6",
    rig: "#163A5F",
  },
};

export const resolvePalette = (id: string): Palette =>
  PALETTES[(id as PaletteName) in PALETTES ? (id as PaletteName) : "navy"];
