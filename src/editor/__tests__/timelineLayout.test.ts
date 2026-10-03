import { makeClip } from "@/src/editor/model/types";
import { indexFromDrop, LANE_GAP, LANE_HEIGHT, laneTop, stripWidth, thumbInterval, thumbTimes, TIMELINE_HEIGHT } from "../timelineLayout";

const c = makeClip({ id: "a", sourceDuration: 10, trimStart: 2, trimEnd: 6 }); // 4 s

test("stripWidth scales with zoom", () => {
  expect(stripWidth(c, 50)).toBe(200);
});

test("thumbInterval is one thumb per 64px, floored at 0.5s", () => {
  expect(thumbInterval(64)).toBe(1);       // 64px / 64pps = 1s
  expect(thumbInterval(640)).toBe(0.5);    // 64px / 640pps = 0.1s, capped at 0.5
  expect(thumbInterval(8)).toBe(8);        // 64px / 8pps = 8s
});

test("thumbTimes samples the trimmed range at one thumb per 64px, min 0.5 s apart, always ≥ 1", () => {
  expect(thumbTimes(c, 64)).toEqual([2, 3, 4, 5]);          // 1 s per thumb
  expect(thumbTimes(c, 640)).toEqual([2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]); // capped at 0.5 s
  expect(thumbTimes(c, 8)).toEqual([2]);                    // 8 s per thumb > duration → one
});

test("thumbTimes steps through source time faster for sped-up clips", () => {
  const fast = makeClip({ id: "f", sourceDuration: 10, trimStart: 2, trimEnd: 6, speed: 2 }); // 2 s on screen
  expect(thumbTimes(fast, 64)).toEqual([2, 4]); // one thumb per output second → every 2 s of source
});

test("indexFromDrop picks the slot whose centre is nearest the drag centre", () => {
  const starts = [0, 100, 300];       // px
  const widths = [100, 200, 100];
  expect(indexFromDrop(starts, widths, 50)).toBe(0);
  expect(indexFromDrop(starts, widths, 250)).toBe(1);
  expect(indexFromDrop(starts, widths, 390)).toBe(2);
  expect(indexFromDrop(starts, widths, 9999)).toBe(2);
});

test("lanes sit under the clip strip", () => {
  expect(LANE_HEIGHT).toBe(28);
  expect(LANE_GAP).toBe(4);
  expect(TIMELINE_HEIGHT).toBe(120 + 3 * (LANE_HEIGHT + LANE_GAP));
  expect(TIMELINE_HEIGHT).toBe(216);
  // The two existing lanes keep their places; the effects lane is the third.
  expect(laneTop(0)).toBe(120);
  expect(laneTop(1)).toBe(120 + LANE_HEIGHT + LANE_GAP);
  expect(laneTop(2)).toBe(120 + 2 * (LANE_HEIGHT + LANE_GAP));
});
