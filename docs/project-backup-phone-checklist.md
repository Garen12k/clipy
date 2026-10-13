# Project backup — what to try on the phone

**None of this is in the Clipy app on your phone yet.** It arrives with the next build. Until then it can only be tried in
Expo Go (start it on the computer with `npx.cmd expo start --go`), and only on projects made in Expo Go.

## What was built

- **Save a Copy.** Press and hold a project on the home screen (or tap its More button) and choose Save a Copy. Clipy packs
  the whole project — every clip, photo, sound, text and setting — into ONE file ending in `.clipy`, then shows Apple's share
  sheet so you can put it in Files, iCloud Drive, AirDrop it, and so on.
- **Open Project File.** The new folder button at the top of the home screen. Pick a `.clipy` file and it comes back as a NEW
  project. It never replaces or changes a project you already have.
- **The address fix.** If iOS ever moves Clipy's storage (for example when you restore to a new phone), projects now find their
  videos again by themselves. You do not see anything; there is nothing to tap.
- While a copy is saved or opened, the home screen shows a card with a progress bar and Cancel, and everything else waits.

## How to use this list

Go from the top: the most important checks are first. Under each one, write what you saw. After EVERY check, look at the home
screen: **your existing projects must still be there and still open** (check 11).

If something is slow or seems stuck, tell me the project's size and how long it took. One number controls the speed and it is
easy to change.

---

### 1. Save a small project and open it again
Save a Copy of a short project → Save to Files → On My iPhone. Then tap the folder button and pick that file.
- **Right looks like:** a card "Saving a copy", then the share sheet. After opening: a card "Opening project file", then a
  message "… was added to your projects" and a new project at the top of the home screen, with its picture. If a project with
  that name is still there, the new one is called "… copy". Inside: the same clips in the same order, the same text, the same
  music. It plays. It exports.
- **Wrong looks like:** an alert, a project with black or missing clips, no sound, a different order, or the original project
  changed in any way.

What I saw:

### 2. The same through iCloud Drive
Save a Copy → Save to Files → iCloud Drive. Wait until iCloud has finished uploading. Open it from iCloud Drive.
- **Right looks like:** exactly as check 1.
- **Wrong looks like:** "This project file is damaged or incomplete", or the file is greyed out and cannot be picked.

What I saw:

### 3. The same through AirDrop
Save a Copy → AirDrop to a Mac or another iPhone. Send the file back (or save it to Files) and open it.
- **Right looks like:** exactly as check 1. The file on the other device has the full size.
- **Wrong looks like:** the file arrives much smaller than the project, or opens as "damaged or incomplete".

What I saw:

### 4. Names: a space, Arabic, an emoji
Rename three projects — one like "Beach trip", one in Arabic, one with an emoji — and Save a Copy of each.
- **Right looks like:** the file in the share sheet and in Files has the project's name and ends in `.clipy`. Each opens again
  with its name intact.
- **Wrong looks like:** a name of question marks or percent signs, a file without `.clipy`, or "Couldn't save a copy".

What I saw:

### 5. A big project
Use the biggest project you have (ideally one around 500 MB and one around 2 GB). Save a Copy, then open the file. **Note the
time each takes.**
- **Right looks like:** the bar moves steadily. Cancel answers when tapped (try it once — see check 6). The phone stays
  responsive and Clipy does not close by itself.
- **Wrong looks like:** the bar stands still for a long time, Cancel does nothing, the screen freezes, or Clipy closes.

What I saw (size, time to save, time to open):

### 6. Cancel in the middle
Start Save a Copy on a big project and tap Cancel half-way. Then do the same with Open Project File.
- **Right looks like:** the card goes away, nothing is said, no share sheet, no file, no new project on the home screen. Free
  space (Settings → General → iPhone Storage) is back to what it was, at the latest after closing and reopening Clipy.
- **Wrong looks like:** a half project on the home screen, an alert, or storage that stays used.

What I saw:

### 7. A file that is not a Clipy file
Tap the folder button and pick a photo, a PDF or a song.
- **Right looks like:** an alert "Can't open this file — That isn't a Clipy project file." Nothing is added.
- **Wrong looks like:** no message at all, a new empty project, or a message full of technical text.

What I saw:

### 8. Leaving the app in the middle
Start a save of a big project, go to the phone's home screen for a few seconds, come back. Same with an open.
- **Right looks like:** when you come back it goes on and finishes, or it stops with a plain alert and nothing half is left.
  The phone does not lock by itself while the card is showing.
- **Wrong looks like:** the card stays for ever, or a half project appears.

What I saw:

### 9. Force-quitting in the middle
Start an open of a big file, then swipe Clipy away in the app switcher. Open Clipy again. Repeat with a save.
- **Right looks like:** no half project on the home screen. All your projects are there. Storage comes back (the part iOS
  itself looks after may take a day).
- **Wrong looks like:** a project called "Can't open", or a project with missing clips that you never finished opening.

What I saw:

### 10. A nearly full phone
If your phone is close to full, try Save a Copy of a big project.
- **Right looks like:** before anything is written, an alert "Not enough free space" with two sensible sizes (what is needed,
  what is free).
- **Wrong looks like:** "0 B free" when the phone clearly has space, a save that starts and then fails, or strange numbers.

What I saw:

### 11. Existing projects are untouched — after every check above
- **Right looks like:** every project you had is still on the home screen, opens, plays, and has not changed name or content.
  Only NEW projects were added.
- **Wrong looks like:** anything missing, renamed, or changed. **If this ever happens, stop and tell me at once.**

What I saw:

### 12. The three buttons at the top of the home screen
Look at the top right of the home screen on your smallest phone, with the phone in light and in dark appearance.
- **Right looks like:** three round buttons in one pill — post, folder, account — evenly spaced, each easy to tap, nothing cut
  off. The progress card at the bottom is readable in both light and dark.
- **Wrong looks like:** buttons squeezed, overlapping the title, or the folder symbol missing.

What I saw:

### 13. Remove background and Stabilize after opening (next build only — not in Expo Go)
Save a Copy of a project that uses Remove background, Stabilize, or a Voice / Sound setting. Open the file and go into the
new project.
- **Right looks like:** for a short while the clip shows as it was filmed (with the small "Preview" tag), then the effect
  comes back by itself. The export has the effect.
- **Wrong looks like:** the effect never comes back, or an error when exporting.

What I saw:

---

## Good to know

- **The copy stays on the phone for a little while.** After the share sheet closes, Clipy keeps its temporary copy until the
  next time you save or open a project file, or the next time Clipy starts. So free space comes back then, not at once. This
  is on purpose: it makes sure the app you shared to has finished reading the file.
- **Saving to Files needs the space twice** for a moment (Clipy's copy and the one Files makes).
- **The address fix cannot be tried on purpose.** It only matters when iOS moves Clipy's storage, which you cannot make
  happen. It is covered by automatic tests. If you ever restore to a new phone, your projects should simply open.
- **Not built:** automatic backup, iCloud backup of all projects, and opening Clipy by tapping a `.clipy` file in Files (you
  open it from inside Clipy with the folder button).
