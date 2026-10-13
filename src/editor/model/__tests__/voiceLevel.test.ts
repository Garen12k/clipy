import { levelBars, quietSince, tooQuiet, VOICE_COUNT, VOICE_LEVEL } from "../voiceLevel";

test("the numbers: 3 … 1 a second apart; 8 bars from −50 dB to −5 dB, read 10 times a second; 3 s of silence is too quiet", () => {
  expect(VOICE_COUNT).toEqual({ from: 3, stepMs: 1000 });
  expect(VOICE_LEVEL).toEqual({ bars: 8, floorDb: -50, topDb: -5, sampleMs: 100, quietMs: 3000 });
  expect(1000 / VOICE_LEVEL.sampleMs).toBeLessThanOrEqual(10);
});

test("levelBars: −50 dB and under is no bar, −5 dB and over is all eight, evenly in between", () => {
  expect(levelBars(-160)).toBe(0);
  expect(levelBars(-50)).toBe(0);
  expect(levelBars(-5)).toBe(8);
  expect(levelBars(0)).toBe(8);
  expect(levelBars(12)).toBe(8);
  expect(levelBars(-27.5)).toBe(4);            // the middle
  expect(levelBars(-44.375)).toBe(1);          // one bar is 5.625 dB
  expect(levelBars(-10.625)).toBe(7);
  expect(levelBars(-47.1)).toBe(1);            // rounded to the nearest bar …
  expect(levelBars(-47.3)).toBe(0);            // … so the first lights from half a bar above the floor
  let before = 0;
  for (let db = -60; db <= 0; db += 0.5) { const b = levelBars(db); expect(b).toBeGreaterThanOrEqual(before); expect(Number.isInteger(b)).toBe(true); before = b; }
});

test("levelBars: a level that is not a number lights nothing; minus infinity is silence", () => {
  expect(levelBars(NaN)).toBe(0);
  expect(levelBars(-Infinity)).toBe(0);
  expect(levelBars(Infinity)).toBe(8);
});

test("the quiet rule: quiet = no bar lit; the stretch begins with the first quiet sample and ends with the first sound", () => {
  expect(quietSince(null, -60, 1000)).toBe(1000);
  expect(quietSince(1000, -80, 1100)).toBe(1000);      // still the same stretch
  expect(quietSince(1000, -30, 1200)).toBeNull();      // heard
  expect(quietSince(null, -30, 1300)).toBeNull();
  expect(quietSince(null, -47.3, 1400)).toBe(1400);    // the same line as the first bar
  expect(quietSince(1000, -47.1, 1500)).toBeNull();
  expect(quietSince(1000, NaN, 1600)).toBe(1000);      // no reading changes nothing
  expect(quietSince(null, NaN, 1600)).toBeNull();
});

test("too quiet only once the stretch is 3 s long", () => {
  expect(tooQuiet(null, 99999)).toBe(false);
  expect(tooQuiet(1000, 3999)).toBe(false);
  expect(tooQuiet(1000, 4000)).toBe(true);
  expect(tooQuiet(1000, 9000)).toBe(true);
});
