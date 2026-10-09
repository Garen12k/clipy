# Clipy · iOS 27 redesign · hand-off (after review 4)

## Which file is the authority
Where two files disagree, the file in this table wins. `original-brief.md` is the authority for behaviour and for every sentence not listed in "Sentences changed" below.

| Part of the app | Authority |
|---|---|
| Colours, type, spacing, symbols, motion | `1 Foundations.dc.html` + tokens in `13 Tokens and Accessibility.dc.html` (T2 wins on numbers) |
| Editor layout, timeline, toolbar, selected clip | `10 Editor v2.dc.html` (A1, A2, B1, C1) |
| Every strip | `11 Strips v2.dc.html` (S1–S3, D1, D2) |
| Every panel, editor messages | `11b Panels and Messages v2.dc.html` (P1, D3) |
| Crop, banner, keyboard states, accessibility in the editor, Blur/Mosaic box, permission rows, camera, notifications, build line | `14 Review 4.dc.html` (R1–R9) |
| Sign-in, Post, Accounts, dialogs | `12 States v2.dc.html` (E1–E4, E7) |
| Launch, Home sheets, project menu, Export | `5 Screens.dc.html` |
| Home | `2 Home.dc.html` |
| Wizard, permission explanations | `4 Wizard and Permissions.dc.html` (rows: R6 wins) |
| Component library, states, system vs custom | `3 Components.dc.html` + T5 in `13 Tokens…` |
| App icon | `9 App Icon.dc.html` + `icon-layers/*.png` |
| Clickable journey | `8 Prototype.dc.html` (illustrative; the boards win) |

Parts used by the boards (their logic holds the exact geometry): `EditorPhone2`, `Toolbar`, `ScreenPhone`, `HomePhone`, `WizardArt`. Open any `.dc.html` in a browser with `support.js` beside it.

## Editor layout
| Device | Timeline cap | Rows under the clip row | Preview | Panel |
|---|---|---|---|---|
| 375 × 667 | 172 | 2.5 | 301 pt | 240 |
| 402 × 874 | 212 | 3.5 | 394 pt | 280 |
| 440 × 956 | 252 | 4.5 | 444 pt | 320 |

- From top to bottom: status → 44 header → preview → 44 transport → timeline → 4 → 64 toolbar → inset 8 / 34 / 34. Preview bottom = min(transport top − 4, keyboard-with-suggestions top − 40 − 2). On 440 pt the empty band is given to the timeline (4.5 rows), which costs 14 pt of preview.
- Lanes: 40 pt with 30-pt bars; each bar's touch area is 44 pt and the nearest bar centre wins. Each cap ends on a half row.
- Strips: S 96 / M 120 / L 168, bottom-aligned with the toolbar. One height per strip across tabs, notes and statuses. Status blocks: 76 pt (three lines at 375 pt) or 96 pt. A short title always shows; tabs sit beside it, or in the lead of the tile row (Animation).
- Text in strips grows up to the largest standard size (× 1.16), then stops; the large-content viewer takes over.
- Panels replace the timeline and the toolbar only, open and close without animation; compact panels fit 240 pt without scrolling.
- Typing: a 40-pt bar on the keyboard holds the field (R3). Preview unchanged.

## Selected clip
- Top 3 pt: copy progress. Top-left: badge (hidden under 100 pt). Top centre: Move pill 32 × 16 (touch-and-hold under 88 pt). Bottom 12-pt band: beat ticks and keyframe diamonds (44-pt target).
- Trim handles 16 pt visual, 44 × 44 target. Cut markers at the selected clip's cuts move 10 pt outward beside the handle and win inside their 24-pt disc. Markers hide only when cuts are closer than 44 pt.
- Touch order: trim handle → marker disc → keyframe → Move → clip.

## Toolbar
- Back · group button (52 × 56, symbol over "Basics ⌄", system menu) · tools · Delete. At 375 pt four tools show beside it.
- Groups, no tool twice: Basics (Split, Trim, Speed, Volume, Filter, Cut out, Stabilize, Select) · Edit (Transition, Keyframe, Duplicate, Replace, Reverse, Freeze) · Audio (Extract audio, Voice, Sound) · Look (Adjust, Templates, Animate, + Motion on photos) · Frame (Crop, Transform, Opacity, Mask, Background, Green screen; layers: Blend instead of Background).
- Reversed clip: no Volume, Extract audio, Voice, Sound, Cut out, Stabilize. Clip with Remove background or Stabilize on: no Reverse. Layer: no Templates or Background; Forward, Back, Blend added. Collage cell: the layer's tools with Collage first.
- Flat rows: main, empty, audio, text, text / caption / sticker, sound bar (Volume, Fade first), effect, multi-select ("✓ 3 selected", Speed, Volume, Filter visible, Delete and Done pinned). The group resets to Basics on each new selection.

## Gold and main actions
Gold fill = the one action that completes the screen or sheet (Export, Create, Choose Photos and Videos, Get Started / Continue, Send Code, Sign In, Post, Post to…, Start Editing, Crop's Done). Never gold: anything in a strip or panel, Apple's button, destructive actions, the notification card. A panel's main action is filled in the label colour (white on dark, black on light). Light appearance: every ring, line, value and status symbol uses `#8B5F00`.

## Messages
Four kinds (D3). The confirmation banner sits in the transport row, two lines, no shadow, until the next edit or Play, with Undo / Try Again / Open Settings / Show (R2). No toasts.

## Tokens, symbols, motion, components
Tokens: T2. Custom symbols `clipy.stabilize`, `clipy.fade`: T3. Accessibility: T4 and R4. All 36 components plus Crop, marked system or custom: T5. Motion: beside the video ≤ 250 ms, opacity/position only; wizard pages ≤ 5 s, each with a drawn Reduce Motion still (5e).

## New features (labelled "New feature" on boards only, never in the interface)
Wizard · permissions page and Accounts section · Take Photo or Video (editor "+" and New Project menus) · notification card on export · optional Live Activity (not drawn) · light appearance · time ruler · waveforms · cut markers · preview corner handles · tappable Preview tag · project-name menu · card More button · "Posted · …" · one-time Post callout · confirmation banner in the transport row with Undo and Show · Cancel on Remove background, Stabilize, Smooth slow motion, sound copies, beat listening · percent on sound copies (none on beat listening) · custom-colour pill · current-look mark · Crop size readout and refusal reason · group button · tab dots · Volume / Fades tabs · Strength inside the Reduce noise row.

## Sentences changed (new beside original)
| Original | New |
|---|---|
| Your voyages | Projects |
| Apply to all clips · Apply to all · Apply to all photos | Apply to All |
| f · ◀ (badges) | filter name · Reversed |
| {Tools} need the latest Clipy build. Install it from the newest build link. (4 variants) | {Tool} needs the newest Clipy build. Everything else in Clipy still works. |
| For your own music, Find beats needs the latest Clipy build. … | For your own music, Find beats needs the newest Clipy build. Until then, tap the beat with Tap. |
| Captions need the native build / Transcription runs on your iPhone … | Captions needs the newest Clipy build. Everything else in Clipy still works. |
| Preview only — captions need the full app build | update case: Captions needs the newest Clipy build. … · no-captions case: Preview only — this project has no captions yet. |
| Export needs the native build / … | Export needs the newest Clipy build. Everything else in Clipy still works. |
| Apple sign-in works in the installed app, not in Expo Go. | Sign in with Apple needs the newest Clipy build. Everything else in Clipy still works. |
| App build: … / Expo Go (no video engine) | Build: Blur and cuts · Stabilize and smooth · Beats and background · Noise, ramps and speech · Sound tools · Export only (older) · Test version (no video engine) |
| Clipy's server is asleep or unreachable. Open the Supabase dashboard to wake it, then try again. | Clipy's server is asleep or unreachable. Try again in a few minutes. |
| … Until Clipy's Facebook app is switched to Live, the Reel may be visible only to you. | On Facebook the Reel may be visible only to you for now. |
| Clipy's server hasn't been connected, so signing in and posting don't work yet. You can still share … | Posting doesn't work in this version yet. You can still share with the Share button. |
| Uses on-device speech recognition. Clips: N | Uses on-device speech recognition in {language}. Clips: N — {k} of them have no sound and will be skipped. |
| CC0 | Free to use |
| You have reached the audio track limit. | You've reached the audio track limit. |
| Smooth (Curve tab) | Smooth curve |
| Sticker (picker title) | Add Sticker (suggestion) |
| Zooms in a little | Zooms in a little: about 5 %, 10 % or 15 %. |
| Current speed: (unchanged) · "Smooth slow motion" switch | adds subtitle "Makes the slowed picture fluid" |
| Align left / Align center / Align right | Left / Centre / Right (segmented, VoiceOver keeps the long names) |
| — (new) | Picking a Combo removes In and Out, and the other way round. A Combo has no length. |
| — (new) | For a photo, Combo offers only None, Sway and Pulse — unless the photo already has one of the others. |
| — (new) | In, Out and Loop are independent. Loop has no length. |
| — (new) | Pick a filter to set its strength. · Pick an animation to set its length. · Pick a transition to set its length. · Pick a motion to set its strength. · Turn on Remove to pick a colour. |
| — (new) | A new run replaces all captions. Undo brings them back. |
| — (new) | Select a clip to use This clip. |
| — (new) | Files over 50 MB ask before adding. |
| — (new) | Loading the picture · This picture is too short to hold 16:9 once it is cropped this tall. Make the box wider first. |
| — (new) | You'll get a notification when it's done. |
| — (indicators had no words) | Preparing the sound: 40 % · Listening to {title} · Making the collage · Adding {file} · Signing in with Apple · Sending · Signing in · Loading voices · Preparing the voice |
| Open Settings to allow it. (toast) | banner with Open Settings |

## Developers must confirm
1. Glass over the moving timeline performs; otherwise ship solid (drawn).
2. Keyboard heights with suggestions (260 / 336 / 346).
3. The system photo picker works one pick at a time with Photos access off or limited.
4. Take Photo or Video uses the system camera; Microphone is asked only when video recording starts.
5. Notification alert wording comes from the system.
6. All system metrics from the iOS 27 kit; every SF Symbol name in the SF Symbols app.
7. Live Activity is optional and not drawn.
