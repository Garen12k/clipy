export const theme = {
  colors: {
    bg: "#0A1B33", bgDeep: "#081527", bgEnd: "#0C2542", surface: "#0E2440", surfaceAlt: "#17365C",
    accent: "#D9B36A", accentPressed: "#B8934D", onAccent: "#0A1B33",
    text: "#F6E7C1", textMuted: "#9FB3CC", hairline: "rgba(217,179,106,0.45)",
    sea: "#1C6E9E", seaLight: "#2E86AB", danger: "#E5484D",
    laneText: "#D9B36A", laneSticker: "#E86A7A", laneMusic: "#3BA7C9",
    scrim: "rgba(3,10,20,0.55)", scrimStrong: "rgba(3,10,20,0.75)",
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { card: 12, chip: 8, tile: 7, sheet: 18, pill: 999 },
  fonts: { title: "Oswald_700Bold", body: "Montserrat_400Regular", bodySemi: "Montserrat_600SemiBold", bodyBold: "Montserrat_800ExtraBold" },
  motion: { press: 120, sheet: { damping: 18, stiffness: 220 }, fade: 200, stagger: 40, minLoading: 1200, fontTimeout: 5000 },
  /** 2 px gold ring for the selected item in any grid (filters, templates, fonts, ratios, transitions). */
  ring: { borderWidth: 2, borderColor: "#D9B36A" },
} as const;

export type Theme = typeof theme;
