jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-06T12:00:00.000Z" }));
import { BEAT_CUT, BEAT_EVERY, DEFAULT_BEAT_DENSITY, beatCutState, beatTimesFor, beatTrack, beatsLeftOut, cutToBeats, placeBeats } from "../beats";
import { migrateProject } from "../migrate";
import { clipDuration, clipStartTimes, totalDuration } from "../timeline";
import { BEAT_LIMITS, makeAudioTrack, makeClip, makeEffect, makeKeyframe, makeOverlay, makePhotoClip, makeProject, type Project } from "../types";

const photo = (id: string, seconds: number) => makePhotoClip({ id, seconds });
const video = (id: string, sourceDuration: number, extra: Parameters<typeof makeClip>[0] | object = {}) => makeClip({ id, sourceDuration, ...extra });
/** Project times of every cut (the end of every clip but the last). */
const cuts = (p: Project) => clipStartTimes(p).slice(1);
const lengths = (p: Project) => p.clips.map((c) => Math.round(clipDuration(c) * 1e6) / 1e6);

test("the constants: Fewer / More is every 4th, 2nd, every beat; the slider rests in the middle; a cut clip keeps half a second", () => {
  expect(BEAT_EVERY).toEqual([4, 2, 1]);
  expect(DEFAULT_BEAT_DENSITY).toBe(1);
  expect(BEAT_CUT).toEqual({ minClip: 0.5, reach: 0.001 });
});

describe("beatTimesFor", () => {
  const beats = [0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75];   // 120 bpm, first beat at 0.25 s of the file

  test("a track at the start of the project: its beats as they are", () => {
    expect(beatTimesFor(makeAudioTrack({ id: "m", sourceDuration: 4 }), beats, 1, 10)).toEqual(beats);
  });
  test("a track that starts later and is trimmed: source time goes through start and trimStart; only the beats it plays", () => {
    const t = makeAudioTrack({ id: "m", sourceDuration: 4, start: 2, trimStart: 1, trimEnd: 3 });
    // 1.25 -> 2 + 0.25, 1.75 -> 2.75, 2.25 -> 3.25, 2.75 -> 3.75; 0.25 / 0.75 are trimmed off, 3.25 / 3.75 too
    expect(beatTimesFor(t, beats, 1, 10)).toEqual([2.25, 2.75, 3.25, 3.75]);
  });
  test("every 2nd / 4th beat is counted from the FILE's first beat, whatever the trim", () => {
    const whole = makeAudioTrack({ id: "m", sourceDuration: 4 });
    expect(beatTimesFor(whole, beats, 2, 10)).toEqual([0.25, 1.25, 2.25, 3.25]);
    expect(beatTimesFor(whole, beats, 4, 10)).toEqual([0.25, 2.25]);
    const trimmed = makeAudioTrack({ id: "m", sourceDuration: 4, trimStart: 1 });
    expect(beatTimesFor(trimmed, beats, 2, 10)).toEqual([0.25, 1.25, 2.25]);   // file beats 1.25, 2.25, 3.25 — the same ones
  });
  test("beats past the project's end are left out; a beat exactly at trimEnd is not played; junk steps count as 1", () => {
    const whole = makeAudioTrack({ id: "m", sourceDuration: 4 });
    expect(beatTimesFor(whole, beats, 1, 1.5)).toEqual([0.25, 0.75, 1.25]);
    expect(beatTimesFor(makeAudioTrack({ id: "m", sourceDuration: 4, trimEnd: 1.25 }), beats, 1, 10)).toEqual([0.25, 0.75]);
    expect(beatTimesFor(whole, beats, 0, 10)).toEqual(beats);
    expect(beatTimesFor(whole, beats, 1.5, 10)).toEqual(beats);
    expect(beatTimesFor(whole, [0.1234567, NaN, 0.5], 1, 10)).toEqual([0.123, 0.5]);
  });
});

describe("placeBeats", () => {
  const beats = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
  const base = (extra: Partial<Project> = {}) => makeProject({
    clips: [video("a", 10)], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 4, start: 2 })], ...extra });

  test("markers are written from the track's beats, in project time", () => {
    const p = placeBeats(base(), "m", beats, 1);
    expect(p.beatMarkers).toEqual([2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]);
    expect(p.updatedAt).toBe("2026-10-06T12:00:00.000Z");
  });
  test("markers inside the track's stretch are replaced; markers before and after it stay", () => {
    const p = placeBeats(base({ beatMarkers: [0.7, 2.2, 4.1, 6, 8.3] }), "m", beats, 2);
    expect(p.beatMarkers).toEqual([0.7, 2, 3, 4, 5, 8.3]);   // 2.2, 4.1 and 6 (the track's own end) were inside [2, 6]
  });
  test("a second run with another density replaces the first run's markers", () => {
    const every = placeBeats(base(), "m", beats, 1);
    expect(placeBeats(every, "m", beats, 4).beatMarkers).toEqual([2, 4]);
  });
  test("the same project (no undo step) when nothing changes, for an unknown track and for a project with no length", () => {
    const once = placeBeats(base(), "m", beats, 1);
    expect(placeBeats(once, "m", beats, 1)).toBe(once);
    expect(placeBeats(base(), "nope", beats, 1).beatMarkers).toEqual([]);
    const empty = makeProject({ audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 4 })] });
    expect(placeBeats(empty, "m", beats, 1)).toBe(empty);
  });
  test("what is stored reloads unchanged: sorted, at least the minimum gap apart, at most 300", () => {
    const dense = Array.from({ length: 400 }, (_, i) => i * 0.02);   // 20 ms apart: closer than the 50 ms gap
    const long = makeProject({ clips: [video("a", 60)], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 60 })] });
    const p = placeBeats(long, "m", dense, 1);
    expect(p.beatMarkers.length).toBeLessThanOrEqual(BEAT_LIMITS.max);
    for (let i = 1; i < p.beatMarkers.length; i++) expect(p.beatMarkers[i] - p.beatMarkers[i - 1]).toBeGreaterThanOrEqual(BEAT_LIMITS.minGap - 1e-9);
  });
  test("nothing but the markers changes", () => {
    const before = base({ overlays: [makeOverlay({ id: "o" })] });
    const p = placeBeats(before, "m", beats, 1);
    expect({ ...p, beatMarkers: [], updatedAt: before.updatedAt }).toEqual(before);
    expect(p.clips).toBe(before.clips);
    expect(p.audioTracks).toBe(before.audioTracks);
  });
});

describe("placeBeats — the 300-marker limit never costs a marker outside the music's stretch", () => {
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  /** 203 beats, 143.94 bpm from 0.03 s: the longest bundled grid (The Field of Dreams). */
  const grid = Array.from({ length: 203 }, (_, k) => r3(0.03 + k * 0.4169));
  const song = (id: string, start: number) => makeAudioTrack({ id, sourceDuration: 84.64, start });
  const valid = (markers: number[]) => {
    expect(markers.length).toBeLessThanOrEqual(BEAT_LIMITS.max);
    for (let i = 1; i < markers.length; i++) expect(markers[i] - markers[i - 1]).toBeGreaterThanOrEqual(BEAT_LIMITS.minGap - 1e-9);
  };

  test("150 markers tapped after the music + every beat of a 203-beat track: all 150 stay, the first 150 beats are placed, 53 are left out", () => {
    const tapped = Array.from({ length: 150 }, (_, i) => r3(90 + i * 0.1));
    const before = makeProject({ clips: [video("a", 120)], audioTracks: [song("m", 0)], beatMarkers: tapped });
    const p = placeBeats(before, "m", grid, 1);
    expect(p.beatMarkers.filter((m) => m >= 90)).toEqual(tapped);
    expect(p.beatMarkers.filter((m) => m < 90)).toEqual(grid.slice(0, 150));
    expect(p.beatMarkers).toHaveLength(BEAT_LIMITS.max);
    valid(p.beatMarkers);
    expect(beatsLeftOut(before, "m", grid, 1)).toBe(53);
    expect(beatsLeftOut(p, "m", grid, 1)).toBe(53);                // the same answer before and after the Find
    expect(placeBeats(p, "m", grid, 1)).toBe(p);                   // nothing changes: the same project
    expect(migrateProject(JSON.parse(JSON.stringify(p))).beatMarkers).toEqual(p.beatMarkers);
  });
  test("two songs: the one found first keeps every beat, whichever comes first on the timeline; the second gets its first 97 and 106 are left out", () => {
    const two = makeProject({ clips: [video("a", 180)], audioTracks: [song("a", 0), song("b", 90)] });
    const late = grid.map((b) => r3(90 + b));
    const bFirst = placeBeats(two, "b", grid, 1);
    expect(bFirst.beatMarkers).toEqual(late);
    const thenA = placeBeats(bFirst, "a", grid, 1);
    expect(thenA.beatMarkers.filter((m) => m >= 90)).toEqual(late);
    expect(thenA.beatMarkers.filter((m) => m < 90)).toEqual(grid.slice(0, 97));
    expect(beatsLeftOut(bFirst, "a", grid, 1)).toBe(106);
    valid(thenA.beatMarkers);
    const aFirst = placeBeats(two, "a", grid, 1);
    const thenB = placeBeats(aFirst, "b", grid, 1);
    expect(thenB.beatMarkers.filter((m) => m < 90)).toEqual(grid);
    expect(thenB.beatMarkers.filter((m) => m >= 90)).toEqual(late.slice(0, 97));
    expect(beatsLeftOut(aFirst, "b", grid, 1)).toBe(106);
    valid(thenB.beatMarkers);
  });
  test("the phase is stable under the limit: fewer beats are still beats of the every-beat grid, taken from the start in order", () => {
    const tapped = Array.from({ length: 250 }, (_, i) => r3(90 + i * 0.1));
    const before = makeProject({ clips: [video("a", 120)], audioTracks: [song("m", 0)], beatMarkers: tapped });
    const p = placeBeats(before, "m", grid, 2);
    expect(p.beatMarkers.filter((m) => m < 90)).toEqual(grid.filter((_, i) => i % 2 === 0).slice(0, 50));
    expect(p.beatMarkers.filter((m) => m >= 90)).toEqual(tapped);
    expect(beatsLeftOut(before, "m", grid, 2)).toBe(102 - 50);
    expect(beatsLeftOut(before, "m", grid, 4)).toBe(51 - 50);
  });
  test("a marker just outside the stretch wins over a beat closer to it than the minimum gap (which is not counted as left out)", () => {
    const before = makeProject({ clips: [video("a", 10)], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 4, start: 2 })], beatMarkers: [1.98, 6.02] });
    const p = placeBeats(before, "m", [0, 1, 2, 3.99], 1);         // the beats at 2 and 5.99 of the project sit 20 / 30 ms from the tapped ones
    expect(p.beatMarkers).toEqual([1.98, 3, 4, 6.02]);
    expect(beatsLeftOut(before, "m", [0, 1, 2, 3.99], 1)).toBe(0);
  });
  test("beatsLeftOut is 0 when everything fits, for an unknown track and for a project with no length; with no room nothing is placed and nothing lost", () => {
    const p = makeProject({ clips: [video("a", 120)], audioTracks: [song("m", 0)] });
    expect(beatsLeftOut(p, "m", grid, 1)).toBe(0);
    expect(beatsLeftOut(p, "nope", grid, 1)).toBe(0);
    expect(beatsLeftOut(makeProject({ audioTracks: [song("m", 0)] }), "m", grid, 1)).toBe(0);
    const full = makeProject({ clips: [video("a", 120)], audioTracks: [song("m", 0)], beatMarkers: Array.from({ length: 300 }, (_, i) => r3(86 + i * 0.1)) });
    expect(placeBeats(full, "m", grid, 1)).toBe(full);
    expect(beatsLeftOut(full, "m", grid, 1)).toBe(203);
  });
});

describe("cutToBeats — the worked vectors of the spec", () => {
  test("V1: a photo already on a beat stays; a video is shortened to the latest beat it reaches; the last clip is not touched", () => {
    const p = makeProject({ beatMarkers: [1, 2, 3, 4, 5, 6, 7, 8], clips: [photo("a", 3), video("b", 2.6), photo("c", 3), video("d", 4)] });
    const out = cutToBeats(p);
    expect(lengths(out)).toEqual([3, 2, 3, 4]);
    expect(cuts(out)).toEqual([3, 5, 8]);
    expect(out.clips[0]).toBe(p.clips[0]);                       // untouched clips keep their identity
    expect(out.clips[2]).toBe(p.clips[2]);
    expect(out.clips[3]).toBe(p.clips[3]);
    expect(out.clips[1]).toMatchObject({ trimStart: 0, trimEnd: 2 });
    expect(out.clips.map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
  });
  test("V2: a sped-up video — the length is output time, the trim is source time (timeline.ts does the sum)", () => {
    const p = makeProject({ beatMarkers: [0.8, 1.7, 4.4], clips: [video("a", 10, { speed: 2 }), photo("z", 3)] });
    const out = cutToBeats(p);
    expect(lengths(out)).toEqual([4.4, 3]);
    expect(out.clips[0].trimEnd).toBeCloseTo(8.8, 9);
    expect(out.clips[0].speed).toBe(2);
  });
  test("V3: a clip no beat can reach is left as it is, and the next one is measured from where it really ends", () => {
    const p = makeProject({ beatMarkers: [1, 2], clips: [photo("a", 0.8), photo("b", 3), photo("z", 3)] });
    const out = cutToBeats(p);
    expect(lengths(out)).toEqual([0.8, 1.2, 3]);
    expect(cuts(out)).toEqual([0.8, 2]);
    expect(out.clips[0]).toBe(p.clips[0]);
  });
  test("V4: a reversed video loses what it plays last — its source head", () => {
    const p = makeProject({ beatMarkers: [4], clips: [video("a", 8, { trimStart: 1, trimEnd: 7, reversed: true }), photo("z", 3)] });
    const out = cutToBeats(p);
    expect(out.clips[0]).toMatchObject({ trimStart: 3, trimEnd: 7, reversed: true });
    expect(lengths(out)).toEqual([4, 3]);
  });
  test("V5: never shorter than half a second — a beat at 0.3 s does not cut a clip that starts at 0", () => {
    const p = makeProject({ beatMarkers: [0.3, 3.2], clips: [photo("a", 3), photo("z", 3)] });
    expect(cutToBeats(p)).toBe(p);
    const at = makeProject({ beatMarkers: [0.5], clips: [photo("a", 3), photo("z", 3)] });
    expect(lengths(cutToBeats(at))).toEqual([0.5, 3]);           // exactly the minimum is allowed
  });
  test("V6: a speed curve keeps its steps; the cut still lands on the beat", () => {
    const steps = [{ from: 0, speed: 2 }, { from: 4, speed: 1 }];   // 4 s of source at 2x = 2 s, then 1x
    const p = makeProject({ beatMarkers: [3], clips: [video("a", 8, { speedCurve: { id: "montage", steps } }), photo("z", 3)] });
    expect(lengths(p)).toEqual([6, 3]);
    const out = cutToBeats(p);
    expect(lengths(out)).toEqual([3, 3]);                        // 2 s for the first 4 source seconds + 1 s at 1x
    expect(out.clips[0].trimEnd).toBeCloseTo(5, 9);
    expect(out.clips[0].speedCurve).toEqual({ id: "montage", steps });
  });
  test("V7: with lastToo the last clip ends on a beat as well (Quick edit)", () => {
    const p = makeProject({ beatMarkers: [2, 4, 6], clips: [photo("a", 2.5), photo("b", 2.5)] });
    expect(lengths(cutToBeats(p))).toEqual([2, 2.5]);
    expect(lengths(cutToBeats(p, true))).toEqual([2, 2]);
  });
});

describe("cutToBeats — the minimum is exact, and what is stored reloads unchanged", () => {
  const reloaded = (p: Project) => migrateProject(JSON.parse(JSON.stringify(p)));

  test("a marker one millisecond under the minimum is not used (the loader would stretch that photo back to 0.5 s)", () => {
    const p = makeProject({ beatMarkers: [0.499], clips: [photo("a", 3), photo("z", 3)] });
    expect(cutToBeats(p)).toBe(p);
    const two = makeProject({ beatMarkers: [0.499, 0.55], clips: [photo("a", 3), photo("z", 3)] });
    expect(lengths(cutToBeats(two))).toEqual([0.55, 3]);
    const later = makeProject({ beatMarkers: [1.299, 3.5], clips: [photo("a", 0.8), photo("b", 2), photo("z", 3)] });
    expect(cutToBeats(later)).toBe(later);                        // 1.299 would leave b 0.499 s; 3.5 is past it
  });
  test("exactly the minimum is used, also where the clips before it do not add up cleanly in binary", () => {
    const p = makeProject({ beatMarkers: [0.8], clips: [video("a", 0.1), video("b", 0.2), photo("c", 3), photo("z", 3)] });
    const out = cutToBeats(p);                                    // 0.1 + 0.2 = 0.30000000000000004
    expect(out.clips[2].trimEnd).toBe(0.5);
    expect(reloaded(out)).toEqual(out);
    expect(cutToBeats(out)).toBe(out);
  });
  test("no cut photo is ever under the loader's minimum: a cut project reloads unchanged", () => {
    const markers = Array.from({ length: 60 }, (_, i) => Math.round((0.499 + i * 0.4993) * 1000) / 1000);
    const p = makeProject({ beatMarkers: markers, clips: Array.from({ length: 12 }, (_, i) => photo(`p${i}`, 0.9 + (i % 5) * 0.37)) });
    const out = cutToBeats(p, true);
    expect(out).not.toBe(p);
    for (const c of out.clips) expect(c.trimEnd).toBeGreaterThanOrEqual(0.5);
    expect(reloaded(out)).toEqual(out);
    expect(cutToBeats(out, true)).toBe(out);
  });
  test("a reversed clip with a speed change: the cut lands on the marker, the source head moved, the trims stay inside the source", () => {
    const p = makeProject({ beatMarkers: [2], clips: [video("a", 8, { trimStart: 1, trimEnd: 7, reversed: true, speed: 2 }), photo("z", 3)] });
    expect(lengths(p)).toEqual([3, 3]);
    const out = cutToBeats(p);
    const a = out.clips[0];
    expect(clipDuration(a)).toBeCloseTo(2, 9);
    expect(cuts(out)[0]).toBeCloseTo(2, 9);
    expect(a.trimEnd).toBe(7);                                    // what it plays FIRST is kept
    expect(a.trimStart).toBeCloseTo(3, 9);                        // 2 s at 2x = 4 source seconds before 7
    expect(a.trimStart).toBeGreaterThanOrEqual(0);
    expect(a.trimEnd).toBeLessThanOrEqual(a.sourceDuration);
    expect(a).toMatchObject({ reversed: true, speed: 2 });
    expect(reloaded(out)).toEqual(out);
    expect(cutToBeats(out)).toBe(out);
  });
  test("a reversed clip on a speed curve: the same, and the curve keeps its steps", () => {
    const steps = [{ from: 0, speed: 2 }, { from: 4, speed: 1 }];   // reversed: source 8 -> 4 at 1x (4 s), then 4 -> 0 at 2x (2 s)
    const p = makeProject({ beatMarkers: [3, 5], clips: [video("a", 8, { reversed: true, speedCurve: { id: "montage", steps } }), photo("z", 3)] });
    expect(lengths(p)).toEqual([6, 3]);
    const out = cutToBeats(p);
    const a = out.clips[0];
    expect(clipDuration(a)).toBeCloseTo(5, 9);
    expect(cuts(out)[0]).toBeCloseTo(5, 9);
    expect(a.trimEnd).toBe(8);
    expect(a.trimStart).toBeCloseTo(2, 9);                        // 4 s at 1x, then 1 s at 2x = source 4 -> 2
    expect(a.trimStart).toBeGreaterThanOrEqual(0);
    expect(a.speedCurve).toEqual({ id: "montage", steps });
    expect(a.reversed).toBe(true);
    expect(reloaded(out)).toEqual(out);
    expect(cutToBeats(out)).toBe(out);
  });
  test("the worked vectors reload unchanged after the cut", () => {
    const v1 = cutToBeats(makeProject({ beatMarkers: [1, 2, 3, 4, 5, 6, 7, 8], clips: [photo("a", 3), video("b", 2.6), photo("c", 3), video("d", 4)] }));
    const v2 = cutToBeats(makeProject({ beatMarkers: [0.8, 1.7, 4.4], clips: [video("a", 10, { speed: 2 }), photo("z", 3)] }));
    const v4 = cutToBeats(makeProject({ beatMarkers: [4], clips: [video("a", 8, { trimStart: 1, trimEnd: 7, reversed: true }), photo("z", 3)] }));
    for (const out of [v1, v2, v4]) expect(reloaded(out)).toEqual(out);
  });
});

describe("cutToBeats — the promises", () => {
  const busy = () => makeProject({
    beatMarkers: [0.9, 1.9, 2.9, 3.9, 4.9, 5.9, 6.9, 7.9, 8.9],
    clips: [video("a", 3.3, { transitionOut: { type: "fade", duration: 0.5 } }), photo("b", 2.5), video("c", 4.2, { keyframes: [makeKeyframe({ t: 4 })] }), photo("d", 3)],
    overlays: [makeOverlay({ id: "o", start: 5, end: 8 })], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 20 })],
    effects: [makeEffect({ id: "e1", start: 1, end: 2 }), makeEffect({ id: "e2", start: 12.5, end: 13 })],
  });

  test("every cut lands on a marker, to the millisecond", () => {
    const out = cutToBeats(busy());
    for (const c of cuts(out)) expect(out.beatMarkers.some((m) => Math.abs(m - c) <= BEAT_CUT.reach)).toBe(true);
    expect(lengths(out)).toEqual([2.9, 2, 4, 3]);
  });
  test("clips are only shortened: same ids, same order, none longer, every one at least half a second", () => {
    const p = busy();
    const out = cutToBeats(p);
    expect(out.clips.map((c) => c.id)).toEqual(p.clips.map((c) => c.id));
    out.clips.forEach((c, i) => {
      expect(clipDuration(c)).toBeLessThanOrEqual(clipDuration(p.clips[i]) + 1e-9);
      expect(clipDuration(c)).toBeGreaterThanOrEqual(BEAT_CUT.minClip - 1e-9);
      expect(c.trimStart).toBe(p.clips[i].trimStart);            // only the end moves (none is reversed here)
    });
  });
  test("a second tap changes nothing: the same project, so no undo step", () => {
    const once = cutToBeats(busy());
    expect(cutToBeats(once)).toBe(once);
  });
  test("like a trim by hand: text, sounds, layers and markers stay where they are; keyframes are kept as stored", () => {
    const p = busy();
    const out = cutToBeats(p);
    expect(out.overlays).toBe(p.overlays);
    expect(out.audioTracks).toBe(p.audioTracks);
    expect(out.layers).toBe(p.layers);
    expect(out.beatMarkers).toBe(p.beatMarkers);
    expect(out.clips[2].keyframes).toEqual(p.clips[2].keyframes);
    expect(out.updatedAt).toBe("2026-10-06T12:00:00.000Z");
  });
  test("an effect left past the new end is dropped, one inside stays (the rule of every clip edit)", () => {
    const out = cutToBeats(busy());
    expect(totalDuration(out)).toBeCloseTo(11.9, 9);
    expect(out.effects.map((e) => e.id)).toEqual(["e1"]);
  });
  test("transitions are re-capped against the shortened clips, and removed where a clip got too short for one", () => {
    const p = makeProject({ beatMarkers: [0.5, 3.5], clips: [
      video("a", 0.9, { transitionOut: { type: "fade", duration: 0.4 } }), video("b", 3.4, { transitionOut: { type: "slide", duration: 1 } }), photo("z", 3)] });
    const out = cutToBeats(p);
    expect(lengths(out)).toEqual([0.5, 3, 3]);
    expect(out.clips[0].transitionOut).toEqual({ type: "none", duration: 0 });   // cap 0.25 s is under the 0.3 s minimum
    expect(out.clips[1].transitionOut).toEqual({ type: "slide", duration: 1 });
  });
  test("nothing to do: no markers, no clips, cuts already on the beat", () => {
    const none = makeProject({ clips: [photo("a", 3), photo("b", 3)] });
    expect(cutToBeats(none)).toBe(none);
    const empty = makeProject({ beatMarkers: [1] });
    expect(cutToBeats(empty)).toBe(empty);
    const on = makeProject({ beatMarkers: [3], clips: [photo("a", 3), photo("b", 3)] });
    expect(cutToBeats(on)).toBe(on);
  });
  test("the stored project is not mutated", () => {
    const p = busy();
    const frozen = JSON.stringify(p);
    cutToBeats(p);
    expect(JSON.stringify(p)).toBe(frozen);
  });
});

describe("beatCutState — when Cut to beats is available (spec 5.5): it needs beat markers, and at least two clips", () => {
  test("no markers: refused, whatever the clips (checked first)", () => {
    expect(beatCutState(makeProject({ clips: [photo("a", 3), photo("b", 3)] }))).toBe("noMarkers");
    expect(beatCutState(makeProject({ clips: [photo("a", 3)] }))).toBe("noMarkers");
    expect(beatCutState(makeProject())).toBe("noMarkers");
  });
  test("markers but fewer than two clips: refused", () => {
    expect(beatCutState(makeProject({ beatMarkers: [1], clips: [photo("a", 3)] }))).toBe("oneClip");
    expect(beatCutState(makeProject({ beatMarkers: [1] }))).toBe("oneClip");
  });
  test("markers and two clips: ready — also when the tap would find every cut on a beat already", () => {
    expect(beatCutState(makeProject({ beatMarkers: [1], clips: [photo("a", 3), photo("b", 3)] }))).toBe("ready");
    expect(beatCutState(makeProject({ beatMarkers: [3], clips: [photo("a", 3), photo("b", 3)] }))).toBe("ready");
    expect(beatCutState(makeProject({ beatMarkers: [1], clips: [photo("a", 3), video("b", 3), photo("c", 3)] }))).toBe("ready");
  });
});

test("beatTrack: the selected music track, else the music that starts first; never a voice-over or a sound effect", () => {
  const tracks = [
    makeAudioTrack({ id: "voice", sourceDuration: 5, kind: "voice" }), makeAudioTrack({ id: "late", sourceDuration: 5, start: 4 }),
    makeAudioTrack({ id: "early", sourceDuration: 5, start: 1 }), makeAudioTrack({ id: "tie", sourceDuration: 5, start: 1 }),
  ];
  const p = makeProject({ clips: [video("a", 10)], audioTracks: tracks });
  expect(beatTrack(p, null)?.id).toBe("early");
  expect(beatTrack(p, "late")?.id).toBe("late");
  expect(beatTrack(p, "voice")?.id).toBe("early");
  expect(beatTrack(p, "gone")?.id).toBe("early");
  expect(beatTrack(makeProject({ audioTracks: [tracks[0]] }), null)).toBeNull();
});
