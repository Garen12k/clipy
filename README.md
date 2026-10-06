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

**Screens.** The home, export, post and accounts screens use the same building blocks as the editor: `Field` (the one text box), `Card` (the one card surface) and `Spinner`. Each screen or state has at most one gold button (Accounts has none: Connect and Reconnect are outlined, Disconnect and Sign out are text only). A project card shows its cover with the length at the top right and the name over a dark fade; the project list eases in once when it first appears.

**Moving between screens.** A project and the Post / Accounts screens slide in from the side, Export rises from the bottom (the standard iOS movements; the options live in `src/navigation/screenOptions.ts`). Swiping back works everywhere except while an export renders or uploads run; in the editor only the left edge starts the swipe. Pop-up sheets rise on a spring that cannot bounce and are placed at once with Reduce Motion.

## Layout

- `app/` — screens (Expo Router): `index.tsx`, `post.tsx`, `accounts.tsx`, `oauth.tsx`, `editor/[id]/index.tsx`, `editor/[id]/export.tsx`
- `src/editor/` — model (types/ops/timeline/`overlayLayout.ts`), store, and components (PreviewPlayer, Timeline,
  ClipThumbStrip, TrimHandles, ReorderHandle, EditorToolbar, RatioSheet, TrimSheet (a strip), text style panel,
  music lane). `src/editor/model/overlayLayout.ts` computes text overlay position/size as fractions of
  the frame and must stay in sync with `modules/clipy-video/ios/OverlayLayout.swift`, which mirrors the
  same formula for the native renderer.
- `src/projects/` — project storage behind `FsAdapter`/`expoFs`, and the Projects screen pieces
- `src/export/` — export estimate, `useExport`, `ExportScreenBody`
- `src/navigation/` — the screen-transition options (`screenOptions.ts`)
- `src/theme/` — theme tokens
- `src/ui/` — shared UI primitives
- `modules/clipy-video/` — Swift native module (`ios/`, `ios/Tests/`) and its TypeScript wrapper (`index.ts`)
- `assets/fonts/` — 16 bundled font files used by the text style panel (licences in `assets/fonts/LICENSES.md`)
- `assets/music/` — eight bundled background tracks + `manifest.json`, and `beats.json`: their beats, generated by
  `scripts/generate-beats.mjs` (re-run it rather than editing the file; see `assets/music/README.md` for the command
  and for how to add a CC0 track)
- `assets/emoji.json` — emoji search data (`char`/`name`/`keywords[]`) for the sticker panel,
  generated by `npm run gen:emoji` from the MIT-licensed `unicode-emoji-json` package
  (`scripts/gen-emoji.mjs`); re-run after upgrading that package.
- `docs/superpowers/` — specs and implementation plans

## Phase 1 features

- Projects (create, list, reopen, rename, duplicate, delete)
- Import clips
- Timeline (split, trim, reorder); a clip whose source video is missing shows a warning badge
  and is skipped by preview and export. The rows under the clips (layers, text / stickers, music, voice,
  sound effects, effects) appear only once they hold something, so a project with clips only gives the
  video the most room; adding the first text, sound or effect adds its row (`laneModel` in
  `src/editor/timelineLayout.ts` is the one rule)
- Preview playback
- Export, with a fallback card in Expo Go when the native module is not linked

## Quick edit

A second button on the home screen, beside **New project**: pick a style, pick photos and videos, and the app opens a
finished draft. Works fully in Expo Go.

- **Six styles** (on screen they are called styles; **Templates** is a different tool inside the editor), each with its
  own built-in music: **Travel** (The Field of Dreams), **Party** (Party Sector), **Calm** (Bossa Nova), **Cinematic**
  (Piano), **Retro** (Funked Up), **Vlog** (Happy Adventure). A style also sets how long photos and videos last, a
  transition (Vlog has none), a filter, a title ("Our trip", "Party time", ...) and a slow motion on the photos.
- **The flow.** **Quick edit** -> a sheet with the six styles (Travel is preselected each time; one line names the
  style's music) -> **Choose photos and videos** -> the photo library, up to **30** items, in the order tapped ->
  "Making your quick edit" -> the editor. The shape is not asked: it is **Auto** (the first item's shape); change it
  with **Ratio**.
- **What the draft is.** The music starts on its first beat; beat markers are placed from it; every clip, the last one
  too, ends on a marker (photos last a fixed number of beats, long videos are shortened to a fixed number, short videos
  end on the latest beat they reach). The music ends with the video and fades out over its last second.
- **The music does not loop.** Cinematic's song is 32 s and Vlog's 47 s: with many items the later clips play without
  music (each at exactly its style's length). Add music again in the editor.
- **It is a normal project**, named "Project N": every part can be changed or undone in the editor. Nothing new is
  stored (schema 17).
- **Cancel leaves nothing behind.** Closing the sheet or cancelling the library makes no project. The music is fetched
  before the project is created, and a draft that cannot be finished is deleted again ("Couldn't make the quick edit").
  If only some items could not be read, the draft is made from the rest and a message counts them.
- **While a project is being made** (Quick edit or New project) the home screen takes no touches, and the editor opens only
  if the home screen is still in front.

The styles are data (`QUICK_RECIPES` in `src/projects/quickEdit.ts`), built by one pure function (`buildQuickEdit`);
the all-or-nothing flow is `makeQuickEdit` in `src/projects/quickEditFlow.ts`.

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
- Emoji and shape stickers (twenty shapes, seven emoji packs - see Text and captions): same overlay lane, gestures, and timing as text. Emoji data
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
- **A sound** - Split, Volume, Fade, Duplicate, Delete, Add audio, Ducking, Beats. **An effect** - Strength, Duplicate, Delete.
- **Audio** and **Text** (from the first row) open their own row: Add audio, Ducking, Beats; Add text, Captions.

The bar is 90 pt high; a strip is 154 pt with a 44-pt header.

Every row except the first has a **back arrow** at the left that clears the selection. Tools that do not apply are not shown (a photo has no Speed, the last clip has no Transition); only Keyframe (the white line is not on the item), Replace / Overlay (while the picker is open) and Freeze (while it captures) grey out for a moment.

**Strips.** Quick tools (Filter, Adjust, Speed, Volume, Opacity, Animate, Mask, Blend, Green screen, Transform, Background, Ratio, Transition, Fade, Strength) open as a small panel in place of the row. Nothing dims; you can play, scrub and tap the timeline while it is open. It rises over the two lowest timeline rows and never over the clips: with two or more rows under the clips the video keeps its size, with fewer the video gets a little smaller while the strip is open. The round **✓** closes it, and so does selecting something else. The ratio pill next to the play button and the mark between two clips open the Ratio and Transition strips. The Effects list and Trim (by numbers) are strips too.

**Panels.** Text, Stickers, the sticker editor, Add audio, Templates, Captions, Caption style, Beats and Cover open as a tall panel at the bottom. Nothing dims: the timeline and the row of tools give the panel their place (the timeline comes back where it was, same zoom), and the video stays above it, a little smaller (smaller still for the big panels), and keeps playing. Play, undo and redo stay usable above the panel. The round **✓** closes it, and so does selecting something else. When you type, the panel sits on the keyboard at a lower height and the video stays in view; drag the panel's content down to put the keyboard away (the panel stays open). While a voice-over is recorded the panel stays until the recording is stopped and saved, and the other tools and Export do not open. Trim's number boxes work the same way: with the keyboard up the timeline is hidden and the strip sits on the keyboard. Panels fade and rise in; closing is instant. Crop is a full screen.

**Aspect ratio.** Nine choices: **Auto**, 1:1, 3:2, 2:3, 16:9, 9:16, 4:3, 3:4 and 21:9.

- **Auto** gives the frame the shape of the project's first clip (photo or video, as it is displayed), so that clip fills the frame exactly. It follows the first clip: reorder, delete or replace it and the frame changes with it. The shape is kept between 9:21 and 21:9; a project without clips is 9:16. A clip's own Transform or Crop does not change the frame.
- **When a project is created**: after you pick photos or videos, a sheet asks for the aspect ratio with Auto already chosen. **Create** makes the project; closing the sheet makes nothing. Adding clips to an existing project does not ask.
- **In the editor**: the Ratio tool (the row of tools, or the pill beside the play button, which shows "Auto" or the ratio) is a strip of nine tiles, each drawn in its shape. A pick is one undo step; the strip stays open so you can try several shapes, and ✓ closes it.
- Texts and stickers keep their place (positions are fractions of the frame). Projects made before this keep the ratio they had.
- One function turns the choice into a number: `frameAspect(project)` in `src/editor/model/types.ts`. The preview, the clip layout, the cover and the export all use it; nothing else looks at "auto".
- **Export size**: the short side is the resolution (720 / 1080 / 2160), the long side follows the shape, both rounded to even numbers - `renderSize` in `src/export/estimate.ts`, mirrored by `ExportSession.renderSize` (keep them identical; `src/export/__tests__/renderSize.swift.test.ts`). 9:16, 1:1 and 16:9 export at exactly the sizes they always did. A 4K frame wider than about 1.9:1 is more than the H.264 encoder takes (its longer side would be above 4096 pixels) and is scaled down, same shape (21:9 at 4K is 4092 x 1754). The file-size estimate and the bitrate go by resolution only, as before.
- **Cover saved to Photos**: 1080 pixels on its shorter side (a 16:9 cover is 1920 x 1080, a 9:16 one 1080 x 1920).
- The drafts grid shows every project in the same 3:4 card whatever its ratio.

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

- **Filters** — 31 filters plus None. The twelve newest, after Dream: Amber, Jade, Matte, Bleach, Dusk, Moody, Cinema, Blush, Grit, Silver, Indigo, Drama. The Filter row opens at the filter in use. Each has a **Strength** slider (0-100). "Apply to all clips"
  copies the filter and its strength.
- **Adjust** — twelve sliders: Brightness, Contrast, Saturation, Exposure, Warmth, Tint, Highlights,
  Shadows, Sharpen, Vignette, Fade, Grain. **Reset** sets them all back to 0; "Apply to all" copies
  them to every clip.
- **Effects** — twenty: Glitch, Shake, Zoom pulse, Blur, VHS, Light leak, Flash, RGB split, Old film,
  Glow, Blur box, Mosaic box, Film burn, Lens flare, Dust, Heartbeat, Hue shift, Mirror, Soft edges,
  Strobe. Tap one in the Effects strip to add it at the playhead. Effects sit on their own lane of the
  timeline as pills: move them, trim them, duplicate or delete them, and set a **Strength**.
- **Transitions** — twenty-one chips: None, Fade, Dissolve, Slide left / right / up / down, Zoom, Wipe,
  Spin, Blur, Cover left, Reveal left, Cover up, Reveal down, Circle open, Circle close, Diagonal wipe,
  Clock wipe, Pixelate, White flash. The Transition row opens at the chip in use.

**Preview vs export.** Expo Go cannot change a video's pixels, so the preview only approximates
with coloured layers and movement, and shows the "Preview" tag. The exported video is the real thing.

- Shown as in the export: the effects Heartbeat and Strobe, and the transition White flash.
- Shown roughly in the preview: filter strength (the twelve newest filters as a tint of the same kind),
  brightness, exposure, warmth, tint, fade, vignette,
  lowering saturation; the effects Shake, Zoom pulse, Flash, Light leak, VHS, Old film, Glow, Film burn,
  Lens flare, Soft edges and Dust. Cover left, Reveal left, Cover up, Reveal down, Circle open, Circle
  close and Diagonal wipe show the export's moving edge as a black shape: the preview never shows two
  clips at once, so the other clip is black. The older transitions show as a dip to black.
- Not shown until a real build: contrast, raising saturation, highlights, shadows, sharpen, grain;
  the effects Glitch, Blur, RGB split, Hue shift and Mirror. Clock wipe and Pixelate show only as the
  dip to black.

All of the export side is Swift that has never been compiled.

## Motion

Animations and keyframes. Everything shows exactly in the preview (no "Preview" tag).

- **Clip animations** (Edit, Animate) - **In** and **Out**: Fade, Slide left / right / up / down, Zoom in,
  Zoom out, Spin, Pop, Rise, with a **Length** slider. Or one **Combo**: Slow zoom in, Slow zoom out,
  Pan left, Pan right, Sway, Pulse (for a photo the Combo list is only Sway and Pulse: its zoom and pan are
  the Motion tool's). "Apply to all clips" copies it everywhere.
- **Photo motion** (select a photo, **Motion**, after Animate) - None, Zoom in, Zoom out, Pan left / right / up /
  down, Corner zoom, with a **Strength** slider and **Apply to all photos**. It starts and ends softly. A photo has
  either a Motion, a Combo or keyframes, never two of them: picking one removes the other, and the Keyframe tool is
  not offered while a Motion is set. An old "Slow zoom" or "Pan" Combo on a photo shows as its Motion tile and keeps
  playing exactly as before. The In and Out animations still work with a Motion. In the editor a photo is redrawn
  20 times a second, so its movement is a little less fluid than in the exported video.
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

- **Templates** - a strip at the top of the text panel with twenty-four one-tap looks: Clean title, Bold pop,
  Neon, Subtitle bar, Comic, Retro, Handwritten, Elegant, Shadowed, Outline only, Sticker label, Soft glow,
  then Headline, Neon outline, Soft shadow, Sticky note, Title bar, Stamp, Bubblegum, Cinema, Gold,
  Chalkboard, 3D pop, Watermark. A template keeps your words, position, size and timing and replaces the
  look. The new twelve are looks only (no animation).
- **Five rows** - lower in the text panel (and in Caption style), each closed until tapped: **Outline**
  (colour, thickness), **Shadow** (colour, opacity, distance, blur), **Background** (colour, **Rounded /
  Square**, **Padding**, **Box opacity**), **Spacing and opacity** (Opacity, Letter spacing, Line spacing)
  and **Glow** (colour, size). Tap a row's name to open or close it; switching a row on opens it. Opening
  and closing is not an edit and leaves nothing to undo. Padding runs from none to 0.6 of the font size
  (the default, 0.25, is the box every text had before); a rounded corner is always half of that default
  padding, whatever the Padding slider says.
- **Fonts** - sixteen (eight new: Bebas Neue, Poppins, Playfair, Fredoka, Caveat, Press Start, Righteous,
  Dancing Script).
- **Caption style** - six presets: Classic bar, Bold outline, Yellow pop, Clean white, Neon glow, Karaoke.
  The Caption style panel keeps a sample caption in view above the scrolling controls, then a "Highlight spoken word" switch with a colour, an Outline switch and
  the same five rows.
- **Stickers** - twenty shapes (the seven original ones plus Curved and Two-way arrows, Round, Sharp and
  Thought speech bubbles, Seal, Award, Banner, Sparkle, Burst, Frame, Ring and Corners; Frame, Ring and
  Corners are see-through in the middle). The emoji picker has seven packs - Faces,
  Hands, Hearts, Food, Travel, Symbols and More (everything else, 1,125 emoji) - with Recently used
  on top. Search covers every pack and ignores the one you are in; the pack buttons and Recently used
  are hidden while you type. Shape paths are absolute `M L C Q Z` in a 0-100 box (non-zero fill; a hole
  is an inner subpath wound the other way). Curved text and animated stickers are not built.

Auto captions only work in a native build, so in Expo Go only the sample shows the caption styling and the
word highlight.

**Preview vs export.** The preview draws text styling with stacked text layers, which is close to exact.
The outline is a soft halo in the preview and a hard stroke in the export; that is most visible on
Neon outline, Stamp and Bubblegum. The background box's padding and corners are the same numbers on both
sides. The preview draws at most four stacked text layers per text and one box per text. The export is
Swift that has never been compiled.

## Audio

Everything here is under **Audio** on the first row, or on the row of a selected sound.

- **Add audio** opens a panel with four tabs: **Music** (eight built-in tracks), **Files** (pick an
  audio file), **Effects** (ten built-in sounds: Whoosh, Swoosh, Pop, Click, Ding, Beep, Riser, Drop, Tick,
  Chime - free to use, and basic-sounding) and **Record** (a voice-over).
- **Voice-over** - the video plays with all other sound muted while you talk. The recording lands on the
  timeline where you started.
- **Tracks** - up to 12. Each is a bar on its own lane (music, voice, sound effects). Tap a bar to select it:
  **Add audio**, **Volume**, **Fade** (in and out, up to 5 s each), **Duplicate**, **Delete**. Long-press a bar to move it;
  drag its handles to trim.
- **Split** (first on a selected sound's row) cuts the sound in two at the white line; the second piece becomes the selected one. It is greyed where the line is off the sound or closer than 0.5 s to one of its ends (0.1 s for a sound effect). The first piece keeps the fade in, the second the fade out.
- **Clip sound** - a clip's own sound also has **Fade in** and **Fade out** (in the clip's Volume strip).
- **Ducking** - a switch in the Audio tools: music dips to 30 % while a voice-over plays.
- **Beats** - tap along to drop beat markers, shown as ticks on the timeline. The panel is a regular tall panel: the
  timeline is hidden while it is open, so tap the round **✓** to see the ticks and the clips. On a short phone
  **Remove nearest** and **Clear all** need a scroll inside the panel.
- **Find beats** (in the Beats panel) places the markers of the music for you - the selected music track, else the one
  that starts first. **Built-in music only**: it looks up beats that ship with the app (`assets/music/beats.json`), it
  does not listen to anything. **Seven of the eight tracks** have beats; **The Frigid Seas** has no steady beat and the
  button says so. For your own music files the button is off until a native build (item 84 below) - use **Tap**. The
  **Fewer / More** slider chooses every fourth beat, every second (where it rests) or every beat; after a Find, and
  until the panel is closed, dragging it re-places the markers (one drag = one Undo). Find replaces the markers under
  the music's stretch of the timeline and keeps every marker outside it. A project holds at most 300 markers: when
  the music's beats do not all fit, the later ones are not placed and a message says "Only 300 markers fit. The last
  beats were left out." **The markers do not follow the music afterwards**: move, trim or split the music and they
  stay where they were - tap Find beats again.
- **Cut to beats** (same panel) shortens the main clips so that every cut lands on a beat marker: each clip ends on
  the latest marker it reaches. Clips are only ever shortened, from their end; none is deleted, reordered or
  lengthened, and none is left shorter than **half a second** (a clip with no marker in reach stays as it is). **The
  last clip is left alone.** One tap is **one Undo**. Text, stickers, overlays (layers) and sounds **do not move** -
  the same as after a trim by hand - so check anything placed late; a transition on a clip that became very short is
  removed, and an effect left wholly past the new end is dropped (Undo brings both back). Off, with one line saying
  why, when there are no markers or fewer than two clips.

**Preview vs export.** In Expo Go several sounds can drift slightly against the video in the preview; the
export mixes them exactly. The sound effects are made by `scripts/generate-sfx.mjs`. The export side is Swift
that has never been compiled.

## Layers

Overlay is on the first row; the rest is on the row of a selected layer.

- **Overlay** - pick a photo or a video. It is added as a layer on top of the main video at the playhead,
  small and in the middle, with its own bar on a **layers** lane of the timeline. Up to 8 layers; at most
  2 *video* layers can play at the same moment (photo layers are not limited that way).
- **Collage** (the main bar, after Overlay; also on a collage cell's bar) - six layouts: Side by side, Stacked,
  Big and two, Row of three, Grid of four, Inset. Pick that many photos or videos (at most 2 videos); each one is
  an ordinary layer that fills its cell, so every layer tool works on it. **Border** (0 to 6 %) opens a gap between
  the pictures and around them: the main video shows through it, there is no coloured border, and the main video's
  sound keeps playing. **Corner** has three stops: Square, Rounded, Round. With a cell selected, the panel shows
  the layout tiles of that collage (Side by side, Stacked and Inset for two pictures) and re-lays it. A cell you moved
  by hand is left alone by the sliders and the layout tiles. After a **Ratio** change nothing moves by itself:
  **Fit to frame** appears in the panel and lines the cells up for the new shape. A very wide or very tall picture
  (an iPhone panorama in Side by side, a 16:9 video in Row of three on a 9:21 frame) is fitted with strips of the main
  video showing at two sides instead of filling its cell. Replace puts the new picture into the same cell.
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
- **Cover** - **Edit** -> **Cover** (last tool). It opens as a panel under the video, like the other tools. Drag
  the slider to pick a frame and type a short title (up to 40 characters): the panel shows the chosen frame with
  the title on it, and the choice is kept as you go (one drag is one undo step, a run of typing is one); the round
  **✓** closes the panel. **Reset** goes back to the first frame and no title. **Save to Photos** saves the picture
  (1080 px wide, a screen capture of the cover frame, so filters and layers are not on it); it is disabled while
  the keyboard is up. The drafts list shows the cover and its title once you leave the editor (the picture is written when
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

Aspect ratio items:

41. **Render sizes for the new ratios.** Export one project at 1080p in 3:2, 2:3, 4:3, 3:4 and 21:9 and read the file's size: 1620 x 1080, 1080 x 1620, 1440 x 1080, 1080 x 1440, 2520 x 1080. 9:16, 1:1 and 16:9 must be what they always were (1080 x 1920, 1080 x 1080, 1920 x 1080).
42. **Even dimensions.** Every exported file has an even width and height (an odd one fails or shows a green edge). Try Auto with an odd-shaped first clip (a cropped screenshot, a panorama).
43. **Auto.** With a landscape first clip the export is landscape and that clip fills the frame with no bars, exactly as in the preview; a panorama is cut to 21:9. `aspectValue` in `ExportSession.swift` compiles (`Double($0)` on a `Substring`).
44. **21:9 at 4K** exports (4092 x 1754, not 5040 x 2160): the longer side is kept at or under 4096 pixels (`maxLongSide` / `MAX_LONG_SIDE`) as well as inside the macroblock limit. Also try an Auto project with a 2:1 first clip at 4K (4096 x 2048) and a tall 9:21 one (1754 x 4092) - the cap is on the longer side in either orientation, on the assumption that the encoder treats a tall frame like a wide one (9:16 at 4K, 2160 x 3840, is unchanged). If the encoder takes larger frames on the test iPhone, the limits in `renderSize` (both files) can be raised; if even the reduced size fails, lower `maxMacroblocks`.
45. **Old requests.** `ExportRequest` without `frameAspect` still decodes (the field keeps its default 0).
46. **The creation sheet** appears after the photo library closes, every time (it waits 350 ms - `AFTER_PICKER_MS`); if it sometimes does not appear, raise that number.

Audio cut items:

47. **A split sound in the export.** Split a music track in the middle of a held note and export: there is no click, gap or doubled sound at the cut. The audio tracks are placed on a millisecond grid (`ExportSession.audioTime`, timescale 1000) while the video stays on 1/600 s; check that mixing the two in one composition exports without an error and that `testAudioTrackTimesAreOnAMillisecondGrid` passes (it assumes `CMTime(seconds:preferredTimescale:)` rounds to the nearest tick and that `CMTimeSubtract` of a 1/600 and a 1/1000 time is exact).
48. **A split sound in the preview** (Expo Go is enough). Play across the cut of a split sound: the second piece comes in on time, with no dropout. It is started 0.22 s early and silent (`AUDIO_LEAD`); if the start of a sound that begins mid-video is clipped or runs ahead of the picture, the audio player starts faster than the video player and the lead needs a value of its own.

Text looks and stickers items:

49. **Background box.** Its padding and corner match the preview for a default box, a square one and a wide one (Sticky note, Title bar, Headline), at 1080p and at 4K. A square corner is really square; a very small Padding with a rounded corner on a very short text looks like a pill end, not a glitch (the system limits the radius).
50. **Old projects.** A text with a background made before this update exports with the same box as before (the export request now carries `boxPadding` and `boxCorner`; a request without them decodes to the old box because the two Swift fields keep their defaults 0.25 and "rounded" when the key is missing, and neither key is ever sent as null).
51. **Wrapping with a wide box.** A long text with Padding at its maximum breaks its lines where the preview does (the wrap width is the frame width minus twice the padding in both).
52. **Outline looks.** Neon outline, Stamp and Bubblegum: compare the line's thickness with the preview's halo. The export's line is hard; say if it is too thick or too thin.
53. **Frames and rings.** Frame and Ring export with a see-through middle (the hole is the inner subpath, wound the other way, filled non-zero); Corners shows four separate brackets.
54. **Thought bubble and Award.** The two dots of the Thought bubble and the two ribbon tails of the Award are there; the tails overlap the disc and must show as one solid shape, not punched out (non-zero fill).
55. **Every new shape** appears, right way up, in its colour. `ExportSessionTests.testSVGPathParsesShapes` and `testCompoundShapesKeepTheirHoles` compile and pass, and so do `TextBoxTests` and the new `OverlayLayoutTests` box vectors.

More looks items (ten transitions, twelve filters and eight effects; none of their Swift has ever run, and every Core Image name and key is from memory of Apple's reference. A wrong name or key makes that one look do nothing, it never crashes). Most likely wrong first in each group:

Filters:

56. **Split tone** (Cinema, Amber, Jade, Dusk, Blush, Indigo). Shadows and highlights should take their two colours: a tint, not a flat wash and not nothing. The pair is `CIFalseColor` (dark takes colour 0) laid over the picture with `CISoftLightBlendMode`; whether that reads as a tint, and in which colour space the hex colours land, is unverified. If too strong or too weak, change the `amount` in `src/editor/model/filterRecipes.ts` and `FilterRecipes.swift` together.
57. **Warm / cool direction.** The new warm filters (Amber, Matte, Dusk) and cool ones (Jade, Moody) follow the Adjust "Warmth" slider (positive = warm). The older Warm / Cool filters use the opposite direction (item 1), so exactly one of the two conventions is backwards: compare Amber with Warm and with the slider, then flip the one that is wrong (if it is the slider, the new rows flip with it).
58. **Each of the twelve changes the picture**, and **Strength** 0-100 mixes it in (0 = the untouched frame, 100 = the full recipe).
59. **Grit, Silver and Indigo** are black-and-white (Indigo then toned blue); Bleach and Drama keep some colour. Check Grit's grain and sharpening are not harsh.
60. **An old filter on an old project** looks exactly as it did.
61. **Export speed** with a split-tone filter (two extra Core Image filters and a mix per frame).

Effects:

62. **Dust speck density.** The fine grain (`CIRandomGenerator` through `CIColorMatrix` and a clamp) should be visible but faint. Too many or too few specks: tune `dustSpeck` in `effectMath.ts` and `EffectMath.swift` together. The two scratches should sit where the preview draws them, 3 px wide at 1080p and 6 px at 4K. (The Swift test reads the mean of an area, so a single speck cannot fail it.)
63. **Soft edges.** Centre sharp, edges blurred, no dark rim. The mask relies on `CIBlendWithMask` (white = the sharp image); if inverted the centre is soft. The blur radius is 2 % of the shorter side at full Strength (about 22 px at 1080p, 43 px at 4K): check the look and the export speed at 4K (one full-frame blur per frame).
64. **Lens flare and Film burn.** `CIRadialGradient` with a see-through outer colour should give a soft glow, not a hard disc or a grey fringe, laid on with `CIScreenBlendMode` (only ever brighter). The flare should cross left to right every two seconds at about a third of the way down (Core Image's y axis points up; one flip is done in the code). Film burn glows orange from the left edge and drifts up and down. Check neither is blown out on bright footage.
65. **Mirror.** The left half is copied onto the right with no one-pixel seam on the centre line (check an odd-width video too); below Strength 50 it fades in.
66. **Hue shift** turns colours around the wheel and leaves greys alone. `CIHueAdjust` takes radians and which way round the wheel it turns is unknown; only the order of the colours would differ.
67. **Heartbeat and Strobe** match the preview's timing (two beats and a rest, 1.25 times a second; dark for 40 % of every half second).

Transitions:

68. **Clock wipe direction.** It should start at 12 o'clock and run clockwise. If it runs anticlockwise, the arc's `clockwise` flag (or the way up of the small mask picture) in `TransitionMasks.swift` is the cause. Also check the edge is smooth at 4K (the mask is drawn at 512 px and scaled up) and that no thin line of the old clip shows along the frame border.
69. **Mask polarity.** In Circle open / close, Diagonal wipe and Clock wipe the new clip must appear inside the shape and the old one outside (`CIBlendWithMask`: white = the first image). If one is inverted, flip its mask.
70. **Up and down of the covers and reveals.** Cover left: the new clip slides in from the right. Reveal left: the old clip slides off to the left. Cover up: the new clip rises from the bottom. Reveal down: the old clip drops off the bottom. Core Image's y axis points up while the maths points down, so a sign could be reversed (one flip is done per helper).
71. **Diagonal wipe** starts at the top-left corner and ends at the bottom-right, with a straight edge and no gap or left-over corner at either end (the rotation sign of the half-plane mask).
72. **Circle open / close**: a clean round edge that reaches the corners exactly at the end (no pinhole, no dot left).
73. **Pixelate**: no jump at the first and last frame (blocks of 1-2 px at the ends; `CIPixellate` fed a clamped image), and speed at 4K (it runs on both clips).
74. **White flash** is white, not grey, at the cut. White flash and Pixelate (like the older Dissolve and Blur) may look a little brighter in the export than in the preview in the middle of the transition: Core Image mixes in linear light, the preview in display space.
75. **Nothing compiles until a real build does**: `FilterRecipes.swift`, `TransitionMath.swift`, `TransitionMasks.swift` and the new parts of `EffectMath.swift` / `EffectRenderer.swift` / `ClipyCompositor.swift`, and their XCTests (`FilterRecipeTests`, `TransitionMathTests`, `TransitionBlendTests`, `EffectMathTests`), were only read against `node_modules/expo-modules-core/ios`, never built.

Left by the reviews of the same work:

76. **Temperature direction, both families side by side.** The old filters (Warm 7100 K, Sunset and Golden higher; Cool and Teal lower: `Effects.swift`) and the Adjust slider with the new recipes (`6500 - 2500*v`, warm = lower) use opposite conventions. Export Warm, Amber, Moody and Adjust temperature +50 on the same clip and compare: one family is reversed. Fixing the old ones changes an existing look, so that is the owner's decision.
77. **Split-tone filters may export darker than designed** (Amber, Jade, Dusk, Cinema, Blush, Indigo; Core Image's linear working space). If so, lower `amount` in the mirrored recipe rows (`src/editor/model/filterRecipes.ts` and `FilterRecipes.swift` together).
78. **Dust density** was lowered to `dustSpeck` 0.005 (from 0.02) by reasoning only: confirm by eye that the specks are a faint sprinkle and not a haze, and tune both files together (item 62).
79. **Effect order.** The preview draws the flat layers before the shapes; the export uses list order. Strobe after Film burn hides the burn in the export but not on the phone.
80. **White flash, Heartbeat and Strobe show the Preview tag although they are exact.** Kept on purpose: the spec promises the tag for every look.

**Photo motion and collages** (added no native code: a Motion is exported as two keyframes on the photo, a collage as layers with a crop and a mask):

81. **A photo's Motion in the export** moves the way it does in the editor: Zoom in, a Pan and Corner zoom, at Strength 0, 50 and 100 %, with an In animation too. The motion ends where the photo ends: it is sent as two pins and the second one sits at the photo's length in the app (`clipDuration`), while Swift measures the clip's own length, so a mismatch would make it stop a fraction of a second early or late.
82. **No background at a zoomed photo's edges.** At Strength 100 and a Pan the photo still covers the frame (no black, colour or blurred background at an edge), also for a photo whose shape is far from the frame's.
83. **A collage exports with every picture on its cell.** A four-cell collage with a border and Rounded corners looks like the preview, and so do Round corners on non-square cells: they should look like the preview's pills (Rounded and Round are masks over a non-square cell, so check the shape matches). A cell with a video plays.

**Beats and Quick edit** (added no native code; the beats of the built-in tracks are shipped data, found on the development machine):

84. **Find beats for your own music files is not built.** It needs native code that decodes a file with AVFoundation (`AVAssetReader` -> mono PCM) and runs the same detector: write `BeatDetect.swift` as the twin of `src/editor/model/beatDetect.ts` (constants and vectors identical, as for every mirrored maths file) behind `isAvailable`, and have the Beats panel call it for a track `beatsOf` reports as `own`. Until then the button is off and one sentence says why.
85. **The mp3 start offset.** The shipped beats were measured from the first sample of the script's decoder (`mpg123-decoder`); iOS may start an mp3 a few tens of milliseconds earlier or later (encoder delay). If the markers of every built-in track are early or late by the same small amount - in the editor and in the **exported** video - that is one constant to shift in `scripts/generate-beats.mjs`, then a re-run. Check by ear, in both.
86. **Bossa Nova (86 bpm) and Funked Up (87 bpm) may be half-tempo readings.** The detector looks between 70 and 180 beats a minute and prefers the reading nearer 120; if these two feel like they are marked on every second beat, their real tempo is double. Fewer / More cannot give more than the shipped beats.
87. **The detector's choice between a tempo and its half near a tie depends on the sample rate** (the same 143.94 bpm clicks read 143.94 at 11,025 Hz and 71.97 at 22,050 Hz; pinned by a test in `beatDetect.test.ts`, either answer is acceptable). A Swift twin fed another sample rate than the script's may pick the other octave for some song.
88. **A beat at exactly t = 0 is found one beat late** (pinned by a test): a song that starts on its very first sample gets its first marker one beat in.
89. **A Quick edit draft in the export.** The music's own 1-second fade-out ends at silence exactly where the video ends, so the export's safety fade (item 24) is not laid on top of it - except for a draft that is a single clip shorter than half a second. Listen to the end of one exported draft: one smooth fade, no click.
