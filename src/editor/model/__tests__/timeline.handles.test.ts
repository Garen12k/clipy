import { TRANSITION_HANDLE_MAX, transitionHandles } from "../timeline";
import { makeClip, SPEED_LIMITS, TRANSITION_LIMITS, type Clip } from "../types";

// What the export reads OUTSIDE a clip's trim for a transition (ExportSession.swift: `head = halfIn × first speed`, `tail = halfOut ×
// last speed`, each before it is clamped to the file; a half is at most TRANSITION_LIMITS.max / 2).

test("the longest handle: half the longest transition at the highest speed", () => {
  expect(TRANSITION_HANDLE_MAX).toBe((TRANSITION_LIMITS.max / 2) * SPEED_LIMITS[1]);
  expect(TRANSITION_HANDLE_MAX).toBe(2);
});

test("a constant-speed clip: half a second of output each side, in source seconds", () => {
  const clip = (speed: number): Clip => makeClip({ id: "c", sourceDuration: 30, trimStart: 4, trimEnd: 9, speed });
  expect(transitionHandles(clip(1))).toEqual({ head: 0.5, tail: 0.5 });
  expect(transitionHandles(clip(4))).toEqual({ head: 2, tail: 2 });
  expect(transitionHandles(clip(0.25))).toEqual({ head: 0.125, tail: 0.125 });
});

test("a speed curve: the head at its first span's speed, the tail at its last", () => {
  const curved: Clip = { ...makeClip({ id: "c", sourceDuration: 30, trimStart: 4, trimEnd: 9 }), speedCurve: { id: "montage", steps: [{ from: 4, speed: 4 }, { from: 6, speed: 0.5 }] } };
  expect(transitionHandles(curved)).toEqual({ head: 2, tail: 0.25 });
});

test("total: a speed that is no speed counts as the nearest allowed one, never more than the longest handle", () => {
  for (const speed of [NaN, 0, -3, Infinity, 99]) {
    const h = transitionHandles({ ...makeClip({ id: "c", sourceDuration: 30 }), speed });
    for (const v of [h.head, h.tail]) {
      expect(Number.isFinite(v) && v > 0).toBe(true);
      expect(v).toBeLessThanOrEqual(TRANSITION_HANDLE_MAX);
    }
  }
});
