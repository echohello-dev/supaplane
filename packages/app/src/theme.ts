export const colors = {
  bg: "#0a0a0f",
  surface: "#111118",
  surfaceRaised: "#181822",
  border: "#26263a",
  text: "#e5e5e5",
  textMuted: "#a3a3a3",
  textDim: "#6b6b7b",
  accent: "#7c5cff",
  accentSoft: "#9d83ff",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
  info: "#60a5fa",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 28, fontWeight: "700" as const, color: colors.text },
  title: { fontSize: 20, fontWeight: "600" as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  bodyMuted: { fontSize: 15, color: colors.textMuted },
  caption: { fontSize: 12, color: colors.textMuted },
  mono: { fontSize: 13, fontFamily: "Menlo", color: colors.text },
  monoDim: { fontSize: 12, fontFamily: "Menlo", color: colors.textDim },
} as const;
