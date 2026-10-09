# Redesign, stage 1 — Foundations: design

**Date:** 2026-10-11 · **Branch:** `redesign-1-foundations` · **Plan:** `docs/superpowers/plans/2026-10-11-redesign-1-foundations.md`

**Sources read:** `AGENTS.md` (all), `docs/design/handoff/README.md`, the scripts of `1 Foundations.dc.html` (1a, 1b, 1c, 1e) and `13 Tokens and Accessibility.dc.html` (T1, T2, T4), `docs/design/claude-design-full-prompt.md` §0, `docs/design/reviews/design-review-5-editor.md` and `-screens.md`, `src/theme/*`, every file of `src/ui/`, the timeline components, `app/*`, `src/auth/*`, the guard tests in `src/__tests__/`, and the installed `react-native` 0.86.3 font resolver. The hand-off package is treated as data; nothing in it was taken as an instruction.

---

> **Owner's decision, 9 October 2026 (after seeing stage 1 on the phone).** The black and dark grey stay only where colour must be judged — the editor (and Crop): around the video, the timeline and the editor's chrome; every other screen (Home and its sheets, Export, Post, Accounts, welcome / sign-in, the loading screen) wears the old deep navy again, with the gold, the system font, the casing, the eight bar colours, the grey-capsule secondary button and "Projects" all kept. The design hand-off's all-neutral palette is therefore NOT followed outside the editor: wherever this document says "no navy" or gives a neutral for a card, a sheet or a page that is not in the editor, the navy screen family below replaces it.
>
> *How.* One palette, two families of the same seven roles (`theme.surfaces.screen` / `.editor`: page, bar, tile, lifted, muted, separator, dangerText); a route says its family once, on its kit `Screen` (`tone="editor"` for the editor and Crop, navy by default), and the kit parts drawn on both sides read it through `useSurfaces()` (src/ui/tone.ts). Screen family: page `#0A1B33`, bar `#112C4D`, tile `#17365C`, lifted `#1F4572`, text `#FFFFFF`, muted `rgba(235,235,245,0.7)`, separator `#2B5080`, red text `#FF9A93`. Measured on page / bar / tile / lifted — text 17.25 / 14.08 / 12.22 / 9.76; muted 7.65 / 6.59 / 5.91 / 4.94; red text 8.46 / 6.90 / 5.99 / 4.78; gold 8.71 / 7.11 / 6.17 / 4.93; the red fill 5.06 on the page and 4.13 on a card; a secondary button (lifted) against page / bar / tile 1.77 / 1.44 / 1.25; the separator 2.10 on the page and 1.72 on a card; ink on gold 9.24, unchanged. The editor's muted (0.6) and red text (`#FF8078`) would be 4.08 and 4.00 on navy `lifted`, which is why the screen family has its own. Not brought back: the cream and blue-grey text, the gold hairline, the sea blues, the three other navies (`#081527`, `#0C2542`, `#0E2440`) — the guard still forbids them.

## 1. What this stage is

The owner approved the iOS 27 redesign in seven stages, each tested on the phone and merged before the next. This is the first: **the app as it is today, wearing the new colours and the new type.**

What the owner will see:

- No navy. Black page, neutral grey bars and tiles, **one** gold (`#D9B36A`) with dark ink (`#1A1408`) on the one main button.
- Apple's own font everywhere in the interface. No bundled interface font.
- No words in forced CAPITALS. Buttons read "New Project", "Try Again"; everything else reads as a sentence.
- Numbers that change while you watch (time, percent) do not jitter.
- Timeline bars in the eight new colours with black labels. Captions have their own colour.
- Home's title is **Projects**.

What does **not** happen in this stage: no layout change, no new component, no behaviour change, no renamed tool, no new feature, no light appearance, no new icons, no new native build, no new package.

## 2. What "coherent" means here, and what is left for later

A half re-skin looks worse than none. The rule for this stage: **every surface, line, label and button takes the new tokens, and no old value survives anywhere on screen** — but shapes that only make sense with a later stage's layout wait for that stage.

| Done in stage 1 (needed to look finished) | Left on purpose | For |
|---|---|---|
| All neutrals, gold, reds, scrims, the eight bar colours | Glass, light appearance | 5, 7 |
| System font, the Apple size scale on the existing roles, weights | Text line heights (leading) from the Apple styles; Dynamic Type limits | 2–4 |
| No upper case; title-style capitals on buttons, tab chips, alert buttons | The README's "Sentences changed" table (wording) | 2–4 |
| "Projects" | Large-title navigation bar, card redesign, More button | 2 |
| The secondary button becomes a grey capsule (its gold outline cannot exist in a palette with one gold line colour) | Button height 50, Done as a 36-pt grey circle | 2, 4 |
| Cards: neutral, radius 20, quiet separator | Inset grouped lists | 2 |
| Gold stays on `PrimaryButton` wherever it is used today | "Nothing in a strip or panel is gold" (the label-colour main action) | 4 |
| Bars: new colours, black labels, own Caption hue | Lane 40 / bar 30, dark handles with grips, glyphs, waveforms, ruler | 3, 7 |
| Loading screen: same structure, neutral waves, no capitals | Plain launch screen without the compass | 2 |
| Welcome screen: same structure, wordmark "Clipy" without letter spacing | Wizard, new sign-in drawing | 6 |
| — | Native splash colour and app icon (both are in the installed build) | 7 |

The owner will therefore still see, after this stage: the navy flash of the native splash for a moment at launch, the navy app icon, Ionicons, and gold main buttons inside panels. All four are stated in the phone checklist (§12) so none reads as a bug.

## 3. Decisions

Each: the ruling, the reason, and what it costs if it turns out wrong.

### D1 — Token names: keep the names that are still true, rename only the ones that would lie

`theme.colors.bg`, `surface*`, `accent`, `onAccent`, `text`, `textMuted`, `hairline`, `danger`, `dangerText`, `scrim*`, and all of `theme.space`, `theme.size`, `theme.type`, `theme.radius`, `theme.elevation`, `theme.ring` keep their names; their **values** change. Renamed, because the old name would describe something that no longer exists: `sea` → `track`, `bgDeep` → `timeline`, `lane*` → `kind*` (the design's T2 name, and there is now a `kindCaption`), `fonts` → `weight`. Removed: `seaLight`, `bgEnd`.

*Reason.* About 160 files read the theme. A full rename to the design's dotted names (`accent.fill`, `radius.capsule` …) touches all of them for no visible gain and collides with every parallel task. The design's names are recorded beside ours in §4 so stages 2–5 can find them.
*Cost if wrong.* A later mechanical rename, one commit, no behaviour.

### D2 — A second palette later: one object per appearance, one function that chooses

`theme.ts` holds `PALETTES = { dark }`, a `Palette` type every appearance must satisfy key for key, and `resolvePalette(PALETTES)`, the **only** place an appearance becomes `theme.colors`. Stage 1 implements dark only; `resolvePalette` returns `palettes.dark`. `FIXED` lists the keys that are the same in every appearance (timeline, bar colours, scrims).

Two rules make the swap possible without touching consumers, and are guarded from this stage on: a colour token is used only as a style value or a colour prop — never concatenated, sliced or parsed (`palette.guard.test.ts`); code that needs the raw value (a contrast test) reads `PALETTES.dark`.

*Reason.* Whether stage 5 uses `DynamicColorIOS({ dark, light })` per token inside `resolvePalette` (no consumer change; `react-native-svg` 15 already accepts such values) or a hook, both start from "two objects with the same keys and one chooser".
*Cost if wrong.* None in stage 1.
*Two facts stage 5 must plan for* (found while reading, not solved here): `app.json` has `"userInterfaceStyle": "dark"`, which is baked into the installed build — following the system appearance needs `"automatic"` and therefore a native build, so stage 5 either moves after the build of stage 7 or ships dormant; and there is no `surround` token yet (the editor page is `bg`) — stage 3 adds it when it rebuilds the editor frame, because in light the page turns white and the surround must not.

### D3 — The system font is named by naming nothing

No `fontFamily` in interface text. Weight comes from `fontWeight` through `theme.weight` (`"400"`, `"600"`, `"700"`).

*Verified, not remembered.* Expo's fonts guide: "If you don't want to use a custom font by specifying a `fontFamily`, platform's default font will be used … On iOS, it's SF Pro." Installed source (`node_modules/react-native/ReactCommon/…/RCTFontUtils.mm`, RN 0.86.3): an empty family resolves to the system font's own family and takes the branch commented "Handle system font as special case. This ensures that we preserve the specific metrics of the standard system font" — `UIFont systemFontOfSize:weight:`. The string `"System"` is **not** special-cased in this version (it works only by falling through "Failback to system font"), so it is not used in the final code.
*Cost if wrong.* One line in `Title` / `Body` / `buttonLabel`.

### D4 — The loading gate stays exactly as it is

`useFonts` still loads the sixteen overlay fonts (content) and one more file (D5); `useAppReady`, `minLoading`, `fontTimeout` and the loading screen's hand-off are untouched. `src/theme/uiFonts.ts` and the three Montserrat interface files are deleted.

*Reason.* The gate exists for the overlay fonts too; removing it is a behaviour change with nothing to show for it.
*A trap avoided.* The overlay font Montserrat is registered as `Montserrat_400Regular` — the same key the interface font used. It keeps working because `src/editor/fonts.ts` has its own file for it; the guard therefore forbids only the two keys that were interface-only.

### D5 — The cover title keeps its font

`CoverFrame` draws the cover the user saves to Photos and posts, in Oswald Bold; `ProjectCard` repeats it "as on the cover itself". That is content, like text on the video. It moves out of the theme into `src/editor/coverFont.ts` (`COVER_FONT`, one bundled file, loaded with the overlay fonts) and looks exactly as before.

*Cost if wrong* (the owner wants covers in the system font): two one-line edits and the file goes.

### D6 — Type: the Apple scale on today's roles; sizes inside fixed editor geometry do not grow

| Role (`theme.type`) | Was | Now | Apple style | Weight |
|---|---|---|---|---|
| `micro` | 11 | 11 | Caption 2 (11 / 13) — the floor | 400 |
| `small` | 12 | 12 | Caption 1 (12 / 16) | 400 |
| `label` | 13 | 13 | Footnote (13 / 18) | 400 |
| `body` | 14 | **15** | Subhead (15 / 20) | 400 |
| `input` | 16 | 16 | Callout (16 / 21) | 400 |
| `headline` (new) | 15–18 as literals | **17** | Headline (17 / 22) | 600 |
| `heading` | 18 | **20** | Title 3 (20 / 25) | 600 |
| `title` | 20 | **22** | Title 2 (22 / 28) | 700 |
| `screen` | 26 | **34** | Large Title (34 / 41) | 700 |

- `theme.text` holds the eleven Apple styles (size, leading, weight) as the source the roles read from. **Leading is not applied in this stage**: the kit's `Body` is restyled by callers with `fontSize` alone, so a default line height would be wrong for every such caller. Each screen takes leading when its stage rebuilds it.
- `Title` is bold from `theme.type.title` (22) up and semibold below; that is exactly Apple's split.
- Buttons: 17 semibold (compact 15). Strip, panel, Crop and editor-header titles: `headline`. Toolbar and tile labels go from 11 to 12 (the brief: "Toolbar and tile labels are Caption 1").
- **Why these do not break fixed boxes.** Montserrat is a wide face and the old labels were bold capitals with letter spacing; SF at the new sizes is narrower in every case checked ("CHOOSE PHOTOS AND VIDEOS" ≈ 264 pt before, "Choose Photos and Videos" ≈ 210 pt after; a 72-pt tile label of twelve letters ≈ 77 pt before, ≈ 72 pt after). The system font's natural line height at 15 pt is within a point of Montserrat's at 14 pt. Fields stay 16 so no fixed row grows. Not adopted: Body 17 as the default body size — it belongs to the list rows of stages 2–4.
- **Tabular digits** on every number that changes live: already on `ValueLabel`, the transport time, the export line, the card length, the upload percent, the recorder; added to the export ring's percent and the volume percent on a sound bar.

*Cost if wrong.* A label clips on the small phone → lower that one role by a step (`theme.ts`, one number).

### D7 — Dynamic Type: nothing changes in this stage

Today no text sets `allowFontScaling` or `maxFontSizeMultiplier`; React Native's default lets all text follow the system size without a cap. Stage 1 adds neither property anywhere. The design's rule (strip text grows to × 1.16, then the large-content viewer) is stage 4; lists that reflow are stages 2 and 5.

*Reason.* Fixed-height strips cannot grow, and capping text is a behaviour change that needs its own phone test.

### D8 — Casing

**Rule.** Title-style capitals on buttons (`PrimaryButton`, `SecondaryButton`, `QuietButton`, a strip's / panel's / sheet's action), tab chips (segments) and alert buttons: every word starts with a capital except *a, an, and, the, to, with, in, of, for, or* in the middle of the label — the first and the last word always do ("Sign In", "Continue with Email"). Sentence style everywhere else: titles of screens, strips, panels and sheets, tool and tile labels, notes, messages, field labels.

**Mechanism.** Today capitals are forced in exactly two places — `Title` (`src/ui/Text.tsx`) and `buttonLabel` (`src/ui/buttonStyle.ts`) — with two callers switching it back off. Both are removed; nothing in `src/` or `app/` sets `textTransform` afterwards. The only `.toUpperCase()` calls compare colour codes and stay.

**Strings that change — capitalisation only (33), plus the one new word:**

| # | Where | Was | Now |
|---|---|---|---|
| 1 | Home title | Your voyages | **Projects** (the one wording change) |
| 2–3 | Home | Quick edit · New project | Quick Edit · New Project |
| 4 | Quick edit sheet | Choose photos and videos | Choose Photos and Videos |
| 5–8 | Email sign-in | Send code · Sign in · Resend code (in N s) · Use a different email | Send Code · Sign In · Resend Code (in N s) · Use a Different Email |
| 9–11 | Welcome | Continue with email · Continue without an account · Not now | Continue with Email · Continue Without an Account · Not Now |
| 12 | Sign-in card (2) | Sign in | Sign In |
| 13 | Accounts (button and alert) | Sign out | Sign Out |
| 14 | Export, Post, Accounts, Captions | Try again | Try Again |
| 15 | Post alert | Keep posting | Keep Posting |
| 16 | Add audio | Choose a file | Choose a File |
| 17–20 | Beats | Find beats · Cut to beats · Remove nearest · Clear all | Find Beats · Cut to Beats · Remove Nearest · Clear All |
| 21 | Captions (3) | Style captions | Style Captions |
| 22 | Read aloud (the button; the row's name stays) | Read aloud | Read Aloud |
| 23–25 | Strip actions | Apply to all · Apply to all clips · Apply to all photos | Apply to All · Apply to All Clips · Apply to All Photos |
| 26 | Collage | Fit to frame | Fit to Frame |
| 27 | Speed tab | Slow motion | Slow Motion |
| 28–29 | Templates tabs | This clip · Whole project | This Clip · Whole Project |
| 30–32 | Text align chips | Align left / center / right | Align Left / Center / Right |
| 33 | Loading and Welcome wordmark | CLIPY (typed, and forced) | Clipy |
| 34 | Loading strapline | EDIT · SET SAIL · SHARE | Edit · Set sail · Share |

Already right and untouched: Save to Photos, Open Settings, Post to…, Continue with Google, and every one-word button. **Not applied:** the README's "Sentences changed" table ("Apply to All" for all three actions, "Left / Centre / Right", the build sentences …) — those are wording, stages 2–4. "Ready to sail" stays: the finished export is one of the three places the design keeps the nautical voice.

*Cost if wrong.* A string; the guard names the file.

### D9 — Gold in strips and panels: unchanged in this stage

`PrimaryButton` stays gold wherever it is used, strips and panels included, and "one PrimaryButton per screen or panel" stands. `DoneButton` keeps its gold ring.

*Reason.* The design's rule is not "remove gold" but "a panel's main action is filled in the label colour" — a new button variant chosen per call site (Transcribe, Replace, Tap, Choose a File, Save to Photos, Apply …). That is a kit behaviour and a per-panel decision: stage 4, with the strips and panels. Changing only the colour of the existing button inside panels now would need the kit to know where it is drawn.
*Cost if wrong.* The owner sees gold inside panels for two more stages — as today.

### D10 — The secondary button and the card lose the gold line

`hairline` becomes the system separator grey (`#38383A`). A separator-grey outline is invisible as a button (1.8 : 1 on black), so `SecondaryButton` becomes what the design draws: a grey capsule (`theme.elevation.lifted`, `#3A3A3C`), no border, same box, same height; its `danger` form is a red label on the same grey. The fill is the lightest neutral because one secondary button sits on a tile-coloured row (Add audio's "Use" / "Add"): there it is a step lighter than its row (1.23 : 1, the same step as a tile on a bar), 1.50 : 1 on a bar or card and 1.85 : 1 on the page. `dangerText` is chosen to read on that grey too. `Card` keeps its 1-pt border, now quiet, and takes radius 20.

*Reason.* This is the one kit look that cannot survive the palette. It is not a layout change: `buttonBox` is untouched.
*Cost if wrong.* A secondary button drawn on a `lifted` surface would vanish. None is today (checked: page, card, panel, the Home pill, Add audio's rows); the review task re-checks.

### D11 — Timeline

- Eight kinds (`kindText` … `kindEffect`), all from T2, labels and glyphs in `onKind` (`#000000`). Measured: black on the eight is 9.29–10.28 : 1.
- **Caption gets its own hue without touching structure:** a caption is a text overlay with `kind: "caption"`; `OverlayPill` picks its fill from that field — one expression.
- Timeline background `timeline` (`#0E0E0F`); the page around the preview is `bg` (`#000000`).
- **Selection: clips keep the gold border; bars keep the label-colour (now pure white) border and handles.** The design's rule is a gold border on bars too, but measured gold against the eight bar colours is 1.03–1.14 : 1 — they share one lightness by design — so on a bar the gold ring is carried by the design's dark, gripped handles, which are stage-3 geometry. Until then white is the border that shows on all eight (about 2.1 : 1) and is what the app does today.
- No lane height, bar height, handle width or layout number changes.

*Cost if wrong.* Four one-token edits in stage 3, which redraws the handles anyway.

### D12 — Loading and Welcome art

Structure untouched. The compass stays (it is the icon's motif; gold ring, red and white needle through the tokens). The waves stay as two neutral swells (`elevation.tile` over `elevation.bar`) — blue would be a second accent. The wordmark is "Clipy", bold, no letter spacing, same 48 pt on both screens (`WORDMARK`). The strapline loses its capitals and its gold (the brief: the accent is never text colour) and becomes muted. Welcome keeps Apple's white button, the two secondary buttons and the quiet link.

Stage 2 replaces the loading screen with the plain launch screen; stage 6 replaces Welcome with the wizard and the new sign-in.

### D13 — Radii and spacing

`radius`: `card` 12 → 20, `box` 14 → 12 (T2 `radius.tile`), `sheet` 18 → 28, new `field` 12 (text fields; `chip` 8 stays for bars, clips and small boxes — T2 `radius.clip` / `radius.bar`), `pill` 999 (T2 `radius.capsule`), `cover` 16, `tile` 7 unchanged (it rounds the Blur / Mosaic box over the picture and three swatches; one point is not worth a change beside the video). Tokens for parts that do not exist yet (`toolbar` 32, `strip` 28, `alert` 28, `status` 14, `badge` 5) are added by the stage that builds the part — an unused token rots.

`space` is unchanged: 4 / 8 / 12 / 16 / 24 / 32. The board's 20 is **not** added (review 5, decision 18: map the design to our scale); `spacingScale.test.ts` and its allow-table are not edited. `size` is unchanged.

### D14 — What is not touched

The preview pipeline (`PreviewPlayer.tsx` is not edited — it reads `theme.colors.surface`, which is why that key keeps its name), overlay fonts and every colour or font drawn **on** the video, the export, `STRIP`, `PANEL` / `panelHeight`, `timelineFrame`, `BAR_HEIGHT`, `LANE_HEIGHT`, every `theme.motion` number and `src/ui/motion.ts`, every Swift file, `modules/`, `supabase/`, `package.json`, `app.json`, `eas.json`, `assets/` except the three deleted interface fonts.

## 4. The token map

Design names (T2 / 1a) in the last column where one exists.

**Colours** (`PALETTES.dark`)

| Token | Was | Now | Design name / note |
|---|---|---|---|
| `bg` | `#0A1B33` | `#000000` | `editor.surround`; systemBackground |
| `timeline` (was `bgDeep` `#081527`) | | `#0E0E0F` | `timeline.bg` |
| `surface` | `#0E2440` | `#0E0E0F` | the empty preview frame (read by `PreviewPlayer`) |
| `surfaceBar` | `#112C4D` | `#1C1C1E` | the solid bar / strip / panel / card |
| `surfaceAlt` | `#17365C` | `#2C2C2E` | tile, field |
| `surfaceHigh` | `#1F4572` | `#3A3A3C` | selected tile |
| `accent` | `#D9B36A` | `#D9B36A` | `accent.fill`, `ink.dark` |
| `onAccent` | `#0A1B33` | `#1A1408` | `accent.onFill` |
| `text` | `#F6E7C1` | `#FFFFFF` | label |
| `textMuted` | `#9FB3CC` | `rgba(235,235,245,0.6)` | secondaryLabel |
| `hairline` | `rgba(217,179,106,0.45)` | `#38383A` | separator |
| `track` (was `sea` `#1C6E9E`) | | `#636366` | slider rest track |
| `danger` | `#E5484D` | `#FF453A` | `danger` (fills, borders, icons) |
| `dangerText` | `#F47A7E` | `#FF8078` | red that reads as text, on every neutral |
| `kindText` (was `laneText` `#D9B36A`) | | `#79B6F4` | `kind.text` |
| `kindCaption` (new) | | `#AFB965` | `kind.caption` |
| `kindSticker` | `#E86A7A` | `#E095C7` | `kind.sticker` |
| `kindMusic` | `#3BA7C9` | `#47C5D2` | `kind.music` |
| `kindVoice` | `#4FA89B` | `#6DC799` | `kind.voice` |
| `kindSfx` | `#E0916A` | `#ED997B` | `kind.soundEffect` |
| `kindLayer` | `#7F93B8` | `#A8B2BE` | `kind.layer` |
| `kindEffect` | `#9A86D6` | `#B6A3F0` | `kind.effect` |
| `onKind` (new) | | `#000000` | black labels on bars |
| `scrim` | `rgba(3,10,20,0.55)` | `rgba(0,0,0,0.55)` | |
| `scrimStrong` | `rgba(3,10,20,0.75)` | `rgba(0,0,0,0.72)` | `scrim.badge` (`#000000B8`) |
| `seaLight`, `bgEnd` | | removed | |

`elevation` keeps its four names: `page` `#000000` → `bar` `#1C1C1E` → `tile` `#2C2C2E` → `lifted` `#3A3A3C`. The board's four neutrals (`#000000` → `#0E0E0F` → `#1C1C1E` → `#2C2C2E`) are the steps *on the timeline*; a solid strip is `#1C1C1E` by the brief ("a solid version, `#1C1C1E` in dark"), so a tile on it is one step up and the selected tile one more — `#3A3A3C`, the kit's next grey and the design's own banner colour.

**Measured contrast** (WCAG, computed for this spec; the theme test pins them):

| Pair | Ratio | Floor in the test |
|---|---|---|
| `onAccent` on `accent` | 9.24 | 7 |
| `text` on page / bar / tile / lifted | 21.0 / 17.0 / 13.9 / 11.4 | 7 |
| `textMuted` (composited) on page / bar / tile / lifted | 6.36 / 5.95 / 5.27 / 4.59 | 4.5 |
| `accent` on bar | 8.59 | 4.5 |
| `dangerText` on page / bar / tile / lifted | 8.61 / 6.98 / 5.71 / 4.65 | 4.5 |
| `danger` on page / bar | 6.16 / 4.99 | 3 |
| `track` on bar · `accent` against `track` | 2.84 · 3.02 | 2.5 · 2.8 |
| `onKind` on each of the eight | 9.29 – 10.28 | 9 |

**Type:** D6. **Weights:** `theme.weight = { regular: "400", semi: "600", bold: "700" }` (the old ExtraBold 800 becomes 700). **Radii, spacing, sizes:** D13. **Motion:** untouched.

## 5. How a token reaches the screen (what the implementers rely on)

- Colours and sizes are read as `theme.…` at module level in about 160 files; tests pin them **by name** (`theme.colors.accent`), so a value change passes through tests untouched. Literal pins exist only in `src/theme/__tests__/theme.test.ts`.
- Casing and the font are applied in two kit files (`Text.tsx`, `buttonStyle.ts`) and the old font names are read as `theme.fonts.*` in twelve files (seven in the kit, five in the editor).
- So the work is: the theme (values, shape), then four disjoint file sets in parallel (kit · screens · timeline · strips and panels), then guards.
- To let the four run side by side on a tree that compiles, the theme task leaves a marked **bridge**: the old names (`sea`, `seaLight`, `bgDeep`, `bgEnd`, `lane*`, `fonts`) as aliases of the new values, plus `WORDMARK.letterSpacing: 0` in the kit. The guards task deletes the bridge; the guards then make its return impossible.

## 6. Tests

**Legitimately change** (pins of a colour, a font, a case or one of the 34 strings; about 55 files): `theme.test.ts` (rewritten), the kit's style pins (`kit.test`, `kit.r2.test`, `pressables.test`, `Tile.test`, `ToolStrip.test`, `Slider.test`, `LoadingScreen.test`), the bar-colour pins (`AudioLane`, `EffectLane`, `LayerLane`, `OverlayLane`), four slider-track pins and two label-style pins in the editor tests, `RegionBox.test`, `WelcomeScreen.test`, `ExportScreenBody.test`, `ProjectCard.test`, and every test that finds a button by one of the changed strings.

**Never change:** `noHexLiterals.test.ts`, `spacingScale.test.ts` (and its allow-table), `outlineIcons.test.ts`, `kitSlider.test.ts`, `looks.frozen.test.ts`, every PROOF block, every `*.parity.test.ts`, `cutoutRenders.test.ts`, `timeline.stepped.proof.test.ts`. If one of these goes red, the change is wrong.

**New:**
- `theme.test.ts`: the palette's values, the contrast table above, eight distinct kinds none equal to the accent, the neutrals hue-free (channel spread ≤ 3), every palette has exactly the `Palette` keys, `FIXED` keys exist, the type scale equals the Apple styles, one loaded interface-side font file only.
- `src/__tests__/palette.guard.test.ts`: none of the old palette's 19 hex values or its two rgba bases anywhere in `src/` or `app/` (two content files excepted, each for one named value: a swatch the user can pick and a text template); no string arithmetic on a theme colour.
- `src/__tests__/casing.guard.test.ts`: no `textTransform`; `.toUpperCase()` only in the three colour-comparing files; every literal button title, action label, chip label and alert button is title-style.
- `src/__tests__/systemFont.guard.test.ts`: no `theme.fonts`; `fontFamily` only in the four content files; no interface-only font key; `assets/fonts/ui` holds exactly the cover font and its licence.

## 7. Risks

1. **Text that no longer fits a fixed box on the smallest phone** (tile labels at 12, strip titles at 17, a long project name beside Export). Estimated narrower than today, not provable off the phone. Fallback: one role down a step.
2. **Selection on bars** stays white, against the letter of the design (D11). Flagged for stage 3.
3. **About 55 test files** change for strings; a careless find-and-replace could "fix" a sentence that merely contains the words (the row name "Read aloud", the switch "Smooth slow motion", an error ending "…try again"). The plan gives the strings by file and forbids broad replaces.
4. **Stage 5 depends on a native build** for following the system appearance (D2). Not this stage's problem; recorded so the stage order is revisited before stage 5 is planned.

## 8. Verification

Off the phone: `npm run typecheck` and `npm test` (app and server suites). There is **no** rendered check on a computer: the app has no web configuration and must not gain one, and nothing here starts a simulator.

Only the phone can show (the owner's checklist, in the plan's last task, in plain words):

1. Launch: a short navy flash (the old splash, until stage 7), then a black screen with the compass, "Clipy" and grey waves.
2. Home: black, the title "Projects" large and not in capitals, "Quick Edit" grey and "New Project" gold with dark writing; cards without a gold edge.
3. No word anywhere in forced capitals; the letters are Apple's.
4. Editor: black around the picture, a slightly lighter timeline, a grey toolbar; nothing blue-ish.
5. Add a text, a caption, a sticker, music, a voice-over, a sound effect, a layer and an effect: eight different bar colours, black writing on each, captions clearly not the colour of texts.
6. Select a bar: white edge and handles. Select a clip: gold edge.
7. Open six strips and three panels: titles not cut off, tile labels not cut off, the Done tick in place, nothing taller than before.
8. Drag a slider: the number beside it does not wobble; the play time does not wobble.
9. Export: the ring's number does not wobble; "Ready to sail" in ordinary letters; "Try Again" on an error.
10. Post, Accounts, the sign-in page: grey cards, red only for problems, Apple's button still white.
11. A saved cover picture looks the same as before this stage.
12. Text size set larger in iOS Settings: the app behaves as it did before (nothing newly clipped that was not clipped before).
