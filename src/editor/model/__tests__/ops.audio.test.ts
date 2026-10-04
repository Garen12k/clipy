jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { AUDIO_LIMITS, BEAT_LIMITS, makeAudioTrack, makeClip, makeEffect, makeOverlay, makePhotoClip, makeProject } from "../types";
import {
  addAudioTrack, addBeatMarker, clearBeatMarkers, deleteAudioTrack, deleteClip, duplicateAudioTrack, duplicateClip, insertFreezeFrame, moveAudioTrack,
  removeAudioTrack, removeBeatMarkerNear, replaceClipMedia, setAudioTrack, setClipFade, setDucking, splitClipAt, trimClip, updateAudioTrack, updateAudioTrackById,
} from "../ops";

const music = makeAudioTrack({ id: "m1", sourceDuration: 30 });
const voice = makeAudioTrack({ id: "v1", sourceDuration: 6, kind: "voice", start: 2 });
const sfx = makeAudioTrack({ id: "s1", sourceDuration: 1, kind: "sfx", start: 4 });
const base = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] });
const p = makeProject({ clips: base.clips, audioTracks: [music, voice, sfx] });
const track = (x: typeof p, id: string) => x.audioTracks.find((t) => t.id === id)!;

describe("addAudioTrack", () => {
  test("appends, keeping the others", () => {
    const next = addAudioTrack(addAudioTrack(base, music), voice);
    expect(next.audioTracks).toEqual([music, voice]);
    expect(next.updatedAt).toBe("2026-10-01T10:00:00.000Z");
  });

  test("refused at maxTracks and for an id already there", () => {
    const full = makeProject({ audioTracks: Array.from({ length: AUDIO_LIMITS.maxTracks }, (_, i) => makeAudioTrack({ id: `t${i}`, sourceDuration: 5 })) });
    expect(addAudioTrack(full, music)).toBe(full);
    expect(addAudioTrack(p, music)).toBe(p);
  });

  test("validates what it stores: non-finite start / trims / volume refused; fades clamped; unknown kind → music", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      for (const key of ["start", "trimStart", "trimEnd", "volume"] as const) {
        expect(addAudioTrack(base, { ...music, [key]: bad })).toBe(base);
      }
    }
    const odd = { ...music, fadeIn: 9, fadeOut: NaN, kind: "podcast" } as unknown as typeof music;
    expect(addAudioTrack(base, odd).audioTracks).toEqual([{ ...music, fadeIn: 5, fadeOut: 0, kind: "music" }]);
    expect(addAudioTrack(base, { ...sfx, fadeIn: -1 }).audioTracks[0]).toEqual({ ...sfx, fadeIn: 0 });
  });
});

describe("a patch key explicitly set to undefined is ignored", () => {
  const faded = makeProject({ clips: base.clips, audioTracks: [{ ...music, start: 3, trimStart: 1, trimEnd: 20, fadeIn: 1, fadeOut: 2 }] });
  const first = faded.audioTracks[0];

  test("only undefined keys → same project", () => {
    expect(updateAudioTrackById(faded, "m1", { start: undefined })).toBe(faded);
    expect(updateAudioTrackById(faded, "m1", { trimStart: undefined, trimEnd: undefined })).toBe(faded);
    expect(updateAudioTrackById(faded, "m1", { volume: undefined, fadeIn: undefined, fadeOut: undefined })).toBe(faded);
    expect(updateAudioTrack(faded, { start: undefined, title: undefined, kind: undefined })).toBe(faded);
  });

  test("an undefined key beside a real one leaves its value alone", () => {
    expect(updateAudioTrackById(faded, "m1", { fadeIn: undefined, volume: 0.5 }).audioTracks[0]).toEqual({ ...first, volume: 0.5 });
    expect(updateAudioTrackById(faded, "m1", { start: undefined, trimEnd: 10 }).audioTracks[0]).toEqual({ ...first, trimEnd: 10 });
    expect(updateAudioTrackById(faded, "m1", { trimEnd: undefined, trimStart: undefined, start: 5 }).audioTracks[0]).toEqual({ ...first, start: 5 });
    expect(updateAudioTrack(faded, { fadeOut: undefined, kind: undefined, volume: 2 }).audioTracks[0]).toEqual({ ...first, volume: 2 });
  });
});

describe("updateAudioTrackById", () => {
  test("patches only the named track; the others keep their objects", () => {
    const next = updateAudioTrackById(p, "v1", { volume: 0.5 });
    expect(track(next, "v1")).toEqual({ ...voice, volume: 0.5 });
    expect(next.audioTracks[0]).toBe(music);
    expect(next.audioTracks[2]).toBe(sfx);
  });

  test("trim is clamped to the source and keeps the per-kind minimum", () => {
    expect(updateAudioTrackById(p, "m1", { trimStart: 29.8, trimEnd: 99 }).audioTracks[0]).toMatchObject({ trimStart: 29.5, trimEnd: 30 });
    expect(track(updateAudioTrackById(p, "m1", { trimEnd: 0.2 }), "m1")).toMatchObject({ trimStart: 0, trimEnd: 0.5 });
    expect(track(updateAudioTrackById(p, "m1", { trimStart: -4 }), "m1").trimStart).toBe(0);
    // a sound effect may be as short as 0.1 s
    expect(track(updateAudioTrackById(p, "s1", { trimEnd: 0.02 }), "s1")).toMatchObject({ trimStart: 0, trimEnd: 0.1 });
    expect(track(updateAudioTrackById(p, "s1", { trimStart: 0.95 }), "s1")).toMatchObject({ trimStart: 0.9, trimEnd: 1 });
    expect(track(updateAudioTrackById(p, "v1", { trimEnd: 0.2 }), "v1").trimEnd).toBe(0.5);
  });

  test("start ≥ 0, volume and fades clamped", () => {
    const next = updateAudioTrackById(p, "m1", { start: -2, volume: 9, fadeIn: 7, fadeOut: -1 });
    expect(next.audioTracks[0]).toMatchObject({ start: 0, volume: 2, fadeIn: 5, fadeOut: 0 });
    expect(updateAudioTrackById(p, "m1", { start: 1.23456 }).audioTracks[0].start).toBe(1.235);
    // storage keeps the user's fades even when they do not fit the length (audioMix fits them)
    expect(track(updateAudioTrackById(p, "s1", { fadeIn: 3, fadeOut: 4 }), "s1")).toMatchObject({ fadeIn: 3, fadeOut: 4 });
  });

  test("unknown id, no change and non-finite values return the same project", () => {
    expect(updateAudioTrackById(p, "zzz", { volume: 0.5 })).toBe(p);
    expect(updateAudioTrackById(p, "m1", { volume: 1 })).toBe(p);
    expect(updateAudioTrackById(p, "m1", {})).toBe(p);
    for (const bad of [NaN, Infinity, -Infinity]) {
      for (const key of ["start", "trimStart", "trimEnd", "volume", "fadeIn", "fadeOut"] as const) {
        expect(updateAudioTrackById(p, "m1", { [key]: bad })).toBe(p);
      }
    }
  });
});

describe("moveAudioTrack", () => {
  test("moves the start, never below 0, and may run past the project's end", () => {
    expect(track(moveAudioTrack(p, "v1", 5.0004), "v1")).toMatchObject({ start: 5, trimStart: 0, trimEnd: 6 });
    expect(track(moveAudioTrack(p, "v1", -3), "v1").start).toBe(0);
    expect(track(moveAudioTrack(p, "m1", 25), "m1").start).toBe(25);   // 10 s project, 30 s track
  });

  test("identity returns", () => {
    expect(moveAudioTrack(p, "v1", 2)).toBe(p);
    expect(moveAudioTrack(p, "zzz", 2)).toBe(p);
    expect(moveAudioTrack(p, "v1", NaN)).toBe(p);
    expect(moveAudioTrack(p, "v1", Infinity)).toBe(p);
  });
});

describe("deleteAudioTrack / duplicateAudioTrack", () => {
  test("delete removes only that track", () => {
    expect(deleteAudioTrack(p, "v1").audioTracks).toEqual([music, sfx]);
    expect(deleteAudioTrack(p, "zzz")).toBe(p);
  });

  test("the copy has a new id, starts where the original ends and sits right after it", () => {
    const trimmed = updateAudioTrackById(p, "v1", { trimStart: 1, trimEnd: 4, fadeIn: 0.5, volume: 1.5 });
    const next = duplicateAudioTrack(trimmed, "v1");
    expect(next.audioTracks.map((t) => t.id)).toEqual(["m1", "v1", "new-id", "s1"]);
    expect(next.audioTracks[2]).toEqual({ ...track(trimmed, "v1"), id: "new-id", start: 5 });
  });

  test("refused for an unknown id and at maxTracks", () => {
    expect(duplicateAudioTrack(p, "zzz")).toBe(p);
    const full = makeProject({ audioTracks: Array.from({ length: AUDIO_LIMITS.maxTracks }, (_, i) => makeAudioTrack({ id: `t${i}`, sourceDuration: 5 })) });
    expect(duplicateAudioTrack(full, "t0")).toBe(full);
  });
});

describe("deprecated single-track ops", () => {
  test("setAudioTrack adds; updateAudioTrack / removeAudioTrack act on the first track", () => {
    const two = setAudioTrack(setAudioTrack(base, music), voice);
    expect(two.audioTracks).toEqual([music, voice]);
    const upd = updateAudioTrack(two, { trimStart: 29.8, trimEnd: 99, start: -2, volume: 9 });
    expect(upd.audioTracks[0]).toMatchObject({ id: "m1", trimStart: 29.5, trimEnd: 30, start: 0, volume: 2 });
    expect(upd.audioTracks[1]).toBe(two.audioTracks[1]);   // the other track keeps its object
    expect(removeAudioTrack(two).audioTracks).toEqual([voice]);
    expect(updateAudioTrack(base, { volume: 1 })).toBe(base);
    expect(removeAudioTrack(base)).toBe(base);
  });
});

describe("setClipFade", () => {
  test("sets one or both, clamped to AUDIO_LIMITS.fade", () => {
    expect(setClipFade(p, "a", { fadeIn: 1.5 }).clips[0]).toMatchObject({ fadeIn: 1.5, fadeOut: 0 });
    expect(setClipFade(p, "a", { fadeIn: 9, fadeOut: -2 }).clips[0]).toMatchObject({ fadeIn: 5, fadeOut: 0 });
    expect(setClipFade(p, "a", { fadeOut: 2 }).clips[0]).toMatchObject({ fadeIn: 0, fadeOut: 2 });
  });

  test("photos, unknown clips, no change and non-finite values are refused", () => {
    const withPhoto = makeProject({ clips: [makePhotoClip({ id: "ph" })] });
    expect(setClipFade(withPhoto, "ph", { fadeIn: 1 })).toBe(withPhoto);
    expect(setClipFade(p, "zzz", { fadeIn: 1 })).toBe(p);
    expect(setClipFade(p, "a", { fadeIn: 0 })).toBe(p);
    expect(setClipFade(p, "a", {})).toBe(p);
    expect(setClipFade(p, "a", { fadeIn: NaN })).toBe(p);
    expect(setClipFade(p, "a", { fadeIn: 1, fadeOut: Infinity })).toBe(p);
  });
});

describe("clip fades through clip edits", () => {
  const faded = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10, fadeIn: 1, fadeOut: 2 })] });
  const fades = (x: typeof p) => x.clips.map((c) => [c.fadeIn, c.fadeOut]);

  test("split: the left half keeps the fade in, the right half the fade out", () => {
    expect(fades(splitClipAt(faded, 4))).toEqual([[1, 0], [0, 2]]);
  });

  test("duplicate copies both", () => {
    expect(fades(duplicateClip(faded, "a"))).toEqual([[1, 2], [1, 2]]);
  });

  test("a freeze frame has none", () => {
    const next = insertFreezeFrame(faded, 4, { id: "still", sourceUri: "file:///still.jpg", width: 1080, height: 1920 });
    expect(next.clips.map((c) => c.kind)).toEqual(["video", "photo", "video"]);
    expect(fades(next)).toEqual([[1, 0], [0, 0], [0, 2]]);
  });

  test("replace keeps them for a video and clears them for a photo", () => {
    const video = replaceClipMedia(faded, "a", { sourceUri: "file:///new.mp4", sourceDuration: 8, width: 1080, height: 1920, kind: "video" });
    expect(fades(video)).toEqual([[1, 2]]);
    const photo = replaceClipMedia(faded, "a", { sourceUri: "file:///new.jpg", sourceDuration: 0, width: 1080, height: 1920, kind: "photo" });
    expect(fades(photo)).toEqual([[0, 0]]);
  });
});

describe("setDucking", () => {
  test("toggles; same value → same project", () => {
    expect(setDucking(p, true).ducking).toBe(true);
    expect(setDucking(p, false)).toBe(p);
    expect(setDucking(setDucking(p, true), false).ducking).toBe(false);
  });
});

describe("beat markers", () => {
  test("added sorted, rounded to 3 decimals, clamped to the project", () => {
    let x = addBeatMarker(p, 4);
    x = addBeatMarker(x, 1.23456);
    x = addBeatMarker(x, 99);
    x = addBeatMarker(x, -3);
    expect(x.beatMarkers).toEqual([0, 1.235, 4, 10]);
  });

  test("refused within minGap of an existing marker, for a non-finite time and at max", () => {
    const one = addBeatMarker(p, 2);
    expect(addBeatMarker(one, 2)).toBe(one);
    expect(addBeatMarker(one, 2.04)).toBe(one);
    expect(addBeatMarker(one, 1.96)).toBe(one);
    expect(addBeatMarker(one, 2.05).beatMarkers).toEqual([2, 2.05]);   // exactly minGap away is allowed
    expect(addBeatMarker(one, 1.95).beatMarkers).toEqual([1.95, 2]);
    expect(addBeatMarker(p, NaN)).toBe(p);
    expect(addBeatMarker(p, Infinity)).toBe(p);
    const long = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 100 })], beatMarkers: Array.from({ length: BEAT_LIMITS.max }, (_, i) => i * 0.1) });
    expect(addBeatMarker(long, 50.05)).toBe(long);
  });

  test("a project with no clips (length 0) takes no marker", () => {
    const empty = makeProject({ audioTracks: [music] });
    expect(addBeatMarker(empty, 0)).toBe(empty);
    expect(addBeatMarker(empty, 3)).toBe(empty);
  });

  test("removeBeatMarkerNear removes the nearest marker within 0.25 s", () => {
    const x = makeProject({ clips: p.clips, beatMarkers: [1, 1.3, 4] });
    expect(removeBeatMarkerNear(x, 1.2).beatMarkers).toEqual([1, 4]);
    expect(removeBeatMarkerNear(x, 1.1).beatMarkers).toEqual([1.3, 4]);
    expect(removeBeatMarkerNear(x, 4.25).beatMarkers).toEqual([1, 1.3]);
    expect(removeBeatMarkerNear(x, 4.3)).toBe(x);
    expect(removeBeatMarkerNear(x, NaN)).toBe(x);
    expect(removeBeatMarkerNear(p, 1)).toBe(p);
  });

  test("clearBeatMarkers", () => {
    const x = makeProject({ beatMarkers: [1, 2] });
    expect(clearBeatMarkers(x).beatMarkers).toEqual([]);
    expect(clearBeatMarkers(p)).toBe(p);
  });
});

test("clip edits do not move or drop audio tracks or beat markers", () => {
  const x = makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 6 })],
    overlays: [makeOverlay({ id: "o1", start: 0, end: 2 })], effects: [makeEffect({ id: "e1", start: 0, end: 2 })],
    audioTracks: [music, makeAudioTrack({ id: "late", sourceDuration: 2, kind: "sfx", start: 9 })], beatMarkers: [1, 8, 9.5],
  });
  for (const next of [trimClip(x, "b", 0, 1), deleteClip(x, "b"), splitClipAt(x, 2), duplicateClip(x, "a")]) {
    expect(next).not.toBe(x);
    expect(next.audioTracks).toBe(x.audioTracks);
    expect(next.beatMarkers).toBe(x.beatMarkers);
  }
});
