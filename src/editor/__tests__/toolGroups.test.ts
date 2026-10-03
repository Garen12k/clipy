import { groupForSelection, TOOL_GROUPS } from "../toolGroups";

test("five groups in order with the spec's tools", () => {
  expect(TOOL_GROUPS.map((g) => [g.id, g.label, g.tools])).toEqual([
    ["edit", "Edit", ["split", "trim", "transform", "crop", "replace", "reverse", "freeze", "duplicate", "delete", "ratio"]],
    ["effects", "Effects", ["filter", "adjust", "effect", "speed", "transition", "templates", "background"]],
    ["text", "Text", ["text", "captions"]],
    ["stickers", "Stickers", ["sticker"]],
    ["audio", "Audio", ["music", "volume"]],
  ]);
});

test("every tool appears exactly once", () => {
  const all = TOOL_GROUPS.flatMap((g) => g.tools);
  expect(new Set(all).size).toBe(all.length);
  expect(all).toHaveLength(22);
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

test("an effect selection jumps to Effects; existing cases unchanged", () => {
  expect(groupForSelection({ clipId: null, overlayKind: null, effectId: "e" }, "edit")).toBe("effects");
  expect(groupForSelection({ clipId: null, overlayKind: null, effectId: "e" }, "text")).toBe("effects");
  expect(groupForSelection({ clipId: null, overlayKind: null, effectId: null }, "text")).toBeNull();
  expect(groupForSelection({ clipId: "a", overlayKind: null, effectId: null }, "stickers")).toBe("edit");
});

test("effect sub-row tools are in no group", () => {
  const all = TOOL_GROUPS.flatMap((g) => g.tools) as string[];
  for (const t of ["effectStrength", "effectDuplicate", "effectDelete"]) expect(all).not.toContain(t);
});
