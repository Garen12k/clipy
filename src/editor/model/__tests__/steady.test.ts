import { cutoutFileName } from "../cutout";
import { coveringSteady, levelRule, neededSteady, parseSteadyName, SMOOTH, SMOOTH_MARK, STEADY, STEADY_LEVELS, STEADY_PREVIEW, STEADY_VERSION, steadyBitRate, steadyBytes, steadyDeadlineMs, steadyFileName, steadyNeed, steadyOf, steadyRefusal } from "../steady";
import { makeClip, makeLayer, makePhotoClip, makeProject, type Clip } from "../types";

const MEDIA = "file:///doc/projects/p1/media";
const clip = (extra: Partial<Clip> = {}): Clip => makeClip({ id: "a", sourceDuration: 30, sourceUri: `${MEDIA}/abc.mov`, trimStart: 4.2, trimEnd: 9.7, width: 1080, height: 1920, ...extra });

test("the numbers", () => {
  expect(STEADY_VERSION).toBe(1);
  expect(STEADY).toEqual({ maxSeconds: 60, maxSide: 1920, minFrameGap: 0.008, measureSide: 512, bitsPerPixel: 0.12, blendFloor: 0.02, cutShift: 0.2, scaleX: 1, scaleY: 1, measureShare: 0.4 });
  expect(STEADY_LEVELS).toEqual({ low: { level: 1, zoom: 1.05, radius: 0.25 }, medium: { level: 2, zoom: 1.1, radius: 0.5 }, high: { level: 3, zoom: 1.15, radius: 1 } });
  expect(SMOOTH).toEqual({ fullGrid: 60, slowGrid: 120, slowBelow: 0.5, cutDifference: 0.12 });
  // The mark carries the threshold (another threshold = another mark = the smooth copies are made again) and is never a copy's name.
  expect(SMOOTH_MARK).toBe("cuts-120");
  expect(parseSteadyName(SMOOTH_MARK)).toBeNull();
  expect(STEADY_PREVIEW).toEqual({ layerVideo: true, mainVideo: true });
  expect(levelRule(2)).toEqual({ zoom: 1.1, radius: 0.5 });
  expect(levelRule(0)).toBeNull();
  expect(levelRule(7)).toBeNull();
});

test("steadyOf: one setting for both tools, and null for a clip that has no copy", () => {
  expect(steadyOf(clip())).toBeNull();
  expect(steadyOf(clip({ stabilize: "low" }))).toEqual({ level: 1, grid: 0 });
  expect(steadyOf(clip({ stabilize: "high", speed: 0.5 }))).toEqual({ level: 3, grid: 0 });             // slowed, but the switch is off
  expect(steadyOf(clip({ smooth: true, speed: 0.5 }))).toEqual({ level: 0, grid: 60 });
  expect(steadyOf(clip({ smooth: true, speed: 0.75 }))).toEqual({ level: 0, grid: 60 });
  expect(steadyOf(clip({ smooth: true, speed: 0.45 }))).toEqual({ level: 0, grid: 120 });
  expect(steadyOf(clip({ smooth: true, speed: 0.25, stabilize: "medium" }))).toEqual({ level: 2, grid: 120 });
  expect(steadyOf(clip({ smooth: true, speed: 1 }))).toBeNull();                                         // the switch is idle
  expect(steadyOf(clip({ smooth: true, speed: 2, stabilize: "low" }))).toEqual({ level: 1, grid: 0 });
  expect(steadyOf(clip({ stabilize: "low", reversed: true }))).toBeNull();
  expect(steadyOf(clip({ stabilize: "low", cutout: true }))).toBeNull();
  expect(steadyOf({ ...clip(), stabilize: "extreme" } as unknown as Clip)).toBeNull();
  expect(steadyOf({ ...makePhotoClip({ id: "p" }), stabilize: "low", smooth: true } as Clip)).toBeNull();
});

test("the spec's table: names hold the version, the strength, the grid and the range in milliseconds", () => {
  expect(steadyNeed(clip({ stabilize: "medium" }), [])).toEqual({ name: "abc-s1-2-0-2000-12000.mov", sourceUri: `${MEDIA}/abc.mov`, level: 2, grid: 0, from: 2, to: 12, bitRate: 7464960 });
  expect(steadyNeed(clip({ stabilize: "medium", smooth: true, speed: 0.5 }), [])?.name).toBe("abc-s1-2-60-2000-12000.mov");
  expect(steadyNeed(clip({ smooth: true, speed: 0.25 }), [])?.name).toBe("abc-s1-0-120-2000-12000.mov");
  expect(steadyNeed(clip({ smooth: true }), [])).toBeNull();
  expect(steadyNeed(clip(), [])).toBeNull();
  expect(steadyFileName(`${MEDIA}/abc.mov`, { level: 1, grid: 0 }, 12, 2)).toBe("abc-s1-1-0-2000-12000.mov");      // the two ends are written in order
});

test("a steady copy's stem is the cut-out copy's stem for the same file", () => {
  for (const uri of [`${MEDIA}/abc.mov`, `${MEDIA}/my clip (1).MOV`, `${MEDIA}/part-x.mp4`, `${MEDIA}/${"z".repeat(120)}.mov`]) {
    const stem = cutoutFileName(uri, true).replace(/-c1-photo\.png$/, "");
    expect(steadyFileName(uri, { level: 1, grid: 0 }, 0, 1)).toBe(`${stem}-s1-1-0-0-1000.mov`);
  }
});

test("parseSteadyName reads back exactly what steadyFileName writes, and nothing else", () => {
  expect(parseSteadyName("abc-s1-2-60-2000-12000.mov")).toEqual({ stem: "abc", level: 2, grid: 60, from: 2, to: 12 });
  for (const bad of ["part-abc-s1-2-60-2000-12000.mov", "abc-s2-2-60-2000-12000.mov", "abc-s1-0-0-2000-12000.mov", "abc-s1-4-0-2000-12000.mov", "abc-s1-2-060-2000-12000.mov",
    "abc-s1-2-60-12000-2000.mov", "abc-s1-2-60-2000-2000.mov", "abc-c1-2000-12000.mov", "abc-s1-2-60-2000-12000.mp4", ""]) expect(parseSteadyName(bad)).toBeNull();
});

test("a clip uses the smallest known copy of ITS setting that holds its trim and its transition handles", () => {
  const c = clip({ stabilize: "medium" });
  const own = "abc-s1-2-0-2000-12000.mov", whole = "abc-s1-2-0-0-30000.mov";
  expect(coveringSteady([whole, own], c, { level: 2, grid: 0 })).toBe(own);
  expect(coveringSteady([whole], c, { level: 2, grid: 0 })).toBe(whole);
  expect(coveringSteady(["abc-s1-3-0-2000-12000.mov", "abc-s1-2-60-2000-12000.mov", "xyz-s1-2-0-2000-12000.mov"], c, { level: 2, grid: 0 })).toBeNull();   // another strength, another grid, another file
  expect(steadyNeed(clip({ stabilize: "medium", trimStart: 5, trimEnd: 9 }), [own])?.name).toBe(own);                 // trimmed inwards: the same copy
  expect(steadyNeed(clip({ stabilize: "medium", trimStart: 2, trimEnd: 9 }), [own])?.name).toBe("abc-s1-2-0-0-11000.mov");   // the head handle (0.5 s at 1×) leaves the copy
  expect(steadyNeed(clip({ stabilize: "medium", speed: 4 }), [own])?.name).toBe(own);                                  // 2 s handles: 2.2 – 11.7, still inside
});

test("only a video over 60 seconds of trimmed source is refused; the project's needs leave out what cannot be served", () => {
  expect(steadyRefusal(clip({ stabilize: "low" }))).toBeNull();
  expect(steadyRefusal(makeClip({ id: "l", sourceDuration: 200, stabilize: "low" }))).toBe("tooLong");
  expect(steadyRefusal(makeClip({ id: "l", sourceDuration: 200, trimEnd: 60, stabilize: "low" }))).toBeNull();
  const p = makeProject({
    clips: [clip({ stabilize: "medium" }), clip({ id: "b", stabilize: "medium", trimStart: 5, trimEnd: 9 }), clip({ id: "c" }),
      makeClip({ id: "long", sourceDuration: 200, sourceUri: `${MEDIA}/long.mov`, stabilize: "low" }), makeClip({ id: "gone", sourceDuration: 8, sourceUri: `${MEDIA}/gone.mov`, stabilize: "low" })],
    layers: [makeLayer({ id: "L", sourceDuration: 6, sourceUri: `${MEDIA}/l.mov`, speed: 0.5, smooth: true })],
  });
  expect(neededSteady(p, [`${MEDIA}/gone.mov`], []).map((n) => n.name)).toEqual(["abc-s1-2-0-2000-12000.mov", "abc-s1-2-0-3000-11000.mov", "l-s1-0-60-0-6000.mov"]);
  expect(neededSteady(p, [`${MEDIA}/gone.mov`], ["abc-s1-2-0-2000-12000.mov"]).map((n) => n.name)).toEqual(["abc-s1-2-0-2000-12000.mov", "l-s1-0-60-0-6000.mov"]);
});

test("the bitrate grows with the grid; bytes and deadlines with the range", () => {
  expect(steadyBitRate(1080, 1920, 0)).toBe(7464960);
  expect(steadyBitRate(1080, 1920, 60)).toBe(10450944);
  expect(steadyBitRate(1080, 1920, 120)).toBe(14929920);
  expect(steadyBitRate(2160, 3840, 0)).toBe(7464960);                    // the copy is at most 1920 on its long side
  expect(steadyBitRate(64, 64, 0)).toBe(1000000);
  const c = clip({ trimStart: 0, trimEnd: 10 });                         // a 12-second copy
  expect(steadyBytes(c, { level: 2, grid: 0 })).toBe(11389440);
  expect(steadyBytes(c, { level: 0, grid: 60 })).toBe(15868416);
  expect(steadyBytes(c, { level: 2, grid: 120 })).toBe(22586880);
  expect(steadyDeadlineMs({ from: 2, to: 12 })).toEqual({ measure: 160000, render: 360000 });
  expect(steadyDeadlineMs({ from: 0, to: 64 })).toEqual({ measure: 700000, render: 1980000 });
});
