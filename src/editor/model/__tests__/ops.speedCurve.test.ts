jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { TEMPLATES } from "../../templates";
import { makeClip, makeKeyframe, makePhotoClip, makeProject, type Clip, type SpeedCurveId } from "../types";
import { clipDuration, curveSteps, outputOffsetOf, totalDuration } from "../timeline";
import {
  applyTemplate, duplicateClip, insertFreezeFrame, replaceClipMedia, setClipReversed, setClipSpeed, setClipSpeedCurve, splitClipAt, trimClip,
} from "../ops";

const HERO_DURATION = 23 / 3;   // 1 + 0.5 + 1/3 + 2 + 2 + 1/3 + 0.5 + 1 on a 0–8 clip
const a = makeClip({ id: "a", sourceDuration: 8 });
const b = makeClip({ id: "b", sourceDuration: 8 });
const p = makeProject({ clips: [a, b] });
const curved = (id: SpeedCurveId = "hero") => setClipSpeedCurve(p, "a", id);

describe("setClipSpeedCurve", () => {
  test("writes the preset's eight steps across the current trim and sets speed to 1", () => {
    const out = curved();
    expect(out.clips[0].speedCurve).toEqual({ id: "hero", steps: curveSteps("hero", 0, 8) });
    expect(out.clips[0].speed).toBe(1);
    expect(clipDuration(out.clips[0])).toBeCloseTo(HERO_DURATION, 9);
    expect(totalDuration(out)).toBeCloseTo(HERO_DURATION + 8, 9);
    expect(out.clips[1]).toBe(b);
    expect(out.updatedAt).toBe("2026-10-01T10:00:00.000Z");

    const fast = makeProject({ clips: [makeClip({ id: "f", sourceDuration: 10, trimStart: 2, trimEnd: 6, speed: 2 })] });
    const c = setClipSpeedCurve(fast, "f", "bullet").clips[0];
    expect(c.speed).toBe(1);
    expect(c.speedCurve).toEqual({ id: "bullet", steps: curveSteps("bullet", 2, 6) });
    expect(c.speedCurve!.steps.map((s) => s.from)).toEqual([2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]);
  });

  test("the same preset again is the same project; another preset or a changed trim writes new steps", () => {
    const once = curved();
    expect(setClipSpeedCurve(once, "a", "hero")).toBe(once);
    const other = setClipSpeedCurve(once, "a", "flashIn");
    expect(other.clips[0].speedCurve).toEqual({ id: "flashIn", steps: curveSteps("flashIn", 0, 8) });
    const trimmed = trimClip(once, "a", 2, 6);
    const again = setClipSpeedCurve(trimmed, "a", "hero");
    expect(again).not.toBe(trimmed);
    expect(again.clips[0].speedCurve).toEqual({ id: "hero", steps: curveSteps("hero", 2, 6) });
    expect(setClipSpeedCurve(again, "a", "hero")).toBe(again);
  });

  test("null clears the curve and leaves speed at 1; clearing nothing is the same project", () => {
    const once = curved();
    const cleared = setClipSpeedCurve(once, "a", null);
    expect(cleared.clips[0]).toMatchObject({ speedCurve: null, speed: 1 });
    expect(clipDuration(cleared.clips[0])).toBe(8);
    expect(setClipSpeedCurve(p, "a", null)).toBe(p);
    const fast = makeProject({ clips: [makeClip({ id: "f", sourceDuration: 8, speed: 2 })] });
    expect(setClipSpeedCurve(fast, "f", null)).toBe(fast);   // a constant speed is not touched by "None"
  });

  test("refused: photos, a missing clip, an unknown preset, a result shorter than the minimum clip", () => {
    const q = makeProject({ clips: [makePhotoClip({ id: "ph" }), makeClip({ id: "tiny", sourceDuration: 0.12 })] });
    expect(setClipSpeedCurve(q, "ph", "hero")).toBe(q);
    expect(setClipSpeedCurve(q, "nope", "hero")).toBe(q);
    expect(setClipSpeedCurve(q, "tiny", "nope" as SpeedCurveId)).toBe(q);
    expect(setClipSpeedCurve(q, "tiny", "jumpCut")).toBe(q);   // 0.015 × (4 + 4 / 4) = 0.075 s < 0.1 s
    expect(setClipSpeedCurve(q, "tiny", "hero")).not.toBe(q);  // 0.015 × 23 / 3 = 0.115 s
  });

  test("transitions are re-capped when a curve makes the clip shorter", () => {
    const q = makeProject({ clips: [makeClip({ id: "s", sourceDuration: 2, transitionOut: { type: "fade", duration: 1 } }), makeClip({ id: "n", sourceDuration: 4 })] });
    const out = setClipSpeedCurve(q, "s", "jumpCut");   // 4 × 0.25 + 4 × 0.25 / 4 = 1.25 s → cap 0.63
    expect(clipDuration(out.clips[0])).toBe(1.25);
    expect(out.clips[0].transitionOut).toEqual({ type: "fade", duration: 0.63 });
  });

  test("a keyframed clip keeps its pins on their pictures: source times unchanged, output offsets move", () => {
    const pins = [makeKeyframe({ t: 1.5, x: 0.2 }), makeKeyframe({ t: 5, x: -0.2 })];
    const q = makeProject({ clips: [makeClip({ id: "k", sourceDuration: 8, keyframes: pins })] });
    const out = setClipSpeedCurve(q, "k", "hero");
    expect(out.clips[0].keyframes).toEqual(pins);
    expect(outputOffsetOf(q.clips[0], 1.5)).toBe(1.5);
    expect(outputOffsetOf(out.clips[0], 1.5)).toBeCloseTo(1.25, 9);
    expect(outputOffsetOf(q.clips[0], 5)).toBe(5);
    expect(outputOffsetOf(out.clips[0], 5)).toBeCloseTo(35 / 6, 9);
  });
});

describe("the other ops on a curved clip", () => {
  test("setClipSpeed clears the curve — also when the speed asked for is the 1 it already has", () => {
    const once = curved();
    expect(setClipSpeed(once, "a", 2).clips[0]).toMatchObject({ speed: 2, speedCurve: null });
    const one = setClipSpeed(once, "a", 1);
    expect(one).not.toBe(once);
    expect(one.clips[0]).toMatchObject({ speed: 1, speedCurve: null });
    expect(setClipSpeed(one, "a", 1)).toBe(one);
  });

  test("setClipSpeed re-caps transitions after clearing a curve", () => {
    const q = makeProject({ clips: [makeClip({ id: "s", sourceDuration: 2, transitionOut: { type: "fade", duration: 1 } }), makeClip({ id: "n", sourceDuration: 4 })] });
    const out = setClipSpeed(setClipSpeedCurve(q, "s", "jumpCut"), "s", 4);   // 0.5 s → cap 0.25 < min → cleared
    expect(out.clips[0].transitionOut).toEqual({ type: "none", duration: 0 });
  });

  test("trimClip keeps the steps as they are (absolute source times)", () => {
    const once = curved();
    const out = trimClip(once, "a", 2, 7);
    expect(out.clips[0]).toMatchObject({ trimStart: 2, trimEnd: 7 });
    expect(out.clips[0].speedCurve).toEqual({ id: "hero", steps: curveSteps("hero", 0, 8) });
    expect(clipDuration(out.clips[0])).toBeCloseTo(1 / 3 + 2 + 2 + 1 / 3 + 0.5, 9);
  });

  test("trimClip's minimum length is measured through the curve", () => {
    const once = curved();
    expect(trimClip(once, "a", 2, 2.2)).toBe(once);                 // 0.2 s of source at 3× = 0.067 s
    const slow = trimClip(once, "a", 3, 3.06);                      // 0.06 s of source at 0.5× = 0.12 s
    expect(slow.clips[0]).toMatchObject({ trimStart: 3, trimEnd: 3.06 });
  });

  test("splitClipAt: both halves keep the curve, each with its own copy of the steps", () => {
    const once = curved();
    const src = once.clips[0];
    const out = splitClipAt(once, 1.25);
    const [left, right] = out.clips;
    expect(left).toMatchObject({ id: "a", trimStart: 0, speed: 1 });
    expect(left.trimEnd).toBeCloseTo(1.5, 9);
    expect(right).toMatchObject({ id: "new-id", trimEnd: 8, speed: 1 });
    expect(right.trimStart).toBeCloseTo(1.5, 9);
    for (const half of [left, right]) {
      expect(half.speedCurve).toEqual(src.speedCurve);
      expect(half.speedCurve).not.toBe(src.speedCurve);
      expect(half.speedCurve!.steps).not.toBe(src.speedCurve!.steps);
      expect(half.speedCurve!.steps[0]).not.toBe(src.speedCurve!.steps[0]);
    }
    expect(left.speedCurve).not.toBe(right.speedCurve);
    expect(left.speedCurve!.steps).not.toBe(right.speedCurve!.steps);
    expect(clipDuration(left)).toBeCloseTo(1.25, 9);
    expect(clipDuration(left) + clipDuration(right)).toBeCloseTo(HERO_DURATION, 9);
  });

  test("splitClipAt on a reversed curved clip: the left half is the end of the source", () => {
    const once = setClipReversed(curved("flashIn"), "a", true);   // plays 8 → 0 at 1, 1, 1, 1, 1.5, 2, 3, 4
    const [left, right] = splitClipAt(once, 2).clips;
    expect(left.trimStart).toBeCloseTo(6, 9); expect(left.trimEnd).toBe(8);
    expect(right.trimStart).toBe(0); expect(right.trimEnd).toBeCloseTo(6, 9);
    expect(left.speedCurve).toEqual(once.clips[0].speedCurve);
    expect(right.speedCurve).toEqual(once.clips[0].speedCurve);
    expect(clipDuration(left)).toBeCloseTo(2, 9);
    expect(clipDuration(right)).toBeCloseTo(3.75, 9);
  });

  test("duplicateClip deep-copies the curve", () => {
    const once = curved();
    const out = duplicateClip(once, "a");
    const [src, copy] = out.clips;
    expect(copy.id).toBe("new-id");
    expect(copy.speedCurve).toEqual(src.speedCurve);
    expect(copy.speedCurve).not.toBe(src.speedCurve);
    expect(copy.speedCurve!.steps).not.toBe(src.speedCurve!.steps);
    expect(copy.speedCurve!.steps[0]).not.toBe(src.speedCurve!.steps[0]);
    expect(duplicateClip(p, "a").clips[1].speedCurve).toBeNull();
  });

  test("setClipReversed keeps the curve", () => {
    const once = curved("flashIn");
    const out = setClipReversed(once, "a", true);
    expect(out.clips[0]).toMatchObject({ reversed: true, speed: 1 });
    expect(out.clips[0].speedCurve).toEqual({ id: "flashIn", steps: curveSteps("flashIn", 0, 8) });
    expect(clipDuration(out.clips[0])).toBeCloseTo(5.75, 9);
  });

  test("insertFreezeFrame: the still has no curve, the halves keep theirs", () => {
    const once = curved();
    const out = insertFreezeFrame(once, 1.25, { id: "still", sourceUri: "file:///p/media/still.jpg", width: 1080, height: 1920 });
    expect(out.clips.map((c) => c.id)).toEqual(["a", "still", "new-id", "b"]);
    expect(out.clips[1]).toMatchObject({ kind: "photo", speed: 1, speedCurve: null });
    expect(out.clips[0].speedCurve).toEqual(once.clips[0].speedCurve);
    expect(out.clips[2].speedCurve).toEqual(once.clips[0].speedCurve);
  });

  test("applyTemplate sets a speed, so it clears the curve", () => {
    const once = setClipSpeedCurve(curved(), "b", "bullet");
    const one = applyTemplate(once, TEMPLATES.hype, "clip", "a");
    expect(one.clips[0]).toMatchObject({ speed: 1.5, speedCurve: null });
    expect(one.clips[1].speedCurve).toEqual(once.clips[1].speedCurve);
    const all = applyTemplate(once, TEMPLATES.clean, "project", null);   // speed 1 still means "constant"
    expect(all.clips.map((c) => c.speedCurve)).toEqual([null, null]);
    expect(all.clips.map((c) => c.speed)).toEqual([1, 1]);
  });
});

describe("replaceClipMedia on a curved clip", () => {
  const newVideo = (sourceDuration: number) => ({ sourceUri: "file:///new.mp4", sourceDuration, width: 1920, height: 1080, kind: "video" as const });
  const newPhoto = { sourceUri: "file:///new.jpg", sourceDuration: 0, width: 800, height: 600, kind: "photo" as const };
  const src: Clip = makeClip({ id: "v", sourceDuration: 10, trimStart: 2, trimEnd: 6 });
  const q = setClipSpeedCurve(makeProject({ clips: [src, makeClip({ id: "n", sourceDuration: 4 })] }), "v", "hero");

  test("video → video re-applies the same preset across the new range (the old source span, from 0)", () => {
    const c = replaceClipMedia(q, "v", newVideo(20)).clips[0];
    expect(c).toMatchObject({ trimStart: 0, trimEnd: 4, speed: 1, sourceDuration: 20 });
    expect(c.speedCurve).toEqual({ id: "hero", steps: curveSteps("hero", 0, 4) });
    expect(c.speedCurve!.steps).not.toBe(q.clips[0].speedCurve!.steps);
    expect(clipDuration(c)).toBeCloseTo(clipDuration(q.clips[0]), 9);   // same span, same shape → same length
  });

  test("video → shorter video spreads the preset over the whole new video", () => {
    const c = replaceClipMedia(q, "v", newVideo(3)).clips[0];
    expect(c).toMatchObject({ trimStart: 0, trimEnd: 3, speed: 1 });
    expect(c.speedCurve).toEqual({ id: "hero", steps: curveSteps("hero", 0, 3) });
  });

  test("video → photo drops the curve; the photo keeps the clip's output length", () => {
    const c = replaceClipMedia(q, "v", newPhoto).clips[0];
    expect(c).toMatchObject({ kind: "photo", speed: 1, speedCurve: null, trimStart: 0 });
    expect(c.trimEnd).toBeCloseTo(clipDuration(q.clips[0]), 9);
  });

  test("a new video too short for the curve is refused", () => {
    const j = setClipSpeedCurve(q, "v", "jumpCut");
    expect(replaceClipMedia(j, "v", newVideo(0.12))).toBe(j);   // 0.075 s
  });
});
