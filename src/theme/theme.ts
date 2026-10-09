/** The appearances the app can be drawn in. Which one is worn is decided in appearance.ts and nowhere else. */
export type AppAppearance = "light" | "dark";

/**
 * Every colour of one appearance. There are two (`PALETTES`): each is an object with exactly these keys.
 * A colour is only ever used as a style value or a colour prop — never concatenated, sliced or parsed (palette.guard.test.ts).
 *
 * One palette holds TWO families of surfaces (the owner's choice, 9 October 2026): the EDITOR's soft slate (`bg`, `timeline`, `surface*`,
 * `textMuted`, `hairline`, `dangerText`), a blue-grey charcoal quiet enough to judge a filter against, and the family of every OTHER screen
 * (`screen*`, `accentInk`): navy in the dark appearance, warm cream in the light one. They are two roles inside one appearance, not two
 * appearances — and the editor's role is the SAME slate in both: a video is judged against the dark it will be watched on.
 */
export type Palette = {
  /** The editor's page, and the surround of the preview. */ bg: string;
  /** The timeline's background. */ timeline: string;
  /** The video's own frame behind the picture (PreviewPlayer): true black, as in the export. */ surface: string;
  /** A bar, a strip, a panel, a card, a sheet. */ surfaceBar: string;
  /** A tile or a field on one of those. */ surfaceAlt: string;
  /** A secondary button; the tick; a selected row that is not a tile. */ surfaceHigh: string;
  /** The PICKED tile or chip: the gold at 16 % over the tile step — a soft tint under the gold ring. Opaque, worked out by hand (a colour is never mixed in code). */ surfacePicked: string;
  /** The ONE gold: the fill of a screen's main action, and — in the editor — the ink of rings, slider fills, progress and text actions. */ accent: string;
  /** Text and symbols on the gold fill. */ onAccent: string;
  /** Outside the editor — the gold as INK: a text action, a picked ring, progress, a ticked box, a symbol. The gold itself where the page is dark; a deep gold on cream (the bright one is 1.8 : 1 there). */ accentInk: string;
  text: string; textMuted: string;
  /** A separator line. */ hairline: string;
  /** The rest of a slider's track. */ track: string;
  /** Red for fills, borders and icons. */ danger: string;
  /** Red for TEXT in the editor: 4.5:1 on every slate step. */ dangerText: string;
  kindText: string; kindCaption: string; kindSticker: string; kindMusic: string; kindVoice: string; kindSfx: string; kindLayer: string; kindEffect: string;
  /** Labels and glyphs on a timeline bar. */ onKind: string;
  scrim: string; scrimStrong: string;
  /** Words and symbols on a scrim over a picture (a cover's title, its length): light in every appearance — they sit on a photo, not on the page. */ onScrim: string;
  /** Outside the editor — the page. */ screenBg: string;
  /** A card, a sheet, the Home pill. */ screenBar: string;
  /** A field, a tile, the rest of a progress bar. */ screenTile: string;
  /** A secondary button. */ screenLifted: string;
  /** The picked tile or chip on those: the gold at 16 % over the navy tile step. */ screenPicked: string;
  /** Text and symbols on those four. */ screenText: string;
  /** Secondary text on those four. */ screenMuted: string;
  /** A quiet separator on those four. */ screenHairline: string;
  /** Red for TEXT on those four (4.5:1 on each). */ screenDangerText: string;
  /** Red for a border or a symbol on those (3:1 on the page, a card and a tile). */ screenDanger: string;
};

const DARK: Palette = {
  // Soft slate — a blue-grey charcoal, softer than black and calmer than navy. The surround, the timeline and the bar are the three values the owner
  // approved; tile and selected continue the ramp in the same hue with the steps the neutral greys had (1.22 each); `surface` is the video's own
  // frame and stays true black — it is content: what the export draws where no picture is.
  bg: "#10151F", timeline: "#171E2B", surface: "#000000", surfaceBar: "#212A3A", surfaceAlt: "#2C384D", surfaceHigh: "#374661", surfacePicked: "#484C52",
  accent: "#D9B36A", onAccent: "#1A1408", accentInk: "#D9B36A",
  text: "#FFFFFF", textMuted: "rgba(235,235,245,0.7)", hairline: "#35435D", track: "#52688F",
  danger: "#FF453A", dangerText: "#FF9A93",
  kindText: "#79B6F4", kindCaption: "#AFB965", kindSticker: "#E095C7", kindMusic: "#47C5D2", kindVoice: "#6DC799", kindSfx: "#ED997B", kindLayer: "#A8B2BE", kindEffect: "#B6A3F0",
  onKind: "#000000",
  scrim: "rgba(0,0,0,0.55)", scrimStrong: "rgba(0,0,0,0.72)", onScrim: "#FFFFFF",
  screenBg: "#0A1B33", screenBar: "#112C4D", screenTile: "#17365C", screenLifted: "#1F4572", screenPicked: "#364A5E",
  screenText: "#FFFFFF", screenMuted: "rgba(235,235,245,0.7)", screenHairline: "#2B5080", screenDangerText: "#FF9A93", screenDanger: "#FF453A",
};

/**
 * Light: the phone's light setting. ONLY the screen family differs — warm cream (the owner's choice, 9 October 2026: the page and the lighter
 * card are the two values the owner saw; the rest continue the same warm hue). On a light page a step is DARKER, not lighter: card (lightest) →
 * page → tile → lifted. `screenPicked` is the gold at 16 % over the tile step, as in the dark families. The text is the dark appearance's own
 * navy page; the gold as ink is a deep gold (4.5 : 1 on every cream step — the bright gold is 1.8 : 1 on the page); the reds are deepened the
 * same way. Every key of the EDITOR's family, the gold fill with its ink, and everything `FIXED` is the dark palette's value.
 */
const LIGHT: Palette = {
  ...DARK,
  accentInk: "#7A5200",
  screenBg: "#F7F1E3", screenBar: "#FFFBF1", screenTile: "#EBE2CC", screenLifted: "#DDD0B4", screenPicked: "#E8DABC",
  screenText: DARK.screenBg, screenMuted: "#4B576B", screenHairline: "#D2C5A9", screenDangerText: "#A3261C", screenDanger: "#C92A1A",
};

/** One palette per appearance. */
export const PALETTES = { dark: DARK, light: LIGHT } as const;
/** Keys that are the same in every appearance: the timeline, its bars and the scrims over pictures stay dark so colour is judged the same way. */
export const FIXED: readonly (keyof Palette)[] = ["timeline", "surface", "kindText", "kindCaption", "kindSticker", "kindMusic", "kindVoice", "kindSfx", "kindLayer", "kindEffect", "onKind", "scrim", "scrimStrong", "onScrim"];
/** The keys that MAY differ between appearances: the screen family, and the gold as ink on it. Every other key is the editor's or shared, and is one value in both (theme.test.ts). */
export const SCREEN_KEYS: readonly (keyof Palette)[] = ["accentInk", "screenBg", "screenBar", "screenTile", "screenLifted", "screenPicked", "screenText", "screenMuted", "screenHairline", "screenDangerText", "screenDanger"];
/** THE one place an appearance becomes colours. */
export function resolvePalette(palettes: typeof PALETTES, appearance: AppAppearance): Palette {
  return palettes[appearance];
}
/**
 * The EDITOR wears the dark appearance whatever the phone says, so `theme.colors` / `theme.elevation` / `theme.ring` are constants: the
 * editor's family and the roles shared with the screens (the gold fill, its ink, the scrims), which are one value in both palettes.
 * A light editor is a later stage: it starts by changing this one word.
 */
export const EDITOR_APPEARANCE: AppAppearance = "dark";
const C = resolvePalette(PALETTES, EDITOR_APPEARANCE);

const screenOf = (p: Palette): Surfaces => ({ page: p.screenBg, bar: p.screenBar, tile: p.screenTile, lifted: p.screenLifted, picked: p.screenPicked,
  text: p.screenText, muted: p.screenMuted, separator: p.screenHairline, accentInk: p.accentInk, danger: p.screenDanger, dangerText: p.screenDangerText });
/** The screen family of each appearance: two constant objects. */
const SCREENS: Record<AppAppearance, Surfaces> = { dark: screenOf(resolvePalette(PALETTES, "dark")), light: screenOf(resolvePalette(PALETTES, "light")) };
const EDITOR: Surfaces = { page: C.bg, bar: C.surfaceBar, tile: C.surfaceAlt, lifted: C.surfaceHigh, picked: C.surfacePicked, text: C.text, muted: C.textMuted, separator: C.hairline, accentInk: C.accent, danger: C.danger, dangerText: C.dangerText };

/**
 * The appearance the screens are drawn in right now. Written only by appearance.ts (`showAppearance`); everything drawn reads it through
 * `useSurfaces()` (src/ui/tone.ts), which is told when it changes.
 */
let shown: AppAppearance = "dark";
export const shownAppearance = (): AppAppearance => shown;
/** For appearance.ts only. */
export function showAppearance(appearance: AppAppearance): void { shown = appearance; }

/** Apple's text styles: size and leading in points, and the weight. `theme.type` reads its sizes from here; leading is taken up screen by screen in later stages. */
const TEXT = {
  largeTitle: { size: 34, leading: 41, weight: "700" }, title1: { size: 28, leading: 34, weight: "700" }, title2: { size: 22, leading: 28, weight: "700" },
  title3: { size: 20, leading: 25, weight: "600" }, headline: { size: 17, leading: 22, weight: "600" }, body: { size: 17, leading: 22, weight: "400" },
  callout: { size: 16, leading: 21, weight: "400" }, subhead: { size: 15, leading: 20, weight: "400" }, footnote: { size: 13, leading: 18, weight: "400" },
  caption1: { size: 12, leading: 16, weight: "400" }, caption2: { size: 11, leading: 13, weight: "400" },
} as const;

export const theme = {
  colors: C,
  /** The one spacing scale. `gutter` is the screen's left / right edge (a row that starts with an IconButton pads by `sm`: the button's own inset completes it). */
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, gutter: 16 },
  /** `pill`: a capsule (buttons, chips). `card`: a card. `box`: a tool tile's box. `field`: a text field. `chip`: a bar, a clip, a small box. `sheet`: a sheet's top corners, and all four corners of the card a strip or a panel is drawn as in the editor. `cover`: a project's picture on Home. `emblem`: the tile behind an empty state's symbol. */
  radius: { card: 20, chip: 8, tile: 7, field: 12, sheet: 28, pill: 999, box: 12, cover: 20, emblem: 28 },
  /** Component sizes in points. `touch` is the smallest touch target: a smaller visual reaches it with hitSlop that stays inside its parent. `listRow`: a platform row; `avatar`: an account picture; `ring`: the export progress ring; `badge`: the length pill on a cover; `more`: the round More button under one; `emblem`: the tile behind an empty state's symbol (its symbol is `icon.hero`). */
  size: { touch: 44, control: 48, controlCompact: 36, iconButton: 40, toolBox: 44, toolColumn: 72, chip: 36, chipCompact: 28, row: 48, header: 44, done: 32, listRow: 56, avatar: 32, ring: 120, badge: 24, more: 32, emblem: 88, icon: { sm: 16, md: 20, lg: 24, xl: 32, hero: 48 } },
  /** Apple's text styles (see TEXT). */
  text: TEXT,
  /**
   * UI text sizes by role. `micro`: Caption 2, the floor; `small`: Caption 1 (tool and tile labels, bar labels); `label`: Footnote;
   * `body`: Subhead; `input`: Callout (a text field); `headline`: a strip's, a panel's or the editor's title, a button;
   * `heading`: Title 3 (a card's or a sheet's title); `title`: Title 2 (an empty or finished state); `screen`: Large Title.
   */
  type: { micro: TEXT.caption2.size, small: TEXT.caption1.size, label: TEXT.footnote.size, body: TEXT.subhead.size, input: TEXT.callout.size,
    headline: TEXT.headline.size, heading: TEXT.title3.size, title: TEXT.title2.size, screen: TEXT.largeTitle.size },
  /** The system font's weights. UI text names no font family: that is what makes it the system font (SF Pro). */
  weight: { regular: "400", semi: "600", bold: "700" },
  /** The EDITOR's layering by colour (no shadows over the video): the page, a bar / strip / panel, a tile or field inside it, a secondary button or the tick, the picked tile's tint. */
  elevation: { page: C.bg, bar: C.surfaceBar, tile: C.surfaceAlt, lifted: C.surfaceHigh, picked: C.surfacePicked },
  /**
   * The family of every screen that is not the editor, in the appearance shown now (navy or cream). NOT for the app's code: a value read here
   * does not follow the phone — everything drawn reads `useSurfaces()` (palette.guard.test.ts). It is here for tests and for `useSurfaces` itself.
   */
  get screen(): Surfaces { return SCREENS[shown]; },
  /** The screen family of each appearance, by name. */
  screens: SCREENS,
  /** Both families by tone (`useSurfaces` in src/ui/tone.ts). `editor` repeats `elevation` and the editor's text, muted, separator, gold and reds; `screen` is the one shown now. */
  surfaces: { get screen(): Surfaces { return SCREENS[shown]; }, editor: EDITOR },
  /**
   * `fast` / `base` / `slow`: the editor's three durations (nothing there runs longer than 250 ms). `curve`: the one easing, as cubic-bezier
   * control points. `spring`: the one spring (mass is explicit — Reanimated 4's default is 4); settles in about 200 ms.
   * `sheet`: a pop-up sheet coming to rest — critically damped (damping = 2·√(stiffness·mass)), so it never overshoots; within a point of rest after about 0.4 s.
   */
  motion: { press: 120, sheet: { mass: 1, damping: 40, stiffness: 400 }, fade: 200, stagger: 40, minLoading: 1200, fontTimeout: 5000,
    fast: 120, base: 180, slow: 240, enterShift: 8, pressScale: 0.96, selectedScale: 1.03, curve: [0.2, 0, 0, 1], spring: { mass: 1, damping: 40, stiffness: 700 } },
  /**
   * A tool's ONE main action inside a strip or a panel (`PrimaryButton tone="plain"`): filled in the label colour with the page's slate as its
   * ink — white with dark text here, and the other way round in a light appearance. Gold stays a screen's one action (Export, Crop's Done).
   */
  plain: { fill: C.text, ink: C.bg },
  /** 2 px gold ring for the selected item in any grid (filters, templates, fonts, ratios, transitions). A picked tile or chip wears it over the `picked` tint, with its label white and semibold. */
  ring: { borderWidth: 2, borderColor: C.accent },
  /** The unselected twin of `ring`: the same width, so selecting moves nothing. */
  ringClear: { borderWidth: 2, borderColor: "transparent" },
} as const;

/** Which family a part of the app wears: the editor (and Crop), or every other screen. A route says it once, on its `Screen` (src/ui/tone.ts). */
export type Tone = "screen" | "editor";
/**
 * What differs between the two families — the same eleven roles in each. `text`: words and symbols; `accentInk`: the gold as ink (a text
 * action, a picked ring, progress, a symbol); `danger`: red as a border or a symbol; `dangerText`: red words. The gold FILL with its ink
 * (`colors.accent` / `onAccent`) and the scrims are shared.
 */
export type Surfaces = { page: string; bar: string; tile: string; lifted: string; picked: string; text: string; muted: string; separator: string; accentInk: string; danger: string; dangerText: string };

export type Theme = typeof theme;

/** The two sides of the app a glass surface can be on: the screens (Home and the rest) and the editor. */
export type GlassSide = "home" | "editor";
/**
 * Whether surfaces drawn with the kit's `Glass` (src/ui/Glass.tsx) are the system's glass, per side. OFF everywhere: the installed
 * app only makes glass POSSIBLE; where it is used is decided with the owner. With a switch on, a phone or a build that cannot draw
 * glass still gets the solid colour.
 */
export const GLASS: Record<GlassSide, boolean> = { home: false, editor: false };
