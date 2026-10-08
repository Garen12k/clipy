jest.mock("@/src/editor/cutoutRenders", () => ({
  cutoutDir: (id: string) => `file:///doc/projects/${id}/cutout`,
  ensureCutout: jest.fn(),
  isNoPerson: (m: string) => m.includes("cutout person:"),
}));
jest.mock("@/src/projects/expoFs", () => ({ expoFs: { list: jest.fn(async () => []) } }));
import { toExportClip, toExportLayer } from "@/modules/clipy-video";
import { ensureCutout } from "@/src/editor/cutoutRenders";
import { cutoutsNeeded, useCutoutFiles, type CutoutFile } from "@/src/editor/cutoutFiles";
import { parseCutoutName } from "@/src/editor/model/cutout";
import { setClipSpeedCurve } from "@/src/editor/model/ops";
import { transitionHandles } from "@/src/editor/model/timeline";
import { makeClip, makeLayer, makePhotoClip, makeProject, SPEED_CURVE_IDS } from "@/src/editor/model/types";
import { expoFs } from "@/src/projects/expoFs";
import { CUTOUT_EXPORT, CUTOUT_SHARE, prepareCutouts, withCutout } from "../exportCutouts";

const MEDIA = "file:///doc/projects/p1/media", DIR = "file:///doc/projects/p1/cutout";
const ensure = jest.mocked(ensureCutout);
const video = makeClip({ id: "a", sourceDuration: 30, sourceUri: `${MEDIA}/abc.mov`, trimStart: 4.2, trimEnd: 9.7, cutout: true });
const half = makeClip({ id: "b", sourceDuration: 30, sourceUri: `${MEDIA}/abc.mov`, trimStart: 9.7, trimEnd: 10.5, cutout: true });
const photo = makePhotoClip({ id: "ph", sourceUri: `${MEDIA}/p.jpg`, seconds: 4, cutout: true });
const plain = makeClip({ id: "plain", sourceDuration: 5 });

beforeEach(() => {
  jest.clearAllMocks();
  ensure.mockImplementation(async (_p, need) => `${DIR}/${need.name}`);
  jest.mocked(expoFs.list).mockResolvedValue([]);
  useCutoutFiles.setState({ files: {} });
});
const ready = (name: string): CutoutFile => ({ status: "ready", uri: `${DIR}/${name}` });
const cancelled = (): Error => Object.assign(new Error("Cutout cancelled"), { code: "E_CUTOUT_CANCELLED" });

test("the share of the export's progress, and the sentences", () => {
  expect(CUTOUT_SHARE).toBe(0.3);
  expect(CUTOUT_EXPORT).toEqual({
    tooLong: "A clip with Remove background is longer than 60 seconds. Shorten it, or switch Remove background off.",
    noPerson: "Remove background found no person in a clip. Switch it off for that clip.",
  });
});

test("prepareCutouts: nothing for clips without the switch; one copy per clip with it, in order, with progress", async () => {
  await expect(prepareCutouts("p1", [plain], () => {})).resolves.toEqual(new Map());
  expect(ensure).not.toHaveBeenCalled();
  const seen: number[] = [];
  const out = await prepareCutouts("p1", [plain, video, photo], (f) => seen.push(f));
  expect([...out]).toEqual([["a", `${DIR}/abc-c1-2000-12000.mov`], ["ph", `${DIR}/p-c1-photo.png`]]);
  expect(ensure.mock.calls.map((c) => c[1].name)).toEqual(["abc-c1-2000-12000.mov", "p-c1-photo.png"]);
  expect(seen).toEqual([0.5, 1]);
});

test("prepareCutouts: a copy on disk that covers a clip is used, and a copy made for one clip serves the next", async () => {
  jest.mocked(expoFs.list).mockResolvedValueOnce(["abc-c1-0-30000.mov", "part-abc-c1-2000-12000.mov", "notes.txt"]);
  const out = await prepareCutouts("p1", [video, half], () => {});
  expect(ensure.mock.calls.map((c) => c[1].name)).toEqual(["abc-c1-0-30000.mov", "abc-c1-0-30000.mov"]);
  expect(out.get("b")).toBe(`${DIR}/abc-c1-0-30000.mov`);
  jest.clearAllMocks();
  ensure.mockImplementation(async (_p, need) => `${DIR}/${need.name}`);
  const wide = makeClip({ id: "w", sourceDuration: 30, sourceUri: `${MEDIA}/abc.mov`, trimStart: 4, trimEnd: 12, cutout: true });
  await prepareCutouts("p1", [wide, video], () => {});
  expect(ensure.mock.calls.map((c) => c[1].name)).toEqual(["abc-c1-2000-14000.mov", "abc-c1-2000-14000.mov"]);     // the second clip is inside the first one's copy
});

test("prepareCutouts: a clip over the limit, no person, and any other failure stop the export with a plain reason", async () => {
  const long = makeClip({ id: "l", sourceDuration: 300, cutout: true });
  await expect(prepareCutouts("p1", [video, long], () => {})).rejects.toThrow(CUTOUT_EXPORT.tooLong);
  expect(ensure).not.toHaveBeenCalled();
  ensure.mockRejectedValueOnce(new Error("cutout person: no person found"));
  await expect(prepareCutouts("p1", [video], () => {})).rejects.toThrow(CUTOUT_EXPORT.noPerson);
  ensure.mockRejectedValueOnce(new Error("cutout writer: boom"));
  await expect(prepareCutouts("p1", [video], () => {})).rejects.toThrow("Could not remove a background for the export: cutout writer: boom");
});

test("prepareCutouts: once stopped it asks for nothing more and reports nothing more", async () => {
  let stop = false;
  const seen: number[] = [];
  ensure.mockImplementationOnce(async (_p, need) => { stop = true; return `${DIR}/${need.name}`; });
  const out = await prepareCutouts("p1", [video, photo], (f) => seen.push(f), () => stop);
  expect(ensure).toHaveBeenCalledTimes(1);
  expect(out.size).toBe(1);
  expect(seen).toEqual([]);
});

describe("withCutout: what the export is sent", () => {
  const COPY = `${DIR}/abc-c1-2000-12000.mov`;

  test("no copy, or the switch off: the clip is sent as it is (the same object)", () => {
    const sent = toExportClip(video);
    expect(withCutout(sent, video, undefined, true)).toBe(sent);
    const off = toExportClip(plain);
    expect(withCutout(off, plain, COPY, true)).toBe(off);
  });

  test("a main video: the copy's file, everything else the same, the opacity just under 1 so its background is drawn", () => {
    const sent = toExportClip(video);
    expect(withCutout(sent, video, COPY, true)).toEqual({ ...sent, sourceUri: COPY, opacity: 0.999 });
    const faded = toExportClip({ ...video, opacity: 0.4 });
    expect(withCutout(faded, { ...video, opacity: 0.4 }, COPY, true).opacity).toBe(0.4);
  });

  test("a layer: the copy's file and nothing else", () => {
    const layer = { ...makeLayer({ id: "L", sourceDuration: 30, sourceUri: `${MEDIA}/abc.mov`, trimStart: 4.2, trimEnd: 9.7, start: 2 }), cutout: true as const };
    const sent = toExportLayer(layer);
    expect(withCutout(sent, layer, COPY, false)).toEqual({ ...sent, sourceUri: COPY });
  });

  test("a photo is sent as a video clip playing its still movie for the photo's length", () => {
    const sent = toExportClip(photo);
    const out = withCutout(sent, photo, `${DIR}/p-c1-photo.png`, true);
    expect(out).toEqual({ ...sent, kind: "video", sourceUri: `${DIR}/p-c1-photo.mov`, trimStart: 0, trimEnd: 4, speed: 1, reversed: false, muted: true, speedSpans: [], opacity: 0.999 });
    expect(out.keyframes).toBe(sent.keyframes);                 // a Motion's pins travel with it
  });
});

describe("the export asks for the copies the editor holds", () => {
  // The editor stays mounted under the Export screen and cancels a running render whose name it does not need itself:
  // the export has to name every copy the way the editor does, from the same store.
  const wide = makeClip({ id: "w", sourceDuration: 30, sourceUri: `${MEDIA}/abc.mov`, trimStart: 4, trimEnd: 12, cutout: true });

  test("the names are the editor's own, whatever the store holds", async () => {
    const stores: Record<string, CutoutFile>[] = [
      {},
      { "abc-c1-0-30000.mov": ready("abc-c1-0-30000.mov") },
      { "abc-c1-0-30000.mov": { status: "busy", progress: 0.4 } },
      { "abc-c1-0-30000.mov": ready("abc-c1-0-30000.mov"), "abc-c1-2000-12000.mov": { status: "busy", progress: 0.1 } },
      { "abc-c1-2000-12000.mov": { status: "failed", message: "cutout writer: boom" } },
    ];
    for (const files of stores) {
      ensure.mockClear();
      useCutoutFiles.setState({ files });
      const project = makeProject({ id: "p1", clips: [video, photo], layers: [] });
      await prepareCutouts("p1", project.clips, () => {});
      expect(ensure.mock.calls.map((c) => c[1])).toEqual(cutoutsNeeded(project, [], files));
    }
  });

  test("a clip that shows a ready copy is not moved to a smaller one that is still being made", async () => {
    useCutoutFiles.setState({ files: { "abc-c1-0-30000.mov": ready("abc-c1-0-30000.mov"), "abc-c1-2000-12000.mov": { status: "busy", progress: 0.1 } } });
    const out = await prepareCutouts("p1", [video], () => {});
    expect(out.get("a")).toBe(`${DIR}/abc-c1-0-30000.mov`);
  });

  test("the store is read again for each clip: a copy the editor finished meanwhile is used", async () => {
    ensure.mockImplementationOnce(async (_p, need) => {
      useCutoutFiles.setState({ files: { "abc-c1-0-30000.mov": ready("abc-c1-0-30000.mov") } });
      return `${DIR}/${need.name}`;
    });
    await prepareCutouts("p1", [photo, video], () => {});
    expect(ensure.mock.calls.map((c) => c[1].name)).toEqual(["p-c1-photo.png", "abc-c1-0-30000.mov"]);
  });

  test("a render the editor stopped is asked for again, by the name the editor has by then; the progress never runs back", async () => {
    const seen: number[] = [];
    ensure.mockImplementationOnce(async (_p, _need, onProgress) => {
      onProgress?.(0.8);
      useCutoutFiles.setState({ files: { "abc-c1-2000-14000.mov": { status: "busy", progress: 0 } } });
      throw cancelled();
    });
    ensure.mockImplementationOnce(async (_p, need, onProgress) => { onProgress?.(0.2); onProgress?.(0.9); return `${DIR}/${need.name}`; });
    const out = await prepareCutouts("p1", [video], (f) => seen.push(f));
    expect(ensure.mock.calls.map((c) => c[1].name)).toEqual(["abc-c1-2000-12000.mov", "abc-c1-2000-14000.mov"]);
    expect(out.get("a")).toBe(`${DIR}/abc-c1-2000-14000.mov`);
    expect(seen).toEqual([0.8, 0.9, 1]);
  });

  test("stopped three times running: the export ends with a plain reason and never asks a fourth time", async () => {
    ensure.mockImplementation(async () => { throw cancelled(); });
    await expect(prepareCutouts("p1", [video], () => {})).rejects.toThrow("Could not remove a background for the export: the cut-out was stopped before it was finished. Export again.");
    expect(ensure).toHaveBeenCalledTimes(3);
  });

  test("a render stopped after Cancel is not asked for again", async () => {
    let stop = false;
    ensure.mockImplementationOnce(async () => { stop = true; throw cancelled(); });
    await expect(prepareCutouts("p1", [video, photo], () => {}, () => stop)).resolves.toEqual(new Map());
    expect(ensure).toHaveBeenCalledTimes(1);
  });

  test("a folder that cannot be read counts as empty", async () => {
    jest.mocked(expoFs.list).mockRejectedValueOnce(new Error("no folder"));
    await prepareCutouts("p1", [wide], () => {});
    expect(ensure.mock.calls.map((c) => c[1].name)).toEqual(["abc-c1-2000-14000.mov"]);
  });

  test("a clip whose switch is stored but that plays backwards has no copy and stops nothing", async () => {
    const back = { ...makeClip({ id: "r", sourceDuration: 300, reversed: true }), cutout: true as const };
    await expect(prepareCutouts("p1", [back], () => {})).resolves.toEqual(new Map());
    expect(ensure).not.toHaveBeenCalled();
    expect(expoFs.list).not.toHaveBeenCalled();
  });
});

describe("withCutout: the copy keeps the source's own times and is its own way up", () => {
  // A copy's timeline IS the source's (its frames sit at their source seconds, after an empty stretch): second t of the source
  // is second t of the copy. So the trim, the speed, the speed spans, the pins and the gain are sent untouched, and every
  // source second the request names lies inside the range the copy holds.
  const base = { sourceDuration: 30, sourceUri: `${MEDIA}/abc.mov`, cutout: true as const };
  const curved = setClipSpeedCurve(makeProject({ id: "p1", clips: [makeClip({ ...base, id: "t3", trimStart: 1, trimEnd: 9 })] }), "t3", SPEED_CURVE_IDS[0]).clips[0];
  test.each([
    ["a plain trim", makeClip({ ...base, id: "t1", trimStart: 4.2, trimEnd: 9.7 })],
    ["speed 2", makeClip({ ...base, id: "t2", trimStart: 12.25, trimEnd: 20, speed: 2 })],
    ["a speed curve", curved],
    ["the whole file", makeClip({ ...base, id: "t4", sourceDuration: 7.4 })],
    ["speed 4 with a transition after it", { ...makeClip({ ...base, id: "t5", trimStart: 12.25, trimEnd: 20, speed: 4 }), transitionOut: { type: "dissolve" as const, duration: 1 } }],
    ["speed 4 at the file's very end", makeClip({ ...base, id: "t6", trimStart: 22, trimEnd: 30, speed: 4 })],
  ])("%s", async (_name, clip) => {
    const out = await prepareCutouts("p1", [clip], () => {});
    const uri = out.get(clip.id) ?? "";
    const held = parseCutoutName(uri.split("/").pop() ?? "");
    const sent = toExportClip(clip);
    const cut = withCutout(sent, clip, uri, false);
    expect(cut).toEqual({ ...sent, sourceUri: uri });
    expect(held).not.toBeNull();
    expect(held?.from).toBeLessThanOrEqual(cut.trimStart);
    expect(held?.to).toBeGreaterThanOrEqual(cut.trimEnd);
    // … and so does the handle of a transition into or out of the clip (I1): half the longest transition at the clip's edge speed,
    // which the export reads BEFORE trimStart / AFTER trimEnd, stopping only at the file's own ends.
    const { head, tail } = transitionHandles(clip);
    expect(held?.from).toBeLessThanOrEqual(Math.max(0, cut.trimStart - head));
    expect(held?.to).toBeGreaterThanOrEqual(Math.min(clip.sourceDuration, cut.trimEnd + tail));
    expect(JSON.stringify(cut.speedSpans)).toBe(JSON.stringify(sent.speedSpans));
  });
  test("a copy that only contains the trim is not what a clip with a transition is sent from (I1)", async () => {
    // The copy 3 – 11 was made for the trim 4.2 – 9.7; the clip was then trimmed outwards to the copy's very start.
    const out3 = makeClip({ ...base, id: "o", trimStart: 3, trimEnd: 9.7 });
    jest.mocked(expoFs.list).mockResolvedValueOnce(["abc-c1-3000-11000.mov"]);
    const made = await prepareCutouts("p1", [out3], () => {});
    expect(made.get("o")).toBe(`${DIR}/abc-c1-1000-12000.mov`);
    expect(ensure.mock.calls.map((c) => [c[1].from, c[1].to])).toEqual([[1, 12]]);
  });
  test("the curve in that table really is one", () => { expect(toExportClip(curved).speedSpans.length).toBeGreaterThan(1); });

  test("a source filmed on its side: the size, the crop and the placement are sent as they were", () => {
    // The request never carried a turn: the export reads the turn and the pixel size from the FILE it is given, and the copy
    // is upright with the same shape. `sourceWidth` / `sourceHeight` are the shape the editor showed, not the copy's pixels.
    const side = makeClip({ ...base, id: "s", sourceDuration: 8, width: 2160, height: 3840,
      transform: { scale: 1.4, x: 0.1, y: -0.2, rotation: 0.3, flipH: true, flipV: false }, crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 } });
    const sent = toExportClip(side);
    const cut = withCutout(sent, side, `${DIR}/abc-c1-0-8000.mov`, true);
    expect([cut.sourceWidth, cut.sourceHeight]).toEqual([2160, 3840]);
    expect(cut.transform).toEqual(sent.transform);
    expect(cut.crop).toEqual(sent.crop);
    expect(Object.keys(cut)).toEqual(Object.keys(sent));
  });

  test("a photo keeps the length it had: its speed goes with it, as the export's own photo step keeps it", () => {
    const quick = { ...photo, id: "q", trimStart: 1, trimEnd: 5, speed: 2 };
    const sent = toExportClip(quick);
    const out = withCutout(sent, quick, `${DIR}/p-c1-photo.png`, false);
    expect(out).toEqual({ ...sent, kind: "video", sourceUri: `${DIR}/p-c1-photo.mov`, trimStart: 0, trimEnd: 4, reversed: false });
    expect(out.speed).toBe(2);
  });

  test("a main clip whose opacity is not a number still gets its background (the export would count it as 1)", () => {
    const odd = { ...toExportClip(video), opacity: NaN };
    expect(withCutout(odd, video, `${DIR}/abc-c1-2000-12000.mov`, true).opacity).toBe(0.999);
    expect(withCutout(odd, video, `${DIR}/abc-c1-2000-12000.mov`, false).opacity).toBeNaN();
  });
});
