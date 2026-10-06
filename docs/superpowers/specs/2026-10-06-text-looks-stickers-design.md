# More text looks and stickers: design

**Date:** 2026-10-06
**Status:** Approved by the user 2026-10-06
**Builds on:** CapCut group F (`docs/superpowers/specs/2026-10-04-capcut-f-text-captions-design.md`: `TextOverlay.style`, the stacked-text preview, the twelve text templates, the mirrored `overlayLayout.ts` ↔ `OverlayLayout.swift`), the tall panels (`2026-10-05-editing-ui-r2-tall-panels-design.md`) and UI polish rounds 1–2 (tokens, kit, guards). Schema v14 → **v15**. No new package, no new font file.

## 1. What the user gets

**Text**

1. **Twelve more ready-made looks** in the row at the top of the Text panel (24 in all): Headline, Neon outline, Soft shadow, Sticky note, Title bar, Stamp, Bubblegum, Cinema, Gold, Chalkboard, 3D pop, Watermark. The twelve that exist stay, first, in their order.
2. **Outline and Shadow** as their own named rows in the Text panel: outline colour and thickness; shadow colour, strength, distance and blur.
3. **Background box options**: rounded or square corners, a Padding slider, and the box's opacity with a label.
4. **Letter spacing and line spacing** sliders in a "Spacing and opacity" row.

**Stickers**

5. **Thirteen more shapes** (20 in all): two arrows, three speech bubbles, three badges, two stars, three frames.
6. **Sticker packs**: the emoji picker is browsed by pack — Faces, Hands, Hearts, Food, Travel, Symbols and More — with Recently used on top. Search still searches every emoji.

**Left out (told to the user):** curved text and animated GIF stickers.

**Promises.** Existing texts and stickers are **not changed**: a project opened after the update looks exactly as before (§4.3 proves it). Text and stickers move, resize and animate the same way. Everything shows in the preview in Expo Go today. The export is written but **unverified until the first native build**.

Out of scope: curved text, GIF / animated stickers, new fonts, custom sticker import, per-character styling, gradients / textures in text, anything in the timeline, the preview player, publish, or the home / export screens.

## 2. Where things stand today (read 2026-10-06)

A good part of the approved list is already in the model and the export (group F); it is hidden behind one "Style ▼" row at the bottom of a long panel. This round surfaces it and adds what is missing.

| Approved item | Today | This round |
|---|---|---|
| Outline thickness + colour | `outline: boolean`, `style.outlineWidth` (0.5–3 × the base width), `style.outlineColor` (null = automatic). Sliders exist behind "Style". | No model change. Its own **Outline** row. |
| Shadow distance, blur + colour | `style.shadow: { color, opacity, distance, blur }` (fractions of the font size). Exists behind "Style". | No model change. Its own **Shadow** row. |
| Background box | `background: { color, opacity } \| null`; padding fixed at 0.25 × the font size; corner radius fixed at half the padding; an unlabelled opacity slider. | **New:** `style.boxPadding`, `style.boxCorner`; a labelled opacity slider. |
| Letter / line spacing | `style.letterSpacing`, `style.lineSpacing`. Exist behind "Style". | No model change. The **Spacing and opacity** row. |
| Looks | 12 text templates, 6 caption presets (`src/editor/textTemplates.ts`). | **12 new** text templates. |
| Shapes | 7 (`SHAPE_IDS`), one SVG path each, absolute `M L C Q Z` only. | **13 new** ids and paths. |
| Emoji | 1 914 entries in `assets/emoji.json` (`char`, `name`, `keywords`; `keywords[0]` is the Unicode group in lower case). Without a search only the **first 60** can be seen (`searchEmoji("")`). | Seven packs; a pack shows all of its emoji. |

Also read: glow (`style.glow`) and text opacity (`style.opacity`) exist and stay. The preview draws at most **four** `Text` layers per overlay (glow, shadow, outline, fill) plus one box `View`; the export draws one `CATextLayer` per layer with CoreText attributes (§6.2).

## 3. Data model — schema v15

```ts
export const SCHEMA_VERSION = 15 as const;
export const BOX_CORNERS = ["rounded", "square"] as const;
export type BoxCorner = (typeof BOX_CORNERS)[number];

export interface TextStyle {
  // …the seven fields of v14, unchanged in name, range, default and meaning…
  boxPadding: number;      // 0…0.6 of the font size: the space between the text and the edge of its background box. Default 0.25
  boxCorner: BoxCorner;    // default "rounded"
}
export const DEFAULT_TEXT_STYLE = { …v14…, boxPadding: 0.25, boxCorner: "rounded" };
export const TEXT_STYLE_LIMITS = { …v14…, boxPadding: [0, 0.6] } as const;

export const SHAPE_IDS = ["circle", "square", "roundedBox", "arrow", "star", "speechBubble", "heart",
  "arrowCurved", "arrowDouble", "bubbleRound", "bubbleSquare", "bubbleThought", "badgeSeal", "badgeRibbon", "banner",
  "sparkle", "burst", "frameRounded", "ring", "brackets"] as const;
```

| Field | Range | Default | Unit | Why this default |
|---|---|---|---|---|
| `style.boxPadding` | 0 – 0.6 | **0.25** | fraction of the font size | `BACKGROUND_PAD_FACTOR`, the padding every box has today |
| `style.boxCorner` | `"rounded"` \| `"square"` | **`"rounded"`** | — | every box is rounded today |

- **Additive only.** No existing field changes name, range, default or meaning. The two fields live in `style` (not in `background`), so switching the box off and on keeps them, a template's `style` carries them, and the existing `clampTextStyle` / `setTextStyle` / `setCaptionStyleForAll` paths handle them without a new op.
- **Migration v14 → v15** is the existing sanity pass: `clampTextStyle` fills the two defaults for every text and caption. Stickers are untouched. Nothing else in a stored project is rewritten.
- **Sanity pass:** `boxPadding` non-finite → 0.25, else clamped to 0–0.6; `boxCorner` anything but the two ids → `"rounded"`. A sticker with an unknown shape falls back to its emoji or is dropped (existing rule) — the thirteen new ids are known.
- Style numbers are stored with two decimals (existing `cleanStylePatch`); `boxCorner` passes through it untouched.
- Captions share `TextOverlay.style`, so both fields apply to captions too (§8.2).

## 4. Layout numbers — `overlayLayout.ts` ↔ `OverlayLayout.swift`

The mirrored pair stays the only place that turns style numbers into pixels. Every number is a fraction of the font size (itself `fontScale × scale × frame height`), so the preview and the export agree at any frame size.

### 4.1 Formulas

```
padding   = background ? boxPadding × fontSize : 0                       (was: background ? 0.25 × fontSize : 0)
boxRadius = (no background or boxCorner = "square") ? 0
          : BACKGROUND_PAD_FACTOR × fontSize × BOX_RADIUS_FACTOR          (new result field; BOX_RADIUS_FACTOR = 0.5)
```

`BACKGROUND_PAD_FACTOR` (0.25) stays as the reference for the corner: a rounded corner is half the **default** padding, whatever padding is chosen — so a box with no padding is still rounded, and a rounded corner is exactly today's `padding / 2`. TypeScript rounds pixel values to four decimals (`r`); `boxRadius` is `r(0.25 × fontSize) × 0.5`, not rounded again, so it is bit-for-bit today's `padding / 2`. Swift does not round (as today).

The other style values (`letterSpacing`, `lineHeight`, `outlineWidth`, `outlineColor`, `shadow`, `glow`, `opacity`) are not touched.

### 4.2 Vectors (shared: `overlayLayout.vectors.ts` ↔ the table in `OverlayLayoutTests.swift`)

| Name | fontScale × scale, frame | padding / corner | fontSize | padding | boxRadius |
|---|---|---|---|---|---|
| the old box | 0.1 × 1.5, 1080 × 1920 | 0.25 rounded | 288 | 72 | 36 |
| the old box in a small preview | 0.1 × 1.5, 300 × 533 | 0.25 rounded | 79.95 | 19.9875 | 9.99375 |
| wide and square | 0.07 × 1, 1080 × 1920 | 0.5 square | 134.4 | 67.2 | 0 |
| tight, still rounded | 0.07 × 1, 1080 × 1920 | 0.1 rounded | 134.4 | 13.44 | 16.8 |
| no padding keeps the round corner | 0.07 × 1, 1080 × 1920 | 0 rounded | 134.4 | 0 | 16.8 |
| the widest | 0.07 × 1, 1080 × 1920 | 0.6 rounded | 134.4 | 80.64 | 16.8 |
| no background, no box | 0.07 × 1, 1080 × 1920 | 0.5 rounded, **no background** | 134.4 | 0 | 0 |
| a square frame | 0.05 × 2, 1080 × 1080 | 0.3 rounded | 108 | 32.4 | 13.5 |

### 4.3 The proof that nothing existing changes

`layoutOverlay` is the app's "resolved text style": the preview (`OverlayText`) and the export (`ExportSession.overlayLayer`) draw from its result and nothing else.

1. **Model** (`migrate.test.ts`): a v14 project with a plain text, a fully styled text, a caption with words and two stickers is migrated; the result equals the v14 project with only `schemaVersion: 15` and the two defaults added to each text style. The input object is not mutated; a second pass changes nothing.
2. **Draw parameters** (`overlayLayout.test.ts`): a frozen copy of the v14 `layoutOverlay` lives in the test. For each of the 12 existing templates and the 6 caption presets × three backgrounds × four frame sizes, `layoutOverlay(migrated)` minus `boxRadius` **equals** the frozen function's result on the stored v14 overlay, and `boxRadius` **is** the old `padding / 2` (`toBe`).
3. **Preview tree**: `OverlayText.test.tsx` passes unedited; the only source change is `l.padding / 2` → `l.boxRadius` in two places.
4. **Export** (by reading + XCTest): `container.cornerRadius = l.boxRadius`; `OverlayLayoutTests` pins "the old box"; `TextBoxTests` pins that the default box has the radius `pad / 2` and one sublayer.

## 5. Preview — `OverlayText.tsx`

- The box: `padding: l.padding`, `borderRadius: l.boxRadius` on the wrapper and on the background `View` (two expressions change; test ids are added for the padded body and the box).
- **Layer cap: four `Text` per overlay** — glow, shadow, outline, fill — plus one box `View` (and one unseen frame copy while a moving or see-through text is selected). This round adds no layer: a thick outline is still **one** halo (`textShadowRadius` = the outline width), a shadow one layer, whatever the slider values. At the cap (glow + shadow + outline all on) the user sees all three; nothing is dropped. A test pins ≤ 4 for all 24 looks and 6 presets. The looks row draws 24 tiles: 42 sample `Text`s in all (21 today).
- **Outline look:** a soft halo in the preview, a hard stroke in the export (unchanged, group F). It shows most on Neon outline, Stamp and Bubblegum — on the first-build checklist.
- **Letter spacing / line height** are React Native `Text` style props (`letterSpacing`, `lineHeight`) held in one `metrics` object that **every** layer — the under-layers, the fill and the unseen frame copy — spreads, with the same string, so all layers wrap alike and the selection frame measures the same box. The under-layers reach `room` pixels beyond the fill and pad the same back in, relative to `l.padding`: a larger padding moves them with the box (tested).
- The selection frame is drawn inside the padded box, so it follows the padding.
- No new package: `react-native-svg` 15.15.4 (installed) draws the shapes; no Skia, no SVG text.

## 6. Export (Swift — uncompiled)

### 6.1 Request

`ExportTextStyle` (TS in `modules/clipy-video/index.ts`, Swift record in `ExportSession.swift`) gains `boxPadding: Double = 0.25` and `boxCorner: String = "rounded"`. A sticker sends the defaults. A request without the fields (an older JS bundle) decodes to the defaults, i.e. today's box.

### 6.2 What the Swift side uses today, and what changes

Today (`ExportSession.overlayLayer`): one `NSAttributedString` with CoreText keys only — `kCTFontAttributeName`, `kCTForegroundColorAttributeName`, `kCTParagraphStyleAttributeName` (alignment + fixed min / max line height), `kCTBaselineOffsetAttributeName`, `kCTKernAttributeName` (letter spacing), `kCTStrokeWidthAttributeName` (negative = stroke and fill) + `kCTStrokeColorAttributeName` — drawn by a `CATextLayer` inside a container `CALayer`. Glow and shadow are tinted `CATextLayer` copies below the fill with a layer shadow (`shadowRadius` = blur / 2). The box is the container's `backgroundColor` + `cornerRadius = pad / 2`, its bounds the measured text + `2 · pad`; the text wraps at `maxWidth − 2 · pad`. Stickers: `SVGPath.cgPath` → `CAShapeLayer` (default non-zero fill), flipped to y-up.

Changes: **one line** — `container.cornerRadius = l.boxRadius` — because `pad` already comes from `l.padding`. Stroke, kern, line height, shadow and glow are untouched. Shapes: thirteen strings in `Effects.shapePaths`; no drawing change.

### 6.3 Unverified until the first native build

1. `@Field var boxCorner: String = "rounded"` decodes a JS string and keeps its default when the key is missing (expo-modules-core `Record`).
2. `CALayer.cornerRadius` rounds the `backgroundColor` without `masksToBounds` (as today), also when the radius is larger than the padding (padding 0).
3. A large padding narrows the wrap width the same way in both engines (`maxWidth − 2 · pad`); a long text with padding 0.6 may break one word earlier or later than the preview.
4. A compound path keeps its hole: `CAShapeLayer` fills non-zero by default, and `CGPath.copy(using:)` with the vertical flip reverses every subpath alike, so a counter-wound inner subpath still cuts out.
5. `SVGPath` accepts several `M … Z` subpaths in one string (read: it does — `M` after `Z` starts a new subpath).

## 7. The twelve new looks (`TEXT_TEMPLATES`, appended)

Fonts are the sixteen bundled ones; unlisted style fields are the defaults. None carries an animation.

| id | Label | Font | Colour | Background | Outline | Style | How it looks |
|---|---|---|---|---|---|---|---|
| `headline` | Headline | anton | `#FFFFFF` | `#E10600`, 1 | off | letterSpacing 0.04, boxPadding 0.35, boxCorner square | heavy white letters on a solid red block with square corners — a news headline |
| `neonOutline` | Neon outline | poppins | `#0B0B14` | — | on | letterSpacing 0.06, outlineColor `#39FF14`, outlineWidth 2.4, glow `#39FF14` 0.35 | near-black letters traced with an electric green line that glows |
| `softShadow` | Soft shadow | fredoka | `#FFF8E7` | — | off | shadow `#3A1F5D`, 0.7, 0.05, 0.45 | rounded cream letters floating on a wide, soft violet shadow |
| `note` | Sticky note | permanentMarker | `#1B1B1F` | `#FFF27A`, 1 | off | lineSpacing 1.1, boxPadding 0.5, boxCorner square | dark marker handwriting on a square yellow note with wide margins |
| `titleBar` | Title bar | oswald | `#FFFFFF` | `#0A1B33`, 0.85 | off | letterSpacing 0.06, boxPadding 0.15, boxCorner square | condensed white text on a tight, square dark-blue strip — a TV name strap |
| `stamp` | Stamp | bebasNeue | `#D7263D` | `#FFF4E0`, 1 | on | letterSpacing 0.12, outlineColor `#D7263D`, outlineWidth 0.8, boxPadding 0.2 | wide-spaced red capitals, inked thicker by an outline of their own colour, on a cream label |
| `bubblegum` | Bubblegum | lobster | `#FFFFFF` | — | on | outlineColor `#FF4FA3`, outlineWidth 2.5, shadow `#B0005A`, 1, 0.07, 0 | white script with a thick pink edge and a hard, darker pink drop |
| `cinema` | Cinema | montserrat | `#FFFFFF` | — | off | opacity 0.9, letterSpacing 0.3, lineSpacing 1.4 | thin white letters spaced very far apart — film credits |
| `gold` | Gold | dancingScript | `#F5C542` | — | off | shadow `#5A3A00`, 0.9, 0.04, 0.08; glow `#FFE9A8` 0.2 | golden flowing script with a warm glow and a small brown shadow |
| `chalk` | Chalkboard | caveat | `#F4F4F5` | `#1E3B2F`, 0.95 | off | letterSpacing 0.03, boxPadding 0.4 | chalk-white handwriting on a dark green board with round corners |
| `pop3d` | 3D pop | righteous | `#FFFFFF` | — | on | outlineColor `#6C2BD9`, outlineWidth 2, shadow `#00E5A0`, 1, 0.12, 0 | white letters, a purple edge and a hard mint-green copy behind — two-colour 3D |
| `watermark` | Watermark | poppins | `#FFFFFF` | — | off | opacity 0.55, letterSpacing 0.15, lineSpacing 1.3 | half see-through, widely spaced white — sits quietly on the picture |

(Shadow values are colour, opacity, distance, blur.) Each differs from the existing twelve in font + treatment: five set a box field (Headline, Sticky note, Title bar, Stamp, Chalkboard), three use fonts no template used before (Permanent Marker, Lobster, Dancing Script), two are built on extreme spacing / opacity (Cinema, Watermark). As before, a template replaces the whole look; an **existing** template now also resets the box to the default padding and round corners (its style is the default plus its own values).

## 8. Screens

### 8.1 Text panel (`TextPanel.tsx`, a regular `ToolPanel`, one vertical scroll)

Order: text field · looks row (24) · font row · Size · colour · Align · **five section rows** · Fine-tune · Duplicate / Delete.

The single "Style ▼" row is replaced by five rows, each 44 pt high, **all closed when the panel opens**:

| Row | Right side | Controls when open |
|---|---|---|
| **Outline** | switch | "Auto" chip + colour row; Thickness slider |
| **Shadow** | switch | colour row; Shadow opacity, Distance, Blur sliders |
| **Background** | switch | colour row; **Rounded / Square** chips; **Padding** slider; **Box opacity** slider |
| **Spacing and opacity** | — | Opacity, Letter spacing, Line spacing sliders |
| **Glow** | switch | colour row; Size slider |

- A row that is switched on shows a chevron and opens / closes when its name is tapped; switching a row **on opens it**, switching it **off closes it**. A row that is off has nothing to open.
- Kit only: `Slider` with a `ValueLabel` ("Padding 25", "Box opacity 60 %", "Thickness 1.50×"), `Chip`, `ColorRow`, `PressableScale`, Ionicons `chevron-down-outline` / `chevron-up-outline`; spacing tokens; rows and chips reach 44 pt.
- One slider drag = one undo step (`beginTransaction` + `applyTransient`); one tap or switch = one `apply`. The typing-undo logic is not touched.
- **On a 667-pt phone** the panel is 307 pt, its body 262 pt. With the keyboard up (the panel opens with it) only the text field shows. With the keyboard put away: the text field, the looks row, the font row and the "Size" label are visible without scrolling; the five rows start about 460 pt down — two flicks. With every row closed the whole list is about 810 pt long (about 710 today with "Style" closed: five 44-pt rows take the place of three short ones).
- Labels kept: the switches "Outline", "Shadow", "Glow", "Background"; every slider's test id; "Auto". Gone: the "Style" button.

### 8.2 Caption style (`CaptionStyleSheet.tsx`)

The same five rows (one shared component), writing every caption with `setCaptionStyleForAll`. **Every new control works for captions**: the word highlight is a set of copies inside the same box, so padding and corners do not interfere; nothing needs hiding. The twelve new looks are for texts only — captions keep their six presets.

### 8.3 Stickers (`StickerSheet.tsx`, a regular `ToolPanel`, `scroll={false}`)

- **Lead row** (44 pt, hidden while the keyboard is up): the "Emoji" / "Shapes" tab chips; on the Emoji tab a hairline divider and then the seven **pack chips** (compact, in a sideways scroll that takes the rest of the row's width).
- **Emoji tab body:** the search field (52 pt), then the grid at the explicit height `bodyHeight − 52` — unchanged. The grid is a `FlatList` with 8 columns and 36-pt cells: it mounts 9 rows first and virtualises the rest (the More pack has 1 125 emoji). No `flex: 1` for height anywhere.
- No search text: the grid shows the selected pack (Faces when the panel opens). With search text: the results from **all** emoji (at most 60, as today) and no pack chip is selected; tapping a pack chip clears the search.
- **Recently used** stays the grid's header in every pack, hidden while searching or while the keyboard is up (round-2 ruling).
- **Shapes tab:** the colour row, then all 20 shapes in the wrapping grid inside the scroll at its explicit height (unchanged structure).

## 9. Shapes (`SHAPES` in `effects.ts` ↔ `Effects.shapePaths`)

The Swift parser (`SVGPath.swift`) supports absolute `M L C Q Z`, numbers separated by spaces or commas, several subpaths; **no arcs**, no relative commands. Both sides fill **non-zero** (react-native-svg's default; `CAShapeLayer`'s default) and neither sets a fill rule. So: circles are four cubic curves; a hole (frame, ring) is an inner subpath wound the **other way** (the outer clockwise, the inner counter-clockwise — identical under non-zero and even-odd); overlapping same-direction subpaths (the award's tails) form a union. Every number is inside 0–100. A test computes each subpath's direction.

| id | Label | Group | Path |
|---|---|---|---|
| `arrowCurved` | Curved | arrow | `M8 92 C8 52 30 30 62 30 L62 12 L96 42 L62 72 L62 54 C44 54 32 68 32 92 Z` |
| `arrowDouble` | Two-way | arrow | `M0 50 L28 18 L28 38 L72 38 L72 18 L100 50 L72 82 L72 62 L28 62 L28 82 Z` |
| `bubbleRound` | Round | bubble | `M50 2 C77.6 2 100 19.9 100 42 C100 64.1 77.6 82 50 82 C46 82 42 81.6 38 80.9 L16 98 L22 75 C8.5 67.5 0 55.5 0 42 C0 19.9 22.4 2 50 2 Z` |
| `bubbleSquare` | Sharp | bubble | `M0 0 L100 0 L100 70 L45 70 L22 96 L26 70 L0 70 Z` |
| `bubbleThought` | Thought | bubble | `M26 66 C11 66 2 56 2 45 C2 35 9 27 19 25 C21 12 33 4 46 6 C54 0 68 0 76 8 C89 8 98 18 98 30 C98 37 95 43 90 47 C91 58 82 66 71 66 Z M24 72 C28.4 72 32 75.6 32 80 C32 84.4 28.4 88 24 88 C19.6 88 16 84.4 16 80 C16 75.6 19.6 72 24 72 Z M9 88 C11.8 88 14 90.2 14 93 C14 95.8 11.8 98 9 98 C6.2 98 4 95.8 4 93 C4 90.2 6.2 88 9 88 Z` |
| `badgeSeal` | Seal | badge | `M50 0 L56.9 6.5 L65.5 2.4 L70 10.8 L79.4 9.5 L81.1 18.9 L90.5 20.6 L89.2 30 L97.6 34.5 L93.5 43.1 L100 50 L93.5 56.9 L97.6 65.5 L89.2 70 L90.5 79.4 L81.1 81.1 L79.4 90.5 L70 89.2 L65.5 97.6 L56.9 93.5 L50 100 L43.1 93.5 L34.5 97.6 L30 89.2 L20.6 90.5 L18.9 81.1 L9.5 79.4 L10.8 70 L2.4 65.5 L6.5 56.9 L0 50 L6.5 43.1 L2.4 34.5 L10.8 30 L9.5 20.6 L18.9 18.9 L20.6 9.5 L30 10.8 L34.5 2.4 L43.1 6.5 Z` |
| `badgeRibbon` | Award | badge | `M50 0 C69.9 0 86 16.1 86 36 C86 55.9 69.9 72 50 72 C30.1 72 14 55.9 14 36 C14 16.1 30.1 0 50 0 Z M24 60 L44 70 L32 100 L26 86 L10 90 Z M76 60 L90 90 L74 86 L68 100 L56 70 Z` |
| `banner` | Banner | badge | `M0 28 L100 28 L88 50 L100 72 L0 72 L12 50 Z` |
| `sparkle` | Sparkle | star | `M50 0 Q56 44 100 50 Q56 56 50 100 Q44 56 0 50 Q44 44 50 0 Z` |
| `burst` | Burst | star | `M50 0 L57.8 21 L75 6.7 L71.2 28.8 L93.3 25 L79 42.2 L100 50 L79 57.8 L93.3 75 L71.2 71.2 L75 93.3 L57.8 79 L50 100 L42.2 79 L25 93.3 L28.8 71.2 L6.7 75 L21 57.8 L0 50 L21 42.2 L6.7 25 L28.8 28.8 L25 6.7 L42.2 21 Z` |
| `frameRounded` | Frame | frame | `M16 0 L84 0 C92.8 0 100 7.2 100 16 L100 84 C100 92.8 92.8 100 84 100 L16 100 C7.2 100 0 92.8 0 84 L0 16 C0 7.2 7.2 0 16 0 Z M18 12 C14.7 12 12 14.7 12 18 L12 82 C12 85.3 14.7 88 18 88 L82 88 C85.3 88 88 85.3 88 82 L88 18 C88 14.7 85.3 12 82 12 Z` |
| `ring` | Ring | frame | `M50 0 C77.6 0 100 22.4 100 50 C100 77.6 77.6 100 50 100 C22.4 100 0 77.6 0 50 C0 22.4 22.4 0 50 0 Z M50 14 C30.1 14 14 30.1 14 50 C14 69.9 30.1 86 50 86 C69.9 86 86 69.9 86 50 C86 30.1 69.9 14 50 14 Z` |
| `brackets` | Corners | frame | `M0 0 L30 0 L30 10 L10 10 L10 30 L0 30 Z M70 0 L100 0 L100 30 L90 30 L90 10 L70 10 Z M100 70 L100 100 L70 100 L70 90 L90 90 L90 70 Z M0 70 L10 70 L10 90 L30 90 L30 100 L0 100 Z` |

Final list of 20, in the tab's order: Circle, Square, Box, Arrow, Star, Bubble, Heart (as today), then Curved, Two-way, Round, Sharp, Thought, Seal, Award, Banner, Sparkle, Burst, Frame, Ring, Corners. A shape sticker keeps its size rule (`STICKER_SHAPE_SCALE`), its one colour, its gestures and its animations.

## 10. Sticker packs (`src/editor/emoji.ts`)

Entries carry no pack, but `keywords[0]` is the Unicode group and `assets/emoji.json` keeps the Unicode order, in which a subgroup is one unbroken run. One pure function, `groupEmoji(list)`, walks the list once:

| Pack | Rule | Size |
|---|---|---|
| **Faces** | group "smileys & emotion", from its start up to (not including) the entry named "love letter" | 131 |
| **Hearts** | the same group, from "love letter" through "kiss mark" | 26 |
| **Hands** | group "people & body", from its start through "flexed biceps" | 44 |
| **Food** | group "food & drink" | 131 |
| **Travel** | group "travel & places" | 219 |
| **Symbols** | the rest of "smileys & emotion" (💯 💥 💬 💤 …, 14) + group "symbols" (224) | 238 |
| **More** | everything else: the rest of "people & body" (344), "animals & nature" (160), "activities" (85), "objects" (266), "flags" (270) | 1 125 |

Total 1 914: every emoji is in exactly one pack. The three anchors are entry **names** (`PACK_ANCHORS`); if the data is regenerated and an anchor disappears, the size test fails rather than a pack silently swallowing its neighbours. `searchEmoji` is unchanged. Recent emoji stay in `src/projects/prefs.ts`, unchanged.

## 11. Testing

- **Model:** the two fields' defaults, limits and clamps; the v14 → v15 proof (§4.3.1); the new shape ids survive the sanity pass.
- **Layout:** the eight vectors on the TS side; the same lines in the Swift table (exact-line parity test); the formula pairs and `boxRadiusFactor`; the draw-parameter proof (§4.3.2).
- **Ops** (no op changes — the existing ones are generic): `setTextStyle` / `setCaptionStyleForAll` clamp, round to two decimals and return the same project when nothing changes; `duplicateOverlay` copies; each of the 24 templates applies whole.
- **Components** (RNTL v14, async): the box in `OverlayText` (padding, radius, under-layer insets, the frame copy, the ≤ 4 cap); the five rows (closed, open, switch-opens, one undo step per drag / tap); the looks row (24 tiles); the Shapes tab (20, a new shape becomes a sticker); the packs (chips, swap, search, recents, keyboard, virtualised More, explicit heights).
- **Shapes:** command subset, 0–100 box, subpath directions, verbatim Swift mirror.
- **Swift:** XCTests for the layout table, the box layer and the holes; Jest source-reading tests for the record fields, the corner line and the absence of a fill rule.
- **Existing tests keep passing.** Pinned values that change: the schema number (14 → 15) in `migrate.test.ts` and the nine `types.*.test.ts` files; `DEFAULT_TEXT_STYLE` (two files); the style key list in `textTemplates.test.ts`; the template id / label lists (12 → 24) and the tile count; `SHAPE_IDS` length (7 → 20); the three whole `layoutOverlay` results and the `ExportTextStyle` record list in `overlayLayout.test.ts`; three whole style objects in `modules/clipy-video/__tests__/index.test.ts`; in the component tests only the places that pressed "Style" or reached the box opacity slider without opening its row. No label, role or test id of an existing control changes except the removed "Style" button.

## 12. Risks

- **The export is unverified** (§6.3) — nothing native has ever been compiled here.
- **Preview ≠ export for the outline** (halo vs stroke), most visible on three new looks.
- **A long looks row:** 24 tiles in a sideways scroll; the last ones are six swipes away.
- **Sections need opening:** a row that is on still starts closed; the chevron is the only hint.
- **More pack is big** (1 125); it is a catch-all, not a curated pack.
- **Hand-written paths** are judged by eye on the phone (the Thought bubble and the Award most of all).
- A project saved by this version cannot be opened by an older build (schema 15) — as with every schema bump.

## 13. Decisions made while writing

1. **Outline, shadow and spacing get no new model fields.** Group F already stores and exports them; duplicating them would break "no existing field changes meaning". The round surfaces them (their own rows) instead.
2. **The box fields live in `style`, the corner is a two-value choice.** The user asked for "rounded or square"; a radius slider was not asked for. A rounded corner keeps today's radius (half the default padding) whatever the padding, so the default is bit-exact.
3. **Schema 15** although only two fields and thirteen ids are added: an older build would drop an unknown shape.
4. **`layoutOverlay` is the "resolved text style"** — it exists and is mirrored; no second function was invented. The proof compares it with a frozen v14 copy.
5. **The Swift layout and the record fields are changed in the same task as the TypeScript layout**, and the Swift shape table in the same task as the TS registry, so a mirrored pair never differs between two commits (the existing parity tests would fail otherwise).
6. **Five closed rows replace "Style"** rather than more controls behind it: the approved controls were there and the user did not find them. Rows start closed even when on, so the panel opens exactly as short as today and existing un-scoped colour queries in tests still find one colour row.
7. **Opacity sits with spacing** ("Spacing and opacity"): the three sliders without a switch share one row.
8. **Captions get every new control**; the new looks are text-only.
9. **Pack chips are in the lead row**, after the tab chips, as compact chips in a sideways scroll: the grid keeps its height and the chips leave with the keyboard like the tabs. A seventh pack, **More**, holds what fits none of the six (it is larger than the six together); folding it into Symbols would have buried Symbols.
10. **Hearts and Hands are cut out of their Unicode groups by position**, anchored on three entry names, not by code-point ranges (emoji code points are scattered) nor by a hand-typed list of 70 characters.
11. **A pack change remounts the grid** (`key`) so it starts at the top; no imperative scroll, no scroll handler.
12. **Thirteen shapes, not fifteen:** every suggested kind is covered; a fourteenth and fifteenth would have been near-duplicates. Holes are counter-wound subpaths, so no fill rule is set on either side.
13. **Shape tiles, colour swatches (28 pt) and the emoji cells (36 pt) keep their sizes** — existing parts, not restyled this round.
14. **Verified, and where:** `SVGPath.swift` (commands, subpaths); `ExportSession.swift` lines 580–700 and 784–831 (text and sticker layers); `react-native/Libraries/Lists/FlatList.js` (with `numColumns`, `initialNumToRender` counts rows); `@expo/vector-icons` 15 glyph map (`chevron-down-outline`, `chevron-up-outline`); the pack sizes and every path's command set, 0–100 range and subpath directions were computed with a throw-away Node script against `assets/emoji.json` (not committed).
