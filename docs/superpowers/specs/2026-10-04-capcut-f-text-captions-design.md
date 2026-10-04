# CapCut group F — Text and captions: design

**Date:** 2026-10-04
**Status:** Implemented 2026-10-04 (Swift export unverified until an EAS build exists; on-device checklist pending)
**Roadmap:** `docs/superpowers/research/capcut-roadmap.md`, group F
**Builds on:** schema v8

## 1. What the user gets

1. **More text styling** — opacity, letter spacing, line spacing, outline colour and thickness, shadow, glow.
2. **Eight more fonts** (16 in total).
3. **Text templates** — twelve one-tap styles.
4. **Caption presets** — six looks for auto captions, and **word-by-word highlight**.

Out of scope: curved text, translated captions, sticker / GIF library.

Preview: text styling, fonts and templates are shown with stacked text layers and are close to exact (the outline was already drawn as a soft halo in the preview and a hard stroke in the export; that stays). Captions can only be generated in a native build, so caption presets and the highlight are shown on a built-in sample inside the Caption style sheet. Export: Swift, uncompiled.

## 2. Data model — schema v9

```ts
export const SCHEMA_VERSION = 9 as const;
export const FONT_IDS = ["bangers", "anton", "oswald", "montserrat", "pacifico", "permanentMarker", "lobster", "roboto",
  "bebasNeue", "poppins", "playfair", "fredoka", "caveat", "pressStart", "righteous", "dancingScript"] as const;

export interface TextShadow { color: string; opacity: number; distance: number; blur: number }   // distance, blur: fractions of the font size
export interface TextGlow { color: string; size: number }                                         // size: fraction of the font size
export interface TextStyle {
  opacity: number;              // 0–1, default 1
  letterSpacing: number;        // −0.05…0.3 of the font size, default 0
  lineSpacing: number;          // 0.8…2 × the normal line height, default 1
  outlineColor: string | null;  // null = automatic contrast colour (today's behaviour)
  outlineWidth: number;         // 0.5…3 × today's outline width, default 1
  shadow: TextShadow | null;    // default null
  glow: TextGlow | null;        // default null
}
export const DEFAULT_TEXT_STYLE: TextStyle;
export const TEXT_STYLE_LIMITS = { opacity: [0, 1], letterSpacing: [-0.05, 0.3], lineSpacing: [0.8, 2], outlineWidth: [0.5, 3],
  shadowOpacity: [0, 1], shadowDistance: [0, 0.3], shadowBlur: [0, 0.5], glowSize: [0.05, 0.6] } as const;
export const DEFAULT_SHADOW: TextShadow;   // { color: "#000000", opacity: 0.6, distance: 0.06, blur: 0.1 }
export const DEFAULT_GLOW: TextGlow;       // { color: "#FFFFFF", size: 0.25 }

export interface CaptionWord { text: string; start: number; end: number }   // seconds from the caption's start
// TextOverlay gains:
style: TextStyle;
words: CaptionWord[];            // captions only; [] for plain text
highlightColor: string | null;   // captions only; null = no word highlight
```

`outline: boolean` stays (on / off); `style.outlineColor` / `outlineWidth` refine it. Migration v8 → v9 adds the defaults. Sanity pass: every style number clamped (non-finite → default); colours must be `#RRGGBB` (else the default / null); unknown font id → `montserrat` (existing rule); `words` — non-finite or empty entries dropped, sorted by start, kept only on captions and only when the words joined with single spaces equal the caption's text (otherwise `[]`); `highlightColor` kept only on captions.

## 3. Layout numbers — `overlayLayout.ts` ↔ `OverlayLayout.swift`

`layoutOverlay` gains pixel values derived from the style (the mirrored pair stays the single place that turns overlay numbers into pixels):

- `letterSpacingPx = style.letterSpacing × fontSize`
- `lineHeight = (today's line height) × style.lineSpacing`
- `outlineWidth = (today's outline width) × style.outlineWidth`; `outlineColor = style.outlineColor ?? contrast colour`
- shadow: `dx = dy = shadow.distance × fontSize × 0.7071` (down-right), `blurPx = shadow.blur × fontSize`, colour, opacity
- glow: `radiusPx = glow.size × fontSize`, colour
- `opacity = style.opacity`

Defaults give exactly today's numbers.

## 4. Rendering

- **Preview** (`OverlayText`): React Native allows one text shadow per `Text`, so the text is drawn as stacked identical `Text` layers inside the same box, bottom to top: glow (halo of `radiusPx` in the glow colour), shadow (offset + blur, colour with opacity), outline (halo in the outline colour, as today), fill. A layer exists only when its feature is on; a plain text renders exactly one `Text` as today. Letter spacing and line height are applied to every layer; `style.opacity` multiplies the wrapper's opacity (together with the animation opacity from group C).
- **Word highlight (preview)**: a caption with `words` and a `highlightColor` renders its fill layer as nested `Text` spans; the word whose `[start, end)` contains the playhead's time inside the caption gets the highlight colour.
- **Export**: kerning (`kCTKernAttributeName`), line height, stroke colour / width on the attributed string; shadow and glow as additional text layers behind the fill using the layer shadow (`shadowColor`, `shadowOpacity`, `shadowRadius`, `shadowOffset`), glow = a shadow with zero offset; opacity multiplied into the visibility / motion opacity. Word highlight: for each word, one extra copy of the caption's text layer (no background, no shadow) with that word in the highlight colour, visible only during the word's time; the base caption stays visible underneath for the whole caption.

## 5. Fonts

Eight open-licence Google fonts added as bundled files in `assets/fonts` (and to `app.json`'s `expo-font` list and `fontAssets`): Bebas Neue, Poppins SemiBold, Playfair Display, Fredoka, Caveat, Press Start 2P, Righteous, Dancing Script. `FONTS[id]` carries the label, the family key used by `useFonts`, the PostScript name read from the font file, and the file name.

## 6. Templates and presets (`src/editor/textTemplates.ts`)

- `TEXT_TEMPLATES` — twelve entries `{ id, label, patch }`, where `patch` sets font, colour, background, outline, `style` and optionally an In / Loop animation: Clean title, Bold pop, Neon, Subtitle bar, Comic, Retro, Handwritten, Elegant, Shadowed, Outline only, Sticker label, Soft glow. Applying one to the selected text is one undo step and keeps the text, position, size, rotation and timing.
- `CAPTION_PRESETS` — six entries `{ id, label, patch }` for caption style fields (font, size, colour, background, outline, `style`, `highlightColor`): Classic bar, Bold outline, Yellow pop, Clean white, Neon glow, Karaoke (white text, yellow highlight). Applied to every caption with the existing "style for all captions" op.

## 7. Screens

- **Text panel**: a "Templates" strip at the top (twelve tiles showing "Aa" in the template's look); below the existing controls a "Style" section — Opacity, Letter spacing, Line spacing sliders; Outline: colour row (Auto + palette) and Thickness slider (shown when Outline is on); Shadow switch with colour, Opacity, Distance, Blur; Glow switch with colour and Size. One undo step per slider drag / switch / colour.
- **Font strip**: sixteen fonts.
- **Caption style sheet**: a preset strip at the top; a sample caption ("This is how captions look") rendered with the current style, its second word highlighted when highlight is on; a "Highlight spoken word" switch + colour row; the existing controls plus the same Style section.
- Captions keep their words when restyled; editing a caption's text clears its words (that caption shows no highlight).

**As built:**
- A template replaces the whole look, entrance and loop animation included: they become the template's, or none when it defines none. The exit animation and the keyframes are left alone.
- The caption sheet has an Outline switch.
- With no captions, the sheet shows "Preview only — captions need the full app build": its controls restyle a local draft (the sample reacts) and write nothing to the project, so no undo step. The sheet can be opened from the Expo Go fallback card too.
- Re-running the captions keeps the look of the captions they replace (style and highlight included).
- A clip look (group A) that restyles texts / captions puts their outline colour back to automatic.
- Style numbers are stored with two decimals.
- Trimming a caption's start shifts its word highlight.
- Permanent Marker is Apache-2.0 (the other fonts are OFL).

## 8. Captions pipeline

`mergeSegmentsIntoLines` keeps each line's segments; `linesToCaptions` stores them as `words` (times relative to the line's start, clamped inside the caption). The transcriber already returns one segment per word.

## 9. Export request

`ExportOverlay` gains `style` (the seven fields, shadow / glow flattened with nulls), `words`, `highlightColor`. Stickers send defaults.

## 10. Testing

Model: migration, clamps, words validation, ops. Layout: unit tests with hand-computed numbers and the existing TS ↔ Swift parity test extended. Components: layer stack for each feature, spans and highlighted word at a playhead, panel controls, presets, templates. Swift: by reading + XCTests for layout numbers and the word-layer timing list.

## 11. Risks

- Stacked text layers must wrap identically; every layer uses the same font, size, spacing and width.
- Font PostScript names must match the files exactly or the export falls back to Helvetica — read them from the files, test them.
- More uncompiled Swift; the word-highlight layers reuse the existing visibility animation.
