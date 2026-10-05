jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
import { dropEmptyText } from "../ops";
import { makeClip, makeOverlay, makeProject, makeSticker } from "../types";

const p = makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 10 })],
  overlays: [makeOverlay({ id: "full", text: "Hi" }), makeOverlay({ id: "empty", text: "" }), makeOverlay({ id: "blank", text: " \n " }),
    makeOverlay({ id: "cap", kind: "caption", text: "" }), makeSticker({ id: "s" })],
});
const ids = (q: typeof p) => q.overlays.map((o) => o.id);

test("dropEmptyText removes the named text when it is empty or only white space", () => {
  expect(ids(dropEmptyText(p, "empty"))).toEqual(["full", "blank", "cap", "s"]);
  expect(ids(dropEmptyText(p, "blank"))).toEqual(["full", "empty", "cap", "s"]);
});

test("dropEmptyText returns the same project for a text with content, a caption, a sticker, an unknown id and no id", () => {
  for (const id of ["full", "cap", "s", "nope", null]) expect(dropEmptyText(p, id)).toBe(p);
});
