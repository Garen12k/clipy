# UI polish, round 2 — home, export, post, accounts and screen transitions: design

**Date:** 2026-10-06
**Status:** Implemented 2026-10-06 (on-device checklist pending)
**Builds on:** UI polish round 1 (`docs/superpowers/specs/2026-10-05-ui-polish-r1-design.md`: the tokens `space` / `size` / `type` / `elevation`, the three kinds of button, the ring-selected chip and tile, `src/ui/motion.ts`, `EnterView`, the Reduce Motion store, the spacing guard). No model, schema, op, publish-logic, export-logic or Swift change. No new package.

## 1. What the user gets

1. **Home.** Project cards with softer corners and even spacing; the name and the length of a project are easy to read on any cover picture; a card dips a little when pressed. One gold button. A calmer empty screen ("No clips yet" is no longer shouted in capitals).
2. **Export.** The three rows of choices line up like the editor's strips; the estimated size, the progress, the finished and the failed state are easier to read; one gold button per state.
3. **Post and Accounts.** Each platform is one tidy row with its state; the caption and title boxes look the same everywhere; one gold button per screen; outline icons.
4. **Moving between screens.** A project slides in from the side, Export rises from the bottom, Post and Accounts slide in from the side — the standard iPhone movements instead of today's fade. Swiping back works, except where it would lose work (§6.2).
5. **Pop-up panels** (Aspect ratio, a project's actions, a platform's options, Cover) open smoothly, without the wobble.

The look stays (navy and gold, Oswald / Montserrat). **Behaviour does not change**: the same buttons in the same places with the same names, the same steps. **Nothing a project stores is touched.**

Out of scope: the editor's bars, strips, panels, timeline and preview (round 1); new features; project data, ops, publish logic, export logic, Swift; Android / web; new packages; haptics beyond what a kit component already does.

## 2. Where things stand today (counted 2026-10-06)

Raw spacing numbers (`padding*` / `margin*` / `gap`, the guard's own scanner run over the new folders):

| Folder | Files | Raw spacing | Where |
|---|---|---|---|
| `src/projects` | 11 | **1** | `ProjectCard.tsx` (`paddingVertical: 2`) |
| `src/export` | 3 | **0** | — |
| `src/publish` | 25 | **4** | `AccountRow.tsx` (`gap: 2`), `PostRow.tsx` (`gap: 2`), `PostOptionsSheet.tsx` (`padding: 10`), `PostScreenBody.tsx` (`padding: 10`) |
| `app` | 7 | **2** | `app/index.tsx` (`marginTop: 40`, `paddingBottom: 120 + insets.bottom`) |
| (already guarded) `src/ui` 29 files / `src/editor/components` 75 files | | 0 / 12 | the round-1 minimum, `CoverSheet.tsx` (`padding: 10`) among them |

Everything else, per file (read by hand):

| File | Raw text sizes | Raw sizes / radii | Raw pressables | Filled icons | `ActivityIndicator` | `Alert` |
|---|---|---|---|---|---|---|
| `app/index.tsx` | `Title` 26 | icon 18 | — | `paper-plane`, `person-circle`, `add` | 1 | 2 (delete confirm, rename prompt) |
| `app/accounts.tsx` | `Title` 26 | — | — | `chevron-back` | 1 | 1 (sign out) |
| `app/post.tsx` | — | — | — | `chevron-back` | — | — |
| `app/editor/[id]/index.tsx` (not edited) | — | — | — | — | 1 | — |
| `src/projects/ProjectCard.tsx` | 11, 11, `Title` 15 | border 1.5, `bottom: 56` | — (already `PressableScale`) | — | — | — |
| `src/projects/AspectRatioSheet.tsx` | — | tile 88 × 76 | — (`PressableScale`) | — | — | — |
| `src/projects/ProjectActionsSheet.tsx` | — | — | — | — | — | — |
| `src/export/ExportScreenBody.tsx` | 12, `Title` 26 / 16 / 20 | ring 140 and 120, compass 18 | — | — | — | — |
| `src/publish/components/PostScreenBody.tsx` | 16, 12, `Title` 26 | `minHeight: 96` | — | `chevron-back` | 1 | 1 (the leave guard) |
| `src/publish/components/PostRow.tsx` | 12 | icons 24 / 22 / 22, bar 3, radius 2, `minHeight: 48`, `hitSlop: 8` | **1** (`Pressable`, the tick row) | `checkmark-circle`, `checkbox` | — | — |
| `src/publish/components/AccountRow.tsx` | — | icon 24, avatar 32, `minHeight: 56` | — | — | 1 | 1 (disconnect) |
| `src/publish/components/PostOptionsSheet.tsx` | 16, 12 × 3 | — | — | — | — | — |
| `src/publish/components/SignInCard.tsx` | `Title` 18 × 2 | button 48, corner 22, border 1 | — | — | — | — |
| `src/editor/components/CoverSheet.tsx` | 16, 12 | `minWidth: 72` | — | — | — | — |
| `src/ui/Sheet.tsx` | 13, `Title` 18 | grabber 36 × 4, radius 2, `hitSlop: 8` | **1** (the header action; the backdrop stays a `Pressable`) | — | — | — |

Totals for the round-2 folders: **7** raw spacing numbers in 6 files, **1** raw `Pressable` button (+ 1 in `Sheet.tsx`), **0** `TouchableOpacity`, **8** filled icon uses in 5 files (the five `logo-*` platform marks are brand glyphs with no outline version and stay), **5** `ActivityIndicator`, **5** `Alert`.

## 3. Tokens and kit additions

### 3.1 `src/theme/theme.ts` (added; one value changes)

```ts
radius: { …today's, cover: 16 },                                  // a project card
size:   { …today's, listRow: 56, avatar: 32, ring: 120 },         // a platform row, an account picture, the export ring
type:   { micro: 11, small: 12, label: 13, body: 14, input: 16, heading: 18, title: 20, screen: 26 },
motion: { …today's, sheet: { mass: 1, damping: 40, stiffness: 400 } },   // was { damping: 18, stiffness: 220 }
```

`type.input` is a text field's size, `heading` a card's or a sheet's title, `title` an empty or finished state's title, `screen` a screen's title.

### 3.2 Kit (`src/ui/`)

| Part | What |
|---|---|
| **`Field.tsx`** — `fieldStyle`, `Field` | The one text-field look: `elevation.tile`, `radius.chip`, `type.input`, `space.md` padding both ways, at least `size.touch` high, muted placeholder. A `TextInput` with that style (the caller's `style` is added after it). Replaces three private copies (Caption, YouTube title, Cover title — all `padding: 10` today). `NumField` already looks like this and is not edited. |
| **`Card.tsx`** — `cardStyle`, `Card` | The one card surface: `elevation.bar`, 1-pt `hairline` border, `radius.card`, `space.lg` padding. Replaces `cardStyle` in `SignInCard.tsx` and the hand-written card on the Export screen (both `colors.surface` today). No shadow. |
| **`Spinner.tsx`** — `Spinner` | The gold `ActivityIndicator` with an optional accessibility label; replaces four hand-written ones. It is the native iOS spinner: no animation of ours. |
| **`EmptyState.tsx`** | The title is drawn as typed (sentence case, no letter spacing), `type.title`, centred. Same props, same texts. |
| **`motion.ts`** — `sheetTo(reduced)` | A sheet's panel coming to rest (§7). |

### 3.3 Guards

- **`src/__tests__/spacingScale.test.ts`** now also reads **`src/projects`, `src/export`, `src/publish` and `app/`** (150 files in all). Starting allow-table = today's twelve editor hits plus the seven of §2, one line per file; each task deletes its own lines; the round ends at **11 hits in 5 files**, all timeline-lane geometry (`AudioBar` 2, `ClipThumbStrip` 5, `EffectPill` 1, `LayerBar` 2, `OverlayPill` 1) — the Cover sheet's line goes. The two documented blind spots stay (an apostrophe in JSX text hides the rest of its line; a value with `*` or `/` is skipped whole).
- **New `src/__tests__/outlineIcons.test.ts`**: in `app/`, `src/projects`, `src/export`, `src/publish` every icon name given as `name="…"` (or inside `name={…}`) ends in `-outline` or starts with `logo-`. Starting allow-table = the eight filled uses of §2; it ends empty. (`src/ui` and the editor are not read: round 1's kept filled glyphs live there.)
- `noHexLiterals.test.ts` already reads `src` and `app`. `kitSlider.test.ts` is unchanged: Cover keeps its direct slider.

## 3a. As built

Commits: Task 1 `96fe09e`, 2 `50a3fb5`, 3 `06ccc50`, 4 `a3fb99f`, 5 `e04085e`, 6 `c759d8b`, 7 the docs commit. Nothing a project stores changed (no schema, op or migration change).

- **Numbers that changed.** `theme.motion.sheet` is `{ mass: 1, damping: 40, stiffness: 400 }` (was `{ damping: 18, stiffness: 220 }`, which ran at the default mass 4 and bounced; zeta is now exactly 1, critically damped). New tokens: `radius.cover` 16; `size.listRow` 56, `size.avatar` 32, `size.ring` 120; `type.input` 16, `type.heading` 18, `type.title` 20, `type.screen` 26. The guards end as specified: spacing allow-table at 11 hits in 5 files, outline-icon allow-table empty; both are pinned by tests.
- **Behaviour.** The one behaviour change: the Export modal cannot be swiped away while exporting (`exportGesture`, set from the route); it cannot be seen in Expo Go, where export is unavailable. The editor allows the left-edge back swipe only (`fullScreenGestureEnabled: false`; without it iOS 26 would start the swipe anywhere). Home to editor is the standard push, Export the standard modal rise, `oauth` does not animate.
- **Tests changed or added.** `src/ui/__tests__/Sheet.test.tsx` (spring through `sheetTo`, Reduce Motion places at once, testIDs `sheet-panel` / `sheet-header`); `src/editor/__tests__/CoverSheet.test.tsx` (Field, rest track colour, Reset as a quiet button); `src/projects/__tests__/ProjectCard.test.tsx` (no `index` prop, no animation of its own, new look); `src/export/__tests__/ExportScreenBody.test.tsx` and `ExportRoute.test.tsx` (new look; the route sets `gestureEnabled` per status); `AccountsScreen.test.tsx`, `PostScreen.test.tsx`, `theme.test.ts`, `motion.test.ts` (new cases). New files: `kit.r2.test.tsx`, `sheets.r2.test.tsx`, `home.r2.test.tsx`, `screenOptions.test.ts`, `outlineIcons.test.ts`. `outlineIcons.test.ts` has one helper (`problems`) beyond the plan so a failure says what to fix, like the spacing guard.
- **Files outside the plan.** None. `src/ui/EmptyState.tsx` now shows its title as typed (sentence case, no letter spacing), which also affects the "can't be posted" screen.
- **Left as it was.** The home button label "New clip". The list eases in once, no per-card stagger. Cover keeps its dimming sheet, Done-applies / else-discards and its direct slider (only the rest track colour and Reset changed). Accounts has no gold button (Reconnect outlined; Disconnect and Sign out text only). Raw sizes in files this round did not edit (`NumField`, `ToolPanel`, `ToolStrip`, `LoadingScreen`) are untouched. The editor route is not edited.
- **What no test checks.** The device checklist at the end of the plan; how the transitions look, and whether the editor push stutters while the video starts (fallback: `animation: "fade"` on `editor/[id]/index` only); the left-edge swipe next to the timeline and sliders; the sheet spring and its drag snap-back; the keyboard over Cover's Done and the Post caption on a small iPhone; readability of the card text over bright pictures; the locked Export swipe (real build only); live Post / Accounts states (they need a live Supabase project).

## 4. Home — `app/index.tsx`, `src/projects/ProjectCard.tsx`

- **Header**: `height: size.row`, `paddingLeft: space.gutter`, `paddingRight: space.sm` (the icon buttons' own inset completes the gutter), title `type.screen`. Icons `paper-plane-outline`, `person-circle-outline` — the quiet secondary actions; names and places unchanged.
- **List**: two columns; the list pads `space.sm` left and right and each cell `space.sm` all round, so a card's outer edge sits on the 16-pt gutter and cards are 16 pt apart. Bottom padding `size.control + space.xxl + space.xl + insets.bottom` (the last row clears the floating button).
- **Card**: 3 : 4, `radius.cover` (16), a 1-pt `hairline` border (red and 1.5 pt when damaged), `elevation.tile` behind a missing picture. The picture fills it. **Bottom scrim**: a three-stop gradient `transparent → colors.scrim → colors.scrimStrong`, `space.md` padding with `space.xxl` on top; on it the name (`type.body`, semi-bold, cream, one line) and the second line (`type.small`, muted: "Edited today" or "Posted · …"). **Length badge** top right: a 20-pt-high `scrimStrong` pill, `space.sm` side padding, the time in cream, semi-bold, `type.small`, tabular digits (it was gold 11 pt). The cover title stays as on the cover itself. No shadows.
- **Press**: `PressableScale` (already). Long-press as today.
- **One main button**: the floating gold `PrimaryButton` keeps its place and its name **"New clip"** (§10, decision 2), with `add-outline`. It is also the empty screen's one main button.
- **Empty**: kit `EmptyState`, same two texts, now sentence case. **Loading**: `Spinner`, `space.xxl` from the header.
- **Easing in**: the *list* (one `EnterView` around the `FlatList`) fades and rises 8 pt **once**, when it first appears after loading. Not per card and no stagger: today's per-card animation is built outside `motion.ts`, replays when a recycled cell remounts, and costs one delayed animation per card. `EnterView` animates on mount only, so a re-render, a refresh on returning from the editor, a rename, a duplicate or a delete never replays it (it remounts — and plays again — only if the list was empty in between). Reduce Motion: it is simply there.

## 5. Export, Post, Accounts

### 5.1 Export — `src/export/ExportScreenBody.tsx`

- Page: `paddingHorizontal: space.gutter`, `paddingTop: space.xl`, sections `space.xl` apart; title `type.screen`.
- **Rows** (idle and "unavailable"): three sections, each a muted label (`type.label`) over a row of kit `Chip`s (already ring-selected since round 1) with `space.sm` between chips and between label and row; sections `space.lg` apart. The 4K hint is `type.small`. The estimate is a **`ValueLabel`** ("Estimated size:" muted, the number cream and semi-bold, tabular) — still one text.
- **One gold button per state**: idle — Export; unavailable — none (nothing can be started, and the card says why); exporting — none (Cancel is outlined); done — "Post to…", or "Save to Photos" without a posting server; error — "Try again".
- **Unavailable**: the same honest three lines, in a kit `Card` (title `type.heading`).
- **Exporting**: the ring (`size.ring`, percentage inside) with a muted "Exporting…" under it, then Cancel.
- **Done**: the ring at the same size (it does not jump between the two states), "Ready to sail" (`type.title`), the summary line in cream semi-bold with tabular digits, then the gold button, the outlined Save / Share, and **Done as a text-only button**.
- **Error**: a kit `Card` with an `alert-circle-outline` icon in red beside the message in cream (`type.body`), then the gold "Try again".

### 5.2 Post — `PostScreenBody.tsx`, `PostRow.tsx`, `SignInCard.tsx`, `app/post.tsx`

- Header rows: `height: size.row`, `paddingHorizontal: space.sm`, `chevron-back-outline`, title `type.screen`. Content pads `space.gutter`, sections `space.lg` apart.
- **Caption**: kit `Field` (multi-line, at least 96 pt). Counter and notes `type.small`.
- **Platform rows** in one kit `Card`, hairline between rows. A row is at least `size.listRow` (56) high: tick (24) — logo (24) — name (semi-bold) over the account (`type.small`, muted) — and on the right its state or its one action. The tick row is a `PressableScale` (it was a raw `Pressable`); icons `checkbox-outline` (gold, ticked) / `square-outline` (cream, not ticked; muted when it cannot be ticked) and `checkmark-circle-outline` for "posted".
- **Row actions are compact (36)**: Connect, Reconnect, Retry / Resume, View are outlined; **Options is text only**. Names and accessibility labels unchanged.
- **States**: "Preparing…", "Publishing…" and the percentage are `type.label`, muted (the percentage with tabular digits); the upload bar is 4 pt, pill-ended, gold on `elevation.tile`; "Done" is gold semi-bold. Under a row: notes `type.small` muted; **errors `type.label` in red** — "Something went wrong.", a platform's own sentence, and the "check … before posting again" messages are one size larger than the notes around them.
- **One main button**: Post (gold) over Share… (outlined). Signed out: Share… only.
- `SignInCard`: kit `Card`, titles `type.heading`, the Apple button `size.control` high.

### 5.3 Accounts — `app/accounts.tsx`, `AccountRow.tsx`

- The same header and card. A row is `size.listRow` high: logo (24), picture (`size.avatar`), name over account / state.
- Row actions are compact: **Connect** and **Reconnect** outlined (Reconnect was gold: with two expired accounts the screen had two gold buttons), **Disconnect** text only in red. "Sign-in expired" stays red. Busy: `Spinner` with the same label.
- Footer: the signed-in line, then **Sign out** as a text-only button.
- The screen has no gold button (its one bright control is Apple's own sign-in button when signed out).

**Nothing in `src/publish/` logic changes**: no request, validation, hook or state machine; `useLeaveGuard` is left exactly as it is.

## 6. Moving between screens

### 6.1 Options — all in one pure file, `src/navigation/screenOptions.ts`

Expo Router 57's `Stack` is the native stack (`expo-router/build/react-navigation/native-stack`, on `react-native-screens` 4.26.2). Only its own options are used.

| Route | Options | What it does on iOS |
|---|---|---|
| every screen (`screenOptions`) | `headerShown: false`, `contentStyle: { backgroundColor: theme.colors.bg }`, **`animation: "default"`** (was `"fade"`) | the standard push: in from the right, back with the edge swipe |
| `index` (home) | `animationTypeForReplace: "pop"` | when Post / Accounts fall back to `router.replace("/")` (opened by a link, nothing to go back to) it looks like going back |
| `editor/[id]/index` | **`fullScreenGestureEnabled: false`** | push; the back swipe starts at the **left edge only** — on iOS 26 the whole-screen swipe would otherwise compete with the timeline, the preview's gestures and the sliders |
| `editor/[id]/export` | `presentation: "modal"` (as today) | the standard sheet rising from the bottom, closed by swiping down |
| `post`, `accounts` | — | the standard push |
| `oauth` | `animation: "none"` | a blank redirect screen does not slide in |

`app/_layout.tsx` renders `<Stack screenOptions={STACK_OPTIONS}>` with one `<Stack.Screen>` per entry of the map and holds no option of its own.

### 6.2 The back swipe / leave rule

| Screen | Swipe | Why |
|---|---|---|
| Home | — | the first screen |
| **Editor** | **allowed** (left edge) | Safe: leaving unmounts the screen, and `useLoadProject`'s clean-up saves what the 500-ms autosave has not written yet (`storage.saveProject` when dirty, then `writeCover`) through `setLastFlush`; the home list awaits `lastFlush` before it re-reads. The swipe is the same exit as the back arrow (`router.back()`), and it already works today (with a non-default animation and no `animationMatchesGesture`, `RNSScreenStack` still lets UIKit's own recognizer begin). |
| **Export** | allowed, **except while exporting** | Closing the sheet mid-export removes the screen's listener: the render carries on in the native engine and its file is never offered. While `state.status === "exporting"` the route sets `gestureEnabled: false` (`react-native-screens` then sets `modalInPresentation`, so the sheet cannot be pulled down); **Cancel** is the way out, as today. Idle, unavailable, done and failed: swipe freely (the exported file stays in the cache; nothing deletes it). |
| **Post** | allowed, **except while uploading** | Already built and left untouched: `useLeaveGuard` sets `gestureEnabled: false` while busy and asks "Stop posting?" for any other way out. |
| Accounts | allowed | nothing to lose |

This is the only place where behaviour moves: the Export sheet can no longer be swiped away during the minutes it renders.

### 6.3 The editor

`app/editor/[id]/index.tsx` and `EditorLayout.tsx` are not edited. A transition is the navigator's native animation of the screen's container: no React render, no `key`, no wrapper, nothing of ours animating a parent of the preview — so the `VideoView` does not remount. The editor stays mounted under the Export sheet as it does today. `freezeOnBlur` is not set.

## 7. Pop-up panels — `src/ui/Sheet.tsx` and its four users

- **Spring.** Today `withSpring(0, { damping: 18, stiffness: 220 })`: tuned on Reanimated 3 (mass 1, damping ratio 0.61); Reanimated 4.5.1's default mass is 4, which makes it ratio **0.30** — about two seconds of wobble. New `theme.motion.sheet = { mass: 1, damping: 40, stiffness: 400 }`: ratio 40 / (2·√400) = **1.0, critically damped** — it cannot overshoot; from 320 pt away it is within 16 pt after 0.24 s and within a point after 0.40 s. Built in `motion.ts` as `sheetTo(reduced)`, used for opening and for the snap back after a drag that did not close. (Round 1's `motion.spring`, ratio 0.76, would overshoot a 320-pt travel by about 9 pt; the 250-ms limit is the editor's — a sheet sits on a dimmed screen, not beside the video.)
- **Reduce Motion**: the panel is placed at once (today: a 200-ms slide); the `Modal`'s own cross-fade stays. Read with `isReducedMotion()` at the moment of opening.
- The effect no longer lists the shared value as a dependency (AGENTS.md's rule).
- Surface `elevation.bar` (the same step as a strip or panel, so tiles and fields on it read the same); title `type.heading`; the optional header action is a compact `QuietButton`. Still a dimming `Modal`, the same drag-to-close, the same backdrop tap.

| Sheet | Changes inside |
|---|---|
| Aspect ratio | none needed (ring tiles, tokens, one gold Create already) |
| Project actions | Rename, Duplicate outlined; **Delete text only in red** |
| Post options | kit `Field`; labels and counter `type.small`; chips `space.sm` apart |
| **Cover** | kit `fieldStyle` (the last raw spacing number goes); counter `type.small`; the slider's rest track `colors.sea` (the kit slider's — `surfaceAlt` is all but invisible on a bar); **Reset text only**. Done applies, any other close discards — unchanged; the community slider stays imported directly (the one exception of `kitSlider.test.ts`). |

## 8. Testing

- Tokens; `sheetTo` (spring config, nothing under Reduce Motion); `Field`, `Card`, `Spinner`, `EmptyState`.
- The two guards with their starting tables, shrinking per task, pinned at the end.
- `Sheet`: opening calls the sheet spring once and not again on a re-render; nothing animates while hidden or under Reduce Motion; a short drag springs back, a long one closes.
- Home: the list eases in exactly once (one `withTiming`, no `withDelay`) and not after a re-render or a duplicate; a card starts no animation; card radius, badge and line sizes.
- Export: one gold button per state (none while exporting or unavailable); the estimate's value part; ring size in both states; Done is text only; the error state.
- Post / Accounts: field style, row heights, compact row actions, quiet Options / Disconnect / Sign out, no gold button on Accounts, exactly one on Post.
- Navigation: the options map (values, every route a file in `app/`, only known option names); `exportGesture`; the layout holds no option literal; the export route sets the gesture per state.
- **Motion tests assert `motion.ts` / Reanimated calls, never a rendered opacity or scale.**
- Existing suites keep passing. Expectations that change: `theme.test.ts` (`radius`, `size`, `type`, `motion.sheet`); `Sheet.test.tsx` (the `settle` case is replaced — under Reduce Motion there is no timing any more); `ProjectCard.test.tsx` (the `index` prop is gone from its six renders; no expectation changes); `ExportRoute.test.tsx` (its `expo-router` mock gains `useNavigation`, its `useExport` mock a variable state). **No label, accessibility label, role or test id changes.**

## 9. Risks

- **On-device feel is unverified** (no simulator here): the transitions, the sheet spring, the card scrim and the quieter buttons are judged on the phone (checklist in the plan).
- **The first push of the editor now slides** while the editor mounts its player and timeline; the fade hid a slow first frame better. If it stutters on the phone, the fallback is `animation: "fade"` on the editor route only (one line in the map).
- **iOS 26 whole-screen back swipe** is on by default for Post and Accounts (iOS decides); only the editor opts out.
- The Export sheet cannot be dismissed while rendering — by design; Cancel stays.
- Accounts has no gold button, and Reconnect is quieter than before; the red "Sign-in expired" carries it.
- Sheets are a step lighter (`elevation.bar`) than before.

## 10. Decisions made while writing

1. **Verified, and where.**
   - Expo docs for SDK 57: `docs.expo.dev/versions/v57.0.0/sdk/router/` (the `animation` values `default | fade | fade_from_bottom | flip | simple_push | slide_from_bottom | slide_from_right | slide_from_left | ios_from_right | ios_from_left | none`; the `presentation` values; `gestureEnabled`, default true; `fullScreenGestureEnabled`, false up to iOS 18 and true from iOS 26), `docs.expo.dev/router/advanced/stack/` (options through `screenOptions`, `<Stack.Screen options>` in the layout, or `navigation.setOptions()` in a route) and `docs.expo.dev/router/advanced/modals/` (`presentation: "modal"`: slides up from the bottom, closed by swiping down).
   - Installed code: `expo-router` 57.0.24 carries its own copy of React Navigation — there is no `@react-navigation/*` in `node_modules`. `build/react-navigation/native-stack/types.d.ts` (`NativeStackNavigationOptions`: `animation`, `presentation`, `gestureEnabled`, `fullScreenGestureEnabled`, `animationTypeForReplace: "push" | "pop"`, `contentStyle`), exported as a type from `"expo-router"` (`build/exports.d.ts`); `build/react-navigation/native-stack/views/NativeStackView.native.js` (how each option reaches `ScreenStackItem`; `animationTypeForReplace` defaults to `"push"`). `react-native-screens` 4.26.2: `lib/typescript/types.d.ts` (`StackAnimationTypes`, `StackPresentationTypes`), `ios/RNSScreen.mm` (`setGestureEnabled:` sets `modalInPresentation = !gestureEnabled`; `isFullScreenSwipeEffectivelyEnabled` — undefined means on from iOS 26), `ios/RNSScreenStack.mm` (`gestureRecognizerShouldBegin:` — with a custom animation and no `animationMatchesGesture` UIKit's own recognizer still begins, so today's fade already has the edge swipe). `useNavigation` is exported by `expo-router`; `usePreventRemove` exists only under `expo-router/react-navigation` and is not used (Post's existing `beforeRemove` guard is kept).
   - The planned options map was type-checked against `NativeStackNavigationOptions` with a throw-away file (`tsc --noEmit` clean; the file was removed).
   - `react-native-reanimated` 4.5.1 `src/animation/spring/springConfigs.ts`: default mass 4, damping 120, stiffness 900; `mass` / `damping` / `stiffness` is a valid config on its own.
   - `@expo/vector-icons` 15.1.1 glyph map: `paper-plane-outline`, `person-circle-outline`, `add-outline`, `chevron-back-outline`, `checkbox-outline`, `square-outline`, `checkmark-circle-outline`, `alert-circle-outline` all exist.
   - No test renders `app/_layout.tsx` today — hence the pure options file.
2. **The gold button keeps its name "New clip".** The approved text calls it the "New project" button; the rule of the round is that no label changes, and fifteen existing test lines find it by "New clip". Renaming it is one string (plus those lines) if the user wants it — it is on the device checklist as a question.
3. **The list eases in, not the cards** (§4) — round 1's rule against staggers that replay.
4. **`Field`, `Card`, `Spinner` are kit parts** because each replaces three or four hand-written copies; nothing else is added to the kit.
5. **Text sizes for screens join `theme.type`** (`input`, `heading`, `title`, `screen`) instead of staying as numbers passed to `Title`. Still no type-size guard.
6. **The guard widens to all four folders**, `app/` included (round 1 left `app/` out). A second small guard keeps the icons outline.
7. **A separate sheet spring**, critically damped, rather than re-using the editor's (§7).
8. **Reduce Motion places a sheet at once** — the kit's rule (`motion.ts` returns the end value), replacing the sheet's private 200-ms slide.
9. **Export's leave rule is a disabled swipe, not a question**: the screen has a Cancel button for exactly this, and nothing else can pop the sheet while it renders.
10. **The editor's back swipe stays edge-only on every iOS** (§6.1). It is not switched off: it is safe (§6.2) and it is there today.
11. **Reconnect on Accounts is outlined** so the screen never shows two gold buttons; on Post, Post is the one gold button.
12. **`ActivityIndicator` and `Alert` stay** (native iOS parts; the confirm and rename prompts are behaviour). `ProgressRing`'s filled ✓ stays (round 1's decision).
13. **Left as it is:** `AspectRatioSheet.tsx` (already on tokens), `NumField.tsx`, `ProgressRing.tsx`, `LoadingScreen.tsx`, the editor route's loading and error states, `theme.motion.stagger` / `fade` (unused after this round, kept in the theme).
