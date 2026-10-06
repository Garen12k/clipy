# Auto Beat Cut and Quick Edit: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Read this first.** Tasks 1 – 7 were **built during planning**: the plan's author trial-ran the code to prove the design (the generation route in particular had to be proved on this machine before it could be planned around), and the controller ruled that the proven code is kept rather than rebuilt from a description. Those tasks list their files, interfaces and how they were verified, and carry a **review checklist** instead of build steps. **Only Task 8 (docs) has steps to execute.** Be aware of what that means: the tests of Tasks 1 – 7 were written *together with* the code, not before it (see "How Tasks 1 – 7 were verified").

**Goal:** **Find beats** and **Cut to beats** in the Beats panel (with a Fewer / More slider), and a **Quick edit** button on the home screen that turns a style and the owner's photos and videos into a finished draft — while nothing in an existing project changes unless the owner taps, Cut to beats is one undo step, and a cancelled or failed Quick edit leaves nothing behind.

**Architecture:** The app cannot read a music file's samples in Expo Go, so the beats of the bundled tracks are computed at development time: `src/editor/model/beatDetect.ts` (plain TypeScript: spectral-flux onset envelope → autocorrelation tempo with a prior at 120 bpm → fine period and phase search) is run by `scripts/generate-beats.mjs` over mp3 files decoded with a decoder installed outside the repo, and the result is committed as `assets/music/beats.json` (seven of eight tracks; The Frigid Seas has no steady beat). `src/editor/musicBeats.ts` recognises a bundled track by title and exact length — **no new stored field, schema stays 17**. `src/editor/model/beats.ts` holds the two ops: `placeBeats` (file beats → project markers through the track's `start` / `trimStart`, replacing only the markers inside the track's stretch) and `cutToBeats` (walk the main clips; each ends on the latest marker that keeps it ≥ 0.5 s and no longer than it is; only `timeline.ts` touches speed). `BeatsSheet.tsx` gains the two buttons, the slider and the hints. Quick edit is a recipe (data) plus one pure builder in `src/projects/quickEdit.ts` made of existing ops, an all-or-nothing flow in `quickEditFlow.ts` (dependencies injected, tested on the in-memory file system), a Sheet (`QuickEditSheet.tsx`) and a SecondaryButton on the home screen.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript strict, Zustand 5, `expo-audio` / `expo-asset` / `expo-image-picker` (installed), `@expo/vector-icons` 15, Jest (`jest-expo`) + RNTL 14.0.1; Node 22.14 with `--experimental-strip-types` and `mpg123-decoder@1.0.3` (WebAssembly, **dev-time only, installed outside the repo**) for the generation script. **No new package, no change to `package.json`, no Swift, one new generated data file.**

**Spec:** `docs/superpowers/specs/2026-10-06-beat-cut-templates-design.md` (binding; §0 feasibility, §4 finding beats, §5 Cut to beats and its vectors, §6 Quick edit and the recipes table, §12 evidence and what is unverified, §14 the decisions).

## Global Constraints

- **iPhone only.** No Android or web configuration, files or code paths.
- **Expo Go must keep working.** Nothing here needs `modules/clipy-video` linked. `package.json`, `package-lock.json` and `app.json` are not edited.
- **No Swift.** Nothing under `modules/` is edited.
- **Schema stays 17.** `types.ts` and `migrate.ts` are not edited; no stored field is added. A bundled track is recognised, not tagged.
- **Nothing changes unless the owner taps.** No load, no panel opening, no audio edit places a marker or moves a cut. Only `placeBeats` / `cutToBeats` write, and only from Find beats, the slider after a Find, Cut to beats, or `buildQuickEdit` (a new project).
- **One user action = one undo step:** a tap is one `apply`; a slider drag is `beginTransaction` + `applyTransient`; an op that changes nothing returns the same project (no step).
- **Only `src/editor/model/timeline.ts` uses a clip's `speed`:** lengths through `clipDuration`, shortening through `sourceAfter`.
- **Never edited this round:** `src/editor/model/types.ts`, `migrate.ts`, `ops.ts`, `timeline.ts`, `snap.ts`, `src/editor/timelineScroll.ts`, `src/editor/components/PreviewPlayer.tsx`, `Timeline.tsx`, `EditorLayout.tsx`, `EditorToolbar.tsx`, `AddAudioSheet.tsx`, `src/editor/toolbarContext.ts`, `toolStrip.ts`, `toolGroups.ts`, `music.ts`, `templates.ts`, `src/projects/storage.ts`, `pickMedia.ts`, `src/navigation/screenOptions.ts`, `src/ui/*`, `src/theme/*`, anything under `src/publish/`, `supabase/`, `modules/`.
- UI from `src/ui/` and `src/theme/theme.ts` only; **no hex literals**; **spacing from `theme.space` only** (never add to the `spacingScale` allow-table, no apostrophe in JSX text, no `*` or `/` in a spacing value); the slider is the kit `Slider`; icons are Ionicons outline names; **one PrimaryButton per screen or panel** (home: New clip; the Beats panel: Tap; the Quick edit sheet: Choose photos and videos).
- **Motion rules:** no new animation at all.
- `assets/music/beats.json` is **generated**: re-run `scripts/generate-beats.mjs`, never edit the file. A track's `title` and `durationSec` in `assets/music/manifest.json` are its identity for music already in projects: never edit them.
- RNTL v14: `render` / `fireEvent` / `rerender` are async — always `await`. **`await fireEvent.press` waits for an async press handler to finish**: to look at a state in the middle of one, keep the promise and await it afterwards.
- Windows: PowerShell, no `&&`, `npx.cmd` / `npm.cmd`. **Never run `expo lint`.** **Never `git stash`.** **`git add` explicit paths only.** **Do not start or stop a dev server** (one is serving this tree to the owner's phone — keep the app loadable at every moment). Before each commit: `npm run typecheck` and `npm test` green. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Task order

`(1 ∥ 3) → 2 → (4 ∥ 5 → 6 → 7) → 8`

| Task | Title | Depends on | Parallel-safe with | State |
|---|---|---|---|---|
| 1 | The beat detector (`beatDetect.ts`) | — | 3 | built during planning |
| 2 | The generation script, `beats.json`, recognising a bundled track (`musicBeats.ts`) | 1 | 3 | built during planning; data from a real run |
| 3 | Beat ops: `beatTimesFor`, `placeBeats`, `cutToBeats` (`model/beats.ts`) | — | 1, 2 | built during planning |
| 4 | The Beats panel: Find beats, Fewer / More, Cut to beats | 2, 3 | 5, 6, 7 | built during planning |
| 5 | Quick edit recipes and the builder (`quickEdit.ts`) | 2, 3 | 4 | built during planning |
| 6 | The all-or-nothing flow (`quickEditFlow.ts`), `useProjects.createQuick` | 5 | 4 | built during planning |
| 7 | The home screen: the button, the sheet, the busy state | 6 | 4 | built during planning |
| 8 | Docs: AGENTS rule lines, README, `assets/music/README.md`, the spec's "as built" | 1 – 7 | — | **to do** |

**Files more than one task edits:** none. (`BeatsSheet.tsx` and its two test files: Task 4 only. `useProjects.ts`: Task 6 only. `app/index.tsx`: Task 7 only.)

**Pinned values that changed, and where:** the Beats panel's height 239 → 429 and the removed compact-fit arithmetic, both in `src/editor/__tests__/BeatsSheet.test.tsx`, and the bar height while the Beats panel shows in `src/editor/__tests__/EditorLayout.test.tsx` line 175 (`panelHeight("compact", H)` → `"regular"`; found by the full run, after this plan was first committed) (Task 4). No tool count, no schema number, no guard allow-table.

## How Tasks 1 – 7 were verified

- Each new suite was run on its own with `npx.cmd jest <file>`; then `src/projects/__tests__`, `src/editor/__tests__/BeatsSheet*` and the guards in `src/__tests__` together; then `npx.cmd tsc --noEmit` (clean). The full `npm run typecheck` and `npm test` are run before the code is committed (the totals are in the commit messages' author report).
- **Not test-first.** Code and tests were written together. What was seen red, and why: `beatDetect` — a 174-bpm click track was read as 87 (the documented half-tempo rule; the case became its own test and 150 took its place in the table); `quickEdit` — four expectations (a fixture whose beats ran out under the 30th photo; the clip the music ends under is cut on the last beat, which the test had not expected; Calm's marker step was too coarse for a 2.2-s video and Cinematic's ten clips overran its 32-s track — **both recipes were changed**, Calm to every 2nd beat × 2, Cinematic to every 2nd × 3); `BeatsSheet.test.tsx` — the pinned panel height; `quickEditHome` — a test that awaited a press whose handler was still pending. Everything else passed on its first run, which proves less than a red-then-green run would: **reviewers should treat the tests of Tasks 3 – 7 as unproven against wrong implementations** and may want to mutate a line or two (the `reach` comparisons in `cutToBeats`, the stretch filter in `placeBeats`).
- The generation script was run twice on this machine; the two outputs were byte-identical; the committed `beats.json` is that output.

---

### Task 1: The beat detector — built during planning

**Files:** `src/editor/model/beatDetect.ts`, `src/editor/model/__tests__/beatDetect.test.ts`.

**Interfaces — Produces**

```ts
export const BEAT_DETECT: { envelopeRate: 100; windowSeconds: 0.023; minBpm: 70; maxBpm: 180; priorBpm: 120; priorOctaves: 1; fineSpan: 0.03; fineSteps: 300; compress: 1000 };
export interface BeatAnalysis { bpm: number; first: number; beats: number[]; confidence: number }
export function onsetEnvelope(samples: Float32Array, sampleRate: number): { env: Float64Array; rate: number };
export function beatPeriod(env: Float64Array, rate: number): number;            // envelope frames per beat; 0 = none
export function detectBeats(samples: Float32Array, sampleRate: number): BeatAnalysis | null;
```

The file has **no imports and only erasable TypeScript** (no enums, no parameter properties, no namespaces): `scripts/generate-beats.mjs` loads it with Node's type stripping.

**Review checklist**
- [ ] Spec §4.1 step by step against the code (hop, window, flux, the prior's formula, the 601 fine periods, half-frame phase steps).
- [ ] The frame-to-time convention: frame `i` is the window ending at `(i + 1) × hop`; a click at `t` is found within 15 ms (tests) — is a constant offset hiding in the Hann window's centre? (§12.3 of the spec is the related device question.)
- [ ] `detectBeats` returns null for < 4 s, silence, rate 0; the app never calls this module (grep: only the script and the test import it).

---

### Task 2: The generation script, the data, recognising a bundled track — built during planning

**Files:** `scripts/generate-beats.mjs`, `assets/music/beats.json` (generated), `src/editor/musicBeats.ts`, `src/editor/__tests__/musicBeats.test.ts`.

**Commands (PowerShell), to re-generate:**

```powershell
npm.cmd install --prefix "$env:TEMP\clipy-beats" mpg123-decoder@1.0.3
node --experimental-strip-types scripts/generate-beats.mjs "$env:TEMP\clipy-beats"
git diff --stat -- assets/music/beats.json     # empty: the run is deterministic
```

Expected console output: one line per track with `OK` for seven and `NONE` for `frigid-seas`, then `… 7 of 8 tracks have a steady beat.` A second argument writes to another file. The script exits 1 when the decoder folder is missing or a decoded length differs from the manifest's by more than 0.3 s.

**Interfaces — Produces**

```ts
// src/editor/musicBeats.ts
export interface TrackBeats { bpm: number; first: number; confidence: number; beats: number[] }
export const BUNDLED_BEATS: Record<string, TrackBeats | null>;                  // by manifest id; null = no steady beat
export function bundledTrackOf(t: Pick<AudioTrack, "title" | "sourceDuration" | "kind">): BundledTrack | null;
export type FoundBeats = { status: "ok"; title: string; beats: readonly number[] } | { status: "unsteady"; title: string } | { status: "own" };
export function beatsOf(t: Pick<AudioTrack, "title" | "sourceDuration" | "kind">): FoundBeats;
```

**Review checklist**
- [ ] Re-run the two commands above; `git diff` on `beats.json` is empty.
- [ ] The acceptance rule in the script (`ACCEPT`) equals spec §4.2; the table there equals the script's console output.
- [ ] `bundledTrackOf` against how `AddAudioSheet.addBundled` and `storage.importAudio` really write `title` / `sourceDuration` (they pass the manifest's values through unchanged), and how `splitAudioTrackAt` / `duplicateAudioTrack` copy them.
- [ ] Nothing was added to `package.json`; `node_modules/` has no `mpg123-decoder`.

---

### Task 3: Beat ops — built during planning

**Files:** `src/editor/model/beats.ts`, `src/editor/model/__tests__/beats.test.ts`.

**Interfaces — Consumes:** `fitEffects`, `normaliseTransitions` (ops.ts, exported today), `clipDuration`, `sourceAfter`, `totalDuration` (timeline.ts), `trackEnd` (audioSync.ts), `clampBeatMarkers`, `isPhoto` (types.ts).

**Interfaces — Produces**

```ts
export const BEAT_EVERY: readonly [4, 2, 1];
export type BeatDensity = 0 | 1 | 2;
export const DEFAULT_BEAT_DENSITY: BeatDensity;                                  // 1
export const BEAT_CUT: { readonly minClip: 0.5; readonly reach: 0.001 };
export function beatTimesFor(track: AudioTrack, sourceBeats: readonly number[], every: number, total: number): number[];
export function placeBeats(p: Project, trackId: string, sourceBeats: readonly number[], every: number): Project;
export function cutToBeats(p: Project, lastToo?: boolean): Project;
export type BeatCutState = "noMarkers" | "oneClip" | "ready";
export function beatCutState(p: Project): BeatCutState;
export function beatTrack(p: Project, selectedAudioId: string | null): AudioTrack | null;
```

**Review checklist**
- [ ] Spec §5.1 against `cutToBeats`, and every row of §5.2 against the V1 – V7 tests.
- [ ] `cutToBeats` stamps `updatedAt` and fits effects itself (ops.ts's `touch` is private); compare with what `trimClip` + `touch` do, line by line — anything `touch` does that this misses?
- [ ] The store's `refitEffects` only matters inside a transaction; `cutToBeats` is always one `apply`.
- [ ] A photo's new length is rounded to the millisecond while a video's trim is not: is the 1-ms `reach` enough to keep a second tap a no-op in every case (the idempotence test covers one project)?
- [ ] `placeBeats`: a marker exactly on the stretch's edge is replaced (inside, `±1e-9`); markers after the project's end are kept as they are.
- [ ] `beatCutState` is exported and tested but the panel derives the same answer from two counts — one of the two could go.

---

### Task 4: The Beats panel — built during planning

**Files:** `src/editor/components/BeatsSheet.tsx` (rewritten around the unchanged Tap / Remove nearest / Clear all), `src/editor/__tests__/BeatsSheet.auto.test.tsx` (new), `src/editor/__tests__/BeatsSheet.test.tsx` (pinned: the panel test's title and height 239 → 429; the compact-fit arithmetic line and the now-unused `PANEL` import removed), `src/editor/__tests__/EditorLayout.test.tsx` (pinned: one `"compact"` → `"regular"`).

**Interfaces — Produces:** `BeatsSheet({ visible, onClose })` (unchanged signature; `EditorToolbar.tsx` is not edited) and `findHint(status: string, title: string): string`.

**Review checklist**
- [ ] Spec §4.5 against the rendered order, labels and the four hint sentences.
- [ ] The panel is now `size` regular: does anything else assume the Beats panel is compact (`EditorLayout`, `usePanelPresence`)?
- [ ] The slider calls `beginTransaction` only after a Find; a drag that ends where it began leaves one empty undo step (the same as every other slider here).
- [ ] `foundFor` is cleared when the panel is hidden; it is **not** cleared when the selection changes while the panel is open — the slider then still re-places for the track found first.
- [ ] The store selector returns a string (`status|id|title`): a title containing `|` would break the split (bundled titles have none).
- [ ] Three rows of compact button pairs and two hint lines on a 375-pt phone (device).

---

### Task 5: Quick edit recipes and the builder — built during planning

**Files:** `src/projects/quickEdit.ts`, `src/projects/__tests__/quickEdit.test.ts`.

**Interfaces — Produces**

```ts
export const QUICK_RECIPE_IDS: readonly ["travel", "party", "calm", "cinematic", "retro", "vlog"];
export type QuickRecipeId = (typeof QUICK_RECIPE_IDS)[number];
export interface QuickRecipe { id: QuickRecipeId; label: string; icon: IoniconName; trackId: string; every: 1 | 2 | 4; hold: number; videoHold: number;
  transition: { type: TransitionType; duration: number }; filter: FilterId; filterIntensity: number;
  title: string; textTemplate: TextTemplateId; titleY: number; titleScale: number; motions: readonly PhotoMotionId[]; motionStrength: number }
export const QUICK_RECIPES: Record<QuickRecipeId, QuickRecipe>;
export const QUICK: { readonly slack: 0.05; readonly fadeOut: 1; readonly titleSeconds: 3; readonly maxItems: 30 };
export function markerStep(beats: readonly number[], every: number): number;
export function buildQuickEdit(a: { recipe: QuickRecipe; project: Project; music: AudioTrack; beats: readonly number[]; titleId: string }): Project;
```

**Review checklist**
- [ ] Spec §6.1's table against `QUICK_RECIPES`, value by value; §6.2's five steps against the builder.
- [ ] The builder calls `makeOverlay` (a factory `applyTemplate` in ops.ts also uses) and writes `beatMarkers` directly once, to drop markers past the end — the only field it writes without an op.
- [ ] "Pure" means: given a mocked clock. The ops stamp `updatedAt` through `nowIso()`.
- [ ] The 0.05-s slack: with a marker step under about 0.06 s it would skip a step (the fastest recipe's step is 0.5 s).
- [ ] A draft whose music is shorter than the video leaves clips at target + 0.05 s after the last beat (spec §6.4).

---

### Task 6: The flow and `createQuick` — built during planning

**Files:** `src/projects/quickEditFlow.ts`, `src/projects/__tests__/quickEditFlow.test.ts`, `src/projects/useProjects.ts` (adds `createQuick`, `nextName`, `partly`, `assetUri`; `create` behaves as before).

**Interfaces — Produces**

```ts
export interface QuickEditDeps { storage: Pick<Storage, "createProject" | "importAudio" | "saveProject" | "deleteProject">; assetUri(file: number): Promise<string>; newId(): string }
export async function makeQuickEdit(deps: QuickEditDeps, name: string, assets: PickedAsset[], recipeId: QuickRecipeId): Promise<{ id: string; failed: number }>;
// useProjects(): { …, createQuick(assets: PickedAsset[], recipeId: QuickRecipeId): Promise<string | null> }
```

**Review checklist**
- [ ] All-or-nothing: every `await` after `createProject` is inside the `try`; `deleteProject` failing is swallowed and the first error passed on.
- [ ] `createProject` writes a thumbnail before the draft is saved — fine (it is the first clip either way).
- [ ] `useProjects.create` was refactored (name and partial-import toast moved into helpers): the existing `ProjectsScreen.test.tsx` passes unedited — read the diff anyway.
- [ ] In Expo Go `Asset.downloadAsync()` fetches the mp3 from the dev server: a slow first Quick edit on a weak connection (device).

---

### Task 7: The home screen — built during planning

**Files:** `src/projects/QuickEditSheet.tsx`, `app/index.tsx`, `src/projects/__tests__/quickEditHome.test.tsx`.

**Interfaces — Produces:** `QuickEditSheet({ visible, onClose, onChoose(id: QuickRecipeId) })`; the home screen's `home-actions` row (Quick edit on a pill, New clip) and `home-making` pill.

**Review checklist**
- [ ] One PrimaryButton on the home screen (`home.r2.test.tsx` passes unedited) and one in the sheet.
- [ ] The two flows share `starting` / `creating`; while `making` both buttons are unmounted. The `making` pill has no test for a second press because there is nothing to press.
- [ ] `setQuickOpen(false)` then 350 ms (`AFTER_SHEET_MS`) before the picker — the same wait the other sheets use; whether iOS needs longer is a device question.
- [ ] `spacingScale`, `noHexLiterals`, `outlineIcons` pass with these files (they were run); `app/` has no new route, so `screenOptions.ts` is untouched.
- [ ] The width of the two buttons side by side on 375 pt is an estimate (about 325 pt).

---

### Task 8: Docs — to do

**Depends on:** Tasks 1 – 7 committed.

**Files:** Modify `AGENTS.md`, `README.md`, `assets/music/README.md`, `docs/superpowers/specs/2026-10-06-beat-cut-templates-design.md`.

**Do not touch:** behaviour. A failing test means a mistake here.

- [ ] **Step 1: Sweep** with the Grep tool and fix what is found:
  - `git diff --stat main -- modules package.json package-lock.json app.json src/ui src/theme src/publish supabase src/navigation` is **empty**.
  - `git diff --stat main -- src/editor/model/types.ts src/editor/model/migrate.ts src/editor/model/ops.ts src/editor/model/timeline.ts src/editor/model/snap.ts src/editor/toolbarContext.ts src/editor/toolStrip.ts src/editor/components/EditorToolbar.tsx src/editor/components/AddAudioSheet.tsx src/projects/storage.ts src/projects/pickMedia.ts` is **empty**.
  - `git diff --stat main -- src/__tests__` is **empty** (no guard's allow-list grew).
  - `beatDetect` imported anywhere under `src/` or `app/` outside its own test: none.
  - `placeBeats(` / `cutToBeats(` called outside `BeatsSheet.tsx`, `quickEdit.ts` and tests: none.
  - `.speed` or `speedCurve` in `beats.ts` / `quickEdit.ts`: none.
- [ ] **Step 2: `AGENTS.md`**, "This repo": after the **Snapping** bullet add

  ``- Beats: the app cannot read a music file's samples in Expo Go, so the bundled tracks ship with their beats: `assets/music/beats.json` is GENERATED by `scripts/generate-beats.mjs` (header has the two commands; the decoder is installed outside the repo — never add it to package.json) from the detector in `src/editor/model/beatDetect.ts` (no imports, erasable TypeScript only: the script loads it with Node's type stripping; the app never runs it). Re-run the script rather than editing the file. A track stores no song id: `bundledTrackOf` (src/editor/musicBeats.ts) recognises a bundled track by the manifest's `title` and exact `durationSec` — never edit those two for a shipped track. Only `src/editor/model/beats.ts` turns beats into markers (`placeBeats`) and cuts clips to them (`cutToBeats`: shorten only, from the end, last clip untouched unless `lastToo`; text / layers / sounds do not move); both run only from a tap or a slider drag — never on load, never when music is moved.``

  and after the **Screen transitions** bullet add

  ``- Quick edit (home screen) is not the editor's Templates tool: a style is a RECIPE in `src/projects/quickEdit.ts` (data only, ids from the existing registries) and `buildQuickEdit` builds an ordinary schema-17 project from it with the editor's own ops. `makeQuickEdit` (quickEditFlow.ts) is all-or-nothing: a draft that cannot be finished is deleted. On screen the six are "styles"; "Templates" stays the editor's word.``
- [ ] **Step 3: `README.md`.**
  - Section **Audio** (where Beat markers are described): add **Find beats** (built-in music only; seven of the eight tracks — The Frigid Seas has no steady beat; the Fewer / More slider; markers do not follow the music afterwards) and **Cut to beats** (what it does, the half-second minimum, the last clip, one Undo, text / stickers / overlays / sounds do not move).
  - A new short section **Quick edit** after the home-screen / projects section: the six styles with their music, the flow, up to 30 items, ratio Auto, "it is a normal project".
  - **First native build — things to check**: add "Find beats for your own music files is not built: it needs native code that decodes a file with AVFoundation (`AVAssetReader` → mono PCM) and runs the same detector — write `BeatDetect.swift` as the twin of `src/editor/model/beatDetect.ts` (constants and vectors identical) behind `isAvailable`, and have the Beats panel call it for a track `beatsOf` reports as `own`. Until then the button explains itself. Also check once, by ear, that the built-in tracks' markers sit on the beat in the **exported** video as they do in the editor."
- [ ] **Step 4: `assets/music/README.md`**, "Adding a track": add a step — "Run the two commands in the header of `scripts/generate-beats.mjs` and commit the changed `beats.json`; `npm test -- musicBeats` checks that every manifest track has an entry. A track the script reports as `NONE` ships without beats (Find beats says so)." — and a line under the table: "The title and length of a shipped track are how music already in projects is recognised: do not change them."
- [ ] **Step 5: The spec.** Add a section **3a. As built** after §3: the commit of each task, the deviations from this plan (none are expected for Tasks 1 – 7; record what the two reviews changed), and what no test checks (§12 item by item, and the review checklists' open points above).
- [ ] **Step 6: Full checks.** `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `git status --short` shows nothing unexpected.
- [ ] **Step 7: Commit** — `git add AGENTS.md README.md assets/music/README.md docs/superpowers/specs/2026-10-06-beat-cut-templates-design.md`; message `docs: auto beat cut and Quick edit as built — README, AGENTS, music README`.

---

## Pairwise: what each task hands the next, and what may run side by side

| Pair | Shared file or interface | Producer hands over | Consumer relies on | Side by side? |
|---|---|---|---|---|
| 1 → 2 | `beatDetect.ts` | `detectBeats(samples, rate)` | the script imports the `.ts` file directly | no (2 after 1) |
| 1 ∥ 3 | — | — | nothing in common (3 takes plain arrays) | **yes** |
| 2 → 4 | `musicBeats.ts`, `beats.json` | `beatsOf(track)` | the panel's hint and Find | no |
| 3 → 4 | `model/beats.ts` | `placeBeats`, `cutToBeats`, `beatTrack`, `BEAT_EVERY`, `DEFAULT_BEAT_DENSITY` | the panel | no |
| 2, 3 → 5 | `musicBeats.ts`, `model/beats.ts` | `BUNDLED_BEATS` (tests), `placeBeats`, `cutToBeats(p, true)` | the builder and its shipped-recipe tests | no |
| 4 ∥ 5, 6, 7 | — | 4: `BeatsSheet.tsx` and its tests only · 5 – 7: `src/projects/*`, `app/index.tsx` | nothing in common | **yes** — 4 must not touch `src/projects` or `app/`; 5 – 7 must not touch `src/editor/components` |
| 5 → 6 | `quickEdit.ts` | `QUICK_RECIPES`, `buildQuickEdit`, `QuickRecipeId` | the flow | no |
| 6 → 7 | `useProjects.ts`, `quickEditFlow.ts` | `createQuick(assets, recipeId)`; the home test mocks `makeQuickEdit` | the screen | no |
| 5 → 7 | `quickEdit.ts` | `QUICK_RECIPE_IDS`, `QUICK_RECIPES`, `QUICK.maxItems` | the sheet's tiles, the picker's limit | no |
| 1 – 7 → 8 | docs | — | — | no (last) |

**Order of the code commits** (each leaves the app loadable and the suites green): 1 + 2 together (detector, script, data, recognition) → 3 → 4 → 5 → 6 + 7 together (the hook's new function and the screen that calls it).

---

## Device checklist (owner, Expo Go)

The same list as the spec's §15 — it is the one place it is kept; open `docs/superpowers/specs/2026-10-06-beat-cut-templates-design.md` and go to **15. Device checklist**. In one line: **Find beats works with the built-in music only for now** (not your own files, not "The Frigid Seas"); the question only your ears can answer is step 6 — do the ticks sit on the beat?
