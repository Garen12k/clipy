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

## Posting (Phases 4A–4C)

Works: Sign in with Apple, an Accounts screen (connect / disconnect), a Post screen, YouTube posting, **sending to your TikTok inbox**, and **Instagram and Facebook Reels**. Reach Post from **Post to…** on the export result or **Post a video** on the home screen; Accounts is the icon in the home header.

- Needs the Supabase backend: follow `supabase/README.md`, and copy `.env.example` to `.env` with your Supabase URL and key. Without `.env` the app shows "Posting isn't set up yet" and the Share button still works.
- YouTube videos arrive **private** until Google audits the app; open the video from the Done screen and make it Public in YouTube yourself.
- TikTok works as **"send to TikTok inbox"**: the video arrives in TikTok as a draft, and you open TikTok to add the caption and post it. Clipy does this because TikTok keeps apps it has not audited to private-only posts on private accounts. Clipy's caption is not sent to TikTok, TikTok has no options on the Post screen, and the row ends with "Sent to TikTok — open TikTok to finish posting." (no link). TikTok allows **at most 5 unfinished drafts a day**. TikTok setup is in `supabase/README.md` (section 11).
- Instagram and Facebook both post as **Reels**. They need a **Facebook Page**; Instagram also needs a **professional (Business or Creator) Instagram account linked to that Page**. Setup is in `supabase/README.md` (section 12).
- Instagram Reels: 3 seconds to 15 minutes, up to 300 MB, captions up to 2200 characters. Instagram processes the video before it can be published, which can take a few minutes: keep the Post screen open. Clipy waits up to 10 minutes; if Instagram is still processing, the row says so and offers **Resume Instagram**, which finishes the post without uploading the video again.
- Facebook Reels must be **3 to 90 seconds** (longer videos are held back with that reason while the other platforms still post), up to 1 GB. While Clipy's Meta app is in Development mode, a Facebook Reel may be visible only to you.
- During an Instagram or Facebook upload the phone holds your Page's access pass in memory only, sends it only to Meta's upload address, and never stores it.
- Only X is still to come (phase 4D).
- **Nothing has been run against live Supabase, Google, TikTok or Meta (Instagram / Facebook) yet.** The code and tests were written from the platforms' documentation; the device checklists are in `supabase/README.md` (sections 9, 11 and 12).
- Retries never re-upload a video that has already finished uploading, unless the server says that upload failed or no longer exists; the message then says Retry will upload the video again.
- Leaving the Post screen stops any upload in progress. An Instagram or Facebook upload is sent in one piece, so leaving the app (or losing the connection) during a large upload means it starts again from the beginning when you post again.
- A post that completes after you have left the Post screen is not recorded on the project card.
- The Post screen only accepts videos from Clipy's own folders.
- Server code lives in `supabase/functions/_shared/` and is tested with `npm run test:server`; `npm test` runs the app and server suites.

## Design

The UI is the "Grand Voyage" look: deep navy backgrounds, a gold accent, and a five-group editor toolbar (Edit, Text, Stickers, Effects, Audio). Every colour, font, radius and duration comes from `src/theme/theme.ts`; the shared kit lives in `src/ui/`. UI fonts are Oswald (titles) and Montserrat (body), both under the SIL Open Font License (OFL). Regenerate the app icon and splash with `npm run gen:brand`.

## Layout

- `app/` — screens (Expo Router): `index.tsx`, `editor/[id]/index.tsx`, `editor/[id]/export.tsx`
- `src/editor/` — model (types/ops/timeline/`overlayLayout.ts`), store, and components (PreviewPlayer, Timeline,
  ClipThumbStrip, TrimHandles, ReorderHandle, EditorToolbar, RatioSheet, TrimSheet, text style panel,
  music lane). `src/editor/model/overlayLayout.ts` computes text overlay position/size as fractions of
  the frame and must stay in sync with `modules/clipy-video/ios/OverlayLayout.swift`, which mirrors the
  same formula for the native renderer.
- `src/projects/` — project storage behind `FsAdapter`/`expoFs`, and the Projects screen pieces
- `src/export/` — export estimate, `useExport`, `ExportScreenBody`
- `src/theme/` — theme tokens
- `src/ui/` — shared UI primitives
- `modules/clipy-video/` — Swift native module (`ios/`, `ios/Tests/`) and its TypeScript wrapper (`index.ts`)
- `assets/fonts/` — 8 bundled OFL font files used by the text style panel
- `assets/music/` — bundled background tracks + `manifest.json` (currently empty; see
  `assets/music/README.md` for how to add a CC0 track)
- `assets/emoji.json` — emoji search data (`char`/`name`/`keywords[]`) for the sticker sheet,
  generated by `npm run gen:emoji` from the MIT-licensed `unicode-emoji-json` package
  (`scripts/gen-emoji.mjs`); re-run after upgrading that package.
- `docs/superpowers/` — specs and implementation plans

## Phase 1 features

- Projects (create, list, reopen, rename, duplicate, delete)
- Import clips
- Timeline (split, trim, reorder); a clip whose source video is missing shows a warning badge
  and is skipped by preview and export
- Preview playback
- Export, with a fallback card in Expo Go when the native module is not linked

## Phase 2 features

- Text overlays: add, move/pinch-resize/rotate directly on the preview, and a full style panel
  (font, size, color, background, alignment, outline); each overlay gets a start/end on a
  dedicated text lane in the timeline. Overlay layout is computed as fractions of the frame
  (`src/editor/model/overlayLayout.ts`) so preview and export agree on placement.
- Fonts: 8 bundled OFL fonts in `assets/fonts` (Bangers, Anton, Oswald, Montserrat, Pacifico,
  Permanent Marker, Lobster, Roboto), loaded via the `expo-font` config plugin.
- Music: one background track per project, imported from the Files app, with a move/trim handle
  on a dedicated music lane and a volume control. `assets/music/manifest.json` is intentionally
  empty for now (no bundled tracks ship yet); see `assets/music/README.md` for how to add a
  CC0-licensed track.
- Per-clip volume and mute.
- Project schema moved to `schemaVersion: 2`; v1 projects migrate automatically on open.
- The Swift export is extended to render text layers (Core Animation) and mix audio
  (`AVMutableAudioMix`). This native code only compiles on EAS Build — it is reviewed by reading,
  not yet verified by a real build.

## Phase 3 features

- Per-clip speed (0.25×–4×, chips + slider), applied to preview (`player.playbackRate`) and export
  (`scaleTimeRange`). Timeline math for speed lives only in `src/editor/model/timeline.ts`.
- 8 color filters (None, Warm, Cool, Vivid, Faded, Mono, Noir, Vintage) from the shared effects
  registry (`src/editor/effects.ts`, mirrored by `modules/clipy-video/ios/Effects.swift`). In Expo
  Go the preview shows an approximate tint/desaturation layer with a "Preview" tag; the Swift
  export renders the real filter with a custom Core Image compositor.
- Transitions on cuts (fade, dissolve, slide, zoom), 0.3–1.0 s, capped at half the shorter
  neighbouring clip. The preview approximates every transition as a fade-to-black (with the
  "Preview" tag); the export renders the real blend per type.
- Emoji and shape stickers: same overlay lane, gestures, and timing as text. Emoji data
  (`assets/emoji.json`) is generated by `npm run gen:emoji` (`scripts/gen-emoji.mjs`) from the
  MIT-licensed `unicode-emoji-json` package — re-run after upgrading that package.
- Auto-captions via Apple's on-device speech recognition (`SFSpeechRecognizer`,
  on-device only). This needs the native build; in Expo Go the Captions button shows a
  "needs the native build" card.
- Templates: 8 one-tap looks (filter, speed, transition, text style, title and sticker) plus a
  Random tile, applied to the selected clip or the whole project as one undo step
  (`src/editor/templates.ts`, data only — no native changes).
- Project schema moved to `schemaVersion: 3`; v1 and v2 projects migrate automatically on open.
- The Swift export is further extended with a custom Core Image compositor (filters, transitions),
  speed (`scaleTimeRange`), sticker rendering, and a `Transcriber`. This native code only compiles
  on EAS Build — it is reviewed by reading, not yet verified by a real build.
