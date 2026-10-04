import { makeClip, makeProject, type Clip } from "../types";
import {
  clipAt, clipDuration, curveSteps, freezeSourceTime, hasSpeedCurve, outputOffsetOf, outputToSource, playbackSpans, rateAt, sourceTimeAt, sourceToOutput,
  speedSpans, splitSourceRanges, totalDuration,
} from "../timeline";

const curved = (id: Parameters<typeof curveSteps>[0], partial: Partial<Clip> = {}): Clip => {
  const base = makeClip({ id: "c", sourceDuration: 8, ...partial });
  return { ...base, speedCurve: { id, steps: curveSteps(id, base.trimStart, base.trimEnd) } };
};

// hero on 0–8: speeds 1, 2, 3, 0.5, 0.5, 3, 2, 1 for the 1 s slices.
// Output lengths 1, 0.5, 1/3, 2, 2, 1/3, 0.5, 1 → boundaries 0, 1, 1.5, 11/6, 23/6, 35/6, 37/6, 20/3, 23/3.
const hero = curved("hero");

test("hasSpeedCurve: a curve with steps; null and an empty step list are constant speed", () => {
  const plain = makeClip({ id: "c", sourceDuration: 8, speed: 2 });
  expect(hasSpeedCurve(curved("hero"))).toBe(true);
  expect(hasSpeedCurve(plain)).toBe(false);
  expect(hasSpeedCurve({ ...plain, speedCurve: { id: "hero", steps: [] } })).toBe(false);
});
const HERO_DURATION = 1 + 0.5 + 0.3333333333 + 2 + 2 + 0.3333333333 + 0.5 + 1;   // 7.6666666666
// flashIn on 0–8: 4, 3, 2, 1.5, 1, 1, 1, 1 → 0.25 + 1/3 + 0.5 + 2/3 + 4 = 5.75
const flashIn = curved("flashIn");
// flashOut on 0–8: 1, 1, 1, 1, 1.5, 2, 3, 4 → 4 + 2/3 + 0.5 + 1/3 + 0.25 = 5.75
const flashOut = curved("flashOut");

test("speedSpans: one span for a constant-speed clip, the eight slices for a curved one", () => {
  const plain = makeClip({ id: "p", sourceDuration: 10, trimStart: 2, trimEnd: 6, speed: 2 });
  expect(speedSpans(plain)).toEqual([{ from: 2, to: 6, speed: 2 }]);
  expect(speedSpans(hero)).toEqual([
    { from: 0, to: 1, speed: 1 }, { from: 1, to: 2, speed: 2 }, { from: 2, to: 3, speed: 3 }, { from: 3, to: 4, speed: 0.5 },
    { from: 4, to: 5, speed: 0.5 }, { from: 5, to: 6, speed: 3 }, { from: 6, to: 7, speed: 2 }, { from: 7, to: 8, speed: 1 },
  ]);
});

test("clipDuration sums each span's source length over its speed", () => {
  expect(clipDuration(hero)).toBeCloseTo(HERO_DURATION, 9);
  expect(clipDuration(flashIn)).toBeCloseTo(5.75, 9);
  expect(clipDuration(flashOut)).toBeCloseTo(5.75, 9);
  const p = makeProject({ clips: [hero, makeClip({ id: "b", sourceDuration: 4, speed: 2 })] });
  expect(totalDuration(p)).toBeCloseTo(HERO_DURATION + 2, 9);
  expect(clipAt(p, 8)?.index).toBe(1);
  expect(clipAt(p, 8)?.offsetInClip).toBeCloseTo(8 - HERO_DURATION, 9);
});

test("outputToSource / sourceToOutput at span boundaries and mid-span", () => {
  const vectors: [number, number][] = [
    [0, 0],
    [0.5, 0.5],              // span 0 at 1×
    [1, 1],                  // boundary
    [1.25, 1.5],             // 1 + 0.25 × 2
    [1.5, 2],                // boundary
    [1.5 + 1 / 6, 2.5],      // 2 + (1/6) × 3
    [11 / 6, 3],             // boundary
    [11 / 6 + 1, 3.5],       // 3 + 1 × 0.5
    [23 / 6, 4],             // boundary
    [35 / 6 + 1 / 6, 5.5],   // 5 + (1/6) × 3
    [23 / 3 - 0.5, 7.5],     // last span at 1×
    [23 / 3, 8],
  ];
  for (const [out, src] of vectors) {
    expect(outputToSource(hero, out)).toBeCloseTo(src, 9);
    expect(sourceToOutput(hero, src)).toBeCloseTo(out, 9);
  }
});

test("the mapping extends linearly with the edge span's speed outside the clip", () => {
  expect(outputToSource(flashIn, -1)).toBeCloseTo(-4, 9);            // first span is 4×
  expect(sourceToOutput(flashIn, -4)).toBeCloseTo(-1, 9);
  expect(outputToSource(flashIn, 5.75 + 2)).toBeCloseTo(10, 9);      // last span is 1×
  expect(sourceToOutput(flashIn, 10)).toBeCloseTo(7.75, 9);
  expect(outputToSource(flashOut, -1)).toBeCloseTo(-1, 9);           // first span is 1×
  expect(outputToSource(flashOut, 5.75 + 1)).toBeCloseTo(12, 9);     // last span is 4×
  expect(sourceToOutput(flashOut, 12)).toBeCloseTo(6.75, 9);
});

test("inverse property holds to 1e-9 inside the clip, forward and reversed", () => {
  for (const c of [hero, flashIn, flashOut, curved("montage", { trimStart: 0.37, trimEnd: 6.91 }), curved("bullet"), curved("jumpCut")]) {
    const d = clipDuration(c);
    const r = { ...c, reversed: true };
    for (let i = 0; i < 50; i++) {
      const x = (d * i) / 49;
      expect(Math.abs(sourceToOutput(c, outputToSource(c, x)) - x)).toBeLessThan(1e-9);
      expect(Math.abs(outputOffsetOf(c, sourceTimeAt(c, x)) - x)).toBeLessThan(1e-9);
      expect(Math.abs(outputOffsetOf(r, sourceTimeAt(r, x)) - x)).toBeLessThan(1e-9);
    }
  }
});

test("forward clips: sourceTimeAt / freezeSourceTime / outputOffsetOf follow the forward mapping", () => {
  expect(sourceTimeAt(hero, 1.25)).toBeCloseTo(1.5, 9);
  expect(freezeSourceTime(hero, 1.25)).toBeCloseTo(1.5, 9);
  expect(outputOffsetOf(hero, 1.5)).toBeCloseTo(1.25, 9);
  expect(outputOffsetOf(hero, 3.5)).toBeCloseTo(11 / 6 + 1, 9);
});

test("a reversed curved clip plays its spans back to front", () => {
  const r = { ...flashIn, reversed: true };   // playback speeds 1, 1, 1, 1, 1.5, 2, 3, 4 from source 8 down to 0
  expect(clipDuration(r)).toBeCloseTo(5.75, 9);
  expect(sourceTimeAt(r, 0)).toBeCloseTo(8, 9);
  expect(sourceTimeAt(r, 2)).toBeCloseTo(6, 9);                 // 8 − 2 × 1
  expect(sourceTimeAt(r, 4)).toBeCloseTo(4, 9);
  expect(sourceTimeAt(r, 4 + 1 / 3)).toBeCloseTo(3.5, 9);       // 4 − (1/3) × 1.5
  expect(sourceTimeAt(r, 5.75)).toBeCloseTo(0, 9);
  expect(sourceTimeAt(r, -1)).toBeCloseTo(9, 9);                // first playback span is 1×
  expect(sourceTimeAt(r, 6.75)).toBeCloseTo(-4, 9);             // last playback span is 4×
  expect(freezeSourceTime(r, 2)).toBeCloseTo(6, 9);
  expect(outputOffsetOf(r, 6)).toBeCloseTo(2, 9);
  expect(outputOffsetOf(r, 3.5)).toBeCloseTo(4 + 1 / 3, 9);
  expect(outputOffsetOf(r, 9)).toBeCloseTo(-1, 9);
  expect(outputOffsetOf(r, -4)).toBeCloseTo(6.75, 9);
  // forward-only helpers ignore `reversed`, as they always have
  expect(outputToSource(r, 0.25)).toBeCloseTo(1, 9);
  expect(sourceToOutput(r, 1)).toBeCloseTo(0.25, 9);
});

test("playbackSpans: source seconds and speed in playback order", () => {
  const plain = makeClip({ id: "p", sourceDuration: 10, trimStart: 2, trimEnd: 6, speed: 2 });
  expect(playbackSpans(plain)).toEqual([{ duration: 4, speed: 2 }]);
  expect(playbackSpans({ ...plain, reversed: true })).toEqual([{ duration: 4, speed: 2 }]);
  expect(playbackSpans(flashIn).map((s) => s.speed)).toEqual([4, 3, 2, 1.5, 1, 1, 1, 1]);
  expect(playbackSpans(flashIn).map((s) => s.duration)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  expect(playbackSpans({ ...flashIn, reversed: true }).map((s) => s.speed)).toEqual([1, 1, 1, 1, 1.5, 2, 3, 4]);
});

test("a curve applied and then trimmed keeps its steps: spans are clipped to the trim", () => {
  const t = { ...hero, trimStart: 2, trimEnd: 7 };
  expect(t.speedCurve!.steps).toHaveLength(8);
  expect(speedSpans(t)).toEqual([
    { from: 2, to: 3, speed: 3 }, { from: 3, to: 4, speed: 0.5 }, { from: 4, to: 5, speed: 0.5 }, { from: 5, to: 6, speed: 3 }, { from: 6, to: 7, speed: 2 },
  ]);
  expect(clipDuration(t)).toBeCloseTo(1 / 3 + 2 + 2 + 1 / 3 + 0.5, 9);   // 5.1666666667
  expect(outputToSource(t, 0)).toBeCloseTo(2, 9);
  expect(outputToSource(t, 1 / 3)).toBeCloseTo(3, 9);
  expect(outputToSource(t, 1 / 3 + 1)).toBeCloseTo(3.5, 9);
  expect(sourceToOutput(t, 3.5)).toBeCloseTo(1 / 3 + 1, 9);
  expect(outputToSource(t, -1)).toBeCloseTo(-1, 9);                       // edge span is 3× (not the 2× step under source 1–2)
  expect(outputToSource(t, 31 / 6 + 1)).toBeCloseTo(9, 9);                // edge span is 2×
  expect(playbackSpans({ ...t, reversed: true })).toEqual([
    { duration: 1, speed: 2 }, { duration: 1, speed: 3 }, { duration: 1, speed: 0.5 }, { duration: 1, speed: 0.5 }, { duration: 1, speed: 3 },
  ]);
});

test("source outside the steps uses the first / last step's speed", () => {
  // flashIn written across 2–6 (0.5 s slices), then the trim is widened to 0–8.
  const c: Clip = { ...makeClip({ id: "w", sourceDuration: 8 }), speedCurve: { id: "flashIn", steps: curveSteps("flashIn", 2, 6) } };
  const spans = speedSpans(c);
  expect(spans).toHaveLength(8);
  expect(spans[0]).toEqual({ from: 0, to: 2.5, speed: 4 });
  expect(spans[1]).toEqual({ from: 2.5, to: 3, speed: 3 });
  expect(spans[7]).toEqual({ from: 5.5, to: 8, speed: 1 });
  // 2.5/4 + 0.5/3 + 0.5/2 + 0.5/1.5 + 0.5 + 0.5 + 0.5 + 2.5
  expect(clipDuration(c)).toBeCloseTo(0.625 + 1 / 6 + 0.25 + 1 / 3 + 4, 9);
});

test("rateAt: the speed of the span being shown; on a boundary the later one; clamped outside the clip", () => {
  const inside: [number, number][] = [[0.5, 1], [1.2, 2], [1.6, 3], [2, 0.5], [4, 0.5], [6, 3], [6.5, 2], [7, 1]];
  for (const [x, rate] of inside) expect(rateAt(hero, x)).toBe(rate);
  expect(rateAt(hero, 0)).toBe(1);
  expect(rateAt(hero, 1)).toBe(2);      // exactly on the boundary → the later span
  expect(rateAt(hero, 1.5)).toBe(3);
  expect(rateAt(flashIn, -3)).toBe(4);
  expect(rateAt(flashIn, 99)).toBe(1);
  const r = { ...flashIn, reversed: true };
  expect(rateAt(r, 3.9)).toBe(1);
  expect(rateAt(r, 4)).toBe(1.5);       // boundary → the later span in playback order
  expect(rateAt(r, 5.7)).toBe(4);
  expect(rateAt(r, -3)).toBe(1);
  expect(rateAt(r, 99)).toBe(4);
  const plain = makeClip({ id: "p", sourceDuration: 4, speed: 2 });
  expect(rateAt(plain, 1)).toBe(2);
  expect(rateAt({ ...plain, reversed: true }, -5)).toBe(2);
});

test("splitSourceRanges on a curved clip cuts at the source time under the playhead", () => {
  const s = splitSourceRanges(hero, 1.25);
  expect(s.left[0]).toBe(0); expect(s.left[1]).toBeCloseTo(1.5, 9);
  expect(s.right[0]).toBeCloseTo(1.5, 9); expect(s.right[1]).toBe(8);
  const r = splitSourceRanges({ ...flashIn, reversed: true }, 2);
  expect(r.left[0]).toBeCloseTo(6, 9); expect(r.left[1]).toBe(8);
  expect(r.right[0]).toBe(0); expect(r.right[1]).toBeCloseTo(6, 9);
  // the two halves of a split add up to the whole clip
  const left = { ...hero, trimEnd: s.left[1] };
  const right = { ...hero, trimStart: s.right[0] };
  expect(clipDuration(left)).toBeCloseTo(1.25, 9);
  expect(clipDuration(left) + clipDuration(right)).toBeCloseTo(HERO_DURATION, 9);
});

test("curveSteps: eight equal slices with the preset's speeds", () => {
  expect(curveSteps("hero", 0, 8)).toEqual([
    { from: 0, speed: 1 }, { from: 1, speed: 2 }, { from: 2, speed: 3 }, { from: 3, speed: 0.5 },
    { from: 4, speed: 0.5 }, { from: 5, speed: 3 }, { from: 6, speed: 2 }, { from: 7, speed: 1 },
  ]);
  const b = curveSteps("bullet", 2, 6);   // 0.5 s slices
  expect(b.map((s) => s.from)).toEqual([2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]);
  expect(b.map((s) => s.speed)).toEqual([3.5, 3.5, 3.5, 0.3, 0.3, 3.5, 3.5, 3.5]);
});

test("bit-identity: constant-speed clips return exactly the old formulas", () => {
  const speeds = [0.25, 0.3, 0.5, 0.75, 1, 1.5, 2, 3, 3.7, 4];
  const clips: Clip[] = [];
  speeds.forEach((speed, i) => {
    for (const reversed of [false, true]) {
      clips.push(makeClip({ id: `k${i}${reversed ? "r" : "f"}`, sourceDuration: 20, trimStart: 0.1 * i + (reversed ? 0.37 : 0), trimEnd: 7.3 + 0.9 * i, speed, reversed }));
    }
  });
  expect(clips).toHaveLength(20);
  for (const c of clips) {
    expect(c.speedCurve).toBeNull();
    const dur = (c.trimEnd - c.trimStart) / c.speed;
    expect(clipDuration(c)).toBe(dur);
    expect(speedSpans(c)).toEqual([{ from: c.trimStart, to: c.trimEnd, speed: c.speed }]);
    expect(playbackSpans(c)).toEqual([{ duration: c.trimEnd - c.trimStart, speed: c.speed }]);
    for (const x of [-0.7, 0, 0.3, 1.1, dur / 3, dur, dur + 0.5]) {
      const fwd = c.trimStart + x * c.speed;
      const shown = c.reversed ? c.trimEnd - x * c.speed : fwd;
      expect(outputToSource(c, x)).toBe(fwd);
      expect(freezeSourceTime(c, x)).toBe(shown);
      expect(sourceTimeAt(c, x)).toBe(shown);
      expect(rateAt(c, x)).toBe(c.speed);
      expect(splitSourceRanges(c, x)).toEqual(c.reversed
        ? { left: [shown, c.trimEnd], right: [c.trimStart, shown] }
        : { left: [c.trimStart, shown], right: [shown, c.trimEnd] });
      const src = 1.23 + x;
      expect(sourceToOutput(c, src)).toBe((src - c.trimStart) / c.speed);
      expect(outputOffsetOf(c, src)).toBe((c.reversed ? c.trimEnd - src : src - c.trimStart) / c.speed);
    }
  }
});
