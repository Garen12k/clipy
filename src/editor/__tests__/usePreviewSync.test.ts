import { makeClip, makeProject } from "@/src/editor/model/types";
import { clipAt } from "@/src/editor/model/timeline";
import { nextPlayheadFromPlayer } from "../usePreviewSync";

const a = makeClip({ id: "a", sourceDuration: 10, trimStart: 2, trimEnd: 5 }); // 3 s
const b = makeClip({ id: "b", sourceDuration: 8, trimStart: 1, trimEnd: 3 }); // 2 s
const c = makeClip({ id: "c", sourceDuration: 8 });                           // 8 s
const p = makeProject({ clips: [a, b, c] });

test("maps the player's source time back to the output timeline", () => {
  const hit = clipAt(p, 1)!; // in a
  expect(nextPlayheadFromPlayer(p, hit, 3.5, [])).toEqual({ playhead: 1.5, ended: false });
});

test("advances to the next clip when the trimmed end is reached", () => {
  const hit = clipAt(p, 1)!;
  expect(nextPlayheadFromPlayer(p, hit, 5.0, [])).toEqual({ playhead: 3, ended: false });
});

test("skips missing clips", () => {
  const hit = clipAt(p, 1)!;
  expect(nextPlayheadFromPlayer(p, hit, 5.2, ["b"])).toEqual({ playhead: 5, ended: false });
});

test("ends at the end of the last clip", () => {
  const hit = clipAt(p, 6)!; // in c
  expect(nextPlayheadFromPlayer(p, hit, 8.1, [])).toEqual({ playhead: 13, ended: true });
});
