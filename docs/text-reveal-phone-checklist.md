# Text reveal — what to try on the phone

Typewriter (letters appear one by one) and Word by word (words appear in turn) are two new tiles at the end of a TEXT's
In row (Edit a text → Animation → In). This list is for the next build. It goes from the most likely problem to the least.

## How to do every check

1. Make the text, pick the reveal, play it in the editor.
2. Export it. Open the exported video in Photos.
3. Watch the two side by side (or one after the other): the editor and the exported file must show the same thing at the same moment.

Under each check, write what you saw. If something looks wrong, stop and tell me the number of the check — and whether it was
wrong in the editor, in the exported file, or in both.

---

### 0. The build
Accounts → the Build row.
- **Right looks like:** "Text reveal".
- **Wrong looks like:** any other name — then this list cannot be tried yet.

### 1. Emoji (do this first)
Make a text `Hi 👋 there 🎉`. Pick Typewriter, Length 2 s. Play it slowly (drag the playhead). Then the same with Word by word.
Then give the text a Glow and a Shadow and do it again.
- **Right looks like:** each emoji appears only when its turn comes, after the letters in front of it — never earlier. Its glow
  and shadow appear with it, not before.
- **Wrong looks like:** an emoji (or its glow or shadow) is visible from the very start, before "Hi" has finished appearing.
  Tell me whether that happened in the editor, in the exported file, or in both. (There is a planned fix for this; I need to
  know before using it.)
- Also try a family emoji 👨‍👩‍👧, a flag 🇫🇷 and a thumbs-up with a skin tone 👍🏽: each appears whole, never in pieces.

### 2. The editor and the file agree
A short one-line text (`Hello`) with Typewriter, 0.5 s, then 2 s. Then a long sentence that wraps onto two lines, 2 s.
- **Right looks like:** letters arrive in the same order and at the same speed in the editor and in the file; the last letter
  arrives at the same moment in both. The two-line text never re-wraps: the second line's place is fixed from the start.
- **Wrong looks like:** the file is ahead of or behind the editor, a line jumps, or a word moves to the other line while typing.

### 3. Outline, shadow, glow and box
One text, Typewriter 2 s. Try each of these, then all four together:
outline only · shadow only · glow only · background box only · outline + shadow · glow + box · all four.
- **Right looks like:** nothing of a letter shows before the letter does — no faint outline, no shadow, no glow of letters still
  to come. The background box is full size from the very first moment.
- **Wrong looks like:** a ghost of the whole text (an outline, a shadow or a glow) visible from the start; a box that grows.

### 4. Alignment
A two-line text, Typewriter 2 s: centred, then right-aligned, then left-aligned.
- **Right looks like:** the letters already shown stay exactly where they are as new ones arrive.
- **Wrong looks like:** the shown letters slide sideways (even a little) each time a letter appears. Look closely at "fi" and "fl"
  in a word such as `office floor` — tell me if those two letters twitch.

### 5. Arabic and Hebrew
An Arabic or Persian sentence (with vowel marks if you can), right-aligned, Typewriter 2 s. Then a Hebrew sentence.
- **Right looks like:** Arabic: words appear from right to left, each word whole and properly joined. Hebrew: letter by letter
  from right to left, the vowel points arriving with their letter.
- **Wrong looks like:** letters of an Arabic word appear separately or unjoined, or anything appears from the left first.

### 6. With an Out and a Loop
A text with Typewriter (1 s) AND an Out (Fade) AND a Loop (Wiggle).
- **Right looks like:** it types itself in while wiggling, then fades out at the end — in the editor and in the file.
- **Wrong looks like:** the Out or the Loop is missing, or the text appears whole before the fade.

### 7. An older Clipy
Only if you still have a phone (or a TestFlight) with the build BEFORE this one: open a text's Animation → In and tap Typewriter.
- **Right looks like:** a message saying the latest build is needed, and nothing changes.
- **Wrong looks like:** the tile is picked, or the app crashes.

### 8. Every font
One text per font of the Text panel, Typewriter 2 s.
- **Right looks like:** smooth typing in every font.
- **Wrong looks like:** a letter that jumps, or a word that moves when the next letter appears.

### 9. See-through and coloured text
A text with its opacity lowered, and a coloured text, each with Typewriter.
- **Right looks like:** the letters appear at the text's own opacity and colour.
- **Wrong looks like:** letters brighter or darker than the finished text.

### 10. A short text with a long reveal
A text that lasts 1 s on the timeline, with Typewriter set to 2 s.
- **Right looks like:** it finishes typing before the text ends.
- **Wrong looks like:** the text ends half-typed.

### 11. The heaviest export
A long two-line text with glow and shadow and Typewriter 2 s. Export at 4K (if offered) and 60 fps.
- **Right looks like:** the export finishes and the file plays.
- **Wrong looks like:** Clipy closes, or the export fails. Tell me the export settings.

### 12. It is kept
Pick Typewriter, then Undo (it goes), Redo (it comes back). Leave the project and open it again. Save a Copy, then Open
Project File with that copy.
- **Right looks like:** the reveal is still there each time.
- **Wrong looks like:** the text has no In, or another In.

### 13. Captions and stickers
Open a caption's or a sticker's Animation.
- **Right looks like:** no Typewriter or Word by word tiles (captions have no Animation at all; a sticker's In row is as before).
- **Wrong looks like:** the tiles are there.
