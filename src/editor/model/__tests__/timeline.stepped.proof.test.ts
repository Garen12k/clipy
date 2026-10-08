import { toExportClip, toExportLayer } from "@/modules/clipy-video";
import { setClipSpeedCurve } from "../ops";
import { clipDuration, curveSteps, outputToSource, playbackSpans, rateAt, sourceToOutput, speedSpans } from "../timeline";
import { clampSpeedCurve, makeClip, makeLayer, makeProject, SPEED_CURVE_IDS, type Clip, type SpeedCurveId } from "../types";

// PROOF: a clip with a STEPPED speed curve — what every project saved before smooth ramps holds — is stored, measured, played and
// sent to the export exactly as it was. Everything below is a literal, written and seen green against the code as it was BEFORE smooth
// ramps existed, and it names nothing that smooth ramps added. Never edit this file to make a change pass.

const STEPPED: Record<SpeedCurveId, number[]> = {
  montage: [2.5, 2.5, 0.5, 2.5, 2.5, 0.5, 2.5, 2.5], hero: [1, 2, 3, 0.5, 0.5, 3, 2, 1], bullet: [3.5, 3.5, 3.5, 0.3, 0.3, 3.5, 3.5, 3.5],
  jumpCut: [1, 4, 1, 4, 1, 4, 1, 4], flashIn: [4, 3, 2, 1.5, 1, 1, 1, 1], flashOut: [1, 1, 1, 1, 1.5, 2, 3, 4],
};
/** Output seconds of an 8-second clip (trim 0–8): Σ 1 / speed over the eight slices. */
const STEPPED_LENGTH: Record<SpeedCurveId, number> = { montage: 6.4, hero: 7.666667, bullet: 8.380952, jumpCut: 5, flashIn: 5.75, flashOut: 5.75 };
/** What a project saved before smooth ramps holds for an 8-second clip: eight steps on the whole source seconds. */
const stored = (id: SpeedCurveId) => ({ id, steps: STEPPED[id].map((speed, i) => ({ from: i, speed })) });
const eight = (extra: Partial<Clip> = {}) => makeClip({ id: "a", sourceDuration: 8, ...extra });

describe("PROOF: a stepped curve is exactly what it was before smooth ramps (literals; never edited to make a change pass)", () => {
  test("there are six presets", () => {
    expect([...SPEED_CURVE_IDS]).toEqual(["montage", "hero", "bullet", "jumpCut", "flashIn", "flashOut"]);
  });

  test.each(SPEED_CURVE_IDS)("%s: the same eight steps, the same length, the same spans, the same export spans", (id) => {
    expect(curveSteps(id, 0, 8)).toEqual(stored(id).steps);
    const clip = eight({ speedCurve: stored(id) });
    expect(clampSpeedCurve(clip.speedCurve, clip)).toEqual(stored(id));              // what is stored reloads as stored
    expect(clipDuration(clip)).toBeCloseTo(STEPPED_LENGTH[id], 6);
    expect(speedSpans(clip)).toEqual(STEPPED[id].map((speed, i) => ({ from: i, to: i + 1, speed })));
    expect(playbackSpans(clip)).toEqual(STEPPED[id].map((speed) => ({ duration: 1, speed })));
    // What the native side receives (ExportClip.speedSpans → SpeedSpans.swift): eight spans of one source second, in playback order.
    const sent = toExportClip(clip);
    expect(sent.speedSpans).toEqual(STEPPED[id].map((speed) => ({ duration: 1, speed })));
    expect(sent.speed).toBe(1);
    expect(sent.trimStart).toBe(0);
    expect(sent.trimEnd).toBe(8);
  });

  test.each(SPEED_CURVE_IDS)("%s reversed: the same spans back to front, the same length", (id) => {
    const clip = eight({ reversed: true, speedCurve: stored(id) });
    const backwards = [...STEPPED[id]].reverse().map((speed) => ({ duration: 1, speed }));
    expect(playbackSpans(clip)).toEqual(backwards);
    expect(toExportClip(clip).speedSpans).toEqual(backwards);
    expect(clipDuration(clip)).toBeCloseTo(STEPPED_LENGTH[id], 6);
  });

  test("the op without its new argument writes the stepped preset, as every caller before this batch did", () => {
    const p = makeProject({ clips: [eight()] });
    for (const id of SPEED_CURVE_IDS) {
      const c = setClipSpeedCurve(p, "a", id).clips[0];
      expect(c.speedCurve).toEqual(stored(id));
      expect(c.speed).toBe(1);
    }
  });

  test("picking the preset a stepped clip already has changes nothing: the same project object", () => {
    for (const id of SPEED_CURVE_IDS) {
      const p = makeProject({ clips: [eight({ speedCurve: stored(id) })] });
      expect(setClipSpeedCurve(p, "a", id)).toBe(p);
    }
  });

  test("a clip whose length is not a round number: the eight slices are eighths of the trim", () => {
    const c = setClipSpeedCurve(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 5 })] }), "a", "hero").clips[0];
    expect(c.speedCurve).toEqual({ id: "hero", steps: [
      { from: 0, speed: 1 }, { from: 0.625, speed: 2 }, { from: 1.25, speed: 3 }, { from: 1.875, speed: 0.5 },
      { from: 2.5, speed: 0.5 }, { from: 3.125, speed: 3 }, { from: 3.75, speed: 2 }, { from: 4.375, speed: 1 },
    ] });
    expect(clipDuration(c)).toBeCloseTo(4.791667, 6);
    expect(toExportClip(c).speedSpans).toEqual(STEPPED.hero.map((speed) => ({ duration: 0.625, speed })));
  });

  test("a trimmed, stepped clip: the steps stay on their source times and the walk is the old one", () => {
    const clip = eight({ trimStart: 2, trimEnd: 6, speedCurve: stored("hero") });
    expect(clipDuration(clip)).toBeCloseTo(1 / 3 + 1 / 0.5 + 1 / 0.5 + 1 / 3, 9);     // slices 2…5
    expect(outputToSource(clip, 0)).toBe(2);
    expect(toExportClip(clip).speedSpans).toEqual([{ duration: 1, speed: 3 }, { duration: 1, speed: 0.5 }, { duration: 1, speed: 0.5 }, { duration: 1, speed: 3 }]);
    // A trim inside a slice: the first and the last span are the parts of their slices that are left.
    const inside = eight({ trimStart: 2.5, trimEnd: 5.25, speedCurve: stored("hero") });
    expect(toExportClip(inside).speedSpans).toEqual([{ duration: 0.5, speed: 3 }, { duration: 1, speed: 0.5 }, { duration: 1, speed: 0.5 }, { duration: 0.25, speed: 3 }]);
    expect(clipDuration(inside)).toBeCloseTo(0.5 / 3 + 2 + 2 + 0.25 / 3, 9);
  });

  test("the walk over a stepped clip: source time, output time and rate at fixed points", () => {
    const clip = eight({ speedCurve: stored("hero") });
    expect(outputToSource(clip, 2)).toBeCloseTo(3.083333, 6);
    expect(outputToSource(clip, 1)).toBe(1);                                          // a boundary belongs to the later slice
    expect(sourceToOutput(clip, 4)).toBeCloseTo(1 + 1 / 2 + 1 / 3 + 2, 9);
    expect(rateAt(clip, 0)).toBe(1);
    expect(rateAt(clip, 1.2)).toBe(2);
    expect(rateAt(clip, 3)).toBe(0.5);
    expect(rateAt(clip, 99)).toBe(1);
  });

  test("a stepped layer is sent with the same spans and its own start", () => {
    const layer = makeLayer({ id: "L", sourceDuration: 8, start: 1.5, speedCurve: stored("bullet") });
    const sent = toExportLayer(layer);
    expect(sent.speedSpans).toEqual(STEPPED.bullet.map((speed) => ({ duration: 1, speed })));
    expect(sent.start).toBe(1.5);
  });
});
