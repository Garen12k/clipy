import { makeClip, makePhotoClip, PHOTO } from "@/src/editor/model/types";
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
