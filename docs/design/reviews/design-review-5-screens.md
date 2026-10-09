# Design review 5 — screens outside the editor, states, wizard, permissions, prototype, app icon

Package: `design-zip-5/design_handoff_clipy_ios27/`. Source read in full, nothing rendered: `README.md`, `review-4.md`, `original-brief.md` (sections 0, 3.10–3.12, 7, 8, 9, 15, 16), `5 Screens`, `ScreenPhone`, `12 States v2`, `2 Home`, `HomePhone`, `4 Wizard and Permissions`, `WizardArt`, `14 Review 4` (R6–R9 in detail), `8 Prototype`, `9 App Icon`. The six PNG files in `icon-layers/` were viewed and measured (script: `scratchpad/calc/pnginfo5.py`, standard library only). Diffed against package 4.
Checked against the app: `src/lib/buildInfo.ts`, `app.json`, `app/accounts.tsx`, `app/index.tsx`, `app/post.tsx`, `src/export/ExportScreenBody.tsx`, `src/publish/components/*.tsx`, `src/publish/adapters/*.ts`, `src/auth/WelcomeScreen.tsx`, `EmailSignIn.tsx`, `src/projects/useProjects.ts`, `pickMedia.ts`.

**Instruction check.** Nothing in the package reads as an instruction aimed at a reviewer. The only imperative text is ordinary hand-off wording ("Developers must confirm") and our own note to the owner at the top of `review-4.md`. The PNG files carry a `caBX` metadata chunk (a content-credentials block written by the export tool); it was not interpreted.

**Headline.** This round did what was asked for my part. The permission rows, the camera menus, the notification card with its three after-states, the build line, the light-appearance gold and the icon files are all there. `5 Screens` was not redrawn but cut: its Post and Accounts boards were deleted and the README hands those screens to `12 States v2`. That removes the contradiction, at the price of one lost drawing (the YouTube options sheet) and several stale boards left standing beside the new ones. Nothing left is blocking.

What changed in each of my files since package 4:

| File | Change |
|---|---|
| `5 Screens` | Post board (4 phones × 4 variants) and Accounts board (2 × 4) deleted, replaced by a pointer to `12 States v2`. Light variants now swap `#D9B36A` for `#8B5F00` in tile rings and the export ring. Notification card corrected. Sign-in sheet (7a), the dialog table (7f) and the intro are unchanged. |
| `12 States v2` | E2 / E3 base states now in four combinations; "0 / 5000"; build row renamed "Build"; "New feature" removed from row text; "Not Now" removed from the notification offer; the E6 text matrix replaced by a pointer to R6. E1, E4 and E7 otherwise unchanged. |
| `14 Review 4` | New. R6 permission rows, R7 camera, R8 notifications, R9 build line and decisions. |
| `4 Wizard and Permissions` | Page 3 rows redrawn (both buttons on Limited, state symbols, ink colour); page dots moved above the buttons on page 4; start frames added to the page-2 storyboard; 6a Microphone card relabelled; the Photos-off inline card removed from 6b. |
| `WizardArt` | The `summary` scene is now four small pictures instead of four text boxes. |
| `8 Prototype` | "Signed in as…" step, real Export options, grey "Posted", "New feature" removed from rows. |
| `9 App Icon` + `icon-layers/` | Points shortened; six PNG files delivered. |
| `ScreenPhone`, `HomePhone`, `2 Home` | Byte-identical to package 4. |

---

## 1. Fix-by-fix verdict for review 4

| Point | Verdict | Evidence |
|---|---|---|
| **2.1** Redraw Post / Accounts / Export of `5 Screens` from `12 States v2`; correct "0 / 280" | **Fixed, but introduced a new problem** | Post and Accounts are gone from `5 Screens` (`postStates`, `accStates` deleted), so dimmed Back, the missing "Sign In", the missing account picture and "Limit set by X" no longer exist anywhere. E2 "CAPTION EMPTY" now reads `'0 / 5000'` (YouTube's limit in `youtube.ts`). Export's card reads "Know when it's done" with the real sentence and a grey "Continue". New problem: the **YouTube options sheet** was drawn only on the deleted board and is now drawn nowhere (§2). Also the pointer says Post and Accounts are in `12 States v2` "in all four size × appearance combinations"; only 4 of its 21 Post / Accounts boards are (§2). |
| **2.3** Light appearance uses `#8B5F00` | **Fixed** | `5 Screens`: `const L = (o, v) => v.ink === '#D9B36A' ? o : …split('#D9B36A').join(v.ink)` applied to `ratios`, `styles`, `exportStates`, so tile rings, tints and both export rings follow the ink. Wizard page 3: `sc: 'INK'` → `v.ink`. Danger in light is now `#D70015` in `5 Screens`. |
| **2.4** "New feature" out of interface text | **Fixed** (my files) | Wizard rows read "Take a photo or video" and "Know when it's done"; E7 rows read "Not asked"; the add-clip row has no subtitle; the notification card and the prototype rows are clean. Every remaining "New feature" in my files is a board tag. |
| **4.1** Matrix as rows; both buttons on Limited; one restricted wording; one page-3 design | **Partly** | R6 draws 6 permissions × 5 states in dark and light, with state symbols, "Choose More Photos" + "Allow Full Access" on Limited and "Managed on this iPhone" throughout. But page 3 still exists in three forms: boards 5a–5d (new), E7 in `12 States v2` (old: "Limited · Choose More Photos" as grey text with one action, no state symbols, six rows) and the prototype (seven simplified rows). R6 and 5a–5d also differ in detail (§4.1). |
| **4.2** Camera: real menu from "+" and in New Project; the sequence; "Camera is off" | **Fixed** | R7: a menu anchored to the "+" (Photos · Files · Take Photo or Video), a menu anchored to New Project (Choose Photos and Videos · Take Photo or Video), a "CAMERA IS OFF" variant, and a six-step Camera-then-Microphone strip. Leftovers in §4.2. |
| **4.3** Notifications: one card, title, one grey Continue, no "Not Now"; three after-states | **Fixed** | R8: "NOT ASKED · CARD", "ALLOWED" ("You'll get a notification when it's done."), "REFUSED · NOTHING SHOWN", "IGNORED · CARD STAYS UNTIL THE EXPORT ENDS". The same card on `5 Screens` 7c, E7 and 6b. One leftover: board 6a still draws its notification explanation with a gold "Continue". |
| **4.4** One design for Photos refused on Home; Microphone card in 6a without a button | **Partly** | One design now: the banner on E4, confirmed in R9; the "Photos access is off / Pick Items" card is gone from 6b. But the 6a Microphone card still has a gold button, now labelled "Start Recording", on a card whose own text says "No explanation card". And 6b's footnote still says "importing never stops" while the banner says "Clipy needs Photos access to import…" (§4.4). |
| **5.1** Build line, seven values | **Fixed** | R9 and the README list the seven values in the app's order (§5). |
| **5.5** App icon: points clear of the ring; layer files | **Fixed** | Measured: north tip at y = 256, ring inner edge at 208, a 47-px gap; six 1024 × 1024 RGBA files (§7). |
| **5.6** Wizard and prototype | **Fixed** | Four pictures in the summary everywhere; start frames on 5e; dots above the buttons on every page; "Signed in as…" and real Export options in the prototype; "Posted" is grey (§6). |

**Tally (10 points): fixed 7 · fixed but with a new problem 1 · partly 2 · not fixed 0.**

---

## 2. What `5 Screens` lost, and what still contradicts

### 2.1 What was removed

| Removed board (was in all four variants) | Where it is drawn now |
|---|---|
| Post · "READY · SIGNED IN" | E2 "READY · OVER THE LIMIT · TIKTOK LINE", all four combinations |
| Post · "POSTING · DONE · FAILED" | E2 "POSTING · BACK STAYS LIVE" (four) and "DONE · RETRY · RESUME · RECONNECT" (once) |
| Post · "SIGNED OUT · NOT SET UP · BROKEN LINK" | E2, three separate boards, once each |
| Post · **"YOUTUBE OPTIONS · SHEET"** | **Nowhere.** No file contains "YouTube Options" or "Who can see it". |
| Accounts · "SIGNED IN · CONNECTED · PERMISSIONS" | E3 "CONNECTED · CONNECT FAILED", once, without the Permissions group |
| Accounts · "SIGNED OUT · NOTHING CONNECTED · ABOUT" | E3 "SIGNED OUT · BANNER", once, without About |

### 2.2 Screens and states that lost a drawing

1. **The YouTube options sheet** — one of the brief's four sheets (9.4, 9.7) and a real component in the app (`PostOptionsSheet.tsx`: title "YouTube options", "Title" field with placeholder "Uses your caption" and a "12 / 100" counter, "Who can see it" with Public / Unlisted / Private). Not drawn in any size or appearance.
2. **Four combinations.** In `12 States v2` the helper `ph4` draws four combinations only when the board is not marked `one: true`. That leaves four boards in four: Post "READY…" and "POSTING…", Accounts "NOT SET UP" and "SIGNED IN · NOTHING CONNECTED". The other ten Post boards and seven Accounts boards are drawn once, alternating 375 dark and 440 light. Before, every state on the two deleted boards was in all four. Lost in three of four combinations: Post signed out, not set up, broken link; Accounts connected / expired / connecting rows, Accounts signed out.
3. **A whole Accounts screen.** No board shows the four groups together (Clipy account, Platforms, Permissions, About). The About group with the build row is on one board only.
4. Not lost: the sign-in sheet (still in `5 Screens` 7a in four combinations, and in E1), the dialogs (E4, E2, E3) and Export.

### 2.3 What is left in `5 Screens` that contradicts another board

| In `5 Screens` | Contradicts |
|---|---|
| Intro: "Each row is drawn twice… the other two combinations follow directly." | The file itself: four variants are drawn. |
| Board "a" still draws the three sign-in steps. | The README makes `12 States v2` the authority for sign-in, so there are two drawings. Step 1 here has no fixed activity slot (E1 has one). Step 2 shows "Sign-in isn't set up yet, so no code was sent." under the email field; in the app that sentence opens the code step (`openCode(NO_CODE_SENT)` in `WelcomeScreen.tsx`). E1 has the same slip. |
| 7f: "All drawn with the kit's alert… Destructive action first and red, Cancel last." | E4: "Cancel first, destructive action in red", and every drawn dialog has Cancel leading. 7f is a text table and draws nothing. |
| Export progress line "Preparing done · rendering the video". | R8 and the prototype: "Preparing changed sounds first, then the video." The app says only "Exporting…". Three versions. |
| Export progress is a ring with "37%" inside. | R8 and E7 draw the same state as plain text "Exporting · 37 %" with no ring (a limit of `ScreenPhone`). `5 Screens` is the authority for Export, so the ring stands. |
| "Frame Rate", "Smaller File". | The prototype and the app: "Frame rate", "Smaller file". |
| Unused constants `ok`, `red`, `gold`, `grey`. | Harmless. |

Stale text in `12 States v2` as well: its header still reads "REVIEW 3 · SECTION E AND F7"; its intro still says base states are drawn "in the two combinations that were missing"; an unused `matrix` table in the script still holds "Photos access is off + Pick Items".

### 2.4 `#D9B36A` on a light surface

None found in my files for a ring, line, value or status symbol. Checked: `5 Screens` (tile rings, export rings, focus ring, text actions), `ScreenPhone` and `HomePhone` (`ink: '#8B5F00'`), wizard 5b / 5d (Limited symbol, text actions, the tick disc on "4 done"), R1 light crop, R6 light rows, 6a and 6b light cards. Every remaining `#D9B36A` is a gold button fill, a board highlight, the icon, or part of wizard artwork that sits on a black panel in both appearances.

One related slip: status text in `#34C759` on a light page — "You'll get a notification when it's done." on R8's light board, and the green "Done" / "Allowed" — is far too faint (about 2 : 1). Use the label colour with a green symbol.

---

## 3. State coverage, re-run

Same areas and totals as reviews 3 and 4.

| Area | Review 4 | Now drawn | Described only | Missing |
|---|---|---|---|---|
| Launch | 1 / 1 | 1 / 1 | – | – |
| Wizard | 14 / 19 | 14 / 19 | 5 | – |
| Permissions (permission × state × place) | 31 / 73 | 68 / 73 | 5 | – |
| Sign-in sheet | 21 / 22 | 21 / 22 | 1 | – |
| Home sheets, menu, Home messages | 8 / 17 | 8 / 17 | 1 | 8 |
| Export | 9 / 15 | 10 / 15 | 1 | 4 |
| Post | 31 / 40 | 30 / 40 | 2 | 8 |
| Accounts | 14 / 16 | 15 / 16 | – | 1 |
| Dialogs | 7 / 8 | 8 / 8 | – | – |
| **Total** | **136 / 211 (64 %)** | **175 / 211 (83 %)** | **15** | **21** |

Without the permissions matrix: 107 / 138 (78 %).

How the permissions figure is counted: R6 draws each of the 25 valid permission × state rows once per appearance and says the row is the same on wizard page 3 and in Accounts, so each counts for both places (50). Plus the Files row in both places (2), six "not asked" entries inside the feature (five cards and the record button), six "denied" entries (the Home banner, Save, Camera in the menu, Microphone, Speech, Notifications "nothing shown"), Camera restricted, Photos limited inline, return from Settings, and the Limited row after more photos. Described only: the restricted state inside the feature for Photos, Save, Microphone, Speech and Notifications. Caveat: the rows are drawn on a neutral grid, not inside a wizard or Accounts frame.

### Still not drawn

1. **Post:** the YouTube options sheet; summary lines for Instagram and Facebook on a row; the "Longer than 3 minutes…" addition; X's link note; the info popover holding the full note; "Could not share the video."; "Couldn't open the link."; the screen when every platform has finished. A finished row with a link still shows "View" without "Done" (`PostRow.tsx` shows both).
2. **Home:** "Couldn't make the quick edit", "Couldn't rename project", "Couldn't duplicate project", "Couldn't delete project", "Couldn't open Photos.", "Couldn't read that video.", "Clipy needs Photos access to post a video…", the "No preview" card. Text only: the damaged card's Delete-only menu.
3. **Export:** Done when posting is not set up (the app then makes "Save to Photos" the main button); "Could not save to Photos."; "Could not share the video."; the Live Activity (declared optional and not drawn). Text only: the "Preparing" phase.
4. **Accounts:** "Couldn't sign out.".
5. **Wizard:** page 4 busy, with Apple unavailable, and with a message, in the wizard frame (drawn only as the sheet); a page at a large text size; the four VoiceOver descriptions.
6. **Sign-in:** Apple's slot while the app is still checking (a caption only).
7. **Permissions:** the restricted state inside five features.

All the undrawn messages are covered by E4's rule ("Banners replace every toast… stay until the next action") and by the README's rule that the brief holds every sentence not in its table. They can be built without a drawing.

### Wording against the app

Correct word for word: the ten sign-in messages (one reworded and listed), both sign-in cards, the two leave / stop dialogs, the disconnect and sign-out dialogs, "Something went wrong.", "Try again" (as "Try Again"), the TikTok caption line, "Preparing…" / "Publishing…" / "Done" / "View" / "Retry" / "Resume" / "Reconnect", the validation sentences shown, "Ready to sail", "4K needs a 4K source clip.", the Aspect ratio and Quick Edit notes, the empty-state title and hint.
Differences that remain (all carried over): "Rename Project" (app: "Rename project"); the not-set-up sentence on the wrong sign-in step; the signed-out and not-set-up Post boards show a disabled "Post" button where the app shows only "Share…"; the E3 note "No primary button on purpose" beside a gold "Sign In" on the signed-out board (the app does use its gold button there, and the README lists "Sign In" as gold — the note is the wrong one).

---

## 4. Permissions, camera, notifications

### 4.1 The rows

**Drawn as rows: yes** (R6). Six permissions × Not asked / Allowed / Limited / Off / Managed, dark and light, 60 cells. Not asked: purpose line and "Continue". Allowed: green filled tick, "Allowed". Limited (Photos only): half-filled mark in the ink colour, "Clipy can see only the photos you chose.", both buttons. Off: red slashed mark, "Off", "Open Settings". Managed: lock, "Managed on this iPhone", no button. The five Limited cells that do not apply are dimmed and say "Not used for this permission".

**One restricted wording: yes, on the rows** — "Managed on this iPhone" on R6, 5a–5d and E7. It is not the brief's wording ("Not available on this iPhone", which `3 Components` still uses), and it is not in the README's "Sentences changed" table.

**One page-3 design everywhere: no.**

| Where | What it shows |
|---|---|
| R6 (declared the winner) | Buttons under the text in every state; red mark on Off; the Limited cell never shows the word "Limited"; no Files row. |
| 5a–5d | One trailing button for single actions, the two Limited buttons under the text; "Limited · only the photos you chose"; no symbol on Off; seven rows including "Import from Files". |
| E7 in `12 States v2` | The package-4 design: "Limited · Choose More Photos" as grey text and one action "Allow Full Access"; no state symbols; six rows. |
| E3 Accounts | A three-row Permissions group in the E7 style. |
| Prototype step 3 | Seven rows, trailing "Continue" turning into "Allowed"; Camera reads "Record a clip" (elsewhere "Take a photo or video"); the Files row has a label "Always on" found nowhere else. |

On 375 × 667 the page-3 list of 5c / 5d is taller than its space by roughly 20 pt by my arithmetic (seven rows, one with two buttons); the board clips it. The list must scroll.

### 4.2 Camera

- **A real menu from the editor's "+": yes** (R7, first board). Photos · Files · Take Photo or Video, anchored to the "+". The editor behind it is three flat bands, and it is drawn at 375 dark only.
- **In New Project: yes** (R7, second board). Choose Photos and Videos · Take Photo or Video, anchored to the gold button. This matches the brief (8.3). It also turns the app's most used action from one tap into two, and no other board shows it: `HomePhone`'s button is unchanged, the prototype goes straight to the picker, and 6a still says Photos is first asked at the "New Project… tap".
- **Camera, then Microphone: yes**, as a strip of six tiles: tap → Camera alert (system) → system camera in Photo mode → switch to Video and press record → Microphone alert (system, skipped if already allowed) → clip added; "Without the microphone, the video records without sound." Whether iOS really waits until recording starts is its decision, not the design's; README item 4 hands it to the developers. "Clip added at the playhead" was not checked against the app's add-clip behaviour.
- **"Camera is off": yes.** The menu row has a slashed camera and the subtitle "Camera is off · tap to open Settings", drawn at 60 % opacity. A row that looks disabled but must be tapped is a contradiction. The restricted camera is drawn only as the 6b card "Camera isn't available".
- Left over: E7 "EDITOR · ADD-CLIP MENU" still draws the old version (three list rows at the bottom of an empty screen).

### 4.3 Notifications

One card on `5 Screens` 7c, E7, R8 and 6b: bell, "Know when it's done", "Clipy can tell you when an export or an upload finishes.", one grey "Continue", no "Not Now". After-states on R8: allowed → a green line "You'll get a notification when it's done."; refused → nothing; ignored → the card stays until the export ends. Board 6a's explanation card for notifications still has a gold "Continue", against the README ("Never gold: … the notification card").

"It promises nothing about leaving the app" (R8) — yet "You'll get a notification when it's done." is only useful if the export or upload finishes while the app is in the background. The README's confirm list does not ask whether it does.

### 4.4 Photos refused on Home

One design: the E4 banner "Clipy needs Photos access to import photos and videos." with "Open Settings"; R9 states the card is removed. What remains is a contradiction of meaning: 6b's footnote says "Photos: importing never stops… the system picker still works", and the banner says access is needed. The app today asks for access before opening the picker and stops with that sentence if refused (`pickMedia.ts`). The developer must decide which is true; README item 3 already lists it.

### 4.5 Apple-rule checks (from the brief only)

| Rule | Verdict | Evidence |
|---|---|---|
| Nothing required to continue | Pass | Page 3's gold "Continue" is always enabled (5e: "always enabled"); every denied state says what still works. |
| Skip always there | Pass | "Skip" on pages 1–2, "Skip for Now" on page 3, "Continue Without an Account" on page 4. |
| No restyled or imitated system alert | Pass | Permission alerts appear only as dashed "system · from the kit" tiles (R7, 6a). The drawn dialogs are the app's own. The prototype's picker is a labelled stand-in. |
| Sign in with Apple unmodified, never gold | Pass | White on dark, black on light on 5a–5d, 7a, E1 and the prototype; no gold button on that step. |
| Explanation has one action, no second dismiss | Pass, two slips on 6a | No "Not Now" anywhere. 6a still gives the Microphone "card" a gold button although it says there is no card, and gives the notification card a gold button. |
| Never two alerts in a row | Unproven | Drawn as intended; iOS decides (§4.2). |

### 4.6 Against `app.json` today

| Permission | Declared today | The design needs |
|---|---|---|
| Microphone | "Clipy uses the microphone to record voice-overs and to make captions from speech." | 6a proposes "Clipy uses the microphone to record voice-overs." — too narrow once camera video records sound. |
| Speech recognition | "Clipy turns speech in your clips into captions." | Unchanged. |
| Photos (read) | "Clipy needs access to your videos to import clips." | Proposed: "Clipy uses the photos and videos you choose to make your clips." |
| Save to Photos | "Clipy saves exported videos to your Photos." | Proposed: "Clipy saves your exported videos and covers to Photos." |
| Camera | Off (`"cameraPermission": false`) | New sentence "Clipy uses the camera to record photos and videos for your clips."; a new build. |
| Notifications | Nothing declared; no notifications package | A new package and a new build. |

---

## 5. Build line

| | App (`LEVELS`, `buildLabel()`) | Design (README, R9) |
|---|---|---|
| 1 | App build: blur and cuts | Build · Blur and cuts |
| 2 | App build: stabilize and smooth | Build · Stabilize and smooth |
| 3 | App build: beats and background | Build · Beats and background |
| 4 | App build: noise, ramps and speech | Build · Noise, ramps and speech |
| 5 | App build: sound tools | Build · Sound tools |
| 6 | App build: export only (older) | Build · Export only (older) |
| 7 | Expo Go (no video engine) | Build · Test version (no video engine) |

**Same seven values, same order.** The changes are a capital letter, "Build" as the row label in place of the "App build:" prefix, and "Test version" for "Expo Go". The rename is in the README's table.

**Drawn in Accounts in every state: no.** R9 draws the seven values as rows on a dark card. Inside an Accounts screen the About group appears on one board, E3 "NOT SET UP" (four combinations), with the value "Stabilize and smooth". The app shows the line at the bottom of Accounts in every state (`accounts.tsx` line 64); the design does not say so.

---

## 6. Wizard and prototype

### 6.1 The four pages as they now stand

| | Page 1 | Page 2 | Page 3 | Page 4 |
|---|---|---|---|---|
| Headline | "Make clips worth sharing" | "Big edits, one tap" | "You decide what Clipy can use" | "Sign in to post" |
| Body | "Edit, caption and post your clips." | "Cut to the beat, remove a background, add captions and steady a shaky shot." | "Allow these now or later. Editing works either way." | "You only need an account to post. Editing works without one." |
| Controls | Skip · gold "Get Started" | Back · Skip · four-segment line · gold "Continue" | Back · "Skip for Now" · a control per row · gold "Continue" | Back · "Continue with Apple" · "Continue with Google" · "Continue with Email" · "Continue Without an Account" |

Unchanged, and word for word the brief. After sign-in: a tick, the headline "Sign in to post", "Signed in as mia@example.com", gold "Start Editing".

### 6.2 The points asked for

| Asked | Verdict | Evidence |
|---|---|---|
| Page-2 summary = the four pictures everywhere | Yes, in two drawings | 5a–5d place the four real small scenes in a 2 × 2 grid. `WizardArt`'s `summary` scene (storyboard, Reduce Motion still, prototype) is four simpler pictures built from gradients. Both are pictures with the four labels. |
| Start frames | Yes | 5e page 2 now has `beats-a`, `cutout-a`, `captions-a`, `stab-a` beside each end frame. |
| Page dots in one place | Yes | Above the button or button stack on pages 1–4, in the prototype, and above the keyboard on the wizard's email and code steps. |
| "Signed in as…" step | Yes | The prototype's three sign-in buttons set `signed`, which shows the tick art, "Signed in as mia@example.com" and gold "Start Editing". Its headline reads "Signed in"; the board's reads "Sign in to post". |
| Real Export options | Yes | Step 14: Resolution (4K dimmed), Frame rate, Quality, a live "Estimated size", "4K needs a 4K source clip.". |
| No gold "Posted" | Yes | The button is grey while posting and reads "Posted" at the end. The word is still on no board. |
| Apple's button never gold | Yes | White with black text. |
| Real permission rows on step 3 | Yes, simplified | Seven rows; see §4.1 for the differences. |

Still open from earlier rounds, not asked again in review 4: whether the page-2 scenes play full size or in their cells; one second per scene is short; the four VoiceOver descriptions are not written; `src/ui/motion.ts` needs a named exception for the wizard.

### 6.3 What in the prototype still contradicts a board

- Home → New Project goes straight to the picker; R7 says New Project opens a menu.
- Step 7 (Aspect ratio) has no Cancel; `5 Screens` has one.
- Step 14 has no Close button and no thumbnail row header as on `5 Screens` (the thumbnail is there, the Close is not).
- Step 15 shows no notification card, and its line "Preparing changed sounds first, then the video." differs from `5 Screens`.
- Step 16 has only "Post to…"; no Save to Photos, Share or Done.
- Step 17 has no thumbnail, no notes, no TikTok line, no "Share…"; Back does nothing.
- The editor steps are one hot zone: every tap means "next".
- One size (402), dark only.

The README calls the prototype "illustrative; the boards win", which is the right status for it.

---

## 7. App icon

**What the files are.** Six PNG files, each 1024 × 1024, 8-bit RGBA, not interlaced.

| File | Content | Transparent | Measured |
|---|---|---|---|
| `background.png` | Solid navy `#0C2542` | 0 % (fully opaque, as a background must be) | Whole canvas |
| `ring.png` | Gold `#D9B36A` ring | 85.7 % | Outer edge 139 → 884 (746 px, 73 % of the canvas); stroke 70 px; inner edge at 208 and 815 |
| `north.png` | Gold triangle | 98.2 % | Tip at y = 256, base at y = 511, 144 px wide |
| `south.png` | Cream `#F6E7C1` triangle | 98.2 % | Base at y = 512, tip at y = 767 |
| `east-west.png` | Grey-blue `#B9C7D6` flat diamond | 98.0 % | Tips at x = 286 and 737, 92 px tall |
| `composite.png` | All five together | 0 % | Square, unmasked |

**Description.** A gold ring on navy. Inside it, a tall two-tone needle — gold pointing up, cream pointing down — crossed at the centre by a thin, pale horizontal diamond. Flat colour, no gradient, shadow or highlight.

**Does it read as a compass?** Yes. The ring plus a long two-colour needle over a short cross bar is the standard compass sign, and nothing in it resembles a play button. At a glance it can also be read as a four-point star in a ring; the two-tone needle is what settles it.

**Do the points stop short of the ring?** Yes. North and south stop 47 px short of the ring's inner edge, east and west 77 px short. The board says 46 px for all four; the east–west gap is larger, which is harmless.

**Are the layers separable?** Yes: five separate files, the four foreground ones on transparent backgrounds with clean anti-aliased edges (under 0.5 % partly transparent pixels) and a single colour each. They drop into Icon Composer as they are.

**Apple's template.** The canvas is 1024 × 1024 and the art sits well inside the rounded mask (139 px clear on every side). The pink grid and circles on board 12a are the designer's drawing of guides, not Apple's template file, and the note "the ring sits on the outer keyline" is not exact: the ring is drawn 8 board-pixels inside that circle. I cannot confirm more than that from the files.

**Board 12b.** Six appearances at 60 / 40 / 29 pt, 18 renders, with the new geometry. They are CSS shapes at one pixel per point, and the clear and tinted rows are approximations ("come from Icon Composer"). The board's own note stands: at 29 pt the east–west points all but vanish.

**Anything the brief's guidance would reject?** No. Layered, simple filled shapes, square and unmasked, opaque background, no text, no photos, no effects of its own, six appearances with one core shape, a reason given. Small points: the files are PNG, not vector (accepted; a vector redraw is trivial — ring centre 512, 512, radii 303 and 373; north 512, 256 / 584, 512 / 440, 512; south mirrored to 768; east–west 287, 512 / 512, 466 / 737, 512 / 512, 558); the board's intro still says "four flat layers" (there are five); its header still says "REVIEW 3"; `app.json` has one `icon.png` today.

---

## 8. Wording

### 8.1 Sentences on my boards that are not in the README's "Sentences changed" table

1. **"Managed on this iPhone"** for the restricted row (brief: "Not available on this iPhone"). The README says the brief holds every sentence not in the table, and R6 says this wording is used "always" — the two rules collide.
2. Post summary lines: "Private until Google reviews Clipy.", "Goes to your TikTok inbox to finish.", "About 1.5¢ per post." (carried over; still unlisted).
3. The six row purposes: "Bring clips into a project", "Save finished videos", "Take a photo or video" (prototype: "Record a clip"), "Record a voice-over", "Turn speech into captions", "Know when it's done".
4. "Camera is off · tap to open Settings"; the menu items "Photos", "Files", "Choose Photos and Videos".
5. Export phases: "Preparing", "Exporting" (app: "Exporting…"), "Preparing done · rendering the video", "Preparing changed sounds first, then the video.".
6. Inline denied states on 6b, which replace the app's sentences: "Saving to Photos is off" / "Share still works: save to Files, AirDrop or any app."; "Microphone is off" / "You can still add music, sound effects, audio from Files and Read Aloud."; "Speech recognition is off" / "Captions can still be typed as text and styled."; "Camera isn't available".
7. Home: "Creating Project 7", "Copying 8 of 12 items", "Cutting 14 clips to Happy Adventure", "New Project or Quick Edit, below", "Post a finished video from here.", "Loading projects".
8. Accounts and Post: "Connect a platform to post to it straight from Clipy. You stay signed in to it until you disconnect."; "Loading", "Loading platforms", "Connecting…", "Posting…", "Posted"; "Limited · 24 photos chosen"; "Allowed — just now".
9. The proposed purpose sentences for Photos, Save to Photos, Camera and the shortened Microphone sentence (they are in the brief as proposals; the README does not record which were chosen).
10. Behaviour, not wording: "Couldn't create project" gains "Try Again".

In the table and correct: the build line, "Projects", the three server and Facebook rewrites, the sign-in card sentence, "You'll get a notification when it's done.", the indicator words.

### 8.2 "New feature" inside interface text

None left in my files.

---

## 9. New problems introduced this round

1. The YouTube options sheet is drawn nowhere.
2. The pointer in `5 Screens` overstates: "all four combinations" is true for 4 of 21 Post / Accounts boards.
3. Old boards were left beside their replacements: E7's page 3 and add-clip list, E3's three-row Permissions group, `5 Screens` 7a and 7f, both files' intros. The README's authority table settles each case, but a board that loses is still on the canvas.
4. New Project became a menu on one board only; Home, the prototype and 6a still show one tap.
5. "Camera is off" is a dimmed row that asks to be tapped.
6. R6's Limited row dropped the word "Limited"; R6 and 5a–5d are close but not the same row.
7. The 6a Microphone card gained a gold "Start Recording" button instead of losing its button.
8. Green status text on light pages is too faint.
9. The README's rule "the brief holds every unlisted sentence" now conflicts with R6 on the restricted wording.

None of these stops a build.

---

## 10. Verdict

**Yes — the screens outside the editor, the wizard, the permissions, the prototype and the icon are good enough to build from**, reading the boards in the README's order of authority.

### (a) Still blocking

Nothing.

The two new abilities — camera and notifications — are not blocked by the design any more. They each need a new native build and one fact proven on a phone (when iOS asks for the microphone; whether an export or upload finishes in the background). That is the developer's work, and both can be left out of the first build without touching anything else.

### (b) Decisions for the developer during the build, with a recommendation

| Decision | Recommendation |
|---|---|
| Which permission row | Build one row: the 5a–5d layout (one trailing button; Limited's two buttons under the text) with R6's symbols and states, the word "Limited" kept, seven rows including "Import from Files". Use it on wizard page 3 and in Accounts. Ignore E7 and E3's short group. Let page 3 scroll on the small phone. |
| Restricted wording | Follow R6: "Managed on this iPhone", and "This setting is managed on this iPhone." inside a feature. Record it as a changed sentence. |
| Photos access | Try the system picker with access off (README item 3). If it works, stop asking for access before picking; the Home banner then appears only on a real failure and its sentence is true. |
| New Project | Keep it one tap to the picker for now. Add the menu only in the build that brings the camera; start the camera in the editor's "+" menu. |
| "Camera is off" | An ordinary enabled row with the subtitle "Camera is off"; a tap shows the banner with "Open Settings" rather than jumping to Settings. |
| Microphone purpose sentence | If the camera ships, the sentence must also cover the sound of recorded video. Keep today's sentence until then. |
| Notifications | Build the card and its three after-states only once a finished export or upload is proven to reach the person in the background. Otherwise leave the feature out. |
| Export progress | The ring from `5 Screens`, the card and after-states from R8 above "Cancel". One line under the ring: "Preparing", then "Exporting". Drop the two longer sublines. |
| YouTube options | Build it as a system sheet from the brief (9.4) and package 4's drawing: "YouTube options", Title field with counter, "Who can see it" with three choices. Leave out the line "Changes apply at once. There is no Save button." |
| Build line | The last row of Accounts in every state: "Build" and the value. |
| "Sign In" on Accounts when signed out | Gold, as in the app and the README's list. |
| Dialog button order | As E4 and the system do it: Cancel leading, the destructive action trailing in red. |
| Not-set-up sign-in sentences | Follow the app: "Sign-in isn't set up yet." on the email step, "…so no code was sent." opening the code step. |
| Undrawn messages | A banner with the brief's sentence, per E4's rule; "Open Settings" or "Try Again" where the app can act. |
| Status text in light | Label colour with a green symbol, not green text. |
| Wizard page 2 | Play each scene in its own cell, one after another, about 1.5 s each; the resting frame is the 2 × 2 grid. Add the `motion.ts` exception for the wizard. |
| Icon | Use the PNG layers in Icon Composer, or redraw them as vectors from the coordinates in §7. |
| Sign-in drawing | `12 States v2` E1; ignore `5 Screens` 7a. |

### (c) Points for the designer

**None worth another round for this part.** If a round is sent anyway for the editor, these six could ride along:

1. Put the YouTube options sheet back, in `12 States v2` E2.
2. Delete the boards that lost: E7's page 3 and add-clip list, `5 Screens` 7a and 7f; correct the intros of `5 Screens` and `12 States v2`.
3. Make R6 and 5a–5d the same row (the word "Limited", the mark on Off, the Files row) and use it in E3's Accounts boards and the prototype.
4. On board 6a, take the button off the Microphone card and make the notification card's "Continue" grey.
5. Show New Project's menu on the Home board and in the prototype, or say plainly that it stays one tap; draw "Camera is off" as an enabled row.
6. Add to "Sentences changed": "Managed on this iPhone", the three Post summary lines, the six row purposes, the 6b inline sentences and one Export progress line.
