jest.mock("@/src/editor/soundRenders", () => ({ ensureSound: jest.fn() }));
import { ensureSound } from "@/src/editor/soundRenders";
import { makeAudioTrack, NO_SOUND, type SoundSettings } from "@/src/editor/model/types";
import { prepareSounds, SOUND_SHARE } from "../exportSounds";

const deep: SoundSettings = { ...NO_SOUND, voice: "deep" };
const plain = makeAudioTrack({ id: "m", sourceDuration: 9 });
const a = { ...makeAudioTrack({ id: "a", sourceDuration: 5, sourceUri: "file:///m/a.m4a" }), sound: deep };
const b = { ...makeAudioTrack({ id: "b", sourceDuration: 5, sourceUri: "file:///m/b.m4a" }), sound: { ...deep, level: true } };

beforeEach(() => jest.resetAllMocks());

test("the share of the export's progress the sounds take", () => expect(SOUND_SHARE).toBe(0.1));

test("no track with a setting: nothing is asked, nothing is reported", async () => {
  const progress = jest.fn();
  expect(await prepareSounds("p1", [plain], progress)).toEqual(new Map());
  expect(ensureSound).not.toHaveBeenCalled();
  expect(progress).not.toHaveBeenCalled();
});

test("each track with a setting gets its copy, in order, and the progress runs from 0 to 1 across them", async () => {
  jest.mocked(ensureSound).mockImplementation(async (_p, uri, _s, onProgress) => { onProgress?.(0.5); return `${uri}.copy`; });
  const seen: number[] = [];
  const out = await prepareSounds("p1", [plain, a, b], (f) => seen.push(f));
  expect([...out]).toEqual([["a", "file:///m/a.m4a.copy"], ["b", "file:///m/b.m4a.copy"]]);
  expect(jest.mocked(ensureSound).mock.calls.map((c) => [c[0], c[1], c[2]])).toEqual([["p1", "file:///m/a.m4a", deep], ["p1", "file:///m/b.m4a", { ...deep, level: true }]]);
  expect(seen).toEqual([0.25, 0.5, 0.75, 1]);
});

test("a copy that cannot be rendered stops everything with a sentence that carries the reason", async () => {
  jest.mocked(ensureSound).mockRejectedValueOnce(new Error("sound engine: boom"));
  await expect(prepareSounds("p1", [a, b], () => {})).rejects.toThrow("Could not prepare a sound for the export: sound engine: boom");
  expect(ensureSound).toHaveBeenCalledTimes(1);
});

test("a reason that is not an Error is still said", async () => {
  jest.mocked(ensureSound).mockRejectedValueOnce("sound open: gone");
  await expect(prepareSounds("p1", [a], () => {})).rejects.toThrow("Could not prepare a sound for the export: sound open: gone");
});

test("once it is stopped (Cancel) no further copy is asked for and nothing more is reported", async () => {
  let stopped = false;
  jest.mocked(ensureSound).mockImplementation(async (_p, uri) => { stopped = true; return `${uri}.copy`; });
  const progress = jest.fn();
  const out = await prepareSounds("p1", [a, b], progress, () => stopped);
  expect(ensureSound).toHaveBeenCalledTimes(1);
  expect(progress).not.toHaveBeenCalled();
  expect(out.has("b")).toBe(false);
});

test("stopped before it began: nothing is asked", async () => {
  expect(await prepareSounds("p1", [a, b], () => {}, () => true)).toEqual(new Map());
  expect(ensureSound).not.toHaveBeenCalled();
});
