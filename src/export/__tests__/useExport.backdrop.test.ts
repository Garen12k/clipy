import { act, renderHook } from "@testing-library/react-native";
jest.mock("@/modules/clipy-video", () => ({
  isNativeAvailable: () => true,
  exportTimeline: jest.fn(async () => "job1"),
  addExportListener: jest.fn(() => ({ remove() {} })),
  cancelExport: jest.fn(),
  toExportOverlay: jest.requireActual("@/modules/clipy-video").toExportOverlay,
  toExportClip: jest.requireActual("@/modules/clipy-video").toExportClip,
  toExportEffect: jest.requireActual("@/modules/clipy-video").toExportEffect,
  toExportLayer: jest.requireActual("@/modules/clipy-video").toExportLayer,
  toExportAudioTrack: jest.requireActual("@/modules/clipy-video").toExportAudioTrack,
  isSoundAvailable: jest.fn(() => true),
  isCutoutAvailable: jest.fn(() => true),
  isSteadyAvailable: jest.fn(() => true),
  isBlurAndCutsBuild: jest.fn(() => true),
  isCutoutCancelled: jest.requireActual("@/modules/clipy-video").isCutoutCancelled,
}));
jest.mock("@/src/editor/cutoutRenders", () => ({
  cutoutDir: (id: string) => `file:///doc/projects/${id}/cutout`,
  ensureCutout: jest.fn(async (_p: string, need: { name: string }) => `file:///doc/projects/p1/cutout/${need.name}`),
  isNoPerson: (m: string) => m.includes("cutout person:"),
}));
jest.mock("@/src/projects/expoFs", () => ({
  expoFs: { cacheDir: "file:///cache/", freeBytes: jest.fn(async () => 1e12), mkdir: async () => {}, list: jest.fn(async () => []) },
}));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-11T10:00:00.000Z" }));
import { exportTimeline, isBlurAndCutsBuild } from "@/modules/clipy-video";
import { useCutoutFiles } from "@/src/editor/cutoutFiles";
import { setClipSpeedCurve } from "@/src/editor/model/ops";
import { makeClip, makeLayer, makePhotoClip, makeProject, SPEED_CURVE_IDS, type Project } from "@/src/editor/model/types";
import { useExport } from "../useExport";

/**
 * A cut-out MAIN clip whose background is Blur: the export names the clip's ORIGINAL for the blur (the copy is see-through, so
 * its own blur is a silhouette). The key exists for such a clip on a build that reads it, and nowhere else — every other request
 * is byte for byte what it was.
 */
const DIR = "file:///doc/projects/p1/cutout";
const blur = { type: "blur" as const };
const cut = { ...makeClip({ id: "a", sourceDuration: 8, sourceUri: "file:///media/a.mp4", trimStart: 1, trimEnd: 7, speed: 0.5 }), cutout: true as const, background: blur };
const other = makeClip({ id: "b", sourceDuration: 6 });
const layer = { ...makeLayer({ id: "L", sourceDuration: 5, sourceUri: "file:///media/l.mp4", start: 1 }), cutout: true as const, background: blur };
const project = makeProject({ id: "p1", clips: [cut, other], layers: [layer] });
const build = jest.mocked(isBlurAndCutsBuild);

async function requestOf(p: Project) {
  jest.mocked(exportTimeline).mockClear();
  const now = jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
  try {
    const { result } = await renderHook(() => useExport(p, []));
    await act(async () => { await result.current.start(1080); });
    expect(result.current.state.status).toBe("exporting");
    return jest.mocked(exportTimeline).mock.calls[0][0];
  } finally { now.mockRestore(); }
}

beforeEach(() => { jest.clearAllMocks(); build.mockReset(); build.mockReturnValue(true); useCutoutFiles.setState({ files: {} }); });

test("PINNED: the new build's request is the older build's plus ONE key on the one clip — its original, with nothing about timing", async () => {
  build.mockReturnValue(false);
  const before = await requestOf(project);
  expect(JSON.stringify(before)).not.toContain("backdrop");
  build.mockReturnValue(true);
  const after = await requestOf(project);
  expect(after.clips[0]).toEqual({ ...before.clips[0], backdrop: { uri: "file:///media/a.mp4", kind: "video" } });
  // The clip itself still plays its copy, with the trim and the speed it had: the backdrop is read through the same numbers.
  expect(after.clips[0]).toMatchObject({ sourceUri: `${DIR}/a-c1-0-8000.mov`, trimStart: 1, trimEnd: 7, speed: 0.5, opacity: 0.999, background: { type: "blur", color: null } });
  // Everything else — the other clip, the cut-out LAYER (a layer has no background), the rest of the request — byte for byte.
  expect(JSON.stringify({ ...after, clips: [{ ...after.clips[0], backdrop: undefined }, ...after.clips.slice(1)] })).toBe(JSON.stringify(before));
  expect(JSON.stringify(after.layers)).not.toContain("backdrop");
  expect(JSON.stringify(after.clips[1])).not.toContain("backdrop");
});

test("a speed curve and a photo: the spans are the clip's own, and a photo names itself as a photo", async () => {
  const curved = { ...setClipSpeedCurve(makeProject({ id: "p1", clips: [makeClip({ id: "c", sourceDuration: 9, sourceUri: "file:///media/c.mp4" })] }), "c", SPEED_CURVE_IDS[0]).clips[0], cutout: true as const, background: blur };
  const photo = { ...makePhotoClip({ id: "ph", sourceUri: "file:///media/p.jpg", seconds: 4 }), cutout: true as const, background: blur };
  const sent = await requestOf(makeProject({ id: "p1", clips: [curved, photo] }));
  expect(sent.clips[0].backdrop).toEqual({ uri: "file:///media/c.mp4", kind: "video" });
  expect(sent.clips[0].speedSpans.length).toBeGreaterThan(1);
  expect(sent.clips[1]).toMatchObject({ kind: "video", sourceUri: `${DIR}/p-c1-photo.mov`, trimStart: 0, trimEnd: 4, backdrop: { uri: "file:///media/p.jpg", kind: "photo" } });
});

test("no key — and the build is not even asked — without a cut-out clip that has Blur behind it", async () => {
  for (const p of [
    makeProject({ id: "p1", clips: [{ ...cut, background: { type: "black" as const } }, other] }),                 // cut-out, black
    makeProject({ id: "p1", clips: [{ ...other, background: blur }] }),                                             // Blur, no cut-out
    makeProject({ id: "p1", clips: [{ ...other, background: blur }], layers: [layer] }),                            // only a LAYER is cut out
    makeProject({ id: "p1", clips: [{ ...cut, reversed: true }] }),                                                 // played backwards: no cut-out
  ]) {
    const sent = await requestOf(p);
    expect(JSON.stringify(sent)).not.toContain("backdrop");
  }
  expect(build).not.toHaveBeenCalled();
});

test("a module that cannot be asked is an older build: the export goes out as it always did", async () => {
  build.mockImplementation(() => { throw new Error("not linked"); });
  const sent = await requestOf(project);
  expect(JSON.stringify(sent)).not.toContain("backdrop");
  expect(sent.clips[0]).toMatchObject({ sourceUri: `${DIR}/a-c1-0-8000.mov`, opacity: 0.999 });
});
