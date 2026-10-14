import { overlayFrameKey, shownIds, shownKey } from "../overlayFrame";
import { makeOverlay, makeSticker } from "../types";

const at = (o: Parameters<typeof overlayFrameKey>[0], times: number[]) => times.map((t) => overlayFrameKey(o, t));

test("a still text or sticker has one key for its whole life, and another outside it", () => {
  const text = makeOverlay({ id: "t", start: 1, end: 3 });
  expect(new Set(at(text, [1, 1.5, 2, 2.999])).size).toBe(1);
  expect(overlayFrameKey(text, 0.5)).toBe("hidden");
  expect(overlayFrameKey(text, 3)).toBe("hidden");
  expect(new Set(at(makeSticker({ id: "s" }), [0, 1, 2])).size).toBe(1);
});

test("an In changes the key on every tick of its window and not after it; a Loop never stops changing it", () => {
  const slide = makeOverlay({ id: "t", start: 0, end: 4, animation: { in: { id: "slideUp", duration: 0.5 }, out: null, loop: null } });
  expect(new Set(at(slide, [0, 0.1, 0.2, 0.3, 0.4])).size).toBe(5);
  expect(new Set(at(slide, [0.5, 1, 2, 3])).size).toBe(1);
  const loop = makeSticker({ id: "s", start: 0, end: 4, animation: { in: null, out: null, loop: "spin" } });
  expect(new Set(at(loop, [1, 1.05, 1.1, 1.15])).size).toBe(4);
});

test("keyframes change the key between pins and hold it before the first and after the last", () => {
  const pin = (t: number, x: number) => ({ t, x, y: 0.5, scale: 1, rotation: 0, opacity: 1 });
  const o = makeOverlay({ id: "t", start: 0, end: 5, keyframes: [pin(1, 0.2), pin(2, 0.8)] });
  expect(new Set(at(o, [0, 0.5, 1])).size).toBe(1);
  expect(new Set(at(o, [1.2, 1.4, 1.6])).size).toBe(3);
  expect(new Set(at(o, [2, 3, 4.9])).size).toBe(1);
});

test("a reveal changes the key once per step; a caption once per spoken word", () => {
  const typed = makeOverlay({ id: "t", text: "Hello world", start: 0, end: 3, animation: { in: { id: "typewriter", duration: 0.5 }, out: null, loop: null } });
  expect(overlayFrameKey(typed, 0.06)).toBe(overlayFrameKey(typed, 0.09));
  expect(overlayFrameKey(typed, 0.06)).not.toBe(overlayFrameKey(typed, 0.11));
  expect(overlayFrameKey(typed, 0.6)).toBe(overlayFrameKey(typed, 2.9));
  const cap = makeOverlay({ id: "c", kind: "caption", text: "a b", start: 1, end: 3, highlightColor: "#FFD60A",
    words: [{ text: "a", start: 0, end: 0.5 }, { text: "b", start: 0.5, end: 1 }] });
  expect(overlayFrameKey(cap, 1.1)).toBe(overlayFrameKey(cap, 1.4));
  expect(overlayFrameKey(cap, 1.4)).not.toBe(overlayFrameKey(cap, 1.6));
  expect(overlayFrameKey(cap, 2.1)).toBe(overlayFrameKey(cap, 2.9));                  // between words: none spoken
  expect(overlayFrameKey({ ...cap, highlightColor: null }, 1.1)).toBe(overlayFrameKey({ ...cap, highlightColor: null }, 1.6));
});

test("the shown set is the ids drawn at a time, in order", () => {
  const list = [makeOverlay({ id: "a", start: 0, end: 2 }), makeSticker({ id: "b", start: 1, end: 3 })];
  expect(shownIds(shownKey(list, 1.5))).toEqual(["a", "b"]);
  expect(shownIds(shownKey(list, 2))).toEqual(["b"]);
  expect(shownKey(list, 0.5)).toBe(shownKey(list, 1.9 - 1.5));
});
