import { toExportClip, toExportLayer } from "@/modules/clipy-video";
import { setClipSpeedCurve } from "../ops";
import { clipDuration } from "../timeline";
import { makeClip, makeLayer, makeProject, type Clip } from "../types";

// What the EXPORT receives for a clip with a SMOOTH speed curve (ExportClip.speedSpans → SpeedSpans.swift), as literals. The numbers
// were worked out apart from the app's code, from the definition alone: a preset's eight speeds sit at their slices' centres, a
// straight line joins neighbouring centres, the edge speed holds outside them, and each of the 32 pieces takes the line's value at
// its own centre (4 decimals). The stepped twin of this file is timeline.stepped.proof.test.ts.

const HERO = [1, 1, 1.125, 1.375, 1.625, 1.875, 2.125, 2.375, 2.625, 2.875, 2.6875, 2.0625, 1.4375, 0.8125, 0.5, 0.5, 0.5, 0.5, 0.8125, 1.4375, 2.0625, 2.6875, 2.875, 2.625, 2.375, 2.125, 1.875, 1.625, 1.375, 1.125, 1, 1];
const BULLET = [3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.1, 2.3, 1.5, 0.7, 0.3, 0.3, 0.3, 0.3, 0.7, 1.5, 2.3, 3.1, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5];
const FLASH_OUT = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.0625, 1.1875, 1.3125, 1.4375, 1.5625, 1.6875, 1.8125, 1.9375, 2.125, 2.375, 2.625, 2.875, 3.125, 3.375, 3.625, 3.875, 4, 4];

/** The clip as the app stores it after a tile is tapped with Smooth on. */
const smooth = (id: "hero" | "bullet" | "flashOut", seconds: number, extra: Partial<Clip> = {}): Clip =>
  setClipSpeedCurve(makeProject({ clips: [makeClip({ id: "a", sourceDuration: seconds, ...extra })] }), "a", id, true).clips[0];
/** Output seconds of what was sent: Σ source seconds / speed — the length the export's composition comes to. */
const sentLength = (spans: { duration: number; speed: number }[]): number => spans.reduce((sum, s) => sum + s.duration / s.speed, 0);

describe("the export of a smooth clip (literals)", () => {
  test("smooth Hero on an 8-second clip: 32 spans of a quarter second, 6.584331 s in all", () => {
    const clip = smooth("hero", 8);
    const sent = toExportClip(clip);
    expect(sent.speedSpans).toHaveLength(32);
    expect(sent.speedSpans[0]).toEqual({ duration: 0.25, speed: 1 });
    expect(sent.speedSpans[2]).toEqual({ duration: 0.25, speed: 1.125 });      // the ramp begins after two pieces at the edge speed
    expect(sent.speedSpans[9]).toEqual({ duration: 0.25, speed: 2.875 });      // the top: under the stepped 3×
    expect(sent.speedSpans[15]).toEqual({ duration: 0.25, speed: 0.5 });       // the slow middle, two slices wide, is reached
    expect(sent.speedSpans[16]).toEqual({ duration: 0.25, speed: 0.5 });
    expect(sent.speedSpans[31]).toEqual({ duration: 0.25, speed: 1 });
    expect(sent.speedSpans).toEqual(HERO.map((speed) => ({ duration: 0.25, speed })));
    expect(sentLength(sent.speedSpans)).toBeCloseTo(6.584331, 6);
    expect(clipDuration(clip)).toBeCloseTo(6.584331, 6);                       // the editor's length is the export's
    expect(sent.speed).toBe(1);
    expect(sent.trimStart).toBe(0);
    expect(sent.trimEnd).toBe(8);
  });

  test("the spans cover the source exactly: 32 quarters are the 8 seconds", () => {
    const sent = toExportClip(smooth("hero", 8));
    expect(sent.speedSpans.reduce((sum, s) => sum + s.duration, 0)).toBe(8);
  });

  test("a reversed smooth clip: the same spans back to front, the same length", () => {
    const sent = toExportClip(smooth("flashOut", 8, { reversed: true }));
    expect(sent.reversed).toBe(true);
    expect(sent.speedSpans).toHaveLength(32);
    expect(sent.speedSpans[0]).toEqual({ duration: 0.25, speed: 4 });          // Flash out played backwards starts fast
    expect(sent.speedSpans[9]).toEqual({ duration: 0.25, speed: 2.125 });
    expect(sent.speedSpans[31]).toEqual({ duration: 0.25, speed: 1 });
    expect(sent.speedSpans).toEqual([...FLASH_OUT].reverse().map((speed) => ({ duration: 0.25, speed })));
    expect(sentLength(sent.speedSpans)).toBeCloseTo(5.702982, 6);
  });

  test("a smooth clip trimmed inside a piece: the first and the last span are what is left of their pieces", () => {
    // The curve was written over 0–8 (pieces of 0.25 s); the trim then moved to 2.125–5.875: half of piece 8, pieces 9…22, half of piece 23.
    const clip: Clip = { ...smooth("hero", 8), trimStart: 2.125, trimEnd: 5.875 };
    const sent = toExportClip(clip);
    expect(sent.speedSpans).toHaveLength(16);
    expect(sent.speedSpans[0]).toEqual({ duration: 0.125, speed: 2.625 });
    expect(sent.speedSpans[1]).toEqual({ duration: 0.25, speed: 2.875 });
    expect(sent.speedSpans[15]).toEqual({ duration: 0.125, speed: 2.625 });
    expect(sent.speedSpans).toEqual([
      { duration: 0.125, speed: 2.625 }, ...HERO.slice(9, 23).map((speed) => ({ duration: 0.25, speed })), { duration: 0.125, speed: 2.625 },
    ]);
    expect(sentLength(sent.speedSpans)).toBeCloseTo(3.660833, 6);
    expect(clipDuration(clip)).toBeCloseTo(3.660833, 6);
    expect(sent.trimStart).toBe(2.125);
    expect(sent.trimEnd).toBe(5.875);
  });

  test("the shortest clip that takes the smooth form (0.32 source seconds): 32 spans of a hundredth; one hundredth less is refused", () => {
    const clip = smooth("hero", 0.32);
    const sent = toExportClip(clip);
    expect(sent.speedSpans).toHaveLength(32);
    expect(sent.speedSpans.map((s) => s.speed)).toEqual(HERO);
    for (const span of sent.speedSpans) expect(span.duration).toBeCloseTo(0.01, 9);
    expect(sent.speedSpans.reduce((sum, s) => sum + s.duration, 0)).toBeCloseTo(0.32, 9);
    expect(sentLength(sent.speedSpans)).toBeCloseTo(0.263373, 6);
    // 0.31 s cannot hold 32 steps of at least a hundredth: the op gives the same project back, and nothing smooth is sent.
    const short = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 0.31 })] });
    expect(setClipSpeedCurve(short, "a", "hero", true)).toBe(short);
    expect(toExportClip(short.clips[0]).speedSpans).toEqual([]);
  });

  test("a smooth layer is sent with the same spans and its own start", () => {
    const layer = makeLayer({ id: "L", sourceDuration: 8, start: 1.5 });
    const curved = setClipSpeedCurve(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 20 })], layers: [layer] }), "L", "bullet", true).layers[0];
    const sent = toExportLayer(curved);
    expect(sent.speedSpans).toEqual(BULLET.map((speed) => ({ duration: 0.25, speed })));
    expect(sentLength(sent.speedSpans)).toBeCloseTo(6.188205, 6);
    expect(sent.start).toBe(1.5);
  });
});
