# Captions follow cuts, and Remove filler words (design)

Branch `caption-cuts` (from `next-build`, which has Remove pauses). Plan: `docs/superpowers/plans/2026-10-17-caption-cuts.md`.

## 0. What the owner gets (the approved drawing)

1. **Captions stay in step.** After Remove pauses, the captions, texts and stickers over the clip move with the picture; a
   caption word that sat inside a removed gap goes too. Music and other sounds still do not move.
2. **Remove filler words.** In the Captions panel, a row **Filler words** · "N found", the note "um, uh, erm, hmm — cut from the
   video and the captions", and the white main button **Remove N Filler Words** ("Remove 1 Filler Word"). The row shows only
   when there are captions. It cuts each filler word's moment out of the video clip under it AND takes the word out of its
   caption — ONE undo step for every clip — and says "N filler words removed" with Undo.

No native code, no listening, no schema bump, no `LEVELS` row: everything is pure TypeScript over what the project already
holds, so it works in Expo Go.

## 1. What exists (read on this branch)

- `removePauses(p, clipId, cuts)` (ops.ts): replaces one MAIN video clip by the pieces of its trim BETWEEN `cuts` (SOURCE
  seconds, in order, inside the trim), by the split rules; refuses (same project) a photo, a reversed or ramped clip, a clip whose
  sound is on its own bar (`extractedTrackOf`), no cut / more than `PAUSES.maxCuts`, a cut out of order / empty / outside the
  trim, no piece left, a piece under `MIN_CLIP_SECONDS`. Today nothing else moves — overlays, layers, effects, the cover, the
  markers keep their project times, so everything after the cut drifts later relative to the picture.
- `findPauses` (pauses.ts): after finding quiet runs it applies the piece rules — no piece under `minPiece`, at most
  `PAUSES.maxCuts` (the longest kept). `pauseOptions` turns OUTPUT seconds into source seconds through `sourceAfter`.
- Times: overlays (`start`/`end`), effects (`start`/`end`), layers (`start`), the cover (`time`) and `beatMarkers` are PROJECT
  seconds. An overlay's keyframes `t` are seconds FROM ITS START; a caption's `words` are seconds from the caption's start
  (`CaptionWord`); animation In / Out are DURATIONS (fitted to the length by `edgeDurations`). A clip's (and a layer's) keyframes
  are in its own source / local time and do not depend on its place.
- `clampCaptionWords(words, text, length)`: clamps word times into [0, length], sorts, and returns [] when the words joined by
  single spaces are not the caption's text (white space normalised).
- Captions are made by `useCaptions` (native `transcribe`, `SFSpeechRecognizer(locale: Locale.current)`), turned into lines by
  `mergeSegmentsIntoLines` / `linesToCaptions`. A caption stores NO language. Editing a caption's text clears its words.
- `CaptionsSheet.tsx`: a compact `ToolPanel` (body scrolls, 171 pt visible); states unavailable / idle (with or without
  captions) / running / done / error. Idle-with-captions shows the white `Replace`, grey `Style Captions`, quiet `Cancel`.
- Cut to beats (`cutToBeats`, beats.ts) shortens clips from their end; nothing follows it.

## 2. Decisions

### 2.1 One time map — `src/editor/model/rippleCuts.ts` (new, pure)

- `removedOf(p, clipId, cuts)`: a clip's cuts (source seconds) as the PROJECT ranges they take away: `[S + sourceToOutput(clip, a),
  S + sourceToOutput(clip, b)]`, S = `clipStartTimes(p)[i]`, each cut clamped to the trim. Only timeline.ts helpers — no speed
  arithmetic here (AGENTS: only timeline.ts multiplies / divides by speed).
- `mergeRemoved(ranges)`: drops non-finite and empty ranges, sorts, merges overlapping / touching ones.
- `mapTime(ranges, t)` = `t − (removed time before t)`; a time INSIDE a removed range collapses to that range's start (so it is
  monotone, never decreasing, identity before the first range). Vectors pinned (§7).
- `inRemoved(ranges, t)`: strictly inside a range (`a < t < b`).
- ALL the ranges of one operation are computed from the ORIGINAL project (every clip's start before anything is cut), merged, and
  applied as ONE map. That is the composition: a time after two cut clips loses both clips' removed time; there is no
  intermediate project and no order to get wrong. A test proves it equals cutting the clips one after the other, last first AND
  first first (each step computing its map on the project it is given).

### 2.2 What follows the map ("what is tied to the picture moves, sound does not")

| Thing | Follows? | How | Why |
|---|---|---|---|
| Text, caption, sticker overlays | yes | `start`, `end` mapped (3 decimals, `end` ≤ the new total) | they are drawn over a moment of the picture |
| Overlay keyframes (`t` from the start) | yes | `t' = map(start + t) − start'`, then `clampOverlayKeyframes` (two pins that collapse onto one time: the earlier is kept, the sanity rule's own choice) | a pin marks a moment of the picture |
| Animation In / Out / Loop | unchanged | they are durations; `edgeDurations` already fits them to a shorter overlay | not a time |
| Caption words | yes | a word whose MIDPOINT is strictly inside a removed range is dropped; the rest are mapped like pins (relative to the new start) | a word is a moment of the picture's sound; when its middle is cut, it is no longer heard |
| Effect bars | yes | `start`, `end` mapped | drawn over the picture |
| Layers (picture in picture) | `start` only | `start' = map(start)`; their length is their own clip's and does not change; their own keyframes are local | a layer is placed against the main picture; its own video is not cut |
| The cover | yes | `cover.time` mapped, clamped to the new total | it is a frame of the picture |
| Music, voice, sound effects, speech (Read aloud) bars | **no** | untouched, as today | sound does not move (the drawing) |
| Beat markers | **no** (changed from the brief — see §2.9) | untouched | they mark the MUSIC's beats (`placeBeats`), and the music does not move |
| Clips' own keyframes, speed curves | unchanged | (source / local time) | as the split rules |

- Identity before the first removed range: everything before the cut clip's start (and before the first cut inside it) keeps its
  object. An array where no element changed is the SAME array (`toBe`), so a cut at the very end moves nothing.
- **Removed:** a text / sticker / caption whose mapped length is under `OVERLAY_LIMITS.minDuration` (0.2 s); a caption that HAD
  words and has none left; an effect whose mapped length is under `EFFECT_LIMITS.minDuration` (0.2 s). Only something whose times
  changed is judged (an older short item that the cut does not touch stays). A caption with no words (its text was edited) is
  only shortened.
- **A caption's text** is rebuilt from its remaining words, joined by single spaces, ONLY when a word was dropped (else the text is
  kept byte for byte). It cannot fail the normaliser: the words passed `clampCaptionWords` before, so each word's text has no
  leading / trailing white space and no white space but single spaces inside (else the joined words could not have equalled
  the normalised text); any subset joined by single spaces is therefore its own normal form. The words are still passed through
  `clampCaptionWords(words, text, captionLength(start, end))` as the last step, and a test asserts it returns them unchanged.
- **Layers' limit:** the map can move a later layer onto an earlier one. If the moved layers would have more video layers on
  screen at once than `LAYER_LIMITS.maxVideoAtOnce` AND more than before (`videoLayerOverlap`), the whole operation is REFUSED
  (same project) — the strip / row then says "Nothing was removed." (an older file already over the limit does not block).

### 2.3 The op — `removeCuts(p, list)` in ops.ts; `removePauses` built on it

- `type ClipCuts = { clipId: string; cuts: readonly PauseCut[] }`.
- `removeCuts(p, list)`: for each entry, the pieces exactly as `removePauses` makes them today (the body moves to a private
  `piecesOf(p, clipId, cuts): Clip[] | null`, its refusals unchanged); ANY refusal, or the same clip twice, or an empty list →
  the same project (all or nothing). Then the clips are replaced (each by its pieces, one `normaliseTransitions`), the time map of
  §2.1 is built from the ORIGINAL project and `rippleTimed` (rippleCuts.ts) gives the new overlays / effects / layers / cover, the
  layer limit is checked (§2.2), and ONE `touch` writes it (which refits the effects to the new length, as before).
- `removePauses(p, clipId, cuts)` = `removeCuts(p, [{ clipId, cuts }])`: same signature, same refusals, same pieces, same ids
  (the `newId` calls happen in the same order). The strip still applies it in ONE `apply`. Its "N pauses found · X s shorter"
  (`pauseSaving`, the clip's own saving) and its shading (`pauseShades`, source cuts on the clip) are untouched: neither reads
  anything that now moves.
- `canCutClip(p, clip)` (ops.ts, exported): a MAIN clip that is a video, not reversed, with no speed curve, whose sound is not on
  its own bar — the one statement of what `piecesOf` accepts; the fillers finder asks it. `contextFor`'s `pausable` keeps its own
  line (not edited) and a test asserts the two agree on a table of clips.
- **Cut to beats is not changed** and does not ripple (it shortens clips from the end; the owner did not ask; its PROOFs stay).

### 2.4 Fillers — `src/editor/model/fillers.ts` (new, pure)

- **The table (English).** A word is a filler when, lower-cased and with leading / trailing punctuation removed (exactly
  `. , ! ? ; : … " ' “ ” ‘ ’ ( ) [ ] - – —` and white space), it matches one of the forms
  `u+m+` (um, umm), `u+h+` (uh, uhh), `u+h+m+` (uhm), `e+r+m+` (erm), `h+m+` (hm, hmm), `m{2,}` (mm, mmm) — ASCII only, so
  "ümm" or "umbrella" never match. `mm` is NOT a filler right after a word ending in a digit ("5 mm").
  Left out on purpose: **er** (German "er" = "he", and the recogniser writes English hesitations as "uh"), **ah / oh** (they carry
  meaning: "ah, I see"), **like / you know / so** (words with meaning; cutting them changes what was said).
- **Other languages: English only.** A caption stores no language; it was recognised in the phone's language
  (`Locale.current`). `um` is a common German word ("um 5 Uhr"), so the table is used only when the phone's language is English:
  `fillersSpoken()` in `src/editor/captionLanguage.ts` (the only file that asks; `Intl.DateTimeFormat().resolvedOptions().locale`,
  inside try; a language that cannot be read counts as English — Hermes always answers). Otherwise the row says
  "Filler words are found in English captions only." and offers nothing.
- **The words looked at:** every word of every `kind: "caption"` overlay that has words, at its project time
  (`caption.start + word.start` … `+ word.end`), sorted by start; two words at the same rounded times with the same text (a
  duplicated caption) are ONE moment, counted once.
- **Padding:** `FILLER.pad` = 0.04 s of OUTPUT time each side, never into a neighbour word: the cut runs from
  `min(ws, max(ws − pad, previous word's end))` to `max(we, min(we + pad, next word's start))` (neighbours are all words, fillers
  or not), then clamped to the clip, then turned into source seconds with `outputToSource` (timeline.ts) and rounded to ms.
- **Which clip:** a filler is cuttable only when its word lies WHOLLY inside ONE main clip (`S − ε ≤ ws` and `we ≤ S + D + ε`)
  that `canCutClip` accepts. Otherwise it is counted "can't be cut": over a photo, a reversed or ramped clip, a clip whose sound
  is on its own bar, across a cut between two clips.
- **Merging:** within a clip, cuts that overlap or touch merge into one (so "um uh" said together is one cut; a gap longer than
  2 × pad between two fillers is NOT cut — that is Remove pauses' job).
- **The piece rules of pauses, shared:** cuts under `PAUSES.minCut` (0.05 s source) are dropped; then `fitCuts` — extracted from
  `findPauses` without changing what it answers (`pauses.test.ts` unchanged and green) — drops a cut after a piece under
  `PAUSES.minPiece` (0.3 s OUTPUT, turned into source by `sourceAfter`, as `pauseOptions`), the last cut while the tail is short,
  and keeps at most `PAUSES.maxCuts` (the longest). Every word of a dropped cut is "can't be cut".
- **Oracle:** a clip whose kept cuts `removeCuts` would still refuse alone (e.g. no piece left) has all its words moved to
  "can't be cut". So every word counted as removable really is removed by the op.
- `fillerPlan(p): { found; removable; cannot; cuts: ClipCuts[] }` — `found` = filler moments, `removable` = moments in kept cuts,
  `cannot = found − removable`, `cuts` in clip order. Pure; called on every render of the panel (memoised on the project).
- **Removing the word:** nothing removes words by id. The filler's cut covers its whole word, so its midpoint is inside a removed
  range and the ripple (§2.2) drops it — one rule for pauses and fillers; a test asserts that every removable filler is gone from
  its caption and every neighbour word stays.
- Edge cases: a caption whose only word was a filler is removed; a filler under a speech / voice bar is still cut from the clip
  (the bar does not move — sound does not); a clip whose file is missing is cut like any other (the model only); a project with
  captions but no word timings shows no row.

### 2.5 The row — `src/editor/components/FillerWordsRow.tsx` (new), in `CaptionsSheet.tsx`

- Shown as the FIRST child of the Captions panel's body when the project has a caption WITH words and the state is not
  `running` or `error` (unavailable, idle, done). Natural heights inside the scrolling body (the panel's own heights are
  unchanged: `size="compact"`, `PANEL`).
- Lines (sentence style; the button title style):
  - "Filler words" and, trailing, "N found" / "None found".
  - The note "um, uh, erm, hmm — cut from the video and the captions" (small, muted).
  - When `cannot > 0`: "1 is over a part that can't be cut." / "N are over parts that can't be cut."
  - When `removable > 0`: the white `PrimaryButton compact tone="plain"` **Remove 1 Filler Word** / **Remove N Filler Words**.
  - Not English: "Filler words" and "Filler words are found in English captions only." — no count, no button.
- **One white button in view (AGENTS: at most one).** While the row offers its button, the idle-with-captions card's `Replace`
  is the grey `SecondaryButton` (same compact size, same title); otherwise it is the white one, exactly as today (the existing
  tests' captions have no words, so they see no row and are unchanged).
- **The tap:** the plan is computed AGAIN on the store's project; if its cuts are not the ones shown, the panel closes and says
  `FILLER_CHANGED` "The captions have changed. Nothing was removed." (`kind: "problem"`, no Undo) and nothing changes. Else
  `removeCuts`; the same project back → "Nothing was removed." (problem). Else `haptic("medium")`, ONE `apply`, the panel closes
  (close first …), and "1 filler word removed" / "N filler words removed" with `{ kind: "done", undo: true }` (… say second).
  A selected caption that the cut removes is cleared by the store's own `afterChange`.

### 2.6 Words (all in `FILLER_WORDS` / functions in FillerWordsRow.tsx)

`title` "Filler words", `none` "None found", `found(n)` "N found", `note`, `cannot(n)`, `englishOnly`, `button(n)`,
`removed(n)`, `FILLER_CHANGED`, `notRemoved` = `PAUSE_WORDS.notRemoved`.

### 2.7 Guards respected

Casing (title-style button; sentence-style rest), Text size (Body / kit only; no `fit` — "N found" is short and fixed but needs no
shrink; nothing in `FIXED_*` / `FIT_*` changes), Palette (`useSurfaces` is not read: editor tone; `theme.colors` / kit only, no hex),
Spacing (`theme.space` only; no new `spacingScale` allowance), Icons (none added), Messages (one step, said after `apply`, Undo),
Effects registry (no speed arithmetic outside timeline.ts), no schema change, no Swift, no `LEVELS` row.

### 2.8 Docs

AGENTS.md: amend the Remove pauses line (what follows the cut), add the Messages list entry "Remove filler words", add a dense
"Filler words" line. Phone checklist part N in `docs/next-build-phone-checklist.md`; item 54 ("Text stays") rewritten as "Text
follows".

### 2.9 Decisions changed from the brief, with the reason

1. **Beat markers do not move.** They are the music's beats (placed by `placeBeats` from the music, or by hand on the music);
   the music does not move, so moving them would put every marker off its beat.
2. **The row needs captions WITH word timings**, not only captions: a caption without words (text edited, or an older project)
   can never yield a filler, and showing the row there would push the existing Replace card below the fold for nothing.
3. **Replace turns grey while the filler button shows** (the one-white-button rule).
4. **No `er`** in the table (German pronoun; the recogniser spells English hesitation "uh").

## 3. Files

| File | Change |
|---|---|
| `src/editor/model/rippleCuts.ts` | NEW: `Removed`, `removedOf`, `mergeRemoved`, `mapTime`, `inRemoved`, `rippleTimed` |
| `src/editor/model/pauses.ts` | `fitCuts` extracted from `findPauses` (same answers) |
| `src/editor/model/ops.ts` | `ClipCuts`, `canCutClip`, private `piecesOf`, `removeCuts`; `removePauses` on top |
| `src/editor/model/fillers.ts` | NEW: `FILLER`, `isFiller`, `fillerPlan` |
| `src/editor/captionLanguage.ts` | NEW: `phoneLanguage`, `fillersSpoken` |
| `src/editor/components/FillerWordsRow.tsx` | NEW: the row and its words |
| `src/editor/components/CaptionsSheet.tsx` | the row first in the body; Replace grey while the row offers its button |
| tests | NEW `rippleCuts.test.ts`, `ops.removeCuts.test.ts`, `fillers.test.ts`, `RemovePausesSheet.ripple.test.tsx`, `CaptionsSheet.fillers.test.tsx`, `captionLanguage.test.ts` |
| docs | AGENTS.md, phone checklist |

## 4. Tests that may change, and only as stated

- `src/editor/model/__tests__/ops.removePauses.test.ts`, the test "the transition into the clip stays …": its last line
  (`q.overlays` / `q.layers` `toBe`) is replaced by the new rule (the overlay inside the cut is removed, the layer moves to
  4.8; audio tracks and markers still `toBe`); its title's "nothing else moves" becomes "sounds and markers do not move". No other
  line of that file changes. Every PROOF named in AGENTS.md, `pauses.test.ts`, `CaptionsSheet.test.tsx`,
  `RemovePausesSheet.test.tsx`, `beats*.test.ts`: unchanged.

## 5. Unverified until a phone (checklist part N)

Whether Apple's on-device recogniser writes "um" / "uh" at all (it may leave hesitations out — then the row says "None found");
how accurate its word edges are (the 0.04-s pad); clicks at the joins; that a removed filler leaves no half word; the panel on a
375-pt phone at large text.

## 6. Risks

- The recogniser's word timings are approximate: a cut may clip a neighbour's first / last consonant (the pad is small and never
  crosses a neighbour's recorded edge).
- A voice-over or a Read aloud bar recorded over the clip stays where it was while the picture and its text move (sound does not
  move — the drawing). Read aloud again re-places a speech bar.
- `Intl` locale in Hermes is the phone's language on a phone; Jest reads the computer's — tests mock `captionLanguage`.
- Captions store project times and are tied to no clip. A trim, a move or a delete made AFTER transcribing leaves them out of
  step with the voice; a filler cut then lands beside the hesitation, on real speech (and the "um" still leaves its caption). Not
  guarded in this build (nothing records which clip a caption was heard in); listed in checklist part N (item 66); Undo restores it.
- Remove pauses now also removes a text / sticker wholly inside a removed pause (the §2.2 rule); "N pauses removed" does not say
  so. Undo brings it back; checklist item 54.

## 7. Vectors (pinned in `rippleCuts.test.ts` / `fillers.test.ts`)

- `mergeRemoved([[5,7],[2,3],[2.5,4],[1,1],[NaN,2]])` → `[[2,4],[5,7]]`.
- With `[[2,3],[5,7]]`: `mapTime` at 1, 2, 2.5, 3, 4, 5, 6, 7, 8 → 1, 2, 2, 2, 3, 4, 4, 4, 5.
- Clips a (4 s), t (trim 2 … 12), z: `removedOf(t, [[4,5],[8,9.5]])` → `[[6,7],[10,11.5]]`; at speed 2, `[[4,6]]` → `[[5,6]]`.
- Caption 5 … 9 "so um we go" (so 0–0.4, um 0.6–0.9, we 1.5–1.8, go 2.6–3.0) under `[[6,7]]` → 5 … 8, "so um go",
  words so 0–0.4, um 0.6–0.9, go 1.6–2.0.
- Fillers, one 10-s clip, caption 1 … 4 "so um we uh go" (so 0–0.3, um 0.5–0.8, we 1.0–1.3, uh 1.4–1.6, go 2.0–2.4): cuts
  `[[1.46,1.84],[2.36,2.64]]`, found 2, removable 2; after `removeCuts` the caption is 1 … 3.34 "so we go", words so 0–0.3,
  we 0.62–0.92, go 1.34–1.74.

## 8. As built (2026-10-17)

- Tasks 1–4 as the plan: `rippleCuts.ts`, `removeCuts` / `canCutClip` / `piecesOf` in ops.ts (`removePauses` on top), `fitCuts`
  extracted from `findPauses`, `fillers.ts`, `captionLanguage.ts`, `FillerWordsRow.tsx`, the row in `CaptionsSheet.tsx`.
- After review:
  - The plan is computed ONLY while the row is on screen (the panel visible, not styling, not running or failed, English).
    `CaptionsSheet` is always mounted, and the first version planned on every project change — every frame of a drag — with the
    panel closed. Pinned by call count (`CaptionsSheet.fillers.work.test.tsx`).
  - The oracle is asked for the whole operation too: clips each accepted alone but refused together (the layers' limit) offer
    nothing (every filler "can't be cut", no button) — so a tap can never end in "Nothing was removed." again and again.
  - `mapTime`'s result is rounded to 3 decimals only when it moved: an item before the first cut keeps its object (and is not
    judged by the 0.2-s rule), as §2.2 says, even with a drag's many-decimal times.
  - `FILLER_WORDS.notRemoved` stays a copy (importing the strip pulls in the native wrappers) and is pinned equal to
    `PAUSE_WORDS.notRemoved`.
  - The Captions panel's body scrolls when the row is shown (the idle card was 166 pt in a 171-pt body without it); the comment
    says so, AGENTS allows it, and checklist item 65 checks it.
- Not built: a guard against captions out of step with the picture (§6).
