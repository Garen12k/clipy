jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makePhotoClip, makeProject, PHOTO, type Clip } from "../types";
import { clipDuration } from "../timeline";
import { replaceClipMedia } from "../ops";

const edits: Partial<Clip> = {
  filter: "warm", volume: 0.5, muted: true, reversed: true,
  transform: { scale: 1.5, x: 0.1, y: -0.2, rotation: 90, flipH: true, flipV: false },
  crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.6 },
  background: { type: "color", color: "#112233" },
  transitionOut: { type: "fade", duration: 0.5 },
};
// 4 s of source at 2× = 2 s on the timeline.
const vid = makeClip({ id: "a", sourceDuration: 10, trimStart: 2, trimEnd: 6, speed: 2, ...edits });
const next = makeClip({ id: "b", sourceDuration: 4 });
const p = makeProject({ clips: [vid, next] });

const newVideo = (sourceDuration: number) => ({ sourceUri: "file:///new.mp4", sourceDuration, width: 1920, height: 1080, kind: "video" as const });
const newPhoto = { sourceUri: "file:///new.jpg", sourceDuration: 0, width: 800, height: 600, kind: "photo" as const };

test("video → video keeps the id and every edit, swaps the media and keeps the output length", () => {
  const out = replaceClipMedia(p, "a", newVideo(20));
  const c = out.clips[0];
  expect(c).toMatchObject({
    id: "a", sourceUri: "file:///new.mp4", sourceDuration: 20, width: 1920, height: 1080, kind: "video",
    trimStart: 0, trimEnd: 4, speed: 2, ...edits,
  });
  expect(clipDuration(c)).toBe(2);
  expect(out.clips[1]).toBe(next);
  expect(out.updatedAt).toBe("2026-10-01T10:00:00.000Z");
});

test("video → shorter video uses the whole new video", () => {
  const c = replaceClipMedia(p, "a", newVideo(3)).clips[0];
  expect(c).toMatchObject({ trimStart: 0, trimEnd: 3, speed: 2 });
  expect(clipDuration(c)).toBe(1.5);
});

test("a video shorter than the minimum clip length is refused", () => {
  expect(replaceClipMedia(p, "a", newVideo(0.15))).toBe(p);   // 0.15 s at 2× = 0.075 s
});

test("unknown clip id changes nothing", () => {
  expect(replaceClipMedia(p, "nope", newVideo(5))).toBe(p);
});

test("video → photo applies the photo rules and keeps the visual edits", () => {
  const c = replaceClipMedia(p, "a", newPhoto).clips[0];
  expect(c).toMatchObject({
    id: "a", kind: "photo", sourceUri: "file:///new.jpg", width: 800, height: 600,
    speed: 1, muted: true, reversed: false, trimStart: 0, trimEnd: 2, sourceDuration: PHOTO.maxSeconds,
    filter: "warm", transform: edits.transform, crop: edits.crop, background: edits.background, transitionOut: edits.transitionOut,
  });
});

test("video → photo clamps the length to the photo limits", () => {
  const short = makeProject({ clips: [makeClip({ id: "s", sourceDuration: 0.2 })] });
  expect(replaceClipMedia(short, "s", newPhoto).clips[0].trimEnd).toBe(PHOTO.minSeconds);
  const long = makeProject({ clips: [makeClip({ id: "l", sourceDuration: 200 })] });
  expect(replaceClipMedia(long, "l", newPhoto).clips[0].trimEnd).toBe(PHOTO.maxSeconds);
});

test("photo → video turns sound on at volume 1, speed 1, and keeps the photo's length", () => {
  const ph = makePhotoClip({ id: "ph", seconds: 5, filter: "mono", transform: edits.transform, crop: edits.crop, background: edits.background, transitionOut: edits.transitionOut });
  const q = makeProject({ clips: [ph, makeClip({ id: "n", sourceDuration: 4 })] });
  const c = replaceClipMedia(q, "ph", newVideo(10)).clips[0];
  expect(c).toMatchObject({ id: "ph", kind: "video", sourceDuration: 10, trimStart: 0, trimEnd: 5, speed: 1, muted: false, volume: 1, reversed: false, filter: "mono",
    transform: edits.transform, crop: edits.crop, background: edits.background, transitionOut: edits.transitionOut });
  expect(replaceClipMedia(q, "ph", newVideo(3)).clips[0].trimEnd).toBe(3);
});

test("photo → photo keeps the photo's length", () => {
  const q = makeProject({ clips: [makePhotoClip({ id: "ph", seconds: 7 })] });
  expect(replaceClipMedia(q, "ph", newPhoto).clips[0]).toMatchObject({ kind: "photo", trimEnd: 7, sourceUri: "file:///new.jpg" });
});

test("transitions are re-capped when the clip gets shorter", () => {
  const a = makeClip({ id: "a", sourceDuration: 4, transitionOut: { type: "fade", duration: 1 } });
  const q = makeProject({ clips: [a, makeClip({ id: "b", sourceDuration: 4 })] });
  const out = replaceClipMedia(q, "a", newVideo(1));
  expect(out.clips[0].transitionOut).toEqual({ type: "fade", duration: 0.5 });
});
