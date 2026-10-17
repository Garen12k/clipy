import { HOME_PREFS_KEY, loadHomePrefs, saveHomePrefs } from "../homePrefs";

const put = (v: unknown) => localStorage.setItem(HOME_PREFS_KEY, typeof v === "string" ? v : JSON.stringify(v));
const stored = () => JSON.parse(localStorage.getItem(HOME_PREFS_KEY) ?? "null");
const DEFAULTS = { sort: "edited", pins: [] };
beforeEach(() => localStorage.removeItem(HOME_PREFS_KEY));

test("nothing stored: Last edited and no pins", () => {
  expect(loadHomePrefs()).toEqual(DEFAULTS);
});

test("a round trip, as version 1", () => {
  expect(saveHomePrefs({ sort: "name", pins: ["a", "b"] })).toBe(true);
  expect(stored()).toEqual({ version: 1, sort: "name", pins: ["a", "b"] });
  expect(loadHomePrefs()).toEqual({ sort: "name", pins: ["a", "b"] });
});

test.each(["{not json", "[]", "null", "3", JSON.stringify({ sort: "name" }), JSON.stringify({ version: 0, sort: "name" }), JSON.stringify({ version: 1.5, sort: "name" }), JSON.stringify({ version: "1", sort: "name" })])(
  "damaged (%s): the defaults, and the next save overwrites it", (bad) => {
    put(bad);
    expect(loadHomePrefs()).toEqual(DEFAULTS);
    expect(saveHomePrefs({ sort: "length", pins: [] })).toBe(true);
    expect(stored()).toEqual({ version: 1, sort: "length", pins: [] });
  });

test("written by a newer Clipy: the defaults, and NEVER overwritten", () => {
  const newer = JSON.stringify({ version: 2, sort: "name", pins: ["a"], folders: [] });
  put(newer);
  expect(loadHomePrefs()).toEqual(DEFAULTS);
  expect(saveHomePrefs({ sort: "length", pins: ["b"] })).toBe(false);
  expect(localStorage.getItem(HOME_PREFS_KEY)).toBe(newer);
});

test("version 1 with a sort it does not know: the default sort, the pins kept; pins that are not a list: none", () => {
  put({ version: 1, sort: "size", pins: ["a"] });
  expect(loadHomePrefs()).toEqual({ sort: "edited", pins: ["a"] });
  put({ version: 1, sort: "name", pins: "a" });
  expect(loadHomePrefs()).toEqual({ sort: "name", pins: [] });
});

test("pins are cleaned: only strings of 1 to 64 characters, each once, in their order", () => {
  put({ version: 1, sort: "name", pins: ["a", 3, "", "x".repeat(65), "a", null, "b", "x".repeat(64)] });
  expect(loadHomePrefs().pins).toEqual(["a", "b", "x".repeat(64)]);
});

test("storage that throws: the defaults, nothing written, no crash", () => {
  const g = globalThis as unknown as { localStorage: unknown };
  const real = g.localStorage;
  g.localStorage = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); }, removeItem: () => {} };
  try {
    expect(loadHomePrefs()).toEqual(DEFAULTS);
    expect(saveHomePrefs({ sort: "name", pins: [] })).toBe(false);
  } finally { g.localStorage = real; }
});
