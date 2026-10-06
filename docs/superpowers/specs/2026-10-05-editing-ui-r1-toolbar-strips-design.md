# Editing UI, round 1 — contextual toolbar and tool strips: design

**Date:** 2026-10-05
**Status:** Implemented 2026-10-05 (confirmed by the user on an iPhone in Expo Go)
**Builds on:** the "Grand Voyage" UI kit (`src/ui/`, `src/theme/theme.ts`), multi-select (group G), schema v13 (no schema change in this round)

## 1. What the user gets

1. **One bar that follows what is selected.** The five always-visible group tabs (Edit, Effects, Text, Stickers, Audio) go away. With nothing selected the bar shows the main entries; tap a clip, a layer, a text, a sticker, a sound or an effect and the bar shows that item's tools, with a back arrow at the left that returns to the main bar.
2. **No greyed-out buttons.** A tool that cannot be used for the current selection is simply not there (a photo has no Speed, the last clip has no Transition).
3. **Tool strips instead of pop-up sheets** for the quick tools (filter, adjust, speed, volume, opacity, …). A strip sits at the bottom of the editor in place of the bar. Nothing dims, the video keeps its size, and the video and the timeline stay usable (play, scrub, tap another clip) while the strip is open.

The look (colours, fonts) is unchanged. Round 2 (a later, separate spec) converts the big pickers.

Out of scope: colours / fonts / icon redesign, the home screen, the export screen, gestures on the preview, the timeline lanes, any model / schema / Swift change.

## 2. Contextual toolbar

### 2.1 The description — `src/editor/toolbarContext.ts` (pure)

```ts
export type BarId = "main" | "clip" | "layer" | "text" | "sticker" | "audio" | "effect";
export type Section = "audio" | "text" | null;      // a main-bar entry that opens a bar without a selection
export type ToolbarSelection = { clipId: string | null; overlayId: string | null; effectId: string | null; audioId: string | null; section: Section };
export type ToolbarContext = { bar: BarId; tools: ToolId[] };
export function contextFor(sel: ToolbarSelection, p: Project): ToolbarContext
export function selectionKey(s: { selectedClipId; selectedOverlayId; selectedEffectId; selectedAudioId; multiSelect }): string
```

`contextFor` decides **which bar and which tools, in order**. It never returns a tool that would be disabled for a lasting reason. `selectedClipId` holds a main clip's or a layer's id: it is resolved with `findItem`. An id that no longer exists counts as no selection. Priority: effect, audio track, overlay, clip / layer, section, main (the store keeps selections exclusive anyway). Multi-select is not a bar: `MultiSelectBar` replaces the toolbar as today.

`selectionKey` is the identity of "what is selected": `"multi"`, `` `clip:${id}` ``, `` `overlay:${id}` ``, `` `effect:${id}` ``, `` `audio:${id}` `` or `"none"` (same priority order, multi first). The strip host uses it (§3.3).

### 2.2 The bars (tools in this order)

| Bar | When | Tools |
|---|---|---|
| **main** | nothing selected | Edit, Audio, Text, Stickers, Overlay, Effects, Filter, Adjust, Ratio, Background, Cover, Templates |
| **clip** | a main clip is selected | Split, Trim, Select, Speed, Volume, Animate, Filter, Adjust, Background, Templates, Crop, Transform, Opacity, Mask, Green screen, Keyframe, Transition, Replace, Reverse, Freeze, Duplicate, Delete |
| **layer** | a layer is selected | Trim, Speed, Volume, Animate, Filter, Adjust, Crop, Transform, Opacity, Mask, Blend, Green screen, Keyframe, Forward, Back, Replace, Reverse, Duplicate, Delete |
| **text** | a text is selected | Edit, Animate, Keyframe, Duplicate, Delete, Add text |
| **text** | a caption is selected | Edit, Captions, Duplicate, Delete, Add text |
| **text** | main bar → Text (no selection) | Add text, Captions |
| **sticker** | a sticker is selected | Edit, Animate, Keyframe, Duplicate, Delete |
| **audio** | a sound is selected | Volume, Fade, Duplicate, Delete, Add audio, Ducking, Beats |
| **audio** | main bar → Audio (no selection) | Add audio, Ducking, Beats |
| **effect** | an effect is selected | Strength, Duplicate, Delete |

Every non-main bar has a back arrow (accessibility label "Back to main tools") fixed at its left: it clears every selection and the section, so the main bar shows.

### 2.3 Rules — when a tool is left out

Each rule is today's `disabled` rule turned into "not rendered"; no new rule is invented.

| Tool | Left out when |
|---|---|
| main: Edit, Text, Stickers, Overlay, Filter, Adjust, Background, Cover, Templates | the project has no clips (an empty project shows Audio, Effects, Ratio) |
| Speed, Reverse (clip and layer), Freeze (clip) | the item is a photo |
| Volume (clip and layer) | the item is a photo or is reversed |
| Transition | the clip is the last one |
| Select | the project has fewer than two clips |
| Beats | the project has no clips (as today) |
| Blend | never on the clip bar (a main clip has no blend); always on the layer bar |
| Split, Freeze, Transition, Select, Background, Templates, Ratio | never on the layer bar (as today: a layer has no background, and Templates' "This clip" is a main clip) |
| Animate, Keyframe | never for a caption (as today) |

**Exceptions — visible but disabled, because the reason is momentary and the user should see the tool:**

1. **Keyframe** — the playhead is not on the selected clip / layer / text / sticker (today's `pin === "off"`).
2. **Replace** and **Overlay** — while a media pick is in progress (`useClipMedia().busy`).
3. **Freeze** — while a freeze capture is running (`useFreezeFrame().busy`).

Split has no such state: today it is enabled whenever a main clip is selected and cuts the clip under the playhead (a cut too close to an edge is a silent no-op). That stays.

### 2.4 What each main-bar entry does

- **Edit** selects the main clip under the playhead (`clipAt`) — the clip bar shows. No seek.
- **Audio** opens the audio bar without a selection: Add audio (today's sheet), Ducking (today's toggle), Beats (today's sheet). Selecting a sound on the timeline shows that sound's tools on the same bar.
- **Text** opens the text bar without a selection: Add text (today's behaviour: adds a text at the playhead, selects it, opens the text panel) and Captions (today's sheet).
- **Stickers** opens today's Sticker sheet. **Effects** opens today's Effects sheet (adding one selects it — the effect bar shows). **Overlay** picks media for a new layer, as today. **Cover** and **Templates** open today's sheets.
- **Filter**, **Adjust**, **Background** select the main clip under the playhead and open the tool on it. On the clip bar the same three open on the selected clip, and **Templates** there opens the sheet with "This clip" available (on the main bar no clip is selected, so only "Whole project").
- **Ratio** opens the aspect-ratio strip (the ratio pill in the transport row opens the same strip).

The section (Audio / Text without a selection) is toolbar state, not store state. It is cleared by the back arrow, whenever the selection changes, and when the project loses its last clip.

### 2.5 Tool → bars

| Tool id | Label | Bars |
|---|---|---|
| `edit` *(new)* | Edit | main |
| `audioMenu` *(new)* | Audio | main |
| `textMenu` *(new)* | Text | main |
| `sticker` | Stickers | main |
| `overlay` | Overlay | main |
| `effect` | Effects | main |
| `ratio` | Ratio | main |
| `cover` | Cover | main |
| `background`, `templates` | Background, Templates | main, clip |
| `filter`, `adjust` | Filter, Adjust | main, clip, layer |
| `split`, `transition`, `freeze`, `select` | Split, Transition, Freeze, Select | clip |
| `trim`, `speed`, `volume`, `crop`, `transform`, `opacity`, `mask`, `chroma`, `replace`, `reverse`, `duplicate`, `delete` | Trim, Speed, Volume, Crop, Transform, Opacity, Mask, Green screen, Replace, Reverse, Duplicate, Delete | clip, layer |
| `blend`, `layerForward`, `layerBack` | Blend, Forward, Back | layer |
| `animate`, `keyframe` | Animate, Keyframe | clip, layer, text (a text), sticker |
| `overlayEdit`, `overlayDuplicate`, `overlayDelete` *(new)* | Edit, Duplicate, Delete | text, sticker |
| `text` | Add text | text (no selection; a text; a caption) |
| `captions` | Captions | text (no selection; a caption) |
| `addAudio` | Add audio | audio |
| `ducking`, `beats` | Ducking, Beats | audio (no selection; a sound). Beats only when the project has clips |
| `audioVolume`, `audioFade`, `audioDuplicate`, `audioDelete` | Volume, Fade, Duplicate, Delete | audio (a sound) |
| `effectStrength`, `effectDuplicate`, `effectDelete` | Strength, Duplicate, Delete | effect |

48 tool ids: the 42 of today plus the six marked new. Labels and icons live in `TOOL_META` (`src/editor/toolGroups.ts`); `TOOL_GROUPS` and `groupForSelection` are deleted.

`overlayEdit` opens today's text panel (a text or a caption) or sticker panel (a sticker) — the same panels a double-tap on the preview opens. `overlayDuplicate` / `overlayDelete` run the ops those panels already use (`duplicateOverlay`, selecting the copy; `deleteOverlay`), one undo step each.

## 3. Tool strips

### 3.1 The kit component — `src/ui/ToolStrip.tsx`

Not a `Modal`: a plain view rendered where the component is mounted. No scrim, no drag handle, no animation in round 1.

```
┌──────────────────────────────────────────────────────────────┐
│ TITLE   one muted note (optional)        Apply to all    (✓) │  header, 36
├──────────────────────────────────────────────────────────────┤
│ body: 112 = a tile row (76) + a slider row (36)              │
└──────────────────────────────────────────────────────────────┘
```

- Title at the left (`accessibilityRole="header"`, the same title text as the sheet had); an optional note (muted, one line each, at most two lines); an optional action (the sheet's "Apply to all"); a ✓ button with `accessibilityLabel="Done"`.
- Content never scrolls vertically. A row that is too wide scrolls horizontally.
- Every row has an explicit height. `flex: 1` is used only to share width inside a row of explicit height — never for height (a past bug collapsed a sheet's content off-screen).
- A visible strip registers itself (`useStripPresence`, a counter): whichever bar hosts it hides its buttons while the count is above zero. So a bar is never hidden without a strip showing.

### 3.2 Height — and what gives up the space

| | Points |
|---|---|
| The bar (`BAR_HEIGHT`) | 86 (one row of tool buttons), plus the bottom safe-area padding |
| A strip (`STRIP.height`) | 150 = 1 (hairline) + 36 (header) + 76 (tile row) + 36 (slider row) + 1 spare, plus the same bottom padding |
| The extra (`STRIP.lift`) | 64 = exactly two timeline lanes (2 × (28 + 4)) |

The bottom area has an **explicit height** in both states and, while a strip is open, a **negative top margin of 64**: it grows upwards over the bottom of the timeline area instead of pushing the layout. So:

- **The preview does not resize and the `VideoView` does not remount** when a strip opens or closes: everything above the bottom area keeps its frame. `PreviewPlayer.tsx` is not edited.
- **The timeline keeps its size and its scroll position.** Its lowest 64 points — the effects lane and the lane above it (the last audio lane) — are covered while a strip is open. The clip strip, the layers lane and the text lane stay visible and usable (scrub, pinch, tap a clip). `Timeline.tsx` and `timelineScroll.ts` are not edited.
- Compared with today the preview is larger all the time: today's two-row toolbar is about 162 points, the new bar is 86.
- In multi-select the action bar is taller than the bar (it has the "N selected" line): it gets an explicit height of 104 and its strip lifts by 150 − 104 = 46, so the preview does not resize there either.

### 3.3 Opening and closing — `src/editor/toolStrip.ts`

One small UI store holds the open strip: `{ id: StripId; key: string } | null` (`key` = `selectionKey` at the moment it opened). The Transition strip's cut is the selected clip's place on the main track, read on every render (never stored: the clip can move while the strip is open); the strip closes if that clip becomes the last one. `openStrip(id)` leaves multi-select first (the ratio pill is still on screen in that mode). `openStrip(id)` and `closeStrip()` are plain functions, so the toolbar, the cut marker on the timeline and the ratio pill in the transport row open the same strip. Transient: not saved, not undoable.

A strip closes when:

1. ✓ is pressed;
2. **the selection key is no longer the one it opened with** — a different item is selected, the selection disappears (delete, undo of an add, tapping the selected clip again), multi-select is entered, or something is selected while a no-selection strip (Ratio) is open;
3. the editor is left (the host unmounts) or Export is opened;
4. the tool closes itself as it did as a sheet (Ratio after a pick; Speed when the op refuses, before its toast).

Scrubbing, playing, undo / redo that keep the item, and changing the item's values do not close it. A main-bar tool that acts on the clip under the playhead (Filter, Adjust, Background) selects first and opens second, so the strip's key is that clip.

Strips opened from `MultiSelectBar` (Filter, Speed, Volume with `clipIds`) keep that bar's own local state: they close on ✓ and when the mode ends (the bar unmounts).

### 3.4 Three layout patterns

**(a) Tile row** — one horizontally scrolling row of tiles or chips; optionally tabs fixed at its left; optionally one slider under it.

```
│ ANIMATION                          Apply to all clips    (✓) │
│ [In][Out][Combo] │ (None) (Fade) (Slide) (Zoom) (Pop) →      │
│ Length 0.50 s   ──────●───────────────────────────           │
```

**(b) Parameter + slider** — a scrolling row of parameters, one selected, and ONE slider for it.

```
│ ADJUST                                   Apply to all    (✓) │
│ [Brightness •] [Contrast] [Saturation] [Exposure] [Warmth] → │
│ Brightness +35  ──────────────●─────────────────    [Reset]  │
```

**(c) Sliders only** — one to three slider rows, centred in the body.

```
│ OPACITY                                                  (✓) │
│                                                              │
│ Opacity 80 %    ───────────────────────●─────────            │
```

### 3.5 The seventeen strips

Behaviour inside is unchanged: the same ops, one `apply` per tile / chip / switch, one `beginTransaction` then `applyTransient` per slider drag, a no-change press leaves no history entry, `useItemClip` / `useIsLayer` lookups, the `clipIds` mode, "Apply to all" where it exists today (hidden for a layer and in `clipIds` mode, as today). Component names, props, test ids and accessibility labels stay.

| Strip (component) | Pattern | Layout | Action | Note |
|---|---|---|---|---|
| Opacity (`OpacitySheet`) | c | slider "Opacity 80 %" | — | — |
| Strength (`EffectStrengthSheet`) | c | slider "Strength 70" | — | — |
| Volume, a sound (`AudioVolumeSheet`) | c | slider "Volume 120 %" | — | "Above 100% only applies in the exported video." |
| Fade (`AudioFadeSheet`) | c | sliders "Fade in 1.5 s", "Fade out 0.0 s" | — | — |
| Volume, a clip (`VolumeSheet`) | c | slider "150%" with the Mute switch at its right; then Fade in and Fade out (not for a photo, not in `clipIds` mode) | — | "Above 100% only applies in the exported video." |
| Mask (`MaskSheet`) | a | three tiles (box 44) | — | — |
| Blend (`BlendSheet`) | a | six tiles (box 44) | — | "Shows in the exported video" |
| Background (`BackgroundSheet`) | a | Black, the palette swatches, Blur | Apply to all | "Shown around a clip that does not fill the frame." |
| Aspect ratio (`RatioSheet`) | a | the ratio tiles; the strip stays open after a pick (changed 2026-10-06 at the user's request), ✓ closes it | — | "9:16 for TikTok, Reels and Shorts. 1:1 for feeds. 16:9 for YouTube." (two lines) |
| Transition (`TransitionSheet`) | a + slider | the eleven type chips; slider "0.50 s" | — | "Clips are too short for a transition here" when it applies; for the last clip the body is the line "No clip after this one" |
| Transform (`TransformSheet`) | a | the six action buttons (Rotate 90°, Flip horizontal, Flip vertical, Fit, Fill, Reset) | — | — |
| Filter (`FilterSheet`) | a + slider | filter tiles with the clip's thumbnail (52 × 52); slider "Strength 80" | Apply to all clips | — |
| Speed (`SpeedSheet`) | a + tabs + slider | tabs Normal / Curve at the left; Normal: the six speed chips and the slider "Current speed: 1.5×"; Curve: None and the six curve tiles, no slider | — | line 1 "Clip length 4.0 s"; line 2 (Normal tab) "A curve is active — moving this slider removes it." or "Audio keeps its pitch in the exported video." |
| Animation, a clip (`ClipAnimationSheet`) | a + tabs + slider | tabs In / Out / Combo; the tiles; slider "Length 0.50 s" (In / Out only) | Apply to all clips | — |
| Animation, a text / sticker (`OverlayAnimationSheet`) | a + tabs + slider | tabs In / Out / Loop; the tiles; slider "Length 0.50 s" (In / Out only) | — | — |
| Adjust (`AdjustSheet`) | b | the twelve parameter chips (a dot marks a changed one); slider "Brightness +35" with Reset at its right | Apply to all | — |
| Green screen (`ChromaSheet`) | b | the switch fixed at the left; Green, Blue and the eight palette swatches; slider "Strength 50 %" | — | "This colour is too grey to remove. Pick a stronger colour." when it applies, else "Shows in the exported video" |

Tabs are compact chips fixed at the left of the tile row.

### 3.6 Not in round 1 — today's sheets, opened from the new bars exactly as today

Text panel, Sticker sheet, Sticker panel, Add audio, Templates, Captions, Caption style, Cover, Beats, Trim (numeric), Crop (full screen), the Effects add sheet, the media pickers (Replace, Overlay). Keyframe, Reverse, Freeze, Ducking, Forward, Back, Split, Duplicate and Delete are plain buttons (no sheet, no strip).

## 4. Screens

- **Editor:** top bar, preview, transport row, timeline, then one bottom area that is the contextual bar, the multi-select bar or a strip.
- **Timeline:** unchanged. The cut marker selects its clip and opens the Transition strip.
- **Transport row:** the ratio pill opens the Ratio strip (it no longer owns a sheet).

## 4a. As built

What the code at the end of round 1 does, where it differs from or adds to the sections above. The bar table (2.2) and the tool -> bars table (2.5) match `contextFor` in `src/editor/toolbarContext.ts`, which is the only place that decides them.

- **The strip rises over the timeline instead of resizing the preview.** The bottom area has an explicit height and a negative top margin of `STRIP.lift` (64 pt) while a strip shows, so it covers the timeline's two lowest lanes (the effects lane and the last audio lane). The preview and its `VideoView` never change size or remount. With Strength, Fade or a sound's Volume open, the selected bar can sit under its own strip.
- **Bars as fixed after the first device try:** Templates and Background are on the clip bar as well as the main bar (never on the layer bar); Select sits right after Trim; Add text is on a text's and a caption's bar; Ducking and Beats are on a selected sound's bar; Beats is left out when the project has no clips; Trim is on the clip and layer bars (decision 4).
- **The Transition strip follows its clip.** `OpenStrip` is `{ id, key }`; there is no stored cut index. The toolbar passes the selected clip's current place on the main track on every render, so moving the clip under the strip keeps the strip on it, and it closes if that clip becomes the last one. The cut marker selects the cut's left clip, then opens the strip.
- **Opening a strip leaves multi-select** (`openStrip` calls `exitMultiSelect()` first), so the ratio pill works in that mode. Strips opened from `MultiSelectBar` (Filter, Speed, Volume) keep that bar's own state and close when the mode ends.
- **The section** (Audio / Text without a selection) is also cleared when the project loses its last clip. Overlay Duplicate does nothing (no haptic, no undo step) when the op returns the same project.
- **Green screen's strip has no typed colour field:** the switch, Green, Blue and the eight palette swatches, then the strength slider (`ColorRow` has a `compact` mode without the Custom colour field).
- **Ducking stays a toggle** on the audio bar; it is not a strip.
- **Strips have no open / close animation.** Transition's chip row does not scroll the selected chip into view when it opens (Blend, the Animation tiles and Speed do, from a start position read at mount; Speed's chips differ in width, so it uses an estimated 64 pt pitch).
- **Still sheets (round 2):** the Effects add picker, Text, Sticker (panel and sheet), Add audio, Templates, Caption style, Captions, Cover, Beats, Trim and Crop (full screen). The Stickers button opens a sheet titled "Sticker".
- **Momentary disabled tools** are as listed in 2.3: Keyframe, Replace / Overlay while a pick runs, Freeze while a capture runs.
- **Dead code removed:** `TOOL_GROUPS`, `groupForSelection`, `ToolGroupId`, the `transitionFor` state and the `role` prop of `ToolButton` (it is always a button; an `active` one reports `selected`). `toolGroups.ts` keeps only `TOOL_META` and `IoniconName`.
- **Tests that changed.** The toolbar suites lost every "disabled with no selection" and every tab / group expectation (replaced by exact bar lists and "not rendered" checks); `strips.tiles.test.tsx` no longer asserts the Background note; `SpeedSheet.test.tsx` "length label" no longer expects the clip length on Normal while a curve is active. No editor-screen test exists, so the cut marker, Export closing a strip and the `VideoView` staying mounted are checked by reading the code and on the phone.

## 5. Testing

- `toolbarContext`: a table of selections → the exact tool lists; every tool id reachable; stale ids; `selectionKey`.
- `ToolStrip`: renders inline (no scrim, explicit height), title with the `header` role, action, Done, presence counter.
- Strip host: closes when the selection changes, disappears, on multi-select, on unmount; stays through value changes and seeking.
- Toolbar: the bar per selection, the back arrow, no disabled button except the three exceptions, sections, multi-select still replaces it, the bar hides while a strip shows, fixed heights and lift.
- Each converted strip: its existing behaviour tests keep passing unedited (same roles, labels, test ids, texts), plus "it is a strip" (no scrim, Done closes).

## 6. Risks

- **Covered lanes.** While a strip is open the effects lane and the last audio lane are under it; with Strength, Fade or a sound's Volume open, the selected bar itself can be covered. The item stays selected and the strip names the tool. Round 2 may revisit.
- **Hit-testing in the lifted area** relies on the bottom area being a later sibling of the timeline inside the same parent (so it is on top and inside its parent's bounds). It must not be moved into a child view that the lift would push outside its parent.
- **Fixed heights** (86 / 104 / 150) are computed from the kit's sizes, not measured on a device; a clipped label would show on the first device run (checklist).
- **Compact tiles** (Mask, Blend, Filter) are smaller than in the sheets.
- **Green screen** loses the typed `#RRGGBB` field in the strip (a keyboard would cover a bottom strip); the presets and the palette remain.

## 7. Decisions made while writing

1. `contextFor(selection, project)` has no playhead argument: no rule of today hides a tool because of the playhead. The playhead only drives Keyframe's momentary disabled state and the action of Edit / Filter / Adjust / Background on the main bar — both live in the toolbar component.
2. **Sections.** Audio and Text on the main bar open their bar without a selection instead of opening a sheet directly: Ducking, Beats and Captions are project-level tools that need a home without a selection. Stickers and Effects open their sheets directly.
3. **Ducking is not a strip**: today it is a toggle button with no sheet, and it stays one (on the audio bar without a selection). Seventeen sheets become strips, not eighteen.
4. **Trim** was missing from the approved clip and layer orders; it is added (second on the clip bar, first on the layer bar) so the numeric Trim sheet stays reachable.
5. **Add audio** stays on a selected sound's bar (today's sub-row has it, to add a second sound without deselecting). The Effects entry is not on a selected effect's bar: back arrow, then Effects.
6. **Layer order tools keep today's labels "Forward" and "Back"** ("Bring forward" does not fit a 68-point tool button); the back arrow's label is therefore "Back to main tools".
7. **New tool ids:** `edit`, `audioMenu`, `textMenu`, `overlayEdit`, `overlayDuplicate`, `overlayDelete`. The sticker bar gets Edit (the sticker panel) besides the approved Animate, Keyframe, Duplicate, Delete. A caption's bar has Edit, Captions (which holds Caption style), Duplicate, Delete.
8. **Transform is pattern (a)**, not (b): it has six actions and no slider.
9. **The Effects add sheet stays a sheet** in round 1 (it is a picker that adds and closes; round 2).
10. **Height:** bar 86, strip 150, lift 64 (two lanes), by negative margin on the bottom area; nothing above it moves.
11. **Strips have no open / close animation** in round 1.
12. **The transition index leaves the screen's state** (`EditorToolbar` loses its `transitionFor` / `onTransitionChange` props). It is not stored in the strip store either (see As built): the strip reads the selected clip's place on every render.
13. **Hiding the bar is driven by the strip itself** (`useStripPresence`), not by the open-strip id, so sheets not yet converted keep working during the conversion and the multi-select bar needs no knowledge of the store.
