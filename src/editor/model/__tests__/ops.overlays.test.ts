jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeAudioTrack, makeClip, makeOverlay, makeProject } from "../types";
import { addTextOverlay, defaultOverlayRange, deleteOverlay, duplicateOverlay, moveOverlay, removeAudioTrack, setAudioTrack, setClipMuted, setClipVolume, updateAudioTrack, updateOverlay } from "../ops";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [makeOverlay({ id: "o1", start: 1, end: 4 })] });

test("addTextOverlay appends; defaultOverlayRange clamps to the video", () => {
  expect(addTextOverlay(p, makeOverlay({ id: "o2" })).overlays.map((o) => o.id)).toEqual(["o1", "o2"]);
  expect(defaultOverlayRange(p, 2)).toEqual({ start: 2, end: 5 });
  expect(defaultOverlayRange(p, 9.9)).toEqual({ start: 7, end: 10 });
});

test("updateOverlay clamps and ignores no-ops/unknown ids", () => {
  const next = updateOverlay(p, "o1", { x: 1.4, y: -1, scale: 99, fontScale: 0.001, rotation: 370, text: "Hi" });
  expect(next.overlays[0]).toMatchObject({ x: 1, y: 0, scale: 5, fontScale: 0.02, rotation: 370, text: "Hi" });
  expect(updateOverlay(p, "o1", { text: "Your text" })).toBe(p);
  expect(updateOverlay(p, "zzz", { text: "x" })).toBe(p);
});

test("updateOverlay keeps end − start ≥ 0.2 and end ≤ totalDuration", () => {
  expect(updateOverlay(p, "o1", { end: 1.05 }).overlays[0]).toMatchObject({ start: 1, end: 1.2 });
  expect(updateOverlay(p, "o1", { end: 50 }).overlays[0].end).toBe(10);
  expect(updateOverlay(p, "o1", { start: 9.95, end: 10 }).overlays[0]).toMatchObject({ start: 9.8, end: 10 });
});

test("moveOverlay keeps duration and clamps; delete/duplicate", () => {
  expect(moveOverlay(p, "o1", 8).overlays[0]).toMatchObject({ start: 7, end: 10 });
  expect(moveOverlay(p, "o1", -5).overlays[0]).toMatchObject({ start: 0, end: 3 });
  expect(moveOverlay(p, "o1", 1)).toBe(p);
  expect(deleteOverlay(p, "o1").overlays).toEqual([]);
  const dup = duplicateOverlay(p, "o1");
  expect(dup.overlays.map((o) => o.id)).toEqual(["o1", "new-id"]);
  expect(dup.overlays[1]).toMatchObject({ start: 1, end: 4 });
  expect(dup.overlays[1].x).toBeCloseTo(0.53);
  expect(dup.overlays[1].y).toBeCloseTo(0.53);
});

test("audio track (deprecated single-track ops): set adds, update clamps the first, remove drops the first", () => {
  const t = makeAudioTrack({ id: "m1", sourceDuration: 30 });
  const withTrack = setAudioTrack(p, t);
  expect(withTrack.audioTracks).toEqual([t]);
  expect(setAudioTrack(withTrack, makeAudioTrack({ id: "m2", sourceDuration: 5 })).audioTracks.map((x) => x.id)).toEqual(["m1", "m2"]);
  const upd = updateAudioTrack(withTrack, { trimStart: 29.8, trimEnd: 99, start: -2, volume: 9 });
  expect(upd.audioTracks[0]).toMatchObject({ trimStart: 29.5, trimEnd: 30, start: 0, volume: 2 });
  expect(updateAudioTrack(p, { volume: 1 })).toBe(p); // no track → no-op
  expect(removeAudioTrack(withTrack).audioTracks).toEqual([]);
  expect(removeAudioTrack(p)).toBe(p);
});

test("clip volume and mute", () => {
  expect(setClipVolume(p, "a", 3).clips[0].volume).toBe(2);
  expect(setClipVolume(p, "a", 1)).toBe(p);
  expect(setClipMuted(p, "a", true).clips[0].muted).toBe(true);
  expect(setClipMuted(p, "a", false)).toBe(p);
});
