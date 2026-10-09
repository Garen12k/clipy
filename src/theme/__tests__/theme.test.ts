import { readdirSync } from "fs";
import { join } from "path";
import { coverFontAssets, COVER_FONT } from "@/src/editor/coverFont";
import { EDITOR_APPEARANCE, FIXED, PALETTES, resolvePalette, SCREEN_KEYS, theme, type Palette } from "../theme";

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
  expect(theme.elevation).toEqual({ page: D.bg, bar: D.surfaceBar, tile: D.surfaceAlt, lifted: D.surfaceHigh, picked: D.surfacePicked });
  expect(theme.ring).toEqual({ borderWidth: 2, borderColor: D.accent });
  expect(theme.ringClear).toEqual({ borderWidth: 2, borderColor: "transparent" });
});

test("the screen family: the navy of every screen that is not the editor — four steps, each lighter than the last, with its own muted, separator and red", () => {
  expect(D).toMatchObject({ screenBg: "#0A1B33", screenBar: "#112C4D", screenTile: "#17365C", screenLifted: "#1F4572",
    screenMuted: "rgba(235,235,245,0.7)", screenHairline: "#2B5080", screenDangerText: "#FF9A93" });
  expect(theme.screen).toEqual({ page: D.screenBg, bar: D.screenBar, tile: D.screenTile, lifted: D.screenLifted, picked: D.screenPicked, text: D.screenText, muted: D.screenMuted, separator: D.screenHairline,
    accentInk: D.accentInk, danger: D.screenDanger, dangerText: D.screenDangerText });
  // Two roles inside ONE palette: the same eight names in each family, the editor's being the neutrals `elevation` already names.
  expect(theme.surfaces.screen).toBe(theme.screen);
  expect(theme.surfaces.editor).toEqual({ ...theme.elevation, text: D.text, muted: D.textMuted, separator: D.hairline, accentInk: D.accent, danger: D.danger, dangerText: D.dangerText });
  expect(Object.keys(theme.surfaces.editor).sort()).toEqual(Object.keys(theme.surfaces.screen).sort());
  for (const k of ["page", "bar", "tile", "lifted", "picked", "separator"] as const) expect(theme.surfaces.screen[k]).not.toBe(theme.surfaces.editor[k]);
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

test("the picked tile's tint: the one gold at 16 % over the tile step of each family, opaque; a white label and the gold ring read on it", () => {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const mix = (top: string, under: string, a: number) => "#" + rgb(top).map((v, i) => Math.round(v * a + rgb(under)[i] * (1 - a)).toString(16).padStart(2, "0")).join("").toUpperCase();
  expect(D.surfacePicked).toBe("#484C52");
  expect(D.screenPicked).toBe("#364A5E");
  expect(mix(D.accent, D.surfaceAlt, 0.16)).toBe(D.surfacePicked);
  expect(mix(D.accent, D.screenTile, 0.16)).toBe(D.screenPicked);
  expect(theme.elevation.picked).toBe(D.surfacePicked);
  expect(theme.surfaces.editor.picked).toBe(D.surfacePicked);
  expect(theme.surfaces.screen.picked).toBe(D.screenPicked);
  // The white label on the tint (≥ 4.5; it clears 7), the gold ring and glyph on it (≥ 3), and the tint apart from the unpicked tile.
  expect([D.surfacePicked, D.screenPicked].map((s) => r2(ratio(rgb(D.text), rgb(s))))).toEqual([8.64, 9.14]);
  for (const s of [D.surfacePicked, D.screenPicked]) { expect(ratio(rgb(D.text), rgb(s))).toBeGreaterThanOrEqual(7); expect(ratio(rgb(D.accent), rgb(s))).toBeGreaterThanOrEqual(3); }
  expect([r2(ratio(rgb(D.surfacePicked), rgb(D.surfaceAlt))), r2(ratio(rgb(D.screenPicked), rgb(D.screenTile)))]).toEqual([1.37, 1.34]);
  // A tint of the gold, warmer than the step it lies on: red has come up further than blue.
  for (const [p, t] of [[D.surfacePicked, D.surfaceAlt], [D.screenPicked, D.screenTile]]) expect(rgb(p)[0] - rgb(t)[0]).toBeGreaterThan(rgb(p)[2] - rgb(t)[2]);
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
  expect(resolvePalette(PALETTES, "dark")).toBe(PALETTES.dark);
  expect(resolvePalette(PALETTES, "light")).toBe(PALETTES.light);
  expect(Object.keys(PALETTES)).toEqual(["dark", "light"]);
  for (const k of keys as (keyof Palette)[]) expect(theme.colors[k]).toBe(D[k]);
  for (const k of FIXED) expect(keys).toContain(k);
  expect([...FIXED].sort()).toEqual(["kindCaption", "kindEffect", "kindLayer", "kindMusic", "kindSfx", "kindSticker", "kindText", "kindVoice", "onKind", "onScrim", "scrim", "scrimStrong", "surface", "timeline"]);
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

// ───────────────────────────────────────────── Light: the phone's light setting ─────────────────────────────────────────────

const L = PALETTES.light;
const r2 = (n: number) => Math.round(n * 100) / 100;
const c = (a: string, b: string) => r2(ratio(rgb(a), rgb(b)));

test("PROOF — dark did not move: every colour the dark palette had before the light one was built, value for value", () => {
  // Copied from theme.ts as it stood before this change (commit 0dfcb35). Never edited to make a change pass.
  const BEFORE = {
    bg: "#10151F", timeline: "#171E2B", surface: "#000000", surfaceBar: "#212A3A", surfaceAlt: "#2C384D", surfaceHigh: "#374661", surfacePicked: "#484C52",
    accent: "#D9B36A", onAccent: "#1A1408",
    text: "#FFFFFF", textMuted: "rgba(235,235,245,0.7)", hairline: "#35435D", track: "#52688F",
    danger: "#FF453A", dangerText: "#FF9A93",
    kindText: "#79B6F4", kindCaption: "#AFB965", kindSticker: "#E095C7", kindMusic: "#47C5D2", kindVoice: "#6DC799", kindSfx: "#ED997B", kindLayer: "#A8B2BE", kindEffect: "#B6A3F0",
    onKind: "#000000",
    scrim: "rgba(0,0,0,0.55)", scrimStrong: "rgba(0,0,0,0.72)",
    screenBg: "#0A1B33", screenBar: "#112C4D", screenTile: "#17365C", screenLifted: "#1F4572", screenPicked: "#364A5E",
    screenMuted: "rgba(235,235,245,0.7)", screenHairline: "#2B5080", screenDangerText: "#FF9A93",
  };
  // The four roles added with light are, in dark, the colours the screens already drew those things in: white text, the one gold, the fill red.
  const ADDED = { accentInk: BEFORE.accent, screenText: BEFORE.text, screenDanger: BEFORE.danger, onScrim: BEFORE.text };
  expect(D).toEqual({ ...BEFORE, ...ADDED });
  // And what the dark screens are handed is those values: the eight roles they had, and the three new ones.
  expect(theme.screens.dark).toEqual({ page: "#0A1B33", bar: "#112C4D", tile: "#17365C", lifted: "#1F4572", picked: "#364A5E", muted: "rgba(235,235,245,0.7)", separator: "#2B5080", dangerText: "#FF9A93",
    text: "#FFFFFF", accentInk: "#D9B36A", danger: "#FF453A" });
});

test("two palettes, the same keys; light differs ONLY in the screen family — the editor's family, the gold fill and everything fixed are the dark values, key by key", () => {
  expect(Object.keys(L).sort()).toEqual(Object.keys(D).sort());
  const keys = Object.keys(D) as (keyof Palette)[];
  const differs = keys.filter((k) => L[k] !== D[k]);
  expect(differs.sort()).toEqual([...SCREEN_KEYS].sort());                       // each screen key really is its own colour in light, and nothing else moved
  for (const k of keys) if (!SCREEN_KEYS.includes(k)) expect(`${k} ${L[k]}`).toBe(`${k} ${D[k]}`);
  for (const k of FIXED) { expect(SCREEN_KEYS).not.toContain(k); expect(L[k]).toBe(D[k]); }
  // So what the editor reads is one constant object whatever the phone says.
  expect(EDITOR_APPEARANCE).toBe("dark");
  expect(theme.colors).toBe(D);
  for (const k of keys) if (!SCREEN_KEYS.includes(k)) expect(theme.colors[k]).toBe(L[k]);
  expect(theme.surfaces.editor).toEqual({ page: "#10151F", bar: "#212A3A", tile: "#2C384D", lifted: "#374661", picked: "#484C52", text: "#FFFFFF", muted: "rgba(235,235,245,0.7)", separator: "#35435D",
    accentInk: "#D9B36A", danger: "#FF453A", dangerText: "#FF9A93" });
});

test("the cream family: the owner's page and card, navy text, and the steps derived in the same warm hue — on a light page a step is darker", () => {
  expect(L).toMatchObject({ screenBg: "#F7F1E3", screenBar: "#FFFBF1", screenText: "#0A1B33", accent: "#D9B36A", onAccent: "#1A1408" });   // the owner's, verbatim
  expect(L).toMatchObject({ screenTile: "#EBE2CC", screenLifted: "#DDD0B4", screenPicked: "#E8DABC", screenMuted: "#4B576B", screenHairline: "#D2C5A9",
    accentInk: "#7A5200", screenDangerText: "#A3261C", screenDanger: "#C92A1A" });
  expect(L.screenText).toBe(D.screenBg);                                         // the text IS the dark page's navy
  expect(theme.screens.light).toEqual({ page: L.screenBg, bar: L.screenBar, tile: L.screenTile, lifted: L.screenLifted, picked: L.screenPicked, text: L.screenText, muted: L.screenMuted,
    separator: L.screenHairline, accentInk: L.accentInk, danger: L.screenDanger, dangerText: L.screenDangerText });
  expect(Object.keys(theme.screens.light).sort()).toEqual(Object.keys(theme.surfaces.editor).sort());
  // One ramp: card (lightest) → page → tile → lifted, each darker; and warm in every step (red leads green leads blue).
  const ramp = [L.screenBar, L.screenBg, L.screenTile, L.screenLifted];
  for (let i = 1; i < ramp.length; i++) expect(lum(rgb(ramp[i]))).toBeLessThan(lum(rgb(ramp[i - 1])));
  for (const n of [...ramp, L.screenPicked, L.screenHairline]) { const [r, g, b] = rgb(n); expect(r).toBeGreaterThan(g); expect(g).toBeGreaterThan(b); }
  // The picked tint is computed as the dark families compute theirs: the one gold at 16 % over the tile step.
  const mix = (top: string, under: string, a: number) => "#" + rgb(top).map((v, i) => Math.round(v * a + rgb(under)[i] * (1 - a)).toString(16).padStart(2, "0")).join("").toUpperCase();
  expect(mix(L.accent, L.screenTile, 0.16)).toBe(L.screenPicked);
});

test("contrast on cream, measured: text, muted, gold ink, red text, red symbol, separator — on page, card, tile, lifted and the picked tint", () => {
  const steps = [L.screenBg, L.screenBar, L.screenTile, L.screenLifted, L.screenPicked];
  const table = steps.map((s) => [L.screenText, L.screenMuted, L.accentInk, L.screenDangerText, L.screenDanger, L.screenHairline].map((ink) => c(ink, s)));
  // (page, card, tile, lifted, picked) × (text, muted, gold ink, red text, red symbol, separator)
  expect(table).toEqual([
    [15.32, 6.49, 6.14, 6.54, 4.87, 1.52],
    [16.69, 7.07, 6.7, 7.13, 5.31, 1.65],
    [13.37, 5.66, 5.37, 5.71, 4.25, 1.32],
    [11.3, 4.79, 4.53, 4.82, 3.59, 1.12],
    [12.47, 5.28, 5, 5.33, 3.97, 1.23],
  ]);
  for (const row of table) {
    expect(row[0]).toBeGreaterThanOrEqual(7);                                    // navy text
    expect(row[1]).toBeGreaterThanOrEqual(4.5);                                  // muted — also a Field's placeholder, which is `muted` on `tile` (5.66)
    expect(row[2]).toBeGreaterThanOrEqual(4.5);                                  // gold as ink: text actions, rings, progress, ticks
    expect(row[3]).toBeGreaterThanOrEqual(4.5);                                  // red words
    expect(row[4]).toBeGreaterThanOrEqual(3);                                    // red as a symbol or a border
  }
  // The bright gold is NOT ink on cream — which is why `accentInk` exists.
  expect(steps.map((s) => c(L.accent, s))).toEqual([1.76, 1.92, 1.54, 1.3, 1.43]);
  // The owner's example of a deep gold would miss on the tile step; the one chosen is the next shade down.
  expect(c("#8B5F00", L.screenTile)).toBe(4.36);
  // The primary button: its ink on the gold fill is untouched.
  expect(c(L.onAccent, L.accent)).toBe(9.24);
});

test("layering on cream: each step is seen on the one it sits on; a secondary button is never the step under it; the separator is quiet but there", () => {
  // card on page (plus its separator edge), tile on page / on card, lifted on tile / page / card.
  expect([c(L.screenBar, L.screenBg), c(L.screenTile, L.screenBg), c(L.screenTile, L.screenBar), c(L.screenLifted, L.screenTile), c(L.screenLifted, L.screenBg), c(L.screenLifted, L.screenBar)])
    .toEqual([1.09, 1.15, 1.25, 1.18, 1.36, 1.48]);
  // The secondary button's fill (`lifted`): "Quick Edit" on Home's page, "Share…" and "Post Another Video" on Post's page, the sheets' buttons on a card, a Segmented's picked segment on its tile track.
  for (const under of [L.screenBg, L.screenBar, L.screenTile]) { expect(L.screenLifted).not.toBe(under); expect(c(L.screenLifted, under)).toBeGreaterThanOrEqual(1.15); }
  // A field, a logo tile, the rest of a progress ring (`tile`) on a card and on the page.
  for (const under of [L.screenBg, L.screenBar]) expect(c(L.screenTile, under)).toBeGreaterThanOrEqual(1.15);
  // The separator: a card's edge on the page, a row line on the card, a toast's edge (a tile on the page).
  expect(c(L.screenHairline, L.screenBg)).toBeGreaterThanOrEqual(1.5);
  expect(c(L.screenHairline, L.screenBar)).toBeGreaterThanOrEqual(1.6);
  expect(c(L.screenHairline, L.screenTile)).toBeGreaterThanOrEqual(1.3);
  // The picked tile is apart from the unpicked one by its gold-ink ring (5.0 on the tint), not by the tint alone.
  expect(c(L.screenPicked, L.screenTile)).toBe(1.07);
});

test("disabled on cream (the whole button at 40 %): still a button on its page, its label still found — measured, not a pass mark", () => {
  const A = 0.4;                                                                 // DISABLED_OPACITY (src/ui/buttonStyle.ts)
  const lay = (top: string, under: number[], a: number) => rgb(top).map((v, i) => v * a + under[i] * (1 - a));
  const dim = (fill: string, ink: string, under: string) => { const f = lay(fill, rgb(under), A); return [r2(ratio(lay(ink, f, A), f)), r2(ratio(f, rgb(under)))]; };
  // [label on its fill, fill on what is under it]
  expect(dim(L.screenLifted, L.screenText, L.screenBg)).toEqual([2.42, 1.12]);   // a secondary button on the page
  expect(dim(L.screenLifted, L.screenText, L.screenBar)).toEqual([2.45, 1.16]);  // … on a card
  expect(dim(L.accent, L.onAccent, L.screenBg)).toEqual([2.44, 1.24]);           // the gold button on the page
  // For comparison, the same secondary button on navy: its dimmed label is stronger there (white on dark dims less than navy on cream).
  expect(dim(D.screenLifted, D.screenText, D.screenBg)).toEqual([3.51, 1.22]);
});
