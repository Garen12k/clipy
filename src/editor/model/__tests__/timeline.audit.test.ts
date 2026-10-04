import { makeClip, MIN_CLIP_SECONDS, type Clip } from "../types";
import { curveSteps, sourceAfter, sourceSamples, spanTooShort } from "../timeline";

// The helpers the speed audit moved here from ops.ts, TrimHandles.tsx and timelineLayout.ts.

// hero on 0–8: speeds 1, 2, 3, 0.5, 0.5, 3, 2, 1 for the 1 s slices; output boundaries 0, 1, 1.5, 11/6, 23/6, 35/6, 37/6, 20/3, 23/3.
const base = makeClip({ id: "c", sourceDuration: 8 });
const hero: Clip = { ...base, speedCurve: { id: "hero", steps: curveSteps("hero", 0, 8) } };

test("sourceAfter: constant-speed clips use exactly the old expression", () => {
  for (const speed of [0.25, 0.3, 1, 1.5, 3.7, 4]) {
    const c = makeClip({ id: "k", sourceDuration: 20, trimStart: 2.3, trimEnd: 9.1, speed });
    for (const [from, delta] of [[2.3, 0.57], [9.1, -1.2], [0, 3], [6, -0.1]] as const) {
      expect(sourceAfter(c, from, delta)).toBe(from + delta * c.speed);
    }
    expect(sourceAfter(c, c.trimEnd, -MIN_CLIP_SECONDS)).toBe(c.trimEnd - MIN_CLIP_SECONDS * c.speed);
    expect(sourceAfter(c, c.trimStart, MIN_CLIP_SECONDS)).toBe(c.trimStart + MIN_CLIP_SECONDS * c.speed);
  }
});

test("sourceAfter on a curved clip walks the steps, whatever the current trim", () => {
  expect(sourceAfter(hero, 1, 0.25)).toBeCloseTo(1.5, 9);     // 0.25 s at 2×
  expect(sourceAfter(hero, 0, 1.5)).toBeCloseTo(2, 9);        // 1 s at 1× + 0.5 s at 2×
  expect(sourceAfter(hero, 8, -1)).toBeCloseTo(7, 9);         // back through the last 1× slice
  expect(sourceAfter(hero, 8, -1.5)).toBeCloseTo(6, 9);       // … and the 2× slice
  expect(sourceAfter(hero, 3, 1)).toBeCloseTo(3.5, 9);        // 0.5×
  expect(sourceAfter(hero, 4.2, 0)).toBeCloseTo(4.2, 9);
  // Trimmed to 2–7: the steps under source 0–2 and 7–8 still count (a handle can be dragged back out over them).
  const t = { ...hero, trimStart: 2, trimEnd: 7 };
  expect(sourceAfter(t, 1, 0.25)).toBeCloseTo(1.5, 9);
  expect(sourceAfter(t, 0, 1.5)).toBeCloseTo(2, 9);
  expect(sourceAfter(t, 8, -1.5)).toBeCloseTo(6, 9);
});

test("spanTooShort: constant-speed clips use exactly the old comparison; curved clips are measured through the curve", () => {
  const fast = makeClip({ id: "f", sourceDuration: 10, speed: 3 });
  expect(spanTooShort(fast, 0, 0.3, MIN_CLIP_SECONDS)).toBe(false);   // 0.3 / 3 = 0.1 s (float noise absorbed)
  expect(spanTooShort(fast, 0, 0.29, MIN_CLIP_SECONDS)).toBe(true);
  expect(spanTooShort(fast, 2, 6, MIN_CLIP_SECONDS)).toBe(false);
  expect(spanTooShort(hero, 2, 2.2, MIN_CLIP_SECONDS)).toBe(true);    // 3× → 0.067 s
  expect(spanTooShort(hero, 2, 2.3, MIN_CLIP_SECONDS)).toBe(false);   // 0.1 s
  expect(spanTooShort(hero, 3, 3.06, MIN_CLIP_SECONDS)).toBe(false);  // 0.5× → 0.12 s
  expect(spanTooShort(hero, 3, 3.04, MIN_CLIP_SECONDS)).toBe(true);   // 0.08 s
});

test("sourceSamples: the source time at every `interval` output seconds", () => {
  const plain = makeClip({ id: "p", sourceDuration: 10, trimStart: 2, trimEnd: 6 });
  expect(sourceSamples(plain, 1, 500)).toEqual([2, 3, 4, 5]);
  expect(sourceSamples({ ...plain, speed: 2 }, 1, 500)).toEqual([2, 4]);
  expect(sourceSamples(plain, 8, 500)).toEqual([2]);
  expect(sourceSamples(plain, 0.5, 3)).toEqual([2, 2.5, 3]);          // capped
  const got = sourceSamples(hero, 1, 500);                              // offsets 0 … 7 of 7.667 s
  const want = [0, 1, 3 + 1 / 12, 3.5 + 1 / 12, 4 + 1 / 12, 4.5 + 1 / 12, 5.5, 7 + 1 / 3];
  expect(got).toHaveLength(want.length);
  got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 9));
  expect(sourceSamples(hero, 2, 2)).toHaveLength(2);
});

test("sourceSamples on a constant-speed clip accumulates exactly as the old thumbnail loop did", () => {
  for (const speed of [0.3, 1, 1.5, 3.7]) {
    const c = makeClip({ id: "k", sourceDuration: 20, trimStart: 0.37, trimEnd: 9.1, speed });
    const old: number[] = [];
    for (let t = c.trimStart; t < c.trimEnd - 1e-9 && old.length < 500; t += 0.7 * c.speed) old.push(t);
    expect(sourceSamples(c, 0.7, 500)).toEqual(old);
  }
});
