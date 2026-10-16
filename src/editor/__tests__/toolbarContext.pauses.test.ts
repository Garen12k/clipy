import { extractClipAudio } from "@/src/editor/model/ops";
import { makeClip, makeLayer, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { contextFor, TOOL_IDS, type ToolbarSelection } from "../toolbarContext";
import { groupOf, TOOL_META } from "../toolGroups";

const sel = (clipId: string): ToolbarSelection => ({ clipId, overlayId: null, effectId: null, audioId: null, section: null });
const p = makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 8 }), makePhotoClip({ id: "ph" }), makeClip({ id: "r", sourceDuration: 5, reversed: true }),
    makeClip({ id: "fast", sourceDuration: 8, speed: 2 }), makeClip({ id: "ramp", sourceDuration: 8, speed: 1, speedCurve: { id: "montage", steps: [{ from: 0, to: 8, speed: 1 }] } as never }),
    makeClip({ id: "x", sourceDuration: 8 })],
  layers: [makeLayer({ id: "L", sourceDuration: 6 })],
});
const tools = (q: typeof p, id: string) => contextFor(sel(id), q).tools;

test("Remove pauses: a tool after Stabilize, in the Edit group, with its own icon", () => {
  expect(TOOL_IDS).toContain("pauses");
  expect(TOOL_META.pauses).toEqual({ label: "Remove pauses", icon: "pause-circle-outline" });
  expect(groupOf("pauses")).toBe("edit");
  expect(tools(p, "a").indexOf("pauses")).toBe(tools(p, "a").indexOf("stabilize") + 1);
});

test("on a main video clip at a constant speed only — never a photo, a reversed or ramped clip, a layer, or a clip whose sound is on its own bar", () => {
  for (const id of ["a", "fast", "x"]) expect(tools(p, id)).toContain("pauses");
  for (const id of ["ph", "r", "ramp", "L"]) expect(tools(p, id)).not.toContain("pauses");
  const extracted = extractClipAudio(p, "x", "bar");
  expect(tools(extracted, "x")).not.toContain("pauses");
});
