# Undo history — phone checklist

Nothing new is on screen. Undo and Redo are the two arrows above the timeline. What is new: they still work after you leave a
project and open it again.

Do the first two before anything else — the way a project is saved changed underneath, so we check that first.

**First: saving**

1. Open a project. Make one edit (trim a clip). Go back to Home straight away, then open the project again.
   - [ ] The edit is there.
2. Open a project. Add a clip with the "+" tile and go back to Home within a second. Open the project again.
   - [ ] The project opens (it does not say "Can't open").
   - [ ] The new clip is there.

**Then: Undo comes back**

3. Open a project. Make three edits (trim a clip, add a text, change a filter). Go back to Home. Open the project again.
   - [ ] The Undo arrow lights up a moment after the editor appears.
   - [ ] Three taps on Undo take the three edits off, newest first.
   - [ ] Three taps on Redo put them back.
4. Make three edits. Swipe up to the app switcher and swipe Clipy away. Open Clipy, open the project.
   - [ ] Undo is lit and takes the three edits off. Redo puts them back.
5. Undo twice. Go back to Home. Open the project again.
   - [ ] Redo is lit, and puts the two steps back.
6. Make two edits. Tap Export, export the video, tap Done, go back to Home. Open the project again.
   - [ ] Undo is lit and undoes both edits.
7. Make two edits. Post the project (or just open Post and come back), go back to Home. Open the project again.
   - [ ] Undo is lit and undoes both edits.
   - [ ] The project still shows where it was posted.
8. Open your longest project (many clips, auto captions). Make ten small edits. Go back to Home and open it again.
   - [ ] It opens as fast as it did before.
   - [ ] Nothing stutters in the first second.
   - [ ] Undo is lit. Tap Undo until it goes grey and tell us how many steps came back (on a very long project it may be
         fewer than ten — the newest ones are kept).

**Expected: these start with no Undo**

9. Rename a project on Home. Open it.
   - [ ] Undo is grey. The project is exactly as it was, with the new name.
10. Duplicate a project that has undo steps. Open the copy.
    - [ ] Undo is grey in the copy. The original still has its steps.
11. Save a Copy of a project, then Open Project File with that file.
    - [ ] The new project's Undo is grey.

**One slow case**

12. Turn on Remove background on a clip and wait until it is done. Turn it off. Go to Home, open the project, tap Undo.
    - [ ] The clip shows the Preview tag while the cut-out is made again, then plays cut out. Tell us roughly how long it took.

If a box fails, say which number. In every case the project itself should be whole — only Undo may be missing.
