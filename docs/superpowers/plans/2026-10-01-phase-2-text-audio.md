# Clipy Phase 2 — Text Overlays & Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Text overlays with a full style editor and on-preview manipulation, one music track (Files app or bundled CC0 tracks), per-clip volume/mute — all usable in Expo Go — plus the Swift export extended to render text and mix audio.

**Architecture:** Schema v2 adds `TextOverlay`, `AudioTrack`, `Clip.muted` with a v1→v2 migration in the loader. Pure ops + a shared layout formula (`overlayLayout.ts`, mirrored in Swift) keep preview and export identical: positions are fractions of the frame, font size a fraction of frame height. Preview renders overlays as RN views over `expo-video`; `expo-audio` plays music synced to the store playhead. Timeline gains two lanes under the clips. Export request grows; Swift adds `CATextLayer`s and an `AVMutableAudioMix`.

**Tech Stack:** Expo SDK 57 (expo-audio, expo-document-picker, expo-font plugin, `@react-native-community/slider`), react-native-gesture-handler (Pan/Pinch/Rotation), Zustand, Jest + RNTL v14, Swift/AVFoundation/Core Animation.

**Spec:** `docs/superpowers/specs/2026-10-01-phase-2-text-audio-design.md` (parents: Phase 1 spec, project spec)

## Global Constraints

- Everything except the final render runs in **Expo Go**; no new native code outside `modules/clipy-video`; Swift compiles only on EAS (review by reading).
- Preview/export parity: overlay `x`,`y` are fractions (0–1) of the frame; `fontSize = fontScale * scale * frameH`; one shared formula in `src/editor/model/overlayLayout.ts`, mirrored in `modules/clipy-video/ios/OverlayLayout.swift`; both use the same TTF files in `assets/fonts/`.
- Fonts (OFL): Bangers, Anton, Oswald, Montserrat, Pacifico, Permanent Marker, Lobster, Roboto — TTFs copied from the `@expo-google-fonts/*` packages (no downloads), registered in `src/editor/fonts.ts` with RN family key and iOS PostScript name, embedded natively via the `expo-font` config plugin AND loaded at runtime with `useFonts` for Expo Go.
- Bundled music must be CC0 (public domain). **The agent downloads nothing without the user approving the exact files** (Task 8 has a USER step). User-supplied files go in `assets/music/` with a `manifest.json` entry.
- One music track per project (`audioTracks` stays an array). `schemaVersion: 2`; v1 projects migrate on load; versions > 2 throw "This project was made with a newer version of Clipy."
- All edits are pure ops through `useEditorStore.apply`; gestures/sliders use `beginTransaction` + `applyTransient` (one undo step per gesture).
- Limits: overlay `fontScale` 0.02–0.25, `scale` 0.2–5, `x`/`y` 0–1, `end − start ≥ 0.2` s, `end ≤ totalDuration`; music `trimEnd − trimStart ≥ 0.5`, `start ≥ 0`, `volume` 0–2; clip `volume` 0–2.
- Colors/spacing/fonts from `theme`; no One Piece names/artwork; `@/` alias; npm; keep `overrides`; `npm ci` must work; `npx expo-doctor` must pass.
- Jest: RNTL v14 (`await render`, `await fireEvent.press`, `act()` for store mutations); output pristine. `git add` specific paths only (never `-A`). Every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Expo API drift: verify against `node_modules/<pkg>/build/*.d.ts` when the plan's code doesn't typecheck; keep behavior, fix the call, document it.

## File Structure

```
src/editor/model/types.ts            + TextOverlay, AudioTrack, FontId, Align, Clip.muted, schemaVersion 2, makeOverlay/makeAudioTrack   (T1)
src/editor/model/migrate.ts          migrateProject(raw: unknown): Project                                                           (T1)
src/projects/storage.ts              parse() → migrateProject; new projects v2; missing check includes audio; importAudio()          (T1, T8)
src/editor/fonts.ts                  FONTS registry + fontAssets for useFonts                                                        (T1)
assets/fonts/*.ttf                   8 TTFs                                                                                          (T1)
src/editor/model/ops.ts              + overlay / audio / volume ops                                                                  (T2)
src/editor/model/overlayLayout.ts    layoutOverlay()                                                                                 (T3)
src/editor/model/audioSync.ts        songTimeAt(), isAudible()                                                                       (T3)
src/editor/store.ts                  + selectedOverlayId / selectOverlay; selection exclusivity                                      (T4)
src/editor/components/OverlayLayer.tsx, SelectionFrame.tsx                                                                           (T5)
src/editor/components/PreviewPlayer.tsx   + OverlayLayer, clip volume/mute → player                                                  (T5)
src/editor/timelineLayout.ts         + LANE_HEIGHT, lane offsets, TIMELINE_HEIGHT                                                   (T6)
src/editor/components/OverlayLane.tsx, OverlayPill.tsx, MusicLane.tsx, MusicBar.tsx, Timeline.tsx (+lanes)                           (T6)
src/editor/components/FontStrip.tsx, ColorRow.tsx, TextPanel.tsx, EditorToolbar.tsx (+Text)                                           (T7)
assets/music/manifest.json (+ files), src/editor/music.ts (bundled list), src/editor/components/MusicSheet.tsx, EditorToolbar (+Music)  (T8)
src/editor/components/AudioPreview.tsx                                                                                               (T9)
src/editor/components/VolumeSheet.tsx, EditorToolbar (+Volume)                                                                       (T10)
modules/clipy-video/index.ts, src/export/useExport.ts, ExportScreenBody (estimate unchanged)                                         (T11)
modules/clipy-video/ios/OverlayLayout.swift, ExportSession.swift, ClipyVideoModule.swift (Records), Tests/                             (T12)
README.md, spec status                                                                                                               (T13)
```

---

### Task 1: Schema v2, migration, fonts registry, dependencies (TDD)

**Files:**
- Modify: `src/editor/model/types.ts`, `src/projects/storage.ts`, `app.json` (expo-font plugin fonts + expo-audio/document-picker plugins), `package.json`, `app/_layout.tsx` (load all fonts)
- Create: `src/editor/model/migrate.ts`, `src/editor/fonts.ts`, `assets/fonts/*.ttf`
- Test: `src/editor/model/__tests__/migrate.test.ts`, `src/editor/__tests__/fonts.test.ts`; update `src/projects/__tests__/storage.test.ts` (schemaVersion 2)

**Interfaces:**
- Produces:
  ```ts
  type FontId = "bangers"|"anton"|"oswald"|"montserrat"|"pacifico"|"permanentMarker"|"lobster"|"roboto";
  type Align = "left"|"center"|"right";
  interface TextOverlay { id; kind:"text"; text; fontId; fontScale; color; background:{color;opacity}|null; outline:boolean; align; x; y; scale; rotation; start; end }
  interface AudioTrack { id; sourceUri; title; sourceDuration; start; trimStart; trimEnd; volume }
  interface Clip { ...Phase1; volume: number; muted: boolean }
  interface Project { ...; overlays: TextOverlay[]; audioTracks: AudioTrack[]; schemaVersion: 2 }
  SCHEMA_VERSION = 2; OVERLAY_LIMITS = { fontScale:[0.02,0.25], scale:[0.2,5], minDuration:0.2 }; AUDIO_LIMITS = { minDuration:0.5, volume:[0,2] }; CLIP_VOLUME:[0,2]
  makeOverlay(partial & {id}): TextOverlay   // test/default factory
  makeAudioTrack(partial & {id; sourceDuration}): AudioTrack
  migrateProject(raw: unknown): Project      // throws readable errors
  FONTS: Record<FontId, { label; family; postScriptName; file }>; FONT_IDS: FontId[]; fontAssets: Record<string, number>  // for useFonts
  ```

- [ ] **Step 1: Install dependencies and copy fonts**

```powershell
npx expo install expo-audio expo-document-picker @react-native-community/slider @expo-google-fonts/anton @expo-google-fonts/oswald @expo-google-fonts/montserrat @expo-google-fonts/pacifico @expo-google-fonts/permanent-marker @expo-google-fonts/lobster @expo-google-fonts/roboto
New-Item -ItemType Directory -Force assets/fonts | Out-Null
Copy-Item node_modules/@expo-google-fonts/bangers/*400Regular*.ttf assets/fonts/Bangers-Regular.ttf
Copy-Item node_modules/@expo-google-fonts/anton/*400Regular*.ttf assets/fonts/Anton-Regular.ttf
Copy-Item node_modules/@expo-google-fonts/oswald/*400Regular*.ttf assets/fonts/Oswald-Regular.ttf
Copy-Item node_modules/@expo-google-fonts/montserrat/*400Regular*.ttf assets/fonts/Montserrat-Regular.ttf
Copy-Item node_modules/@expo-google-fonts/pacifico/*400Regular*.ttf assets/fonts/Pacifico-Regular.ttf
Copy-Item node_modules/@expo-google-fonts/permanent-marker/*400Regular*.ttf assets/fonts/PermanentMarker-Regular.ttf
Copy-Item node_modules/@expo-google-fonts/lobster/*400Regular*.ttf assets/fonts/Lobster-Regular.ttf
Copy-Item node_modules/@expo-google-fonts/roboto/*400Regular*.ttf assets/fonts/Roboto-Regular.ttf
```
(The `@expo-google-fonts/*` packages ship the TTFs; `Get-ChildItem node_modules/@expo-google-fonts/<pkg>` shows the exact filename if the glob matches more than one — pick the `400Regular`, non-italic file.) After copying, the `@expo-google-fonts/*` packages except `bangers` can stay as devDependencies-free direct deps or be removed with `npm uninstall` — remove them (the TTFs are now in `assets/fonts`) to keep the bundle small; keep `@expo-google-fonts/bangers` only if `app/_layout.tsx` still imports it (it won't after this task — remove it too).

`app.json` plugins: add `["expo-font", { "fonts": ["./assets/fonts/Bangers-Regular.ttf", "./assets/fonts/Anton-Regular.ttf", "./assets/fonts/Oswald-Regular.ttf", "./assets/fonts/Montserrat-Regular.ttf", "./assets/fonts/Pacifico-Regular.ttf", "./assets/fonts/PermanentMarker-Regular.ttf", "./assets/fonts/Lobster-Regular.ttf", "./assets/fonts/Roboto-Regular.ttf"] }]` (replace the bare `"expo-font"` entry), `["expo-audio", { "microphonePermission": false }]`, `"expo-document-picker"`. Run `npx expo-doctor`.

- [ ] **Step 2: Write the failing tests**

`src/editor/model/__tests__/migrate.test.ts`:
```ts
import { migrateProject } from "../migrate";
import { makeClip, makeProject, SCHEMA_VERSION } from "../types";

const v1 = {
  id: "p1", name: "Old", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  aspectRatio: "9:16", schemaVersion: 1,
  clips: [{ id: "a", sourceUri: "file:///m/a.mp4", sourceDuration: 4, width: 1080, height: 1920, trimStart: 0, trimEnd: 4, speed: 1, filter: null, volume: 1, transitionOut: { type: "none", duration: 0 } }],
};

test("v1 → v2 adds muted, empty overlays/audioTracks and bumps the version", () => {
  const p = migrateProject(v1);
  expect(p.schemaVersion).toBe(SCHEMA_VERSION);
  expect(p.clips[0]).toMatchObject({ muted: false, volume: 1 });
  expect(p.overlays).toEqual([]);
  expect(p.audioTracks).toEqual([]);
});

test("v2 passes through unchanged (idempotent)", () => {
  const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })] });
  expect(migrateProject(p)).toEqual(p);
});

test("rejects newer versions and malformed files with readable errors", () => {
  expect(() => migrateProject({ ...v1, schemaVersion: 3 })).toThrow(/newer version of Clipy/);
  expect(() => migrateProject({ schemaVersion: 1 })).toThrow(/missing required fields/);
  expect(() => migrateProject("nope")).toThrow(/missing required fields/);
});
```

`src/editor/__tests__/fonts.test.ts`:
```ts
import { existsSync } from "fs";
import { join } from "path";
import { FONT_IDS, FONTS, fontAssets } from "../fonts";

test("eight fonts, each with a label, family, PostScript name and a TTF on disk", () => {
  expect(FONT_IDS).toHaveLength(8);
  for (const id of FONT_IDS) {
    const f = FONTS[id];
    expect(f.label.length).toBeGreaterThan(0);
    expect(f.family.length).toBeGreaterThan(0);
    expect(f.postScriptName).toMatch(/^[A-Za-z]+-Regular$/);
    expect(existsSync(join(__dirname, "../../../assets/fonts", f.file))).toBe(true);
  }
  expect(Object.keys(fontAssets)).toEqual(FONT_IDS.map((id) => FONTS[id].family));
});
```

- [ ] **Step 3: Run — expect FAIL** (`npm test -- migrate fonts`).

- [ ] **Step 4: Update `src/editor/model/types.ts`**

Replace the file's `Clip`/`Project` and add the new types, keeping `ASPECT_RATIOS`, `AspectRatio`, `MIN_CLIP_SECONDS`, `aspectRatioValue`, `makeClip`, `makeProject`:
```ts
export const SCHEMA_VERSION = 2 as const;
export const FONT_IDS = ["bangers", "anton", "oswald", "montserrat", "pacifico", "permanentMarker", "lobster", "roboto"] as const;
export type FontId = (typeof FONT_IDS)[number];
export type Align = "left" | "center" | "right";
export const OVERLAY_LIMITS = { fontScale: [0.02, 0.25] as const, scale: [0.2, 5] as const, minDuration: 0.2 };
export const AUDIO_LIMITS = { minDuration: 0.5, volume: [0, 2] as const };
export const CLIP_VOLUME = [0, 2] as const;

export interface Clip {
  id: string; sourceUri: string; sourceDuration: number; width: number; height: number;
  trimStart: number; trimEnd: number;
  speed: 1; filter: null;
  volume: number;   // 0–2
  muted: boolean;
  transitionOut: { type: "none"; duration: 0 };
}

export interface TextOverlay {
  id: string; kind: "text"; text: string; fontId: FontId; fontScale: number; color: string;
  background: { color: string; opacity: number } | null; outline: boolean; align: Align;
  x: number; y: number; scale: number; rotation: number; start: number; end: number;
}

export interface AudioTrack {
  id: string; sourceUri: string; title: string; sourceDuration: number;
  start: number; trimStart: number; trimEnd: number; volume: number;
}

export interface Project {
  id: string; name: string; createdAt: string; updatedAt: string; aspectRatio: AspectRatio;
  clips: Clip[]; overlays: TextOverlay[]; audioTracks: AudioTrack[]; schemaVersion: typeof SCHEMA_VERSION;
}

export function makeClip(partial: Partial<Clip> & Pick<Clip, "id" | "sourceDuration">): Clip {
  return { sourceUri: `file:///media/${partial.id}.mp4`, width: 1080, height: 1920, trimStart: 0, trimEnd: partial.sourceDuration,
    speed: 1, filter: null, volume: 1, muted: false, transitionOut: { type: "none", duration: 0 }, ...partial };
}
export function makeOverlay(partial: Partial<TextOverlay> & Pick<TextOverlay, "id">): TextOverlay {
  return { kind: "text", text: "Your text", fontId: "bangers", fontScale: 0.07, color: "#F4F4F5", background: null, outline: true,
    align: "center", x: 0.5, y: 0.5, scale: 1, rotation: 0, start: 0, end: 3, ...partial };
}
export function makeAudioTrack(partial: Partial<AudioTrack> & Pick<AudioTrack, "id" | "sourceDuration">): AudioTrack {
  return { sourceUri: `file:///media/${partial.id}.m4a`, title: "Track", start: 0, trimStart: 0, trimEnd: partial.sourceDuration, volume: 1, ...partial };
}
export function makeProject(partial: Partial<Project> = {}): Project {
  return { id: "p1", name: "Project 1", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
    aspectRatio: "9:16", clips: [], overlays: [], audioTracks: [], schemaVersion: SCHEMA_VERSION, ...partial };
}
```
Grep the repo for `schemaVersion: 1` (storage.ts `createProject`, `duplicateProject` spread keeps it) and `volume: 1,` clip literals (storage.ts `createProject`) → add `muted: false` and use `SCHEMA_VERSION`.

- [ ] **Step 5: Create `src/editor/model/migrate.ts`**

```ts
import { SCHEMA_VERSION, type Clip, type Project } from "./types";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Upgrades any supported project file to the current schema. Throws readable errors for bad input. */
export function migrateProject(raw: unknown): Project {
  if (!isObj(raw) || typeof raw.id !== "string" || !Array.isArray(raw.clips)) throw new Error("Project file is missing required fields");
  const version = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;
  if (version > SCHEMA_VERSION) throw new Error("This project was made with a newer version of Clipy. Update the app to open it.");
  if (version < 1) throw new Error("Project file is missing required fields");
  if (version === SCHEMA_VERSION) return raw as unknown as Project;
  // v1 → v2: clips gain `muted`; overlay/audio arrays become real.
  const clips = (raw.clips as Clip[]).map((c) => ({ ...c, volume: typeof c.volume === "number" ? c.volume : 1, muted: false }));
  return { ...(raw as unknown as Project), clips, overlays: [], audioTracks: [], schemaVersion: SCHEMA_VERSION };
}
```
In `src/projects/storage.ts` replace `parse` with:
```ts
function parse(text: string): Project { return migrateProject(JSON.parse(text)); }
```
(import `migrateProject`). In `loadProject`, extend the missing check to audio: `for (const uri of new Set([...project.clips.map((c) => c.sourceUri), ...project.audioTracks.map((a) => a.sourceUri)]))`. Update `storage.test.ts`: `schemaVersion` expectation → `2`; the "wrong schemaVersion" test now writes `schemaVersion: 3` and expects `/newer version/`; add a test that a v1 file loads with `muted: false`.

- [ ] **Step 6: Create `src/editor/fonts.ts`**

```ts
import { FONT_IDS, type FontId } from "./model/types";

export { FONT_IDS };
export interface FontInfo { label: string; family: string; postScriptName: string; file: string }

export const FONTS: Record<FontId, FontInfo> = {
  bangers:         { label: "Bangers",          family: "Bangers_400Regular",         postScriptName: "Bangers-Regular",         file: "Bangers-Regular.ttf" },
  anton:           { label: "Anton",            family: "Anton_400Regular",           postScriptName: "Anton-Regular",           file: "Anton-Regular.ttf" },
  oswald:          { label: "Oswald",           family: "Oswald_400Regular",          postScriptName: "Oswald-Regular",          file: "Oswald-Regular.ttf" },
  montserrat:      { label: "Montserrat",       family: "Montserrat_400Regular",      postScriptName: "Montserrat-Regular",      file: "Montserrat-Regular.ttf" },
  pacifico:        { label: "Pacifico",         family: "Pacifico_400Regular",        postScriptName: "Pacifico-Regular",        file: "Pacifico-Regular.ttf" },
  permanentMarker: { label: "Marker",           family: "PermanentMarker_400Regular", postScriptName: "PermanentMarker-Regular", file: "PermanentMarker-Regular.ttf" },
  lobster:         { label: "Lobster",          family: "Lobster_400Regular",         postScriptName: "Lobster-Regular",         file: "Lobster-Regular.ttf" },
  roboto:          { label: "Roboto",           family: "Roboto_400Regular",          postScriptName: "Roboto-Regular",          file: "Roboto-Regular.ttf" },
};

/** `useFonts(fontAssets)` loads every font under its `family` key (Expo Go has no embedded fonts). */
export const fontAssets: Record<string, number> = {
  Bangers_400Regular: require("../../assets/fonts/Bangers-Regular.ttf"),
  Anton_400Regular: require("../../assets/fonts/Anton-Regular.ttf"),
  Oswald_400Regular: require("../../assets/fonts/Oswald-Regular.ttf"),
  Montserrat_400Regular: require("../../assets/fonts/Montserrat-Regular.ttf"),
  Pacifico_400Regular: require("../../assets/fonts/Pacifico-Regular.ttf"),
  PermanentMarker_400Regular: require("../../assets/fonts/PermanentMarker-Regular.ttf"),
  Lobster_400Regular: require("../../assets/fonts/Lobster-Regular.ttf"),
  Roboto_400Regular: require("../../assets/fonts/Roboto-Regular.ttf"),
};
```
`app/_layout.tsx`: replace the `@expo-google-fonts/bangers` import with `import { useFonts } from "expo-font"; import { fontAssets } from "@/src/editor/fonts";` and `const [loaded] = useFonts(fontAssets);`. `theme.fonts.heading` stays `"Bangers_400Regular"`. Jest: `jest.setup.ts` already mocks `expo-font`'s `useFonts`; `require(".ttf")` in Jest resolves through jest-expo's asset transform (returns a number) — if it errors, add `"\\.(ttf)$": "<rootDir>/jest.fileMock.js"` to `moduleNameMapper` with `module.exports = 1;`.

- [ ] **Step 7: Run — expect PASS**; `npm test` (all), `npm run typecheck`, `npx expo-doctor`.
- [ ] **Step 8: Commit** — `feat: schema v2 with migration, bundled fonts registry, audio deps`

---

### Task 2: Overlay, audio and volume ops (TDD)

**Files:**
- Modify: `src/editor/model/ops.ts`
- Test: `src/editor/model/__tests__/ops.overlays.test.ts`

**Interfaces:**
- Consumes: Task 1 types/limits, `totalDuration`, `newId`, `nowIso`, the existing `touch` helper.
- Produces (all return the same reference on no-op):
  `addTextOverlay(p, o: TextOverlay)`, `updateOverlay(p, id, patch: Partial<Omit<TextOverlay,"id"|"kind">>)`, `moveOverlay(p, id, newStart)`, `deleteOverlay(p, id)`, `duplicateOverlay(p, id)`, `setAudioTrack(p, track: AudioTrack)`, `updateAudioTrack(p, patch: Partial<Omit<AudioTrack,"id"|"sourceUri"|"sourceDuration">>)`, `removeAudioTrack(p)`, `setClipVolume(p, clipId, v)`, `setClipMuted(p, clipId, b)`, `defaultOverlayRange(p, playhead): { start, end }`.

- [ ] **Step 1: Write the failing tests**

`src/editor/model/__tests__/ops.overlays.test.ts`:
```ts
jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeAudioTrack, makeClip, makeOverlay, makeProject } from "../types";
import { addTextOverlay, defaultOverlayRange, deleteOverlay, duplicateOverlay, moveOverlay, removeAudioTrack, setAudioTrack, setClipMuted, setClipVolume, updateAudioTrack, updateOverlay } from "../ops";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [makeOverlay({ id: "o1", start: 1, end: 4 })] });

test("addTextOverlay appends; defaultOverlayRange clamps to the video", () => {
  expect(addTextOverlay(p, makeOverlay({ id: "o2" })).overlays.map((o) => o.id)).toEqual(["o1", "o2"]);
  expect(defaultOverlayRange(p, 2)).toEqual({ start: 2, end: 5 });
  expect(defaultOverlayRange(p, 9.9)).toEqual({ start: 7, end: 10 });
});

test("updateOverlay clamps and ignores no-ops/unknown ids", () => {
  const next = updateOverlay(p, "o1", { x: 1.4, y: -1, scale: 99, fontScale: 0.001, rotation: 370, text: "Hi" });
  expect(next.overlays[0]).toMatchObject({ x: 1, y: 0, scale: 5, fontScale: 0.02, rotation: 370, text: "Hi" });
  expect(updateOverlay(p, "o1", { text: "Your text" })).toBe(p);
  expect(updateOverlay(p, "zzz", { text: "x" })).toBe(p);
});

test("updateOverlay keeps end − start ≥ 0.2 and end ≤ totalDuration", () => {
  expect(updateOverlay(p, "o1", { end: 1.05 }).overlays[0]).toMatchObject({ start: 1, end: 1.2 });
  expect(updateOverlay(p, "o1", { end: 50 }).overlays[0].end).toBe(10);
  expect(updateOverlay(p, "o1", { start: 9.95, end: 10 }).overlays[0]).toMatchObject({ start: 9.8, end: 10 });
});

test("moveOverlay keeps duration and clamps; delete/duplicate", () => {
  expect(moveOverlay(p, "o1", 8).overlays[0]).toMatchObject({ start: 7, end: 10 });
  expect(moveOverlay(p, "o1", -5).overlays[0]).toMatchObject({ start: 0, end: 3 });
  expect(moveOverlay(p, "o1", 1)).toBe(p);
  expect(deleteOverlay(p, "o1").overlays).toEqual([]);
  const dup = duplicateOverlay(p, "o1");
  expect(dup.overlays.map((o) => o.id)).toEqual(["o1", "new-id"]);
  expect(dup.overlays[1]).toMatchObject({ start: 1, end: 4 });
  expect(dup.overlays[1].x).toBeCloseTo(0.53);
  expect(dup.overlays[1].y).toBeCloseTo(0.53);
});

test("audio track: set replaces, update clamps, remove clears", () => {
  const t = makeAudioTrack({ id: "m1", sourceDuration: 30 });
  const withTrack = setAudioTrack(p, t);
  expect(withTrack.audioTracks).toEqual([t]);
  expect(setAudioTrack(withTrack, makeAudioTrack({ id: "m2", sourceDuration: 5 })).audioTracks[0].id).toBe("m2");
  const upd = updateAudioTrack(withTrack, { trimStart: 29.8, trimEnd: 99, start: -2, volume: 9 });
  expect(upd.audioTracks[0]).toMatchObject({ trimStart: 29.5, trimEnd: 30, start: 0, volume: 2 });
  expect(updateAudioTrack(p, { volume: 1 })).toBe(p); // no track → no-op
  expect(removeAudioTrack(withTrack).audioTracks).toEqual([]);
  expect(removeAudioTrack(p)).toBe(p);
});

test("clip volume and mute", () => {
  expect(setClipVolume(p, "a", 3).clips[0].volume).toBe(2);
  expect(setClipVolume(p, "a", 1)).toBe(p);
  expect(setClipMuted(p, "a", true).clips[0].muted).toBe(true);
  expect(setClipMuted(p, "a", false)).toBe(p);
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Append to `src/editor/model/ops.ts`**

```ts
import { totalDuration } from "./timeline";
import { AUDIO_LIMITS, CLIP_VOLUME, OVERLAY_LIMITS, type AudioTrack, type TextOverlay } from "./types";

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.max(lo, Math.min(hi, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function defaultOverlayRange(p: Project, playhead: number): { start: number; end: number } {
  const total = totalDuration(p);
  let start = Math.max(0, Math.min(playhead, total));
  let end = Math.min(start + 3, total);
  if (end - start < OVERLAY_LIMITS.minDuration) { start = Math.max(0, total - 3); end = total; }
  return { start: r3(start), end: r3(end) };
}

export function addTextOverlay(p: Project, o: TextOverlay): Project {
  return touch(p, { overlays: [...p.overlays, o] });
}

function normaliseOverlay(p: Project, o: TextOverlay): TextOverlay {
  const total = totalDuration(p);
  let end = Math.min(o.end, total);
  let start = Math.max(0, Math.min(o.start, end));
  if (end - start < OVERLAY_LIMITS.minDuration) {
    if (start + OVERLAY_LIMITS.minDuration <= total) end = start + OVERLAY_LIMITS.minDuration;
    else { end = total; start = Math.max(0, total - OVERLAY_LIMITS.minDuration); }
  }
  return { ...o, x: clamp(o.x, [0, 1]), y: clamp(o.y, [0, 1]), scale: clamp(o.scale, OVERLAY_LIMITS.scale),
    fontScale: clamp(o.fontScale, OVERLAY_LIMITS.fontScale), start: r3(start), end: r3(end) };
}

export function updateOverlay(p: Project, id: string, patch: Partial<Omit<TextOverlay, "id" | "kind">>): Project {
  const i = p.overlays.findIndex((o) => o.id === id);
  if (i < 0) return p;
  const next = normaliseOverlay(p, { ...p.overlays[i], ...patch });
  if (JSON.stringify(next) === JSON.stringify(p.overlays[i])) return p;
  const overlays = p.overlays.slice(); overlays[i] = next;
  return touch(p, { overlays });
}

export function moveOverlay(p: Project, id: string, newStart: number): Project {
  const o = p.overlays.find((x) => x.id === id);
  if (!o) return p;
  const d = o.end - o.start;
  const start = Math.max(0, Math.min(newStart, totalDuration(p) - d));
  return updateOverlay(p, id, { start, end: start + d });
}

export function deleteOverlay(p: Project, id: string): Project {
  if (!p.overlays.some((o) => o.id === id)) return p;
  return touch(p, { overlays: p.overlays.filter((o) => o.id !== id) });
}

export function duplicateOverlay(p: Project, id: string): Project {
  const i = p.overlays.findIndex((o) => o.id === id);
  if (i < 0) return p;
  const src = p.overlays[i];
  const copy = normaliseOverlay(p, { ...src, id: newId(), x: src.x + 0.03, y: src.y + 0.03 });
  return touch(p, { overlays: [...p.overlays.slice(0, i + 1), copy, ...p.overlays.slice(i + 1)] });
}

export function setAudioTrack(p: Project, track: AudioTrack): Project {
  return touch(p, { audioTracks: [track] });
}

export function updateAudioTrack(p: Project, patch: Partial<Omit<AudioTrack, "id" | "sourceUri" | "sourceDuration">>): Project {
  const t = p.audioTracks[0];
  if (!t) return p;
  const merged = { ...t, ...patch };
  let trimEnd = Math.min(merged.trimEnd, t.sourceDuration);
  let trimStart = Math.max(0, Math.min(merged.trimStart, trimEnd));
  if (trimEnd - trimStart < AUDIO_LIMITS.minDuration) {
    if (trimStart + AUDIO_LIMITS.minDuration <= t.sourceDuration) trimEnd = trimStart + AUDIO_LIMITS.minDuration;
    else { trimEnd = t.sourceDuration; trimStart = Math.max(0, trimEnd - AUDIO_LIMITS.minDuration); }
  }
  const next: AudioTrack = { ...merged, trimStart: r3(trimStart), trimEnd: r3(trimEnd), start: r3(Math.max(0, merged.start)), volume: clamp(merged.volume, AUDIO_LIMITS.volume) };
  if (JSON.stringify(next) === JSON.stringify(t)) return p;
  return touch(p, { audioTracks: [next] });
}

export function removeAudioTrack(p: Project): Project {
  return p.audioTracks.length === 0 ? p : touch(p, { audioTracks: [] });
}

export function setClipVolume(p: Project, clipId: string, volume: number): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0) return p;
  const v = clamp(volume, CLIP_VOLUME);
  if (v === p.clips[i].volume) return p;
  const clips = p.clips.slice(); clips[i] = { ...clips[i], volume: v };
  return touch(p, { clips });
}

export function setClipMuted(p: Project, clipId: string, muted: boolean): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0 || p.clips[i].muted === muted) return p;
  const clips = p.clips.slice(); clips[i] = { ...clips[i], muted };
  return touch(p, { clips });
}
```
(Merge the imports with the existing ones at the top of `ops.ts`; `touch`, `newId`, `Project` are already there.)

- [ ] **Step 4: Run — expect PASS**; full `npm test`, typecheck.
- [ ] **Step 5: Commit** — `feat: add overlay, audio-track and clip-volume edit operations`

---

### Task 3: Shared layout formula and audio sync math (TDD)

**Files:**
- Create: `src/editor/model/overlayLayout.ts`, `src/editor/model/audioSync.ts`
- Test: `src/editor/model/__tests__/overlayLayout.test.ts`, `src/editor/model/__tests__/audioSync.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface OverlayLayout { centerX: number; centerY: number; fontSize: number; maxWidth: number; padding: number; outlineWidth: number; rotation: number; lineHeight: number }
  layoutOverlay(o: TextOverlay, frameW: number, frameH: number): OverlayLayout
  frameSize(ratio: AspectRatio, containerW: number, containerH: number): { w: number; h: number }  // aspect-fit box
  songTimeAt(t: AudioTrack, playhead: number): number | null
  isAudible(t: AudioTrack, playhead: number): boolean
  trackEnd(t: AudioTrack): number   // start + (trimEnd − trimStart)
  ```
  The Swift mirror (Task 12) reproduces `layoutOverlay` exactly; the pinned numbers below are its reference.

- [ ] **Step 1: Write the failing tests**

`src/editor/model/__tests__/overlayLayout.test.ts`:
```ts
import { makeOverlay } from "../types";
import { frameSize, layoutOverlay } from "../overlayLayout";

const o = makeOverlay({ id: "o", x: 0.25, y: 0.75, fontScale: 0.1, scale: 1.5, rotation: 30, background: { color: "#000000", opacity: 0.5 } });

test("layoutOverlay scales with the frame (pinned numbers — the Swift mirror must match)", () => {
  expect(layoutOverlay(o, 300, 533)).toEqual({ centerX: 75, centerY: 399.75, fontSize: 79.95, maxWidth: 270, padding: 19.9875, outlineWidth: 2, rotation: 30, lineHeight: 95.94 });
  expect(layoutOverlay(o, 1080, 1920)).toEqual({ centerX: 270, centerY: 1440, fontSize: 288, maxWidth: 972, padding: 72, outlineWidth: 2, rotation: 30, lineHeight: 345.6 });
  expect(layoutOverlay({ ...o, background: null }, 1080, 1080).padding).toBe(0);
});

test("frameSize aspect-fits the ratio into a container", () => {
  expect(frameSize("9:16", 400, 400)).toEqual({ w: 225, h: 400 });
  expect(frameSize("16:9", 400, 400)).toEqual({ w: 400, h: 225 });
  expect(frameSize("1:1", 300, 500)).toEqual({ w: 300, h: 300 });
});
```

`src/editor/model/__tests__/audioSync.test.ts`:
```ts
import { makeAudioTrack } from "../types";
import { isAudible, songTimeAt, trackEnd } from "../audioSync";

const t = makeAudioTrack({ id: "m", sourceDuration: 60, start: 2, trimStart: 10, trimEnd: 15 }); // plays 2 → 7

test("maps the playhead into the song", () => {
  expect(trackEnd(t)).toBe(7);
  expect(songTimeAt(t, 1.9)).toBeNull();
  expect(songTimeAt(t, 2)).toBe(10);
  expect(songTimeAt(t, 4.5)).toBe(12.5);
  expect(songTimeAt(t, 7)).toBeNull();
  expect(isAudible(t, 3)).toBe(true);
  expect(isAudible(t, 8)).toBe(false);
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

`src/editor/model/overlayLayout.ts`:
```ts
import { aspectRatioValue, type AspectRatio, type TextOverlay } from "./types";

export interface OverlayLayout { centerX: number; centerY: number; fontSize: number; maxWidth: number; padding: number; outlineWidth: number; rotation: number; lineHeight: number }

export const OUTLINE_PX = 2;
export const LINE_HEIGHT_FACTOR = 1.2;
export const BACKGROUND_PAD_FACTOR = 0.25;
export const MAX_WIDTH_FACTOR = 0.9;

const r = (v: number) => Math.round(v * 10000) / 10000;

/**
 * The single source of truth for where text sits in a frame. Mirrored in modules/clipy-video/ios/OverlayLayout.swift.
 * All inputs are resolution-independent; outputs are pixels for the given frame.
 */
export function layoutOverlay(o: TextOverlay, frameW: number, frameH: number): OverlayLayout {
  const fontSize = r(o.fontScale * o.scale * frameH);
  return {
    centerX: r(o.x * frameW), centerY: r(o.y * frameH), fontSize,
    maxWidth: r(MAX_WIDTH_FACTOR * frameW),
    padding: o.background ? r(BACKGROUND_PAD_FACTOR * fontSize) : 0,
    outlineWidth: OUTLINE_PX, rotation: o.rotation, lineHeight: r(LINE_HEIGHT_FACTOR * fontSize),
  };
}

/** Largest w×h box with the ratio that fits inside the container. */
export function frameSize(ratio: AspectRatio, containerW: number, containerH: number): { w: number; h: number } {
  const ar = aspectRatioValue(ratio);
  if (containerW / containerH > ar) return { w: r(containerH * ar), h: containerH };
  return { w: containerW, h: r(containerW / ar) };
}
```

`src/editor/model/audioSync.ts`:
```ts
import type { AudioTrack } from "./types";

export const trackEnd = (t: AudioTrack): number => t.start + (t.trimEnd - t.trimStart);
/** Seconds into the source file that should be playing at `playhead`, or null when the track is silent there. */
export function songTimeAt(t: AudioTrack, playhead: number): number | null {
  if (playhead < t.start || playhead >= trackEnd(t)) return null;
  return t.trimStart + (playhead - t.start);
}
export const isAudible = (t: AudioTrack, playhead: number): boolean => songTimeAt(t, playhead) !== null;
```

- [ ] **Step 4: Run — expect PASS** (if a pinned number differs by rounding, fix the rounding helper, not the expectation — the expectations are the contract); typecheck.
- [ ] **Step 5: Commit** — `feat: add shared overlay layout formula and audio sync math`

---

### Task 4: Store — overlay selection (TDD)

**Files:**
- Modify: `src/editor/store.ts`
- Test: `src/editor/__tests__/store.overlays.test.ts`

**Interfaces:**
- Produces: state `selectedOverlayId: string | null`; action `selectOverlay(id | null)`. Rules: `select(clipId)` with a non-null id clears `selectedOverlayId`; `selectOverlay(id)` with a non-null id clears `selectedClipId`; `afterChange` drops a selected overlay that no longer exists; `setProject`/`reset` clear both.

- [ ] **Step 1: Write the failing test**

`src/editor/__tests__/store.overlays.test.ts`:
```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { deleteOverlay } from "@/src/editor/model/ops";
import { makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "../store";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 5 })], overlays: [makeOverlay({ id: "o1", start: 0, end: 2 })] });
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(p); });

test("clip and overlay selection are mutually exclusive", () => {
  const s = useEditorStore.getState();
  s.select("a");
  s.selectOverlay("o1");
  expect(useEditorStore.getState()).toMatchObject({ selectedClipId: null, selectedOverlayId: "o1" });
  s.select("a");
  expect(useEditorStore.getState()).toMatchObject({ selectedClipId: "a", selectedOverlayId: null });
  s.select(null);
  expect(useEditorStore.getState().selectedOverlayId).toBeNull();
});

test("deleting the selected overlay clears the selection", () => {
  const s = useEditorStore.getState();
  s.selectOverlay("o1");
  s.apply((x) => deleteOverlay(x, "o1"));
  expect(useEditorStore.getState().selectedOverlayId).toBeNull();
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** in `src/editor/store.ts`: add `selectedOverlayId: string | null;` and `selectOverlay: (id: string | null) => void;` to the interface; `selectedOverlayId: null` to `initial`; in `afterChange` add `const selectedOverlay = s.selectedOverlayId && next.overlays.some((o) => o.id === s.selectedOverlayId) ? s.selectedOverlayId : null;` and return it as `selectedOverlayId`; change `select` to `(id) => set(id ? { selectedClipId: id, selectedOverlayId: null } : { selectedClipId: null })`; add `selectOverlay: (id) => set(id ? { selectedOverlayId: id, selectedClipId: null } : { selectedOverlayId: null })`.

- [ ] **Step 4: Run — expect PASS**; full suite; typecheck.
- [ ] **Step 5: Commit** — `feat: add overlay selection to the editor store`

---

### Task 5: Overlays on the preview — rendering, selection frame, gestures; clip volume/mute on the player

**Files:**
- Create: `src/editor/components/OverlayLayer.tsx`, `src/editor/components/SelectionFrame.tsx`, `src/editor/components/OverlayText.tsx`
- Modify: `src/editor/components/PreviewPlayer.tsx`
- Test: `src/editor/__tests__/OverlayLayer.test.tsx`

**Interfaces:**
- Consumes: `layoutOverlay`, `frameSize`, `FONTS`, store (`project`, `playhead`, `selectedOverlayId`, `selectOverlay`, `beginTransaction`, `applyTransient`), `updateOverlay`.
- Produces: `<OverlayText overlay frameW frameH />` (pure render of one overlay at the layout position), `<OverlayLayer frameW frameH onOpenPanel(id) />` (renders visible overlays, selection frame + gestures), and `PreviewPlayer` measuring its frame via `onLayout` and passing `frameW/frameH`; the player's `volume`/`muted` follow the clip under the playhead. `PreviewPlayer` accepts `onOpenTextPanel?: (overlayId: string) => void` (Task 7 wires it).

- [ ] **Step 1: Write the failing test**

`src/editor/__tests__/OverlayLayer.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { OverlayLayer } from "../components/OverlayLayer";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [
  makeOverlay({ id: "o1", text: "Early", start: 0, end: 2, x: 0.5, y: 0.25, fontScale: 0.1 }),
  makeOverlay({ id: "o2", text: "Late", start: 5, end: 8 }),
] });
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(p); });

test("renders only overlays whose time range contains the playhead, at the layout position", async () => {
  useEditorStore.getState().seek(1);
  await render(<OverlayLayer frameW={200} frameH={400} onOpenPanel={() => {}} />);
  expect(screen.getByText("Early")).toBeTruthy();
  expect(screen.queryByText("Late")).toBeNull();
  const box = screen.getByTestId("overlay-o1");
  expect(box).toHaveStyle({ left: 100, top: 100 });
  expect(screen.getByText("Early")).toHaveStyle({ fontSize: 40, fontFamily: "Bangers_400Regular" });
});

test("shows the selection frame only for the selected overlay", async () => {
  useEditorStore.getState().seek(1);
  useEditorStore.getState().selectOverlay("o1");
  await render(<OverlayLayer frameW={200} frameH={400} onOpenPanel={() => {}} />);
  expect(screen.getByTestId("selection-frame-o1")).toBeTruthy();
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `OverlayText.tsx`** (pure; used by the layer and, later, nowhere else)

```tsx
import { Text, View } from "react-native";
import { FONTS } from "@/src/editor/fonts";
import { layoutOverlay } from "@/src/editor/model/overlayLayout";
import type { TextOverlay } from "@/src/editor/model/types";

type Props = { overlay: TextOverlay; frameW: number; frameH: number; children?: React.ReactNode };

/** One overlay positioned by the shared layout formula. The wrapper is centred on (centerX, centerY) and rotated. */
export function OverlayText({ overlay: o, frameW, frameH, children }: Props) {
  const l = layoutOverlay(o, frameW, frameH);
  const bg = o.background ? { backgroundColor: o.background.color, opacity: 1 } : null;
  const outline = o.outline ? { textShadowColor: contrastFor(o.color), textShadowRadius: l.outlineWidth, textShadowOffset: { width: 0, height: 0 } } : null;
  return (
    <View testID={`overlay-${o.id}`} pointerEvents="box-none"
      style={{ position: "absolute", left: l.centerX, top: l.centerY, width: 0, height: 0, alignItems: "center", justifyContent: "center", transform: [{ rotate: `${l.rotation}deg` }] }}>
      <View style={{ position: "absolute", maxWidth: l.maxWidth, padding: l.padding, borderRadius: l.padding / 2, ...(bg ?? {}) }}>
        {o.background && <View pointerEvents="none" style={{ position: "absolute", inset: 0, backgroundColor: o.background.color, opacity: o.background.opacity, borderRadius: l.padding / 2 }} />}
        <Text style={{ fontFamily: FONTS[o.fontId].family, fontSize: l.fontSize, lineHeight: l.lineHeight, color: o.color, textAlign: o.align, ...(outline ?? {}) }}>{o.text}</Text>
        {children}
      </View>
    </View>
  );
}

/** Black outline for light text, white for dark. */
export function contrastFor(hex: string): string {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "#000000" : "#FFFFFF";
}
```
Note: the `bg` object above should NOT set `backgroundColor` (the inner translucent view does); remove `backgroundColor` from `bg` and keep only the absolutely positioned background view — i.e. `const bg = null` is fine; the code is shown with the explicit background view so opacity applies to the box only, not the text.

- [ ] **Step 4: Implement `SelectionFrame.tsx`** (gestures on the selected overlay)

```tsx
import { useMemo, useRef } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { updateOverlay } from "@/src/editor/model/ops";
import type { TextOverlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";

type Props = { overlay: TextOverlay; frameW: number; frameH: number; onDoubleTap: () => void };

const snapAngle = (deg: number) => { const m = ((deg % 360) + 360) % 360; for (const s of [0, 90, 180, 270, 360]) if (Math.abs(m - s) <= 3) return s % 360; return deg; };

/** Dashed frame with corner dots; pan = move, pinch = scale, rotate = rotation, double-tap = edit. One undo step per gesture. */
export function SelectionFrame({ overlay, frameW, frameH, onDoubleTap }: Props) {
  const startRef = useRef({ x: overlay.x, y: overlay.y, scale: overlay.scale, rotation: overlay.rotation });
  const store = useEditorStore.getState();
  const id = overlay.id;
  const snapshot = () => { const o = useEditorStore.getState().project?.overlays.find((v) => v.id === id); if (o) startRef.current = { x: o.x, y: o.y, scale: o.scale, rotation: o.rotation }; store.beginTransaction(); };

  const gesture = useMemo(() => {
    const pan = Gesture.Pan().minDistance(2).onStart(snapshot)
      .onUpdate((e) => store.applyTransient((p) => updateOverlay(p, id, { x: startRef.current.x + e.translationX / frameW, y: startRef.current.y + e.translationY / frameH })))
      .runOnJS(true);
    const pinch = Gesture.Pinch().onStart(snapshot)
      .onUpdate((e) => store.applyTransient((p) => updateOverlay(p, id, { scale: startRef.current.scale * e.scale })))
      .runOnJS(true);
    const rotate = Gesture.Rotation().onStart(snapshot)
      .onUpdate((e) => store.applyTransient((p) => updateOverlay(p, id, { rotation: snapAngle(startRef.current.rotation + (e.rotation * 180) / Math.PI) })))
      .runOnJS(true);
    const dbl = Gesture.Tap().numberOfTaps(2).onEnd(() => onDoubleTap()).runOnJS(true);
    return Gesture.Race(dbl, Gesture.Simultaneous(pan, pinch, rotate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, frameW, frameH]);

  return (
    <GestureDetector gesture={gesture}>
      <View testID={`selection-frame-${id}`} style={{ position: "absolute", inset: -8, borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.colors.highlight, borderRadius: 6 }}>
        {[["left", "top"], ["right", "top"], ["left", "bottom"], ["right", "bottom"]].map(([h, v]) => (
          <View key={`${h}${v}`} style={{ position: "absolute", [h]: -5, [v]: -5, width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.highlight }} />
        ))}
      </View>
    </GestureDetector>
  );
}
```
Add `Rotation`, `Tap`, `Race`, `Simultaneous`, `numberOfTaps`, `minDistance` to the gesture-handler mock chain in `jest.setup.ts` if missing (`Gesture.Rotation: () => chain(), Gesture.Tap: () => chain(), Gesture.Race: () => chain(), Gesture.Simultaneous: () => chain()`).

- [ ] **Step 5: Implement `OverlayLayer.tsx`**

```tsx
import { Pressable, View } from "react-native";
import { useEditorStore } from "@/src/editor/store";
import { OverlayText } from "./OverlayText";
import { SelectionFrame } from "./SelectionFrame";

type Props = { frameW: number; frameH: number; onOpenPanel: (overlayId: string) => void };

/** Overlays visible at the playhead, drawn over the video inside the aspect frame. Tap an overlay to select it; tap elsewhere to deselect. */
export function OverlayLayer({ frameW, frameH, onOpenPanel }: Props) {
  const overlays = useEditorStore((s) => s.project?.overlays ?? []);
  const playhead = useEditorStore((s) => s.playhead);
  const selectedId = useEditorStore((s) => s.selectedOverlayId);
  const { selectOverlay } = useEditorStore.getState();
  const visible = overlays.filter((o) => playhead >= o.start && playhead < o.end);
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, top: 0, width: frameW, height: frameH }}>
      {visible.map((o) => (
        <OverlayText key={o.id} overlay={o} frameW={frameW} frameH={frameH}>
          <Pressable style={{ position: "absolute", inset: 0 }} onPress={() => selectOverlay(o.id)} accessibilityLabel={`Overlay ${o.text}`} />
          {o.id === selectedId && <SelectionFrame overlay={o} frameW={frameW} frameH={frameH} onDoubleTap={() => onOpenPanel(o.id)} />}
        </OverlayText>
      ))}
    </View>
  );
}
```

- [ ] **Step 6: Wire into `PreviewPlayer.tsx`**
- Add prop `onOpenTextPanel?: (overlayId: string) => void`.
- Measure the aspect frame: give the `Pressable` an `onLayout={(e) => setFrame({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}` with `const [frame, setFrame] = useState({ w: 0, h: 0 })`; render `{frame.w > 0 && <OverlayLayer frameW={frame.w} frameH={frame.h} onOpenPanel={(id) => onOpenTextPanel?.(id)} />}` after the `VideoView` (before the play icon).
- The `Pressable`'s `onPress` now also `selectOverlay(null)` when an overlay is selected (tap outside deselects instead of toggling play): `if (useEditorStore.getState().selectedOverlayId) { selectOverlay(null); return; }`.
- Clip volume/mute: in the first effect, after computing `hit`, set `player.volume = hit.clip.muted ? 0 : Math.min(1, hit.clip.volume); player.muted = hit.clip.muted;` (expo-video caps volume at 1; values above 1 are only honoured in the export — note this in a comment). Add `hit?.clip.volume, hit?.clip.muted` to the deps.

- [ ] **Step 7: Run — expect PASS**; full suite; typecheck. Device: add a temporary overlay? Not yet possible (Task 7 adds the Text tool) — defer the device check to Task 7.
- [ ] **Step 8: Commit** — `feat: render text overlays on the preview with move/scale/rotate gestures`

---

### Task 6: Timeline lanes — overlay pills and the music bar

**Files:**
- Modify: `src/editor/timelineLayout.ts`, `src/editor/components/Timeline.tsx`
- Create: `src/editor/components/OverlayLane.tsx`, `src/editor/components/OverlayPill.tsx`, `src/editor/components/MusicLane.tsx`, `src/editor/components/MusicBar.tsx`
- Test: `src/editor/__tests__/timelineLanes.test.tsx`, update `src/editor/__tests__/timelineLayout.test.ts`

**Interfaces:**
- Consumes: store (`project`, `pixelsPerSecond`, `selectedOverlayId`, `selectOverlay`, transactions), ops `moveOverlay`, `updateOverlay`, `updateAudioTrack`, `timeToX/xToTime`, `trackEnd`.
- Produces: `LANE_HEIGHT = 28`, `LANE_GAP = 4`, `TIMELINE_HEIGHT = 120 + 2 * (LANE_HEIGHT + LANE_GAP)` (=184), `laneTop(index: 0|1)` (y offset of each lane inside the timeline), `<OverlayLane/>`, `<OverlayPill overlay/>`, `<MusicLane/>`, `<MusicBar track missing/>`. `Timeline` renders the clip strip at the top and the two lanes below it inside the same `ScrollView` content (so they share scrolling).

- [ ] **Step 1: Write the failing tests**

Append to `src/editor/__tests__/timelineLayout.test.ts`:
```ts
import { LANE_GAP, LANE_HEIGHT, laneTop, TIMELINE_HEIGHT } from "../timelineLayout";
test("lanes sit under the clip strip", () => {
  expect(TIMELINE_HEIGHT).toBe(120 + 2 * (LANE_HEIGHT + LANE_GAP));
  expect(laneTop(0)).toBe(120);
  expect(laneTop(1)).toBe(120 + LANE_HEIGHT + LANE_GAP);
});
```

`src/editor/__tests__/timelineLanes.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeAudioTrack, makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { MusicLane } from "../components/MusicLane";
import { OverlayLane } from "../components/OverlayLane";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })],
  overlays: [makeOverlay({ id: "o1", text: "Hello", start: 2, end: 5 })],
  audioTracks: [makeAudioTrack({ id: "m", title: "Song", sourceDuration: 30, start: 1, trimStart: 0, trimEnd: 4 })] });
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(p); useEditorStore.getState().setZoom(50); });

test("overlay pill is placed by time and selects on press", async () => {
  await render(<OverlayLane />);
  const pill = screen.getByTestId("overlay-pill-o1");
  expect(pill).toHaveStyle({ left: 100, width: 150 });
  expect(screen.getByText("Hello")).toBeTruthy();
  await fireEvent.press(pill);
  expect(useEditorStore.getState().selectedOverlayId).toBe("o1");
});

test("music bar is placed by start and trimmed length", async () => {
  await render(<MusicLane />);
  expect(screen.getByTestId("music-bar")).toHaveStyle({ left: 50, width: 200 });
  expect(screen.getByText("Song")).toBeTruthy();
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Update `src/editor/timelineLayout.ts`**

Replace `export const TIMELINE_HEIGHT = 120;` with:
```ts
export const CLIP_AREA_HEIGHT = 120;
export const LANE_HEIGHT = 28;
export const LANE_GAP = 4;
export const TIMELINE_HEIGHT = CLIP_AREA_HEIGHT + 2 * (LANE_HEIGHT + LANE_GAP);
export const laneTop = (index: 0 | 1): number => CLIP_AREA_HEIGHT + index * (LANE_HEIGHT + LANE_GAP);
```
In `Timeline.tsx`, the playhead line's `top` currently uses `(TIMELINE_HEIGHT - STRIP_HEIGHT) / 2 - 8` — change it to span the whole height: `top: 8, height: TIMELINE_HEIGHT - 16`. The clip strip row should stay vertically centred within the top `CLIP_AREA_HEIGHT` (wrap the strips in a `View` of height `CLIP_AREA_HEIGHT` with `justifyContent: "center"`), and the content container becomes a column: `contentContainerStyle={{ paddingHorizontal: pad, height: TIMELINE_HEIGHT }}` containing `<View style={{ height: CLIP_AREA_HEIGHT, flexDirection: "row", alignItems: "center" }}>{strips}</View>`, then `<OverlayLane />`, then `<MusicLane />`. Both lanes are `position: "relative"`, `height: LANE_HEIGHT`, `marginTop: LANE_GAP`, with their children absolutely positioned by `timeToX`.

- [ ] **Step 4: Implement `OverlayPill.tsx`** (drag to move, end handles to trim; one undo step per gesture)

```tsx
import { useMemo, useRef } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { moveOverlay, updateOverlay } from "@/src/editor/model/ops";
import { timeToX, xToTime } from "@/src/editor/model/timeline";
import type { TextOverlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { LANE_HEIGHT } from "../timelineLayout";

const HANDLE_W = 12;

export function OverlayPill({ overlay: o, selected }: { overlay: TextOverlay; selected: boolean }) {
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  const store = useEditorStore.getState();
  const startRef = useRef({ start: o.start, end: o.end });
  const snap = () => { const cur = useEditorStore.getState().project?.overlays.find((v) => v.id === o.id); if (cur) startRef.current = { start: cur.start, end: cur.end }; store.beginTransaction(); };

  const gestures = useMemo(() => {
    const move = Gesture.Pan().activateAfterLongPress(150).onStart(snap)
      .onUpdate((e) => store.applyTransient((p) => moveOverlay(p, o.id, startRef.current.start + xToTime(e.translationX, pps)))).runOnJS(true);
    const left = Gesture.Pan().activeOffsetX([-3, 3]).onStart(snap)
      .onUpdate((e) => store.applyTransient((p) => updateOverlay(p, o.id, { start: startRef.current.start + xToTime(e.translationX, pps) }))).runOnJS(true);
    const right = Gesture.Pan().activeOffsetX([-3, 3]).onStart(snap)
      .onUpdate((e) => store.applyTransient((p) => updateOverlay(p, o.id, { end: startRef.current.end + xToTime(e.translationX, pps) }))).runOnJS(true);
    return { move, left, right };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.id, pps]);

  const leftPx = timeToX(o.start, pps), width = Math.max(HANDLE_W * 2 + 4, timeToX(o.end - o.start, pps));
  return (
    <GestureDetector gesture={gestures.move}>
      <View testID={`overlay-pill-${o.id}`} accessibilityLabel={`Text ${o.text}`}
        style={{ position: "absolute", left: leftPx, width, height: LANE_HEIGHT, borderRadius: 8, backgroundColor: theme.colors.surfaceAlt,
          borderWidth: 2, borderColor: selected ? theme.colors.highlight : theme.colors.straw, justifyContent: "center", paddingHorizontal: HANDLE_W + 2 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 12 }}>{o.text}</Text>
        {selected && (
          <>
            <GestureDetector gesture={gestures.left}><View accessibilityLabel="Text start handle" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: HANDLE_W, backgroundColor: theme.colors.highlight, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }} /></GestureDetector>
            <GestureDetector gesture={gestures.right}><View accessibilityLabel="Text end handle" style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: HANDLE_W, backgroundColor: theme.colors.highlight, borderTopRightRadius: 6, borderBottomRightRadius: 6 }} /></GestureDetector>
          </>
        )}
      </View>
    </GestureDetector>
  );
}
```

`OverlayLane.tsx`:
```tsx
import { Pressable, View } from "react-native";
import { useEditorStore } from "@/src/editor/store";
import { LANE_GAP, LANE_HEIGHT } from "../timelineLayout";
import { OverlayPill } from "./OverlayPill";

export function OverlayLane() {
  const overlays = useEditorStore((s) => s.project?.overlays ?? []);
  const selectedId = useEditorStore((s) => s.selectedOverlayId);
  const { selectOverlay } = useEditorStore.getState();
  return (
    <View style={{ height: LANE_HEIGHT, marginTop: LANE_GAP }}>
      {overlays.map((o) => (
        <Pressable key={o.id} onPress={() => selectOverlay(o.id)} style={{ position: "absolute", left: 0, top: 0 }} accessibilityLabel={`Select text ${o.text}`}>
          <OverlayPill overlay={o} selected={o.id === selectedId} />
        </Pressable>
      ))}
    </View>
  );
}
```
If wrapping the pill in a `Pressable` fights the pan gesture on device, move `onPress` into a `Gesture.Tap()` composed with `Gesture.Exclusive(tap, move)` inside the pill instead; keep the test's `fireEvent.press(pill)` working by giving the pill `onPress` via `Pressable` as the outer element. The test presses `overlay-pill-o1`, so the `testID` must be on the element that receives the press — put `testID` and `onPress` on the same `Pressable` (make the pill's root a `Pressable` and pass `onPress` into `OverlayPill` as a prop).

- [ ] **Step 5: Implement `MusicBar.tsx` and `MusicLane.tsx`** — same structure as the pill: root `Pressable` with `testID="music-bar"`, `left = timeToX(track.start)`, `width = timeToX(trimEnd − trimStart)`, `sea` background, speaker `Ionicons name="volume-medium"` + `${Math.round(volume*100)}%` + title; long-press-pan moves `start` (`updateAudioTrack({ start })`), end handles adjust `trimStart`/`trimEnd` (`updateAudioTrack`), `missing` → `danger` warning badge (missing = `missingSourceUris.includes(track.sourceUri)`). Pressing the bar sets a store flag? No — Task 8's Music sheet opens from the toolbar; the bar press just `selectOverlay(null)` and `select(null)` (nothing else). `MusicLane` renders the bar when `project.audioTracks[0]` exists, else nothing (height still reserved).

- [ ] **Step 6: Wire lanes into `Timeline.tsx`** as described in Step 3; the `renderStripExtras` behavior is unchanged.

- [ ] **Step 7: Run — expect PASS**; full suite; typecheck. Device: the timeline is taller with two empty lanes; clips still scrub/zoom/select as before.
- [ ] **Step 8: Commit** — `feat: add text and music lanes to the timeline`

---

### Task 7: Text tool — toolbar button, TextPanel with full styling and fine-tune

**Files:**
- Create: `src/editor/components/FontStrip.tsx`, `src/editor/components/ColorRow.tsx`, `src/editor/components/TextPanel.tsx`
- Modify: `src/editor/components/EditorToolbar.tsx`, `app/editor/[id]/index.tsx` (pass `onOpenTextPanel`), `src/ui/Sheet.tsx` (optional `height` prop)
- Test: `src/editor/__tests__/TextPanel.test.tsx`, update `src/editor/__tests__/EditorToolbar.test.tsx`

**Interfaces:**
- Consumes: ops (`addTextOverlay`, `updateOverlay`, `deleteOverlay`, `duplicateOverlay`, `defaultOverlayRange`), `FONTS`, `OVERLAY_LIMITS`, `Sheet`, `Chip`, `@react-native-community/slider`, `newId`.
- Produces: `<TextPanel overlayId visible onClose />`; toolbar **Text** button (enabled when the project has ≥ 1 clip) creates an overlay via `addTextOverlay(p, { ...makeOverlay-like defaults, id: newId(), ...defaultOverlayRange(p, playhead) })`, selects it and opens the panel; `EditorToolbar` accepts `openTextPanelFor: string | null` + `onTextPanelClosed` so the preview's double-tap can open it (wired through `app/editor/[id]/index.tsx` state).

- [ ] **Step 1: Write the failing tests**

`src/editor/__tests__/TextPanel.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: () => "dup" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, onValueChange }: { testID?: string; onValueChange?: (v: number) => void }) => <View testID={testID} onTouchEnd={() => onValueChange?.(0.12)} />; });
import { makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { TextPanel } from "../components/TextPanel";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [makeOverlay({ id: "o1", text: "Hi", start: 1, end: 4 })] });
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(p); useEditorStore.getState().selectOverlay("o1"); });
const ov = () => useEditorStore.getState().project!.overlays.find((o) => o.id === "o1")!;

test("edits text, font, color, alignment, outline, background through the store", async () => {
  await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
  await fireEvent.changeText(screen.getByLabelText("Overlay text"), "Hello world");
  expect(ov().text).toBe("Hello world");
  await fireEvent.press(screen.getByRole("button", { name: "Anton" }));
  expect(ov().fontId).toBe("anton");
  await fireEvent.press(screen.getByLabelText("Color #F5C542"));
  expect(ov().color).toBe("#F5C542");
  await fireEvent.press(screen.getByRole("button", { name: "Align left" }));
  expect(ov().align).toBe("left");
  await fireEvent(screen.getByLabelText("Outline"), "valueChange", false);
  expect(ov().outline).toBe(false);
  await fireEvent(screen.getByLabelText("Background"), "valueChange", true);
  expect(ov().background).toEqual({ color: "#000000", opacity: 0.6 });
});

test("fine-tune fields and duplicate/delete", async () => {
  await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByText("Fine-tune"));
  await fireEvent.changeText(screen.getByLabelText("X %"), "25");
  await fireEvent(screen.getByLabelText("X %"), "blur");
  expect(ov().x).toBe(0.25);
  await fireEvent.changeText(screen.getByLabelText("Start s"), "2");
  await fireEvent(screen.getByLabelText("Start s"), "blur");
  expect(ov().start).toBe(2);
  await fireEvent.press(screen.getByRole("button", { name: "Duplicate" }));
  expect(useEditorStore.getState().project!.overlays).toHaveLength(2);
  expect(useEditorStore.getState().selectedOverlayId).toBe("dup");
});

test("Done is disabled while the text is empty", async () => {
  await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
  await fireEvent.changeText(screen.getByLabelText("Overlay text"), "");
  expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
});
```

Update `EditorToolbar.test.tsx`: add a test that `Text` is enabled with clips and disabled for an empty project, and that pressing it adds an overlay and selects it:
```tsx
test("Text adds an overlay at the playhead and selects it", async () => {
  await render(<EditorToolbar />);
  useEditorStore.getState().seek(2);
  await fireEvent.press(screen.getByRole("button", { name: "Text" }));
  const ovs = useEditorStore.getState().project!.overlays;
  expect(ovs).toHaveLength(1);
  expect(ovs[0]).toMatchObject({ start: 2, end: 5, text: "Your text" });
  expect(useEditorStore.getState().selectedOverlayId).toBe(ovs[0].id);
});
```
(the toolbar test file mocks `newId` → "dup"; that's fine for one overlay.)

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `FontStrip.tsx`**
```tsx
import { ScrollView, Text, Pressable } from "react-native";
import { FONT_IDS, FONTS } from "@/src/editor/fonts";
import type { FontId } from "@/src/editor/model/types";
import { theme } from "@/src/theme/theme";

export function FontStrip({ value, onChange }: { value: FontId; onChange: (f: FontId) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm }}>
      {FONT_IDS.map((id) => (
        <Pressable key={id} accessibilityRole="button" accessibilityLabel={FONTS[id].label} accessibilityState={{ selected: id === value }} onPress={() => onChange(id)}
          style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radius.chip, backgroundColor: id === value ? theme.colors.accent : theme.colors.surfaceAlt, borderWidth: 1, borderColor: id === value ? theme.colors.accent : theme.colors.straw }}>
          <Text style={{ fontFamily: FONTS[id].family, fontSize: 18, color: theme.colors.text }}>{FONTS[id].label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
```

`ColorRow.tsx`:
```tsx
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { theme } from "@/src/theme/theme";

export const PALETTE = [theme.colors.text, theme.colors.highlight, theme.colors.accent, theme.colors.sea, theme.colors.straw, "#000000", "#FFFFFF", "#00E5A0"] as const;
const isHex = (s: string) => /^#[0-9A-Fa-f]{6}$/.test(s);

export function ColorRow({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [custom, setCustom] = useState(value);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.sm, flexWrap: "wrap" }}>
      {PALETTE.map((c) => (
        <Pressable key={c} accessibilityLabel={`Color ${c}`} onPress={() => onChange(c)}
          style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: 2, borderColor: value.toUpperCase() === c.toUpperCase() ? theme.colors.highlight : theme.colors.surfaceAlt }} />
      ))}
      <TextInput accessibilityLabel="Custom color" value={custom} onChangeText={setCustom} onBlur={() => isHex(custom) && onChange(custom.toUpperCase())}
        autoCapitalize="characters" maxLength={7} placeholder="#RRGGBB" placeholderTextColor={theme.colors.textMuted}
        style={{ color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.chip, paddingHorizontal: 10, paddingVertical: 6, width: 96 }} />
    </View>
  );
}
```

- [ ] **Step 4: Implement `TextPanel.tsx`**

```tsx
import Slider from "@react-native-community/slider";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { deleteOverlay, duplicateOverlay, updateOverlay } from "@/src/editor/model/ops";
import { OVERLAY_LIMITS, type Align } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { ColorRow } from "./ColorRow";
import { FontStrip } from "./FontStrip";

type Props = { overlayId: string | null; visible: boolean; onClose: () => void };
const field = { backgroundColor: theme.colors.surfaceAlt, color: theme.colors.text, borderRadius: theme.radius.chip, padding: 10, fontSize: 16, minWidth: 72 } as const;

function NumField({ label, value, onCommit, step = 1 }: { label: string; value: number; onCommit: (v: number) => void; step?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <View style={{ gap: 4 }}>
      <Body muted style={{ fontSize: 12 }}>{label}</Body>
      <TextInput accessibilityLabel={label} keyboardType="numbers-and-punctuation" value={text} onChangeText={setText}
        onBlur={() => { const n = Number(text); if (Number.isFinite(n)) onCommit(Math.round(n / step) * step); else setText(String(value)); }} style={field} />
    </View>
  );
}

export function TextPanel({ overlayId, visible, onClose }: Props) {
  const overlay = useEditorStore((s) => s.project?.overlays.find((o) => o.id === overlayId) ?? null);
  const { apply, beginTransaction, applyTransient, selectOverlay } = useEditorStore.getState();
  const [fine, setFine] = useState(false);
  if (!overlay) return null;
  const id = overlay.id;
  const patch = (p: Parameters<typeof updateOverlay>[2]) => apply((x) => updateOverlay(x, id, p));
  const slider = (key: "fontScale" | "opacity") => ({
    onSlidingStart: () => beginTransaction(),
    onValueChange: (v: number) => applyTransient((x) => updateOverlay(x, id, key === "fontScale" ? { fontScale: v } : { background: { color: overlay.background?.color ?? "#000000", opacity: v } })),
  });

  return (
    <Sheet visible={visible} onClose={onClose} title="Text" height="55%">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: theme.space.lg, paddingBottom: theme.space.xl }}>
        <TextInput accessibilityLabel="Overlay text" multiline autoFocus value={overlay.text} onChangeText={(t) => patch({ text: t })}
          style={{ ...field, minHeight: 64, textAlignVertical: "top" }} placeholder="Your text" placeholderTextColor={theme.colors.textMuted} />
        <FontStrip value={overlay.fontId} onChange={(fontId) => patch({ fontId })} />
        <View><Body muted>Size {Math.round(overlay.fontScale * 100)}%</Body>
          <Slider testID="size-slider" minimumValue={OVERLAY_LIMITS.fontScale[0]} maximumValue={OVERLAY_LIMITS.fontScale[1]} value={overlay.fontScale} {...slider("fontScale")} minimumTrackTintColor={theme.colors.accent} /></View>
        <ColorRow value={overlay.color} onChange={(color) => patch({ color })} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Body>Background</Body>
          <Switch accessibilityLabel="Background" value={!!overlay.background} onValueChange={(on) => patch({ background: on ? { color: "#000000", opacity: 0.6 } : null })} trackColor={{ true: theme.colors.accent }} />
        </View>
        {overlay.background && (<>
          <ColorRow value={overlay.background.color} onChange={(color) => patch({ background: { color, opacity: overlay.background!.opacity } })} />
          <Slider testID="opacity-slider" minimumValue={0.2} maximumValue={1} value={overlay.background.opacity} {...slider("opacity")} minimumTrackTintColor={theme.colors.accent} />
        </>)}
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
          {(["left", "center", "right"] as Align[]).map((a) => <Chip key={a} label={`Align ${a}`} selected={overlay.align === a} onPress={() => patch({ align: a })} />)}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Body>Outline</Body>
          <Switch accessibilityLabel="Outline" value={overlay.outline} onValueChange={(outline) => patch({ outline })} trackColor={{ true: theme.colors.accent }} />
        </View>
        <Pressable onPress={() => setFine((f) => !f)} accessibilityRole="button"><Body style={{ color: theme.colors.sea }}>Fine-tune {fine ? "▲" : "▼"}</Body></Pressable>
        {fine && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.md }}>
            <NumField label="X %" value={Math.round(overlay.x * 100)} onCommit={(v) => patch({ x: v / 100 })} />
            <NumField label="Y %" value={Math.round(overlay.y * 100)} onCommit={(v) => patch({ y: v / 100 })} />
            <NumField label="Scale" value={Number(overlay.scale.toFixed(2))} step={0.01} onCommit={(v) => patch({ scale: v })} />
            <NumField label="Rotation °" value={Math.round(overlay.rotation)} onCommit={(v) => patch({ rotation: v })} />
            <NumField label="Start s" value={Number(overlay.start.toFixed(1))} step={0.1} onCommit={(v) => patch({ start: v })} />
            <NumField label="End s" value={Number(overlay.end.toFixed(1))} step={0.1} onCommit={(v) => patch({ end: v })} />
          </View>
        )}
        <View style={{ flexDirection: "row", gap: theme.space.md }}>
          <Chip label="Duplicate" selected={false} onPress={() => { apply((x) => duplicateOverlay(x, id)); const last = useEditorStore.getState().project?.overlays.at(-1); if (last && last.id !== id) selectOverlay(last.id); }} />
          <Chip label="Delete" selected={false} onPress={() => { apply((x) => deleteOverlay(x, id)); onClose(); }} />
        </View>
        <PrimaryButton title="Done" disabled={overlay.text.trim().length === 0} onPress={onClose} />
      </ScrollView>
    </Sheet>
  );
}
```
`duplicateOverlay` inserts the copy right after the original (not at the end); select it by finding the overlay whose index is `indexOf(id) + 1` instead of `.at(-1)`. `Sheet` gains an optional `height?: number | string` prop applied to the content view (`maxHeight`/`height`), default unchanged. Note: `updateOverlay` with an empty `text` is allowed by the op (so the field can be cleared while typing); the panel's Done is disabled until non-empty and `onClose` from the backdrop deletes the overlay if its text is empty (document in a comment; implement in `onClose` wrapper inside the toolbar: if the overlay's text is blank → `apply(deleteOverlay)`).

- [ ] **Step 5: Toolbar + screen wiring**
- `EditorToolbar`: props `{ textPanelFor: string | null; onTextPanelChange: (id: string | null) => void }`. Add `<ToolButton label="Text" icon="text" disabled={!hasClips} onPress={addText} />` after Ratio, where `addText` does: `const p = store.project!; const id = newId(); const range = defaultOverlayRange(p, store.playhead); apply((x) => addTextOverlay(x, { ...makeOverlay({ id }), color: theme.colors.text, ...range })); selectOverlay(id); onTextPanelChange(id);`. Render `<TextPanel overlayId={textPanelFor} visible={!!textPanelFor} onClose={closeText} />` with `closeText` deleting blank overlays as described, then `onTextPanelChange(null)`.
- `app/editor/[id]/index.tsx`: `const [textPanelFor, setTextPanelFor] = useState<string | null>(null)`; pass `onOpenTextPanel={setTextPanelFor}` to `PreviewPlayer` and the two props to `EditorToolbar`.
- `makeOverlay` default `color` is `#F4F4F5` = `theme.colors.text`; fine to use either.

- [ ] **Step 6: Run — expect PASS**; full suite; typecheck. Device: Text → box appears on the video mid-frame; drag/pinch/twist; double-tap opens the panel; change font/color/size/background/alignment/outline; pill appears on the text lane; drag the pill and its ends; undo steps are one per gesture.
- [ ] **Step 7: Commit** — `feat: add Text tool with full style panel and fine-tune fields`

---

### Task 8: Music — bundled tracks, import, MusicSheet, toolbar button

**Files:**
- Create: `assets/music/manifest.json`, `assets/music/*.mp3` (USER-approved), `src/editor/music.ts`, `src/editor/components/MusicSheet.tsx`, `src/projects/audioInfo.ts`
- Modify: `src/projects/storage.ts` (+ `importAudio`), `src/projects/index.ts` (deps), `src/editor/components/EditorToolbar.tsx` (+ Music)
- Test: `src/projects/__tests__/storage.audio.test.ts`, `src/editor/__tests__/MusicSheet.test.tsx`, `src/editor/__tests__/music.test.ts`

**Interfaces:**
- Consumes: ops `setAudioTrack`/`updateAudioTrack`/`removeAudioTrack`, `AudioTrack`, `Sheet`, `Chip`, `Slider`, `expo-document-picker`, `expo-audio`, `expo-asset` (bundled file → local URI).
- Produces:
  ```ts
  // src/editor/music.ts
  interface BundledTrack { id: string; title: string; durationSec: number; license: "CC0"; source: string; file: number /* require() */ }
  BUNDLED_TRACKS: BundledTrack[]            // from manifest.json + requires
  // src/projects/storage.ts
  storage.importAudio(projectId, { uri, title, durationSec }) → Promise<AudioTrack>   // copies into media/, no project.json write
  // src/projects/audioInfo.ts
  audioDuration(uri): Promise<number>        // expo-audio, seconds
  // MusicSheet
  <MusicSheet visible onClose />             // Bundled / My files tabs, or Current-track view
  ```

- [ ] **Step 1 (USER): Approve the bundled tracks.** STOP and ask the user before downloading anything. Propose exactly three CC0 tracks from https://freepd.com (public domain, no attribution) — list each file's page URL, title, approximate size and duration. Only after an explicit "yes", download them with `curl -L -o assets/music/<slug>.mp3 <url>` and record `source` URLs in the manifest. If the user says no or supplies their own files, use those instead (they place them in `assets/music/`). The manifest format:
```json
{ "tracks": [
  { "id": "track1", "title": "<title>", "file": "<slug>.mp3", "durationSec": 123, "license": "CC0", "source": "https://freepd.com/..." }
] }
```
Measure `durationSec` with `ffprobe` if available, otherwise with a tiny Node script using `music-metadata` installed temporarily (`npx -y music-metadata-cli <file>`), rounded to 1 decimal.

- [ ] **Step 2: Write the failing tests**

`src/editor/__tests__/music.test.ts`:
```ts
import { existsSync } from "fs";
import { join } from "path";
import manifest from "../../../assets/music/manifest.json";
import { BUNDLED_TRACKS } from "../music";

test("every manifest track is CC0, has a source, a duration and a file on disk, and is exposed by BUNDLED_TRACKS", () => {
  expect(manifest.tracks.length).toBeGreaterThanOrEqual(1);
  for (const t of manifest.tracks) {
    expect(t.license).toBe("CC0");
    expect(t.source).toMatch(/^https?:\/\//);
    expect(t.durationSec).toBeGreaterThan(5);
    expect(existsSync(join(__dirname, "../../../assets/music", t.file))).toBe(true);
  }
  expect(BUNDLED_TRACKS.map((t) => t.id)).toEqual(manifest.tracks.map((t) => t.id));
});
```

`src/projects/__tests__/storage.audio.test.ts`:
```ts
import { memoryFs } from "../fs";
import { makeStorage } from "../storage";

test("importAudio copies the file into the project's media folder and returns a track", async () => {
  const fs = memoryFs();
  let n = 0;
  const storage = makeStorage(fs, { thumbnail: async () => "x", newId: () => `id${++n}`, nowIso: () => "2026-10-01T10:00:00.000Z" });
  fs.files.set("file:///picked/song.mp3", "MP3");
  await fs.mkdir(`${fs.documentDir}projects/p1/media`);
  const track = await storage.importAudio("p1", { uri: "file:///picked/song.mp3", title: "song.mp3", durationSec: 42.5 });
  expect(track).toEqual({ id: "id1", sourceUri: `${fs.documentDir}projects/p1/media/id1.mp3`, title: "song.mp3", sourceDuration: 42.5, start: 0, trimStart: 0, trimEnd: 42.5, volume: 1 });
  expect(fs.files.get(track.sourceUri)).toBe("MP3");
});
```

`src/editor/__tests__/MusicSheet.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-audio", () => ({ useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), playing: false, replace: jest.fn() }), createAudioPlayer: jest.fn() }));
jest.mock("expo-asset", () => ({ Asset: { fromModule: () => ({ downloadAsync: async () => {}, localUri: "file:///bundled/t.mp3", uri: "file:///bundled/t.mp3" }) } }));
jest.mock("@/src/editor/music", () => ({ BUNDLED_TRACKS: [{ id: "t1", title: "Sunny Loop", durationSec: 30, license: "CC0", source: "https://x", file: 1 }] }));
jest.mock("@/src/projects", () => ({ storage: { importAudio: jest.fn(async (_id: string, a: { uri: string; title: string; durationSec: number }) => ({ id: "m1", sourceUri: "file:///p/m1.mp3", title: a.title, sourceDuration: a.durationSec, start: 0, trimStart: 0, trimEnd: a.durationSec, volume: 1 })) } }));
jest.mock("@/src/projects/audioInfo", () => ({ audioDuration: jest.fn(async () => 12) }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return () => <View />; });
import * as DocumentPicker from "expo-document-picker";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { MusicSheet } from "../components/MusicSheet";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] })); });

test("Use on a bundled track imports it and sets the project's audio track", async () => {
  await render(<MusicSheet visible onClose={() => {}} />);
  expect(screen.getByText("Sunny Loop")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Use Sunny Loop" }));
  await waitFor(() => expect(useEditorStore.getState().project!.audioTracks[0]).toMatchObject({ title: "Sunny Loop", sourceDuration: 30 }));
});

test("My files picks a document, measures its duration and imports it", async () => {
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///picked/a.m4a", name: "a.m4a", size: 1000 }] });
  await render(<MusicSheet visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "My files" }));
  await fireEvent.press(screen.getByRole("button", { name: "Choose a file" }));
  await waitFor(() => expect(useEditorStore.getState().project!.audioTracks[0]).toMatchObject({ title: "a.m4a", sourceDuration: 12 }));
});

test("with a track present shows the current-track view and Remove clears it", async () => {
  useEditorStore.getState().apply((p) => ({ ...p, audioTracks: [{ id: "m", sourceUri: "file:///p/m.mp3", title: "Loop", sourceDuration: 20, start: 0, trimStart: 0, trimEnd: 20, volume: 1 }] }));
  await render(<MusicSheet visible onClose={() => {}} />);
  expect(screen.getByText("Loop")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Remove" }));
  expect(useEditorStore.getState().project!.audioTracks).toEqual([]);
});
```
(The third test's `apply` with a raw object is acceptable in a test; production code uses `setAudioTrack`.)

- [ ] **Step 3: Run — expect FAIL.**

- [ ] **Step 4: Implement**

`src/editor/music.ts`:
```ts
import manifest from "../../assets/music/manifest.json";

export interface BundledTrack { id: string; title: string; durationSec: number; license: "CC0"; source: string; file: number }
// Metro needs static require() calls, one per file in the manifest. Keep this map in sync with manifest.json.
const FILES: Record<string, number> = {
  // "<slug>.mp3": require("../../assets/music/<slug>.mp3"),
};
export const BUNDLED_TRACKS: BundledTrack[] = manifest.tracks.map((t) => ({ ...t, license: "CC0", file: FILES[t.file] }));
```
(Fill `FILES` with one `require` per downloaded file. `tsconfig` needs `"resolveJsonModule": true` — add it if typecheck complains.)

`src/projects/audioInfo.ts` (device only; mocked in tests):
```ts
import { createAudioPlayer } from "expo-audio";

/** Duration of an audio file in seconds, read by loading it into a throwaway expo-audio player. */
export function audioDuration(uri: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const player = createAudioPlayer({ uri });
    const timeout = setTimeout(() => { sub.remove(); player.release(); reject(new Error("Couldn't read the audio file")); }, 8000);
    const sub = player.addListener("playbackStatusUpdate", (s) => {
      if (s.isLoaded && s.duration > 0) { clearTimeout(timeout); sub.remove(); player.release(); resolve(s.duration); }
    });
  });
}
```
Verify `createAudioPlayer`, `addListener("playbackStatusUpdate")`, the status fields (`isLoaded`, `duration`) and `release()` in `node_modules/expo-audio/build/*.d.ts`; adapt names if they differ (document it).

`storage.ts` — add inside `makeStorage` and export in the returned object:
```ts
async function importAudio(projectId: string, a: { uri: string; title: string; durationSec: number }): Promise<AudioTrack> {
  const id = deps.newId();
  const m = /\.([A-Za-z0-9]+)$/.exec(a.title) ?? /\.([A-Za-z0-9]+)$/.exec(a.uri);
  const dest = `${projectDir(projectId)}/media/${id}.${(m?.[1] ?? "m4a").toLowerCase()}`;
  await fs.mkdir(`${projectDir(projectId)}/media`);
  await fs.copy(a.uri, dest);
  return { id, sourceUri: dest, title: a.title, sourceDuration: a.durationSec, start: 0, trimStart: 0, trimEnd: a.durationSec, volume: 1 };
}
```
(`duplicateProject` must also copy audio files: map `audioTracks` like clips, replacing the project dir in `sourceUri`.)

`MusicSheet.tsx`:
```tsx
import Slider from "@react-native-community/slider";
import { Asset } from "expo-asset";
import { useAudioPlayer } from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { BUNDLED_TRACKS, type BundledTrack } from "@/src/editor/music";
import { removeAudioTrack, setAudioTrack, updateAudioTrack } from "@/src/editor/model/ops";
import { AUDIO_LIMITS } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { formatDuration } from "@/src/lib/format";
import { storage } from "@/src/projects";
import { audioDuration } from "@/src/projects/audioInfo";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";

const MAX_BYTES = 50 * 1024 * 1024;
const field = { backgroundColor: theme.colors.surfaceAlt, color: theme.colors.text, borderRadius: theme.radius.chip, padding: 10, minWidth: 72 } as const;

export function MusicSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const project = useEditorStore((s) => s.project);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const [tab, setTab] = useState<"bundled" | "files">("bundled");
  const [busy, setBusy] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = useAudioPlayer(null);
  const track = project?.audioTracks[0] ?? null;

  async function use(uri: string, title: string, durationSec: number) {
    if (!project) return;
    setBusy(true);
    try {
      const t = await storage.importAudio(project.id, { uri, title, durationSec });
      apply((p) => setAudioTrack(p, t));
      preview.pause();
    } catch (e) { useToast.getState().show("Couldn't add that audio file"); console.warn(e); }
    finally { setBusy(false); }
  }
  async function useBundled(t: BundledTrack) {
    const asset = Asset.fromModule(t.file);
    await asset.downloadAsync();
    await use(asset.localUri ?? asset.uri, t.title, t.durationSec);
  }
  async function pickFile() {
    const res = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    const go = async () => { try { await use(a.uri, a.name, await audioDuration(a.uri)); } catch { useToast.getState().show("Couldn't add that audio file"); } };
    if ((a.size ?? 0) > MAX_BYTES) Alert.alert("Large file", "This file is over 50 MB. Add it anyway?", [{ text: "Cancel", style: "cancel" }, { text: "Add", onPress: go }]);
    else await go();
  }
  function togglePreview(t: BundledTrack) {
    if (previewId === t.id) { preview.pause(); setPreviewId(null); return; }
    preview.replace(t.file); preview.play(); setPreviewId(t.id);
  }

  return (
    <Sheet visible={visible} onClose={() => { preview.pause(); onClose(); }} title="Music" height="60%">
      {track ? (
        <View style={{ gap: theme.space.lg }}>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: "600" }}>{track.title}</Text>
          <Body muted>Volume {Math.round(track.volume * 100)}%</Body>
          <Slider minimumValue={AUDIO_LIMITS.volume[0]} maximumValue={AUDIO_LIMITS.volume[1]} value={track.volume} onSlidingStart={beginTransaction}
            onValueChange={(v) => applyTransient((p) => updateAudioTrack(p, { volume: v }))} minimumTrackTintColor={theme.colors.accent} />
          <View style={{ flexDirection: "row", gap: theme.space.md, flexWrap: "wrap" }}>
            <NumField label="Start in video (s)" value={track.start} onCommit={(v) => apply((p) => updateAudioTrack(p, { start: v }))} />
            <NumField label="Trim start (s)" value={track.trimStart} onCommit={(v) => apply((p) => updateAudioTrack(p, { trimStart: v }))} />
            <NumField label="Trim end (s)" value={track.trimEnd} onCommit={(v) => apply((p) => updateAudioTrack(p, { trimEnd: v }))} />
          </View>
          <View style={{ flexDirection: "row", gap: theme.space.md }}>
            <Chip label="Replace" selected={false} onPress={() => apply((p) => removeAudioTrack(p))} />
            <Chip label="Remove" selected={false} onPress={() => { apply((p) => removeAudioTrack(p)); onClose(); }} />
          </View>
        </View>
      ) : (
        <View style={{ gap: theme.space.lg }}>
          <View style={{ flexDirection: "row", gap: theme.space.md }}>
            <Chip label="Bundled" selected={tab === "bundled"} onPress={() => setTab("bundled")} />
            <Chip label="My files" selected={tab === "files"} onPress={() => setTab("files")} />
          </View>
          {tab === "bundled" ? (
            <ScrollView contentContainerStyle={{ gap: theme.space.sm }}>
              {BUNDLED_TRACKS.map((t) => (
                <View key={t.id} style={{ flexDirection: "row", alignItems: "center", gap: theme.space.md, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.chip, padding: theme.space.md }}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${previewId === t.id ? "Stop" : "Play"} ${t.title}`} onPress={() => togglePreview(t)}>
                    <Text style={{ color: theme.colors.highlight, fontSize: 18 }}>{previewId === t.id ? "■" : "▶"}</Text>
                  </Pressable>
                  <View style={{ flex: 1 }}><Text style={{ color: theme.colors.text }}>{t.title}</Text><Body muted style={{ fontSize: 12 }}>{formatDuration(t.durationSec)} · {t.license}</Body></View>
                  <Chip label="Use" selected={false} disabled={busy} onPress={() => useBundled(t)} />
                </View>
              ))}
            </ScrollView>
          ) : (
            <PrimaryButton title="Choose a file" disabled={busy} onPress={pickFile} />
          )}
        </View>
      )}
    </Sheet>
  );
}

```
`NumField` is imported from `src/ui/NumField.tsx`: move Task 7's `NumField` (with its `step` prop, default `0.1` here) into that file and import it in both `TextPanel` and `MusicSheet` — do not duplicate it. The "Use" chip's accessible name must be `Use <title>` for the test: give the `Chip` an `accessibilityLabel` prop (add optional `accessibilityLabel?: string` to `Chip`, defaulting to `label`). "Replace" removes the track and shows the tabs again.

- [ ] **Step 5: Toolbar** — add `<ToolButton label="Music" icon="musical-notes" onPress={() => setSheet("music")} />` after Text; render `<MusicSheet visible={sheet === "music"} onClose={() => setSheet(null)} />`; extend the `sheet` state union.

- [ ] **Step 6: Run — expect PASS**; full suite; typecheck; `npx expo-doctor`. Device: Music → Bundled list plays previews; Use adds the bar on the music lane; My files opens the Files app.
- [ ] **Step 7: Commit** — `feat: add music sheet with bundled CC0 tracks and file import` (bundled MP3s are committed; keep total under 10 MB).

---

### Task 9: Audio preview synced to the playhead

**Files:**
- Create: `src/editor/components/AudioPreview.tsx`
- Modify: `app/editor/[id]/index.tsx` (mount `<AudioPreview />` next to `PreviewPlayer`)
- Test: none beyond `audioSync` (Task 3); device check.

**Interfaces:**
- Consumes: store (`project.audioTracks[0]`, `playhead`, `isPlaying`, `missingSourceUris`), `songTimeAt`, `expo-audio` `useAudioPlayer`.

- [ ] **Step 1: Implement**

```tsx
import { useAudioPlayer } from "expo-audio";
import { useEffect, useRef } from "react";
import { songTimeAt } from "@/src/editor/model/audioSync";
import { useEditorStore } from "@/src/editor/store";

const DRIFT_TOLERANCE = 0.25; // seconds before we re-seek the song while playing

/** Invisible component: plays the project's music track in sync with the store's playhead. */
export function AudioPreview() {
  const track = useEditorStore((s) => s.project?.audioTracks[0] ?? null);
  const playhead = useEditorStore((s) => s.playhead);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const missing = useEditorStore((s) => s.missingSourceUris);
  const player = useAudioPlayer(null);
  const loadedUri = useRef<string | null>(null);

  useEffect(() => {
    if (!track || missing.includes(track.sourceUri)) { player.pause(); loadedUri.current = null; return; }
    if (loadedUri.current !== track.sourceUri) { player.replace({ uri: track.sourceUri }); loadedUri.current = track.sourceUri; }
    player.volume = Math.min(1, track.volume);
  }, [track?.sourceUri, track?.volume, missing, player]);

  useEffect(() => {
    if (!track || loadedUri.current === null) return;
    const t = songTimeAt(track, playhead);
    if (t === null || !isPlaying) { if (player.playing) player.pause(); if (t !== null && !isPlaying) player.seekTo(t); return; }
    if (Math.abs(player.currentTime - t) > DRIFT_TOLERANCE) player.seekTo(t);
    if (!player.playing) player.play();
  }, [track, playhead, isPlaying, player]);

  useEffect(() => () => player.pause(), [player]);
  return null;
}
```
Verify in `node_modules/expo-audio/build/*.d.ts`: `useAudioPlayer(source)`, `player.replace(source)`, `seekTo(seconds)` (may return a Promise — fine to ignore), `currentTime`, `playing`, `volume`, `pause/play`. If `useAudioPlayer(null)` isn't accepted, pass `undefined` or an empty `{}` source per the types. Mount `<AudioPreview />` in `app/editor/[id]/index.tsx` right after `<PreviewPlayer ... />` (inside the preview slot).

- [ ] **Step 2: Verify** — typecheck; `npm test` (no new tests; `expo-audio` must be mocked in `jest.setup.ts` if any test now renders the editor screen: `jest.mock("expo-audio", () => ({ useAudioPlayer: () => ({ play(){}, pause(){}, seekTo(){}, replace(){}, playing: false, currentTime: 0, volume: 1 }), createAudioPlayer: jest.fn() }))`). Device: with a bundled track added at 0 s, play → music starts with the video; scrub → music follows; lower volume in the Music sheet → quieter; trim start → the song starts later into itself.
- [ ] **Step 3: Commit** — `feat: play the music track in sync with the preview`

---

### Task 10: Volume sheet and toolbar button

**Files:**
- Create: `src/editor/components/VolumeSheet.tsx`
- Modify: `src/editor/components/EditorToolbar.tsx`
- Test: `src/editor/__tests__/VolumeSheet.test.tsx`; extend `EditorToolbar.test.tsx` (Volume disabled without selection)

**Interfaces:**
- Consumes: `setClipVolume`, `setClipMuted`, `CLIP_VOLUME`, `Slider`, `Switch`, `Sheet`.
- Produces: `<VolumeSheet clipId visible onClose />`.

- [ ] **Step 1: Write the failing test**

`src/editor/__tests__/VolumeSheet.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, onSlidingStart, onValueChange, onSlidingComplete }: { testID?: string; onSlidingStart?: () => void; onValueChange?: (v: number) => void; onSlidingComplete?: (v: number) => void }) => <View testID={testID} onTouchStart={() => onSlidingStart?.()} onTouchMove={() => onValueChange?.(1.5)} onTouchEnd={() => onSlidingComplete?.(1.5)} />; });
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { VolumeSheet } from "../components/VolumeSheet";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 5 })] })); });

test("slider drag is one undo step; mute toggles", async () => {
  await render(<VolumeSheet clipId="a" visible onClose={() => {}} />);
  const slider = screen.getByTestId("volume-slider");
  await fireEvent(slider, "touchStart"); await fireEvent(slider, "touchMove"); await fireEvent(slider, "touchEnd");
  expect(useEditorStore.getState().project!.clips[0].volume).toBe(1.5);
  expect(useEditorStore.getState().past).toHaveLength(1);
  await fireEvent(screen.getByLabelText("Mute"), "valueChange", true);
  expect(useEditorStore.getState().project!.clips[0].muted).toBe(true);
  expect(screen.getByText("150%")).toBeTruthy();
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `VolumeSheet.tsx`**
```tsx
import Slider from "@react-native-community/slider";
import { Switch, View } from "react-native";
import { setClipMuted, setClipVolume } from "@/src/editor/model/ops";
import { CLIP_VOLUME } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";

export function VolumeSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useEditorStore((s) => s.project?.clips.find((c) => c.id === clipId) ?? null);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  if (!clip) return null;
  return (
    <Sheet visible={visible} onClose={onClose} title="Volume">
      <Body muted>{Math.round(clip.volume * 100)}%</Body>
      <Slider testID="volume-slider" minimumValue={CLIP_VOLUME[0]} maximumValue={CLIP_VOLUME[1]} value={clip.volume} step={0.05}
        onSlidingStart={beginTransaction} onValueChange={(v) => applyTransient((p) => setClipVolume(p, clip.id, v))}
        minimumTrackTintColor={theme.colors.accent} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={theme.colors.highlight} />
      <Body muted style={{ fontSize: 12 }}>Above 100% only applies in the exported video.</Body>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Body>Mute</Body>
        <Switch accessibilityLabel="Mute" value={clip.muted} onValueChange={(m) => apply((p) => setClipMuted(p, clip.id, m))} trackColor={{ true: theme.colors.accent }} />
      </View>
    </Sheet>
  );
}
```
Toolbar: `<ToolButton label="Volume" icon="volume-high" disabled={noSel} onPress={() => setSheet("volume")} />` after Music; render `<VolumeSheet clipId={selectedId} visible={sheet === "volume"} onClose={() => setSheet(null)} />`. Toolbar test: assert `Volume` is disabled without a selection and enabled after `select("a")`.

- [ ] **Step 4: Run — expect PASS**; full suite; typecheck. Device: Volume → slider changes the clip loudness live (≤100%); Mute silences it; undo restores.
- [ ] **Step 5: Commit** — `feat: add per-clip volume and mute`

---

### Task 11: Export request carries overlays, audio and volumes (TypeScript side)

**Files:**
- Modify: `modules/clipy-video/index.ts`, `src/export/useExport.ts`, `src/export/estimate.ts` (`exportableClips` unchanged; add `exportableAudio`)
- Test: update `src/export/__tests__/useExport.test.ts`, `modules/clipy-video/__tests__/index.test.ts`

**Interfaces:**
- Produces (TS ↔ Swift contract; Task 12 mirrors it exactly):
  ```ts
  interface ExportOverlay { text: string; fontPostScriptName: string; fontScale: number; color: string; backgroundColor: string | null; backgroundOpacity: number; outline: boolean; align: Align; x: number; y: number; scale: number; rotation: number; start: number; end: number }
  interface ExportAudio { sourceUri: string; start: number; trimStart: number; trimEnd: number; volume: number }
  interface ExportRequest {
    clips: { sourceUri; trimStart; trimEnd; volume: number; muted: boolean }[];
    overlays: ExportOverlay[];
    audio: ExportAudio | null;
    aspectRatio; resolution; outputPath;
  }
  toExportOverlay(o: TextOverlay): ExportOverlay   // maps fontId → FONTS[fontId].postScriptName
  ```
  Overlays whose `end ≤ start` are dropped; the audio track is dropped when its file is missing.

- [ ] **Step 1: Update the tests**

In `src/export/__tests__/useExport.test.ts` extend the first test's project with `overlays: [makeOverlay({ id: "o", text: "Hey", fontId: "anton", start: 0, end: 2 })]`, `audioTracks: [makeAudioTrack({ id: "m", sourceUri: "file:///media/m.m4a", sourceDuration: 9 })]`, and a clip with `volume: 1.5, muted: true`; assert `exportTimeline` was called with `expect.objectContaining({ overlays: [expect.objectContaining({ text: "Hey", fontPostScriptName: "Anton-Regular", x: 0.5 })], audio: expect.objectContaining({ sourceUri: "file:///media/m.m4a", trimEnd: 9, volume: 1 }), clips: [expect.objectContaining({ volume: 1.5, muted: true })] })`. Add a case: audio sourceUri in `missingSourceUris` → `audio: null`. In `modules/clipy-video/__tests__/index.test.ts` the request literal gains `overlays: [], audio: null` and the clip gains `volume: 1, muted: false`.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

`modules/clipy-video/index.ts` — replace `ExportRequest` and add:
```ts
import { FONTS } from "@/src/editor/fonts";
import type { Align, AspectRatio, TextOverlay } from "@/src/editor/model/types";

export interface ExportOverlay { text: string; fontPostScriptName: string; fontScale: number; color: string; backgroundColor: string | null; backgroundOpacity: number; outline: boolean; align: Align; x: number; y: number; scale: number; rotation: number; start: number; end: number }
export interface ExportAudio { sourceUri: string; start: number; trimStart: number; trimEnd: number; volume: number }
export interface ExportRequest {
  clips: { sourceUri: string; trimStart: number; trimEnd: number; volume: number; muted: boolean }[];
  overlays: ExportOverlay[];
  audio: ExportAudio | null;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  outputPath: string;
}
export function toExportOverlay(o: TextOverlay): ExportOverlay {
  return { text: o.text, fontPostScriptName: FONTS[o.fontId].postScriptName, fontScale: o.fontScale, color: o.color,
    backgroundColor: o.background?.color ?? null, backgroundOpacity: o.background?.opacity ?? 0, outline: o.outline, align: o.align,
    x: o.x, y: o.y, scale: o.scale, rotation: o.rotation, start: o.start, end: o.end };
}
```
`src/export/estimate.ts`: add `export const exportableAudio = (p: Project, missing: string[]) => { const t = p.audioTracks[0]; return t && !missing.includes(t.sourceUri) ? t : null; }`.
`src/export/useExport.ts` `start`: build `clips: clips.map((c) => ({ sourceUri, trimStart, trimEnd, volume: c.volume, muted: c.muted }))`, `overlays: project.overlays.filter((o) => o.end > o.start).map(toExportOverlay)`, `audio: (() => { const t = exportableAudio(project, missingSourceUris); return t ? { sourceUri: t.sourceUri, start: t.start, trimStart: t.trimStart, trimEnd: t.trimEnd, volume: t.volume } : null; })()`.

- [ ] **Step 4: Run — expect PASS**; full suite; typecheck.
- [ ] **Step 5: Commit** — `feat: include overlays, music and clip volumes in the export request`

---

### Task 12: Swift — text layers, audio mix, layout mirror (compiled on EAS only)

**Files:**
- Create: `modules/clipy-video/ios/OverlayLayout.swift`
- Modify: `modules/clipy-video/ios/ExportSession.swift` (Records + composition), `modules/clipy-video/ios/Tests/ExportSessionTests.swift`

**Interfaces:**
- Consumes: Task 11's request shape (field names must match exactly), the pinned numbers from Task 3's `overlayLayout.test.ts`.
- Produces: `ExportOverlay`, `ExportAudio` Records; `OverlayLayout.layout(_:frame:) -> OverlayLayoutResult`; text layers via `AVVideoCompositionCoreAnimationTool`; `AVMutableAudioMix`.

No compiler here: verify by reading against `node_modules/expo-modules-core/ios/Core/Records/*.swift` (optional `@Field` of `String?`/`ExportAudio?` — check how optionals are declared) and Apple's APIs from memory; keep the code conservative (no `@available` features beyond iOS 16).

- [ ] **Step 1: `OverlayLayout.swift`** — the mirror of `layoutOverlay` (keep the constants identical):
```swift
import CoreGraphics

struct OverlayLayoutResult { let centerX: CGFloat; let centerY: CGFloat; let fontSize: CGFloat; let maxWidth: CGFloat; let padding: CGFloat; let outlineWidth: CGFloat; let rotation: CGFloat; let lineHeight: CGFloat }

/// Mirror of src/editor/model/overlayLayout.ts — keep the formulas identical. Reference values (frame 1080×1920,
/// x .25 y .75 fontScale .1 scale 1.5, background on): centre (270, 1440), fontSize 288, maxWidth 972, padding 72, lineHeight 345.6.
enum OverlayLayout {
  static let outlinePx: CGFloat = 2
  static let lineHeightFactor: CGFloat = 1.2
  static let backgroundPadFactor: CGFloat = 0.25
  static let maxWidthFactor: CGFloat = 0.9

  static func layout(_ o: ExportOverlay, frame: CGSize) -> OverlayLayoutResult {
    let fontSize = CGFloat(o.fontScale * o.scale) * frame.height
    return OverlayLayoutResult(
      centerX: CGFloat(o.x) * frame.width, centerY: CGFloat(o.y) * frame.height, fontSize: fontSize,
      maxWidth: maxWidthFactor * frame.width,
      padding: o.backgroundColor == nil ? 0 : backgroundPadFactor * fontSize,
      outlineWidth: outlinePx * (frame.height / 1920), rotation: CGFloat(o.rotation), lineHeight: lineHeightFactor * fontSize)
  }
}
```

- [ ] **Step 2: Records and composition in `ExportSession.swift`**

Add Records (after `ExportClip`; add `volume`/`muted` to `ExportClip`):
```swift
struct ExportClip: Record {
  @Field var sourceUri: String = ""
  @Field var trimStart: Double = 0
  @Field var trimEnd: Double = 0
  @Field var volume: Double = 1
  @Field var muted: Bool = false
}
struct ExportOverlay: Record {
  @Field var text: String = ""
  @Field var fontPostScriptName: String = "Helvetica"
  @Field var fontScale: Double = 0.07
  @Field var color: String = "#FFFFFF"
  @Field var backgroundColor: String? = nil
  @Field var backgroundOpacity: Double = 0
  @Field var outline: Bool = true
  @Field var align: String = "center"
  @Field var x: Double = 0.5
  @Field var y: Double = 0.5
  @Field var scale: Double = 1
  @Field var rotation: Double = 0
  @Field var start: Double = 0
  @Field var end: Double = 0
}
struct ExportAudio: Record {
  @Field var sourceUri: String = ""
  @Field var start: Double = 0
  @Field var trimStart: Double = 0
  @Field var trimEnd: Double = 0
  @Field var volume: Double = 1
}
// ExportRequest gains:
//   @Field var overlays: [ExportOverlay] = []
//   @Field var audio: ExportAudio? = nil
```

Composition changes inside `start`, in order:
1. **Per-clip audio volume/mute:** keep inserting each clip's audio into `audioTrack`; collect `(timeRange, volume)` pairs: `clipAudioRanges.append((CMTimeRange(start: cursor, duration: range.duration), clip.muted ? 0 : Float(clip.volume)))`.
2. **Music track:** if `request.audio` is non-nil, add a second composition audio track `musicTrack`; load the asset's first audio track; insert `CMTimeRange(trimStart…trimEnd)` at `CMTime(seconds: audio.start)`, clamped so it doesn't exceed the video `cursor` (total duration): `let musicDur = min(trimEnd − trimStart, total − audio.start)`; skip if `musicDur ≤ 0`.
3. **Audio mix:** `let mix = AVMutableAudioMix()`; for the clip track one `AVMutableAudioMixInputParameters(track: audioTrack)` with `setVolume(v, at: range.start)` per clip range; for the music track parameters with `setVolume(Float(audio.volume), at: .zero)` and, if the music reaches the end (`audio.start + musicDur ≥ total − 0.01`), `setVolumeRamp(fromStartVolume: v, toEndVolume: 0, timeRange: CMTimeRange(start: total − 1 s, duration: 1 s))`. `session.audioMix = mix`.
4. **Text layers:** build `let parentLayer = CALayer(); let videoLayer = CALayer();` both with `frame = CGRect(origin: .zero, size: renderSize)`; `parentLayer.addSublayer(videoLayer)`; for each overlay with `end > start`: compute `let l = OverlayLayout.layout(o, frame: renderSize)`; create a `CATextLayer` with `string = o.text`, `font = CTFontCreateWithName(o.fontPostScriptName as CFString, l.fontSize, nil)`, `fontSize = l.fontSize`, `foregroundColor = UIColor(hex: o.color).cgColor`, `alignmentMode = (.left/.center/.right)`, `isWrapped = true`, `contentsScale = 1` (render size already in pixels), `truncationMode = .none`; measure the wrapped text size with `NSAttributedString` + `boundingRect(with: CGSize(width: l.maxWidth, height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin], ...)` using the same font; set `textLayer.frame = CGRect(x: 0, y: 0, width: ceil(w), height: ceil(h))`. Wrap it in a `container = CALayer()` with `bounds = CGRect(0,0,w + 2*pad, h + 2*pad)`, `position = CGPoint(x: l.centerX, y: renderSize.height − l.centerY)` (**Core Animation's origin is bottom-left; flip y**), `backgroundColor` from `backgroundColor`/`backgroundOpacity` with `cornerRadius = pad/2`, `textLayer.position = container centre`, `container.transform = CATransform3DMakeRotation(−l.rotation * .pi / 180, 0, 0, 1)` (**negative because of the flipped axis**). Outline: if `o.outline`, add a second `CATextLayer` beneath with the same frame drawn via `NSAttributedString` attributes `.strokeColor` (black for light text / white for dark — mirror `contrastFor`) and `.strokeWidth = -(l.outlineWidth / l.fontSize * 100)` (negative = stroke + fill) — simplest: use ONE text layer whose `string` is the attributed string with `.strokeWidth` negative and `.foregroundColor`; then `font`/`foregroundColor` properties are ignored in favour of the attributed string. Visibility (the layer is visible only while its animation runs): `container.opacity = 0; let anim = CABasicAnimation(keyPath: "opacity"); anim.fromValue = 1; anim.toValue = 1; anim.beginTime = max(o.start, AVCoreAnimationBeginTimeAtZero); anim.duration = o.end − o.start; anim.fillMode = .removed; anim.isRemovedOnCompletion = true; container.add(anim, forKey: "visible")`. `parentLayer.addSublayer(container)`. Finally `videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: parentLayer)`.
5. Add a tiny `UIColor(hex:)` helper (`#RRGGBB`), and `contrastFor(hex:)` mirroring the TS function.

Keep every existing behavior (cancel, progress, HighestQuality, file cleanup). If `AVVideoCompositionCoreAnimationTool` is set, `AVAssetExportSession` requires `videoComposition` — already set.

- [ ] **Step 3: Tests** — in `ExportSessionTests.swift` add `makeTone(seconds:)` that writes a 2 s 440 Hz mono AAC file with `AVAssetWriter` (`AVAudioFormat` + `AVAssetWriterInput(mediaType: .audio, outputSettings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1])`, appending `CMSampleBuffer`s built from a sine wave), then a second test `testExportsWithTextAndMusic`: two clips (as before) + one overlay (`text: "Hi"`, `start: 0, end: 4`) + `audio` from the tone file (`start: 0, trimStart: 0, trimEnd: 2, volume: 1`); asserts `done`, duration ≈ 4, and that the output has an audio track (`loadTracks(withMediaType: .audio)` non-empty). Keep the `await`s outside `XCTUnwrap`.

- [ ] **Step 4: Verify what can be verified** — `npm run typecheck`, `npm test`, autolinking still lists the module; read the Swift twice against `node_modules/expo-modules-core/ios/Core/Records/Field.swift` for optional `@Field` syntax (`@Field var audio: ExportAudio? = nil` is the documented form) and note anything unconfirmed in the report.
- [ ] **Step 5: Commit** — `feat: render text overlays and mix music in the Swift export`

---

### Task 13: Docs, spec status, device checklist

**Files:**
- Modify: `README.md` ("Phase 2 features", `assets/fonts`, `assets/music` + how to add your own CC0 track), `docs/superpowers/specs/2026-10-01-phase-2-text-audio-design.md` (Status → `Implemented 2026-10-01 (Swift export unverified until an EAS build exists; on-device checklist pending)`), `AGENTS.md` (one line: fonts/music assets are bundled; overlays use fractions; keep `overlayLayout.ts` and `OverlayLayout.swift` in sync).

- [ ] **Step 1:** Make the doc edits.
- [ ] **Step 2:** `npm run typecheck`, `npm test`, `npx expo-doctor`, `npm ls --all | Select-String invalid` (empty).
- [ ] **Step 3 (USER): Device checklist in Expo Go** — add text → move/pinch/rotate → font, size, color, background, align, outline → start/end via the pill → add a bundled song → drag/trim the bar → volume → lower a clip's volume, mute another → play through (text timing + music sync) → undo a drag (one step) → change ratio (text stays put) → close and reopen (everything persists; a Phase 1 project opens and shows "muted" switches off).
- [ ] **Step 4:** Commit — `docs: Phase 2 README, agents notes and spec status`

---

## Phase 2 Done When

- [ ] Jest, typecheck, expo-doctor clean.
- [ ] Device checklist passes.
- [ ] Swift export extended and reviewed by reading; XCTest updated (runs later on EAS).
