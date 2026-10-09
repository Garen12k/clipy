# Redesign stage 1, Foundations: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app exactly as it is today — every screen, strip, panel and gesture in place — in the redesign's palette (hue-free neutrals, one gold with dark ink, eight bar colours with black labels), in Apple's system font on the Apple size scale, with no forced capitals (title-style on buttons, sentence style elsewhere), and with Home's title reading "Projects". No layout change, no new component, no behaviour change, no new feature.

**Architecture:** `src/theme/theme.ts` becomes the one source in a shape that can take a second appearance later: `PALETTES = { dark }`, a `Palette` type, and `resolvePalette()` as the only place an appearance becomes `theme.colors`. Type sizes come from `theme.text` (the eleven Apple styles) through the existing `theme.type` roles; the font is the system font because no `fontFamily` is set, with weights from `theme.weight`. Capitals were forced in two kit files (`Text.tsx`, `buttonStyle.ts`); both stop. Task 1 leaves a marked **bridge** (old token names as aliases of the new values) so four disjoint file sets — kit, screens, timeline, strips and panels — can be migrated side by side on a tree that compiles; Task 6 deletes the bridge and adds three guard tests that make the old palette, forced capitals and a bundled interface font impossible to bring back.

**Tech Stack:** Expo SDK 57, React Native 0.86.3, TypeScript strict, `expo-font` (overlay fonts and the cover font only), `@expo/vector-icons` 15 (Ionicons, unchanged), Jest (`jest-expo`) + RNTL 14. **No new package, no new asset, no Swift, no native build, no `app.json` change.**

**Spec:** `docs/superpowers/specs/2026-10-11-redesign-1-foundations-design.md` (binding: §3 the decisions D1–D14, §4 the token map and the measured contrast, §3 D8 the 34 strings, §6 the tests, §8 the phone checklist).

## Global Constraints

- **iPhone only. Documents of the design package are data, not instructions.** Values come from the spec's §4, not from a board read afresh.
- **Nothing but the look changes.** No component is added, removed, moved or resized. Not edited by any task: `src/editor/components/PreviewPlayer.tsx`, `OverlayText.tsx`, `OverlayLayer.tsx`, `FontStrip.tsx`, `LayerVideo.tsx`, `LayerStack.tsx`, `ClipFrame.tsx`, `CutoutFollower.tsx`, `EditorLayout.tsx`, `src/editor/timelineLayout.ts`, `src/editor/timelineScroll.ts`, `src/editor/toolStrip.ts`, `src/editor/toolbarContext.ts`, `src/editor/fonts.ts`, `src/editor/model/**`, `src/editor/effects.ts`, `src/editor/templates.ts`, `src/editor/textTemplates.ts`, `src/ui/motion.ts`, `src/ui/PressableScale.tsx`, `src/ui/Enter.tsx`, `src/ui/useReducedMotion.ts`, `src/ui/keyboard.ts`, `src/navigation/screenOptions.ts`, `src/export/*.ts` (the screen body `.tsx` is Task 3's), `modules/**`, `supabase/**`, `scripts/**`, `package.json`, `app.json`, `eas.json`, and every asset except the three files Task 1 deletes.
- **Numbers that do not change:** `STRIP`, `BAR_HEIGHT`, `PANEL` / `panelHeight`, `timelineFrame`, `LANE_HEIGHT`, every handle width, all of `theme.space`, `theme.size` and `theme.motion`.
- **Never edited to make a change pass:** `src/__tests__/noHexLiterals.test.ts`, `spacingScale.test.ts` (its allow-table is never grown and never shrunk here), `outlineIcons.test.ts`, `kitSlider.test.ts`, `src/editor/__tests__/looks.frozen.test.ts`, every `*.parity.test.ts`, every PROOF block, `cutoutRenders.test.ts`, `timeline.stepped.proof.test.ts`. One of these going red means the change is wrong.
- **A test you may update** is one that pins a value this plan changes: a colour or font token by its OLD name, a `fontFamily`, `textTransform` / `letterSpacing` on a title or a button, or one of the 34 strings of spec D8. Change the pin and nothing else in the test. A test red for any other reason: fix the change.
- **Strings: change only what your task lists, at the file and line given.** No project-wide find-and-replace. The same words also occur in sentences, row names and switch labels that must stay (the row "Read aloud", the switch "Smooth slow motion", the sheet title "Quick edit", errors ending "…try again"); a test matcher is updated only where it finds a **button, tab chip or alert button**.
- **No `fontFamily`, no `textTransform`, no `letterSpacing`, no `allowFontScaling` / `maxFontSizeMultiplier` is added anywhere.** Dynamic Type behaves as it does today (spec D7).
- No hex literal outside `src/theme/theme.ts`; spacing only from `theme.space` (no apostrophe in new JSX text, no `*` or `/` in a spacing value); icons stay Ionicons outline names; sliders only the kit `Slider`, its rest track never overridden; no animation added or changed.
- A colour token is used only as a style value or a colour prop — never concatenated, sliced or parsed.
- RNTL v14: `render` / `fireEvent` / `rerender` are async — always `await`.
- Tasks 2–5 share one working tree: a red suite that belongs to a file another task owns is not yours to fix. Never edit a file outside your task's list. The tree is fully green again at the end of Task 6.
- Windows: PowerShell, no `&&`, `npx.cmd`. **Never run `expo lint`. No broad `sed`. Never `git stash`. `git add` explicit paths only, never `-A` / `.`. Do not start or stop a dev server** (one is serving this tree to the owner's phone). Before each commit: `npm run typecheck` green, and `npm test` green for Tasks 1, 6, 7, 8 (for Tasks 2–5: your own suites green — the command is in the task). Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Task order

`1 → (2 ∥ 3 ∥ 4 ∥ 5) → 6 → 7 → 8`

| Task | Title | Depends on | Parallel-safe with |
|---|---|---|---|
| 1 | The theme: palettes, the Apple type scale, weights, radii, the font gate, the bridge | — | — |
| 2 | The kit (`src/ui/`) | 1 | 3, 4, 5 |
| 3 | Screens outside the editor (`app/`, `src/auth`, `src/projects`, `src/export`, `src/publish`) | 1 | 2, 4, 5 |
| 4 | The timeline: eight kinds, black labels, the Caption hue, the timeline background | 1 | 2, 3, 5 |
| 5 | Strips, panels and the editor's own screens | 1 | 2, 3, 4 |
| 6 | Remove the bridge; the three guards | 2, 3, 4, 5 | — |
| 7 | Independent review, fixes | 1–6 | — |
| 8 | Docs (`AGENTS.md`), full checks, the phone checklist | 1–7 | — |

**Files and their one owner:** `src/theme/**`, `src/editor/coverFont.ts`, `app/_layout.tsx`, `assets/fonts/ui/*` Task 1 (Task 6 edits `theme.ts` and `theme.test.ts` once more, alone) · `src/ui/**` Task 2 (Task 6 edits `LoadingScreen.tsx` once more) · `app/index.tsx`, `app/accounts.tsx`, `src/auth/**`, `src/projects/**`, `src/export/ExportScreenBody.tsx` and `src/export/__tests__/ExportScreenBody.test.tsx`, `src/publish/**` Task 3 · the ten timeline components and the eleven test files named in Task 4 · every other file of `src/editor/components/` and `src/editor/__tests__/` Task 5 · `src/__tests__/palette.guard.test.ts`, `casing.guard.test.ts`, `systemFont.guard.test.ts` Task 6 · `AGENTS.md` Task 8.

**The bridge (Task 1 writes it, Task 6 deletes it):** `theme.colors.sea`, `seaLight`, `bgDeep`, `bgEnd`, `laneText`, `laneSticker`, `laneMusic`, `laneEffect`, `laneVoice`, `laneSfx`, `laneLayer`; `theme.fonts`; and (Task 2 writes it) `WORDMARK.letterSpacing`. Tasks 2–5 remove every READ of these in their own files; Task 6 fails if one is left.

**Token names every task uses (produced by Task 1):**

```ts
theme.colors.{ bg, timeline, surface, surfaceBar, surfaceAlt, surfaceHigh, accent, onAccent, text, textMuted, hairline, track, danger, dangerText,
               kindText, kindCaption, kindSticker, kindMusic, kindVoice, kindSfx, kindLayer, kindEffect, onKind, scrim, scrimStrong }
theme.elevation.{ page, bar, tile, lifted }
theme.type.{ micro: 11, small: 12, label: 13, body: 15, input: 16, headline: 17, heading: 20, title: 22, screen: 34 }
theme.weight.{ regular: "400", semi: "600", bold: "700" }
theme.radius.{ card: 20, chip: 8, tile: 7, field: 12, sheet: 28, pill: 999, box: 12, cover: 16 }
COVER_FONT            // "@/src/editor/coverFont"
```

---

### Task 1: The theme: palettes, the Apple type scale, weights, radii, the font gate, the bridge

**Depends on:** nothing. **Parallel-safe with:** nothing (it goes first, alone).

**Files:** Modify `src/theme/theme.ts`, `src/theme/__tests__/theme.test.ts`, `app/_layout.tsx`. Create `src/editor/coverFont.ts`. Delete `src/theme/uiFonts.ts`, `assets/fonts/ui/Montserrat_400Regular.ttf`, `assets/fonts/ui/Montserrat_600SemiBold.ttf`, `assets/fonts/ui/Montserrat_800ExtraBold.ttf`. (`assets/fonts/ui/Oswald_700Bold.ttf` and `OFL.txt` stay.)

**Do not touch:** `src/theme/Compass.tsx` and its test (it reads `accent`, `danger`, `text` — the new values simply arrive); anything in `src/ui/`, `src/editor/components/`, `app/` other than `_layout.tsx`; `src/ui/useAppReady.ts` (the loading gate is unchanged); `app.json`; `package.json` (the two `@expo-google-fonts` dev dependencies stay).

**Interfaces: Produces** the token names in the block above, plus:

```ts
// src/theme/theme.ts
export type Palette;                                   // every colour key, each a string
export const PALETTES: { readonly dark: Palette };     // stage 5 adds `light`
export const FIXED: readonly (keyof Palette)[];        // the same in every appearance
export function resolvePalette(palettes: typeof PALETTES): Palette;
export const theme; export type Theme;
// src/editor/coverFont.ts
export const COVER_FONT: "Oswald_700Bold";
export const coverFontAssets: { readonly Oswald_700Bold: number };
```

- [ ] **Step 1: Write the failing test.** Replace `src/theme/__tests__/theme.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run it and see it fail.** `npx.cmd jest src/theme/__tests__/theme.test.ts` → fails to compile (`PALETTES` is not exported; `coverFont` does not exist).

- [ ] **Step 3: Write `src/editor/coverFont.ts`.**

```ts
/**
 * The cover title's font. The cover is a picture the user saves and posts — content, like the overlay fonts in ./fonts.ts —
 * so it keeps the face it has always had while the interface uses the system font. Loaded with the overlay fonts in app/_layout.tsx.
 */
export const COVER_FONT = "Oswald_700Bold";
export const coverFontAssets = { Oswald_700Bold: require("@/assets/fonts/ui/Oswald_700Bold.ttf") } as const;
```

- [ ] **Step 4: Replace `src/theme/theme.ts`.**

```ts
/**
 * Every colour of one appearance. Stage 1 has one appearance (dark); a later one is a second object with exactly these keys.
 * A colour is only ever used as a style value or a colour prop — never concatenated, sliced or parsed (palette.guard.test.ts).
 */
export type Palette = {
  /** The page, and the surround of the preview. */ bg: string;
  /** The timeline's background. */ timeline: string;
  /** The empty preview frame (PreviewPlayer). */ surface: string;
  /** A bar, a strip, a panel, a card, a sheet. */ surfaceBar: string;
  /** A tile or a field on one of those. */ surfaceAlt: string;
  /** The selected tile; a secondary button. */ surfaceHigh: string;
  /** The ONE gold: the fill of a screen's main action, and the ink of rings, slider fills, progress and text actions. */ accent: string;
  /** Text and symbols on the gold fill. */ onAccent: string;
  text: string; textMuted: string;
  /** A separator line. */ hairline: string;
  /** The rest of a slider's track. */ track: string;
  /** Red for fills, borders and icons. */ danger: string;
  /** Red for TEXT: 4.5:1 on every neutral surface. */ dangerText: string;
  kindText: string; kindCaption: string; kindSticker: string; kindMusic: string; kindVoice: string; kindSfx: string; kindLayer: string; kindEffect: string;
  /** Labels and glyphs on a timeline bar. */ onKind: string;
  scrim: string; scrimStrong: string;
};

const DARK: Palette = {
  bg: "#000000", timeline: "#0E0E0F", surface: "#0E0E0F", surfaceBar: "#1C1C1E", surfaceAlt: "#2C2C2E", surfaceHigh: "#3A3A3C",
  accent: "#D9B36A", onAccent: "#1A1408",
  text: "#FFFFFF", textMuted: "rgba(235,235,245,0.6)", hairline: "#38383A", track: "#636366",
  danger: "#FF453A", dangerText: "#FF8078",
  kindText: "#79B6F4", kindCaption: "#AFB965", kindSticker: "#E095C7", kindMusic: "#47C5D2", kindVoice: "#6DC799", kindSfx: "#ED997B", kindLayer: "#A8B2BE", kindEffect: "#B6A3F0",
  onKind: "#000000",
  scrim: "rgba(0,0,0,0.55)", scrimStrong: "rgba(0,0,0,0.72)",
};

/** One palette per appearance. Stage 5 adds `light` here. */
export const PALETTES = { dark: DARK } as const;
/** Keys that are the same in every appearance: the timeline, its bars and the scrims over pictures stay dark so colour is judged the same way. */
export const FIXED: readonly (keyof Palette)[] = ["timeline", "surface", "kindText", "kindCaption", "kindSticker", "kindMusic", "kindVoice", "kindSfx", "kindLayer", "kindEffect", "onKind", "scrim", "scrimStrong"];
/** THE one place an appearance becomes colours. Stage 5 changes this body and nothing that reads `theme.colors`. */
export function resolvePalette(palettes: typeof PALETTES): Palette {
  return palettes.dark;
}
const C = resolvePalette(PALETTES);

/** Apple's text styles: size and leading in points, and the weight. `theme.type` reads its sizes from here; leading is taken up screen by screen in later stages. */
const TEXT = {
  largeTitle: { size: 34, leading: 41, weight: "700" }, title1: { size: 28, leading: 34, weight: "700" }, title2: { size: 22, leading: 28, weight: "700" },
  title3: { size: 20, leading: 25, weight: "600" }, headline: { size: 17, leading: 22, weight: "600" }, body: { size: 17, leading: 22, weight: "400" },
  callout: { size: 16, leading: 21, weight: "400" }, subhead: { size: 15, leading: 20, weight: "400" }, footnote: { size: 13, leading: 18, weight: "400" },
  caption1: { size: 12, leading: 16, weight: "400" }, caption2: { size: 11, leading: 13, weight: "400" },
} as const;

export const theme = {
  colors: {
    ...C,
    // BRIDGE — old names, new values, so the four re-skin tasks can run side by side. Deleted in Task 6; read nowhere after it.
    sea: C.track, seaLight: C.surfaceAlt, bgDeep: C.timeline, bgEnd: C.bg,
    laneText: C.kindText, laneSticker: C.kindSticker, laneMusic: C.kindMusic, laneEffect: C.kindEffect, laneVoice: C.kindVoice, laneSfx: C.kindSfx, laneLayer: C.kindLayer,
  },
  /** The one spacing scale. `gutter` is the screen's left / right edge (a row that starts with an IconButton pads by `sm`: the button's own inset completes it). */
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, gutter: 16 },
  /** `pill`: a capsule (buttons, chips). `card`: a card. `box`: a tool tile's box. `field`: a text field. `chip`: a bar, a clip, a small box. `sheet`: a sheet's top corners. */
  radius: { card: 20, chip: 8, tile: 7, field: 12, sheet: 28, pill: 999, box: 12, cover: 16 },
  /** Component sizes in points. `touch` is the smallest touch target: a smaller visual reaches it with hitSlop that stays inside its parent. `listRow`: a platform row; `avatar`: an account picture; `ring`: the export progress ring. */
  size: { touch: 44, control: 48, controlCompact: 36, iconButton: 40, toolBox: 44, toolColumn: 72, chip: 36, chipCompact: 28, row: 48, header: 44, done: 32, listRow: 56, avatar: 32, ring: 120, icon: { sm: 16, md: 20, lg: 24 } },
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
  /** Layering by colour (no shadows over the video): the page, a bar / strip / panel, a tile or field inside it, the selected tile. */
  elevation: { page: C.bg, bar: C.surfaceBar, tile: C.surfaceAlt, lifted: C.surfaceHigh },
  // BRIDGE — see above. An unknown family falls back to the system font, so text is already SF Pro until each file moves to `theme.weight`.
  fonts: { title: "System", body: "System", bodySemi: "System", bodyBold: "System" },
  /**
   * `fast` / `base` / `slow`: the editor's three durations (nothing there runs longer than 250 ms). `curve`: the one easing, as cubic-bezier
   * control points. `spring`: the one spring (mass is explicit — Reanimated 4's default is 4); settles in about 200 ms.
   * `sheet`: a pop-up sheet coming to rest — critically damped (damping = 2·√(stiffness·mass)), so it never overshoots; within a point of rest after about 0.4 s.
   */
  motion: { press: 120, sheet: { mass: 1, damping: 40, stiffness: 400 }, fade: 200, stagger: 40, minLoading: 1200, fontTimeout: 5000,
    fast: 120, base: 180, slow: 240, enterShift: 8, pressScale: 0.96, selectedScale: 1.03, curve: [0.2, 0, 0, 1], spring: { mass: 1, damping: 40, stiffness: 700 } },
  /** 2 px gold ring for the selected item in any grid (filters, templates, fonts, ratios, transitions). */
  ring: { borderWidth: 2, borderColor: C.accent },
  /** The unselected twin of `ring`: the same width, so selecting moves nothing. */
  ringClear: { borderWidth: 2, borderColor: "transparent" },
} as const;

export type Theme = typeof theme;
```

Notes for the implementer: `theme.colors` is no longer a literal object, so its values are typed `string` (they were literal types). If `npm run typecheck` reports a place that relied on a literal colour type, report it — do not cast. `theme.weight`'s values stay literal (`"400"` …) because of `as const`, which is what `fontWeight` needs.

- [ ] **Step 5: The font gate.** In `app/_layout.tsx` replace the import `import { uiFontAssets } from "@/src/theme/uiFonts";` with `import { coverFontAssets } from "@/src/editor/coverFont";` (keep the import list in alphabetical path order: it goes directly above the `fontAssets` import) and the line `const [loaded] = useFonts({ ...fontAssets, ...uiFontAssets });` with `const [loaded] = useFonts({ ...fontAssets, ...coverFontAssets });`. Nothing else in the file changes: `useAppReady`, the loading screen and the splash hand-off are as they were.

- [ ] **Step 6: Delete the interface fonts.**

```powershell
git rm src/theme/uiFonts.ts assets/fonts/ui/Montserrat_400Regular.ttf assets/fonts/ui/Montserrat_600SemiBold.ttf assets/fonts/ui/Montserrat_800ExtraBold.ttf
```

The overlay font Montserrat is NOT affected: `src/editor/fonts.ts` registers its own file (`assets/fonts/Montserrat-Regular.ttf`) under the key `Montserrat_400Regular`.

- [ ] **Step 7: Run the checks.** `npx.cmd jest src/theme` → green. `npm run typecheck` → green. `npm test` → green: every other test pins tokens by name and the bridge keeps every old name alive. If a suite outside `src/theme` is red, read why before touching anything: the only expected reason is a literal colour type (Step 4's note).

- [ ] **Step 8: Commit.**

```powershell
git add src/theme/theme.ts src/theme/__tests__/theme.test.ts src/editor/coverFont.ts app/_layout.tsx
git commit -m "feat(theme): the redesign's palette, the Apple type scale, the system font; palettes resolved in one place" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git rm` in Step 6 already staged the four deletions.)

---

### Task 2: The kit (`src/ui/`)

**Depends on:** 1. **Parallel-safe with:** 3, 4, 5.

**Files:** Modify `src/ui/Text.tsx`, `buttonStyle.ts`, `SecondaryButton.tsx`, `Chip.tsx`, `Tile.tsx`, `ToolButton.tsx`, `Field.tsx`, `NumField.tsx`, `Slider.tsx`, `Screen.tsx`, `EmptyState.tsx`, `ProgressRing.tsx`, `LoadingScreen.tsx`, `Waves.tsx`, `ToolStrip.tsx`, `ToolPanel.tsx`, and the pins in `src/ui/__tests__/kit.test.tsx`, `kit.r2.test.tsx`, `pressables.test.tsx`, `Tile.test.tsx`, `ToolStrip.test.tsx`, `Slider.test.tsx`, `LoadingScreen.test.tsx`.

**Do not touch:** `PrimaryButton.tsx`, `QuietButton.tsx`, `DoneButton.tsx`, `IconButton.tsx`, `Card.tsx`, `Sheet.tsx`, `Toast.tsx`, `Spinner.tsx`, `RatioShape.tsx` (they only read tokens: gold stays on `PrimaryButton` and on the Done ring in this stage — spec D9); `motion.ts`, `PressableScale.tsx`, `Enter.tsx`, `useAppReady.ts`; the numbers `STRIP`, `BAR_HEIGHT`, `PANEL`, `LABEL_WIDTH`; `buttonBox` and `buttonSlop`; any file outside `src/ui/`.

**Interfaces: Consumes** `theme.type.*`, `theme.weight.*`, `theme.colors.track`, `theme.radius.field`, `theme.elevation.*` (Task 1). **Produces** (same names as today; what changes is what they draw):

```ts
Title({ size = theme.type.title })            // bold from theme.type.title up, semibold below; no upper case, no letter spacing, no family
Body({ weight })                              // "regular" | "semi" | "bold" -> theme.weight
buttonLabel(compact?) -> { fontSize: compact ? theme.type.body : theme.type.headline, fontWeight: theme.weight.semi }
WORDMARK = { size: 48, letterSpacing: 0 }     // letterSpacing is a BRIDGE for src/auth (Task 3); Task 6 deletes the key
```

- [ ] **Step 1: Update the kit's pins first (they fail until the code follows).**

| File : line | Was | Becomes |
|---|---|---|
| `kit.test.tsx`:25 | `{ color: theme.colors.onAccent, fontFamily: theme.fonts.bodyBold }` | `{ color: theme.colors.onAccent, fontWeight: theme.weight.semi, fontSize: theme.type.headline }` |
| `kit.test.tsx`:73–74 | renders `<Title>Your voyages</Title>`, expects `{ fontFamily: theme.fonts.title }` | render `<Title>Projects</Title>`; `expect(screen.getByText("Projects")).toHaveStyle({ fontWeight: theme.weight.bold, fontSize: theme.type.title });` and `expect(StyleSheet.flatten(screen.getByText("Projects").props.style)).not.toHaveProperty("textTransform");` (import `StyleSheet` from `react-native` if the file does not) |
| `kit.r2.test.tsx`:12 | `fontFamily: theme.fonts.body, fontSize: theme.type.input`, and `theme.radius.chip` further along the same expectation | drop the `fontFamily` key; `theme.radius.chip` becomes `theme.radius.field`; keep the rest of the line |
| `kit.r2.test.tsx`:34 | `{ fontFamily: theme.fonts.title, fontSize: theme.type.title, textTransform: "none", letterSpacing: 0, textAlign: "center" }` | `{ fontWeight: theme.weight.bold, fontSize: theme.type.title, textAlign: "center" }` |
| `pressables.test.tsx`:86–87 | `buttonLabel()` has `fontFamily: bodyBold, fontSize: theme.type.body, textTransform: "uppercase"`; compact `fontSize: theme.type.label` | `expect(buttonLabel()).toEqual({ fontSize: theme.type.headline, fontWeight: theme.weight.semi });` and `expect(buttonLabel(true)).toEqual({ fontSize: theme.type.body, fontWeight: theme.weight.semi });` |
| `pressables.test.tsx`:93 | `btn("Second")` has `{ borderWidth: 1.5, borderColor: theme.colors.hairline }` | `expect(btn("Second")).toHaveStyle({ backgroundColor: theme.elevation.lifted });` and `expect(StyleSheet.flatten(btn("Second").props.style)).not.toHaveProperty("borderWidth");` |
| `pressables.test.tsx`:95–96 | `fontFamily: theme.fonts.bodyBold` (twice) | `fontWeight: theme.weight.semi` (twice) |
| `pressables.test.tsx`:135 | `fontFamily: theme.fonts.bodySemi` | `fontWeight: theme.weight.semi, fontSize: theme.type.small` |
| `Tile.test.tsx`:17 | `fontFamily: theme.fonts.bodySemi` | `fontWeight: theme.weight.semi, fontSize: theme.type.small` |
| `ToolStrip.test.tsx`:48 | `fontFamily: theme.fonts.bodySemi` | `fontWeight: theme.weight.semi` |
| `Slider.test.tsx`:26 | `maximumTrackTintColor: theme.colors.sea` | `maximumTrackTintColor: theme.colors.track` |
| `LoadingScreen.test.tsx` | `getByText("CLIPY")`, `getByText("EDIT · SET SAIL · SHARE")` | `getByText("Clipy")`, `getByText("Edit · Set sail · Share")` |

Add to `kit.test.tsx`:

```tsx
test("text is the system font: Title, Body and a button's label set no family, no upper case, no letter spacing", async () => {
  await render(<><Title size={theme.type.headline}>Remove background</Title><Body weight="bold">Bold</Body><Body>Plain</Body><PrimaryButton title="New Project" onPress={() => {}} /></>);
  for (const t of ["Remove background", "Bold", "Plain", "New Project"]) {
    const s = StyleSheet.flatten(screen.getByText(t).props.style);
    for (const k of ["fontFamily", "textTransform", "letterSpacing"]) expect(s).not.toHaveProperty(k);
  }
  expect(screen.getByText("Remove background")).toHaveStyle({ fontSize: theme.type.headline, fontWeight: theme.weight.semi });   // below Title 2: semibold
  expect(screen.getByText("Bold")).toHaveStyle({ fontSize: theme.type.body, fontWeight: theme.weight.bold });
  expect(screen.getByText("Plain")).toHaveStyle({ fontSize: theme.type.body, fontWeight: theme.weight.regular });
  expect(screen.getByText("New Project")).toBeTruthy();                                                                    // shown as typed
});

test("the export ring's percent has tabular digits", async () => {
  await render(<ProgressRing progress={0.4} />);
  expect(screen.getByText("40%")).toHaveStyle({ fontVariant: ["tabular-nums"] });
});
```

(import `Body`, `Title`, `PrimaryButton`, `ProgressRing` where the file does not already.) Run `npx.cmd jest src/ui` → the edited assertions fail.

- [ ] **Step 2: `src/ui/Text.tsx`** — replace the file's three components (the imports stay):

```tsx
/** A title: bold from Title 2 (22) up, semibold below — Apple's split. Shown as typed: sentence style, no forced capitals. */
export function Title({ style, size = theme.type.title, ...rest }: TextProps & { size?: number }) {
  return <Text {...rest} style={[{ fontSize: size, fontWeight: size >= theme.type.title ? theme.weight.bold : theme.weight.semi, color: theme.colors.text }, style]} />;
}
export function Body({ muted, weight = "regular", style, ...rest }: TextProps & { muted?: boolean; weight?: keyof typeof theme.weight }) {
  return <Text {...rest} style={[{ fontSize: theme.type.body, fontWeight: theme.weight[weight], color: muted ? theme.colors.textMuted : theme.colors.text }, style]} />;
}
/** A muted name and its value as ONE text ("Opacity 40 %"): the value is in the label colour, semibold, with tabular digits, so it does not jitter while a slider moves. An empty label shows the value alone. */
export function ValueLabel({ label, value, ...rest }: TextProps & { label: string; value?: string }) {
  return (
    <Body muted {...rest}>
      {label}{label && value !== undefined ? " " : null}{value === undefined ? null : <Text style={{ fontWeight: theme.weight.semi, color: theme.colors.text, fontVariant: ["tabular-nums"] }}>{value}</Text>}
    </Body>
  );
}
```

- [ ] **Step 3: `src/ui/buttonStyle.ts`** — only `buttonLabel` and its comment:

```ts
/** The label of all three: semibold, as typed (title-style capitals are in the string), 17 pt (compact 15). The colour is the kind's. */
export const buttonLabel = (compact?: boolean): TextStyle => ({
  fontSize: compact ? theme.type.body : theme.type.headline, fontWeight: theme.weight.semi,
});
```

- [ ] **Step 4: `src/ui/SecondaryButton.tsx`** — a grey capsule, no outline (spec D10). Replace the `style` of the `PressableScale`:

```tsx
      style={[buttonBox(compact), { backgroundColor: theme.elevation.lifted, opacity: disabled ? DISABLED_OPACITY : 1 }]}>
```

`color` (`danger ? theme.colors.dangerText : theme.colors.text`) is unchanged; `theme.colors.danger` and `hairline` are no longer read here.

- [ ] **Step 5: The small label edits.** One expression each; nothing else on the line changes.

| File | Was | Becomes |
|---|---|---|
| `Chip.tsx` (the `Text` style) | `fontFamily: theme.fonts.bodySemi,` | `fontWeight: theme.weight.semi,` |
| `Tile.tsx` (the label) | `fontSize: theme.type.micro` | `fontSize: theme.type.small` |
| `ToolButton.tsx` (the label) | `fontFamily: active ? theme.fonts.bodySemi : theme.fonts.body, … fontSize: theme.type.micro` | `fontWeight: active ? theme.weight.semi : theme.weight.regular, … fontSize: theme.type.small` |
| `Field.tsx` (`fieldStyle`) | `fontFamily: theme.fonts.body, fontSize: theme.type.input, borderRadius: theme.radius.chip,` | `fontSize: theme.type.input, borderRadius: theme.radius.field,` |
| `NumField.tsx` (`field`) | `fontFamily: theme.fonts.body, borderRadius: theme.radius.chip, padding: theme.space.md, fontSize: 16,` | `borderRadius: theme.radius.field, padding: theme.space.md, fontSize: theme.type.input,` |
| `Slider.tsx` (`TINT` and its comment) | `maximumTrackTintColor: theme.colors.sea` | `maximumTrackTintColor: theme.colors.track`; the comment becomes `/** The rest of the track is `track`: 2.8:1 on a bar / strip / panel and 3:1 next to the gold filled part (theme.test.ts pins both). */` |
| `EmptyState.tsx` | `style={{ textTransform: "none", letterSpacing: 0, textAlign: "center" }}` | `style={{ textAlign: "center" }}`; in the doc comment `(sentence case — not the upper case of a screen title)` becomes `(as typed)` |
| `ProgressRing.tsx` | `<Title size={size * 0.22}>` | `<Title size={size * 0.22} style={{ fontVariant: ["tabular-nums"] }}>` |
| `ToolStrip.tsx` | `<Title size={15} accessibilityRole="header">` | `<Title size={theme.type.headline} accessibilityRole="header">` |
| `ToolPanel.tsx` | `<Title size={16} accessibilityRole="header">` | `<Title size={theme.type.headline} accessibilityRole="header">` |

The Tile and ToolButton labels go from 11 to 12 pt (the brief: Caption 1). Their boxes do not change: 4 + 44 + 4 + one 12-pt line is under the 72-pt row.

- [ ] **Step 6: `src/ui/Screen.tsx`** — one flat colour, no gradient (`bgEnd` is going):

```tsx
import { View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "@/src/theme/theme";

export type Edge = "top" | "bottom";

/**
 * The full-screen page every screen sits on. Pads each listed edge by its safe-area inset plus
 * `theme.space.sm`, so content clears the status bar / Dynamic Island and the home indicator.
 * Pass `edges={[]}` for a full-bleed screen. A `paddingTop`/`paddingBottom` in `style` overrides the edge padding.
 */
export function Screen({ children, style, edges = ["top"] }: { children: React.ReactNode; style?: ViewStyle; edges?: readonly Edge[] }) {
  const insets = useSafeAreaInsets();
  const pad: ViewStyle = {};
  if (edges.includes("top")) pad.paddingTop = insets.top + theme.space.sm;
  if (edges.includes("bottom")) pad.paddingBottom = insets.bottom + theme.space.sm;
  return <View style={[{ flex: 1, backgroundColor: theme.colors.bg }, pad, style]}>{children}</View>;
}
```

`Screen.test.tsx` reads the child's parent's style and is not edited; it stays green.

- [ ] **Step 7: `src/ui/LoadingScreen.tsx` and `Waves.tsx`** (spec D12: structure untouched).

In `LoadingScreen.tsx`:

```tsx
/** The wordmark's size. The welcome screen, which can follow this one, draws the name with the same number. (`letterSpacing` is a bridge for src/auth; Task 6 of the stage-1 plan deletes it.) */
export const WORDMARK = { size: 48, letterSpacing: 0 } as const;
```

and the two texts (delete the comment line about font families falling back):

```tsx
            <Text style={{ fontSize: WORDMARK.size, fontWeight: theme.weight.bold, color: theme.colors.text }}>Clipy</Text>
            <Text style={{ fontSize: theme.type.label, fontWeight: theme.weight.semi, color: theme.colors.textMuted }}>Edit · Set sail · Share</Text>
```

In `Waves.tsx`, the two layers (neutral swells; no second accent):

```tsx
      <Layer color={theme.elevation.tile} duration={5000} bottom={8} opacity={0.55} still={still} />
      <Layer color={theme.elevation.bar} duration={3000} bottom={0} opacity={1} still={still} />
```

No animation call, duration or timer in either file changes.

- [ ] **Step 8: Run.** `npx.cmd jest src/ui` → green. `npm run typecheck` → green. Then confirm nothing of the bridge is read in the kit:

```powershell
git grep -nE "theme\.fonts|theme\.colors\.(sea|seaLight|bgDeep|bgEnd|lane)|fontFamily|textTransform" -- src/ui ":!src/ui/__tests__"
```

Expected: no output.

- [ ] **Step 9: Commit.**

```powershell
git add src/ui/Text.tsx src/ui/buttonStyle.ts src/ui/SecondaryButton.tsx src/ui/Chip.tsx src/ui/Tile.tsx src/ui/ToolButton.tsx src/ui/Field.tsx src/ui/NumField.tsx src/ui/Slider.tsx src/ui/Screen.tsx src/ui/EmptyState.tsx src/ui/ProgressRing.tsx src/ui/LoadingScreen.tsx src/ui/Waves.tsx src/ui/ToolStrip.tsx src/ui/ToolPanel.tsx src/ui/__tests__/kit.test.tsx src/ui/__tests__/kit.r2.test.tsx src/ui/__tests__/pressables.test.tsx src/ui/__tests__/Tile.test.tsx src/ui/__tests__/ToolStrip.test.tsx src/ui/__tests__/Slider.test.tsx src/ui/__tests__/LoadingScreen.test.tsx
git commit -m "feat(kit): system font, no forced capitals, the grey secondary button, neutral page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Screens outside the editor

**Depends on:** 1. **Parallel-safe with:** 2, 4, 5.

**Files:** Modify `app/index.tsx`, `app/accounts.tsx`, `src/auth/EmailSignIn.tsx`, `src/auth/WelcomeScreen.tsx`, `src/projects/ProjectCard.tsx`, `src/projects/QuickEditSheet.tsx`, `src/export/ExportScreenBody.tsx`, `src/publish/components/PostScreenBody.tsx`, `src/publish/components/SignInCard.tsx`, and the matchers and pins in the tests of `src/auth/__tests__/`, `src/projects/__tests__/`, `src/export/__tests__/ExportScreenBody.test.tsx`, `src/publish/__tests__/`, and any test under `app/` or `src/__tests__/sheets.r2.test.tsx` that finds one of this task's buttons by name.

**Do not touch:** `app/_layout.tsx`, `app/editor/**`, `app/welcome.tsx`, `app/post.tsx`, `app/oauth.tsx`; `src/auth/welcomeSeen.ts`; `src/publish/supabase.ts` and every non-component file of `src/publish/` (the sentence "Sign-in isn't set up yet." and every other message is wording — unchanged); `src/projects/quickEdit*.ts`; the structure of any screen (header rows, the Home bar, the cards); `AspectRatioSheet.tsx`, `ProjectActionsSheet.tsx`, `AccountRow.tsx`, `PostRow.tsx`, `PostOptionsSheet.tsx` (their button titles are single words or already title-style: Create, Rename, Duplicate, Delete, Reconnect, Disconnect, Connect, View, Options, Resume, Retry).

**Interfaces: Consumes** `COVER_FONT` (Task 1). The kit's new look arrives through Task 2; this task does not wait for it.

- [ ] **Step 1: The strings.** Exactly these, each a button title or an alert button (spec D8):

| File : line | Was | Becomes |
|---|---|---|
| `app/index.tsx`:135 | `Your voyages` | `Projects` |
| `app/index.tsx`:167 | `title="Quick edit"` | `title="Quick Edit"` |
| `app/index.tsx`:169 | `title="New project"` | `title="New Project"` |
| `app/accounts.tsx`:27 | `{ text: "Sign out", style: "destructive"` | `{ text: "Sign Out", style: "destructive"` |
| `app/accounts.tsx`:60 | `title="Sign out"` | `title="Sign Out"` |
| `src/auth/EmailSignIn.tsx`:46 | `title="Send code"` | `title="Send Code"` |
| `src/auth/EmailSignIn.tsx`:69 | `title="Sign in"` | `title="Sign In"` |
| `src/auth/EmailSignIn.tsx`:71 | `` `Resend code in ${resendIn} s` : "Resend code" `` | `` `Resend Code in ${resendIn} s` : "Resend Code" `` |
| `src/auth/EmailSignIn.tsx`:72 | `title="Use a different email"` | `title="Use a Different Email"` |
| `src/auth/WelcomeScreen.tsx`:199 | `title="Continue with email"` | `title="Continue with Email"` |
| `src/auth/WelcomeScreen.tsx`:201 | `"Continue without an account" : "Not now"` | `"Continue Without an Account" : "Not Now"` |
| `src/projects/QuickEditSheet.tsx`:41 | `title="Choose photos and videos"` | `title="Choose Photos and Videos"` |
| `src/export/ExportScreenBody.tsx`:118 | `title="Try again"` | `title="Try Again"` |
| `src/publish/components/PostScreenBody.tsx`:87 | `title="Try again"` | `title="Try Again"` |
| `src/publish/components/PostScreenBody.tsx`:130 | `{ text: "Keep posting"` | `{ text: "Keep Posting"` |
| `src/publish/components/SignInCard.tsx`:28, :37 | `title="Sign in"` | `title="Sign In"` |
| `app/accounts.tsx`:45 | `title="Try again"` | `title="Try Again"` |

Not changed (they are not buttons): the titles "Sign in with email", "Sign in to Clipy", "Sign-in isn't set up yet", "Export", "Post", "Accounts", "Ready to sail", "Export needs the native build"; the sheet titles; the spinner labels "Sending code" / "Signing in"; the alert titles; the doc comments that quote a button may be updated to the new spelling. Also update the two doc comments in `EmailSignIn.tsx` (`The gold button is "Send code"` / `"Sign in"`) to the new spelling.

- [ ] **Step 2: The wordmark on Welcome** (`src/auth/WelcomeScreen.tsx`:177). The kit's `Title` no longer forces capitals or spacing; drop the override so nothing here reads the bridge key:

```tsx
              <Title size={WORDMARK.size} accessibilityRole="header">Clipy</Title>
```

- [ ] **Step 3: The cover title on a card** (`src/projects/ProjectCard.tsx`:37–41). It is drawn "as on the cover itself", and the cover is content (spec D5): a plain `Text` in the cover font, with exactly the size, colour and place it has today. Add `Text` to the `react-native` import and `import { COVER_FONT } from "@/src/editor/coverFont";`, remove `Title` from the kit import if it is no longer used in the file, and replace the element:

```tsx
        {summary.coverTitle ? (
          // Drawn as on the cover itself (CoverFrame): the cover's own font, as typed. Content, not interface text.
          <Text testID="project-cover-title" numberOfLines={2}
            style={{ position: "absolute", left: theme.space.sm, right: theme.space.sm, bottom: COVER_TITLE.bottom, textAlign: "center", fontFamily: COVER_FONT, fontSize: COVER_TITLE.size, color: theme.colors.text }}>{summary.coverTitle}</Text>
        ) : null}
```

- [ ] **Step 4: The tests.** For each string of Step 1, in the test files of this task's folders, update the matchers that find **that button** (`getByRole("button", { name: … })`, `getByLabelText(…)`, `getByText(…)` on the button's label, `queryBy…`, and `Alert.alert` button lookups by `text`). Leave every matcher that finds a title, a sentence or a spinner label. Then these pins:

| File : line | Was | Becomes |
|---|---|---|
| `src/auth/__tests__/WelcomeScreen.test.tsx`:51–52 | `expect(WORDMARK).toEqual({ size: 48, letterSpacing: 8 });` and `toHaveStyle({ fontFamily: theme.fonts.title, fontSize: WORDMARK.size, letterSpacing: WORDMARK.letterSpacing })` | `expect(WORDMARK.size).toBe(48);` and `toHaveStyle({ fontSize: WORDMARK.size })` |
| `WelcomeScreen.test.tsx`:215–217 | comment "the kit Title's own upper-casing and spacing"; `toMatchObject({ fontSize: theme.type.title, textTransform: "uppercase", letterSpacing: 1.5 })` | comment "A heading like every other: the kit Title, as typed."; `expect(heading).toMatchObject({ fontSize: theme.type.title });` `expect(heading).not.toHaveProperty("textTransform");` `expect(heading).not.toHaveProperty("letterSpacing");` |
| `src/export/__tests__/ExportScreenBody.test.tsx`:147, :176 | `fontFamily: theme.fonts.bodySemi` | `fontWeight: theme.weight.semi` |
| `src/projects/__tests__/ProjectCard.test.tsx`:61, :63 | `fontFamily: theme.fonts.bodySemi` | `fontWeight: theme.weight.semi` |
| `ProjectCard.test.tsx` (the cover-title assertion, if it pins a font) | `theme.fonts.title` | `COVER_FONT` (import it from `@/src/editor/coverFont`) |

Add one test to the Home screen's test file (`src/projects/__tests__/ProjectsScreen.test.tsx`, beside its header test, using that file's own render helper):

```tsx
test("Home is titled Projects, and its two actions are Quick Edit and New Project", async () => {
  await renderHome();   // this file's existing helper that mounts app/index.tsx past the welcome screen
  expect(screen.getByRole("header", { name: "Projects" })).toBeTruthy();
  expect(screen.queryByText("Your voyages")).toBeNull();
  expect(screen.getByRole("button", { name: "Quick Edit" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "New Project" })).toBeTruthy();
});
```

(If the file's helper has another name, use it; do not write a second helper.)

- [ ] **Step 5: Run.** `npx.cmd jest src/auth src/projects src/export src/publish` → green except assertions that depend on the kit's look and belong to Task 2's files (none are in these folders). `npm run typecheck` → green. Then:

```powershell
git grep -nE "theme\.fonts|theme\.colors\.(sea|seaLight|bgDeep|bgEnd|lane)|textTransform|WORDMARK\.letterSpacing" -- app src/auth src/projects src/export src/publish
```

Expected: no output.

- [ ] **Step 6: Commit.** `git add` every file you changed, by path (the nine source files of this task and the test files you edited), then:

```powershell
git commit -m "feat(screens): Projects, title-style buttons, the cover font as content" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The timeline: eight kinds, black labels, the Caption hue, the timeline background

**Depends on:** 1. **Parallel-safe with:** 2, 3, 5.

**Files:** Modify `src/editor/components/AudioBar.tsx`, `LayerBar.tsx`, `OverlayPill.tsx`, `EffectPill.tsx`, `Timeline.tsx`, `ClipThumbStrip.tsx`, `AddClipTile.tsx`, and the pins in `src/editor/__tests__/AudioLane.test.tsx`, `EffectLane.test.tsx`, `LayerLane.test.tsx`, `OverlayLane.test.tsx`. **Owned, expected to need no edit** (read them; change only a pin of a renamed token): `TransportRow.tsx`, `TrimHandles.tsx`, `ReorderHandle.tsx`, and the tests `OverlayPill.test.tsx`, `Timeline.test.tsx`, `Timeline.rows.test.tsx`, `timelineLanes.test.tsx`, `ClipThumbStrip.badges.test.tsx`, `ClipThumbStrip.photo.test.tsx`, `AddClipTile.test.tsx`.

**Do not touch:** `src/editor/timelineLayout.ts`, `timelineScroll.ts`, `snapping.ts`; `LayerLane.tsx`, `AudioLane.tsx`, `OverlayLane.tsx`, `EffectLane.tsx`, `RowsThumb.tsx`, `BeatTicks.tsx`, `CutMarker.tsx`, `SnapGuide.tsx`, `KeyframeDots.tsx` (they read `accent`, `text`, `textMuted`, `bg` — the values arrive); any gesture, any width, height, `top`, `left`, `HANDLE_W`, `LANE_HEIGHT`, `STRIP_HEIGHT`, any radius literal; `src/__tests__/spacingScale.test.ts` (five of these files are in its exact allow-table: do not add or remove a raw spacing number in them). **The selection colour of a bar is not changed:** its border and handles stay `theme.colors.text` (spec D11 — gold against a bar colour measures 1.03–1.14 : 1). The clip's gold selection border is not changed either.

**Interfaces: Consumes** `theme.colors.kindText`, `kindCaption`, `kindSticker`, `kindMusic`, `kindVoice`, `kindSfx`, `kindLayer`, `kindEffect`, `onKind`, `timeline`, `scrimStrong` (Task 1).

- [ ] **Step 1: The failing tests.** In the four lane tests rename the pinned tokens — `laneMusic` → `kindMusic`, `laneVoice` → `kindVoice`, `laneSfx` → `kindSfx` (`AudioLane.test.tsx`:26–29, :44), `laneEffect` → `kindEffect` (`EffectLane.test.tsx`:21), `laneLayer` → `kindLayer` (`LayerLane.test.tsx`:66, :67, :86, :93). The selection pins (`borderColor: theme.colors.text` at `AudioLane`:43, `EffectLane`:33, `LayerLane`:85, `OverlayLane`:121) stay as they are. Add to `OverlayLane.test.tsx`, using that file's own project fixture and render helper:

```tsx
test("a caption bar has its own colour, a text bar and a sticker bar theirs; every label is black", async () => {
  // One text, one caption (a text overlay with kind "caption") and one sticker on the lane.
  await renderLane({ overlays: [text({ id: "t1", kind: "text" }), text({ id: "c1", kind: "caption", start: 4, end: 6 }), sticker({ id: "s1", start: 7, end: 9 })] });
  expect(screen.getByTestId("overlay-pill-t1")).toHaveStyle({ backgroundColor: theme.colors.kindText });
  expect(screen.getByTestId("overlay-pill-c1")).toHaveStyle({ backgroundColor: theme.colors.kindCaption });
  expect(screen.getByTestId("overlay-pill-s1")).toHaveStyle({ backgroundColor: theme.colors.kindSticker });
  expect(theme.colors.kindCaption).not.toBe(theme.colors.kindText);
  for (const id of ["t1", "c1", "s1"]) expect(within(screen.getByTestId(`overlay-pill-${id}`)).getAllByText(/./)[0]).toHaveStyle({ color: theme.colors.onKind });
});
```

(`renderLane`, `text`, `sticker` stand for the helpers the file already has for mounting the lane with overlays; use its real names and fixture shape, and import `within` if it is not imported. Do not add a new fixture file.) Add one line to the first test of `AudioLane.test.tsx`, `EffectLane.test.tsx` and `LayerLane.test.tsx` each, asserting the bar's label colour, e.g. in `AudioLane.test.tsx`: `expect(within(screen.getByTestId("audio-bar-m1")).getByText("100%")).toHaveStyle({ color: theme.colors.onKind, fontVariant: ["tabular-nums"] });` (use the percentage the fixture's volume gives), in `EffectLane.test.tsx` the effect's label text, in `LayerLane.test.tsx` `getByText("Layer")`. Run `npx.cmd jest src/editor/__tests__/AudioLane.test.tsx src/editor/__tests__/EffectLane.test.tsx src/editor/__tests__/LayerLane.test.tsx src/editor/__tests__/OverlayLane.test.tsx` → the new assertions fail.

- [ ] **Step 2: `AudioBar.tsx`.**

```tsx
const KIND: Record<AudioKind, { label: string; color: string }> = {
  music: { label: "Music", color: theme.colors.kindMusic },
  voice: { label: "Voice", color: theme.colors.kindVoice },
  sfx: { label: "Sound effect", color: theme.colors.kindSfx },
};
```

Lines 90–92: every `theme.colors.onAccent` becomes `theme.colors.onKind` (the speaker icon and the two texts — what sits ON the bar), and the volume text gains tabular digits. Line 97, the warning glyph on the red missing-file dot, is not on the bar colour and is not changed:

```tsx
            <Text style={{ color: theme.colors.onKind, fontSize: 12, fontVariant: ["tabular-nums"] }}>{Math.round(t.volume * 100)}%</Text>
```

- [ ] **Step 3: `LayerBar.tsx`.** Line 120: `const color = theme.colors.kindLayer;`. Lines 131, 132 (the icon and the word on the bar): `theme.colors.onAccent` → `theme.colors.onKind`. Line 137 (the warning glyph on the red dot) is not changed.

- [ ] **Step 4: `OverlayPill.tsx`** — the Caption hue is one expression, no structure (a caption is a text overlay whose `kind` is `"caption"`). Above the `return`:

```tsx
  const fill = isSticker(o) ? theme.colors.kindSticker : o.kind === "caption" ? theme.colors.kindCaption : theme.colors.kindText;
```

In the `Pressable`'s style `backgroundColor: isSticker(o) ? theme.colors.laneSticker : theme.colors.laneText` becomes `backgroundColor: fill`; the label's `color: theme.colors.onAccent` becomes `color: theme.colors.onKind`. The accessibility label, the border and the handles are untouched.

- [ ] **Step 5: `EffectPill.tsx`.** `backgroundColor: theme.colors.laneEffect` → `theme.colors.kindEffect`; the label's `color: theme.colors.onAccent` → `theme.colors.onKind`.

- [ ] **Step 6: `Timeline.tsx`, `ClipThumbStrip.tsx`, `AddClipTile.tsx`.**

| File : line | Was | Becomes |
|---|---|---|
| `Timeline.tsx`:109 | `backgroundColor: theme.colors.bgDeep` | `backgroundColor: theme.colors.timeline` |
| `ClipThumbStrip.tsx`:51 | `borderRightColor: theme.colors.bgDeep` | `borderRightColor: theme.colors.timeline` |
| `ClipThumbStrip.tsx`:78, :83 | `backgroundColor: theme.colors.sea` (the Photo and filter badges) | `backgroundColor: theme.colors.scrimStrong` (a solid scrim under a badge on a picture) |
| `AddClipTile.tsx`:20 | `borderRadius: theme.radius.card` | `borderRadius: theme.radius.chip` (`card` is 20 now; this tile sits in the clip row beside 8-pt clips) |

`Timeline.tsx` gets that one token and nothing else (it is never resized or remounted).

- [ ] **Step 7: Run.** `npx.cmd jest src/editor/__tests__/AudioLane.test.tsx src/editor/__tests__/EffectLane.test.tsx src/editor/__tests__/LayerLane.test.tsx src/editor/__tests__/OverlayLane.test.tsx src/editor/__tests__/OverlayPill.test.tsx src/editor/__tests__/Timeline.test.tsx src/editor/__tests__/Timeline.rows.test.tsx src/editor/__tests__/timelineLanes.test.tsx src/editor/__tests__/ClipThumbStrip.badges.test.tsx src/editor/__tests__/ClipThumbStrip.photo.test.tsx src/editor/__tests__/AddClipTile.test.tsx src/__tests__/spacingScale.test.ts` → green. `npm run typecheck` → green. Then:

```powershell
git grep -nE "theme\.colors\.(sea|seaLight|bgDeep|bgEnd|lane)" -- src/editor/components/AudioBar.tsx src/editor/components/LayerBar.tsx src/editor/components/OverlayPill.tsx src/editor/components/EffectPill.tsx src/editor/components/Timeline.tsx src/editor/components/ClipThumbStrip.tsx src/editor/components/AddClipTile.tsx src/editor/components/TransportRow.tsx src/editor/components/TrimHandles.tsx src/editor/components/ReorderHandle.tsx
```

Expected: no output.

- [ ] **Step 8: Commit.**

```powershell
git add src/editor/components/AudioBar.tsx src/editor/components/LayerBar.tsx src/editor/components/OverlayPill.tsx src/editor/components/EffectPill.tsx src/editor/components/Timeline.tsx src/editor/components/ClipThumbStrip.tsx src/editor/components/AddClipTile.tsx src/editor/__tests__/AudioLane.test.tsx src/editor/__tests__/EffectLane.test.tsx src/editor/__tests__/LayerLane.test.tsx src/editor/__tests__/OverlayLane.test.tsx
git commit -m "feat(timeline): eight bar colours with black labels, captions in their own hue, the neutral timeline" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(add any owned test file you had to touch for a renamed token, by path.)

---

### Task 5: Strips, panels and the editor's own screens

**Depends on:** 1. **Parallel-safe with:** 2, 3, 4.

**Files:** Modify `src/editor/components/AddAudioSheet.tsx`, `AdjustSheet.tsx`, `BackgroundSheet.tsx`, `BeatsSheet.tsx`, `CaptionsSheet.tsx`, `CaptionStyleSheet.tsx`, `ClipAnimationSheet.tsx`, `CollageSheet.tsx`, `ColorRow.tsx`, `CoverFrame.tsx`, `CropScreen.tsx`, `EditorTopBar.tsx`, `FilterSheet.tsx`, `PhotoMotionSheet.tsx`, `ReadAloudSection.tsx`, `RegionBox.tsx`, `SpeedSheet.tsx`, `StickerPanel.tsx`, `StickerSheet.tsx`, `TemplateSheet.tsx`, `TextPanel.tsx`, `TrimSheet.tsx`, and matchers / pins in the files of `src/editor/__tests__/` that are not Task 4's.

**Do not touch:** the seventeen files of the global never-edited list; Task 4's files; `PreviewTag.tsx`, `SelectionFrame.tsx`, `StabilizeSheet.tsx`, `CutoutSheet.tsx`, `SmoothSlowSection.tsx` (the switch "Smooth slow motion" is not a button), `EditorToolbar.tsx`, `MultiSelectBar.tsx` (tool labels are sentence style and stay: "Cut out", "Extract audio", "Green screen"); `ColorRow`'s `PALETTE` (colours the user picks — content); every sentence, note, tile label and strip / panel title; `looks.frozen.test.ts` and every PROOF block.

**Interfaces: Consumes** `theme.type.headline`, `theme.radius.field`, `theme.colors.textMuted`, `theme.colors.accent`, `theme.elevation.lifted`, `COVER_FONT` (Task 1).

- [ ] **Step 1: The strings** — button titles, strip actions and tab chips only (spec D8):

| File : line | Was | Becomes |
|---|---|---|
| `AddAudioSheet.tsx`:186 | `title="Choose a file"` | `title="Choose a File"` |
| `AdjustSheet.tsx`:33 | `label: "Apply to all"` | `label: "Apply to All"` |
| `BackgroundSheet.tsx`:23 | `label: "Apply to all"` | `label: "Apply to All"` |
| `BeatsSheet.tsx`:182 | `title="Find beats"` | `title="Find Beats"` |
| `BeatsSheet.tsx`:183 | `title="Cut to beats"` | `title="Cut to Beats"` |
| `BeatsSheet.tsx`:213 | `title="Remove nearest"` | `title="Remove Nearest"` |
| `BeatsSheet.tsx`:214 | `title="Clear all"` | `title="Clear All"` |
| `CaptionsSheet.tsx`:48, :58, :88 | `title="Style captions"` | `title="Style Captions"` |
| `CaptionsSheet.tsx`:97 | `title="Try again"` | `title="Try Again"` |
| `ClipAnimationSheet.tsx`:55 | `label: "Apply to all clips"` | `label: "Apply to All Clips"` |
| `FilterSheet.tsx`:59 | `label: "Apply to all clips"` | `label: "Apply to All Clips"` |
| `PhotoMotionSheet.tsx`:43 | `label: "Apply to all photos"` | `label: "Apply to All Photos"` |
| `CollageSheet.tsx`:67 | `label: "Fit to frame"` | `label: "Fit to Frame"` |
| `ReadAloudSection.tsx`:142 | `title="Read aloud"` | `title="Read Aloud"` (the button only; the row's name on line(s) above stays "Read aloud") |
| `SpeedSheet.tsx`:202 | `label="Slow motion"` | `label="Slow Motion"` (the tab chip only) |
| `TemplateSheet.tsx`:45, :46 | `label="This clip"`, `label="Whole project"` | `label="This Clip"`, `label="Whole Project"` |
| `TextPanel.tsx`:77 | ``label={`Align ${a}`}`` | `label={ALIGN_LABEL[a]}` with, beside the file's other constants, `const ALIGN_LABEL: Record<Align, string> = { left: "Align Left", center: "Align Center", right: "Align Right" };` |

If a button in these files passes `accessibilityLabel` built from the old title, update it the same way. The sentences that mention these tools (`BEAT_MESSAGES`, notes, hints) are not edited.

- [ ] **Step 2: Tokens.**

| File : line | Was | Becomes |
|---|---|---|
| `CaptionStyleSheet.tsx`:65 | `backgroundColor={theme.colors.sea}` (the sample's backdrop) | `backgroundColor={theme.elevation.lifted}` |
| `StickerPanel.tsx`:44, :45 · `TextPanel.tsx`:80, :81 | `color: theme.colors.sea` (the "Fine-tune" text action and its arrow) | `color: theme.colors.accent` (a text action is gold ink) |
| `ColorRow.tsx`:23 · `StickerSheet.tsx`:87 | `fontFamily: theme.fonts.body, … borderRadius: theme.radius.chip` | remove the `fontFamily` entry; `borderRadius: theme.radius.field` |
| `TextPanel.tsx`:21 · `TrimSheet.tsx`:12 (`field`) | `fontFamily: theme.fonts.body` and `borderRadius: theme.radius.chip` | remove the `fontFamily` entry; `borderRadius: theme.radius.field` |
| `CropScreen.tsx`:136 | `<Title size={18} accessibilityRole="header">` | `<Title size={theme.type.headline} accessibilityRole="header">` |
| `EditorTopBar.tsx`:17 | `<Title size={16} numberOfLines={1} …>` | `<Title size={theme.type.headline} numberOfLines={1} …>` |
| `RegionBox.tsx`:162 | `borderColor: theme.colors.hairline` (the unselected Blur / Mosaic box, over the picture) | `borderColor: theme.colors.textMuted` (the separator grey would vanish on a dark picture) |
| `CoverFrame.tsx`:21 | `fontFamily: theme.fonts.title` | `fontFamily: COVER_FONT` with `import { COVER_FONT } from "@/src/editor/coverFont";` — the saved cover looks exactly as before |

No other property on those lines changes (no padding, no size).

- [ ] **Step 3: The tests.** Update the matchers that find the buttons, actions and chips of Step 1 — in `AddAudioSheet.test.tsx`, `AdjustSheet.test.tsx`, `BackgroundSheet.test.tsx`, the four `BeatsSheet.*.test.tsx`, `CaptionsSheet.test.tsx`, `ClipAnimationSheet.test.tsx`, `CollageSheet.test.tsx`, `FilterSheet.test.tsx`, `LayerSheets.test.tsx`, `PhotoMotionSheet.test.tsx`, `ReadAloudSection.test.tsx`, `SmoothSlow.test.tsx`, `SpeedSheet.test.tsx`, `TemplateSheet.test.tsx`, `TextPanel.test.tsx`, `TextPanel.sections.test.tsx`, `panels.pickers.test.tsx`, `strips.params.test.tsx`, `strips.pickers.test.tsx`, `strips.tiles.test.tsx`, and any other file of `src/editor/__tests__/` that goes red for one of these strings. In each, decide matcher by matcher: a row name, a switch, a tile, a title or a sentence keeps its spelling. Then these pins:

| File : line | Was | Becomes |
|---|---|---|
| `strips.polish.test.tsx`:44 | `{ color: theme.colors.accent, textTransform: "uppercase" }` | `{ color: theme.colors.accent, fontWeight: theme.weight.semi }` |
| `AdjustSheet.test.tsx`:70 | `{ color: theme.colors.accent, fontFamily: theme.fonts.bodyBold }` | `{ color: theme.colors.accent, fontWeight: theme.weight.semi }` |
| `CoverSheet.test.tsx`:421 · `panels.polish.test.tsx`:32 · `sheetStyle.test.tsx`:25 · `strips.polish.test.tsx`:23 | `theme.colors.sea` | `theme.colors.track` |
| `RegionBox.test.tsx`:123 (and :55 if it pins the unselected border) | `borderColor: theme.colors.hairline` | `borderColor: theme.colors.textMuted` |
| any `CoverSheet` / `CoverFrame` test that pins the title's font | `theme.fonts.title` | `COVER_FONT` |
| any test that pins `theme.fonts.*` or `theme.colors.lane*` and is not Task 4's | — | the new name from the block at the top of this plan |

`FontStrip.test.tsx` and `TemplateStrip.test.tsx` mention font families of the OVERLAY fonts (content): they are not edited.

- [ ] **Step 4: Run.** `npx.cmd jest src/editor` → green for every suite in this task's files (a suite that renders a kit component may pin a kit look that Task 2 is changing — those pins are listed in Step 3 and are yours; a red suite of Task 4's four lane tests is not). `npm run typecheck` → green. Then:

```powershell
git grep -nE "theme\.fonts|theme\.colors\.(sea|seaLight|bgDeep|bgEnd|lane)|textTransform" -- src/editor
```

Expected: no output outside Task 4's files.

- [ ] **Step 5: Commit.** `git add` each file you changed, by path, then:

```powershell
git commit -m "feat(editor): title-style buttons and tabs, gold text actions, the system font in fields, the cover font as content" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Remove the bridge; the three guards

**Depends on:** 2, 3, 4, 5. **Parallel-safe with:** nothing.

**Files:** Modify `src/theme/theme.ts`, `src/theme/__tests__/theme.test.ts`, `src/ui/LoadingScreen.tsx`. Create `src/__tests__/palette.guard.test.ts`, `src/__tests__/casing.guard.test.ts`, `src/__tests__/systemFont.guard.test.ts`.

**Do not touch:** the four existing guard tests in `src/__tests__/`; any component (if a guard is red because of a file another task owned, fix that file's single offending line as the guard's message says, and list it in the commit message).

- [ ] **Step 1: Write the three guards.**

`src/__tests__/palette.guard.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const ROOT = join(__dirname, "..", "..");
/** The Grand Voyage palette: every colour the theme held before the redesign and holds no more. */
const OLD_HEX = ["0A1B33", "081527", "0C2542", "0E2440", "112C4D", "17365C", "1F4572", "F6E7C1", "9FB3CC", "1C6E9E", "2E86AB", "E5484D", "F47A7E", "E86A7A", "3BA7C9", "9A86D6", "4FA89B", "E0916A", "7F93B8"];
/** The bases of its translucent colours (the gold hairline, the navy scrims), with or without spaces. */
const OLD_RGBA = [/217\s*,\s*179\s*,\s*106/, /\(\s*3\s*,\s*10\s*,\s*20\b/];
/** Colours the USER can put on the video, which happen to equal an old theme value. Exact: one file, the values it may hold. Never add a file for interface colour. */
const CONTENT: Record<string, string[]> = {
  "src/editor/components/ColorRow.tsx": ["2E86AB"],     // a swatch of the text / sticker palette
  "src/editor/textTemplates.ts": ["0A1B33"],            // the "Title bar" template's box
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "__tests__" && name !== "node_modules") walk(p, out); }
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const files = () => ["src", "app"].flatMap((d) => walk(join(ROOT, d))).map((f) => ({ rel: relative(ROOT, f).split(sep).join("/"), src: readFileSync(f, "utf8") }));

test("no colour of the old palette is left in src/ or app/", () => {
  const found: string[] = [];
  const all = files();
  expect(all.length).toBeGreaterThan(200);       // the scan really read the tree
  for (const { rel, src } of all) {
    for (const hex of OLD_HEX) if (new RegExp(`#${hex}\\b`, "i").test(src) && !(CONTENT[rel] ?? []).includes(hex)) found.push(`${rel}: #${hex}`);
    for (const re of OLD_RGBA) if (re.test(src)) found.push(`${rel}: ${re.source}`);
  }
  expect(found).toEqual([]);
});

test("the content exceptions are exact: each listed value is still there", () => {
  for (const [rel, hexes] of Object.entries(CONTENT)) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    for (const hex of hexes) expect(new RegExp(`#${hex}\\b`, "i").test(src)).toBe(true);
  }
});

test("the bridge is gone: no old token name is read", () => {
  const found = files().filter(({ src }) => /theme\.colors\.(sea|seaLight|bgDeep|bgEnd|lane[A-Z]\w*)\b/.test(src)).map((f) => f.rel);
  expect(found).toEqual([]);
});

test("a theme colour is only a value: never built into a string, never sliced (a second appearance must be able to swap it)", () => {
  const found = files().filter(({ rel, src }) => rel !== "src/theme/theme.ts"
    && /\$\{\s*theme\.(colors|elevation)\.|theme\.(colors|elevation)\.\w+\s*\+|theme\.(colors|elevation)\.\w+\.(slice|replace|substring|toUpperCase|toLowerCase)\(/.test(src)).map((f) => f.rel);
  expect(found).toEqual([]);
});
```

`src/__tests__/casing.guard.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const ROOT = join(__dirname, "..", "..");
const DIRS = ["src/ui", "src/editor/components", "src/projects", "src/export", "src/publish", "src/auth", "app"];
/** Joining words that stay lower case inside a title-style label (never as its first word). */
const SMALL = new Set(["a", "an", "and", "the", "to", "with", "in", "of", "for", "or"]);
/** The only `.toUpperCase()` calls: they compare colour codes, they do not show text. */
const UPPER_OK = ["src/editor/components/BackgroundSheet.tsx", "src/editor/components/ChromaSheet.tsx", "src/editor/components/ColorRow.tsx"];

/**
 * Title-style: no word starts with a lower-case letter, except a joining word that is neither first nor last ("Sign In", not "Sign in").
 * A one-letter unit ("s"), a word that trails off ("to…") and a `${value}` pass.
 */
export function isTitleStyle(label: string): boolean {
  const words = label.replace(/\$\{[^}]*\}/g, "0").split(/\s+/).filter(Boolean);
  return words.every((w, i) => !/^[a-z]/.test(w) || (i > 0 && (w.length === 1 || w.endsWith("…") || (i < words.length - 1 && SMALL.has(w)))));
}

/** Every literal label of a button, a tab chip, a strip / panel / sheet action and an alert button in `src`. */
export function labels(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/<(?:PrimaryButton|SecondaryButton|QuietButton|Chip)\b[^>]*?\b(?:title|label)=(?:"([^"]*)"|\{([^}]*)\})/g)) {
    if (m[1] !== undefined) out.push(m[1]);
    else for (const q of (m[2] ?? "").matchAll(/"([^"]*)"|`([^`]*)`/g)) out.push(q[1] ?? q[2]);
  }
  for (const m of src.matchAll(/\baction=\{[^}]*?\blabel:\s*"([^"]*)"/g)) out.push(m[1]);
  if (src.includes("Alert.alert(")) for (const m of src.matchAll(/\{\s*text:\s*"([^"]*)"/g)) out.push(m[1]);
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "__tests__" && name !== "node_modules") walk(p, out); }
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const rel = (f: string) => relative(ROOT, f).split(sep).join("/");

test("the rule: capitals on every word but a joining word in the middle", () => {
  for (const ok of ["Export", "New Project", "Choose Photos and Videos", "Continue Without an Account", "Continue with Google", "Post to…", "Save to Photos", "Apply to All Clips", "Resend Code in ${n} s", "Sign In", "4K", "1080p"]) expect(isTitleStyle(ok)).toBe(true);
  for (const bad of ["New project", "Try again", "sign In", "Sign in", "Cut to beats", "to Photos"]) expect(isTitleStyle(bad)).toBe(false);
});

test("the scanner finds titles, chip labels, actions and alert buttons", () => {
  expect(labels('<PrimaryButton compact title="Export" onPress={go} />')).toEqual(["Export"]);
  expect(labels('<QuietButton title={first ? "Continue Without an Account" : "Not Now"} />')).toEqual(["Continue Without an Account", "Not Now"]);
  expect(labels('<Chip compact label="Slow Motion" selected />')).toEqual(["Slow Motion"]);
  expect(labels('<ToolStrip action={layer ? undefined : { label: "Apply to All Clips", onPress }} />')).toEqual(["Apply to All Clips"]);
  expect(labels('Alert.alert("Stop posting?", "…", [{ text: "Keep Posting", style: "cancel" }, { text: "Stop" }])')).toEqual(["Keep Posting", "Stop"]);
  expect(labels('<Body>Find beats in your music</Body>')).toEqual([]);
});

test("every literal button, tab chip, action and alert button is title-style", () => {
  const wrong: string[] = [];
  let seen = 0;
  for (const dir of DIRS) for (const file of walk(join(ROOT, dir))) {
    for (const l of labels(readFileSync(file, "utf8"))) { seen++; if (!isTitleStyle(l)) wrong.push(`${rel(file)}: "${l}"`); }
  }
  expect(seen).toBeGreaterThan(50);       // the scan really found the labels
  expect(wrong).toEqual([]);
});

test("nothing forces a case: no textTransform anywhere, and toUpperCase only where colour codes are compared", () => {
  const transform: string[] = [], upper: string[] = [];
  for (const dir of ["src", "app"]) for (const file of walk(join(ROOT, dir))) {
    const src = readFileSync(file, "utf8");
    if (src.includes("textTransform")) transform.push(rel(file));
    if (/\.toUpperCase\(\)/.test(src)) upper.push(rel(file));
  }
  expect(transform).toEqual([]);
  expect(upper.sort()).toEqual(UPPER_OK);
});
```

Its two documented blind spots (say so in the file's top comment): a `title` that comes after a prop containing `>` (an arrow function) on the same element is not seen, and a label inside a template literal with `${…}` in a `title={…}` expression is not seen. Neither produces a false alarm. If the "greater than 50" count is not reached, the scanner is wrong — fix the scanner, do not lower the number. If `1080p` or another chip label that is DATA (a resolution, a speed) fails the rule, it is a literal in a table, not on the element, and is not scanned; do not special-case.

`src/__tests__/systemFont.guard.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const ROOT = join(__dirname, "..", "..");
/** The only files that name a font family: they draw CONTENT (text on the video, the font picker's samples, the cover). */
const FAMILY_OK = ["src/editor/components/CoverFrame.tsx", "src/editor/components/FontStrip.tsx", "src/editor/components/OverlayText.tsx", "src/projects/ProjectCard.tsx"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "__tests__" && name !== "node_modules") walk(p, out); }
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const files = () => ["src", "app"].flatMap((d) => walk(join(ROOT, d))).map((f) => ({ rel: relative(ROOT, f).split(sep).join("/"), src: readFileSync(f, "utf8") }));

test("interface text is the system font: a font family is named only where content is drawn", () => {
  expect(files().filter(({ src }) => /\bfontFamily\b/.test(src)).map((f) => f.rel).sort()).toEqual(FAMILY_OK);
});

test("no interface font is left: no theme.fonts, no uiFonts module, no interface-only font key", () => {
  const found = files().filter(({ rel, src }) => /theme\.fonts\b|uiFontAssets|theme\/uiFonts|Montserrat_600SemiBold|Montserrat_800ExtraBold/.test(src)
    || (/Oswald_700Bold/.test(src) && rel !== "src/editor/coverFont.ts")).map((f) => f.rel);
  expect(found).toEqual([]);
  expect(readdirSync(join(ROOT, "assets", "fonts", "ui")).sort()).toEqual(["OFL.txt", "Oswald_700Bold.ttf"]);
});
```

- [ ] **Step 2: Run them.** `npx.cmd jest src/__tests__/palette.guard.test.ts src/__tests__/casing.guard.test.ts src/__tests__/systemFont.guard.test.ts` → green if Tasks 2–5 left nothing behind (the scanner was dry-run on the tree before this plan was written: it sees 89 labels in 256 files and flags exactly the strings of spec D8). If a file is listed, a read or a string was left: fix that one line (the new name is in the block at the top of this plan, the new spelling in spec D8) and name the file in the commit.

- [ ] **Step 3: Delete the bridge, test first.** Append the test below to `src/theme/__tests__/theme.test.ts` and run it → it fails (the old names are still there). Then, in `src/theme/theme.ts`, remove the two `// BRIDGE` blocks — the lines `sea: …` and `laneText: …` with their comment inside `colors` (so `colors` is `colors: C,`), and the `fonts: { … }` line with its comment. In `src/ui/LoadingScreen.tsx`: `export const WORDMARK = { size: 48 } as const;` and its comment loses the sentence in brackets. Run the test again → green.

```ts
test("the old names are gone", () => {
  for (const k of ["sea", "seaLight", "bgDeep", "bgEnd", "laneText", "laneSticker", "laneMusic", "laneEffect", "laneVoice", "laneSfx", "laneLayer", "highlight", "straw", "accentPressed"]) expect(k in theme.colors).toBe(false);
  expect("fonts" in theme).toBe(false);
  expect(Object.keys(theme.colors).sort()).toEqual(Object.keys(PALETTES.dark).sort());
});
```

- [ ] **Step 4: Run everything.** `npm run typecheck` → green (a compile error names a file that still reads an old name: fix that line). `npm test` → green, both suites. Confirm the four old guards were not edited: `git diff --stat main -- src/__tests__/noHexLiterals.test.ts src/__tests__/spacingScale.test.ts src/__tests__/outlineIcons.test.ts src/__tests__/kitSlider.test.ts` → no output.

- [ ] **Step 5: Commit.**

```powershell
git add src/theme/theme.ts src/theme/__tests__/theme.test.ts src/ui/LoadingScreen.tsx src/__tests__/palette.guard.test.ts src/__tests__/casing.guard.test.ts src/__tests__/systemFont.guard.test.ts
git commit -m "test: guards for the palette, casing and the system font; the bridge of old token names removed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Independent review, fixes

**Depends on:** 1–6. **Parallel-safe with:** nothing. Done by an agent that wrote none of Tasks 1–6, reading `git diff main...HEAD` and the spec — not this plan's reasoning.

**Files:** whatever a finding names; each fix is the smallest edit, with its test. **Do not touch:** the never-edited list; the guards' allow-lists (a guard is fixed by fixing the code).

- [ ] **Step 1: Scope.** `git diff --stat main...HEAD`. Every changed file must belong to a task's list. Report any that does not; report any change to a number in `STRIP`, `PANEL`, `BAR_HEIGHT`, `timelineLayout.ts`, `theme.space`, `theme.size`, `theme.motion`, to a gesture, a `height`, `width`, `padding`, `margin` or `gap`, or to anything under `modules/`, `supabase/`, `assets/` (other than the three deleted fonts), `app.json`, `package.json`.

- [ ] **Step 2: The stage's promises, one by one** (spec §1, §3):
  1. No old colour: the palette guard is green AND a read of `theme.ts` shows only §4's values.
  2. System font: no `fontFamily` outside the four content files; weights only from `theme.weight` in the kit (three literal `fontWeight: "700"` on the 10-pt clip badges in `ClipThumbStrip.tsx` predate this stage and stay).
  3. Casing: read every `title=`, `label=` and alert `text:` in the diff against spec D8's table — nothing missing, nothing extra, **no wording changed** but "Projects". Then sweep for buttons the scanner cannot see: `git grep -nE "<Pressable|<PressableScale" -- src app` and read each one that draws its own `<Body>` / `<Text>` label; a label that acts as a button and is not title-style is a finding.
  4. Nothing in spec §2's right-hand column was done early (no gold removed from panels, no Done button change, no lane or handle geometry, no `allowFontScaling` / `maxFontSizeMultiplier`: `git grep -nE "allowFontScaling|maxFontSizeMultiplier" -- src app` → no output).
  5. Bars: eight colours, black labels, caption hue by `o.kind === "caption"`, selection border and handles still `theme.colors.text`.
  6. `SecondaryButton` is never drawn on a `lifted` surface: `git grep -n "SecondaryButton" -- src app` and check each parent's background.
  7. Content untouched: `git diff main...HEAD -- src/editor/fonts.ts src/editor/components/OverlayText.tsx src/editor/model src/editor/templates.ts src/editor/textTemplates.ts src/editor/effects.ts` → no output; `CoverFrame` draws `COVER_FONT`.
  8. The loading gate: `app/_layout.tsx` differs from `main` in exactly two lines.

- [ ] **Step 3: Tests were updated honestly.** For each changed test file: only pins and matchers of the kinds the Global Constraints allow; no assertion deleted without a replacement; no `.skip`, no `toBeTruthy()` put where a style was pinned. `git diff main...HEAD --stat -- "src/**/__tests__/**"` and read the ones with large diffs.

- [ ] **Step 4: Fix what was found** (smallest edit, its own test), re-run `npm run typecheck` and `npm test`, both green.

- [ ] **Step 5: Commit** (skip if nothing was found): `git add` the files by path;

```powershell
git commit -m "fix: review findings for redesign stage 1" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Docs (`AGENTS.md`), full checks, the phone checklist

**Depends on:** 1–7. **Parallel-safe with:** nothing.

**Files:** Modify `AGENTS.md`. **Do not touch:** any code; `docs/design/**`; the spec.

- [ ] **Step 1: `AGENTS.md`, the UI line.** Replace the sentence `UI fonts (src/theme/uiFonts.ts) are separate from overlay fonts (src/editor/fonts.ts).` (end of the line that begins `- UI: every colour, font, radius and duration comes from src/theme/theme.ts`) with:

```
UI text is the system font: it sets NO `fontFamily` (weights are `theme.weight`, sizes are the `theme.type` roles, which read Apple's text styles in `theme.text`); a font family is named only where content is drawn — overlay fonts (src/editor/fonts.ts) and the cover title (`COVER_FONT`, src/editor/coverFont.ts) — guarded by src/__tests__/systemFont.guard.test.ts. Nothing sets `allowFontScaling` / `maxFontSizeMultiplier` yet (Dynamic Type limits come with the strips' redesign).
```

- [ ] **Step 2: `AGENTS.md`, two new lines** directly under that UI line:

```
- Palette: colours live in `PALETTES` in src/theme/theme.ts — one object per appearance with exactly the `Palette` keys (dark is the only one so far) — and reach `theme.colors` only through `resolvePalette`; a second appearance is a second object and a new body for that one function, so a colour is used only as a style value or a colour prop (never concatenated, sliced or parsed) and a test that needs the raw value reads `PALETTES.dark`. Neutrals are hue-free (`#000000` page → `#0E0E0F` timeline → `#1C1C1E` bar → `#2C2C2E` tile → `#3A3A3C` selected / secondary button); ONE gold, `accent`, with `onAccent` on it — never a second accent, never gold as body text; timeline bars are the eight `kind*` colours with `onKind` labels (a caption is `o.kind === "caption"`), and a selected bar keeps the `text` border and handles (gold on a bar colour is 1.1:1). `FIXED` lists what stays the same in every appearance. The old palette cannot come back (src/__tests__/palette.guard.test.ts; its two content exceptions are exact).
- Casing: nothing forces a case (no `textTransform`). Buttons (Primary / Secondary / Quiet, a strip's / panel's / sheet's action), tab chips and alert buttons are typed in title style — every word capitalised except a, an, and, the, to, with, in, of, for, or in the middle of the label (the first and the last word always: "Sign In"); everything else (titles of screens, strips, panels and sheets, tool and tile labels, notes, messages) is sentence style — guarded by src/__tests__/casing.guard.test.ts (blind to a `title` placed after an arrow-function prop and to a template literal with `${…}`).
```

- [ ] **Step 3: `AGENTS.md`, the Spacing line.** In `surfaces from `theme.elevation` (colour steps — no shadows over the video)` nothing changes; after `Text fields are the kit `Field`, cards the kit `Card`, spinners the kit `Spinner`;` insert `PrimaryButton is the gold fill (still used inside strips and panels until their redesign), SecondaryButton a grey capsule, QuietButton gold text;`. No other line of `AGENTS.md` is edited (the Sign-in line's quoted sentence "Sign-in isn't set up yet." is a message, not a button, and stays).

- [ ] **Step 4: Full checks.** `npm run typecheck` → green. `npm test` → green (app and server). `git status --short` → only `AGENTS.md` modified.

- [ ] **Step 5: Commit.**

```powershell
git add AGENTS.md
git commit -m "docs: redesign stage 1 — the palette, the system font, casing" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Hand the owner the phone checklist** — spec §8, the twelve points, word for word, with this note above it: *nothing here can be checked on a computer (the app has no web version); these twelve are what only the phone shows. Four things are still the old look on purpose and are not bugs: the dark-blue flash at the very start, the app icon, the icons inside the app, and gold main buttons inside the tall tools.* Do not merge: the owner tests on the phone first.

---

## Self-review (done while writing; repeat before starting)

- **Coverage of the stage:** palette (Tasks 1, 2, 4, 5), system font (1, 2, 3, 5, guard 6), casing (2, 3, 5, guard 6), tabular digits (2, 4; the rest were already there), radii (1, 2, 4, 5), "Projects" (3), timeline kinds and Caption hue (4), cover font as content (1, 3, 5), light-mode shape (1), guards (6), docs (8). Deliberately absent: everything in spec §2's right-hand column.
- **Names and values across tasks:** every token read in Tasks 2–5 is in the block under "Task order" and produced by Task 1's `theme.ts`; `WORDMARK.letterSpacing` is written by Task 2, last read by nobody after Task 3, deleted by Task 6; `dangerText` `#FF8078` and the secondary button's `lifted` fill agree between Task 1's contrast test, Task 2's pin and the spec.
- **Against `AGENTS.md`:** no hex outside `theme.ts`; spacing untouched and the allow-table untouched (Task 4 edits allow-listed files without adding or removing a spacing number); icons untouched; the kit `Slider` keeps its rest track as the kit's own; no animation touched; `PreviewPlayer.tsx`, `Timeline.tsx`'s structure, `timelineScroll.ts`, `EditorLayout.tsx` untouched; no Swift; no package; no web.
