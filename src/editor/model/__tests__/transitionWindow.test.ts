import { makeClip, makeProject } from "../types";
import { isInTransitionWindow, transitionProgress } from "../timeline";
const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4, transitionOut: { type: "fade", duration: 1 } }), makeClip({ id: "b", sourceDuration: 4 })] });
test("window is centred on the cut", () => {
  expect(isInTransitionWindow(p, 3.4)).toBe(false);
  expect(isInTransitionWindow(p, 3.6)).toBe(true);
  expect(isInTransitionWindow(p, 4.5)).toBe(true);
  expect(isInTransitionWindow(p, 4.6)).toBe(false);
  expect(transitionProgress(p, 3.5)).toEqual({ index: 0, progress: 0 });
  expect(transitionProgress(p, 4)).toEqual({ index: 0, progress: 0.5 });
  expect(transitionProgress(p, 4.5)).toEqual({ index: 0, progress: 1 });
  expect(transitionProgress(p, 1)).toBeNull();
});
