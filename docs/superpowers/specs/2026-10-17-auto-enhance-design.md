# Auto enhance — design

Date: 2026-10-17. Branch `auto-enhance` (from `next-build`). Owner-approved drawing: the Adjust strip gets a new FIRST chip
**Auto** (a wand); one tap looks at the selected clip and SETS THE ORDINARY ADJUST SLIDERS for it; an **Auto · strength** slider
makes it softer or stronger (0–100 %, default 100 %); a line says what was set; **Apply to All** does every clip, each looked at
on its own. It needs the new build (it reads the picture on the phone).

AGENTS.md binds (Native code, the guarded native wrappers, Look maths, Existing looks are frozen, Messages, Undo, Toolbar /
strips, Sliders, Casing, Text size, Palette, Spacing, Icons, Background export, `activeTimeout`).

## 1. What Auto is — and is not

- Auto writes ONLY the clip's existing `adjust` values, through the existing `setClipAdjust` op. Nothing new is stored in the
  project: no schema bump, no new field, no new look maths. `adjust.ts` ↔ `Adjust.swift` are NOT edited, `looks.frozen.test.ts`
  is NOT edited, the export request is unchanged (an auto-adjusted clip exports exactly as if the same numbers had been dragged
  by hand). The preview shows them as any adjust: through `AdjustLayer`'s approximation, with the Preview tag.
- The parameters Auto sets — `AUTO_KEYS`, in this order — and their GENTLE limits (slider units; the slider shows ×100):

  | key (slider label) | limit | slider range | what it answers |
  |---|---|---|---|
  | `exposure` (Exposure) | −0.20 … +0.30 (−20 … +30) | −1 … 1 | a dark or bright clip (the median luma towards mid-grey) |
  | `contrast` (Contrast) | −0.10 … +0.20 (−10 … +20) | −1 … 1 | a flat clip (a narrow p2–p98 range); a clip clipped at BOTH ends gets −8 |
  | `saturation` (Saturation) | −0.10 … +0.20 (−10 … +20) | −1 … 1 | a dull clip (mean chroma); a garish one gets a little less |
  | `temperature` (Warmth) | −0.15 … +0.15 (−15 … +15) | −1 … 1 | a blue / orange cast (red − blue) |
  | `tint` (Tint) | −0.10 … +0.10 (−10 … +10) | −1 … 1 | a green / magenta cast |

  **Changed from the brief: exposure, not brightness.** Concrete reason: Brightness is `CIColorControls.inputBrightness`, an
  additive offset (`ADJUST.brightness × value` added to every pixel) — it lifts black to grey and makes a dark clip look washed
  out; Exposure is `CIExposureAdjust`, a multiply in linear light (`2^(1.5 × value)`) that keeps black black, and the target maths
  is a clean `log2`. Brightness, Highlights, Shadows, Sharpen, Vignette, Fade and Grain are never touched by Auto.
- Every other key keeps the value it has. Auto's values are ABSOLUTE for its five keys at 100 % (computed from the source picture,
  which is what the clip shows with a neutral adjust); the strength blends from the values the clip had before the tap (§4).
- Auto looks at the clip's OWN picture (the file, over its trim) — not at its filter, not at its adjust. A filter stays as it is.

## 2. Native: `frameStats` (the "auto enhance" build)

ONE new native function and its cancel, in a new file `modules/clipy-video/ios/FrameStats.swift`, wired in
`ClipyVideoModule.swift`. Pure numbers out; it decides nothing.

```
frameStats({ jobId: string, uri: string, kind: "video" | "photo", times: number[], maxSide: number })
  → Promise<{ frames: { time, histogram: number[64], r, g, b, saturation, pixels }[], failed: number }>
cancelFrameStats(jobId: string): void
```

- **Reading.** Video: `AVURLAsset` + `AVAssetImageGenerator` (`appliesPreferredTrackTransform = true` → upright,
  `maximumSize = maxSide × maxSide` → aspect-fitted, tolerance ±0.25 s each side: the NEAREST decodable frame within a quarter
  second is fine — zero tolerance would decode from the previous key frame for every look and is not needed for statistics),
  the iOS 16 `image(at:) async` (no deprecated `copyCGImage`), one frame per asked time, in order. A frame that fails is counted
  in `failed` and skipped; none at all is a failure. Photo: `CGImageSourceCreateThumbnailAtIndex` with
  `kCGImageSourceCreateThumbnailWithTransform` (EXIF applied) at `maxSide`; one frame, `time: 0`; `times` is ignored.
- **Counting.** **Changed from the brief: no Core Image.** Concrete reasons: (1) the brief's mean saturation is the mean of each
  pixel's chroma, which `CIAreaAverage` cannot give (it averages the colours first — the chroma of the average is not the average
  chroma); (2) `CIAreaHistogram` counts per channel, not luma, and answers a float image whose scale would have to be read back
  — unverifiable here without a Swift toolchain; (3) the frame is at most 256 × 256 = 65 536 pixels, so ONE plain loop over an
  8-bit bitmap is about a millisecond, deterministic and directly testable in XCTest with a made-up bitmap. So the picture is
  drawn ONCE by Core Graphics into an 8-bit RGBA bitmap in the **sRGB** colour space (`CGColorSpace.sRGB`, premultiplied last;
  Core Graphics converts from the frame's own colour space — BT.709 video has sRGB's primaries), and counted in Swift:
  - values are the GAMMA-ENCODED components 0 … 1 (`component / alpha` — un-premultiplied — clamped to 1); a pixel with alpha
    under 128 is not counted (a see-through PNG's background does not count);
  - luma `Y' = 0.2126 R' + 0.7152 G' + 0.0722 B'` (Rec. 709 weights on gamma values — the BT.709 luma definition, and how a
    viewer sees mid-grey: 0.5 looks half-bright);
  - `histogram`: 64 bins of Y' (`min(63, Int(Y' × 64))`), as COUNTS; `r`, `g`, `b`: mean of each component; `saturation`: mean
    chroma `max(R', G', B') − min(R', G', B')`; `pixels`: how many were counted; `time`: the frame's actual time.
  - Consistency with Adjust.swift: Adjust works in Core Image's linear working space; Auto's TypeScript maps its gamma statistics
    to slider units with gentle, documented approximations (§3), never an inverse of the Adjust pipeline. It is a heuristic.
- **Bounds.** `maxSide` clamped 16 … 1024 (not a number or ≤ 0 → 256; the app sends 256). At most 10 times; a time that is not
  a number is dropped, the rest clamped to `0 … length − 0.05`; none left → the middle of the file. Every Double checked before
  it becomes an Int (the `SoundPeaks` idiom).
- **Cancel.** `StatsJob` (a lock, a flag, the generator it attached — `cancel()` sets the flag and calls
  `cancelAllCGImageGeneration()`); the flag is read before and after every frame. Cancelled → `E_STATS_CANCELLED`.
- **Failures** are `E_STATS` with `stats <stage>: ` (`stats source:`, `stats frames:`, `stats measure:`, `stats reader:` +
  `ExportSession.describe`).
- **Background** (AGENTS Background export). Decoding uses the media engine and the app is not trusted to do picture work away:
  asked while the app is in the background it is NOT started; finished or failed after the app was away (`ExportPause.shared
  .hasLeft(since:)`) it answers **`E_STATS_INTERRUPTED`** (`stats interrupted: Clipy was in the background while the picture was
  read`). It is not added to `interruptCopies` (five frames finish on their own in well under a second; it is not a copy and makes
  no file) and uses no `takeLeft` mark — the `backgroundExport.swift.test.ts` count of three stays three. The app asks again once
  Clipy is in front (§5). `ClipyCompositor.swift`, `ExportSession.swift`, `ExportBackground.swift`, `MediaPrePass.swift`,
  `CutoutRender.swift`, `SteadyRender.swift`, `SoundPeaks.swift`, `Adjust.swift` are untouched.
- **iOS.** Everything used is iOS 16.0 or older (`image(at:)` is 16.0); nothing newer than 16.4, no `#available`.
- **Wrapper.** `modules/clipy-video/frameStats.ts` (its own `optional()` inside `try`, like `reveal.ts` / `background.ts`;
  re-exported by `index.ts`; imported BY ITS OWN PATH by the app so a test that mocks `@/modules/clipy-video` still gets the real,
  absent-safe functions): `isFrameStatsAvailable()` (= the native `frameStats` is THERE), `frameStats(req)` (rejects with the
  "latest build" error when absent — never throws synchronously), `cancelFrameStats(jobId)` (never throws), `STATS_CANCELLED`,
  `STATS_INTERRUPTED`, `isStatsCancelled`, `isStatsInterrupted`.
- **Build.** A new top row of `LEVELS` in `src/lib/buildInfo.ts`: `{ name: "auto enhance", title: "Auto enhance", has:
  isFrameStatsAvailable }`. The sentence: `AUTO_TOOLS = NEEDS_LATEST_BUILD("Automatic adjustments")` — "Automatic adjustments need
  the latest Clipy build. Install it from the newest build link." (`what` must be plural: "Auto enhance need…" would not read).
- **Pins.** `modules/clipy-video/__tests__/frameStats.swift.test.ts` (reads the Swift: record fields = the wrapper's interface,
  answer keys, the colour space, the weights, 64 bins = `AUTO.bins`, upright reading, no Core Image in the file, the module
  function answers exactly once, the background checks in order), `modules/clipy-video/__tests__/frameStats.test.ts` (the
  wrapper), `modules/clipy-video/ios/Tests/FrameStatsTests.swift` (XCTest: counting on made-up bytes and a drawn image, the
  clamps).

## 3. What to set: `src/editor/model/autoEnhance.ts` (TypeScript only, pure)

No Swift twin; imports only `ADJUST` (adjust.ts) and types. Tunable without a build.

- `autoTimes(kind, from, to)`: a photo `[0]`; a video `n = clamp(floor(length / 0.5), 1, 5)` times at the middles of `n` equal
  parts of the trim (source seconds), rounded to the millisecond. 10 s → `[1, 3, 5, 7, 9]`.
- `summarize(frames)`: each frame's histogram normalised to 1 and the frames AVERAGED (each frame weighs the same); means of r,
  g, b, chroma likewise; a frame with a wrong shape or a non-number is skipped; none left → `null`. `percentile(hist, q)` is
  linear inside a bin. The summary is `{ p2, p50, p98, r, g, b, chroma }`.
- `autoTargets(summary)` → `AutoValues` (the five keys), constants in `AUTO`:
  - **Blank** (`p98 < 0.08` or `p2 > 0.92` — a black or white card, a fade): all zero.
  - **Exposure:** `|p50 − 0.45| ≤ 0.05` → 0; else `EV = 2.2 × log2(0.45 / max(p50, 0.01)) × 0.6` (60 % of the way) and
    `exposure = clamp(EV / ADJUST.exposureEV, −0.20, +0.30)`.
  - **Contrast:** with the exposure's gain on gamma values `g = 2^(1.5 × exposure / 2.2)`, `w = min(1, p98·g) − p2·g`. Clipped at
    both ends in the source (`p2 ≤ 0.02` and `p98 ≥ 0.98`) → −0.08; else `w ≥ 0.75` → 0; else
    `clamp((0.85 / max(w, 0.2) − 1) / ADJUST.contrast × 0.5, −0.10, +0.20)`.
  - **Saturation:** chroma `S` under 0.04 (black and white) or within 0.16 … 0.32 → 0; else
    `clamp((0.22 / S − 1) × 0.5 / ADJUST.saturation, −0.10, +0.20)`.
  - **Warmth:** `rb = (r − b) / max(0.05, r + g + b)`; `|rb| ≤ 0.03` → 0; else `clamp(−1.5 × rb, ±0.15)` (a blue cast warms).
  - **Tint:** `gm = (g − (r + b) / 2) / max(0.05, r + g + b)`; `|gm| ≤ 0.025` → 0; else `clamp(1.5 × gm, ±0.10)` (green →
    magenta, the tint slider's positive side).
  - Each rounded to the slider's step (0.01; `−0` → 0).
- `autoValues(target, base, strength)`: per key `r2(base + (target − base) × strength)`, strength 0 … 1 (the slider's step 0.01).
- `autoStrengthOf(now, target, base, hint)`: the strength at which the clip's CURRENT values are exactly what Auto set — `hint`
  if it matches, else the first of 100 %, 99 % … 1 % that matches, else `null`; `null` too when no key differs between target and
  base. (0 % is never inferred: after Undo of the tap the values equal the base, and the slider must go.)
- `autoState(now, target, base, hint)` → `{ kind: "set", strength, line }` | `{ kind: "good" }` (target = base = now on every key:
  "This clip already looks good.") | `null` (stale).
- `autoLine(now, target, base)`: `"Set exposure +12, contrast +8, saturation +10, warmth -4"` — the keys whose target differs from
  the base, in `AUTO_KEYS` order, each with its CURRENT value as the slider prints it (`+` for positive, ASCII `-`, ×100 rounded);
  names `AUTO_NAMES` (the slider labels lower-cased: Warmth → warmth), pinned to `ADJUST_LABELS`.
- **Vectors** (pinned in `autoEnhance.test.ts`; built from one frame whose histogram is flat between two bin edges):

  | case | p2 / p50 / p98 · r g b · chroma | exposure | contrast | saturation | warmth | tint |
  |---|---|---|---|---|---|---|
  | well exposed | .079 / .469 / .859 · .47 .47 .47 · .22 | 0 | 0 | 0 | 0 | 0 |
  | dark | .039 / .234 / .429 · .24 .23 .22 · .12 | +0.30 | +0.20 | +0.20 | 0 | 0 |
  | dim | .075 / .375 / .675 · .37 .37 .36 · .14 | +0.23 | +0.20 | +0.20 | 0 | 0 |
  | bright | .388 / .688 / .988 · .75 .74 .73 · .20 | −0.20 | +0.20 | 0 | 0 | 0 |
  | flat | .289 / .469 / .649 · .47 .47 .46 · .10 | 0 | +0.20 | +0.20 | 0 | 0 |
  | blue cast | well exposed · .38 .46 .58 | 0 | 0 | 0 | +0.15 | 0 |
  | warm cast | well exposed · .52 .47 .42 | 0 | 0 | 0 | −0.11 | 0 |
  | green cast | well exposed · .42 .56 .42 | 0 | 0 | 0 | 0 | +0.10 |
  | clipped both ends, garish | .02 / .5 / .98 · .5 .5 .5 · .36 | 0 | −0.08 | −0.10 | 0 | 0 |
  | black and white | well exposed · chroma .01 | 0 | 0 | 0 | 0 | 0 |
  | black card | .0006 / .016 / .031 | 0 | 0 | 0 | 0 | 0 |
  | white card | .939 / .969 / .999 | 0 | 0 | 0 | 0 | 0 |

## 4. Undo, strength, memory

- **The tap** on Auto is ONE undo step (`apply`) and says **"Auto enhance applied"** with Undo (`{ kind: "done", undo: true }`,
  said right after the apply — added to the AGENTS Messages list). Nothing changed (the values are already there) → no step, no
  message; nothing to change (`good`) → no step, no message, the line says "This clip already looks good.".
- **The base.** At the tap the base is the clip's current values of the five keys — unless Auto's own values are on it now
  (`autoStrengthOf ≠ null`), then the remembered base is kept (a second tap brings 100 % back, it does not stack).
- **The strength slider** (kit `Slider`, 0 … 1, step 0.01, `detents={[1]}` — 100 % is the rest): `onSlidingStart` =
  `beginTransaction`, every `onValueChange` = `applyTransient(setClipAdjust(…, autoValues(target, base, v)))` — the existing
  slider pattern, so a drag is ONE step; it rescales FROM the base, so it is reversible and 0 % is exactly the clip before Auto.
  No render queue depends on adjust, so no hold (`holdSounds` / `holdSteady`) is needed.
- **Memory** (`useAutoLooks`, `src/editor/autoLook.ts`): for the SESSION, in memory only — never in the project, the undo history
  or on disk. Keyed by `lookKey = clipId|sourceUri|trimStart|trimEnd`: `targets[key]` (what the look found, so a second tap or
  Apply to All does not read the picture again) and `applied[key] = { base, strength }`. At most 64 of each (the oldest goes).
- **The slider shows only** while `autoState(...)` is `set` for the selected clip: the memory holds for its key AND its five values
  are exactly Auto's at some strength. A manual drag of any of the five, Undo of the tap, a trim (another key) → it disappears; no
  stale slider. Redo brings it back. Undo of a strength drag shows the slider at the strength the values say.

## 5. The look: one at a time, a deadline, cancel

`src/editor/autoLook.ts` is the ONLY caller of `frameStats` / `cancelFrameStats`.

- `lookAt(source)` → `{ status: "ready", target }` | `"failed"` | `"cancelled"` | `"unavailable"` | `"busy"`. Known target →
  ready at once, no native call. One look at a time (a second while one runs → `busy`; the UI never asks). Each native call has
  `AUTO_DEADLINE_MS` (20 000) counted by `activeTimeout` (time in front only); past it the phone is told to cancel and the look is
  `failed`. `E_STATS_INTERRUPTED` → wait `untilActive()` and ask again, at most `AUTO_RETRIES` (2) more times, then `failed`.
  `stopLooking()` ends it at once (cancels the job, a late answer is dropped). Failures go to the log (`auto enhance failed`).
- `useAutoEnhance(clipId, visible)` (`src/editor/useAutoEnhance.ts`) — the strip's hook: pauses the preview first
  (`setPlaying(false)`, like Read aloud), runs only from a tap, stops on closing the strip, another selection (`clipId` changes)
  and leaving the editor (unmount); after an answer it checks the store still holds the same project and the clip with the same
  key, else drops it silently.
- **Apply to All** (only on a MAIN clip's strip — a layer's Adjust offers none, as today): every main clip, video and photo, in
  order, ONE look at a time; the row says "Looking at 3 of 8…" with Cancel. A missing file or a failed look is skipped and counted.
  At the end ONE `apply` sets every looked-at clip to its own target at 100 % (each with its own base), said
  "Auto enhance applied to 7 clips" (+ ". 1 clip could not be read.") with Undo — the count is every clip looked at and given its
  values, one already at them included. Cancel → nothing applied, nothing said. Nothing found at all → "Could not look at these
  clips." (problem). Nothing to change (every clip already has its values) → "Nothing to change" (+ the skipped sentence), no step,
  no Undo.
  Layers are not included: today's Apply to All writes main clips only.

## 6. Without the build

`isFrameStatsAvailable()` false (Expo Go, an older installed build): the Auto chip shows; a tap says `AUTO_TOOLS` in the message
bar and changes nothing — the chip is not picked, nothing is read, nothing is applied. The other chips are untouched.

## 7. The strip (the height does not change)

The Adjust strip stays a `ToolStrip`: header 44 + tiles 72 + slider row 36 (`STRIP`), not one number changed.

- **Tiles row:** `Auto` is the FIRST chip — the kit `Chip` with a new optional `icon` (`color-wand-outline` → `wand.and.stars`,
  already in `SF_SYMBOLS` and `USED`; drawn by the kit `Icon` in the label's colour, `theme.size.icon.sm`, `theme.space.xs` before
  the label; a chip without `icon` renders exactly as before, so `defaultTree.proof.test.tsx` holds). Then the twelve as today.
  Brightness stays picked when the strip opens; Auto never runs on opening.
- **Auto picked**, the slider row (36) is replaced, like every chip switches the slider:
  - while looking: kit `Spinner`, "Looking at this clip…" / "Looking at 3 of 8…", `QuietButton` Cancel;
  - `set`: `StripSlider` "Auto · strength" "100%" with the kit Slider (`auto-strength`), trailing `QuietButton` Apply to All
    (main clips only);
  - otherwise: "Auto sets the sliders from this clip's picture." (muted, up to two lines) and Apply to All (main clips only).
- **Header while Auto is picked:** no header action (Apply to All lives in the row, so the note has the room); the note
  (`StripNote lines={2}`, no `fit` — an app-made sentence of unbounded length ends in dots) is the line (`autoLine`) or "This clip
  already looks good."; its VoiceOver label is the whole sentence. Every other chip: today's header, today's action (copy this
  clip's adjust to all), today's Reset.
- Casing: "Auto" (a tile label), "Apply to All", "Cancel" (buttons, title style); every other word sentence style. All words are
  `AUTO_WORDS` (useAutoEnhance.ts). Colours, spacing, sizes from the theme; nothing animated.

## 8. Tests that may change, and how

- `src/lib/__tests__/buildInfo.test.ts`: the new top row ("Auto enhance"), one more argument to `set`.
- `src/editor/__tests__/AdjustSheet.test.tsx`, `strips.params.test.tsx`: only additions (the Auto chip is first; existing
  assertions keep passing as written).
- Nothing else. Never edited: `looks.frozen.test.ts`, `adjust.ts`, `Adjust.swift`, `AdjustTests.swift`, `defaultTree.proof.test.tsx`,
  `backgroundExport.swift.test.ts`, every PROOF named in AGENTS.md.

## 9. Only a phone can show

(`docs/next-build-phone-checklist.md` part P.) That the numbers look right on real dark / bright / flat / colour-cast clips and a
photo (the constants are TypeScript: tuning needs no build); HDR (Dolby Vision / HLG) iPhone video — whether the generator's
picture drawn into 8-bit sRGB gives sensible numbers; how long one look takes; leaving Clipy mid-look; the line's two lines on a
375-pt phone; that the preview's approximation and the export agree as for any adjust.

## As built

Built on the branch `auto-enhance` (3d3f437 native, 94222d0 model, b99d194 look, 1810a77 strip; the review's fixes in
12b8706) and merged into `next-build`. §1–§8 hold as written, with these differences and additions:

- **Files.** Native: `modules/clipy-video/ios/FrameStats.swift` (`FrameStatsRequest`, `StatsError`, `StatsJob`, `FrameStats`;
  `bins` 64, `defaultSide` 256), two insertions in `ClipyVideoModule.swift` (`frameStats`, `cancelFrameStats`),
  `ios/Tests/FrameStatsTests.swift`. Wrapper `modules/clipy-video/frameStats.ts` (re-exported by `index.ts`, imported by its own
  path). `LEVELS` top row `"auto enhance"` / "Auto enhance" (`isFrameStatsAvailable`), `AUTO_TOOLS` = `NEEDS_LATEST_BUILD
  ("Automatic adjustments")`. Model `src/editor/model/autoEnhance.ts` (+ `__tests__/autoEnhance.vectors.ts`), look
  `src/editor/autoLook.ts`, hook `src/editor/useAutoEnhance.ts` (`AUTO_WORDS`), strip `AdjustSheet.tsx`, the kit `Chip`'s `icon`.
- **Compiled.** The Swift was compiled by the GitHub Actions build (`.github/workflows/ios-build.yml`, run 39035642231,
  Xcode 26.6, "submit" off). No Swift changed after it.
- **Departures accepted at the ledger.** Exposure (not Brightness) carries the light; the histogram is counted by a plain Swift
  loop over a Core Graphics bitmap, not `CIAreaHistogram`; a video frame may be up to ±0.25 s from the time asked; an interrupted
  look is asked again in front (`AUTO_RETRIES` 2); the chip reuses `color-wand-outline`; Apply to All covers main clips only.
- **A blank picture is left alone** (review MINOR 2). `autoTargets` still answers zeros for it (the vectors are unchanged), but a
  look's target is `autoTarget(summary)`, which marks a blank picture `blank`, and `targetOn` makes its target the clip's own
  values: a value set by hand stays, the line says "This clip already looks good.", nothing is applied (Apply to All counts it as
  done, untouched).
- **The strip opens on Brightness** (MINOR 1): Auto is unpicked when the strip closes (the strip stays mounted), so the header's
  Apply to All never silently means Auto's.
- **Reading a strength** (MINOR 6): when several strengths round to the same values (a 50 % drag is 49 … 51 %), `autoStrengthOf`
  answers the middle of that run, a tie going up — so Redo of a 50 % drag shows 50 %, not 51 %.
- **Apply to All whose looked-at clips all changed meanwhile** (MINOR 7) says nothing; "Could not look at these clips." only when
  none could be read.
- **Left as they are.** 0 % equals the base on the slider's 0.01 step only (`setClipAdjust` rounds every value it writes, as every
  slider does; values the app writes are on that step). Cancel does not stop the one frame being decoded, and a photo is decoded
  synchronously (both Swift; at most a fraction of a second; the checklist asks how long a big photo takes). The hint row's two
  lines at the editor's text cap are a phone check (part P, 83), not a height change.
- **Tests.** App 483 suites / 6970 tests, server 22 / 615. New: `frameStats.test.ts`, `frameStats.swift.test.ts`,
  `autoEnhance.test.ts`, `autoLook.test.ts`, `AdjustSheet.auto.test.tsx`, `Chip.icon.test.tsx`; `buildInfo.test.ts` gained the
  row. `defaultTree.proof.test.tsx`, `looks.frozen.test.ts`, `backgroundExport.swift.test.ts` unchanged.
- **Phone checklist:** `docs/next-build-phone-checklist.md` part P, checks 75–83 (part O ends at 74).
