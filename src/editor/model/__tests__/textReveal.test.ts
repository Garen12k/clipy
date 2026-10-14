import { exportReveal, hasReveal, REVEAL, revealCut, revealDuration, revealPlan, revealUnits } from "../textReveal";
import { makeOverlay, makeSticker, type OverlayAnimation, type TextOverlay } from "../types";
import { REVEAL_UNIT_VECTORS } from "./textReveal.vectors";

const anim = (inEdge: OverlayAnimation["in"], out: OverlayAnimation["out"] = null): OverlayAnimation => ({ in: inEdge, out, loop: null });
const typing = (p: Partial<TextOverlay> = {}) =>
  makeOverlay({ id: "t", text: "Hello world", start: 1, end: 5, animation: anim({ id: "typewriter", duration: 0.5 }), ...p });

describe("revealUnits: where the shown part ends after each unit (UTF-16), in reading order", () => {
  // The table lives in textReveal.vectors.ts (ASCII, `\u{…}` escapes) so Swift can copy it verbatim.
  test.each(REVEAL_UNIT_VECTORS.map((v) => [v.name, v] as const))("%s", (_name, v) => {
    expect(revealUnits(v.text, "typewriter")).toEqual(v.typewriter);
    expect(revealUnits(v.text, "wordByWord")).toEqual(v.wordByWord);
  });
  test("every list ends at the text's length and strictly increases; a cut never splits a surrogate pair", () => {
    for (const { text } of REVEAL_UNIT_VECTORS) for (const id of ["typewriter", "wordByWord"] as const) {
      const cuts = revealUnits(text, id);
      if (cuts.length > 0) expect(cuts[cuts.length - 1]).toBe(text.length);
      cuts.forEach((c, k) => { if (k > 0) expect(c).toBeGreaterThan(cuts[k - 1]); });
      for (const c of cuts) if (c < text.length) expect(text.charCodeAt(c) >= 0xdc00 && text.charCodeAt(c) <= 0xdfff).toBe(false);
    }
  });
  test("every Word by word cut is also a Typewriter cut", () => {
    for (const { text } of REVEAL_UNIT_VECTORS) {
      const t = new Set(revealUnits(text, "typewriter"));
      for (const c of revealUnits(text, "wordByWord")) expect(t.has(c)).toBe(true);
    }
  });
  test("not a string: nothing", () => {
    expect(revealUnits(undefined as unknown as string, "typewriter")).toEqual([]);
  });
});

describe("revealPlan", () => {
  test("one step per unit while the duration allows 30 a second; the first at 0, the last the whole text", () => {
    const p = revealPlan("Hello world", "typewriter", 0.5);
    expect(p.map((s) => s.cut)).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 10, 11]);
    p.forEach((s, j) => expect(s.from).toBeCloseTo(0.05 * j, 12));
  });
  test("a short duration groups units: never more than duration × 30 steps", () => {
    const p = revealPlan("Hello world", "typewriter", 0.2);
    expect(p.map((s) => s.cut)).toEqual([2, 4, 6, 8, 10, 11]);
    expect(revealPlan("Hello world", "typewriter", 0.15)).toHaveLength(5);   // ceil(0.15 × 30 = 4.5) = 5 steps for 10 units
  });
  test("never more than REVEAL.maxSteps", () => {
    const p = revealPlan("x".repeat(100), "typewriter", 2);
    expect(p).toHaveLength(REVEAL.maxSteps);
    expect(p[0]).toEqual({ cut: 4, from: 0 });
    expect(p[p.length - 1].cut).toBe(100);
  });
  test("Word by word", () => {
    expect(revealPlan("Hello world", "wordByWord", 0.5)).toEqual([{ cut: 6, from: 0 }, { cut: 11, from: 0.25 }]);
  });
  test("nothing visible, no length, or not a number: no plan", () => {
    expect(revealPlan("   ", "typewriter", 1)).toEqual([]);
    expect(revealPlan("Hi", "typewriter", 0)).toEqual([]);
    expect(revealPlan("Hi", "typewriter", Number.NaN)).toEqual([]);
    expect(revealPlan("Hi", "typewriter", 0.01)).toEqual([{ cut: 2, from: 0 }]);   // one step: drawn whole
  });
});

describe("a text's reveal at a time", () => {
  test("hasReveal: a text whose In is a reveal id — never a caption or a sticker", () => {
    expect(hasReveal(typing())).toBe(true);
    expect(hasReveal(typing({ animation: anim({ id: "fade", duration: 0.5 }) }))).toBe(false);
    expect(hasReveal(typing({ kind: "caption" }))).toBe(false);
    expect(hasReveal(makeSticker({ id: "s" }))).toBe(false);
  });
  test("the duration is the In's as the export receives it (scaled with the Out to fit the life)", () => {
    expect(revealDuration(typing())).toBe(0.5);
    expect(revealDuration(typing({ end: 1.6, animation: anim({ id: "typewriter", duration: 0.5 }, { id: "fade", duration: 0.5 }) }))).toBeCloseTo(0.3, 12);
  });
  test("the cut of the step the time is in; null once the whole text shows (drawn exactly as without a reveal)", () => {
    const o = typing();
    expect(revealCut(o, 1)).toBe(1);        // the first letter on the text's first frame
    expect(revealCut(o, 1.07)).toBe(2);
    expect(revealCut(o, 1.27)).toBe(7);     // "Hello " + "w"
    expect(revealCut(o, 1.47)).toBeNull();  // the last step
    expect(revealCut(o, 3)).toBeNull();
    expect(revealCut(o, 0.5)).toBe(1);      // before the start: the first step (the layer never draws it)
  });
  test("no reveal, one step, or a caption: null", () => {
    expect(revealCut(typing({ animation: anim({ id: "pop", duration: 0.5 }) }), 1.1)).toBeNull();
    expect(revealCut(typing({ text: "Hi", animation: anim({ id: "wordByWord", duration: 0.5 }) }), 1.1)).toBeNull();
    expect(revealCut(typing({ kind: "caption" }), 1.1)).toBeNull();
  });
  test("exportReveal: the plan as two lists, or null when there is nothing to reveal", () => {
    expect(exportReveal(typing({ text: "Hi you", animation: anim({ id: "wordByWord", duration: 0.5 }) }))).toEqual({ cuts: [3, 6], from: [0, 0.25] });
    expect(exportReveal(typing({ animation: anim({ id: "fade", duration: 0.5 }) }))).toBeNull();
    expect(exportReveal(typing({ text: "Hi", animation: anim({ id: "wordByWord", duration: 0.5 }) }))).toBeNull();
    expect(exportReveal(makeSticker({ id: "s" }))).toBeNull();
  });
});
