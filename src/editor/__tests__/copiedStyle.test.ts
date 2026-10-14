import { textLookOf } from "../model/ops";
import { makeOverlay } from "../model/types";
import { copyStyle, forgetCopiedStyle, useCopiedStyle } from "../copiedStyle";

afterEach(() => forgetCopiedStyle());

test("nothing is copied until Copy style is tapped", () => {
  expect(useCopiedStyle.getState().look).toBeNull();
});

test("a copy is kept as its own object, and a second copy replaces the first", () => {
  const a = textLookOf(makeOverlay({ id: "a", color: "#FF0000" }));
  copyStyle(a);
  const kept = useCopiedStyle.getState().look!;
  expect(kept).toEqual(a);
  expect(kept).not.toBe(a);
  expect(kept.style).not.toBe(a.style);
  a.style.opacity = 0.1;   // the caller's object changing later changes nothing kept
  expect(kept.style.opacity).toBe(1);
  const b = textLookOf(makeOverlay({ id: "b", color: "#00FF00" }));
  copyStyle(b);
  expect(useCopiedStyle.getState().look!.color).toBe("#00FF00");
});

test("the store is the session's only: nothing of it is in a project or on disk (it has no other field than the look)", () => {
  copyStyle(textLookOf(makeOverlay({ id: "a" })));
  expect(Object.keys(useCopiedStyle.getState())).toEqual(["look"]);
  forgetCopiedStyle();
  expect(useCopiedStyle.getState().look).toBeNull();
});
