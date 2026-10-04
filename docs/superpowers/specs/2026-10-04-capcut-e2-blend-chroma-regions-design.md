# CapCut group E, round 2 — Blend modes, green screen, blur / mosaic box: design

**Date:** 2026-10-04
**Status:** Approved by the user (round 2 of group E; "continue")
**Builds on:** schema v11 (layers, opacity, masks)

## 1. What the user gets

1. **Blend modes** on layers: Normal, Screen, Multiply, Overlay, Lighten, Darken.
2. **Green screen** on layers and clips: pick a key colour and a strength; that colour becomes see-through.
3. **Blur box / Mosaic box:** a rectangle placed over part of the picture for a stretch of time that blurs or pixelates what is under it.

Preview (Expo Go cannot change pixels): blend modes and green screen are **not shown** — the picture appears untouched with the "Preview" tag; a blur / mosaic box is shown as a frosted rectangle (not real blur) with the tag. Export: Swift, uncompiled.

Out of scope: background removal, an eyedropper on the video, feathered boxes, boxes that follow a moving subject.

## 2. Data model — schema v12

```ts
export const SCHEMA_VERSION = 12 as const;
export const BLEND_IDS = ["normal", "screen", "multiply", "overlay", "lighten", "darken"] as const;
export type BlendId = (typeof BLEND_IDS)[number];
export interface ChromaKey { color: string; strength: number }           // #RRGGBB, 0–1
export const CHROMA = { hueBase: 12, hueRange: 48, soft: 10, minSat: 0.25, minVal: 0.2, defaultStrength: 0.5, cube: 32 } as const;
export const CHROMA_PRESETS = ["#00FF00", "#0000FF"] as const;           // green, blue
// Clip gains:
blend: BlendId;            // default "normal"; layers only — main clips are always "normal"
chroma: ChromaKey | null;  // default null; layers and main clips

export const EFFECT_IDS = [/* the ten existing */ "blurBox", "mosaicBox"] as const;
export interface EffectRect { x: number; y: number; w: number; h: number }   // fractions of the frame, top-left origin
export const REGION_LIMITS = { min: 0.05, default: { x: 0.3, y: 0.4, w: 0.4, h: 0.2 } };
// EffectItem gains:
rect: EffectRect | null;   // non-null exactly for blurBox / mosaicBox
export const isRegionEffect = (t: EffectId) => t === "blurBox" || t === "mosaicBox";
```

Migration v11 → v12 adds the defaults (`blend "normal"`, `chroma null`, `rect null`). Sanity pass: unknown blend → normal; main clips forced to normal; chroma — colour must be `#RRGGBB` (else chroma null), strength clamped; a region effect without a valid rect gets the default rect; a rect on a non-region effect is removed; rect clamped inside the frame with sides ≥ `min`.

## 3. Green-screen maths — `src/editor/model/chroma.ts` ↔ `modules/clipy-video/ios/Chroma.swift`

`chromaAlpha(r, g, b, key, strength)` → 0…1 (r, g, b in 0…1):

- Convert the pixel and the key colour to HSV (hue in degrees).
- `tol = CHROMA.hueBase + CHROMA.hueRange × strength` (degrees); `d` = the shortest hue distance to the key's hue (0…180).
- If the pixel's saturation < `minSat` or value < `minVal` → alpha 1 (greys, whites and darks are never keyed).
- Else alpha = `clamp((d − tol) / CHROMA.soft, 0, 1)` — fully see-through within the tolerance, a `soft`-degree ramp outside it.
- A grey key colour (saturation < `minSat`) keys nothing (alpha 1 everywhere).

The export builds a `CHROMA.cube`³ colour cube from this function (premultiplied RGBA) and applies it to the picture before the mask; the preview does nothing. Shared vectors + parity test.

## 4. Behaviour

- **Order on a layer's picture (export):** crop → filter / adjust → green screen → mask → opacity → blended onto the frame below with its blend mode (Normal = source-over). On a main clip: green screen reveals the clip's own background.
- **Region effects** are timeline effects (they live on the effects lane, use the existing selection, strength, duplicate, delete, move and trim) and apply to the whole composed frame at their time, in list order with the other effects. Strength: blur radius = `0.06 × strength × shorter side`; mosaic block = `max(4 px, 0.08 × strength × shorter side)`.
- **Placing a box:** with a region effect selected and the playhead inside it, the preview shows its rectangle with a gold outline; drag moves it, pinch resizes it (width and height together, keeping the aspect), and two corner handles (top-left, bottom-right) resize freely. One undo step per gesture.
- The Preview tag shows when a layer at the playhead has a blend mode other than Normal, when any clip / layer at the playhead has a green screen, or when a region effect covers the playhead.

## 5. Screens

- **Edit tools** gain `Blend` (enabled only for a selected layer) and `Green screen` (enabled for a selected clip or layer).
- **Blend sheet:** six tiles; one undo step per pick; a note "Shows in the exported video".
- **Green screen sheet:** a switch (on → the first preset at the default strength), a colour row (Green, Blue, then the palette), a Strength slider, and the same note.
- **Effects sheet:** two more tiles — Blur box and Mosaic box — added at the playhead like the other effects, with the default rectangle.

## 6. Export

`ExportClip` gains `blend` and `chroma` (`{ color, strength } | null`); `ExportEffect` gains `rect` (`{ x, y, w, h } | null`). Swift: `Chroma.swift` (the mirrored function + cube builder, cached per colour / strength), blend filters `CIScreenBlendMode`, `CIMultiplyBlendMode`, `CIOverlayBlendMode`, `CILightenBlendMode`, `CIDarkenBlendMode` for overlay compositing (the opacity fade then mixes between the frame below and the blended result), and two new `EffectRenderer` cases (`CIGaussianBlur` on the clamped crop; `CIPixellate` with `inputScale` and a centre aligned to the box) composited back over the frame inside the rectangle (top-left fractions converted to Core Image's bottom-left space once). Defaults take today's path.

## 7. Testing

Model: migration, sanity pass, ops. `chroma.ts`: hand-computed vectors (pure green keyed, near-green on the ramp, skin tone kept, grey kept, blue key, grey key) + Swift parity. Components: sheets, tool enable rules, the region box rendering and gestures, tag conditions. Swift by reading + XCTests for the pure parts.

## 8. Risks

- Nothing in this round can be judged in Expo Go beyond the box's position; the tag is the user's signal.
- Colour-cube keying is hue-based and will not handle spill or uneven lighting well; strength is the only control.
