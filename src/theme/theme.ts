import type { ImageSourcePropType } from "react-native";

export const theme = {
  colors: {
    bg: "#0B0B0D", surface: "#17171B", surfaceAlt: "#222228",
    accent: "#C8102E", accentPressed: "#9E0C24", highlight: "#F5C542",
    straw: "#D9B36A", sea: "#2E86AB", text: "#F4F4F5", textMuted: "#9A9AA3", danger: "#FF4D4F",
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { card: 12, chip: 8, pill: 999 },
  fonts: { heading: "Bangers_400Regular", body: undefined as string | undefined },
  motion: { press: 150, sheet: 200 },
  /** Optional user-supplied image rendered dimmed behind the Projects grid. Nothing ships in the repo. */
  projectsWallpaper: null as ImageSourcePropType | null,
} as const;

export type Theme = typeof theme;
