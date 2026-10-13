# Project backup and the path fix: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (C) a project whose folder has moved opens with all its media: every file reference is re-pointed at the folder's real place on every load, in memory, writing nothing. (A) "Save a Copy" in the project actions sheet packs one project into one `<name>.clipy` file and hands it to Apple's share sheet. (B) "Open Project File" in Home's header pill brings such a file back as a NEW project.

**Architecture:** Five small pieces under `src/projects/`. `rebase.ts` — one pure function applied by the one private reader in `storage.ts`. `projectFile.ts` — the container format, pure (no import but types), streaming through `ChunkReader` / `ChunkWriter`. `fileWriter.ts` — the chunk writer beside the existing reader (`src/publish/fileReader.ts`); `FsAdapter` gains `size`, `moveDir`, `openReader`, `openWriter`. `storage.ts` gains `packProject`, `restoreProject`, `sweepProjectFiles`. The phone's two system sheets live in `filePhone.ts` (exported by `src/projects/index.ts` beside `storage`, so the Home suites that mock that module keep loading nothing new); `useProjectFile.ts` + `TransferCard.tsx` are the screen's half, wired into `app/index.tsx` and `ProjectActionsSheet.tsx`.

**Tech Stack:** Expo SDK 57, React Native 0.86.3, TypeScript strict, `expo-file-system` 57.0.7 (`File`, `Directory`, `FileMode`, `File.pickFileAsync`), `expo-sharing` 57.0.22, Jest (`jest-expo`) + RNTL 14. **No new package, no native code, no `app.json` change, no schema bump.**

**Spec:** `docs/superpowers/specs/2026-10-13-project-backup-design.md` (binding: §1 the rebase rule, §2 the byte layout and what a reader says, §3 writing / clean-up, §4 opening, §5 every string, §7 the phone checklist). Research: `docs/superpowers/research/2026-10-13-project-backup.md`.

## Global Constraints

- iPhone only. Read `AGENTS.md` first; it binds. Home is a SCREEN: colours only from `const s = useSurfaces()` (plus `theme.colors.onAccent` / `onScrim` / `scrim*`); no hex literal; spacing only from `theme.space` (no apostrophe in new JSX text, no `*` or `/` in a spacing value); no `fontFamily`; nothing animated (the bar's width is a plain style value).
- **Glass:** exactly three glass surfaces. The header pill's `style` object in `app/index.tsx` is not edited — the new button is one more child. No new `Glass`.
- **Never edited to make a change pass:** `storage.load.proof.test.ts` once Task 1 Step 1 has committed it; the PROOF blocks of `migrate.test.ts`, `useExport*.test.ts`, `overlayLayout.test.ts`, `theme.test.ts`; `looks.frozen.test.ts`; `cutoutRenders.test.ts`; `timeline.stepped.proof.test.ts`; `spacingScale.test.ts` (its allow-table is not grown); `noHexLiterals.test.ts`; `outlineIcons.test.ts`; `palette.guard.test.ts`; `casing.guard.test.ts`.
- **Tests you may update** (they pin something this plan changes, and only that pin): the header's button list in `src/projects/__tests__/home.glass.test.tsx:77` and `home.layout.test.tsx:52` (`["Post a video", "Accounts"]` → `["Post a video", "Open Project File", "Accounts"]`; the test name "the two actions…" → "the three actions…"); the renders of `ProjectActionsSheet` in `src/__tests__/sheets.r2.test.tsx` (one more prop); `USED` and its count in `src/ui/__tests__/sfSymbols.map.test.ts`.
- **Not edited by any task:** `src/editor/model/migrate.ts`, `types.ts`, `src/publish/fileReader.ts`, `src/export/exportAwake.ts`, `app.json`, `package.json`, anything under `modules/`, `src/theme/theme.ts`.
- Stored references stay ABSOLUTE (spec §1.3). `storage.test.ts`'s pin of `${documentDir}projects/id1/media/id2.mov` stays true and is not edited.
- Only whole arrays go to a writer — never a `subarray` view. A write handle is opened only on a file that exists (`create` first).
- RNTL v14: `render` / `fireEvent` are async — always `await`.
- **Checks for every task:** `npm.cmd run typecheck`, then `npx.cmd jest -w 8`, then `npm.cmd run test:server`. Baseline on this branch (2026-10-13): typecheck clean; app 386 suites / 6052 tests, all pass, 52 s with `-w 8`; server 21 suites / 591 tests. Plain `npm test` uses all 28 cores and times out in four heavy suites (`EditorToolbar*.test.tsx` ×3, `AccountsScreen.test.tsx`, "Exceeded timeout of 5000 ms") — that is the machine, not the tree: use `-w 8`. Every task ends with the suite count grown by exactly its new files and no failure.
- Windows: PowerShell, no `&&`, `npx.cmd` / `npm.cmd`. Never `expo lint`. Never `git stash`. `git add` explicit paths only. Do not start or stop a dev server. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Task order

`(1 ∥ 2) → 3 → 4 → 5 → 6`

| Task | Title | Depends on | Parallel-safe with |
|---|---|---|---|
| 1 | The path fix (shippable by itself) | — | 2 |
| 2 | The container format and byte access | — | 1 |
| 3 | Storage: pack, restore, sweep | 1, 2 | — |
| 4 | The screen: Save a Copy, Open Project File, progress, messages | 3 | — |
| 5 | Independent review and fixes | 1–4 | — |
| 6 | Docs: AGENTS.md "Project files", the owner's checklist | 5 | — |

Tasks 1 and 2 share no file (1: `rebase.ts`, `storage.ts`; 2: `projectFile.ts`, `fileWriter.ts`, `fs.ts`, `expoFs.ts`). Task 1 may be merged and shipped alone.

---

## Task 1 — The path fix

**Files**
- Create: `src/projects/rebase.ts`, `src/projects/__tests__/storage.load.proof.test.ts`, `src/projects/__tests__/rebase.test.ts`, `src/projects/__tests__/rebase.guard.test.ts`
- Modify: `src/projects/storage.ts` (the reader only)

**Interfaces**
- Consumes: `Project` (`@/src/editor/model/types`), `makeStorage`, `memoryFs`.
- Produces: `rebaseUri(uri: string, projectId: string, dirNow: string): string`; `rebaseProject(project: Project, dirNow: string): Project` (the SAME object when nothing moves). `storage.loadProject` / `listProjects` unchanged in signature.

- [ ] **Step 1 — the PROOF, green before any change.** Create `src/projects/__tests__/storage.load.proof.test.ts`:

```ts
// PROOF — written before the path fix and never edited to make a change pass: a project whose folder has not moved loads exactly
// as it did before rebase-on-load existed, and loading writes nothing.
import { migrateProject } from "@/src/editor/model/migrate";
import { memoryFs } from "../fs";
import { makeStorage, type PickedAsset } from "../storage";

const asset = (uri: string): PickedAsset => ({ uri, kind: "video", durationSec: 4, width: 1080, height: 1920, fileName: "clip.mov" });

async function made() {
  const fs = memoryFs();
  let n = 0;
  const storage = makeStorage(fs, { thumbnail: async () => { fs.files.set("file:///tmp/t.jpg", "JPEG"); return "file:///tmp/t.jpg"; }, newId: () => `id${++n}`, nowIso: () => "2026-10-13T10:00:00.000Z" });
  fs.files.set("file:///picked/a.mov", "A"); fs.files.set("file:///picked/b.mov", "B"); fs.files.set("file:///picked/song.m4a", "S");
  const { project } = await storage.createProject("Beach", [asset("file:///picked/a.mov"), asset("file:///picked/b.mov")]);
  const track = await storage.importAudio(project.id, { uri: "file:///picked/song.m4a", title: "song.m4a", durationSec: 3 });
  await storage.saveProject({ ...project, layers: [{ ...project.clips[1], id: "layer", start: 1 }], audioTracks: [track] });
  return { fs, storage, json: "file:///doc/projects/id1/project.json" };
}

test("PROOF: an untouched project loads to exactly what migrate gives, with the references it has today", async () => {
  const { fs, storage, json } = await made();
  const text = fs.files.get(json)!;
  const { project, missingSourceUris } = await storage.loadProject("id1");
  expect(JSON.stringify(project)).toBe(JSON.stringify(migrateProject(JSON.parse(text))));
  expect(project.clips.map((c) => c.sourceUri)).toEqual(["file:///doc/projects/id1/media/id2.mov", "file:///doc/projects/id1/media/id3.mov"]);
  expect(project.layers.map((l) => l.sourceUri)).toEqual(["file:///doc/projects/id1/media/id3.mov"]);
  expect(project.audioTracks.map((a) => a.sourceUri)).toEqual(["file:///doc/projects/id1/media/id4.m4a"]);
  expect(missingSourceUris).toEqual([]);
});

test("PROOF: loading and listing write nothing — project.json keeps its bytes and no file appears, moves or goes", async () => {
  const { fs, storage, json } = await made();
  const before = new Map(fs.files);
  const spies = (["writeText", "copy", "move", "remove", "mkdir"] as const).map((m) => jest.spyOn(fs, m));
  await storage.loadProject("id1");
  await storage.listProjects();
  await storage.loadProject("id1");
  for (const s of spies) expect(s).not.toHaveBeenCalled();
  expect([...fs.files]).toEqual([...before]);
  expect(fs.files.get(json)).toBe(before.get(json));
});
```

Run `npx.cmd jest src/projects/__tests__/storage.load.proof.test.ts` — **it must PASS on the untouched tree** (it pins today). Commit it alone: `test(projects): PROOF — an untouched project loads as today and loading writes nothing`.

- [ ] **Step 2 — red.** Create `src/projects/__tests__/rebase.test.ts`:

```ts
import { makeAudioTrack, makeClip, makeLayer, makeProject, type Project } from "@/src/editor/model/types";
import { memoryFs } from "../fs";
import { rebaseProject, rebaseUri } from "../rebase";
import { makeStorage } from "../storage";

const OLD = "file:///var/mobile/Containers/Data/Application/AAAA-1111/Documents/projects/p1";
const NOW = "file:///var/mobile/Containers/Data/Application/BBBB-2222/Documents/projects/p1";

describe("rebaseUri", () => {
  test("under today's folder: untouched", () => expect(rebaseUri(`${NOW}/media/a.mov`, "p1", NOW)).toBe(`${NOW}/media/a.mov`));
  test("under the same project in another container: the relative part is kept", () => expect(rebaseUri(`${OLD}/media/a.mov`, "p1", NOW)).toBe(`${NOW}/media/a.mov`));
  test("the LAST marker counts", () => expect(rebaseUri("file:///x/projects/p1/y/projects/p1/media/a.mov", "p1", NOW)).toBe(`${NOW}/media/a.mov`));
  test("another project's folder, a file outside, an empty string: left alone", () => {
    for (const uri of ["file:///c/Documents/projects/p2/media/a.mov", "file:///c/tmp/a.mov", "", "media/a.mov"]) expect(rebaseUri(uri, "p1", NOW)).toBe(uri);
  });
  test("an id is text, not a pattern", () => expect(rebaseUri("file:///c/projects/pX1/media/a.mov", "p.1", NOW)).toBe("file:///c/projects/pX1/media/a.mov"));
});

describe("rebaseProject", () => {
  const at = (root: string): Project => ({ ...makeProject({ id: "p1" }),
    clips: [makeClip({ id: "c1", sourceDuration: 4, sourceUri: `${root}/media/c1.mov` }), makeClip({ id: "c2", sourceDuration: 4, sourceUri: `${root}/media/c1.mov` })],
    layers: [makeLayer({ id: "l1", sourceDuration: 4, sourceUri: `${root}/media/l1.mov` })],
    audioTracks: [makeAudioTrack({ id: "a1", sourceUri: `${root}/media/speech-o1-x.caf`, sourceDuration: 2 })] });

  test("nothing moved: THE SAME OBJECT comes back", () => { const p = at(NOW); expect(rebaseProject(p, NOW)).toBe(p); });
  test("a trailing slash on the folder changes nothing", () => { const p = at(NOW); expect(rebaseProject(p, `${NOW}/`)).toBe(p); });
  test("moved: clips, layers and sounds all point at today's folder; everything else is the same", () => {
    const p = at(OLD), r = rebaseProject(p, NOW);
    expect(r).toEqual(at(NOW));
    expect(r.overlays).toBe(p.overlays);
    expect(p.clips[0].sourceUri).toBe(`${OLD}/media/c1.mov`);   // the input is not changed
  });
  test("idempotent", () => { const once = rebaseProject(at(OLD), NOW); expect(rebaseProject(once, NOW)).toBe(once); });
  test("a list with nothing to move keeps its identity", () => {
    const p = { ...at(NOW), clips: at(OLD).clips }, r = rebaseProject(p, NOW);
    expect(r.layers).toBe(p.layers); expect(r.audioTracks).toBe(p.audioTracks); expect(r.clips).not.toBe(p.clips);
  });
});

describe("storage after the container has moved", () => {
  async function moved() {
    const fs = memoryFs();
    let n = 0;
    const storage = makeStorage(fs, { thumbnail: async () => "file:///tmp/t.jpg", newId: () => `n${++n}`, nowIso: () => "2026-10-13T10:00:00.000Z" });
    const was = "file:///old/AAAA/Documents/projects/p1", dir = "file:///doc/projects/p1";
    const project: Project = { ...makeProject({ id: "p1", name: "Beach" }), clips: [makeClip({ id: "c1", sourceDuration: 4, sourceUri: `${was}/media/c1.mov` })], audioTracks: [makeAudioTrack({ id: "a1", sourceUri: `${was}/media/a1.m4a`, sourceDuration: 2 })] };
    fs.files.set(`${dir}/project.json`, JSON.stringify(project));
    fs.files.set(`${dir}/media/c1.mov`, "V"); fs.files.set(`${dir}/media/a1.m4a`, "S");
    return { fs, storage, dir, text: JSON.stringify(project) };
  }
  test("it opens with every file found, and the file on disk is not rewritten", async () => {
    const { fs, storage, dir, text } = await moved();
    const { project, missingSourceUris } = await storage.loadProject("p1");
    expect(project.clips[0].sourceUri).toBe(`${dir}/media/c1.mov`);
    expect(project.audioTracks[0].sourceUri).toBe(`${dir}/media/a1.m4a`);
    expect(missingSourceUris).toEqual([]);
    expect(fs.files.get(`${dir}/project.json`)).toBe(text);
    expect((await storage.listProjects()).map((p) => p.broken)).toEqual([false]);
    expect(fs.files.get(`${dir}/project.json`)).toBe(text);
  });
  test("the next ordinary save writes today's references", async () => {
    const { fs, storage, dir } = await moved();
    await storage.renameProject("p1", "Beach 2");
    expect(JSON.parse(fs.files.get(`${dir}/project.json`)!).clips[0].sourceUri).toBe(`${dir}/media/c1.mov`);
  });
  test("Duplicate works after a move", async () => {
    const { fs, storage } = await moved();
    const copy = await storage.duplicateProject("p1");
    expect(copy.clips[0].sourceUri).toBe(`file:///doc/projects/${copy.id}/media/c1.mov`);
    expect(fs.files.get(copy.clips[0].sourceUri)).toBe("V");
  });
});
```

(`makeProject` / `makeClip` / `makeLayer` / `makeAudioTrack` are the test factories at the bottom of `types.ts`.) Create `src/projects/__tests__/rebase.guard.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";

// rebaseProject lists the fields that hold a file reference BY NAME. A new one in the model fails here until rebase.ts,
// packProject and restoreProject (src/projects/storage.ts) cover it.
test("the model's only file references are Clip.sourceUri and AudioTrack.sourceUri", () => {
  const src = readFileSync(join(__dirname, "..", "..", "editor", "model", "types.ts"), "utf8");
  const found = [...src.matchAll(/\b([A-Za-z]*(?:Uri|Url|Path|File))\??: *string/g)].map((m) => m[1]);
  expect(found).toEqual(["sourceUri", "sourceUri"]);
});
```

Run both: `rebase.test.ts` fails (no module), the guard passes.

- [ ] **Step 3 — green.** Create `src/projects/rebase.ts`:

```ts
import type { Project } from "@/src/editor/model/types";

/**
 * One file reference, re-pointed at where its project's folder is NOW. References are stored absolute, and iOS may move the app's
 * container (a restore to a new phone, some reinstalls). Under `dirNow` already → untouched; under `/projects/<projectId>/`
 * anywhere else → the part after the LAST such marker, under `dirNow`; anything else is left alone.
 */
export function rebaseUri(uri: string, projectId: string, dirNow: string): string {
  if (typeof uri !== "string" || uri.startsWith(`${dirNow}/`)) return uri;
  const mark = `/projects/${projectId}/`;
  const at = uri.lastIndexOf(mark);
  return at < 0 ? uri : `${dirNow}/${uri.slice(at + mark.length)}`;
}

/**
 * Every file reference of a project (clips, layers, sounds — the model has no other: rebase.guard.test.ts) re-pointed at `dirNow`.
 * Pure and idempotent; when nothing moves THE SAME OBJECT is returned, and a list with nothing to move keeps its identity.
 * In memory only: nothing is written because of it (the next ordinary save stores today's references).
 */
export function rebaseProject(project: Project, dirNow: string): Project {
  const dir = dirNow.replace(/\/+$/, "");
  let moved = false;
  const fix = <T extends { sourceUri: string }>(list: T[]): T[] => {
    let any = false;
    const out = list.map((item) => {
      const uri = rebaseUri(item.sourceUri, project.id, dir);
      if (uri === item.sourceUri) return item;
      any = true;
      return { ...item, sourceUri: uri };
    });
    if (any) moved = true;
    return any ? out : list;
  };
  const clips = fix(project.clips), layers = fix(project.layers), audioTracks = fix(project.audioTracks);
  return moved ? { ...project, clips, layers, audioTracks } : project;
}
```

In `src/projects/storage.ts`: import `rebaseProject` from `./rebase`; under `parse` add

```ts
  /** The ONE reader of a stored project: migrated, and every file reference re-pointed at where the folder is now (rebase.ts). Writes nothing. */
  async function read(id: string): Promise<Project> { return rebaseProject(parse(await fs.readText(jsonPath(id))), projectDir(id)); }
```

and use it in both places: `loadProject` → `const project = await read(id);`, `listProjects` → `const p = await read(id);`. Nothing else in the file changes.

- [ ] **Step 4.** Run the three new suites, `storage.test.ts`, `storage.audio.test.ts`, `quickEditFlow.test.ts` — green, the PROOF file unedited. Then the full checks (Global Constraints). Expect 389 app suites.
- [ ] **Step 5.** Commit: `fix(projects): re-point a project's file references at its folder on every load`.

---

## Task 2 — The container format and byte access

**Files**
- Create: `src/projects/projectFile.ts`, `src/projects/fileWriter.ts`, `src/projects/__tests__/projectFile.test.ts`, `src/projects/__tests__/fsBytes.test.ts`
- Modify: `src/projects/fs.ts`, `src/projects/expoFs.ts`

**Interfaces**
- Consumes: `ChunkReader` (type only, `@/src/publish/fileReader`), `openReader`.
- Produces (`projectFile.ts`): `PROJECT_FILE`; types `FileEntry`, `FileHeader`, `FileErrorCode`, `FileRun`, `Pause`; `class ProjectFileError extends Error { code; need; free }`; `nextTurn`; `isSafeName`, `isEntryPath`, `baseName`, `fileNameFor`, `freeName`, `encodeHeader`, `totalBytes`, `readHeader(src): { header, bodyStart }`, `copyBytes`, `writeProjectFile(out, header, open, run, pause?): Promise<number>`, `extractFiles(src, header, bodyStart, open, run, pause?): Promise<void>`.
- Produces (`fileWriter.ts`): `interface ChunkWriter { write(bytes: Uint8Array): void; close(): void }`, `openWriter(uri: string): ChunkWriter`.
- Produces (`FsAdapter`): `size(path): Promise<number | null>`, `moveDir(from, to): Promise<void>`, `openReader(path): ChunkReader`, `openWriter(path): ChunkWriter`.

- [ ] **Step 1 — red.** Create `src/projects/__tests__/projectFile.test.ts`:

```ts
import type { ChunkReader } from "@/src/publish/fileReader";
import type { ChunkWriter } from "../fileWriter";
import { PROJECT_FILE, ProjectFileError, encodeHeader, extractFiles, fileNameFor, freeName, isEntryPath, readHeader, totalBytes, writeProjectFile, type FileHeader } from "../projectFile";

const now = async () => {};
const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const mem = (b: Uint8Array): ChunkReader => ({ size: b.byteLength, read: (o, n) => b.slice(o, o + n), close() {} });
const sink = () => {
  const parts: Uint8Array[] = [];
  const w: ChunkWriter = { write: (b) => { parts.push(b.slice()); }, close() {} };
  const all = () => { const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.byteLength; } return out; };
  return { w, all };
};
const FILES: Record<string, Uint8Array> = { "media/a.mov": bytes("AAAAAAAAAA"), "media/empty.m4a": new Uint8Array(0), "thumb.jpg": bytes("JPEG") };
const header = (): FileHeader => ({ app: "clipy", schemaVersion: 21, savedAt: "2026-10-13T10:00:00.000Z", name: "رحلة 🏖 Beach",
  project: { id: "p", name: "رحلة 🏖 Beach", clips: [] }, files: Object.entries(FILES).map(([path, b]) => ({ path, size: b.byteLength })) });
const pack = async (h = header()) => { const s = sink(); const total = await writeProjectFile(s.w, h, (p) => mem(FILES[p]), { cancelled: false }, now); return { file: s.all(), total }; };
const code = (fn: () => unknown) => { try { fn(); return "ok"; } catch (e) { return e instanceof ProjectFileError ? e.code : `other: ${String(e)}`; } };
const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
/** A file with a right prelude and trailer around any header bytes, and no body. */
const around = (head: Uint8Array) => { const s = sink(); for (const p of [bytes("CLIPYPRJ"), u32(1), u32(head.byteLength), head, bytes("CLIPYEND"), u32(32 + head.byteLength), u32(0)]) s.w.write(p); return mem(s.all()); };

test("the layout: magic, version 1, header length, an ASCII header, the bytes, the end magic and the file's own length", async () => {
  const { file, total } = await pack();
  const H = encodeHeader(header()).byteLength;
  expect(file.byteLength).toBe(total);
  expect(total).toBe(16 + H + 14 + 16);
  expect(total).toBe(totalBytes(H, header().files));
  expect(String.fromCharCode(...file.slice(0, 8))).toBe("CLIPYPRJ");
  expect([...file.slice(8, 16)]).toEqual([1, 0, 0, 0, ...u32(H)]);
  expect(file.slice(16, 16 + H).every((b) => b < 128)).toBe(true);
  expect(String.fromCharCode(...file.slice(16 + H, 16 + H + 14))).toBe("AAAAAAAAAAJPEG");
  expect(String.fromCharCode(...file.slice(total - 16, total - 8))).toBe("CLIPYEND");
  expect([...file.slice(total - 8)]).toEqual([...u32(total), 0, 0, 0, 0]);
});

test("round trip: the header (Arabic and emoji included) and every file come back byte for byte; progress only grows and ends at the sum", async () => {
  const { file } = await pack();
  const { header: back, bodyStart } = readHeader(mem(file));
  expect(back).toEqual(header());
  const got: Record<string, ReturnType<typeof sink>> = {};
  const seen: number[] = [];
  await extractFiles(mem(file), back, bodyStart, (p) => (got[p] = sink()).w, { cancelled: false, onProgress: (d) => seen.push(d) }, now);
  for (const [p, b] of Object.entries(FILES)) expect([...got[p].all()]).toEqual([...b]);
  expect(seen).toEqual([10, 14]);
});

test("cut off at ANY length it is never read as good: under 16 bytes it is not a Clipy file, from 16 on it is damaged", async () => {
  const { file, total } = await pack();
  for (let n = 0; n < 16; n++) expect(code(() => readHeader(mem(file.slice(0, n))))).toBe("notClipy");
  for (let n = 16; n < total; n++) expect(code(() => readHeader(mem(file.slice(0, n))))).toBe("damaged");
  const longer = new Uint8Array(total + 1); longer.set(file);
  expect(code(() => readHeader(mem(longer)))).toBe("damaged");
});

test("what a reader says: another file, a newer format, a damaged one", async () => {
  const { file, total } = await pack();
  const edit = (at: number, v: number) => { const b = file.slice(); b[at] = v; return mem(b); };
  expect(code(() => readHeader(mem(bytes("ID3 this is a song, not a project at all"))))).toBe("notClipy");
  expect(code(() => readHeader(edit(0, 88)))).toBe("notClipy");
  expect(code(() => readHeader(edit(8, 2)))).toBe("newer");
  expect(code(() => readHeader(edit(8, 0)))).toBe("damaged");
  expect(code(() => readHeader(edit(20, 200)))).toBe("damaged");             // a byte above 127 in the header
  expect(code(() => readHeader(edit(total - 16, 88)))).toBe("damaged");      // the end magic
  expect(code(() => readHeader(edit(total - 1, 1)))).toBe("damaged");        // the length in the trailer
  expect(code(() => readHeader(around(bytes("{not json"))))).toBe("damaged");
  expect(code(() => readHeader(around(bytes('{"app":"other","schemaVersion":21,"project":{},"files":[]}'))))).toBe("damaged");
  expect(code(() => readHeader(around(encodeHeader({ ...header(), files: [] }))))).toBe("ok");
  const tooLong = file.slice(); tooLong.set(u32(PROJECT_FILE.maxHeader + 1), 12);
  expect(code(() => readHeader(mem(tooLong)))).toBe("damaged");
});

test("a file can only name thumb.jpg or media/<one safe name>, once, with a whole size", () => {
  for (const ok of ["thumb.jpg", "media/a.mov", "media/speech-o1-x.caf", "media/رحلة.mov"]) expect(isEntryPath(ok)).toBe(true);
  for (const bad of ["../x", "media/..", "media/.", "media/a/b", "media/", "cover-1.jpg", "media/a\\b", "/media/a", "project.json", 3, null]) expect(isEntryPath(bad)).toBe(false);
  for (const files of [[{ path: "../x", size: 0 }], [{ path: "media/a", size: -1 }], [{ path: "media/a", size: 1.5 }], [{ path: "media/a", size: 0 }, { path: "media/a", size: 0 }]])
    expect(code(() => readHeader(around(encodeHeader({ ...header(), files }))))).toBe("damaged");
});

test("sizes past 4 GiB: every byte is counted and the trailer's high word is set — nothing is held in memory", async () => {
  const zero = new Uint8Array(PROJECT_FILE.chunk);
  const big = 5 * 1024 ** 3 + 123;
  const fake: ChunkReader = { size: big, read: (_o, n) => (n === zero.byteLength ? zero : new Uint8Array(n)), close() {} };
  let count = 0, last = 0, largest = 0, tail = new Uint8Array(0);
  const counter: ChunkWriter = { write: (b) => { count += b.byteLength; largest = Math.max(largest, b.byteLength); if (b.byteLength === 16) tail = b.slice(); }, close() {} };
  const h: FileHeader = { ...header(), files: [{ path: "media/big.mov", size: big }] };
  const total = await writeProjectFile(counter, h, () => fake, { cancelled: false, onProgress: (d) => { expect(d).toBeGreaterThan(last); last = d; } }, now);
  expect(count).toBe(total);
  expect(last).toBe(big);
  expect(largest).toBe(PROJECT_FILE.chunk);
  const dv = new DataView(tail.buffer);
  expect(dv.getUint32(12, true)).toBe(1);
  expect(dv.getUint32(8, true) + dv.getUint32(12, true) * 2 ** 32).toBe(total);
});

test("cancel stops between chunks; a short read and a file that changed size are failures, not a good file", async () => {
  const run = { cancelled: false, onProgress: (d: number) => { if (d >= 10) run.cancelled = true; } };
  const s = sink();
  await expect(writeProjectFile(s.w, header(), (p) => mem(FILES[p]), run, now)).rejects.toMatchObject({ code: "cancelled" });
  expect(code(() => readHeader(mem(s.all())))).toBe("damaged");   // what was written so far has no trailer
  await expect(writeProjectFile(sink().w, header(), (p) => ({ size: FILES[p].byteLength, read: () => new Uint8Array(0), close() {} }), { cancelled: false }, now)).rejects.toThrow(/short read/);
  await expect(writeProjectFile(sink().w, header(), (p) => mem(FILES[p].slice(1)), { cancelled: false }, now)).rejects.toThrow(/changed size/);
  const { file } = await pack();
  const { header: back, bodyStart } = readHeader(mem(file));
  const stop = { cancelled: true };
  await expect(extractFiles(mem(file), back, bodyStart, () => sink().w, stop, now)).rejects.toMatchObject({ code: "cancelled" });
});

test("every reader and writer that was opened is closed, also when the copy fails", async () => {
  const closed: string[] = [];
  const open = (p: string): ChunkReader => ({ ...mem(p === "thumb.jpg" ? FILES[p].slice(1) : FILES[p]), close: () => { closed.push(p); } });
  await expect(writeProjectFile(sink().w, header(), open, { cancelled: false }, now)).rejects.toThrow();
  expect(closed).toEqual(["media/a.mov", "media/empty.m4a", "thumb.jpg"]);
});

test("the pause runs after every chunk (the screen's turn)", async () => {
  let turns = 0;
  await writeProjectFile(sink().w, header(), (p) => mem(FILES[p]), { cancelled: false }, async () => { turns++; });
  expect(turns).toBe(2);   // one chunk for each file that has bytes
});

test("the file's name and a free project name", () => {
  expect(fileNameFor("Beach trip")).toBe("Beach trip.clipy");
  expect(fileNameFor(' ..a/b:c*?"<>|  d ')).toBe("a b c d.clipy");
  expect(fileNameFor("///")).toBe("Clipy project.clipy");
  expect(fileNameFor("رحلة")).toBe("رحلة.clipy");
  expect(fileNameFor("🏖".repeat(100))).toBe(`${"🏖".repeat(80)}.clipy`);
  expect(freeName("A", [])).toBe("A");
  expect(freeName("A", ["A"])).toBe("A copy");
  expect(freeName("A", ["A", "A copy", "A copy 2"])).toBe("A copy 3");
});
```

- [ ] **Step 2 — green.** Create `src/projects/fileWriter.ts`:

```ts
import { File, FileMode } from "expo-file-system";

export interface ChunkWriter { write(bytes: Uint8Array): void; close(): void }

/**
 * Writes bytes straight to disk, one chunk after another — the reader's sibling (src/publish/fileReader.ts). The file is made
 * first (a write handle opens only a file that exists) and emptied. Hand `write` whole arrays, never a `subarray` view.
 */
export function openWriter(uri: string): ChunkWriter {
  const file = new File(uri);
  const parent = file.parentDirectory;
  if (!parent.exists) parent.create({ intermediates: true, idempotent: true });
  file.create({ intermediates: true, overwrite: true });
  const handle = file.open(FileMode.Truncate);
  return {
    write(bytes) { handle.writeBytes(bytes); },
    close() { try { handle.close(); } catch { /* already closed */ } },
  };
}
```

Create `src/projects/projectFile.ts` — this exact module (it was run against the cases above before the plan was written):

```ts
import type { ChunkReader } from "@/src/publish/fileReader";
import type { ChunkWriter } from "./fileWriter";

/**
 * A Clipy project file (`.clipy`), format version 1 — one project in one file. Pure: no Expo, no React, no file system; bytes
 * come and go through ChunkReader / ChunkWriter in chunks, so a file of any size is never in memory. All integers little-endian:
 *   0   8  "CLIPYPRJ"        8  4  format version (1)        12  4  header length H (2 … maxHeader)
 *   16  H  the header: JSON in ASCII (every character above U+007F as \uXXXX)
 *   …      the files' bytes, in the header's order, nothing between them
 *   end−16  8  "CLIPYEND"    end−8  8  the whole file's length (uint64: low word, high word)
 * Spec: docs/superpowers/specs/2026-10-13-project-backup-design.md §2.
 */
export const PROJECT_FILE = { magic: "CLIPYPRJ", end: "CLIPYEND", version: 1, prelude: 16, trailer: 16, maxHeader: 8 * 1024 * 1024, maxFiles: 10000,
  /** Bytes copied between two turns of the event loop: to be tuned on a phone. */ chunk: 2 * 1024 * 1024,
  /** Free space asked for on top of what will be written. */ spare: 100 * 1024 * 1024, ext: "clipy" } as const;

export type FileEntry = { path: string; size: number };
export type FileHeader = { app: "clipy"; schemaVersion: number; savedAt: string; name: string; project: Record<string, unknown>; files: FileEntry[] };
export type FileErrorCode = "notClipy" | "damaged" | "newer" | "space" | "cancelled";
/** What the screen has a sentence for. `need` / `free` are bytes, set for `space`. Any other Error is "something went wrong". */
export class ProjectFileError extends Error {
  code: FileErrorCode; need: number; free: number;
  constructor(code: FileErrorCode, need = 0, free = 0) { super(`project file: ${code}`); this.name = "ProjectFileError"; this.code = code; this.need = need; this.free = free; }
}
/** One save or one open: `cancelled` is read before every chunk; `onProgress` gets the body bytes copied so far. */
export interface FileRun { cancelled: boolean; onStart?: (info: { name: string; bytes: number }) => void; onProgress?: (done: number) => void }
export type Pause = () => Promise<void>;
/** A real turn of the event loop — a touch on Cancel and a redraw get through. (A resolved promise would not let them.) */
export const nextTurn: Pause = () => new Promise((r) => setTimeout(r, 0));

const TWO32 = 2 ** 32;
const u32 = (n: number): Uint8Array => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; };
const getU32 = (b: Uint8Array, at: number): number => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(at, true);
const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));
const isAscii = (b: Uint8Array, at: number, s: string): boolean => { for (let i = 0; i < s.length; i++) if (b[at + i] !== s.charCodeAt(i)) return false; return true; };
const join = (...parts: Uint8Array[]): Uint8Array => { const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.byteLength; } return out; };
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** One path component that can only be a file inside the folder it is put in. */
export function isSafeName(name: unknown): name is string {
  return typeof name === "string" && name.length >= 1 && name.length <= 255 && name !== "." && name !== ".." && !/[\/\\\u0000-\u001f\u007f]/.test(name);
}
/** The only two places a file of a project file may go: the thumbnail, or one file in media/. */
export const isEntryPath = (path: unknown): path is string => path === "thumb.jpg" || (typeof path === "string" && path.startsWith("media/") && isSafeName(path.slice(6)));
/** The last path component of a reference ("" when there is none). */
export const baseName = (uri: unknown): string => String(uri ?? "").split("/").pop() ?? "";

/** The project's name as a file name: nothing a file system or a share sheet trips over, at most 80 characters, never empty. */
export function fileNameFor(name: string): string {
  const clean = Array.from(String(name).replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "")).slice(0, 80).join("").trim();
  return `${clean || "Clipy project"}.${PROJECT_FILE.ext}`;
}
/** `name` if no project has it, else "name copy", "name copy 2", … (Duplicate's word). */
export function freeName(name: string, taken: readonly string[]): string {
  if (!taken.includes(name)) return name;
  for (let n = 1; ; n++) { const next = n === 1 ? `${name} copy` : `${name} copy ${n}`; if (!taken.includes(next)) return next; }
}

export function encodeHeader(header: FileHeader): Uint8Array {
  const text = JSON.stringify(header).replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  if (text.length > PROJECT_FILE.maxHeader) throw new Error("project file: header too large");
  return ascii(text);
}
export const totalBytes = (headerLength: number, files: readonly FileEntry[]): number =>
  PROJECT_FILE.prelude + headerLength + files.reduce((n, f) => n + f.size, 0) + PROJECT_FILE.trailer;

function isHeader(v: unknown): v is FileHeader {
  if (!isRec(v) || v.app !== "clipy" || !Number.isInteger(v.schemaVersion) || (v.schemaVersion as number) < 1 || !isRec(v.project) || !Array.isArray(v.files) || v.files.length > PROJECT_FILE.maxFiles) return false;
  const seen = new Set<string>();
  for (const f of v.files) {
    if (!isRec(f) || !isEntryPath(f.path) || !Number.isSafeInteger(f.size) || (f.size as number) < 0 || seen.has(f.path)) return false;
    seen.add(f.path);
  }
  return true;
}
function readAll(src: ChunkReader, offset: number, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let got = 0;
  while (got < length) {
    const part = src.read(offset + got, length - got);
    if (part.byteLength === 0 || part.byteLength > length - got) throw new ProjectFileError("damaged");
    out.set(part, got); got += part.byteLength;
  }
  return out;
}

/**
 * The header of a project file, after the whole file has been proved complete — its first 16 bytes, its header and its last 16
 * bytes are read, nothing else. Throws ProjectFileError: `notClipy` (too short for a prelude, or another magic), `newer` (a
 * later format version), `damaged` (everything else). The app's own schema check is the caller's (storage.restoreProject).
 */
export function readHeader(src: ChunkReader): { header: FileHeader; bodyStart: number } {
  const damaged = () => new ProjectFileError("damaged");
  const size = src.size, P = PROJECT_FILE.prelude, T = PROJECT_FILE.trailer;
  if (!(size >= P)) throw new ProjectFileError("notClipy");
  let pre: Uint8Array;
  try { pre = readAll(src, 0, P); } catch { throw new ProjectFileError("notClipy"); }
  if (!isAscii(pre, 0, PROJECT_FILE.magic)) throw new ProjectFileError("notClipy");
  const version = getU32(pre, 8), length = getU32(pre, 12);
  if (version > PROJECT_FILE.version) throw new ProjectFileError("newer");
  if (version < 1 || length < 2 || length > PROJECT_FILE.maxHeader || size < P + length + T) throw damaged();
  const head = readAll(src, P, length);
  let text = "";
  for (let i = 0; i < head.byteLength; i += 8192) {
    const part = head.subarray(i, i + 8192);
    for (let j = 0; j < part.byteLength; j++) if (part[j] > 127) throw damaged();
    text += String.fromCharCode.apply(null, part as unknown as number[]);
  }
  let header: unknown;
  try { header = JSON.parse(text); } catch { throw damaged(); }
  if (!isHeader(header)) throw damaged();
  const total = totalBytes(length, header.files);
  if (!Number.isSafeInteger(total) || size !== total) throw damaged();
  const tail = readAll(src, size - T, T);
  if (!isAscii(tail, 0, PROJECT_FILE.end) || getU32(tail, 8) + getU32(tail, 12) * TWO32 !== size) throw damaged();
  return { header: { ...header, name: typeof header.name === "string" ? header.name : "", savedAt: typeof header.savedAt === "string" ? header.savedAt : "" }, bodyStart: P + length };
}

/** `length` bytes from `offset` of `src` into `out`, a chunk at a time with a pause after each. Returns the new count of bytes done. */
export async function copyBytes(src: ChunkReader, offset: number, length: number, out: ChunkWriter, run: FileRun, pause: Pause, done: number): Promise<number> {
  let at = offset, left = length;
  while (left > 0) {
    if (run.cancelled) throw new ProjectFileError("cancelled");
    const bytes = src.read(at, Math.min(PROJECT_FILE.chunk, left));
    if (bytes.byteLength === 0 || bytes.byteLength > left) throw new Error("project file: short read");
    out.write(bytes);
    at += bytes.byteLength; left -= bytes.byteLength; done += bytes.byteLength;
    run.onProgress?.(done);
    await pause();
  }
  return done;
}

/** Writes a whole project file to `out` (the caller closes it); `open(path)` gives a reader for each listed file. Returns the file's length. */
export async function writeProjectFile(out: ChunkWriter, header: FileHeader, open: (path: string) => ChunkReader, run: FileRun, pause: Pause = nextTurn): Promise<number> {
  const head = encodeHeader(header);
  const total = totalBytes(head.byteLength, header.files);
  out.write(join(ascii(PROJECT_FILE.magic), u32(PROJECT_FILE.version), u32(head.byteLength)));
  out.write(head);
  let done = 0;
  for (const f of header.files) {
    const src = open(f.path);
    try {
      if (src.size !== f.size) throw new Error(`project file: ${f.path} changed size`);
      done = await copyBytes(src, 0, f.size, out, run, pause, done);
    } finally { src.close(); }
  }
  if (run.cancelled) throw new ProjectFileError("cancelled");
  out.write(join(ascii(PROJECT_FILE.end), u32(total % TWO32), u32(Math.floor(total / TWO32))));
  return total;
}

/** Every listed file out of a project file whose header `readHeader` accepted; `open(path)` gives a writer for each (closed here). */
export async function extractFiles(src: ChunkReader, header: FileHeader, bodyStart: number, open: (path: string) => ChunkWriter, run: FileRun, pause: Pause = nextTurn): Promise<void> {
  let at = bodyStart, done = 0;
  for (const f of header.files) {
    const out = open(f.path);
    try { done = await copyBytes(src, at, f.size, out, run, pause, done); } finally { out.close(); }
    at += f.size;
  }
  if (run.cancelled) throw new ProjectFileError("cancelled");
}
```

Run `projectFile.test.ts` — green. (If `tsc` objects to `String.fromCharCode.apply(null, part as unknown as number[])`, keep the cast; do not switch to a spread of a 2-MiB array anywhere.)

- [ ] **Step 3 — byte access on the adapter, red.** Create `src/projects/__tests__/fsBytes.test.ts`:

```ts
import { memoryFs } from "../fs";

test("memoryFs: size, a byte reader and a byte writer see one byte per character; a missing file has no size and cannot be read", async () => {
  const fs = memoryFs();
  fs.files.set("file:///doc/a.bin", "ABCDEF");
  expect(await fs.size("file:///doc/a.bin")).toBe(6);
  expect(await fs.size("file:///doc/none")).toBeNull();
  const r = fs.openReader("file:///doc/a.bin");
  expect(r.size).toBe(6);
  expect([...r.read(2, 3)]).toEqual([67, 68, 69]);
  expect([...r.read(4, 10)]).toEqual([69, 70]);
  expect(() => fs.openReader("file:///doc/none")).toThrow(/ENOENT/);
  const w = fs.openWriter("file:///doc/out/b.bin");
  expect(fs.files.get("file:///doc/out/b.bin")).toBe("");            // made, and empty, at once
  w.write(Uint8Array.from([0, 255, 65])); w.write(Uint8Array.from([66])); w.close();
  expect([...fs.openReader("file:///doc/out/b.bin").read(0, 4)]).toEqual([0, 255, 65, 66]);
});

test("memoryFs: moveDir renames a folder with everything in it", async () => {
  const fs = memoryFs();
  await fs.mkdir("file:///doc/incoming/x/media");
  fs.files.set("file:///doc/incoming/x/project.json", "{}"); fs.files.set("file:///doc/incoming/x/media/a.mov", "A");
  await fs.moveDir("file:///doc/incoming/x", "file:///doc/projects/x");
  expect([...fs.files.keys()].sort()).toEqual(["file:///doc/projects/x/media/a.mov", "file:///doc/projects/x/project.json"]);
  expect(await fs.exists("file:///doc/incoming/x")).toBe(false);
  expect(await fs.list("file:///doc/projects")).toEqual(["x"]);
});
```

- [ ] **Step 4 — green.** In `src/projects/fs.ts`: add `import type { ChunkReader } from "@/src/publish/fileReader"; import type { ChunkWriter } from "./fileWriter";` (types only — erased, so this file still loads no Expo module), add to `FsAdapter`:

```ts
  /** The file's length in bytes; null when there is no such file. */
  size(path: string): Promise<number | null>;
  /** Renames a whole folder. `to` must not exist yet. */
  moveDir(from: string, to: string): Promise<void>;
  /** Byte access in chunks — never a whole file in memory. A writer makes its file (and its folder), empty, at once. */
  openReader(path: string): ChunkReader;
  openWriter(path: string): ChunkWriter;
```

and to `memoryFs` (its files are strings: byte access sees ONE BYTE PER CHARACTER — say so in its doc comment; give it ASCII in tests):

```ts
    async size(p) { const t = files.get(norm(p)); return t === undefined ? null : t.length; },
    async moveDir(from, to) {
      const a = norm(from), b = norm(to);
      for (const f of [...files.keys()]) if (inDir(a, f)) { files.set(b + f.slice(a.length), files.get(f)!); files.delete(f); }
      for (const d of [...dirs]) if (d === a || inDir(a, d)) { dirs.add(b + d.slice(a.length)); dirs.delete(d); }
    },
    openReader(p) {
      const t = files.get(norm(p));
      if (t === undefined) throw new Error(`ENOENT ${p}`);
      return { size: t.length, read: (offset, length) => Uint8Array.from(t.slice(offset, offset + length), (c) => c.charCodeAt(0) & 255), close() {} };
    },
    openWriter(p) {
      const n = norm(p);
      files.set(n, "");
      return { write(bytes) { files.set(n, (files.get(n) ?? "") + Array.from(bytes, (c) => String.fromCharCode(c)).join("")); }, close() {} };
    },
```

In `src/projects/expoFs.ts`: `import { openReader } from "@/src/publish/fileReader"; import { openWriter } from "./fileWriter";` and

```ts
  async size(p) { const f = new File(p); return f.exists ? f.size : null; },
  // A destination folder that does not exist yet becomes the moved folder (expo-file-system: getMoveOrCopyPath) — a rename.
  async moveDir(from, to) { await new Directory(from).move(new Directory(to)); },
  openReader,
  openWriter,
```

- [ ] **Step 5.** Typecheck: any other object typed `FsAdapter` in the tree must compile (there are only these two). Full checks. Expect +2 app suites.
- [ ] **Step 6.** Commit: `feat(projects): the .clipy container format (pure, streamed) and byte access on the fs adapter`.

---

## Task 3 — Storage: pack, restore, sweep

**Files**
- Create: `src/projects/__tests__/storage.file.test.ts`
- Modify: `src/projects/storage.ts`, `src/projects/index.ts`

**Interfaces**
- Consumes: Task 1 `read` / `rebaseProject`; Task 2 everything; `migrateProject`, `SCHEMA_VERSION`.
- Produces on the object `makeStorage` returns:
  - `packProject(id: string, run: FileRun, pause?: Pause): Promise<{ uri: string; name: string; bytes: number; missing: number }>`
  - `restoreProject(fileUri: string, run: FileRun, pause?: Pause): Promise<{ id: string; name: string }>`
  - `sweepProjectFiles(): Promise<void>`
  Both throw `ProjectFileError` (`space` with `need` / `free`, `cancelled`, and for restore `notClipy` / `damaged` / `newer`) or a plain `Error`.

- [ ] **Step 1 — red.** Create `src/projects/__tests__/storage.file.test.ts`:

```ts
import { POST_PLATFORMS, SCHEMA_VERSION } from "@/src/editor/model/types";
import { memoryFs } from "../fs";
import { PROJECT_FILE, readHeader, writeProjectFile, type FileHeader, type FileRun } from "../projectFile";
import { makeStorage, type PickedAsset } from "../storage";

const now = async () => {};
const go = (): FileRun => ({ cancelled: false });
const asset = (uri: string): PickedAsset => ({ uri, kind: "video", durationSec: 4, width: 1080, height: 1920, fileName: "clip.mov" });
const PICKED = "file:///picked/Beach.clipy";
let warn: jest.SpyInstance;
beforeEach(() => { warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => warn.mockRestore());

/** Project id1: clips id2, id3; one sound file id4 used by two bars; posts; caches, a cover file and an unused file beside them. */
async function setup() {
  const fs = memoryFs();
  let n = 0;
  const thumbnail = jest.fn(async () => { fs.files.set("file:///tmp/t.jpg", "JPEG"); return "file:///tmp/t.jpg"; });
  const storage = makeStorage(fs, { thumbnail, newId: () => `id${++n}`, nowIso: () => "2026-10-13T10:00:00.000Z" });
  fs.files.set("file:///picked/a.mov", "AAAA"); fs.files.set("file:///picked/b.mov", "BB"); fs.files.set("file:///picked/song.m4a", "SSS");
  const { project } = await storage.createProject("Beach", [asset("file:///picked/a.mov"), asset("file:///picked/b.mov")]);
  const track = await storage.importAudio("id1", { uri: "file:///picked/song.m4a", title: "song.m4a", durationSec: 3 });
  const dir = "file:///doc/projects/id1";
  await storage.saveProject({ ...project, audioTracks: [track, { ...track, id: "second" }], posts: [{ platform: POST_PLATFORMS[0], url: "https://example.com/v", postedAt: "2026-10-12T09:00:00.000Z" }] });
  for (const extra of ["cutout/x.mov", "steady/y.mov", "sound/z.caf", "peaks/p.json", "cover-1-a-b-2.jpg", "media/unused.mov"]) fs.files.set(`${dir}/${extra}`, "CACHE");
  return { fs, storage, dir, thumbnail };
}
const temporaries = (fs: ReturnType<typeof memoryFs>) => [...fs.files.keys(), ...fs.dirs].filter((k) => k.includes("/project-files") || k.includes("/incoming"));
/** Save a copy and put it where the picker would: outside the app's own temporary folder (which every run sweeps). */
async function saved(s: Awaited<ReturnType<typeof setup>>) {
  const made = await s.storage.packProject("id1", go(), now);
  s.fs.files.set(PICKED, s.fs.files.get(made.uri)!);
  return made;
}

describe("packProject", () => {
  test("one file named after the project: the document with relative references, each source file once, the thumbnail — no cache, no cover", async () => {
    const s = await setup();
    const started: unknown[] = [];
    const made = await s.storage.packProject("id1", { cancelled: false, onStart: (i) => started.push(i) }, now);
    expect(made.uri).toBe("file:///cache/project-files/id5/Beach.clipy");
    expect(made).toMatchObject({ name: "Beach", missing: 0, bytes: s.fs.files.get(made.uri)!.length });
    expect(started).toEqual([{ name: "Beach", bytes: made.bytes }]);
    const { header } = readHeader(s.fs.openReader(made.uri));
    expect(header.files).toEqual([{ path: "media/id2.mov", size: 4 }, { path: "media/id3.mov", size: 2 }, { path: "media/id4.m4a", size: 3 }, { path: "thumb.jpg", size: 4 }]);
    expect(header).toMatchObject({ app: "clipy", schemaVersion: SCHEMA_VERSION, name: "Beach", savedAt: "2026-10-13T10:00:00.000Z" });
    const doc = header.project as { clips: { sourceUri: string }[]; audioTracks: { sourceUri: string }[]; posts: unknown[] };
    expect(doc.clips.map((c) => c.sourceUri)).toEqual(["media/id2.mov", "media/id3.mov"]);
    expect(doc.audioTracks.map((a) => a.sourceUri)).toEqual(["media/id4.m4a", "media/id4.m4a"]);
    expect(doc.posts).toHaveLength(1);
    expect(temporaries(s.fs).filter((k) => k.includes("part-"))).toEqual([]);
    expect(JSON.stringify(header)).not.toContain("file:///");
  });

  test("a name with a space or another script is a valid uri", async () => {
    const s = await setup();
    await s.storage.renameProject("id1", "Beach trip رحلة");
    const made = await s.storage.packProject("id1", go(), now);
    expect(made.uri).toBe(`file:///cache/project-files/id5/${encodeURIComponent("Beach trip رحلة.clipy")}`);
    expect(made.uri).not.toContain(" ");
  });

  test("a missing source file is left out and counted; the copy is still made", async () => {
    const s = await setup();
    s.fs.files.delete(`${s.dir}/media/id3.mov`);
    const made = await s.storage.packProject("id1", go(), now);
    expect(made.missing).toBe(1);
    expect(readHeader(s.fs.openReader(made.uri)).header.files.map((f) => f.path)).toEqual(["media/id2.mov", "media/id4.m4a", "thumb.jpg"]);
  });

  test("not enough room: refused with the sizes, before anything is written", async () => {
    const s = await setup();
    s.fs.freeBytes = async () => 1000;
    const before = s.fs.files.size;
    await expect(s.storage.packProject("id1", go(), now)).rejects.toMatchObject({ code: "space", free: 1000 });
    await s.storage.packProject("id1", go(), now).catch((e: { need: number }) => expect(e.need).toBeGreaterThan(PROJECT_FILE.spare));
    expect(s.fs.files.size).toBe(before);
    expect(temporaries(s.fs).filter((k) => k.endsWith(".clipy"))).toEqual([]);
  });

  test("cancel and a failure leave no file behind, and the project is untouched", async () => {
    const s = await setup();
    const json = s.fs.files.get(`${s.dir}/project.json`);
    const run: FileRun = { cancelled: false, onProgress: () => { run.cancelled = true; } };
    await expect(s.storage.packProject("id1", run, now)).rejects.toMatchObject({ code: "cancelled" });
    expect(temporaries(s.fs).filter((k) => k.endsWith(".clipy"))).toEqual([]);
    const open = s.fs.openReader;
    s.fs.openReader = (p) => { if (p.endsWith("id3.mov")) throw new Error("disk"); return open(p); };
    await expect(s.storage.packProject("id1", go(), now)).rejects.toThrow("disk");
    expect(temporaries(s.fs).filter((k) => k.endsWith(".clipy"))).toEqual([]);
    expect(s.fs.files.get(`${s.dir}/project.json`)).toBe(json);
  });
});

describe("restoreProject", () => {
  test("round trip: a NEW project with the same items and file names, pointing at its own folder; the original untouched", async () => {
    const s = await setup();
    const original = s.fs.files.get(`${s.dir}/project.json`);
    await saved(s);
    const back = await s.storage.restoreProject(PICKED, go(), now);
    expect(back).toEqual({ id: "id6", name: "Beach copy" });
    const dir = "file:///doc/projects/id6";
    expect(s.fs.files.get(`${dir}/media/id2.mov`)).toBe("AAAA");
    expect(s.fs.files.get(`${dir}/media/id3.mov`)).toBe("BB");
    expect(s.fs.files.get(`${dir}/media/id4.m4a`)).toBe("SSS");
    expect(s.fs.files.get(`${dir}/thumb.jpg`)).toBe("JPEG");
    const { project, missingSourceUris } = await s.storage.loadProject("id6");
    expect(missingSourceUris).toEqual([]);
    expect(project).toMatchObject({ id: "id6", name: "Beach copy", schemaVersion: SCHEMA_VERSION, updatedAt: "2026-10-13T10:00:00.000Z" });
    expect(project.clips.map((c) => [c.id, c.sourceUri])).toEqual([["id2", `${dir}/media/id2.mov`], ["id3", `${dir}/media/id3.mov`]]);
    expect(project.audioTracks.map((a) => [a.id, a.sourceUri])).toEqual([["id4", `${dir}/media/id4.m4a`], ["second", `${dir}/media/id4.m4a`]]);
    expect(project.posts).toHaveLength(1);                                   // kept: the project as it was
    expect((await s.fs.list(dir)).sort()).toEqual(["media", "project.json", "thumb.jpg"]);   // no cache came along
    expect(s.fs.files.get(`${s.dir}/project.json`)).toBe(original);
    expect(temporaries(s.fs)).toEqual([]);
    expect((await s.storage.listProjects()).map((p) => p.name)).toEqual(["Beach", "Beach copy"]);
  });

  test("the name is kept when it is free", async () => {
    const s = await setup();
    await saved(s);
    await s.storage.deleteProject("id1");
    expect((await s.storage.restoreProject(PICKED, go(), now)).name).toBe("Beach");
  });

  test("files first, project.json LAST, then one move of the folder", async () => {
    const s = await setup();
    await saved(s);
    const order: string[] = [];
    const w = s.fs.openWriter, t = s.fs.writeText, m = s.fs.moveDir;
    s.fs.openWriter = (p) => { order.push(p); return w(p); };
    s.fs.writeText = async (p, text) => { order.push(p); return t(p, text); };
    s.fs.moveDir = async (a, b) => { order.push(`move ${a} ${b}`); return m(a, b); };
    await s.storage.restoreProject(PICKED, go(), now);
    const stage = "file:///doc/incoming/id6";
    expect(order).toEqual([`${stage}/media/id2.mov`, `${stage}/media/id3.mov`, `${stage}/media/id4.m4a`, `${stage}/thumb.jpg`, `${stage}/project.json`, `move ${stage} file:///doc/projects/id6`]);
  });

  test("a project with a cover gets its cover picture at once; a file without a thumbnail gets one made", async () => {
    const s = await setup();
    const { project } = await s.storage.loadProject("id1");
    await s.storage.saveProject({ ...project, cover: { time: 1, title: "Day one" } });
    s.fs.files.delete(`${s.dir}/thumb.jpg`);
    await saved(s);
    s.thumbnail.mockClear();
    await s.storage.restoreProject(PICKED, go(), now);
    const names = await s.fs.list("file:///doc/projects/id6");
    expect(names).toContain("thumb.jpg");
    expect(names.some((x) => /^cover-.*\.jpg$/.test(x))).toBe(true);
    expect((await s.storage.listProjects()).find((p) => p.id === "id6")).toMatchObject({ coverTitle: "Day one", broken: false });
  });

  test("not a Clipy file, a cut-off one, a newer one: refused by name, and nothing is added", async () => {
    const s = await setup();
    await saved(s);
    const whole = s.fs.files.get(PICKED)!;
    s.fs.files.set("file:///picked/song.mp3", "ID3 this is a song, not a project at all");
    await expect(s.storage.restoreProject("file:///picked/song.mp3", go(), now)).rejects.toMatchObject({ code: "notClipy" });
    s.fs.files.set("file:///picked/cut.clipy", whole.slice(0, whole.length - 5));
    await expect(s.storage.restoreProject("file:///picked/cut.clipy", go(), now)).rejects.toMatchObject({ code: "damaged" });
    const newer: FileHeader = { app: "clipy", schemaVersion: SCHEMA_VERSION + 1, savedAt: "", name: "Later", project: { id: "x", clips: [], schemaVersion: SCHEMA_VERSION + 1 }, files: [] };
    const out = s.fs.openWriter("file:///picked/newer.clipy");
    await writeProjectFile(out, newer, () => { throw new Error("no files"); }, go(), now);
    await expect(s.storage.restoreProject("file:///picked/newer.clipy", go(), now)).rejects.toMatchObject({ code: "newer" });
    const bad: FileHeader = { ...newer, schemaVersion: SCHEMA_VERSION, project: { name: "no id, no clips" } };
    await writeProjectFile(s.fs.openWriter("file:///picked/bad.clipy"), bad, () => { throw new Error("no files"); }, go(), now);
    await expect(s.storage.restoreProject("file:///picked/bad.clipy", go(), now)).rejects.toMatchObject({ code: "damaged" });
    expect(await s.fs.list("file:///doc/projects")).toEqual(["id1"]);
    expect(temporaries(s.fs)).toEqual([]);
  });

  test("an older project opens: it goes through migrate like any load", async () => {
    const s = await setup();
    const old: FileHeader = { app: "clipy", schemaVersion: 2, savedAt: "", name: "Old", project: { id: "x", name: "Old", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", clips: [], overlays: [], audioTracks: [], schemaVersion: 2 }, files: [] };
    await writeProjectFile(s.fs.openWriter("file:///picked/old.clipy"), old, () => { throw new Error("no files"); }, go(), now);
    const back = await s.storage.restoreProject("file:///picked/old.clipy", go(), now);
    const { project } = await s.storage.loadProject(back.id);
    expect(project).toMatchObject({ name: "Old", schemaVersion: SCHEMA_VERSION, createdAt: "2026-09-01T00:00:00.000Z", layers: [], posts: [] });
  });

  test("a reference that tries to leave the folder cannot: it becomes a missing file inside media/", async () => {
    const s = await setup();
    const doc = JSON.parse(s.fs.files.get(`${s.dir}/project.json`)!);
    const evil: FileHeader = { app: "clipy", schemaVersion: SCHEMA_VERSION, savedAt: "", name: "E", files: [], project: { ...doc, clips: [{ ...doc.clips[0], sourceUri: "../../../id1/media/.." }] } };
    await writeProjectFile(s.fs.openWriter("file:///picked/evil.clipy"), evil, () => { throw new Error("no files"); }, go(), now);
    const back = await s.storage.restoreProject("file:///picked/evil.clipy", go(), now);
    const { project } = await s.storage.loadProject(back.id);
    expect(project.clips[0].sourceUri).toBe(`file:///doc/projects/${back.id}/media/missing`);
  });

  test("not enough room, a cancel, a failed write: nothing is added and nothing is left", async () => {
    const s = await setup();
    await saved(s);
    const free = s.fs.freeBytes;
    s.fs.freeBytes = async () => 1000;
    await expect(s.storage.restoreProject(PICKED, go(), now)).rejects.toMatchObject({ code: "space", free: 1000, need: 13 + PROJECT_FILE.spare });
    s.fs.freeBytes = free;
    const run: FileRun = { cancelled: false, onProgress: () => { run.cancelled = true; } };
    await expect(s.storage.restoreProject(PICKED, run, now)).rejects.toMatchObject({ code: "cancelled" });
    const move = s.fs.moveDir;
    s.fs.moveDir = async () => { throw new Error("disk"); };
    await expect(s.storage.restoreProject(PICKED, go(), now)).rejects.toThrow("disk");
    s.fs.moveDir = move;
    expect(await s.fs.list("file:///doc/projects")).toEqual(["id1"]);
    expect(temporaries(s.fs)).toEqual([]);
    expect(s.fs.files.has(PICKED)).toBe(true);   // the picked file is the caller's to remove
  });
});

test("sweepProjectFiles removes both temporary places whole, and nothing else", async () => {
  const s = await setup();
  s.fs.files.set("file:///cache/project-files/part-old.clipy", "x"); s.fs.files.set("file:///cache/project-files/r/Old.clipy", "x");
  s.fs.files.set("file:///doc/incoming/half/media/a.mov", "x"); s.fs.files.set("file:///cache/exports/v.mp4", "V");
  const projects = [...s.fs.files.keys()].filter((k) => k.includes("/projects/"));
  await s.storage.sweepProjectFiles();
  expect(temporaries(s.fs)).toEqual([]);
  expect(s.fs.files.has("file:///cache/exports/v.mp4")).toBe(true);
  expect([...s.fs.files.keys()].filter((k) => k.includes("/projects/"))).toEqual(projects);
});

test("every run starts by sweeping what an earlier one left", async () => {
  const s = await setup();
  s.fs.files.set("file:///cache/project-files/part-old.clipy", "x"); s.fs.files.set("file:///doc/incoming/half/media/a.mov", "x");
  const made = await s.storage.packProject("id1", go(), now);
  expect(temporaries(s.fs).filter((k) => s.fs.files.has(k))).toEqual([made.uri]);
});
```

Notes for whoever runs it: `13` in the space test is the sum of the four file sizes (4 + 2 + 3 + 4).
- [ ] **Step 2 — green.** In `src/projects/storage.ts` add the imports

```ts
import { PROJECT_FILE, ProjectFileError, baseName, encodeHeader, extractFiles, fileNameFor, freeName, isSafeName, nextTurn, readHeader, totalBytes, writeProjectFile, type FileEntry, type FileHeader, type FileRun, type Pause } from "./projectFile";
```

and, inside `makeStorage` after `renameProject`:

```ts
  // —— Project files (.clipy): Save a Copy and Open Project File. Spec: docs/superpowers/specs/2026-10-13-project-backup-design.md ——
  /** Where a copy is written before it is shared; and where an opened file is laid out before its folder is moved into place. Both are swept whole. */
  const filesDir = `${fs.cacheDir}project-files`;
  const incoming = `${fs.documentDir}incoming`;
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  /** Every item's reference rewritten by `to` — clips, layers and sounds: the model's only file references (rebase.guard.test.ts). */
  const pointed = (list: unknown, to: (uri: unknown) => string): unknown => (Array.isArray(list) ? list.map((x) => (isObj(x) ? { ...x, sourceUri: to(x.sourceUri) } : x)) : list);

  /** Removes everything a save or an open may have left behind (a run that was killed). Never throws. Only one run exists at a time. */
  async function sweepProjectFiles(): Promise<void> {
    await fs.remove(filesDir).catch(() => {});
    await fs.remove(incoming).catch(() => {});
  }

  /**
   * ONE project as one file in the cache, named after it: the document with relative references, each source file once, the
   * thumbnail. No cover picture and no cache folder — they are made again. Written as `part-…` and moved into place only when
   * complete. A source file that is missing (or is not `<project>/media/<name>`) is left out and counted.
   */
  async function packProject(id: string, run: FileRun, pause: Pause = nextTurn): Promise<{ uri: string; name: string; bytes: number; missing: number }> {
    await sweepProjectFiles();
    const { project } = await loadProject(id);
    const dir = projectDir(id);
    const rel = (uri: unknown) => `media/${baseName(uri)}`;
    const files: FileEntry[] = [];
    const seen = new Set<string>();
    let missing = 0;
    for (const uri of [...project.clips, ...project.layers, ...project.audioTracks].map((x) => x.sourceUri)) {
      const path = rel(uri);
      if (seen.has(path)) continue;
      seen.add(path);
      const size = isSafeName(baseName(uri)) && uri === `${dir}/${path}` ? await fs.size(uri) : null;
      if (size === null) missing++; else files.push({ path, size });
    }
    const thumb = await fs.size(thumbPath(id));
    if (thumb !== null) files.push({ path: "thumb.jpg", size: thumb });
    const doc = { ...project, clips: pointed(project.clips, rel), layers: pointed(project.layers, rel), audioTracks: pointed(project.audioTracks, rel) } as unknown as Record<string, unknown>;
    const header: FileHeader = { app: "clipy", schemaVersion: SCHEMA_VERSION, savedAt: deps.nowIso(), name: project.name, project: doc, files };
    const bytes = totalBytes(encodeHeader(header).byteLength, files);
    const free = await fs.freeBytes();
    if (free < bytes + PROJECT_FILE.spare) throw new ProjectFileError("space", bytes + PROJECT_FILE.spare, free);
    run.onStart?.({ name: project.name, bytes });
    const runId = deps.newId();
    const part = `${filesDir}/part-${runId}.${PROJECT_FILE.ext}`, home = `${filesDir}/${runId}`;
    const uri = `${home}/${encodeURIComponent(fileNameFor(project.name))}`;
    try {
      const out = fs.openWriter(part);
      try { await writeProjectFile(out, header, (path) => fs.openReader(`${dir}/${path}`), run, pause); } finally { out.close(); }
      await fs.mkdir(home);
      await fs.move(part, uri);
    } catch (e) {
      await fs.remove(part).catch(() => {});
      await fs.remove(home).catch(() => {});
      throw e;
    }
    return { uri, name: project.name, bytes, missing };
  }

  /**
   * A project file as a NEW project (a new id; no existing project is ever touched). The file is proved complete and readable by
   * this app before anything is written; its files are laid out in `incoming/`, project.json LAST, and the folder is moved into
   * place in one rename — so a half-opened project is never listed. Item ids and file base names are kept (a speech bar is known
   * by its file name; cache names come from the stem). Any failure or a cancel leaves nothing. The picked file is the caller's.
   */
  async function restoreProject(fileUri: string, run: FileRun, pause: Pause = nextTurn): Promise<{ id: string; name: string }> {
    await sweepProjectFiles();
    const src = fs.openReader(fileUri);
    const id = deps.newId();
    const stage = `${incoming}/${id}`, dir = projectDir(id);
    let restored: Project;
    let hasThumb = false;
    try {
      const { header, bodyStart } = readHeader(src);
      if (header.schemaVersion > SCHEMA_VERSION) throw new ProjectFileError("newer");
      const at = (uri: unknown) => `${dir}/media/${isSafeName(baseName(uri)) ? baseName(uri) : "missing"}`;
      const raw = header.project;
      let project: Project;
      try { project = migrateProject({ ...raw, id, clips: pointed(raw.clips, at), layers: pointed(raw.layers, at), audioTracks: pointed(raw.audioTracks, at) }); }
      catch (e) { throw new ProjectFileError(e instanceof Error && /newer version/.test(e.message) ? "newer" : "damaged"); }
      const bytes = header.files.reduce((n, f) => n + f.size, 0);
      const free = await fs.freeBytes();
      if (free < bytes + PROJECT_FILE.spare) throw new ProjectFileError("space", bytes + PROJECT_FILE.spare, free);
      const wanted = (typeof project.name === "string" && project.name.trim()) || header.name.trim() || "Project";
      const name = freeName(wanted, (await listProjects()).filter((p) => !p.broken).map((p) => p.name));
      run.onStart?.({ name, bytes });
      await fs.mkdir(`${stage}/media`);
      await extractFiles(src, header, bodyStart, (path) => fs.openWriter(`${stage}/${path}`), run, pause);
      restored = { ...project, name, updatedAt: deps.nowIso() };
      await fs.writeText(`${stage}/project.json`, JSON.stringify(restored));
      await fs.mkdir(root);
      await fs.moveDir(stage, dir);
      hasThumb = header.files.some((f) => f.path === "thumb.jpg");
    } catch (e) {
      await fs.remove(stage).catch(() => {});
      await fs.remove(dir).catch(() => {});
      throw e;
    } finally { src.close(); }
    // The pictures of the card: best effort, neither throws.
    if (!hasThumb) await writeThumb(restored);
    await writeCover(restored);
    return { id, name: restored.name };
  }
```

Add `packProject, restoreProject, sweepProjectFiles` to the returned object. Things to hold to while making it green:
  - `migrateProject` must not be handed a document without `createdAt` … it does not care; do not "repair" the document here beyond `id`, the three lists and (after migrate) `name` / `updatedAt`.
  - `fs.remove(dir)` in the catch can only meet a folder this run made (the id is new) — keep it, for a move that half happened.
  - `writeThumb` / `writeCover` already swallow their own errors; do not wrap or await anything else after the move.
  - If the "space" assertion on `need` is off by the header, re-read §3 of the spec: opening needs the SUM OF THE FILE SIZES plus the spare, saving needs the TOTAL LENGTH plus the spare.

In `src/projects/index.ts`, after `makeStorage(…)`:

```ts
// Once per launch: what a save or an open that was killed left behind (storage.sweepProjectFiles never throws).
void storage.sweepProjectFiles();
```

- [ ] **Step 3.** `storage.file.test.ts` green; `storage.test.ts`, `storage.audio.test.ts`, `storage.load.proof.test.ts`, `quickEditFlow.test.ts` green and unedited. Full checks. Expect +1 app suite.
- [ ] **Step 4.** Commit: `feat(projects): pack a project into a .clipy file and restore one as a new project`.

---

## Task 4 — The screen

**Files**
- Create: `src/projects/filePhone.ts`, `src/projects/projectFileWords.ts`, `src/projects/useProjectFile.ts`, `src/projects/TransferCard.tsx`, `src/projects/__tests__/projectFileWords.test.ts`, `src/projects/__tests__/TransferCard.test.tsx`, `src/projects/__tests__/homeFile.test.tsx`
- Modify: `src/projects/index.ts`, `src/projects/ProjectActionsSheet.tsx`, `app/index.tsx`, `src/ui/sfSymbols.ts`, `src/ui/__tests__/sfSymbols.map.test.ts`, `src/__tests__/sheets.r2.test.tsx`, `src/projects/__tests__/home.glass.test.tsx` (line 77 only), `src/projects/__tests__/home.layout.test.tsx` (line 52 and that test's name only)

**Interfaces**
- Consumes: `storage.packProject` / `restoreProject` / `sweepProjectFiles`, `ProjectFileError`, `formatBytes` (`@/src/export/estimate`), `useStayAwake` (`@/src/export/exportAwake`), `lastFlush` (`@/src/editor/flush`), `useToast`, `AFTER_SHEET_MS`.
- Produces:
  - `filePhone: { pick(): Promise<string | null>; share(uri: string): Promise<void>; forget(uri: string): Promise<void> }` (exported from `@/src/projects`)
  - `FILE_WORDS`, `failureWords(kind: "save" | "open", e: unknown): { title: string; message: string } | null`, `addedWords(name: string): string`, `missingWords(n: number): string`
  - `type Transfer = { kind: "save" | "open"; name: string; bytes: number; done: number }`; `useProjectFile(reload: () => Promise<void>): { transfer: Transfer | null; saveCopy(p: ProjectSummary): Promise<void>; openFile(uri: string): Promise<void>; cancel(): void }`
  - `TransferCard({ transfer, onCancel })`, `TRANSFER`
  - `ProjectActionsSheet` gains the required prop `onSaveCopy: (p: ProjectSummary) => void`

- [ ] **Step 1 — the words, red then green.** `src/projects/__tests__/projectFileWords.test.ts`:

```ts
import { ProjectFileError } from "../projectFile";
import { addedWords, failureWords, missingWords } from "../projectFileWords";

test("every failure has a title and a plain sentence; a cancel says nothing", () => {
  expect(failureWords("open", new ProjectFileError("cancelled"))).toBeNull();
  expect(failureWords("save", new ProjectFileError("cancelled"))).toBeNull();
  expect(failureWords("open", new ProjectFileError("notClipy"))).toEqual({ title: "Can't open this file", message: "That isn't a Clipy project file." });
  expect(failureWords("open", new ProjectFileError("damaged"))).toEqual({ title: "Can't open this file", message: "This project file is damaged or incomplete." });
  expect(failureWords("open", new ProjectFileError("newer"))).toEqual({ title: "Can't open this file", message: "It was made with a newer version of Clipy. Update the app to open it." });
  expect(failureWords("open", new ProjectFileError("space", 2.1e9, 1.4e9))).toEqual({ title: "Not enough free space", message: "Opening this project needs 2.1 GB. This iPhone has 1.4 GB free." });
  expect(failureWords("save", new ProjectFileError("space", 350e6, 20e6))).toEqual({ title: "Not enough free space", message: "Saving a copy needs 350 MB. This iPhone has 20 MB free." });
  expect(failureWords("open", new Error("ENOENT /private/var/x"))).toEqual({ title: "Can't open this file", message: "Something went wrong while opening it. Nothing was added." });
  expect(failureWords("save", "boom")).toEqual({ title: "Couldn't save a copy", message: "Something went wrong while saving. Try again." });
});
test("no sentence shows the system's own text", () => {
  for (const kind of ["save", "open"] as const) expect(JSON.stringify(failureWords(kind, new Error("NSCocoaErrorDomain 513 /private/var")))).not.toMatch(/NSCocoa|private/);
});
test("done and missing", () => {
  expect(addedWords("Beach trip")).toBe("Beach trip was added to your projects");
  expect(missingWords(1)).toBe("1 file of this project is missing and is not in the copy");
  expect(missingWords(3)).toBe("3 files of this project are missing and are not in the copy");
});
```

`src/projects/projectFileWords.ts`:

```ts
import { formatBytes } from "@/src/export/estimate";
import { ProjectFileError } from "./projectFile";

/** Every word Save a Copy and Open Project File say outside the card (the card's are TRANSFER in TransferCard.tsx). Sentence style; never the system's text. */
export const FILE_WORDS = {
  cantOpen: "Can't open this file", cantSave: "Couldn't save a copy", noSpace: "Not enough free space",
  notClipy: "That isn't a Clipy project file.",
  damaged: "This project file is damaged or incomplete.",
  newer: "It was made with a newer version of Clipy. Update the app to open it.",
  openFailed: "Something went wrong while opening it. Nothing was added.",
  saveFailed: "Something went wrong while saving. Try again.",
  shareFailed: "The share sheet couldn't be opened. Try again.",
} as const;

/** The alert for a failed save or open; null for a cancel (which says nothing). */
export function failureWords(kind: "save" | "open", e: unknown): { title: string; message: string } | null {
  const code = e instanceof ProjectFileError ? e.code : null;
  if (code === "cancelled") return null;
  if (code === "space") { const err = e as ProjectFileError; return { title: FILE_WORDS.noSpace, message: `${kind === "save" ? "Saving a copy" : "Opening this project"} needs ${formatBytes(err.need)}. This iPhone has ${formatBytes(err.free)} free.` }; }
  if (kind === "save") return { title: FILE_WORDS.cantSave, message: FILE_WORDS.saveFailed };
  return { title: FILE_WORDS.cantOpen, message: code === "notClipy" ? FILE_WORDS.notClipy : code === "damaged" ? FILE_WORDS.damaged : code === "newer" ? FILE_WORDS.newer : FILE_WORDS.openFailed };
}
export const addedWords = (name: string): string => `${name} was added to your projects`;
export const missingWords = (n: number): string => (n === 1 ? "1 file of this project is missing and is not in the copy" : `${n} files of this project are missing and are not in the copy`);
```

- [ ] **Step 2 — the card, red then green.** `src/projects/__tests__/TransferCard.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { theme } from "@/src/theme/theme";
import { leftovers, wear } from "@/src/ui/testing/appearance";
import { TransferCard } from "../TransferCard";

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);

test("saving: the title, the name with the size, a bar at its percent, Cancel — on the screen family's own colours", async () => {
  const onCancel = jest.fn();
  await render(<TransferCard transfer={{ kind: "save", name: "Beach trip", bytes: 2.1e9, done: 0.525e9 }} onCancel={onCancel} />);
  expect(screen.getByText("Saving a copy")).toBeTruthy();
  expect(screen.getByText("Beach trip · 2.1 GB")).toBeTruthy();
  expect(flat("home-transfer")).toMatchObject({ backgroundColor: theme.screen.bar, borderRadius: theme.radius.card });
  expect(screen.getByTestId("home-transfer-bar")).toHaveProp("accessibilityValue", { min: 0, max: 100, now: 25 });
  expect(flat("home-transfer-bar")).toMatchObject({ height: theme.space.xs, backgroundColor: theme.screen.tile });
  expect(flat("home-transfer-fill")).toMatchObject({ width: "25%", backgroundColor: theme.screen.accentInk });
  await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(screen.queryAllByTestId("primary-button")).toHaveLength(0);
});
test("opening, before the file has said what it is: the title alone, the bar at 0; a small project shows no size", async () => {
  const view = await render(<TransferCard transfer={{ kind: "open", name: "", bytes: 0, done: 0 }} onCancel={jest.fn()} />);
  expect(screen.getByText("Opening project file")).toBeTruthy();
  expect(flat("home-transfer-fill").width).toBe("0%");
  await view.rerender(<TransferCard transfer={{ kind: "open", name: "Beach", bytes: 4000, done: 4000 }} onCancel={jest.fn()} />);
  expect(screen.getByText("Beach")).toBeTruthy();
  expect(flat("home-transfer-fill").width).toBe("100%");
});
describe("in light", () => {
  afterEach(() => wear("dark"));
  test("cream card, deep-gold fill, nothing navy left", async () => {
    wear("light");
    await render(<TransferCard transfer={{ kind: "save", name: "Beach", bytes: 5e6, done: 1e6 }} onCancel={jest.fn()} />);
    expect(flat("home-transfer")).toMatchObject({ backgroundColor: theme.screens.light.bar });
    expect(flat("home-transfer-fill")).toMatchObject({ backgroundColor: theme.screens.light.accentInk });
    expect(leftovers()).toEqual([]);
  });
});
```

(`wear` / `leftovers` are used exactly as `home.layout.test.tsx` uses them; if a bare component needs the appearance handed down as that file's `home()` does, do it the same way.) `src/projects/TransferCard.tsx`:

```tsx
import { View } from "react-native";
import { formatBytes } from "@/src/export/estimate";
import { theme } from "@/src/theme/theme";
import { QuietButton } from "@/src/ui/QuietButton";
import { Body } from "@/src/ui/Text";
import { useSurfaces } from "@/src/ui/tone";
import type { Transfer } from "./useProjectFile";

/** What the card says while a project file is written or read. Only what the app knows. */
export const TRANSFER = { save: "Saving a copy", open: "Opening project file" } as const;

/**
 * Home's bottom actions give way to this ONE card while a project file is saved or opened (Home is inert meanwhile, as while a
 * project is made): what is happening, the project's name and size, a bar, Cancel. Plain views; the bar's width is a style
 * value — nothing is animated.
 */
export function TransferCard({ transfer, onCancel }: { transfer: Transfer; onCancel: () => void }) {
  const s = useSurfaces();
  const percent = transfer.bytes > 0 ? Math.min(100, Math.floor((transfer.done * 100) / transfer.bytes)) : 0;
  const detail = [transfer.name, transfer.bytes >= 1e6 ? formatBytes(transfer.bytes) : null].filter(Boolean).join(" · ");
  return (
    <View testID="home-transfer" style={{ flex: 1, gap: theme.space.sm, paddingVertical: theme.space.md, paddingHorizontal: theme.space.lg, borderRadius: theme.radius.card, backgroundColor: s.bar }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.space.md }}>
        {/* One accessible element: the two lines are read once. */}
        <View accessible accessibilityLabel={[TRANSFER[transfer.kind], detail].filter(Boolean).join(", ")} style={{ flex: 1 }}>
          <Body weight="semi">{TRANSFER[transfer.kind]}</Body>
          {detail ? <Body muted numberOfLines={1}>{detail}</Body> : null}
        </View>
        <QuietButton compact title="Cancel" onPress={onCancel} />
      </View>
      <View testID="home-transfer-bar" accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }} style={{ height: theme.space.xs, borderRadius: theme.radius.pill, backgroundColor: s.tile, overflow: "hidden" }}>
        <View testID="home-transfer-fill" style={{ width: `${percent}%`, height: theme.space.xs, backgroundColor: s.accentInk }} />
      </View>
    </View>
  );
}
```

(`(transfer.done * 100) / transfer.bytes` is arithmetic, not a spacing value; if `spacingScale.test.ts` objects to the line, move the sum into a helper above the component — do not touch the guard.)

- [ ] **Step 3 — the phone's two sheets.** `src/projects/filePhone.ts` (no test of its own: it is three calls into Expo; Home's tests mock it through `@/src/projects`):

```ts
import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";

/** The ONLY file that asks the phone for a project file or shows the share sheet for one. */
export const filePhone = {
  /**
   * Apple's file picker, any file (a .clipy has no registered type: it is known by its bytes). iOS hands the app a temporary COPY;
   * its uri, or null when the picker was closed (this call reports every failure as closed).
   */
  async pick(): Promise<string | null> {
    const picked = await File.pickFileAsync();
    return picked.canceled ? null : picked.result.uri;
  },
  /** Apple's share sheet for one file; resolves when the sheet has closed, whatever was chosen. iOS types the file by its extension. */
  async share(uri: string): Promise<void> { await Sharing.shareAsync(uri); },
  /** Removes the picker's temporary copy. Never throws. */
  async forget(uri: string): Promise<void> { try { const f = new File(uri); if (f.exists) f.delete(); } catch { /* the system clears its own temporary folder */ } },
};
```

In `src/projects/index.ts` add `export { filePhone } from "./filePhone";`.

- [ ] **Step 4 — Home, red.** `src/projects/__tests__/homeFile.test.tsx` (the mock block is `homeBusy.test.tsx`'s, plus the new members):

```tsx
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";

jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useFocusEffect: (cb: () => void | (() => void)) => { const React = require("react"); React.useEffect(cb, []); } }));
jest.mock("@/src/auth/welcomeSeen", () => ({ hasSeenWelcome: () => true, markWelcomeSeen: jest.fn() }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/publish/pickVideo", () => ({ pickVideoForPost: jest.fn() }));
jest.mock("@/src/projects", () => ({
  storage: { listProjects: jest.fn(), createProject: jest.fn(), renameProject: jest.fn(), duplicateProject: jest.fn(), deleteProject: jest.fn(), importAudio: jest.fn(), saveProject: jest.fn(),
    packProject: jest.fn(), restoreProject: jest.fn(), sweepProjectFiles: jest.fn(async () => {}) },
  filePhone: { pick: jest.fn(), share: jest.fn(async () => {}), forget: jest.fn(async () => {}) },
}));
jest.mock("@/src/projects/quickEditFlow", () => ({ makeQuickEdit: jest.fn() }));
jest.mock("@/src/lib/id", () => ({ newId: () => "new-id" }));

import { router } from "expo-router";
import { Alert } from "react-native";
import ProjectsScreen from "@/app/index";
import { filePhone, storage } from "@/src/projects";
import { AFTER_SHEET_MS, ProjectActionsSheet } from "@/src/projects/ProjectActionsSheet";
import { ProjectFileError, type FileRun } from "@/src/projects/projectFile";
import { DISABLED_OPACITY } from "@/src/ui/buttonStyle";
import { useToast } from "@/src/ui/Toast";

const list = storage.listProjects as jest.Mock, packProject = storage.packProject as jest.Mock, restoreProject = storage.restoreProject as jest.Mock, sweep = storage.sweepProjectFiles as jest.Mock;
const pick = filePhone.pick as jest.Mock, share = filePhone.share as jest.Mock, forget = filePhone.forget as jest.Mock;
const BEACH = { id: "a", name: "Beach", durationSec: 65, updatedAt: new Date().toISOString(), thumbUri: null, broken: false, postedTo: [], coverTitle: "" };
const BROKEN = { id: "z", name: "Can't open", durationSec: 0, updatedAt: "", thumbUri: null, broken: true, postedTo: [], coverTitle: "" };
const btn = (name: string) => screen.getByRole("button", { name });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, AFTER_SHEET_MS + 50)); });
let warn: jest.SpyInstance, alert: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks(); list.mockReset(); list.mockResolvedValue([BEACH, BROKEN]); packProject.mockReset(); restoreProject.mockReset(); pick.mockReset();
  share.mockReset(); share.mockResolvedValue(undefined); useToast.getState().clear();
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => { warn.mockRestore(); alert.mockRestore(); });
const home = async () => { await render(<ProjectsScreen />); await screen.findByText("Beach"); };

/** A run that stands still until `finish` or `fail`; `run` is what the screen handed to storage. */
function held(mock: jest.Mock) {
  let finish: (v: unknown) => void = () => {}, fail: (e: unknown) => void = () => {};
  const box: { run: FileRun | null } = { run: null };
  mock.mockImplementationOnce((_first: string, run: FileRun) => { box.run = run; return new Promise((res, rej) => { finish = res; fail = rej; }); });
  return { box, finish: (v: unknown) => act(async () => { finish(v); }), fail: (e: unknown) => act(async () => { fail(e); }) };
}
const startSave = async () => {
  const h = held(packProject);
  await home();
  await fireEvent.press(btn("More for Beach"));
  await fireEvent.press(await screen.findByRole("button", { name: "Save a Copy" }));
  await settle();
  await screen.findByTestId("home-transfer");
  return h;
};

describe("the header's folder button and the sheet's button", () => {
  test("the pill holds three buttons; Open Project File is the middle one", async () => {
    await home();
    expect(within(screen.getByTestId("home-header-actions")).getAllByRole("button").map((b) => b.props.accessibilityLabel)).toEqual(["Post a video", "Open Project File", "Accounts"]);
  });
  test("Save a Copy is offered for a project and not for one that cannot be opened", async () => {
    await home();
    await fireEvent.press(btn("More for Beach"));
    expect(await screen.findByRole("button", { name: "Save a Copy" })).toBeTruthy();
    for (const name of ["Rename", "Duplicate", "Delete"]) expect(btn(name)).toBeTruthy();
  });
  test("the sheet of a project that cannot be opened has Delete only", async () => {
    await render(<ProjectActionsSheet project={BROKEN} onClose={jest.fn()} onRename={jest.fn()} onDuplicate={jest.fn()} onSaveCopy={jest.fn()} onDelete={jest.fn()} />);
    for (const name of ["Rename", "Duplicate", "Save a Copy"]) expect(screen.queryByRole("button", { name })).toBeNull();
    expect(btn("Delete")).toBeTruthy();
  });
});

describe("Save a Copy", () => {
  test("while it runs: the card with the name, the size and the percent; Home takes no touches and is dimmed; the two actions are gone", async () => {
    const h = await startSave();
    expect(packProject).toHaveBeenCalledWith("a", expect.objectContaining({ cancelled: false }));
    await act(async () => { h.box.run!.onStart!({ name: "Beach", bytes: 2e9 }); h.box.run!.onProgress!(1e9); });
    expect(screen.getByText("Saving a copy")).toBeTruthy();
    expect(screen.getByText("Beach · 2.0 GB")).toBeTruthy();
    expect(screen.getByTestId("home-transfer-bar")).toHaveProp("accessibilityValue", { min: 0, max: 100, now: 50 });
    for (const id of ["home-header-actions", "home-list"]) { expect(screen.getByTestId(id).props.pointerEvents).toBe("none"); expect(screen.getByTestId(id)).toHaveStyle({ opacity: DISABLED_OPACITY }); }
    expect(screen.queryByRole("button", { name: "New Project" })).toBeNull();
    expect(screen.queryByTestId("home-making")).toBeNull();
    await h.finish({ uri: "file:///cache/project-files/r/Beach.clipy", name: "Beach", bytes: 2e9, missing: 0 });
  });

  test("done: the share sheet gets the file; Home is itself again at once; the temporary file is swept after the sheet closes; nothing is said", async () => {
    const h = await startSave();
    let closeSheet: () => void = () => {};
    share.mockImplementationOnce(() => new Promise<void>((r) => { closeSheet = r; }));
    await h.finish({ uri: "file:///cache/project-files/r/Beach.clipy", name: "Beach", bytes: 5e6, missing: 0 });
    await waitFor(() => expect(share).toHaveBeenCalledWith("file:///cache/project-files/r/Beach.clipy"));
    expect(screen.queryByTestId("home-transfer")).toBeNull();
    expect(screen.getByTestId("home-list").props.pointerEvents).toBe("auto");
    expect(sweep).not.toHaveBeenCalled();
    await act(async () => { closeSheet(); });
    await waitFor(() => expect(sweep).toHaveBeenCalledTimes(1));
    expect(useToast.getState().message).toBeNull();
    expect(alert).not.toHaveBeenCalled();
  });

  test("files were missing: said once, after the share sheet", async () => {
    const h = await startSave();
    await h.finish({ uri: "file:///c/Beach.clipy", name: "Beach", bytes: 5e6, missing: 2 });
    await waitFor(() => expect(useToast.getState().message).toBe("2 files of this project are missing and are not in the copy"));
  });

  test("Cancel sets the run's flag; a cancelled run says nothing and shares nothing", async () => {
    const h = await startSave();
    await fireEvent.press(btn("Cancel"));
    expect(h.box.run!.cancelled).toBe(true);
    await h.fail(new ProjectFileError("cancelled"));
    await waitFor(() => expect(screen.queryByTestId("home-transfer")).toBeNull());
    expect(share).not.toHaveBeenCalled(); expect(alert).not.toHaveBeenCalled(); expect(useToast.getState().message).toBeNull();
    expect(btn("New Project")).toBeTruthy();
  });

  test("no room: the alert with both sizes; any other failure: the plain alert, never the system's words", async () => {
    let h = await startSave();
    await h.fail(new ProjectFileError("space", 2.1e9, 1.4e9));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Not enough free space", "Saving a copy needs 2.1 GB. This iPhone has 1.4 GB free."));
    alert.mockClear();
    h = held(packProject);
    await fireEvent.press(btn("More for Beach"));
    await fireEvent.press(await screen.findByRole("button", { name: "Save a Copy" }));
    await settle();
    await h.fail(new Error("NSCocoaErrorDomain 640"));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Couldn't save a copy", "Something went wrong while saving. Try again."));
    expect(share).not.toHaveBeenCalled();
  });

  test("a share sheet that cannot be shown: the plain alert, and the file is still swept", async () => {
    const h = await startSave();
    share.mockRejectedValueOnce(new Error("no view controller"));
    await h.finish({ uri: "file:///c/Beach.clipy", name: "Beach", bytes: 5e6, missing: 0 });
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Couldn't save a copy", "The share sheet couldn't be opened. Try again."));
    expect(sweep).toHaveBeenCalled();
  });

  test("while a copy is saved nothing else starts: the folder button's picker is not opened", async () => {
    const h = await startSave();
    await fireEvent.press(btn("Open Project File"));     // inert by pointerEvents on a phone; the guard holds here too
    expect(pick).not.toHaveBeenCalled();
    await h.finish({ uri: "file:///c/Beach.clipy", name: "Beach", bytes: 5e6, missing: 0 });
  });
});

describe("Open Project File", () => {
  const startOpen = async () => {
    pick.mockResolvedValueOnce("file:///tmp/inbox/Beach.clipy");
    const h = held(restoreProject);
    await home();
    await fireEvent.press(btn("Open Project File"));
    await screen.findByTestId("home-transfer");
    return h;
  };
  test("the picker closed: nothing happens", async () => {
    pick.mockResolvedValueOnce(null);
    await home();
    await fireEvent.press(btn("Open Project File"));
    await waitFor(() => expect(pick).toHaveBeenCalledTimes(1));
    expect(restoreProject).not.toHaveBeenCalled(); expect(screen.queryByTestId("home-transfer")).toBeNull(); expect(alert).not.toHaveBeenCalled();
  });
  test("a second tap while the picker is up opens no second picker", async () => {
    let answer: (v: string | null) => void = () => {};
    pick.mockImplementationOnce(() => new Promise((r) => { answer = r; }));
    await home();
    await fireEvent.press(btn("Open Project File"));
    await fireEvent.press(btn("Open Project File"));
    expect(pick).toHaveBeenCalledTimes(1);
    await act(async () => { answer(null); });
  });
  test("opened: the card, then the list is read again, the toast names the project, the picked copy is removed — and the editor is NOT opened", async () => {
    const h = await startOpen();
    expect(restoreProject).toHaveBeenCalledWith("file:///tmp/inbox/Beach.clipy", expect.objectContaining({ cancelled: false }));
    expect(screen.getByText("Opening project file")).toBeTruthy();
    expect(screen.getByTestId("home-list").props.pointerEvents).toBe("none");
    list.mockClear();
    await h.finish({ id: "n", name: "Beach copy" });
    await waitFor(() => expect(useToast.getState().message).toBe("Beach copy was added to your projects"));
    expect(list).toHaveBeenCalled();
    expect(forget).toHaveBeenCalledWith("file:///tmp/inbox/Beach.clipy");
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.queryByTestId("home-transfer")).toBeNull();
  });
  test.each([
    ["notClipy", "Can't open this file", "That isn't a Clipy project file."],
    ["damaged", "Can't open this file", "This project file is damaged or incomplete."],
    ["newer", "Can't open this file", "It was made with a newer version of Clipy. Update the app to open it."],
  ] as const)("%s: its own alert; the picked copy is removed; no toast", async (code, title, message) => {
    const h = await startOpen();
    await h.fail(new ProjectFileError(code));
    await waitFor(() => expect(alert).toHaveBeenCalledWith(title, message));
    expect(forget).toHaveBeenCalledWith("file:///tmp/inbox/Beach.clipy");
    expect(useToast.getState().message).toBeNull();
    expect(btn("New Project")).toBeTruthy();
  });
  test("no room says both sizes; Cancel says nothing", async () => {
    let h = await startOpen();
    await h.fail(new ProjectFileError("space", 3e9, 1e9));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Not enough free space", "Opening this project needs 3.0 GB. This iPhone has 1.0 GB free."));
    alert.mockClear();
    pick.mockResolvedValueOnce("file:///tmp/inbox/Beach.clipy");
    h = held(restoreProject);
    await fireEvent.press(btn("Open Project File"));
    await screen.findByTestId("home-transfer");
    await fireEvent.press(btn("Cancel"));
    expect(h.box.run!.cancelled).toBe(true);
    await h.fail(new ProjectFileError("cancelled"));
    await waitFor(() => expect(screen.queryByTestId("home-transfer")).toBeNull());
    expect(alert).not.toHaveBeenCalled();
  });
});
```

Run it: red (no button, no hook).

- [ ] **Step 5 — green: the hook.** `src/projects/useProjectFile.ts`:

```ts
import { useRef, useState } from "react";
import { Alert } from "react-native";
import { lastFlush } from "@/src/editor/flush";
import { useStayAwake } from "@/src/export/exportAwake";
import { filePhone, storage, type ProjectSummary } from "@/src/projects";
import { useToast } from "@/src/ui/Toast";
import type { FileRun } from "./projectFile";
import { addedWords, failureWords, FILE_WORDS, missingWords } from "./projectFileWords";

/** A project file being written (`save`) or read (`open`): what the card shows. `bytes` is 0 until the size is known. */
export type Transfer = { kind: "save" | "open"; name: string; bytes: number; done: number };
const percent = (done: number, bytes: number) => (bytes > 0 ? Math.floor((done * 100) / bytes) : 0);

/**
 * Save a Copy and Open Project File, for Home. One run at a time — Home's own guards see to that. While `transfer` is set Home is
 * inert and shows the card; the screen is kept awake (a locked phone suspends the app and the copy with it). Nothing here promises
 * work in the background. A cancel says nothing; a failure is one alert in plain words (the system's text goes to the log).
 */
export function useProjectFile(reload: () => Promise<void>) {
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const current = useRef<FileRun | null>(null);
  useStayAwake(transfer !== null);

  function begin(kind: Transfer["kind"], name: string): FileRun {
    const run: FileRun = {
      cancelled: false,
      onStart: (info) => setTransfer((t) => (t ? { ...t, name: info.name, bytes: info.bytes } : t)),
      // The card is drawn again only when the whole percent changes: at most a hundred times, however many chunks there are.
      onProgress: (done) => setTransfer((t) => (t && percent(done, t.bytes) !== percent(t.done, t.bytes) ? { ...t, done } : t)),
    };
    current.current = run;
    setTransfer({ kind, name, bytes: 0, done: 0 });
    return run;
  }
  function end() { current.current = null; setTransfer(null); }
  function failed(kind: Transfer["kind"], e: unknown) {
    const words = failureWords(kind, e);
    if (!words) return;                      // cancelled
    console.warn(`project file ${kind} failed`, e);
    Alert.alert(words.title, words.message);
  }

  /** Packs the project, then hands the file to Apple's share sheet; resolves when the sheet has closed. The temporary file is removed then. */
  async function saveCopy(p: ProjectSummary): Promise<void> {
    const run = begin("save", p.name);
    let made: Awaited<ReturnType<typeof storage.packProject>> | null = null;
    try { await lastFlush; made = await storage.packProject(p.id, run); }
    catch (e) { failed("save", e); }
    finally { end(); }
    if (!made) return;
    try { await filePhone.share(made.uri); }
    catch (e) { console.warn("share failed", e); Alert.alert(FILE_WORDS.cantSave, FILE_WORDS.shareFailed); }
    finally { await storage.sweepProjectFiles(); }
    if (made.missing > 0) useToast.getState().show(missingWords(made.missing));
  }

  /** A picked file as a new project. The picked (temporary) copy is removed however it ends. */
  async function openFile(uri: string): Promise<void> {
    const run = begin("open", "");
    try {
      const made = await storage.restoreProject(uri, run);
      try { await reload(); } catch (e) { console.warn("reload after open failed", e); }
      useToast.getState().show(addedWords(made.name));
    } catch (e) { failed("open", e); }
    finally { end(); await filePhone.forget(uri); }
  }

  const cancel = () => { if (current.current) current.current.cancelled = true; };
  return { transfer, saveCopy, openFile, cancel };
}
```

- [ ] **Step 6 — green: the sheet and Home.**

`src/projects/ProjectActionsSheet.tsx`: add `onSaveCopy: (p: ProjectSummary) => void` to `Props` and the destructuring, and between Duplicate and Delete:

```tsx
        {/* After the sheet is gone, like an alert: iOS drops the share sheet if it is presented while this Modal is still leaving. */}
        {shown?.broken ? null : <SecondaryButton title="Save a Copy" onPress={run(onSaveCopy, true)} />}
```

`src/ui/sfSymbols.ts`: in the group of the home screen's names add `"folder-open-outline": "folder",` (SF Symbols 1.0). `src/ui/__tests__/sfSymbols.map.test.ts`: add `"folder-open-outline"` to `USED` in its alphabetical place and raise the count in the comment above it from 124 to 125 (and any `toHaveLength` that pins that number — read the file).

`app/index.tsx` — four edits, nothing else:

1. Imports: `import { filePhone, type PickedAsset, type ProjectSummary } from "@/src/projects";` (a value import now — it replaces the type-only one), `import { TransferCard } from "@/src/projects/TransferCard";`, `import { useProjectFile } from "@/src/projects/useProjectFile";`.
2. `const { projects, loading, reload, create, createQuick, rename, duplicate, remove } = useProjects();` and under it `const { transfer, saveCopy, openFile, cancel } = useProjectFile(reload);`.
3. After `onQuickChoose`:

```tsx
  // Save a Copy and Open Project File share the two refs with New Project and Quick Edit, so none of the four can run together.
  // While the copy is written or read (`transfer`) the screen is inert as while a project is made; the ref is held on through the
  // share sheet, which iOS presents over the screen.
  async function onSaveCopy(p: ProjectSummary) {
    if (starting.current || creating.current) return;
    creating.current = true;
    try { await saveCopy(p); } finally { creating.current = false; }
  }
  async function onOpenFile() {
    if (starting.current || creating.current) return;
    starting.current = true;
    let uri: string | null = null;
    try {
      setPending(null);
      setQuickOpen(false);
      uri = await filePhone.pick();
    } catch (e) { console.warn("pick failed", e); } finally { starting.current = false; }
    if (!uri) return;
    creating.current = true;
    try { await openFile(uri); } finally { creating.current = false; }
  }

  const inert = busy || transfer !== null;
  const touch = inert ? "none" : "auto";
  const dim = inert ? DISABLED_OPACITY : 1;
```

   (replacing the two existing lines `const touch = busy ? …` and `const dim = busy ? …`; their comments stay, with "or a project file is saved or opened" added).
4. JSX: in the pill, between the two buttons, `<IconButton name="folder-open-outline" accessibilityLabel="Open Project File" onPress={onOpenFile} />` — and change the comment above the pill from "The two header actions" to "The three header actions". In `home-actions`: `{transfer ? <TransferCard transfer={transfer} onCancel={cancel} /> : making ? ( … unchanged … ) : ( … unchanged … )}`. On the sheet: `onSaveCopy={onSaveCopy}`.

   The `Glass` element's props and `style` are not edited. `MAKING` is not edited (a project file is not "making a project"; the card has its own table, `TRANSFER`).

Update the pins the Global Constraints name: `home.glass.test.tsx:77` and `home.layout.test.tsx:52` to the three labels; `sheets.r2.test.tsx` — add `onSaveCopy={jest.fn()}` to both renders and `"Save a Copy"` to the list of grey secondary buttons in its first test.

- [ ] **Step 7.** Run: `homeFile.test.tsx`, `TransferCard.test.tsx`, `projectFileWords.test.ts`, and every existing Home suite (`home.glass`, `home.layout`, `home.r2`, `homeBusy`, `homeCamera`, `quickEditHome`, `ProjectsScreen`), `sheets.r2`, `sfSymbols.map`, `Icon*.test.tsx`, and the guards (`casing.guard`, `spacingScale`, `noHexLiterals`, `outlineIcons`, `palette.guard`, `systemFont.guard`). The old Home suites mock `@/src/projects` without `filePhone` / the three new storage functions: they must pass UNEDITED except for the two pins — if one of them fails for another reason, something in `app/index.tsx` runs at render that should run only on a press. Then the full checks. Expect +3 app suites.
- [ ] **Step 8.** Commit: `feat(home): Save a Copy and Open Project File — the sheet's button, the folder button, progress, messages`.

---

## Task 5 — Independent review and fixes

**Files:** whatever the findings name, inside this plan's file lists.

- [ ] **Step 1.** A reviewer who has not written Tasks 1–4 reads the spec and the diff of the branch (`git diff main...HEAD -- src app`), without the plan's code blocks, and answers each of these with a file and a line:
  1. Can `loadProject` or `listProjects` write, in any branch? (They must not.) Is `rebaseProject` an identity return when nothing moved?
  2. Is there a path — failure, cancel, a throw from `onStart`, a `close()` that throws — on which a part file, a staging folder or a new project folder is left? On which a read or write handle stays open?
  3. Can a crafted file write outside `<projects>/<new id>/` or over an existing project? Can a header make the app allocate without bound (the 8 MiB cap, the 10 000 entries)?
  4. Does any existing project's `project.json` or media get touched by save or open?
  5. Is anything passed to a writer a `subarray`? Is any whole file read into memory? Is any loop over file bytes without a pause?
  6. Home: is there a state in which the card is gone but `creating.current` stays true for ever (a throw between `begin` and `end`)? In which Home stays dimmed? Does the sweep after the share sheet run when `share` throws?
  7. AGENTS.md: three glass surfaces and the pill's style untouched; colours only through `useSurfaces()`; no apostrophe in new JSX text; casing ("Save a Copy", "Cancel" title style; titles and messages sentence style); nothing animated; no new package.
  8. The strings on screen against spec §5, character for character.
  9. Were any of the never-edited tests edited (`git diff main...HEAD --stat` against the list in Global Constraints)? Is `storage.load.proof.test.ts` byte for byte what Task 1 Step 1 committed (`git log --follow -p` on it shows one commit)?
- [ ] **Step 2.** Each finding: a failing test first, then the fix, in the file's own task's style. A finding that would change the spec (a string, the format, the rule) is not fixed silently: it is written under a new heading "Changes after review" at the end of the spec, with its reason.
- [ ] **Step 3.** Full checks. Commit: `fix(projects): review findings for project files` (or nothing, if there were none — say so in the hand-over).

---

## Task 6 — Docs

**Files**
- Modify: `AGENTS.md`
- Create: `docs/superpowers/plans/2026-10-13-project-backup-phone-checklist.md`

- [ ] **Step 1.** `AGENTS.md`: after the "Quick edit (home screen)…" bullet add ONE bullet, in the file's own voice:

> - Project files: a project's file references (`Clip.sourceUri` of clips and layers, `AudioTrack.sourceUri` — the model has no other: `rebase.guard.test.ts`) are stored ABSOLUTE and re-pointed at where the project's folder is NOW on every load, in memory only — `rebaseProject` (`src/projects/rebase.ts`, pure; the same object when nothing moved), applied by the one private reader `read` in storage.ts; loading and listing never write (`storage.load.proof.test.ts` is never edited to pass), and never store a reference relative (an older build would lose every file). A new field that holds a file must be added to `rebaseProject`, `packProject` and `restoreProject` together. Save a Copy (the project actions sheet) and Open Project File (the folder button in Home's header pill — a third child of the same glass pill, whose style is not edited) write and read ONE format, `.clipy`, defined only in `src/projects/projectFile.ts` (pure, no Expo: magic, version, an ASCII-JSON header with the document — references relative, `media/<base name>` — and the list of files, the bytes, a trailer with the file's own length; a file may only name `thumb.jpg` or `media/<one safe name>`; no checksum; a change of layout is a new `PROJECT_FILE.version`). Bytes move only in chunks through `ChunkReader` (src/publish/fileReader.ts) and `ChunkWriter` (src/projects/fileWriter.ts — the file is created before it is opened; never hand it a `subarray`), with a real turn of the event loop after every chunk (`nextTurn`); never read a whole media file. `storage.packProject` packs the document, each source file once and the thumbnail — never the cover picture or `sound/` `cutout/` `steady/` `peaks/`, which are made again — into `<cache>/project-files/` (a `part-` file, moved when complete); `storage.restoreProject` proves the file complete from its first 16 bytes, its header and its last 16 before writing anything, makes a NEW id (item ids and file base names are kept: speech bars and cache names depend on them; posts are kept; the name gets " copy" only when it is taken), lays the files out in `<documents>/incoming/`, writes project.json LAST and moves the folder into place in one rename — a half-opened project is never listed and no existing project is ever touched; `sweepProjectFiles` clears both temporary places at launch, before every run and after the share sheet. The phone's picker and share sheet are named only in `src/projects/filePhone.ts` (exported by `src/projects/index.ts`, so tests mock it there); the screen's half is `useProjectFile` + `TransferCard` (`home-transfer`: Home is inert as while a project is made, the two bottom actions give way to the card; its words are `TRANSFER`, every other word is in `projectFileWords.ts`; failures are a system alert, a cancel says nothing, saving says nothing because the share sheet is Apple's). Nothing promises work in the background; the screen is kept awake while a run is on. Not built: automatic or iCloud backup, opening Clipy by tapping a `.clipy` (a build-time plist change), compression.

- [ ] **Step 2.** The checklist file: what was built (five lines, plain words), the three commands the owner runs (`npx.cmd expo start --go`, nothing else), then spec §7's thirteen items as a checklist with an empty "what I saw" line under each, and under it "If something is slow or stalls: tell me the project's size and how long it took — the chunk size (`PROJECT_FILE.chunk`) is one number." State plainly at the top: nothing of this is in the TestFlight app until the next build; it can be tried today in Expo Go, on projects made in Expo Go.
- [ ] **Step 3.** `npm.cmd run typecheck`, `npx.cmd jest -w 8`, `npm.cmd run test:server`. Final count expected: app 395 suites (386 + 3 in Task 1, 2 in Task 2, 1 in Task 3, 3 in Task 4), server 21, no failure.
- [ ] **Step 4.** Commit: `docs: AGENTS.md "Project files"; the owner's phone checklist for project backup`.
