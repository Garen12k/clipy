# Undo history kept with the project — design

Date: 2026-10-13. Branch: `undo-history` (from `next-build` @ f3ed505). Plan: `docs/superpowers/plans/2026-10-13-undo-history.md`.

The owner said "keep going" to this proposal: today the editor's Undo and Redo live only in memory, so leaving the editor wipes
them and a mistake noticed after reopening a project cannot be undone. The undo history is to survive closing and reopening a
project, and an app restart, **without ever risking the project itself**.

Nothing new is on screen. No native code, no new package, no `app.json` change, **no schema bump**, nothing in `project.json`.
It works in Expo Go.

## 0. What was read in the tree

| Fact | Where |
|---|---|
| The stacks are `past: Project[]` / `future: Project[]`, each entry a whole project object; `HISTORY_LIMIT = 50` | `src/editor/store.ts:6, 28-29` |
| A step is pushed by `apply` (`:101-107`) and by `beginTransaction` (`:108-112`, the snapshot a drag's `applyTransient` frames are measured against — it pushes WITHOUT changing the project and without `dirty`); both clear `future` | `store.ts` |
| `undo` / `redo` restore a snapshot through `withLive` — **post records and export settings are not undone**, the live ones are carried onto the snapshot (`:94-96, 133-144`). The cover and the name ARE undone (the editor's Rename is `apply`, `EditorTopBar.tsx:24`) | `store.ts` |
| `setProject` (`:100`) and `reset` (`:177`) spread `initial`: both stacks empty. Nothing else empties them | `store.ts` |
| `dirty` = "the store's project is newer than `project.json`": set by every change (`afterChange` `:75`, `addPostRecord`, `setExportSettings`), cleared by `markSaved` after an autosave | `store.ts`, `useAutosave.ts:16` |
| Autosave: 500 ms after the last change, `storage.saveProject(latest)`. Save on leave: the load hook's cleanup saves if `dirty` (or an empty text was dropped), then `writeCover`, and publishes the promise as `lastFlush`, which Home awaits before listing | `useAutosave.ts`, `useLoadProject.ts:15-26`, `flush.ts`, `useProjects.ts:26` |
| `saveProject` is atomic: `project.json.tmp` then `move` | `src/projects/storage.ts:41-46` |
| The one reader: `rebaseProject(migrateProject(JSON.parse(text)), projectDir(id))` — migrated (an idempotent sanity pass that "runs on EVERY load", `migrate.ts:108`) and every `sourceUri` re-pointed at where the folder is now, in memory | `storage.ts:37-39`, `rebase.ts:20-36` |
| The model's only file references are `Clip.sourceUri` (clips, layers) and `AudioTrack.sourceUri` | `rebase.guard.test.ts` |
| The Undo / Redo buttons subscribe with selectors — `useEditorStore((s) => s.past.length > 0)` — so they light up by themselves when the stacks are filled | `TransportRow.tsx:31-32` |
| The message bar goes when `past` or `future` changes identity | `MessageBar.tsx:57-59` |
| `packProject` writes only the document, each `media/` file once and `thumb.jpg`; `duplicateProject` copies only the source files, `thumb.jpg` and cover pictures; `deleteProject` removes the folder | `storage.ts:212-249, 144-171, 301` |
| Home's rename is load → save with a new `name` / `updatedAt` | `storage.ts:182-185` |

### 0.1 Media lifetime — the finding

**No code deletes a file in `<project>/media/` that a project has ever referenced.** Every delete in the app (`fs.remove`,
`expoFs.remove`, `File.delete()`), exhaustively:

| Where | What goes |
|---|---|
| `storage.ts:79` `writeCover` | old `cover-*.jpg` pictures |
| `storage.ts:100, 110, 120` | the destination of an import / a still that FAILED (never referenced) |
| `storage.ts:199-204, 244-245, 289-290` | the cache's `project-files/`, `incoming/`, a half-made new project |
| `storage.ts:301` `deleteProject` | the whole folder |
| `useReadAloud.ts:70` `forget` | a speech file that was never placed (stopped, late, refused) — a placed or replaced one is never deleted ("Undo needs it") |
| `soundRenders.ts:229` `sweepSounds`, `soundPeaks.ts:211` `sweepPeaks`, `cutoutRenders.ts:303` `openCutouts`, `steadyRenders.ts:353` `openSteady` | CACHE copies in `sound/`, `peaks/`, `cutout/`, `steady/` that the open project does not need — each says "never touches a media file" |
| `expoFs.ts`, `filePhone.ts:17` | the adapter itself; the picker's temporary copy |

Deleting a clip, replacing media, removing a voice-over, extracting a clip's sound: none removes a file. So within a session an
undo can never land on a missing file, and a restored history cannot either — unless a file is lost from outside (a damaged
restore of the phone). §5 covers that case anyway.

The four sweeps DO use "needed by the open project" as their test, and three of them say in a comment "(there is no undo history
then)". With this feature there may be one. What they remove is a rendered COPY, never a source: an undo into a state whose copy
was swept makes the copy again through the existing queues (`ensureSound`, `ensureCutout`, `ensureSteady`, `useWaveforms`), with
the Preview tag showing meanwhile, exactly as when the setting is switched on for the first time. **The sweeps are not changed**
(§5); only the three comments are corrected.

### 0.2 Size — measured

`JSON.stringify` of projects built with the model's own factories and passed through `migrateProject` (a temporary Jest test,
not committed):

| Project | One snapshot | Steps that fit in 4,000,000 characters |
|---|---|---|
| 5 clips, 2 texts, 1 song | 7 KB | 50 (the step cap) |
| 12 clips, 5 texts, 40 captions of 8 words, 3 sounds, 120 beats | 51 KB | 50 |
| 40 clips with pins, 150 captions, 6 sounds, 300 beats | 183 KB | 21 |
| 80 clips with pins, 400 captions of 10 words, 12 sounds | 521 KB | 7 |

A caption with word timings is about 1 KB; captions decide the size. In memory the stacks share every unchanged clip between
snapshots; written out, each snapshot is whole — that sharing is lost on disk and, after a restore, in memory too.

## 1. Decisions

1. **Whole snapshots, one per line, with a step cap and a size cap** (option a). Not de-duplicated, not deltas: a delta or a
   shared pool is only correct if every piece is, and a subtly wrong history is the one outcome this feature must make
   impossible. If a phone shows that long captioned projects keep too few steps, a pool of shared items is the next step (§9).
2. **A separate file**, `<project>/history.jsonl`, never inside `project.json` (the repo's rule for everything that is not the
   document: peaks, copies, covers).
3. **Tied to the exact `project.json` it was saved beside by a stamp** (§3). No match → the history is dropped, silently.
4. **Written when the editor is left and when the app stops being active** — not per edit. Always after the project itself is
   safely saved, never able to fail or delay that save.
5. **Both stacks are kept** (undo and redo): someone who undid ten steps and left finds their way forward again.
6. **Read lazily**, 400 ms after the editor is on screen, one snapshot per turn of the event loop.
7. **A history from another schema version is dropped whole**; every snapshot of a matching one still goes through
   `migrateProject` and `rebaseProject`, exactly like a project.
8. **A copy starts empty**: Save a Copy (`.clipy`), Open Project File and Duplicate carry no history.
9. **`HISTORY_LIMIT` (50) in memory is unchanged**, and so is everything about what a step is.

## 2. The file

`<project>/history.jsonl` — UTF-8 text, lines joined by `\n` (no trailing newline). `JSON.stringify` never emits a raw line
feed, so one line is one JSON value.

```
line 1          {"app":"clipy-history","version":1,"schemaVersion":21,"projectId":"<id>","stamp":"<stamp>","past":N,"future":M}
lines 2 … N+1   the undo stack, OLDEST first — the store's `past` in its own order
lines N+2 …     the redo stack, NEAREST first — the store's `future` in its own order
```

A snapshot line is `JSON.stringify(project)` of the object that was in the stack: the same text `saveProject` would write for it,
absolute references included.

Constants (`HISTORY_FILE` in `src/projects/history.ts`): `name: "history.jsonl"`, `app: "clipy-history"`, `version: 1`,
`maxSteps: 50` (pinned equal to `HISTORY_LIMIT` by a test), `maxChars: 4_000_000`, `maxBytes: 12_000_000` (a UTF-16 unit is at
most 3 bytes of UTF-8: a file bigger than this is not ours and is not even read).

**Caps** (`fitHistory`): the newest 50 undo steps and the nearest 50 redo steps; then, while the snapshot lines together (each
plus its line feed) exceed `maxChars`, the OLDEST undo step goes; when no undo step is left, the FARTHEST redo step goes. Redo is
kept in preference because it is the user's newest work. A single snapshot larger than the cap keeps nothing (no file).

A snapshot is serialised once in its life: `lineOf(snapshot)` remembers the line in a `WeakMap` keyed by the object. This relies
on what the store already guarantees — a project object in a stack is never mutated (every op returns a new object).

## 3. The safety rule — the stamp

`stampOf(text)` = `"<length>.<FNV-1a 32 of the UTF-16 units, hex>.<djb2 32 of the same, hex>"`.

- **Writing.** The history's stamp is `stampOf(JSON.stringify(project))` of the project it belongs to. `saveHistory` is called
  only after `saveProject(project)` of the same object has resolved, and it does not take that on trust: it reads `project.json`
  back and writes the history **only if the stamp of what is on disk equals it**. Otherwise it writes nothing and the old file,
  if any, stays (it will fail its own check on the next load).
- **Reading.** `loadProject` returns, with the project, the stamp of the very text it parsed. `loadHistory(project, stamp)`
  accepts a history only if its header carries that stamp, that project id, this app's `schemaVersion`, and this file version.
  The stamp comes from the read that produced the project in the editor — not from a second look at the disk — so a save that
  lands between the two reads cannot pair a history with the wrong project.

So a history is applied only to the project text it was written beside, byte for byte. Anything else rewrote `project.json`
since — an autosave after which the app was killed without becoming inactive, Home's rename, an older app version — and the
history is dropped. **A wrong history is impossible; an absent one is fine.**

Dropping never deletes: `loadHistory` writes nothing and removes nothing. A dead file is replaced by the next write.

## 4. Writing

Storage (`src/projects/storage.ts`):

```ts
saveHistory(p: Project, past: readonly Project[], future: readonly Project[]): Promise<boolean>
```

Never throws; `false` when nothing was written. Steps: stamp check against the disk (§3) → `fitHistory` → nothing left →
`fs.remove(history.jsonl)`, `false` → else `writeText(history.jsonl.tmp)`, `move` onto `history.jsonl` (atomic, like the
project) → `true`. Any failure is `console.warn("history save failed", e)` and `false`: the old history or none remains.
`saveProject` is not edited.

The editor (`src/editor/historyKeeper.ts`, the only caller of `saveHistory` / `loadHistory` besides the leave below):

- `historyStale(s)`: there is something to write — the project is open, a stack is non-empty, and the triple
  (`project`, `past`, `future`, compared by identity) is not the one the file was last written from or restored as. Opening a
  project and leaving it untouched writes nothing, with or without a restored history.
- **On leave** (`useLoadProject`'s cleanup, the existing flush): when stale, the project is saved even if it is not `dirty` (a
  `beginTransaction` without a change grows `past` without `dirty`, and the stamp must be of what is on disk), then the history,
  then the cover — `saveProject → saveHistory → writeCover`, inside `lastFlush`. History comes before the cover because the
  cover waits for a thumbnail. A failed project save skips the history (the chain's existing `catch`).
- **When the app stops being active** (`AppState` change to anything but `active`; listener added by `useLoadProject`, removed
  on leave): `keepHistoryNow()` — when stale: `saveProject(project)`, `markSaved()` if the store still holds that object,
  `saveHistory`. This is what makes a force-quit keep the history: the app is `inactive` in the app switcher before it is
  swiped away. It also fires for Control Centre, a system alert, a call; each such write is skipped when nothing changed since
  the last one, and is cheap when something did (one new line serialised, the rest remembered).
- Not written: per edit, per autosave, during a drag, on a timer.

A kill with no `inactive` first (a crash, the system ending a suspended app after an autosave that came later than the last
history write) leaves a history whose stamp is older than the project: dropped on the next open.

## 5. Reading

```ts
loadProject(id): Promise<{ project: Project; missingSourceUris: string[]; stamp: string }>
loadHistory(project: Project, stamp: string, pause?: Pause): Promise<{ past: Project[]; future: Project[] } | null>
```

`loadHistory` never throws (`console.warn("history load failed", e)`, `null`). In order — anything odd drops ALL of it:

1. `fs.size(history.jsonl)`: absent → `null` (quietly, no warning); over `maxBytes` → `null`.
2. `decodeHistory(text, project.id, SCHEMA_VERSION, stamp)`: the header must be an object with exactly this `app`, `version`,
   `schemaVersion`, `projectId` and `stamp`; `past` and `future` integers 0 … 50, not both 0; the number of lines exactly
   `1 + past + future` (a cut-off file fails here); no empty line; the text no longer than `maxChars + 4096`.
3. Each snapshot, after `await pause()` (a real turn — `nextTurn` of `projectFile.ts` — so touches and frames get through):
   `JSON.parse`; it must be an object whose `id` is the project's and whose `schemaVersion` is exactly `SCHEMA_VERSION`; then
   `rebaseProject(migrateProject(raw), projectDir)` — the same sanity pass and the same re-pointing a project gets. A line that
   does not parse, is not this project's, or throws in `migrateProject` → `null` for the whole history. `undoAutoFit` is NOT
   applied (it repairs what a withdrawn build saved; a snapshot is what the editor held).
4. **Media.** A reference that the opened project itself has is fine (present, or already reported in `missingSourceUris`).
   Any other reference is checked once with `fs.exists`. The undo stack keeps the newest run of snapshots whose files are all
   there (it is cut at the newest snapshot with a missing file, that one and everything older going); the redo stack keeps the
   nearest run (cut at the first one with a missing file). So an undo or redo never lands on a file the editor was not already
   told is missing, and `missingSourceUris` stays true without being recomputed.
5. Both stacks empty → `null`.

The store gains one action:

```ts
restoreHistory(loaded: Project, past: Project[], future: Project[]): boolean
```

It sets `past` (`slice(-HISTORY_LIMIT)`) and `future` (`slice(0, HISTORY_LIMIT)`) and nothing else — not `dirty`, not the
selection, not the playhead — and only if **the store's project is still the very object that was loaded and both stacks are
still empty**. If the user has already changed anything in the half second before the history arrives, it returns `false` and
the old history is given up (the new session's own steps are written over it on leave). No merge: simple and safe.

`restoreAfterOpen(opened, stamp)` (historyKeeper): cancels any earlier one, waits `HISTORY_READ_DELAY_MS` (400), calls
`loadHistory`, and applies the answer only if the editor has not been left or pointed at another project since (`epoch`).
`forgetHistory()` (leave, another project) cancels the wait and forgets what was written.

**Opening is not slower:** the project is read, migrated and shown exactly as today; the only addition before the editor
appears is `stampOf` over the text already in hand (one pass over at most a few hundred KB). The history is read after the
first frames, in pieces.

**What lights up:** `TransportRow` reads `s.past.length > 0` / `s.future.length > 0` through selectors, so Undo and Redo become
enabled the moment `restoreHistory` runs. Nothing else on screen changes. The message bar's rule "goes when the history
changes" would cut a message that is up at that moment; no message is said while a project opens today (checked: neither the
route nor `useLoadProject` calls the toast) — the reviewer of Task 3 confirms it.

**What a restored step does:** exactly what an in-session one does — `undo` / `redo` are not edited. Post records and export
settings stay live (`withLive`).

**Sweeps** (`sweepSounds`, `sweepPeaks`, `openCutouts`, `openSteady`): unchanged. They run when the project opens, before the
history is there, against the open project; a copy only an older step needs goes and is rendered again if the user undoes
into that step. Counting the history's references would mean reading the history before anything may be swept or rendered —
opening would wait for it — to save a re-render in a rare case. The three comments that say "(there is no undo history then)"
are corrected to say what is true now. `cutoutRenders.test.ts` is not touched.

## 6. What is NOT restored

The selection, the playhead, the zoom, the open tool, multi-select, a drag in progress, what a recording or a reading was
doing, the session's memory of beats and shake measurements, the message bar. Opening a project looks exactly as it does today;
only Undo (and Redo, if steps were undone) is lit.

## 7. Limits (for the owner, plainly)

- Up to 50 steps, the same as while editing; they are kept with each project on this phone. A very long project with hundreds
  of captions keeps fewer — the most recent ones (about 20 at 150 captions, about 7 at 400).
- A saved copy (`.clipy`), an opened project file and a duplicate start with no history. Renaming a project from the home
  screen forgets its history; so does an update of the app that changes the project format.
- If the app crashes outright, the history of that project may be gone on the next open — the project itself never is.

## 8. Tests without a phone, and the phone's checklist

Jest (plan Tasks 1–2): the pure module (stamp, caps, encode / decode with every refusal), storage on `memoryFs` (round trip;
the stamp check on write; every way a file can be wrong → `null` and nothing written; rebase; the media cut; a failing disk;
duplicate / pack / delete), the store's `restoreHistory` (the identity rule; not dirty; undo and redo work on restored steps and
keep live posts / export settings), the keeper (stale rule, delay, epoch, never throws), the load hook (leave writes project →
history → cover; inactive writes; an untouched open writes nothing), and a guard that pins the list of files that may delete
anything.

Phone (the owner; one line each in `docs/undo-history-phone-checklist.md`, plan Task 4):

1. Open a project, make three edits, go back to Home, open it again: Undo is lit; tap it three times — the three edits come
   back off, in order; Redo puts them back.
2. Make two edits, swipe the app away in the app switcher, open Clipy and the project: Undo is lit and undoes both.
3. Undo twice, leave, reopen: Redo is lit.
4. A long project (many clips, auto captions): leave and reopen — it opens as fast as before; Undo lights up a moment later.
5. Duplicate a project with history: the copy's Undo is grey. Save a Copy and open the file: grey too.
6. Rename a project on Home, open it: Undo is grey (expected), and the project is intact.
7. Turn on Remove background on a clip, wait for it, turn it off, leave, reopen, undo: the cut-out is made again (the Preview
   tag shows while it is) and then plays.

## 9. Out of scope

- A shared pool or deltas to keep more steps on very long projects (decision 1) — only if the phone asks for it.
- A history list on screen, named steps, or any new control.
- History in a `.clipy` file or a duplicate.
- Keeping the history across Home's rename, or across a schema change (migrating old snapshots forward).
- Making the sweeps history-aware (§5).
- Restoring selection, playhead, zoom or the open tool (§6).
- A per-edit or timed history write; surviving a hard crash.
- The existing race in which a project is reopened while its previous leave is still saving (the stamp makes the history safe
  in it; the project's own behaviour there is as today).

## 10. What only a phone can settle

- That a force-quit from the app switcher really delivers `inactive` to JavaScript in time for the two small writes.
- That opening is not perceptibly slower, and that restoring 4 MB (Hermes `JSON.parse` + the sanity pass per snapshot, one per
  turn) causes no visible hitch 400 ms after the editor appears; `maxChars` and `HISTORY_READ_DELAY_MS` are the two numbers to
  tune.
- Memory after a full restore on a long project (the snapshots no longer share their clips).
- How long the re-render of a swept cut-out / steady copy takes when undoing into it (checklist 7).
- `expo-file-system`'s `File.write` of a 4 MB string and `move` with overwrite, timed on the device.
