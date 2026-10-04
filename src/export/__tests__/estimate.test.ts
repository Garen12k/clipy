import { makeClip, makeLayer, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { canExport4K, estimateBytes, exportableClips, exportableLayers, formatBytes } from "../estimate";

test("exportableLayers skips an empty layer (trimEnd <= trimStart), as exportableClips skips an empty clip", () => {
  const ok = makeLayer({ id: "ok", sourceDuration: 3, start: 0 });
  const empty = makeLayer({ id: "empty", sourceDuration: 3, trimStart: 2, trimEnd: 2, start: 0 });
  const inverted = makeLayer({ id: "inv", sourceDuration: 3, trimStart: 2, trimEnd: 1, start: 0 });
  const p = makeProject({ id: "p", clips: [makeClip({ id: "a", sourceDuration: 4 })], layers: [empty, ok, inverted] });
  expect(exportableLayers(p, [], 4)).toEqual([ok]);
});

test("estimateBytes = duration × bitrate", () => {
  expect(estimateBytes(60, 1080)).toBe(60 * 10e6 / 8);
  expect(estimateBytes(10, 720)).toBe(10 * 5e6 / 8);
});
test("canExport4K needs a 4K source", () => {
  expect(canExport4K([{ width: 1080, height: 1920 }])).toBe(false);
  expect(canExport4K([{ width: 1080, height: 1920 }, { width: 2160, height: 3840 }])).toBe(true);
});
test("canExport4K ignores photo clips", () => {
  const photo = makePhotoClip({ id: "p", width: 4000, height: 3000 });
  const video = makeClip({ id: "v", sourceDuration: 2, width: 1080, height: 1920 });
  expect(canExport4K([photo, video])).toBe(false);
  expect(canExport4K([photo, makeClip({ id: "w", sourceDuration: 2, width: 2160, height: 3840 })])).toBe(true);
});
test("formatBytes", () => {
  expect(formatBytes(340 * 1e6)).toBe("340 MB");
  expect(formatBytes(1.25e9)).toBe("1.3 GB");
});

test("layers never gate 4K: only the main clips decide", () => {
  const photoLayer = makeLayer({ id: "pl", sourceDuration: 3, kind: "photo", width: 4000, height: 3000 });
  const videoLayer = makeLayer({ id: "vl", sourceDuration: 3, width: 2160, height: 3840 });
  const main = makeClip({ id: "m", sourceDuration: 2, width: 1080, height: 1920 });
  const p = makeProject({ id: "p", clips: [main], layers: [photoLayer, videoLayer] });
  expect(canExport4K(exportableClips(p, []))).toBe(false);
  const p4k = makeProject({ id: "q", clips: [makeClip({ id: "w", sourceDuration: 2, width: 2160, height: 3840 })], layers: [makeLayer({ id: "s", sourceDuration: 3, width: 1080, height: 1920 })] });
  expect(canExport4K(exportableClips(p4k, []))).toBe(true);
});
