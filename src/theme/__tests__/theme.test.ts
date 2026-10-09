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
/** The editor's ramp, darkest first: the surround of the video, the timeline, a bar, a tile, the selected tile. */
const SLATE = [D.bg, D.timeline, D.surfaceBar, D.surfaceAlt, D.surfaceHigh];
const KINDS = [D.kindText, D.kindCaption, D.kindSticker, D.kindMusic, D.kindVoice, D.kindSfx, D.kindLayer, D.kindEffect];

test("the dark palette, the editor's family: soft slate (the three values the owner approved, and the steps derived from them), one gold with dark ink, system reds", () => {
  expect(D).toMatchObject({
    bg: "#10151F", timeline: "#171E2B", surfaceBar: "#212A3A",                       // the owner's three, verbatim
    surfaceAlt: "#2C384D", surfaceHigh: "#374661", hairline: "#35435D", track: "#52688F", textMuted: "rgba(235,235,245,0.7)",
    surface: "#000000",                                                              // the video's own frame: content, what the export draws where no picture is
    accent: "#D9B36A", onAccent: "#1A1408", text: "#FFFFFF",
    danger: "#FF453A", dangerText: "#FF9A93", onKind: "#000000", scrim: "rgba(0,0,0,0.55)", scrimStrong: "rgba(0,0,0,0.72)",
  });
  // One hue, one ramp: in every editor grey blue leads green leads red (nothing hue-free is left), softer than black and far calmer than navy
  // (blue leads red by 15–61 here; navy's page alone is 41 apart at a third of the lightness), and each step is lighter than the one under it.
  for (const n of [...SLATE, D.hairline, D.track]) { const [r, g, b] = rgb(n); expect(b).toBeGreaterThan(g); expect(g).toBeGreaterThan(r); expect((b - r) / b).toBeGreaterThan(0.35); expect((b - r) / b).toBeLessThan(0.5); }
  for (let i = 1; i < SLATE.length; i++) expect(lum(rgb(SLATE[i]))).toBeGreaterThan(lum(rgb(SLATE[i - 1])));
  // The steps the neutral family had: a tile on a bar 1.22, the selected tile on a tile 1.23.
  const step = (a: string, b: string) => Math.round(ratio(rgb(a), rgb(b)) * 100) / 100;
  expect([step(D.timeline, D.bg), step(D.surfaceBar, D.timeline), step(D.surfaceBar, D.bg), step(D.surfaceAlt, D.surfaceBar), step(D.surfaceHigh, D.surfaceAlt), step(D.surfaceHigh, D.surfaceBar)])
    .toEqual([1.09, 1.16, 1.27, 1.22, 1.24, 1.52]);
  expect(theme.elevation).toEqual({ page: D.bg, bar: D.surfaceBar, tile: D.surfaceAlt, lifted: D.surfaceHigh });
  expect(theme.ring).toEqual({ borderWidth: 2, borderColor: D.accent });
  expect(theme.ringClear).toEqual({ borderWidth: 2, borderColor: "transparent" });
});

test("the screen family: the navy of every screen that is not the editor — four steps, each lighter than the last, with its own muted, separator and red", () => {
  expect(D).toMatchObject({ screenBg: "#0A1B33", screenBar: "#112C4D", screenTile: "#17365C", screenLifted: "#1F4572",
    screenMuted: "rgba(235,235,245,0.7)", screenHairline: "#2B5080", screenDangerText: "#FF9A93" });
  expect(theme.screen).toEqual({ page: D.screenBg, bar: D.screenBar, tile: D.screenTile, lifted: D.screenLifted, muted: D.screenMuted, separator: D.screenHairline, dangerText: D.screenDangerText });
  // Two roles inside ONE palette: the same seven names in each family, the editor's being the neutrals `elevation` already names.
  expect(theme.surfaces.screen).toBe(theme.screen);
  expect(theme.surfaces.editor).toEqual({ ...theme.elevation, muted: D.textMuted, separator: D.hairline, dangerText: D.dangerText });
  expect(Object.keys(theme.surfaces.editor).sort()).toEqual(Object.keys(theme.surfaces.screen).sort());
  for (const k of ["page", "bar", "tile", "lifted", "separator"] as const) expect(theme.surfaces.screen[k]).not.toBe(theme.surfaces.editor[k]);
  // Navy, not grey: blue leads red by at least 40 in each step, and each step is lighter than the one under it.
  const steps = [D.screenBg, D.screenBar, D.screenTile, D.screenLifted].map(rgb);
  for (const c of steps) expect(c[2] - c[0]).toBeGreaterThanOrEqual(40);
  for (let i = 1; i < steps.length; i++) expect(lum(steps[i])).toBeGreaterThan(lum(steps[i - 1]));
  // The editor's side is its own family.
  expect(theme.elevation.page).toBe("#10151F");
  expect(theme.colors.timeline).toBe("#171E2B");
});

test("contrast on navy: white, the muted label, gold and the red text on all four steps; the layering steps; the red fill", () => {
  const steps = [D.screenBg, D.screenBar, D.screenTile, D.screenLifted];
  const table = steps.map((s) => [ratio(rgb(D.text), rgb(s)), ratio(over(D.screenMuted, s), rgb(s)), ratio(rgb(D.screenDangerText), rgb(s)), ratio(rgb(D.accent), rgb(s))].map((r) => Math.round(r * 100) / 100));
  // The measured numbers (page, bar, tile, lifted) × (text, muted, red text, gold) — recorded in the spec.
  expect(table).toEqual([[17.25, 7.65, 8.46, 8.71], [14.08, 6.59, 6.9, 7.11], [12.22, 5.91, 5.99, 6.17], [9.76, 4.94, 4.78, 4.93]]);
  for (const row of table) { expect(row[0]).toBeGreaterThanOrEqual(7); for (const r of row.slice(1)) expect(r).toBeGreaterThanOrEqual(4.5); }
  // A secondary button (`lifted`) is a navy step lighter than what it sits on — about the editor's own steps (1.85 / 1.50 / 1.23), so it is a button, not a grey patch.
  expect(ratio(rgb(D.screenLifted), rgb(D.screenBg))).toBeGreaterThanOrEqual(1.7);
  expect(ratio(rgb(D.screenLifted), rgb(D.screenBar))).toBeGreaterThanOrEqual(1.4);
  expect(ratio(rgb(D.screenLifted), rgb(D.screenTile))).toBeGreaterThanOrEqual(1.2);
  // The separator is quiet but there: a card's edge on the page and a row line on the card.
  expect(ratio(rgb(D.screenHairline), rgb(D.screenBg))).toBeGreaterThanOrEqual(2);
  expect(ratio(rgb(D.screenHairline), rgb(D.screenBar))).toBeGreaterThanOrEqual(1.7);
  // Red as a fill, a border or an icon (the broken card's edge, the export's error icon), and the gold progress on its navy rest.
  for (const s of [D.screenBg, D.screenBar]) expect(ratio(rgb(D.danger), rgb(s))).toBeGreaterThanOrEqual(3);
  expect(ratio(rgb(D.accent), rgb(D.screenTile))).toBeGreaterThanOrEqual(3);
  // Ink on gold is untouched.
  expect(Math.round(ratio(rgb(D.onAccent), rgb(D.accent)) * 100) / 100).toBe(9.24);
});

test("contrast on slate: white, the muted label, the red text and gold on all five steps; the separator; the track; selection on the timeline", () => {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const table = SLATE.map((s) => [ratio(rgb(D.text), rgb(s)), ratio(over(D.textMuted, s), rgb(s)), ratio(rgb(D.dangerText), rgb(s)), ratio(rgb(D.accent), rgb(s)), ratio(rgb(D.hairline), rgb(s)), ratio(rgb(D.track), rgb(s))].map(r2));
  // (page, timeline, bar, tile, lifted) × (text, muted, red text, gold, separator, track) — recorded in the spec.
  expect(table).toEqual([
    [18.28, 7.98, 8.96, 9.23, 1.84, 3.25],
    [16.71, 7.52, 8.19, 8.44, 1.68, 2.97],
    [14.41, 6.75, 7.07, 7.28, 1.45, 2.56],
    [11.8, 5.79, 5.78, 5.96, 1.19, 2.1],
    [9.5, 4.88, 4.66, 4.8, 1.05, 1.69],
  ]);
  for (const row of table) { expect(row[0]).toBeGreaterThanOrEqual(7); for (const r of row.slice(1, 4)) expect(r).toBeGreaterThanOrEqual(4.5); }
  // The slider's rest track: seen on a bar and on a tile, and apart from the gold part. The Stabilize meter's empty bars are this colour on a tile (2.10) and on the selected tile (1.69).
  expect(r2(ratio(rgb(D.accent), rgb(D.track)))).toBe(2.84);
  // On the timeline: a clip's gold selection, and a bar's white border against the bar colours (gold there would be 1.1).
  expect(r2(ratio(rgb(D.accent), rgb(D.timeline)))).toBe(8.44);
  for (const k of KINDS) { expect(ratio(rgb(D.text), rgb(k))).toBeGreaterThanOrEqual(2); expect(ratio(rgb(k), rgb(D.timeline))).toBeGreaterThanOrEqual(7); }
  // The red fill (an icon, a border) on the page and on a bar.
  expect([D.bg, D.surfaceBar].map((s) => r2(ratio(rgb(D.danger), rgb(s))))).toEqual([5.36, 4.23]);
  // The video's own frame is true black, darker than its slate surround: the picture's edge is where the export's is.
  expect(r2(ratio(rgb(D.bg), rgb(D.surface)))).toBe(1.15);
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
  expect(theme.radius).toEqual({ card: 20, chip: 8, tile: 7, field: 12, sheet: 28, pill: 999, box: 12, cover: 20, emblem: 28 });
  expect(theme.space).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, gutter: 16 });
  expect(theme.size).toEqual({ touch: 44, control: 48, controlCompact: 36, iconButton: 40, toolBox: 44, toolColumn: 72, chip: 36, chipCompact: 28, row: 48, header: 44, done: 32, listRow: 56, avatar: 32, ring: 120, badge: 24, more: 32, emblem: 88, icon: { sm: 16, md: 20, lg: 24, xl: 32, hero: 48 } });
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
