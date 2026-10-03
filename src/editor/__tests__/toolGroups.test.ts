import { groupForSelection, TOOL_GROUPS } from "../toolGroups";

test("five groups in order with the spec's tools", () => {
  expect(TOOL_GROUPS.map((g) => [g.id, g.label, g.tools])).toEqual([
    ["edit", "Edit", ["split", "trim", "transform", "crop", "replace", "reverse", "freeze", "duplicate", "delete", "ratio"]],
    ["effects", "Effects", ["filter", "speed", "transition", "templates", "background"]],
    ["text", "Text", ["text", "captions"]],
    ["stickers", "Stickers", ["sticker"]],
    ["audio", "Audio", ["music", "volume"]],
  ]);
});

test("every tool appears exactly once", () => {
  const all = TOOL_GROUPS.flatMap((g) => g.tools);
  expect(new Set(all).size).toBe(all.length);
  expect(all).toHaveLength(20);
});

test("groupForSelection", () => {
  expect(groupForSelection({ clipId: null, overlayKind: "text" }, "edit")).toBe("text");
  expect(groupForSelection({ clipId: null, overlayKind: "caption" }, "audio")).toBe("text");
  expect(groupForSelection({ clipId: null, overlayKind: "sticker" }, "edit")).toBe("stickers");
  expect(groupForSelection({ clipId: null, overlayKind: null }, "text")).toBeNull();
  expect(groupForSelection({ clipId: "a", overlayKind: null }, "effects")).toBeNull();
  expect(groupForSelection({ clipId: "a", overlayKind: null }, "audio")).toBeNull();
  expect(groupForSelection({ clipId: "a", overlayKind: null }, "edit")).toBeNull();
  expect(groupForSelection({ clipId: "a", overlayKind: null }, "text")).toBe("edit");
  expect(groupForSelection({ clipId: "a", overlayKind: null }, "stickers")).toBe("edit");
});
