jest.mock("@/modules/clipy-video", () => ({ isSoundAvailable: jest.fn(() => true), probeNoiseReduction: jest.fn() }));
import { isSoundAvailable, probeNoiseReduction } from "@/modules/clipy-video";
import { NOISE_PROBE_CRASHED, NOISE_PROBE_KEY, resetNoiseProbe, runNoiseProbe } from "../noiseProbe";

type Store = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void };
const g = globalThis as unknown as { localStorage: Store; __DEV__: boolean };
const real = g.localStorage;
const probe = jest.mocked(probeNoiseReduction);
const URI = "file:///media/v.m4a";
const ANSWER = { ok: true, stage: "render", detail: "frames 220500 outputRms 0.05 latency 0" };
const stored = () => real.getItem(NOISE_PROBE_KEY);
const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
/** The app is started again: the once-per-start flag is new, what is stored stays. */
const nextSession = () => { resetNoiseProbe(); probe.mockClear(); log.mockClear(); };
let log: jest.SpiedFunction<typeof console.log>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isSoundAvailable).mockReturnValue(true);
  probe.mockImplementation(async () => ANSWER);
  log = jest.spyOn(console, "log").mockImplementation(() => {});
  g.localStorage = real;
  real.removeItem(NOISE_PROBE_KEY);
  resetNoiseProbe();
});
afterEach(() => { log.mockRestore(); g.localStorage = real; real.removeItem(NOISE_PROBE_KEY); });

test("the key and the sentence for a probe that did not come back are fixed", () => {
  expect(NOISE_PROBE_KEY).toBe("clipy.noiseProbe.v1");
  expect(NOISE_PROBE_CRASHED).toBe('{"ok":false,"stage":"crash","detail":"the previous probe did not return"}');
});

test("the first time: 'started' is stored BEFORE the native call, the answer after it, and the answer is logged", async () => {
  const seen: (string | null)[] = [];
  probe.mockImplementationOnce(async () => { seen.push(stored()); return ANSWER; });
  runNoiseProbe(URI);
  expect(probe).toHaveBeenCalledWith(URI);
  expect(seen).toEqual(["started"]);
  expect(stored()).toBe("started");                                  // not answered yet
  await flush();
  expect(stored()).toBe(JSON.stringify(ANSWER));
  expect(log.mock.calls).toEqual([["[noise-probe]", JSON.stringify(ANSWER)]]);
  runNoiseProbe(URI);                                                // the same app start: nothing more
  await flush();
  expect(probe).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledTimes(1);
});

test("a later app start with an answer stored: it is logged once as stored, and the probe is NOT run again", async () => {
  runNoiseProbe(URI);
  await flush();
  for (let i = 0; i < 2; i++) {
    nextSession();
    runNoiseProbe(URI);
    runNoiseProbe(URI);
    await flush();
    expect(probe).not.toHaveBeenCalled();
    expect(log.mock.calls).toEqual([["[noise-probe]", "(stored)", JSON.stringify(ANSWER)]]);
    expect(stored()).toBe(JSON.stringify(ANSWER));
  }
});

test("the app closed while the probe ran: the next starts log a crash, once each, and never run it again", async () => {
  probe.mockImplementationOnce(() => new Promise(() => {}));        // never comes back: the app is gone
  runNoiseProbe(URI);
  await flush();
  expect(stored()).toBe("started");
  expect(log).not.toHaveBeenCalled();
  for (let i = 0; i < 2; i++) {
    nextSession();
    runNoiseProbe(URI);
    runNoiseProbe(URI);
    await flush();
    expect(probe).not.toHaveBeenCalled();
    expect(log.mock.calls).toEqual([["[noise-probe]", NOISE_PROBE_CRASHED]]);
    expect(stored()).toBe("started");
  }
});

test("a probe that rejects, or a wrapper that throws at once, has come back: its answer is stored and logged, nothing is thrown", async () => {
  probe.mockRejectedValueOnce(new Error("boom"));
  expect(() => runNoiseProbe(URI)).not.toThrow();
  await flush();
  const failed = JSON.stringify({ ok: false, stage: "call", detail: "boom" });
  expect(stored()).toBe(failed);
  expect(log.mock.calls).toEqual([["[noise-probe]", failed]]);

  real.removeItem(NOISE_PROBE_KEY);
  nextSession();
  probe.mockImplementationOnce(() => { throw new Error("This build of the app has no sound tools yet."); });
  expect(() => runNoiseProbe(URI)).not.toThrow();
  const thrown = JSON.stringify({ ok: false, stage: "call", detail: "This build of the app has no sound tools yet." });
  expect(stored()).toBe(thrown);
  expect(log.mock.calls).toEqual([["[noise-probe]", thrown]]);
});

test("storage that fails: the probe is not run at all, and nothing is logged or thrown", async () => {
  const broken: Store[] = [
    { getItem: () => { throw new Error("disk"); }, setItem: () => {}, removeItem: () => {} },               // cannot be read
    { getItem: () => null, setItem: () => { throw new Error("disk"); }, removeItem: () => {} },             // cannot be written
    { getItem: () => null, setItem: () => {}, removeItem: () => {} },                                       // a write that does not stay
  ];
  for (const store of broken) {
    nextSession();
    g.localStorage = store;
    expect(() => runNoiseProbe(URI)).not.toThrow();
    await flush();
    expect(probe).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  }
  nextSession();
  (g as { localStorage?: Store }).localStorage = undefined as never;                                        // no storage at all
  expect(() => runNoiseProbe(URI)).not.toThrow();
  expect(probe).not.toHaveBeenCalled();
});

test("an answer that cannot be stored afterwards is still logged, and nothing is thrown", async () => {
  let value: string | null = null;
  g.localStorage = { getItem: () => value, setItem: (_k, v) => { if (v !== "started") throw new Error("full"); value = v; }, removeItem: () => {} };
  runNoiseProbe(URI);
  await flush();
  expect(log.mock.calls).toEqual([["[noise-probe]", JSON.stringify(ANSWER)]]);
  expect(value).toBe("started");
});

test("outside a development session, or without the engine: nothing is stored, run or logged", async () => {
  jest.mocked(isSoundAvailable).mockReturnValue(false);
  runNoiseProbe(URI);
  const was = g.__DEV__;
  g.__DEV__ = false;
  try {
    jest.mocked(isSoundAvailable).mockReturnValue(true);
    runNoiseProbe(URI);
  } finally { g.__DEV__ = was; }
  await flush();
  expect(probe).not.toHaveBeenCalled();
  expect(stored()).toBeNull();
  expect(log).not.toHaveBeenCalled();
  // Neither counted as this start's one run: with both, it runs.
  runNoiseProbe(URI);
  await flush();
  expect(probe).toHaveBeenCalledTimes(1);
});
