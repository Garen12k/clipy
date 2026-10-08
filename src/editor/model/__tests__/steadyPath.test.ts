import { smoothPath, steadyShifts, type PathRule, type Shake } from "../steadyPath";

const N = 21;
const times = Array.from({ length: N }, (_, i) => i / 10);
const zeros = (): number[] => new Array<number>(N).fill(0);
const RULE: PathRule = { radius: 0.5, zoom: 1.1, cutShift: 0.2, scaleX: 1, scaleY: 1 };
/** One jolt: the picture jumps 5 % at frame 10 and is back at frame 11. */
const jolt = (): Shake => { const dx = zeros(); dx[10] = 0.05; dx[11] = -0.05; return { times, dx, dy: zeros() }; };
const near = (got: number[], want: number[]) => { expect(got).toHaveLength(want.length); got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 5)); };

test("a steady pan needs no correction at all (the window is centred and symmetric, also at the two ends)", () => {
  const pan: Shake = { times, dx: zeros().map(() => 0.01), dy: zeros().map(() => -0.004) };
  const out = steadyShifts(pan, RULE);
  expect(out.times).toEqual(times);
  near(out.dx, zeros());
  near(out.dy, zeros());
});

test("the spec's vector: one jolt is pulled back, its neighbours give a little (each number is the zoom, 1.1, times path − calm path)", () => {
  const want = zeros();
  want[10] = 0.044; want[9] = want[11] = -0.0088; want[8] = want[12] = -0.0066; want[7] = want[13] = -0.0044; want[6] = want[14] = -0.0022;
  const out = steadyShifts(jolt(), RULE);
  near(out.dx, want);
  near(out.dy, zeros());
});

// The phone zooms a frame about its centre FIRST and moves it SECOND: a point p of the picture lands at (p − c)·zoom + c + move.
// Vision measured the shake on the un-zoomed picture, so a frame that sits d off its calm place is zoom·d off on screen after
// the zoom — and only a move of zoom·d puts it back. Sending d would leave (zoom − 1)·d of every shake in: 5 / 10 / 15 %.
test("why the zoom multiplies: a shake of d on the un-zoomed picture is cancelled by a move of zoom·d", () => {
  for (const zoom of [1.3, 1.5, 2]) {                       // wide enough that the clamp is not reached
    const shake = jolt();
    const out = steadyShifts(shake, { ...RULE, zoom });
    let at = 0;
    const path = shake.dx.map((s) => (at += s));
    const calm = smoothPath(times, path, RULE.radius);
    path.forEach((p, i) => {
      const off = -(p - calm[i]);                           // where the content sits, off its calm place, before the zoom
      expect(off * zoom + out.dx[i]).toBeCloseTo(0, 4);     // zoomed about the centre, then moved: back on the calm place
    });
    expect(out.dx[10]).toBeCloseTo(0.04 * zoom, 5);
  }
});

test("the zoom multiplies before the clamp; a zoom that is no number or under 1 hides nothing, so nothing is moved", () => {
  expect(steadyShifts(jolt(), { ...RULE, zoom: 1.06 }).dx[10]).toBeCloseTo(0.03, 5);     // 0.04 × 1.06 = 0.0424, held at 0.03
  expect(steadyShifts(jolt(), { ...RULE, zoom: 1.09 }).dx[10]).toBeCloseTo(0.0436, 5);   // under its clamp of 0.045
  for (const zoom of [NaN, Infinity, 0.5, -2]) expect(steadyShifts(jolt(), { ...RULE, zoom }).dx.every((v) => v === 0)).toBe(true);
});

test("a correction never exceeds what the zoom hides: (zoom − 1) / 2 each way", () => {
  expect(steadyShifts(jolt(), { ...RULE, zoom: 1.05 }).dx[10]).toBeCloseTo(0.025, 5);
  expect(steadyShifts(jolt(), { ...RULE, zoom: 1 }).dx.every((v) => v === 0)).toBe(true);
  for (const v of steadyShifts(jolt(), { ...RULE, zoom: 1.02 }).dx) expect(Math.abs(v)).toBeLessThanOrEqual(0.01 + 1e-9);
});

test("scaleX / scaleY turn Vision's numbers: −1 flips a direction, another number rescales", () => {
  expect(steadyShifts(jolt(), { ...RULE, scaleX: -1 }).dx[10]).toBeCloseTo(-0.044, 5);
  expect(steadyShifts(jolt(), { ...RULE, scaleX: 0.5 }).dx[10]).toBeCloseTo(0.022, 5);
  const up: Shake = { times, dx: zeros(), dy: jolt().dx as number[] };
  expect(steadyShifts(up, { ...RULE, scaleY: -1 }).dy[10]).toBeCloseTo(-0.044, 5);
});

test("a step larger than cutShift on either axis is a cut, not shake: it moves nothing", () => {
  const dx = zeros(); dx[10] = 0.5;
  near(steadyShifts({ times, dx, dy: zeros() }, RULE).dx, zeros());
  const dy = zeros(); dy[10] = -0.3;
  const small = zeros(); small[10] = 0.05;                 // the same frame's other axis is dropped with it
  near(steadyShifts({ times, dx: small, dy }, RULE).dx, zeros());
});

test("a wider window pulls harder; radius 0 changes nothing", () => {
  const wide = steadyShifts(jolt(), { ...RULE, radius: 1, zoom: 1.5 }).dx[10];
  const narrow = steadyShifts(jolt(), { ...RULE, radius: 0.2, zoom: 1.5 }).dx[10];
  expect(wide).toBeGreaterThan(narrow);
  near(steadyShifts(jolt(), { ...RULE, radius: 0 }).dx, zeros());
});

test("total: nothing in, nothing out; numbers that are not numbers count as no movement; a time that does not move on is left out; no −0", () => {
  expect(steadyShifts({ times: [], dx: [], dy: [] }, RULE)).toEqual({ times: [], dx: [], dy: [] });
  expect(steadyShifts({ times: [1], dx: [0.3], dy: [0] }, RULE)).toEqual({ times: [1], dx: [0], dy: [0] });
  const odd = steadyShifts({ times: [0, 0.1, 0.1, NaN, 0.2], dx: [0, NaN, 0.01, 0.01, 0], dy: [0, 0, Infinity, 0, 0] }, RULE);
  expect(odd.times).toEqual([0, 0.1, 0.2]);
  for (const v of [...odd.dx, ...odd.dy]) { expect(Number.isFinite(v)).toBe(true); expect(Object.is(v, -0)).toBe(false); }
  expect(steadyShifts({ times, dx: [0.01], dy: [] }, RULE).times).toEqual([]);          // the shortest list decides
});

test("smoothPath by itself: the ends are the path, the middle is its weighted mean", () => {
  expect(smoothPath([], [], 1)).toEqual([]);
  const path = [0, 0, 1, 0, 0];
  const out = smoothPath([0, 1, 2, 3, 4], path, 2);
  expect(out[0]).toBe(0);
  expect(out[4]).toBe(0);
  expect(out[2]).toBeCloseTo(1 / 2, 9);                    // weights 0, 0.5, 1, 0.5, 0
  expect(out[1]).toBeCloseTo(0, 9);                        // r = 1 there: weights 0, 1, 0
});

// ---- beyond the brief's list: the same maths from more sides ----

test("a camera that does not move is not moved, at every strength", () => {
  const still: Shake = { times, dx: zeros(), dy: zeros() };
  for (const [radius, zoom] of [[0.25, 1.05], [0.5, 1.1], [1, 1.15]]) {
    const out = steadyShifts(still, { ...RULE, radius, zoom });
    expect(out.dx).toEqual(zeros());
    expect(out.dy).toEqual(zeros());
  }
});

test("a jitter around a pan is taken out and the pan is kept: what is left moves almost evenly", () => {
  const n = 61, pan = 0.01, shake = 0.004;
  const t = Array.from({ length: n }, (_, i) => i / 10);
  const dx = t.map((_, i) => (i === 0 ? 0 : pan + (i % 2 === 1 ? shake : -shake)));
  const out = steadyShifts({ times: t, dx, dy: t.map(() => 0) }, { ...RULE, zoom: 1.5 });
  let at = 0;
  const path = dx.map((s) => (at += s));
  const left = path.map((p, i) => p - out.dx[i] / 1.5);    // where the picture is after its correction (the move is in zoomed units)
  for (let i = 6; i < n - 5; i++) {                        // away from the ends, where the window is whole
    expect(Math.abs(left[i] - left[i - 1] - pan)).toBeLessThan(shake * 0.1);
    expect(Math.abs(out.dx[i]) / 1.5).toBeGreaterThan(shake * 0.4);   // and the frames really are moved
  }
});

test("the two axes do not touch each other", () => {
  const out = steadyShifts(jolt(), RULE);
  const turned = steadyShifts({ times, dx: zeros(), dy: jolt().dx as number[] }, RULE);
  expect(turned.dy).toEqual(out.dx);
  expect(turned.dx).toEqual(zeros());
});

test("after a cut each side is steadied by itself: a jolt long after the cut is corrected as if there were no cut", () => {
  const n = 41;
  const t = Array.from({ length: n }, (_, i) => i / 10);
  const dx = new Array<number>(n).fill(0); dx[10] = 0.6; dx[30] = 0.05; dx[31] = -0.05;
  const out = steadyShifts({ times: t, dx, dy: new Array<number>(n).fill(0) }, RULE).dx;
  expect(out[30]).toBeCloseTo(0.044, 5);
  for (let i = 0; i <= 20; i++) expect(out[i]).toBe(0);
});

test("uneven frame times: the pan is still followed when its steps match the time that passed", () => {
  const t = [0, 0.03, 0.11, 0.2, 0.24, 0.4, 0.41, 0.55, 0.7, 0.72, 0.9, 1.0, 1.3, 1.31, 1.5];
  const dx = t.map((v, i) => (i === 0 ? 0 : (v - t[i - 1]) * 0.1));
  const out = steadyShifts({ times: t, dx, dy: t.map(() => 0) }, { ...RULE, radius: 0.1, zoom: 2 });
  for (const v of out.dx) expect(Number.isFinite(v)).toBe(true);
  expect(out.dx[0]).toBe(0);
  expect(out.dx[t.length - 1]).toBe(0);
});

test("a rule that is not numbers never throws and never gives NaN; every answer is inside the clamp and has five decimals", () => {
  const wild: Shake = { times, dx: times.map((_, i) => Math.sin(i * 7.3) * 0.15), dy: times.map((_, i) => Math.cos(i * 3.1) * 0.15) };
  const rules: PathRule[] = [
    { radius: NaN, zoom: NaN, cutShift: NaN, scaleX: NaN, scaleY: NaN },
    { radius: Infinity, zoom: Infinity, cutShift: Infinity, scaleX: Infinity, scaleY: -Infinity },
    { radius: -1, zoom: 0.5, cutShift: -1, scaleX: 0, scaleY: 0 },
    { radius: 1e9, zoom: 1.15, cutShift: 0, scaleX: 1e9, scaleY: -1e9 },
    {} as PathRule,
  ];
  for (const rule of rules) {
    const out = steadyShifts(wild, rule);
    expect(out.times).toEqual(times);
    expect(out.dx).toHaveLength(N);
    expect(out.dy).toHaveLength(N);
    for (const v of [...out.dx, ...out.dy]) { expect(Number.isFinite(v)).toBe(true); expect(Object.is(v, -0)).toBe(false); }
  }
  const out = steadyShifts(wild, { ...RULE, zoom: 1.15, scaleX: 50 });
  for (const v of out.dx) {
    expect(Math.abs(v)).toBeLessThanOrEqual(0.075);
    expect(Math.round(v * 1e5) / 1e5).toBe(v);
  }
  expect(out.dx.some((v) => Math.abs(v) === 0.075)).toBe(true);   // the clamp was reached, and held
});

test("the lists given are not changed, and the answer's lists are new ones", () => {
  const shake = jolt();
  const before = JSON.stringify(shake);
  const out = steadyShifts(shake, RULE);
  expect(JSON.stringify(shake)).toBe(before);
  expect(out.times).not.toBe(shake.times);
});

test("the longest copy (64 s at 120 a second, the widest window) is answered whole, with no clock in the test", () => {
  const n = 7680;
  const t = Array.from({ length: n }, (_, i) => i / 120);
  const dx = t.map((_, i) => Math.sin(i * 1.7) * 0.003);
  const out = steadyShifts({ times: t, dx, dy: dx }, { ...RULE, radius: 1, zoom: 1.15 });
  expect(out.times).toHaveLength(n);
  expect(out.dx).toEqual(out.dy);
  expect(out.dx.every((v) => Number.isFinite(v) && Math.abs(v) <= 0.075)).toBe(true);
  expect(out.dx.some((v) => v !== 0)).toBe(true);
}, 30000);
