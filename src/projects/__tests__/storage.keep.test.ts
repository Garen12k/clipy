// The project and its undo history as ONE turn of the project's chain (`saveWithHistory`): the history's stamp is of the very
// string that turn wrote to project.json, nothing can write project.json between the two writes, a history that fails never
// reaches the project's save, and whatever is written to project.json afterwards makes that history a dropped one.
import { makeProject, type Project } from "@/src/editor/model/types";
import { memoryFs } from "../fs";
import { fitHistory, fitSnapshots, HISTORY_FILE, lineOf, stampOf } from "../history";
import { makeStorage } from "../storage";

type Fs = ReturnType<typeof memoryFs>;

function setup() {
  const fs = memoryFs();
  let n = 0;
  const storage = makeStorage(fs, { thumbnail: async () => "file:///tmp/t.jpg", newId: () => `id${++n}`, nowIso: () => "2026-10-13T10:00:00.000Z" });
  return { fs, storage };
}
const dir = (fs: Fs) => `${fs.documentDir}projects/p1`;
const json = (fs: Fs) => `${dir(fs)}/project.json`;
const history = (fs: Fs) => `${dir(fs)}/history.jsonl`;
const named = (name: string): Project => makeProject({ id: "p1", name });
const header = (fs: Fs) => JSON.parse(fs.files.get(history(fs))!.split("\n")[0]) as { stamp: string; past: number; future: number };
const left = (fs: Fs) => [...fs.files.keys(), ...fs.dirs].filter((p) => p.startsWith(dir(fs)));
const settle = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
const now = async () => {};
/** The phone's queue is busy: every move waits until `open()`. */
function holdMoves(fs: Fs) {
  const real = fs.move.bind(fs);
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  fs.move = async (from, to) => { await gate; return real(from, to); };
  return open;
}
/** Every write and move, by file — and for a write to project.json's tmp, the name of the project written. */
function spy(fs: Fs) {
  const calls: string[] = [];
  const write = fs.writeText.bind(fs), move = fs.move.bind(fs), read = fs.readText.bind(fs);
  fs.writeText = (p, t) => { calls.push(`write ${p.split("/").pop()}${p.endsWith("project.json.tmp") ? ` ${(JSON.parse(t) as Project).name}` : ""}`); return write(p, t); };
  fs.move = (from, to) => move(from, to).then(() => { calls.push(`moved ${to.split("/").pop()}`); });
  fs.readText = (p) => { calls.push(`read ${p.split("/").pop()}`); return read(p); };
  return calls;
}
const reopen = async (storage: ReturnType<typeof setup>["storage"]) => {
  const { project, stamp } = await storage.loadProject("p1");
  const h = await storage.loadHistory(project, stamp, now);
  return { name: project.name, stamp, steps: h && { past: h.past.map((p) => p.name), future: h.future.map((p) => p.name) } };
};

let warn: jest.SpyInstance;
beforeEach(() => { warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => warn.mockRestore());

test("(1) one turn: the project, then the history — stamped from the very string that was written to project.json", async () => {
  const { fs, storage } = setup();
  const calls = spy(fs);
  const two = named("Two");
  const { saved, kept } = storage.saveWithHistory(two, [named("Zero"), named("One")], [named("Three")]);
  await saved;
  expect(await kept).toBe(true);
  expect(calls).toEqual(["write project.json.tmp Two", "moved project.json", "write history.jsonl.tmp", "moved history.jsonl"]);   // no read back: it is the same string
  expect(fs.files.get(json(fs))).toBe(JSON.stringify(two));
  expect(header(fs)).toEqual(expect.objectContaining({ stamp: stampOf(fs.files.get(json(fs))!), past: 2, future: 1 }));
  expect(left(fs).filter((p) => p.endsWith(".tmp"))).toEqual([]);
  expect(await reopen(storage)).toEqual({ name: "Two", stamp: header(fs).stamp, steps: { past: ["Zero", "One"], future: ["Three"] } });
  expect(warn).not.toHaveBeenCalled();
});

test("(2) nothing writes project.json between the project and its history: a save asked meanwhile waits for the whole turn", async () => {
  const { fs, storage } = setup();
  await storage.saveProject(named("Zero"));
  const calls = spy(fs);
  const open = holdMoves(fs);
  let atHistory: string | undefined;
  const write = fs.writeText.bind(fs);
  fs.writeText = (p, t) => { if (p.endsWith("history.jsonl.tmp")) atHistory = fs.files.get(json(fs)); return write(p, t); };
  const first = storage.saveWithHistory(named("One"), [named("Zero")], []);
  const later = storage.saveProject(named("Later"));                 // the autosave, a moment after
  const again = storage.saveWithHistory(named("Again"), [named("Zero"), named("One")], []);
  await settle();
  expect(calls).toEqual(["write project.json.tmp One"]);             // only the first has started anything
  open();
  await Promise.all([first.saved, first.kept, later, again.saved, again.kept]);
  expect(calls).toEqual([
    "write project.json.tmp One", "moved project.json", "write history.jsonl.tmp", "moved history.jsonl",
    "write project.json.tmp Later", "moved project.json",
    "write project.json.tmp Again", "moved project.json", "write history.jsonl.tmp", "moved history.jsonl",
  ]);
  expect(atHistory).toBe(JSON.stringify(named("Again")));            // (the last history write) project.json was its own project's
  expect(await reopen(storage)).toEqual(expect.objectContaining({ name: "Again", steps: { past: ["Zero", "One"], future: [] } }));
});

test("(3) the project's save is over before the history is even begun, and a history that never ends does not hold it", async () => {
  const { fs, storage } = setup();
  const calls = spy(fs);
  const write = fs.writeText.bind(fs);
  fs.writeText = (p, t) => { if (!p.endsWith("history.jsonl.tmp")) return write(p, t); calls.push("history begun"); return new Promise<void>(() => {}); };
  const { saved, kept } = storage.saveWithHistory(named("One"), [named("Zero")], []);
  let heard: string[] | null = null;
  await saved.then(() => { heard = [...calls]; });
  expect(heard).toEqual(["write project.json.tmp One", "moved project.json"]);   // told before any history work
  let ended = false;
  void kept.then(() => { ended = true; });
  await settle();
  expect(calls).toEqual(["write project.json.tmp One", "moved project.json", "history begun"]);
  expect(ended).toBe(false);
  expect(fs.files.get(json(fs))).toBe(JSON.stringify(named("One")));
  expect(fs.files.has(history(fs))).toBe(false);
});

test("(3) a history that cannot be written is a warning and `false`: the save has succeeded, the old history is no longer applied, the next save lands", async () => {
  const { fs, storage } = setup();
  await storage.saveWithHistory(named("One"), [named("Zero")], []).kept;
  const old = fs.files.get(history(fs));
  const write = fs.writeText.bind(fs);
  fs.writeText = (p, t) => (p.endsWith("history.jsonl.tmp") ? Promise.reject(new Error("disk full")) : write(p, t));
  const { saved, kept } = storage.saveWithHistory(named("Two"), [named("Zero"), named("One")], []);
  await expect(saved).resolves.toBeUndefined();
  await expect(kept).resolves.toBe(false);
  expect(warn).toHaveBeenCalledWith("history save failed", expect.any(Error));
  expect(fs.files.get(history(fs))).toBe(old);                       // whole, but it names the text of "One"…
  expect(await reopen(storage)).toEqual(expect.objectContaining({ name: "Two", steps: null }));   // …so it is dropped
  fs.writeText = write;
  await storage.saveProject(named("Three"));
  expect(fs.files.get(json(fs))).toBe(JSON.stringify(named("Three")));
});

test("(3) a history cut off in its move leaves only a .tmp — never read; the next write replaces it", async () => {
  const { fs, storage } = setup();
  const move = fs.move.bind(fs);
  fs.move = (from, to) => (to.endsWith("history.jsonl") ? Promise.reject(new Error("killed")) : move(from, to));
  expect(await storage.saveWithHistory(named("One"), [named("Zero")], []).kept).toBe(false);
  expect(fs.files.has(`${history(fs)}.tmp`)).toBe(true);
  expect(fs.files.has(history(fs))).toBe(false);
  expect((await reopen(storage)).steps).toBeNull();                  // a whole, rightly stamped .tmp is still not a history
  fs.move = move;
  fs.files.set(`${history(fs)}.tmp`, "half a hea");                  // or a half one
  expect((await reopen(storage)).steps).toBeNull();
  expect(await storage.saveWithHistory(named("Two"), [named("Zero"), named("One")], []).kept).toBe(true);
  expect(fs.files.has(`${history(fs)}.tmp`)).toBe(false);
  expect((await reopen(storage)).steps).toEqual({ past: ["Zero", "One"], future: [] });
});

test("a project that cannot be saved: `saved` rejects for its caller, no history is written or even made into text, `kept` is false, the next turn runs", async () => {
  const { fs, storage } = setup();
  await storage.saveWithHistory(named("One"), [named("Zero")], []).kept;
  const before = [fs.files.get(json(fs)), fs.files.get(history(fs))];
  const move = fs.move.bind(fs);
  fs.move = (from, to) => (to.endsWith("project.json") ? Promise.reject(new Error("no room")) : move(from, to));
  const calls = spy(fs);
  const { saved, kept } = storage.saveWithHistory(named("Two"), [named("Zero"), named("One")], []);
  const next = storage.saveProject(named("Three"));
  await expect(saved).rejects.toThrow("no room");
  await expect(kept).resolves.toBe(false);
  expect(calls.filter((c) => c.includes("history"))).toEqual([]);
  expect([fs.files.get(json(fs)), fs.files.get(history(fs))]).toEqual(before);
  await expect(next).rejects.toThrow("no room");                     // it ran, in its own turn, with the disk still refusing
  fs.move = move;
  await storage.saveProject(named("Four"));
  expect(fs.files.get(json(fs))).toBe(JSON.stringify(named("Four")));
});

test("with no step to keep: the project is saved, the old history file goes, `kept` is false", async () => {
  const { fs, storage } = setup();
  await storage.saveWithHistory(named("One"), [named("Zero")], []).kept;
  const { saved, kept } = storage.saveWithHistory(named("Two"), [], []);
  await saved;
  expect(await kept).toBe(false);
  expect(fs.files.get(json(fs))).toBe(JSON.stringify(named("Two")));
  expect(fs.files.has(history(fs))).toBe(false);
  expect(warn).not.toHaveBeenCalled();
});

test("(4) a save of the project AFTER its history was written makes that history a dropped one — until both are written again", async () => {
  const { fs, storage } = setup();
  await storage.saveWithHistory(named("One"), [named("Zero")], []).kept;
  await storage.saveProject(named("Later"));                         // the autosave
  expect(fs.files.has(history(fs))).toBe(true);
  expect(await reopen(storage)).toEqual(expect.objectContaining({ name: "Later", steps: null }));
  await storage.saveWithHistory(named("Later"), [named("Zero"), named("One")], []).kept;   // the leave
  expect(await reopen(storage)).toEqual(expect.objectContaining({ name: "Later", steps: { past: ["Zero", "One"], future: [] } }));
});

test("the same project object saved again by the autosave is the same text: its history stays", async () => {
  const { storage } = setup();
  const one = named("One");
  await storage.saveWithHistory(one, [named("Zero")], []).kept;
  await storage.saveProject(one);
  expect((await reopen(storage)).steps).toEqual({ past: ["Zero"], future: [] });
});

describe("a deleted project", () => {
  test("saveWithHistory after the delete: resolves, asks the phone nothing, makes no folder", async () => {
    const { fs, storage } = setup();
    await storage.saveWithHistory(named("One"), [named("Zero")], []).kept;
    await storage.deleteProject("p1");
    const calls = spy(fs);
    const { saved, kept } = storage.saveWithHistory(named("Two"), [named("Zero"), named("One")], []);
    await expect(saved).resolves.toBeUndefined();
    await expect(kept).resolves.toBe(false);
    expect(calls).toEqual([]);
    expect(left(fs)).toEqual([]);
  });

  test("a keep still queued behind the delete (the leave of a project deleted at once) writes nothing either", async () => {
    const { fs, storage } = setup();
    await storage.saveProject(named("Zero"));
    const open = holdMoves(fs);
    const before = storage.saveProject(named("One"));
    const gone = storage.deleteProject("p1");
    const { saved, kept } = storage.saveWithHistory(named("Two"), [named("Zero")], []);
    open();
    await Promise.all([before, gone, saved]);
    expect(await kept).toBe(false);
    expect(left(fs)).toEqual([]);
  });

  test("saveHistory for a deleted id is a no-op", async () => {
    const { fs, storage } = setup();
    const one = named("One");
    await storage.saveProject(one);
    await storage.deleteProject("p1");
    const calls = spy(fs);
    expect(await storage.saveHistory(one, [named("Zero")], [])).toBe(false);
    expect(calls).toEqual([]);
    expect(left(fs)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});

test("saveHistory checks the disk in the project's turn: behind a queued save of another text it writes nothing", async () => {
  const { fs, storage } = setup();
  const one = named("One");
  await storage.saveProject(one);
  const open = holdMoves(fs);
  const later = storage.saveProject(named("Later"));
  const wrote = storage.saveHistory(one, [named("Zero")], []);
  open();
  await later;
  expect(await wrote).toBe(false);
  expect(fs.files.has(history(fs))).toBe(false);
});

describe("a project recovered from its tmp", () => {
  test("its stamp is of the tmp's text, so the history written beside the older project.json is dropped", async () => {
    const { fs, storage } = setup();
    await storage.saveWithHistory(named("One"), [named("Zero")], []).kept;
    // The app was closed inside the next save's move: project.json removed, the tmp not yet renamed.
    fs.files.set(`${json(fs)}.tmp`, JSON.stringify(named("Two")));
    fs.files.delete(json(fs));
    const got = await reopen(storage);
    expect(got).toEqual({ name: "Two", stamp: stampOf(JSON.stringify(named("Two"))), steps: null });
    expect(fs.files.get(json(fs))).toBe(JSON.stringify(named("Two")));
    expect(fs.files.has(history(fs))).toBe(true);                    // dropped, not deleted
    expect(warn).not.toHaveBeenCalled();
  });

  test("were the tmp the very text the history was written beside, the history would still be its own", async () => {
    const { fs, storage } = setup();
    await storage.saveWithHistory(named("One"), [named("Zero")], []).kept;
    fs.files.set(`${json(fs)}.tmp`, fs.files.get(json(fs))!);
    fs.files.delete(json(fs));
    expect((await reopen(storage)).steps).toEqual({ past: ["Zero"], future: [] });
  });
});

describe("fitSnapshots: the caps, without turning into text what will not be kept", () => {
  const snap = (name: string) => ({ name });
  const many = (n: number, tag: string) => Array.from({ length: n }, (_, i) => snap(`${tag}${i}-${"x".repeat(i % 7)}`));
  const lazy = (past: object[], future: object[], maxSteps: number, maxChars: number) => {
    const asked: object[] = [];
    const got = fitSnapshots(past, future, maxSteps, maxChars, (o) => { asked.push(o); return lineOf(o); });
    return { got, asked };
  };

  test.each([[50, 4_000_000], [50, 400], [50, 120], [5, 4_000_000], [5, 60], [50, 30], [50, 0]])("gives exactly what fitHistory gives (steps %i, characters %i)", (maxSteps, maxChars) => {
    for (const [p, f] of [[60, 60], [10, 0], [0, 10], [3, 3], [0, 0]]) {
      const past = many(p, "p"), future = many(f, "f");
      expect(lazy(past, future, maxSteps, maxChars).got).toEqual(fitHistory(past.map(lineOf), future.map(lineOf), maxSteps, maxChars));
    }
  });

  test("the defaults are the file's caps", () => {
    const past = many(60, "p"), future = many(60, "f");
    expect(fitSnapshots(past, future)).toEqual(fitHistory(past.map(lineOf), future.map(lineOf)));
    expect(fitSnapshots(past, future).past).toHaveLength(HISTORY_FILE.maxSteps);
  });

  test("a snapshot is made into text only until the cap is passed: the nearest redo steps first, then the newest undo steps", () => {
    const past = many(50, "p"), future = many(2, "f");
    const size = (o: object) => lineOf(o).length + 1;
    const cap = size(future[0]) + size(future[1]) + size(past[49]) + size(past[48]) + size(past[47]);
    const { got, asked } = lazy(past, future, 50, cap);
    expect(got.past).toEqual(past.slice(47).map(lineOf));
    expect(asked).toEqual([future[0], future[1], past[49], past[48], past[47], past[46]]);   // one look past the cap, then it stops
  });

  test("when the redo steps alone are over the cap, no undo step is looked at", () => {
    const past = many(10, "p"), future = many(10, "f");
    const { got, asked } = lazy(past, future, 50, lineOf(future[0]).length + 1);
    expect(got).toEqual({ past: [], future: [lineOf(future[0])] });
    expect(asked).toEqual([future[0], future[1]]);
  });
});
