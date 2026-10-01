# Clipy

iPhone video clip editor with social publishing. Built with Expo (React Native + TypeScript)
and a Swift/AVFoundation native module. Developed on Windows; iOS builds run on EAS Build.

Design spec: `docs/superpowers/specs/2026-10-01-clip-editor-app-design.md`

## Prerequisites

- Node.js LTS and npm
- The free **Expo Go** app on your iPhone (App Store)

## Daily development (Expo Go, free)

```powershell
npm install
npx expo start --go
```

Scan the QR code with the iPhone Camera app; add `--tunnel` if the phone can't reach the PC.
In Expo Go the Swift video engine is not available: the Export screen shows a 'needs the native build' card; everything else works.

Expo Go only runs the current Expo SDK; if a new SDK ships, upgrade the project
(`npx expo install expo@latest` then `npx expo install --fix`) before Expo Go will open it again.

## Running the real native engine (needs an Apple Developer account, $99/year)

One-time: `npm install -g eas-cli`, `eas login`, `eas init`, `eas device:create`.
Then build in the cloud and install from the link EAS prints:

```powershell
eas build --profile development --platform ios
```

Afterwards use `npx expo start --dev-client` instead of `--go`. Rebuild whenever anything
under `modules/clipy-video/ios/`, `app.json` plugins, or native dependencies change.

## Checks

```powershell
npm run typecheck
npm test
```

## Layout

- `app/` — screens (Expo Router): `index.tsx`, `editor/[id]/index.tsx`, `editor/[id]/export.tsx`
- `src/editor/` — model (types/ops/timeline), store, and components (PreviewPlayer, Timeline,
  ClipThumbStrip, TrimHandles, ReorderHandle, EditorToolbar, RatioSheet, TrimSheet)
- `src/projects/` — project storage behind `FsAdapter`/`expoFs`, and the Projects screen pieces
- `src/export/` — export estimate, `useExport`, `ExportScreenBody`
- `src/theme/` — theme tokens
- `src/ui/` — shared UI primitives
- `modules/clipy-video/` — Swift native module (`ios/`, `ios/Tests/`) and its TypeScript wrapper (`index.ts`)
- `docs/superpowers/` — specs and implementation plans

## Phase 1 features

- Projects (create, list, reopen, rename, duplicate, delete)
- Import clips
- Timeline (split, trim, reorder); a clip whose source video is missing shows a warning badge
  and is skipped by preview and export
- Preview playback
- Export, with a fallback card in Expo Go when the native module is not linked
