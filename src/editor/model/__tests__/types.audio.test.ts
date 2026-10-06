import {
  AUDIO_KINDS, AUDIO_LIMITS, BEAT_LIMITS, clampBeatMarkers, clampFade, DUCKING, makeAudioTrack, makeClip, makePhotoClip, makeProject,
  minAudioDuration, newPhotoClip, newVideoClip, SCHEMA_VERSION,
} from "../types";

test("schema is v17 and the audio constants are exact", () => {
  expect(SCHEMA_VERSION).toBe(17);
  expect(AUDIO_KINDS).toEqual(["music", "voice", "sfx"]);
  expect(AUDIO_LIMITS).toEqual({ minDuration: 0.5, volume: [0, 2], maxTracks: 12, fade: [0, 5], sfxMinDuration: 0.1 });
  expect(DUCKING).toEqual({ level: 0.3, ramp: 0.3 });
  expect(BEAT_LIMITS).toEqual({ max: 300, minGap: 0.05 });
});

test("minAudioDuration: sfx is shorter", () => {
  expect(minAudioDuration("sfx")).toBe(0.1);
  expect(minAudioDuration("music")).toBe(0.5);
  expect(minAudioDuration("voice")).toBe(0.5);
});

test("clampFade clamps to 0–5; anything else is 0", () => {
  expect(clampFade(2.5)).toBe(2.5);
  expect(clampFade(-1)).toBe(0);
  expect(clampFade(9)).toBe(5);
  for (const v of [NaN, Infinity, "2", null, undefined, {}]) expect(clampFade(v)).toBe(0);
});

test("clampBeatMarkers: finite, ≥ 0, sorted, gap-deduped, capped, rounded", () => {
  expect(clampBeatMarkers("x")).toEqual([]);
  expect(clampBeatMarkers([3, NaN, -1, "a", 1, Infinity, 2])).toEqual([1, 2, 3]);
  expect(clampBeatMarkers([1, 1.02, 1.05, 1.0501])).toEqual([1, 1.05]);       // exactly minGap apart stays; closer than it dropped
  expect(clampBeatMarkers([0.12345, 1])).toEqual([0.123, 1]);
  const many = Array.from({ length: 400 }, (_, i) => i);
  expect(clampBeatMarkers(many)).toHaveLength(BEAT_LIMITS.max);
  const once = clampBeatMarkers([2, 1, 1.01, 0.5]);
  expect(clampBeatMarkers(once)).toEqual(once);
});

test("factories carry the v10 defaults", () => {
  expect(makeAudioTrack({ id: "a", sourceDuration: 5 })).toMatchObject({ kind: "music", fadeIn: 0, fadeOut: 0 });
  expect(makeAudioTrack({ id: "a", sourceDuration: 5, kind: "voice" }).kind).toBe("voice");
  expect(newVideoClip({ id: "c", sourceUri: "u", sourceDuration: 3, width: 1, height: 1 })).toMatchObject({ fadeIn: 0, fadeOut: 0 });
  expect(newPhotoClip({ id: "c", sourceUri: "u", width: 1, height: 1 })).toMatchObject({ fadeIn: 0, fadeOut: 0 });
  expect(makeClip({ id: "c", sourceDuration: 3 })).toMatchObject({ fadeIn: 0, fadeOut: 0 });
  expect(makePhotoClip({ id: "p" })).toMatchObject({ fadeIn: 0, fadeOut: 0 });
  expect(makeProject()).toMatchObject({ schemaVersion: 17, ducking: false, beatMarkers: [] });
});
