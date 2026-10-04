# CapCut Group F — Text and Captions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add richer text styling (opacity, spacing, outline colour / thickness, shadow, glow), eight more fonts, twelve text templates, six caption presets and word-by-word caption highlight.

**Architecture:** Schema v9 adds `style`, `words` and `highlightColor` to text overlays. The mirrored pair `overlayLayout.ts` ↔ `OverlayLayout.swift` stays the only place that turns overlay numbers into pixels and gains the style-derived values. The preview draws stacked `Text` layers; the Swift export draws stacked text layers with layer shadows and per-word highlight copies.

**Tech Stack:** Expo SDK 57 (expo-font), TypeScript strict, Zustand, Jest + RNTL v14; Swift / CoreText / Core Animation (uncompiled).

**Spec:** `docs/superpowers/specs/2026-10-04-capcut-f-text-captions-design.md` (binding; §2 and §3 hold every field, limit and formula).

## Global Constraints

- **Untouched texts are unchanged:** with `DEFAULT_TEXT_STYLE`, no words and no highlight, a text or caption renders the same preview tree (one `Text`) and takes the same export path, and `layoutOverlay` returns the same numbers as today.
- `src/editor/model/overlayLayout.ts` ↔ `modules/clipy-video/ios/OverlayLayout.swift` stay identical (formulas and constants); nothing else converts style values to pixels.
- UI fonts (`src/theme/uiFonts.ts`) are separate from overlay fonts (`src/editor/fonts.ts`); this group touches overlay fonts only.
- User-content colours (text, outline, shadow, glow, highlight, template colours) are content values: they live in model / registry files allow-listed by `src/__tests__/noHexLiterals.test.ts`, never in the theme, and no hex literal goes into a screen.
- One undo step per slider drag (`beginTransaction` + `applyTransient`), switch, colour pick, template or preset.
- Captions never get animations or keyframes (existing rule); editing a caption's text clears its `words`.
- Expo Go safe: fonts are loaded with `useFonts(fontAssets)` as today; no new runtime dependency; check installed typings / versioned docs before using an Expo or RN API.
- Swift is never compiled here: verify by reading; list unverified APIs.
- Windows: PowerShell, no `&&`, `npx.cmd`. Before each commit: `npm run typecheck` and `npm test` green. `git add` explicit paths only. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- RNTL v14: `render` / `fireEvent` are async — always `await`.

---

### Task 1: Schema v9

**Files:** Modify `src/editor/model/types.ts`, `migrate.ts`; tests `migrate.test.ts`, `types.text.test.ts` (new).

**Interfaces (produced)** — spec §2 verbatim (`SCHEMA_VERSION 9`, `TextShadow`, `TextGlow`, `TextStyle`, `DEFAULT_TEXT_STYLE`, `TEXT_STYLE_LIMITS`, `DEFAULT_SHADOW`, `DEFAULT_GLOW`, `CaptionWord`, `TextOverlay.style / words / highlightColor`), plus:
```ts
export function clampTextStyle(v: unknown): TextStyle           // every field present and in range; bad colours → default / null
export function clampCaptionWords(v: unknown, text: string, length: number): CaptionWord[]   // spec §2 rules; times clamped to [0, length]
export const isHexColor: (v: unknown) => v is string            // #RRGGBB (reuse the existing checker if there is one)
```
`FONT_IDS` is NOT extended in this task (Task 2 adds fonts). Factories (`makeOverlay` and any real-code text factory) add fresh defaults. Migration v8 → v9 + sanity pass (text and caption overlays; stickers untouched).

- [ ] **Step 1: Failing tests** — `clampTextStyle` (each field's range, NaN, missing, bad colour, null shadow / glow kept, partial shadow repaired); `clampCaptionWords` (mismatch with text → [], non-finite dropped, sorted, clamped, plain text → []); factories give fresh objects; v8 → v9 defaults; sanity repairs; highlight only on captions; idempotent; v1 chain reaches 9.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** `npm run typecheck`; `npm test`. **Step 5: Commit** `feat(model): schema v9 — text style, caption words and highlight`.

---

### Task 2: Eight more fonts

**Files:** Add eight `.ttf` files under `assets/fonts/`; modify `src/editor/model/types.ts` (`FONT_IDS`), `src/editor/fonts.ts`, `app.json` (the `expo-font` plugin's `fonts` list), `src/editor/__tests__/fonts.test.ts`, and the Swift side only if a font-id list is mirrored there (grep).

**Behaviour** — ids and faces: `bebasNeue` Bebas Neue Regular, `poppins` Poppins SemiBold, `playfair` Playfair Display Regular, `fredoka` Fredoka Regular (the static Regular instance, not a variable font — if only a variable file is available use Fredoka One or the static 400 instance), `caveat` Caveat Regular (static), `pressStart` Press Start 2P Regular, `righteous` Righteous Regular, `dancingScript` Dancing Script Regular (static). Obtain the files from the `@expo-google-fonts/<name>` npm packages (OFL-licensed Google fonts; e.g. `npm pack @expo-google-fonts/bebas-neue` in a scratch folder outside the repo, extract the needed `.ttf`) — do NOT add those packages to `package.json`. Name the files like the existing ones (`BebasNeue-Regular.ttf`, `Poppins-SemiBold.ttf`, …). For each file read the PostScript name (name ID 6) and family from the font's `name` table with a small Node script (parse the TTF tables directly; no new dependency) and put the exact PostScript name in `FONTS[id].postScriptName`; `family` keys follow the existing pattern (`BebasNeue_400Regular`, `Poppins_600SemiBold`, …). Add a short `assets/fonts/LICENSES.md` naming each font and "SIL Open Font License 1.1".

- [ ] **Step 1: Failing tests** — `FONT_IDS` has 16; every id has label / family / PostScript name / file; every `file` exists on disk and is listed in `app.json`; every `fontAssets` key equals a `family`; a test that parses each `.ttf`'s name table and asserts the PostScript name equals `FONTS[id].postScriptName` (for all 16 fonts).
- [ ] **Step 2: Run** → FAIL. **Step 3: Add the files and registry.** **Step 4:** checks; `npx.cmd expo-doctor`. **Step 5: Commit** `feat(text): eight more fonts`.

---

### Task 3: Layout numbers — `overlayLayout.ts` ↔ `OverlayLayout.swift`

**Files:** Modify `src/editor/model/overlayLayout.ts`, `modules/clipy-video/ios/OverlayLayout.swift`, `src/editor/model/__tests__/overlayLayout.test.ts` (the existing TS ↔ Swift parity test), `modules/clipy-video/ios/Tests/` (layout tests), `modules/clipy-video/ios/ExportSession.swift` only for the record fields the layout needs (see below).

**Interfaces (produced)** — `layoutOverlay(o, frameW, frameH)` result gains:
```ts
letterSpacing: number;                 // px
lineHeight: number;                    // px (today's × style.lineSpacing)
outlineWidth: number;                  // px (today's × style.outlineWidth)
outlineColor: string;                  // style.outlineColor ?? contrastFor(o.color)
shadow: { color: string; opacity: number; dx: number; dy: number; blur: number } | null;
glow: { color: string; radius: number } | null;
opacity: number;
```
with `SHADOW_ANGLE = 0.7071` and the formulas of spec §3. `contrastFor` moves into `overlayLayout.ts` (re-exported from where it was) so both sides own it in the mirrored pair. Swift: `ExportOverlay` gains a nested `style` record (the seven fields; shadow / glow flattened: `shadowColor: String?`, `shadowOpacity`, `shadowDistance`, `shadowBlur`, `glowColor: String?`, `glowSize`), `words` (array of a record) and `highlightColor: String?` — decoded here, used in Task 7; `OverlayLayout.layout` returns the same new values with the same formulas. With defaults both sides return exactly today's numbers.

- [ ] **Step 1: Failing tests** — hand-computed layout for a styled text at 1080×1920 (font scale 0.07, letterSpacing 0.1, lineSpacing 1.5, outlineWidth 2, shadow default, glow default); defaults equal the old values (`toBe` against the previous expressions); the parity test asserts the new constants / formula tokens exist identically in the Swift file (follow how the existing parity test compares the two files).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement both sides.** **Step 4:** checks. **Step 5: Commit** `feat(text): style-derived layout numbers in the mirrored overlay layout`.

---

### Task 4: Ops, templates, presets, caption words

**Files:** Modify `src/editor/model/ops.ts`, `src/editor/model/captions.ts`, `src/editor/useCaptions.ts` (only if needed to pass words through); create `src/editor/textTemplates.ts`; tests `ops.text.test.ts` (new), `captions.test.ts`, `textTemplates.test.ts`; allow-list `textTemplates.ts` in `noHexLiterals.test.ts`.

**Interfaces (produced):**
```ts
export function setTextStyle(p: Project, overlayId: string, patch: Partial<TextStyle>): Project            // text and captions; clamped; same project when unchanged
export function applyTextTemplate(p: Project, overlayId: string, templateId: TextTemplateId): Project     // kind "text" only; keeps text, x, y, scale, rotation, start, end, keyframes
export function applyCaptionPreset(p: Project, presetId: CaptionPresetId): Project                         // every caption; unchanged when there are none
// setCaptionStyleForAll's patch type gains `style` (Partial<TextStyle>) and `highlightColor`
// textTemplates.ts
export const TEXT_TEMPLATE_IDS, TEXT_TEMPLATES: Record<TextTemplateId, { label: string; patch: TextTemplatePatch }>;
export const CAPTION_PRESET_IDS, CAPTION_PRESETS: Record<CaptionPresetId, { label: string; patch: CaptionPresetPatch }>;
```
- Templates (twelve) and presets (six) per spec §6; every patch must survive `clampTextStyle` / the sanity pass unchanged; fonts referenced must be in `FONT_IDS` (use the new fonts where they fit: e.g. Retro → pressStart, Handwritten → caveat, Elegant → playfair, Clean title → poppins, Comic → bangers).
- `updateOverlay` with a changed `text` on a caption clears `words`; other caption edits keep them.
- `captions.ts`: `Line` gains `words: Segment[]` (the segments merged into it); `linesToCaptions` stores `words` relative to the line start through `clampCaptionWords`; the caption text is exactly the words joined by single spaces.
- `duplicateOverlay` deep-copies `style` and `words`.

- [ ] **Step 1: Failing tests** — each op (clamps, identity, kind rules); every template / preset applies cleanly, is idempotent under the sanity pass, references existing fonts and keeps the stated fields; text edit clears words; merge keeps words and their times; `linesToCaptions` output passes `clampCaptionWords` unchanged; deep copies.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(text): style ops, twelve templates, six caption presets, caption words`.

---

### Task 5: Preview rendering

**Files:** Modify `src/editor/components/OverlayText.tsx` (+ tests `OverlayText.test.tsx` new / existing overlay tests), `OverlayLayer.tsx` only if the playhead must be passed for captions.

**Behaviour** — spec §4 "Preview". The component builds its layers from `layoutOverlay`'s values only. Layers bottom → top: glow, shadow, outline, fill; all layers are absolutely stacked `Text`s with identical font, size, `letterSpacing`, `lineHeight`, alignment and width so they wrap identically; under-layers are `aria-hidden` / not accessible and `pointerEvents="none"`; under-layers draw their glyphs in the layer's own colour (glow colour / shadow colour with opacity / outline colour) so nothing of a different colour peeks out. A text with default style and `outline: false` renders exactly ONE `Text` (same props as today); with only `outline: true` it renders what it renders today. `style.opacity` multiplies the wrapper's opacity prop (animation opacity) — omitted when both are 1 / undefined. Word highlight: when `o.kind === "caption"`, `o.words.length > 0` and `o.highlightColor`, the fill layer is one `Text` with a nested `Text` per word (joined by spaces) and the active word (playhead time − `o.start` in `[word.start, word.end)`) coloured with the highlight; the component takes an optional `time?: number` prop for this (passed by `OverlayLayer` from the playhead only for captions that need it).

- [ ] **Step 1: Failing tests** — default text → one `Text` with the same style object as before; each feature adds its layer with the expected style numbers (from a hand-computed layout); letter spacing / line height on every layer; opacity composition; caption highlight: spans, the active word at three times, no highlight outside any word, no spans without words or colour; the `frameOnly` copy still measures the same box.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(preview): stacked text layers for glow, shadow and outline; caption word highlight`.

---

### Task 6: Text panel, caption style sheet, font strip

**Files:** Modify `src/editor/components/TextPanel.tsx`, `CaptionStyleSheet.tsx`, `FontStrip.tsx` (if it needs layout changes for 16 fonts); create `TextStyleSection.tsx`, `TemplateStrip.tsx`; tests alongside.

**Behaviour** — spec §7. `TextStyleSection({ style, outline, onPatch, onPatchTransient, onBegin })` is shared by the Text panel (writes `setTextStyle` for the selected overlay) and the Caption style sheet (writes `setCaptionStyleForAll({ style })`): sliders Opacity (0–100 %), Letter spacing, Line spacing; when `outline` is on: outline colour row (an "Auto" chip + `ColorRow`) and Thickness slider; Shadow switch (on → `DEFAULT_SHADOW`) with colour row and Opacity / Distance / Blur sliders; Glow switch (on → `DEFAULT_GLOW`) with colour row and Size slider. `TemplateStrip`: horizontal scroll (no scroll handlers) of tiles drawing "Aa" with the template's look through `OverlayText`-compatible styling (or a simplified `Text` using the same layout helper); Text panel → `applyTextTemplate`; Caption sheet → `applyCaptionPreset`. Caption sheet adds the sample caption (rendered with `OverlayText` in a small fixed frame, second word highlighted via fixed `words` and `time`) and "Highlight spoken word" switch + colour row (`setCaptionStyleForAll({ highlightColor })`). With no captions in the project the preset strip and controls still edit the style the sample shows (follow how the sheet treats "no caption yet" today).

- [ ] **Step 1: Failing tests** — each control writes the right patch and is one undo step (slider drags via begin + transient); switches toggle shadow / glow with defaults; Auto outline colour → null; template tile applies and is one undo step; caption presets apply to all captions; highlight switch and colour; sample renders with the current style; sixteen fonts in the strip.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(editor): text style section, templates, caption presets and highlight controls`.

---

### Task 7: Export — request and Swift rendering

**Files:** Modify `modules/clipy-video/index.ts` (+ test), `modules/clipy-video/ios/ExportSession.swift`; create `modules/clipy-video/ios/CaptionWords.swift`, `ios/Tests/CaptionWordsTests.swift`; a Jest source-reading test `src/editor/model/__tests__/textExport.swift.test.ts`.

**Behaviour**
- Request (`toExportOverlay`): `style` (seven fields, shadow / glow flattened with nulls as in Task 3's record), `words`, `highlightColor`; stickers send defaults / `[]` / null; plain texts send `[]` / null.
- Swift `overlayLayer`: uses `OverlayLayout`'s new values — kerning (`kCTKernAttributeName`), line height, stroke colour / width; the container's opacity factor multiplied into the visibility animation's value and into the motion opacity samples; shadow and glow as additional `CATextLayer` copies of the same string behind the fill, each with `shadowColor` / `shadowOpacity` / `shadowRadius` / `shadowOffset` (glow: zero offset, opacity 1, radius = glow radius; shadow: offset `(dx, −dy)` in the y-up layer space) and their own glyph colour set to the shadow / glow colour; the background stays on the container. A default-style overlay builds exactly the layers it builds today.
- Word highlight: `CaptionWords.swift` (pure) turns `words` + caption `[start, end)` into a list of `(range: NSRange of the word in the caption string, start: Double, end: Double)` in composition time (skipping words whose text cannot be located in order); for each, `ExportSession` adds one extra `CATextLayer` copy of the fill string with that range's foreground colour set to the highlight colour, same frame, no stroke change, no shadow, visible only during the word's time through the existing visibility animation (for a caption with motion: captions have no motion, so `addVisibility` is enough).
- Jest source-reading test: the new attribute keys, the highlight loop and the default-path guard exist; XCTests for `CaptionWords` ranges and times.

- [ ] **Step 1: Failing Jest tests** (request whole-object `toEqual`s incl. a default text, a styled text, a caption with words; the source-reading test). **Step 2: Implement** (list unverified APIs). **Step 3:** checks. **Step 4: Commit** `feat(export): text style layers and caption word highlight (uncompiled)`.

---

### Task 8: Docs and full checks

**Files:** `README.md`, `AGENTS.md` (only if a rule changed), the spec's Status line, `docs/superpowers/research/capcut-roadmap.md`.

- [ ] **Step 1** — README "Text and captions" section; first-build checklist additions: each new font shows in the exported video (PostScript names), shadow / glow look, stroke thickness vs the preview's halo, caption word highlight timing. Spec Status → `Implemented 2026-10-04 (Swift export unverified until an EAS build exists; on-device checklist pending)`. Roadmap group F rows → "Have" for styling, templates, caption styles + word highlight; curved text, bilingual captions, sticker library unchanged.
- [ ] **Step 2** — `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `npm ls --all | Select-String invalid` (empty).
- [ ] **Step 3: Commit** `docs: text and captions (CapCut group F)`.

**Device checklist (user, Expo Go):** add a text → open its panel → tap three templates → change the font to a new one → Style: Opacity, Letter spacing, Shadow on, Glow on, Outline colour and thickness → Captions → Style: tap each preset and watch the sample, switch Highlight on → undo everything → close and reopen the project.
