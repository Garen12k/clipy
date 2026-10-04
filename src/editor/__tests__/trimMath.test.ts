import { makeClip, makePhotoClip, PHOTO } from "@/src/editor/model/types";
import { curveSteps } from "@/src/editor/model/timeline";
import { trimFromDrag } from "../components/TrimHandles";

const c = makeClip({ id: "a", sourceDuration: 10, trimStart: 2, trimEnd: 6 });

test("dragging the start handle right moves trimStart later, snapped to 0.1 s", () => {
  expect(trimFromDrag(c, "start", 2, 57, 100)).toEqual({ trimStart: 2.6, trimEnd: 6 });
});
test("dragging the end handle left moves trimEnd earlier", () => {
  expect(trimFromDrag(c, "end", 6, -120, 100)).toEqual({ trimStart: 2, trimEnd: 4.8 });
});
test("handles cannot cross or leave the source", () => {
  expect(trimFromDrag(c, "start", 2, 10000, 100)).toEqual({ trimStart: 5.9, trimEnd: 6 });
  expect(trimFromDrag(c, "end", 6, 10000, 100)).toEqual({ trimStart: 2, trimEnd: 10 });
  expect(trimFromDrag(c, "start", 2, -10000, 100)).toEqual({ trimStart: 0, trimEnd: 6 });
});

test("a photo's end handle sets its length within the photo limits", () => {
  const ph = makePhotoClip({ id: "p", seconds: 3 });
  expect(trimFromDrag(ph, "end", 3, 150, 100)).toEqual({ trimStart: 0, trimEnd: 4.5 });
  expect(trimFromDrag(ph, "end", 3, -10000, 100)).toEqual({ trimStart: 0, trimEnd: PHOTO.minSeconds });
  expect(trimFromDrag(ph, "end", 3, 100000, 100)).toEqual({ trimStart: 0, trimEnd: PHOTO.maxSeconds });
});

test("drag deltas are output seconds, converted to source seconds by speed", () => {
  const fast = makeClip({ id: "f", sourceDuration: 10, trimStart: 2, trimEnd: 6, speed: 2 });
  expect(trimFromDrag(fast, "end", 6, 50, 100)).toEqual({ trimStart: 2, trimEnd: 7 }); // 0.5 s on screen = 1 s of source
});

test("on a curved clip a drag walks the curve's steps, whatever the trim has become during the drag", () => {
  // hero on 0–8: 1, 2, 3, 0.5, 0.5, 3, 2, 1 for the 1 s slices.
  const hero = { ...makeClip({ id: "h", sourceDuration: 8 }), speedCurve: { id: "hero" as const, steps: curveSteps("hero", 0, 8) } };
  expect(trimFromDrag(hero, "end", 8, -100, 100)).toEqual({ trimStart: 0, trimEnd: 7 });      // 1 s back through the 1× slice
  expect(trimFromDrag(hero, "end", 8, -150, 100)).toEqual({ trimStart: 0, trimEnd: 6 });      // … and 0.5 s of the 2× slice
  expect(trimFromDrag(hero, "start", 0, 150, 100)).toEqual({ trimStart: 2, trimEnd: 8 });     // 1 s at 1× + 0.5 s at 2×
  // Mid-drag the clip is already trimmed; the answer is still measured from where the drag began.
  expect(trimFromDrag({ ...hero, trimStart: 1 }, "start", 0, 150, 100)).toEqual({ trimStart: 2, trimEnd: 8 });
  expect(trimFromDrag({ ...hero, trimEnd: 6.5 }, "end", 8, -150, 100)).toEqual({ trimStart: 0, trimEnd: 6 });
  // The handles cannot cross: the floor is 0.1 s of OUTPUT next to the other edge (1× at both ends of hero).
  expect(trimFromDrag(hero, "start", 0, 100000, 100)).toEqual({ trimStart: 7.9, trimEnd: 8 });
  expect(trimFromDrag(hero, "end", 8, -100000, 100)).toEqual({ trimStart: 0, trimEnd: 0.1 });
  const mid = { ...hero, trimStart: 2, trimEnd: 4 };                                           // 3× after the start, 0.5× before the end
  expect(trimFromDrag(mid, "end", 4, -100000, 100)).toEqual({ trimStart: 2, trimEnd: 2.3 });
});
