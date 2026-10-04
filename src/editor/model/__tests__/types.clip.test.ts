import {
  BLACK_BACKGROUND, clampCrop, clampTransform, CROP_MIN, DEFAULT_TRANSFORM, FULL_CROP, isPhoto, makeClip, makePhotoClip,
  newPhotoClip, newVideoClip, normaliseRotation, PHOTO, SCHEMA_VERSION,
} from "../types";

test("schema is v11", () => expect(SCHEMA_VERSION).toBe(11));

test("normaliseRotation maps into (-180, 180]", () => {
  expect(normaliseRotation(0)).toBe(0);
  expect(normaliseRotation(180)).toBe(180);
  expect(normaliseRotation(-180)).toBe(180);
  expect(normaliseRotation(270)).toBe(-90);
  expect(normaliseRotation(720)).toBe(0);
  expect(normaliseRotation(450)).toBe(90);
});

test("clampTransform limits scale and offsets, repairs non-finite, normalises rotation", () => {
  expect(clampTransform({ ...DEFAULT_TRANSFORM, scale: 0 }).scale).toBe(0.2);
  expect(clampTransform({ ...DEFAULT_TRANSFORM, scale: 99 }).scale).toBe(5);
  expect(clampTransform({ ...DEFAULT_TRANSFORM, x: 3, y: -3 })).toMatchObject({ x: 1, y: -1 });
  expect(clampTransform({ scale: NaN, x: NaN, y: Infinity, rotation: NaN, flipH: false, flipV: true })).toEqual({ ...DEFAULT_TRANSFORM, flipV: true });
  expect(clampTransform({ ...DEFAULT_TRANSFORM, rotation: 270 }).rotation).toBe(-90);
});

test("clampCrop keeps the rect inside 0–1 with sides >= CROP_MIN", () => {
  expect(clampCrop(FULL_CROP)).toEqual(FULL_CROP);
  const neg = clampCrop({ x: -0.5, y: -1, w: 0.5, h: 0.5 });
  expect(neg.x).toBeGreaterThanOrEqual(0); expect(neg.y).toBeGreaterThanOrEqual(0);
  const big = clampCrop({ x: 0, y: 0, w: 3, h: 2 });
  expect(big).toEqual(FULL_CROP);
  const small = clampCrop({ x: 0.2, y: 0.2, w: 0.01, h: 0 });
  expect(small.w).toBeGreaterThanOrEqual(CROP_MIN); expect(small.h).toBeGreaterThanOrEqual(CROP_MIN);
  expect(clampCrop({ x: NaN, y: 0, w: 1, h: 1 })).toEqual(FULL_CROP);
  const edge = clampCrop({ x: 0.5, y: 0, w: 0.5, h: 1 });
  expect(edge).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 });
  const over = clampCrop({ x: 0.9, y: 0, w: 0.5, h: 1 });
  expect(over.x + over.w).toBeLessThanOrEqual(1 + 1e-9);
  expect(over.w).toBeGreaterThanOrEqual(CROP_MIN);
});

test("makeClip has the v5 defaults", () => {
  const c = makeClip({ id: "a", sourceDuration: 4 });
  expect(c).toMatchObject({ kind: "video", transform: DEFAULT_TRANSFORM, crop: FULL_CROP, background: BLACK_BACKGROUND, reversed: false });
  expect(isPhoto(c)).toBe(false);
});

test("makePhotoClip / newPhotoClip satisfy the photo rules", () => {
  for (const c of [makePhotoClip({ id: "p" }), newPhotoClip({ id: "p", sourceUri: "file:///p.jpg", width: 100, height: 200 })]) {
    expect(isPhoto(c)).toBe(true);
    expect(c).toMatchObject({ speed: 1, muted: true, reversed: false, trimStart: 0, trimEnd: PHOTO.defaultSeconds, sourceDuration: PHOTO.maxSeconds });
  }
  expect(makePhotoClip({ id: "p", seconds: 5 }).trimEnd).toBe(5);
});

test("newVideoClip builds a video clip with defaults", () => {
  const c = newVideoClip({ id: "v", sourceUri: "file:///v.mp4", sourceDuration: 3, width: 10, height: 20 });
  expect(c).toMatchObject({ kind: "video", trimEnd: 3, trimStart: 0, speed: 1, transform: DEFAULT_TRANSFORM });
});
