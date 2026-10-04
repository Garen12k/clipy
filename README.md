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

## Posting (Phase 4: 4A–4D)

Built: Sign in with Apple, an Accounts screen (connect / disconnect), and a Post screen that posts one video to several platforms at once. Reach Post from **Post to…** on the export result or **Post a video** on the home screen; Accounts is the icon in the home header. If one platform fails, the others still post.

- **YouTube** — uploads arrive **private** until Google audits Clipy's app; open the video and make it Public yourself.
- **TikTok** — sent to your **TikTok inbox** as a draft; you add the caption and post it in TikTok.
- **Instagram** — posts as a **Reel** (needs a professional account linked to a Facebook Page).
- **Facebook** — posts as a **Reel** on your Page (3 to 90 seconds).
- **X** — posts with your caption; X charges Clipy's developer account **per post** (about 1.5¢, about 20¢ if the caption has a link).
- **Nothing has been run against the live services yet** (no real Supabase project, no developer apps). All of this was written from the platforms' documentation and tested with fakes.

**Before first use:** set up the server and the developer apps by following `supabase/README.md`, and copy `.env.example` to `.env` with your Supabase URL and key. Without `.env` the app shows "Posting isn't set up yet" and the Share button still works.

**What still needs you**
- Create the Supabase project and each platform's developer app, following `supabase/README.md`.
- Run the device checklists in `supabase/README.md` (sections 9, 11, 12 and 13) on your iPhone.
- An Apple Developer account and a first native build: video export and auto-captions have never been compiled.
- Ask YouTube and TikTok to audit the app, so posts can be public (YouTube) and go straight to your profile (TikTok).

Details per platform:
- YouTube videos arrive **private** until Google audits the app; open the video from the Done screen and make it Public in YouTube yourself.
- TikTok works as **"send to TikTok inbox"**: the video arrives in TikTok as a draft, and you open TikTok to add the caption and post it. Clipy does this because TikTok keeps apps it has not audited to private-only posts on private accounts. Clipy's caption is not sent to TikTok, TikTok has no options on the Post screen, and the row ends with "Sent to TikTok — open TikTok to finish posting." (no link). TikTok allows **at most 5 unfinished drafts a day**. TikTok setup is in `supabase/README.md` (section 11).
- Instagram and Facebook both post as **Reels**. They need a **Facebook Page**; Instagram also needs a **professional (Business or Creator) Instagram account linked to that Page**. Setup is in `supabase/README.md` (section 12).
- Instagram Reels: 3 seconds to 15 minutes, up to 300 MB, captions up to 2200 characters. Instagram processes the video before it can be published, which can take a few minutes: keep the Post screen open. Clipy waits up to 10 minutes; if Instagram is still processing, the row says so and offers **Resume Instagram**, which finishes the post without uploading the video again.
- Facebook Reels must be **3 to 90 seconds** (longer videos are held back with that reason while the other platforms still post), up to 1 GB. While Clipy's Meta app is in Development mode, a Facebook Reel may be visible only to you.
- During an Instagram or Facebook upload the phone is given your Page's access token. This token does not expire on its own: it stays valid until you remove Clipy in Facebook's settings. Clipy keeps it in memory only, drops it once the upload is done, and never saves it. Clipy only ever sends it to Meta's upload address. The iPhone follows web redirects automatically, so Clipy relies on that address not redirecting elsewhere.
- X: captions up to 280 characters **as X counts them** (emoji and other wide characters count 2, a link counts 23, and a plain domain like `clipy.app` counts as a link). When the caption has a link, the X row warns that the post costs about 20¢. Videos up to 20 minutes and 1 GB. The video goes through Clipy's server in 4 MB pieces (nothing is stored), and the post is created only after X has processed the video: Clipy checks every 5 seconds for up to 5 minutes, then offers **Resume X**. If X doesn't clearly confirm the post, the row says "X didn't confirm the post. It may already be on your profile — check X before posting again." — Clipy never tries to create the post a second time on its own. X setup is in `supabase/README.md` (section 13).
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
- `assets/fonts/` — 16 bundled font files used by the text style panel (licences in `assets/fonts/LICENSES.md`)
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
- Fonts: 16 bundled fonts in `assets/fonts` (Bangers, Anton, Oswald, Montserrat, Pacifico,
  Permanent Marker, Lobster, Roboto, Bebas Neue, Poppins, Playfair, Fredoka, Caveat, Press Start,
  Righteous, Dancing Script), loaded via the `expo-font` config plugin. Licences are listed in
  `assets/fonts/LICENSES.md`.
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

## Clip tools

Select a clip, then use the tools under the preview.

- **Transform** — pinch, drag or twist the clip on the preview (it snaps gently to the centre,
  straight angles, Fit and Fill). The Transform sheet has Rotate 90°, Flip horizontal / vertical,
  Fit, Fill and Reset. Exact in the preview.
- **Crop** — a draggable box with Free, 9:16, 1:1, 4:5 and 16:9. Exact in the preview.
- **Background** — per clip: Black, a colour, or Blur, with "Apply to all". Colour is exact; blur is
  approximate in Expo Go (it shows the "Preview" tag).
- **Photos** — add photos as clips (3 s by default, 0.5-60 s by dragging the end handle). The "+" tile
  at the end of the timeline adds photos and videos.
- **Replace** — swap a clip's media and keep its edits.
- **Freeze** — inserts a 2 s still of the frame at the playhead.
- **Reverse** — the clip gets a badge and the preview plays forward with the "Preview" tag. The
  exported video is reversed and has no sound.
  A transition next to a reversed clip holds that clip's edge frame (no extra footage beyond the trim).

Photos and reversed clips only appear in the exported video with the native build (the Swift export
turns them into ordinary video before composing; this code is uncompiled until an EAS build).

## Look

Filters, Adjust, Effects and Transitions are in the **Effects** group of the toolbar.

- **Filters** — 19 filters plus None. Each has a **Strength** slider (0-100). "Apply to all clips"
  copies the filter and its strength.
- **Adjust** — twelve sliders: Brightness, Contrast, Saturation, Exposure, Warmth, Tint, Highlights,
  Shadows, Sharpen, Vignette, Fade, Grain. **Reset** sets them all back to 0; "Apply to all" copies
  them to every clip.
- **Effects** — ten: Glitch, Shake, Zoom pulse, Blur, VHS, Light leak, Flash, RGB split, Old film,
  Glow. Tap one in the Effects sheet to add it at the playhead. Effects sit on their own lane of the
  timeline as pills: move them, trim them, duplicate or delete them, and set a **Strength**.
- **Transitions** — eleven chips: None, Fade, Dissolve, Slide left / right / up / down, Zoom, Wipe,
  Spin, Blur.

**Preview vs export.** Expo Go cannot change a video's pixels, so the preview only approximates
with coloured layers and movement, and shows the "Preview" tag. The exported video is the real thing.

- Shown roughly in the preview: filter strength, brightness, exposure, warmth, tint, fade, vignette,
  lowering saturation; the effects Shake, Zoom pulse, Flash, Light leak, VHS, Old film and Glow.
- Not shown until a real build: contrast, raising saturation, highlights, shadows, sharpen, grain;
  the effects Glitch, Blur and RGB split. Every transition shows as a dip to black.

All of the export side is Swift that has never been compiled.

## Motion

Animations and keyframes. Everything shows exactly in the preview (no "Preview" tag).

- **Clip animations** (Edit, Animate) - **In** and **Out**: Fade, Slide left / right / up / down, Zoom in,
  Zoom out, Spin, Pop, Rise, with a **Length** slider. Or one **Combo**: Slow zoom in, Slow zoom out,
  Pan left, Pan right, Sway, Pulse. "Apply to all clips" copies it everywhere.
- **Text and sticker animations** (Text or Stickers, Animate) - **In**, **Out** and **Loop**: Wiggle,
  Pulse, Spin, Float, Blink, Shake. Captions do not animate.
- **Keyframes** (the diamond "Keyframe" tool in Edit, Text and Stickers) - tap it to pin the position,
  size, rotation and opacity at the playhead. Move the playhead, then pinch / drag / twist to add another
  pin; the app moves smoothly between pins. Diamonds show on the selected clip strip or text pill, and
  tapping one jumps there. Tap the tool while on a pin to remove it.

- **Speed curves** (Effects, Speed, Curve tab) - six presets: Montage, Hero, Bullet, Jump cut, Flash in,
  Flash out (or None). A curve makes the clip speed up and slow down in steps, so its length on the
  timeline changes, and the strip's badge shows the curve's name. Moving the Normal slider removes the
  curve. Photos have no speed. Trim and split keep the curve on its pictures; Replace spreads the preset
  over the new clip. The preview changes speed as it plays, so a curved clip shows the "Preview" tag
  (speed changes can hitch and the sound changes pitch in steps).

The exported video does the same, but that Swift has never been compiled.

## Text and captions

Everything here is in the **Text** group of the toolbar.

- **Templates** - a strip at the top of the text panel with twelve one-tap looks: Clean title, Bold pop,
  Neon, Subtitle bar, Comic, Retro, Handwritten, Elegant, Shadowed, Outline only, Sticker label, Soft glow.
  A template keeps your words, position, size and timing and replaces the look.
- **Style** - a block in the text panel: Opacity, Letter spacing, Line spacing, outline colour and
  thickness, Shadow (colour, opacity, distance, blur) and Glow (colour, size).
- **Fonts** - sixteen (eight new: Bebas Neue, Poppins, Playfair, Fredoka, Caveat, Press Start, Righteous,
  Dancing Script).
- **Caption style** - six presets: Classic bar, Bold outline, Yellow pop, Clean white, Neon glow, Karaoke.
  The sheet shows a sample caption, a "Highlight spoken word" switch with a colour, an Outline switch and
  the same Style block.

Auto captions only work in a native build, so in Expo Go only the sample shows the caption styling and the
word highlight.

**Preview vs export.** The preview draws text styling with stacked text layers, which is close to exact.
The outline is a soft halo in the preview and a hard stroke in the export. The export is Swift that has
never been compiled.

## Audio

Everything here is in the **Audio** group of the toolbar.

- **Add audio** opens a sheet with four tabs: **Music** (the bundled list, still empty), **Files** (pick an
  audio file), **Effects** (ten built-in sounds: Whoosh, Swoosh, Pop, Click, Ding, Beep, Riser, Drop, Tick,
  Chime - free to use, and basic-sounding) and **Record** (a voice-over).
- **Voice-over** - the video plays with all other sound muted while you talk. The recording lands on the
  timeline where you started.
- **Tracks** - up to 12. Each is a bar on its own lane (music, voice, sound effects). Tap a bar to select it:
  **Add audio**, **Volume**, **Fade** (in and out, up to 5 s each), **Duplicate**, **Delete**. Long-press a bar to move it;
  drag its handles to trim.
- **Clip sound** - a clip's own sound also has **Fade in** and **Fade out** (in the clip's Volume sheet).
- **Ducking** - a switch in the Audio tools: music dips to 30 % while a voice-over plays.
- **Beats** - tap along to drop beat markers, shown as ticks on the timeline.

**Preview vs export.** In Expo Go several sounds can drift slightly against the video in the preview; the
export mixes them exactly. The sound effects are made by `scripts/generate-sfx.mjs`. The export side is Swift
that has never been compiled.

## Layers

Everything here is in the **Edit** group of the toolbar.

- **Overlay** - pick a photo or a video. It is added as a layer on top of the main video at the playhead,
  small and in the middle, with its own bar on a **layers** lane of the timeline. Up to 8 layers; at most
  2 *video* layers can play at the same moment (photo layers are not limited that way).
- **Select** a layer by tapping it on the preview or tapping its bar. Pinch, drag and twist it on the
  preview. Long-press its bar to move it in time; drag the bar's ends to trim. **Forward** / **Back**
  change which layer is on top.
- **Tools on a layer** - Trim, Transform, Animate, Keyframe, Crop, Replace, Reverse, Duplicate, Delete,
  Filter, Adjust, Speed and Volume. Split, Freeze, Ratio, Transition and Background do not apply to layers.
- **Opacity** (0 to 100 %) and **Mask** (None, Rounded, Circle) work on layers and on normal clips.

**Preview vs export.** Each video layer is a separate video player in the preview, so playback may hitch
on older phones. The export is Swift that has never been compiled.

## First native build — things to check

When the first EAS build exists, compare the export against the preview and check these Look items:

1. **Warm / cool direction.** The Adjust "Warmth" slider and the Warm / Cool / Sunset / Golden / Teal
   filters use `CITemperatureAndTint` in opposite conventions, so one of them is backwards. Compare
   with the preview and flip the constant that is wrong.
2. **Strength of Adjust.** Fade, brightness and the tone curve may look stronger in the export than
   in the preview, because Core Image works in linear light. Tune the constants in
   `src/editor/model/adjust.ts` and `modules/clipy-video/ios/Adjust.swift` together.
3. **Grain look.**
4. **VHS scan lines** (the generator is unverified).
5. **Spin and slide directions** of the new transitions.
6. **Text and sticker animations** use sampled Core Animation keyframes. Check timing, direction, and that an animated text is hidden before and after its time.
7. **Resized text.** When a text's size is keyframed or animated, the export scales the laid-out lines while the preview re-wraps the text. Compare the two with a large pinned text (two lines, pinned from small to big).
8. **Sharpness of scaled-up text.** A text or sticker that grows (a pin with a bigger scale, Pop, Pulse) should stay sharp in the export, not blurry.
9. **Core Animation keyframes in the export.** Check that the export tool honours the sampled keyframes at all: an animated text or sticker must move in the exported file, not sit still or be missing.
10. **Fading clip.** A fading clip should fade over its background (black / colour / blur): half way through a Fade the picture and the background are mixed half and half.
11. **Rotation direction** of Spin and of keyframed rotation.
12. **Speed curves.** A curved clip's exported length equals its length on the timeline; there is no black frame or gap between steps or next to a transition; and the clip's sound stays in sync after retiming.

Text and captions items:

13. **Fonts.** Each of the 16 fonts appears in the exported video (not a plain system font).
14. **Shadow and glow strength** against the preview. The export uses half the blur radius as a first guess.
15. **Shadow direction** is down-right, as in the preview.
16. **Letter spacing** on centred text.
17. **Text opacity** together with a shadow or glow.
18. **Caption word highlight** timing, and that the lit word does not look heavier than the rest.
19. **Captions are generated with word timings** (so the highlight has something to follow).
20. **Microphone prompt.** It appears with the right text, and a voice-over records real sound. If recordings are silent, look for an "[expo-video] Failed to set audio session category" warning: the video player may be resetting the audio session.
21. **Voice-over sync.** A voice-over stays in sync with the picture in the export.
22. **Fades and ducking.** The fade and ducking ramps sound right.
23. **Several tracks** mix without clipping.
24. **End of video.** A music track cut by the end of the video fades out over its last second.

Layers, opacity and masks items:

23. **Layers in the export** appear in the right place, order and size.
24. **Mask edges** are clean and turn with the layer.
25. **A see-through layer** blends correctly with what is beneath it.
26. **Layer sound** is heard and stays in sync.
27. **Two video layers at once** export correctly.
28. **A layer running past the end** of the video is cut cleanly.
