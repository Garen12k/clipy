import { assemblePauseOutline, DEFAULT_PAUSE_CHOICE, findPauses, PAUSE_GAPS, PAUSE_QUIET, PAUSES, pausePlan, type PauseOptions, type PauseOutline } from "../pauses";

/** An outline at 100 slices a second from `[seconds, level]` segments, starting at `from`. */
function outline(from: number, segments: [number, number][]): PauseOutline {
  const n = Math.round(segments.reduce((s, [d]) => s + d, 0) * PAUSES.perSecond);
  const levels = new Float32Array(n);
  let at = 0;
  for (const [d, level] of segments) { const k = Math.round(d * PAUSES.perSecond); levels.fill(level, at, at + k); at += k; }
  return { from, to: from + n / PAUSES.perSecond, levels };
}
const OPT: PauseOptions = { minGap: 0.6, minPiece: 0.3, pad: 0.1, quietDb: -35 };
const cuts = (o: PauseOutline, opt: Partial<PauseOptions> = {}) => findPauses(o, { ...OPT, ...opt }).cuts;

describe("the numbers and the choices", () => {
  test("the constants of the spec", () => {
    expect(PAUSES).toEqual({ perSecond: 100, perCall: 2000, fewest: 16, calls: 30, longest: 600, remember: 8, pad: 0.1, minCut: 0.05, minPiece: 0.3, blip: 0.02, floor: 0.001, maxCuts: 60 });
    expect(PAUSE_GAPS.map((g) => [g.id, g.label, g.seconds])).toEqual([["short", "0.3 s", 0.3], ["medium", "0.6 s", 0.6], ["long", "1 s", 1]]);
    expect(PAUSE_GAPS.map((g) => g.spoken)).toEqual(["Longer than 0.3 seconds", "Longer than 0.6 seconds", "Longer than 1 second"]);
    expect(PAUSE_QUIET.map((q) => [q.id, q.label, q.db])).toEqual([["silent", "Silent", -45], ["quiet", "Quiet", -35], ["noisy", "Noisy Room", -25]]);
    expect(DEFAULT_PAUSE_CHOICE).toEqual({ gap: "medium", quiet: "quiet" });
  });
});

describe("pausePlan", () => {
  test("consecutive calls of at most 2000 slices over the clip's range, the last ending exactly at its end", () => {
    expect(pausePlan(0, 3)).toEqual([{ from: 0, to: 3, count: 300 }]);
    expect(pausePlan(10, 40)).toEqual([{ from: 10, to: 25, count: 1500 }, { from: 25, to: 40, count: 1500 }]);
    expect(pausePlan(0, 0.1)).toEqual([{ from: 0, to: 0.1, count: 16 }]);
    const ten = pausePlan(0, 600)!;
    expect(ten).toHaveLength(30);
    expect(ten.every((c) => c.count === 2000)).toBe(true);
    expect(ten[29].to).toBe(600);
  });
  test("nothing for a range that is too long, empty or not a number", () => {
    for (const [a, b] of [[0, 600.5], [3, 3], [4, 3], [NaN, 1], [0, Infinity]]) expect(pausePlan(a, b)).toBeNull();
  });
});

describe("assemblePauseOutline", () => {
  test("floats, unquantised, each slice at its own time in the stretch the phone read; outside it or not a number = 0", () => {
    const plan = pausePlan(0, 0.2)!;   // one call of 20
    const peaks = Array.from({ length: 20 }, (_, i) => (i === 3 ? 0.0004 : i === 4 ? NaN : 0.5));
    const o = assemblePauseOutline(plan, [{ from: 0, to: 0.2, peaks }])!;
    expect(o.from).toBe(0); expect(o.to).toBe(0.2); expect(o.levels).toHaveLength(20);
    expect(o.levels[3]).toBeCloseTo(0.0004, 7);   // a byte would have made it 0
    expect(o.levels[4]).toBe(0);
    const short = assemblePauseOutline(plan, [{ from: 0, to: 0.1, peaks: Array(10).fill(0.5) }])!;   // the file ends early
    expect(short.levels[15]).toBe(0);
  });
  test("null for answers that are not the plan's", () => {
    const plan = pausePlan(10, 40)!;
    expect(assemblePauseOutline(plan, [{ from: 10, to: 25, peaks: [0.1] }])).toBeNull();
    expect(assemblePauseOutline(plan, [{ from: 10, to: 25, peaks: [] }, { from: 25, to: 40, peaks: [0.1] }])).toBeNull();
    expect(assemblePauseOutline([], [])).toBeNull();
  });
});

describe("findPauses — the vectors", () => {
  test("a pause between two words is cut less 0.1 s of sound each side", () => {
    expect(cuts(outline(0, [[1, 0.5], [1, 0.001], [1, 0.5]]))).toEqual([[1.1, 1.9]]);
  });
  test("leading and trailing quiet is cut to the clip's exact edges", () => {
    expect(cuts(outline(5, [[0.8, 0.0005], [1.4, 0.4], [0.8, 0.0005]]))).toEqual([[5, 5.7], [7.3, 8]]);
  });
  test("the chip: a pause at least as long as it is cut", () => {
    const o = outline(0, [[1, 0.5], [0.5, 0.001], [1, 0.5]]);
    expect(cuts(o)).toEqual([]);
    expect(cuts(o, { minGap: 0.3 })).toEqual([[1.1, 1.4]]);
  });
  test("a click of 0.02 s inside a pause is bridged; 0.03 s is sound", () => {
    expect(cuts(outline(0, [[1, 0.5], [0.4, 0.001], [0.02, 0.5], [0.4, 0.001], [1, 0.5]]))).toEqual([[1.1, 1.72]]);
    expect(cuts(outline(0, [[1, 0.5], [0.4, 0.001], [0.03, 0.5], [0.4, 0.001], [1, 0.5]]))).toEqual([]);
  });
  test("what counts as quiet: room noise 28 dB under the voice is a pause only for Noisy Room", () => {
    const o = outline(0, [[1, 0.5], [1, 0.02], [1, 0.5]]);
    expect(cuts(o, { quietDb: -45 })).toEqual([]);
    expect(cuts(o, { quietDb: -35 })).toEqual([]);
    expect(cuts(o, { quietDb: -25 })).toEqual([[1.1, 1.9]]);
  });
  test("a silent clip is never cut", () => {
    expect(findPauses(outline(0, [[3, 0.0005]]), OPT)).toEqual({ cuts: [], silent: true });
    expect(findPauses(outline(0, [[3, NaN]]), OPT)).toEqual({ cuts: [], silent: true });
    expect(cuts(outline(0, [[1, 0.5], [0.5, 0.001], [0.5, NaN], [1, 0.5]]))).toEqual([[1.1, 1.9]]);
  });
  test("no piece shorter than minPiece: a cut is dropped, never sound", () => {
    expect(cuts(outline(0, [[1, 0.5], [1, 0.001], [0.05, 0.5], [1, 0.001], [1, 0.5]]))).toEqual([[1.1, 1.9]]);
    expect(cuts(outline(0, [[1, 0.5], [1, 0.001], [0.15, 0.5]]))).toEqual([]);
  });
  test("at most 60 cuts: the longest, in time order", () => {
    const segs: [number, number][] = [[0.5, 0.5]];
    for (let i = 0; i < 70; i++) segs.push([i % 7 === 0 ? 0.7 : 1, 0.001], [0.5, 0.5]);
    const got = cuts(outline(0, segs));
    expect(got).toHaveLength(60);
    for (const [a, b] of got) expect(b - a).toBeCloseTo(0.8, 6);
    for (let i = 1; i < got.length; i++) expect(got[i][0]).toBeGreaterThan(got[i - 1][1]);
  });
  test("bad options or an empty outline: nothing", () => {
    expect(findPauses(outline(0, [[1, 0.5], [1, 0.001], [1, 0.5]]), { ...OPT, minGap: NaN })).toEqual({ cuts: [], silent: false });
    expect(findPauses({ from: 0, to: 1, levels: new Float32Array(0) }, OPT)).toEqual({ cuts: [], silent: false });
  });
});
