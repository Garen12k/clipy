import { makeClip, makeLayer, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { canExport4K, estimateBytes, exportableClips, formatBytes } from "../estimate";

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
