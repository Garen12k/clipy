# Undo history kept with the project: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The editor's Undo and Redo survive leaving the editor, reopening the project and restarting the app. Nothing new is on screen. The project itself is never put at risk: a history is applied only to the exact `project.json` it was written beside, and is otherwise dropped silently.

**Architecture:** Three small pieces. `src/projects/history.ts` — pure (no import): the stamp, the caps, the line format. `src/projects/storage.ts` gains `saveHistory` / `loadHistory`, and `loadProject` also returns the `stamp` of the text it parsed. `src/editor/historyKeeper.ts` — the editor's half: when there is something to write, the lazy read after opening, the write when the app stops being active; the store gains one action, `restoreHistory`; `useLoadProject` calls the keeper on open and writes project → history → cover on leave. `undo`, `redo`, `apply`, `saveProject`, the autosave and the four sweeps are not edited.

**Tech Stack:** Expo SDK 57, React Native, TypeScript strict, zustand 5, `expo-file-system` (through the existing `FsAdapter`), Jest 29.7 (`jest-expo`) + RNTL 14. **No new package, no native code, no `app.json` change, no schema bump, nothing added to `project.json`.**

**Spec:** `docs/superpowers/specs/2026-10-13-undo-history-design.md` (binding: §2 the file and the caps, §3 the stamp, §4 writing, §5 reading and the media rule, §6 what is not restored).

## Global Constraints

- iPhone only. Read `AGENTS.md` first; it binds. No UI is added or changed: no component, no string on screen, no colour, no spacing value.
- **Never edited to make a change pass:** `storage.load.proof.test.ts`, the PROOF blocks of `migrate.test.ts` and `useExport*.test.ts`, `cutoutRenders.test.ts`, `looks.frozen.test.ts`, `timeline.stepped.proof.test.ts`, `rebase.guard.test.ts`.
- **Tests you may update, and only this:** the `jest.mock("@/src/projects", …)` factory line of `src/editor/__tests__/useLoadProject.test.tsx` and `src/editor/__tests__/useLoadProject.emptyText.test.tsx` gets two more functions — `loadHistory: jest.fn(async () => null), saveHistory: jest.fn(async () => true)`. No assertion in either file changes.
- **Not edited by any task:** `src/editor/model/**`, `src/projects/rebase.ts`, `src/projects/projectFile.ts`, `src/editor/useAutosave.ts`, `src/editor/components/**`, `app/**`, anything under `modules/`, `app.json`, `package.json`. In `src/editor/store.ts` only the interface line and the one new action are added — `apply`, `beginTransaction`, `applyTransient`, `undo`, `redo`, `withLive`, `setProject`, `reset` keep their bytes. In `soundRenders.ts`, `cutoutRenders.ts`, `steadyRenders.ts` only one comment each changes (Task 2 Step 9).
- `saveProject` keeps its bytes. A history write can never make a project save fail, wait or be skipped.
- `loadHistory` writes nothing and removes nothing. `saveHistory` and `loadHistory` never throw.
- RNTL v14: `render` / `renderHook` / `fireEvent` are async — always `await`.
- **Checks for every task:** `npm.cmd run typecheck`, then `npm.cmd test` (`test:app` already runs with `--maxWorkers=8`, then `test:server`). Baseline on this branch (2026-10-13, f3ed505): typecheck clean; app **411 suites / 6268 tests**, all pass, about 40 s; server **21 suites / 591 tests**. Every task ends with the app suite count grown by exactly its new files and no failure.
- Windows: PowerShell, no `&&`, `npx.cmd` / `npm.cmd`. Never `git stash`. `git add` explicit paths only. Do not start or stop a dev server. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Task order

`1 → 2 → 3 → 4`

| Task | Title | Depends on |
|---|---|---|
| 1 | The history file: the pure module and storage's read / write | — |
| 2 | The editor: `restoreHistory`, the keeper, open / leave / inactive, the deleters guard | 1 |
| 3 | Independent review and fixes | 1–2 |
| 4 | Docs: one AGENTS.md line, the owner's phone checklist | 3 |

---

## Task 1 — The history file

**Files**
- Create: `src/projects/history.ts`, `src/projects/__tests__/history.test.ts`, `src/projects/__tests__/storage.history.test.ts`
- Modify: `src/projects/storage.ts`

**Interfaces**
- Consumes: `Project`, `SCHEMA_VERSION` (`@/src/editor/model/types`); `migrateProject`; `rebaseProject`; `FsAdapter`, `memoryFs`; `Pause`, `nextTurn` (`./projectFile`); `HISTORY_LIMIT` (`@/src/editor/store`, in the test only).
- Produces, in `history.ts`:
  - `HISTORY_FILE: { name: "history.jsonl"; app: "clipy-history"; version: 1; maxSteps: 50; maxChars: 4_000_000; maxBytes: 12_000_000 }`
  - `interface HistoryLines { past: string[]; future: string[] }`
  - `stampOf(text: string): string`
  - `lineOf(snapshot: object): string`
  - `fitHistory(past: readonly string[], future: readonly string[], maxSteps?: number, maxChars?: number): HistoryLines`
  - `encodeHistory(projectId: string, schemaVersion: number, stamp: string, lines: HistoryLines): string`
  - `decodeHistory(text: string, projectId: string, schemaVersion: number, stamp: string): HistoryLines | null`
- Produces, on the storage object:
  - `loadProject(id: string): Promise<{ project: Project; missingSourceUris: string[]; stamp: string }>`
  - `saveHistory(p: Project, past: readonly Project[], future: readonly Project[]): Promise<boolean>`
  - `loadHistory(project: Project, stamp: string, pause?: Pause): Promise<{ past: Project[]; future: Project[] } | null>`

- [ ] **Step 1 — red: the pure module.** Create `src/projects/__tests__/history.test.ts`:

```ts
import { HISTORY_LIMIT } from "@/src/editor/store";
import { decodeHistory, encodeHistory, fitHistory, HISTORY_FILE, lineOf, stampOf } from "../history";

describe("stampOf", () => {
  test("the same text has the same stamp; it starts with the length", () => {
    expect(stampOf("abc")).toBe(stampOf("abc"));
    expect(stampOf("abc")).toMatch(/^3\.[0-9a-f]{1,8}\.[0-9a-f]{1,8}$/);
    expect(stampOf("")).toMatch(/^0\./);
  });
  test("one changed character, two swapped characters and one more character each change it", () => {
    const base = JSON.stringify({ id: "p1", name: "Beach", clips: [{ id: "a", trimEnd: 4 }] });
    const stamps = new Set([base, base.replace("Beach", "Beech"), base.replace("Beach", "Baech"), `${base} `, base.replace("4", "5")].map(stampOf));
    expect(stamps.size).toBe(5);
  });
  test("characters outside ASCII count (a caption in Arabic, an emoji)", () => {
    expect(stampOf("مرحبا")).not.toBe(stampOf("مرحبأ"));
    expect(stampOf("a🙂")).not.toBe(stampOf("a🙃"));
  });
});

describe("lineOf", () => {
  test("is JSON.stringify of the snapshot, made once per object", () => {
    const snap = { id: "p1", name: "A\nB C" };
    const spy = jest.spyOn(JSON, "stringify");
    const line = lineOf(snap);
    expect(lineOf(snap)).toBe(line);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    expect(line).toBe(JSON.stringify(snap));
    expect(line).not.toContain("\n");                       // a line feed inside a text is escaped: one snapshot, one line
    expect(lineOf({ ...snap })).toBe(line);                 // another object with the same content: the same text
  });
});

describe("fitHistory", () => {
  const steps = (n: number, prefix: string, size = 10) => Array.from({ length: n }, (_, i) => `${prefix}${i}`.padEnd(size, "."));
  test("the store's limit and the file's are one number", () => { expect(HISTORY_FILE.maxSteps).toBe(HISTORY_LIMIT); });
  test("keeps the newest undo steps and the nearest redo steps", () => {
    const got = fitHistory(steps(60, "p"), steps(60, "f"), 50, 1e9);
    expect(got.past).toHaveLength(50);
    expect(got.past[0].startsWith("p10")).toBe(true);        // past is oldest first: the ten oldest went
    expect(got.past[49].startsWith("p59")).toBe(true);
    expect(got.future).toHaveLength(50);
    expect(got.future[0].startsWith("f0")).toBe(true);       // future is nearest first: the ten farthest went
    expect(got.future[49].startsWith("f49")).toBe(true);
  });
  test("over the size cap the OLDEST undo steps go first; each line counts with its line feed", () => {
    const past = steps(5, "p"), future = steps(2, "f");      // 7 lines of 10 + 1
    expect(fitHistory(past, future, 50, 77)).toEqual({ past, future });
    expect(fitHistory(past, future, 50, 76)).toEqual({ past: past.slice(1), future });
    expect(fitHistory(past, future, 50, 44)).toEqual({ past: past.slice(3), future });
  });
  test("with no undo step left the FARTHEST redo steps go; a snapshot bigger than the cap keeps nothing", () => {
    const past = steps(2, "p"), future = steps(3, "f");
    expect(fitHistory(past, future, 50, 30)).toEqual({ past: [], future: future.slice(0, 2) });
    expect(fitHistory(past, future, 50, 10)).toEqual({ past: [], future: [] });
    expect(fitHistory([], [], 50, 10)).toEqual({ past: [], future: [] });
  });
  test("the inputs are not changed", () => {
    const past = steps(3, "p"), future = steps(3, "f"), was = [[...past], [...future]];
    fitHistory(past, future, 2, 15);
    expect([past, future]).toEqual(was);
  });
});

describe("encodeHistory / decodeHistory", () => {
  const past = [lineOf({ id: "p1", n: 0, text: "two\nlines" }), lineOf({ id: "p1", n: 1 })], future = [lineOf({ id: "p1", n: 3, text: " " })];
  const text = encodeHistory("p1", 21, "9.aa.bb", { past, future });
  test("a header line, then past oldest first, then future nearest first; no trailing line feed", () => {
    const lines = text.split("\n");
    expect(lines).toHaveLength(4);
    expect(JSON.parse(lines[0])).toEqual({ app: "clipy-history", version: 1, schemaVersion: 21, projectId: "p1", stamp: "9.aa.bb", past: 2, future: 1 });
    expect(lines.slice(1)).toEqual([...past, ...future]);
  });
  test("round trip", () => { expect(decodeHistory(text, "p1", 21, "9.aa.bb")).toEqual({ past, future }); });
  test("another stamp, project, schema, app or file version: null", () => {
    expect(decodeHistory(text, "p1", 21, "9.aa.bc")).toBeNull();
    expect(decodeHistory(text, "p2", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory(text, "p1", 22, "9.aa.bb")).toBeNull();
    expect(decodeHistory(text, "p1", 20, "9.aa.bb")).toBeNull();
    expect(decodeHistory(text.replace("clipy-history", "clipy"), "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory(text.replace('"version":1', '"version":2'), "p1", 21, "9.aa.bb")).toBeNull();
  });
  test("a file that is cut off, has a line too many, an empty line, or lying counts: null", () => {
    const lines = text.split("\n");
    const header = (patch: object) => [JSON.stringify({ ...JSON.parse(lines[0]), ...patch }), ...lines.slice(1)].join("\n");
    expect(decodeHistory(lines.slice(0, 3).join("\n"), "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory(`${text}\n${past[0]}`, "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory(`${text}\n`, "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory([lines[0], "", lines[2], lines[3]].join("\n"), "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory(header({ past: 3, future: 0 }), "p1", 21, "9.aa.bb")).not.toBeNull();   // the same three lines, split another way, are still three lines
    expect(decodeHistory(header({ past: 1 }), "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory(header({ past: 2.5, future: 0.5 }), "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory(header({ past: -1, future: 4 }), "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory(header({ past: "2" }), "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory(header({ past: 51, future: 0 }), "p1", 21, "9.aa.bb")).toBeNull();
  });
  test("no steps, no text, a header that is not an object, a text that is too long: null", () => {
    expect(decodeHistory(encodeHistory("p1", 21, "9.aa.bb", { past: [], future: [] }), "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory("", "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory("[1]\n{}", "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory("null\n{}", "p1", 21, "9.aa.bb")).toBeNull();
    expect(decodeHistory("{not json\n{}", "p1", 21, "9.aa.bb")).toBeNull();
    const huge = encodeHistory("p1", 21, "9.aa.bb", { past: ["x".repeat(HISTORY_FILE.maxChars + 5000)], future: [] });
    expect(decodeHistory(huge, "p1", 21, "9.aa.bb")).toBeNull();
  });
});
```

Run `npx.cmd jest src/projects/__tests__/history.test.ts` — fails (no module).

- [ ] **Step 2 — green.** Create `src/projects/history.ts`:

```ts
/**
 * The undo history kept beside a project: `<project>/history.jsonl`. Pure — no import. Spec:
 * docs/superpowers/specs/2026-10-13-undo-history-design.md.
 *
 *   line 1        {"app":"clipy-history","version":1,"schemaVersion":N,"projectId":"…","stamp":"…","past":P,"future":F}
 *   P lines       the undo stack, oldest first (the store's `past`)
 *   F lines       the redo stack, nearest first (the store's `future`)
 *
 * A snapshot line is `JSON.stringify(project)`, which never holds a raw line feed. A history belongs to ONE text of project.json,
 * named by `stamp`; storage applies it to nothing else.
 */
export const HISTORY_FILE = { name: "history.jsonl", app: "clipy-history", version: 1, maxSteps: 50, maxChars: 4_000_000, maxBytes: 12_000_000 } as const;

export interface HistoryLines { past: string[]; future: string[] }

/** A text's fingerprint: its length and two independent 32-bit hashes (FNV-1a, djb2) of its UTF-16 units. */
export function stampOf(text: string): string {
  let a = 0x811c9dc5, b = 5381;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = (Math.imul(b, 33) + c) | 0;
  }
  return `${text.length}.${(a >>> 0).toString(16)}.${(b >>> 0).toString(16)}`;
}

const lines = new WeakMap<object, string>();
/** A snapshot as its line, made once per object: a project object in the editor's stacks is never mutated (every op returns a new one). */
export function lineOf(snapshot: object): string {
  let line = lines.get(snapshot);
  if (line === undefined) { line = JSON.stringify(snapshot); lines.set(snapshot, line); }
  return line;
}

/**
 * What is written: the newest `maxSteps` undo steps and the nearest `maxSteps` redo steps; then, while the lines (each with its
 * line feed) are over `maxChars`, the OLDEST undo step goes, and with none left the FARTHEST redo step — redo is the newest work.
 */
export function fitHistory(past: readonly string[], future: readonly string[], maxSteps: number = HISTORY_FILE.maxSteps, maxChars: number = HISTORY_FILE.maxChars): HistoryLines {
  const p = past.slice(-maxSteps), f = future.slice(0, maxSteps);
  let size = 0;
  for (const l of p) size += l.length + 1;
  for (const l of f) size += l.length + 1;
  let from = 0, to = f.length;
  while (size > maxChars && from < p.length) size -= p[from++].length + 1;
  while (size > maxChars && to > 0) size -= f[--to].length + 1;
  return { past: p.slice(from), future: f.slice(0, to) };
}

export function encodeHistory(projectId: string, schemaVersion: number, stamp: string, h: HistoryLines): string {
  const header = { app: HISTORY_FILE.app, version: HISTORY_FILE.version, schemaVersion, projectId, stamp, past: h.past.length, future: h.future.length };
  return [JSON.stringify(header), ...h.past, ...h.future].join("\n");
}

/** The snapshot lines of a history that is exactly this project's, this schema's and this stamp's — or null. Nothing is repaired. */
export function decodeHistory(text: string, projectId: string, schemaVersion: number, stamp: string): HistoryLines | null {
  if (typeof text !== "string" || text.length === 0 || text.length > HISTORY_FILE.maxChars + 4096) return null;
  const all = text.split("\n");
  let header: unknown;
  try { header = JSON.parse(all[0]); } catch { return null; }
  if (typeof header !== "object" || header === null || Array.isArray(header)) return null;
  const h = header as Record<string, unknown>;
  if (h.app !== HISTORY_FILE.app || h.version !== HISTORY_FILE.version || h.schemaVersion !== schemaVersion || h.projectId !== projectId || h.stamp !== stamp) return null;
  const count = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= HISTORY_FILE.maxSteps;
  const past = h.past, future = h.future;
  if (!count(past) || !count(future) || past + future === 0 || all.length !== 1 + past + future) return null;
  if (all.some((l) => l.length === 0)) return null;
  return { past: all.slice(1, 1 + past), future: all.slice(1 + past) };
}
```

Run the test — passes. (`"[1]\n{}"` is refused as an array; `"null\n{}"` as null.)

- [ ] **Step 3 — red: storage.** Create `src/projects/__tests__/storage.history.test.ts`:

```ts
import { migrateProject } from "@/src/editor/model/migrate";
import { SCHEMA_VERSION, type Project } from "@/src/editor/model/types";
import { memoryFs } from "../fs";
import { stampOf } from "../history";
import { makeStorage, type PickedAsset } from "../storage";

const asset = (uri: string): PickedAsset => ({ uri, kind: "video", durationSec: 4, width: 1080, height: 1920, fileName: "clip.mov" });
const now = async () => {};
/** A snapshot as a load gives it back: through the text and the sanity pass. */
const asLoaded = (p: Project): Project => migrateProject(JSON.parse(JSON.stringify(p)));

async function made() {
  const fs = memoryFs();
  let n = 0;
  const storage = makeStorage(fs, { thumbnail: async () => { fs.files.set("file:///tmp/t.jpg", "JPEG"); return "file:///tmp/t.jpg"; }, newId: () => `id${++n}`, nowIso: () => "2026-10-13T10:00:00.000Z" });
  fs.files.set("file:///picked/a.mov", "A"); fs.files.set("file:///picked/b.mov", "B");
  const { project: v0 } = await storage.createProject("Beach", [asset("file:///picked/a.mov"), asset("file:///picked/b.mov")]);
  const v1: Project = { ...v0, name: "One" }, v2: Project = { ...v1, name: "Two" }, v3: Project = { ...v2, name: "Three" };
  const dir = "file:///doc/projects/id1";
  return { fs, storage, dir, json: `${dir}/project.json`, history: `${dir}/history.jsonl`, v0, v1, v2, v3 };
}
/** v2 is the project on disk; its history is undo [v0, v1] and redo [v3]. */
async function kept() {
  const s = await made();
  await s.storage.saveProject(s.v2);
  expect(await s.storage.saveHistory(s.v2, [s.v0, s.v1], [s.v3])).toBe(true);
  return s;
}
const reopen = async (s: Awaited<ReturnType<typeof made>>) => {
  const { project, stamp } = await s.storage.loadProject("id1");
  return s.storage.loadHistory(project, stamp, now);
};
const names = (h: { past: Project[]; future: Project[] } | null) => h && { past: h.past.map((p) => p.name), future: h.future.map((p) => p.name) };
const lines = (s: Awaited<ReturnType<typeof made>>) => s.fs.files.get(s.history)!.split("\n");
const rewrite = (s: Awaited<ReturnType<typeof made>>, change: (l: string[]) => string[]) => s.fs.files.set(s.history, change(lines(s)).join("\n"));

let warn: jest.SpyInstance;
beforeEach(() => { warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => warn.mockRestore());

test("loadProject also gives the stamp of the very text it parsed", async () => {
  const s = await made();
  const { stamp } = await s.storage.loadProject("id1");
  expect(stamp).toBe(stampOf(s.fs.files.get(s.json)!));
});

test("a history written beside its project comes back: both stacks, in order, as a load gives a project", async () => {
  const s = await kept();
  expect(s.fs.files.has(`${s.history}.tmp`)).toBe(false);
  const got = await reopen(s);
  expect(JSON.stringify(got)).toBe(JSON.stringify({ past: [s.v0, s.v1].map(asLoaded), future: [asLoaded(s.v3)] }));
  expect(warn).not.toHaveBeenCalled();
});

test("the project file is not touched by a history write, and holds no history", async () => {
  const s = await made();
  await s.storage.saveProject(s.v2);
  const before = s.fs.files.get(s.json);
  await s.storage.saveHistory(s.v2, [s.v0, s.v1], [s.v3]);
  expect(s.fs.files.get(s.json)).toBe(before);
  expect(before).not.toContain("history");
});

test("saveHistory writes nothing when project.json on disk is not this very project", async () => {
  const s = await made();
  await s.storage.saveProject(s.v1);
  expect(await s.storage.saveHistory(s.v2, [s.v0, s.v1], [])).toBe(false);
  expect(s.fs.files.has(s.history)).toBe(false);
  // …and an older history that is there stays as it is.
  await s.storage.saveProject(s.v2);
  await s.storage.saveHistory(s.v2, [s.v0, s.v1], []);
  const old = s.fs.files.get(s.history);
  expect(await s.storage.saveHistory(s.v3, [s.v0, s.v1, s.v2], [])).toBe(false);
  expect(s.fs.files.get(s.history)).toBe(old);
});

test("with no step to keep the file goes", async () => {
  const s = await kept();
  expect(await s.storage.saveHistory(s.v2, [], [])).toBe(false);
  expect(s.fs.files.has(s.history)).toBe(false);
});

test("no history file: null, quietly", async () => {
  const s = await made();
  expect(await reopen(s)).toBeNull();
  expect(warn).not.toHaveBeenCalled();
});

test("a project.json rewritten since (Home's rename, a later autosave): the history is dropped and its file is left alone", async () => {
  const s = await kept();
  const file = s.fs.files.get(s.history);
  await s.storage.renameProject("id1", "Renamed");
  expect(await reopen(s)).toBeNull();
  expect(s.fs.files.get(s.history)).toBe(file);
  // A stamp taken from an older read never meets a newer history: the pair is refused from either side.
  const t = await kept();
  const older = await t.storage.loadProject("id1");
  await t.storage.saveProject(t.v3);
  await t.storage.saveHistory(t.v3, [t.v0, t.v1, t.v2], []);
  expect(await t.storage.loadHistory(older.project, older.stamp, now)).toBeNull();
});

describe("anything odd drops all of it", () => {
  const cases: [string, (l: string[], s: Awaited<ReturnType<typeof made>>) => string[]][] = [
    ["a cut-off file", (l) => l.slice(0, -1)],
    ["a line that is not JSON", (l) => [l[0], "{not json", ...l.slice(2)]],
    ["a line that is not an object", (l) => [l[0], "[]", ...l.slice(2)]],
    ["a snapshot of another project", (l, s) => [l[0], JSON.stringify({ ...s.v0, id: "other" }), ...l.slice(2)]],
    ["a snapshot of another schema", (l, s) => [l[0], JSON.stringify({ ...s.v0, schemaVersion: SCHEMA_VERSION - 1 }), ...l.slice(2)]],
    ["a snapshot the sanity pass refuses", (l) => [l[0], JSON.stringify({ id: "id1", schemaVersion: SCHEMA_VERSION }), ...l.slice(2)]],
    ["a header of another schema", (l) => [l[0].replace(`"schemaVersion":${SCHEMA_VERSION}`, `"schemaVersion":${SCHEMA_VERSION - 1}`), ...l.slice(1)]],
    ["a header of a newer schema", (l) => [l[0].replace(`"schemaVersion":${SCHEMA_VERSION}`, `"schemaVersion":${SCHEMA_VERSION + 1}`), ...l.slice(1)]],
  ];
  test.each(cases)("%s", async (_name, change) => {
    const s = await kept();
    rewrite(s, (l) => change(l, s));
    expect(await reopen(s)).toBeNull();
  });
  test("a file far too big is not even read", async () => {
    const s = await kept();
    s.fs.files.set(s.history, "x".repeat(12_000_001));
    const read = jest.spyOn(s.fs, "readText");
    const { project, stamp } = await s.storage.loadProject("id1");
    read.mockClear();
    expect(await s.storage.loadHistory(project, stamp, now)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
});

test("references written under another container are re-pointed at where the folder is now", async () => {
  const s = await made();
  const OLD = "file:///old/Documents/projects/id1";
  const away = (p: Project): Project => ({ ...p, clips: p.clips.map((c) => ({ ...c, sourceUri: c.sourceUri.replace(s.dir, OLD) })) });
  await s.storage.saveProject(s.v2);
  await s.storage.saveHistory(s.v2, [away(s.v0), away(s.v1)], [away(s.v3)]);
  expect(s.fs.files.get(s.history)).toContain(OLD);
  const got = await reopen(s);
  expect(got!.past.concat(got!.future).flatMap((p) => p.clips.map((c) => c.sourceUri))).toEqual(Array(3).fill(s.v0.clips.map((c) => c.sourceUri)).flat());   // three snapshots, the same two files each
});

test("a step whose file is gone cuts its stack: undo keeps the newer steps, redo the nearer ones", async () => {
  const s = await made();
  const ghost = (name: string): Project => ({ ...s.v0, name, clips: [...s.v0.clips, { ...s.v0.clips[0], id: "g", sourceUri: `${s.dir}/media/gone.mov` }] });
  await s.storage.saveProject(s.v2);
  await s.storage.saveHistory(s.v2, [s.v0, ghost("ghost"), s.v1], [s.v3, ghost("ghost too"), s.v0]);
  expect(names(await reopen(s))).toEqual({ past: ["One"], future: ["Three"] });
  // Every undo step past a missing file: only the redo side is left; both gone: nothing.
  await s.storage.saveHistory(s.v2, [s.v0, ghost("ghost")], [s.v3]);
  expect(names(await reopen(s))).toEqual({ past: [], future: ["Three"] });
  await s.storage.saveHistory(s.v2, [ghost("ghost")], [ghost("ghost too")]);
  expect(await reopen(s)).toBeNull();
});

test("a file the opened project itself is missing does not cut anything (the editor already says so)", async () => {
  const s = await kept();
  s.fs.files.delete(s.v2.clips[0].sourceUri);
  const { project, missingSourceUris, stamp } = await s.storage.loadProject("id1");
  expect(missingSourceUris).toEqual([s.v2.clips[0].sourceUri]);
  expect(names(await s.storage.loadHistory(project, stamp, now))).toEqual({ past: ["Beach", "One"], future: ["Three"] });
});

test("one pause per snapshot; reading writes nothing and removes nothing", async () => {
  const s = await kept();
  const { project, stamp } = await s.storage.loadProject("id1");
  const before = new Map(s.fs.files);
  const spies = (["writeText", "copy", "move", "remove", "mkdir"] as const).map((m) => jest.spyOn(s.fs, m));
  const pause = jest.fn(async () => {});
  await s.storage.loadHistory(project, stamp, pause);
  expect(pause).toHaveBeenCalledTimes(3);
  for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  expect([...s.fs.files]).toEqual([...before]);
});

test("neither ever throws: a disk that fails is a warning and no history", async () => {
  const s = await kept();
  const old = s.fs.files.get(s.history), doc = s.fs.files.get(s.json);
  const realWrite = s.fs.writeText, realRead = s.fs.readText;
  jest.spyOn(s.fs, "writeText").mockImplementation(async (p, t) => { if (p.includes("history")) throw new Error("disk full"); return realWrite(p, t); });
  await expect(s.storage.saveHistory(s.v2, [s.v1], [])).resolves.toBe(false);
  expect(warn).toHaveBeenCalledWith("history save failed", expect.any(Error));
  expect(s.fs.files.get(s.history)).toBe(old);
  expect(s.fs.files.get(s.json)).toBe(doc);
  const { project, stamp } = await s.storage.loadProject("id1");
  jest.spyOn(s.fs, "readText").mockImplementation(async (p) => { if (p.includes("history")) throw new Error("io"); return realRead(p); });
  await expect(s.storage.loadHistory(project, stamp, now)).resolves.toBeNull();
  expect(warn).toHaveBeenCalledWith("history load failed", expect.any(Error));
});

test("a duplicate and a saved copy carry no history; deleting the project removes it", async () => {
  const s = await kept();
  const copy = await s.storage.duplicateProject("id1");
  expect([...s.fs.files.keys()].filter((k) => k.includes(`/projects/${copy.id}/`) && k.includes("history"))).toEqual([]);
  const file = await s.storage.packProject("id1", { cancelled: false }, now);
  expect(s.fs.files.get(file.uri)).not.toContain("clipy-history");
  expect(s.fs.files.get(file.uri)).not.toContain("history.jsonl");
  await s.storage.deleteProject("id1");
  expect(s.fs.files.has(s.history)).toBe(false);
});
```

Run `npx.cmd jest src/projects/__tests__/storage.history.test.ts` — fails (`saveHistory` is not a function).

- [ ] **Step 4 — green: `src/projects/storage.ts`.** Five edits; nothing else in the file changes.

  1. Imports: add `import { HISTORY_FILE, decodeHistory, encodeHistory, fitHistory, lineOf, stampOf } from "./history";` (`nextTurn` and `type Pause` are already imported from `./projectFile`, line 5).
  2. Beside `thumbPath` (line 20): `const historyPath = (id: string) => `${projectDir(id)}/${HISTORY_FILE.name}`;`
  3. Move the `isObj` helper (line 191) up beside `namePart` (it is used by `loadHistory` below; its body does not change).
  4. Replace the reader (lines 38–39) and `loadProject`'s first line (line 49):

```ts
  /** The ONE reader of a stored project: migrated, and every file reference re-pointed at where the folder is now (rebase.ts). Writes nothing. `text` is what was parsed. */
  async function readDoc(id: string): Promise<{ project: Project; text: string }> {
    const text = await fs.readText(jsonPath(id));
    return { project: rebaseProject(parse(text), projectDir(id)), text };
  }
  async function read(id: string): Promise<Project> { return (await readDoc(id)).project; }
```

```ts
  async function loadProject(id: string) {
    const { project, text } = await readDoc(id);
    const missingSourceUris: string[] = [];
    for (const uri of new Set([...project.clips.map((c) => c.sourceUri), ...project.layers.map((l) => l.sourceUri), ...project.audioTracks.map((a) => a.sourceUri)]))
      if (!(await fs.exists(uri))) missingSourceUris.push(uri);
    // `stamp` names the very text this project came from: only a history written beside that text is ever applied to it (loadHistory).
    return { project, missingSourceUris, stamp: stampOf(text) };
  }
```

  5. After `renameProject`, before the "Project files" block:

```ts
  // —— Undo history kept with the project. Spec: docs/superpowers/specs/2026-10-13-undo-history-design.md ——
  const sourcesOf = (p: Project): string[] => [...p.clips, ...p.layers, ...p.audioTracks].map((x) => x.sourceUri);

  /**
   * The editor's undo and redo stacks as `<project>/history.jsonl`, for the project that `saveProject(p)` has JUST written — and
   * that is checked, not trusted: nothing is written unless project.json on disk is this project's own text. Capped (`fitHistory`),
   * written as a `.tmp` and moved into place. Never throws and never touches project.json; false when nothing was written (the old
   * history, or none, stays).
   */
  async function saveHistory(p: Project, past: readonly Project[], future: readonly Project[]): Promise<boolean> {
    try {
      const path = historyPath(p.id);
      const stamp = stampOf(lineOf(p));
      if (stampOf(await fs.readText(jsonPath(p.id))) !== stamp) return false;
      const kept = fitHistory(past.map(lineOf), future.map(lineOf));
      if (kept.past.length + kept.future.length === 0) { await fs.remove(path); return false; }
      const tmp = `${path}.tmp`;
      await fs.writeText(tmp, encodeHistory(p.id, SCHEMA_VERSION, stamp, kept));
      await fs.move(tmp, path);
      return true;
    } catch (e) { console.warn("history save failed", e); return false; }
  }

  /**
   * The stacks to give back to a project that `loadProject` has just read (`stamp` is that read's) — or null. Applied to nothing
   * else: another stamp, project, schema or file version, a cut-off file, a line that is not a snapshot of this project in this
   * schema, and ALL of it is dropped. Each snapshot gets what a project gets on load (the sanity pass, the re-pointing), one per
   * `pause`. A step that needs a file which is gone — and which the opened project does not itself reference — cuts its stack:
   * undo keeps the newer steps, redo the nearer ones. Writes nothing, removes nothing, never throws.
   */
  async function loadHistory(project: Project, stamp: string, pause: Pause = nextTurn): Promise<{ past: Project[]; future: Project[] } | null> {
    try {
      const dir = projectDir(project.id), path = historyPath(project.id);
      const size = await fs.size(path);
      if (size === null || size > HISTORY_FILE.maxBytes) return null;
      const found = decodeHistory(await fs.readText(path), project.id, SCHEMA_VERSION, stamp);
      if (!found) return null;
      const snapshot = async (line: string): Promise<Project> => {
        await pause();
        const raw: unknown = JSON.parse(line);
        if (!isObj(raw) || raw.id !== project.id || raw.schemaVersion !== SCHEMA_VERSION) throw new Error("history: not a snapshot of this project");
        return rebaseProject(migrateProject(raw), dir);
      };
      const past: Project[] = [], future: Project[] = [];
      for (const line of found.past) past.push(await snapshot(line));
      for (const line of found.future) future.push(await snapshot(line));
      const there = new Map<string, boolean>(sourcesOf(project).map((uri): [string, boolean] => [uri, true]));
      const whole = async (p: Project): Promise<boolean> => {
        for (const uri of sourcesOf(p)) {
          let ok = there.get(uri);
          if (ok === undefined) { ok = await fs.exists(uri); there.set(uri, ok); }
          if (!ok) return false;
        }
        return true;
      };
      let from = past.length;
      while (from > 0 && (await whole(past[from - 1]))) from--;
      let to = 0;
      while (to < future.length && (await whole(future[to]))) to++;
      const kept = { past: past.slice(from), future: future.slice(0, to) };
      return kept.past.length + kept.future.length > 0 ? kept : null;
    } catch (e) { console.warn("history load failed", e); return null; }
  }
```

  and add `saveHistory, loadHistory,` to the returned object (after `writeCover,`).

  Note for "a line that is not JSON" and "a snapshot the sanity pass refuses": both throw inside `snapshot`, reach the `catch`, warn and give null — that warning is expected (the test mutes `console.warn`). "A cut-off file" and the two header cases are refused by `decodeHistory` without a warning.

- [ ] **Step 5 — the whole tree.** `npm.cmd run typecheck`, `npm.cmd test`. Expect app **413 suites**, no failure; `storage.load.proof.test.ts`, `storage.test.ts`, `storage.file.test.ts`, `rebase.test.ts` pass unedited (they destructure `loadProject`'s answer; one more key changes none of them). If `typecheck` reports a caller that spreads or compares `loadProject`'s result, stop and report it — do not edit a PROOF file.

- [ ] **Step 6 — commit.** `git add src/projects/history.ts src/projects/storage.ts src/projects/__tests__/history.test.ts src/projects/__tests__/storage.history.test.ts` → `feat(projects): the undo history file — written beside the project it belongs to, applied to nothing else`.

---

## Task 2 — The editor

**Files**
- Create: `src/editor/historyKeeper.ts`, `src/editor/__tests__/store.history.test.ts`, `src/editor/__tests__/historyKeeper.test.ts`, `src/editor/__tests__/useLoadProject.history.test.tsx`, `src/__tests__/deleters.guard.test.ts`
- Modify: `src/editor/store.ts` (one interface line, one action), `src/editor/useLoadProject.ts`, the mock factory line of `src/editor/__tests__/useLoadProject.test.tsx` and `useLoadProject.emptyText.test.tsx`, one comment each in `src/editor/soundRenders.ts`, `cutoutRenders.ts`, `steadyRenders.ts`

**Interfaces**
- Consumes: `storage.loadProject` (now with `stamp`), `storage.saveProject`, `storage.saveHistory`, `storage.loadHistory`, `storage.writeCover` (Task 1); `useEditorStore`; `AppState` (`react-native`).
- Produces:
  - store: `restoreHistory(loaded: Project, past: Project[], future: Project[]): boolean`
  - `historyKeeper.ts`: `HISTORY_READ_DELAY_MS = 400`; `historyStale(s: { project: Project | null; past: Project[]; future: Project[] }): boolean`; `restoreAfterOpen(opened: Project, stamp: string | undefined): void`; `keepHistoryNow(): Promise<void>`; `forgetHistory(): void`

- [ ] **Step 1 — red: the store.** Create `src/editor/__tests__/store.history.test.ts`:

```ts
import { makeClip, makeProject, POST_PLATFORMS, type Project } from "../model/types";
import { HISTORY_LIMIT, useEditorStore } from "../store";

const st = () => useEditorStore.getState();
const named = (name: string): Project => makeProject({ id: "p1", name, clips: [makeClip({ id: "a", sourceDuration: 10 })] });
const rename = (name: string) => (p: Project): Project => ({ ...p, name });
beforeEach(() => st().reset());

test("restoreHistory fills both stacks of the project that was loaded, and nothing else", () => {
  const loaded = named("Two");
  st().setProject(loaded);
  st().select("a"); st().seek(3); st().setZoom(90);
  const past = [named("Zero"), named("One")], future = [named("Three")];
  expect(st().canUndo()).toBe(false);
  expect(st().restoreHistory(loaded, past, future)).toBe(true);
  expect(st().past).toEqual(past);
  expect(st().future).toEqual(future);
  expect(st().canUndo()).toBe(true);
  expect(st().canRedo()).toBe(true);
  expect(st().project).toBe(loaded);
  expect(st().dirty).toBe(false);                                   // nothing to save: the project did not change
  expect([st().selectedClipId, st().playhead, st().pixelsPerSecond]).toEqual(["a", 3, 90]);
});

test("refused once anything has happened: another project object, or a stack that is no longer empty", () => {
  const loaded = named("Two");
  st().setProject(loaded);
  st().apply(rename("Edited"));
  expect(st().restoreHistory(loaded, [named("Zero")], [])).toBe(false);
  expect(st().past).toEqual([loaded]);

  st().setProject(loaded);
  st().beginTransaction();                                          // a drag has begun: the project is the same object, the stack is not empty
  expect(st().restoreHistory(loaded, [named("Zero")], [])).toBe(false);
  expect(st().past).toEqual([loaded]);

  st().setProject(loaded);
  st().setExportSettings({ fps: 60, quality: "high" });             // not an undo step, but another project object
  expect(st().restoreHistory(loaded, [named("Zero")], [])).toBe(false);

  st().setProject(loaded);
  expect(st().restoreHistory(named("Two"), [named("Zero")], [])).toBe(false);   // equal is not the same
  expect(st().restoreHistory(loaded, [], [])).toBe(false);
  st().reset();
  expect(st().restoreHistory(loaded, [named("Zero")], [])).toBe(false);          // no project open
  expect(st().past).toEqual([]);
});

test("never more than the limit: the newest undo steps, the nearest redo steps", () => {
  const loaded = named("now");
  st().setProject(loaded);
  const many = (prefix: string) => Array.from({ length: HISTORY_LIMIT + 10 }, (_, i) => named(`${prefix}${i}`));
  st().restoreHistory(loaded, many("p"), many("f"));
  expect(st().past).toHaveLength(HISTORY_LIMIT);
  expect(st().past[0].name).toBe("p10");
  expect(st().future).toHaveLength(HISTORY_LIMIT);
  expect(st().future[0].name).toBe("f0");
});

test("a restored step undoes and redoes like any other; posts and export settings stay live", () => {
  const loaded = named("Two");
  st().setProject(loaded);
  st().restoreHistory(loaded, [named("Zero"), named("One")], [named("Three")]);
  const post = { platform: POST_PLATFORMS[0], url: null, postedAt: "2026-10-13T10:00:00.000Z" };
  st().addPostRecord(post);
  st().setExportSettings({ fps: 60, quality: "high" });
  st().undo();
  expect(st().project).toMatchObject({ name: "One", posts: [post], exportSettings: { fps: 60, quality: "high" } });
  expect(st().dirty).toBe(true);
  expect(st().past.map((p) => p.name)).toEqual(["Zero"]);
  st().undo();
  expect(st().project!.name).toBe("Zero");
  expect(st().canUndo()).toBe(false);
  st().redo(); st().redo(); st().redo();
  expect(st().project).toMatchObject({ name: "Three", posts: [post] });
  expect(st().canRedo()).toBe(false);
});

test("an edit after a restore goes on top of the restored steps and clears redo, as always", () => {
  const loaded = named("Two");
  st().setProject(loaded);
  st().restoreHistory(loaded, [named("Zero"), named("One")], [named("Three")]);
  st().apply(rename("Edited"));
  expect(st().past.map((p) => p.name)).toEqual(["Zero", "One", "Two"]);
  expect(st().future).toEqual([]);
});
```

Run it — fails (`restoreHistory` is not a function).

- [ ] **Step 2 — green: `src/editor/store.ts`.** In `EditorState`, after `redo: () => void;` add:

```ts
  /** The stacks kept with the project (historyKeeper.ts), given back after it was opened. Only while nothing has happened since — the very object that was loaded, both stacks empty; false otherwise. Changes nothing but the stacks. */
  restoreHistory: (loaded: Project, past: Project[], future: Project[]) => boolean;
```

and after the `redo` action:

```ts
  restoreHistory: (loaded, past, future) => {
    const s = get();
    if (s.project !== loaded || s.past.length > 0 || s.future.length > 0 || past.length + future.length === 0) return false;
    set({ past: past.slice(-HISTORY_LIMIT), future: future.slice(0, HISTORY_LIMIT) });
    return true;
  },
```

Run the test — passes.

- [ ] **Step 3 — red: the keeper.** Create `src/editor/__tests__/historyKeeper.test.ts`:

```ts
jest.mock("@/src/projects", () => ({ storage: { loadHistory: jest.fn(), saveHistory: jest.fn(async () => true), saveProject: jest.fn(async () => {}) } }));
import { storage } from "@/src/projects";
import { forgetHistory, HISTORY_READ_DELAY_MS, historyStale, keepHistoryNow, restoreAfterOpen } from "../historyKeeper";
import { makeProject, type Project } from "../model/types";
import { useEditorStore } from "../store";

const st = () => useEditorStore.getState();
const loadHistory = storage.loadHistory as jest.Mock, saveHistory = storage.saveHistory as jest.Mock, saveProject = storage.saveProject as jest.Mock;
const named = (name: string): Project => makeProject({ id: "p1", name });
const rename = (name: string) => (p: Project): Project => ({ ...p, name });
const wait = () => jest.advanceTimersByTimeAsync(HISTORY_READ_DELAY_MS);
let warn: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  loadHistory.mockResolvedValue(null); saveHistory.mockResolvedValue(true); saveProject.mockResolvedValue(undefined);
  forgetHistory(); st().reset();
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { warn.mockRestore(); jest.useRealTimers(); });

test("the history is read only after the delay, for the project and the stamp of that open, and lights Undo", async () => {
  const opened = named("Two");
  loadHistory.mockResolvedValue({ past: [named("Zero"), named("One")], future: [named("Three")] });
  st().setProject(opened);
  restoreAfterOpen(opened, "stamp-1");
  await jest.advanceTimersByTimeAsync(HISTORY_READ_DELAY_MS - 1);
  expect(loadHistory).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(1);
  expect(loadHistory).toHaveBeenCalledWith(opened, "stamp-1");
  expect(st().past.map((p) => p.name)).toEqual(["Zero", "One"]);
  expect(st().future.map((p) => p.name)).toEqual(["Three"]);
  expect(st().dirty).toBe(false);
  expect(historyStale(st())).toBe(false);                            // what is on disk is what is in the store
});

test("no stamp (a load that gave none): nothing is read", async () => {
  const opened = named("Two");
  st().setProject(opened);
  restoreAfterOpen(opened, undefined);
  await wait();
  expect(loadHistory).not.toHaveBeenCalled();
});

test("the editor left before the wait is over, or before the answer: nothing is read, nothing is applied", async () => {
  const opened = named("Two");
  st().setProject(opened);
  restoreAfterOpen(opened, "s");
  forgetHistory();
  await wait();
  expect(loadHistory).not.toHaveBeenCalled();

  let answer!: (v: unknown) => void;
  loadHistory.mockReturnValueOnce(new Promise((r) => { answer = r; }));
  restoreAfterOpen(opened, "s");
  await wait();
  forgetHistory();
  answer({ past: [named("Zero")], future: [] });
  await jest.advanceTimersByTimeAsync(0);
  expect(st().past).toEqual([]);
});

test("another project opened meanwhile: the first wait is dropped", async () => {
  const first = named("First"), second = makeProject({ id: "p2", name: "Second" });
  st().setProject(first);
  restoreAfterOpen(first, "s1");
  st().setProject(second);
  restoreAfterOpen(second, "s2");
  await wait();
  expect(loadHistory).toHaveBeenCalledTimes(1);
  expect(loadHistory).toHaveBeenCalledWith(second, "s2");
});

test("an edit made before the history arrives wins: the history is given up", async () => {
  const opened = named("Two");
  loadHistory.mockResolvedValue({ past: [named("Zero")], future: [] });
  st().setProject(opened);
  restoreAfterOpen(opened, "s");
  st().apply(rename("Edited"));
  await wait();
  expect(st().past).toEqual([opened]);
  expect(historyStale(st())).toBe(true);                             // the new session's own step is still to be written
});

test("a read that fails is a warning, never an error", async () => {
  const opened = named("Two");
  loadHistory.mockRejectedValue(new Error("io"));
  st().setProject(opened);
  restoreAfterOpen(opened, "s");
  await wait();
  expect(warn).toHaveBeenCalledWith("history restore failed", expect.any(Error));
  expect(st().past).toEqual([]);
});

test("stale: a project is open, a stack is not empty, and it is not what was last written or restored", async () => {
  expect(historyStale(st())).toBe(false);                            // no project
  const opened = named("Two");
  st().setProject(opened);
  expect(historyStale(st())).toBe(false);                            // nothing to keep
  st().apply(rename("Edited"));
  expect(historyStale(st())).toBe(true);
  await keepHistoryNow();
  expect(historyStale(st())).toBe(false);
  st().undo();
  expect(historyStale(st())).toBe(true);                             // only redo is left: still something to keep
  await keepHistoryNow();
  st().setExportSettings({ fps: 60, quality: "high" });              // not an undo step, but project.json changes: the stamp must follow
  expect(historyStale(st())).toBe(true);
});

test("keepHistoryNow: the project first, then its history; the store is told it is saved", async () => {
  const order: string[] = [];
  saveProject.mockImplementation(async () => { order.push("project"); });
  saveHistory.mockImplementation(async () => { order.push("history"); return true; });
  st().setProject(named("Two"));
  st().apply(rename("Edited"));
  const { project, past, future } = st();
  expect(st().dirty).toBe(true);
  await keepHistoryNow();
  expect(order).toEqual(["project", "history"]);
  expect(saveProject).toHaveBeenCalledWith(project);
  expect(saveHistory).toHaveBeenCalledWith(project, past, future);
  expect(st().dirty).toBe(false);
  await keepHistoryNow();                                            // nothing changed since: nothing is written
  expect(saveProject).toHaveBeenCalledTimes(1);
  expect(saveHistory).toHaveBeenCalledTimes(1);
});

test("keepHistoryNow writes nothing when there is nothing to keep", async () => {
  await keepHistoryNow();
  st().setProject(named("Two"));
  await keepHistoryNow();
  expect(saveProject).not.toHaveBeenCalled();
  expect(saveHistory).not.toHaveBeenCalled();
});

test("a project save that fails: no history is written, nothing is thrown, and it is tried again next time", async () => {
  saveProject.mockRejectedValueOnce(new Error("disk full"));
  st().setProject(named("Two"));
  st().apply(rename("Edited"));
  await expect(keepHistoryNow()).resolves.toBeUndefined();
  expect(saveHistory).not.toHaveBeenCalled();
  expect(st().dirty).toBe(true);
  expect(warn).toHaveBeenCalledWith("history keep failed", expect.any(Error));
  expect(historyStale(st())).toBe(true);
});

test("a history that was not written stays to be written; an edit made during the save is not marked saved", async () => {
  saveHistory.mockResolvedValueOnce(false);
  st().setProject(named("Two"));
  st().apply(rename("Edited"));
  await keepHistoryNow();
  expect(historyStale(st())).toBe(true);

  let saved!: () => void;
  saveProject.mockReturnValueOnce(new Promise<void>((r) => { saved = r; }));
  const running = keepHistoryNow();
  st().apply(rename("Again"));
  saved();
  await running;
  expect(st().dirty).toBe(true);
  expect(historyStale(st())).toBe(true);
});
```

Run it — fails (no module).

- [ ] **Step 4 — green.** Create `src/editor/historyKeeper.ts`:

```ts
import { storage } from "@/src/projects";
import type { Project } from "./model/types";
import { useEditorStore } from "./store";

/**
 * The undo history kept with the project — the editor's half (spec: docs/superpowers/specs/2026-10-13-undo-history-design.md).
 * The file is `storage.saveHistory` / `loadHistory`; this decides WHEN: read once, a moment after a project is on screen;
 * written when the editor is left (useLoadProject) and when the app stops being active — never per edit. Nothing here can fail a
 * project save, and nothing here throws.
 */
export const HISTORY_READ_DELAY_MS = 400;

interface Kept { project: Project; past: Project[]; future: Project[] }
/** What the history file was last written from, or restored as — compared by identity. */
let kept: Kept | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Raised when the editor is left or another project opens: an answer from before it is dropped. */
let epoch = 0;

/** Is there a history to write? A project is open, a stack is not empty, and the three are not the ones the file already holds. */
export function historyStale(s: { project: Project | null; past: Project[]; future: Project[] }): boolean {
  if (!s.project || (s.past.length === 0 && s.future.length === 0)) return false;
  return !(kept !== null && kept.project === s.project && kept.past === s.past && kept.future === s.future);
}

/** The editor is left, or another project opens: the wait is cancelled and nothing is remembered. */
export function forgetHistory(): void {
  epoch += 1;
  kept = null;
  if (timer !== null) { clearTimeout(timer); timer = null; }
}

/**
 * A project has just been put in the store: a moment later (the editor is drawn first) its history is read and, if the store still
 * holds that very object untouched, given back. `stamp` is `loadProject`'s — without one nothing is read.
 */
export function restoreAfterOpen(opened: Project, stamp: string | undefined): void {
  forgetHistory();
  if (typeof stamp !== "string") return;
  const run = epoch;
  timer = setTimeout(() => {
    timer = null;
    void (async () => {
      try {
        const found = await storage.loadHistory(opened, stamp);
        if (!found || run !== epoch) return;
        if (!useEditorStore.getState().restoreHistory(opened, found.past, found.future)) return;
        const s = useEditorStore.getState();
        kept = { project: opened, past: s.past, future: s.future };
      } catch (e) { console.warn("history restore failed", e); }
    })();
  }, HISTORY_READ_DELAY_MS);
}

/**
 * Writes the history now, if there is one to write: the project first (its stamp must be of what is on disk), then the history.
 * For the moment the app stops being active. Never rejects.
 */
export async function keepHistoryNow(): Promise<void> {
  const s = useEditorStore.getState();
  const { project, past, future } = s;
  if (!project || !historyStale(s)) return;
  const run = epoch;
  try {
    await storage.saveProject(project);
    if (useEditorStore.getState().project === project) useEditorStore.getState().markSaved();
    if ((await storage.saveHistory(project, past, future)) && run === epoch) kept = { project, past, future };
  } catch (e) { console.warn("history keep failed", e); }
}
```

Run the test — passes.

- [ ] **Step 5 — red: the load hook.** First the two permitted mock edits: in `src/editor/__tests__/useLoadProject.test.tsx` line 2 and `useLoadProject.emptyText.test.tsx` line 2, add `loadHistory: jest.fn(async () => null), saveHistory: jest.fn(async () => true)` to the `storage` object of the factory (nothing else in either file). Then create `src/editor/__tests__/useLoadProject.history.test.tsx`:

```tsx
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
jest.mock("@/src/projects", () => ({ storage: { loadProject: jest.fn(), saveProject: jest.fn(), writeCover: jest.fn(), loadHistory: jest.fn(), saveHistory: jest.fn() } }));
import { storage } from "@/src/projects";
import { lastFlush } from "../flush";
import { forgetHistory } from "../historyKeeper";
import { makeProject, type Project } from "../model/types";
import { useEditorStore } from "../store";
import { useLoadProject } from "../useLoadProject";

const st = () => useEditorStore.getState();
const m = storage as unknown as Record<"loadProject" | "saveProject" | "writeCover" | "loadHistory" | "saveHistory", jest.Mock>;
const named = (name: string): Project => makeProject({ id: "p1", name });
const rename = (name: string) => (p: Project): Project => ({ ...p, name });
let order: string[];
let onAppState: ((now: AppStateStatus) => void) | null;
let removed: jest.Mock;
let warn: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  forgetHistory(); st().reset();
  order = [];
  m.saveProject.mockImplementation(async () => { order.push("project"); });
  m.saveHistory.mockImplementation(async () => { order.push("history"); return true; });
  m.writeCover.mockImplementation(async () => { order.push("cover"); });
  m.loadHistory.mockResolvedValue(null);
  onAppState = null; removed = jest.fn();
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_type: string, handler: (now: AppStateStatus) => void) => { onAppState = handler; return { remove: removed }; }) as never);
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

async function open(project = named("Two"), stamp: string | undefined = "stamp-1") {
  m.loadProject.mockResolvedValueOnce({ project, missingSourceUris: [], stamp });
  const hook = await renderHook(() => useLoadProject("p1"));
  await waitFor(() => expect(hook.result.current.status).toBe("ready"));
  return hook;
}

test("opening gives the history back a moment later; the editor is ready before it is read", async () => {
  m.loadHistory.mockResolvedValue({ past: [named("Zero"), named("One")], future: [] });
  await open();
  expect(st().project?.name).toBe("Two");
  expect(m.loadHistory).not.toHaveBeenCalled();                      // ready first, the history after the delay
  await waitFor(() => expect(st().past).toHaveLength(2));
  expect(m.loadHistory).toHaveBeenCalledWith(st().project, "stamp-1");
  expect(st().dirty).toBe(false);
});

test("leaving after an edit: the project, then its history, then the cover — all inside lastFlush", async () => {
  const { unmount } = await open();
  await act(() => st().apply(rename("Edited")));
  const { project, past, future } = st();
  await act(() => unmount());
  await lastFlush;
  expect(order).toEqual(["project", "history", "cover"]);
  expect(m.saveHistory).toHaveBeenCalledWith(project, past, future);
  expect(st().project).toBeNull();
});

test("leaving an untouched project writes nothing but the cover — with or without a restored history", async () => {
  const first = await open();
  await act(() => first.unmount());
  await lastFlush;
  expect(order).toEqual(["cover"]);

  order = [];
  m.loadHistory.mockResolvedValue({ past: [named("Zero")], future: [] });
  const second = await open();
  await waitFor(() => expect(st().past).toHaveLength(1));
  await act(() => second.unmount());
  await lastFlush;
  expect(order).toEqual(["cover"]);
});

test("a step without a change (a drag that moved nothing) still writes: the project is saved though it is not dirty", async () => {
  const { unmount } = await open();
  await act(() => st().beginTransaction());
  expect(st().dirty).toBe(false);
  await act(() => unmount());
  await lastFlush;
  expect(order).toEqual(["project", "history", "cover"]);
});

test("a restored history is written again when only the project changed under it (export settings)", async () => {
  m.loadHistory.mockResolvedValue({ past: [named("Zero")], future: [] });
  const { unmount } = await open();
  await waitFor(() => expect(st().past).toHaveLength(1));
  await act(() => st().setExportSettings({ fps: 60, quality: "high" }));
  await act(() => unmount());
  await lastFlush;
  expect(order).toEqual(["project", "history", "cover"]);
});

test("a project save that fails on leave writes no history", async () => {
  m.saveProject.mockRejectedValueOnce(new Error("disk full"));
  const { unmount } = await open();
  await act(() => st().apply(rename("Edited")));
  await act(() => unmount());
  await expect(lastFlush).resolves.toBeUndefined();
  expect(m.saveHistory).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith("flush save failed", expect.any(Error));
});

test("the app stops being active: the project and its history are written; coming back writes nothing", async () => {
  const { unmount } = await open();
  expect(onAppState).not.toBeNull();
  await act(() => st().apply(rename("Edited")));
  await act(async () => { onAppState!("active"); });
  expect(order).toEqual([]);
  await act(async () => { onAppState!("inactive"); });
  await waitFor(() => expect(order).toEqual(["project", "history"]));
  await act(async () => { onAppState!("background"); });               // nothing changed since: nothing more
  expect(order).toEqual(["project", "history"]);
  await act(() => unmount());
  await lastFlush;
  expect(removed).toHaveBeenCalledTimes(1);
  expect(order).toEqual(["project", "history", "cover"]);              // already written: the leave adds only the cover
});

test("leaving cancels a history that has not arrived yet", async () => {
  m.loadHistory.mockResolvedValue({ past: [named("Zero")], future: [] });
  const { unmount } = await open();
  await act(() => unmount());
  await new Promise((r) => setTimeout(r, 500));
  expect(m.loadHistory).not.toHaveBeenCalled();
  expect(st().past).toEqual([]);
});
```

Run it — fails.

- [ ] **Step 6 — green: `src/editor/useLoadProject.ts`.** The whole file becomes:

```ts
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { storage } from "@/src/projects";
import { setLastFlush } from "./flush";
import { forgetHistory, historyStale, keepHistoryNow, restoreAfterOpen } from "./historyKeeper";
import { dropEmptyText, undoAutoFit } from "./model/ops";
import { useEditorStore } from "./store";
import { useToolStrip } from "./toolStrip";

export function useLoadProject(id: string) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; error?: string }>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    storage.loadProject(id)
      .then(({ project, missingSourceUris, stamp }) => {
        if (!alive) return;
        const opened = undoAutoFit(project);
        useEditorStore.getState().setProject(opened, missingSourceUris);
        setState({ status: "ready" });
        // The undo history kept with the project: read a moment later, never before the editor is on screen.
        restoreAfterOpen(opened, stamp);
      })
      .catch((e: unknown) => { if (alive) setState({ status: "error", error: e instanceof Error ? e.message : String(e) }); });
    // The app stops being active (the app switcher, a call, Control Centre): the history is written now — a force-quit comes after this.
    const sub = AppState.addEventListener("change", (now) => { if (now !== "active") void keepHistoryNow(); });
    return () => {
      alive = false;
      sub.remove();
      // Flush edits the autosave debounce hasn't written yet, then (after that save) the undo history, then refresh the cover file
      // the drafts list shows, and clear the editor.
      const s = useEditorStore.getState();
      // A text left empty in the open text panel is removed when the panel closes — but the toolbar that does it is unmounting too
      // (this cleanup runs before its own), so it is dropped here: from what is saved, and saved even when the autosave already wrote it.
      const editing = useToolStrip.getState().open?.id === "text" ? s.selectedOverlayId : null;
      const p = s.project && dropEmptyText(s.project, editing);
      // A history to write needs the project written first even when it is not dirty: its stamp is of what is on disk.
      const stale = historyStale(s);
      const { past, future } = s;
      forgetHistory();
      if (p) setLastFlush((s.dirty || p !== s.project || stale ? storage.saveProject(p) : Promise.resolve())
        .then(() => (stale ? storage.saveHistory(p, past, future) : false))
        .then(() => storage.writeCover(p))
        .catch((e: unknown) => console.warn("flush save failed", e)));
      s.reset();
    };
  }, [id]);
  return state;
}
```

`setLastFlush` takes a `Promise<void>`: the chain ends in `writeCover`'s `Promise<void>` and a `catch` that returns `void`, as before. Run the three `useLoadProject*.test.tsx` files — all pass; the two older ones with only their mock line changed. (The leave chain has one more link now. `useLoadProject.test.tsx`’s third test resolves the save inside `act` and then expects `writeCover`: React’s async `act` drains the promise queue, so it should hold. If it fails for that reason alone, do not reorder the chain — report it; the one permitted edit there is an extra `await act(async () => {});` before that expectation.)

- [ ] **Step 7 — the guard for the media rule.** The history is safe because nothing deletes a file a project has referenced (spec §0.1). Pin who may delete at all. Create `src/__tests__/deleters.guard.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

// The undo history kept with a project (docs/superpowers/specs/2026-10-13-undo-history-design.md §0.1) relies on this: no code
// deletes a file in <project>/media that a project has referenced, so an old step never points at a file the app removed.
// These are ALL the files that delete anything. A new one fails here until it is read against that rule — a delete of a media
// file needs the history's references counted first — and is then added to the list.
const ROOT = join(__dirname, "..", "..");
const DELETES = /\b(?:expoFs|fs)\.remove\(|\.delete\(\)|deleteAsync/;

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name === "ios") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

test("the files that delete anything are exactly these", () => {
  const found = ["src", "app", join("modules", "clipy-video")].flatMap((d) => sources(join(ROOT, d)))
    .filter((path) => DELETES.test(readFileSync(path, "utf8")))
    .map((path) => relative(ROOT, path).replace(/\\/g, "/")).sort();
  expect(found).toEqual([
    "src/editor/cutoutRenders.ts",     // cache copies in <project>/cutout
    "src/editor/soundPeaks.ts",        // cache files in <project>/peaks
    "src/editor/soundRenders.ts",      // cache copies in <project>/sound
    "src/editor/steadyRenders.ts",     // cache copies in <project>/steady
    "src/editor/useReadAloud.ts",      // a speech file that was never placed in the project
    "src/projects/expoFs.ts",          // the adapter
    "src/projects/filePhone.ts",       // the picker's temporary copy
    "src/projects/storage.ts",         // covers, failed imports, temporaries, the history file, a deleted project's folder
  ]);
});
```

Run it — it passes on today's tree (it pins today). If the list differs, do not edit the list: report the file that deletes.

- [ ] **Step 8 — the three comments.** Each says the sweep runs when "there is no undo history then". Replace only those words:
  - `src/editor/soundRenders.ts:219` — `is opened (there is no undo history then). Never touches a media file.` → `is opened. A copy only an older undo step needs goes too: it is rendered again if the user undoes into that step. Never touches a media file.`
  - `src/editor/cutoutRenders.ts:277` — `Run once per open (there is no undo history then, so Undo cannot need a copy that goes).` → `Run once per open, against the open project: a copy only an older undo step needs goes too and is made again if the user undoes into that step.`
  - `src/editor/steadyRenders.ts:323` — `(there is no undo history then)` → `(against the open project: a copy only an older undo step needs is made again on that undo)`

  No code line changes in those three files; `git diff --stat` shows one changed comment line in each (re-wrap to the file's line length if needed, comments only).

- [ ] **Step 9 — the whole tree.** `npm.cmd run typecheck`, `npm.cmd test`. Expect app **417 suites** (413 + 4), no failure. `cutoutRenders.test.ts`, `soundRenders.test.ts`, `steadyRenders.test.ts`, `MessageBar` and `TransportRow` suites pass unedited.

- [ ] **Step 10 — commit.** `git add src/editor/historyKeeper.ts src/editor/store.ts src/editor/useLoadProject.ts src/editor/soundRenders.ts src/editor/cutoutRenders.ts src/editor/steadyRenders.ts src/editor/__tests__/store.history.test.ts src/editor/__tests__/historyKeeper.test.ts src/editor/__tests__/useLoadProject.history.test.tsx src/editor/__tests__/useLoadProject.test.tsx src/editor/__tests__/useLoadProject.emptyText.test.tsx src/__tests__/deleters.guard.test.ts` → `feat(editor): undo and redo come back when a project is reopened`.

---

## Task 3 — Independent review and fixes

**Files:** whatever the review finds, within the files of Tasks 1–2; every fix starts with a failing test.

**Interfaces:** none new.

The reviewer has not written Tasks 1–2 and reads the diff `f3ed505..HEAD` against the spec — not against this plan's code. One finding, one failing test, one fix, one commit (`fix(history): …`).

- [ ] **Step 1 — the safety rule, tried to break.** For each, write the scenario as a test on `memoryFs` (in `storage.history.test.ts`) or on the store, and show a wrong history is NOT applied:
  1. `project.json` rewritten by `renameProject`, by `saveProject` of an older object, by `restoreProject` (new id — the history path differs), with the history file left behind.
  2. A history file copied by hand from project A's folder into project B's (the header's `projectId` and every snapshot's `id` refuse it).
  3. Two different project texts of the same length (the stamp's two hashes must differ: 10,000 random single-character edits of a 50 KB project text, no stamp equal to the original's).
  4. `loadProject` answered before a later `saveProject` + `saveHistory` landed (the older stamp against the newer file) — already in Task 1; confirm it fails if `loadHistory` is changed to re-read `project.json`.
  5. A snapshot line whose `id` and `schemaVersion` are right but whose `clips` hold a reference outside the project folder, or `../` in it: it must be treated exactly as a project's own would be (`rebaseProject` leaves foreign references alone; the media rule then drops the step if the file is not there). No file outside the project is ever written or removed because of a history.
- [ ] **Step 2 — the project is never at risk.** Confirm by reading and by test: `saveProject`'s bytes are unchanged (`git diff f3ed505 -- src/projects/storage.ts` shows no edit inside it); a `saveHistory` that throws at every step (`readText`, `writeText`, `move`, `remove` each rejecting in turn) leaves `project.json` byte-identical and resolves `false`; the leave flush still saves a dirty project when `historyStale` is false; the autosave path (`useAutosave.ts`) has no diff.
- [ ] **Step 3 — the round trip on a real project.** Build one rich project with the editor's own ops (two clips with keyframes and a speed curve, a layer, a text, a caption with words, a sticker, a song with a sound setting, an effect, beat markers, a cover), apply ten real ops through the store, write with `saveProject` + `saveHistory`, read back with `loadProject` + `loadHistory`, `restoreHistory`, then undo ten times: after every undo `JSON.stringify(store.project)` equals `JSON.stringify(migrateProject(JSON.parse(JSON.stringify(<the snapshot the session held>))))`. If any step differs, the sanity pass is not a fixed point for that field — report which, do not weaken the test.
- [ ] **Step 4 — nothing on screen moved.** `git diff --stat f3ed505` lists no file under `src/editor/components`, `src/ui`, `app`. Confirm no message is shown while a project opens (search the route and `useLoadProject` for `useToast`); if one exists, a message up at the moment of the restore is cut by `MessageBar`'s history rule — report it with a failing test rather than editing `MessageBar`.
- [ ] **Step 5 — timing.** With fake timers: the history is never read in the same turn as `setProject`; each snapshot is parsed after its own `pause`; `forgetHistory` during the read drops the answer. With 50 snapshots of the "long" project of spec §0.2 (build it as that table says), time `loadHistory` under Jest with `pause = async () => {}` and write the number in the commit message — a baseline for the phone.
- [ ] **Step 6 — checks.** `npm.cmd run typecheck`, `npm.cmd test`: no failure; the suite count is 417 plus any new test file.

---

## Task 4 — Docs

**Files**
- Modify: `AGENTS.md`
- Create: `docs/undo-history-phone-checklist.md`

**Interfaces:** none.

- [ ] **Step 1 — AGENTS.md.** Add ONE bullet to "This repo (Clipy)", after the "Messages" bullet (the one that defines an undo step):

```md
- Undo history kept with the project: the editor's stacks (`past` / `future`, `HISTORY_LIMIT` 50 — unchanged) are written to `<project>/history.jsonl`, NEVER into `project.json` and never into a saved copy or a duplicate (those start empty). The file is `src/projects/history.ts` (pure: a header line, then one whole snapshot per line; `fitHistory` keeps at most 50 steps each way and `HISTORY_FILE.maxChars` 4,000,000, dropping the OLDEST undo steps first, then the farthest redo steps) and `storage.saveHistory` / `loadHistory`, which never throw. THE SAFETY RULE: a history carries the stamp (`stampOf`: length + two hashes) of the exact `project.json` text it was written beside — `saveHistory` checks the disk before writing, `loadProject` returns the stamp of the text it parsed, and `loadHistory` applies a history to that stamp only; any other text, project id, schema version, a cut-off file or a line that is not a snapshot of this project drops ALL of it, silently (a wrong history is impossible, an absent one is fine; dropping deletes nothing). Each snapshot gets what a project gets on load (`migrateProject`, `rebaseProject`), and a step whose file is gone cuts its stack. WHEN (`src/editor/historyKeeper.ts`): read once, `HISTORY_READ_DELAY_MS` after the editor is on screen, one snapshot per turn, and given to the store's `restoreHistory` only while the store still holds the very object that was loaded and both stacks are empty — it changes nothing but the stacks; written on leave (`useLoadProject`: project → history → cover) and when the app stops being active (`keepHistoryNow`), only when `historyStale` — never per edit, never by the autosave, and always AFTER the project's own save, which it can never fail. `undo` / `redo` / `apply` / `saveProject` are untouched; selection, playhead, zoom and the open tool are not restored. Media: nothing deletes a file in `<project>/media` that a project has referenced, which is why an old step is safe — the files that delete anything at all are pinned in `src/__tests__/deleters.guard.test.ts` (never add a delete of a media file without counting the history's references); the four cache sweeps stay keyed to the open project, so a copy only an older step needs is rendered again on that undo.
```

- [ ] **Step 2 — the owner's checklist.** Create `docs/undo-history-phone-checklist.md`:

```md
# Undo history — phone checklist

Nothing new is on screen. Undo and Redo are the two arrows above the timeline.

1. Open a project. Make three edits (trim a clip, add a text, change a filter). Go back to Home. Open the project again.
   - [ ] The Undo arrow is lit a moment after the editor appears.
   - [ ] Three taps on Undo take the three edits off, newest first. Three taps on Redo put them back.
2. Make two edits. Swipe Clipy away in the app switcher. Open Clipy, open the project.
   - [ ] Undo is lit and undoes both edits.
3. Undo twice. Go back to Home. Open the project again.
   - [ ] Redo is lit, and puts the two steps back.
4. Open your longest project (many clips, auto captions). Leave it and open it again.
   - [ ] It opens as fast as it did before.
   - [ ] Nothing stutters in the first second.
   - [ ] Undo is lit. (On a very long project it may hold fewer than 50 steps — the newest ones.)
5. Duplicate a project that has undo steps. Open the copy.
   - [ ] Undo is grey. The original still has its steps.
6. Save a Copy of a project, then Open Project File with that file.
   - [ ] The new project's Undo is grey.
7. Rename a project on Home. Open it.
   - [ ] Undo is grey (expected). The project is exactly as it was, with the new name.
8. Turn on Remove background on a clip and wait until it is done. Turn it off. Go to Home, open the project, tap Undo.
   - [ ] The clip shows the Preview tag while the cut-out is made again, then plays cut out. Tell us roughly how long it took.
9. Post or export a project that has undo steps, go to Home, open it again.
   - [ ] Undo is still lit.

If any box fails, say which number — the project itself should never be affected by any of them.
```

- [ ] **Step 3 — checks and commit.** `npm.cmd run typecheck`, `npm.cmd test` (docs only: counts unchanged). `git add AGENTS.md docs/undo-history-phone-checklist.md` → `docs: undo history kept with the project — AGENTS.md and the phone checklist`.
