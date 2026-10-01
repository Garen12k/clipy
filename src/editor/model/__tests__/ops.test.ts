jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));

import { makeClip, makeProject } from "../types";
import { addClips, deleteClip, duplicateClip, moveClip, renameProject, setAspectRatio, splitClipAt, trimClip } from "../ops";

const a = makeClip({ id: "a", sourceDuration: 10, trimStart: 2, trimEnd: 5 }); // 3 s
const b = makeClip({ id: "b", sourceDuration: 8 });                             // 8 s
const p = makeProject({ clips: [a, b] });

test("addClips appends and stamps updatedAt", () => {
  const c = makeClip({ id: "c", sourceDuration: 1 });
  const next = addClips(p, [c]);
  expect(next.clips.map((x) => x.id)).toEqual(["a", "b", "c"]);
  expect(next.updatedAt).toBe("2026-10-01T10:00:00.000Z");
  expect(p.clips).toHaveLength(2);
  expect(addClips(p, [])).toBe(p);
});

test("splitClipAt splits the clip under the playhead into two trimmed halves", () => {
  const next = splitClipAt(p, 1); // 1 s into clip a → source time 3
  expect(next.clips.map((x) => x.id)).toEqual(["a", "new-id", "b"]);
  expect(next.clips[0]).toMatchObject({ trimStart: 2, trimEnd: 3 });
  expect(next.clips[1]).toMatchObject({ trimStart: 3, trimEnd: 5, sourceUri: a.sourceUri });
});

test("splitClipAt is a no-op at or near a boundary or when empty", () => {
  expect(splitClipAt(p, 0)).toBe(p);
  expect(splitClipAt(p, 3)).toBe(p);        // exactly the a/b boundary
  expect(splitClipAt(p, 2.95)).toBe(p);     // within 0.1 s of the end of a
  expect(splitClipAt(p, 11)).toBe(p);       // at the very end
  const empty = makeProject();
  expect(splitClipAt(empty, 1)).toBe(empty);
});

test("trimClip clamps to the source and enforces the minimum length", () => {
  expect(trimClip(p, "a", -1, 20).clips[0]).toMatchObject({ trimStart: 0, trimEnd: 10 });
  expect(trimClip(p, "a", 4, 4.05)).toBe(p);          // too short → unchanged
  expect(trimClip(p, "zzz", 0, 1)).toBe(p);           // unknown id
  expect(trimClip(p, "a", 2, 5)).toBe(p);             // no change
});

test("trimClip tolerates floating-point error at the minimum length", () => {
  const next = trimClip(p, "a", 4.9, 5);
  expect(next).not.toBe(p);
  expect(next.clips[0]).toMatchObject({ trimStart: 4.9, trimEnd: 5 });
});

test("moveClip reorders and ignores no-ops", () => {
  expect(moveClip(p, "b", 0).clips.map((x) => x.id)).toEqual(["b", "a"]);
  expect(moveClip(p, "a", 5).clips.map((x) => x.id)).toEqual(["b", "a"]); // clamped
  expect(moveClip(p, "a", 0)).toBe(p);
});

test("deleteClip and duplicateClip", () => {
  expect(deleteClip(p, "a").clips.map((x) => x.id)).toEqual(["b"]);
  expect(deleteClip(p, "nope")).toBe(p);
  const dup = duplicateClip(p, "a");
  expect(dup.clips.map((x) => x.id)).toEqual(["a", "new-id", "b"]);
  expect(dup.clips[1]).toMatchObject({ trimStart: 2, trimEnd: 5 });
});

test("setAspectRatio and renameProject", () => {
  expect(setAspectRatio(p, "1:1").aspectRatio).toBe("1:1");
  expect(setAspectRatio(p, "9:16")).toBe(p);
  expect(renameProject(p, "  My Edit ").name).toBe("My Edit");
  expect(renameProject(p, "   ")).toBe(p);
});
