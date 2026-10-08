> **Note for the owner (not part of the prompt).**
> This is the follow-up message for Claude Design, to send in the SAME conversation where it made "Clipy Foundations checkpoint". Copy everything below the line and paste it in. It approves checkpoint 1, lists the corrections, and asks for all the remaining work.

---

# Clipy — reply to checkpoint 1, and what to do next

Thank you. Checkpoint 1 (foundations, Home, the editor with a clip selected) is a good base. Below are my decisions, the corrections I need, and the order for everything that is left. The original brief is still the source of truth for every feature, label, state and message — nothing in it may be dropped.

## 1. Decisions on your five approval points

1. **Plain UI, nautical touches only in content moments** (Home empty state, finished export, app icon) — approved.
2. **Gold `#D9B36A` as the one primary fill, darker accent ink in light appearance** — approved.
3. **Editor toolbar in five groups with Delete pinned** — approved in principle, with the height correction in 2.1.
4. **"Projects" as Home's title** — approved.
5. **Primary actions at the bottom; Export at the top of the editor** — approved.

Open question you asked: keep **"Post a video"** in Home's top bar. Do not add a third button to the bottom bar.

## 2. Corrections to checkpoint 1

Please revise boards 1a, 1f and 1g for these before moving on.

### 2.1 The editor toolbar must not be taller than today's
The two-row toolbar (about 104 pt) takes height from the preview, and a small preview is already the app's biggest complaint. Redesign it so the grouped toolbar is **one row, no taller than the current single-row toolbar** (about 64 pt plus the Home-indicator inset). Show at least two options, for example:
- group tabs that turn into the tool row when tapped, with a back control to return to the groups;
- a single scrolling row where the groups are visible section dividers with short labels;
- a compact group switcher at the leading edge of the one row.
Delete stays pinned and always visible. Every tool keeps a visible text label. No tool is removed, and a tool that cannot apply is left out, not dimmed.

### 2.2 Show the editor with a full, real project
The mock shows only a music bar and one text bar. In the app every layer has its own row, songs sit right under the clips, and texts and stickers pack into rows below. Draw the editor, dark and light, **at the smallest iPhone and the largest**, with: 6 clips, 5 layer rows, 2 music bars, 1 voice-over, 3 sound effects, 4 texts, 2 stickers, captions, 1 timeline effect, beat markers and two transitions. Then solve the problem this shows: **the preview must stay as large as possible.** Propose how the timeline rows behave when there are many (thinner rows, the timeline area scrolling vertically at a fixed height, collapsing a kind of row into one summary row, or another idea) and state the minimum preview height you guarantee on the smallest iPhone.

### 2.3 Captions need their own colour
Text and Caption both use `#8FB0F8`. On a short bar the glyph is too small to tell them apart. Give Caption its own hue with the same lightness and chroma as the others, keep a second cue (glyph or texture), and update the table. Also fix the heading: there are **eight** bar kinds, not seven (Text, Caption, Sticker, Music, Voice, Sound effect, Layer, Effect).

### 2.4 No TipKit
The app cannot use TipKit. Replace the one-time tip on "Post a video" with an ordinary in-app tip you design yourself: a small callout that appears once, points at the button, has one line of text and a close control, and never returns after it is closed.

### 2.5 Mark what is new
Checkpoint 1 quietly adds things the app does not have today. Keep them, but label each one **"New feature"** on its board and collect them in one list in the hand-off notes, so they can be scheduled as building work:
light appearance · the time ruler · the "+" on cuts without a transition · corner handles on the selected clip in the preview · waveforms on music bars · the tappable "Preview" tag with its explanation · the project-name menu with Rename · "Posted · …" status on project cards · the More button on project cards · text that follows the system text size.
From now on, do the same for every new feature in every checkpoint. For each, also show what the screen looks like **without** it, where that is a real fallback (for example: music bars without a waveform).

### 2.6 Glass in the editor
Regular glass on the toolbar, strips and panels is welcome, but they sit over a moving timeline. For every editor board, show **both** versions side by side: glass, and the solid fallback (`#1C1C1E` in dark, the kit equivalent in light). The solid version must look finished, not like a degraded state — it may be what ships.

### 2.7 Small things
- Stabilize and Fade need custom symbols: draw them on Apple's symbol template and show them at toolbar size.
- Confirm every SF Symbol name in the current SF Symbols app and mark any you could not confirm.
- Home: show the grid with one project, with an odd number of projects, and with a very long project name.

## 3. Everything that is still to do

Work in this order. After each checkpoint, stop, show the boards, list your assumptions and questions, and wait for my reply. Keep the same board style and numbering (2a, 2b … 3a …).

### Checkpoint 2 — Component library
Every component the app has today (brief §5.4), restyled natively, each with **all** its states (default, pressed, selected, disabled, busy, error) in dark and light, plus Reduce Transparency and Increase Contrast where they differ:
buttons (primary, secondary, quiet; with symbol; busy) · pick-one tiles · chips and segmented tabs · the slider (with the rest-value tick, value label, live readout) · switch rows · text field (empty, typing, error, with clear) · card · spinner and progress line with percent · toast · inline error · the strip container and its header (title, close, optional tabs) · the panel container (title, close, lead row, scrolling body, one primary button) · the home / export / post sheet with detents · menus and context menus · alerts and confirmation dialogs · empty state · the "Preview" tag · the "update needed" notice · timeline pieces (clip, each of the eight bars, trim handles, playhead, ruler, beat marker, transition marker, snap guide, selection, multi-select tick, background-copy progress on a clip).
State for each whether it is a system component (use it as it is) or custom.

### Checkpoint 3 — First-launch wizard and permissions (brief §7 and §8)
The four pages with their animation storyboards (key frames, timing, the Reduce Motion version), the permissions page with a row per permission in each state (Not asked, Allowed, Limited, Denied, Restricted), the pre-permission explanation for each, the screen for every outcome including "Open Settings", the in-context ask the first time a feature is used, and the Permissions section in Accounts. Camera and notifications are new features: label them. No permission may be required to continue.

### Checkpoint 4 — Screens outside the editor (brief §9)
Welcome / sign-in (Apple, Google, email code: every step and error) · Home in every state (loading, empty, busy while a project is made, a damaged project, one project) · the New project and Quick edit pickers and the six Quick edit styles · Export (options, estimate, progress, done, failed, not enough space, cancel) · Post (platforms, signed out, options sheet, upload progress per platform, done, failed, sign-in expired) · Accounts (connections, build label, permissions, sign out) · the platform sign-in return. Dark and light, smallest and largest iPhone.

### Checkpoint 5 — The editor in every selection context (brief §10 and §11)
All 11 contexts, each with its exact toolbar in the approved one-row grouped form and your group assignment for every tool: nothing selected (and the empty project) · Audio section · Text section · main clip (video, photo, reversed) · layer (and collage cell) · text · caption · sticker · sound bar · timeline effect · multi-select. Plus: keyboard up, timeline collapsed under a panel, a clip with a background copy in progress, missing media, and undo / redo states.

### Checkpoint 6 — All 22 strips (brief §12)
Every strip open under the preview, with every control, value, tab, status line and message, at the fixed strip heights (default and large text), including the long status sentences that must fit two lines. Include Stabilize (Off / Low / Medium / High + status) and the Speed strip's three tabs (Normal, Curve, Slow motion). Show the refusal sentences and the "update needed" state.

### Checkpoint 7 — All 12 panels and Crop (brief §13)
Every panel with its lead row, scrolling body, rows open and closed, and one primary button: Text (with the five look rows and Read aloud), Stickers and emoji packs, the sticker editor, Add audio (Music, Files, Effects, voice-over recording), Templates, Captions, Caption style, Beats, Cover, Voice, Sound quality, Collage — and the full-screen Crop.

### Checkpoint 8 — Prototype, app icon, hand-off
- The interactive prototype of the main journey (brief §15 f).
- The app icon in Icon Composer layers: default, dark, tinted and clear.
- The hand-off sheet: every token with its value in dark / light / Increase Contrast; every component's spec; the full SF Symbol map; the motion and haptics table; the list of every new feature; and the list of every place the design departs from today's app.

## 4. Rules that still apply to every checkpoint

- Build from Apple's iOS 27 UI kit. Where you do not have a number, write "kit" — do not invent one.
- Use system components wherever one exists.
- The editor's hard constraints (brief §4) hold on every board: the preview stays in one fixed place; tools open inline as strips or panels, one at a time, never as modal sheets; closing is instant; nothing animates beside the video for more than 250 ms; no blur, shadow or glow over the video frame; one primary button per screen or panel.
- iPhone only, portrait only. No iPad, Android or web layouts.
- Do not remove, merge or rename a feature. If you think a label should change, show the current label and your suggestion side by side.
- Realistic content everywhere; every text legible over video; never colour alone to carry meaning.
- Every board in dark and light.
- End each checkpoint with: assumptions made, questions for me, and anything from the brief you could not fit.

Start now with the corrections in section 2, then checkpoint 2.
