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
- The cover frame chosen in the editor is sent to Instagram as the Reel's thumbnail (`thumb_offset`, in milliseconds, pulled back 0.05 s from the very end); no cover image is uploaded to any platform, and the other platforms pick their own.
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

The UI is the "Grand Voyage" look: deep navy backgrounds, a gold accent, and an editor toolbar that follows what is selected, with small tool strips for the quick tools. Every colour, font, radius and duration comes from `src/theme/theme.ts`; the shared kit lives in `src/ui/`. UI fonts are Oswald (titles) and Montserrat (body), both under the SIL Open Font License (OFL). Regenerate the app icon and splash with `npm run gen:brand`.

**Building blocks.** One spacing scale (4 / 8 / 12 / 16 / 24 / 32, `theme.space`) and one 16-pt gutter at the screen edges. Sizes for buttons, chips, tiles and icons come from `theme.size`. There are three kinds of button: gold (the one main action of a screen or panel), outlined, and text only; the compact versions are 36 pt high with extra touch room. A selected chip or tile has a gold ring, a lighter surface and is a touch larger. Every tool icon is an outline icon, and a gold icon means "on". Sliders are the kit `Slider` (`src/ui/Slider.tsx`: gold track, a light tick at the rest value, the current value in the label) and pick-one tiles are the kit `Tile` (`src/ui/Tile.tsx`). Surfaces are layered by colour (page, bar, tile, selected), not by shadows.

**Motion.** Buttons dip when pressed; a strip or panel fades and rises in, the row of tools fades in when it changes, messages ease in and out. Closing is instant. Nothing lasts longer than a quarter of a second, only opacity and position change (never layout next to the video), and every animation is built in `src/ui/motion.ts`. With Reduce Motion on, nothing slides or grows (`src/ui/useReducedMotion.ts`); buttons still react.

## Layout

- `app/` — screens (Expo Router): `index.tsx`, `editor/[id]/index.tsx`, `editor/[id]/export.tsx`
- `src/editor/` — model (types/ops/timeline/`overlayLayout.ts`), store, and components (PreviewPlayer, Timeline,
  ClipThumbStrip, TrimHandles, ReorderHandle, EditorToolbar, RatioSheet, TrimSheet (a strip), text style panel,
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
- `assets/emoji.json` — emoji search data (`char`/`name`/`keywords[]`) for the sticker panel,
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

## Editing tools

The row of tools under the preview follows what you have selected.

- **Nothing selected** - Edit, Audio, Text, Stickers, Overlay, Effects, Filter, Adjust, Ratio, Background, Cover, Templates. Edit, Filter, Adjust and Background work on the clip under the white line.
- **A clip** - Split, Trim, Select, Speed, Volume, Animate, Filter, Adjust, Background, Templates, Crop, Transform, Opacity, Mask, Green screen, Keyframe, Transition, Replace, Reverse, Freeze, Duplicate, Delete.
- **A layer** - the same without Split, Select, Background, Templates, Transition and Freeze, plus Blend, Forward and Back.
- **A text** - Edit, Animate, Keyframe, Duplicate, Delete, Add text. **A caption** - Edit, Captions, Duplicate, Delete, Add text. **A sticker** - Edit, Animate, Keyframe, Duplicate, Delete.
- **A sound** - Volume, Fade, Duplicate, Delete, Add audio, Ducking, Beats. **An effect** - Strength, Duplicate, Delete.
- **Audio** and **Text** (from the first row) open their own row: Add audio, Ducking, Beats; Add text, Captions.

The bar is 90 pt high; a strip is 154 pt with a 44-pt header.

Every row except the first has a **back arrow** at the left that clears the selection. Tools that do not apply are not shown (a photo has no Speed, the last clip has no Transition); only Keyframe (the white line is not on the item), Replace / Overlay (while the picker is open) and Freeze (while it captures) grey out for a moment.

**Strips.** Quick tools (Filter, Adjust, Speed, Volume, Opacity, Animate, Mask, Blend, Green screen, Transform, Background, Ratio, Transition, Fade, Strength) open as a small panel in place of the row. Nothing dims and the video keeps its size; you can play, scrub and tap the timeline while it is open. It rises over the two lowest timeline rows. The round **✓** closes it, and so does selecting something else. The ratio pill next to the play button and the mark between two clips open the Ratio and Transition strips. The Effects list and Trim (by numbers) are strips too.

**Panels.** Text, Stickers, the sticker editor, Add audio, Templates, Captions, Caption style and Beats open as a tall panel at the bottom. Nothing dims: the timeline and the row of tools give the panel their place (the timeline comes back where it was, same zoom), and the video stays above it, a little smaller (smaller still for the big panels), and keeps playing. Play, undo and redo stay usable above the panel. The round **✓** closes it, and so does selecting something else. When you type, the panel sits on the keyboard at a lower height and the video stays in view; drag the panel's content down to put the keyboard away (the panel stays open). While a voice-over is recorded the panel stays until the recording is stopped and saved, and the other tools and Export do not open. Trim's number boxes work the same way: with the keyboard up the timeline is hidden and the strip sits on the keyboard. Panels fade and rise in; closing is instant. Cover is still a pop-up sheet (it dims the screen) and Crop is a full screen.

## Clip tools

Select a clip, then use the tools under the preview (see Editing tools).

- **Transform** — pinch, drag or twist the clip on the preview (it snaps gently to the centre,
  straight angles, Fit and Fill). The Transform strip has Rotate 90°, Flip horizontal / vertical,
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

Filter and Adjust are on the first row and on a selected clip's row; Transition is on a clip's row (or tap the mark between two clips); Effects is on the first row.

- **Filters** — 19 filters plus None. Each has a **Strength** slider (0-100). "Apply to all clips"
  copies the filter and its strength.
- **Adjust** — twelve sliders: Brightness, Contrast, Saturation, Exposure, Warmth, Tint, Highlights,
  Shadows, Sharpen, Vignette, Fade, Grain. **Reset** sets them all back to 0; "Apply to all" copies
  them to every clip.
- **Effects** — ten: Glitch, Shake, Zoom pulse, Blur, VHS, Light leak, Flash, RGB split, Old film,
  Glow. Tap one in the Effects strip to add it at the playhead. Effects sit on their own lane of the
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

Everything here is under **Text** on the first row, or on the row of a selected text.

- **Templates** - a strip at the top of the text panel with twelve one-tap looks: Clean title, Bold pop,
  Neon, Subtitle bar, Comic, Retro, Handwritten, Elegant, Shadowed, Outline only, Sticker label, Soft glow.
  A template keeps your words, position, size and timing and replaces the look.
- **Style** - a block in the text panel: Opacity, Letter spacing, Line spacing, outline colour and
  thickness, Shadow (colour, opacity, distance, blur) and Glow (colour, size).
- **Fonts** - sixteen (eight new: Bebas Neue, Poppins, Playfair, Fredoka, Caveat, Press Start, Righteous,
  Dancing Script).
- **Caption style** - six presets: Classic bar, Bold outline, Yellow pop, Clean white, Neon glow, Karaoke.
  The Caption style panel keeps a sample caption in view above the scrolling controls, then a "Highlight spoken word" switch with a colour, an Outline switch and
  the same Style block.

Auto captions only work in a native build, so in Expo Go only the sample shows the caption styling and the
word highlight.

**Preview vs export.** The preview draws text styling with stacked text layers, which is close to exact.
The outline is a soft halo in the preview and a hard stroke in the export. The export is Swift that has
never been compiled.

## Audio

Everything here is under **Audio** on the first row, or on the row of a selected sound.

- **Add audio** opens a panel with four tabs: **Music** (the bundled list, still empty), **Files** (pick an
  audio file), **Effects** (ten built-in sounds: Whoosh, Swoosh, Pop, Click, Ding, Beep, Riser, Drop, Tick,
  Chime - free to use, and basic-sounding) and **Record** (a voice-over).
- **Voice-over** - the video plays with all other sound muted while you talk. The recording lands on the
  timeline where you started.
- **Tracks** - up to 12. Each is a bar on its own lane (music, voice, sound effects). Tap a bar to select it:
  **Add audio**, **Volume**, **Fade** (in and out, up to 5 s each), **Duplicate**, **Delete**. Long-press a bar to move it;
  drag its handles to trim.
- **Clip sound** - a clip's own sound also has **Fade in** and **Fade out** (in the clip's Volume strip).
- **Ducking** - a switch in the Audio tools: music dips to 30 % while a voice-over plays.
- **Beats** - tap along to drop beat markers, shown as ticks on the timeline.

**Preview vs export.** In Expo Go several sounds can drift slightly against the video in the preview; the
export mixes them exactly. The sound effects are made by `scripts/generate-sfx.mjs`. The export side is Swift
that has never been compiled.

## Layers

Overlay is on the first row; the rest is on the row of a selected layer.

- **Overlay** - pick a photo or a video. It is added as a layer on top of the main video at the playhead,
  small and in the middle, with its own bar on a **layers** lane of the timeline. Up to 8 layers; at most
  2 *video* layers can play at the same moment (photo layers are not limited that way).
- **Select** a layer by tapping it on the preview or tapping its bar. Pinch, drag and twist it on the
  preview. Long-press its bar to move it in time; drag the bar's ends to trim. **Forward** / **Back**
  change which layer is on top.
- **Tools on a layer** - Trim, Transform, Animate, Keyframe, Crop, Replace, Reverse, Duplicate, Delete,
  Filter, Adjust, Speed and Volume. Split, Freeze, Ratio, Transition and Background do not apply to layers.
- **Opacity** (0 to 100 %) and **Mask** (None, Rounded, Circle) work on layers and on normal clips.
- **Blend** (layers only) - Normal, Multiply, Screen, Overlay, and more. **Green screen** (clips and layers) -
  pick Green, Blue or another colour and a strength. Blend and green screen show **only in the exported video**;
  the preview shows the "Preview" tag and the picture does not change.
- **Blur box / Mosaic box** (Effects) - a rectangle added at the playhead that blurs or pixelates what is under it.
  Drag, pinch or pull a corner on the preview; move and trim its pill on the timeline.

**Preview vs export.** Each video layer is a separate video player in the preview, so playback may hitch
on older phones. The export is Swift that has never been compiled.

## Polish

- **Export options** - the export screen has three rows: Resolution, Frame rate (24 / 30 / 60 fps) and Quality
  (High / Smaller file). They are remembered per project. **30 fps + High is exactly the export as it always was.**
  **Smaller file** asks the engine to keep the file under a size limit (`fileLengthLimit`); this is a ceiling, not a
  target, and it is untested until the first native build. 24 fps from 30 fps sources may judder slightly;
  text and sticker animations are still sampled 30 times a second at every frame rate.
- **Cover** - **Edit** -> **Cover** (last tool). Drag the slider to pick a frame, type a short title (up to 40
  characters), then **Done**; **Reset** goes back to the first frame. **Save to Photos** saves the picture (1080 px
  wide, a screen capture of the cover frame, so filters and layers are not on it); it is disabled while you type
  the title. The drafts list shows the cover and its title once you leave the editor (the picture is written when
  the editor closes; if the app is killed inside the editor the first frame shows until the next close).
  The cover is sent to **Instagram only**, as the Reel's thumbnail.
- **Snapping** - while you move or trim a bar on the timeline (text, caption, sticker, effect, audio, layer, or a
  clip's trim handles), its edges click onto the playhead, clip cuts, other bars' edges and beat marks, with a thin
  gold guide line and a light buzz. Always on. A snap that the bar's own rules would refuse or clamp is not a snap
  (no guide, no buzz). A clip trim snaps the clip's end on the timeline.
- **Multi-select** (main clips only) - **Edit** -> **Select**, then tap clips to choose them. The bar then offers
  Filter, Speed, Volume, Duplicate and Delete for all chosen clips in one undo step. Delete does not ask. Keyframe
  dots are hidden in the mode so a tap always toggles. Leave with the bar's Done button or by tapping a layer,
  text, audio bar or effect. (Long-press on a clip is the reorder gesture, so it is not used for selecting.)
  In a multi-clip Speed change, effects are refitted once against the final length.

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

Blend, green screen and blur / mosaic box items:

29. **Green screen cube.** The colour-cube entry order (red fastest) and premultiplied entries are right; `CIColorCubeWithColorSpace` with sRGB keys removes mid-dark greens as the maths expects. Try a real green-screen clip and check edge quality.
30. **Blend modes** are computed in Core Image's linear working space, so Overlay / Multiply / Screen may look different from other apps.
31. **Blend keys.** `CIBlendWithAlphaMask` and `CIColorMatrix` input keys are accepted; the soft edges of a blended, masked layer look right.
32. **Mosaic box.** `CIPixellate` blocks are aligned to the box corner.
33. **Blur box** has no dark rim at its edges.
34. **Box position.** A blur / mosaic box lands where the preview rectangle was (top-left fractions vs Core Image bottom-left).
35. **Optional records.** The optional nested records (`chroma`, `rect`) decode from JS null.

Polish items:

36. **Frame rate.** A 24 and a 60 fps export are really written at that rate and play smoothly; text and sticker animations still move. `static let frameRate` beside `static func frameRate(for:)` in `ExportSession.swift` compiles (if not, rename the function and update its parity test).
37. **Smaller file.** A "Smaller file" export plays to the END, is smaller than the same export at High and not far above its estimate. If it is cut short or fails, set `ExportSession.limitsFileLength` to false; a High export is unaffected either way.
38. **60 fps export time** (and heat) on a long project.
39. **Cover on Instagram.** The Reel's cover is the chosen frame; `thumb_offset` is in milliseconds, and Instagram accepts an offset 0.05 s before the end.
40. **Deprecation warning** on `composition.duration` in the export code: expected, harmless.
