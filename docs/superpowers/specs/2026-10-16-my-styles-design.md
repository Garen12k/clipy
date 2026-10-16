# Save as Style — the owner's own Quick Edit styles (design)

Date: 2026-10-16. Branch: `my-styles` (from `next-build`). Status: approved by the owner from a drawing; this spec fixes the details.
Plan: `docs/superpowers/plans/2026-10-16-my-styles.md`.

## 0. What the owner gets

1. A project's actions sheet (Home → long press or More on a card) gains **Save as Style**, between Duplicate and Save a Copy, not on a broken project. It asks for a name in the system prompt (the one Rename uses), prefilled with the project's name, and says "Style saved. You'll find it in Quick edit."
2. A style keeps the project's **music** (cut to the beat as Quick Edit does), its **filter** (and strength), its **transition** (type and length), its **title** (the words and the whole look) and its **photo motion**. Not the clips: those are the new photos and videos picked in Quick Edit.
3. Quick Edit's sheet shows a row **Your styles** above the built-in row (now headed **Styles**) — only when there is at least one. Tapping one of yours selects it exactly like a built-in style; Choose Photos and Videos then makes a finished draft. Touch and hold one of yours → the system action sheet: Rename / Delete / Cancel.
4. Music of the owner's own (not a bundled song) is COPIED into the style's storage, so the style keeps working after the source project is deleted. Styles are on this phone only; a `.clipy` copy of a project does not carry them; deleting a style never touches a project.

Out of scope: syncing across phones / iCloud; styles in `.clipy` files; editing a style's parts (to change one: edit a project, Save as Style again, delete the old one).

## 1. What exists (read on this branch)

- `QuickRecipe` (`src/projects/quickEdit.ts:15-28`): `id`, `label`, `icon`, `trackId` (a bundled manifest id), `every` (1 | 2 | 4), `hold` / `videoHold` (marker steps), `transition`, `filter` / `filterIntensity`, `title` / `textTemplate` / `titleY` / `titleScale`, `motions` / `motionStrength`. Six recipes, `QUICK_RECIPES` (`quickEdit.ts:30-49`).
- `buildQuickEdit({ recipe, project, music, beats, titleId })` (`quickEdit.ts:77-124`) is the ONE builder: photos `hold` steps, long videos cut to `videoHold` steps (each with `QUICK.slack`), the music laid from its first beat (`:96-97`), `placeBeats` + `cutToBeats(…, true)` (`:99`), the slack given back to the trailing run (`:102-108`), the music trimmed to the end with `QUICK.fadeOut` (`:110`), markers past the end dropped (`:111`), the transition on every cut (`:112`), `setFilterForAllClips` (`:113`), motions photo by photo in turn (`:114-117`), the title over `min(QUICK.titleSeconds, total)` via `makeOverlay` + `applyTextTemplate` (`:118-122`). With `beats = []` the step is 0 (`markerStep`, `:61-63`): nothing is cut, no marker is placed, clips keep their own lengths.
- `makeQuickEdit(deps, name, assets, recipeId)` (`src/projects/quickEditFlow.ts:20-37`): the bundled song resolved by `deps.assetUri` FIRST (`:24`), then `createProject` (`:25`), then `importAudio` (`:27`), `buildQuickEdit` (`:28`), `saveProject` (`:29`); on any failure after creation the project is deleted (`:32`). Its order is pinned in `quickEditFlow.test.ts:65-73`.
- Copy style: `TEXT_LOOK_KEYS` / `TextLook` / `textLookOf` / `pasteTextLook` (`src/editor/model/ops.ts:1422-1452`). `textLookOf` returns fresh objects; `pasteTextLook` lays a look on a `kind: "text"` overlay through the Text panel's own clamps (font must be one of `FONT_IDS`, colours `#RRGGBB`, `clampTextStyle`, size through `normaliseOverlay`).
- `bundledTrackOf(track)` (`src/editor/musicBeats.ts:16-19`): a bundled song is recognised by the manifest's title and exact length; `BUNDLED_BEATS` (`:9`) holds its beats in FILE seconds (or null).
- `activePhotoMotion(c)` (`src/editor/model/types.ts:237-238`) — the motion that plays (AGENTS.md: read motion only through it / `shownPhotoMotion`).
- Storage: `makeStorage(fs, …)` keeps projects under `<documents>/projects` (`storage.ts:18`); the sweeps touch only `<cache>/project-files` and `<documents>/incoming` (`sweepProjectFiles`, `storage.ts:402-417`) and the cache folders INSIDE a project (`sound/`, `cutout/`, `steady/`, `peaks/`); `listProjects` lists only `projects/` (`storage.ts:240-252`). `prefs.json` sits in `<documents>` root (`src/projects/prefs.ts:3`). A folder `<documents>/styles` is seen by none of them.
- `importAudio(projectId, { uri, title, durationSec }, kind)` (`storage.ts:286-293`) copies any readable uri into `<project>/media/<new id>.<ext>`, the extension from the title, else the uri, else `m4a`.
- `expoFs.move` refuses a source that is not there (`src/projects/expoFs.ts:24-28`); `memoryFs.move` models the phone's queued move that removes the destination first (`src/projects/fs.ts:50-64`).
- The deleters guard (`src/__tests__/deleters.guard.test.ts:25-34`) lists every file that deletes anything.
- Home: `promptRename` is `Alert.prompt("Rename project", undefined, cb, "plain-text", p.name)` (`app/index.tsx:66`); `ProjectActionsSheet.run(fn, needsAlert)` waits `AFTER_SHEET_MS` (350) before an alert (`ProjectActionsSheet.tsx:17,25-30`); the two refs `starting` / `creating` and `hold` (`app/index.tsx:100-103`, `src/projects/sheetGuard.ts:4-8`); `onQuickChoose(recipeId)` (`app/index.tsx:142-159`); `useProjects().createQuick(assets, recipeId)` (`src/projects/useProjects.ts:63-76`).
- Quick Edit's sheet: tiles in rows of three (`QuickEditSheet.tsx:7-8,29-35`), Travel preselected on every opening (`:19-27`), the note `Music: <song>. …` (`:36`). The kit `Tile` label is one of `SHRINKS_AS_WRITTEN` (`Tile.tsx:32`: `adjustsFontSizeToFit`) — for the app's own short labels only.
- The system action sheet pattern: `ActionSheetIOS.showActionSheetWithOptions({ options: MENU, cancelButtonIndex })`, `MENU = ["Rename", "Cancel"]` (`EditorTopBar.tsx:17,30`), the prompt opened `AFTER_SHEET_MS` after it answers.
- `star-outline` is not yet an icon of the app (`src/ui/__tests__/sfSymbols.map.test.ts:19-34`, 129 names).

## 2. The style, as data

New pure file `src/projects/userStyles.ts` (no Expo import).

```ts
export const STYLES = { version: 1, max: 20, nameMax: 40, minBeats: 4, maxBeats: 2000, maxTitle: 500 } as const;

/** The title: the words and the whole look (Copy style's look), where it stands and how it is turned. */
export interface StyleTitle { text: string; look: TextLook; x: number; y: number; scale: number; rotation: number; align: Align }
/** A bundled song by its manifest id; or the owner's own file, copied into the styles folder, with its beats in FILE seconds. */
export type StyleMusic =
  | { kind: "bundled"; trackId: string }
  | { kind: "own"; file: string; title: string; durationSec: number; beats: number[] };
export interface UserStyle {
  id: string; name: string; createdAt: string;
  music: StyleMusic | null;
  filter: FilterId | null; filterIntensity: number;
  transition: { type: TransitionType; duration: number };
  title: StyleTitle | null;
  motions: PhotoMotionId[]; motionStrength: number;
}
```

`file` is a NAME (one path component, `isSafeName` of projectFile.ts), never a uri: iOS may move the app's container, so an absolute reference would break (the same reason projects are rebased — AGENTS.md, Project files line). The store joins it to `<documents>/styles/media/` when it is used.

## 3. A style from a project — `styleFromProject(project): StyleDraft`

`StyleDraft` is `UserStyle` without `id` / `name` / `createdAt`, and with the own music as `{ kind: "own"; sourceUri; title; durationSec; beats }` (the store copies `sourceUri` and replaces it with `file`). Pure, deterministic, one rule each:

| Part | Rule | Why |
|---|---|---|
| Music | Among `kind: "music"` tracks, the one that SOUNDS longest (`trimEnd − trimStart`); ties → the earlier `start`, then list order. `bundledTrackOf` says bundled → `{ kind: "bundled", trackId }`; otherwise own. No music track → `null`. Voice, sound effects and a clip's own sound are never a style's music. | The song that carries the video. |
| Own music's beats | The project's `beatMarkers` that fall inside that track's stretch on the timeline (`start … start + (trimEnd − trimStart)`, inclusive), turned into FILE seconds (`trimStart + (m − start)`, 3 decimals). Fewer than `STYLES.minBeats` (4) → `[]`. Bundled music stores none (its beats are `BUNDLED_BEATS`). | §5. |
| Filter | The most common `clip.filter` over the MAIN clips (`null` counted as none); a tie → the one whose first clip comes first. None (or no clips) → `filter: null, filterIntensity: 1`; else the strength of the first clip with that filter. | What most of the video looks like. |
| Transition | The most common type among the main clips' `transitionOut` other than `none`, last clip excluded; a tie → first in clip order; duration = the first such clip's. None → `{ type: "none", duration: 0 }`. | Same. |
| Title | THE TITLE = the overlay with `kind === "text"` (never a caption, never a sticker) and non-blank words that STARTS EARLIEST; a tie → list order. Kept: `text` (as written), `textLookOf(o)` (font, size, colour, background, outline, the whole style), `x`, `y`, `scale`, `rotation`, `align`. NOT kept: timing, keyframes, animation. None → `null`. | The title is what opens the video; the look is exactly Copy style's look (one definition, `TEXT_LOOK_KEYS`). Animation is left out: its edges have lengths fitted to the source's title, and a reveal In needs a build gate the Home screen does not ask — the built-in title gets its template's animation, a user title appears and stays. |
| Photo motion | For the main clips in order, `activePhotoMotion(c)` of each photo; the DISTINCT ids in first-appearance order (at most 7); strength = the first one's. None → `motions: [], motionStrength: 0.5`. | Quick Edit gives the motions photo by photo in turn, as the built-in recipes list them. |

A project with none of these still makes a style: the draft is then the picked photos and videos in the order picked, ratio Auto, photos at the default 3 s, videos whole, no music, no filter, no transition, no title — an ordinary New Project made through Quick Edit. Allowed (it is honest and needs no special case); the owner sees what the style holds on the sheet's note ("No music.").

## 4. How a user style builds — one builder, the built-ins untouched

`buildQuickEdit` stays the ONE builder. Its input widens without changing what a recipe produces:

```ts
export type QuickTitle =
  | { from: "template"; text: string; templateId: TextTemplateId; y: number; fontScale: number }
  | ({ from: "look" } & StyleTitle);
export interface QuickPlan {
  every: 1 | 2 | 4; hold: number; videoHold: number;
  transition: { type: TransitionType; duration: number };
  filter: FilterId | null; filterIntensity: number;
  title: QuickTitle | null;
  motions: readonly PhotoMotionId[]; motionStrength: number;
}
export function planOfRecipe(r: QuickRecipe): QuickPlan;
export function buildQuickEdit(a: { recipe: QuickRecipe | QuickPlan; project: Project; music: AudioTrack | null; beats: readonly number[]; titleId: string }): Project;
```

A `QuickRecipe` (told apart by `"textTemplate" in recipe`) is turned into its plan by `planOfRecipe`, which maps field for field (`title` → `{ from: "template", text, templateId: textTemplate, y: titleY, fontScale: titleScale }`), so every op is called with the very arguments it is called with today. Changes inside the builder, each a no-op for a recipe:
- `music === null` → steps 1–4 are skipped (no slack trims because the step is forced to 0, no audio track, no markers, no cut); the project keeps its clips' lengths.
- `plan.filter === null` → the filter is not touched (a recipe's filter is never null).
- `title === null` → no title; `from: "look"` → `makeOverlay({ id, text, x, y, scale, rotation, align, start: 0, end })` then `pasteTextLook(p, id, look)` (the panel's clamps; a font or colour that is not ours falls back to the overlay's default); `from: "template"` → exactly today's two calls.

**PROOF** (committed first, before any of this): `src/projects/__tests__/quickEdit.recipes.proof.test.ts` snapshots, for each of the six recipes, the JSON of `buildQuickEdit` on a fixed five-clip project with the song's real beats, and the `project.json` text `makeQuickEdit` writes on `memoryFs`. Never edited, never updated (no `-u`).

`planOfStyle(style): { plan: QuickPlan; beats: readonly number[] }` (userStyles.ts):
- beats: own → `music.beats`; bundled → `BUNDLED_BEATS[trackId]?.beats ?? []`; none → `[]`.
- `every`: bundled → 2 (the value of five of the six recipes: a marker every other beat); own → 1 (its beats ARE the owner's markers: their spacing was already chosen in the Beats panel).
- `hold` / `videoHold`: derived from the step so the pace is the same whatever the tempo — `paceFor(beats, every)`: step = `markerStep(beats, every)`; `hold = clamp(round(2.5 / step), 1, 16)`, `videoHold = clamp(round(5 / step), hold, 16)` (`USER_PACE = { photoSeconds: 2.5, videoSeconds: 5, most: 16 }`). A photo lasts about 2.5 s and a video at most about 5 s, the middle of what the six recipes give (`quickEdit.test.ts:55`: 1 … 3 s). Without beats the values are unused. Fixed seconds are simpler than reading the source's clip lengths, which the owner did not choose as a "pace" and which may be one long video.
- the rest copied; `title` → `{ from: "look", ...style.title }`.

## 5. Music and beats

- **Bundled**: stored by manifest id. At Quick Edit it is resolved like a recipe's song (`deps.assetUri`, FIRST). A manifest id that no longer exists → "This style's music is missing." and nothing is created.
- **Own**: at Save as Style the file (the project's current, rebased `sourceUri`) is copied to `<documents>/styles/media/<style id>.<ext>` (extension from the source uri, else the title, else `m4a`); each style has its own copy (two styles never share a file, so deleting one never breaks another). At Quick Edit the store answers its uri only if the file is THERE (`musicUri`); the caller asks before `makeQuickEdit`, so a missing file says "This style's music is missing." with nothing created (the all-or-nothing rule: music resolved before the project). `makeQuickEdit` then copies it into the new project's `media/` with `storage.importAudio` — the same call as a bundled song.
- **Beats of own music** are the source project's markers inside the music's stretch, stored IN the style at saving (§3) — the app cannot read a file's samples in Expo Go, and listening (`listenForBeats`) is native, slow and session-only (`useOwnBeats`), so Quick Edit never listens. When the source project has fewer than four markers there: the style's music is used WITHOUT beat cuts — the music is laid from 0 under the whole video and faded at its end, no markers, photos keep 3 s and videos their whole length (`buildQuickEdit` with `beats = []`, today's rule). To get beat cuts the owner places beats in the source project (Beats → Find beats) and saves the style again. The draft's music always starts at the first stored beat, so it is the same moment of the song the owner cut to.

## 6. Storage — `src/projects/styleStore.ts`

`makeStyleStore(fs: FsAdapter, deps: { newId(): string; nowIso(): string })`, bound once for the app in `src/projects/myStyles.ts` (`myStyles = makeStyleStore(expoFs, { newId, nowIso })`). Under Jest `jest.setup.ts` replaces `myStyles` with a store on its own `memoryFs` (the test phone starts with no styles), so the Home suites that mock `@/src/projects` keep working.

- Files: `<documents>/styles/styles.json`, its tmp `styles.json.tmp`, music in `<documents>/styles/media/`. Never inside `projects/` (no sweep, `listProjects`, `.clipy` pack or restore reads it), never in the cache (iOS may clear it).
- Format: `{ "version": 1, "styles": [ …UserStyle ] }`, newest first.
- ONE chain: every read and write of the store runs as one turn of a module-level promise chain (`inTurn`), in the order asked; a failed turn rejects for its caller only. Styles are not projects (no `storage.inTurn`), but the same reason holds: the phone's move is queued and removes the destination first. Never ask for a turn from inside a turn.
- Write: `writeText(tmp)` then `move(tmp, styles.json)`, in the same turn (so the source is always there when the move runs).
- Read (inside a turn):
  - `styles.json` there → parse. `version` > 1 → **newer**: no styles are shown and every write is refused ("Your styles were saved by a newer Clipy."), the file is untouched. Not JSON, not `{ version: 1, styles: [] }` → **damaged**: the file is MOVED aside to `styles/damaged-<nowIso digits>.json` (kept, never read again, never deleted), a `console.warn`, and the store continues empty. Never a crash, never a silent delete.
  - not there, `styles.json.tmp` parses → it is moved into place (the app was closed between the move's remove and its rename — the project rule); a tmp that does not parse is left and ignored.
  - neither → no styles.
  - Each entry is checked on its own (`cleanStyle`): not an object, no string id, no string name → dropped; a value out of range is clamped as `migrate` would (filter not in `FILTER_IDS` → null; transition type not in `TRANSITION_TYPES` → none, duration clamped to `TRANSITION_LIMITS`; motions filtered to `PHOTO_MOTION_IDS`; strengths clamped 0–1; title text not a non-blank string → no title, look fields through `clampTextStyle` / `isHexColor` / `FONT_IDS`; own music with a `file` that is not `isSafeName`, or a non-finite length → no music; beats finite, ≥ 0, sorted, at most `maxBeats`).
- Media sweep: on the FIRST good read of a launch, any file in `styles/media/` that no style names is removed (an add cut off between the copy and the write). Skipped after a damaged or newer read.
- API (each one turn):
  - `list(): Promise<StylesRead>` — `{ status: "ok"; styles } | { status: "newer" }`.
  - `add(draft, name, fallbackName): Promise<UserStyle>` — refuses `newer`, refuses at `STYLES.max` (20) styles (`StyleStoreError("full")`: "You have 20 styles. Delete one to save another."), copies the own music (a copy that fails removes what it made and rejects — `StyleStoreError("missing")` when the source is not there: "Couldn't save the style: its music file is missing."), writes the file; on a failed write the copied music is removed.
  - `rename(id, name)`; `remove(id)` — the file is written first, then the style's music file is removed if no remaining style names it; a remove that fails is swept at the next launch.
  - `musicUri(style): Promise<string | null>` — the own file's uri when it exists.
- Names: user content, kept as typed after `trim()`, cut to `STYLES.nameMax` (40) code points; blank → the fallback (the project's name; for a rename, the old name). Duplicates allowed (the id tells them apart; refusing would add a sentence and a second prompt for nothing).
- Limits: 20 styles; no size limit on music beyond the phone's free space (a copy that fails is the failure toast). Each own-music style holds one copy of its song.
- Deleting: `styleStore.ts` joins the deleters guard: "a style's own music copy in <documents>/styles/media, and one no style names; never a project's file". `useProjects().remove` and every project path are unchanged: deleting a project never touches a style, deleting a style never touches a project.

## 7. The screens

- **ProjectActionsSheet**: `onSaveStyle` prop; `{shown?.broken ? null : <SecondaryButton title="Save as Style" onPress={run(onSaveStyle, true)} />}` between Duplicate and Save a Copy (title style, guarded by the casing test).
- **Home** (`app/index.tsx`): `promptSaveStyle(p)` = `Alert.prompt("Save as style", "You'll find it in Quick edit.", (name) => …, "plain-text", p.name)`; a Cancel or an empty answer does nothing (an empty OK keeps the project's name — `add`'s fallback). The work takes `creating` through `hold` (our own work: load + copy + write; never a system sheet), so it never runs with New Project, Quick Edit, Save a Copy or Open Project File; a tap while another holds a ref does nothing. Toasts (Home is a screen): saved "Style saved. You'll find it in Quick edit."; failures as §6 or "Couldn't save the style".
- **Quick Edit's sheet**: props `mine: readonly UserStyle[]` (default `[]`) and `onStyleMenu(style)`. With `mine` empty the sheet is exactly today's. Otherwise, above the six: a small muted heading "Your styles", a horizontal `ScrollView` (`testID="my-styles"`) of `StyleTile`s, then the heading "Styles" over the unchanged rows. `onChoose` hands `QuickPick = QuickRecipeId | { mine: string }`. The note: `Music: <song>.` for a bundled song or the own file's title, `No music.` without; then the existing sentence. Selection keys: recipe id or `mine:<id>`; a selected style that disappears (deleted) shows Travel selected. Travel is still preselected on every opening.
- **StyleTile** (`src/projects/StyleTile.tsx`): the look of the kit `Tile` (same box, ring, picked tint via `useSurfaces()` / `ringOf`), icon `star-outline` (SF Symbol `star`, SF Symbols 1 — added to `SF_SYMBOLS` and `USED`, 129 → 130), the NAME in `Body numberOfLines={1}` with NO `fit` and no `adjustsFontSizeToFit` — a user's words end in dots at every size (AGENTS.md Text size line; the kit `Tile` is not used because its label shrinks). `onLongPress` opens the menu; `accessibilityHint` "Touch and hold to rename or delete."; `largeContent(name)`.
- **The menu** (`src/projects/styleMenu.ts`): `ActionSheetIOS.showActionSheetWithOptions({ title: name, options: ["Rename", "Delete", "Cancel"], destructiveButtonIndex: 1, cancelButtonIndex: 2 })`, Apple's wording. Rename → `AFTER_SHEET_MS` later `Alert.prompt("Rename style", undefined, cb, "plain-text", name)`. Delete → `AFTER_SHEET_MS` later `Alert.alert("Delete style?", "Projects made with it stay as they are.", [Cancel, Delete (destructive)])` — confirmed because it cannot be undone and removes the copied song, as a project's Delete is confirmed. The Quick Edit sheet stays open behind; its row is read again after each.
- **Making the draft**: `useProjects().createQuick(assets, choice: QuickRecipeId | UserStyle)`: for a user style with own music it asks `myStyles.musicUri(style)` first (null → "This style's music is missing.", nothing made), then `makeQuickEdit(deps, name, assets, { style, musicUri })`. `makeQuickEdit(…, choice: QuickRecipeId | { style: UserStyle; musicUri: string | null })` keeps the recipe path call for call (the PROOF and `quickEditFlow.test.ts:65-73`); for a style: bundled → `deps.assetUri` first; own → the given uri; none → no import; then `createProject`, `importAudio` (when there is music), `buildQuickEdit({ recipe: plan, music, beats })`, `saveProject`, delete on failure.
- Palette: everything reads `useSurfaces()`; no hex; spacing from `theme.space`; casing: buttons "Save as Style", "Rename", "Delete", "Cancel"; titles "Save as style", "Rename style", "Delete style?", headings "Your styles", "Styles".

## 8. Tests that must stay green unedited

The new PROOF; `quickEdit.test.ts` (it calls `buildQuickEdit({ recipe, … })`, still accepted), `quickEditFlow.test.ts`, `quickEditHome.test.tsx`, `QuickEditSheet.test.tsx`, `storage.*.test.ts`, `storage.load.proof.test.ts`, `defaultTree.proof.test.tsx`. Updated as stated only: `deleters.guard.test.ts` (one entry), `sfSymbols.map.test.ts` (one name, count), `homeSheets.test.tsx` / `ProjectsScreen.test.tsx` only if they pin the sheet's button list.

## 9. Unverified until a phone

- The action sheet and the prompts presented while Quick Edit's sheet (a `Modal`) is up (RN presents on the top-most controller; not seen on this phone).
- A long press on a tile inside a horizontal `ScrollView` inside the Sheet's pan gesture.
- VoiceOver's touch-and-hold on a style tile.
- Copy time of a large own song (no progress shown; Home is held by `creating` meanwhile).
- Whether 2.5 s / 5 s feels right with the owner's own markers.
