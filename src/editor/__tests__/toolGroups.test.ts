import { groupForSelection, TOOL_GROUPS } from "../toolGroups";

test("five groups in order with the spec's tools", () => {
  expect(TOOL_GROUPS.map((g) => [g.id, g.label, g.tools])).toEqual([
    ["edit", "Edit", ["split", "trim", "transform", "animate", "keyframe", "crop", "overlay", "opacity", "mask", "replace", "reverse", "freeze", "duplicate", "delete", "ratio"]],
    ["effects", "Effects", ["filter", "adjust", "effect", "speed", "transition", "templates", "background"]],
    ["text", "Text", ["text", "captions", "animate", "keyframe"]],
    ["stickers", "Stickers", ["sticker", "animate", "keyframe"]],
    ["audio", "Audio", ["addAudio", "volume", "ducking", "beats"]],
  ]);
});

test("every tool appears exactly once, except Animate and Keyframe which sit in Edit, Text and Stickers", () => {
  const all = TOOL_GROUPS.flatMap((g) => g.tools);
  const shared = ["animate", "keyframe"];
  const rest = all.filter((t) => !shared.includes(t));
  expect(new Set(rest).size).toBe(rest.length);
  expect(rest).toHaveLength(27);
  for (const t of shared) expect(TOOL_GROUPS.filter((g) => (g.tools as string[]).includes(t)).map((g) => g.id)).toEqual(["edit", "text", "stickers"]);
  for (const g of TOOL_GROUPS) expect(new Set(g.tools).size).toBe(g.tools.length);
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

test("layer order tools are sub-row tools: in no group", () => {
  const all = TOOL_GROUPS.flatMap((g) => g.tools) as string[];
  for (const t of ["layerForward", "layerBack"]) expect(all).not.toContain(t);
});

test("an audio selection jumps to Audio", () => {
  expect(groupForSelection({ clipId: null, overlayKind: null, audioId: "m1" }, "edit")).toBe("audio");
  expect(groupForSelection({ clipId: null, overlayKind: null, audioId: "m1" }, "text")).toBe("audio");
  expect(groupForSelection({ clipId: null, overlayKind: null, audioId: null }, "text")).toBeNull();
  expect(groupForSelection({ clipId: "a", overlayKind: null, audioId: null }, "stickers")).toBe("edit");
});

test("audio sub-row tools are in no group; the old music id is gone", () => {
  const all = TOOL_GROUPS.flatMap((g) => g.tools) as string[];
  for (const t of ["audioVolume", "audioFade", "audioDuplicate", "audioDelete", "music"]) expect(all).not.toContain(t);
});
