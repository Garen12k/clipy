# Text size (Dynamic Type) limits: design

**Date:** 12 October 2026 · **Branch:** `text-size` (from `main` at `61af00c`) · **Plan:** `docs/superpowers/plans/2026-10-12-text-size.md`

This is the "Dynamic Type limits" stage that AGENTS.md's Redesign line lists as later. No new package, no Swift, no native build, no `app.json` change: everything here is JavaScript and runs in Expo Go.

---

## 1. The situation (measured on this branch)

- **Nothing limits text size today.** `allowFontScaling`, `maxFontSizeMultiplier` and the two large-content props occur nowhere in `src/` or `app/` (grep: no match). So React Native's default applies to every `Text` and `TextInput`: the text follows the phone's setting with no ceiling.
- **How far that goes.** React Native's own table (`node_modules/react-native/React/CoreModules/RCTAccessibilityManager.mm`, lines 260–271) — the seven standard sizes and the five accessibility sizes:

  | Phone setting | Multiplier |
  |---|---|
  | xSmall / Small / Medium | 0.823 / 0.882 / 0.941 |
  | **Large (the default)** | **1.0** |
  | xLarge / xxLarge / **xxxLarge (largest standard)** | 1.118 / 1.235 / **1.353** |
  | AX1 / AX2 / AX3 / AX4 / **AX5 (largest of all)** | 1.786 / 2.143 / 2.643 / 3.143 / **3.571** |

  (The brief said "× 3.1"; that is AX4. The top is × 3.571.)
- **The cap is honoured natively.** `RCTAttributedTextUtils.mm` (line 102 on): the multiplier is used only while `allowFontScaling` is not false, is held at `maxFontSizeMultiplier` when that is ≥ 1, and the same number multiplies an explicit `lineHeight` (line 230). Read, not seen on a phone.
- **Icons do not scale already.** Ionicons are drawn by `@expo/vector-icons`, whose icon `Text` has `allowFontScaling: false` (`build/vendor/react-native-vector-icons/lib/create-icon-set.js:37`); SF Symbols are drawn in a pinned box (`Icon.tsx`).
- **Where text is drawn.** Almost everything already goes through the kit: 188 `<Body>` / `<Title>` / `<ValueLabel>` / `<StripNote>` call sites (78 in the editor). Raw `<Text>` / `<TextInput>` from `react-native`:

  | Where | Files | `<Text` | `<TextInput` |
  |---|---|---|---|
  | The kit (`src/ui/`) | 11 | 14 | 2 |
  | **Outside the kit** | **16** (15 in `src/editor/components/`, plus `src/projects/ProjectCard.tsx`) | **21** | **6** |

  `src/ui/ToolPanel.tsx` also imports `TextInput`, only for `TextInput.State.currentlyFocusedInput()` — it draws none. There is no `Animated.Text`, no `createAnimatedComponent(Text)`, no svg text.
- **A present bug this stage ends.** `OverlayText`, `StickerView` and `CoverFrame` size their text as a fraction of the video frame and still let the phone's setting multiply it: at a larger text size the preview's text is larger than the export's.
- **The test phone is not at the default.** `@react-native/jest-preset` gives its phone `fontScale: 2` (`jest/mocks/NativeModules.js:41,47`). Anything that reads the phone's text size under Jest without care would see "twice as large" in every existing suite.

## 2. What binds (quoted)

- `docs/design/handoff/README.md` line 33: "Text in strips grows up to the largest standard size (× 1.16), then stops; the large-content viewer takes over."
- `docs/design/reviews/design-review-5-editor.md` row 3.6: "Rule stated in S2, R4 and the README: text in strips stops at × 1.16, then the large-content viewer. (Calling × 1.16 "the largest standard size" is loose, but the rule is clear and buildable)"; row 16, the build list: "`maxFontSizeMultiplier` 1.16 on strip text; the large-content viewer for tools and tiles (I believe React Native has the two iOS props for it — needs checking)".
- `1 Foundations.dc.html`: "Largest standard · Body 23" (17 → 23 = × 1.35); "Above that, toolbar and tile labels use the system large-content viewer on touch and hold."
- `13 Tokens and Accessibility.dc.html`, the AX5 board: buttons 28 px, body 28 px (17 → 28 = × 1.65); "Buttons grow and wrap. The toolbar keeps 64 pt and shows symbols only; touch and hold shows the large-content viewer. Strips use their large-text heights; panels reflow to one column."
- AGENTS.md: "Every layout number (`BAR_HEIGHT`, `TOOLBAR`, `STRIP`, `PANEL`) is untouched"; strips have "explicit heights from `STRIP` — never `flex: 1` inside an auto-height parent"; "A tool or tile label (`ToolButton`, `Tile`) is one line that shrinks to fit (`adjustsFontSizeToFit`, `minimumFontScale` 0.85) rather than ending in dots"; "never give editor code `useShown` / `ShownContext`"; "nothing animated on an ancestor of the preview or the timeline".

**Where this design does not follow a board, and why** (each is a decision, §3):

| The board says | This stage does | Why |
|---|---|---|
| Strips take larger heights at × 1.16 (S 111 / M 139 / L 195) | The app's one strip height stays (`STRIP`: 44 + 72 + 36) | The board's S / M / L strips are not built; the app's rows hold × 1.16 text as they are (§6). AGENTS.md forbids touching the numbers. |
| At AX5 the toolbar shows symbols only | Labels stay, at × 1.16 | They fit (§6); one state fewer to build and test. |
| At AX5 buttons grow to 76 pt and wrap | Buttons keep 48 pt and one line, capped at × 1.35 | A button stands in boxes of a fixed height (Home's glass capsules, a sheet's action row, the editor's bars). Apple's own bars stop growing too. |
| At AX5 panels reflow to one column | Nothing reflows | Panel text is capped at × 1.16: nothing needs the room. |
| The viewer shows "a tool or tile's name and symbol" | The name only | React Native 0.86.3 has a prop for the title and none for the image (§3 D4). |

## 3. Decisions

### D1. Three numbers, in `src/theme/theme.ts`

```ts
/** How far text follows the phone's text size (Dynamic Type): React Native's `maxFontSizeMultiplier`, by where the text is drawn. */
textScale: { editor: 1.16, screen: 1.35, reading: 1.65 },
```

| Name | Value | For | Why this number |
|---|---|---|---|
| `editor` | **1.16** | Every word of the editor's chrome (tone `editor`: the editor route, Crop, strips, panels, the toolbar, the top bar, the play row, the message bar) | The hand-off's number, accepted by the owner. It lies between xLarge (1.118) and xxLarge (1.235): at xLarge the editor follows the phone exactly; from xxLarge up it stays at 1.16. And 0.85 × 1.16 = 0.986 < 1: a tool label that shrinks to fit never needs more width than at the default. |
| `screen` | **1.35** | Everything outside the editor that is a control, a title, a row, a note in a row or in a sheet | The largest STANDARD size (xxxLarge, 1.353; Foundations' "Body 23"). So at all seven standard sizes the screens follow the phone exactly, and only the accessibility sizes are held. Every fixed box of the kit holds × 1.35 text (§6). |
| `reading` | **1.65** | A paragraph that stands under a title on a scrolling page (nine places, D6) | The hand-off's own AX5 board draws body at 28 px where Body is 17 (× 1.65). Text that only has to be read may grow further than a control, because its page scrolls. |

Below the default the phone's own number is used unchanged (0.823 …): smaller text never overflows.

**Never scaled** is not a number: such text gets `allowFontScaling={false}` (D5).

### D2. Where the cap is applied: one kit text, chosen by tone

`src/ui/Text.tsx` becomes the ONLY file that renders React Native's `Text` or `TextInput`:

```ts
export type TextRole = "chrome" | "reading" | "fixed";                       // src/ui/textScale.ts
export type KitTextProps = TextProps & { scale?: TextRole; fit?: boolean | number };
export function KitText(props: KitTextProps): React.JSX.Element;            // the one Text
export function KitInput(props: TextInputProps): React.JSX.Element;         // the one TextInput
```

- `scale` defaults to `"chrome"`: the tone's cap (`useTone()`: `editor` → 1.16, a screen → 1.35). **New code is capped without saying anything.**
- `scale="reading"`: 1.65 on a screen; in the editor it is still 1.16 (the tone wins).
- `scale="fixed"`: `allowFontScaling={false}`.
- `Body`, `Title`, `ValueLabel` (and so `StripNote`) render `KitText` and pass `scale` / `fit` through. `Field` and `NumField` render `KitInput`.
- The tone is read with `useTone()` only — a constant string for the life of a screen. `ShownContext` is not read: the appearance rule for the editor is untouched.
- **A nested text repeats its parent's role.** React Native computes `allowFontScaling !== false` for every `Text`, nested ones included (`Libraries/Text/Text.js:289`), so a raw span inside a fixed text would scale by itself. Every span is a `KitText` with the same `scale` (the karaoke spans of `OverlayText`; `ValueLabel`'s value).

Raw `Text` / `TextInput` in app code is **forbidden** by a guard (D8), not wrapped case by case.

### D3. "Fit back": a line-limited text never needs more room than at the default

Capping the size settles the HEIGHT of every fixed row (§6). The WIDTH is settled by one rule inside `KitText`:

> While the text is shown larger than the default (`s` = the phone's scale held at the cap, `s > 1`), a text that has `numberOfLines` (or `fit`) also gets `adjustsFontSizeToFit` and `minimumFontScale = (its own minimumFontScale ?? 1) / s`.

So it grows where there is room and otherwise shrinks back, at most to the size it has at the default — and then behaves exactly as it does today (it fits, or it ends in dots where it did before). For the tool and tile labels the existing 0.85 becomes 0.85 / s: the same smallest size in points as today. Without this, 0.85 of a larger size would be a LARGER floor and a long label would lose its last letters.

- `fit` (`true` = one line, a number = that many lines) is for a label that has no `numberOfLines` today and stands in a box of a fixed height: at the default it renders **nothing** (no prop is added); above it, it is `numberOfLines` plus the rule above. All three buttons, `Chip`, the "making" capsule on Home and twelve short row labels in the editor use it (Blur; Smooth; Mute; Even out loudness; Reduce noise; Fewer; More; the play row's ratio; a template's name and Random; a text-look row's name; Read aloud). It is written FIRST, right after the component's name (`<Body fit …>`), so the guard can count it.
- At `s ≤ 1` `KitText` adds no prop but the cap. That is what keeps the default tree what it is.
- Only a text with `numberOfLines` or `fit` listens for the phone's text size (`useSyncExternalStore`); a plain capped text reads the tone and nothing else; a fixed text reads nothing (the timeline's bar labels).

### D4. The large-content viewer

Verified in the installed React Native 0.86.3: `accessibilityShowsLargeContentViewer` and `accessibilityLargeContentTitle` are view props (`Libraries/Components/View/ViewAccessibility.d.ts:336,343`, "Available on iOS 13.0+"; listed in `BaseViewConfig.ios.js:201–202`), implemented in `RCTViewComponentView.mm:427–446` (it sets `showsLargeContentViewer`, adds a `UILargeContentViewerInteraction`, sets `largeContentTitle`). `Pressable` passes them to its view. There is **no prop for the image**, so the viewer shows the name only.

Used: `largeContent(title)` (`src/ui/textScale.ts`) returns the two props, and these capped controls spread it on their pressable — the title is the visible label, or the accessibility label of an icon-only button:

`ToolButton` (tile, bar, group), `Tile`, `Chip`, each `Segmented` segment, `PrimaryButton`, `SecondaryButton`, `QuietButton`, `IconButton`, `DoneButton`, `ScreenBar`'s back / close; in the editor also the top bar's Back and the play row's Undo, Redo, Play / Pause and Aspect ratio.

Not used: a project card (it has its own touch-and-hold), anything on the timeline or the preview, rows of text that already grow. iOS shows the viewer only at the accessibility sizes; at the default the props do nothing.

### D5. Never scaled — content and marks

Each is `scale="fixed"`, and the guard pins the exact list with a count per file.

| What | File (sites) | Its rule |
|---|---|---|
| Text on the video | `OverlayText.tsx` (6, the nested spans included) | Its size is a fraction of the frame; the export draws the same fraction. |
| An emoji sticker on the video | `StickerView.tsx` (2) | As above. |
| The cover's title in the cover frame | `CoverFrame.tsx` (1) | `height × 0.07`: part of the picture. |
| A font's sample | `FontStrip.tsx` (1) | A picture of the font in a tile of a fixed size. |
| Timeline bar labels | `AudioBar.tsx` (2), `LayerBar.tsx` (1), `OverlayPill.tsx` (1), `EffectPill.tsx` (1) | Drawn in bars of a fixed height; `barParts` decides by width in points. |
| Clip badges | `ClipThumbStrip.tsx` (1) | Words on a scrim over a thumbnail; `clipBadges` decides by width. |
| The ruler's labels | `TimeRuler.tsx` (1) | Marks on a scale. |
| An emoji as a picture | `StickerSheet.tsx` (2), `TemplateSheet.tsx` (1), `EmptyState.tsx` (1) | A glyph in a cell of a fixed size. |
| The cover title and the length on a project's picture | `ProjectCard.tsx` (2) | On the user's picture, like the editor's badges. |
| The percentage in the export ring | `ProgressRing.tsx` (1) | Drawn inside a ring of a fixed size. |
| The loading screen's wordmark and line | `LoadingScreen.tsx` (2) | It continues the native launch screen, which does not scale. |
| Icons | — | Already fixed by the icon library / a pinned symbol box. Icons do not grow in this stage. |

Everything iOS draws itself (alerts, action sheets, the keyboard, the share sheet, the Photos picker, Apple's sign-in button) follows the phone on its own and is not ours to cap.

**Chrome, not fixed** (decided, so nobody "fixes" them later): the Preview tag (one line that already shrinks to fit), the message bar, the play row's time, the Record tab's timer, the multi-select count — all × 1.16 by tone.

### D6. `reading`: nine places

The rule: a paragraph that stands **under a title, on a page that scrolls**; never a line in a list of rows, never in a sheet, never a text with `numberOfLines`. A reading text must not end up larger than the title above it.

| File | Text | Size at the default → at 1.65 | The title above it at 1.35 |
|---|---|---|---|
| `src/auth/WelcomeWizard.tsx` (1) | a page's body under its title (`Page`) | 16 → 26.4 | 28 → 37.8 |
| `src/auth/WelcomeScreen.tsx` (2) | the tagline / heading body; the footer | 16 → 26.4; 12 → 19.8 | 28 (the wizard's heading) or 48 (the wordmark) → 37.8 / 64.8 |
| `src/auth/EmailSignIn.tsx` (2) | the note or error under a field; "Enter the 6-digit code…" (that step's own heading) | 15 → 24.8; 16 → 26.4 | 22 → 29.7 on the email step; none on the code step |
| `src/export/ExportScreenBody.tsx` (2) | the two sentences of "Export needs the native build" | 15 → 24.8 | 20 → 27 |
| `src/publish/components/SignInCard.tsx` (2) | the sentence under each of its two titles | 15 → 24.8 | 20 → 27 |

Everything else outside the editor is `chrome` (1.35): rows on Accounts, Post and the wizard's permissions (a reason line must not outgrow its row's name), every sheet (a sheet's height is bounded), the Export options, notes under the ring, the toast, empty states.

### D7. Layouts at the largest allowed size

No height in the app changes. With the caps and "fit back", every fixed box holds its text (§6); the screens outside the editor already grow (`minHeight` rows, scrolling pages). The only edits outside the kit are roles: `scale="fixed"`, `scale="reading"`, `fit`, and `largeContent` on five editor buttons.

### D8. The guard (`src/__tests__/textScale*.guard.test.ts`)

1. **Only `src/ui/Text.tsx` draws text.** No other file under `src/` or `app/` (tests aside) contains `<Text`, `<TextInput`, `Animated.Text` or `createAnimatedComponent(Text…)`, and the value imports of `Text` / `TextInput` from `"react-native"` are exactly `src/ui/Text.tsx` (both) and `src/ui/ToolPanel.tsx` (`TextInput`, for `TextInput.State`). `import type` and `type X` specifiers are free.
2. **The four props are named in two files only:** `allowFontScaling`, `maxFontSizeMultiplier`, `accessibilityShowsLargeContentViewer`, `accessibilityLargeContentTitle` → `src/ui/Text.tsx`, `src/ui/textScale.ts`.
3. **One reader of the phone's text size:** `getFontScale`, `.fontScale` off `Dimensions.get(…)` or `useWindowDimensions()` → `src/ui/phoneTextSize.ts` only. (`fontScale` as a field of a text overlay is something else and is not matched.)
4. **The never-scaled list is exact:** `scale="fixed"` occurs in exactly the files of D5 with exactly those counts; in the files that draw content only, every `KitText` is fixed.
5. **The reading list is exact:** `scale="reading"` occurs in exactly the five files of D6 with those counts. **The `fit` list is exact** too: `<Body fit` / `<Title fit` / `<KitText fit` per file — the kit's four (three buttons, `Chip`), the editor's twelve (D3), Home's one.
6. **The numbers:** `theme.textScale` equals `{ editor: 1.16, screen: 1.35, reading: 1.65 }`; `0.85 × editor < 1`; `screen` is not above the largest standard size (1.353).

Allow-lists are exact tables in the guard, as in `systemFont.guard.test.ts`; a new entry needs a line in this spec's D5 or D6.

### D9. Tests without a phone

- **The test phone is at the default.** `jest.setup.ts` stands in for `src/ui/phoneTextSize.ts` (the precedent is the camera and notifications: "the test phone has no camera"): it answers 1 and can be told another size. Every existing suite therefore sees the app at the default, whatever the preset's `fontScale: 2` says. `phoneTextSize.test.ts` tests the real module against `Dimensions`.
- **`textSize(scale)`** (`src/ui/testing/textSize.ts`) is the user moving the slider while the app is open; `texts()` lists every host `Text` / `TextInput` on screen with its props; `unruled()` lists those with neither a cap nor `allowFontScaling={false}` — empty on any tree built from the kit.
- **What a capped text renders in the test tree:** the host `Text` with the PROP `maxFontSizeMultiplier` (1.16 under `ToneContext.Provider value="editor"`, 1.35 otherwise, 1.65 for reading on a screen) or `allowFontScaling: false`. Jest has no layout engine: tests assert props, never a measured size.
- **"The default tree is unchanged" is pinned three ways:**
  1. `src/ui/__tests__/defaultTree.proof.test.tsx` — a Jest snapshot of the whole kit in both tones (every kit component with text, a strip, a panel), **written and committed before any source file changes**, compared with the four props of D8.2 removed and nothing else. A PROOF: never updated (`-u` is forbidden), and a test fails if the snapshot file is missing.
  2. Every existing suite passes **unedited** at the test phone's default size.
  3. `KitText`'s own tests: at scale 1 the host gets the props it was given plus exactly one of `maxFontSizeMultiplier` / `allowFontScaling`.
- **Above the default:** the kit by tone at 1.118, 1.353 and 3.571 (cap, "fit back" numbers, `fit`), the editor's content fixed, the reading places, the large-content props.

### D10. Out of scope

A light editor; the Bold Text and Increase Contrast settings; landscape; iPad (the `ipad` branch is on hold and not part of `main`); icons that grow; a symbol in the large-content viewer; buttons that wrap; line heights from `theme.text` ("leading is taken up screen by screen in later stages"); any change to a layout number.

## 4. The constants and the API (what the plan builds)

```ts
// src/theme/theme.ts
theme.textScale = { editor: 1.16, screen: 1.35, reading: 1.65 }

// src/ui/phoneTextSize.ts — the ONLY file that asks the phone
export const readFontScale: () => number;                              // 1 = the default; never 0 / NaN
export function onFontScale(listener: () => void): () => void;         // Dimensions "change"; returns the remover

// src/ui/textScale.ts — pure, plus two hooks
export type TextRole = "chrome" | "reading" | "fixed";
export const textCap: (tone: Tone, role: TextRole) => number;          // fixed → 1
export const shownScale: (phone: number, cap: number) => number;       // min(phone, cap)
export const usePhoneScale: () => number;
export function useTextScale(role?: TextRole): number;                 // the scale text of this role is shown at here
export type Fit = { numberOfLines?: number; adjustsFontSizeToFit?: boolean; minimumFontScale?: number };
export function fitProps(scale: number, given: Fit, fit?: boolean | number): Fit | null;   // null = add nothing
export const largeContent: (title: string) => { accessibilityShowsLargeContentViewer: true; accessibilityLargeContentTitle: string };

// src/ui/Text.tsx
export type KitTextProps = TextProps & { scale?: TextRole; fit?: boolean | number };
export function KitText(props: KitTextProps): React.JSX.Element;
export function KitInput(props: TextInputProps): React.JSX.Element;
// Title, Body, ValueLabel: as today, now KitTextProps-based (they accept `scale` and `fit`).

// src/ui/testing/textSize.ts — tests only
export function textSize(scale: number): Promise<void>;
export function texts(): { type: string; props: Record<string, unknown>; text: string }[];
export function unruled(): string[];
```

## 5. Every kit text component and its cap

| Component | Text | Role → cap (screen / editor) | Fit back | Large content |
|---|---|---|---|---|
| `Title` | titles | chrome → 1.35 / 1.16 | when the caller limits lines | — |
| `Body` | text, notes, labels | chrome (or what the caller says) | when the caller limits lines or says `fit` | — |
| `ValueLabel` | a name and its value | chrome; the value span repeats it | as `Body` | — |
| `StripNote` | a strip header's note | chrome → 1.16 | yes (1 or 2 lines) | — |
| `PrimaryButton` / `SecondaryButton` / `QuietButton` | the title | chrome | `fit` | the title |
| `Chip` | the label | chrome | `fit` | the label |
| `Segmented` | each segment | chrome | yes (one line already) | the segment's label |
| `Tile` | the label | chrome | yes, floor 0.85 / s | the label |
| `ToolButton` (tile / bar / group) | the label | chrome → 1.16 | yes, floor 0.85 / s | the label |
| `IconButton`, `DoneButton`, `ScreenBar`'s leading button | no text | — | — | the accessibility label |
| `ScreenBar` | the title | chrome | yes (one line already) | — |
| `Sheet` | the title | chrome | no (it wraps; the sheet grows) | — |
| `Group` | the label | chrome | no (it wraps) | — |
| `Field`, `NumField` | the typed text (`KitInput`) | chrome | — | — |
| `Toast` | the message | chrome | no (the pill grows) | — |
| `EmptyState` | title, hint, pointer; the emoji | chrome; the emoji **fixed** | no | — |
| `ProgressRing` | the percentage | **fixed** | — | — |
| `LoadingScreen` | wordmark, line | **fixed** | — | — |
| `ToolStrip` / `ToolPanel` | the title | chrome → 1.16 | no (one short word) | — |

## 6. Fixed heights around text, and the decision for each

Line height of the system font ≈ 1.193 × its size (12 → 14.3, 15 → 17.9, 17 → 20.3). "Fits" = lines × size × cap × 1.193 ≤ the box. Widths are settled by D3.

**The editor (cap 1.16)**

| Box | Height | Tallest text in it at 1.16 | Decision |
|---|---|---|---|
| Strip / panel header (`STRIP.header`, `PANEL.header`) | 44 | title 17 → 23.5; a two-line note 2 × 11 → 30.5; compact Quiet button 36 | keep; fits |
| Tiles row (`STRIP.tiles`) | 72 | a tile's column: 4 + 44 + 4 + 16.6 + 4 = 72.6 | keep. The 0.6 pt comes out of the column's own 4-pt bottom padding: no glyph is cut. To be looked at on the phone (§9). |
| Slider row (`STRIP.slider`) | 36 | name and value 12 → 16.6; a two-line status 2 × 12 → 33.2 | keep; fits |
| Toolbar tool (`TOOLBAR.tool`) in the capsule (`TOOLBAR.height` 64) | 56 | 24 symbol + 4 + 16.6 = 44.6 | keep; fits; the label fits back |
| Panel lead (`PANEL.lead`) | 44 | chip 36 (15 → 20.8) / compact chip 28 (12 → 16.6) | keep; fits |
| Compact panel (`PANEL.compact`) rows | 240 in all | row labels 12 → 16.6 in rows of 36–48 | keep; one-word labels get `fit` |
| Editor top bar | 48 | name 17 → 23.5 (one line, fits back); compact Export 36 | keep; fits |
| Play row | 48 | time 12 → 16.6; ratio chip 28 | keep; fits |
| Multi-select count | 44 | 13 → 18 | keep; fits |
| Message bar | `minHeight` | two lines, fit back | grows as today |
| Timeline bars, badges, ruler, bar glyphs | fixed | — | **never scaled** (D5) |
| Preview tag | padding only | 11 → 15.2, one line | keep; fits back |

**Outside the editor (cap 1.35; reading 1.65 only on scrolling pages)**

| Box | Height | Text at the cap | Decision |
|---|---|---|---|
| Buttons (`buttonBox`) | 48 / compact 36 | 17 → 27.4 / 15 → 24.2, one line | keep; `fit` (one line that fits back) |
| `Chip` | 36 / 28 | 15 → 24.2 / 12 → 19.3 | keep; `fit` |
| `Segmented` | 44 (36 inside) | 15 → 24.2 | keep; fits back |
| `ScreenBar` | 44 | 17 → 27.4 | keep; fits back |
| Home header pill (glass) | 44 | icons only | keep; the two buttons get the viewer |
| Home bottom actions (Quick Edit on glass, New Project) | 48 | two buttons side by side; at 1.35 their natural widths pass a 375-pt phone | keep; `fit` brings them back to the default width at worst |
| Home "making" capsule | 48 | 15 → 24.2 | keep; `fit` on its words |
| Project card: cover (3 : 4), length badge 24, More 44 | fixed | badge and cover title | **never scaled**; name and status below grow (`minHeight`, their explicit `lineHeight` scales with them) |
| Aspect-ratio option (`OPTION`) | 76 | 24 shape + 8 + 19.3 = 51.3 | keep; fits; the label fits back |
| Quick edit sheet's tiles | auto | — | grow |
| A `Sheet` | auto, `maxHeight` | chrome only | grows; TikTok's options already scroll (`maxHeight` share) |
| Export options card, estimate row | auto | — | grow |
| Export ring | 120 | the percentage | **never scaled** |
| Notify offer card and its kept place | measured (`onLayout`) | chrome | grows; the kept place is the height it was drawn with |
| `AccountRow`, `PostRow`, TikTok rows, Accounts rows, permission rows | `minHeight` 48–56 | — | grow; a name wraps beside its action |
| Wizard bar | 44 | compact Skip 36 | keep; fits |
| Wizard pages 1–3 | scroll vertically | title 1.35, body reading 1.65 | scroll (the code already says so) |
| Wizard feature tile scene (`SCENE_HEIGHT`) | 72 | no text (plain views) | keep; the label under it wraps |
| Wizard dots | 44 | no text | keep |
| Sign-in body: back row 48, working slot, Apple's button | fixed | no text of ours | keep; the page scrolls |
| `Field` | `minHeight` 44 | — | grows |
| Toast | auto | — | grows |
| Loading screen | — | — | **never scaled** |

## 7. `adjustsFontSizeToFit` and a cap, together

- iOS first multiplies the size by the (capped) multiplier, then shrinks it — as far as `minimumFontScale` of that larger size — until the text fits its lines.
- Today: tool and tile labels, the strip's slider label and the Preview tag carry `minimumFontScale={0.85}`. Left alone at × 1.16 their floor would rise from 10.2 pt to 11.8 pt. `KitText` therefore divides the floor by the shown scale (D3): 0.85 / 1.16 = 0.733, the same 10.2 pt.
- At the default the two props are passed through untouched.

## 8. The owner's checklist (on the phone, in Expo Go)

Three sizes. Change them in **Settings → Display & Brightness → Text Size** (the slider), and for the third in **Settings → Accessibility → Display & Text Size → Larger Text** (switch on "Larger Accessibility Sizes", slider fully right).

| | Size | What to expect |
|---|---|---|
| A | The default (the slider's middle notch, the fourth of seven) | The app exactly as before this change. |
| B | The largest standard (slider fully right, Larger Accessibility Sizes off) | Outside the editor everything is clearly larger; in the editor words are slightly larger. |
| C | The largest of all (Larger Accessibility Sizes on, slider fully right) | Paragraphs on the welcome pages are larger still; everything else looks like B. Touch and hold a tool: its name appears large in the middle of the screen. |

At each size, look at:

1. **Home** — the title, the two round buttons top right, a project card (name, status, the length on the picture), Quick Edit and New Project side by side, the empty state.
2. **New Project → the shape sheet**, and **Quick Edit → the style sheet**.
3. **The editor** — top bar (name, Export), the play row, the toolbar's labels, the group button; open **Filter**, **Speed** (all three tabs), **Volume**, **Trim**, **Remove background**; open **Text** (type something), **Stickers**, **Add audio**, **Captions**; a message ("Cut to Beats" says one). The video and the timeline must be exactly where they are at size A.
4. **Text on the video** — add a text and a sticker at size A, note their size against the frame, switch to C: they must look the same (and match an export).
5. **The timeline** — bar labels, clip badges, the ruler: the same at A, B and C.
6. **Export** — the three choices, the ring's percentage, Ready to sail, the buttons.
7. **Post** and **Accounts** — platform rows with Connect / Disconnect, TikTok's options, Sign Out, the Build row.
8. **Show welcome again** (Accounts) — the four pages, the permission rows, the sign-in page with the email and the code steps.
9. At C only: touch and hold a toolbar tool, a tile in a strip, the ✓, a Home header button, a button — the name appears large; let go — nothing else happens; a normal tap still works.

Anything cut off, overlapping, ending in dots where it did not at A, or a video / timeline that moved: a screenshot and the size letter.

## 9. Unverified until a phone shows it

1. **The large-content viewer really appears** on a React Native `Pressable` at an accessibility size, with the title only; and its touch-and-hold neither swallows a normal tap nor fires the button on release (React Native sets no delegate for the interaction).
2. **"Fit back" lands on the default size:** that iOS takes `minimumFontScale` relative to the already-multiplied size, also for two lines; and that it costs nothing noticeable in the project grid.
3. **A nested span scales on its own unless told** (read in `Text.js`, not seen): the karaoke spans in `OverlayText`.
4. **The tiles row at × 1.16:** the column is 0.6 pt taller than its 72-pt row; expected to cost only bottom padding. If a descender is cut, the remedy is a tighter cap for a label under a tile box (1.1), nothing else.
5. **A live change:** that the app hears a new text size while it is open (`RCTDeviceInfo.mm` sends `didUpdateDimensions` on the multiplier notification — read, not seen), so "fit back" updates without restarting.
6. **Line heights** used in §6 are the system font's nominal ones (1.193 × size).
7. **`TextInput`** honours the cap for the typed text and the placeholder.
8. **Today's preview bug** (text on the video following the phone's setting) is inferred from the code; that it is gone — and that preview and export match at size C — is seen only on the phone.
9. **Apple's sign-in button** and other system-drawn parts at size C inside their fixed slots.
10. **The small phone (375 × 667) at size C:** the wizard's pages and the sign-in page scroll far enough; sheets stay inside the screen.
11. **Home's two bottom buttons at size B on the narrowest phone:** expected to shrink back toward the default width rather than overlap.

## 10. As built (after the independent review of f09ccb9..37cb08f)

The review found two things this document had wrong. Both were fixed in `015bf07`; where this section and an earlier one disagree, this one is what the code does.

### 10.1 "Fit back" has no floor on iOS (D3, section 7, 9.2 — superseded)

D3 said a line-limited text "may shrink, at most back to the size it has at the default", by `minimumFontScale` = its own ÷ the scale shown. That floor does not exist. Read in React Native 0.86.3 (not seen on a phone):

- `ReactCommon/react/renderer/textlayoutmanager/platform/ios/react/renderer/textlayoutmanager/RCTTextLayoutManager.mm` (lines 246–249), the only place the new architecture shrinks text on iOS, uses `paragraphAttributes.minimumFontSize`, 4 pt when it is not given, and never `minimumFontScale`.
- `Libraries/Text/TextNativeComponent.js` sends `adjustsFontSizeToFit` and `minimumFontScale` only: JavaScript cannot give the 4 another value.
- The only iOS reader of `minimumFontScale` is the old architecture's `RCTTextShadowView.mm`, which this app does not run.

So the rule as first built — every text with `numberOfLines` gets shrink-to-fit above the default — would have drawn a long project name whole at about 7 pt where it used to end in dots. The same reading shows that the 0.85 "floor" of tool and tile labels (written long before this work) was never in force either: those labels have always shrunk as far as they needed. They are short fixed labels, so nothing is wrong with them, and they are unchanged.

What is built instead:

- **Fit is an explicit opt-in.** `KitText` shrinks nothing unless it is given `fit`. `fitProps(scale, lines, fit)` answers `{ numberOfLines, adjustsFontSizeToFit: true }` above the default and null otherwise; it sends no `minimumFontScale`. A text with `numberOfLines` and no `fit` is capped and ends in dots, exactly as before the branch.
- **Who may fit:** only a short fixed label the app itself writes, bounded and fitting at the default size, so the shrink ends at or above the default. The users are the exact tables `FIT_KIT` / `FIT_EDITOR` / `FIT_SCREENS` in the guard, each with its reason (28 labels in 23 files: buttons, chips, segments, the screen bar's title, the twelve row labels of Task 2, registry names under tiles, the play row's time, Home's capsule, the two readouts on Accounts, a ratio's name).
- **Who may not:** anything a user or a platform wrote, and any unbounded sentence — the project's name on Home's card and in the editor's top bar, the card's status, an account's name, the email address, TikTok's nickname, the editor's message bar, hints and status sentences in strips. They keep their line limit and their dots. A `Chip` whose label the phone supplies (Read aloud's languages and voices) says `fit={false}`.
- **The guard:** `adjustsFontSizeToFit` is named only in `src/ui/textScale.ts` and in `SHRINKS_AS_WRITTEN` (the six labels that asked for it themselves before this work, pinned by the default-tree PROOF); `minimumFontScale` only in those six; `minimumFontSize` nowhere. `fit` is counted on any component, first or not, with or without a value.
- **Cost:** a two-line fixed note in a strip (`StripNote`, a status line) that only just fits at the default may end in dots at 1.16. That is what it did before the branch at that size, and it is the lesser harm.

### 10.2 Home's two bottom actions (section 6 "Home bottom actions", 9.11 — superseded)

Section 6 kept the row as it was on the premise that `fit` would bring the buttons back. It could not: neither button could shrink (React Native's default `flexShrink` is 0), so each label was measured against the whole row and had nothing to fit into; the row overflowed and the gold button left the screen.

Widths, from the review's estimates of the label widths (±5 %): a button is 24 + 20 + 8 + label + 24; Quick Edit's label is about 82 pt and New Project's about 97 pt at the default.

| Phone | Row | Needed at ×1.35 | Over | Label size after sharing (default 17 pt, asked 23 pt) |
|---|---|---|---|---|
| 375 pt | 343 | 406 | 63 | about 17 pt |
| 393 pt | 361 | 406 | 45 | about 18.7 pt |
| 430 pt | 398 | 406 | 8 | about 22.2 pt |

What is built: above the default size only (`useTextScale() > 1` in app/index.tsx) Quick Edit's pill and New Project (`PrimaryButton shrink`) get `flexShrink: 1`, and a `fit` label gets `flexShrink: 1` too, so each button gives up its share of the overflow and its label fits what is left. Both labels land at or above the default size on every phone, so no lower cap for this row was added to `theme.textScale`. At the default size the tree is what it was (no wrapper, no extra style entry — the PROOF and the Home suites are unedited). No height changed; the glass pill and the `home-making` capsule keep their boxes.

### 10.3 Smaller things

- `KitText` no longer changes its component type with `numberOfLines` (it depends on `fit` alone), so a text whose line limit appears later is not remounted.
- `useTextScale` now has a caller (Home).
- The guard also refuses a `require("react-native")`, a default import and single-quoted imports, and in a content-only file checks `Body` / `Title` / `ValueLabel` / `StripNote` as well as `KitText`.
- The tests no longer pin a `minimumFontScale` number: Jest has no layout and iOS drops the prop.
- Left as they are: the tiles row at 1.16 (0.6 pt over its 72, section 9.4 — a phone decides); React Native adding a large-content interaction each time the prop turns true on a recycled view (not ours; watch for a doubled viewer on the phone).

### 10.4 Section 9, corrected

Item 2 ("fit back lands on the default size") is no longer a claim about `minimumFontScale`: what a phone must show is that a `fit` label is never smaller than at the default and a long name ends in dots. Item 11 is now: at sizes B and C on the narrowest phone, both bottom buttons are inside the screen with readable labels. The owner's checklist is `docs/text-size-phone-checklist.md`.
