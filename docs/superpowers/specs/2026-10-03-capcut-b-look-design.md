# CapCut group B — Look: design

**Date:** 2026-10-03
**Status:** Approved by the user ("yes", all four parts in one build)
**Roadmap:** `docs/superpowers/research/capcut-roadmap.md`, group B
**Builds on:** group A (`2026-10-03-capcut-a-clip-basics-design.md`, schema v5)

## 1. What the user gets

1. **Filter strength** — a 0–100 slider on every filter, and 12 new filters (20 with "None").
2. **Adjust** — a new tool with twelve sliders, Reset and "Apply to all".
3. **Effects** — ten hand-built effects placed on the timeline for a stretch of time, like a sticker.
4. **More transitions** — six new ones on top of the current four.

Out of scope: curves, HSL, colour wheels, LUT import, beauty / body effects, per-effect custom parameters beyond one "strength" slider.

## 2. The preview limit (binding)

Expo Go cannot change a video's pixels. The preview therefore approximates with coloured layers and view transforms and shows the existing **Preview** tag whenever the frame is not exact. The export (Swift, Core Image) is the real result and stays uncompiled until an EAS build exists.

| Feature | Preview |
|---|---|
| Filter strength | approximate (existing tint layers scaled by strength) |
| Brightness, exposure, temperature, tint, fade, vignette, negative saturation | approximate layers |
| Contrast, positive saturation, highlights, shadows, sharpen, grain | not shown (tag only) |
| Effects: shake, zoom pulse, flash, light leak, VHS, old film, glow | approximate (transform / coloured layers) |
| Effects: glitch, blur, RGB split | not shown (tag only) |
| Transitions | the existing black dip at the cut for every type (tag) |

## 3. Data model — schema v6

```ts
export const SCHEMA_VERSION = 6 as const;

export const FILTER_IDS = ["none", "warm", "cool", "vivid", "faded", "mono", "noir", "vintage",
  "sunset", "golden", "teal", "pastel", "film", "chrome", "instant", "process", "tonal", "sepia", "crisp", "dream"] as const;
export const TRANSITION_TYPES = ["none", "fade", "dissolve", "slide", "zoom",
  "slideRight", "slideUp", "slideDown", "wipe", "spin", "blur"] as const;   // "slide" keeps its id and is labelled "Slide left"

export const ADJUST_KEYS = ["brightness", "contrast", "saturation", "exposure", "temperature", "tint",
  "highlights", "shadows", "sharpen", "vignette", "fade", "grain"] as const;
export type AdjustKey = (typeof ADJUST_KEYS)[number];
export type ClipAdjust = Record<AdjustKey, number>;
/** Two-sided keys run −1…1, one-sided keys 0…1; 0 always means "no change". */
export const ADJUST_RANGE: Record<AdjustKey, readonly [number, number]> = {
  brightness: [-1, 1], contrast: [-1, 1], saturation: [-1, 1], exposure: [-1, 1], temperature: [-1, 1], tint: [-1, 1],
  highlights: [-1, 1], shadows: [-1, 1], sharpen: [0, 1], vignette: [0, 1], fade: [0, 1], grain: [0, 1],
};
export const DEFAULT_ADJUST: ClipAdjust;   // every key 0

export const EFFECT_IDS = ["glitch", "shake", "zoomPulse", "blur", "vhs", "lightLeak", "flash", "rgbSplit", "oldFilm", "glow"] as const;
export type EffectId = (typeof EFFECT_IDS)[number];
export interface EffectItem { id: string; type: EffectId; start: number; end: number; intensity: number }   // project time, seconds; intensity 0…1
export const EFFECT_LIMITS = { minDuration: 0.2, defaultDuration: 2, defaultIntensity: 0.7 };

// Clip gains:
filterIntensity: number;   // 0…1, default 1
adjust: ClipAdjust;        // default all 0
// Project gains:
effects: EffectItem[];     // default []
```

Migration v5 → v6 adds the defaults. The sanity pass (every load): unknown filter id → `null`; unknown transition type → `dissolve` (duration kept); `filterIntensity` clamped 0–1 (non-finite → 1); each adjust key clamped to its range (non-finite / missing → 0, unknown keys dropped); effects with an unknown type dropped, `intensity` clamped, `start ≥ 0`, `end − start ≥ minDuration`. Idempotent. Older files (v1–v5) still load; newer are refused.

Effects are project-time ranges, like overlays: clip edits do not move them. Several effects may overlap; they apply in list order.

## 4. Shared maths (TS ↔ Swift mirrors)

Two new pure modules, each with a Swift twin and a Jest parity test (same pattern as `clipLayout.ts`):

### 4.1 `src/editor/model/adjust.ts` ↔ `Adjust.swift`

Constants that turn a slider value `v` into Core Image parameters (export) — one table, mirrored:

| Key | Core Image | Parameter |
|---|---|---|
| brightness | `CIColorControls` | `inputBrightness = 0.25·v` |
| contrast | `CIColorControls` | `inputContrast = 1 + 0.5·v` |
| saturation | `CIColorControls` | `inputSaturation = 1 + v` |
| exposure | `CIExposureAdjust` | `inputEV = 1.5·v` |
| temperature | `CITemperatureAndTint` | `inputTargetNeutral.x = 6500 − 2500·v` (v > 0 = warmer) |
| tint | `CITemperatureAndTint` | `inputTargetNeutral.y = 100·v` |
| highlights, shadows, fade | `CIToneCurve` | points `(0, 0.25·fade)`, `(0.25, 0.25 + 0.15·shadows)`, `(0.5, 0.5)`, `(0.75, 0.75 + 0.15·highlights)`, `(1, 1)` |
| sharpen | `CISharpenLuminance` | `inputSharpness = 1.2·v` |
| vignette | `CIVignette` | `inputIntensity = 1.5·v`, `inputRadius = 1.5` |
| grain | random noise, monochrome, blended | opacity `0.25·v` |

Order: exposure → temperature/tint → colour controls → tone curve → sharpen → vignette → grain. A step whose values are all neutral is skipped; `isNeutral(adjust)` skips the whole chain (so an untouched clip renders exactly as before).

Preview mapping `adjustPreview(adjust) → layers`: brightness + exposure → white / black layer, opacity `min(0.5, |0.25·brightness + 0.3·exposure|)`; temperature → orange `#FF9A3C` / blue `#3C8CFF`, opacity `0.25·|v|`; tint → magenta `#FF4FD8` / green `#4FFF7A`, opacity `0.18·|v|`; negative saturation → grey `#808080`, opacity `0.55·|v|`; fade → grey `#9A9A9A`, opacity `0.25·v`; vignette → a dark edge frame, opacity `0.6·v`. `adjustNeedsTag(adjust)` is true when anything is non-zero.

### 4.2 `src/editor/model/effectMath.ts` ↔ `EffectMath.swift`

Deterministic functions of `t` = seconds since the effect's start, `d` = its duration, `k` = intensity (so preview and export move the same way; no randomness — pseudo-random values come from `hash(n) = frac(sin(n·12.9898)·43758.5453)`):

- `envelope(t, d)`: 0→1 over the first 0.15 s, 1→0 over the last 0.15 s (shorter effects: each ramp is at most `d/2`).
- **shake**: offset as a fraction of the frame: `x = 0.03·k·env·sin(2π·9t)`, `y = 0.03·k·env·sin(2π·11t + 1.3)`; the picture is scaled by `1 + 0.06·k` so no edge shows.
- **zoomPulse**: scale `1 + 0.12·k·env·(0.5 − 0.5·cos(2π·2t))`.
- **flash**: white layer, opacity `k·max(0, 1 − 4·frac(2t))` (two flashes a second, each decaying over a quarter of its period).
- **lightLeak**: warm layer `#FFB347`, opacity `0.35·k·env·(0.6 + 0.4·sin(2π·0.5t))`.
- **vhs**: tint `#7A5CFF` at `0.12·k·env`, plus (export only) a horizontal RGB offset of `0.004·k` of the width and scan lines.
- **oldFilm**: sepia tint `#C8A05A` at `0.3·k·env`, flicker = black layer at `0.12·k·hash(floor(12t))`; export adds sepia + vignette + grain.
- **glow**: white layer at `0.12·k·env`; export = `CIBloom` (radius `0.02·k` of the shorter side, intensity `0.8·k·env`).
- **blur**: export Gaussian blur, radius `0.03·k·env` of the shorter side (clamped edges). Preview: none.
- **glitch**: export — every `1/8` s slice, with probability `0.5·k` (from `hash`), shift a horizontal band (height `0.08–0.2` of the frame, position from `hash`) by up to `0.08·k` of the width and split R/B by `0.01·k`. Preview: none.
- **rgbSplit**: export — R and B channels offset by `±0.008·k·env` of the width. Preview: none.

`effectPreview(type, t, d, k) → { translateX, translateY, scale, layers: {color, opacity}[], exact: false }` for the preview; `EffectMath.swift` exposes the same scalar functions for the compositor.

## 5. Filters and transitions

- **New filters** (export recipe; preview tint params in `effects.ts`): sunset (temperature 7600 + saturation 1.2), golden (temperature 7200 + brightness 0.04), teal (temperature 5600 + saturation 1.1 + contrast 1.05), pastel (saturation 0.8, brightness 0.06, contrast 0.9), film (`CIPhotoEffectTransfer`), chrome (`CIPhotoEffectChrome`), instant (`CIPhotoEffectInstant`), process (`CIPhotoEffectProcess`), tonal (`CIPhotoEffectTonal`), sepia (`CISepiaTone` 1.0), crisp (`CISharpenLuminance` 0.8 + contrast 1.1), dream (`CIBloom` radius 10, intensity 0.6 + saturation 1.1).
- **Strength**: export = mix of the unfiltered and the filtered frame, `result = original·(1 − s) + filtered·s` (`CIDissolveTransition`, time = s); `s = 1` skips the mix. Preview = the existing layers with their opacities multiplied by `s`.
- **Order on a clip frame**: placement + background → filter (with strength) → adjust. Transitions blend the two finished clip frames. Effects apply to the finished frame after the transition blend (so they cover whichever clips are on screen), before text and stickers.
- **New transitions** (export): `slideRight` / `slideUp` / `slideDown` (as `slide`, other directions), `wipe` (incoming revealed left→right behind a hard edge, no movement), `spin` (outgoing rotates 0→90° and scales to 0.6 while dissolving), `blur` (outgoing blurs up over the first half, incoming blurs down over the second, cross-dissolved). Unknown type → dissolve, as today.

## 6. Screens

- **Filter sheet**: 20 tiles (horizontal scroll, as now) + a "Strength" slider (0–100, disabled for None) under them; one undo step per slide; "Apply to all clips" copies filter and strength.
- **Adjust sheet** (Effects group, new tool `adjust`, needs a selected clip): a row of twelve chips (icon + name, a dot when non-zero); one slider for the chosen key (two-sided keys centred at 0, shows −100…100 / 0…100); `Reset` (all keys → 0) and action "Apply to all". One undo step per slide and per button.
- **Effects** (Effects group, new tool `effect`, no selection needed): a sheet with ten tiles; tapping one adds the effect at the playhead (`defaultDuration`, clamped to the project's end; refused with a toast when the project is empty) and selects it. A third timeline lane ("effects lane") shows effect pills; a pill can be moved (long-press drag) and trimmed by its two handles, exactly like text pills. With an effect selected the sub-row shows `Strength` (slider sheet), `Duplicate`, `Delete`.
- **Transition sheet**: eleven chips (no other change).
- **Preview tag** additionally shows when: `filterIntensity`/filter present (as now), any adjust value is non-zero, or an effect covers the playhead.
- Toolbar Effects group: `filter · adjust · effect · speed · transition · templates · background`.

Selection: the store gains `selectedEffectId`; selecting an effect clears clip / overlay selection and vice versa; `groupForSelection` sends an effect selection to the Effects group.

## 7. Export

`ExportClip` gains `filterIntensity` and `adjust` (twelve numbers). `ExportRequest` gains `effects: { type, start, end, intensity }[]`. Swift: `Adjust.swift` (chain builder from the mirrored constants), new filter chains and transition blends, `EffectMath.swift` + effect rendering in `ClipyCompositor` (each instruction carries the effects overlapping its time range; the compositor evaluates them at the frame's composition time). A request without the new fields decodes to the defaults and renders exactly as before.

## 8. Testing

- Model: migration and sanity pass; ops (clamping, identity returns, undo steps); effect range rules.
- `adjust.ts` / `effectMath.ts`: unit tests on the formulas with hand-computed values; shared vectors; Jest parity tests that read the Swift twins (constants, ids, vector numbers).
- Components: sheets, lane, pills, toolbar rules, preview layers, tag conditions (RNTL).
- Swift: XCTests for `Adjust` chain building and `EffectMath` (uncompiled; verified by reading).
- Existing behaviour: a project with no new values renders the same preview tree and the same export request shape plus defaults.

## 9. Risks

- The Swift grows again without ever being compiled — every Core Image filter name and key is checked by reading Apple's documented names; unknown filters are skipped at runtime (existing `Effects.apply` behaviour), so a wrong name degrades to "no change" instead of a crash.
- The preview is a rough guide; the Preview tag is the user's signal.
- A third timeline lane changes the timeline's height only — no scroll geometry (`timelineScroll.ts` untouched).
