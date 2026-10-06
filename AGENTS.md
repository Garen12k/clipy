This is an Expo/React Native mobile application. Prioritize mobile-first patterns and performance. This app targets iPhone only.

## This repo (Clipy)

- iPhone only. No Android or web configuration; do not add any.
- Daily testing is in Expo Go: run `npx expo start --go` (the `--go` flag is required because `expo-dev-client` is installed). Custom native code does not run in Expo Go; the app must degrade gracefully when `modules/clipy-video` is not linked.
- Native code lives only in `modules/clipy-video` (Swift, Expo Modules API). TypeScript never calls AVFoundation directly.
- Checks before declaring work done: `npm run typecheck` and `npm test` (`npm test` runs both the app and the server suites).
- Posting: app code in src/publish/ talks only to Supabase Edge Functions via src/publish/api.ts; platform secrets and tokens live on the server only. Server logic is plain TS in supabase/functions/_shared/ (web-standard APIs, .ts import extensions, no Deno.* outside runtime.ts / index.ts) and is tested with npm run test:server (Node). Adding a platform = one server adapter (platforms/<id>.ts + registry) and one client adapter (src/publish/adapters/<id>.ts).
- Native code: `modules/clipy-video/ios` is compiled only on EAS; there is no Swift toolchain here — verify by reading against `node_modules/expo-modules-core/ios`.
- Fonts and music are bundled assets (`assets/fonts`, `assets/music` + manifest); overlay positions are fractions of the frame — keep `src/editor/model/overlayLayout.ts` and `modules/clipy-video/ios/OverlayLayout.swift` identical. A text's background box is part of that pair too: `style.boxPadding` / `style.boxCorner` become `padding` / `boxRadius` only there (the default style must keep giving the box every text had — the PROOF tests in `overlayLayout.test.ts` and `migrate.test.ts` are never edited to pass).
- UI: every colour, font, radius and duration comes from src/theme/theme.ts and the kit in src/ui/ — no hex literals in screens (guarded by src/__tests__/noHexLiterals.test.ts). UI fonts (src/theme/uiFonts.ts) are separate from overlay fonts (src/editor/fonts.ts).
- Spacing and sizes: padding / margin / gap come only from `theme.space` (4 / 8 / 12 / 16 / 24 / 32; `theme.space.gutter` at screen edges) — guarded for src/ui, src/editor/components, src/projects, src/export, src/publish and app/ by `src/__tests__/spacingScale.test.ts` (an exact per-file allow-table, pinned at its minimum; never add to it for new code). Its two documented blind spots: an apostrophe in JSX text hides the rest of its line, and a value with `*` or `/` is skipped whole. Component sizes come from `theme.size`, text sizes from `theme.type`, surfaces from `theme.elevation` (colour steps — no shadows over the video). Buttons are PrimaryButton (one per screen or panel) / SecondaryButton / QuietButton; pick-one tiles are src/ui/Tile.tsx; icons are Ionicons outline names. Text fields are the kit `Field`, cards the kit `Card`, spinners the kit `Spinner`; outside the editor every icon name ends in `-outline` or starts with `logo-` (`src/__tests__/outlineIcons.test.ts`).
- Sliders: only the kit `Slider` (src/ui/Slider.tsx; `detents` gives the rest-value tick) — never the community slider directly in the editor (`src/__tests__/kitSlider.test.ts`; only CoverSheet is allowed), and never override its rest track.
- Motion: animations are built only in src/ui/motion.ts (withTiming / withSpring on shared values; opacity and transform only; ≤ 250 ms (the one exception: `sheetTo`, a Sheet's critically damped spring — a sheet sits on a dimmed screen, not beside the video)) and take Reduce Motion from src/ui/useReducedMotion.ts (`useReducedMotion` / `isReducedMotion` — never Reanimated's reduceMotion option). PressableScale is the one animated pressable (press dip, lifted; `still` = no lift tween while a slider is dragged); src/ui/Enter.tsx (`EnterView`) animates content in once on mount. No entering / exiting / layout animations, no exit animation for strips and panels (closing is instant; toolStrip.ts knows no "closing" state), nothing animated on an ancestor of the preview or the timeline, nothing that starts from a value prop (so nothing runs while a slider is dragged). Never list a shared value in an effect dependency list (the Jest mock returns a new object each render). Tests assert the motion.ts calls, never a rendered scale or opacity.
- Clip placement: keep src/editor/model/clipLayout.ts and modules/clipy-video/ios/ClipLayout.swift identical (constants and vectors, mask radius included); no other code computes cover / fit.
- Look maths: keep src/editor/model/adjust.ts ↔ modules/clipy-video/ios/Adjust.swift and src/editor/model/effectMath.ts ↔ EffectMath.swift identical (constants and vectors). Filter recipes: keep `src/editor/model/filterRecipes.ts` ↔ `modules/clipy-video/ios/FilterRecipes.swift` identical (rows, stage rule, vectors) — the twelve filters after Dream are rows over the untouched Adjust pipeline plus a split tone; the twenty older ones stay as chains in `Effects.filterChain`.
- Transition maths: keep `src/editor/model/transitionMath.ts` ↔ `modules/clipy-video/ios/TransitionMath.swift` identical (constants, formulas, vectors); the images are built only in `TransitionMasks.swift`. The preview shows one clip at a time: a transition is drawn by `TransitionLayer` from `transitionCurtain` (it and `EffectOverlays` measure the frame themselves — `PreviewPlayer.tsx` hands them nothing).
- Existing looks are frozen: `src/editor/__tests__/looks.frozen.test.ts` holds the old registries as literals and the old Swift as checksums — never edit it to make a change pass; append ids, insert Swift outside the frozen stretches. Every new Core Image filter goes through `Adjust.filtered` or a `generated` / `generator` helper, and a nil filter or output means the image passes through unchanged.
- Motion maths: keep src/editor/model/motion.ts ↔ modules/clipy-video/ios/Motion.swift identical (constants, ids and vectors); nothing else computes animation or keyframe values.
- Green-screen maths: keep `src/editor/model/chroma.ts` and `modules/clipy-video/ios/Chroma.swift` identical (constants and vectors); no other code computes the green-screen alpha.
- Audio mix maths: keep src/editor/model/audioMix.ts ↔ modules/clipy-video/ios/AudioMix.swift identical; sound effects in assets/sfx are generated by scripts/generate-sfx.mjs (re-run it rather than editing the files).
- Effects registry: keep `src/editor/effects.ts` and `modules/clipy-video/ios/Effects.swift` identical (ids, shape paths, sticker scales); only `src/editor/model/timeline.ts` may multiply/divide by clip `speed` or use `speedCurve` steps. Shape paths are absolute `M L C Q Z` in a 0–100 box, every subpath clockwise and a hole a counter-clockwise inner subpath — neither side sets a fill rule (`effects.test.ts`).
- Export options: keep EXPORT_FPS (src/editor/model/types.ts) ↔ ExportSession.frameRates identical; the bitrate is computed only in src/export/estimate.ts and sent in the request.
- Toolbar: which tools the bottom bar shows is decided only by `contextFor` in `src/editor/toolbarContext.ts` (EditorToolbar renders it; a tool that cannot apply is not rendered). Simple tools open as inline strips (`src/ui/ToolStrip.tsx`, opened through `src/editor/toolStrip.ts`) with explicit heights from `STRIP` — never `flex: 1` inside an auto-height parent. The big pickers are still sheets (`src/ui/Sheet.tsx`).
- Panels: the tall tools (Text, Stickers, sticker editor, Add audio, Templates, Captions, Caption style, Beats) use `src/ui/ToolPanel.tsx` — inline, never a Modal, with explicit heights from `panelHeight` (the body scrolls; strips never do; no `flex: 1` for height). Tools open through `src/editor/toolStrip.ts` (one open at a time, strip or panel: select first, open second; `rekeyStrip` after a tool changes the selection itself; nothing closes it while a voice-over is recorded). The editor's layout states live in `src/editor/components/EditorLayout.tsx`: the timeline is hidden by collapsing its slot (never unmount or resize the Timeline, never edit timelineScroll.ts for it), and the preview slot must stay at a fixed place in the tree so the `VideoView` never remounts (PreviewPlayer is not edited). Keyboard height comes only from `src/ui/keyboard.ts` (Keyboard events, explicit padding) — no KeyboardAvoidingView in the editor. Cover is the editor's only Sheet.
- Text look rows: Outline / Shadow / Background / Spacing and opacity / Glow are the five rows of `src/editor/components/TextStyleSection.tsx`, shared by the Text panel and Caption style; every row starts closed. Emoji packs are grouped only by `groupEmoji` in `src/editor/emoji.ts` (by Unicode group and three anchor names); the pack chips live in the sticker panel's lead row and the grid keeps its explicit height.
- Screen transitions: only native-stack options, all in `src/navigation/screenOptions.ts` (`app/_layout.tsx` renders the map and holds no option of its own; one entry per screen file in `app/`). Never animate a screen from JavaScript and never add a wrapper, key or animated style around the editor screen. The back swipe stays on except where leaving would lose work: Export sets `gestureEnabled: false` while exporting (`exportGesture`), Post while uploading (`useLeaveGuard`); the editor is safe to swipe away because `useLoadProject` saves on leave, and keeps `fullScreenGestureEnabled: false` so only the left edge starts it.
- Frame shape: only `frameAspect(project)` in src/editor/model/types.ts turns the project's aspect ratio (nine ids incl. `auto` = the first clip's shape) into a number; keep `renderSize` / `ASPECT_LIMITS` (src/export/estimate.ts, types.ts) ↔ `ExportSession.renderSize` / `aspectLimits` identical.
- Snapping: only src/editor/model/snap.ts computes snap targets and snapped times; bars use createSnapper (src/editor/snapping.ts). Never touch src/editor/timelineScroll.ts for it.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run `npm run typecheck` and `npm test` before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode required. Install the CLI once with `npm install -g eas-cli`, then run it as `eas <command>`.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` does not exist, it is generated (Continuous Native Generation). Never create or edit it by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
