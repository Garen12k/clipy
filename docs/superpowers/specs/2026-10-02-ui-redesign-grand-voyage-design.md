# Clipy UI Redesign — "Grand Voyage" — Design

**Date:** 2026-10-02
**Status:** Implemented 2026-10-02 (on-device checklist pending; home settings icon, export file size and "Post to…" land with Phase 4)
**Parent specs:** `2026-10-01-clip-editor-app-design.md` and the Phase 1–3 specs. This spec replaces their visual language (colours, fonts, toolbar layout, home screen, loading) and nothing else: features, data model, export and timing rules are unchanged.

## 1. Goal

Make Clipy look and feel finished from the first frame: an animated loading screen, a redesigned home screen, a five-group editor toolbar, one consistent sheet style, a clearer export screen, and consistent motion and haptics — all in the "Grand Voyage" look (deep-sea navy, straw-gold, compass and waves).

**Done when** (iPhone, Expo Go): opening the app shows the animated compass loading screen which hands off to the home screen; the empty state and the projects grid match the mockups; the editor shows five groups (Edit · Effects · Text · Stickers · Audio) with the selected group's tools above; every tool sheet shares one style and can be swiped down; export shows a gold progress ring and the three actions; presses, sheets and key actions animate and vibrate as specified; no screen uses the old red/black palette or the Bangers heading font. Jest green, typecheck clean, expo-doctor clean.

## 2. Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Overall look | **B — Grand Voyage**: navy sea gradient, straw-gold accent, compass + waves motif |
| Editor tool layout | **B — five groups** always visible, sub-tools in a row above |
| Screens covered | Loading, Home (empty + grid), Editor, Sheets, Export; later screens (Accounts, Post) inherit the kit |

## 3. Constraints

- **Expo Go safe.** Only modules bundled in Expo Go: `react-native-reanimated`, `react-native-gesture-handler`, `react-native-svg` (already installed), plus `expo-linear-gradient` and `expo-haptics` (to add with `npx expo install`). No new native code, no Swift changes.
- **Inspired, not copied.** Sea/compass mood only; no One Piece names, characters, logos or artwork. Emoji and generic shapes only.
- **Tokens only.** Screens and components take every colour, radius, spacing, font and duration from `src/theme/theme.ts`. The only hex literals allowed outside the theme are user-content colours (text/sticker colour pickers, filter preview tints, template data).
- **Exported video is untouched.** Overlay fonts (`src/editor/fonts.ts` ↔ Swift) and effects registries do not change; UI fonts are a separate set.
- **Behaviour is preserved.** Every existing tool, sheet, gesture, accessibility label and store call keeps working; existing tests change only where they assert layout or labels that this spec changes.
- **Reduced motion.** When the system "Reduce Motion" setting is on, the loading animation is a simple fade and sheets/tiles appear without spring or stagger.
- In Expo Go the very first moment is Expo Go's own loader; our loading screen starts when the JS bundle runs. In a native build the static splash (navy + compass mark) precedes it seamlessly.
- TDD, `git add` specific paths, commit trailer unchanged.

## 4. Visual Language

### 4.1 Colour tokens (replace `theme.colors`)
| Token | Value | Use |
|---|---|---|
| `bg` | `#0A1B33` | screen background (top of the gradient) |
| `bgDeep` | `#081527` | timeline well, behind sheets |
| `bgEnd` | `#0C2542` | bottom of the screen gradient |
| `surface` | `#0E2440` | bars, sheets, cards |
| `surfaceAlt` | `#17365C` | tool icon tiles, inputs, chips |
| `accent` | `#D9B36A` | the one main action per screen, selection rings, active group |
| `accentPressed` | `#B8934D` | pressed accent |
| `onAccent` | `#0A1B33` | text/icons on accent |
| `text` | `#F6E7C1` | primary text |
| `textMuted` | `#9FB3CC` | secondary text |
| `hairline` | `rgba(217,179,106,0.45)` | card and sheet borders |
| `sea` | `#1C6E9E`, `seaLight` `#2E86AB` | waves, music lane |
| `danger` | `#E5484D` | delete, destructive confirm, errors only |
| `laneText` `#D9B36A` · `laneSticker` `#E86A7A` · `laneMusic` `#3BA7C9` | timeline lanes |

Old tokens `highlight` and `straw` are removed; their uses map to `accent`. Red is no longer an accent.

### 4.2 Type
UI fonts (bundled OFL files in `assets/fonts/ui/`): **Oswald 700** for screen titles and sheet titles (uppercase, letter-spacing 1.5–2); **Montserrat 400 / 600 / 800** for body, labels and buttons. Tokens: `theme.fonts.title`, `body`, `bodySemi`, `bodyBold`. Bangers is no longer used by the UI (it stays as an overlay font).

### 4.3 Shape and spacing
Radii: `card 12`, `chip 8`, `tile 7`, `sheet 18`, `pill 999`. Spacing scale unchanged. Cards and sheets carry a 1–1.5 px `hairline` border. Main buttons are gold pills with `onAccent` bold uppercase text; secondary buttons are hairline-outlined pills.

### 4.4 Motion and haptics (`theme.motion`)
- Press: scale to 0.96 over 120 ms, back with a spring.
- Sheet: spring up (damping 18, stiffness 220), dimmed backdrop fades 200 ms; swipe down past 25 % or fast flick closes.
- Home tiles: fade + 8 px rise, 40 ms stagger, first load only.
- Toolbar sub-row: cross-fade 150 ms when the group changes.
- Haptics (`expo-haptics`): light impact on split, apply template/filter, group change; medium on delete; success notification when an export finishes; none on ordinary navigation. A `haptic(kind)` helper no-ops if the module is unavailable.

## 5. Screens

### 5.1 Loading (`src/ui/LoadingScreen.tsx`, shown by `app/_layout.tsx`)
Navy gradient; a gold compass ring (SVG) whose red/cream needle swings and settles; "CLIPY" in Oswald rises and fades in; tagline "EDIT · SET SAIL · SHARE"; two wave layers scrolling at different speeds along the bottom. It is displayed while fonts load **and for a minimum of 1.2 s**, then the waves slide down and the screen cross-fades to the home screen (300 ms). The native splash is hidden as soon as the first frame of this screen is drawn. `assets/icon.png` and `assets/splash-icon.png` are regenerated in the new look (navy field, gold compass mark) by `scripts/gen-brand.mjs` from an SVG source committed alongside.

### 5.2 Home (`app/index.tsx`)
- Header: "YOUR VOYAGES" (Oswald) left; settings/accounts icon right (arrives with Phase 4, which wires Accounts).
- **Empty state:** island emoji, "NO CLIPS YET", one-line hint, gold pill **＋ NEW CLIP** pinned bottom-centre.
- **Grid:** two columns of tall thumbnail cards (hairline border, radius 12): duration badge top-right, name and "Edited today / Yesterday / N days ago" over a bottom gradient. The gold pill stays pinned above the safe area. Long-press opens the existing rename / duplicate / delete actions in the new sheet style. Missing-media and error states keep their logic with restyled cards.
- The optional `projectsWallpaper` hook is removed (unused).

### 5.3 Editor (`app/editor/[id]/index.tsx`)
- **Top bar:** back chevron, project name (Oswald, tap to rename as today), gold **EXPORT** pill.
- **Preview** unchanged in behaviour; rounded 10, centred on the gradient. The "Preview" tag is restyled as a small hairline chip.
- **Transport row:** undo · time `0:04 / 0:21` · play/pause (cream circle) · ratio chip · redo.
- **Timeline:** `bgDeep` well; clip strip with a gold selection outline; lanes use the lane tokens; white playhead.
- **Toolbar (two rows):**
  - Group row (always visible): **Edit · Effects · Text · Stickers · Audio**. The active group's tile is gold.
  - Sub-row (above it) shows the active group's tools:
    - Edit: Split, Trim, Duplicate, Delete, Ratio
    - Effects: Filter, Speed, Transition, Templates
    - Text: Add text, Captions
    - Stickers: Add sticker
    - Audio: Music, Volume
  - Enable/disable rules per tool are exactly today's. Selecting a text/caption overlay switches to Text and selecting a sticker switches to Stickers; selecting a clip switches to Edit only when the current group is Text or Stickers (Edit, Effects and Audio all act on the selected clip, so they stay put) (their existing inline panels replace the sub-row as today). The last manually chosen group is otherwise kept for the session.
  - Accessibility: group buttons have role `tab` with selected state; tool buttons keep their current labels so existing tests and VoiceOver flows hold.

### 5.4 Sheets (`src/ui/Sheet.tsx`)
One component for every tool sheet: dim backdrop, `surface` panel with radius 18 top corners and a hairline top border, grab handle, Oswald title with an optional right-aligned action (e.g. "Apply to all"), content area, safe-area padding. Spring-in, swipe-down to close, backdrop tap to close. Selected tiles in grids (filters, templates, fonts, colour swatches, emoji and shapes) use a 2 px gold ring; chip-shaped options (ratios, transition types, resolutions, scope toggles) use the kit `Chip`, whose selected state is a gold fill. Sliders use a gold track and thumb. All existing sheets adopt it without changing their content or logic.

### 5.5 Export (`app/editor/[id]/export.tsx`)
- Resolution choice as three chips; gold **EXPORT** pill.
- While exporting: a circular progress ring (SVG) filling gold with the percentage inside, and a Cancel outline button.
- Finished: check mark in the ring, "READY TO SAIL", `1080p · 0:21 · 14 MB` (file size arrives with Phase 4), then **POST TO…** (gold; arrives with Phase 4), **SAVE TO PHOTOS**, **SHARE** (outline pills).
- The Expo Go "needs the native build" card and error states are restyled, logic unchanged.

### 5.6 Shared kit (`src/ui/`)
`Screen` (gradient background + safe area), `Title`/`Body` text components, `PrimaryButton` (gold pill), `SecondaryButton`, `IconButton`, `ToolButton` (icon tile + label, `active` state), `Chip`, `Sheet`, `Toast`, `ProgressRing`, `Pressable` scale wrapper, `EmptyState`. Phase 4's Accounts and Post screens are built from this kit.

## 6. Error Handling
No new failure modes. Fonts failing to load must not trap the user on the loading screen: after 5 s the app proceeds with system fonts. Haptics and gradient modules are optional at runtime (guarded), so a missing module degrades to no vibration / flat background.

## 7. Testing
- **Jest:** theme token snapshot (names present, old tokens gone); a lint-style test that fails on hex colour literals in `app/` and `src/` outside the allowlist in §3; `LoadingScreen` shows for the minimum time, hands off, and respects the 5 s font timeout and Reduce Motion; home empty state vs grid, relative-date labels; toolbar: five groups, each group's tools, group auto-switch on selection, disable rules preserved; `Sheet` close by backdrop and by swipe; `ProgressRing` values; export screen states. Existing suites stay green with only label/layout assertions updated.
- **Manual (device):** the "Done when" walkthrough, including Reduce Motion on.

## 8. Out of Scope
New features; light theme; iPad/landscape layouts; custom illustrations or photos; sound effects; onboarding tour; Phase 4 screens themselves (they adopt the kit when built); changes to exported video styling.
