jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { AUDIO_LIMITS, BEAT_LIMITS, makeAudioTrack, makeClip, makeEffect, makeOverlay, makePhotoClip, makeProject } from "../types";
import {
  addAudioTrack, addBeatMarker, clearBeatMarkers, deleteAudioTrack, deleteClip, duplicateAudioTrack, duplicateClip, insertFreezeFrame, moveAudioTrack,
  canSplitAudioAt, removeBeatMarkerNear, replaceClipMedia, setClipFade, setDucking, splitAudioTrackAt, splitClipAt, trimClip, updateAudioTrackById,
} from "../ops";
import { fitFades } from "../audioMix";
import { trackEnd } from "../audioSync";
import { migrateProject } from "../migrate";

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
    expect(updateAudioTrackById(faded, "m1", { start: undefined, trimEnd: undefined, volume: undefined })).toBe(faded);
  });

  test("an undefined key beside a real one leaves its value alone", () => {
    expect(updateAudioTrackById(faded, "m1", { fadeIn: undefined, volume: 0.5 }).audioTracks[0]).toEqual({ ...first, volume: 0.5 });
    expect(updateAudioTrackById(faded, "m1", { start: undefined, trimEnd: 10 }).audioTracks[0]).toEqual({ ...first, trimEnd: 10 });
    expect(updateAudioTrackById(faded, "m1", { trimEnd: undefined, trimStart: undefined, start: 5 }).audioTracks[0]).toEqual({ ...first, start: 5 });
    expect(updateAudioTrackById(faded, "m1", { fadeOut: undefined, trimStart: undefined, volume: 2 }).audioTracks[0]).toEqual({ ...first, volume: 2 });
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
    // fades are stored as the user set them, even on a short track: the mix fits them to the length (fitFades)
    expect(track(updateAudioTrackById(p, "s1", { fadeIn: 3, fadeOut: 4 }), "s1")).toMatchObject({ fadeIn: 3, fadeOut: 4 });
  });

  test("trimming never touches the stored fades: a handle dragged in and back out leaves them as they were", () => {
    const long = makeProject({ clips: base.clips, audioTracks: [{ ...music, fadeIn: 5, fadeOut: 3 }, voice] });
    const trimmed = updateAudioTrackById(long, "m1", { trimEnd: 4 });
    expect(trimmed.audioTracks[0]).toEqual({ ...music, trimEnd: 4, fadeIn: 5, fadeOut: 3 });
    expect(trimmed.audioTracks[1]).toBe(voice);
    // every transient frame of the drag, then back to where it began
    let dragged = long;
    for (const trimEnd of [20, 8, 1, 0.2, 6, 30]) dragged = updateAudioTrackById(dragged, "m1", { trimEnd });
    expect(dragged.audioTracks[0]).toEqual(long.audioTracks[0]);
    expect(updateAudioTrackById(long, "m1", { trimStart: 24.5 }).audioTracks[0]).toMatchObject({ fadeIn: 5, fadeOut: 3 });
    expect(updateAudioTrackById(long, "m1", { trimEnd: 30 })).toBe(long);
    expect(updateAudioTrackById(long, "m1", { fadeIn: 5, fadeOut: 3 })).toBe(long);
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

describe("splitAudioTrackAt", () => {
  // On the timeline from 3 to 22 (19 s long), playing the source from 1 to 20.
  const long = { ...music, start: 3, trimStart: 1, trimEnd: 20, fadeIn: 1, fadeOut: 2, volume: 0.8, title: "Song" };
  const q = makeProject({ clips: base.clips, audioTracks: [voice, long, sfx] });
  const full = makeProject({ audioTracks: Array.from({ length: AUDIO_LIMITS.maxTracks }, (_, i) => makeAudioTrack({ id: `t${i}`, sourceDuration: 5 })) });

  test("cuts a trimmed track that starts later: the source time of the cut is trimStart + (time − start)", () => {
    const next = splitAudioTrackAt(q, "m1", 7.5, "n1");   // 4.5 s into the track → source 1 + 4.5 = 5.5
    expect(next.audioTracks.map((t) => t.id)).toEqual(["v1", "m1", "n1", "s1"]);
    expect(next.audioTracks[1]).toEqual({ ...long, trimEnd: 5.5, fadeOut: 0 });
    expect(next.audioTracks[2]).toEqual({ ...long, id: "n1", start: 7.5, trimStart: 5.5, fadeIn: 0 });
    expect(next.updatedAt).toBe("2026-10-01T10:00:00.000Z");
  });

  test("the first piece keeps the fade in, the second the fade out; everything else is the same on both", () => {
    const [, a, b] = splitAudioTrackAt(q, "m1", 7.5, "n1").audioTracks;
    expect([a.fadeIn, a.fadeOut, b.fadeIn, b.fadeOut]).toEqual([1, 0, 0, 2]);
    for (const key of ["sourceUri", "title", "sourceDuration", "volume", "kind"] as const) { expect(a[key]).toBe(long[key]); expect(b[key]).toBe(long[key]); }
  });

  test("the other tracks keep their objects, and the original project is not changed", () => {
    const next = splitAudioTrackAt(q, "m1", 7.5, "n1");
    expect(next.audioTracks[0]).toBe(voice);
    expect(next.audioTracks[3]).toBe(sfx);
    expect(q.audioTracks).toEqual([voice, long, sfx]);
    expect(next.clips).toBe(q.clips);
  });

  test("rounded to 3 decimals, and gapless: the second piece starts exactly where the first ends, in project and in source time", () => {
    for (const [time, cut, start] of [[4.23456, 2.235, 4.235], [7.4996, 5.5, 7.5], [13 / 3, 2.333, 4.333], [21.0004, 19, 21]]) {
      const [, a, b] = splitAudioTrackAt(q, "m1", time, "n1").audioTracks;
      expect([a.trimEnd, b.trimStart, b.start]).toEqual([cut, cut, start]);
      expect(b.trimStart).toBe(a.trimEnd);
      expect(b.start).toBe(Math.round(trackEnd(a) * 1000) / 1000);
      expect(trackEnd(b)).toBeCloseTo(22, 9);
    }
  });

  test("refused when either piece would be under the kind's minimum: 0.5 s for music and voice", () => {
    expect(splitAudioTrackAt(q, "m1", 3.499, "n1")).toBe(q);
    expect(splitAudioTrackAt(q, "m1", 3.5, "n1").audioTracks[1]).toMatchObject({ trimStart: 1, trimEnd: 1.5 });      // 0.5 s is allowed
    expect(splitAudioTrackAt(q, "m1", 21.501, "n1")).toBe(q);
    expect(splitAudioTrackAt(q, "m1", 21.5, "n1").audioTracks[2]).toMatchObject({ start: 21.5, trimStart: 19.5, trimEnd: 20 });
    expect(splitAudioTrackAt(q, "v1", 2.4, "n1")).toBe(q);     // voice: 2 … 8
    expect(splitAudioTrackAt(q, "v1", 7.6, "n1")).toBe(q);
    expect(splitAudioTrackAt(q, "v1", 5, "n1").audioTracks.slice(0, 2)).toEqual([{ ...voice, trimEnd: 3 }, { ...voice, id: "n1", start: 5, trimStart: 3 }]);
  });

  test("a sound effect may be cut into pieces as short as 0.1 s", () => {
    // s1: 4 … 5 on the timeline, source 0 … 1
    expect(splitAudioTrackAt(q, "s1", 4.05, "n1")).toBe(q);
    expect(splitAudioTrackAt(q, "s1", 4.1, "n1").audioTracks.slice(2)).toEqual([{ ...sfx, trimEnd: 0.1 }, { ...sfx, id: "n1", start: 4.1, trimStart: 0.1 }]);
    expect(splitAudioTrackAt(q, "s1", 4.9, "n1").audioTracks.slice(2)).toEqual([{ ...sfx, trimEnd: 0.9 }, { ...sfx, id: "n1", start: 4.9, trimStart: 0.9 }]);
    expect(splitAudioTrackAt(q, "s1", 4.95, "n1")).toBe(q);
    // 0.15 s long: no cut leaves 0.1 s on both sides
    const tiny = makeProject({ audioTracks: [makeAudioTrack({ id: "s2", sourceDuration: 0.15, kind: "sfx" })] });
    for (const time of [0.05, 0.075, 0.1]) expect(splitAudioTrackAt(tiny, "s2", time, "n1")).toBe(tiny);
  });

  test("refused exactly at the start or the end, outside the track, and for a time that is not finite", () => {
    for (const time of [3, 22, 0, 2.9, 22.1, 99, -1, NaN, Infinity, -Infinity]) expect(splitAudioTrackAt(q, "m1", time, "n1")).toBe(q);
  });

  test("refused for an unknown id, at the track limit, and for a new id that is already there", () => {
    expect(splitAudioTrackAt(q, "zzz", 7.5, "n1")).toBe(q);
    expect(splitAudioTrackAt(full, "t0", 2, "n1")).toBe(full);
    expect(splitAudioTrackAt(q, "m1", 7.5, "v1")).toBe(q);
    expect(splitAudioTrackAt(q, "m1", 7.5, "m1")).toBe(q);
  });

  test("fades longer than a piece are stored as they were: the mix fits them to the piece's length", () => {
    const faded = makeProject({ audioTracks: [{ ...music, fadeIn: 5, fadeOut: 3 }] });
    const [a, b] = splitAudioTrackAt(faded, "m1", 2, "n1").audioTracks;     // 2 s, then 28 s
    expect([a.fadeIn, a.fadeOut, b.fadeIn, b.fadeOut]).toEqual([5, 0, 0, 3]);
    expect(fitFades(a.fadeIn, a.fadeOut, a.trimEnd - a.trimStart)).toEqual({ in: 2, out: 0 });
  });

  test("what is stored reloads unchanged, and can be split again", () => {
    const next = splitAudioTrackAt(q, "m1", 4.23456, "n1");
    expect(migrateProject(JSON.parse(JSON.stringify(next)))).toEqual(next);
    const again = splitAudioTrackAt(next, "n1", 10, "n2");
    expect(again.audioTracks.map((t) => [t.id, t.start, t.trimStart, t.trimEnd])).toEqual(
      [["v1", 2, 0, 6], ["m1", 3, 1, 2.235], ["n1", 4.235, 2.235, 8], ["n2", 10, 8, 20], ["s1", 4, 0, 1]]);
    expect(migrateProject(JSON.parse(JSON.stringify(again)))).toEqual(again);
  });
});

describe("canSplitAudioAt", () => {
  const long = { ...music, start: 3, trimStart: 1, trimEnd: 20 };
  const q = makeProject({ clips: base.clips, audioTracks: [voice, long, sfx] });

  test("true where the cut leaves both pieces long enough; false at and past the edges, for no / an unknown id and a broken time", () => {
    const table: [string | null, number, boolean][] = [
      ["m1", 7.5, true], ["m1", 3.5, true], ["m1", 21.5, true], ["m1", 3.499, false], ["m1", 21.501, false], ["m1", 3, false], ["m1", 22, false],
      ["m1", 0, false], ["m1", 30, false], ["m1", NaN, false], ["m1", Infinity, false],
      ["v1", 5, true], ["v1", 2.4, false], ["s1", 4.1, true], ["s1", 4.9, true], ["s1", 4.05, false], ["s1", 4.95, false],
      ["zzz", 7.5, false], [null, 7.5, false],
    ];
    for (const [id, time, want] of table) expect([id, time, canSplitAudioAt(q, id, time)]).toEqual([id, time, want]);
  });

  test("agrees with the op wherever there is room for another track; the track limit is not its business", () => {
    for (const id of ["m1", "v1", "s1"]) {
      for (let time = 0; time <= 23; time += 0.05) expect([id, time, canSplitAudioAt(q, id, time)]).toEqual([id, time, splitAudioTrackAt(q, id, time, "n1") !== q]);
    }
    const full = makeProject({ audioTracks: Array.from({ length: AUDIO_LIMITS.maxTracks }, (_, i) => makeAudioTrack({ id: `t${i}`, sourceDuration: 5 })) });
    expect(canSplitAudioAt(full, "t0", 2)).toBe(true);
    expect(splitAudioTrackAt(full, "t0", 2, "n1")).toBe(full);
  });
});

describe("the single-track ops are gone", () => {
  test("only the id-based ops are exported", () => {
    const ops = jest.requireActual("../ops") as Record<string, unknown>;
    for (const name of ["setAudioTrack", "updateAudioTrack", "removeAudioTrack"]) expect(ops[name]).toBeUndefined();
  });

  test("what they did, by id: add, patch one track (the other keeps its object), delete; no track → same project", () => {
    const two = addAudioTrack(addAudioTrack(base, music), voice);
    expect(two.audioTracks).toEqual([music, voice]);
    const upd = updateAudioTrackById(two, "m1", { trimStart: 29.8, trimEnd: 99, start: -2, volume: 9 });
    expect(upd.audioTracks[0]).toMatchObject({ id: "m1", trimStart: 29.5, trimEnd: 30, start: 0, volume: 2 });
    expect(upd.audioTracks[1]).toBe(two.audioTracks[1]);
    expect(deleteAudioTrack(two, "m1").audioTracks).toEqual([voice]);
    expect(updateAudioTrackById(base, "m1", { volume: 1 })).toBe(base);
    expect(deleteAudioTrack(base, "m1")).toBe(base);
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
