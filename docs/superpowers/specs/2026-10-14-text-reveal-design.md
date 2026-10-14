# Text reveal animations: Typewriter and Word by word — design

Date: 2026-10-14. Branch: `text-reveal` (from `next-build` @ 8d644d2). Plan: `docs/superpowers/plans/2026-10-14-text-reveal.md`.

The owner approved, from an animated drawing, two new ways for a TEXT to appear beside the existing whole-text In animations:
**Typewriter** (letters appear one by one, in reading order) and **Word by word** (whole words appear in turn). The reveal lasts the
animation's duration (the existing Length slider). The whole text is laid out from the first frame; what is not yet revealed is
simply invisible, so nothing shifts or re-wraps. It works with every font, colour, outline, shadow, background box, glow, spacing
and opacity a text already has, and reveals in READING order for right-to-left text.

Not in scope: per-letter movement, stickers, captions (§8), reveal as an Out animation (§8).

## 0. What was read in the tree

| Fact | Where |
|---|---|
| In and Out share one id list, frozen at ten: `ANIM_IN_IDS` (fade … rise); `AnimEdge { id: AnimInId; duration }`; `OverlayAnimation { in; out; loop }`; `ANIM_LIMITS` 0.1 … 2 s, default 0.5 | `src/editor/model/types.ts:144-156` |
| `clampAnimEdge` drops an unknown id to `null`; `clampOverlayAnimation` is the sanity pass for every text and sticker | `types.ts:330-346`; called by `withMotion` `src/editor/model/migrate.ts:26-30` and `patchedOverlayAnimation` `src/editor/model/ops.ts:1367-1374` |
| `setOverlayAnimation` refuses captions; `edgesOk` accepts only `clampAnimEdge`-known ids | `ops.ts:1272-1276, 1358-1364` |
| The ten-id list is pinned: `types.motion.test.ts:9`, `effects.test.ts:75-79` (`ANIM_IN` labels), `motion.parity.test.ts:47, 86` (Swift `animInDelta`'s `case` ids must equal `ANIM_IN_IDS`), `motion.test.ts:57-69` | tests |
| `animInDelta` in Swift: `default: break` → an unknown id is the identity | `modules/clipy-video/ios/Motion.swift:105-145` |
| Overlay motion in the preview: `OverlayLayer` reads the store's `playhead`, `resolveOverlayMotion(o, playhead)` gives ONE delta for the whole overlay; the caption highlight is the only per-range, per-time styling and travels as the `time` prop | `src/editor/components/OverlayLayer.tsx:22-52`, `src/editor/model/motion.ts:247-261` |
| The preview draws a text as up to four stacked `KitText` layers, each drawing the same string: glow, shadow, outline (when stacked), fill (bottom → top); the fill alone carries the caption's word spans; an outline alone rides on the fill as a `textShadow` halo | `src/editor/components/OverlayText.tsx:25-59` |
| The export does NOT redraw a text per frame. `overlayLayer` builds a Core Animation tree ONCE: a container (`backgroundColor` = the box), a `CATextLayer` fill whose attributed string carries the stroke (negative `kCTStrokeWidth` = stroke AND fill), and for glow / shadow a TINTED copy below the fill casting a layer shadow. Time enters only through animations: `addVisibility` (an opacity window) or `addMotion` (sampled keyframes) | `modules/clipy-video/ios/ExportSession.swift:640-761, 779-842` |
| The caption highlight in the export = **one extra copy of the fill per spoken word, the word's range recoloured, shown only during the word by `addVisibility`**. This is the existing per-frame mechanism for per-range styling | `ExportSession.swift:740-753`, `CaptionWords.swift` |
| Every text layer is made by one helper `textCopy` (same frame, alignment, wrapping, `contentsScale = 1`); `addMotion` raises `contentsScale` on the container's DIRECT sublayers | `ExportSession.swift:691-700, 819-822` |
| The source pins on that function | `src/editor/model/__tests__/textExport.swift.test.ts:83-127` (one `CATextLayer()`; "every addition sits inside one of the three guards"; `allowsGroupOpacity` count 5) |
| Records ignore keys they do not declare: `update(withDict:)` / `update(withObject:)` set only the record's own `@Field`s | `node_modules/expo-modules-core/ios/Core/Records/Record.swift:111-140` |
| The export request's overlays are pinned byte for byte by a PROOF | `src/export/__tests__/useExport.test.ts:353-355` |
| `toExportOverlay` / `overlayMotion` build the overlay record; In / Out lengths are scaled to fit the text's life by `edgeDurations` before they are sent | `modules/clipy-video/index.ts:143-170`, `motion.ts:150-158` |
| Build gating: `LEVELS` (top row = newest), `NEEDS_LATEST_BUILD`, marker functions such as `Function("blurAndCuts") { () -> Bool in return true }` | `src/lib/buildInfo.ts:10-19, 41`; `ClipyVideoModule.swift:581-583`; `index.ts:378` |
| The Animation strip: tabs In · Out · Loop, tiles are kit `Tile`s with an ICON (no live preview), "None" first, the Length slider under In / Out | `src/editor/components/OverlayAnimationSheet.tsx`, `AnimationTiles.tsx` |
| `Intl.Segmenter`: the installed Hermes (RN 0.86.3, `sdks/.hermesversion` hermes-v0.17.0) ships no type or source that names it; not relied on (§3) | `node_modules/react-native/sdks` |
| React Native (Fabric) text attributes: a nested span's `textShadowColor` REPLACES its parent's (`TextAttributes::apply`), and the shadow becomes an `NSShadow` per attribute range; `"transparent"` is `0x00000000`, a real (truthy) colour | `ReactCommon/react/renderer/attributedstring/TextAttributes.cpp:96-98`; `RCTAttributedTextUtils.mm:270-282`; `@react-native/normalize-colors/index.js:329`; `HostPlatformColor.mm:175-179` |

## 1. Representation: two more In choices for a text

**Decision: a reveal is the text's In animation.** `OverlayAnimation.in` may hold `{ id: "typewriter" | "wordByWord", duration }`.
A text therefore cannot slide in AND type itself; it can still have an Out, a Loop and keyframes (they move the whole text, as today).

- `ANIM_IN_IDS` stays exactly the ten (pinned, and shared with clips and Out). New: `ANIM_REVEAL_IDS = ["typewriter", "wordByWord"]`,
  `RevealId`, `isRevealId`, and `TextInEdge { id: AnimInId | RevealId; duration }` as the type of `OverlayAnimation.in`
  (`out` stays `AnimEdge`; `ClipAnimation` is untouched).
- `clampOverlayAnimation(a, reveal = false)`: with `reveal` true (a `kind: "text"`) an In with a reveal id is kept, its duration clamped
  like any edge; for a sticker or a caption it is dropped to `null` exactly as an unknown id is today. Out never keeps a reveal id.
  `withMotion` passes `o.kind === "text"`; `setOverlayAnimation` refuses a reveal for anything but a text.
- **No schema bump.** The value lives in an existing field; every older project is unchanged byte for byte; a newer project opened
  by an OLDER app loses only the reveal (its `clampAnimEdge` drops the unknown id → the text simply appears). Undo-history snapshots and
  `.clipy` files pass through `migrateProject`, so they keep a reveal on this app and lose it, harmlessly, on an older one.
- Motion: in `motion.ts` `edgeDelta` gives the identity for a reveal id (one guard, TypeScript only). Swift is never sent a reveal as
  `animIn` (§5) and its `animInDelta` already answers the identity for an unknown id, so the mirrored pair stays identical in meaning;
  `Motion.swift` is not edited and the parity test's `case` list is still exactly `ANIM_IN_IDS`.
- `hasOverlayMotion` is true for a revealing text (its In is not null): `OverlayLayer` then draws its selection frame in the unseen
  base copy, as for any animated text — the frame never jumps.

## 2. What a reveal shows at a time

All in ONE new pure file `src/editor/model/textReveal.ts` — **TypeScript only, not mirrored**: the export is SENT the result (§5), the
repo's rule for numbers worked out in TS (sound chains, steady paths).

- `revealUnits(text, id) → number[]`: the UTF-16 offset where the visible part ENDS after each unit, ascending, the last = `text.length`;
  `[]` when nothing visible. The visible part after k units is `text.slice(0, cuts[k-1])` — always a prefix in LOGICAL order.
- `revealPlan(text, id, duration) → { cut, from }[]`: `n` units are grouped into `m = max(1, min(n, REVEAL.maxSteps,
  ceil(duration × REVEAL.stepsPerSecond − 1e-9)))` steps; step `j` (1 … m) shows `cuts[ceil(j·n/m) − 1]` from `duration·(j−1)/m`
  seconds after the text's start. `REVEAL = { stepsPerSecond: 30, maxSteps: 30 }`. The first step starts at 0 (the first unit is there
  on the text's first frame), the last step is the whole text and holds to the end of the text's life. A plan of fewer than two steps
  (one unit, or a very short duration) is NO reveal: the text is drawn as today.
- `duration` is the In's length as the export receives it: `edgeDurations(in, out, end − start).in`, shared by the preview and the
  request so both use the same plan.
- `revealCut(o, time) → number | null`: the cut of the last step whose `from ≤ time − o.start`; `null` = draw the whole text (no
  reveal, a caption, a sticker, a plan under two steps, or the last step reached). `hasReveal(o)` and `exportReveal(o)` complete it.

Why steps at all: the export makes one set of layers per step (§5). Capping at 30 bounds that cost; at 30 a second no state is ever
shorter than one frame of a 30 fps export, and a 2-s reveal of a long text still makes 30 visible moves. **Both numbers are TS only:
tuning them needs no build.**

## 3. Units: the segmentation rule

Hand-written code-point ranges (like `speakableText`, `src/editor/model/speech.ts:9-47`; no `\p{…}`, no `Intl.Segmenter` — Hermes support
is unverified and the rule must be exact and testable). Code points are read with `codePointAt`; offsets are UTF-16, as both a JS
string and `NSAttributedString` count.

1. **Clusters** (what the eye calls one character). A new cluster starts at every code point EXCEPT:
   - white space (`SPACE`: U+0009–000D, 0020, 0085, 00A0, 1680, 2000–200A, 2028–2029, 202F, 205F, 3000) — never a cluster; it marks
     that the next cluster begins a new word;
   - invisible format marks (`INVISIBLE`: soft hyphen, ALM, Mongolian VS, ZWSP, ZWNJ, LRM / RLM, embeddings, word joiner…, isolates,
     BOM) and combining / emoji modifiers (`MARK`: combining diacritics, Hebrew points U+0591–05C7, Arabic tashkeel, Cyrillic, extended
     and supplement marks, U+20D0–20FF incl. the keycap, kana voicing, variation selectors, skin tones U+1F3FB–1F3FF, tags) — glued to
     the cluster before;
   - the zero-width joiner U+200D — glued, and so is the code point after it (emoji families, ZWJ sequences);
   - a regional indicator that follows a cluster made of exactly one regional indicator — glued (a flag is a pair).
2. **Words**: a cluster begins a new word when white space came before it, when it is the first, or when it or the cluster before it
   is CJK (`CJK`: radicals, CJK punctuation, kana, bopomofo, ideographs incl. extensions, compatibility ideographs, fullwidth forms) —
   so in Chinese and Japanese each character is its own word. Hangul and Thai keep their own spacing rules (Hangul words by spaces;
   Thai, written without spaces, is one word per run — said in §10).
3. **Units**: Word by word → one unit per word. Typewriter → one unit per cluster, EXCEPT a word that holds any cluster in a
   **JOINED** script (`JOINED`: Arabic incl. Persian / Urdu and its supplements and presentation forms, Syriac, Thaana, NKo, Mandaic,
   the Indic blocks U+0900–0DFF, Thai, Lao, Tibetan, Myanmar, Khmer, Mongolian, Hangul conjoining jamo, Balinese and neighbours) — that
   word is ONE unit. Reason: a colour boundary inside such a word can change its shaping (Arabic joining forms, Indic conjuncts), so a
   cut never falls inside one; Persian words joined by ZWNJ stay one word (ZWNJ is not a space). Hebrew does not join: letter by letter,
   its points glued.

The white space after a unit belongs to it (invisible either way); white space before the first unit is in every prefix.
Vectors (computed, pinned in Task 1): `"Hi you"` → Typewriter `[1,3,4,5,6]`, Word by word `[3,6]`; `"👨‍👩‍👧!"` → `[8,9]`;
`"🇫🇷🇩🇪🇮"` → `[4,8,10]`; `"1️⃣"` → `[3]`; `"שָׁלוֹם"` → `[3,4,6,7]`; `"سَلام دنیا"` → `[6,10]` both; `"Hi سلام you"` → `[1,3,8,9,10,11]`;
`"नमस्ते दुनिया"` → `[7,13]`; `"你好世界"` → `[1,2,3,4]` both; `"   "` → `[]`.

## 4. The preview

Follow the caption highlight's path exactly: `OverlayLayer` passes `time={playhead}` for a text with a reveal (as it does for a caption
with a highlight); `OverlayText` computes `revealCut(o, time)` and, when it is not null, EVERY layer it draws — glow, shadow, outline,
fill — gets the same children: the shown prefix as a plain string, then ONE nested `KitText scale="fixed"` holding the rest with
`{ color: "transparent", textShadowColor: "transparent" }`. So:

- the whole string is in every layer from the first frame: the wrapping and the box are final (the frame-only copy draws the whole
  text, as today);
- a hidden glyph draws no fill, and its `NSShadow` (glow, shadow, the outline halo) has a clear colour — the nested span's
  `textShadowColor` replaces the parent's (verified in the RN source, §0); a clear glyph has no alpha for a shadow to come from anyway;
- the last step and every time after it draw the plain string, exactly the tree of a text without a reveal.

Nothing new is subscribed: `OverlayLayer` already re-renders with the playhead. Reading order: a logical prefix, and both React Native
and Core Text lay bidirectional text out visually from logical ranges — nothing in either drawing uses visual order.

## 5. The export — per-step copies, the caption highlight's mechanism

The export rasterises its text layers once; time only switches layers on and off. So a reveal is, exactly like the highlight, a set of
**copies shown in turn**:

- The request carries the plan as its OWN optional key: `reveal: { cuts: number[]; from: number[] }` on a text whose plan has ≥ 2 steps
  (`exportReveal`), and `animIn: null` for it. A text without a reveal has NO `reveal` key — the PROOF JSON stays byte for byte.
- Swift: `struct ExportReveal: Record { cuts: [Double]; from: [Double] }` (as built: Double, so a non-whole cut is refused by `TextReveal.steps` rather than failing to decode), `ExportOverlay.reveal: ExportReveal?`, and a pure
  `TextReveal.steps(cuts:from:length:life:)` (new `TextReveal.swift`, Foundation only, like `CaptionWords.swift`) that checks the numbers
  (≥ 2 steps, equal counts, cuts strictly increasing in 1 … length and ending at length, times strictly increasing from exactly 0,
  finite, below the life) and adds each step's end; anything else → `[]` → the text is drawn whole, as before.
- In `overlayLayer`, ONE new guarded block after the shadow block and before the caption block: the text layers already built
  (`container.sublayers`, bottom → top: glow, shadow, fill — each made by `textCopy`) are copied once per step but the last, from their
  own attributed string with `kCTForegroundColorAttributeName` AND `kCTStrokeColorAttributeName` set to `UIColor.clear` over
  `[cut, length)`, with the pass's `shadowColor / shadowOpacity / shadowRadius / shadowOffset`, added above, and shown by `addVisibility`
  during `[start + from, start + to)` at the pass's own opacity (the shadow copy's opacity carries the shadow's strength). The original
  layers get `addVisibility` from the last step's `from` to the text's end. Group opacity is switched on (copies overlap like the glow).
- Every pass respects the reveal: the fill (clear fill), the outline (the stroke is in the same attributed string — clear stroke), the
  glow and the shadow (each a tinted copy whose layer shadow is cast from what it draws — a clear glyph draws nothing, so it casts
  nothing). **Unverified until a phone shows it:** that a `CATextLayer` glyph whose fill and stroke are clear contributes no alpha to its
  layer's shadow (it is how `CALayer` shadows are defined — from the layer's alpha — but no clear-glyph shadow is drawn anywhere today).
- The background box is the container's own colour: **full size from the first frame**, as in the preview.
- An Out, a Loop or keyframes still work: they animate the container; the copies are direct sublayers, so `addMotion` makes them sharp
  as it does the fill.
- Cost: at most 29 × 3 copies + the 3 layers. Each copy has its own backing store; the caption highlight already makes one full-size
  copy per word. **Unverified:** memory at 4K with a long text, glow and shadow and a 2-s reveal (the phone checklist's worst case; the
  lever is `REVEAL.maxSteps`, TS only).

## 6. Old builds and Expo Go

- A new native ability, so a new TOP row of `LEVELS`: `{ name: "text reveal", title: "Text reveal", has: isTextRevealBuild }`, known by a
  marker function `Function("textReveal") { () -> Bool in return true }` and `isTextRevealBuild()` in `modules/clipy-video/index.ts`.
- An OLDER build that exports a project with a reveal: the request's `reveal` key is ignored by its records (`Record.swift:111-140`) and
  `animIn` is null, so **the text simply appears whole for its whole life** — never an error, never a different position.
- Picking a reveal tile where the native module IS linked but has no `textReveal` (an installed build from before) → the toast
  `REVEAL_TOOLS = NEEDS_LATEST_BUILD("Typewriter and Word by word")` and nothing changes. **In Expo Go (no native module) the tiles work**:
  the reveal is preview-only there and Expo Go cannot export at all — the owner's daily testing (AGENTS.md: Expo Go) needs to see it.
  This is the one difference from tools that need native code to do anything; it is stated in the AGENTS.md line.

## 7. The screen

- The text's Animation strip, In tab: two more tiles AFTER Rise — "Typewriter" (`keypad-outline` → SF `keyboard`) and "Word by word"
  (`reader-outline` → SF `text.alignleft`), both SF Symbols 1.0, both new Ionicons names added to `SF_SYMBOLS` and `USED`. Labels in
  sentence style (tile labels). Appended, not first: every existing tile keeps its place and position test. Only for a text — a
  sticker's In row and every Out row keep the ten.
- Same Length slider, same one-undo-step pick, same transaction per drag.
- Text through the kit (`KitText` with `scale="fixed"` — it is on the video); the count in `FIXED_EDITOR` for `OverlayText.tsx` grows by one.

## 8. Captions, Out, stickers

- **Captions: refused.** A caption never animates (`setOverlayAnimation`, `withMotion` and `toExportOverlay` all force none) and it
  already shows its words in time with the speech by the highlight; a second, independent timing of the same words would fight it.
- **Out: not offered.** Reversing a reveal is not free on either side (the windows would run backwards and the last step would no longer be
  the plain layers), and the owner asked for appearing. The clamp drops a reveal id from Out.
- **Stickers**: none (the clamp and the op refuse it).

## 9. What does not change

Read aloud, the Text panel and its rows, text templates (they name only existing ids; applying one REPLACES a reveal, as it replaces any
In), Quick edit recipes, `overlayLayout.ts` ↔ `OverlayLayout.swift`, `Motion.swift`, `OverlayMotion.swift`, `CaptionWords.swift`, the
mirrored pairs and their PROOFs, the save chain, undo history, `.clipy` files (they carry the document as is).

## 10. Unverified until a phone (or a compile) shows it

1. The Swift compiles (no toolchain here; read line by line against `expo-modules-core/ios` and the module's idioms — Task 5).
2. A clear glyph casts no layer shadow in the export (glow, shadow) and no `NSShadow` in the preview.
3. Core Text and TextKit keep a word's shaping across a COLOUR-only boundary between letters. For joined scripts no cut falls inside a
   word; for Latin a ligature (fi, fl) or a kerning pair split by a cut may change for that one step — and on a centred or right-aligned
   line could move the visible letters by a pixel. Fallback if seen: switch ligatures off for a revealing text on both sides.
4. Memory and export time with 90 extra layers at 4K (lever: `REVEAL.maxSteps`).
5. Preview vs export: the same step on the same frame, at 24 / 30 / 60 fps.
6. Thai (no spaces) reveals a whole run at once; Hangul conjoining jamo (rare) are whole words — acceptable, said here.
7. Whether `Intl.Segmenter` exists in this Hermes — irrelevant to the design, not used.

## As built (2026-10-14)

Commits on `text-reveal`: d2b7f99 (model), 82d92ca (preview), a86d378 (export, build row), e4c5d99 (controller fix), c83f32a (the
tiles), 1e050c6 (the review's minor 1) and the docs commit; merged into `next-build`.

- **Controller fix e4c5d99.** The Swift's step cap `TextReveal.maxSteps` is 120, a SAFETY bound above the app's own
  `REVEAL.maxSteps` (30), not a copy of it — so tuning the steps stays a JavaScript change (pinned: `REVEAL.maxSteps` ≤ the Swift
  cap). In `overlayLayer` the per-step layer is named `stepLayer`, so it shadows nothing declared later in the function.
- **`ExportReveal.cuts` is `[Double]`** (§5 said `[Int]`): a non-whole number is refused by `TextReveal.steps` (the text is drawn
  whole) instead of the record failing to decode. §5 is corrected above.
- **The review's six minors** (task-5-review.md):
  1. The XCTest's vector table had no parity test — FIXED: `textReveal.swift.test.ts` parses its rows and compares them with
     `REVEAL_UNIT_VECTORS` (seen red with one Swift number changed).
  2. The XCTest on the vectors checks only that the cuts fit — left: segmentation is TypeScript only and tested in Jest; the Swift
     test only has to show the app's cuts are accepted.
  3. `[Int]` vs `[Double]` — the spec sentence is corrected (above).
  4. The emoji check — written into the phone checklist FIRST among the reveal checks (below).
  5. Re-render per playhead tick — left: inherited, `OverlayLayer` already re-rendered every overlay per tick before this.
  6. The AGENTS.md line — written ("Text reveal").

### The emoji question (open until a phone shows it)

Apple Color Emoji is a bitmap colour font (`sbix`): its glyphs are pictures, and they ignore the RGB of the text colour. Whether they
honour the colour's ALPHA — and so whether a clear colour hides them — is not settled by anything that can be read here:

- Preview: React Native turns `color: "transparent"` into a clear `NSForegroundColorAttributeName` for the span
  (`RCTAttributedTextUtils.mm`, `RCTEffectiveForegroundColorFromTextAttributes`: alpha 0) and draws the text with TextKit,
  `-[NSLayoutManager drawGlyphsForGlyphRange:atPoint:]` (`RCTTextLayoutManager.mm`). What TextKit does with a colour glyph under a
  clear foreground is inside Apple's code; React Native has no emoji-specific path.
- Export: `CATextLayer` draws through Core Text with `kCTForegroundColorAttributeName` = `UIColor.clear.cgColor`. Apple documents
  no rule for the foreground alpha of an `sbix` glyph; a bitmap glyph is drawn as an image, and an image is not filled with the
  fill colour.

So: **UNCERTAIN.** Nothing was guessed in Swift. The phone checklist tests it FIRST among the reveal checks. **Wrong looks like:**
an emoji visible before the letters in front of it have arrived (in the editor, in the exported file, or both — the two may differ,
since TextKit and `CATextLayer` are different drawers). Its glow and shadow are checked in the same step.

**Fallback if the phone shows it (not built):** a text whose reveal would hide a colour emoji is NOT revealed — `revealPlan`
returns no plan (fewer than two steps) when any unit after the first holds an emoji code point (the pictographic ranges, the
regional indicators and the keycap sequences; a test vector per kind). Then BOTH sides follow with no build: the preview draws the
whole text and the request carries no `reveal` key, exactly as for a text without a reveal; the tile stays pickable and simply
shows the text whole (say so in the tile's message only if the owner wants it). Considered and rejected: replacing an unrevealed
emoji by an invisible placeholder of the same width — the width of a colour emoji in each font cannot be known in TypeScript
without measuring, and a different width re-wraps the line and moves the letters already shown; a per-step mask over the hidden
glyphs in the export — Swift only (the preview has no glyph rectangles), so the two would differ. If only ONE side shows the
emoji early, the same fallback still applies (both sides must agree).
