const ACCENT = "#D9B36A";
const BG = "#0A1B33", SURFACE_BAR = "#112C4D", SURFACE_ALT = "#17365C", SURFACE_HIGH = "#1F4572";

export const theme = {
  colors: {
    bg: BG, bgDeep: "#081527", bgEnd: "#0C2542", surface: "#0E2440", surfaceAlt: SURFACE_ALT, surfaceBar: SURFACE_BAR, surfaceHigh: SURFACE_HIGH,
    accent: ACCENT, onAccent: "#0A1B33",
    text: "#F6E7C1", textMuted: "#9FB3CC", hairline: "rgba(217,179,106,0.45)",
    sea: "#1C6E9E", seaLight: "#2E86AB", danger: "#E5484D",
    laneText: "#D9B36A", laneSticker: "#E86A7A", laneMusic: "#3BA7C9", laneEffect: "#9A86D6", laneVoice: "#4FA89B", laneSfx: "#E0916A", laneLayer: "#7F93B8",
    scrim: "rgba(3,10,20,0.55)", scrimStrong: "rgba(3,10,20,0.75)",
  },
  /** The one spacing scale. `gutter` is the screen's left / right edge (a row that starts with an IconButton pads by `sm`: the button's own inset completes it). */
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, gutter: 16 },
  radius: { card: 12, chip: 8, tile: 7, sheet: 18, pill: 999, box: 14, cover: 16 },
  /** Component sizes in points. `touch` is the smallest touch target: a smaller visual reaches it with hitSlop that stays inside its parent. `listRow`: a platform row; `avatar`: an account picture; `ring`: the export progress ring. */
  size: { touch: 44, control: 48, controlCompact: 36, iconButton: 40, toolBox: 44, toolColumn: 72, chip: 36, chipCompact: 28, row: 48, header: 44, done: 32, listRow: 56, avatar: 32, ring: 120, icon: { sm: 16, md: 20, lg: 24 } },
  /** UI text sizes. `input`: a text field; `heading`: a card's or a sheet's title; `title`: an empty or finished state; `screen`: a screen's title. */
  type: { micro: 11, small: 12, label: 13, body: 14, input: 16, heading: 18, title: 20, screen: 26 },
  /** Layering by colour (no shadows over the video): the page, a bar / strip / panel, a tile or field inside it, the selected tile. */
  elevation: { page: BG, bar: SURFACE_BAR, tile: SURFACE_ALT, lifted: SURFACE_HIGH },
  fonts: { title: "Oswald_700Bold", body: "Montserrat_400Regular", bodySemi: "Montserrat_600SemiBold", bodyBold: "Montserrat_800ExtraBold" },
  /**
   * `fast` / `base` / `slow`: the editor's three durations (nothing there runs longer than 250 ms). `curve`: the one easing, as cubic-bezier
   * control points. `spring`: the one spring (mass is explicit — Reanimated 4's default is 4); settles in about 200 ms.
   * `sheet`: a pop-up sheet coming to rest — critically damped (damping = 2·√(stiffness·mass)), so it never overshoots; within a point of rest after about 0.4 s.
   */
  motion: { press: 120, sheet: { mass: 1, damping: 40, stiffness: 400 }, fade: 200, stagger: 40, minLoading: 1200, fontTimeout: 5000,
    fast: 120, base: 180, slow: 240, enterShift: 8, pressScale: 0.96, selectedScale: 1.03, curve: [0.2, 0, 0, 1], spring: { mass: 1, damping: 40, stiffness: 700 } },
  /** 2 px gold ring for the selected item in any grid (filters, templates, fonts, ratios, transitions). */
  ring: { borderWidth: 2, borderColor: ACCENT },
  /** The unselected twin of `ring`: the same width, so selecting moves nothing. */
  ringClear: { borderWidth: 2, borderColor: "transparent" },
} as const;

export type Theme = typeof theme;
