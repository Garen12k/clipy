import { makeClip, makeLayer, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { canExport4K, estimateBytes, exportableClips, exportableLayers, exportBitrate, formatBytes, FPS_BITRATE_FACTOR, QUALITY_BITRATE_FACTOR, requestBitrate } from "../estimate";

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

test("exportBitrate = resolution bitrate × fps factor × quality factor, in bits per second", () => {
  expect(FPS_BITRATE_FACTOR).toEqual({ 24: 0.9, 30: 1, 60: 1.5 });
  expect(QUALITY_BITRATE_FACTOR).toEqual({ high: 1, small: 0.6 });
  expect(exportBitrate(1080)).toBe(10_000_000);                                    // the default: 30 fps, High — today's number
  expect(exportBitrate(1080, { fps: 30, quality: "small" })).toBe(6_000_000);      // 10 × 0.6
  expect(exportBitrate(1080, { fps: 60, quality: "small" })).toBe(9_000_000);      // 10 × 1.5 × 0.6
  expect(exportBitrate(1080, { fps: 60, quality: "high" })).toBe(15_000_000);      // 10 × 1.5
  expect(exportBitrate(720, { fps: 24, quality: "small" })).toBe(2_700_000);       // 5 × 0.9 × 0.6
  expect(exportBitrate(2160, { fps: 60, quality: "high" })).toBe(52_500_000);      // 35 × 1.5
});

test("estimateBytes follows the settings; without them it is what it always was", () => {
  expect(estimateBytes(60, 1080)).toBe(75_000_000);                                    // 60 × 10e6 / 8
  expect(estimateBytes(8, 1080, { fps: 60, quality: "small" })).toBe(9_000_000);       // 8 × 9e6 / 8
  expect(estimateBytes(30, 720, { fps: 24, quality: "small" })).toBe(10_125_000);      // 30 × 2.7e6 / 8
});

test("requestBitrate: High never limits the file (0 = today's export); Smaller file sends the capped bitrate", () => {
  expect(requestBitrate(1080)).toBe(0);                                            // the default
  for (const fps of [24, 30, 60] as const) for (const res of [720, 1080, 2160] as const) expect(requestBitrate(res, { fps, quality: "high" })).toBe(0);
  expect(requestBitrate(1080, { fps: 30, quality: "small" })).toBe(6_000_000);     // = exportBitrate
  expect(requestBitrate(720, { fps: 24, quality: "small" })).toBe(2_700_000);
});

test("garbage settings fall back to the defaults: always a finite whole number", () => {
  const junk = [{ fps: NaN, quality: "small" }, { fps: Infinity, quality: null }, { fps: "60", quality: 7 }, null, undefined, 3] as never[];
  for (const s of junk) {
    const b = requestBitrate(1080, s), e = exportBitrate(1080, s);
    expect(Number.isInteger(b) && b >= 0).toBe(true);
    expect(Number.isInteger(e) && e > 0).toBe(true);
    expect(Number.isFinite(estimateBytes(10, 1080, s))).toBe(true);
  }
  expect(requestBitrate(1080, { fps: NaN, quality: "small" } as never)).toBe(6_000_000);
});
