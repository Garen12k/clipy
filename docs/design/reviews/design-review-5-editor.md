# Design review 5 — the editor (package 5, answering review 4)

Read-only review. Nothing was rendered and no package code was run; every number is recomputed by hand from the source. The only script I ran is my own text-width estimate (`scratchpad/calc5/measure.js`).

**Read in full:** `README.md`, `review-4.md`, `original-brief.md` §0, §4, §13.14 (the rest of §10–14 through our round-4 findings), `10 Editor v2`, `EditorPhone2` (all 329 lines), `Toolbar`, `11 Strips v2`, `11b Panels and Messages v2`, `14 Review 4`, the scripts and visible text of `3 Components` and `13 Tokens and Accessibility`, and the diff of `3 Components`, `13 Tokens`, `1 Foundations` and `Toolbar` against package 4. Our two round-4 findings files. App side: `toolbarContext.ts`, `timelineLayout.ts`, `ReorderHandle.tsx`, `TrimHandles.tsx`, `MultiSelectBar.tsx`, `TransportRow.tsx`, `CropScreen.tsx`, `model/cropBox.ts`, `RegionBox.tsx`, `ToolStrip.tsx`, `ToolPanel.tsx`, and a grep of the app's strings.

**Not checked:** anything on a device, real iOS 27 keyboard and safe-area heights, `1 Foundations` beyond its one changed line, boards outside the editor.

**Instructions inside the package:** none aimed at a reviewer. `review-4.md` carries our own "paste everything below the line" note. Treated as data.

**How text fit was estimated:** each sentence measured with Helvetica's published character widths at the stated size, wrapped by words in the real column width, then again 6 % wider as a margin for SF Pro. Where both runs agree I say "fits"; where they differ I say "tight".

---

## 0. Short version

1. The structure holds and the round-4 blockers are gone: Crop is back, the banner is off the video, the longest status sentence fits, four tools show at 375 pt, tabbed strips keep their name, all 16 missing items are drawn.
2. The preview is one size in every state on each phone: **301 / 394 / 444**. Confirmed.
3. Three fixes brought a new fault each: the banner hides the whole transport row, the layer toolbar gained four tools the app does not have, and the Move pill now sits on the clip's badge.
4. One sentence is untrue to the app: the Crop refusal reason.
5. Nothing left needs a redraw. Everything open can be settled in code, where `contextFor` and the real strings are the authority anyway.

---

## 1. Fix-by-fix verdict for review 4

**Tally of the 18 editor points: 10 fixed · 3 fixed but with a new problem · 5 partly · 0 not fixed.**

### Section 1 — blocking points

| # | Point | Verdict | Evidence |
|---|---|---|---|
| 1.1 | Crop is gone | **Partly** | Board R1 (`14 Review 4`): Cancel / Done, the five shapes, Reset, "Loading the picture" placeholder, size readout labelled New feature, a light board. The refusal reason is drawn but states a rule the app does not have (section 6) |
| 1.2 | Banner on the video | **Fixed, new problem** | `EditorPhone2` line 33: banner at `top: trTop`, 44 pt high, no `box-shadow`, two-line clamp; R2 draws Undo, Try Again, Open Settings, Show. New: `showTransport = … && !banner` — the banner replaces the whole transport row (section 5) |
| 1.3 | Longest status sentence cut | **Fixed** | Status block is 76 pt (`status(…, 76)`), text 14 / 18. Three lines = 54 pt in a 56-pt content box. My estimate gives exactly three lines for both long sentences at 299 pt, in both runs. Trim's second refusal has 36 pt, Speed · Normal 32, Collage 36: two lines each, fit. Green screen "too grey": as coded the header note gets about 145 pt and wraps to three 15-pt lines (45 pt in a 44-pt header); it is two lines, as the board says, only if the title takes just its own width — tight, not cut |
| 1.4 | Three tools at 375 pt, Basics of 15 | **Partly (5 of 6)** | Basics is 8, five named groups, no tool twice, group button 52 pt, four tools fully visible, three actions in multi-select (section 3). Not fixed: Select is still slower than today, and C1's table says otherwise |
| 1.5 | Tool lists on C1 | **Fixed, new problem** | Reversed, cut-out / steady, collage cell and layer are corrected exactly as asked. New: `LAYER` is now derived from the clip's groups, so layer and collage cell carry Split, Select, Transition and Freeze — the app has none of the four there (section 3.1). Package 4's layer list did not have them |
| 1.6 | Selected clip crowded | **Fixed, new problem** | Move pill moved to the top centre, keyframes have a 44-pt target, cut markers stay beside the handle, rules for under 100 / under 88 pt and cuts under 44 pt are stated. New: the pill covers the badge in the board's own mock; a moved marker lands on the neighbour's badge; the touch order contradicts itself (section 4) |
| 1.7 | Tabbed strips lost their name | **Fixed** | `hdr('Speed', { tabs })`, `hdr('Speed · 3 clips', …)`, `hdr('Filter · 3 clips')`, `hdr('Stabilize', { tabs })`. Animation: title + "Apply to All" in the header on In, Out and Combo, tabs in the lead of the tile row (`vtabs`) — the same place the app has them today |

### Section 2, point 2 — stale material

| Point | Verdict | Evidence |
|---|---|---|
| 4c, strip block of 4a / 4b, old row library, old colours in 1c | **Fixed** | 4c and the strip block are each replaced by one paragraph pointing at B1 / 11 / 11b. `EditorPhone2` has one row library (no `rowsOld`). Foundations 1c now uses `#79B6F4`, `#E095C7`. Leftovers in section 8 |

### Section 3 — still missing

| # | Point | Verdict | Evidence |
|---|---|---|---|
| 3.1 | Sixteen items | **Fixed — 16 of 16** | Table below |
| 3.2 | Keyboard states at 375 × 667 | **Fixed** | R3 draws six: Trim (Start, End, Apply), emoji search, Fine-tune, custom colour, Cover title, Text. Details in section 7 |
| 3.3 | One main action per panel | **Fixed** | `btns` kind `main` = fill in the label colour. Exactly one per panel (section 7) |
| 3.4 | Compact panels | **Fixed** | Every compact state sums to 236 or 240 (section 7). One new small overflow in Sound quality |
| 3.5 | More rows on larger phones | **Partly** | 40-pt lanes, caps 172 / 212 / 252, each ending on a half row: 2.5 / 3.5 / 4.5. The app shows 2.5 / 4.5 / 5.5. Better than package 4 (2.3 / 2.9 / 3.4), still one row fewer on the two larger phones |
| 3.6 | Largest text size | **Fixed** | Rule stated in S2, R4 and the README: text in strips stops at × 1.16, then the large-content viewer. (Calling × 1.16 "the largest standard size" is loose, but the rule is clear and buildable) |
| 3.7 | Accessibility boards, glass and solid | **Partly** | R4 draws 11 phones: glass toolbar, solid toolbar / strip / panel, Reduce Transparency strip, Increase Contrast toolbar + strip + panel, Bold Text toolbar + strip + panel, all with the full timeline. Not done: "every editor board in both glass and solid" — A2, C1, S1, P1 are glass only. Bold is a 0.45-pt stroke, so widths are not re-measured |

**The 16 items, one by one**

| Id | Item | Now |
|---|---|---|
| M4 | Multi-select title in Filter | Present — `filterMulti`: "Filter · 3 clips", no Apply to All |
| M9 | Rectangle for Blur box / Mosaic box | Present — board R5, `previewBox`. Drawn with four corner handles; the app has two (top-left, bottom-right) plus pinch |
| M12 | Reason for Transition slider at None | Present — `transitionNone`: "Pick a transition to set its length." |
| M13 | "Apply to All" on clip Animation | Present — In, Out, Combo and photo Combo |
| M14 | Photo Combo rule's ending | Present — `animPhotoCombo` note, full sentence |
| M16 | Reason for Motion Strength at None | Present — `motionNone`: "Pick a motion to set its strength." |
| M21 | Curve tiles as charts, 32 and 8 bars | Present — `curveTiles(32)` / `curveTiles(8)`. The shapes are the designer's own formulas, not the app's `curveProfile`; use the app's |
| M25 | Slow motion tab rule | Present — R9 and the S1 foot. Leaves out "not reversed" |
| M38 | Text field on other tabs, "Your text" | Present — `textTop` on every tab, `textNew` shows the placeholder |
| M39 | Duplicate disabled for an empty text | Present — `textPositionEmpty` |
| M42 | Read aloud update-needed, row closed | Present — `readAloudUpdate` |
| M45 | Sticker editor for an emoji | Present — `stickerEditorEmoji`, no colour row, 240 pt |
| M53 | Caption presets with "Aa" | Present — `aaTiles(CAPS)` |
| M76 | Cover Save disabled | Present — `cover` (keyboard up) and `coverSaving` |
| M77 | Templates "This clip" disabled | Present — `templatesNoClip` |
| M78 | Crop placeholder | Present — R1, first phone |

### Section 5, points 2–4

| # | Point | Verdict | Evidence |
|---|---|---|---|
| 5.2 | "Preview only" when there are no captions | **Fixed** | `captionStyle`: "Preview only — this project has no captions yet."; the update case keeps its own sentence (R9, README table) |
| 5.3 | Wording table, invented sentence, remarks | **Partly** | Added: the Combo and Loop notes, five reasons, "A new run replaces…", "Makes the slowed picture fluid", Left / Centre / Right. The formats list is gone. The four remarks are gone from the strips. Still not in the table: section 9 |
| 5.4 | Label the new abilities | **Fixed** | Volume / Fades tabs, tab dots, "Show", Strength in the Reduce noise row (name and value back: "Strength … 50 %") all carry "New feature" |

---

## 2. Geometry, recomputed

From `S` and lines 130–133 of `EditorPhone2`. Points from the top of the screen.

### 2.1 The fixed frame

| | 375 × 667 | 402 × 874 | 440 × 956 |
|---|---|---|---|
| Preview top | 64 | 102 | 110 |
| Transport top | 375 | 516 | 558 |
| Timeline top / cap | 419 / 172 | 560 / 212 | 602 / 252 |
| Rows window (cap − 72) | 491–591 = 100 | 632–772 = 140 | 674–854 = 180 |
| Toolbar | 595–659 | 776–840 | 858–922 |
| Typing bar top (keyboard 260 / 336 / 346) | 367 | 498 | 570 |
| Preview bottom, set by | 365, keyboard | 496, keyboard | 554, **transport** |
| **Preview height** | **301** | **394** | **444** |
| Empty band above the transport | 6 | 16 | 0 |

**Identical in every state? Yes, on all three phones.** `pBot = min(trTop − 4, kbFieldTop − 2)` has no term for the mode, the strip, the panel or the text size. Checked: toolbar; strips S / M / L; tabbed strips; both status blocks; regular and compact panel; all six keyboard states; the × 1.16 text size; the banner. README's 301 / 394 / 444 is right.

The largest phone changed from 458 to 444 because its timeline grew by 32 pt; the transport now sets the preview there, so 14 pt went to one more row. On the 402 phone 16 pt are still empty all the time.

### 2.2 Rows on screen, against the app

App: `visibleLaneRows` = 2.5 + one per 80 pt above 667; rows are 32 pt; clip area 120.

| | 375 × 667 | 402 × 874 | 440 × 956 |
|---|---|---|---|
| App today: rows / rows window / timeline height | 2.5 / 80 / 200 | 4.5 / 144 / 264 | 5.5 / 176 / 296 |
| Design: rows / rows window / timeline height | 2.5 / 100 / 172 | 3.5 / 140 / 212 | 4.5 / 180 / 252 |

Same row count on the small phone; one row fewer on the two larger ones, in exchange for 40-pt lanes (32 today) and a larger preview. README's 2.5 / 3.5 / 4.5 is right.

### 2.3 What each strip covers (rows left visible)

| | 375 × 667 | 402 × 874 | 440 × 956 |
|---|---|---|---|
| No strip | 2.5 rows | 3.5 | 4.5 |
| S 96 | 1.8 | 2.8 | 3.8 |
| M 120 | 1.2 | 2.2 | 3.2 |
| L 168 | **0** | 1.0 | 2.0 |
| L at × 1.16 (195) | 0, and the lower 23 pt of the clip row | 0.3 | 1.3 |
| App today, every strip | 0.5 | 2.5 | 3.5 |

- The clip row, ruler, playhead and transport stay visible, except L at the largest text on the small phone (README says so).
- An L strip hides every row on the small phone and leaves one on the 402 phone. Most strips are L. A tool opened on a bar in the rows (Fade on a sound, Animation on a text) hides its own bar. The app already has `rowScrollTarget`; scroll the selected bar's row into what stays visible when the strip opens.

### 2.4 Panels

| | 375 × 667 | 402 × 874 | 440 × 956 |
|---|---|---|---|
| Design panel (cap + 68) | 240 | 280 | 320 |
| App regular panel today | 307 | 402 | 430 |
| Body under the 44-pt header | 196 | 236 | 276 |
| Body under header + tab row | 152 | 192 | 232 |
| Text panel: under header + field + tabs (all "stay at the top") | **100** | 140 | 180 |

Panel bottom = toolbar bottom on every phone (checked). The Text panel on the small phone keeps 100 pt of scrolling body if the field is pinned: one tile row and a sliver. One open Style row (188 pt and more) never fits in view.

### 2.5 The 76-pt status block

- Column: strip 367 − 24 padding − 20 block padding − 24 symbol and gap = **299 pt**, text 14 / 18.
- "Remove background does not work together with Stabilize or Smooth slow motion. Switch those off for this clip first." → 3 lines (275 / 277 / 155 pt; 6 % wider: 292 / 294 / 164).
- "Smooth slow motion does not work together with Remove background. Switch Remove background off for this clip first." → 3 lines (272 / 263 / 194).
- Three lines need 54 pt; the block's content box is 56 pt and the clip edge is 7 pt further down. **It truly holds three lines.** A fourth would be cut; no sentence in D2 needs four at this width. Stabilize's longest needs three in a block that holds four.
- At × 1.16 the board zooms width and height together, so the wrap is the same.

---

## 3. Toolbar against the app

### 3.1 Every context, from `contextFor`

| Context | App | Board C1 / `Toolbar` | Result |
|---|---|---|---|
| Main bar | 13 | same 13, same order | OK |
| Empty project | Audio, Effects, Ratio | same | OK |
| Audio section | Add audio, Ducking, Beats | same | OK |
| Text section | Add text, Captions | same | OK |
| Video clip | 26 + Delete | Basics 8 · Edit 6 · Audio 3 · Look 3 · Frame 6 + Delete | OK — all present, none twice |
| Photo clip | no Speed, Volume, Extract audio, Voice, Sound, Stabilize, Reverse, Freeze; Motion added | Basics 5 · Edit 4 · Look 4 (Motion) · Frame 6; Audio group hidden | OK |
| Reversed clip | no Volume, Extract audio, Voice, Sound, Cut out, Stabilize | same; Audio group hidden; Reverse lit | OK |
| Cut-out on / Stabilize on | Reverse left out | `clipCopy`: no Reverse | OK. README omits the third case: Smooth slow motion on a slowed clip also removes Reverse |
| **Layer** | Trim, Speed, Volume, Extract audio, Voice, Sound, Animate, Filter, Adjust, Crop, Transform, Opacity, Mask, Blend, Green screen, Cut out, Stabilize, Keyframe, Forward, Back, Replace, Reverse, Duplicate, Delete | all of those **plus Split, Select, Transition, Freeze** | **Four extras.** Motion on a photo layer is not drawn |
| **Collage cell** | the layer's list with Collage first | Collage first, then the same list | **The same four extras** |
| Text / Caption / Sticker | 6 / 5 / 5 | same | OK |
| Sound bar | 10 | same, Volume and Fade first | OK |
| Timeline effect | 3 | same | OK |
| Multi-select | Delete, Duplicate, Filter, Speed, Volume, Select all, Done | same; "0 selected" dims the four actions and Delete | OK |

Still unstated on the boards: Select needs two clips, Transition is not on the last clip, Beats needs clips, Motion and Keyframe exclude each other on a photo. The code follows `contextFor`, so none of this blocks.

### 3.2 The groups

- No tool is missing, extra or doubled on a main clip.
- **Green screen under Frame** is acceptable: it sits with Background, Mask and Opacity, the tools that decide what shows through. "Frame" is a loose name for that set, but a person looking for Green screen will try it second at worst.
- **Animate, Motion, Keyframe** are split: Animate and Motion in Look, Keyframe in Edit. Findable, not obvious. Moving Keyframe into Look beside Animate would put the three "movement" tools together.

### 3.3 How many tools show at 375 pt

Toolbar 367 wide, 4-pt padding, 2-pt gaps. Back 44 + group button 52 + divider 3 + Delete 46 + four gaps 8 → **206 pt for tools** (198 on C1, which is drawn at 359).

| Row | Fully visible | Note |
|---|---|---|
| Video clip, Basics | **4** — Split, Trim, Speed, Volume (180 pt) | Filter 26 of 48 pt, in the edge fade. README is right |
| Photo, Basics | 4 — Split, Trim, Filter, Cut out | |
| Reversed, Basics | 4 — Split, Trim, Speed, Filter | |
| Edit | 3 — Transition, Keyframe, Duplicate | Replace, Reverse, Freeze need a swipe |
| Audio / Look | 3 / 3 (all) | |
| Frame | 3, Mask 3 pt short | Background, Green screen need a swipe |
| **Multi-select** | **3** — Speed, Volume, Filter (140 of 153 pt) | "✓ 3 selected" capsule about 100 pt. README is right. At "12 selected" Filter loses 2–3 pt |

### 3.4 Taps from a fresh selection of a video clip, 375 pt

| Tool | Today | Design |
|---|---|---|
| Split, Trim, Speed | 1 | 1 |
| Volume | 1, half visible | 1, fully visible (better) |
| **Select** | **1** (third tool) | **swipe + 1** — last of eight, 143 pt off screen (worse) |
| Filter | 2 swipes + 1 | 1, partly visible (better) |
| Cut out, Stabilize | 4 swipes + 1 | swipe + 1 (better) |
| Extract audio, Voice, Sound | 1 swipe + 1 | 3 taps |
| Animate, Adjust, Templates | 2–3 swipes + 1 | 3 taps |
| Crop, Transform, Opacity | 3 swipes + 1 | 3 taps |
| Mask, Background, Green screen | 3–4 swipes + 1 | 3 taps + swipe |
| Keyframe, Transition | 4–5 swipes + 1 | 3 taps |
| Replace, Reverse, Freeze | 5 swipes + 1 | 3 taps + swipe |
| Duplicate | 5 swipes + 1 | 3 taps |
| Delete | 6 swipes + 1 | **1** |

C1's own table says Select is "1 + swipe" today and "one short swipe, as today". Both are wrong: Select is the third tool in `contextFor` and is on screen today.

---

## 4. The selected clip, in the mock's own numbers

Zoom 40 pt per second; clip row 52 pt; selected clip in B1's first phone is 138 pt wide.

| Check | Result |
|---|---|
| Progress line (0–3 pt) against Move pill (5–21 pt) | Clear, 2 pt apart |
| Move pill against keyframes and beat ticks | Clear: pill in the top, band in the bottom 12 pt |
| **Move pill against the badge** | **Overlap.** Badge starts at 20 pt and is about 55 pt wide for "Warm" (20–75). Pill is at 53–85. They share 22 pt in the same band (5–23 against 5–21). "Reversed" (about 73 pt) ends under the far side of the pill. They clear only above about 190 pt ("Warm") to 226 pt ("Reversed") of clip width; the rule only hides the badge under 100 pt |
| Cut marker moved 10 pt outward, against the handle | Clear of the handle's 16-pt tab on both sides; it overlaps the handle's 44-pt target by 5 pt, where the disc wins |
| **Moved marker against the neighbour** | The trailing marker sits at 9–33 pt inside the next clip, 14–38 pt down. That clip's copy badge ("37%", from 4 pt, 5–23 pt down) is under it for 9 pt of height — in this very mock |
| Clip of 88–99 pt | Badge hidden. Trim targets take 28 pt each side; exactly 32 pt remain, the pill's own width. Consistent — this is where 88 comes from |
| Clip under 88 pt (mock: 86 pt) | No pill, no badge. Two keyframe targets and two trim targets cover the whole clip; trim wins, each keyframe keeps about 20 pt. Works because a keyframe is a tap and the others are drags |
| Cuts under 44 pt apart (mock: 40-pt clip) | The caption says "no markers on its cuts", but the code hides only the first; the second is drawn and covers 12 pt of the 40-pt clip. Between the neighbour's trim target and that marker, 13 pt of the clip remain to tap |
| Multi-select | Text says "no handles or markers"; `cuts` does not test for multi-select, so the 440 board draws markers |
| Photo clip | Drawn with two trim handles; the app gives a photo only the end handle |

**Touch order.** README and B1 give "trim handle → marker disc → keyframe → Move → clip", and in the same paragraph "the disc wins over the handle's target". Those disagree. The workable reading: the disc wins inside its 24 pt, the handle everywhere else in its target. In the mock the two keyframe targets (44 × 44) also cover 30 of the Move target's 44 pt of width, including the ends of the visible pill — harmless only if the rule is by gesture: a tap goes to marker, keyframe or clip; a drag goes to a handle; touch-and-hold then drag goes to Move.

**Is a 32 × 16 pill workable?** Yes. The app has a Move handle today (`ReorderHandle.tsx`): a 28 × 20 gold pill at the bottom centre of the selected clip, touch-and-hold 250 ms, then drag, with no extra touch area. The design's pill is slightly smaller to the eye but its target is 44 × 40, larger than today's. Touch-and-hold on a short clip conflicts with nothing: the clip strip has no touch-and-hold of its own today.

---

## 5. The banner

- **Where:** exactly the transport row — `top: trTop`, 8 pt from each side, 44 pt high, between the preview and the timeline. It covers no video. Same place with the toolbar, a strip or a panel open.
- **Shadow:** none. Solid `#3A3A3C` (dark) or `#1C1C1E` (light).
- **What it hides:** everything in the row — the time, Play, Undo and Redo. The transport is not drawn while a banner shows.
- **The contradiction:** R2 says it "covers … no control the person is using", that "tapping Play … dismisses it", and that "Undo stays in the transport row as before". None of the three is possible as drawn: Play and Undo are under the banner, and it stays "until the next edit or Play".
- **How does one play?** By tapping the preview (the app's preview already plays and pauses on a tap). That is the only way while the banner is up, and nothing on the board says so. Redo and the time are unreachable until the next edit.
- **Do two lines fit the real sentences at 375 pt?** Yes, all of them:

| Sentence | Action | Text column | Lines |
|---|---|---|---|
| Clips cut to the beat. Undo brings them back. | Undo | 247 | 2 |
| The voice is on the audio row, under the text. | Undo | 247 | 2 |
| Could not remove the background. The clip shows as it was. | Show | 245 | 2 |
| Could not prepare that sound. It plays as recorded. | Try Again | 217 | 2, tight |
| Clipy needs Photos access to import photos and videos. | Open Settings | 185 | 2, tight |
| The same plus "Open Settings to allow it." | Open Settings | 185 | 3 — cut. README drops that ending; D3 still lists it |

D3's two sample phones still draw the cut sentence "Clips cut to the beat".

---

## 6. Crop (board R1)

| Asked | Drawn |
|---|---|
| Cancel leading, title, Done trailing | Yes; Done is the gold primary, same height as Cancel |
| Five shapes | Free, 9:16, 1:1, 4:5, 16:9 — the app's `CROP_PRESETS`, same order |
| Reset | Yes, text action under the shapes |
| Placeholder | Yes: flat panel, spinner, "Loading the picture" |
| Size readout | Yes, labelled New feature ("1114 × 1080"; the numbers agree with the box) |
| Box | Accent border, thirds lines, four corner marks, darkened outside. Text names 44-pt targets and the four VoiceOver names. Matches `CropScreen.tsx` |
| Behaviour | "Opens on Free with the clip's current crop. Done applies as one undo step." Matches the app |
| Refusal reason | Drawn, with the shape dimmed |

**The reason's wording is not true.** The board says: "This picture is too short to hold 16:9 once it is cropped this tall. Make the box wider first."

- In the app (`applyPreset`) a shape is refused only when the **whole picture** cannot hold it at the minimum size — the largest box of that shape would be under 10 % of the picture's width or height. The current box plays no part: picking 16:9 from a tall 9:16 box simply gives the largest 16:9 box in the picture.
- So "once it is cropped this tall" and "Make the box wider first" describe a rule that does not exist, and the advice would not help.
- The board's example cannot happen: its picture is 16:9, which always holds 16:9. In practice a refusal needs an extreme picture (for 16:9: taller than about 5.6 : 1 or wider than about 17.8 : 1).
- A true sentence: "This picture is too long and narrow for 16:9."

Dimming a shape in advance is also new (today the tap silently stays on Free); it is the right answer to the brief's "say why".

---

## 7. Keyboard states, main actions, compact panels, accessibility

### Keyboard (R3, 375 × 667, preview 301 in all six)

| State | Drawn | Remark |
|---|---|---|
| Trim | Start field, End field ("of 12.3 s"), Apply filled | Fits the 40-pt bar (two fields of about 141 pt). Where a refusal shows while the keyboard is up is not said |
| Emoji search | 112-pt field, results in the bar, sideways | About six results visible of up to 60; "Return shows the full grid". Weaker than today's short panel with a grid, but the only thing that fits |
| Fine-tune | ‹ › and one field at a time, Done | Workable |
| Custom colour | "#" field, swatch, Done | "Applied when focus leaves and the code is valid" |
| Cover title | Field with "7 / 40", Done | 40 is the app's real limit (`COVER_LIMITS.titleMax`) |
| Text | Field, Done | |

Fields and buttons in the bar are 32 pt high in a 40-pt bar — under the 44-pt target. The preview formula rests on the 40.

### Main action per panel

| Panel / state | Filled in the label colour | Others |
|---|---|---|
| Trim | Apply | — |
| Captions ready | Transcribe | Style Captions grey |
| **Captions replace** | **Replace, full width** | Style Captions grey, **Cancel a text action** — fixed |
| Captions error / other error | Open Settings / Try Again | — |
| Add audio · Files | Choose a File | — |
| Beat markers | Tap | Find Beats, Cut to Beats grey; Clear All red on grey |
| Read aloud | Read Aloud | — |
| Cover | Save to Photos — drawn only in its disabled form | Reset in the header |

Exactly one per panel; none where no action completes anything (Voice, Sound quality, Collage, Templates, the editors). Two main actions sit below the fold on every phone: Cover's Save to Photos (row at 312–364 pt of a 240–320 panel) and Read Aloud (336–388).

### Compact panels at 240

| State | Rows | Sum |
|---|---|---|
| Sticker editor (shape) | 44 + 52 + 48 + 44 + 48 | 236 |
| Sticker editor (emoji) | 44 + 48 + 44 + 52 + 52 | 240 |
| Captions: ready / replace / working / done / error / other error / update | — | 240 each |
| Voice, Voice preparing | 44 + 44 + 44 + 44 + 52 + 12 | 240 |
| Sound quality | 44 + 44 + 44 + 52 + 52 + 4 | 240 |
| Collage being made | 44 + 72 + 44 + 44 + 36 | 240 (board label says 236) |
| Collage editing | 44 + 72 + 44 + 44 + 36 | 240 |
| Record idle / live / saving | 44 + 44 + 112 + 36 | 236 |
| Sticker picker, emoji | 44 + 48 + 40 + 28 + 80 | 240 — two rows of emoji above the fold |

Above the fold as asked: Beat markers' Tap, "Listening … Cancel" and Find / Cut (200 pt); Templates' "Applied …" line (116 pt).

One new overflow: in Sound quality the Reduce noise row now holds the name, "Strength", a 70-pt slider, "50 %" and the switch. About 110 pt are left for the subtitle "Best on speech. Music can sound odd.", which needs three lines; with the name that is about 64 pt in a 52-pt row.

### Accessibility and glass / solid

Covered in 3.7 above. Really drawn for timeline + toolbar, one strip and one panel under Increase Contrast and Bold Text; Reduce Transparency is one strip plus the three solid phones. At the largest accessibility size board T4 still shows the toolbar with symbols only.

---

## 8. Stale material in the editor files

**Gone:** two-row toolbar, summary rows, gutter, gold 12-pt handles, 44-pt lanes, old caps 200 / 220, preview 458 as a current value, the old bar colours, `rowsOld`.

**Still there:**

| Where | Stale | Now |
|---|---|---|
| `10 Editor v2` A1 | "Strip M · 120 … Effects" | Effects is L 168 |
| `10 Editor v2` A1 | "status 72/96"; "Tabs live in the header, in place of the title"; compact rows "are 44 pt each"; "The remaining gap above the transport is left empty on purpose" | 76 / 96; title beside the tabs; rows of 36–72; the gap is 6 / 16 / 0 |
| `10 Editor v2` A1 table | last row "Review 3 · 301 / 394 / 458" beside "240 / 280 / 320" | mixed old and new |
| `10 Editor v2` A2 captions | "44+44+44+44+52+4 = 232 of 240" (Voice, Sound quality) | 240 |
| `10 Editor v2` C1 | toolbars drawn at 359 pt; the tap table's "today" row | 367; Select is 1 tap today |
| `11 Strips v2` D2 | "72 pt in Speed and Remove background" | 76 |
| `11 Strips v2`, `11b` | header "REVIEW 3"; each file carries the other's unused lists | harmless |
| `11b` D3 | banner samples "Clips cut to the beat" | the full sentence |
| `3 Components` 4a / 4b | "In strips and panels there is none [primary action]" | the label-colour main action |
| `3 Components` 4a / 4b | Message kind 2: "Directly above the toolbar or bottom bar" | the transport row |
| `3 Components` 4a / 4b | "The last swatch opens the system colour picker" | the #RRGGBB field in the typing bar |
| `3 Components` 4a / 4b | Background-copy status card with its own sentences ("Keep editing…", "About 1 min left.", "Not possible here", a "Trim" action) and "see the timeline row below" | the status block and D2's sentences; 4c is gone |
| `3 Components` script | unused `strips` list: 132 / 184 / 208, tile row 84 | dead data |
| `13 Tokens` T2 | `panel.compactRow 44`; `size.toolButton label + 8`; `radius.cover 16` | 36–72; label + 10 in `Toolbar`; 8 in the Cover row |
| `13 Tokens` T5 | Timeline clip → "3 Components 4c"; "ready" state | 4c is a pointer; "ready" is drawn nowhere |
| `8 Prototype` (illustrative) | panels at 268 px | 240 |

The README's authority table settles every one of these in favour of the newer board, so none can mislead a careful reader.

Also still not drawn, though settled in brief §0: the transport order (Undo and Redo leading, Play centred, time and the ratio pill trailing — the boards draw time · Play · Undo / Redo and no pill), the Preview tag, corner handles on the selected clip in the preview, the "full project" proof on the largest phone in light.

---

## 9. Wording

### On a board, not in the "Sentences changed" table

| Sentence | Where | App today |
|---|---|---|
| "This sound is too short to fade." | `fadeShort` | no sentence; the sliders are just disabled |
| "No emoji match "zebra crossing". Try one word, like "road"." and the heading "Recent" | sticker picker | neither exists |
| "Listening to {title}" | Beat markers | the table says indicators "had no words"; the app says "Listening to the music". Likewise "Making the collage", "Loading voices", "Preparing the voice", "Preparing the sound" already exist; only the percent is new |
| "Smooth curve" refusals still end "Switch Smooth off." | D3 | the switch is renamed, the refusals are not |
| "Style Captions" in the ready state; "Start recording" as visible text; switch label "Remove" on two different tools | panels, strips | new on screen |
| "The cover and its title also appear on the project's card on Home." | Cover | new on screen |
| "Add a title" (Cover's placeholder) | — | in the app, on no board |
| "Open Settings to allow it." | README drops it; D3 keeps it | choose one (the short form is the one that fits) |

### Each "— (new)" sentence against the code

| Sentence | True? |
|---|---|
| Picking a Combo removes In and Out, and the other way round. A Combo has no length. | **True** — `setClipAnimation` keeps them exclusive; the Combo tab has no slider |
| For a photo, Combo offers only None, Sway and Pulse — unless the photo already has one of the others. | **True** — `ClipAnimationSheet`, `COMBO_AS_MOTION` |
| In, Out and Loop are independent. Loop has no length. | **True** — `OverlayAnimationSheet` |
| Pick a filter / an animation / a transition / a motion to set its strength or length. Turn on Remove to pick a colour. | **True** to the disabled states |
| A new run replaces all captions. Undo brings them back. | True to the Replace state |
| Select a clip to use This clip. | **True** — the chip is disabled without a clip |
| Files over 50 MB ask before adding. | **True** — the app asks "This file is over 50 MB. Add it anyway?" |
| Loading the picture | fine |
| This picture is too short to hold 16:9 once it is cropped this tall. Make the box wider first. | **Not true** (section 6) |
| Zooms in a little: about 5 %, 10 % or 15 %. | **True** — `STEADY_LEVELS` zoom 1.05 / 1.1 / 1.15 |
| Clips: N — {k} of them have no sound and will be skipped; "in {language}" | **Not something the app knows.** It shows "Clips: N" only; it skips photos, reversed clips and missing files, not silent ones |
| Slow motion tab "only while exactly one clip is shown and it is slowed below 1×" | True, but incomplete: also not reversed |

---

## 10. New problems this round

1. The banner hides the time, Play, Undo and Redo, and its own board says it does not (section 5).
2. Layer and collage cell show Split, Select, Transition and Freeze, which the app does not offer there (section 3.1).
3. The Move pill covers the clip's badge on clips from 100 to about 200 pt wide — in the board's own mock (section 4).
4. A cut marker moved outward lands on the neighbour clip's badge place; the touch order is stated two ways; one marker is drawn where the caption says none; markers are drawn in multi-select (section 4).
5. The Crop refusal reason states a rule the app does not have, on an example that cannot happen (section 6).
6. The Reduce noise row's subtitle no longer fits beside the named slider (section 7).
7. Select is still a swipe away, and C1's table claims it is "as today" (section 3.4).
8. With the field pinned, the Text panel on the small phone has 100 pt of body (section 2.4).
9. Typing-bar controls are 32 pt high; Save to Photos and Read Aloud sit below the fold (section 7).

None of these needs a new drawing.

---

## 11. Verdict

**Good enough to build from.** The layout rule is exact and holds on all three phones, the strips and panels add up, the lists and sentences are in place, and what is left is a short list of small conflicts that are quicker to settle in code than in another drawing.

### (a) Still blocking

None.

Two things must not be copied from the boards as drawn — the layer and collage-cell tool lists (follow `contextFor`) and the Crop refusal sentence (follow `applyPreset`). Both are one-line corrections in the build, not reasons to wait.

### (b) Decisions for the developer, with a recommendation each

| # | Decision | Recommendation |
|---|---|---|
| 1 | Banner hides the transport | Keep it in the transport row. Let it go away on the next touch anywhere outside it (the touch still does its job), on Play by a tap on the preview, and by itself after about 6 s — longer for Try Again / Open Settings, and not timed while VoiceOver is on. Then Play, Undo and the time are never out of reach for long |
| 2 | Layer and collage-cell tools | Take them from `contextFor`: no Split, Select, Transition, Freeze; add Motion for a photo layer |
| 3 | Where Select sits | Put it third in Basics (Split, Trim, Select, Speed visible, Volume next), the same head as today, so nothing gets slower. It is one array |
| 4 | Crop refusal | Dim a shape only when `applyPreset` cannot hold it; say "This picture is too long and narrow for 16:9." |
| 5 | Badge against the Move pill | Show the badge only when it ends 8 pt before the pill; otherwise hide it. Start every badge (filter, copy, file missing) at 20 pt on a selected clip so the handle never covers it |
| 6 | Which target wins | By gesture: a tap goes to marker, keyframe, then clip; a drag to a trim handle; touch-and-hold then drag to Move. The marker wins inside its 24-pt disc. Hide both markers when two cuts are under 44 pt apart, and all markers in multi-select |
| 7 | 40-pt lanes, 3.5 / 4.5 rows | Accept. It is one row fewer than today on the larger phones, for bars that are easier to hit. `visibleLaneRows` stays the single place to change it |
| 8 | A strip hides the selected bar | When a strip opens, jump the rows once (no animation) so the selected bar's row is in what stays visible (`rowScrollTarget`) |
| 9 | Text panel on the small phone | Pin the header and tabs only; let the field be the first row of the scrolling body on a 667-pt screen. Open one Style row at a time |
| 10 | Reduce noise row | Off: show the subtitle, no slider. On: show Strength with its value in place of the subtitle |
| 11 | Typing bar | Keep 40 pt, give the controls a 44-pt touch area. If the keyboard is taller than assumed, the bar may overlap the preview's bottom edge; the preview never resizes. A refused Trim closes the keyboard and shows the red line in the strip |
| 12 | Cover and Read aloud main actions | Pin Save to Photos (and Cover's slider) outside the scrolling body; scroll Read Aloud into view when its row opens |
| 13 | Transport row | Follow brief §0: Undo and Redo leading, Play centred, time and the ratio pill trailing. The boards drew something else without saying why |
| 14 | Group menu | The system menu from `@expo/ui` if it runs in Expo Go (check first); otherwise React Native's action sheet listing the five groups |
| 15 | Glass or solid | Build solid first; try glass over the moving rows on a real phone afterwards |
| 16 | Text size in strips | `maxFontSizeMultiplier` 1.16 on strip text; the large-content viewer for tools and tiles (I believe React Native has the two iOS props for it — needs checking) |
| 17 | Captions note | Keep "Clips: N"; add a skipped count only for what the app can know (photos, reversed clips, missing files). Do not promise "no sound" |
| 18 | Small matters | Photo clip: one handle. Blur box: keep the app's two corners and pinch. Curve tiles: draw from `curveProfile`. Safe-area top on the 402 phone (drawn 58, probably 62). Add the missing sentences of section 9 to the strings as written here. Token names and a spacing scale mapped to 4 / 8 / 12 / 16 / 24 / 32 |

### (c) Worth sending back to the designer

**None worth another round.** Every open point is either a rule the code already owns or a detail a developer settles in minutes on a phone.

If a round happens anyway for the other parts of the app, add these — in this order:

1. Redraw the banner so Play, the time and Undo stay reachable, or state that a tap on the preview plays and that the banner leaves after a few seconds; correct R2's text to match.
2. Remove Split, Select, Transition and Freeze from the layer and collage-cell toolbars, and put Select third in Basics.
3. Stop the Move pill covering the badge: say at what clip width the badge hides, and keep moved cut markers off the neighbour's badge.
4. Replace the Crop refusal sentence with one that is true: the whole picture cannot hold that shape; the current box does not matter.
5. Correct the stale lines listed in section 8 of this review (A1, A2 captions, D2's "72 pt", the four paragraphs in `3 Components` 4a / 4b).
6. Add to the wording table: "This sound is too short to fade.", the no-match sentence and "Recent", "Listening to {title}" beside "Listening to the music"; rename "Switch Smooth off." to match "Smooth curve".
