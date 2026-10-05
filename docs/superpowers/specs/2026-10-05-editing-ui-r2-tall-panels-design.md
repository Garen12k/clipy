# Editing UI, round 2 — tall panels: design

**Date:** 2026-10-05
**Status:** Implemented 2026-10-05 (Swift untouched; on-device confirmation by the user pending)
**Builds on:** round 1 (`docs/superpowers/specs/2026-10-05-editing-ui-r1-toolbar-strips-design.md`): the contextual bar (`src/editor/toolbarContext.ts`), tool strips (`src/ui/ToolStrip.tsx`), the open-tool store (`src/editor/toolStrip.ts`). No model, schema or Swift change.

## 1. What the user gets

1. **The big pickers stop being pop-up sheets.** Text, Stickers, the sticker editor, Add audio, Templates, Captions, Caption style and Beats open as a **tall panel** at the bottom of the editor. Nothing dims. While a panel is open the timeline and the row of tools give it their place; the video stays on screen above it, a little smaller, and keeps playing; the play / undo / redo row stays between the video and the panel.
2. **Typing keeps the video in view.** When a panel (or the Trim strip) has the keyboard, it sits just above the keyboard and the video shrinks further instead of being covered.
3. **Two more strips.** The Effects list and Trim (by numbers) become round-1 strips.
4. A panel closes exactly like a strip: the round ✓, selecting something else, the item disappearing, Export, leaving the editor.

Out of scope: colours / fonts, the home / export / post screens, timeline lanes, preview gestures, any new feature, any model / schema / Swift change. `CropScreen` stays a full-screen Modal. **Cover stays a sheet** (decision 1).

## 2. The tall panel

### 2.1 The kit component — `src/ui/ToolPanel.tsx`

Not a `Modal`: a plain view rendered where it is mounted (inside the editor's bottom area, like a strip). No scrim, no drag handle, no animation.

```
┌──────────────────────────────────────────────────────────────┐
│ TITLE                                    Action (opt.)   (✓) │  header, 44
├──────────────────────────────────────────────────────────────┤
│ [tab] [tab] [tab]                      lead (optional), 44   │  fixed, does not scroll
├──────────────────────────────────────────────────────────────┤
│ body — an explicit height; scrolls vertically when needed    │
└──────────────────────────────────────────────────────────────┘
```

```ts
export const PANEL = { header: 44, lead: 44, compact: 240, regularShare: 0.46, regularMin: 300, regularMax: 430, typingShare: 0.22, typingMin: 148, typingMax: 200 } as const;
export type PanelSize = "regular" | "compact";
export function panelHeight(size: PanelSize, windowHeight: number, typing?: boolean): number
export const usePanelPresence: UseBoundStore<StoreApi<{ count: number; size: PanelSize }>>
type ToolPanelProps = { visible: boolean; onClose: () => void; title: string; size?: PanelSize; action?: { label: string; onPress: () => void };
  lead?: React.ReactNode; scroll?: boolean; bodyTestID?: string; children: React.ReactNode | ((bodyHeight: number) => React.ReactNode) };
export function ToolPanel(props: ToolPanelProps): React.JSX.Element | null
```

- Header like the strip's: the title at the left (`accessibilityRole="header"`, the same text the sheet had), an optional action, a round ✓ with `accessibilityLabel="Done"`.
- `lead`: one fixed row under the header (tabs, scope chips). Not rendered while the keyboard is up.
- Body: by default a vertical `ScrollView` of **explicit height** (`keyboardShouldPersistTaps="handled"`, `keyboardDismissMode="on-drag"`, no scroll handlers). `scroll={false}` gives a plain view of the same explicit height for content that brings its own list (the emoji grid); `children` may then be a function that receives the body's height, so the list gets an explicit height too.
- **Explicit heights only.** The panel, its header, its lead and its body all have numbers. `flex: 1` is never used for height (a past device bug collapsed a sheet's content off-screen).
- A visible panel registers itself in `usePanelPresence` (a counter and its size), before paint. The host reads it — so a sheet that is not converted yet keeps working during the conversion (round-1 decision 13).

### 2.2 Height

`panelHeight` is the bottom area's height while a panel shows, without the bottom padding: 1 (the host's hairline) + header + lead + body.

| Size | Height | Used by |
|---|---|---|
| `regular` | 46 % of the window height, rounded, never below 300 or above 430 | Text, Stickers, Add audio, Templates, Caption style |
| `compact` | 240 | Beats, Captions, the sticker editor |
| typing (any size, while the keyboard is up) | 22 % of the window height, rounded, never below 148 or above 200 | every panel with a text field |

| Window height | regular | typing |
|---|---|---|
| 667 (iPhone SE) | 307 | 148 |
| 812 | 374 | 179 |
| 852 | 392 | 187 |
| 932 | 429 | 200 |
| 956 | 430 | 200 |

Under the panel the bottom area keeps its padding: `max(bottom safe-area inset, 8)`, or the keyboard's height while the keyboard is up (§2.5).

### 2.3 What gives up the space — and what does not move

The editor screen is one column: top bar, preview slot (`flex: 1` — the screen itself is full-height, so this is not an auto-height parent), transport row, timeline slot, bottom area. The column moves to `src/editor/components/EditorLayout.tsx` (five slots), so it can be tested; `app/editor/[id]/index.tsx` only fills the slots.

While a panel shows:

- **The toolbar's buttons are not rendered** (as with a strip): the bottom area holds the panel and has the explicit height `panelHeight + padding`, no negative margin.
- **The timeline is hidden, not unmounted and not resized.** Its slot gets `height: 0` and `overflow: "hidden"`, plus `pointerEvents="none"`, `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"`. The `Timeline` inside has its own explicit height, so no view in it changes its frame: the horizontal scroll view keeps its offset, and it keeps following the playhead while hidden. Zoom lives in the store. When the panel closes the timeline is where it was. `Timeline.tsx` and `timelineScroll.ts` are not edited. (Unmounting it would start a new scroll view at x = 0; `display: "none"` would give every view in it a zero frame.)
- **The transport row stays** between the preview and the panel.
- **The preview takes what is left** and resizes: preview slot height = window height − (top inset + 8) − top bar (48) − transport row (48) − `panelHeight` − bottom padding. `PreviewPlayer` lays its frame out with `aspectRatio`, `maxWidth / maxHeight: 100%`, centred, and re-measures it with `onLayout`; every overlay, layer, region box and gesture gets `frameW / frameH` from that measurement on each render and positions itself in fractions of the frame; nothing caches a size. The one `VideoView` is rendered while `frame.w > 0`, which stays true through a resize, so it never remounts and its key never changes. **`PreviewPlayer.tsx` is not edited.**

Approximate preview slot (the picture is 24 points smaller, its aspect ratio kept; one audio lane, no layers lane):

| Phone | Today (bar) | regular panel | compact panel | typing |
|---|---|---|---|---|
| 667 high, insets 20 / 0, keyboard 260 | 233 | 228 | 295 | 135 |
| 852 high, insets 59 / 34, keyboard 336 | 353 | 263 | 415 | 166 |

A compact panel is shorter than the timeline plus the bar, so the preview **grows** while it is open.

Strips are unchanged: 150 high, lifted 64 over the timeline, the preview does not resize.

### 2.4 Opening and closing — `src/editor/toolStrip.ts`, generalised

The same store holds the one open tool, strip or panel: `{ id: OpenToolId; key: string } | null`, `OpenToolId = StripId | PanelId`.

```ts
export type StripId = /* the seventeen of round 1 */ | "effect" | "trim";
export type PanelId = "beats" | "templates" | "captions" | "addAudio" | "sticker" | "text" | "stickerEdit";
export function openStrip(id: OpenToolId): void     // name kept: it opens a strip or a panel
export function closeStrip(): void
export function rekeyStrip(): void                  // the open tool now belongs to the current selection
export function closeForExport(): boolean           // Export: false = stay (a voice-over is being recorded)
export function useStripCloser(): void
```

`panelFor` (the screen's state for the text / sticker panel) is gone: the Text panel and the sticker editor are tools `"text"` and `"stickerEdit"` and read their overlay from the selection (`selectedOverlayId`), like every strip.

A tool closes when:

1. ✓ is pressed;
2. the selection key is no longer the one it opened with (another item, none, the item deleted or undone away, multi-select);
3. Export is opened or the editor is left;
4. it closes itself as it did as a sheet (after adding; Delete in the Text panel; Trim's Apply).

**Tools that create or change the selection.** The rule is the order of calls inside one event handler; the closer runs in an effect afterwards.

- **Add, then close** (Stickers, the Effects picker, Add audio — a file, a bundled track, a recording): `apply`, select the new item, `onClose()` — today's order, unchanged. When the closer runs the tool is already closed; the new item's bar shows. Whichever of the two closes first, the result is the same and nothing reopens.
- **Add, then open** (Add text): `apply`, `selectOverlay(id)`, then `openStrip("text")` — select first, open second, so the panel's key is the new text and its own selection change cannot close it.
- **Change the selection and stay** (Duplicate in the Text panel and the sticker editor): `selectOverlay(copy)`, then `rekeyStrip()` — the panel now edits the copy, as `onRetarget` did.
- **Captions** replaces every caption, so a selected caption would vanish and take the panel with it: Transcribe / Replace first deselect a selected caption and `rekeyStrip()`, then run.
- A double-tap on a text or sticker in the preview selects it, then opens `"text"` / `"stickerEdit"`.

**Closing the Text panel removes a text left empty**, however it closed (today `closeText` did that for the sheet's own close): the toolbar remembers which text the panel was open for and checks it when the panel is no longer open for it.

**While a voice-over is being recorded** (`recording` in the editor store) the Add audio panel cannot be taken away from under the recorder (as a sheet, nothing else could be pressed): the closer waits, `openStrip` does nothing, and Export pauses playback — which stops and saves the recording, and the panel then closes itself — instead of leaving. Pressing ✓ still stops, saves and closes (the sheet's close guard, unchanged). Leaving the editor with the back arrow unmounts the recorder, which discards the recording and restores the audio session, as `useVoiceRecorder` already does on unmount.

### 2.5 Keyboard

Sources read for this: the React Native 0.86 `Keyboard` page (methods `addListener`, `dismiss`, `metrics`, `isVisible`, `scheduleLayoutAnimation`; events `keyboardWillShow`, `keyboardDidShow`, `keyboardWillHide`, `keyboardDidHide`, `keyboardWillChangeFrame`, `keyboardDidChangeFrame`, all six on iOS), `node_modules/react-native/Libraries/Components/Keyboard/Keyboard.d.ts` (`KeyboardEvent.endCoordinates: { screenX, screenY, width, height }`), and the Expo keyboard-handling guide (`react-native-keyboard-controller` is not in Expo Go — not used; no new package).

- `src/ui/keyboard.ts`: a tiny store `useKeyboard: { height: number }` and `useKeyboardTracking()`, called once in `EditorLayout`. It starts from `Keyboard.metrics()?.height ?? 0`, sets `e.endCoordinates.height` on `keyboardWillShow` (iOS posts it again when the keyboard's frame changes) and 0 on `keyboardWillHide`.
- The keyboard only counts **while a strip or a panel shows** (a rename alert or the export / post screens above the editor do not move the editor).
- Then: the bottom area's bottom padding is the keyboard's height (the screen reaches the bottom of the window, so the tool sits exactly on the keyboard); a panel takes its **typing** height and does not render its lead; a strip keeps its 150; and the **timeline slot collapses for a strip too**, with no lift (the keyboard would cover most of it anyway), so the preview gets `window − top − 48 − 48 − tool − keyboard`.
- No `KeyboardAvoidingView` in the editor: every number is explicit. No animation: the layout changes when the keyboard starts to move.
- A scrolling panel scrolls the focused field into view when the keyboard comes up (`TextInput.State.currentlyFocusedInput().measureLayout(<the body's own content view>, …)` then `scrollTo` on the body, in an effect — not in a scroll callback).
- **Dismissing the keyboard keeps the panel open**: dragging the panel's content dismisses it (`keyboardDismissMode="on-drag"`), the return key does for one-line fields; the panel goes back to its size. Closing the panel dismisses the keyboard (`Keyboard.dismiss()`).

Tools with a text field: Text (the text itself — focused on opening, so it opens at the typing height — the custom colour, the fine-tune fields), Stickers (search; the shapes' custom colour), the sticker editor (custom colour, fine-tune), Caption style (custom colours, Y %), Trim (strip).

## 3. Conversions

### 3.1 Today's sheets (inventory)

| Component | Opened by | Content | Text fields | Sheet `height` | Tests and what they query |
|---|---|---|---|---|---|
| `TextPanel` | Add text, Edit, double-tap | template strip, text, font strip, size slider, colours, switches, align chips, style section, fine-tune (6 `NumField`), Duplicate / Delete, Done | text (autoFocus), custom colour ×2, fine-tune | 55 % | `TextPanel.test.tsx`, `TextPanel.style.test.tsx`: labels, roles, `text-panel-scroll`, the body's Done button |
| `StickerSheet` | Stickers | tabs Emoji / Shapes; search, recents, emoji `FlatList` (8 columns); colour row + shape tiles | search, custom colour | 60 % | `StickerSheet.test.tsx`: labels, roles |
| `StickerPanel` | Edit, double-tap | colour (a shape), size slider, fine-tune, Duplicate / Delete | custom colour, fine-tune | 50 % | `StickerPanel.test.tsx`: labels, test ids |
| `AddAudioSheet` (+ `RecordTab`) | Add audio | tabs Music / Files / Effects / Record; rows with preview and Use / Add; a file button; the record button | — | 60 % | `AddAudioSheet.test.tsx` (header, roles, "Close sheet" ×3), `RecordTab.test.tsx` |
| `TemplateSheet` | Templates | scope chips; Random + 8 tiles; "Applied …" line | — | auto | `TemplateSheet.test.tsx`: roles |
| `CaptionsSheet` | Captions | one card per state, up to three stacked buttons; hosts Caption style | — | auto | `CaptionsSheet.test.tsx`: texts, roles, "Close sheet" ×1 |
| `CaptionStyleSheet` | Captions → Style captions | preset strip, sample, switches, colours, font strip, sliders, Y %, style section | custom colours, Y % | 85 % | `CaptionStyleSheet.test.tsx`: labels, test ids, `caption-style-scroll` |
| `BeatsSheet` | Beats | Tap, count, Remove nearest / Clear all | — | auto | `BeatsSheet.test.tsx`: header, roles |
| `EffectSheet` | Effects | 12 tool buttons, wrapped | — | auto | `EffectSheet.test.tsx`: header, roles |
| `TrimSheet` | Trim | helper line, one or two numeric fields, Apply | 1–2 (`decimal-pad`) | auto | `TrimSheet.test.tsx`: labels, text, role |
| `CoverSheet` | Cover | own frame view, time slider, title, note, Done, Save to Photos / Reset | title | auto, `avoidKeyboard` | `CoverSheet.test.tsx`: roles, "Close sheet" |

Outside the editor: `src/projects/ProjectActionsSheet.tsx`, `src/publish/components/PostOptionsSheet.tsx` (out of scope).

### 3.2 After this round

Behaviour inside each tool is unchanged unless listed: the same ops, the same one-undo-step rules, the same lookups (`useItemClip` / `useIsLayer` for a clip-or-layer), the same component names, props, labels and test ids.

| Tool (component) | Becomes | Layout | What changes inside |
|---|---|---|---|
| Beats (`BeatsSheet`) | panel, compact | the three rows as today | — |
| Stickers (`StickerSheet`) | panel, regular, `scroll={false}` | lead: Emoji / Shapes. Emoji: a search row (52), then the grid with an explicit height; the recents are the grid's header. Shapes: its own scroll of explicit height | the recents scroll with the grid |
| Text (`TextPanel`) | panel, regular | one scroll (`text-panel-scroll`): **the text field first**, then the template strip and the rest as today | the body's **Done button is removed** (the header ✓ closes; an empty text is removed by the host, as before); typing after an Undo starts a new undo step (decision 8) |
| Sticker editor (`StickerPanel`) | panel, compact | one scroll, as today | — |
| Add audio (`AddAudioSheet`) | panel, regular | lead: the four tabs; the tab's list / button / recorder in the scrolling body | ✓ runs the same guarded `close` the sheet's scrim did; the recording rule of §2.4 |
| Templates (`TemplateSheet`) | panel, regular | lead: This clip / Whole project; the tiles wrap in the scrolling body | a re-roll undoes the previous template only if it is still the last thing done (decision 9) |
| Captions (`CaptionsSheet`) | panel, compact | the state cards as today | the "done" card's **Done button is removed** (the header ✓ does the same); Caption style takes the panel's place instead of stacking on it, and ✓ there returns to Captions; hiding the panel cancels a run and resets, as closing did; §2.4 for a selected caption |
| Caption style (`CaptionStyleSheet`) | panel, regular | one scroll (`caption-style-scroll`), as today | — |
| Effects picker (`EffectSheet`) | **strip**, tile row | the twelve tool buttons in one horizontally scrolling row | — (a tile adds, selects, closes; a refusal closes first, then the toast) |
| Trim (`TrimSheet`) | **strip** | header note: the helper line (two lines); one row: the field(s) and Apply | — (Apply closes first, then a refusal toast) |
| Cover (`CoverSheet`) | **stays a `Sheet`** | — | — |
| Crop (`CropScreen`) | stays a full-screen Modal | — | — |

**`Sheet` users left after the round:** `CoverSheet` (editor), `ProjectActionsSheet` (home), `PostOptionsSheet` (post). `src/ui/Sheet.tsx` stays.

### 3.3 Test expectations that must change

- `EditorToolbar.test.tsx`, `EditorToolbar.layers.test.tsx`, `CropScreen.test.tsx`, `toolStrip.test.tsx`: `<EditorToolbar panelFor={null} onPanelChange={…} />` becomes `<EditorToolbar />`; the three cases that expected `onPanelChange({ id, kind })` expect the open tool (`{ id: "text" | "stickerEdit", key: "overlay:<id>" }`) and close it before reading the bar.
- `TextPanel.test.tsx`: "Done is disabled while the text is empty" is replaced (there is one Done, the header ✓, and it closes).
- `AddAudioSheet.test.tsx`: three `getByLabelText("Close sheet")` become the Done button.
- `CaptionsSheet.test.tsx`: one `getAllByLabelText("Close sheet")[0]` becomes the Done button.
- Everything else (roles, labels, texts, test ids including `text-panel-scroll` and `caption-style-scroll`) is kept, so the other suites pass unedited.

## 3a. As built

Checked against the code at the end of the round. Everything in §2 and §3 was built as written unless it is listed here.

**Sheets, strips, panels**

- Panels: Text, Stickers, the sticker editor, Add audio, Templates, Captions, Caption style, Beats. Strips: Effects and Trim, as well as round 1's. Sheets left: `CoverSheet` (editor; its own frame is what is edited and captured, closing without Done discards), `ProjectActionsSheet` (home), `PostOptionsSheet` (post). `CropScreen` stays a full-screen Modal. `KeyboardAvoidingView` is used only in `Sheet.tsx` and `PostScreenBody.tsx`. Pinned by a test in `CoverSheet.test.tsx`.
- No open / close animation.
- The timeline slot is collapsed (height 0, still mounted) while a panel is open, and, with the keyboard up, also for a strip (Trim) except while the multi-select bar shows (the bar is then lifted over the timeline, which stays).

**Changes to the spec while building**

1. **Pinned caption sample.** `ToolPanel` got one optional prop, `pinned={{ height, content }}`: a fixed-height row between the header (and lead) and the body, not rendered at typing height. Caption style's sample sits there at 96 pt, so it stays in view while the body scrolls (body 166 pt on a 667-pt phone, 251 pt on an 852-pt phone).
2. **Header action hit target.** The header action's `hitSlop` is 16 / 16 / 12 / 12 in both `ToolPanel` and `ToolStrip`. A strip's header row is 36 pt, so its real vertical target on iOS is probably nearer 36 than 44 (a phone check).
3. **Keyboard.** `useKeyboard` also listens to `keyboardDidHide` (sets 0). The bottom padding while a tool shows is `max(keyboard height, max(bottom inset, 8))`, never less than the safe area. Typing height is 148 pt on a 667-pt phone, so the picture left is about 130 pt there.
4. **Emoji recents are hidden while the keyboard is up**, so a small phone still shows result rows while searching; they return when the keyboard goes down. On a 667-pt phone the grid with the keyboard up is about one and a half rows.
5. **The two in-body Done buttons** (Text panel, the Captions "done" card) are replaced by the header ✓.
6. **Empty texts.** Duplicate is disabled while the text is empty (Delete stays). An empty text being edited is removed on any close of the Text panel (✓, selecting something else, Export) and when the editor is left (`dropEmptyText` in `model/ops.ts`, called from the `useLoadProject` unmount path before the save). Captions are never removed, and an empty text that is not open in the panel is left alone.
7. **Typing undo steps.** A keystroke begins an undo step when there is none open for this text, the project is no longer the one the last keystroke left, or Redo is armed; otherwise it is written into the open step. So the first keystroke after focus (or after Undo, a colour change, another text) starts its own step; focusing, or a keystroke that changes nothing, adds none. This replaces §3.2's "starts on focus" wording (decision 8).
8. **Recording.** While a voice-over records, and until it is saved, the Add audio panel stays open and other tools and Export do not open (`openStrip` is a no-op, the closer waits, `closeForExport` returns false and pauses playback, which stops and saves). To make that true `useVoiceRecorder` clears the store's `recording` flag only after the save ends (and at once on unmount); this is the one change to that file. The preview stays muted during "Saving...".
9. **Auditioning a sound** in Add audio does not pause the project's playback, and playback does not stop it: they mix, as they did under the sheet.
10. **Trim's fields follow the clip**: they are re-seeded whenever the clip's `trimStart` / `trimEnd` change in the store (handle drag, Undo / Redo); typed text is replaced only by such an outside change.
11. **Fonts strip** in the text panel uses `keyboardShouldPersistTaps="handled"` so a chip takes one tap with the keyboard up.

**Files outside the plan that changed:** `src/editor/model/ops.ts` (`dropEmptyText`), `src/editor/useLoadProject.ts`, `src/editor/useVoiceRecorder.ts`. `store.ts`, `Timeline.tsx`, `timelineScroll.ts`, `PreviewPlayer.tsx`, `Sheet.tsx`, `CoverSheet.tsx`, `modules/` and `package.json` are untouched.

**Test expectations changed beyond §3.3:** `keyboard.test.tsx` (the third listener, three removes), `panels.pickers.test.tsx` (Caption style body height minus the pinned 96 pt), `toolStrip.test.tsx` (a counting `newId` mock so new items get ids under Jest), and a title in `panels.text.test.tsx`.

**Not checked by any test (on the device checklist in the plan):** how the preview looks and behaves while it resizes (no black frame, no restart, playback continues); the timeline coming back at the same scroll and zoom; real keyboard heights (hardware keyboard, emoji keyboard, suggestion bar); the 667-pt phone while typing; hit targets; voice-over recording and the microphone prompt; the document picker over an inline panel.

## 4. Screens

- **Editor:** top bar, preview, transport row, timeline, then one bottom area that is the bar, the multi-select bar, a strip (lifted over the timeline) or a panel (the timeline hidden).
- **Transport row:** stays visible and usable with a panel open — play, undo, redo. The ratio pill opens the Ratio strip in place of an open panel (nothing happens while a voice-over is recorded).
- **Preview:** usable with a panel open: tapping a text selects it (and closes a panel that belonged to something else), dragging the text being edited moves it.

## 5. Testing

- `panelHeight`: the table of §2.2. `ToolPanel`: renders inline (no scrim), header role, Done, action, explicit body height, lead, `scroll={false}` with the body height handed to the child, presence; with the keyboard: typing height, no lead, the focused field is measured.
- Store: panel ids, `rekeyStrip`, the recording rule, `closeForExport`, "adding selects the new item" (Effects picker through the toolbar: closed, the effect's bar shows), "Add text" (open with the new text's key and still open after the effects ran), Duplicate in the Text panel (still open, re-keyed).
- `EditorLayout` (a real `Timeline`, `TransportRow` and `EditorToolbar`, a probe as the preview): with a panel open the timeline and the bar are not found by the queries (hidden from accessibility / not rendered), the transport row is; the timeline root and its scroll view are the same instances, their height unchanged, the slot is `height: 0`; after Done both are back; the probe mounted once; the zoom is unchanged. A strip does not collapse the timeline; a strip with the keyboard does.
- `PreviewPlayer`: a second `layout` event with another size keeps the same `preview-video` instance (a new case in a new file; the component is not edited).
- Each converted tool: its existing behaviour tests keep passing (with the edits of §3.3), plus "it is a panel / strip" (no scrim, Done closes).

## 6. Risks

- **The preview resizes** when a regular panel opens or closes, and twice when the Text panel opens (panel, then keyboard). There is no animation; the picture jumps. `VideoView` is asked to change size while playing — to be confirmed on the phone (checklist).
- **Small phones while typing:** about 110 points of picture on a 667-point screen.
- **Fixed numbers** (44 / 240 / 46 % / 22 %, top bar and transport taken as 48) are computed from the kit's sizes, not measured on a device.
- **Undo and play are live while a panel is open.** Tools that assumed nothing else could happen under a modal were checked: Templates (decision 9), typing (decision 8), recording (§2.4), Captions (§2.4). Cover is still modal.
- **A hidden timeline still follows the playhead** (`scrollTo` on a clipped scroll view); it must be in step when it comes back (checklist).
- **A hardware keyboard or the emoji keyboard** changes the keyboard's height; the layout follows `keyboardWillShow`.

## 7. Decisions made while writing

1. **Cover stays a `Sheet` in this round.** Its own frame view is what is being edited (the title is drawn over it) and what Save to Photos captures at full size: in a 46 % panel it would have to shrink to about 120 points or scroll away, and the live preview above it would be redundant. Its draft rule — Done applies, any other way of closing discards — also does not fit a panel that a selection change closes. Not cheap, so not now.
2. **The timeline is collapsed (slot height 0, clipped), not covered and not unmounted.** Covering it the round-1 way would need a negative margin as large as the timeline, larger than a compact panel. Collapsing the slot leaves every frame inside the timeline alone.
3. **`toolStrip.ts` keeps its names** (`openStrip`, `closeStrip`, `useToolStrip`, `useStripCloser`) for strips and panels; only the id type widens. Renaming would touch every strip of round 1 for no behaviour.
4. **All the wiring is done in the first task** (every remaining sheet except Cover and Crop is opened through the store while still a sheet; `panelFor` is removed), so the conversions touch only their own component and can run in parallel.
5. **Three heights, not one per tool:** regular, compact and typing. A compact panel makes the preview larger.
6. **The keyboard is handled with `Keyboard` events and explicit numbers**, not `KeyboardAvoidingView` and not `react-native-keyboard-controller` (not in Expo Go). While the keyboard is up a strip collapses the timeline too.
7. **Two body buttons named Done are removed** (Text panel, Captions "done" card): the header ✓ has the same accessible name and does the same thing.
8. **Typing after an Undo starts a new undo step.** The text field begins its undo step on focus; with Undo now reachable while typing, the next keystroke would otherwise be written into the step before. Only the history getting shorter triggers it; typing is otherwise one step per focus, as today.
9. **A template re-roll only undoes its own previous template** — it checks that the project is still the one it left. Under the modal nothing else could change the project between two rolls.
10. **Recording is protected by the store flag** (`recording`), not by a new guard interface: three checks in `toolStrip.ts`.
11. **Captions deselects a selected caption before a run** instead of exempting the panel from the closer: one rule for every tool.
12. **Trim does not focus its field on opening** (as today); the strip moves up when a field is tapped.
13. **No open / close animation** in round 2 either.
