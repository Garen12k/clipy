import { readdirSync } from "fs";
import { join } from "path";
import { coverFontAssets, COVER_FONT } from "@/src/editor/coverFont";
import { FIXED, PALETTES, resolvePalette, theme, type Palette } from "../theme";

const D = PALETTES.dark;
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (c: number[]) => { const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
/** `rgba(r,g,b,a)` laid over an opaque hex. */
const over = (rgba: string, bg: string) => { const [r, g, b, a] = rgba.match(/[\d.]+/g)!.map(Number); return [r, g, b].map((v, i) => v * a + rgb(bg)[i] * (1 - a)); };
const NEUTRALS = [D.bg, D.timeline, D.surface, D.surfaceBar, D.surfaceAlt, D.surfaceHigh, D.hairline, D.track];
const KINDS = [D.kindText, D.kindCaption, D.kindSticker, D.kindMusic, D.kindVoice, D.kindSfx, D.kindLayer, D.kindEffect];

test("the dark palette is the design's: hue-free neutrals, one gold with dark ink, system reds", () => {
  expect(D).toMatchObject({
    bg: "#000000", timeline: "#0E0E0F", surface: "#0E0E0F", surfaceBar: "#1C1C1E", surfaceAlt: "#2C2C2E", surfaceHigh: "#3A3A3C",
    accent: "#D9B36A", onAccent: "#1A1408", text: "#FFFFFF", textMuted: "rgba(235,235,245,0.6)", hairline: "#38383A", track: "#636366",
    danger: "#FF453A", dangerText: "#FF8078", onKind: "#000000", scrim: "rgba(0,0,0,0.55)", scrimStrong: "rgba(0,0,0,0.72)",
  });
  // No hue: the three channels of every neutral are within 3 of each other (navy was 41 apart).
  for (const n of NEUTRALS) { const c = rgb(n); expect(Math.max(...c) - Math.min(...c)).toBeLessThanOrEqual(3); }
  expect(theme.elevation).toEqual({ page: D.bg, bar: D.surfaceBar, tile: D.surfaceAlt, lifted: D.surfaceHigh });
  expect(theme.ring).toEqual({ borderWidth: 2, borderColor: D.accent });
  expect(theme.ringClear).toEqual({ borderWidth: 2, borderColor: "transparent" });
});

test("the eight timeline kinds: the design's values, all different, none the accent, black reads on each (9:1)", () => {
  expect(D).toMatchObject({ kindText: "#79B6F4", kindCaption: "#AFB965", kindSticker: "#E095C7", kindMusic: "#47C5D2", kindVoice: "#6DC799", kindSfx: "#ED997B", kindLayer: "#A8B2BE", kindEffect: "#B6A3F0" });
  expect(new Set(KINDS).size).toBe(8);
  expect(KINDS).not.toContain(D.accent);
  for (const k of KINDS) expect(ratio(rgb(D.onKind), rgb(k))).toBeGreaterThanOrEqual(9);
});

test("contrast: ink on gold, labels on every surface, reds as text, the slider's rest track", () => {
  const surfaces = [D.bg, D.surfaceBar, D.surfaceAlt, D.surfaceHigh];
  expect(ratio(rgb(D.onAccent), rgb(D.accent))).toBeGreaterThanOrEqual(7);
  for (const s of surfaces) {
    expect(ratio(rgb(D.text), rgb(s))).toBeGreaterThanOrEqual(7);
    expect(ratio(over(D.textMuted, s), rgb(s))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(rgb(D.dangerText), rgb(s))).toBeGreaterThanOrEqual(4.5);   // a danger SecondaryButton's label sits on `lifted`
  }
  expect(ratio(rgb(D.accent), rgb(D.surfaceBar))).toBeGreaterThanOrEqual(4.5);
  for (const s of [D.bg, D.surfaceBar]) expect(ratio(rgb(D.danger), rgb(s))).toBeGreaterThanOrEqual(3);
  // The rest of a slider's track shows on a bar and beside the gold part (src/ui/Slider.tsx).
  expect(ratio(rgb(D.track), rgb(D.surfaceBar))).toBeGreaterThanOrEqual(2.5);
  expect(ratio(rgb(D.accent), rgb(D.track))).toBeGreaterThanOrEqual(2.8);
});

test("one chooser, one shape per appearance: a second palette slots in without a rename", () => {
  const keys = Object.keys(D).sort();
  for (const p of Object.values(PALETTES) as Palette[]) expect(Object.keys(p).sort()).toEqual(keys);
  expect(resolvePalette(PALETTES)).toBe(PALETTES.dark);                       // stage 1: dark is the only appearance
  for (const k of keys as (keyof Palette)[]) expect(theme.colors[k]).toBe(D[k]);
  for (const k of FIXED) expect(keys).toContain(k);
  expect([...FIXED].sort()).toEqual(["kindCaption", "kindEffect", "kindLayer", "kindMusic", "kindSfx", "kindSticker", "kindText", "kindVoice", "onKind", "scrim", "scrimStrong", "surface", "timeline"]);
});

test("type: the Apple text styles, the roles that read them, three weights, no family", () => {
  expect(theme.text).toEqual({
    largeTitle: { size: 34, leading: 41, weight: "700" }, title1: { size: 28, leading: 34, weight: "700" }, title2: { size: 22, leading: 28, weight: "700" },
    title3: { size: 20, leading: 25, weight: "600" }, headline: { size: 17, leading: 22, weight: "600" }, body: { size: 17, leading: 22, weight: "400" },
    callout: { size: 16, leading: 21, weight: "400" }, subhead: { size: 15, leading: 20, weight: "400" }, footnote: { size: 13, leading: 18, weight: "400" },
    caption1: { size: 12, leading: 16, weight: "400" }, caption2: { size: 11, leading: 13, weight: "400" },
  });
  expect(theme.type).toEqual({ micro: 11, small: 12, label: 13, body: 15, input: 16, headline: 17, heading: 20, title: 22, screen: 34 });
  expect(theme.weight).toEqual({ regular: "400", semi: "600", bold: "700" });
});

test("shapes, spacing, sizes and motion: radii from the tokens, everything else as it was", () => {
  expect(theme.radius).toEqual({ card: 20, chip: 8, tile: 7, field: 12, sheet: 28, pill: 999, box: 12, cover: 16 });
  expect(theme.space).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, gutter: 16 });
  expect(theme.size).toEqual({ touch: 44, control: 48, controlCompact: 36, iconButton: 40, toolBox: 44, toolColumn: 72, chip: 36, chipCompact: 28, row: 48, header: 44, done: 32, listRow: 56, avatar: 32, ring: 120, icon: { sm: 16, md: 20, lg: 24 } });
  expect(theme.motion).toMatchObject({ press: 120, fade: 200, stagger: 40, minLoading: 1200, fontTimeout: 5000,
    fast: 120, base: 180, slow: 240, enterShift: 8, pressScale: 0.96, selectedScale: 1.03, curve: [0.2, 0, 0, 1], spring: { mass: 1, damping: 40, stiffness: 700 } });
  for (const ms of [theme.motion.fast, theme.motion.base, theme.motion.slow]) expect(ms).toBeLessThanOrEqual(250);
  expect(theme.motion.sheet).toEqual({ mass: 1, damping: 40, stiffness: 400 });
  expect(theme.motion.sheet.damping).toBe(2 * Math.sqrt(theme.motion.sheet.stiffness * theme.motion.sheet.mass));
});

test("no interface font is bundled: the one file left is the cover title's (content)", () => {
  expect(COVER_FONT).toBe("Oswald_700Bold");
  expect(Object.keys(coverFontAssets)).toEqual([COVER_FONT]);
  expect(readdirSync(join(__dirname, "..", "..", "..", "assets", "fonts", "ui")).sort()).toEqual(["OFL.txt", "Oswald_700Bold.ttf"]);
});

test("the old names are gone", () => {
  for (const k of ["sea", "seaLight", "bgDeep", "bgEnd", "laneText", "laneSticker", "laneMusic", "laneEffect", "laneVoice", "laneSfx", "laneLayer", "highlight", "straw", "accentPressed"]) expect(k in theme.colors).toBe(false);
  expect("fonts" in theme).toBe(false);
  expect(Object.keys(theme.colors).sort()).toEqual(Object.keys(PALETTES.dark).sort());
});
