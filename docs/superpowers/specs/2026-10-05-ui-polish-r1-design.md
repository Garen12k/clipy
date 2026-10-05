# UI polish, round 1 — building blocks and the editor: design

**Date:** 2026-10-05
**Status:** Implemented 2026-10-05 (on-device confirmation by the user pending)
**Builds on:** the UI redesign ("Grand Voyage": `src/theme/theme.ts`, the kit in `src/ui/`), editing UI round 1 (the contextual bar, `ToolStrip`, `src/editor/toolStrip.ts`) and round 2 (`ToolPanel`, `EditorLayout`, `src/ui/keyboard.ts`). No model, schema or Swift change. No new package.

## 1. What the user gets

1. **Everything lines up.** One spacing scale, one left / right gutter for the top bar, the play row, the tools, the strips and the panels; buttons, chips and tiles have the same few sizes everywhere.
2. **One family of icons.** Every tool icon is the outline version; a gold icon means "on".
3. **Three kinds of button** — gold (the one main thing), outlined, text only — and a clearer "selected": a gold ring, a slightly lighter and slightly larger tile.
4. **It moves a little.** Buttons dip when pressed; a strip or a panel fades and rises into place; the row of tools fades in when it changes; a message at the bottom eases in and out. With **Reduce Motion** on, nothing slides or grows.
5. The header of a strip is taller, so the round ✓ and "Apply to all" are easy to hit.

The look stays (dark navy and gold, Oswald / Montserrat, the compass). **Behaviour does not change**: the same tools in the same places, the same undo steps.

Out of scope (round 2 or later): the home, export, post and accounts screens; screen-to-screen transitions; the Cover sheet and the Crop screen beyond what they inherit from the kit; new icon packages, SF Symbols, blur, new gradients; Android / web.

## 2. Tokens — `src/theme/theme.ts`

```ts
colors: { …today's, surfaceBar: "#112C4D", surfaceHigh: "#1F4572" },
space:  { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, gutter: 16 },
radius: { card: 12, chip: 8, tile: 7, sheet: 18, pill: 999, box: 14 },
ringClear: { borderWidth: 2, borderColor: "transparent" },   // the unselected twin of `ring`: same width, so selecting moves nothing
size: { touch: 44, control: 48, controlCompact: 36, iconButton: 40, toolBox: 44, toolColumn: 72, chip: 36, chipCompact: 28,
        row: 48, header: 44, done: 32, icon: { sm: 16, md: 20, lg: 24 } },
type: { micro: 11, small: 12, label: 13, body: 14 },
elevation: { page: "#0A1B33", bar: "#112C4D", tile: "#17365C", lifted: "#1F4572" },
motion: { …today's (press, sheet, fade, stagger, minLoading, fontTimeout),
          fast: 120, base: 180, slow: 240, enterShift: 8, pressScale: 0.96, selectedScale: 1.03,
          curve: [0.2, 0, 0, 1], spring: { mass: 1, damping: 40, stiffness: 700 } },
```

- **Spacing.** `space` is the only scale (4 / 8 / 12 / 16 / 24 / 32). `gutter` (16) is the screen's left / right edge. A row whose edge item is an `IconButton` pads by `space.sm`: the button's own 8-pt inset completes the gutter, so its glyph sits on the same line as a strip's title.
- **Sizes.** `touch` 44 is the minimum target: a smaller visual gets `hitSlop` that stays inside its parent's bounds (iOS does not deliver a touch outside the parent). `control` / `controlCompact` are the heights of all three button kinds. `toolBox` / `toolColumn` are the icon box and the column of a `ToolButton` and of a `Tile`. `chip` / `chipCompact` are chip heights. `row` is the top bar and the play row. `header` is a strip's and a panel's header (and a panel's lead). `icon`: `sm` 16 inside chips and small buttons, `md` 20 in tool boxes and the ✓, `lg` 24 in `IconButton`.
- **Elevation is colour, not shadow** (decision 4): `page` (the screen), `bar` (bars, strips, panels — a step lighter than the page's lower end, with the existing gold top hairline), `tile` (tiles, chips, fields inside them), `lifted` (the selected tile or chip).
- **Motion.** Three durations, one easing (`Easing.bezier(...curve)`, a decelerating curve), one spring (critically quick: settles in about 200 ms). Nothing in the editor runs longer than 250 ms.

### 2.1 The spacing guard — `src/__tests__/spacingScale.test.ts`

In the style of `noHexLiterals.test.ts`. It reads every `.ts` / `.tsx` under **`src/ui/`** and **`src/editor/components/`** (not `__tests__`) and reports each **numeric literal other than `0`** in the value of `padding*`, `margin*`, `gap`, `rowGap`, `columnGap` (so `theme.space.md`, `STRIP.header`, `insets.bottom` pass; `8` does not — even an on-scale number must be a token). Not reported: comment lines; a value that multiplies or divides (`h * 0.12`, `-HANDLE / 2` — a share of something measured); `StyleSheet.hairlineWidth`. Nothing else is checked (`width`, `height`, `top`, `hitSlop`, `fontSize`, `borderRadius` are sizes, not spacing).

Exceptions are one explicit table, `ALLOW: Record<file, { max: number; why: string }>`. The test fails when a file has **more or fewer** hits than its entry (so a fixed file must lose its entry). Today's hits: **`src/ui` 5** (3 files), **`src/editor/components` 34** (17 files); `app/editor/[id]/index.tsx` has 2 more (not guarded, fixed anyway). The table starts with exactly those and ends the round at the agreed minimum, **12 hits in 6 files**:

| File | Hits | Why it stays |
|---|---|---|
| `AudioBar.tsx`, `LayerBar.tsx` | 2 each | 1–2 pt geometry inside a 28-pt timeline lane (`HANDLE_W + 2`, the warning dot's `padding: 2`) |
| `OverlayPill.tsx`, `EffectPill.tsx` | 1 each | `HANDLE_W + 2` |
| `ClipThumbStrip.tsx` | 5 | the 10-pt badges on a thumbnail (`paddingVertical: 1` ×4, `padding: 2`) |
| `CoverSheet.tsx` | 1 | out of scope this round |

## 3. Layout budgets

### 3.1 The numbers that change

| Constant | Today | New | Why |
|---|---|---|---|
| `BAR_HEIGHT` (`src/ui/ToolStrip.tsx`) | 86 | **90** | 1 hairline + an 89-pt row; a tool button is 4 + 44 + 4 + label + 4 ≈ 70, so about 10 pt of air above and below (6 today) |
| `STRIP.header` | 36 | **44** | the ✓ (32 + 6 slop each way) and the action get a real 44-pt target inside the header |
| `STRIP.tiles` | 76 | **72** | a tile is ≈ 70 (4 + 44 box + 4 + label + 4) |
| `STRIP.slider` | 36 | 36 | three slider rows (Volume + fades) = 108 = tiles + slider |
| `STRIP.height` | 150 | **154** | 1 + 44 + 72 + 36 + 1 |
| `STRIP.lift` | 64 | 64 | `STRIP.height − BAR_HEIGHT` = two lanes = `2 × (LANE_HEIGHT + LANE_GAP)` from `timelineLayout.ts`: the strip's top edge still sits exactly on a lane's top edge |
| tool / tile column | 68 | **72** (`size.toolColumn`) | |
| tool button box | 40 | **44** (`size.toolBox`) | |
| `MULTI_BAR_HEIGHT` | 104 | 104 | 1 + 8 + 17 + 70 fits; with a strip it rises by `STRIP.height − 104` = 50 (46 today) |
| `PANEL.*`, `panelHeight` | — | unchanged | header and lead are already 44 |
| top bar, play row | 48 by content | **48, explicit** (`size.row`) | |

Tests read `BAR_HEIGHT`, `STRIP.*`, `MULTI_BAR_HEIGHT`, `PANEL.*`, `panelHeight` from the constants (`EditorLayout.test.tsx`, `EditorToolbar.test.tsx`, `strips.r2.test.tsx`, the panel suites) and need no edit. Literals that must change: `ToolStrip.test.tsx` (86 / 150 / 148 / 76 / the header 36), `strips.layout.test.tsx` if it names 68, and any test that names the tile width 68 or the box 40.

### 3.2 The preview

> **Superseded (bigger preview).** The timeline is no longer always 216: a lane is shown only while it holds something (`laneModel` in `timelineLayout.ts`), so it is 120 with clips only and 216 with a text, one sound and an effect. The table below is the three-lane case. With clips only the slot is 325 (375 × 667) / 445 (393 × 852); with two lanes 261 / 381. A strip lifts by `min(STRIP.lift, lanes' height)` and the preview gives the rest while it is open (clips only: 261 / 381). The margin around the frame is 4 (`space.xs`), not 12.

Preview slot = window − (top inset + 8) − top bar 48 − play row 48 − timeline 216 − (bar + bottom padding). One audio lane, no layers lane.

| Phone | Bar, today → new | Strip | Regular / compact / typing panel | Strip + keyboard (Trim), today → new |
|---|---|---|---|---|
| 375 × 667, insets 20 / 0, keyboard 260 | 233 → **229** | 229 (does not resize) | 228 / 295 / 135 (unchanged) | 133 → 129 |
| 393 × 852, insets 59 / 34, keyboard 336 | 353 → **349** | 349 | 263 / 415 / 166 (unchanged) | 203 → 199 |

The only cost is 4 pt of preview in the bar state.

### 3.3 Gutters

Top bar: `height: size.row`, `paddingLeft: space.sm`, `paddingRight: space.gutter`, `paddingBottom: space.sm`. Play row: `height: size.row`, `paddingHorizontal: space.sm`. Toolbar row: the back arrow gets `paddingLeft: space.sm`. Strips and panels: `space.gutter`. The toast: `left / right: space.gutter`.

## 3a. As built

What was built, and where it differs from the plan above. Commits `f0314eb` (tokens) to `dc5a991` (fix wave 1), then the guard pins and these docs.

**Numbers.** Bar 86 to 90; strip 150 to 154 with a 44-pt header (tiles 72, slider 36); the lift is still two timeline lanes (64). The preview is 4 pt shorter in the bar state (229 instead of 233 on 375 x 667; 349 instead of 353 on 393 x 852), and 4 pt shorter with Trim and the keyboard up. `MULTI_BAR_HEIGHT` stays 104 (a strip rises 50 over it). `STRIP` is derived from named parts in `ToolStrip.tsx`, not typed as five literals; `budgets.test.tsx` pins the values.

**Look.** A selected chip has a gold ring (no gold fill); the header check is a gold ring on the tile colour. Surfaces are colour steps (`theme.elevation`), no shadows. Compact tab chips have a 72-pt-high tap area (the strip's lead row). Compact buttons carry 4 pt of top / bottom slop (`buttonSlop`).

**Motion.** Entrances only: strip, panel, the row of tools (on a `key={bar}` change, or when it returns) and the toast. No exit animations (closing is instant) and no layout animations; `toolStrip.ts` is untouched. No tile stagger. `PressableScale` takes `still`: the Speed preset chips set their lift at once while the slider is dragged, so nothing animates during a drag. The toast fades out by a timer shortly before its 2.5 s end.

**Sliders and tiles.** The kit `Slider` (`src/ui/Slider.tsx`) wraps the community slider: gold track and thumb; the unfilled track is `theme.colors.sea` (2.5:1 on a bar; the planned `elevation.tile` was 1.15:1 and nearly invisible). A light haptic tick at Adjust 0 (Brightness), Volume 100 % (clip and sound) and Speed 1x; a disabled slider never ticks, and nothing ticks outside a drag. `StripSlider` shows a `ValueLabel` (tabular digits). Only `CoverSheet.tsx` still imports the community slider. The kit `Tile` (`TILE_WIDTH` 72) replaces the four private 68-pt tiles.

**Icons.** Every tool icon is an outline icon. Trim uses `code-outline` and Blend `color-fill-outline`, for lack of better outline glyphs (both are on the phone checklist). Kept filled: the keyframe diamond, play / pause in `TransportRow`, mic / stop in `RecordTab`, warning / image / videocam / volume-medium on timeline bars, play in `PreviewPlayer`, checkmark in `ProgressRing`.

**Touch targets below 44 pt (kept on purpose).** Adjust's Reset is a 36-pt-high target (its row is 36 high, so its slop has no room). Add audio's USE / Add button is a 36-pt touchable inside a row about 64 high. Captions' "Replace existing captions?" buttons are all compact (36) so the card fits the compact panel; the "Added captions." Style captions button is a regular 48. Beats' two buttons are compact (about 327 of 343 pt on a 375-pt phone, estimated, not measured).

**Tests whose expectations changed.** `ToolStrip.test.tsx` (86 / 150 / 36 / 76 to 90 / 154 / 44 / 72; the action hit-slop test replaced by a 44-pt header test); `ToolPanel.test.tsx` (the header-action target test replaced: the action is a compact quiet button); `kit.test.tsx` (two chip cases: ring, heights); `strips.layout.test.tsx` (tile column 68 to 72; the Volume label is read through its parent); `SpeedSheet.test.tsx` ("1.5x" now appears twice); `Slider.test.tsx`, `strips.polish.test.tsx`, `panels.polish.test.tsx` and `sheetStyle.test.tsx` (rest track `sea`); `useReducedMotion.test.tsx` (exactly one query and one listener); `CaptionsSheet.test.tsx` (two expectations added).

**Files outside the plan.** `src/ui/buttonStyle.ts`, `src/ui/QuietButton.tsx`, `src/ui/DoneButton.tsx`, `src/ui/Enter.tsx` and `ValueLabel` in `src/ui/Text.tsx`; the top bar and play row have explicit 48-pt rows. Nothing on the plan's do-not-touch list changed (`git diff --stat main` is empty for it).

**Guards.** `spacingScale.test.ts` has two documented blind spots: an apostrophe in JSX text hides the rest of its line, and a value with `*` or `/` is skipped whole (raw numbers in it included). `kitSlider.test.ts` also checks that no kit slider overrides the rest track. Both allow-tables are pinned at their minimum: timeline-lane geometry below the 4-pt scale, and the Cover sheet.

**Left as it was.** The four timeline pills (`AudioBar`, `EffectPill`, `LayerBar`, `OverlayPill`) still use `fontSize: 12` rather than `theme.type.small`.

**Round 2 (not done).** Home, export, post and accounts screens, screen transitions, `Sheet` (Cover) and `CropScreen`.

**What no test checks.** Everything on the device checklist at the end of the plan: how it looks and feels, the haptics, smoothness while the video plays, Reduce Motion on the phone, the smallest iPhone.

## 4. Buttons, icons and controls

### 4.1 Pressables

`PressableScale` is the one pressable for buttons, chips, tiles and tool buttons. It gains `lifted?: boolean` (the selected state's 1.03). Its scale is `press × (1 + 0.03 × lift)`, both shared values, set from the press handlers and from an effect on `lifted` — no React state, no re-render per press. Existing haptics stay where they are (in the callers).

### 4.2 Three kinds of button

| Kind | Component | Look |
|---|---|---|
| main | `PrimaryButton` | gold fill, navy label |
| secondary | `SecondaryButton` (+ `compact`) | 1.5-pt outline (`hairline`; `danger`: red), cream label |
| quiet | **`QuietButton`** (new file, same props) | no box; gold label (`danger`: red) |

All three: height `size.control` 48 (`compact`: 36), pill radius, `paddingHorizontal` `space.xl` (`compact`: `space.lg`; quiet: `space.sm`), label `fonts.bodyBold`, `type.body` 14 (`compact`: `type.label` 13), letter spacing 1, upper case, disabled = 0.4 opacity. A quiet button is at least 44 wide and gets vertical `hitSlop` to 44 when compact. Shared by `src/ui/buttonStyle.ts`.

**At most one main button per screen or panel.** The editor's is Export. What changes kind:

| Where | Today | Becomes |
|---|---|---|
| Strip / panel header ✓ (new `src/ui/DoneButton.tsx`) | gold disc | **ringed disc**: `elevation.tile`, 1.5-pt gold ring, gold ✓ (the gold fill is kept for the main action) |
| Strip / panel header action ("Apply to all") | bare text | `QuietButton compact` |
| Adjust → Reset | compact chip | `QuietButton compact` |
| Add audio rows → Use / Add | chip | `SecondaryButton compact` |
| Captions, "Replace existing captions?" → Cancel | secondary | quiet |
| Captions, "Added captions." → Style captions | main (compact) | secondary (✓ is the way out) |

Unchanged: Export, Tap (Beats), Transcribe / Try again / Open Settings, Choose a file, Trim's Apply (each the one main of its panel or strip); Duplicate / Delete; the play disc and the record button (transport controls, not buttons of a kind); Cover.

### 4.3 Chips and tiles

- **Chip**: explicit height (36 / 28), pill. Unselected: `elevation.tile`, a 2-pt transparent border (no jump when selected). **Selected: the gold ring (`theme.ring`), `elevation.lifted`, gold semi-bold label, `lifted`.** (Today: a gold fill.) Regular chips get 4 pt of vertical `hitSlop`.
- **Tile** — new `src/ui/Tile.tsx`, replacing four copies (Mask, Blend, the animation tiles, the speed-curve tiles): a `size.toolColumn` column, a `size.toolBox` box with `radius.box`, a `type.micro` label. Unselected: `elevation.tile`, muted content, regular label. Selected: ring + `elevation.lifted` + gold semi-bold label + `lifted`. The box's content is `children` or an icon (`size.icon.md`).
- **ToolButton**: the same column and box; `active` = ring + `elevation.lifted` + gold icon and label (today: a gold-filled box).
- Filter thumbnails (52), template tiles (72), colour swatches and font chips keep their sizes; they take the same ring and `elevation` colours.

### 4.4 Icons

One style: **Ionicons outline** (`@expo/vector-icons` 15.1.1; every name below was checked against its glyph map). One size per context (`size.icon`). One colour rule: `text`, **active `accent`**, disabled = the control's 0.35 / 0.4 opacity.

`src/editor/toolGroups.ts` (48 tools; unchanged ones marked =):

| Tool | Old → new | Tool | Old → new |
|---|---|---|---|
| edit | = `film-outline` | layerForward | `arrow-up` → `arrow-up-outline` |
| audioMenu | `musical-notes` → `musical-notes-outline` | layerBack | `arrow-down` → `arrow-down-outline` |
| textMenu | `text` → `text-outline` | replace | `sync` → `sync-outline` |
| sticker | `happy` → `happy-outline` | reverse | `play-back` → `play-back-outline` |
| overlay | `layers` → `layers-outline` | freeze | `snow` → `snow-outline` |
| effect | `flash` → `flash-outline` | duplicate | `copy` → `copy-outline` |
| filter | `color-filter` → `color-filter-outline` | delete | `trash` → `trash-outline` |
| adjust | `options` → `options-outline` | select | `checkmark-done` → `checkmark-done-outline` |
| ratio | `phone-portrait` → `phone-portrait-outline` | overlayEdit | = `create-outline` |
| background | `color-palette` → `color-palette-outline` | overlayDuplicate | `copy` → `copy-outline` |
| cover | = `image-outline` | overlayDelete | `trash` → `trash-outline` |
| templates | `color-wand` → `color-wand-outline` | text | = `add-circle-outline` |
| split | `cut` → `cut-outline` | captions | `chatbox-ellipses` → `chatbox-ellipses-outline` |
| trim | `crop` → **`code-outline`** (‹ › = in and out points) | addAudio | = `add-circle-outline` |
| speed | `speedometer` → `speedometer-outline` | ducking | `volume-low` → `volume-low-outline` |
| volume | `volume-high` → `volume-high-outline` | beats | `pulse` → `pulse-outline` |
| animate | = `play-forward-outline` | audioVolume | `volume-medium` → `volume-medium-outline` |
| crop | `crop` → `crop-outline` | audioFade | `trending-up` → `trending-up-outline` |
| transform | `resize` → `resize-outline` | audioDuplicate | `copy` → `copy-outline` |
| opacity | `contrast` → `contrast-outline` | audioDelete | `trash` → `trash-outline` |
| mask | = `ellipse-outline` | effectStrength | `speedometer` → `speedometer-outline` |
| blend | `layers-outline` → **`color-fill-outline`** | effectDuplicate | `copy` → `copy-outline` |
| chroma | = `leaf-outline` | effectDelete | `trash` → `trash-outline` |
| keyframe | = `diamond-outline`; on a pin: `diamond` (kept) | transition | `swap-horizontal` → `swap-horizontal-outline` |

Elsewhere in the editor:

| Where | Old → new |
|---|---|
| `MultiSelectBar` | `trash` → `trash-outline`, `copy` → `copy-outline`, `color-filter` → `color-filter-outline`, `speedometer` → `speedometer-outline`, `volume-high` → `volume-high-outline`, = `albums-outline`, `checkmark` → `checkmark-outline` |
| `TransformSheet` | `refresh` → `refresh-outline`, `swap-horizontal` → `…-outline`, `swap-vertical` → `…-outline`, `contract` → `contract-outline`, `expand` → `expand-outline`, `arrow-undo` → `arrow-undo-outline` |
| `TransportRow` | `arrow-undo` → `arrow-undo-outline`, `arrow-redo` → `arrow-redo-outline`; = `play` / `pause` (filled, see below) |
| `EditorTopBar`, `EditorToolbar` (back) | `chevron-back` → `chevron-back-outline` |
| `ToolStrip`, `ToolPanel` (✓) | `checkmark` → `checkmark-outline` |
| `AddClipTile` | `add` → `add-outline` |
| `AddAudioSheet` (audition) | `play` / `stop` → `play-outline` / `stop-outline` |
| `ReorderHandle` | `reorder-two` → `reorder-two-outline` |
| `AnimationTiles` (None) | = `ban-outline` |
| `src/editor/effects.ts` (effects, animations) | already outline; **not edited** (mirrored in Swift) |

**61 icon uses change name**: 39 of the 48 tools in `toolGroups.ts` (9 are already outline) and 22 elsewhere (6 `MultiSelectBar`, 6 `TransformSheet`, 2 `TransportRow`, 2 back arrows, 2 ✓, 1 `AddClipTile`, 2 `AddAudioSheet`, 1 `ReorderHandle`).

**Kept filled, on purpose:** the keyframe `diamond` on a pin (filled = "there is a pin here"); `play` / `pause` in the play disc and `mic` / `stop` in the record button (a glyph on a filled disc — an outline glyph reads as a hole); the 10–14-pt glyphs on timeline bars and thumbnails (`warning`, `image`, `videocam`, `volume-medium` — outline strokes vanish at that size); the play badge inside `PreviewPlayer.tsx` (that file is not edited).

**Tools without a good outline glyph:** **Trim** (Ionicons has no trim glyph; today it shares `crop` with Crop — `code-outline` is the nearest that is not already another tool), **Blend** (it was told apart from Overlay only by filled / outline; `color-fill-outline` is an approximation) and **Speed / Strength** (both `speedometer-outline`; they are never on the same bar).

### 4.5 Sliders

`@react-native-community/slider` stays (native). New kit wrapper **`src/ui/Slider.tsx`**:

- `Slider` — the community slider with the theme's tints as defaults (`accent` track and thumb, `elevation.tile` rest); the caller's props win (Speed mutes its tint while a curve is on). `detents?: readonly number[]`: a **light haptic tick when a drag crosses or lands on a detent** (the value where the control is "at rest"). The tick is fired from `onValueChange` with the last value kept on a ref: no state, **no store write, no snapping** — the value is passed through untouched.
- `ValueLabel` (in `src/ui/Text.tsx`) — `label` (muted) and `value` (cream, semi-bold, `tabular-nums`) as **one text** ("Opacity 40 %"), so digits do not jitter while dragging and every existing text query still matches.
- `StripSlider` gets `value?: string` and renders `ValueLabel`; the panels' "Size 120%" lines use `ValueLabel` too.

Detents: Adjust `0` (for the keys whose range goes below 0), clip and track Volume `1` (100 %), Speed `1` (1×). Opacity, strengths, lengths, fades and sizes have none (their rest value is an end of the track or there is none).

## 5. Motion

### 5.1 Mechanism

- **Reanimated 4.5.1, shared values + `useAnimatedStyle` + `withTiming` / `withSpring`** — the mechanism `Sheet.tsx`, `PressableScale.tsx` and `LoadingScreen.tsx` already use in Expo Go. Only `opacity` and `transform`. **No layout animations** (`entering` / `exiting` / `LinearTransition` are not used anywhere): they are the one Reanimated feature that takes part in mounting and unmounting, right next to the video.
- **`src/ui/motion.ts`** is the only file that builds an animation: `timing(ms)`, `pressTo(down, reduced)`, `liftTo(on, reduced)`, `enterTo(reduced, duration?, delay?)`, `fadeOutTo(reduced)`. Each returns the value to assign to a shared value.
- **`src/ui/Enter.tsx`** — `EnterView`: on mount its content goes from `opacity 0`, 8 pt off (`axis` `"y"` below, or `"x"` to the right) to rest in `motion.base`. It animates **once, on mount** — never on a re-render or a prop change.
- **Enter only; closing is instant.** A strip or panel is unmounted the moment the tool store says closed — nothing lingers. The bar's buttons that take its place fade in (they are an `EnterView` too), which reads as a cross-fade. Reason: the bottom area's height and its lift over the timeline change in the same frame; a strip kept alive to fade out would be drawn in a container that has already shrunk, over lanes that take touches again, and the closer rules (`useStripCloser`, Export, recording) would have to know about a "closing" state. Decision 2.
- **The layout change stays instant.** The preview slot, the timeline slot and the bottom area's height / `marginTop` are plain styles as today. `EnterView` sits **inside** the strip's / panel's opaque root (which keeps its explicit height and its `bar` colour), so what moves is the content, never a frame next to the video.

### 5.2 Where

| Where | What | Duration |
|---|---|---|
| Any `PressableScale` (buttons, chips, tiles, tool buttons, `IconButton`) | scale to 0.96 on press-in, back on press-out | `fast` |
| Selected chip / tile / active tool button | scale 1 ↔ 1.03 (spring); ring and colour switch at once | ≈ 200 ms |
| `ToolStrip`, `ToolPanel` | header + rows fade and rise 8 pt on opening | `base` |
| `EditorToolbar` | the row of tools (keyed by the bar) fades and slides 8 pt from the right when the bar changes or a tool closes; **the back arrow is outside it and stays put** | `base` |
| `ToastHost` | fades and rises in; fades out over the last `fast` ms of its 2.5 s (timers, not animation callbacks) | `base` / `fast` |

**Not done: a stagger of tiles.** The tile rows are keyed by their tab and start at an offset (`contentOffset`), so a stagger would replay on every tab change and need one delayed animation per tile for a 180-ms effect.

### 5.3 Reduce Motion — one mechanism

`src/ui/useReducedMotion.ts` becomes one shared store (one `AccessibilityInfo` listener for the app, seeded synchronously from Reanimated's start-up value, live-updated): `useReducedMotion()` for components, **`isReducedMotion()`** for handlers (no subscription). Every function in `motion.ts` takes `reduced` and then returns the end value itself — no tween, no spring. So with Reduce Motion: nothing slides, rises or eases; a press and a selection still change size, but in one step; content appears at once; the toast appears and disappears at once. Reanimated's own default (`ReduceMotion.System` on every `withTiming` / `withSpring`) is left untouched as a backstop; it is never overridden.

### 5.4 Performance rules

- No animation is driven by React state per frame; shared values only, set from handlers and effects.
- No animated style and no layout animation on an ancestor of the preview: `EditorLayout`, `Screen` and the slots are not animated.
- The toolbar does not re-render per playhead tick (it does not today); `EnterView` adds no store subscription.
- Nothing animates while a slider is dragged: animations start only on mount (`EnterView`), on a press, or when `lifted` changes — never from a value prop.
- **Tests see the configuration, not time.** Under Jest (`jest.setup.ts` → `react-native-reanimated/mock`) `withTiming` / `withSpring` return their target at once, `useAnimatedStyle` runs its function once per render, `Animated.View` is `View`, `createAnimatedComponent` is the identity. So: `motion.ts` is tested by wrapping `withTiming` / `withSpring` in `jest.fn` (as `Sheet.test.tsx` does) and checking target, duration, easing, and "not called" under Reduce Motion; components are tested by firing `pressIn` / mounting and checking those calls. A mounted `EnterView` keeps `opacity: 0` in its test style (the mock never re-renders it) — RNTL does not treat opacity as hidden, and no test may assert visibility through it.

## 6. Surfaces

`EditorToolbar`'s root, `MultiSelectBar`'s root, `ToolStrip` and `ToolPanel`: `elevation.bar` with the 1-pt `hairline` on top (already there). Tiles, chips, tool boxes, fields, list rows: `elevation.tile`. Selected: `elevation.lifted`. `Sheet` keeps `colors.surface` (out of scope). The top bar and the play row sit on the page.

## 7. Testing

- Tokens; the spacing guard (with its table); `motion.ts`; the Reduce Motion store.
- Kit: sizes from tokens, the three buttons, chip / tile / tool button selected state, press and lift calls, `Slider` detent ticks (crossing, landing, not at the start, not without detents), `ValueLabel` as one text, `EnterView`, toast timers.
- Budgets: `STRIP.height = 1 + header + tiles + slider + 1`, `STRIP.lift = STRIP.height − BAR_HEIGHT = 2 lanes`, the preview table of §3.2 computed from the constants.
- Editor: every `TOOL_META` icon is an outline name that exists; no editor component imports the community slider directly (table shrinking to `CoverSheet`); the back arrow is not inside the animated row; `EditorLayout`'s preview probe still mounts once through open / close with the animated strip.
- Every existing behaviour suite keeps passing; only expectations about size, colour, kind of button and icon change.

## 8. Risks

- **On-device feel is unverified** (no simulator here): durations, the 8-pt shift, 1.03, the two new navy steps and the ringed ✓ are judged on the phone (checklist in the plan).
- **`opacity` on a whole panel** (the emoji grid) is composited off-screen for 180 ms on opening.
- **`Sheet`'s spring** (`motion.sheet`, damping 18 / stiffness 220) was tuned for Reanimated 3's mass of 1; Reanimated 4's default mass is 4, so it is probably bouncier than intended. Not changed here (Sheet is round 2); noted.
- The bar is 4 pt taller, so the preview loses 4 pt in the bar state (§3.2); a strip row for tiles is 4 pt shorter (72), with about 1 pt to spare around a tile.
- Chips that were gold-filled when selected become ringed: tabs (In / Out / Loop, Emoji / Shapes) are quieter than before.

## 9. Decisions made while writing

1. **Verified, and where.** `node_modules/react-native-reanimated` 4.5.1: `src/animation/spring/springConfigs.ts` (v4 defaults mass 4 / damping 120 / stiffness 900; `duration`-based springs last 1.5 × the stated time — so plain `mass / damping / stiffness` is used; `restDisplacementThreshold` / `restSpeedThreshold` are deprecated no-ops), `src/animation/timing.ts` (`{ duration, easing, reduceMotion }`), `src/Easing.ts` (`Easing.bezier` returns a factory, accepted by `withTiming`), `src/commonTypes.ts` (`ReduceMotion.System | Always | Never`), `src/hook/useReducedMotion.ts` + `src/ReducedMotion.ts` (the start-up value only, never updated), `src/index.ts` (`Layout` deprecated for `LinearTransition`; `runOnJS` & co. deprecated for `react-native-worklets`), `src/mock.ts` (what Jest sees, §5.4). Expo SDK 57 docs, `versions/v57.0.0/sdk/reanimated`: in Expo Go, the Babel plugin comes with `babel-preset-expo` (the repo has no `babel.config.js`, correctly). `@react-native-community/slider` 5.2.0 typings (`SliderProps`, default export). `@expo/vector-icons` 15.1.1 glyph map (every icon name). `@testing-library/react-native` 14.0.1 (`getByText` joins nested text; `fireEvent` finds handlers on composite parents; opacity is not "hidden").
2. **No exit animations and no layout animations** (§5.1).
3. **Reduce Motion through the kit's own store**, made shared so a pressable needs no listener of its own (§5.3).
4. **No shadows.** An iOS shadow on a view without a fixed `shadowPath` is rendered off-screen each time what is under it changes — and under these bars a video plays. Colour steps and the ring cost nothing.
5. **The bar grows by 4, the strip by 4, the lift stays two lanes.** Three lanes (a 186-pt strip) would have been roomier but takes 36 pt more from the preview while typing in Trim on a small phone.
6. **`QuietButton` is its own component**, like the other two; the three share `buttonStyle.ts`.
7. **The header ✓ is ringed, not gold-filled**, so "one main button" holds inside a strip with Apply or a panel with Tap.
8. **The tile is a kit component** (four copies today), and the selected lift lives in `PressableScale`, so there is one animated pressable.
9. **The icon table lives in `src/editor/toolGroups.ts`** (not `toolbarContext.ts`, which only decides which tools show). Trim and Blend get new glyphs because an all-outline set would otherwise show the same icon for Trim / Crop and for Overlay / Blend.
10. **`ValueLabel` is one nested text**, which keeps about forty existing `getByText("Opacity 40 %")` expectations valid.
11. **The guard counts on-scale literals too** and compares exact counts per file; ratios (`*`, `/`) are exempt. `app/` is not guarded (one editor file, fixed in the sweep).
12. **No tile stagger** (§5.2). **No type-size guard**: `theme.type` exists and the kit uses it; the editor moves its 11 / 12-pt labels to it where a file is edited anyway.
