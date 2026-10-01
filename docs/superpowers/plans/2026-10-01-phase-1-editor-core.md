# Clipy Phase 1 — Editor Core & Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A polished clip editor that runs in Expo Go: projects grid, camera-roll import, timeline with split/trim/reorder/duplicate/delete, aspect ratio, live preview, and an Export screen (Swift export written now, exercised later).

**Architecture:** Pure-TypeScript edit model (`ops.ts`, `timeline.ts`) + a Zustand store with undo/redo + a storage layer behind a tiny `FsAdapter` (in-memory adapter for tests, `expo-file-system` adapter on device). Screens are Expo Router routes composed of small components that read the store. Preview is `expo-video` driven by the playhead. Export calls the Swift module through an event-based wrapper that reports "unavailable" in Expo Go.

**Tech Stack:** Expo SDK 57, Expo Router, TypeScript strict, Zustand, expo-video, expo-video-thumbnails, expo-image-picker, expo-media-library, expo-sharing, expo-file-system (class API: `File`, `Directory`, `Paths`), expo-font + `@expo-google-fonts/bangers`, react-native-svg, react-native-gesture-handler, react-native-reanimated, Jest (jest-expo) + `@testing-library/react-native`, Swift/AVFoundation.

**Spec:** `docs/superpowers/specs/2026-10-01-phase-1-editor-core-design.md` (parent: `2026-10-01-clip-editor-app-design.md`)

## Global Constraints

- Everything except export must work in **Expo Go**; no new custom native code outside `modules/clipy-video`. Swift is compiled only on EAS (none locally) — judge Swift by reading.
- iPhone only, portrait only. No Android/web config.
- No One Piece characters, names, logos or artwork anywhere. Theme is original and "inspired by" only.
- Theme tokens (exact): `bg #0B0B0D`, `surface #17171B`, `surfaceAlt #222228`, `accent #C8102E`, `accentPressed #9E0C24`, `highlight #F5C542`, `straw #D9B36A`, `sea #2E86AB`, `text #F4F4F5`, `textMuted #9A9AA3`, `danger #FF4D4F`. Headings/primary buttons use font `Bangers_400Regular`; body uses the system font. Components never hard-code colors.
- Spacing scale 4/8/12/16/24/32; radius 12 (cards, buttons), 8 (chips), 999 (pills). Press/sheet motion 150–200 ms.
- All editing logic is pure TypeScript, unit-tested with Jest; screens call store actions, never mutate `Project` directly. Minimum clip length `0.1` s.
- Storage: `projects/<id>/project.json`, `projects/<id>/media/<clipId>.<ext>`, `projects/<id>/thumb.jpg`; atomic writes (`project.json.tmp` then move); autosave 500 ms debounce; `schemaVersion: 1`.
- Import alias `@/` → repo root (`@/src/...`, `@/modules/...`).
- Package manager npm; `npx expo install` for Expo packages; plain `npm ci` must keep working; keep the `overrides` block.
- Every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Expo API names: verify against `node_modules/<pkg>/build/*.d.ts` when the plan's code doesn't typecheck — the plan was written from SDK 57 type files but may have small drifts. Fix the call, keep the behavior.

## File Structure

```
app/_layout.tsx                      fonts, GestureHandlerRootView, dark Stack        (T1)
app/index.tsx                        Projects screen                                  (T7)
app/editor/[id]/index.tsx            Editor screen                                    (T8)
app/editor/[id]/export.tsx           Export screen (modal)                            (T13)
src/theme/theme.ts                   tokens, fonts, wallpaper slot                    (T1)
src/theme/Mark.tsx                   three-slashes SVG                                (T1)
src/lib/id.ts, src/lib/clock.ts      newId(), nowIso()                                (T2)
src/lib/format.ts                    formatDuration, relativeTime                     (T2)
src/editor/model/types.ts            Project, Clip, AspectRatio, helpers              (T2)
src/editor/model/timeline.ts         timeline math                                    (T2)
src/editor/model/ops.ts              pure edit ops                                    (T3)
src/editor/store.ts                  Zustand store, undo/redo, transactions           (T4)
src/editor/useAutosave.ts            debounced save hook                              (T4)
src/projects/fs.ts                   FsAdapter interface + memoryFs()                 (T5)
src/projects/expoFs.ts               expo-file-system adapter                         (T5)
src/projects/storage.ts              makeStorage(fs, deps)                            (T5)
src/projects/index.ts                storage singleton wired to expoFs                (T5)
src/ui/*.tsx                         PrimaryButton, ToolButton, Chip, Sheet, Toast    (T6)
src/projects/ProjectCard.tsx         card                                             (T7)
src/editor/components/PreviewPlayer.tsx                                               (T9)
src/editor/components/Timeline.tsx, ClipThumbStrip.tsx, thumbnails.ts                 (T10)
src/editor/components/TrimHandles.tsx, ReorderableStrip.tsx                           (T11)
src/editor/components/EditorToolbar.tsx, RatioSheet.tsx, TrimSheet.tsx               (T12)
src/export/estimate.ts, useExport.ts                                                  (T13)
modules/clipy-video/index.ts         + export API                                     (T13)
modules/clipy-video/ios/ClipyVideoModule.swift, ExportSession.swift, Tests/           (T14)
jest.setup.ts                        RN testing library + Expo module mocks           (T1)
```

---

### Task 1: Dependencies, theme, fonts, root layout, test setup

**Files:**
- Modify: `package.json`, `tsconfig.json`, `app/_layout.tsx`, `app.json`
- Create: `src/theme/theme.ts`, `src/theme/Mark.tsx`, `jest.setup.ts`, `src/theme/__tests__/Mark.test.tsx`

**Interfaces:**
- Produces: `theme` object (`colors`, `space`, `radius`, `fonts`, `projectsWallpaper`), `<Mark size={n} color?/>`, `@/` alias in TS and Jest, fonts loaded before the Stack renders.

- [ ] **Step 1: Install dependencies**

```powershell
npx expo install zustand expo-video expo-video-thumbnails expo-image-picker expo-media-library expo-sharing expo-file-system expo-font @expo-google-fonts/bangers react-native-svg react-native-gesture-handler react-native-reanimated expo-crypto
npx expo install @testing-library/react-native react-test-renderer -- --save-dev
```

If `react-native-reanimated` / `react-native-worklets` land at versions other than the `overrides` (4.5.1 / 0.10.1), set the dependency ranges to exactly those versions. Verify `npm ls --all | Select-String invalid` is empty and `npx expo-doctor` passes.

- [ ] **Step 2: Configure plugins and alias**

In `app.json` `plugins`, add `"expo-video"`, `["expo-image-picker", { "photosPermission": "Clipy needs access to your videos to import clips." }]`, `["expo-media-library", { "photosPermission": "Clipy saves exported videos to your Photos.", "savePhotosPermission": "Clipy saves exported videos to your Photos.", "isAccessMediaLocationEnabled": false }]`, and `"expo-font"`.

`tsconfig.json` → add `"paths": { "@/*": ["./*"] }` under `compilerOptions` and `"baseUrl": "."`.

`package.json` `jest` block:
```json
"jest": {
  "preset": "jest-expo",
  "setupFilesAfterEnv": ["<rootDir>/jest.setup.ts"],
  "moduleNameMapper": { "^@/(.*)$": "<rootDir>/$1" },
  "transformIgnorePatterns": [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|zustand)"
  ]
}
```

Create `jest.setup.ts`:
```ts
import "@testing-library/react-native/extend-expect";

jest.mock("expo-font", () => ({ useFonts: () => [true, null], isLoaded: () => true }));
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("react-native-gesture-handler", () => {
  const View = require("react-native").View;
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({ children }: { children: unknown }) => children,
    Gesture: {
      Pan: () => chain(), Pinch: () => chain(), LongPress: () => chain(), Native: () => chain(),
      Simultaneous: () => chain(), Race: () => chain(),
    },
  };
  function chain(): Record<string, () => unknown> {
    const g: Record<string, () => unknown> = {};
    for (const k of ["onBegin", "onStart", "onUpdate", "onEnd", "onFinalize", "activeOffsetX", "minDistance",
      "activateAfterLongPress", "simultaneousWithExternalGesture", "blocksExternalGesture", "enabled", "hitSlop"]) {
      g[k] = () => g;
    }
    return g;
  }
});
```

- [ ] **Step 3: Write the failing Mark test**

`src/theme/__tests__/Mark.test.tsx`:
```tsx
import { render } from "@testing-library/react-native";
import { Mark } from "../Mark";
import { theme } from "../theme";

test("Mark renders three slashes in the accent color by default", () => {
  const { getAllByTestId } = render(<Mark size={32} />);
  const slashes = getAllByTestId("mark-slash");
  expect(slashes).toHaveLength(3);
  expect(slashes[0].props.stroke).toBe(theme.colors.accent);
});

test("theme exposes the Shanks-inspired tokens", () => {
  expect(theme.colors.accent).toBe("#C8102E");
  expect(theme.colors.bg).toBe("#0B0B0D");
  expect(theme.fonts.heading).toBe("Bangers_400Regular");
  expect(theme.projectsWallpaper).toBeNull();
});
```

- [ ] **Step 4: Run it — expect FAIL** (`npm test -- Mark`): "Cannot find module '../Mark'".

- [ ] **Step 5: Create the theme and Mark**

`src/theme/theme.ts`:
```ts
import type { ImageSourcePropType } from "react-native";

export const theme = {
  colors: {
    bg: "#0B0B0D", surface: "#17171B", surfaceAlt: "#222228",
    accent: "#C8102E", accentPressed: "#9E0C24", highlight: "#F5C542",
    straw: "#D9B36A", sea: "#2E86AB", text: "#F4F4F5", textMuted: "#9A9AA3", danger: "#FF4D4F",
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { card: 12, chip: 8, pill: 999 },
  fonts: { heading: "Bangers_400Regular", body: undefined as string | undefined },
  motion: { press: 150, sheet: 200 },
  /** Optional user-supplied image rendered dimmed behind the Projects grid. Nothing ships in the repo. */
  projectsWallpaper: null as ImageSourcePropType | null,
} as const;

export type Theme = typeof theme;
```

`src/theme/Mark.tsx` (three short diagonal strokes — original motif):
```tsx
import Svg, { Line } from "react-native-svg";
import { theme } from "./theme";

type Props = { size?: number; color?: string };

/** Three slashes: Clipy's original mark. */
export function Mark({ size = 24, color = theme.colors.accent }: Props) {
  const w = size, h = size, sw = Math.max(2, size / 8);
  const xs = [0.2, 0.45, 0.7];
  return (
    <Svg width={w} height={h} viewBox="0 0 100 100" accessibilityLabel="Clipy mark">
      {xs.map((x, i) => (
        <Line key={i} testID="mark-slash" x1={x * 100} y1={15} x2={x * 100 + 22} y2={85}
          stroke={color} strokeWidth={sw * 4} strokeLinecap="round" />
      ))}
    </Svg>
  );
}
```

- [ ] **Step 6: Root layout with fonts and gesture root**

`app/_layout.tsx`:
```tsx
import { Bangers_400Regular, useFonts } from "@expo-google-fonts/bangers";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { theme } from "@/src/theme/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded] = useFonts({ Bangers_400Regular });
  useEffect(() => { if (loaded) SplashScreen.hideAsync().catch(() => {}); }, [loaded]);
  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }} />
    </GestureHandlerRootView>
  );
}
```

- [ ] **Step 7: Run tests and typecheck** — `npm test` (Mark tests + existing clipy-video tests pass, output pristine), `npm run typecheck` clean, `npx expo-doctor` passes.

- [ ] **Step 8: Commit** — `feat: add theme, mark, fonts and test setup for Phase 1`

---

### Task 2: Model types, timeline math, formatting helpers (TDD)

**Files:**
- Create: `src/lib/id.ts`, `src/lib/clock.ts`, `src/lib/format.ts`, `src/editor/model/types.ts`, `src/editor/model/timeline.ts`
- Test: `src/editor/model/__tests__/timeline.test.ts`, `src/lib/__tests__/format.test.ts`

**Interfaces:**
- Produces: `Project`, `Clip`, `AspectRatio`, `ASPECT_RATIOS`, `MIN_CLIP_SECONDS = 0.1`, `makeClip(partial)`, `makeProject(partial)` (test helpers that also serve `createProject`), `clipDuration(c)`, `totalDuration(p)`, `clipStartTimes(p)`, `clipAt(p, t): { clip, index, offsetInClip } | null`, `timeToX(t, pps)`, `xToTime(x, pps)`, `newId(): string`, `nowIso(): string`, `formatDuration(sec): "m:ss"`, `formatDurationPrecise(sec): "m:ss.t"`, `relativeTime(iso, now?): string`.

- [ ] **Step 1: Write the failing tests**

`src/editor/model/__tests__/timeline.test.ts`:
```ts
import { makeClip, makeProject } from "../types";
import { clipAt, clipDuration, clipStartTimes, timeToX, totalDuration, xToTime } from "../timeline";

const a = makeClip({ id: "a", sourceDuration: 10, trimStart: 2, trimEnd: 5 }); // 3 s
const b = makeClip({ id: "b", sourceDuration: 8, trimStart: 0, trimEnd: 4 });  // 4 s
const p = makeProject({ clips: [a, b] });

test("clipDuration and totalDuration use trims", () => {
  expect(clipDuration(a)).toBe(3);
  expect(totalDuration(p)).toBe(7);
  expect(totalDuration(makeProject({ clips: [] }))).toBe(0);
});

test("clipStartTimes accumulates", () => {
  expect(clipStartTimes(p)).toEqual([0, 3]);
});

test("clipAt finds the clip under a time with offset", () => {
  expect(clipAt(p, 0)).toEqual({ clip: a, index: 0, offsetInClip: 0 });
  expect(clipAt(p, 2.5)).toEqual({ clip: a, index: 0, offsetInClip: 2.5 });
  expect(clipAt(p, 3)).toEqual({ clip: b, index: 1, offsetInClip: 0 });
  expect(clipAt(p, 6.9)?.clip.id).toBe("b");
});

test("clipAt clamps to the ends and returns null when empty", () => {
  expect(clipAt(p, -1)).toEqual({ clip: a, index: 0, offsetInClip: 0 });
  expect(clipAt(p, 7)).toEqual({ clip: b, index: 1, offsetInClip: 4 });
  expect(clipAt(p, 99)).toEqual({ clip: b, index: 1, offsetInClip: 4 });
  expect(clipAt(makeProject({ clips: [] }), 0)).toBeNull();
});

test("timeToX/xToTime are inverses", () => {
  expect(timeToX(2.5, 40)).toBe(100);
  expect(xToTime(100, 40)).toBe(2.5);
});
```

`src/lib/__tests__/format.test.ts`:
```ts
import { formatDuration, formatDurationPrecise, relativeTime } from "../format";

test("formatDuration", () => {
  expect(formatDuration(0)).toBe("0:00");
  expect(formatDuration(65.4)).toBe("1:05");
  expect(formatDuration(600)).toBe("10:00");
});
test("formatDurationPrecise shows tenths", () => {
  expect(formatDurationPrecise(65.46)).toBe("1:05.5");
});
test("relativeTime", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  expect(relativeTime("2026-10-01T11:59:40Z", now)).toBe("just now");
  expect(relativeTime("2026-10-01T11:30:00Z", now)).toBe("30m ago");
  expect(relativeTime("2026-10-01T09:00:00Z", now)).toBe("3h ago");
  expect(relativeTime("2026-09-28T09:00:00Z", now)).toBe("3d ago");
});
```

- [ ] **Step 2: Run — expect FAIL** (`npm test -- timeline format`): modules not found.

- [ ] **Step 3: Implement**

`src/lib/id.ts`:
```ts
import * as Crypto from "expo-crypto";
export function newId(): string { return Crypto.randomUUID(); }
```
`src/lib/clock.ts`:
```ts
export function nowIso(): string { return new Date().toISOString(); }
```
`src/lib/format.ts`:
```ts
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function formatDurationPrecise(sec: number): string {
  const tenths = Math.round(Math.max(0, sec) * 10);
  const whole = Math.floor(tenths / 10);
  return `${formatDuration(whole)}.${tenths % 10}`;
}
export function relativeTime(iso: string, now: Date = new Date()): string {
  const diff = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
```
`src/editor/model/types.ts`:
```ts
export const ASPECT_RATIOS = ["9:16", "1:1", "16:9"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export const MIN_CLIP_SECONDS = 0.1;

export interface Clip {
  id: string;
  sourceUri: string;
  sourceDuration: number;
  width: number;
  height: number;
  trimStart: number;
  trimEnd: number;
  speed: 1;
  filter: null;
  volume: 1;
  transitionOut: { type: "none"; duration: 0 };
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  aspectRatio: AspectRatio;
  clips: Clip[];
  overlays: never[];
  audioTracks: never[];
  schemaVersion: 1;
}

export function makeClip(partial: Partial<Clip> & Pick<Clip, "id" | "sourceDuration">): Clip {
  return {
    sourceUri: `file:///media/${partial.id}.mp4`, width: 1080, height: 1920,
    trimStart: 0, trimEnd: partial.sourceDuration,
    speed: 1, filter: null, volume: 1, transitionOut: { type: "none", duration: 0 },
    ...partial,
  };
}

export function makeProject(partial: Partial<Project> = {}): Project {
  return {
    id: "p1", name: "Project 1", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
    aspectRatio: "9:16", clips: [], overlays: [], audioTracks: [], schemaVersion: 1,
    ...partial,
  };
}

export function aspectRatioValue(r: AspectRatio): number {
  const [w, h] = r.split(":").map(Number);
  return w / h;
}
```
`src/editor/model/timeline.ts`:
```ts
import type { Clip, Project } from "./types";

export const clipDuration = (c: Clip): number => c.trimEnd - c.trimStart;
export const totalDuration = (p: Project): number => p.clips.reduce((s, c) => s + clipDuration(c), 0);

export function clipStartTimes(p: Project): number[] {
  let t = 0;
  return p.clips.map((c) => { const s = t; t += clipDuration(c); return s; });
}

export type ClipHit = { clip: Clip; index: number; offsetInClip: number };

export function clipAt(p: Project, time: number): ClipHit | null {
  if (p.clips.length === 0) return null;
  const starts = clipStartTimes(p);
  const t = Math.max(0, time);
  const last = p.clips.length - 1;
  if (t >= totalDuration(p)) return { clip: p.clips[last], index: last, offsetInClip: clipDuration(p.clips[last]) };
  for (let i = last; i >= 0; i--) {
    if (t >= starts[i]) return { clip: p.clips[i], index: i, offsetInClip: t - starts[i] };
  }
  return { clip: p.clips[0], index: 0, offsetInClip: 0 };
}

export const timeToX = (t: number, pixelsPerSecond: number): number => t * pixelsPerSecond;
export const xToTime = (x: number, pixelsPerSecond: number): number => x / pixelsPerSecond;
```

- [ ] **Step 4: Run — expect PASS**, typecheck clean.
- [ ] **Step 5: Commit** — `feat: add editor model types, timeline math and formatting helpers`

---

### Task 3: Pure edit operations (TDD)

**Files:**
- Create: `src/editor/model/ops.ts`
- Test: `src/editor/model/__tests__/ops.test.ts`

**Interfaces:**
- Consumes: `types.ts`, `timeline.ts` (Task 2), `newId`, `nowIso`.
- Produces (all `(p: Project, ...) => Project`, returning the **same reference** when nothing changes): `addClips(p, clips)`, `splitClipAt(p, outputTime)`, `trimClip(p, clipId, trimStart, trimEnd)`, `moveClip(p, clipId, toIndex)`, `deleteClip(p, clipId)`, `duplicateClip(p, clipId)`, `setAspectRatio(p, ratio)`, `renameProject(p, name)`. Every change sets `updatedAt = nowIso()`.

- [ ] **Step 1: Write the failing tests**

`src/editor/model/__tests__/ops.test.ts`:
```ts
jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));

import { makeClip, makeProject } from "../types";
import { addClips, deleteClip, duplicateClip, moveClip, renameProject, setAspectRatio, splitClipAt, trimClip } from "../ops";

const a = makeClip({ id: "a", sourceDuration: 10, trimStart: 2, trimEnd: 5 }); // 3 s
const b = makeClip({ id: "b", sourceDuration: 8 });                             // 8 s
const p = makeProject({ clips: [a, b] });

test("addClips appends and stamps updatedAt", () => {
  const c = makeClip({ id: "c", sourceDuration: 1 });
  const next = addClips(p, [c]);
  expect(next.clips.map((x) => x.id)).toEqual(["a", "b", "c"]);
  expect(next.updatedAt).toBe("2026-10-01T10:00:00.000Z");
  expect(p.clips).toHaveLength(2);
  expect(addClips(p, [])).toBe(p);
});

test("splitClipAt splits the clip under the playhead into two trimmed halves", () => {
  const next = splitClipAt(p, 1); // 1 s into clip a → source time 3
  expect(next.clips.map((x) => x.id)).toEqual(["a", "new-id", "b"]);
  expect(next.clips[0]).toMatchObject({ trimStart: 2, trimEnd: 3 });
  expect(next.clips[1]).toMatchObject({ trimStart: 3, trimEnd: 5, sourceUri: a.sourceUri });
});

test("splitClipAt is a no-op at or near a boundary or when empty", () => {
  expect(splitClipAt(p, 0)).toBe(p);
  expect(splitClipAt(p, 3)).toBe(p);        // exactly the a/b boundary
  expect(splitClipAt(p, 2.95)).toBe(p);     // within 0.1 s of the end of a
  expect(splitClipAt(p, 11)).toBe(p);       // at the very end
  const empty = makeProject();
  expect(splitClipAt(empty, 1)).toBe(empty);
});

test("trimClip clamps to the source and enforces the minimum length", () => {
  expect(trimClip(p, "a", -1, 20).clips[0]).toMatchObject({ trimStart: 0, trimEnd: 10 });
  expect(trimClip(p, "a", 4, 4.05)).toBe(p);          // too short → unchanged
  expect(trimClip(p, "zzz", 0, 1)).toBe(p);           // unknown id
  expect(trimClip(p, "a", 2, 5)).toBe(p);             // no change
});

test("moveClip reorders and ignores no-ops", () => {
  expect(moveClip(p, "b", 0).clips.map((x) => x.id)).toEqual(["b", "a"]);
  expect(moveClip(p, "a", 5).clips.map((x) => x.id)).toEqual(["b", "a"]); // clamped
  expect(moveClip(p, "a", 0)).toBe(p);
});

test("deleteClip and duplicateClip", () => {
  expect(deleteClip(p, "a").clips.map((x) => x.id)).toEqual(["b"]);
  expect(deleteClip(p, "nope")).toBe(p);
  const dup = duplicateClip(p, "a");
  expect(dup.clips.map((x) => x.id)).toEqual(["a", "new-id", "b"]);
  expect(dup.clips[1]).toMatchObject({ trimStart: 2, trimEnd: 5 });
});

test("setAspectRatio and renameProject", () => {
  expect(setAspectRatio(p, "1:1").aspectRatio).toBe("1:1");
  expect(setAspectRatio(p, "9:16")).toBe(p);
  expect(renameProject(p, "  My Edit ").name).toBe("My Edit");
  expect(renameProject(p, "   ")).toBe(p);
});
```

- [ ] **Step 2: Run — expect FAIL** (`npm test -- ops`): cannot find `../ops`.

- [ ] **Step 3: Implement `src/editor/model/ops.ts`**

```ts
import { nowIso } from "@/src/lib/clock";
import { newId } from "@/src/lib/id";
import { clipAt, clipDuration } from "./timeline";
import { MIN_CLIP_SECONDS, type AspectRatio, type Clip, type Project } from "./types";

function touch(p: Project, patch: Partial<Project>): Project {
  return { ...p, ...patch, updatedAt: nowIso() };
}

export function addClips(p: Project, clips: Clip[]): Project {
  if (clips.length === 0) return p;
  return touch(p, { clips: [...p.clips, ...clips] });
}

export function splitClipAt(p: Project, outputTime: number): Project {
  const hit = clipAt(p, outputTime);
  if (!hit) return p;
  const { clip, index, offsetInClip } = hit;
  const d = clipDuration(clip);
  if (offsetInClip < MIN_CLIP_SECONDS || d - offsetInClip < MIN_CLIP_SECONDS) return p;
  const cut = clip.trimStart + offsetInClip;
  const left: Clip = { ...clip, trimEnd: cut };
  const right: Clip = { ...clip, id: newId(), trimStart: cut };
  return touch(p, { clips: [...p.clips.slice(0, index), left, right, ...p.clips.slice(index + 1)] });
}

export function trimClip(p: Project, clipId: string, trimStart: number, trimEnd: number): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0) return p;
  const c = p.clips[i];
  const start = Math.max(0, Math.min(trimStart, c.sourceDuration));
  const end = Math.max(0, Math.min(trimEnd, c.sourceDuration));
  if (end - start < MIN_CLIP_SECONDS) return p;
  if (start === c.trimStart && end === c.trimEnd) return p;
  const clips = p.clips.slice();
  clips[i] = { ...c, trimStart: start, trimEnd: end };
  return touch(p, { clips });
}

export function moveClip(p: Project, clipId: string, toIndex: number): Project {
  const from = p.clips.findIndex((c) => c.id === clipId);
  if (from < 0) return p;
  const to = Math.max(0, Math.min(toIndex, p.clips.length - 1));
  if (to === from) return p;
  const clips = p.clips.slice();
  const [c] = clips.splice(from, 1);
  clips.splice(to, 0, c);
  return touch(p, { clips });
}

export function deleteClip(p: Project, clipId: string): Project {
  if (!p.clips.some((c) => c.id === clipId)) return p;
  return touch(p, { clips: p.clips.filter((c) => c.id !== clipId) });
}

export function duplicateClip(p: Project, clipId: string): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0) return p;
  const copy: Clip = { ...p.clips[i], id: newId() };
  return touch(p, { clips: [...p.clips.slice(0, i + 1), copy, ...p.clips.slice(i + 1)] });
}

export function setAspectRatio(p: Project, ratio: AspectRatio): Project {
  return p.aspectRatio === ratio ? p : touch(p, { aspectRatio: ratio });
}

export function renameProject(p: Project, name: string): Project {
  const trimmed = name.trim();
  if (!trimmed || trimmed === p.name) return p;
  return touch(p, { name: trimmed });
}
```

- [ ] **Step 4: Run — expect PASS**; `npm run typecheck` clean.
- [ ] **Step 5: Commit** — `feat: add pure edit operations for the timeline`

---

### Task 4: Editor store with undo/redo, transactions, autosave (TDD)

**Files:**
- Create: `src/editor/store.ts`, `src/editor/useAutosave.ts`
- Test: `src/editor/__tests__/store.test.ts`, `src/editor/__tests__/useAutosave.test.tsx`

**Interfaces:**
- Consumes: `Project`, `totalDuration`, ops (any `(p: Project) => Project`).
- Produces: `useEditorStore` (Zustand) with state `{ project: Project | null; missingClipIds: string[]; selectedClipId: string | null; playhead: number; isPlaying: boolean; pixelsPerSecond: number; past: Project[]; future: Project[]; dirty: boolean }` and actions `setProject(p, missingClipIds?)`, `apply(op)`, `beginTransaction()`, `applyTransient(op)`, `undo()`, `redo()`, `canUndo()`, `canRedo()`, `select(id | null)`, `seek(t)`, `setPlaying(b)`, `setZoom(pps)`, `markSaved()`, `reset()`. Constants `HISTORY_LIMIT = 50`, `MIN_PPS = 20`, `MAX_PPS = 200`, `DEFAULT_PPS = 60`. Type `EditOp = (p: Project) => Project`. Hook `useAutosave(save: (p: Project) => Promise<void>, delayMs = 500)`.

- [ ] **Step 1: Write the failing store tests**

`src/editor/__tests__/store.test.ts`:
```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { deleteClip, setAspectRatio } from "@/src/editor/model/ops";
import { HISTORY_LIMIT, useEditorStore } from "../store";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] });
beforeEach(() => useEditorStore.getState().reset());

test("apply pushes history, marks dirty, clears redo", () => {
  const s = useEditorStore.getState();
  s.setProject(p);
  s.apply((x) => setAspectRatio(x, "1:1"));
  expect(useEditorStore.getState().project?.aspectRatio).toBe("1:1");
  expect(useEditorStore.getState().past).toHaveLength(1);
  expect(useEditorStore.getState().dirty).toBe(true);
  s.undo();
  expect(useEditorStore.getState().project?.aspectRatio).toBe("9:16");
  expect(useEditorStore.getState().future).toHaveLength(1);
  s.redo();
  expect(useEditorStore.getState().project?.aspectRatio).toBe("1:1");
  s.undo();
  s.apply((x) => setAspectRatio(x, "16:9"));
  expect(useEditorStore.getState().future).toHaveLength(0);
});

test("apply with a no-op does not push history", () => {
  const s = useEditorStore.getState();
  s.setProject(p);
  s.apply((x) => setAspectRatio(x, "9:16"));
  expect(useEditorStore.getState().past).toHaveLength(0);
  expect(useEditorStore.getState().dirty).toBe(false);
});

test("history is capped", () => {
  const s = useEditorStore.getState();
  s.setProject(p);
  for (let i = 0; i < HISTORY_LIMIT + 10; i++) s.apply((x) => setAspectRatio(x, i % 2 ? "1:1" : "16:9"));
  expect(useEditorStore.getState().past).toHaveLength(HISTORY_LIMIT);
});

test("deleting the selected clip clears selection and clamps the playhead", () => {
  const s = useEditorStore.getState();
  s.setProject(p);
  s.select("b");
  s.seek(7);
  s.apply((x) => deleteClip(x, "b"));
  expect(useEditorStore.getState().selectedClipId).toBeNull();
  expect(useEditorStore.getState().playhead).toBe(4);
});

test("transactions record one undo step for many transient updates", () => {
  const s = useEditorStore.getState();
  s.setProject(p);
  s.beginTransaction();
  s.applyTransient((x) => setAspectRatio(x, "1:1"));
  s.applyTransient((x) => setAspectRatio(x, "16:9"));
  expect(useEditorStore.getState().past).toHaveLength(1);
  expect(useEditorStore.getState().project?.aspectRatio).toBe("16:9");
  s.undo();
  expect(useEditorStore.getState().project?.aspectRatio).toBe("9:16");
});

test("seek clamps, setZoom clamps", () => {
  const s = useEditorStore.getState();
  s.setProject(p);
  s.seek(-5); expect(useEditorStore.getState().playhead).toBe(0);
  s.seek(99); expect(useEditorStore.getState().playhead).toBe(8);
  s.setZoom(5); expect(useEditorStore.getState().pixelsPerSecond).toBe(20);
  s.setZoom(999); expect(useEditorStore.getState().pixelsPerSecond).toBe(200);
});
```

`src/editor/__tests__/useAutosave.test.tsx`:
```tsx
import { act, renderHook } from "@testing-library/react-native";
import { makeProject } from "@/src/editor/model/types";
import { setAspectRatio } from "@/src/editor/model/ops";
import { useEditorStore } from "../store";
import { useAutosave } from "../useAutosave";

jest.useFakeTimers();
beforeEach(() => useEditorStore.getState().reset());

test("saves once, 500 ms after the last change, then clears dirty", async () => {
  const save = jest.fn(async () => {});
  useEditorStore.getState().setProject(makeProject());
  renderHook(() => useAutosave(save));
  act(() => useEditorStore.getState().apply((p) => setAspectRatio(p, "1:1")));
  act(() => { jest.advanceTimersByTime(300); });
  act(() => useEditorStore.getState().apply((p) => setAspectRatio(p, "16:9")));
  act(() => { jest.advanceTimersByTime(499); });
  expect(save).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0].aspectRatio).toBe("16:9");
  expect(useEditorStore.getState().dirty).toBe(false);
});
```

- [ ] **Step 2: Run — expect FAIL** (`npm test -- store useAutosave`).

- [ ] **Step 3: Implement `src/editor/store.ts`**

```ts
import { create } from "zustand";
import { totalDuration } from "./model/timeline";
import type { Project } from "./model/types";

export const HISTORY_LIMIT = 50;
export const MIN_PPS = 20;
export const MAX_PPS = 200;
export const DEFAULT_PPS = 60;

export type EditOp = (p: Project) => Project;

interface EditorState {
  project: Project | null;
  missingClipIds: string[];
  selectedClipId: string | null;
  playhead: number;
  isPlaying: boolean;
  pixelsPerSecond: number;
  past: Project[];
  future: Project[];
  dirty: boolean;
  setProject: (p: Project, missingClipIds?: string[]) => void;
  apply: (op: EditOp) => void;
  beginTransaction: () => void;
  applyTransient: (op: EditOp) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  select: (id: string | null) => void;
  seek: (t: number) => void;
  setPlaying: (b: boolean) => void;
  setZoom: (pps: number) => void;
  markSaved: () => void;
  reset: () => void;
}

const initial = {
  project: null, missingClipIds: [], selectedClipId: null, playhead: 0, isPlaying: false,
  pixelsPerSecond: DEFAULT_PPS, past: [], future: [], dirty: false,
};

function afterChange(s: EditorState, next: Project): Partial<EditorState> {
  const selected = s.selectedClipId && next.clips.some((c) => c.id === s.selectedClipId) ? s.selectedClipId : null;
  return { project: next, dirty: true, selectedClipId: selected, playhead: Math.min(s.playhead, totalDuration(next)) };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  ...initial,
  setProject: (p, missingClipIds = []) => set({ ...initial, project: p, missingClipIds }),
  apply: (op) => {
    const s = get();
    if (!s.project) return;
    const next = op(s.project);
    if (next === s.project) return;
    set({ ...afterChange(s, next), past: [...s.past, s.project].slice(-HISTORY_LIMIT), future: [] });
  },
  beginTransaction: () => {
    const s = get();
    if (!s.project) return;
    set({ past: [...s.past, s.project].slice(-HISTORY_LIMIT), future: [] });
  },
  applyTransient: (op) => {
    const s = get();
    if (!s.project) return;
    const next = op(s.project);
    if (next === s.project) return;
    set(afterChange(s, next));
  },
  undo: () => {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev || !s.project) return;
    set({ ...afterChange(s, prev), past: s.past.slice(0, -1), future: [s.project, ...s.future] });
  },
  redo: () => {
    const s = get();
    const [next, ...rest] = s.future;
    if (!next || !s.project) return;
    set({ ...afterChange(s, next), past: [...s.past, s.project].slice(-HISTORY_LIMIT), future: rest });
  },
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
  select: (id) => set({ selectedClipId: id }),
  seek: (t) => {
    const p = get().project;
    set({ playhead: Math.max(0, Math.min(t, p ? totalDuration(p) : 0)) });
  },
  setPlaying: (b) => set({ isPlaying: b }),
  setZoom: (pps) => set({ pixelsPerSecond: Math.max(MIN_PPS, Math.min(MAX_PPS, pps)) }),
  markSaved: () => set({ dirty: false }),
  reset: () => set({ ...initial }),
}));
```

`src/editor/useAutosave.ts`:
```ts
import { useEffect, useRef } from "react";
import type { Project } from "./model/types";
import { useEditorStore } from "./store";

/** Saves the project `delayMs` after the last change. Latest project wins; failures are logged, not thrown. */
export function useAutosave(save: (p: Project) => Promise<void>, delayMs = 500) {
  const dirty = useEditorStore((s) => s.dirty);
  const project = useEditorStore((s) => s.project);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dirty || !project) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const latest = useEditorStore.getState().project;
      if (!latest) return;
      save(latest).then(() => useEditorStore.getState().markSaved()).catch((e) => console.warn("autosave failed", e));
    }, delayMs);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [dirty, project, save, delayMs]);
}
```

- [ ] **Step 4: Run — expect PASS**; typecheck clean.
- [ ] **Step 5: Commit** — `feat: add editor store with undo/redo, transactions and autosave`

---

### Task 5: Storage behind an FsAdapter (TDD) + expo-file-system adapter

**Files:**
- Create: `src/projects/fs.ts`, `src/projects/expoFs.ts`, `src/projects/storage.ts`, `src/projects/index.ts`
- Test: `src/projects/__tests__/storage.test.ts`

**Interfaces:**
- Consumes: `Project`, `Clip`, `totalDuration`, `newId`, `nowIso`.
- Produces:
  ```ts
  interface FsAdapter {
    documentDir: string;                       // ends with "/"
    cacheDir: string;                          // ends with "/"
    exists(path: string): Promise<boolean>;
    mkdir(path: string): Promise<void>;        // recursive, idempotent
    readText(path: string): Promise<string>;
    writeText(path: string, text: string): Promise<void>;
    copy(from: string, to: string): Promise<void>;    // overwrites
    move(from: string, to: string): Promise<void>;    // overwrites
    remove(path: string): Promise<void>;              // recursive, ignores missing
    list(dir: string): Promise<string[]>;             // child names only
    freeBytes(): Promise<number>;
  }
  memoryFs(): FsAdapter & { files: Map<string, string>; dirs: Set<string> }
  interface PickedAsset { uri: string; durationSec: number; width: number; height: number; fileName?: string }
  interface ProjectSummary { id: string; name: string; durationSec: number; updatedAt: string; thumbUri: string | null; broken: boolean }
  makeStorage(fs, deps: { thumbnail(uri, timeMs): Promise<string>; newId(): string; nowIso(): string }) → {
    projectDir(id): string
    createProject(name, assets: PickedAsset[]): Promise<{ project: Project; failed: number }>
    listProjects(): Promise<ProjectSummary[]>          // newest first, broken last
    loadProject(id): Promise<{ project: Project; missingClipIds: string[] }>
    saveProject(p): Promise<void>                      // atomic
    deleteProject(id): Promise<void>
    duplicateProject(id): Promise<Project>             // name + " copy"
    renameProject(id, name): Promise<void>
  }
  ```
  `src/projects/index.ts` exports `storage` wired to `expoFs` + `expo-video-thumbnails`, and re-exports the two interfaces.

- [ ] **Step 1: Write the failing tests**

`src/projects/__tests__/storage.test.ts`:
```ts
import { memoryFs } from "../fs";
import { makeStorage, type PickedAsset } from "../storage";

function setup() {
  const fs = memoryFs();
  let n = 0;
  const thumbnail = jest.fn(async (uri: string) => {
    const out = `file:///tmp/thumb-${uri.length}.jpg`;
    fs.files.set(out, "JPEG");
    return out;
  });
  const storage = makeStorage(fs, { thumbnail, newId: () => `id${++n}`, nowIso: () => "2026-10-01T10:00:00.000Z" });
  return { fs, storage, thumbnail };
}
const asset = (uri: string, durationSec = 4): PickedAsset => ({ uri, durationSec, width: 1080, height: 1920, fileName: "clip.mov" });

test("createProject copies media, writes project.json and a thumbnail", async () => {
  const { fs, storage } = setup();
  fs.files.set("file:///picked/a.mov", "A");
  fs.files.set("file:///picked/b.mov", "B");
  const { project, failed } = await storage.createProject("Project 1", [asset("file:///picked/a.mov"), asset("file:///picked/b.mov", 2)]);
  expect(failed).toBe(0);
  expect(project.id).toBe("id1");
  expect(project.clips.map((c) => c.trimEnd)).toEqual([4, 2]);
  expect(project.clips[0].sourceUri).toBe(`${fs.documentDir}projects/id1/media/id2.mov`);
  expect(fs.files.get(`${fs.documentDir}projects/id1/media/id2.mov`)).toBe("A");
  expect(JSON.parse(fs.files.get(`${fs.documentDir}projects/id1/project.json`)!).schemaVersion).toBe(1);
  expect(fs.files.has(`${fs.documentDir}projects/id1/thumb.jpg`)).toBe(true);
});

test("createProject skips unreadable assets and counts them", async () => {
  const { fs, storage } = setup();
  fs.files.set("file:///picked/a.mov", "A");
  const { project, failed } = await storage.createProject("P", [asset("file:///picked/a.mov"), asset("file:///picked/missing.mov")]);
  expect(project.clips).toHaveLength(1);
  expect(failed).toBe(1);
});

test("saveProject is atomic and loadProject round-trips; missing media is reported", async () => {
  const { fs, storage } = setup();
  fs.files.set("file:///picked/a.mov", "A");
  const { project } = await storage.createProject("P", [asset("file:///picked/a.mov")]);
  await storage.saveProject({ ...project, name: "Renamed" });
  expect(fs.files.has(`${fs.documentDir}projects/id1/project.json.tmp`)).toBe(false);
  const loaded = await storage.loadProject("id1");
  expect(loaded.project.name).toBe("Renamed");
  expect(loaded.missingClipIds).toEqual([]);
  fs.files.delete(project.clips[0].sourceUri);
  expect((await storage.loadProject("id1")).missingClipIds).toEqual([project.clips[0].id]);
});

test("loadProject rejects a wrong schemaVersion with a readable error", async () => {
  const { fs, storage } = setup();
  await fs.mkdir(`${fs.documentDir}projects/x`);
  await fs.writeText(`${fs.documentDir}projects/x/project.json`, JSON.stringify({ schemaVersion: 2 }));
  await expect(storage.loadProject("x")).rejects.toThrow(/schemaVersion/);
});

test("listProjects summarises, newest first, and flags broken files", async () => {
  const { fs, storage } = setup();
  fs.files.set("file:///picked/a.mov", "A");
  await storage.createProject("First", [asset("file:///picked/a.mov", 3)]);
  await fs.mkdir(`${fs.documentDir}projects/bad`);
  await fs.writeText(`${fs.documentDir}projects/bad/project.json`, "{not json");
  const list = await storage.listProjects();
  expect(list.map((s) => [s.id, s.broken])).toEqual([["id1", false], ["bad", true]]);
  expect(list[0]).toMatchObject({ name: "First", durationSec: 3, thumbUri: `${fs.documentDir}projects/id1/thumb.jpg` });
});

test("deleteProject, duplicateProject, renameProject", async () => {
  const { fs, storage } = setup();
  fs.files.set("file:///picked/a.mov", "A");
  const { project } = await storage.createProject("P", [asset("file:///picked/a.mov")]);
  const copy = await storage.duplicateProject(project.id);
  expect(copy.id).not.toBe(project.id);
  expect(copy.name).toBe("P copy");
  expect(fs.files.get(copy.clips[0].sourceUri)).toBe("A");
  await storage.renameProject(copy.id, "Second");
  expect((await storage.loadProject(copy.id)).project.name).toBe("Second");
  await storage.deleteProject(project.id);
  expect((await storage.listProjects()).map((s) => s.id)).toEqual([copy.id]);
});
```

- [ ] **Step 2: Run — expect FAIL** (`npm test -- storage`).

- [ ] **Step 3: Implement `src/projects/fs.ts`**

```ts
export interface FsAdapter {
  documentDir: string;
  cacheDir: string;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  list(dir: string): Promise<string[]>;
  freeBytes(): Promise<number>;
}

const norm = (p: string) => p.replace(/\/+$/, "");

/** In-memory adapter for tests. Files keyed by full path; directories tracked separately. */
export function memoryFs(): FsAdapter & { files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const inDir = (dir: string, p: string) => p.startsWith(norm(dir) + "/");
  const childName = (dir: string, p: string) => p.slice(norm(dir).length + 1).split("/")[0];
  const copy = async (from: string, to: string) => {
    const t = files.get(norm(from));
    if (t === undefined) throw new Error(`ENOENT ${from}`);
    files.set(norm(to), t);
  };
  return {
    files, dirs,
    documentDir: "file:///doc/", cacheDir: "file:///cache/",
    async exists(p) { const n = norm(p); return files.has(n) || dirs.has(n) || [...files.keys()].some((f) => inDir(n, f)); },
    async mkdir(p) { dirs.add(norm(p)); },
    async readText(p) { const t = files.get(norm(p)); if (t === undefined) throw new Error(`ENOENT ${p}`); return t; },
    async writeText(p, text) { files.set(norm(p), text); },
    copy,
    async move(from, to) { await copy(from, to); files.delete(norm(from)); },
    async remove(p) {
      const n = norm(p); files.delete(n); dirs.delete(n);
      for (const f of [...files.keys()]) if (inDir(n, f)) files.delete(f);
      for (const d of [...dirs]) if (inDir(n, d)) dirs.delete(d);
    },
    async list(dir) {
      const names = new Set<string>();
      for (const f of files.keys()) if (inDir(dir, f)) names.add(childName(dir, f));
      for (const d of dirs) if (inDir(dir, d)) names.add(childName(dir, d));
      return [...names];
    },
    async freeBytes() { return 10 * 1024 ** 3; },
  };
}
```

- [ ] **Step 4: Implement `src/projects/storage.ts`**

```ts
import { totalDuration } from "@/src/editor/model/timeline";
import type { Clip, Project } from "@/src/editor/model/types";
import type { FsAdapter } from "./fs";

export interface PickedAsset { uri: string; durationSec: number; width: number; height: number; fileName?: string }
export interface ProjectSummary { id: string; name: string; durationSec: number; updatedAt: string; thumbUri: string | null; broken: boolean }
export interface StorageDeps { thumbnail(uri: string, timeMs: number): Promise<string>; newId(): string; nowIso(): string }

const ext = (a: PickedAsset) => { const m = /\.([A-Za-z0-9]+)$/.exec(a.fileName ?? a.uri); return (m?.[1] ?? "mp4").toLowerCase(); };

export function makeStorage(fs: FsAdapter, deps: StorageDeps) {
  const root = `${fs.documentDir}projects`;
  const projectDir = (id: string) => `${root}/${id}`;
  const jsonPath = (id: string) => `${projectDir(id)}/project.json`;
  const thumbPath = (id: string) => `${projectDir(id)}/thumb.jpg`;

  function parse(text: string): Project {
    const raw = JSON.parse(text) as Partial<Project>;
    if (raw.schemaVersion !== 1) throw new Error(`Unsupported project schemaVersion: ${String(raw.schemaVersion)}`);
    if (!raw.id || !Array.isArray(raw.clips)) throw new Error("Project file is missing required fields");
    return { overlays: [], audioTracks: [], ...raw } as Project;
  }

  async function saveProject(p: Project): Promise<void> {
    await fs.mkdir(projectDir(p.id));
    const tmp = `${jsonPath(p.id)}.tmp`;
    await fs.writeText(tmp, JSON.stringify(p));
    await fs.move(tmp, jsonPath(p.id));
  }

  async function loadProject(id: string) {
    const project = parse(await fs.readText(jsonPath(id)));
    const missingClipIds: string[] = [];
    for (const c of project.clips) if (!(await fs.exists(c.sourceUri))) missingClipIds.push(c.id);
    return { project, missingClipIds };
  }

  async function writeThumb(p: Project): Promise<void> {
    const first = p.clips[0];
    if (!first) return;
    try {
      const tmp = await deps.thumbnail(first.sourceUri, Math.min(500, Math.max(0, first.sourceDuration * 1000 - 1)));
      await fs.copy(tmp, thumbPath(p.id));
    } catch (e) { console.warn("thumbnail failed", e); }
  }

  async function createProject(name: string, assets: PickedAsset[]) {
    const id = deps.newId();
    const now = deps.nowIso();
    await fs.mkdir(`${projectDir(id)}/media`);
    const clips: Clip[] = [];
    let failed = 0;
    for (const a of assets) {
      const clipId = deps.newId();
      const dest = `${projectDir(id)}/media/${clipId}.${ext(a)}`;
      try {
        await fs.copy(a.uri, dest);
        clips.push({ id: clipId, sourceUri: dest, sourceDuration: a.durationSec, width: a.width, height: a.height,
          trimStart: 0, trimEnd: a.durationSec, speed: 1, filter: null, volume: 1, transitionOut: { type: "none", duration: 0 } });
      } catch (e) { failed++; console.warn("import failed", a.uri, e); }
    }
    const project: Project = { id, name, createdAt: now, updatedAt: now, aspectRatio: "9:16", clips, overlays: [], audioTracks: [], schemaVersion: 1 };
    await saveProject(project);
    await writeThumb(project);
    return { project, failed };
  }

  async function listProjects(): Promise<ProjectSummary[]> {
    if (!(await fs.exists(root))) return [];
    const out: ProjectSummary[] = [];
    for (const id of await fs.list(root)) {
      try {
        const p = parse(await fs.readText(jsonPath(id)));
        out.push({ id: p.id, name: p.name, durationSec: totalDuration(p), updatedAt: p.updatedAt,
          thumbUri: (await fs.exists(thumbPath(id))) ? thumbPath(id) : null, broken: false });
      } catch { out.push({ id, name: "Can't open", durationSec: 0, updatedAt: "", thumbUri: null, broken: true }); }
    }
    return out.sort((a, b) => Number(a.broken) - Number(b.broken) || b.updatedAt.localeCompare(a.updatedAt));
  }

  async function duplicateProject(id: string): Promise<Project> {
    const { project } = await loadProject(id);
    const copyId = deps.newId();
    await fs.mkdir(`${projectDir(copyId)}/media`);
    const clips: Clip[] = [];
    for (const c of project.clips) {
      const dest = c.sourceUri.replace(projectDir(id), projectDir(copyId));
      await fs.copy(c.sourceUri, dest);
      clips.push({ ...c, sourceUri: dest });
    }
    const copy: Project = { ...project, id: copyId, name: `${project.name} copy`, clips, createdAt: deps.nowIso(), updatedAt: deps.nowIso() };
    await saveProject(copy);
    if (await fs.exists(thumbPath(id))) await fs.copy(thumbPath(id), thumbPath(copyId));
    return copy;
  }

  async function renameProject(id: string, name: string): Promise<void> {
    const { project } = await loadProject(id);
    await saveProject({ ...project, name: name.trim() || project.name, updatedAt: deps.nowIso() });
  }

  return {
    projectDir, createProject, listProjects, loadProject, saveProject,
    deleteProject: async (id: string) => { await fs.remove(projectDir(id)); },
    duplicateProject, renameProject,
  };
}

export type Storage = ReturnType<typeof makeStorage>;
```

- [ ] **Step 5: Run — expect PASS.**

- [ ] **Step 6: Implement the device adapter `src/projects/expoFs.ts`**

Written against the SDK 57 class API (`File`, `Directory`, `Paths`). If a member doesn't typecheck, look it up in `node_modules/expo-file-system/build/ExpoFileSystem.types.d.ts` (`NativeFileSystemFile`, `NativeFileSystemDirectory`) and `Paths.d.ts`; keep the adapter's documented behavior.
```ts
import { Directory, File, Paths } from "expo-file-system";
import type { FsAdapter } from "./fs";

const withSlash = (uri: string) => (uri.endsWith("/") ? uri : uri + "/");
const dirExists = (uri: string) => { try { return new Directory(uri).exists; } catch { return false; } };

export const expoFs: FsAdapter = {
  documentDir: withSlash(Paths.document.uri),
  cacheDir: withSlash(Paths.cache.uri),
  async exists(p) { return new File(p).exists || dirExists(p); },
  async mkdir(p) { const d = new Directory(p); if (!d.exists) d.create({ intermediates: true, idempotent: true }); },
  async readText(p) { return await new File(p).text(); },
  async writeText(p, text) {
    const f = new File(p);
    const parent = f.parentDirectory;
    if (!parent.exists) parent.create({ intermediates: true, idempotent: true });
    f.write(text);
  },
  async copy(from, to) { const dst = new File(to); if (dst.exists) dst.delete(); new File(from).copy(dst); },
  async move(from, to) { const dst = new File(to); if (dst.exists) dst.delete(); new File(from).move(dst); },
  async remove(p) {
    const d = new Directory(p);
    if (d.exists) { d.delete(); return; }
    const f = new File(p);
    if (f.exists) f.delete();
  },
  async list(dir) { const d = new Directory(dir); return d.exists ? d.list().map((e) => e.name) : []; },
  async freeBytes() { return Paths.availableDiskSpace; },
};
```

`src/projects/index.ts`:
```ts
import * as VideoThumbnails from "expo-video-thumbnails";
import { nowIso } from "@/src/lib/clock";
import { newId } from "@/src/lib/id";
import { expoFs } from "./expoFs";
import { makeStorage } from "./storage";

export const storage = makeStorage(expoFs, {
  thumbnail: async (uri, timeMs) => (await VideoThumbnails.getThumbnailAsync(uri, { time: timeMs, quality: 0.6 })).uri,
  newId,
  nowIso,
});
export type { PickedAsset, ProjectSummary } from "./storage";
```

- [ ] **Step 7: Typecheck + full `npm test`**, then **commit** — `feat: add project storage with atomic saves behind an FsAdapter`

---

### Task 6: UI primitives

**Files:**
- Create: `src/ui/Text.tsx`, `src/ui/PrimaryButton.tsx`, `src/ui/ToolButton.tsx`, `src/ui/Chip.tsx`, `src/ui/Sheet.tsx`, `src/ui/Toast.tsx`, `src/ui/IconButton.tsx`
- Test: `src/ui/__tests__/primitives.test.tsx`

**Interfaces:**
- Produces: `<Heading>` (Bangers), `<Body muted?>`, `<PrimaryButton title onPress disabled? icon?>`, `<ToolButton label icon onPress disabled? active?>`, `<Chip label selected onPress disabled?>`, `<Sheet visible onClose title children>`, `<IconButton name onPress disabled? accessibilityLabel>`, `useToast()` store with `show(message)` and `<ToastHost/>`. Icons come from `@expo/vector-icons` (`Ionicons`, already a dependency of Expo) — `icon` props are Ionicons glyph names.

- [ ] **Step 1: Write the failing tests**

`src/ui/__tests__/primitives.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Chip } from "../Chip";
import { PrimaryButton } from "../PrimaryButton";
import { ToolButton } from "../ToolButton";
import { ToastHost, useToast } from "../Toast";
import { theme } from "@/src/theme/theme";

test("PrimaryButton calls onPress and respects disabled", () => {
  const onPress = jest.fn();
  render(<PrimaryButton title="New Project" onPress={onPress} />);
  fireEvent.press(screen.getByText("New Project"));
  expect(onPress).toHaveBeenCalledTimes(1);
  render(<PrimaryButton title="Off" onPress={onPress} disabled />);
  fireEvent.press(screen.getByText("Off"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("ToolButton is dimmed and inert when disabled", () => {
  const onPress = jest.fn();
  render(<ToolButton label="Split" icon="cut" onPress={onPress} disabled />);
  const btn = screen.getByRole("button", { name: "Split" });
  expect(btn).toBeDisabled();
  fireEvent.press(btn);
  expect(onPress).not.toHaveBeenCalled();
});

test("Chip shows selection state", () => {
  render(<Chip label="9:16" selected onPress={() => {}} />);
  expect(screen.getByRole("button", { name: "9:16" })).toHaveAccessibilityState({ selected: true });
});

test("ToastHost shows the latest message", () => {
  render(<ToastHost />);
  useToast.getState().show("2 of 3 clips added");
  expect(screen.getByText("2 of 3 clips added")).toBeTruthy();
});

test("theme accent is used by PrimaryButton", () => {
  render(<PrimaryButton title="Go" onPress={() => {}} />);
  expect(screen.getByTestId("primary-button")).toHaveStyle({ backgroundColor: theme.colors.accent });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npm test -- primitives`).

- [ ] **Step 3: Implement**

`src/ui/Text.tsx`:
```tsx
import { Text, type TextProps } from "react-native";
import { theme } from "@/src/theme/theme";

export function Heading({ style, ...rest }: TextProps) {
  return <Text {...rest} style={[{ fontFamily: theme.fonts.heading, fontSize: 28, color: theme.colors.text, letterSpacing: 1 }, style]} />;
}
export function Body({ muted, style, ...rest }: TextProps & { muted?: boolean }) {
  return <Text {...rest} style={[{ fontSize: 15, color: muted ? theme.colors.textMuted : theme.colors.text }, style]} />;
}
```

`src/ui/PrimaryButton.tsx`:
```tsx
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { theme } from "@/src/theme/theme";

type Props = { title: string; onPress: () => void; disabled?: boolean; icon?: React.ReactNode };

export function PrimaryButton({ title, onPress, disabled, icon }: Props) {
  return (
    <Pressable
      testID="primary-button"
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.colors.accentPressed : theme.colors.accent,
        opacity: disabled ? 0.4 : 1,
        borderRadius: theme.radius.card,
        paddingVertical: theme.space.lg,
        paddingHorizontal: theme.space.xl,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.space.sm,
      })}
    >
      {icon ?? null}
      <Text style={{ fontFamily: theme.fonts.heading, fontSize: 22, color: theme.colors.text, letterSpacing: 1 }}>{title}</Text>
    </Pressable>
  );
}
export { Ionicons };
```

`src/ui/ToolButton.tsx`:
```tsx
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text } from "react-native";
import { theme } from "@/src/theme/theme";

type Props = { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean; active?: boolean };

export function ToolButton({ label, icon, onPress, disabled, active }: Props) {
  const color = active ? theme.colors.highlight : theme.colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ alignItems: "center", width: 72, paddingVertical: theme.space.sm, opacity: disabled ? 0.35 : pressed ? 0.7 : 1 })}
    >
      <Ionicons name={icon} size={24} color={color} />
      <Text style={{ color, fontSize: 12, marginTop: 4 }}>{label}</Text>
    </Pressable>
  );
}
```

`src/ui/Chip.tsx`:
```tsx
import { Pressable, Text } from "react-native";
import { theme } from "@/src/theme/theme";

type Props = { label: string; selected: boolean; onPress: () => void; disabled?: boolean };

export function Chip({ label, selected, onPress, disabled }: Props) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled} onPress={onPress}
      style={{
        paddingVertical: theme.space.sm, paddingHorizontal: theme.space.lg, borderRadius: theme.radius.chip,
        backgroundColor: selected ? theme.colors.accent : theme.colors.surfaceAlt,
        borderWidth: 1, borderColor: selected ? theme.colors.accent : theme.colors.straw, opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ color: theme.colors.text, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}
```

`src/ui/Sheet.tsx` (bottom sheet via `Modal`):
```tsx
import { Modal, Pressable, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Heading } from "./Text";

type Props = { visible: boolean; onClose: () => void; title: string; children: React.ReactNode };

export function Sheet({ visible, onClose, title, children }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={onClose} accessibilityLabel="Close sheet" />
      <View style={{ backgroundColor: theme.colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: theme.space.xl, paddingBottom: theme.space.xxl, gap: theme.space.lg }}>
        <Heading style={{ fontSize: 22 }}>{title}</Heading>
        {children}
      </View>
    </Modal>
  );
}
```

`src/ui/IconButton.tsx`:
```tsx
import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";
import { theme } from "@/src/theme/theme";

type Props = { name: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean; accessibilityLabel: string; color?: string };

export function IconButton({ name, onPress, disabled, accessibilityLabel, color = theme.colors.text }: Props) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: !!disabled }}
      disabled={disabled} onPress={onPress} hitSlop={8}
      style={({ pressed }) => ({ padding: theme.space.sm, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 })}>
      <Ionicons name={name} size={24} color={color} />
    </Pressable>
  );
}
```

`src/ui/Toast.tsx`:
```tsx
import { useEffect } from "react";
import { Text, View } from "react-native";
import { create } from "zustand";
import { theme } from "@/src/theme/theme";

type ToastState = { message: string | null; stamp: number; show: (message: string) => void; clear: () => void };
export const useToast = create<ToastState>((set) => ({
  message: null, stamp: 0,
  show: (message) => set({ message, stamp: Date.now() }),
  clear: () => set({ message: null }),
}));

/** Mount once near the root of a screen. Shows the latest message for 2.5 s. */
export function ToastHost() {
  const { message, stamp, clear } = useToast();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(clear, 2500);
    return () => clearTimeout(t);
  }, [message, stamp, clear]);
  if (!message) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 16, right: 16, bottom: 100, alignItems: "center" }}>
      <View style={{ backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.straw, borderWidth: 1, borderRadius: theme.radius.pill, paddingVertical: 10, paddingHorizontal: 18 }}>
        <Text style={{ color: theme.colors.text }}>{message}</Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run — expect PASS**; typecheck clean. (If `toHaveStyle` can't read the Pressable function style, assert on `getByTestId("primary-button").props.style` resolved with `{ pressed: false }`.)
- [ ] **Step 5: Commit** — `feat: add themed UI primitives`

---

### Task 7: Projects screen

**Files:**
- Create: `src/projects/ProjectCard.tsx`, `src/projects/useProjects.ts`, `src/projects/pickVideos.ts`
- Modify: `app/index.tsx` (replace the Phase 0 test screen)
- Test: `src/projects/__tests__/ProjectsScreen.test.tsx`

**Interfaces:**
- Consumes: `storage` (Task 5), UI primitives (Task 6), `formatDuration`, `relativeTime`, `Mark`, `theme`.
- Produces: `pickVideos(): Promise<PickedAsset[] | null>` (null = cancelled or permission denied, with a toast on denial), `useProjects()` → `{ projects, loading, reload, create(), rename(id, name), duplicate(id), remove(id) }`, `<ProjectCard summary onPress onLongPress/>`. Route `/` and `router.push("/editor/[id]")` after create.

- [ ] **Step 1: Write the failing test**

`src/projects/__tests__/ProjectsScreen.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const push = jest.fn();
jest.mock("expo-router", () => ({ router: { push }, useFocusEffect: (cb: () => void) => { const React = require("react"); React.useEffect(cb, []); } }));
jest.mock("@/src/projects/pickVideos", () => ({ pickVideos: jest.fn() }));
jest.mock("@/src/projects", () => ({
  storage: {
    listProjects: jest.fn(), createProject: jest.fn(), renameProject: jest.fn(), duplicateProject: jest.fn(), deleteProject: jest.fn(),
  },
}));

import { storage } from "@/src/projects";
import { pickVideos } from "@/src/projects/pickVideos";
import ProjectsScreen from "@/app/index";

const list = storage.listProjects as jest.Mock;

test("shows the empty state, then creates a project from picked videos and opens the editor", async () => {
  list.mockResolvedValueOnce([]);
  (pickVideos as jest.Mock).mockResolvedValueOnce([{ uri: "file:///a.mov", durationSec: 3, width: 1080, height: 1920 }]);
  (storage.createProject as jest.Mock).mockResolvedValueOnce({ project: { id: "p9" }, failed: 0 });
  render(<ProjectsScreen />);
  expect(await screen.findByText("No projects yet")).toBeTruthy();
  fireEvent.press(screen.getByText("New Project"));
  await waitFor(() => expect(storage.createProject).toHaveBeenCalledWith("Project 1", expect.any(Array)));
  expect(push).toHaveBeenCalledWith("/editor/p9");
});

test("lists projects with duration and marks broken ones", async () => {
  list.mockResolvedValueOnce([
    { id: "a", name: "Beach", durationSec: 65, updatedAt: new Date().toISOString(), thumbUri: null, broken: false },
    { id: "b", name: "Can't open", durationSec: 0, updatedAt: "", thumbUri: null, broken: true },
  ]);
  render(<ProjectsScreen />);
  expect(await screen.findByText("Beach")).toBeTruthy();
  expect(screen.getByText("1:05")).toBeTruthy();
  expect(screen.getByText("Can't open")).toBeTruthy();
  fireEvent.press(screen.getByText("Beach"));
  expect(push).toHaveBeenCalledWith("/editor/a");
});
```

- [ ] **Step 2: Run — expect FAIL** (`npm test -- ProjectsScreen`).

- [ ] **Step 3: Implement `src/projects/pickVideos.ts`**

```ts
import * as ImagePicker from "expo-image-picker";
import { Linking } from "react-native";
import { useToast } from "@/src/ui/Toast";
import type { PickedAsset } from "./storage";

/** Opens the camera roll for multi-select videos. Returns null if cancelled or denied. */
export async function pickVideos(): Promise<PickedAsset[] | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    useToast.getState().show("Clipy needs Photos access to import clips. Open Settings to allow it.");
    if (!perm.canAskAgain) Linking.openSettings().catch(() => {});
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], allowsMultipleSelection: true, selectionLimit: 20, quality: 1 });
  if (result.canceled) return null;
  return result.assets.map((a) => ({
    uri: a.uri,
    durationSec: (a.duration ?? 0) / 1000,
    width: a.width,
    height: a.height,
    fileName: a.fileName ?? undefined,
  }));
}
```
Note: `expo-image-picker` returns `duration` in **milliseconds** on iOS; if the SDK 57 types say seconds, adjust and verify on device (a 3 s clip must show `0:03`).

- [ ] **Step 4: Implement `src/projects/useProjects.ts`**

```ts
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { storage, type ProjectSummary } from "@/src/projects";
import { useToast } from "@/src/ui/Toast";
import { pickVideos } from "./pickVideos";

export function useProjects() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try { setProjects(await storage.listProjects()); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  async function create(): Promise<string | null> {
    const assets = await pickVideos();
    if (!assets || assets.length === 0) return null;
    const name = `Project ${projects.filter((p) => !p.broken).length + 1}`;
    const { project, failed } = await storage.createProject(name, assets);
    if (failed > 0) useToast.getState().show(`${assets.length - failed} of ${assets.length} clips added; ${failed} couldn't be read`);
    await reload();
    return project.id;
  }
  async function rename(id: string, name: string) { await storage.renameProject(id, name); await reload(); }
  async function duplicate(id: string) { await storage.duplicateProject(id); await reload(); }
  async function remove(id: string) { await storage.deleteProject(id); await reload(); }

  return { projects, loading, reload, create, rename, duplicate, remove };
}
```

- [ ] **Step 5: Implement `src/projects/ProjectCard.tsx`**

```tsx
import { Image, Pressable, Text, View } from "react-native";
import { formatDuration, relativeTime } from "@/src/lib/format";
import { theme } from "@/src/theme/theme";
import type { ProjectSummary } from "./storage";

type Props = { summary: ProjectSummary; onPress: () => void; onLongPress: () => void };

export function ProjectCard({ summary, onPress, onLongPress }: Props) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={summary.name} onPress={onPress} onLongPress={onLongPress} delayLongPress={350}
      style={({ pressed }) => ({ flex: 1, margin: theme.space.sm, borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.straw,
        backgroundColor: theme.colors.surface, overflow: "hidden", opacity: pressed ? 0.85 : 1 })}>
      <View style={{ aspectRatio: 9 / 16, maxHeight: 180, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
        {summary.thumbUri ? <Image source={{ uri: summary.thumbUri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          : <Text style={{ color: theme.colors.textMuted }}>{summary.broken ? "!" : "No preview"}</Text>}
      </View>
      <View style={{ padding: theme.space.md, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: summary.broken ? theme.colors.danger : theme.colors.text, fontWeight: "600" }}>{summary.name}</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>{formatDuration(summary.durationSec)}</Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>{summary.updatedAt ? relativeTime(summary.updatedAt) : ""}</Text>
        </View>
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 6: Replace `app/index.tsx`**

```tsx
import { router } from "expo-router";
import { ActivityIndicator, Alert, FlatList, Image, View } from "react-native";
import { ProjectCard } from "@/src/projects/ProjectCard";
import { useProjects } from "@/src/projects/useProjects";
import type { ProjectSummary } from "@/src/projects";
import { Mark } from "@/src/theme/Mark";
import { theme } from "@/src/theme/theme";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Body, Heading } from "@/src/ui/Text";
import { ToastHost } from "@/src/ui/Toast";

export default function ProjectsScreen() {
  const { projects, loading, create, rename, duplicate, remove } = useProjects();

  function onLongPress(p: ProjectSummary) {
    if (p.broken) {
      Alert.alert("Can't open this project", "Its file is damaged.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => remove(p.id) }]);
      return;
    }
    Alert.alert(p.name, undefined, [
      { text: "Rename", onPress: () => Alert.prompt("Rename project", undefined, (name) => name && rename(p.id, name), "plain-text", p.name) },
      { text: "Duplicate", onPress: () => duplicate(p.id) },
      { text: "Delete", style: "destructive", onPress: () => Alert.alert("Delete project?", "This can't be undone.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => remove(p.id) }]) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function onNew() {
    const id = await create();
    if (id) router.push(`/editor/${id}`);
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: 60 }}>
      {theme.projectsWallpaper ? <Image source={theme.projectsWallpaper} style={{ position: "absolute", width: "100%", height: "100%", opacity: 0.3 }} resizeMode="cover" /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingHorizontal: theme.space.lg, marginBottom: theme.space.md }}>
        <Mark size={28} />
        <Heading style={{ fontSize: 36 }}>Clipy</Heading>
      </View>
      {loading ? <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 40 }} /> : projects.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.space.md, padding: theme.space.xxl }}>
          <Mark size={56} />
          <Heading>No projects yet</Heading>
          <Body muted>Tap New Project to start</Body>
        </View>
      ) : (
        <FlatList data={projects} numColumns={2} keyExtractor={(p) => p.id} contentContainerStyle={{ padding: theme.space.sm, paddingBottom: 120 }}
          renderItem={({ item }) => <ProjectCard summary={item} onPress={() => (item.broken ? onLongPress(item) : router.push(`/editor/${item.id}`))} onLongPress={() => onLongPress(item)} />} />
      )}
      <View style={{ position: "absolute", left: theme.space.lg, right: theme.space.lg, bottom: theme.space.xxl }}>
        <PrimaryButton title="New Project" onPress={onNew} />
      </View>
      <ToastHost />
    </View>
  );
}
```

- [ ] **Step 7: Run — expect PASS**; typecheck clean. Then on the phone (`npx expo start --go`): the Projects screen renders with the empty state; New Project opens the camera roll; picking two videos creates "Project 1" (editor route will 404 until Task 8 — that's expected; go back and confirm the card appears with a thumbnail and duration).
- [ ] **Step 8: Commit** — `feat: add Projects screen with import, cards and actions`

---

### Task 8: Editor screen shell (load, top bar, undo/redo, autosave)

**Files:**
- Create: `app/editor/[id]/index.tsx`, `src/editor/components/EditorTopBar.tsx`, `src/editor/useLoadProject.ts`
- Test: `src/editor/__tests__/EditorTopBar.test.tsx`, `src/editor/__tests__/useLoadProject.test.tsx`

**Interfaces:**
- Consumes: `useEditorStore`, `useAutosave`, `storage.loadProject/saveProject`, `renameProject` op, UI primitives.
- Produces: `useLoadProject(id)` → `{ status: "loading" | "ready" | "error"; error?: string }` (calls `setProject` and resets on unmount), `<EditorTopBar onExport/>`. The screen renders placeholders where `PreviewPlayer` (Task 9), `Timeline` (Task 10) and `EditorToolbar` (Task 12) go — each later task replaces its placeholder `View` with `testID="slot-preview" | "slot-timeline" | "slot-toolbar"`.

- [ ] **Step 1: Write the failing tests**

`src/editor/__tests__/EditorTopBar.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { setAspectRatio } from "@/src/editor/model/ops";
import { makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { EditorTopBar } from "../components/EditorTopBar";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ name: "Beach" })); });

test("undo/redo buttons reflect history and work", () => {
  const onExport = jest.fn();
  render(<EditorTopBar onExport={onExport} />);
  expect(screen.getByLabelText("Undo")).toBeDisabled();
  useEditorStore.getState().apply((p) => setAspectRatio(p, "1:1"));
  expect(screen.getByLabelText("Undo")).toBeEnabled();
  fireEvent.press(screen.getByLabelText("Undo"));
  expect(useEditorStore.getState().project?.aspectRatio).toBe("9:16");
  expect(screen.getByLabelText("Redo")).toBeEnabled();
  fireEvent.press(screen.getByText("Export"));
  expect(onExport).toHaveBeenCalled();
  expect(screen.getByText("Beach")).toBeTruthy();
});
```

`src/editor/__tests__/useLoadProject.test.tsx`:
```tsx
import { renderHook, waitFor } from "@testing-library/react-native";
jest.mock("@/src/projects", () => ({ storage: { loadProject: jest.fn() } }));
import { makeProject } from "@/src/editor/model/types";
import { storage } from "@/src/projects";
import { useEditorStore } from "@/src/editor/store";
import { useLoadProject } from "../useLoadProject";

beforeEach(() => useEditorStore.getState().reset());

test("loads the project into the store and reports missing clips", async () => {
  (storage.loadProject as jest.Mock).mockResolvedValueOnce({ project: makeProject({ id: "p1" }), missingClipIds: ["x"] });
  const { result, unmount } = renderHook(() => useLoadProject("p1"));
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(useEditorStore.getState().project?.id).toBe("p1");
  expect(useEditorStore.getState().missingClipIds).toEqual(["x"]);
  unmount();
  expect(useEditorStore.getState().project).toBeNull();
});

test("reports a readable error", async () => {
  (storage.loadProject as jest.Mock).mockRejectedValueOnce(new Error("Unsupported project schemaVersion: 2"));
  const { result } = renderHook(() => useLoadProject("bad"));
  await waitFor(() => expect(result.current.status).toBe("error"));
  expect(result.current.error).toMatch(/schemaVersion/);
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

`src/editor/useLoadProject.ts`:
```ts
import { useEffect, useState } from "react";
import { storage } from "@/src/projects";
import { useEditorStore } from "./store";

export function useLoadProject(id: string) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; error?: string }>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    storage.loadProject(id)
      .then(({ project, missingClipIds }) => { if (!alive) return; useEditorStore.getState().setProject(project, missingClipIds); setState({ status: "ready" }); })
      .catch((e: unknown) => { if (alive) setState({ status: "error", error: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; useEditorStore.getState().reset(); };
  }, [id]);
  return state;
}
```

`src/editor/components/EditorTopBar.tsx`:
```tsx
import { router } from "expo-router";
import { Alert, Pressable, Text, View } from "react-native";
import { renameProject } from "@/src/editor/model/ops";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { IconButton } from "@/src/ui/IconButton";

export function EditorTopBar({ onExport }: { onExport: () => void }) {
  const name = useEditorStore((s) => s.project?.name ?? "");
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const { undo, redo, apply } = useEditorStore.getState();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: theme.space.sm, paddingTop: 54, paddingBottom: theme.space.sm, gap: theme.space.xs }}>
      <IconButton name="chevron-back" accessibilityLabel="Back" onPress={() => router.back()} />
      <Pressable style={{ flex: 1 }} onPress={() => Alert.prompt("Rename project", undefined, (n) => n && apply((p) => renameProject(p, n)), "plain-text", name)}>
        <Text numberOfLines={1} style={{ fontFamily: theme.fonts.heading, fontSize: 22, color: theme.colors.text, letterSpacing: 1 }}>{name}</Text>
      </Pressable>
      <IconButton name="arrow-undo" accessibilityLabel="Undo" disabled={!canUndo} onPress={undo} />
      <IconButton name="arrow-redo" accessibilityLabel="Redo" disabled={!canRedo} onPress={redo} />
      <Pressable accessibilityRole="button" onPress={onExport}
        style={({ pressed }) => ({ backgroundColor: pressed ? theme.colors.accentPressed : theme.colors.accent, borderRadius: theme.radius.pill, paddingVertical: 8, paddingHorizontal: 16, marginLeft: theme.space.xs })}>
        <Text style={{ fontFamily: theme.fonts.heading, fontSize: 18, color: theme.colors.text, letterSpacing: 1 }}>Export</Text>
      </Pressable>
    </View>
  );
}
```

`app/editor/[id]/index.tsx`:
```tsx
import { router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, View } from "react-native";
import { EditorTopBar } from "@/src/editor/components/EditorTopBar";
import type { Project } from "@/src/editor/model/types";
import { useAutosave } from "@/src/editor/useAutosave";
import { useLoadProject } from "@/src/editor/useLoadProject";
import { storage } from "@/src/projects";
import { theme } from "@/src/theme/theme";
import { Body, Heading } from "@/src/ui/Text";
import { ToastHost } from "@/src/ui/Toast";

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useLoadProject(id);
  const save = useCallback((p: Project) => storage.saveProject(p), []);
  useAutosave(save);

  if (load.status === "loading") return <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center" }}><ActivityIndicator color={theme.colors.accent} /></View>;
  if (load.status === "error") return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center", alignItems: "center", padding: 32, gap: 12 }}>
      <Heading>Can't open project</Heading><Body muted>{load.error}</Body>
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <EditorTopBar onExport={() => router.push(`/editor/${id}/export`)} />
      <View testID="slot-preview" style={{ flex: 1 }} />
      <View testID="slot-timeline" style={{ height: 120 }} />
      <View testID="slot-toolbar" style={{ height: 88 }} />
      <ToastHost />
    </View>
  );
}
```

- [ ] **Step 4: Run — expect PASS**; typecheck. On the phone: tapping a project opens the editor with its name, back works, rename via tap on the name persists after reopening (autosave).
- [ ] **Step 5: Commit** — `feat: add editor screen shell with top bar, loading and autosave`

---

### Task 9: Preview player (expo-video)

**Files:**
- Create: `src/editor/components/PreviewPlayer.tsx`, `src/editor/usePreviewSync.ts`
- Modify: `app/editor/[id]/index.tsx` (replace `slot-preview`)
- Test: `src/editor/__tests__/usePreviewSync.test.ts`

**Interfaces:**
- Consumes: store (`project`, `playhead`, `isPlaying`, `missingClipIds`, `seek`, `setPlaying`), `clipAt`, `clipStartTimes`, `totalDuration`, `aspectRatioValue`.
- Produces: pure helper `nextPlayheadFromPlayer(project, hit, playerCurrentTime, missingIds): { playhead: number; ended: boolean }` (unit-tested) and `<PreviewPlayer/>`. `PreviewPlayer` owns one `useVideoPlayer`; it calls `player.replace({ uri })` when the clip under the playhead changes, seeks while paused, and while playing advances the store playhead from `timeUpdate` events (skipping missing clips, stopping at the end).

- [ ] **Step 1: Write the failing test for the pure helper**

`src/editor/__tests__/usePreviewSync.test.ts`:
```ts
import { makeClip, makeProject } from "@/src/editor/model/types";
import { clipAt } from "@/src/editor/model/timeline";
import { nextPlayheadFromPlayer } from "../usePreviewSync";

const a = makeClip({ id: "a", sourceDuration: 10, trimStart: 2, trimEnd: 5 }); // 3 s
const b = makeClip({ id: "b", sourceDuration: 8, trimStart: 1, trimEnd: 3 }); // 2 s
const c = makeClip({ id: "c", sourceDuration: 8 });                           // 8 s
const p = makeProject({ clips: [a, b, c] });

test("maps the player's source time back to the output timeline", () => {
  const hit = clipAt(p, 1)!; // in a
  expect(nextPlayheadFromPlayer(p, hit, 3.5, [])).toEqual({ playhead: 1.5, ended: false });
});

test("advances to the next clip when the trimmed end is reached", () => {
  const hit = clipAt(p, 1)!;
  expect(nextPlayheadFromPlayer(p, hit, 5.0, [])).toEqual({ playhead: 3, ended: false });
});

test("skips missing clips", () => {
  const hit = clipAt(p, 1)!;
  expect(nextPlayheadFromPlayer(p, hit, 5.2, ["b"])).toEqual({ playhead: 5, ended: false });
});

test("ends at the end of the last clip", () => {
  const hit = clipAt(p, 6)!; // in c
  expect(nextPlayheadFromPlayer(p, hit, 8.1, [])).toEqual({ playhead: 13, ended: true });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/editor/usePreviewSync.ts`** (pure helper only)

```ts
import { clipDuration, clipStartTimes, totalDuration, type ClipHit } from "@/src/editor/model/timeline";
import type { Project } from "@/src/editor/model/types";

/** Given the clip currently loaded in the player and the player's source-time, compute the output playhead. */
export function nextPlayheadFromPlayer(p: Project, hit: ClipHit, playerTime: number, missingClipIds: string[]): { playhead: number; ended: boolean } {
  const starts = clipStartTimes(p);
  if (playerTime < hit.clip.trimEnd) return { playhead: starts[hit.index] + (playerTime - hit.clip.trimStart), ended: false };
  let next = hit.index + 1;
  while (next < p.clips.length && missingClipIds.includes(p.clips[next].id)) next++;
  if (next >= p.clips.length) return { playhead: totalDuration(p), ended: true };
  return { playhead: starts[next], ended: false };
}

export const EPSILON = 0.02;
export { clipDuration };
```

- [ ] **Step 4: Implement `src/editor/components/PreviewPlayer.tsx`**

```tsx
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { clipAt, totalDuration } from "@/src/editor/model/timeline";
import { aspectRatioValue } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { nextPlayheadFromPlayer } from "@/src/editor/usePreviewSync";
import { formatDurationPrecise } from "@/src/lib/format";
import { theme } from "@/src/theme/theme";
import { Ionicons } from "@expo/vector-icons";

export function PreviewPlayer() {
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const missing = useEditorStore((s) => s.missingClipIds);
  const { seek, setPlaying } = useEditorStore.getState();

  const hit = useMemo(() => (project ? clipAt(project, playhead) : null), [project, playhead]);
  const loadedClipId = useRef<string | null>(null);

  const player = useVideoPlayer(null, (p) => { p.loop = false; p.timeUpdateEventInterval = 0.05; p.muted = false; });

  // Load the right source and seek while paused.
  useEffect(() => {
    if (!hit || missing.includes(hit.clip.id)) return;
    const sourceTime = hit.clip.trimStart + hit.offsetInClip;
    if (loadedClipId.current !== hit.clip.id) {
      loadedClipId.current = hit.clip.id;
      player.replace({ uri: hit.clip.sourceUri });
      player.currentTime = sourceTime;
      if (isPlaying) player.play();
      return;
    }
    if (!isPlaying) player.currentTime = sourceTime;
  }, [hit?.clip.id, hit?.clip.sourceUri, playhead, isPlaying, missing, player]);

  useEffect(() => { if (isPlaying) player.play(); else player.pause(); }, [isPlaying, player]);

  // Drive the playhead from the player while playing.
  useEffect(() => {
    const sub = player.addListener("timeUpdate", ({ currentTime }) => {
      const s = useEditorStore.getState();
      if (!s.isPlaying || !s.project) return;
      const h = clipAt(s.project, s.playhead);
      if (!h || h.clip.id !== loadedClipId.current) return;
      const { playhead: next, ended } = nextPlayheadFromPlayer(s.project, h, currentTime, s.missingClipIds);
      s.seek(next);
      if (ended) s.setPlaying(false);
    });
    return () => sub.remove();
  }, [player]);

  if (!project) return null;
  const ratio = aspectRatioValue(project.aspectRatio);
  const total = totalDuration(project);
  const empty = project.clips.length === 0;

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space.md }}>
      <Pressable onPress={() => !empty && setPlaying(!isPlaying)} accessibilityLabel={isPlaying ? "Pause" : "Play"}
        style={{ aspectRatio: ratio, maxWidth: "100%", maxHeight: "100%", flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, overflow: "hidden" }}>
        {!empty && <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="cover" nativeControls={false} />}
        {!isPlaying && !empty && (
          <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="play" size={48} color={theme.colors.text} />
          </View>
        )}
        <View pointerEvents="none" style={{ position: "absolute", bottom: 8, right: 10, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: theme.radius.chip, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ color: theme.colors.text, fontVariant: ["tabular-nums"], fontSize: 12 }}>{formatDurationPrecise(playhead)} / {formatDurationPrecise(total)}</Text>
        </View>
      </Pressable>
    </View>
  );
}
```
Notes for the implementer: `useVideoPlayer(null, setup)` accepts a null source in SDK 57; if the types reject it, pass `undefined` or `{ uri: "" }` guarded by `replace`. `player.replace` is synchronous-looking but loads asynchronously; the explicit `currentTime` assignment right after it is intended (expo-video applies it once ready). If seeking before ready proves unreliable on device, listen once for `statusChange === "readyToPlay"` and set `currentTime` there — same behavior, documented in the report.

- [ ] **Step 5: Wire it in** — in `app/editor/[id]/index.tsx` replace `<View testID="slot-preview" .../>` with `<PreviewPlayer />` (keep a `flex: 1` wrapper). Also `seek(0)` / `setPlaying(false)` happen naturally via `setProject`.

- [ ] **Step 6: Run — expect PASS**; typecheck. On the phone: open a project with 2+ clips; tap to play — the clips play in order with the correct crop; time overlay counts; reaching the end pauses. (Scrubbing comes with Task 10.)
- [ ] **Step 7: Commit** — `feat: add expo-video preview driven by the playhead`

---

### Task 10: Timeline — thumbnail strips, scrubbing, pinch zoom, selection

**Files:**
- Create: `src/editor/components/thumbnails.ts`, `src/editor/components/ClipThumbStrip.tsx`, `src/editor/components/Timeline.tsx`, `src/editor/timelineLayout.ts`
- Modify: `app/editor/[id]/index.tsx` (replace `slot-timeline`)
- Test: `src/editor/__tests__/timelineLayout.test.ts`, `src/editor/__tests__/thumbnails.test.ts`

**Interfaces:**
- Consumes: store, `timeToX/xToTime`, `clipDuration`, `clipStartTimes`.
- Produces: `thumbTimes(clip, pixelsPerSecond, thumbWidth = 64): number[]` (source times to sample, ≥ 1, spaced `thumbWidth/pps` s, min 0.5 s), `getThumb(uri, timeSec): Promise<string>` (memoized by `uri|round(time*2)/2`), `stripWidth(clip, pps)`, `indexFromDrop(startTimes, widths, dragCenterX): number`, `<Timeline/>` with `TIMELINE_HEIGHT = 120`, `STRIP_HEIGHT = 64`. Scrolling the strip seeks the store; while playing, the strip follows the playhead; pinch adjusts `pixelsPerSecond`; tapping a strip selects it (yellow outline); missing clips show a warning badge.

- [ ] **Step 1: Write the failing tests**

`src/editor/__tests__/timelineLayout.test.ts`:
```ts
import { makeClip } from "@/src/editor/model/types";
import { indexFromDrop, stripWidth, thumbTimes } from "../timelineLayout";

const c = makeClip({ id: "a", sourceDuration: 10, trimStart: 2, trimEnd: 6 }); // 4 s

test("stripWidth scales with zoom", () => {
  expect(stripWidth(c, 50)).toBe(200);
});

test("thumbTimes samples the trimmed range at one thumb per 64px, min 0.5 s apart, always ≥ 1", () => {
  expect(thumbTimes(c, 64)).toEqual([2, 3, 4, 5]);          // 1 s per thumb
  expect(thumbTimes(c, 640)).toEqual([2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]); // capped at 0.5 s
  expect(thumbTimes(c, 8)).toEqual([2]);                    // 8 s per thumb > duration → one
});

test("indexFromDrop picks the slot whose centre is nearest the drag centre", () => {
  const starts = [0, 100, 300];       // px
  const widths = [100, 200, 100];
  expect(indexFromDrop(starts, widths, 50)).toBe(0);
  expect(indexFromDrop(starts, widths, 250)).toBe(1);
  expect(indexFromDrop(starts, widths, 390)).toBe(2);
  expect(indexFromDrop(starts, widths, 9999)).toBe(2);
});
```

`src/editor/__tests__/thumbnails.test.ts`:
```ts
jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn(async (uri: string, o: { time: number }) => ({ uri: `${uri}#${o.time}` })) }));
import * as VT from "expo-video-thumbnails";
import { getThumb } from "../components/thumbnails";

test("getThumb memoizes per uri and half-second", async () => {
  const a = await getThumb("file:///a.mov", 1.2);
  const b = await getThumb("file:///a.mov", 1.3);
  expect(a).toBe(b);
  expect(VT.getThumbnailAsync).toHaveBeenCalledTimes(1);
  expect(VT.getThumbnailAsync).toHaveBeenCalledWith("file:///a.mov", expect.objectContaining({ time: 1000 }));
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement the pure layout helpers `src/editor/timelineLayout.ts`**

```ts
import { clipDuration, timeToX } from "@/src/editor/model/timeline";
import type { Clip } from "@/src/editor/model/types";

export const TIMELINE_HEIGHT = 120;
export const STRIP_HEIGHT = 64;
export const THUMB_WIDTH = 64;
export const MIN_THUMB_INTERVAL = 0.5;

export const stripWidth = (c: Clip, pps: number): number => timeToX(clipDuration(c), pps);

export function thumbTimes(c: Clip, pps: number, thumbWidth = THUMB_WIDTH): number[] {
  const interval = Math.max(MIN_THUMB_INTERVAL, thumbWidth / pps);
  const out: number[] = [];
  for (let t = c.trimStart; t < c.trimEnd - 1e-9 && out.length < 500; t += interval) out.push(Number(t.toFixed(3)));
  return out.length ? out : [c.trimStart];
}

export function indexFromDrop(startsPx: number[], widthsPx: number[], dragCenterX: number): number {
  let best = 0, bestDist = Infinity;
  startsPx.forEach((s, i) => {
    const d = Math.abs(s + widthsPx[i] / 2 - dragCenterX);
    if (d < bestDist) { best = i; bestDist = d; }
  });
  return best;
}
```

`src/editor/components/thumbnails.ts`:
```ts
import * as VideoThumbnails from "expo-video-thumbnails";

const cache = new Map<string, Promise<string>>();

/** Thumbnail URI for a source time, memoized to the nearest half second. */
export function getThumb(uri: string, timeSec: number): Promise<string> {
  const key = `${uri}|${Math.round(timeSec * 2) / 2}`;
  let p = cache.get(key);
  if (!p) {
    p = VideoThumbnails.getThumbnailAsync(uri, { time: Math.round(timeSec * 1000), quality: 0.4 }).then((r) => r.uri);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Implement `src/editor/components/ClipThumbStrip.tsx`**

```tsx
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Image, Pressable, View } from "react-native";
import type { Clip } from "@/src/editor/model/types";
import { theme } from "@/src/theme/theme";
import { STRIP_HEIGHT, THUMB_WIDTH, stripWidth, thumbTimes } from "../timelineLayout";
import { getThumb } from "./thumbnails";

type Props = { clip: Clip; pixelsPerSecond: number; selected: boolean; missing: boolean; onPress: () => void; children?: React.ReactNode };

export function ClipThumbStrip({ clip, pixelsPerSecond, selected, missing, onPress, children }: Props) {
  const width = stripWidth(clip, pixelsPerSecond);
  const times = thumbTimes(clip, pixelsPerSecond);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});

  useEffect(() => {
    if (missing) return;
    let alive = true;
    times.forEach((t) => getThumb(clip.sourceUri, t).then((uri) => { if (alive) setThumbs((s) => (s[t] ? s : { ...s, [t]: uri })); }).catch(() => {}));
    return () => { alive = false; };
  }, [clip.sourceUri, missing, times.join(",")]);

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Clip ${clip.id}`} accessibilityState={{ selected }}
      style={{ width, height: STRIP_HEIGHT, borderRadius: 8, overflow: "hidden", backgroundColor: theme.colors.surfaceAlt,
        borderWidth: 2, borderColor: selected ? theme.colors.highlight : "transparent", flexDirection: "row" }}>
      {times.map((t, i) => (
        <View key={t} style={{ width: Math.min(THUMB_WIDTH, width - i * THUMB_WIDTH), height: STRIP_HEIGHT, overflow: "hidden" }}>
          {thumbs[t] ? <Image source={{ uri: thumbs[t] }} style={{ width: THUMB_WIDTH, height: STRIP_HEIGHT }} resizeMode="cover" /> : null}
        </View>
      ))}
      {missing && (
        <View style={{ position: "absolute", top: 4, left: 4, backgroundColor: theme.colors.danger, borderRadius: 999, padding: 2 }}>
          <Ionicons name="warning" size={14} color={theme.colors.text} />
        </View>
      )}
      {children}
    </Pressable>
  );
}
```

- [ ] **Step 6: Implement `src/editor/components/Timeline.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { ScrollView, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { clipStartTimes, timeToX, xToTime } from "@/src/editor/model/timeline";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { STRIP_HEIGHT, TIMELINE_HEIGHT } from "../timelineLayout";
import { ClipThumbStrip } from "./ClipThumbStrip";

/** Horizontal strip of clips. The playhead is fixed at the horizontal centre; scrolling scrubs. */
export function Timeline({ renderStripExtras }: { renderStripExtras?: (clipId: string, index: number) => React.ReactNode }) {
  const { width: screenW } = useWindowDimensions();
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  const selectedId = useEditorStore((s) => s.selectedClipId);
  const missing = useEditorStore((s) => s.missingClipIds);
  const { seek, select, setZoom, setPlaying } = useEditorStore.getState();

  const scrollRef = useRef<ScrollView>(null);
  const userScrolling = useRef(false);
  const [basePps, setBasePps] = useState(pps);
  const pad = screenW / 2;

  // Follow the playhead while playing or when it is changed programmatically.
  useEffect(() => {
    if (userScrolling.current) return;
    scrollRef.current?.scrollTo({ x: timeToX(playhead, pps), animated: false });
  }, [playhead, pps]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!userScrolling.current) return;
    seek(xToTime(e.nativeEvent.contentOffset.x, pps));
  };

  const pinch = Gesture.Pinch()
    .onBegin(() => { setBasePps(useEditorStore.getState().pixelsPerSecond); })
    .onUpdate((e) => { setZoom(basePps * e.scale); })
    .runOnJS(true);

  if (!project) return null;
  const starts = clipStartTimes(project);

  return (
    <GestureDetector gesture={pinch}>
      <View style={{ height: TIMELINE_HEIGHT, justifyContent: "center" }}>
        <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} scrollEventThrottle={16}
          onScrollBeginDrag={() => { userScrolling.current = true; setPlaying(false); }}
          onMomentumScrollEnd={() => { userScrolling.current = false; }}
          onScrollEndDrag={(e) => { if (e.nativeEvent.velocity?.x === 0) userScrolling.current = false; }}
          onScroll={onScroll}
          contentContainerStyle={{ paddingHorizontal: pad, alignItems: "center", gap: 4, height: TIMELINE_HEIGHT }}>
          {project.clips.map((clip, i) => (
            <ClipThumbStrip key={clip.id} clip={clip} pixelsPerSecond={pps} selected={clip.id === selectedId} missing={missing.includes(clip.id)}
              onPress={() => { select(clip.id === selectedId ? null : clip.id); seek(starts[i]); }}>
              {renderStripExtras?.(clip.id, i)}
            </ClipThumbStrip>
          ))}
        </ScrollView>
        <View pointerEvents="none" style={{ position: "absolute", left: pad - 1, top: (TIMELINE_HEIGHT - STRIP_HEIGHT) / 2 - 8, width: 2, height: STRIP_HEIGHT + 16, backgroundColor: theme.colors.highlight, borderRadius: 1 }} />
      </View>
    </GestureDetector>
  );
}
```
Tapping a strip also seeks to its start so the preview shows the selected clip. If `runOnJS(true)` is not available on this gesture-handler version, wrap the callbacks with `runOnJS` from reanimated instead.

- [ ] **Step 7: Wire in** — replace `slot-timeline` in the editor screen with `<Timeline />`. Run tests + typecheck. On the phone: strips show thumbnails; dragging the strip scrubs the preview; playing scrolls the strip; pinch zooms; tapping a clip outlines it in yellow.
- [ ] **Step 8: Commit** — `feat: add timeline with thumbnails, scrubbing, zoom and selection`

---

### Task 11: Trim handles and drag-to-reorder

**Files:**
- Create: `src/editor/components/TrimHandles.tsx`, `src/editor/components/ReorderHandle.tsx`
- Modify: `src/editor/components/Timeline.tsx` (render extras for the selected clip), `src/editor/components/ClipThumbStrip.tsx` (no change expected)
- Test: `src/editor/__tests__/trimMath.test.ts`

**Interfaces:**
- Consumes: store `beginTransaction/applyTransient/apply`, `trimClip`, `moveClip`, `xToTime`, `indexFromDrop`, `stripWidth`.
- Produces: `trimFromDrag(clip, edge: "start" | "end", startValue, translationX, pps): { trimStart, trimEnd }` (pure, snaps to 0.1 s), `<TrimHandles clip/>`, `<ReorderHandle clipId index/>`. Measured strip layout stays inside `Timeline` (starts/widths in px from `clipStartTimes` and `stripWidth`).

- [ ] **Step 1: Write the failing test**

`src/editor/__tests__/trimMath.test.ts`:
```ts
import { makeClip } from "@/src/editor/model/types";
import { trimFromDrag } from "../components/TrimHandles";

const c = makeClip({ id: "a", sourceDuration: 10, trimStart: 2, trimEnd: 6 });

test("dragging the start handle right moves trimStart later, snapped to 0.1 s", () => {
  expect(trimFromDrag(c, "start", 2, 57, 100)).toEqual({ trimStart: 2.6, trimEnd: 6 });
});
test("dragging the end handle left moves trimEnd earlier", () => {
  expect(trimFromDrag(c, "end", 6, -120, 100)).toEqual({ trimStart: 2, trimEnd: 4.8 });
});
test("handles cannot cross or leave the source", () => {
  expect(trimFromDrag(c, "start", 2, 10000, 100)).toEqual({ trimStart: 5.9, trimEnd: 6 });
  expect(trimFromDrag(c, "end", 6, 10000, 100)).toEqual({ trimStart: 2, trimEnd: 10 });
  expect(trimFromDrag(c, "start", 2, -10000, 100)).toEqual({ trimStart: 0, trimEnd: 6 });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/editor/components/TrimHandles.tsx`**

```tsx
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { xToTime } from "@/src/editor/model/timeline";
import { trimClip } from "@/src/editor/model/ops";
import { MIN_CLIP_SECONDS, type Clip } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { STRIP_HEIGHT } from "../timelineLayout";

const snap = (t: number) => Math.round(t * 10) / 10;

export function trimFromDrag(clip: Clip, edge: "start" | "end", startValue: number, translationX: number, pps: number) {
  const raw = snap(startValue + xToTime(translationX, pps));
  if (edge === "start") {
    const trimStart = Math.max(0, Math.min(raw, snap(clip.trimEnd - MIN_CLIP_SECONDS)));
    return { trimStart, trimEnd: clip.trimEnd };
  }
  const trimEnd = Math.min(clip.sourceDuration, Math.max(raw, snap(clip.trimStart + MIN_CLIP_SECONDS)));
  return { trimStart: clip.trimStart, trimEnd };
}

function Handle({ clip, edge }: { clip: Clip; edge: "start" | "end" }) {
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  const store = useEditorStore.getState();
  let startValue = edge === "start" ? clip.trimStart : clip.trimEnd;
  const pan = Gesture.Pan().activeOffsetX([-4, 4])
    .onBegin(() => { const c = useEditorStore.getState().project?.clips.find((x) => x.id === clip.id); startValue = edge === "start" ? (c?.trimStart ?? 0) : (c?.trimEnd ?? 0); store.beginTransaction(); })
    .onUpdate((e) => {
      const c = useEditorStore.getState().project?.clips.find((x) => x.id === clip.id);
      if (!c) return;
      const { trimStart, trimEnd } = trimFromDrag(c, edge, startValue, e.translationX, pps);
      store.applyTransient((p) => trimClip(p, clip.id, trimStart, trimEnd));
    })
    .runOnJS(true);
  return (
    <GestureDetector gesture={pan}>
      <View accessibilityLabel={`${edge === "start" ? "Trim start" : "Trim end"} handle`} hitSlop={{ left: 12, right: 12, top: 12, bottom: 12 }}
        style={{ position: "absolute", [edge === "start" ? "left" : "right"]: -2, top: -2, width: 14, height: STRIP_HEIGHT + 4, backgroundColor: theme.colors.highlight,
          borderTopLeftRadius: edge === "start" ? 8 : 0, borderBottomLeftRadius: edge === "start" ? 8 : 0, borderTopRightRadius: edge === "end" ? 8 : 0, borderBottomRightRadius: edge === "end" ? 8 : 0,
          alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 2, height: 20, backgroundColor: theme.colors.bg, borderRadius: 1 }} />
      </View>
    </GestureDetector>
  );
}

export function TrimHandles({ clip }: { clip: Clip }) {
  return (<><Handle clip={clip} edge="start" /><Handle clip={clip} edge="end" /></>);
}
```
Because `trimStart` changes the strip's width (its left edge stays put in the row while the strip shrinks from the right in layout), the start-handle drag visually shortens the strip from the right. That's acceptable for Phase 1; the preview still shows the correct new in-point because tapping/scrubbing uses the trims.

- [ ] **Step 4: Implement `src/editor/components/ReorderHandle.tsx`**

```tsx
import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { clipStartTimes, timeToX } from "@/src/editor/model/timeline";
import { moveClip } from "@/src/editor/model/ops";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { indexFromDrop, stripWidth } from "../timelineLayout";

/** Grip shown on the selected clip. Long-press then drag horizontally to move the clip. */
export function ReorderHandle({ clipId, index }: { clipId: string; index: number }) {
  const tx = useSharedValue(0);
  const lifted = useSharedValue(false);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { scale: lifted.value ? 1.05 : 1 }], opacity: lifted.value ? 0.85 : 1 }));

  const pan = Gesture.Pan().activateAfterLongPress(250)
    .onStart(() => { lifted.value = true; })
    .onUpdate((e) => { tx.value = e.translationX; })
    .onEnd((e) => {
      const s = useEditorStore.getState();
      if (!s.project) return;
      const pps = s.pixelsPerSecond;
      const starts = clipStartTimes(s.project).map((t) => timeToX(t, pps));
      const widths = s.project.clips.map((c) => stripWidth(c, pps));
      const center = starts[index] + widths[index] / 2 + e.translationX;
      const to = indexFromDrop(starts, widths, center);
      s.apply((p) => moveClip(p, clipId, to));
    })
    .onFinalize(() => { lifted.value = false; tx.value = withTiming(0, { duration: 150 }); })
    .runOnJS(true);

  return (
    <GestureDetector gesture={pan}>
      <Animated.View accessibilityLabel="Move clip" style={[{ position: "absolute", bottom: 4, alignSelf: "center", left: "50%", marginLeft: -14, width: 28, height: 20, borderRadius: 10, backgroundColor: theme.colors.highlight, alignItems: "center", justifyContent: "center" }, style]}>
        <Ionicons name="reorder-two" size={16} color={theme.colors.bg} />
      </Animated.View>
    </GestureDetector>
  );
}
```
Note: the whole strip does not translate during the drag (only the grip does) — a deliberate simplification to avoid fighting the ScrollView; the drop position is still computed from the drag distance. If the ScrollView steals the gesture on device, add `.blocksExternalGesture(nativeScroll)` where `nativeScroll = Gesture.Native()` wraps the ScrollView in `Timeline` via a second `GestureDetector`.

- [ ] **Step 5: Render extras in `Timeline`** — in `app/editor/[id]/index.tsx` pass:
```tsx
<Timeline renderStripExtras={(clipId, index) => clipId === selectedClipId ? (<><TrimHandles clip={clipById(clipId)} /><ReorderHandle clipId={clipId} index={index} /></>) : null} />
```
where `selectedClipId = useEditorStore((s) => s.selectedClipId)` and `clipById` reads from `useEditorStore((s) => s.project)`.

- [ ] **Step 6: Run — expect PASS**; typecheck. On the phone: select a clip, drag the yellow handles — the clip shortens/lengthens (undo restores in one step); long-press the grip and drag left/right past a neighbour — the clip moves.
- [ ] **Step 7: Commit** — `feat: add trim handles and drag-to-reorder on the timeline`

---

### Task 12: Toolbar, ratio sheet, trim sheet

**Files:**
- Create: `src/editor/components/EditorToolbar.tsx`, `src/editor/components/RatioSheet.tsx`, `src/editor/components/TrimSheet.tsx`
- Modify: `app/editor/[id]/index.tsx` (replace `slot-toolbar`)
- Test: `src/editor/__tests__/EditorToolbar.test.tsx`, `src/editor/__tests__/RatioSheet.test.tsx`

**Interfaces:**
- Consumes: store, ops (`splitClipAt`, `trimClip`, `setAspectRatio`, `duplicateClip`, `deleteClip`), `Sheet`, `Chip`, `ToolButton`, `ASPECT_RATIOS`.
- Produces: `<EditorToolbar/>` (Split · Trim · Ratio · Duplicate · Delete; the four clip tools disabled without a selection), `<RatioSheet visible onClose/>`, `<TrimSheet clipId visible onClose/>`.

- [ ] **Step 1: Write the failing tests**

`src/editor/__tests__/EditorToolbar.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/id", () => ({ newId: () => "dup" }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { EditorToolbar } from "../components/EditorToolbar";

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] }));
});

test("clip tools are disabled without a selection; Ratio is always enabled", () => {
  render(<EditorToolbar />);
  for (const l of ["Split", "Trim", "Duplicate", "Delete"]) expect(screen.getByRole("button", { name: l })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Ratio" })).toBeEnabled();
});

test("Split cuts at the playhead; Duplicate and Delete act on the selection", () => {
  render(<EditorToolbar />);
  useEditorStore.getState().select("a");
  useEditorStore.getState().seek(1.5);
  fireEvent.press(screen.getByRole("button", { name: "Split" }));
  expect(useEditorStore.getState().project?.clips).toHaveLength(3);
  fireEvent.press(screen.getByRole("button", { name: "Duplicate" }));
  expect(useEditorStore.getState().project?.clips).toHaveLength(4);
  fireEvent.press(screen.getByRole("button", { name: "Delete" }));
  expect(useEditorStore.getState().project?.clips).toHaveLength(3);
  expect(useEditorStore.getState().selectedClipId).toBeNull();
});
```

`src/editor/__tests__/RatioSheet.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { RatioSheet } from "../components/RatioSheet";

test("choosing a chip sets the aspect ratio and closes", () => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject());
  const onClose = jest.fn();
  render(<RatioSheet visible onClose={onClose} />);
  fireEvent.press(screen.getByRole("button", { name: "1:1" }));
  expect(useEditorStore.getState().project?.aspectRatio).toBe("1:1");
  expect(onClose).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

`src/editor/components/RatioSheet.tsx`:
```tsx
import { View } from "react-native";
import { setAspectRatio } from "@/src/editor/model/ops";
import { ASPECT_RATIOS } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { Chip } from "@/src/ui/Chip";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";

export function RatioSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const current = useEditorStore((s) => s.project?.aspectRatio);
  const apply = useEditorStore((s) => s.apply);
  return (
    <Sheet visible={visible} onClose={onClose} title="Aspect ratio">
      <Body muted>9:16 for TikTok, Reels and Shorts. 1:1 for feeds. 16:9 for YouTube.</Body>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {ASPECT_RATIOS.map((r) => <Chip key={r} label={r} selected={r === current} onPress={() => { apply((p) => setAspectRatio(p, r)); onClose(); }} />)}
      </View>
    </Sheet>
  );
}
```

`src/editor/components/TrimSheet.tsx`:
```tsx
import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import { trimClip } from "@/src/editor/model/ops";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";

const field = { backgroundColor: theme.colors.surfaceAlt, color: theme.colors.text, borderRadius: theme.radius.chip, padding: 12, fontSize: 18, flex: 1 } as const;

export function TrimSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useEditorStore((s) => s.project?.clips.find((c) => c.id === clipId) ?? null);
  const apply = useEditorStore((s) => s.apply);
  const [start, setStart] = useState("0"); const [end, setEnd] = useState("0");
  useEffect(() => { if (clip) { setStart(clip.trimStart.toFixed(1)); setEnd(clip.trimEnd.toFixed(1)); } }, [clip?.id, visible]);
  if (!clip) return null;
  return (
    <Sheet visible={visible} onClose={onClose} title="Trim">
      <Body muted>Seconds into the original clip (0 – {clip.sourceDuration.toFixed(1)})</Body>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <TextInput accessibilityLabel="Trim start" keyboardType="decimal-pad" value={start} onChangeText={setStart} style={field} />
        <TextInput accessibilityLabel="Trim end" keyboardType="decimal-pad" value={end} onChangeText={setEnd} style={field} />
      </View>
      <PrimaryButton title="Apply" onPress={() => { apply((p) => trimClip(p, clip.id, Number(start) || 0, Number(end) || 0)); onClose(); }} />
    </Sheet>
  );
}
```

`src/editor/components/EditorToolbar.tsx`:
```tsx
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { deleteClip, duplicateClip, splitClipAt } from "@/src/editor/model/ops";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { ToolButton } from "@/src/ui/ToolButton";
import { RatioSheet } from "./RatioSheet";
import { TrimSheet } from "./TrimSheet";

export function EditorToolbar() {
  const selectedId = useEditorStore((s) => s.selectedClipId);
  const apply = useEditorStore((s) => s.apply);
  const [sheet, setSheet] = useState<"ratio" | "trim" | null>(null);
  const noSel = !selectedId;
  return (
    <View style={{ backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.surfaceAlt, paddingBottom: 24 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
        <ToolButton label="Split" icon="cut" disabled={noSel} onPress={() => apply((p) => splitClipAt(p, useEditorStore.getState().playhead))} />
        <ToolButton label="Trim" icon="crop" disabled={noSel} onPress={() => setSheet("trim")} />
        <ToolButton label="Ratio" icon="phone-portrait" onPress={() => setSheet("ratio")} />
        <ToolButton label="Duplicate" icon="copy" disabled={noSel} onPress={() => selectedId && apply((p) => duplicateClip(p, selectedId))} />
        <ToolButton label="Delete" icon="trash" disabled={noSel} onPress={() => selectedId && apply((p) => deleteClip(p, selectedId))} />
      </ScrollView>
      <RatioSheet visible={sheet === "ratio"} onClose={() => setSheet(null)} />
      <TrimSheet clipId={selectedId} visible={sheet === "trim"} onClose={() => setSheet(null)} />
    </View>
  );
}
```

- [ ] **Step 4: Wire in** — replace `slot-toolbar` with `<EditorToolbar />`. Run tests + typecheck. Device: full edit loop works — split at playhead, numeric trim, ratio change reflects in the preview frame, duplicate, delete, undo/redo through all of it; close and reopen the project and the edit is still there.
- [ ] **Step 5: Commit** — `feat: add editor toolbar with split, trim, ratio, duplicate and delete`

---

### Task 13: Export — estimate, native wrapper, hook, screen (Expo Go fallback)

**Files:**
- Create: `src/export/estimate.ts`, `src/export/useExport.ts`, `app/editor/[id]/export.tsx`, `src/export/ExportScreenBody.tsx`
- Modify: `modules/clipy-video/index.ts`, `modules/clipy-video/__tests__/index.test.ts`, `app/_layout.tsx` (register the export route as a modal)
- Test: `src/export/__tests__/estimate.test.ts`, `src/export/__tests__/ExportScreenBody.test.tsx`

**Interfaces:**
- Consumes: store/project, `totalDuration`, `expoFs.cacheDir`, `expoFs.freeBytes`, UI primitives.
- Produces:
  ```ts
  // estimate.ts
  type Resolution = 720 | 1080 | 2160;
  const BITRATE_MBPS: Record<Resolution, number> = { 720: 5, 1080: 10, 2160: 35 };
  estimateBytes(durationSec, res): number
  canExport4K(clips: { width: number; height: number }[]): boolean   // any clip with max(w,h) ≥ 2160
  formatBytes(n): string   // "1.2 GB", "340 MB"
  // modules/clipy-video/index.ts (adds to hello())
  isNativeAvailable(): boolean
  type ExportEvent = { jobId: string } & ({ type: "progress"; progress: number } | { type: "done"; fileUri: string } | { type: "error"; message: string } | { type: "cancelled" })
  exportTimeline(req: { clips: { sourceUri: string; trimStart: number; trimEnd: number }[]; aspectRatio: AspectRatio; resolution: Resolution; outputPath: string }): Promise<string>  // jobId
  cancelExport(jobId: string): void
  addExportListener(cb: (e: ExportEvent) => void): { remove(): void }
  // useExport.ts
  useExport(project) → { state: { status: "idle" | "unavailable" | "exporting" | "done" | "error"; progress: number; fileUri?: string; message?: string }, start(res), cancel(), reset() }
  ```

- [ ] **Step 1: Write the failing tests**

`src/export/__tests__/estimate.test.ts`:
```ts
import { canExport4K, estimateBytes, formatBytes } from "../estimate";

test("estimateBytes = duration × bitrate", () => {
  expect(estimateBytes(60, 1080)).toBe(60 * 10e6 / 8);
  expect(estimateBytes(10, 720)).toBe(10 * 5e6 / 8);
});
test("canExport4K needs a 4K source", () => {
  expect(canExport4K([{ width: 1080, height: 1920 }])).toBe(false);
  expect(canExport4K([{ width: 1080, height: 1920 }, { width: 2160, height: 3840 }])).toBe(true);
});
test("formatBytes", () => {
  expect(formatBytes(340 * 1e6)).toBe("340 MB");
  expect(formatBytes(1.25e9)).toBe("1.3 GB");
});
```

Add to `modules/clipy-video/__tests__/index.test.ts`:
```ts
import { addExportListener, cancelExport, exportTimeline, isNativeAvailable } from "../index";

describe("export API", () => {
  it("isNativeAvailable is false when the module is missing", () => {
    jest.mocked(requireOptionalNativeModule).mockReturnValueOnce(null);
    expect(isNativeAvailable()).toBe(false);
  });
  it("exportTimeline forwards the request and returns the job id; listener wraps the native event", async () => {
    const listeners: ((e: unknown) => void)[] = [];
    const native = { hello: () => "x", exportTimeline: jest.fn(async () => "job1"), cancelExport: jest.fn(),
      addListener: jest.fn((_: string, cb: (e: unknown) => void) => { listeners.push(cb); return { remove: jest.fn() }; }) };
    jest.mocked(requireOptionalNativeModule).mockReturnValue(native as never);
    const req = { clips: [{ sourceUri: "file:///a.mov", trimStart: 0, trimEnd: 2 }], aspectRatio: "9:16" as const, resolution: 1080 as const, outputPath: "/tmp/out.mp4" };
    await expect(exportTimeline(req)).resolves.toBe("job1");
    expect(native.exportTimeline).toHaveBeenCalledWith(req);
    const cb = jest.fn();
    addExportListener(cb);
    listeners[0]({ jobId: "job1", type: "progress", progress: 0.5 });
    expect(cb).toHaveBeenCalledWith({ jobId: "job1", type: "progress", progress: 0.5 });
    cancelExport("job1");
    expect(native.cancelExport).toHaveBeenCalledWith("job1");
    jest.mocked(requireOptionalNativeModule).mockReset();
  });
});
```
(The existing file's top-level mock returns `{ hello }` for `"ClipyVideo"` — extend that mock object with no-op `exportTimeline/cancelExport/addListener` so the earlier tests keep passing, and keep the `import { requireOptionalNativeModule } from "expo-modules-core"` reference used by `jest.mocked`.)

`src/export/__tests__/ExportScreenBody.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { ExportScreenBody } from "../ExportScreenBody";

const project = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 30 })] });
const base = { progress: 0 };

test("shows the fallback card when native is unavailable", () => {
  render(<ExportScreenBody project={project} state={{ status: "unavailable", ...base }} start={jest.fn()} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} />);
  expect(screen.getByText("Export needs the native build")).toBeTruthy();
  expect(screen.queryByText("Export")).toBeNull();
});

test("idle: 4K disabled for HD sources, Export starts with the chosen resolution", () => {
  const start = jest.fn();
  render(<ExportScreenBody project={project} state={{ status: "idle", ...base }} start={start} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} />);
  expect(screen.getByRole("button", { name: "4K" })).toBeDisabled();
  fireEvent.press(screen.getByRole("button", { name: "720p" }));
  fireEvent.press(screen.getByText("Export"));
  expect(start).toHaveBeenCalledWith(720);
});

test("done: shows Save, Share, Done", () => {
  render(<ExportScreenBody project={project} state={{ status: "done", progress: 1, fileUri: "file:///x.mp4" }} start={jest.fn()} cancel={jest.fn()} reset={jest.fn()} onSave={jest.fn()} onShare={jest.fn()} onDone={jest.fn()} />);
  expect(screen.getByText("Save to Photos")).toBeTruthy();
  expect(screen.getByText("Share…")).toBeTruthy();
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/export/estimate.ts`**

```ts
export type Resolution = 720 | 1080 | 2160;
export const RESOLUTIONS: { value: Resolution; label: string }[] = [{ value: 720, label: "720p" }, { value: 1080, label: "1080p" }, { value: 2160, label: "4K" }];
export const BITRATE_MBPS: Record<Resolution, number> = { 720: 5, 1080: 10, 2160: 35 };

export const estimateBytes = (durationSec: number, res: Resolution): number => (durationSec * BITRATE_MBPS[res] * 1e6) / 8;
export const canExport4K = (clips: { width: number; height: number }[]): boolean => clips.some((c) => Math.max(c.width, c.height) >= 2160);
export function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  return `${Math.round(n / 1e6)} MB`;
}
```

- [ ] **Step 4: Extend `modules/clipy-video/index.ts`**

```ts
import { requireOptionalNativeModule, type EventSubscription, type NativeModule } from "expo-modules-core";
import type { AspectRatio } from "@/src/editor/model/types";
import type { Resolution } from "@/src/export/estimate";

export type ExportEvent = { jobId: string } & (
  | { type: "progress"; progress: number }
  | { type: "done"; fileUri: string }
  | { type: "error"; message: string }
  | { type: "cancelled" });

export interface ExportRequest {
  clips: { sourceUri: string; trimStart: number; trimEnd: number }[];
  aspectRatio: AspectRatio;
  resolution: Resolution;
  outputPath: string;
}

type ClipyVideoNative = NativeModule<{ onExportEvent: (e: ExportEvent) => void }> & {
  hello(): string;
  exportTimeline(req: ExportRequest): Promise<string>;
  cancelExport(jobId: string): void;
};

const NOT_LINKED = "ClipyVideo native module is not linked. Use a development build (eas build --profile development), not Expo Go.";

function optional(): ClipyVideoNative | null { return requireOptionalNativeModule<ClipyVideoNative>("ClipyVideo"); }
function native(): ClipyVideoNative { const m = optional(); if (!m) throw new Error(NOT_LINKED); return m; }

export function isNativeAvailable(): boolean { return optional() !== null; }
/** Returns a greeting from the Swift module. Phase 0 smoke test only. */
export function hello(): string { return native().hello(); }
export function exportTimeline(req: ExportRequest): Promise<string> { return native().exportTimeline(req); }
export function cancelExport(jobId: string): void { native().cancelExport(jobId); }
export function addExportListener(cb: (e: ExportEvent) => void): EventSubscription { return native().addListener("onExportEvent", cb); }
```
If `NativeModule`'s generic/`addListener` typing differs in SDK 57's `expo-modules-core`, cast through `unknown` at the single `requireOptionalNativeModule` call rather than loosening the exported types.

- [ ] **Step 5: Implement `src/export/useExport.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { totalDuration } from "@/src/editor/model/timeline";
import type { Project } from "@/src/editor/model/types";
import { addExportListener, cancelExport, exportTimeline, isNativeAvailable } from "@/modules/clipy-video";
import { expoFs } from "@/src/projects/expoFs";
import { estimateBytes, type Resolution } from "./estimate";

export type ExportState = { status: "idle" | "unavailable" | "exporting" | "done" | "error"; progress: number; fileUri?: string; message?: string };

export function useExport(project: Project | null) {
  const [state, setState] = useState<ExportState>({ status: isNativeAvailable() ? "idle" : "unavailable", progress: 0 });
  const jobId = useRef<string | null>(null);

  useEffect(() => {
    if (!isNativeAvailable()) return;
    const sub = addExportListener((e) => {
      if (e.jobId !== jobId.current) return;
      if (e.type === "progress") setState((s) => ({ ...s, progress: e.progress }));
      else if (e.type === "done") setState({ status: "done", progress: 1, fileUri: e.fileUri });
      else if (e.type === "error") setState({ status: "error", progress: 0, message: e.message });
      else setState({ status: "idle", progress: 0 });
    });
    return () => sub.remove();
  }, []);

  const start = useCallback(async (resolution: Resolution) => {
    if (!project || !isNativeAvailable()) return;
    const clips = project.clips.filter((c) => c.trimEnd > c.trimStart);
    if (clips.length === 0) { setState({ status: "error", progress: 0, message: "Add at least one clip first." }); return; }
    const need = estimateBytes(totalDuration(project), resolution) * 2;
    if ((await expoFs.freeBytes()) < need) { setState({ status: "error", progress: 0, message: "Not enough free space on this iPhone for the export." }); return; }
    await expoFs.mkdir(`${expoFs.cacheDir}exports`);
    const outputPath = `${expoFs.cacheDir}exports/${project.id}-${Date.now()}.mp4`;
    setState({ status: "exporting", progress: 0 });
    try {
      jobId.current = await exportTimeline({ clips: clips.map((c) => ({ sourceUri: c.sourceUri, trimStart: c.trimStart, trimEnd: c.trimEnd })), aspectRatio: project.aspectRatio, resolution, outputPath });
    } catch (e) { setState({ status: "error", progress: 0, message: e instanceof Error ? e.message : String(e) }); }
  }, [project]);

  const cancel = useCallback(() => { if (jobId.current) cancelExport(jobId.current); }, []);
  const reset = useCallback(() => setState({ status: isNativeAvailable() ? "idle" : "unavailable", progress: 0 }), []);
  return { state, start, cancel, reset };
}
```

- [ ] **Step 6: Implement `src/export/ExportScreenBody.tsx`** (pure presentational; the route wires side effects)

```tsx
import { useState } from "react";
import { View } from "react-native";
import { totalDuration } from "@/src/editor/model/timeline";
import type { Project } from "@/src/editor/model/types";
import { Mark } from "@/src/theme/Mark";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Body, Heading } from "@/src/ui/Text";
import { canExport4K, estimateBytes, formatBytes, RESOLUTIONS, type Resolution } from "./estimate";
import type { ExportState } from "./useExport";

type Props = { project: Project; state: ExportState; start: (r: Resolution) => void; cancel: () => void; reset: () => void; onSave: () => void; onShare: () => void; onDone: () => void };

export function ExportScreenBody({ project, state, start, cancel, reset, onSave, onShare, onDone }: Props) {
  const [res, setRes] = useState<Resolution>(1080);
  const has4K = canExport4K(project.clips);
  const duration = totalDuration(project);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.space.xl, paddingTop: 48, gap: theme.space.xl }}>
      <Heading style={{ fontSize: 34 }}>Export</Heading>
      <View style={{ gap: theme.space.sm }}>
        <Body muted>Resolution</Body>
        <View style={{ flexDirection: "row", gap: theme.space.md }}>
          {RESOLUTIONS.map((r) => <Chip key={r.value} label={r.label} selected={res === r.value} disabled={r.value === 2160 && !has4K} onPress={() => setRes(r.value)} />)}
        </View>
        {!has4K && <Body muted style={{ fontSize: 12 }}>4K needs a 4K source clip.</Body>}
        <Body muted>Estimated size: {formatBytes(estimateBytes(duration, res))}</Body>
      </View>

      {state.status === "unavailable" && (
        <View style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.straw, borderWidth: 1, borderRadius: theme.radius.card, padding: theme.space.xl, gap: theme.space.sm }}>
          <Heading style={{ fontSize: 22 }}>Export needs the native build</Heading>
          <Body>Rendering the final video uses Clipy's Swift engine, which Expo Go can't load. Install a development build to export.</Body>
          <Body muted>Everything else in Clipy works in Expo Go.</Body>
        </View>
      )}
      {state.status === "idle" && <PrimaryButton title="Export" icon={<Mark size={20} color={theme.colors.text} />} onPress={() => start(res)} />}
      {state.status === "exporting" && (
        <View style={{ gap: theme.space.md }}>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: theme.colors.surfaceAlt, overflow: "hidden" }}>
            <View style={{ width: `${Math.round(state.progress * 100)}%`, height: "100%", backgroundColor: theme.colors.highlight }} />
          </View>
          <Body muted>{Math.round(state.progress * 100)}%</Body>
          <PrimaryButton title="Cancel" onPress={cancel} />
        </View>
      )}
      {state.status === "done" && (
        <View style={{ gap: theme.space.md }}>
          <Body>Your video is ready.</Body>
          <PrimaryButton title="Save to Photos" onPress={onSave} />
          <PrimaryButton title="Share…" onPress={onShare} />
          <PrimaryButton title="Done" onPress={onDone} />
        </View>
      )}
      {state.status === "error" && (
        <View style={{ gap: theme.space.md }}>
          <Body style={{ color: theme.colors.danger }}>{state.message}</Body>
          <PrimaryButton title="Try again" onPress={reset} />
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 7: Route `app/editor/[id]/export.tsx`**

```tsx
import * as MediaLibrary from "expo-media-library";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEditorStore } from "@/src/editor/store";
import { ExportScreenBody } from "@/src/export/ExportScreenBody";
import { useExport } from "@/src/export/useExport";
import { ToastHost, useToast } from "@/src/ui/Toast";

export default function ExportScreen() {
  const project = useEditorStore((s) => s.project);
  const { state, start, cancel, reset } = useExport(project);
  if (!project) return null;

  async function onSave() {
    if (!state.fileUri) return;
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) { useToast.getState().show("Allow Photos access in Settings to save."); return; }
    await MediaLibrary.saveToLibraryAsync(state.fileUri);
    useToast.getState().show("Saved to Photos");
  }
  async function onShare() { if (state.fileUri) await Sharing.shareAsync(state.fileUri, { mimeType: "video/mp4", UTI: "public.mpeg-4" }); }

  return (<><ExportScreenBody project={project} state={state} start={start} cancel={cancel} reset={reset} onSave={onSave} onShare={onShare} onDone={() => router.back()} /><ToastHost /></>);
}
```
In `app/_layout.tsx` add inside the `Stack`: `<Stack.Screen name="editor/[id]/export" options={{ presentation: "modal" }} />`.

- [ ] **Step 8: Run — expect PASS**; typecheck. Device (Expo Go): Export opens as a modal; resolution chips work; 4K disabled for HD clips; the "needs the native build" card shows instead of the Export button. No crash.
- [ ] **Step 9: Commit** — `feat: add export screen with estimates, native wrapper and Expo Go fallback`

---

### Task 14: Swift export (AVFoundation) + XCTest — compiled on EAS only

**Files:**
- Create: `modules/clipy-video/ios/ExportSession.swift`, `modules/clipy-video/ios/Tests/ExportSessionTests.swift`
- Modify: `modules/clipy-video/ios/ClipyVideoModule.swift`, `modules/clipy-video/ios/ClipyVideo.podspec` (add `test_spec`)

**Interfaces:**
- Consumes: the TS contract from Task 13 (`exportTimeline(req) → jobId`, `cancelExport(jobId)`, event `onExportEvent` with `{ jobId, type, progress | fileUri | message }`).
- Produces: `ExportRequest` / `ExportClip` Records, `ExportSession` class, `Events("onExportEvent")`.

No compiler is available on Windows: write carefully, then verify by **reading** against `node_modules/expo-modules-core/ios/Core/Records/Record.swift` (Record/Field syntax) and `.../Core/Modules/Module.swift` (AsyncFunction/Events/sendEvent). Keep `hello()`.

- [ ] **Step 1: `ExportSession.swift`**

```swift
import AVFoundation
import ExpoModulesCore

struct ExportClip: Record {
  @Field var sourceUri: String = ""
  @Field var trimStart: Double = 0
  @Field var trimEnd: Double = 0
}

struct ExportRequest: Record {
  @Field var clips: [ExportClip] = []
  @Field var aspectRatio: String = "9:16"
  @Field var resolution: Int = 1080
  @Field var outputPath: String = ""
}

enum ExportError: Error, LocalizedError {
  case noVideoTrack(String), badOutputPath, sessionFailed(String)
  var errorDescription: String? {
    switch self {
    case .noVideoTrack(let uri): return "No video track in \(uri)"
    case .badOutputPath: return "Invalid output path"
    case .sessionFailed(let m): return m
    }
  }
}

/// One export job. Builds an AVMutableComposition from trimmed clips, aspect-fills each into the render size, and writes an .mp4.
final class ExportSession {
  let id = UUID().uuidString
  private var session: AVAssetExportSession?
  private var timer: Timer?
  private let onEvent: ([String: Any]) -> Void

  init(onEvent: @escaping ([String: Any]) -> Void) { self.onEvent = onEvent }

  static func renderSize(aspect: String, resolution: Int) -> CGSize {
    let short = CGFloat(resolution)                       // 720 / 1080 / 2160 is the short edge
    let long: CGFloat = aspect == "16:9" || aspect == "9:16" ? short * 16 / 9 : short
    switch aspect {
    case "9:16": return CGSize(width: short, height: long)
    case "16:9": return CGSize(width: long, height: short)
    default:     return CGSize(width: short, height: short)
    }
  }

  static func fillTransform(track: AVAssetTrack, renderSize: CGSize) -> CGAffineTransform {
    let t = track.preferredTransform
    let natural = track.naturalSize.applying(t)
    let w = abs(natural.width), h = abs(natural.height)
    let scale = max(renderSize.width / w, renderSize.height / h)
    // Normalise rotated sources so their origin is at (0,0) after preferredTransform.
    let bounds = CGRect(origin: .zero, size: track.naturalSize).applying(t)
    let normalise = CGAffineTransform(translationX: -bounds.minX, y: -bounds.minY)
    let tx = (renderSize.width - w * scale) / 2
    let ty = (renderSize.height - h * scale) / 2
    return t.concatenating(normalise).concatenating(CGAffineTransform(scaleX: scale, y: scale)).concatenating(CGAffineTransform(translationX: tx, y: ty))
  }

  func start(_ request: ExportRequest) async throws {
    guard let outputURL = URL(string: request.outputPath) ?? Optional(URL(fileURLWithPath: request.outputPath)) else { throw ExportError.badOutputPath }
    let composition = AVMutableComposition()
    guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else { throw ExportError.sessionFailed("Cannot create video track") }
    let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
    let renderSize = Self.renderSize(aspect: request.aspectRatio, resolution: request.resolution)
    var cursor = CMTime.zero
    var instructions: [AVMutableVideoCompositionInstruction] = []

    for clip in request.clips {
      guard let url = URL(string: clip.sourceUri) else { throw ExportError.noVideoTrack(clip.sourceUri) }
      let asset = AVURLAsset(url: url)
      guard let srcVideo = try await asset.loadTracks(withMediaType: .video).first else { throw ExportError.noVideoTrack(clip.sourceUri) }
      let range = CMTimeRange(start: CMTime(seconds: clip.trimStart, preferredTimescale: 600), end: CMTime(seconds: clip.trimEnd, preferredTimescale: 600))
      try videoTrack.insertTimeRange(range, of: srcVideo, at: cursor)
      if let srcAudio = try await asset.loadTracks(withMediaType: .audio).first { try? audioTrack?.insertTimeRange(range, of: srcAudio, at: cursor) }
      let instruction = AVMutableVideoCompositionInstruction()
      instruction.timeRange = CMTimeRange(start: cursor, duration: range.duration)
      let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
      layer.setTransform(Self.fillTransform(track: srcVideo, renderSize: renderSize), at: cursor)
      instruction.layerInstructions = [layer]
      instructions.append(instruction)
      cursor = cursor + range.duration
    }

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = renderSize
    videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
    videoComposition.instructions = instructions

    let preset = request.resolution >= 2160 ? AVAssetExportPreset3840x2160 : request.resolution >= 1080 ? AVAssetExportPreset1920x1080 : AVAssetExportPreset1280x720
    guard let session = AVAssetExportSession(asset: composition, presetName: preset) else { throw ExportError.sessionFailed("Cannot create export session") }
    try? FileManager.default.removeItem(at: outputURL)
    session.outputURL = outputURL
    session.outputFileType = .mp4
    session.videoComposition = videoComposition
    session.shouldOptimizeForNetworkUse = true
    self.session = session

    let jobId = id
    DispatchQueue.main.async {
      self.timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
        guard let s = self?.session else { return }
        self?.onEvent(["jobId": jobId, "type": "progress", "progress": Double(s.progress)])
      }
    }
    session.exportAsynchronously { [weak self] in
      guard let self else { return }
      DispatchQueue.main.async { self.timer?.invalidate(); self.timer = nil }
      switch session.status {
      case .completed:
        self.onEvent(["jobId": jobId, "type": "done", "fileUri": outputURL.absoluteString])
      case .cancelled:
        try? FileManager.default.removeItem(at: outputURL)
        self.onEvent(["jobId": jobId, "type": "cancelled"])
      default:
        try? FileManager.default.removeItem(at: outputURL)
        self.onEvent(["jobId": jobId, "type": "error", "message": session.error?.localizedDescription ?? "Export failed"])
      }
    }
  }

  func cancel() { session?.cancelExport() }
}
```

- [ ] **Step 2: Update `ClipyVideoModule.swift`**

```swift
import ExpoModulesCore
import AVFoundation

public class ClipyVideoModule: Module {
  private var sessions: [String: ExportSession] = [:]

  public func definition() -> ModuleDefinition {
    Name("ClipyVideo")
    Events("onExportEvent")

    // Phase 0 smoke test: proves the Swift module is linked and callable.
    Function("hello") { () -> String in
      let version = ProcessInfo.processInfo.operatingSystemVersionString
      return "Hello from ClipyVideo (Swift, AVFoundation) — \(version)"
    }

    AsyncFunction("exportTimeline") { (request: ExportRequest) async throws -> String in
      let session = ExportSession { [weak self] payload in
        self?.sendEvent("onExportEvent", payload)
        if let type = payload["type"] as? String, type != "progress", let id = payload["jobId"] as? String { self?.sessions[id] = nil }
      }
      self.sessions[session.id] = session
      try await session.start(request)
      return session.id
    }

    Function("cancelExport") { (jobId: String) in
      self.sessions[jobId]?.cancel()
    }
  }
}
```

- [ ] **Step 3: Test spec + XCTest**

Append to `ClipyVideo.podspec` before `end`:
```ruby
  s.test_spec 'Tests' do |test_spec|
    test_spec.source_files = 'Tests/**/*.swift'
    test_spec.dependency 'ExpoModulesTestCore'
  end
```
and change `s.source_files = "**/*.{h,m,mm,swift}"` to `"*.{h,m,mm,swift}"` so test files aren't compiled into the pod.

`modules/clipy-video/ios/Tests/ExportSessionTests.swift` — generates two 2 s solid-colour clips with `AVAssetWriter`, exports at 720p 9:16, asserts duration ≈ 4 s, size 720×1280:
```swift
import AVFoundation
import XCTest
@testable import ClipyVideo

final class ExportSessionTests: XCTestCase {
  func makeClip(seconds: Double, color: UIColor) throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).mp4")
    let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    let settings: [String: Any] = [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 640, AVVideoHeightKey: 360]
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: 640, kCVPixelBufferHeightKey as String: 360])
    writer.add(input); writer.startWriting(); writer.startSession(atSourceTime: .zero)
    let frames = Int(seconds * 30)
    for i in 0..<frames {
      while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.005) }
      var pb: CVPixelBuffer?
      CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
      CVPixelBufferLockBaseAddress(pb!, [])
      let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb!), width: 640, height: 360, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pb!), space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
      ctx.setFillColor(color.cgColor); ctx.fill(CGRect(x: 0, y: 0, width: 640, height: 360))
      CVPixelBufferUnlockBaseAddress(pb!, [])
      adaptor.append(pb!, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: 30))
    }
    input.markAsFinished()
    let done = expectation(description: "write"); writer.finishWriting { done.fulfill() }; wait(for: [done], timeout: 20)
    return url
  }

  func testExportsTwoClipsAt720pPortrait() async throws {
    let a = try makeClip(seconds: 2, color: .red), b = try makeClip(seconds: 2, color: .blue)
    let out = FileManager.default.temporaryDirectory.appendingPathComponent("out-\(UUID().uuidString).mp4")
    var request = ExportRequest()
    request.clips = [ExportClip(), ExportClip()]
    request.clips[0].sourceUri = a.absoluteString; request.clips[0].trimStart = 0; request.clips[0].trimEnd = 2
    request.clips[1].sourceUri = b.absoluteString; request.clips[1].trimStart = 0; request.clips[1].trimEnd = 2
    request.aspectRatio = "9:16"; request.resolution = 720; request.outputPath = out.absoluteString

    let finished = expectation(description: "export")
    var result: [String: Any] = [:]
    let session = ExportSession { payload in if (payload["type"] as? String) != "progress" { result = payload; finished.fulfill() } }
    try await session.start(request)
    await fulfillment(of: [finished], timeout: 60)

    XCTAssertEqual(result["type"] as? String, "done", "\(result)")
    let asset = AVURLAsset(url: out)
    let duration = try await asset.load(.duration).seconds
    XCTAssertEqual(duration, 4, accuracy: 0.2)
    let track = try await asset.loadTracks(withMediaType: .video).first!
    let size = try await track.load(.naturalSize)
    XCTAssertEqual(size.width, 720, accuracy: 2); XCTAssertEqual(size.height, 1280, accuracy: 2)
  }
}
```
Expo's `expo-module.config.json` and podspec do not need changes for the test spec to exist; it runs only when someone runs the pod's tests on a Mac/EAS. Document it as deferred.

- [ ] **Step 4: Verify what can be verified** — `npm run typecheck`, `npm test`, `npx expo-modules-autolinking search --platform apple` still lists the module; read both Swift files once more against the Expo Modules sources named above. Record in the report that compilation is unverified.
- [ ] **Step 5: Commit** — `feat: add Swift AVFoundation export session (compiled on EAS only)`

---

### Task 15: README, spec sync, device checklist

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-10-01-phase-1-editor-core-design.md` (status line), `app/index.tsx` (nothing — verify only)

- [ ] **Step 1: README** — under "Layout" add `src/` (`editor/` model+store+components, `projects/` storage, `export/`, `theme/`, `ui/`) and a "Phase 1 features" list (projects, import, timeline, preview, export fallback). Under "Daily development" add: "In Expo Go the Export screen shows a 'needs the native build' card."
- [ ] **Step 2: Spec status** — change `**Status:**` to `Implemented 2026-10-01 (Swift export unverified until an EAS build exists)`.
- [ ] **Step 3: Full checks** — `npm run typecheck`, `npm test` (all suites), `npx expo-doctor`.
- [ ] **Step 4 (USER): Device checklist in Expo Go** — in order: import 3 clips → split one → trim one with the handles → reorder with the grip → change ratio → scrub and play → kill the app and reopen the project (edit restored) → open Export (fallback card) → delete a source video from Photos, reopen the project (still opens, warning badge). Record pass/fail per item in the ledger.
- [ ] **Step 5: Commit** — `docs: Phase 1 README and spec status`

---

## Phase 1 Done When

- [ ] All Jest suites pass; `npm run typecheck` and `npx expo-doctor` clean.
- [ ] The device checklist in Task 15 passes on the iPhone in Expo Go.
- [ ] The Swift export code is written and reviewed by reading; its XCTest exists (runs later on EAS).
