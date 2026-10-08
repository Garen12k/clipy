import { contextFor, TOOL_IDS, type ToolbarSelection } from "../toolbarContext";
import { TOOL_META } from "../toolGroups";
import { makeClip, makeLayer, makePhotoClip, makeProject } from "../model/types";

const sel = (clipId: string): ToolbarSelection => ({ clipId, overlayId: null, effectId: null, audioId: null, section: null });
const p = makeProject({
  clips: [makeClip({ id: "v", sourceDuration: 5 }), makePhotoClip({ id: "ph" }), makeClip({ id: "rev", sourceDuration: 5, reversed: true }), makeClip({ id: "cut", sourceDuration: 5, cutout: true })],
  layers: [makeLayer({ id: "L", sourceDuration: 5 }), { ...makeLayer({ id: "Lrev", sourceDuration: 5 }), reversed: true }, { ...makeLayer({ id: "Lcut", sourceDuration: 5 }), cutout: true as const }],
});
const tools = (id: string) => contextFor(sel(id), p).tools;

test("Cut out is a tool with an outline icon, right after Green screen", () => {
  expect(TOOL_IDS).toContain("cutout");
  expect(TOOL_META.cutout).toEqual({ label: "Cut out", icon: "body-outline" });
  for (const id of ["v", "ph", "L"]) {
    const list = tools(id);
    expect(list[list.indexOf("chroma") + 1]).toBe("cutout");
  }
});

test("a reversed clip or layer has no Cut out; a clip or layer with the switch on has no Reverse", () => {
  expect(tools("rev")).not.toContain("cutout");
  expect(tools("Lrev")).not.toContain("cutout");
  expect(tools("rev")).toContain("reverse");
  expect(tools("cut")).toContain("cutout");
  expect(tools("cut")).not.toContain("reverse");
  expect(tools("Lcut")).not.toContain("reverse");
  expect(tools("v")).toContain("reverse");
});

test("no other bar has it", () => {
  const none: ToolbarSelection = { clipId: null, overlayId: null, effectId: null, audioId: null, section: null };
  expect(contextFor(none, p).tools).not.toContain("cutout");
  expect(contextFor({ ...none, section: "audio" }, p).tools).not.toContain("cutout");
});
