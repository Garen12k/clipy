jest.mock("@/modules/clipy-video", () => ({
  toExportClip: jest.requireActual("@/modules/clipy-video").toExportClip,
  isSteadyCancelled: (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "E_STEADY_CANCELLED",
}));
jest.mock("@/src/editor/steadyRenders", () => ({
  steadyDir: (id: string) => `file:///doc/projects/${id}/steady`,
  ensureSteady: jest.fn(async (_p: string, need: { name: string }) => `file:///doc/projects/p1/steady/${need.name}`),
}));
jest.mock("@/src/projects/expoFs", () => ({ expoFs: { list: jest.fn(async () => []) } }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
import { toExportClip } from "@/modules/clipy-video";
import { steadyBytes } from "@/src/editor/model/steady";
import { makeClip, makeLayer } from "@/src/editor/model/types";
import { useSteadyFiles } from "@/src/editor/steadyFiles";
import { ensureSteady } from "@/src/editor/steadyRenders";
import { expoFs } from "@/src/projects/expoFs";
import { prepareSteady, STEADY_EXPORT, STEADY_SHARE, steadyBytesToMake, withSteady } from "../exportSteady";

const DIR = "file:///doc/projects/p1/steady";
const a = makeClip({ id: "a", sourceDuration: 8, sourceUri: "file:///media/a.mp4", width: 1080, height: 1920, stabilize: "medium" });
const b = makeClip({ id: "b", sourceDuration: 6, sourceUri: "file:///media/b.mp4" });
const slow = makeLayer({ id: "L", sourceDuration: 5, sourceUri: "file:///media/l.mp4", speed: 0.25, smooth: true, start: 1 });
const A = "a-s1-2-0-0-8000.mov", L = "l-s1-0-120-0-5000.mov";
const cancelled = () => Object.assign(new Error("Steady cancelled"), { code: "E_STEADY_CANCELLED" });

beforeEach(() => { jest.clearAllMocks(); useSteadyFiles.setState({ files: {} }); jest.mocked(expoFs.list).mockResolvedValue([]); });

test("the copies of the clips that have a setting, by clip id, with progress across them that never runs back", async () => {
  const seen: number[] = [];
  jest.mocked(ensureSteady).mockImplementationOnce(async (_p, need, onProgress) => { onProgress?.(0.5); onProgress?.(0.2); return `${DIR}/${need.name}`; });
  const out = await prepareSteady("p1", [a, b, slow], (f) => seen.push(f));
  expect([...out]).toEqual([["a", `${DIR}/${A}`], ["L", `${DIR}/${L}`]]);
  expect(jest.mocked(ensureSteady).mock.calls.map((c) => c[1].name)).toEqual([A, L]);
  expect(seen).toEqual([0.25, 0.5, 1]);
  expect(STEADY_SHARE).toBe(0.3);
});

test("nothing to prepare: nothing is read and nothing is asked for", async () => {
  expect((await prepareSteady("p1", [b], () => {})).size).toBe(0);
  expect(await steadyBytesToMake("p1", [b])).toBe(0);
  expect(expoFs.list).not.toHaveBeenCalled();
  expect(ensureSteady).not.toHaveBeenCalled();
});

test("a copy on disk is used by name; a clip over 60 seconds stops the export with its reason", async () => {
  jest.mocked(expoFs.list).mockResolvedValue(["a-s1-2-0-0-8000.mov"]);
  await prepareSteady("p1", [{ ...a, trimStart: 2, trimEnd: 6 }], () => {});
  expect(jest.mocked(ensureSteady).mock.calls[0][1].name).toBe(A);                       // the copy that covers it, not a new one
  const long = makeClip({ id: "x", sourceDuration: 200, stabilize: "low" });
  await expect(prepareSteady("p1", [long], () => {})).rejects.toThrow(STEADY_EXPORT.tooLong);
  expect(STEADY_EXPORT.tooLong).toBe("A clip with Stabilize or Smooth slow motion is longer than 60 seconds. Shorten it, or switch them off.");
});

test("a render stopped under the export is asked for again; one that fails stops the export with what the phone said; Cancel says nothing", async () => {
  jest.mocked(ensureSteady).mockRejectedValueOnce(cancelled());
  expect((await prepareSteady("p1", [a], () => {})).get("a")).toBe(`${DIR}/${A}`);
  expect(ensureSteady).toHaveBeenCalledTimes(2);
  jest.mocked(ensureSteady).mockRejectedValue(cancelled());
  await expect(prepareSteady("p1", [a], () => {})).rejects.toThrow("Could not prepare a clip for the export: its copy was stopped before it was finished. Export again.");
  jest.mocked(ensureSteady).mockReset();
  jest.mocked(ensureSteady).mockRejectedValueOnce(new Error("steady writer: boom"));
  await expect(prepareSteady("p1", [a], () => {})).rejects.toThrow("Could not prepare a clip for the export: steady writer: boom");
  let stop = false;
  jest.mocked(ensureSteady).mockImplementationOnce(async () => { stop = true; throw new Error("late"); });
  expect((await prepareSteady("p1", [a], () => {}, () => stop)).size).toBe(0);
});

test("the room the copies still to be made take; a copy that is ready costs nothing more", async () => {
  expect(await steadyBytesToMake("p1", [a, b, slow])).toBe(steadyBytes(a, { level: 2, grid: 0 }) + steadyBytes(slow, { level: 0, grid: 120 }));
  jest.mocked(expoFs.list).mockResolvedValue([A]);
  expect(await steadyBytesToMake("p1", [a, b, slow])).toBe(steadyBytes(slow, { level: 0, grid: 120 }));
});

test("withSteady swaps the file and nothing else; a clip without a copy is sent as it is", () => {
  const sent = toExportClip(a);
  expect(withSteady(sent, a, `${DIR}/${A}`)).toEqual({ ...sent, sourceUri: `${DIR}/${A}` });
  expect(withSteady(sent, a, undefined)).toBe(sent);
  const plain = toExportClip(b);
  expect(withSteady(plain, b, `${DIR}/x.mov`)).toBe(plain);
});
