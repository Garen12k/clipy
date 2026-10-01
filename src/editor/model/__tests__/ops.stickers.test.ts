jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeOverlay, makeProject, makeSticker } from "../types";
import { addSticker, duplicateOverlay, moveOverlay, updateOverlayShared, updateSticker } from "../ops";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [makeOverlay({ id: "t1" }), makeSticker({ id: "s1", start: 1, end: 3 })] });

test("addSticker appends; updateSticker patches sticker fields and clamps shared ones", () => {
  expect(addSticker(p, makeSticker({ id: "s2", emoji: "🔥" })).overlays.map((o) => o.id)).toEqual(["t1", "s1", "s2"]);
  const next = updateSticker(p, "s1", { emoji: null, shape: "heart", color: "#FF0000", scale: 9, x: 2 });
  expect(next.overlays[1]).toMatchObject({ emoji: null, shape: "heart", color: "#FF0000", scale: 5, x: 1 });
  expect(updateSticker(p, "t1", { color: "#000" })).toBe(p);   // not a sticker
});

test("shared updates, move and duplicate work for both kinds", () => {
  expect(updateOverlayShared(p, "s1", { rotation: 45 }).overlays[1]).toMatchObject({ rotation: 45 });
  expect(updateOverlayShared(p, "t1", { x: 0.2 }).overlays[0]).toMatchObject({ x: 0.2 });
  expect(moveOverlay(p, "s1", 5).overlays[1]).toMatchObject({ start: 5, end: 7 });
  const dup = duplicateOverlay(p, "s1");
  expect(dup.overlays[2]).toMatchObject({ kind: "sticker", id: "new-id" });
});
