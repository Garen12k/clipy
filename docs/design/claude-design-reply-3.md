> **Note for the owner (not part of the prompt).**
> This is the reply to Claude Design's third package (boards 1–9). Paste everything below the line into the SAME Claude Design conversation. It keeps what is good, lists what must be fixed, and asks for the missing states.

---

# Clipy — review of boards 1–9, and what to fix

Thank you — the direction is right and I am keeping it: plain iOS, the gold accent with a darker ink in light appearance, black around the video, "Projects", the one-row toolbar, the eight bar colours, glass with a solid twin. What follows are corrections. The brief is still the source of truth; nothing in it may be dropped. Work through sections A to F in order, redraw the boards they name, and do not stop for approval — if a reply runs out of room, end with "Continued in the next message".

## A. The preview is too small once a tool is open (most important)

The "300 pt minimum preview on the smallest iPhone" holds only while the toolbar alone is showing. On 375 × 667 your own numbers give about **229 pt with a large strip, 234 pt with a regular panel, 169 pt with the Speed strip, and about 141 pt with the keyboard up**. That breaks the brief's hard constraint that the preview stays in one fixed place and nothing resizes it during an edit.

1. **A strip takes nothing from the preview.** In the app today a strip rises over the timeline rows (exactly two rows high) and the preview does not move. Redesign every strip to fit that space, with the 64-pt toolbar and the 172-pt timeline cap. If tabs do not fit, put them in the lead of the tile row.
2. **Every strip has ONE height that never changes while it is open** — across its tabs (Speed: Normal / Curve / Slow motion; both Animation strips), its notes, reason lines and every status sentence. Redo the size table so header + rows + padding equals the stated number (S / M / L are 96 / 132 / 184 but their rows add up to 92 / 128 / 176).
3. **Draw the status block at the size of its longest sentence** at 375 pt wide, inside the strip: "Remove background does not work together with Stabilize or Smooth slow motion. Switch those off for this clip first."
4. **Panels:** the preview keeps its place and size when a panel opens; the panel replaces the timeline and the toolbar only. Remove "the preview changes size when a panel opens". Closing a panel is instant; swipe-down, if kept, is an instant close from the header only and is off while a voice-over is recorded.
5. **Voice and Sound quality are compact panels that do not scroll.** Fit every row — including the Pitch slider, the note row, Reduce noise, and the working status with Cancel — into the compact height with explicit row heights, or propose another fixed height.
6. **Print the preview height on every editor board** for 375 × 667: toolbar only, each strip, regular panel, compact panel, keyboard up.

## B. Timeline

1. **Keep the app's row order and behaviour:** Music, Voice, Sound effects (right under the clips), then one row per Layer, then Text / Stickers / Captions, then Effects. The clip row is pinned; the rows under it scroll vertically inside the fixed cap, with a thin scroll indicator. This is already built and works.
2. **Drop the collapsed "summary rows" and the 36-pt gutter**, or justify them again under these conditions: every kind keeps a second cue besides colour (7-pt mini bars are colour alone), every target is 44 pt, and the gutter does not sit inside the sideways-scrolling area or cover the bars.
3. **Touch targets got smaller — fix them:** bars are 22 pt in 26-pt lanes; trim handles on bars are 12 pt gold, which is 1.03–1.14 : 1 against every bar colour (use a dark handle or a grip line); the Move handle is 32 × 12. Every one needs a 44-pt target.
4. **Nothing may overlap at a cut:** the "+" and the transition marker are drawn on top of the trim handle. Move them, or state which one wins the touch.
5. **Keyframe diamonds, the Move handle and the beat ticks** must sit inside the clip area without covering the ruler, the first row or bright thumbnails.
6. Draw sound bars **without** a waveform too (that is what ships first).

## C. Toolbar

1. **The icon-only group button is not clear enough.** It has no label, and it shows the same symbol as the tool next to it (Audio = Volume, Look = Filter, Frame = Crop). Replace it with a labelled control that marks the current group — a system pop-up menu listing the five groups is fine. Keep "Back to main tools" on the first row.
2. **Common tools must not get slower.** Filter and Stabilize now cost three taps; the board says two. Show the tap count from a fresh clip selection for Split, Speed, Filter, Volume, Cut out and Stabilize, and keep the most used within one tap.
3. **Flat rows where grouping hurts:** the sound bar must open on Volume and Fade (today it opens on Split / Duplicate with them hidden); the main bar is a flat row; in multi-select "Done" is pinned and always visible (it is off-screen at 375 pt).
4. **Draw the toolbar for all 11 contexts at 375 pt**, including a reversed clip, a photo (it shows four Basics tools, not five), a collage cell, the empty project and "0 selected". Seven contexts are not drawn.
5. **One rule for the group:** it resets to Basics on every new selection. Remove the sentence that says the last group is remembered.

## D. Things that were dropped — put them back

- Motion: "Pan down". Speed curve: "Flash out". Green screen: the black / white / mint swatches. Ratio: "16:9 for YouTube.".
- Voice: the Pitch slider and the note row. Caption style: the font row, the colour row and the five look rows.
- Text panel: the open contents of Shadow, Background, Spacing and opacity, and Glow.
- Post: the "TikTok doesn't receive this caption…" line; the "Sign in" button on the not-set-up card; the connected account's round picture; **Back stays live while posting** (it asks "Stop posting?").
- Where a row shows only some items, write the full count and every name on the board: 32 filters, 12 adjust values, 20 effects, 21 transitions, 24 looks, 16 fonts, 20 shapes, 8 tracks, 10 sound effects.
- About 60 sentences from brief §12–14 are on no board: refusals, late failures, the six Beat hints, Read aloud, Collage and Record messages. Place every one, sorted into your four message kinds, and show where the confirmation banner sits while a strip or a panel is open.

## E. States described but not drawn — draw them

Fewer than half of the required states outside the editor are drawn; a text table is not a design.

- **Sign-in:** busy, Apple unavailable, all ten messages in place, the email step and the code step (also inside the wizard frame).
- **Post:** loading, list failed, "Preparing…", "Retry", "Reconnect", "Not available yet", caption empty / over the limit / no limit.
- **Accounts:** not set up, loading, failed, signed in with nothing connected.
- **Dialogs and toasts:** every one as a drawn system component, not a table.
- **Editor:** Text panel for a caption; Captions "Replace" and "Try again"; Record idle and "Saving…"; Collage being made and being edited; Beat markers' disabled states; Cover's message line; every strip at the largest standard text size.
- **Components:** 6 of the 36 are absent and 15 are partial. Show each in every state, and one board each for Reduce Transparency, Increase Contrast, Bold Text and the largest text size. Mark each "system" or "custom".
- **Sizes:** every screen outside the editor exists in only two of the four size × appearance combinations. Add largest-light and smallest-dark.

## F. Wording, new features, and smaller fixes

1. **Remove "Get the Update" and the "Update Clipy to…" wording.** There is no store to update from yet. Keep the current meaning in plain words: the tool needs the newest Clipy build, and everything else still works. Keep "Accounts" as the screen's name.
2. **Do not reword sentences in a way that changes their meaning** ("Preview only", "4 of 6 clips have sound", the removed Remove-background sentence). Show any reworded sentence beside the original in the wording table.
3. **Label every new ability "New feature" on its board**, with the original beside it: the custom-colour pill, Cancel on Remove background / Stabilize / Smooth slow motion, the "current look" mark, the crop size readout, the More menu in Adjust, the percent for beat listening (the app reports none), the confirmation banner with Undo.
4. **No system colour-picker sheet inside the editor** (it is a modal). No looping symbol effects beside the video.
5. **One rule for the gold button:** state it. Today Export, Apply, Tap, Transcribe and Save to Photos are all gold.
6. **Light appearance:** every ring, line and status symbol uses the accent ink `#8B5F00`. Board 4b and the light multi-select use `#D9B36A`, which is 1.98 : 1 on white.
7. **Permissions:** complete the matrix — every permission in every state as a wizard row, an Accounts row and an inline state; "Open Settings" on the Off row; both actions on the Limited row. Design exactly where "Take Photo or Video" is offered, and how Camera and Microphone are asked without two system alerts in a row. The notification offer is one design: one title, one "Continue"; do not promise that exports finish after leaving the app.
8. **Wizard:** real artwork made from Clipy's own interface, not icons on grey boxes; key frames as pictures; a drawn Reduce Motion frame for each page; every sequence within 3–5 seconds (page 2 runs about 10).
9. **Prototype:** page 4 uses Apple's own sign-in button — never gold — with Google and Email under it; step 3 shows the real permissions list; Export's Cancel shows its confirmation; the clip toolbar matches the boards.
10. **App icon:** it reads as a play button, not a compass. Rework it, show it at 29, 40 and 60 pt in all six appearances, and deliver the layers on Apple's template.
11. **Clean up stale material:** Foundations 1c and 1g still show the old bar colours, the two-row 104-pt toolbar, 60-pt clips and 30-pt bars; the README's checkpoint-1 sections repeat them. Remove or redraw them. Draw the custom Stabilize and Fade symbols. Give every radius and size a token name.

When all of this is done, finish with the updated hand-off sheet: tokens, component specs, the SF Symbol map, the motion table, the list of new features, and the list of every sentence you changed beside its original.
