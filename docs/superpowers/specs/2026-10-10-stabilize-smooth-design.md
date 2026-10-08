# Stabilize, Smooth slow motion: design

**Date:** 2026-10-10
**Status:** Built on branch `stabilize-smooth`; not yet run on a phone. Plan: `docs/superpowers/plans/2026-10-10-stabilize-smooth.md`. Where the build differs from the approved design the text below says what was **built**: B1, §6.3 and §6.6 (marked *as built*), §5 (the zoom factor) and §4.1 (Replace with a photo).
**Builds on:** Remove background (`2026-10-09-beats-background-design.md`: a stored switch, a rendered copy that keeps the source's timeline, `cutout.ts`, `cutoutFiles.ts`, `cutoutRenders.ts` with `inTurn`, `exportCutouts.ts`, `CutoutFollower`, `CutoutRender.swift`), speed and ramps (`timeline.ts`, `SpeedSheet.tsx`, `SpeedSpans.swift`), the build label (`src/lib/buildInfo.ts`). Branch `stabilize-smooth` from `main` 3d54486. Schema v20 → **v21** (two optional keys). **New Swift** in one new file (one new native build). No new package, no new asset.

## What this batch does and does not do

This batch adds two things, and both work the way Remove background works: a stored switch, a **copy** of the clip made in the background with a percent, the original never changed, the preview and the export only swapping the file. **Stabilize**: a tool on a video clip or a video layer with Off / Low / Medium / High. The phone measures how far the picture jumps from each frame to the next (Apple's Vision image registration), the app works out a calm camera path from those numbers, and the phone writes a copy in which every frame is moved back onto that path and zoomed in a little (5, 10 or 15 percent) so the moving edges never show. **Smooth slow motion**: a switch in the Speed tool, on a tab that is there only while the clip is slowed. Today a clip slowed below 1× shows each frame several times; with the switch on the phone writes a copy that has more frames per second (60 or 120), the extra ones made by **blending** the two neighbouring frames by time, so every frame of the slowed clip is a new picture. One clip may have both: it then gets **one** copy that is steadied and filled in one go.

The batch does **not** correct twisting or rolling of the camera (only up / down / left / right), does not remove the wobble of a rolling shutter, does not make true in-between pictures by following motion (blended frames show a soft double image on fast movement; Apple's motion-compensated frame rate conversion is a later upgrade, §3 S2), does not work on a clip longer than 60 seconds, on a reversed clip, on a photo, or together with Remove background on the same clip (§3 M2), and never makes a copy for a clip whose tools are off or when a project is merely opened and nothing is missing. §11 lists where this differs from the approved wording.

## 1. Goals and non-goals

**Goals**
1. The owner's approved items, as worded, except where §11 lists a difference.
2. **Nothing existing changes.** A project saved before this batch loads, previews and exports exactly as before: the v20 → v21 migration changes only the number (PROOF, §4.3); a clip without the two keys goes through the expressions it goes through today in the preview, the queue and the export request (PROOF, §7); `ExportSession.swift`, `ClipyCompositor.swift`, `MediaPrePass.swift`, `SpeedSpans.swift` and `CutoutRender.swift` have **no diff**; `cutout.ts`, `cutoutFiles.ts` and `exportCutouts.ts` have no diff and `cutoutRenders.ts` changes in one place (its turn, §3 M1) with its test suite unedited.
3. **Nothing changes on its own.** `stabilize` is written only by a tap on a strength tile, `smooth` only by the switch. A copy is rendered only for a clip whose setting is on, never during a drag, never before the project has stood still.
4. **One native build, as likely to be right as it can be made.** The phone does two dumb things: it reports numbers (how far each frame moved) and it writes frames (moved by the numbers it is given, blended on a grid it is given). Everything that decides anything — the direction and unit of Vision's numbers, the smoothing rule, the window, the zoom, the frame grid, the bitrate, the 60 seconds — is TypeScript and travels in the request, so a wrong guess about Apple's conventions is fixed from the dev server, not with a build (§3 N1).
5. Every native failure reports a stage and `ExportSession.describe(error)`; a tool the installed build cannot run says so in one sentence.

**Non-goals:** rotation / perspective correction, rolling-shutter correction, motion-compensated frames, stabilising part of a clip, a strength slider, a before / after split view, a copy for photos or reversed clips, combining with Remove background, Android, web.

## 2. Where things stand today (read 2026-10-08, `main` 3d54486)

- **Copies.** `cutout.ts` (pure) names a copy after the source's stem, a version and a whole-second range (`cutoutRange`: the trim plus 2 s each side, the longest transition handle, `TRANSITION_HANDLE_MAX`), and serves a clip from the smallest known copy that covers its trim and its handles (`coveringCopy`). `cutoutFiles.ts` holds what is known of each copy by name (ready / busy with a percent / failed). `cutoutRenders.ts` is the queue: one render at a time, started 0.8 s after the project last moved, cancelled the moment nobody needs it, a deadline that counts from the moment the phone is handed the render (`inTurn`), a sweep of the folder when the project opens. `exportCutouts.ts` makes the missing copies before the export and rewrites the request in TypeScript (`sourceUri` only).
- **A copy keeps the source's timeline.** `CutoutRender.renderVideo` writes frames at their own source times into a session that starts at 0 and ends at the range's end, copies the sound packets beside them, and writes upright square pixels at most 1 920 on the long side. Trim, speed, speed curves, split and keyframes therefore mean in the copy what they mean in the source.
- **Speed.** Only `timeline.ts` does speed arithmetic. A clip has one `speed` (0.25–4) or a curve of up to 64 constant-speed steps (the app stores 8, or 32 for a smooth ramp); `speedSpans(c)` lists them inside the trim. The export inserts the source range once and stretches it (`scaleTimeRange`, `insertRetimed`); the composition then asks for one frame per output frame time, so a 30-frames-a-second source at 0.25× gives the same frame four times. The preview plays the file at `rateAt` (`player.playbackRate`), with the same repeats.
- **Preview.** `PreviewPlayer.tsx` (never edited) loads `clip.sourceUri`. A layer's player (`LayerVideo`) is handed another uri by `LayerStack`'s `LayerPicture`; a main clip's cut-out is a second, silent `LayerVideo` laid over the hidden main picture (`CutoutFollower`, mounted by `ClipFrame`).
- **The Speed strip** has a fixed height: a header, one tiles row with the tab chips Normal / Curve in its lead, one slider row. The Curve tab's bottom row is a switch called **Smooth** (the ramp's form: gradual or eight steps). That switch shipped and keeps its name.
- **Build label.** `LEVELS` (newest first); the installed build is "beats and background".

## 3. Decisions

Each has the decision, the reason, and what it costs if it turns out wrong.

### M. The copy machinery and how the tools combine

**M1. A second queue beside the cut-out queue, sharing only the turn.** New `src/editor/model/steady.ts` (names, ranges, the covering copy), `src/editor/steadyFiles.ts` (the store) and `src/editor/steadyRenders.ts` (the queue) are siblings of the three cut-out files and follow them rule for rule. The one thing moved out of `cutoutRenders.ts` is the turn: `inTurn` becomes `takeTurn` in new `src/editor/renderTurn.ts`, and `cutoutRenders.ts` calls it through a one-line `inTurn` of its own. So **one heavy native render runs at a time across Remove background, Stabilize and Smooth slow motion**, whoever asks (the editor, the export). Natively the new renders take the cut-out's own gate (`CutoutRender.takeGate()` / `leave()`), so the phone agrees. Copies live in their own folder, `<project>/steady/`, with their own sweep.
*The alternative* was one "clip copies" queue with kinds. It would have meant rewriting `cutoutRenders.ts`, `cutoutFiles.ts` and their tests the day after they were merged and before the owner has confirmed them on the phone.
*If wrong.* About 350 lines of TypeScript exist twice. A later batch can fold the two queues into one when both are confirmed; nothing stored depends on it.

**M2. One copy per clip; Remove background and the two new tools exclude each other.** A clip's Stabilize strength and its Smooth slow motion switch are served by **one** copy, rendered in one go (`steadyOf(clip)` → `{ level 0–3, grid 0 / 60 / 120 }`; the name holds both). A clip with Remove background on cannot be given Stabilize or Smooth slow motion, and the other way round: the tap says "… does not work together with Remove background. Switch Remove background off for this clip first." (and Remove background says the mirror sentence). The ops enforce it; a file that holds both keeps the cut-out (the older setting) in the sanity pass.
*Reason.* A chain (steady copy → cut-out of the copy → …) needs render dependencies between two queues, a cut-out that keeps 120 frames a second through people detection (four times its time), and a see-through writer in the blender. A refusal in one sentence is honest and cannot go wrong on the first build.
*If wrong.* The owner wants a steadied, cut-out person. Until a later batch: export the stabilised clip, add the exported video and cut that out.

**M3. Reverse, as for Remove background.** The Stabilize tool is not on a reversed clip's bar, the Slow motion tab is not offered for one, and Reverse is not on the bar of a clip that has a copy (`steadyOf(clip) !== null`). A clip reversed anyway (multi-select) keeps its keys but has no copy and plays as it is.
*If wrong.* A steadied clip cannot be reversed in this batch (the export's reversing step could read the copy; nobody has seen it do so).

**M4. Everything else rides on the copy's timeline.** The copy holds its range **at the source's times** (§6.3), so trim, split, duplicate, speed, speed curves, keyframes, transitions and their handles apply to it exactly as to the original — the rule that already serves cut-outs. A split or a duplicate shares the copy; a trim inwards keeps it; a trim outwards (or a higher speed) that takes a transition handle past the copy's range renders a new one. A speed change that crosses 0.5× changes the frame grid (60 ↔ 120) and so the copy; a change of strength changes the copy too — but the measuring is remembered for the session (§3 S4), so only the second half of the work is done again.

### S. Stabilize

**S1. Translation only, measured with `VNTranslationalImageRegistrationRequest`.** For each kept frame the phone asks Vision for the transform that aligns the frame with the one before it and reports its `tx` / `ty` as fractions of the measured picture's width and height (a 512-point copy of the frame, upright). No rotation, no perspective.
*Reason.* The translational request is on every iPhone since iOS 11 and its result is two numbers whose meaning can be fixed in TypeScript. The homographic request returns a 3 × 3 matrix whose conventions are not documented on its page; getting it wrong warps the picture. The tracking variants (`VNTrackTranslationalImageRegistrationRequest`) are iOS 17.
*If wrong.* Footage that mostly twists (a walking shot held at arm's length) stays shaky. A later build can add rotation; the request already carries per-frame numbers, so it would add fields, not replace any.

**S2. The camera path is TypeScript only — no mirrored pair.** `src/editor/model/steadyPath.ts` (pure, no imports): the frame-to-frame steps are added up into a path; the path is smoothed with a centred, symmetric, triangular window (`radius` seconds each side: 0.25 / 0.5 / 1.0 for Low / Medium / High; near the ends the window shrinks so it stays symmetric, which makes a steady pan need no correction at all); a frame's correction is zoom × (path − smoothed path) — the phone zooms a frame about its centre first and moves it second, so a shake of *d* measured on the un-zoomed picture is *zoom · d* on screen and only a move of that size cancels it — clamped to what the zoom hides, `(zoom − 1) / 2` of the picture each way. A step larger than `cutShift` (0.2 of the picture) on either axis is a cut or a failed measurement and counts as no movement. `scaleX` / `scaleY` (1, 1) turn Vision's numbers into corrections: −1 flips a direction, another number rescales.
*Reason.* Swift cannot be run or tested here; Jest can test this. The native side receives the finished corrections (`times`, `dx`, `dy`) and only applies them, as the sound tools receive numbers.
*If wrong.* Nothing to keep identical in two languages. The request carries up to about 7 700 × 3 numbers for the longest copy (a 64-second range at 120 frames a second); if the bridge is slow with that, `STEADY.minFrameGap` lowers the count.

**S3. Zoom: 5 / 10 / 15 percent, fixed for the whole copy.** The copy has the source's shape and size (at most 1 920 on the long side); every frame is scaled about its centre by the strength's zoom and then moved. Edge pixels are repeated outwards before the move, so a rounding sliver is never black.
*If wrong.* A very shaky clip at Low hits the clamp and keeps part of its shake: the owner picks a higher strength. The numbers are `STEADY_LEVELS` in TypeScript.

**S4. Two native calls, one turn, one percent.** `measureShake` reads the range once and answers the numbers; the app computes the corrections; `renderSteady` reads the range again and writes the copy. Both run inside one turn of the shared queue, under one job id. The strip's percent runs 0–40 while measuring and 40–100 while writing (`STEADY.measureShare`); a copy without Stabilize (Smooth slow motion alone) has only the second call and the whole percent. What was measured is remembered for the session by source file and range, so changing Low → High, or switching Smooth slow motion on afterwards, writes a new copy without measuring again.
*If wrong.* After the app restarts, a changed strength measures again.

**S5. A failed frame never fails the copy.** A registration that throws, answers nothing or answers a number that is not one is reported as "no movement" for that frame and counted (`failed` in the answer, logged). A clip in which every frame fails gives a copy that is only zoomed.

### B. Smooth slow motion

**B1. A copy with more frames, not blending inside the export.** With the switch on, the copy is written on a **uniform grid** in source time: 60 frames per source second when the clip's slowest stretch is 0.5× or faster, 120 when it is slower (`SMOOTH`). A grid frame at time *g* between source frames A (at *a*) and B (at *b*) is the cross-dissolve of the two with weight `(g − a) / (b − a)`; within `blendFloor` (0.02) of either end it is that frame itself. Because the copy has the source's timeline, the export's retiming is **unchanged**: it stretches the copy as it stretched the original, and the composition now finds a different frame at every output frame time. The preview's players play the copy at the clip's rate and show the same frames.
*As built.* `grid` is a **density**, not a lattice of times. The copy keeps **every** kept source frame at its **own** source time and adds blended frames only **between** two neighbouring source frames A and B: `k = round((b − a) × grid) − 1` of them (none when that is under 1; none when it is over 16 — a hole in the file is left as it is; fewer when two frames of the copy would come closer than `minFrameGap`), evenly spaced in time between A and B, in-between *j* being the cross-dissolve with weight `j / (k + 1)` (one within `blendFloor` of either end is not written). Nothing is added before the first source frame or after the last. So 30-frames-a-second footage gets 1 in-between per pair on the 60 grid and 3 on the 120 grid; 60-frames-a-second footage gets none on the 60 grid and 1 on the 120 grid; footage with an uneven frame rhythm keeps its own frames and is filled to about the grid's density. A source frame is therefore never replaced by a blend: at every source frame's time the copy shows that frame.
*The alternative* was blending in `ClipyCompositor` at export time: no copy and no wait, but a change in the middle of the export's Swift (two source frames and a weight per layer and frame, through `scaleTimeRange`), nothing to show in the preview, and no way to test it here. The owner was told "a copy made in the background", and a copy looks the same in the preview and the export.
*If wrong.* (a) Storage: a 120-grid copy is about twice an ordinary one (§6.5). (b) If the export's composition does not pick the denser frames (unverified, §10 item 2), the export looks as it does today and only a second build (compositor-side) helps; the preview would still be smooth.

**B2. What "slowed" means.** Any stretch below 1×: `isSlowed(c)` = a video whose `slowestSpeed(c)` (the lowest speed of `speedSpans(c)`, new in `timeline.ts`) is under 1. So a constant 0.5× clip is slowed, and so is a curve or ramp whose slow part dips under 1× inside the trim. One grid serves the whole copy, chosen by the slowest stretch; the fast parts of a curve simply have frames to spare.
*If wrong.* A ramp with one short slow part gets a 120-grid copy of its whole range (storage, time).

**B3. The setting is `smooth?: true` and says nothing about the method.** Which frames fill the gaps is decided by the render, and the copy's name carries `STEADY_VERSION`. Replacing the blender with Apple's motion-compensated frame rate conversion later is new Swift and a raised version: no schema change, no change to the switch.

**B4. The switch is stored but only counts while the clip is slowed.** Speeding a clip back to 1× does not delete the key (a slider drag passes through 1× on its way); the Slow motion tab is not shown then, no copy is made, and the clip exports as it always did. Slowed again, the switch is found on. Remove background switched on for such a clip removes the idle key in the same undo step.

### U. On screen

**U1. Stabilize is a tool with a strip.** `stabilize` (label **Stabilize**, icon `hand-left-outline`) on a video clip's and a video layer's bar, after Cut out; not for photos, not for a reversed clip. The strip: four tiles **Off / Low / Medium / High** and a status row: "Takes out the shake. The copy takes about N MB." while off, then "Waiting to start.", the spinner with "Steadying the clip: 42 %", "Ready.", or why not. Header note: "Zooms in a little".

**U2. Smooth slow motion is a third tab of the Speed strip, there only while the clip is slowed.** Beside **Normal** and **Curve** a chip **Slow motion** appears when `isSlowed(clip)` (and not for a multi-selection). Its tiles row holds one switch, **Smooth slow motion**; its bottom row is the status line ("Fills the gaps between frames with blended ones. The copy takes about N MB.", then the same states as above with "Smoothing the slow motion: 42 %").
*The naming clash.* The Curve tab's **Smooth** switch (shipped) is about how the **speed** changes: gradually or in eight steps. The new switch is about the **picture** while the clip is slow. They are on different tabs, the new one always carries the words "slow motion", and nothing that shipped is renamed.
*If wrong.* The owner does not find the tab: the chip appears the moment the slider goes under 1×. A hint line on the Normal tab is a TypeScript change.

**U3. Limits and refusals (one sentence each).** Over 60 seconds of trimmed source: "Stabilize works on clips up to 60 seconds. Trim or split this clip first." / "Smooth slow motion works on clips up to 60 seconds. Trim or split this clip first." With Remove background: see M2. An older build or Expo Go: `STEADY_TOOLS` = "Stabilize and Smooth slow motion need the latest Clipy build. Install it from the newest build link." A failed copy: toast "Could not stabilize the clip. It shows as it was." / "Could not smooth the slow motion. The clip shows as it was."; the setting stays; picking the strength (or the switch) again retries.

### N. Native

**N1. One new file, `SteadyRender.swift`, and registration lines.** It reuses, unedited, `CutoutRender.context`, `evenSize`, `partFile`, `videoSpace`, `tag`, `takeGate` / `leave`, `ExportSession.fileURL` / `time` / `describe` / `ciOrientTransform` and `Adjust.filtered`. No shader, no Metal, no pod. The picture is written as HEVC when the writer says it can apply the settings, else H.264 (`canApply` is asked first), in a `.mov`; the sound packets are copied as stored; the session starts at 0 and ends at the range's end.

### C. Build label and gating

`LEVELS` gains a first row `{ name: "stabilize and smooth", has: isSteadyAvailable }`. Both tools say `STEADY_TOOLS` on an older build and in Expo Go.

## 4. Data model: schema v21

```ts
export const SCHEMA_VERSION = 21 as const;
export const STABILIZE_IDS = ["low", "medium", "high"] as const;
export type StabilizeId = (typeof STABILIZE_IDS)[number];
export interface Clip { /* v20, unchanged */
  stabilize?: StabilizeId;   // Stabilize: ABSENT = off (never null / undefined / "off")
  smooth?: true;             // Smooth slow motion: ABSENT = off (never false / null / undefined)
}
```

### 4.1 Rules
- Both keys are optional and **absent** when off. Only `setClipStabilize(p, id, level | null)` writes `stabilize` and only `setClipSmooth(p, id, on)` writes `smooth` (plus two removals: the idle switch in `setClipCutout`, B4, and both keys when Replace turns the clip into a photo). Everything else reads `steadyOf(clip)` (`steady.ts`): `null`, or `{ level, grid }` for a video that plays forwards, has no cut-out, and has a strength or an active switch.
- `setClipStabilize` refuses (same project) a photo, a reversed clip, a clip with Remove background, an unknown id or strength, and a value already in place. `setClipSmooth(…, true)` refuses the same and a clip that is not slowed. Off is never refused.
- `setClipCutout(…, true)` now also refuses a **video** with a strength or an **active** Smooth slow motion; an idle `smooth` key is removed with the tap. A photo has neither tool, so keys found on one refuse nothing and are removed with the tap.
- Duplicate, split, a new layer from a clip and Replace **with a video** keep the keys (they copy the clip). Replace **with a photo** removes both in the same undo step (`replacedMedia`): left on the photo they would refuse Remove background without a word and switch Stabilize back on, untapped, when a video is put back. A freeze frame is a new photo without them.

### 4.2 The sanity pass
`normaliseClip`: `stabilize` is kept only when it is one of the three ids, `smooth` only when it is exactly `true`, and both only on a video that is not reversed and has no `cutout` after its own rule. Anything else leaves no key. Idempotent.

### 4.3 The migration, and its proof
v20 → v21 adds nothing. PROOF test (appended to `migrate.test.ts`, never edited to pass): a v20 project with a cut-out on a clip, a smooth speed curve, a 0.5× clip, a green screen, a photo with a Motion, a layer, a noise setting, music and beat markers migrates to **itself with only the number changed**; the stored object is not mutated; no clip or layer has a `stabilize` or `smooth` key; a second pass changes nothing.

## 5. The path maths (TypeScript only, `steadyPath.ts`)

```ts
export interface Shake { times: readonly number[]; dx: readonly number[]; dy: readonly number[] }   // per kept frame: its source second; how far Vision says it must move to sit on the frame before it (fractions of the picture)
export interface PathRule { radius: number; zoom: number; cutShift: number; scaleX: number; scaleY: number }
export function smoothPath(times: readonly number[], path: readonly number[], radius: number): number[];
export function steadyShifts(shake: Shake, rule: PathRule): { times: number[]; dx: number[]; dy: number[] };
```

`steadyShifts`: frames whose time is not a number or not later than the one before are left out. The path at frame *i* is the sum of the steps up to *i*, a step counting as 0 when either of its numbers is not finite or larger than `cutShift`. `smoothPath` at frame *i*: `r = min(radius, tᵢ − t₀, tₙ − tᵢ)`; with `r = 0` the path itself, else the mean of the path over the frames within `r` of `tᵢ`, each weighted `1 − |tⱼ − tᵢ| / r`. The correction is `scale × zoom × (path − smooth)`, clamped to ± `(zoom − 1) / 2`, rounded to five decimals. The factor `zoom` is there because the native side scales about the centre by `zoom` and THEN translates (§6.4): content that sits *d* off its calm place (a fraction of the un-zoomed picture, which is what Vision measured) is *zoom · d* off after the scaling, and the clamp is already in those zoomed units. Without the factor (zoom − 1) of every shake stays in: 5 / 10 / 15 %. A zoom that is not a number or is under 1 multiplies by 1 (and clamps to 0).

**Worked vectors** (21 frames, 0.1 s apart; pinned in `steadyPath.test.ts`):

| Steps (dx) | Rule | Corrections (dx) |
|---|---|---|
| every step 0.01 (a steady pan) | radius 0.5, zoom 1.1 | all 0 |
| 0 except step 10 = +0.05 and step 11 = −0.05 (one jolt) | radius 0.5, zoom 1.1 | frame 10: 0.044 (= 1.1 × 0.04); frames 9 and 11: −0.0088; frames 6–8 and 12–14: −0.0022 / −0.0044 / −0.0066 mirrored; the rest 0 |
| the same jolt | radius 0.5, zoom 1.05 | frame 10: 0.025 (1.05 × 0.04 = 0.042, clamped) |
| the same jolt | radius 0.5, zoom 1.5 | frame 10: 0.06 (= 1.5 × 0.04, under its clamp of 0.25) |
| the same jolt | `scaleX` −1 | frame 10: −0.044 |
| 0 except step 10 = 0.5 (a cut) | any | all 0 |

`STEADY_LEVELS = { low: { level: 1, zoom: 1.05, radius: 0.25 }, medium: { level: 2, zoom: 1.1, radius: 0.5 }, high: { level: 3, zoom: 1.15, radius: 1 } }`.

## 6. Native API and numbers

```ts
export interface ShakeRequest { jobId: string; sourceUri: string; from: number; to: number; minFrameGap: number; measureSide: number }
export interface ShakeResult { times: number[]; dx: number[]; dy: number[]; frames: number; failed: number }
export interface SteadyRequest {
  jobId: string; sourceUri: string; outputPath: string; from: number; to: number;
  maxSide: number; minFrameGap: number; grid: number; zoom: number;
  times: number[]; dx: number[]; dy: number[];        // the corrections (empty = none); a frame takes the entry nearest its time
  bitRate: number; blendFloor: number;
}
export interface SteadyResult { fileUri: string; seconds: number; frames: number }
export type SteadyEvent = { jobId: string; progress: number };
export const STEADY_CANCELLED = "E_STEADY_CANCELLED";
isSteadyAvailable(): boolean                              // the module has `renderSteady`
measureShake(req: ShakeRequest): Promise<ShakeResult>     // rejects "E_STEADY_CANCELLED" or "E_STEADY"
renderSteady(req: SteadyRequest): Promise<SteadyResult>   // the same
cancelSteady(jobId: string): void                         // stops whichever of the two runs under that id
addSteadyListener(cb: (e: SteadyEvent) => void): EventSubscription
isSteadyCancelled(e: unknown): boolean
```

**Error strings:** `steady output: not a file path`, `steady output: <describe>`, `steady source: not a file path`, `steady source: this file has no picture`, `steady source: nothing to render`, `steady source: <describe>`, `steady reader: this picture cannot be decoded`, `steady reader: <describe>`, `steady measure: no picture came out`, `steady writer: this iPhone cannot write this video`, `steady writer: no picture buffer`, `steady writer: <describe>`, `steady sound: this clip's sound cannot be copied`, `steady sound: <describe>`, `steady render: no picture buffer`, `steady render: no picture came out`, `steady render: <describe>`; cancel rejects with `Steady cancelled`. The app adds `steady measure: no answer after <n> s` / `steady render: no answer after <n> s`.

### 6.1 The constants (TypeScript, `src/editor/model/steady.ts`)
`STEADY_VERSION = 1`. `STEADY = { maxSeconds: 60, maxSide: 1920, minFrameGap: 0.008, measureSide: 512, bitsPerPixel: 0.12, blendFloor: 0.02, cutShift: 0.2, scaleX: 1, scaleY: 1, measureShare: 0.4 }`. `SMOOTH = { fullGrid: 60, slowGrid: 120, slowBelow: 0.5 }`. `STEADY_PREVIEW = { layerVideo: true, mainVideo: true }`. Raise `STEADY_VERSION` when a number that changes the copy changes (zoom, radius, grid, the blend).

### 6.2 Names and ranges
The range is the cut-out's (`cutoutRange`, imported: the trim plus 2 s each side on whole seconds, inside the file). A copy is `<stem>-s1-<level>-<grid>-<from ms>-<to ms>.mov` in `<project>/steady/`; a render writes `part-<name>` and moves it. A known copy serves a clip when its stem, level and grid are the clip's and its range holds the trim and the transition handle each side (`coveringSteady`: the smallest such copy, the earlier of two equals).

| Clip (file `abc.mov`, 30 s, trim 4.2 – 9.7) | Setting | Name |
|---|---|---|
| Stabilize Medium, 1× | level 2, grid 0 | `abc-s1-2-0-2000-12000.mov` |
| the same at 0.5× with Smooth slow motion | level 2, grid 60 | `abc-s1-2-60-2000-12000.mov` |
| Smooth slow motion alone at 0.25× | level 0, grid 120 | `abc-s1-0-120-2000-12000.mov` |
| Smooth slow motion on, speed back to 1× | no copy | — |
| trimmed to 5 – 9, or split | still inside 2 – 12 | the same copy |

### 6.3 Frames and times
Source frames closer than `minFrameGap` (0.008 s) to the last kept one are left out: 30 and 60 frames a second are kept whole, 240 becomes 120. **Without a grid** every kept frame is written at its own source time. **With a grid** (*as built*; the approved text had a uniform lattice `from + k / grid`) every kept frame is STILL written at its own source time, and between each two neighbouring kept frames `a < b` the copy gets `k = round((b − a) × grid) − 1` blended frames at `a + (b − a) × j / (k + 1)`, `j = 1 … k` (`SteadyRender.blendsBetween`: 0 when `k < 1`, 0 when `k > 16` (`mostBetween`), lowered until no two frames of the copy are closer than `minFrameGap`); nothing before the first or after the last source frame. `grid` is therefore a density (about that many frames per source second), not a set of times.

**The clock.** The copy's picture track has a 1 / 30 000 s clock (`AVAssetWriterInput.mediaTimeScale = 30000`, `SteadyRender.timescale`): 1 / 600, 1 / 6 000 and 1 001 / 30 000 of a second are whole ticks, so iPhone footage (timescale 600), 29.97 footage and the in-betweens are all stored exactly as computed. Source frames are appended with their own `CMTime`; an in-between's time is rounded to a tick of that clock, and one that would land within `minFrameGap` (in ticks) of the frame written before it or of the source frame after it is not written. (The approved text had timescale 6 000 and left the track's timescale to the writer.)

### 6.4 The picture
Upright; `cutoutSize(width, height, 1920)`. Each frame: the source's rotation and the scale to the copy's size, then about the centre × `zoom`, then moved by `dx × width`, `dy × height` in Core Image's coordinates (the same coordinates Vision's numbers came in, so no flip happens natively). 8-bit, tagged BT.709, as cut-outs.

### 6.5 Storage and time (estimates, not measured)
`steadyBitRate` = `max(1 000 000, width × height × 30 × 0.12)` × 1 (no grid) / 1.4 (60) / 2 (120): 7.5, 10.5 or 14.9 Mbit/s for 1080 × 1920. With the sound: about **9.5 MB per 10 seconds of copy** without a grid, **13 MB** at 60, **19 MB** at 120; the longest copy (64 s) about 61 / 85 / 120 MB. The bitrate is per second of the copy, so a denser copy has fewer bits per frame (at 120 frames a second half of what a 30-frames-a-second copy has; Stabilize alone on 60-frames-a-second footage likewise, the bitrate does not know the source's rhythm). Left as it is until the phone shows a soft copy (§10 item 7): blended frames cost little, nothing has been measured, and a raise costs storage and writing time on every copy. A copy is up to 4 seconds longer than its clip. Time is unknown: Apple publishes none for image registration. Deadlines: measuring `60 000 + 10 000 × length` ms, writing `60 000 + 30 000 × length` ms (a 64-second range: 12 and 33 minutes at most).

### 6.6 What the Swift does
`measure` (synchronous, one reader): per kept frame, upright and scaled into one of two BGRA buffers → `VNTranslationalImageRegistrationRequest(targetedCVPixelBuffer: this frame, …)` performed **on the frame before** by a **fresh** `VNImageRequestHandler(cvPixelBuffer: the frame before, options: [:])` made for that one pair (*as built*; the approved text had one `VNSequenceRequestHandler` for the whole clip — the two buffers are used again and again with new contents, and a handler that remembered anything by buffer would answer 0 for every step) → `alignmentTransform.tx / width`, `.ty / height`. The first frame reports 0, 0. `render` (the cut-out's loop: a reader with picture and sound, a writer with both inputs, whichever is ready is served, 2 ms sleep when neither): a kept frame is placed (§6.4) and either rendered straight into a pool buffer and appended at its time, or — with a grid — rendered into one of two held buffers; the in-betweens of the pair (§6.3) are rendered from the two held buffers (`CIDissolveTransition` through `Adjust.filtered`; a nil filter means no in-between is added) and then the frame itself is written from its buffer at its own time, so sharp and blended frames go through the same round trip.

**Apple APIs relied on** (pages fetched 2026-10-08 from developer.apple.com/tutorials/data/documentation/vision/…; "✔" = the fact used was on the page):

| API | Fact used | Verified |
|---|---|---|
| `VNTranslationalImageRegistrationRequest` | iOS 11.0+, not deprecated; "determines the affine transform necessary to align the content of two images"; `var results: [VNImageTranslationAlignmentObservation]?` | ✔ |
| `VNImageRegistrationRequest` → `VNTargetedImageRequest` | superclass chain; `init(targetedCVPixelBuffer: CVPixelBuffer, options: [VNImageOption : Any], completionHandler: VNRequestCompletionHandler?)`, iOS 11.0+ | ✔ |
| `VNImageTranslationAlignmentObservation.alignmentTransform` | `CGAffineTransform`; "The alignment transform to align the floating image with the reference image." | ✔. **Unverified:** which image is the floating one (assumed: the targeted one, the request's), the unit (assumed: pixels of the measured buffer), the direction of y (assumed: Core Image's, up) |
| `VNTrackTranslationalImageRegistrationRequest` | iOS 17.0+ ("automatically computes the registration against the previous frame") | ✔ — **not used** (deployment target 16.4) |
| `VNHomographicImageRegistrationRequest` | iOS 11.0+; "perspective warp matrix" | ✔ — **not used** (S1) |
| `VNSequenceRequestHandler.perform(_:on: CVPixelBuffer)` | iOS 11.0+, throws | ✔ (2026-10-08, cut-out) — **not used** for measuring as built (see the next row) |
| `VNImageRequestHandler(cvPixelBuffer:options:)` + `perform(_:)` | iOS 11.0+, throws; one handler per pair of frames | as built. **Unverified:** that a targeted request takes the handler's buffer as the reference (phone checks 3 and 5) |
| `AVAssetWriterInput.mediaTimeScale` | `CMTimeScale`, set before writing starts, video inputs only; 0 = the input chooses | as built: 30 000 |
| `AVVideoCodecType.hevc` through `AVAssetWriterInputPixelBufferAdaptor` with 32BGRA | the cut-out does the same with `hevcWithAlpha` (compiled; on-device result pending) | **unverified** at 60 / 120 frames per second of file time |
| `AVAssetWriter.startSession(atSourceTime: .zero)` with a later first frame | an empty edit before the first sample | ✔ (2026-10-08) |
| `CIDissolveTransition` (`inputTargetImage`, `inputTime`) | used by `ClipyCompositor.dissolve` | compiled and shipped |
| `AVMutableComposition` + `scaleTimeRange` + a video composition | that each output frame time shows the copy's frame for that moment, so a denser copy gives distinct frames | **unverified** (phone check 2) |
| `AVPlayer` at rates 0.25–1 on a file with 60 / 120 frames a second | shows every frame (as it does for the phone's own slow-motion recordings) | **unverified** through expo-video (phone check 1) |
| A `Record` field of type `[Double]` | converts from a JavaScript number array | **unverified**; read against `node_modules/expo-modules-core/ios` in the Swift review |

## 7. The app side

- **`timeline.ts`** (two additions, nothing else): `slowestSpeed(c)`, `isSlowed(c)`.
- **`steadyPath.ts`** (pure): §5.
- **`steady.ts`** (pure): the constants, `steadyOf`, `levelRule`, `steadyRefusal` (`"tooLong" | null`), `steadyFileName`, `parseSteadyName`, `coveringSteady`, `steadyNeed`, `neededSteady`, `steadyDeadlineMs`, `steadyBitRate`, `steadyBytes`.
- **`renderTurn.ts`**: `takeTurn` (the shared turn).
- **`steadyFiles.ts`**: `useSteadyFiles`, `knownSteady`, `steadyNeedOf`, `steadyNeeded`, `steadyFileOf`, `shownSteady`, `steadyPercent`.
- **`steadyRenders.ts`**: `steadyDir`, `ensureSteady` (measure → `steadyShifts` → render, inside one turn), `syncSteady`, `retrySteady`, `resetSteady`, `openSteady`, `useSteadyRenders` (mounted beside `useCutoutRenders`).
- **`exportSteady.ts`**: `prepareSteady`, `withSteady` (`sourceUri` only), `steadyBytesToMake`; `useExport.ts` calls them after the cut-outs, **only when a clip has a copy** (`some(steadyOf)` is asked before anything else, so a project without the keys makes no new call at all — PROOF: the pinned request of `useExport.test.ts` is unchanged and a new test checks the request of a project without keys against `toExportClip`).
- **Preview:** `ClipFrame.tsx` (a main video's steady copy plays in the follower, **over** the main picture, which stays visible underneath until the follower has loaded), `LayerStack.tsx` (the layer's player is handed the copy), `PreviewTag.tsx` (the tag shows while a clip on screen has a setting whose copy the preview is not showing).
- **Tools:** `contextFor` (`stabilize`; Reverse left out while `steadyOf` is not null), `toolGroups.ts`, `toolStrip.ts`, `EditorToolbar.tsx`, `StabilizeSheet.tsx`; `SpeedSheet.tsx` with `SmoothSlowSection.tsx`; one refusal in `CutoutSheet.tsx`.

## 8. Edge cases

| Case | Behaviour |
|---|---|
| A clip without either setting | exactly as today, everywhere |
| Stabilize picked, new build | the tile is selected at once (one undo step); the status row counts 0–100 %; the clip shows as it was, with the Preview tag, until "Ready." |
| Another strength picked | a new copy; the measuring is not repeated in the same session (the percent starts at 40) |
| Off | the key is removed; the clip is as it was at once; the copy stays on disk until the project is next opened (Undo finds it) |
| Undo / Redo | instant when the copy exists |
| Speed set under 1× | the **Slow motion** chip appears beside Normal and Curve |
| Smooth slow motion switched on | a copy on the 60 or 120 grid; status as above |
| Speed dragged across 0.5× with the switch on | the other grid: a new copy once the project has stood still |
| Speed back to 1× or above | the chip is gone, no copy is used or made, the key stays; under 1× again the switch is on |
| A speed curve or ramp with a part under 1× | slowed: the tab is there; the grid follows the slowest part |
| Both settings on one clip | one copy, one percent |
| Remove background on the clip | Stabilize and Smooth slow motion say the M2 sentence and change nothing |
| Stabilize or an active Smooth slow motion on the clip | Remove background says the mirror sentence and stays off |
| A reversed clip | no Stabilize tool, no Slow motion tab (also when it is slowed, and when it is reversed while the tab is open: the strip falls back to Normal) |
| A clip with a copy | Reverse is not on its bar |
| A photo | neither tool |
| A multi-selection in the Speed strip | no Slow motion tab |
| Over 60 seconds of trimmed source | the tap says the sentence and changes nothing |
| A clip with a setting trimmed past 60 s | the keys stay; no copy; the status row says the sentence; an export stops with it |
| Trim drag, speed drag | nothing renders until the project has stood still for 0.8 s |
| Trim outwards past the copy | a new copy; the clip shows as it was meanwhile |
| Split, duplicate | the same copy |
| Replace with another video | the keys stay; a copy of the new file is made |
| Replace with a photo | both keys go with the same step (Undo brings them back with the video) |
| A transition into or out of the clip | the copy holds the handles (2 s each side) |
| A filter, Adjust, crop, mask, opacity, green screen, keyframes, animation | applied to the copy as to the original |
| A cut inside the clip (two scenes in one file) | the jump is not taken as shake; each side is steadied |
| A frame Vision cannot register | no correction for that frame |
| The copy fails | the toast of U3; the status row says how to retry |
| A cut-out render is running | the new render waits its turn (the percent stays at 0; its deadline has not started) |
| Export while a copy is missing | it is made first (30 % of the bar); Cancel stops the waiting |
| Export at 60 frames a second of a 0.25× clip | a 120 grid gives each frame twice: smoother than before, not perfect |
| A 240-frames-a-second recording, stabilised | the copy keeps 120 a second |
| Expo Go or an older build | both tools are on screen; a tap says `STEADY_TOOLS` and stores nothing |
| A project duplicated / deleted | copies are made again in the duplicate / go with the folder |

## 9. On an older build and in Expo Go

The Stabilize tool, its strip, the Slow motion tab and its switch are on screen; a tap says the sentence; nothing is stored. **Accounts** reads "App build: beats and background" until the new build is installed, then "App build: stabilize and smooth". A v21 project opens in this JavaScript on the older build.

## 10. What can only be judged on the phone (every unverified fact, what the owner would see, the fallback)

1. **Does the preview play the copy smoothly?** If a 60 / 120-grid copy stutters or the follower lags: `STEADY_PREVIEW.mainVideo` / `.layerVideo` off — the preview shows the original with the Preview tag, the export is unaffected. No build.
2. **Does the export show a new picture in every frame of a slowed clip?** If the exported slow motion still repeats frames although the preview is smooth: the composition does not pick the denser frames. Fallback: a second build that blends in the compositor.
3. **Direction.** If a stabilised clip shakes **more** than the original (both ways): `STEADY.scaleX` and `scaleY` → −1. If it is calmer side to side and worse up and down (or the reverse): only that one. No build.
4. **Unit.** If Stabilize changes nothing but the zoom (the numbers are far too small), or the picture flies off to the clamp on every frame (far too large): the log line `steady shake` shows the size of the numbers; `scaleX` / `scaleY` rescale. No build.
5. **Which frame is the floating one.** The same symptom and the same fix as 3.
6. **Time and heat.** How long 5, 20 and 60 seconds take at each setting; whether the phone stays usable. Fallbacks in TypeScript: `measureSide` smaller, `minFrameGap` larger, `slowGrid` 60.
7. **Quality.** Soft double images on fast movement (blending); wobble that is left (rolling shutter, twisting); whether 5 / 10 / 15 percent hides the edges; whether Low / Medium / High differ enough; whether a steadied or smoothed clip looks **softer** than its original (then raise `STEADY.bitsPerPixel` or the two grid factors in `steadyBitRate`, and `STEADY_VERSION`). All numbers are TypeScript.
8. **The writer** takes HEVC at 120 frames per second of file time. If not: "steady writer: …" and the clip shows as it was; a build is needed only if H.264 is refused too.
9. **Sound** of a copy: in step, no click (as for cut-outs).
10. **Colours:** HDR recordings are read as 8-bit and tagged BT.709 (as for cut-outs): does the copy look like the original?
11. **The bridge:** a 60-second clip sends about 23 000 numbers with the render request. If the app hesitates there: `minFrameGap`.

## 11. Differences from the approved wording

- **"Exactly like Cut out works now":** the same queue rules and status line, but its own queue and folder; the two share one turn, so a cut-out and a steadied copy are never made at the same time.
- **"Shaky videos":** up / down / left / right only; no twisting, no rolling-shutter wobble.
- **"About 5–15 %":** exactly 5, 10 and 15 percent.
- **"Clips up to 60 seconds":** 60 seconds of the clip's trimmed source, for both tools.
- **"A Smooth switch in the Speed tool":** it is called **Smooth slow motion** and sits on its own tab, **Slow motion**, because the Curve tab already has a switch called Smooth.
- **"Works on every iPhone":** yes; the result is blended frames, soft on fast movement.
- Not said in the approval: neither tool works together with Remove background on the same clip, on a reversed clip, or for several clips at once; a clip with a copy cannot be reversed.
- **Copies are cleaned up** when the project is next opened, not at once.

## 12. The owner's device checklist

**Part A works with the app you already have** (Accounts reads "App build: beats and background"). **Part B needs the new app.**

### Part A: with the app you have now
1. Open a project from before this update and play it. Everything looks and sounds as before.
2. Tap a video clip. After **Cut out** there is **Stabilize**. Tap it: a strip with **Off / Low / Medium / High**. Tap **Medium**: a message says it needs the latest build, and **Off** stays selected.
3. Tap **Speed** and set 0.5×. Beside **Normal** and **Curve** there is now **Slow motion**. Tap it, tap the switch **Smooth slow motion**: the same message; the switch stays off.
4. Set the speed back to 1×: **Slow motion** is gone.
5. A photo has neither. A reversed clip has no Stabilize.
6. **Accounts** still reads "App build: beats and background".

### Part B: after installing the new app
**Accounts** now reads "App build: stabilize and smooth". If not, the install did not happen.

**Stabilize**
7. Take a shaky clip of about ten seconds (walk with the phone). **Stabilize**, **Medium**. A percent counts up. How long did it take?
8. At **Ready**: play. Is the picture **calmer**, **the same**, or **shakier than before**? Is it calmer side to side but not up and down, or the other way? (The most important answer.)
9. Are the edges clean (no black or smeared border coming in)?
10. Try **Low** and **High**: does the percent start at about 40 now? Is the difference visible?
11. **Off**: the clip is as it was at once. **Medium** again: steady at once, no waiting.
12. Trim it shorter, split it, add a transition to the next clip: still steady, no new waiting.
13. Export. Is the exported clip as steady as the preview?
14. A clip that pans slowly on purpose: does the pan stay smooth?
15. Do the same on an **Overlay** video.

**Smooth slow motion**
16. A clip with movement (someone walking, a car). **Speed** 0.5×. Play: note the stutter.
17. **Slow motion**, switch **Smooth slow motion** on. Wait for **Ready**. Play: is the movement smoother in the preview? Is the picture in step with the sound?
18. Export and watch the file: is it smoother than an export with the switch off? (The second most important answer.)
19. Set 0.25×: a new percent; then the same two questions.
20. Fast movement: do you see soft double edges? Acceptable?
21. A speed **Curve** with a slow part: the tab is there; switch it on; play and export.
22. Switch **Stabilize** on for the same clip: one percent, then both at once.

**Limits**
23. A clip longer than a minute: both say to trim or split first.
24. A clip with **Remove background** on: both say to switch it off first, and Remove background says the same about them.
25. A clip of 30 and of 60 seconds at **High** with **Smooth slow motion** at 0.25×: how long, how hot, could you keep editing?
26. Close and reopen the project: no waiting.

**Tell me** what you saw at 8, 13, 17 and 18.
