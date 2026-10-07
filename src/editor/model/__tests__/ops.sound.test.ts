jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-07T10:00:00.000Z" }));
import { AUDIO_LIMITS, makeAudioTrack, makeClip, makeLayer, makePhotoClip, makeProject, type Project } from "../types";
import { clipStartTimes, curveSteps } from "../timeline";
import { duplicateAudioTrack, extractClipAudio, extractedTrackOf, extractRefusal, EXTRACT_TITLE, setTrackSound, splitAudioTrackAt, splitClipAt } from "../ops";

const track = (p: Project, id: string) => p.audioTracks.find((t) => t.id === id)!;
const base = makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 10, trimStart: 1, trimEnd: 5 }), makeClip({ id: "b", sourceDuration: 8, trimStart: 2, trimEnd: 6, volume: 1.5, fadeIn: 0.5, fadeOut: 1 }), makePhotoClip({ id: "ph" })],
  layers: [makeLayer({ id: "L", sourceDuration: 6, start: 3, trimStart: 1, trimEnd: 4 })],
  audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 30 })],
});

describe("setTrackSound", () => {
  test("writes the field; a patch is merged into what is there; an unknown track is refused", () => {
    const one = setTrackSound(base, "m", { voice: "deep" });
    expect(track(one, "m").sound).toEqual({ voice: "deep", strength: 0.5, pitch: 0, eq: null, level: false });
    expect(one.updatedAt).toBe("2026-10-07T10:00:00.000Z");
    const two = setTrackSound(one, "m", { strength: 0.8, eq: "warm" });
    expect(track(two, "m").sound).toEqual({ voice: "deep", strength: 0.8, pitch: 0, eq: "warm", level: false });
    expect(setTrackSound(base, "nope", { voice: "deep" })).toBe(base);
    expect(base.audioTracks[0]).not.toHaveProperty("sound");               // the input is not mutated
    expect(one.clips).toBe(base.clips);                                    // nothing else is touched
    expect({ ...track(two, "m"), sound: undefined }).toEqual({ ...base.audioTracks[0], sound: undefined });
  });

  test("values are clamped; a patch that changes nothing returns the same project", () => {
    const p = setTrackSound(base, "m", { voice: "echo", strength: 7, pitch: 40 });
    expect(track(p, "m").sound).toEqual({ voice: "echo", strength: 1, pitch: 12, eq: null, level: false });
    expect(setTrackSound(p, "m", { strength: 1 })).toBe(p);
    expect(setTrackSound(p, "m", {})).toBe(p);
    expect(setTrackSound(base, "m", { strength: 0.9 })).toBe(base);        // strength alone on a track as recorded: still as recorded
    expect(setTrackSound(base, "m", { pitch: NaN })).toBe(base);
  });

  test("back to nothing removes the key (never a neutral object, never undefined)", () => {
    const on = setTrackSound(base, "m", { pitch: 3 });
    const off = setTrackSound(on, "m", { pitch: 0 });
    expect("sound" in track(off, "m")).toBe(false);
    const level = setTrackSound(setTrackSound(base, "m", { level: true }), "m", { level: false });
    expect("sound" in track(level, "m")).toBe(false);
    const none = setTrackSound(setTrackSound(base, "m", { voice: "hall", strength: 0.9 }), "m", { voice: null });
    expect("sound" in track(none, "m")).toBe(false);
  });

  test("a split and a duplicate keep the setting on both", () => {
    const on = setTrackSound(base, "m", { voice: "hall" });
    const cut = splitAudioTrackAt(on, "m", 10, "m2");
    expect(track(cut, "m").sound).toEqual(track(on, "m").sound);
    expect(track(cut, "m2").sound).toEqual(track(on, "m").sound);
    const copy = duplicateAudioTrack(on, "m");
    expect(track(copy, "new-id").sound).toEqual(track(on, "m").sound);
  });
});

describe("extractClipAudio", () => {
  test("a main clip: a sound-effect bar on the same file, at the clip's place and range, with its volume and fades; the clip is muted", () => {
    const p = extractClipAudio(base, "b", "x");
    expect(track(p, "x")).toEqual({ id: "x", sourceUri: "file:///media/b.mp4", title: EXTRACT_TITLE, sourceDuration: 8, start: 4, trimStart: 2, trimEnd: 6, volume: 1.5, kind: "sfx", fadeIn: 0.5, fadeOut: 1 });
    expect("sound" in track(p, "x")).toBe(false);
    expect(p.clips[1].muted).toBe(true);
    expect(p.clips[1]).toEqual({ ...base.clips[1], muted: true });         // only the mute changes on the clip
    expect(p.clips[0]).toBe(base.clips[0]);                                // nothing else is touched
    expect(p.audioTracks[0]).toBe(base.audioTracks[0]);
    expect(p.audioTracks).toHaveLength(2);
    expect(p.layers).toBe(base.layers);
    expect(base.clips[1].muted).toBe(false);
  });

  test("the first clip starts at 0; a layer at its own start", () => {
    expect(track(extractClipAudio(base, "a", "x"), "x")).toMatchObject({ start: 0, trimStart: 1, trimEnd: 5 });
    const p = extractClipAudio(base, "L", "x");
    expect(track(p, "x")).toMatchObject({ sourceUri: "file:///media/L.mp4", start: 3, trimStart: 1, trimEnd: 4, kind: "sfx" });
    expect(p.layers[0].muted).toBe(true);
    expect(p.clips).toBe(base.clips);
  });

  test("an already muted clip is still extracted (it stays muted)", () => {
    const muted = { ...base, clips: [{ ...base.clips[0], muted: true }, base.clips[1], base.clips[2]] };
    const p = extractClipAudio(muted, "a", "x");
    expect(track(p, "x")).toMatchObject({ start: 0, volume: 1 });
    expect(p.clips[0].muted).toBe(true);
    expect(p.clips).toBe(muted.clips);
  });

  test("refusals: a photo, a reversed clip, a clip that is not at normal speed, the track limit, an id in use, an unknown clip", () => {
    expect(extractRefusal(base, "ph")).toBe("noSound");
    expect(extractRefusal(base, "nope")).toBe("noSound");
    const reversed = { ...base, clips: [{ ...base.clips[0], reversed: true }, base.clips[1], base.clips[2]] };
    expect(extractRefusal(reversed, "a")).toBe("noSound");
    const fast = { ...base, clips: [{ ...base.clips[0], speed: 2 }, base.clips[1], base.clips[2]] };
    expect(extractRefusal(fast, "a")).toBe("speed");
    const slow = { ...base, clips: [{ ...base.clips[0], speed: 0.5 }, base.clips[1], base.clips[2]] };
    expect(extractRefusal(slow, "a")).toBe("speed");
    const curved = { ...base, clips: [{ ...base.clips[0], speedCurve: { id: "hero" as const, steps: curveSteps("hero", 1, 5) } }, base.clips[1], base.clips[2]] };
    expect(extractRefusal(curved, "a")).toBe("speed");
    const fastLayer = { ...base, layers: [{ ...base.layers[0], speed: 2 }] };
    expect(extractRefusal(fastLayer, "L")).toBe("speed");
    const full = { ...base, audioTracks: Array.from({ length: AUDIO_LIMITS.maxTracks }, (_, i) => makeAudioTrack({ id: `t${i}`, sourceDuration: 5 })) };
    expect(extractRefusal(full, "a")).toBe("limit");
    const oneLeft = { ...full, audioTracks: full.audioTracks.slice(1) };   // 11 tracks: the twelfth is allowed
    expect(extractRefusal(oneLeft, "a")).toBeNull();
    expect(extractClipAudio(oneLeft, "a", "x").audioTracks).toHaveLength(AUDIO_LIMITS.maxTracks);
    expect(extractRefusal(base, "a")).toBeNull();
    for (const [p, id] of [[base, "ph"], [reversed, "a"], [fast, "a"], [slow, "a"], [curved, "a"], [fastLayer, "L"], [full, "a"], [base, "nope"]] as const) expect(extractClipAudio(p, id, "x")).toBe(p);
    expect(extractClipAudio(base, "a", "m")).toBe(base);                   // the id is a track's already
  });

  test("twice: the bar that holds the clip's sound is found, and a second one is not made", () => {
    const once = extractClipAudio(base, "a", "x");
    expect(extractedTrackOf(base, "a")).toBeNull();
    expect(extractedTrackOf(once, "a")?.id).toBe("x");
    expect(extractClipAudio(once, "a", "y")).toBe(once);
    // Another clip of the same file whose range does not overlap is its own sound.
    const twoPieces = { ...once, clips: [once.clips[0], { ...once.clips[1], sourceUri: once.clips[0].sourceUri, trimStart: 5, trimEnd: 9 }, once.clips[2]] };
    expect(extractedTrackOf(twoPieces, "b")).toBeNull();
    expect(extractedTrackOf(once, "ph")).toBeNull();
  });

  test("the two halves of a split clip are two sounds, wherever the cut falls (a bar's trims are stored to the millisecond, a clip's are not)", () => {
    // Cut at 1.2344 s of the project: the left half ends at source 2.2344, and its bar is stored ending at 2.234 / 2.235.
    for (const at of [1.2344, 1.2346]) {
      const cut = splitClipAt(base, at);
      const left = extractClipAudio(cut, "a", "x");
      expect(extractedTrackOf(left, "a")?.id).toBe("x");
      expect(extractedTrackOf(left, "new-id")).toBeNull();
      const both = extractClipAudio(left, "new-id", "y");
      expect(both.audioTracks.map((t) => t.id)).toEqual(["m", "x", "y"]);
      expect(extractedTrackOf(both, "a")?.id).toBe("x");
      expect(extractedTrackOf(both, "new-id")?.id).toBe("y");
      // The right half's bar starts where the right half does, to the millisecond.
      expect(track(both, "y").start).toBeCloseTo(clipStartTimes(cut)[1], 3);
      expect(track(both, "y").trimStart).toBeCloseTo(cut.clips[1].trimStart, 3);
      expect(track(both, "y").trimEnd).toBe(5);
    }
  });
});
