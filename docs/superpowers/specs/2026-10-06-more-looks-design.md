# More transitions, filters and effects: design

**Date:** 2026-10-06
**Status:** Implemented 2026-10-06 (Swift export unverified until an EAS build exists; on-device confirmation by the user pending)
**Builds on:** CapCut group B (`docs/superpowers/specs/2026-10-03-capcut-b-look-design.md`: filter strength, Adjust, timeline effects, eleven transitions, the "Preview" tag), group E2 (`2026-10-04-capcut-e2-blend-chroma-regions-design.md`: the two box effects), the strips (`2026-10-05-editing-ui-r1-toolbar-strips-design.md`) and the text-looks round (`2026-10-06-text-looks-stickers-design.md`, schema v15). Schema v15 → **v16**. No new package, no new asset.

## 1. What the user gets

| | Today | Added | After |
|---|---|---|---|
| Transitions | 11 | 10 | **21** |
| Filters | 20 (19 + None) | 12 | **32** |
| Effects | 12 | 8 | **20** |

They appear **in the same three pickers with the same controls**: a duration slider for transitions, a Strength slider for filters and for effects. Existing items stay first, in their order; the new ones follow.

**Promises.**
1. **Nothing in an existing project changes.** The 20 filters, 12 effects and 11 transitions that exist keep their ids, labels, recipes, maths and order of application; a project opened after the update previews and exports exactly as before (§3.3 is how that is proved).
2. **The preview in Expo Go is approximate for several new items.** The "Preview" tag shows for every one of them (it already shows for any filter, any effect and any transition). Three items cannot be previewed at all: they show the tag and the picture as it is (§5–§7 say which).
3. **The export is written but cannot be verified until the first native build.** This round adds the most new Core Image code since the look round; every new call is nil-guarded so a wrong name degrades to "no change" (§8, §11).

**Substitutions.** The user chose "add all of them", with the rule that a look which already exists is not added twice. Ten of the thirty approved names were already in the app; each was replaced by the nearest genuinely new look (§4). The counts are as approved: 10 + 12 + 8.

Out of scope: AI effects, LUT file import, per-effect parameters beyond Strength, new packages, bundled image or video assets, any change to an existing look, the Adjust tool, the timeline, the preview player's logic, publish.

## 2. Where things stand today (read 2026-10-06)

- **Registries.** `FILTER_IDS` (20), `TRANSITION_TYPES` (11), `EFFECT_IDS` (12) in `src/editor/model/types.ts`; labels (and effect icons, filter preview recipes) in `src/editor/effects.ts`; the same three id lists in `modules/clipy-video/ios/Effects.swift` (`effects.test.ts` compares them).
- **Filters.** The export recipe of each of the 19 is a Core Image chain written **only** in Swift (`Effects.filterChain`, applied by `Effects.apply`, which sets keys **without** checking them). The TypeScript side holds a preview recipe only (`FILTERS[id].preview`: one tint colour and opacity, a saturation, a brightness), drawn by `FilterLayer` as three flat views. Strength is a dissolve between the unfiltered and the filtered frame (`ClipyCompositor.look`).
- **Adjust.** `adjust.ts` ↔ `Adjust.swift` turn twelve slider values into steps (exposure → temperature / tint → colour controls → tone curve → sharpen → vignette → grain) through `Adjust.filtered`, which **does** check every key. `adjust.parity.test.ts` pins the Swift source of `Adjust.steps` and `Adjust.apply` closely (step kinds, order, constants).
- **Effects.** `effectMath.ts` ↔ `EffectMath.swift`: constants (`EFFECT`), colours (`EFFECT_COLORS`), time functions with shared vectors. The preview reads `effectPreview` → a transform for the picture (`useEffectTransform`) and flat colour layers (`EffectOverlays`); both follow the store's playhead (one React render per playhead tick — no Reanimated). The export is `EffectRenderer.apply`, one `case` per id (`effectMath.parity.test.ts` requires exactly one per id).
- **Transitions.** There is **no TypeScript maths**: `ClipyCompositor.blend` (Swift only) has one `case` per type. The preview shows **one** picture — the clip under the playhead: the outgoing clip up to the cut, the incoming clip from the cut on — and `TransitionLayer` draws a black dip over it for every type (`opacity = 1 − |2p − 1|`). The two clips are never on screen together and cannot be without a second video view, which is player logic and stays untouched.
- **The tag.** `needsPreviewTag` is already true for a filter with strength above 0, for any active effect and inside any transition window. **No rule changes** this round; a truth-table test is added.
- **Pickers.** `FilterSheet` (52-pt thumbnail tiles + Strength), `EffectSheet` (kit `ToolButton` tiles; a tap adds the effect), `TransitionSheet` (kit `Chip`s + duration). None of the three reveals the selected item on opening. `contentOffset` (what `StripTiles`' `initialX` sets) is applied by React Native on **every** change and is **not** clamped to the row's end (read in `RCTScrollViewComponentView.mm`).
- **Thumbnails.** `FilterSheet` asks for **one** frame (`getThumb`, cached per file and half second) and every tile shows that same image under its own `FilterLayer`. A tile is one `Image` and three flat views.
- **Loading.** `migrateProject` refuses a file whose `schemaVersion` is above the app's. Below that, an unknown filter becomes none, an unknown transition becomes a dissolve, an unknown effect is dropped — silently, and the next autosave writes the loss.

## 3. Data model — schema v16

```ts
export const SCHEMA_VERSION = 16 as const;
export const FILTER_IDS = [/* the 20 of v15, in their order */
  "kodak", "fuji", "matte", "bleach", "dusk", "moody", "tealOrange", "blush", "grit", "silver", "indigo", "drama"] as const;
export const TRANSITION_TYPES = [/* the 11 of v15 */
  "cover", "reveal", "coverUp", "revealDown", "circleOpen", "circleClose", "wipeDiagonal", "wipeClock", "pixelate", "flashWhite"] as const;
export const EFFECT_IDS = [/* the 12 of v15 */
  "filmBurn", "lensFlare", "dust", "heartbeat", "hueShift", "mirror", "softEdges", "strobe"] as const;
```

### 3.1 The schema decision

- **No stored shape changes.** `Clip.filter`, `Clip.filterIntensity`, `Clip.transitionOut` and `EffectItem` are as they are; only the lists of allowed ids grow. No limit changes (`TRANSITION_LIMITS`, `EFFECT_LIMITS`).
- **The number goes to 16 anyway**, for one reason: a build that does not know the new ids (the app as it is on `main` today, or this branch before a task has landed) would open a project that uses them and **silently** repair them away — filter → none, transition → dissolve, effect dropped — and autosave would keep the damage. With 16 that build refuses the file with "This project was made with a newer version of Clipy". The text-looks round bumped for thirteen shape ids for the same reason (its decision 3).
- **Migration v15 → v16** is the existing sanity pass and adds **nothing**: every stored value is kept as it is; only `schemaVersion` changes. Proof test: a v15 project that uses every existing filter, transition and effect migrates to itself with the number changed, is not mutated, and a second pass changes nothing.
- The sanity pass keeps its rules (unknown filter → null, unknown transition → dissolve with its duration, unknown effect dropped); the thirty new ids are now known.

### 3.2 Ids, labels, order

Existing order never changes (tests and muscle memory pin it). New items are appended, grouped: transitions — moving, shaped, mixing; filters — colour film, moods, black-and-white; effects — light, film, rhythm, colour, shape. The two box effects (Blur box, Mosaic box) therefore sit between the old and the new effects in the strip.

### 3.3 The proof that nothing existing changes

A new test file, `src/editor/__tests__/looks.frozen.test.ts`, written **first** and green on the untouched tree, then never edited:

1. **Registries as literals:** the first 20 / 11 / 12 ids, their labels, the effect icons, the 20 filter preview recipes, the 28 `EFFECT` constants (as the leading keys, in order) and the 6 `EFFECT_COLORS`.
2. **Maths as literals:** `effectPreview` for each of the 12 old effects at one fixed time.
3. **Swift source by checksum** (SHA-256 of the text, line endings normalised): `Effects.filterChain` + `Effects.apply`; the filter block of `ClipyCompositor.look`; `ClipyCompositor.blend` from its start through the Spin branch, and from the Blur branch to the end of the file; `EffectRenderer.apply` from its start through the Mosaic box branch, and its helpers; the functions of `EffectMath.swift`.
4. **Files nobody edits:** `adjust.ts`, `Adjust.swift`, `FilterLayer.tsx`, `AdjustLayer.tsx` — whole-file checksums.

New Swift is therefore **inserted**, never interleaved: new `blend` cases go between the Spin and the Blur branch, new effect cases after the Mosaic box branch, new helpers after the last existing one or in new files.

## 3a. As built

Branch `more-looks`, one commit per task (plan: `docs/superpowers/plans/2026-10-06-more-looks.md`). Ten of the thirty originally offered items already existed, so the approved final list is: transitions Cover left, Reveal left, Cover up, Reveal down, Circle open, Circle close, Diagonal wipe, Clock wipe, Pixelate, White flash; filters Kodak, Fuji, Matte, Bleach, Dusk, Moody, Cinema (id `tealOrange`), Blush, Grit, Silver, Indigo, Drama; effects Film burn, Lens flare, Dust, Heartbeat, Hue shift, Mirror, Soft edges, Strobe. The picker totals are 32 filters with None, 20 effects and 21 transitions with None. No new package and no new asset.

| Task | Commit | What |
|---|---|---|
| 1 | `79461bd` | Schema 16 (the migration adds nothing, so an older build refuses the file instead of silently dropping new ids), ids, labels, icons, Swift id lists with pass-through cases, `looks.frozen.test.ts` |
| 2 | `518ec5c` | Twelve filters as rows in `filterRecipes.ts` ↔ `FilterRecipes.swift` over the unchanged Adjust pipeline, plus one new primitive (split tone); preview computed from the row |
| 4 | `e950372` | Transition geometry as a new mirrored pair `transitionMath.ts` ↔ `TransitionMath.swift`; preview curtains |
| 3 | `a124279` | Effect maths for the eight (`effectMath.ts` ↔ `EffectMath.swift`, appended), preview scale, layer and shapes |
| 7 | `d51a832` | 32 filters, 20 effects, 21 transitions in the pickers; the Filter and Transition rows open at the selected item (offset computed once per opening) |
| 6 | `ab6360d` | `TransitionLayer` curtains for six transitions plus the diagonal; a white dip for the flash; the Preview tag's truth table |
| 5 | `d905ce6` | `EffectLayer` shapes for Film burn, Lens flare, Soft edges and Dust; Heartbeat and Strobe through the existing paths |
| 9 | `a9b6be1` | Swift blends for the ten transitions (`TransitionMasks.swift`, uncompiled) |
| 8 | `f781ce9` | Swift renderers for the eight effects (uncompiled) |
| 10 | this commit | Docs, README first-build list, device checklist |

(The commit order on the branch is 1, 2, 4, 3, 7, 6, 5, 9, 8 because the tasks ran in parallel.)

### What the preview shows

- **As in the export:** Heartbeat, Strobe, White flash.
- **Roughly:** the twelve filters (a tint and a saturation computed from the row), Film burn, Lens flare, Soft edges, Dust, and Cover left / Reveal left / Cover up / Reveal down / Circle open / Circle close / Diagonal wipe as a moving black edge. The preview never shows two clips, so the other clip is black; Cover and Reveal in one direction look the same.
- **Tag only:** Hue shift, Mirror; Clock wipe and Pixelate show the old dip to black.
- Filter and Transition rows open at the selected item. The Blend, Aspect ratio, Animation and Speed strips still recompute their offset on each pick (a known follow-up). "Kodak" and "Fuji" are brand names to rename before any public release.

### Deviations the tasks reported

1. **Task 1.** `looks.frozen.test.ts` wraps its tests in a nine-line `frozen()` helper whose failure text says an existing look was changed (literals, stretches and checksums as briefed). `src/editor/model/__tests__/chroma.parity.test.ts` (line 258, not in the plan's file list) read the mosaic branch up to `default:`, which now swallowed the eight pass-through cases; it reads `branch("mosaicBox")` now. Pinned version numbers and counts were updated by hand in `migrate.test.ts`, `types.{audio,clip,layers,layers2,motion,polish,speed,text,look}.test.ts`, `effects.test.ts`, `EffectSheet.test.tsx` and `strips.r2.test.tsx` (expectations 15 → 16, 11 → 21 transitions, 12 → 20 effects, 20 → 32 filters). `noHexLiterals.test.ts` gained two allow-list entries (`filterRecipes.ts`, `transitionMath.ts`). The 20 old filter ids, 11 old transition ids and 12 old effect ids keep their order and recipes.
2. **Task 2.** Two tests beyond the brief (every row passes the Adjust clamp unchanged; half strength is half way). The test of the registry in `effects.test.ts` sat at lines 84-86, not 79-81. Observation: the old Warm / Cool filters and the Adjust slider use opposite temperature directions (README item 1); the new filters follow the slider.
3. **Task 3.** Every new function is total (a non-finite input gives the rest value): each ends in `within(value, lo, hi, rest)` and uses `calmEnvelope`; `mirrorMix` is written with nested `within` so `min` never sees a NaN. A strength above 1 is effectively capped. The dust opacity is clamped like `effectShapes`. Two extra tests and two extra parity lines. All 40 vectors of the brief were recomputed independently and kept.
4. **Task 4.** Every transition function starts with a mirrored `unitProgress` clamp (NaN → 0); the scalar, slide and iris vector tables grew (13 → 22, 7 → 15, 4 → 8) to cover ends and out-of-range input; the Swift test compares with a 1e-12 tolerance; `slantCurtain` also returns the empty square for a non-positive size or a non-finite edge; four XCTests added.
5. **Task 5.** None. **Task 6.** Tests only: a block for both ends of all ten and for the middle against the maths (33 tests in `TransitionLayer.test.tsx`). **Task 7.** None.
6. **Task 8.** The dust scratch opacity uses `EffectMath.within` instead of `min(1, …)`; `specks` has one more step (`CIColorClamp`, optional) because `CIRandomGenerator` puts noise in alpha and `CIColorMatrix` can then push components above 1; the three new helpers are private, so they are tested only through `apply`.
7. **Task 9.** `sectorMask` clamps the small mask to its extent before scaling it up (otherwise a faint line of the old clip could show along the frame border); the `flashWhite` case ends with a crop to the frame; one added Jest test (no stray numbers, shorter side for blocks, clamp before scaling). No clock-wipe cache: the mask is at most 262 KB and every frame differs.

### What no test checks

- The device checklist at the end of the plan (looks, feel, speed) and the first-build items in the README (56 – 75), which are §11 item by item: filter names and keys (1), toned filters (2), temperature direction (3), the translucent radial gradient (4), the half-plane rotation (5), the clock arc (6), pixellate at the ends (7), 4K cost (8), the dust grain and scratch width (9), the mirror seam (10).
- How the twelve filters look in an export, and how well the preview's tint resembles each.
- How the curtains read over a playing video (smoothness at the playhead's tick rate, the switch at the cut, the ring's clean hole, nothing drawn outside the preview).
- Whether any of the new Swift compiles.

## 4. Substitutions (ten of thirty)

| Approved | Already in the app as | Replaced by | Why this one |
|---|---|---|---|
| Push up | `slideUp` "Slide up" (both pictures move: a push) | **Cover up** | same direction; only the incoming picture moves |
| Push down | `slideDown` "Slide down" | **Reveal down** | same direction; only the outgoing picture moves |
| Blur dissolve | `blur` "Blur" (both blur while dissolving) | **Pixelate** | the same idea with blocks instead of blur |
| Cross-process | `process` "Process" (`CIPhotoEffectProcess`) | **Bleach** (bleach bypass) | the other classic lab look |
| Golden hour | `golden` "Golden" | **Dusk** | the next light of the day: violet shadows, orange highlights |
| Pastel | `pastel` "Pastel" | **Blush** | a pastel with a rose cast |
| Sepia | `sepia` "Sepia" | **Indigo** | a toned monochrome in blue instead of brown |
| Noir | `noir` "Noir" (also the high-contrast black-and-white) | **Drama** | low-key and contrasty, in colour |
| Light leak | `lightLeak` "Light leak" (a flat warm tint) | **Film burn** | light that comes from an edge and swells |
| RGB split | `rgbSplit` "RGB split" | **Hue shift** | the other colour-channel effect: colours turn round the wheel |

Kept, with a look that is new: **High-contrast B&W** → **Grit** (the grain, sharpening and vignette Noir does not have); **Soft B&W** → **Silver** (matte, lifted blacks; Mono and Tonal are neither); **Faded film** → **Matte** ("Faded" and "Film" are both taken as names); **Teal and orange** → **Cinema** (a split tone — "Teal" is only a cool cast); **Slow strobe** → **Strobe** (a dark strobe; "Flash" is the white one); **Heartbeat zoom** → **Heartbeat** (a double beat and a rest; "Zoom pulse" is an even wave).

Renamed for clarity only: **Cover** → "Cover left" and **Reveal** → "Reveal left" ("Cover" is already the name of the cover tool); **Flash to white** → "White flash" ("Flash" is an effect). Filter labels are one short word because a filter tile is 52 pt wide.

## 5. Transitions

### 5.1 The ten

| id | Label | Preview in Expo Go | Export (Swift, Core Image) |
|---|---|---|---|
| `cover` | Cover left | **approximate** — the edge between the two clips moves as in the export; the clip that is not playing is black | incoming frame translated in from the right over the still outgoing frame |
| `reveal` | Reveal left | **approximate** — the same moving edge (Cover and Reveal look alike on the phone) | outgoing frame translated off to the left over the still incoming frame |
| `coverUp` | Cover up | **approximate** — edge moving up | incoming translated up from below the frame |
| `revealDown` | Reveal down | **approximate** — edge moving down | outgoing translated down and off |
| `circleOpen` | Circle open | **approximate** — a growing circle; black inside it before the cut, black outside it after | `CIBlendWithMask`, mask = `CIRadialGradient` disc growing to the corners; incoming inside |
| `circleClose` | Circle close | **approximate** — a shrinking circle, the other way round | the same mask shrinking; outgoing inside |
| `wipeDiagonal` | Diagonal wipe | **approximate** — a slanted edge from the top-left to the bottom-right corner | `CIBlendWithMask`, mask = a white half-plane (a rotated, translated rectangle) |
| `wipeClock` | Clock wipe | **tag only** — the plain dip to black | `CIBlendWithMask`, mask = a pie sector drawn with Core Graphics (small bitmap, scaled up) |
| `pixelate` | Pixelate | **tag only** — the plain dip to black | both frames through `CIPixellate`, block growing to the middle and back, cross-dissolved |
| `flashWhite` | White flash | **exact** — a dip to white (the same formula as the export) | white composited over the outgoing frame (first half) / the incoming frame (second half) at `1 − |2p − 1|` |

The eleven existing types keep the black dip, drawn by the very same element as today.

### 5.2 Maths — new mirrored pair `src/editor/model/transitionMath.ts` ↔ `modules/clipy-video/ios/TransitionMath.swift`

`p` = progress 0…1 across the window (as `transitionProgress` and the compositor compute it). Screen coordinates: fractions of the frame, x to the right, **y down**; Swift negates y for Core Image.

| Function | Value |
|---|---|
| `dip(p)` | `1 − |2p − 1|` |
| `slideOffsets(type, p)` | where the outgoing (a) and the incoming (b) frame sit, and which is on top: `cover` a (0, 0), b (1 − p, 0), b on top · `reveal` a (−p, 0), b (0, 0), a on top · `coverUp` a (0, 0), b (0, 1 − p), b on top · `revealDown` a (0, p), b (0, 0), a on top |
| `irisRadius(type, p)` | fraction of the frame's half-diagonal: `circleOpen` p · `circleClose` 1 − p |
| `diagonalEdge(p)` | `2p`: the incoming frame shows where `u + v < 2p` (u, v = fractions from the top-left corner) |
| `clockAngle(p)` | `2π·p` radians, swept clockwise from 12 o'clock; the incoming frame shows inside the sweep |
| `pixelSize(p)` | `pixelMax · dip(p)` of the frame's shorter side; `pixelMax = 0.05` |

Constants: `TRANSITION = { pixelMax: 0.05 }`; colours `TRANSITION_COLORS = { flash: "#FFFFFF", curtain: "#000000" }` (the curtain is preview-only). Shared vectors: `transitionMath.vectors.ts` ↔ the table in `TransitionMathTests.swift`, compared line for line.

### 5.3 Preview — `TransitionLayer.tsx` only

Preview-only functions in `transitionMath.ts` (no Swift twin, like `adjustPreview`): `transitionCurtain(type, p)` returns what to draw over the one picture.

The rule for the shaped ones — **"the other clip is black"**: before the cut (p < 0.5, the outgoing clip plays) the region the incoming frame would occupy is black; from the cut on, the region the outgoing frame would still occupy is black. The boundary is the export's boundary at the same progress.

| Curtain | Drawn as (one plain `View`; only `transform` changes with the playhead) | Used by |
|---|---|---|
| `dip` | the existing full-frame view, `opacity = dip(p)`; black, or white for `flashWhite` | the 11 old types, `wipeClock`, `pixelate`, `flashWhite` |
| `panel` | a full-frame black view translated by (dx, dy) × the frame | `cover`, `reveal`, `coverUp`, `revealDown` |
| `disc` | a black circle of the half-diagonal's radius, `scale` | `circleOpen` before the cut, `circleClose` after |
| `ring` | a transparent circle with a black border one radius thick (so everything **outside** the hole is black), `scale` | `circleOpen` after the cut, `circleClose` before |
| `slant` | a black square of twice the diagonal, rotated to the edge and translated along its normal (`slantCurtain(edge, side, w, h)`) | `wipeDiagonal` |

The layer measures the frame itself (one `onLayout`, state set only when the size changes) so **`PreviewPlayer.tsx` is not edited at all**. Until it is measured a shaped curtain draws nothing. No Reanimated, no state per frame: as today, the component re-renders when the store's playhead moves.

### 5.4 Durations and caps

Unchanged: `TRANSITION_LIMITS` 0.3–1.0 s, the cap from the two neighbouring clips, the default 0.5 s.

## 6. Filters

### 6.1 The twelve — recipes over the existing Adjust pipeline

Each new filter is **one row** of a table in a new mirrored pair, `src/editor/model/filterRecipes.ts` ↔ `modules/clipy-video/ios/FilterRecipes.swift`: Adjust values (the twelve existing keys, existing constants, existing guarded steps) plus, for six of them, one new primitive (§6.2). Unlisted keys are 0.

| id | Label | Adjust values | Split tone (shadow → highlight, amount) | Only today's parameters? | Preview veil |
|---|---|---|---|---|---|
| `kodak` | Kodak | temperature 0.2, contrast 0.15, saturation 0.15, fade 0.08, grain 0.15 | `#27413A` → `#FFC98A`, 0.25 | no (tone) | `#D6C436` 0.26 |
| `fuji` | Fuji | temperature −0.12, tint −0.15, contrast 0.1, saturation 0.1, fade 0.1 | `#1F4A45` → `#F2F5E6`, 0.2 | no (tone) | `#4FD1B5` 0.12 |
| `matte` | Matte | temperature 0.08, contrast −0.25, saturation −0.2, fade 0.7, grain 0.3 | — | **yes** | `#7F8A98` 0.22 |
| `bleach` | Bleach | brightness −0.05, contrast 0.5, saturation −0.55, sharpen 0.2, grain 0.2 | — | **yes** | none |
| `dusk` | Dusk | temperature 0.15, tint 0.3, brightness −0.1, saturation 0.15, vignette 0.25 | `#3B2A6B` → `#FF9E6B`, 0.35 | no (tone) | `#C96BD9` 0.18 |
| `moody` | Moody | temperature −0.35, brightness −0.12, contrast 0.25, saturation −0.3, fade 0.15, vignette 0.35 | — | **yes** | `#2B4C7E` 0.2 |
| `tealOrange` | Cinema | contrast 0.2, saturation 0.1 | `#0E6E78` → `#FF9A45`, 0.5 | no (tone) | `#1FA3A3` 0.12 |
| `blush` | Blush | tint 0.25, brightness 0.2, contrast −0.2, saturation −0.15, fade 0.3 | `#8A5A7A` → `#FFE3EA`, 0.25 | no (tone) | `#FFB3C7` 0.18 |
| `grit` | Grit | contrast 0.7, saturation −1, shadows −0.4, sharpen 0.5, vignette 0.3, grain 0.6 | — | **yes** | `#000000` 0.12 |
| `silver` | Silver | contrast −0.2, saturation −1, highlights −0.2, fade 0.45, grain 0.15 | — | **yes** | `#C9CED6` 0.14 |
| `indigo` | Indigo | contrast 0.15, saturation −1 | `#10214F` → `#DCE9FF`, 0.8 | no (tone) | `#2A4B9B` 0.28 |
| `drama` | Drama | brightness −0.15, contrast 0.5, saturation −0.25, shadows −0.5, sharpen 0.2, vignette 0.6 | — | **yes** | `#000000` 0.2 |

Six are expressible with today's parameters alone; six need the split tone. (Temperature follows the **Adjust slider's** convention — above 0 is "warmer" — so whatever the first build shows about that slider's direction (README first-build item 1) holds for these filters too, and one fix corrects both.)

### 6.2 The one new primitive: split tone

Shadows take one colour, highlights another — what "teal and orange" is, and what tones a black-and-white picture.

- Export: `CIFalseColor` (`inputColor0` = shadow, `inputColor1` = highlight) maps the frame's brightness onto the two colours; that picture is laid over the frame with `CISoftLightBlendMode`; `CIDissolveTransition` mixes frame → result by `amount` (skipped at 1). Any missing filter or key → the frame unchanged.
- It runs **between** the colour stage and the finishing stage of the recipe, so a recipe can desaturate first and tone after (Indigo): `Adjust.apply(before)` → split tone → `Adjust.apply(after)`, where *before* holds exposure, temperature, tint, brightness, contrast, saturation and *after* holds highlights, shadows, sharpen, vignette, fade, grain. **`Adjust.swift` and `adjust.ts` are not edited** — both stages call the existing `Adjust.apply` / `adjustRecipe`.
- `filterSteps(id)` (TS) ↔ `FilterRecipes.steps(_:)` (Swift) return the ordered step list; twelve shared vectors (one per filter, hand-computed) pin it on both sides.

### 6.3 Where a recipe filter enters the export

`ClipyCompositor.look`: the existing block (`Effects.filterChain` → `Effects.apply` → strength mix) is untouched; an `else if` after it applies `FilterRecipes.apply(spec.filter, …)` with the same strength mix. An old id has a chain and never reaches the new branch; a new id has no chain (`Effects.filterChain` is not edited) and takes it. A layer's filter goes the same way (`look` is shared).

### 6.4 Preview

The preview stays the three flat views of `FilterLayer` (not edited). A new filter's `FILTERS[id].preview` is **computed from its recipe row** by `filterPreviewOf(id)`: tint = the row's veil; `saturation = clamp(1 + adjust.saturation, 0, 2)`; `brightness = clamp(0.25·adjust.brightness + 0.1·adjust.fade, ±0.3)` (four decimals). So a look is defined once. All twelve are **approximate**: contrast, the split tone, sharpening, grain and the vignette do not show; Grit, Silver and Indigo show as grey with a veil.

## 7. Effects

### 7.1 The eight

`t` = seconds since the effect's start, `d` = its duration, `k` = Strength (0…1), `env` = the existing 0.15-s envelope.

| id | Label | Icon | Preview in Expo Go | Export (Swift, Core Image) |
|---|---|---|---|---|
| `filmBurn` | Film burn | `flame-outline` | **approximate** — a warm gradient from the left edge that swells and fades (the drift up and down is not shown) | `CIRadialGradient` centred on the left edge, drifting vertically, screened over the frame (`CIScreenBlendMode`) |
| `lensFlare` | Lens flare | `aperture-outline` | **approximate** — a soft vertical band of light sweeping left to right every 2 s | two `CIRadialGradient`s (halo, core) at the sweeping point, screened |
| `dust` | Dust | `snow-outline` | **approximate** — the thin light scratches at the export's positions; the fine specks are not shown | the same scratch lines (solid colour, cropped) + fine white grain (`CIRandomGenerator` → `CIColorMatrix`, Apple's scratchy-film recipe) |
| `heartbeat` | Heartbeat | `fitness-outline` | **exact** — the picture's scale (same number as the export) | scale about the centre (the existing `scaled` helper) |
| `hueShift` | Hue shift | `color-palette-outline` | **tag only** | `CIHueAdjust`, angle swinging ±180° × k |
| `mirror` | Mirror | `swap-horizontal-outline` | **tag only** | the left half flipped onto the right half; below Strength 50 it fades (dissolve) |
| `softEdges` | Soft edges | `ellipse-outline` | **approximate** — a pale veil on the four edges | `CIGaussianBlur` of the frame, kept at the edges by `CIBlendWithMask` with a `CIRadialGradient` mask |
| `strobe` | Strobe | `flashlight-outline` | **exact** — a black layer switching on and off | the same black layer (the existing `colorLayer` helper) |

### 7.2 Maths — `effectMath.ts` ↔ `EffectMath.swift` (appended; the 28 constants and 8 functions that exist are not touched)

```
heartbeatScale(t, d, k) = 1 + beatAmp·k·env·beat(φ),   φ = frac(beatHz·t)
    beat(φ) = bump(φ / beatWidth) + beatSecond·bump((φ − beatGap) / beatWidth),   bump(x) = sin²(πx) for 0 < x < 1, else 0
strobeOpacity(t, k)     = k while frac(strobeHz·t) < strobeDuty, else 0
burnOpacity(t, d, k)    = burnMax·k·env·(0.5 + 0.5·sin(2π·burnHz·t))
burnCentreY(t)          = 0.5 + burnDrift·sin(2π·burnDriftHz·t)            (fraction of the height, from the top)
flareX(t)               = −flareMargin + (1 + 2·flareMargin)·frac(flareHz·t)   (fraction of the width)
flareOpacity(t, d, k)   = flareMax·k·env
softEdgeAmount(t, d, k) = k·env        (× edgeBlur × shorter side = blur radius; × edgeVeil = the preview veil)
dustScratch(t, k, i)    = { on: hash(7n + 13i + 1) < dustChance·k,  x: hash(3n + 17i + 2) },   n = floor(dustFps·t),  i = 0 … dustLines − 1
hueAngle(t, d, k)       = π·k·env·sin(2π·hueHz·t)                          (radians)
mirrorMix(t, d, k)      = min(1, k / mirrorFull)·env
```

| Constant | Value | Constant | Value | Constant | Value |
|---|---|---|---|---|---|
| `beatHz` | 1.25 | `burnMax` | 0.6 | `edgeBlur` | 0.02 |
| `beatAmp` | 0.1 | `burnHz` | 0.4 | `edgeInner` | 0.25 |
| `beatWidth` | 0.2 | `burnDrift` | 0.35 | `edgeOuter` | 0.75 |
| `beatGap` | 0.28 | `burnDriftHz` | 0.15 | `edgeVeil` | 0.35 |
| `beatSecond` | 0.6 | `burnRadius` | 0.9 | `dustFps` | 12 |
| `strobeHz` | 2 | `flareMax` | 0.8 | `dustChance` | 0.6 |
| `strobeDuty` | 0.4 | `flareHz` | 0.5 | `dustLines` | 2 |
| `hueHz` | 0.25 | `flareMargin` | 0.2 | `dustOpacity` | 0.5 |
| `mirrorFull` | 0.5 | `flareY` | 0.35 | `dustWidth` | 0.003 |
| | | `flareCore` | 0.12 | `dustSpeck` | 0.005 |
| | | `flareHalo` | 0.4 | | |

Colours added to `EFFECT_COLORS`: `strobe #000000`, `filmBurn #FF5A1F`, `lensFlare #FFF1D0`, `softEdges #FFFFFF`, `dust #F2EBDD`. The strobe is 2 per second (the rate of the existing Flash, under the three-per-second line for flashing content).

Vectors: 34 scalar cases and 6 dust cases, hand-computed, in `effectMath.vectors.ts` and — the same literals — in `EffectMathTests.swift` (parity test line for line).

### 7.3 Preview

- `effectPreview` gains two cases: `heartbeat` → `scale`, `strobe` → one black layer. Everything that draws them exists.
- A new function, `effectShapes(type, t, d, k)`, returns what the other four draw: `burn { color, opacity }`, `flare { color, opacity, x }`, `edges { color, opacity }`, `scratch { color, opacity, x }`. `EffectOverlays` draws them with `expo-linear-gradient` (already used by `AdjustLayer`) and plain views; only `opacity` and `transform` change with the playhead. It measures its own width (one `onLayout`), so `PreviewPlayer.tsx` is not edited.
- `hueShift` and `mirror` return nothing: tag only.

## 8. Export (Swift — uncompiled)

- **No request change.** `ExportClip.filter`, `ExportClip.transition.type` and `ExportEffect.type` are strings and already carry any id. `modules/clipy-video/index.ts` is not edited.
- **New files:** `FilterRecipes.swift`, `TransitionMath.swift`, `TransitionMasks.swift` (the pod's `source_files = "*.{h,m,mm,swift}"` picks them up). Edited: `Effects.swift` (three id lists), `EffectMath.swift` (appended), `EffectRenderer.swift` (eight cases + three helpers, appended), `ClipyCompositor.swift` (ten one-line `blend` cases, one `else if` in `look`).
- **Guard rule for every new filter:** created through `Adjust.filtered` (input-image filters) or a `generated` helper (generators) — both return nil when the filter does not exist or does not declare a key, and never call `setValue` with an unknown key. Nil → the frame (or a plain dissolve, for a transition) as if the look were not there.
- **Masks:** disc = `CIRadialGradient` (white inside `radius`, black one pixel further); half-plane = a white `CIImage(color:)` rectangle, rotated and translated, over black; sector = an 8-bit grey Core Graphics bitmap (longest side ≤ 512 px, the pattern of the existing `drawnRoundedShape`) scaled up to the frame.
- Order of application is unchanged: placement → filter at its strength → Adjust → transition blend → layers → timeline effects in list order → text and stickers.

## 9. Screens

- **Filter strip** (`FilterSheet.tsx`): 32 tiles in the same sideways row. On opening, the row starts with the selected tile in view (`initialX`), worked out **once per opening** and clamped to the row's end (new kit helper `tilesStartXIn` in `src/ui/ToolStrip.tsx`) — picking a filter never moves the row. Cost: still one thumbnail request; 32 tiles are 32 `Image`s of one cached file and 96 flat views, mounted once when the strip opens (today 20 and 60). No virtualising.
- **Effects strip** (`EffectSheet.tsx`): 20 tiles; not edited (a tap adds an effect, nothing is "selected").
- **Transition strip** (`TransitionSheet.tsx`): 21 chips. Chips have different widths, so the selected chip is revealed from **measured** positions: each chip sits in a wrapper that reports its layout; once per opening the row's start is set to the selected chip minus one tile, clamped to the row's end. The duration slider is untouched.
- Icons are Ionicons outline names (all eight verified in the glyph map); labels are sentence case, at most two words; every colour, size and space is a token. The effect pill on the timeline shows the new labels (it reads `EFFECTS`).

## 10. Testing

- **Frozen looks** (§3.3) — first, and green at every later commit.
- **Model:** schema 16; the proof migration; the new ids survive the sanity pass; pinned counts (11 → 21, 20 → 32, 12 → 20) and the pinned schema number in the `types.*` and `migrate` tests.
- **Maths:** every new function against hand-computed vectors (arithmetic in comments); curtains for all 21 types; `slantCurtain`; filter steps for the twelve; preview recipes.
- **Parity (Jest reading Swift):** constants, colours, function names, vector tables line for line, recipe rows line for line, one `case` per id, no placeholder left, every new Core Image name goes through a guarded helper.
- **Components (RNTL v14, async):** `EffectOverlays` shapes; `TransitionLayer` curtains (and the old dip unchanged); the three pickers (counts, order, the row's start, no jump on a pick); the `needsPreviewTag` truth table.
- **Swift XCTests** (uncompiled): vector tables, recipe steps, every transition's end points and direction, every effect's extent and one pixel check each.

## 11. Unverified until the first native build

1. Filter names and keys: `CIFalseColor` (`inputColor0`, `inputColor1`), `CISoftLightBlendMode`, `CIHueAdjust` (`inputAngle`), `CIRadialGradient` (`inputCenter`, `inputRadius0`, `inputRadius1`, `inputColor0`, `inputColor1`), `CIScreenBlendMode`, `CIPixellate`, `CIBlendWithMask`, `CIRandomGenerator`, `CIColorMatrix` (`inputAVector`).
2. `CIFalseColor` maps **brightness** (dark → colour 0), and soft light over the frame gives a tint rather than a wash; the six toned filters' strength.
3. The direction of temperature in the recipes (shared with the Adjust slider — README item 1).
4. `CIRadialGradient` with a translucent inner colour and the same colour at alpha 0 outside screens as a soft light, not a hard disc.
5. The half-plane mask's rotation sign (the diagonal runs from the top-left on screen).
6. `CGContext.addArc(… clockwise: true)` in an unflipped bitmap sweeps clockwise **on screen**, and the bitmap is the right way up as a `CIImage`.
7. `CIPixellate` at a block of 1–2 px at the ends of Pixelate (no visible jump at the first and last frame).
8. The cost of a 4K frame through Soft edges (blur + mask) and through Pixelate on both frames.
9. The fine dust grain's visibility (`dustSpeck`), and the scratch width at 1080p and 4K.
10. Mirror's flip leaves no one-pixel seam on the centre line at odd widths.

## 12. Risks

- **Uncompiled Swift, the largest addition since the look round.** Mitigation: guarded helpers only, small cases, a dissolve / pass-through fallback, XCTests written for the first build, a per-item README checklist.
- **The preview is a rough guide for most new items**, and three are tag only. The device checklist says so plainly, item by item.
- **Cover and Reveal look the same on the phone** (only the edge is shown).
- **Long rows:** 32 filters and 21 transitions in one sideways row each; the last are several swipes away. Opening at the selected item softens it.
- **Filter thumbnails are approximations of approximations:** six new filters differ on the phone mostly by their veil colour.
- **A project saved by this version cannot be opened by an older build** (schema 16) — the point of the bump.
- **Brand names** "Kodak" and "Fuji" are the user's approved labels; fine for a personal build, to be renamed before a public App Store release (one string each).

## 13. Decisions made while writing

1. **Schema 16 with an empty migration**, because the loader silently repairs unknown ids away (§3.1).
2. **Ten substitutions, and short or clearer labels for nine more** (§4): the approved list overlapped what exists more than expected. Counts are as approved.
3. **Filters are rows over the Adjust pipeline, in a new pair** (`filterRecipes.ts` ↔ `FilterRecipes.swift`), not new cases in `Effects.filterChain`: `Effects.apply` does not check keys (a wrong name would raise), `Adjust.filtered` does; and the numbers are then mirrored with vectors, which the 19 old chains never were.
4. **One new primitive (split tone), placed between two calls of the untouched `Adjust.apply`.** Adding a step kind to `AdjustStep` was rejected: `adjust.parity.test.ts` pins the Swift source of `Adjust.steps` / `Adjust.apply`, and "existing maths untouched" is a promise.
5. **A filter's preview recipe is computed from its row**; only the veil colour is hand-picked, and it lives in the same row.
6. **Transition maths gets a TypeScript twin for the first time** (the old nine stay Swift-only and frozen by checksum).
7. **The preview never shows two clips.** A shaped transition shows its moving edge with the other clip black. Clock wipe was left tag-only (a sector from plain views needs clipped, rotating halves — too easy to get wrong unseen); Pixelate cannot be shown.
8. **Neither layer takes the frame size from `PreviewPlayer`** — each measures itself — so that file is not edited at all.
9. **Registries enter in two steps:** effect and transition ids in Task 1 (with pass-through Swift cases, each marked, so the existing one-case-per-id parity tests stay green and each commit is consistent), filter ids in Task 2 together with their rows (a filter id cannot exist without its row: `FILTERS` is a typed record).
10. **Mirror's Strength** is a fade below 50 and full from 50 up — a half-mixed mirror at the default 70 would look like a mistake.
11. **Dust scratches are drawn from mirrored maths on both sides**, not from Apple's noise-scratch recipe, so the preview's lines are the export's lines; only the fine grain is export-only.
12. **The transition chips are revealed from measured layouts**, the filter tiles from arithmetic: tiles are uniform, chips are not, and React Native neither clamps `contentOffset` nor ignores its later changes.
13. **Found while reading, not fixed here (out of scope):** the existing strips that pass `initialX` (Blend, Aspect ratio, the two Animation strips, Speed) recompute it on every pick and do not clamp it, so on the phone their row may jump after a tap and may start past its end for the last tiles; and `Effects.apply` sets filter keys unchecked.
14. **Verified, and where:** `RCTScrollViewComponentView.mm` (lines 404–405: `contentOffset` applied on change, no clamp; `scrollToOffset` no clamp); `ClipyVideo.podspec` (`source_files` glob); the Ionicons glyph map (eight names); every vector and the checksums of §3.3 with a throw-away Node script (not committed).
