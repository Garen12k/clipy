# Project backup — research (read-only; branch export-presets @ 96ac112, 2026-10-13)

Installed: expo-file-system 57.0.7, expo-sharing 57.0.22, expo-document-picker 57.0.3 (node_modules), Expo SDK 57.
Docs fetched: docs.expo.dev/versions/v57.0.0/sdk/{filesystem,sharing,document-picker} — they agree with the installed d.ts quoted below.

## 0. The finding that changes the plan

**There is no `expo-updates` in the app** (not in package.json, not in node_modules, no `updates` / `runtimeVersion` in app.json).
TestFlight build 8 therefore carries its JavaScript inside the binary: NO JavaScript change of any kind can reach the phone's
TestFlight app without a new EAS build. "Pure JavaScript" only means "works in Expo Go today and needs nothing native in the
1 November build". (Expo Go has its own Documents folder — it does not see the TestFlight app's projects.)

## 1. Storage layout

`root = ${fs.documentDir}projects` (src/projects/storage.ts:15), `projectDir(id) = root/<id>` (:16).

| Entry in `<documents>/projects/<id>/` | Written by | Backup? |
|---|---|---|
| `project.json` (+ transient `project.json.tmp`) | `saveProject` storage.ts:37-42 | YES (source) |
| `media/<newId>.<ext>` — imported videos/photos | `importMedia` storage.ts:80-99 (always `fs.copy`) | YES |
| `media/<newId>.jpg` — freeze frames | `saveStill` storage.ts:101-108 | YES |
| `media/<newId>.<ext>` — music, sfx, voice-over, own audio | `importAudio` storage.ts:169-176 (always `fs.copy`) | YES |
| `media/speech-<overlay id>-<new id>.caf` — Read aloud | src/editor/useReadAloud.ts:67,104 | YES (name is meaningful: `speechTracksOf` recognises it) |
| `thumb.jpg` | `writeThumb` storage.ts:52-60 (private; only at create) | cache, but tiny and NOT re-made on load -> include it or re-make it |
| `cover-<ms>-<clip>-<stem>-<ms>.jpg` | `writeCover` storage.ts:66-78 (exported; re-makes when missing) | cache, leave out |
| `sound/` | soundRenders.ts:19 | cache (needs native build to re-render) |
| `cutout/` | cutoutRenders.ts:23 | cache |
| `steady/` (+ `cuts-…` mark) | steadyRenders.ts:21 | cache |
| `peaks/` | soundPeaks.ts:26 | cache |

Proof the four folders are caches: `duplicateProject` (storage.ts:140-167) copies only clips', layers' and audio tracks'
`sourceUri` files + thumb + cover files, and the copy works.

Only three kinds of object hold a file reference: `Clip.sourceUri` (types.ts:195, clips and layers) and `AudioTrack.sourceUri`
(types.ts:512). `loadProject` checks exactly these (storage.ts:47). No other `*Uri` field exists in types.ts.

Every writer of a `sourceUri` puts the file inside `<project>/media/`:
- clips / layers / replace: `storage.importMedia` (useClipMedia.ts:91,114,143,185; storage.ts:114)
- bundled music + sfx + picked audio: `storage.importAudio` (AddAudioSheet.tsx:129), quick edit music (quickEditFlow.ts:29) — bundled assets are COPIED in, never referenced
- voice-over: `storage.importAudio` (useVoiceRecorder.ts:161)
- extracted audio: NO new file — `extractClipAudio` reuses the clip's own `sourceUri` (ops.ts:488). So **several items share one file**; a backup must de-duplicate by uri (duplicateProject does not: it copies the same file again with overwrite — harmless there, wasteful in an archive).
- Split clips also share one file.

Can a project reference a file outside its folder? Not by any current code path. Nothing enforces it (migrate.ts never looks at `sourceUri`), so the backup writer should treat "uri not under projectDir" and "file missing" as cases, not assume.

## 2. Paths

- **Absolute.** `dest = ${mediaDir}/${clipId}.${ext}` with `mediaDir` built from `fs.documentDir = Paths.document.uri` (expoFs.ts:8); pinned by the test `expect(project.clips[0].sourceUri).toBe(\`${fs.documentDir}projects/id1/media/id2.mov\`)` (storage.test.ts:30). So project.json holds `file:///var/mobile/Containers/Data/Application/<UUID>/Documents/projects/<id>/media/x.mov`.
- **No rebase code exists.** grep for rebase / container / relative / documentDir over src, app, modules: only ops.ts `rebasePins` (keyframes) and the four `documentDir` definitions. `loadProject` only reports `missingSourceUris`; `useLoadProject.ts:12-13` hands them to the store. If the data-container UUID changes (reinstall, restore to a new phone — Apple says never to store absolute paths), every existing project opens with all media "missing". This is a latent bug independent of backup; a rebase-on-load (keep everything after `/projects/`, re-root on today's `root`) would fix both.
- `duplicateProject` (storage.ts:140-167): new project id `deps.newId()`; per clip / layer / track `dest = sourceUri.replace(projectDir(id), projectDir(copyId))` then `fs.copy`; **clip, layer, track, overlay ids are kept**, file base names kept; `name + " copy"`, new `createdAt`/`updatedAt`, `posts: []`; thumb and cover files copied; caches not copied. It goes through `loadProject` -> `migrateProject`.
- A restore has to: mint a new project id (the original may still exist on the phone); set `project.id`; rewrite EVERY `sourceUri` (clips, layers, audioTracks) to `${projectDir(newId)}/media/<same base name>` — base names must stay (speech bars are recognised by name; cache names derive from the stem); run `migrateProject` (it already throws "This project was made with a newer version of Clipy. Update the app to open it." migrate.ts:156); decide on `posts` (duplicate clears them), name, dates; write `project.json` LAST so a half restore is never listed as a good project (listProjects shows a folder without a readable project.json as "Can't open", storage.ts:135 — so restore into a temp name or delete on failure). The archive should store paths RELATIVE ("media/x.mov").

## 3. Big files without a native zip

- No zip/tar/deflate library in package.json (checked: nothing matching zip, tar, pako, fflate).
- Installed handle API — node_modules/expo-file-system/build/File.types.d.ts:80-86:
  ```ts
  export declare class FileHandle {
      close(): void;
      readBytes(length: number): Uint8Array<ArrayBuffer>;
      writeBytes(bytes: Uint8Array): void;
      offset: number | null;
      size: number | null;
  }
  ```
  `open(mode?: FileMode): FileHandle;` (internal/NativeFileSystem.types.d.ts:210), `enum FileMode { ReadWrite="rw", ReadOnly="r", WriteOnly="w", Append="wa", Truncate="wt" }` (File.types.d.ts:49-79), `File.size: number` ("0 if the file does not exist", :222), `write(content: string | Uint8Array, options?: FileWriteOptions): void` with `append?: boolean` (:155, File.types.d.ts:44), `Paths.availableDiskSpace` (Paths.d.ts:25).
  **All of these are synchronous** (no Promise; native `Function(...)`, not `AsyncFunction`, FileSystemModule.swift:256-276). Native side (ios/FileSystemFileHandle.swift): `handle.read(upToCount:)`, `handle.write(contentsOf:)`, `seek(toFileOffset:)` with a UInt64 offset -> (a) read N bytes at an offset: yes; (b) write at an offset / append: yes; (c) size: yes; nothing loads a whole file. Files over 4 GB are fine (UInt64 natively, exact in JS up to 2^53).
  Also present: `readableStream()` / `writableStream()` (File.d.ts:103-104) — not needed.
- Legacy module (`expo-file-system/legacy`): `readAsStringAsync` has `position?` / `length?` (base64 or utf8 only); `WritingOptions` DOES have `append?: boolean` in this version (legacy/FileSystem.types.d.ts:248-251) — so "cannot append" is no longer true — but it is base64 through strings: slower, 33 % bigger in memory. Not needed.
- **The repo already has the reader**: src/publish/fileReader.ts:3-16 —
  `export interface ChunkReader { size: number; read(offset: number, length: number): Uint8Array; close(): void }`, `openReader(uri)` = `file.open(FileMode.ReadOnly)`, `handle.offset = offset; return handle.readBytes(length)`; its comment: "File.slice and Blob bodies load the whole video into memory — never use them." upload.ts reads with it in server-chosen chunks (`readChunk`, upload.ts:22). It has run live for posting (X), so chunked reads are proven on build 8. There is NO writer yet (no `writeBytes` caller in the repo) — that half is new and unproven on a phone.
- **Conclusion: yes**, a pure-JavaScript container (magic + version, JSON header with `{ path, size }[]` and the project document, then the raw bytes) can be written and read back with what is installed. Concerns:
  - every call is synchronous on the JS thread: copy in chunks (1–4 MB) and yield between chunks (`await` a zero timer) so the progress ring and Cancel stay alive; each chunk is copied native -> ArrayBuffer -> native. Throughput is a guess (tens to low hundreds of MB/s); a 2 GB project is a minute-scale job — measure in Expo Go first.
  - no integrity check for free (`File.md5` exists but reads the whole file); sizes in the header + a trailer magic catch truncation.
  - disk: the archive is a second full copy (cache dir) while it is shared; on restore the picked file is a full temp copy AND the restored project is another.
  - leaving the app suspends it; a share of a multi-GB file to AirDrop/Files is the system's job after that.
  - write to `part-…` and move into place; delete the cache archive after the share sheet answers.

## 4. Alternatives

(a) **Documents folder in Files** (`UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` in `ios.infoPlist`; today infoPlist has only ITSAppUsesNonExemptEncryption, BGTaskSchedulerPermittedIdentifiers and two usage texts — app.json:20-27). Build-time -> new build. `listProjects` WOULD list a folder dropped into `projects/` (it only reads `<id>/project.json`, storage.ts:125-138; thumb path is computed fresh), but its media would all be "missing" on any other install because of question 2 — it needs the same rebase-on-load code. It also exposes prefs.json and every cache folder to deletion by hand. Not a one-file backup.
(b) **Several files at once**: no. Installed API: `export declare function shareAsync(url: string, options?: SharingOptions): Promise<void>;` (Sharing.d.ts) and natively `UIActivityViewController(activityItems: [url], …)` (ios/SharingModule.swift:21) — one url.
(c) **Native zip in modules/clipy-video** (new build): CERTAIN — `NSFileCoordinator.coordinate(readingItemAt:options:.forUploading)` hands back a temporary .zip of a directory (zip only, no control, whole folder incl. caches unless a staging folder is made first); the `Compression` framework is raw stream codecs (zlib/lzfse/lz4/lzma), not a zip container; there is no public Foundation API to UNZIP on iOS. ALSO PUBLIC (iOS 14+): the `AppleArchive` framework archives and extracts directories (.aar, Apple-only format) — I state this from knowledge, not verified here against an SDK; verify before relying on it. A hand-written container in Swift (same format as the JS one, FileHandle loops off the JS thread) is the simplest native option and stays compatible with JS-written files.

## 5. Share / pick

- Share: `Sharing.shareAsync(url, { UTI?, mimeType?, dialogTitle?, anchor? })`. Existing callers: app/editor/[id]/export.tsx:39, PostScreenBody.tsx:96. **On iOS the installed native code never reads `options.UTI`** (declared in ios/SharingOptions.swift, not used anywhere in SharingModule.swift) — the share sheet types the file by its EXTENSION. An unregistered `.clipy` is a generic data file: Save to Files, AirDrop, Mail, Drive all work; no preview. The file must be readable by the app (`FileSystemUtilities.isReadableFile`) — cache dir is fine. No size limit in code or docs. `expo-sharing` is already a plugin entry (app.json:46); the plugin's extra abilities (receiving shares) are build-time.
- Pick, option 1 (already used in the app, AddAudioSheet.tsx:157): `getDocumentAsync({ type?: string | string[]; copyToCacheDirectory?: boolean; multiple?: boolean })` -> `{ canceled: false, assets: [{ name, size?, uri, mimeType?, lastModified }] }`. Native: `"*/*"` -> `UTType.item`, picker is `UIDocumentPickerViewController(forOpeningContentTypes:, asCopy: true)` — iOS already hands the app a temporary COPY; `copyToCacheDirectory: true` then copies it AGAIN into `Caches/DocumentPicker/` (DocumentPickerModule.swift: `if copy { … copyItem }`). For a multi-GB file pass `copyToCacheDirectory: false` (docs: "may impact performance for large files") and read the temp copy directly — to be confirmed in Expo Go that `File(uri).open()` accepts that tmp path.
- Pick, option 2: `File.pickFileAsync(options?: { initialUri?, mimeTypes?, multipleFiles? }): Promise<{ result: File, canceled: false } | { result: null, canceled: true }>` in expo-file-system itself (also `asCopy: true`; docs: "On iOS, it returns a temporary copy of the file"). One copy, returns a `File` directly. Unused in the repo so far.
- No picker can filter to `.clipy` without a declared type: allow `*/*` and validate by the magic bytes; say a plain sentence for any other file.
- Opening Clipy by tapping a `.clipy` file in Files / AirDrop = `CFBundleDocumentTypes` + `UTExportedTypeDeclarations` in infoPlist (build-time) plus JS to receive the url. **Not needed**: the feature works with "Open Project File" inside Clipy only.
- `expo-document-picker` is in app.json's plugins (:86) with no iCloud option; picking from Files / iCloud Drive through the system picker needs no entitlement (AddAudioSheet already does it).

## 6. Free space and size

- Free space: `FsAdapter.freeBytes()` (fs.ts:12) = `Paths.availableDiskSpace` (expoFs.ts:29). Only user: useExport.ts:196-197 — `need = estimateBytes(...) * 2 + cutoutBytesToMake + steadyBytesToMake`; refusal "Not enough free space on this iPhone for the export."
- Size of a project's sources: no helper exists and `FsAdapter` has no `size`. Compute as the sum of `new File(uri).size` (synchronous, 0 when missing) over the UNIQUE `sourceUri`s of clips + layers + audioTracks, plus the header. (`Directory.size` exists but would count the caches.) Needs: Save a Copy ≈ 1× that free; Open ≈ 1× the archive free on top of the picked temp copy.

## 7. Build situation

- In the app since 2026-10-01 (git log -S on package.json: expo-sharing and expo-file-system 6a6514d, expo-document-picker 80f522b), all three used by shipped features (export share, posting reader, Add audio) and all "Included in Expo Go" per the v57 docs. So build 8 contains every native piece the JS container needs.
- NO native change: the JS container (section 3) + shareAsync + getDocumentAsync / pickFileAsync; rebase-on-load.
- NEEDS native / build-time change: tap-to-open `.clipy` registration; Documents-in-Files; any Swift zip / AppleArchive / Swift container.
- BUT (section 0): without expo-updates even the no-native design reaches TestFlight only with the next build (1 November). Until then it can be built, unit-tested (memoryFs has no byte API — the container code needs its own in-memory reader/writer seam like `ChunkReader`) and tried in Expo Go on projects created inside Expo Go.

## Recommended design

One `.clipy` file written in JavaScript: `[magic+version][header length][JSON header: schema, project document with relative uris, files {path,size}][bytes…][trailer]`, built on the existing `ChunkReader` plus a new sibling `ChunkWriter` (`open(FileMode.WriteOnly)` + `writeBytes`), behind a small pure module that knows nothing of Expo (testable under Node). Contents: project.json + unique source files + thumb.jpg; no caches. Save a Copy: size check -> write to `cache/backups/part-…` -> move -> `shareAsync` -> delete. Open Project File: pick (`*/*`, no second copy) -> check magic / version / schema -> free-space check -> new id -> write files -> write project.json last -> delete on any failure. Add rebase-on-load at the same time (it is the same rewrite and fixes the latent container-path bug).

Risks: (1) nothing ships before the next build; (2) `writeBytes` and multi-GB sync loops are unproven on a phone — speed and UI stalls must be measured; (3) 2× disk on both sides; (4) app suspended mid-write (handle the half file; never promise background work); (5) the picked temp copy's readability with `copyToCacheDirectory: false` is unconfirmed; (6) the container path changing is an existing data-loss-looking bug whether or not backup is built; (7) cut-out / steady / sound copies are re-rendered after a restore (time, and only on a build that has those tools).
