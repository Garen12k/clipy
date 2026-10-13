# Project backup and the path fix — design

Date: 2026-10-13. Branch: `project-backup` (from `main` @ 61af00c). Research: `docs/superpowers/research/2026-10-13-project-backup.md`.
Plan: `docs/superpowers/plans/2026-10-13-project-backup.md`.

The owner approved three things from a drawing:

- **A. Save a Copy** — a button in the project actions sheet packs ONE project into one file, `<name>.clipy`, shows a small progress
  state, then opens Apple's share sheet.
- **B. Open Project File** — a folder button in Home's header pill opens Apple's file picker; the chosen file comes back as a NEW project.
- **C. The path fix** — project files are stored as absolute paths; if iOS moves the app's container every project opens with all
  media missing. On load, every file reference is re-pointed at wherever the project's folder really is. C matters more than A and B
  and ships by itself (plan Task 1).

No native code, no new package, no `app.json` change, no schema bump. Nothing here reaches the TestFlight app before the next build
(there is no `expo-updates`); until then it runs in Expo Go.

## 0. What was verified in the tree (not taken from the research on trust)

| Claim | Where it was read |
|---|---|
| `FileHandle { close(); readBytes(length); writeBytes(bytes); offset; size }`, `File.open(mode?)`, `FileMode.Truncate = "wt"`, all synchronous | `node_modules/expo-file-system/build/File.types.d.ts:49-86`, `internal/NativeFileSystem.types.d.ts:210` |
| A write handle is `FileHandle(forWritingTo:)` — **the file must exist before `open`** | `node_modules/expo-file-system/ios/FileSystemFileHandle.swift` |
| `File.pickFileAsync()` → `{ result: File, canceled: false } \| { result: null, canceled: true }`; picker is `UIDocumentPickerViewController(forOpeningContentTypes: [.item], asCopy: true)` — ONE temporary copy; the new-style call turns **every** error into `canceled: true` | `build/File.d.ts:48`, `src/File.ts:110-137`, `ios/FilePickingUtils.swift:71-86` |
| `Directory.move(destination)`: a destination directory that does not exist yet becomes the moved directory (a rename) | `ios/FileSystemPath.swift:50-92` |
| The reader exists and has run live: `openReader(uri): ChunkReader { size; read(offset, length); close() }` | `src/publish/fileReader.ts` |
| Only `Clip.sourceUri` (clips, layers) and `AudioTrack.sourceUri` hold a file reference | `grep -oE '[A-Za-z]*(Uri\|Url\|Path\|File)\??: *string' src/editor/model/types.ts` → `sourceUri: string` twice, nothing else |
| `migrateProject` refuses a higher `schemaVersion`: "This project was made with a newer version of Clipy. Update the app to open it." | `src/editor/model/migrate.ts:156` |
| Cache file names come from the source's STEM, never its full path (`soundFileName`, `peaksFileName`, cut-out / steady `stemOf`); the cover file too (`coverFrame`) | `src/editor/model/sound.ts:121`, `peaks.ts:75-77`, `cutout.ts:45`, `steady.ts:58`, `src/projects/storage.ts:28-31` |
| The Home card shows the cover file if it exists, else `thumb.jpg`; `writeCover` runs only when the editor is left | `storage.ts:131-133`, `src/editor/useLoadProject.ts:24` |
| `duplicateProject` keeps item ids and base names, clears `posts`, names the copy `<name> copy` | `storage.ts:140-167` |
| `formatBytes` exists | `src/export/estimate.ts:67` |
| Home tests mock `@/src/projects` as `{ storage: {…} }` only; two of them pin the header's buttons as `["Post a video", "Accounts"]` | `src/projects/__tests__/home.glass.test.tsx:77`, `home.layout.test.tsx:52` |

Baseline on this branch (2026-10-13): `npm run typecheck` clean. `npx jest -w 8`: 386 suites, 6052 tests, all pass (52 s).
`npm run test:server`: 21 suites, 591 tests, all pass. Plain `npm test` (28 workers) times out in 4 heavy suites
(`EditorToolbar*.test.tsx` ×3, `AccountsScreen.test.tsx`; 7 tests, "Exceeded timeout of 5000 ms") and then never reaches the server
suite — so the check for every task is `npx jest -w 8` and `npm run test:server`.

## 1. The path fix

### 1.1 Rule

`rebaseProject(project, dirNow)` — a pure function in a new file `src/projects/rebase.ts`:

1. A reference that already starts with `dirNow + "/"` is left as it is (the common case: one `startsWith` per item).
2. Otherwise, if it contains `/projects/<project.id>/`, everything up to and including the LAST such marker is replaced by
   `dirNow + "/"`; the relative part after it (`media/x.mov`) is kept character for character.
3. Otherwise (a reference outside the project's folder, another project's folder, not a string) it is left alone.

Covered fields — an **explicit list**: `project.clips[].sourceUri`, `project.layers[].sourceUri`, `project.audioTracks[].sourceUri`.
These are all there are (table above). A generic scan of every string in the document was rejected: it would also rewrite a text
overlay that happens to contain such a path, and it hides what the model really stores. The explicit list is kept honest by a guard
test that reads `types.ts` and fails when a second `*Uri` / `*Url` / `*Path` / `*File` string field appears.

The cover picture, `thumb.jpg` and the four cache folders are not in the document: their paths are computed from `projectDir(id)`
each time, and their names from the source's stem — a moved container keeps every cache valid.

### 1.2 Where

In `storage.ts`, in ONE private reader, `read(id) = rebaseProject(parse(text), projectDir(id))`, used by `loadProject` and
`listProjects` (so `renameProject` and `duplicateProject`, which go through `loadProject`, get it too). Not in `parse` /
`migrateProject`: the model does not know where folders are, and `migrate.ts` and its PROOF tests stay untouched. `dirNow` is the
folder the file was read from; the marker uses the document's own `id` (the two are equal for every project the app has made).

### 1.3 Not written back

The rebased project lives in memory only. `project.json` is rewritten by the next ordinary save (an edit's autosave, the flush on
leaving the editor when dirty, a rename). Reasons: `listProjects` runs every time Home comes to the front and must never write;
loading must never write (the editor's rule; a failed write on a just-restored phone would turn a readable project into a risk);
nothing is gained — the rule is idempotent and costs one string comparison per item on every load, for ever. Undo is not touched:
the rebase happens before `setProject`, so every history entry already holds the new references, and the load does not set `dirty`.

Stored references stay ABSOLUTE. Storing them relative was rejected: a build without this fix (build 8) reading such a file would
show every item missing. Absolute plus rebase-on-load reads old files, and old builds read new files. The existing pin
`project.clips[0].sourceUri === ${documentDir}projects/id1/media/id2.mov` in `storage.test.ts` therefore stays true and is not edited.

### 1.4 Properties (each a test)

- No-op: when nothing moves, `rebaseProject` returns THE SAME OBJECT, and each untouched list keeps its identity.
- Idempotent: `rebase(rebase(p)) === rebase(p)`.
- PROOF (`storage.load.proof.test.ts`, written and green BEFORE the change, never edited afterwards): a project made today loads to
  exactly `migrateProject(JSON.parse(text))`, with the literal references it has today; `loadProject` and `listProjects` call no
  write, copy, move or remove; the bytes of `project.json` are the same afterwards.
- A moved container: a document whose references sit under another container's `…/projects/<id>/` loads with today's references,
  reports nothing missing, leaves the file on disk as it was, and the next save writes today's references. `duplicateProject` works
  after a move.

## 2. The file format `.clipy` (format version 1)

Pure JavaScript, in `src/projects/projectFile.ts` — a module with no import but types. Everything is read and written through
`ChunkReader` (existing) and a new `ChunkWriter`, in chunks, so no file is ever in memory.

### 2.1 Byte layout — all integers little-endian

| Offset | Length | Content |
|---|---|---|
| 0 | 8 | magic, ASCII `CLIPYPRJ` |
| 8 | 4 | format version, uint32 = `1` |
| 12 | 4 | header length `H`, uint32, `2 ≤ H ≤ 8 388 608` (8 MiB) |
| 16 | `H` | the header: JSON in ASCII (every character above U+007F written as `\uXXXX`) |
| 16 + H | Σ sizes | the files' bytes, one after another in the header's order, no padding, no separators |
| end − 16 | 8 | end magic, ASCII `CLIPYEND` |
| end − 8 | 8 | the whole file's length in bytes, uint64 (low uint32, then high uint32) |

Total length = `16 + H + Σ files[i].size + 16`.

The header is ASCII so the module needs no `TextEncoder` / `TextDecoder` (not verified in the phone's JavaScript engine): a byte is a
character code, `JSON.parse` restores every name and every text in any script.

### 2.2 The header

```json
{ "app": "clipy", "schemaVersion": 21, "savedAt": "2026-10-13T10:00:00.000Z", "name": "Beach trip",
  "project": { "…the project document, every sourceUri RELATIVE: \"media/<base name>\"…" },
  "files": [ { "path": "media/7f3c….mov", "size": 734003200 }, { "path": "thumb.jpg", "size": 18211 } ] }
```

- `files[].path` is exactly `thumb.jpg` or `media/<name>`; `<name>` is 1–255 characters with no `/`, no `\`, no control character,
  and is not `.` or `..`. Paths are unique; sizes are whole numbers ≥ 0; at most 10 000 entries. Nothing in a file can name a place
  outside the new project's folder.
- **No checksum.** Hashing every byte in JavaScript would at least double the time on the one thread the app has, `File.md5` reads a
  whole file and cannot cover a stretch of the archive, and the failure that really happens — a transfer that stopped — is caught
  exactly by the sizes plus the trailer. A checksum can come with format version 2.

### 2.3 What a reader says

| Finding | Meaning |
|---|---|
| shorter than 16 bytes, or the first 8 bytes are not `CLIPYPRJ` | **not a Clipy project file** (`notClipy`) |
| magic right, format version > 1 | **from a newer version of Clipy** (`newer`) |
| header's `schemaVersion` > this app's `SCHEMA_VERSION`, or `migrateProject` says "newer version" | **newer** |
| magic right and: version 0; `H` out of range; file shorter than `16 + H + 16`; header not ASCII / not JSON / not of the shape above; file length ≠ the total; end magic wrong; trailer length ≠ file length; `migrateProject` refuses the document | **damaged** (`damaged`) |

All of this is decided from the first 16 bytes, the header and the last 16 bytes — before a single byte is written.

### 2.4 Included and left out

| In the folder | In the file? | After opening |
|---|---|---|
| `project.json` | yes, as the header's `project` (relative references) | written LAST |
| `media/*` that a clip, a layer or a sound refers to | yes — each file ONCE (split clips and extracted sound share a file), base name kept | — |
| `thumb.jpg` | yes (small; nothing re-makes it on load) | if the file has none, `writeThumb` makes it |
| `cover-*.jpg` | no | `writeCover` is run at the end of opening, so the card shows the cover at once |
| `sound/` | no | `ensureSound` renders a copy again when the editor or the export needs it |
| `cutout/`, `steady/` | no | `openCutouts` / `openSteady` find none; the queues render again once the project stands still |
| `peaks/` | no | `useWaveforms` listens again |
| media in the folder that nothing refers to | no | — |

A reference whose file is missing, or that is not `<project folder>/media/<safe name>`, is not packed; it is written as
`media/<base name>` and so is missing in the opened project exactly as it is in the original. The count is reported (§5).

**Posts are kept.** `duplicateProject` clears them because a duplicate is a new draft to change; a project file is the project as it
was, and "Posted to …" is a true record of it (public links only, no account, no token). Nothing in the app acts on a post record
except the card's badges.

## 3. Writing and reading

- `ChunkWriter { write(bytes): void; close(): void }`, `openWriter(uri)` in a new `src/projects/fileWriter.ts`, beside the reader:
  create the parent folder and the (empty) file, `open(FileMode.Truncate)`, `writeBytes`. Only whole arrays are handed to
  `writeBytes`, never a `subarray` view.
- **Chunk: 2 MiB** (`PROJECT_FILE.chunk`, one constant; to be tuned on a phone). After EVERY chunk the loop awaits a zero timer
  (`setTimeout(0)` — a real turn of the event loop, so a touch on Cancel and a redraw get through; a resolved promise would not).
- Progress is the count of body bytes copied, reported after every chunk; the screen redraws only when the whole percent changes.
- Cancel is a flag (`run.cancelled`) read before every chunk; it ends the copy with `ProjectFileError("cancelled")`.
- **Saving** writes `<cache>/project-files/part-<run id>.clipy`, and only when the trailer is written and the handle closed moves it
  to `<cache>/project-files/<run id>/<file name>` — a folder per run, so the name in the share sheet is exactly the project's.
- **Opening** writes into `<documents>/incoming/<new id>/` (never listed), `project.json` last, then moves the whole folder to
  `<documents>/projects/<new id>` in one rename. A half-opened project can therefore never appear on Home as "Can't open".
- **Clean-up.** On success, failure and cancel the run removes its own temporaries (the part file / the staging folder; the handle
  is closed first). `sweepProjectFiles()` removes `<cache>/project-files` and `<documents>/incoming` whole: once per launch (when
  the storage is made), at the start of every run, and after the share sheet closes. Only one run exists at a time (Home's guard, §5).
- **Suspended or killed.** Suspended: the loop simply stops and goes on when Clipy is in front again (nothing on screen promises
  work in the background). The screen is kept awake while a run is on (`useStayAwake`, the export's own helper). Killed: the part
  file or the staging folder is left and the next launch sweeps it; no project is harmed — saving only reads, and opening only adds.
- **Free space** (`fs.freeBytes()`), asked before anything is written, with 100 MB to spare (`PROJECT_FILE.spare`):
  saving needs the file's total length; opening needs the sum of the file sizes (iOS's temporary copy of the picked file is already
  on disk by then).
- `await lastFlush` before a project is read for saving, as the list does.

## 4. Opening (restore)

1. Pick: `File.pickFileAsync()` with no type filter (a `.clipy` has no registered type) — one temporary copy, not the two that
   `getDocumentAsync({ copyToCacheDirectory: true })` makes. It is validated by its bytes, not its name. The temporary copy is
   deleted when the run ends, however it ends.
2. `readHeader` (§2.3), the schema check, then the document — with a NEW id from `deps.newId()` and every reference pointed at
   `<projects>/<new id>/media/<base name>` — goes through `migrateProject` (an older file is upgraded as on any load).
   Item ids and file base names are kept (speech bars are recognised by file name; cache names come from the stem).
3. Free space.
4. Name: the stored name if no listed project has it; else `<name> copy`; else `<name> copy 2`, `copy 3` … (the duplicate's word).
   `createdAt` is kept; `updatedAt` is now, so the project arrives at the top of the list.
5. Files (chunked, §3), `project.json`, the folder move, then `writeThumb` if needed and `writeCover` (both best effort).
6. Any failure or a cancel before the move removes the staging folder: nothing was added, and no existing project is ever touched.

## 5. The screen

**Actions sheet** (`ProjectActionsSheet`): Rename / Duplicate / **Save a Copy** / Delete. Save a Copy is a `SecondaryButton`, hidden
for a broken project like the first two, and starts `AFTER_SHEET_MS` after the sheet closes (iOS drops a system sheet presented
while a Modal is still leaving).

**Header pill**: a third `IconButton` between the two there — Post a video, **Open Project File** (`folder-open-outline` → SF Symbol
`folder`), Accounts. It is a child of the same `Glass` pill: the pill's style object is not edited, the glass count stays three.

**Progress** — the Home pattern, not a Sheet. While a run is on, Home is inert exactly as while a project is made (header and list
take no touches and are dimmed) and the two bottom actions give way to ONE card, `home-transfer`:

```
Saving a copy                         Cancel
Beach trip · 2.1 GB
▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

A Sheet was rejected: it is a Modal, it can be dismissed by its backdrop or a swipe while the copy runs, and the share sheet could
not be presented until it had finished closing. The card is plain views: the `bar` step, a 4-pt track in the `tile` step with the
fill in `accentInk` — its width a style value, nothing animated. Title: "Saving a copy" / "Opening project file" (sentence style).
Second line: the name, then the size from 1 MB up. Cancel is a compact `QuietButton` in the card. VoiceOver: the two lines are one
element; the bar is a `progressbar` with its percent.

The run shares Home's two guards (`starting`, `creating`) with New Project and Quick Edit, so none of them can run together; the
guard is held until the share sheet has closed.

**Strings**

| When | What |
|---|---|
| sheet button | `Save a Copy` |
| header button (accessibility label) | `Open Project File` |
| card titles | `Saving a copy` · `Opening project file` |
| card button | `Cancel` |
| opened (toast) | `<name> was added to your projects` |
| saved | nothing — Apple's share sheet is the confirmation, and the app cannot know what was chosen in it |
| saved, but files were missing (toast, after the share sheet) | `1 file of this project is missing and is not in the copy` / `<n> files of this project are missing and are not in the copy` |
| cancelled | nothing |

Failures are a system alert (title, message, OK) — they carry numbers or something to do, and a toast is gone in 2.5 s:

| Case | Title | Message |
|---|---|---|
| not a Clipy file | `Can't open this file` | `That isn't a Clipy project file.` |
| damaged | `Can't open this file` | `This project file is damaged or incomplete.` |
| newer | `Can't open this file` | `It was made with a newer version of Clipy. Update the app to open it.` |
| no room to open | `Not enough free space` | `Opening this project needs <need>. This iPhone has <free> free.` |
| any other failure to open | `Can't open this file` | `Something went wrong while opening it. Nothing was added.` |
| no room to save | `Not enough free space` | `Saving a copy needs <need>. This iPhone has <free> free.` |
| any other failure to save | `Couldn't save a copy` | `Something went wrong while saving. Try again.` |
| the share sheet cannot be shown | `Couldn't save a copy` | `The share sheet couldn't be opened. Try again.` |

**The file's name**: the project's name with `\ / : * ? " < > |` and control characters turned into spaces, runs of spaces
collapsed, leading dots removed, at most 80 characters, `Clipy project` if nothing is left — plus `.clipy`. The share sheet is
`Sharing.shareAsync(uri)` with no options (iOS types the file by its extension; an unregistered `.clipy` is a plain data file).

## 6. Tests without a phone

- `projectFile.test.ts` — the format, with in-memory readers and writers: round trip (several files, an empty file, names in
  Arabic and emoji); the exact bytes of a tiny file; truncation at EVERY length from 0 to total − 1 (never anything but `notClipy`
  or `damaged`, and nothing extracted); one byte too many; wrong magic; format version 2 and 0; header length 0 and over the cap;
  a non-ASCII byte in the header; unsafe paths (`../x`, `media/..`, `media/a/b`, a duplicate, a negative or fractional size);
  arithmetic with fake sizes over 4 GiB (a reader that hands out zeros, a writer that only counts — the trailer's high word); a
  short read; cancel half-way; progress that only grows and ends at the total.
- `rebase.test.ts`, `storage.load.proof.test.ts`, `rebase.guard.test.ts` — §1.4 and the field guard.
- `storage.file.test.ts` — with `memoryFs` (given byte reading and writing): pack → restore round trip; shared files packed once;
  caches and cover left out; a missing file counted; not enough room in both directions (and nothing written); cancel and failure
  leave no temporary and no project; the sweep; a new id, the kept base names, the name rule; posts kept; an older schema upgraded,
  a newer one refused; `project.json` written last; the cover picture made.
- Screen: `ProjectActionsSheet` (the button, hidden when broken, waits for the sheet), `TransferCard`, and Home (`homeFile.test.tsx`:
  inert and dimmed while a run is on, the card and Cancel, the share sheet called with the file and the sweep after it, every alert,
  the toast, the picker closed = nothing, no second run while one is on). The two tests that pin the header's buttons are updated
  to the three labels; the glass tests otherwise pass unedited.

## 7. Only a phone can show (the owner's checklist)

1. Speed: how long Save a Copy and Open take for a real project of about 500 MB and one of about 2 GB, and whether the bar and
   Cancel stay alive meanwhile (the 2 MiB chunk is a guess).
2. That `writeBytes` writes at all on the device, and that an opened project's videos PLAY (the bytes arrived whole).
3. That the picker's temporary copy can be read (`File.open` on the path iOS hands back), from Files on the phone and from iCloud
   Drive, and that it is gone afterwards.
4. That moving the finished folder into place works (`Directory.move`), and the new project is at the top of Home with its picture.
5. The share sheet: the file is called `<name>.clipy` (try a name with a space, an Arabic name, an emoji); Save to Files, iCloud
   Drive and AirDrop each give a file that opens again; a large AirDrop or Save to Files is COMPLETE when the sheet closes (the
   temporary file is removed then).
6. A `.clipy` cannot be picked as greyed-out: the picker lets it be chosen.
7. Leaving Clipy in the middle of a save and of an open, and coming back: it goes on and finishes. Auto-Lock does not interrupt.
8. Force-quitting in the middle of each, then opening Clipy: no half project on Home, storage given back.
9. Almost-full phone: the "Not enough free space" alert shows sensible numbers.
10. Free space really returns after a save (Settings → iPhone Storage), i.e. the temporary copy is gone.
11. The folder button's symbol, and the pill with three buttons, in light, dark and with glass; the card in light and dark.
12. After opening a project that used Remove background, Stabilize or Voice / Sound: the copies are made again by themselves
    (TestFlight build only — not in Expo Go).
13. The path fix itself cannot be forced on a phone at will; it is settled by the tests. If a restore to a new phone ever happens,
    the projects should simply open.

## 8. Out of scope

Automatic or iCloud backup of all projects; opening Clipy by tapping a `.clipy` in Files or AirDrop (needs a build-time plist
change); compression; encryption; backing up anything on the server (accounts, post history); several projects in one file;
showing the Documents folder in the Files app; a native (Swift) writer.
