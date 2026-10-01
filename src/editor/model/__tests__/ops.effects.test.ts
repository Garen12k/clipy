jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeProject } from "../types";
import { deleteClip, duplicateClip, moveClip, setClipFilter, setClipSpeed, setFilterForAllClips, setTransition, splitClipAt, transitionCap, trimClip } from "../ops";

const a = makeClip({ id: "a", sourceDuration: 4 });   // 4 s
const b = makeClip({ id: "b", sourceDuration: 1 });   // 1 s
const c = makeClip({ id: "c", sourceDuration: 6 });   // 6 s
const p = makeProject({ clips: [a, b, c] });

test("setClipSpeed clamps and keeps output ≥ 0.1 s", () => {
  expect(setClipSpeed(p, "a", 9).clips[0].speed).toBe(4);
  expect(setClipSpeed(p, "a", 0.1).clips[0].speed).toBe(0.25);
  expect(setClipSpeed(p, "a", 1)).toBe(p);
  const tiny = makeProject({ clips: [makeClip({ id: "t", sourceDuration: 0.3 })] });
  expect(setClipSpeed(tiny, "t", 4).clips[0].speed).toBe(3);   // 0.3 / 3 = 0.1
});

test("filters", () => {
  expect(setClipFilter(p, "a", "warm").clips[0].filter).toBe("warm");
  expect(setClipFilter(p, "a", "none").clips[0].filter).toBeNull();
  expect(setClipFilter(p, "a", null)).toBe(p);
  expect(setFilterForAllClips(p, "mono").clips.map((x) => x.filter)).toEqual(["mono", "mono", "mono"]);
});

test("transitionCap and setTransition", () => {
  expect(transitionCap(p, 0)).toBe(0.5);   // min(4,1)/2
  expect(transitionCap(p, 1)).toBe(0.5);   // min(1,6)/2
  expect(transitionCap(p, 2)).toBe(0);     // last clip
  expect(setTransition(p, "a", { type: "fade", duration: 2 }).clips[0].transitionOut).toEqual({ type: "fade", duration: 0.5 });
  expect(setTransition(p, "a", { type: "fade", duration: 0.1 }).clips[0].transitionOut).toEqual({ type: "fade", duration: 0.3 });
  expect(setTransition(p, "a", { type: "none", duration: 0.7 }).clips[0].transitionOut).toEqual({ type: "none", duration: 0 });
  expect(setTransition(p, "c", { type: "fade", duration: 0.5 })).toBe(p);          // last clip
  const short = makeProject({ clips: [makeClip({ id: "s", sourceDuration: 0.4 }), a] });
  expect(setTransition(short, "s", { type: "fade", duration: 0.5 })).toBe(short);  // cap 0.2 < 0.3
});

test("speed changes re-cap transitions; delete/move clear the last clip's transition", () => {
  const withT = setTransition(setTransition(p, "a", { type: "dissolve", duration: 0.5 }), "b", { type: "fade", duration: 0.5 });
  const faster = setClipSpeed(withT, "b", 4); // b → 0.25 s → cap 0.125 < 0.3 → both neighbouring transitions cleared
  expect(faster.clips[0].transitionOut.type).toBe("none");
  expect(faster.clips[1].transitionOut.type).toBe("none");
  const noC = deleteClip(withT, "c");
  expect(noC.clips[1].transitionOut).toEqual({ type: "none", duration: 0 });   // b is now last
  const moved = moveClip(withT, "a", 2);                                        // a becomes last
  expect(moved.clips[2].transitionOut).toEqual({ type: "none", duration: 0 });
});

test("split and duplicate", () => {
  const withT = setTransition(p, "a", { type: "zoom", duration: 0.4 });
  const split = splitClipAt(withT, 2);
  expect(split.clips[0].transitionOut).toEqual({ type: "none", duration: 0 });
  expect(split.clips[1].transitionOut).toEqual({ type: "zoom", duration: 0.4 });
  expect(duplicateClip(withT, "a").clips[1].transitionOut).toEqual({ type: "none", duration: 0 });
});

test("split re-caps transitions on both sides of the shortened halves", () => {
  const long = makeClip({ id: "l", sourceDuration: 4 });
  const withT = setTransition(makeProject({ clips: [long, c] }), "l", { type: "fade", duration: 0.4 });
  const nearEnd = splitClipAt(withT, 3.7);                 // right half 0.3 s → cap 0.15 < 0.3 → cleared
  expect(nearEnd.clips[1]).toMatchObject({ trimStart: 3.7 });
  expect(nearEnd.clips[1].transitionOut).toEqual({ type: "none", duration: 0 });
  const capped = splitClipAt(withT, 3.3);                  // right half 0.7 s → cap 0.35 → 0.4 capped to 0.35
  expect(capped.clips[1].transitionOut).toEqual({ type: "fade", duration: 0.35 });
  const prevT = setTransition(makeProject({ clips: [a, long, c] }), "a", { type: "dissolve", duration: 0.5 });
  const leftShort = splitClipAt(prevT, 4.7);               // l's left half is 0.7 s → a's transition into it capped to 0.35
  expect(leftShort.clips[0].transitionOut).toEqual({ type: "dissolve", duration: 0.35 });
});

test("trimClip minimum enforces 0.1 s OUTPUT, scaled by speed", () => {
  const fast = makeClip({ id: "f", sourceDuration: 4, trimStart: 0, trimEnd: 4, speed: 4 });
  const fastP = makeProject({ clips: [fast] });
  expect(trimClip(fastP, "f", 0, 0.2)).toBe(fastP);   // 0.2 s source / speed 4 = 0.05 s output < 0.1
  const trimmed = trimClip(fastP, "f", 0, 0.4);       // 0.4 s source / speed 4 = 0.1 s output
  expect(trimmed).not.toBe(fastP);
  expect(trimmed.clips[0]).toMatchObject({ trimStart: 0, trimEnd: 0.4 });
});
