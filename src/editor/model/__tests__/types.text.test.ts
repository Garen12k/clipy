import {
  clampCaptionWords, clampTextStyle, DEFAULT_GLOW, DEFAULT_SHADOW, DEFAULT_TEXT_STYLE, isHexColor, makeOverlay, makeProject, SCHEMA_VERSION, TEXT_STYLE_LIMITS,
} from "../types";
import { linesToCaptions } from "../captions";

test("schema is v10", () => expect(SCHEMA_VERSION).toBe(10));

test("defaults match the spec", () => {
  expect(DEFAULT_TEXT_STYLE).toEqual({ opacity: 1, letterSpacing: 0, lineSpacing: 1, outlineColor: null, outlineWidth: 1, shadow: null, glow: null });
  expect(DEFAULT_SHADOW).toEqual({ color: "#000000", opacity: 0.6, distance: 0.06, blur: 0.1 });
  expect(DEFAULT_GLOW).toEqual({ color: "#FFFFFF", size: 0.25 });
  expect(TEXT_STYLE_LIMITS.lineSpacing).toEqual([0.8, 2]);
});

test("isHexColor accepts only #RRGGBB", () => {
  expect(isHexColor("#a1B2c3")).toBe(true);
  for (const v of ["#fff", "a1b2c3", "#12345G", 5, null, undefined]) expect(isHexColor(v)).toBe(false);
});

describe("clampTextStyle", () => {
  test("non-object / empty → defaults (fresh object)", () => {
    expect(clampTextStyle(undefined)).toEqual(DEFAULT_TEXT_STYLE);
    expect(clampTextStyle("x")).toEqual(DEFAULT_TEXT_STYLE);
    expect(clampTextStyle({})).toEqual(DEFAULT_TEXT_STYLE);
    expect(clampTextStyle({})).not.toBe(DEFAULT_TEXT_STYLE);
  });
  test("each number is clamped to its range", () => {
    expect(clampTextStyle({ opacity: 5, letterSpacing: -1, lineSpacing: 9, outlineWidth: 0 })).toMatchObject({ opacity: 1, letterSpacing: -0.05, lineSpacing: 2, outlineWidth: 0.5 });
    expect(clampTextStyle({ opacity: -1, letterSpacing: 9, lineSpacing: 0, outlineWidth: 99 })).toMatchObject({ opacity: 0, letterSpacing: 0.3, lineSpacing: 0.8, outlineWidth: 3 });
  });
  test("NaN / non-number → the default", () => {
    expect(clampTextStyle({ opacity: NaN, letterSpacing: Infinity, lineSpacing: "2", outlineWidth: null })).toEqual(DEFAULT_TEXT_STYLE);
  });
  test("outlineColor is #RRGGBB or null", () => {
    expect(clampTextStyle({ outlineColor: "#112233" }).outlineColor).toBe("#112233");
    expect(clampTextStyle({ outlineColor: "red" }).outlineColor).toBeNull();
    expect(clampTextStyle({ outlineColor: 4 }).outlineColor).toBeNull();
  });
  test("shadow: null stays null, non-object → null, partial repaired, numbers clamped", () => {
    expect(clampTextStyle({ shadow: null }).shadow).toBeNull();
    expect(clampTextStyle({ shadow: "x" }).shadow).toBeNull();
    expect(clampTextStyle({ shadow: {} }).shadow).toEqual(DEFAULT_SHADOW);
    expect(clampTextStyle({ shadow: { color: "nope", opacity: 3, distance: -1, blur: NaN } }).shadow).toEqual({ color: "#000000", opacity: 1, distance: 0, blur: 0.1 });
    expect(clampTextStyle({ shadow: { color: "#ABCDEF", opacity: 0.2, distance: 9, blur: 9 } }).shadow).toEqual({ color: "#ABCDEF", opacity: 0.2, distance: 0.3, blur: 0.5 });
    expect(clampTextStyle({ shadow: {} }).shadow).not.toBe(DEFAULT_SHADOW);
  });
  test("glow likewise", () => {
    expect(clampTextStyle({ glow: null }).glow).toBeNull();
    expect(clampTextStyle({ glow: 7 }).glow).toBeNull();
    expect(clampTextStyle({ glow: {} }).glow).toEqual(DEFAULT_GLOW);
    expect(clampTextStyle({ glow: { color: "#00ff00", size: 5 } }).glow).toEqual({ color: "#00ff00", size: 0.6 });
    expect(clampTextStyle({ glow: { color: 1, size: 0 } }).glow).toEqual({ color: "#FFFFFF", size: 0.05 });
  });
  test("idempotent; unknown keys dropped", () => {
    const once = clampTextStyle({ opacity: 0.5, shadow: { distance: 2 }, extra: 1 });
    expect(once).not.toHaveProperty("extra");
    expect(clampTextStyle(once)).toEqual(once);
  });
});

describe("clampCaptionWords", () => {
  const w = (text: string, start: number, end: number) => ({ text, start, end });
  test("non-array → []", () => expect(clampCaptionWords("x", "a b", 5)).toEqual([]));
  test("valid words matching the text are kept", () => {
    expect(clampCaptionWords([w("hello", 0, 1), w("world", 1, 2)], "hello world", 3)).toEqual([w("hello", 0, 1), w("world", 1, 2)]);
  });
  test("whitespace in the text is normalised for the comparison", () => {
    expect(clampCaptionWords([w("a", 0, 1), w("b", 1, 2)], "  a   b ", 3)).toHaveLength(2);
  });
  test("mismatch with the text → []", () => {
    expect(clampCaptionWords([w("hello", 0, 1)], "hello world", 3)).toEqual([]);
    expect(clampCaptionWords([w("hello", 0, 1), w("there", 1, 2)], "hello world", 3)).toEqual([]);
  });
  test("empty text / non-finite entries are dropped", () => {
    const words = [w("a", 0, 1), w("  ", 1, 2), w("b", NaN, 2), { text: "c", start: 1 }, "junk", w("d", 1, 2)];
    expect(clampCaptionWords(words, "a d", 3)).toEqual([w("a", 0, 1), w("d", 1, 2)]);
  });
  test("sorted by start", () => {
    expect(clampCaptionWords([w("b", 1, 2), w("a", 0, 1)], "a b", 3).map((x) => x.text)).toEqual(["a", "b"]);
  });
  test("times clamped to [0, length] and end >= start", () => {
    expect(clampCaptionWords([w("a", -2, 1), w("b", 1, 99)], "a b", 3)).toEqual([w("a", 0, 1), w("b", 1, 3)]);
    expect(clampCaptionWords([w("a", 2, 1)], "a", 3)).toEqual([w("a", 2, 2)]);
    expect(clampCaptionWords([w("a", 5, 6)], "a", 3)).toEqual([w("a", 3, 3)]);
  });
  test("plain text (no words) → []", () => expect(clampCaptionWords([], "hello", 3)).toEqual([]));
});

describe("factories give fresh defaults", () => {
  test("makeOverlay", () => {
    const a = makeOverlay({ id: "a" }), b = makeOverlay({ id: "b" });
    expect(a.style).toEqual(DEFAULT_TEXT_STYLE);
    expect(a.style).not.toBe(DEFAULT_TEXT_STYLE);
    expect(a.style).not.toBe(b.style);
    expect(a.words).toEqual([]);
    expect(a.words).not.toBe(b.words);
    expect(a.highlightColor).toBeNull();
  });
  test("linesToCaptions", () => {
    const [x, y] = linesToCaptions([{ text: "a", start: 0, end: 1, words: [] }, { text: "b", start: 1, end: 2, words: [] }], (() => { let i = 0; return () => `c${i++}`; })());
    expect(x.style).toEqual(DEFAULT_TEXT_STYLE);
    expect(x.style).not.toBe(y.style);
    expect(x.words).not.toBe(y.words);
  });
  test("makeProject is v10", () => expect(makeProject().schemaVersion).toBe(10));
});
