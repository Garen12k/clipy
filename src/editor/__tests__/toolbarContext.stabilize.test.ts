import { makeClip, makeLayer, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { contextFor, TOOL_IDS, type ToolbarSelection } from "../toolbarContext";
import { TOOL_META } from "../toolGroups";

const sel = (clipId: string): ToolbarSelection => ({ clipId, overlayId: null, effectId: null, audioId: null, section: null });
const p = makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 8 }), makePhotoClip({ id: "ph" }), makeClip({ id: "r", sourceDuration: 5, reversed: true }),
    makeClip({ id: "s", sourceDuration: 8, stabilize: "low" }), makeClip({ id: "sm", sourceDuration: 8, speed: 0.5, smooth: true }),
    makeClip({ id: "idle", sourceDuration: 8, smooth: true }), makeClip({ id: "cut", sourceDuration: 8, cutout: true })],
  layers: [makeLayer({ id: "L", sourceDuration: 6 }), makeLayer({ id: "LS", sourceDuration: 6, stabilize: "high", start: 7 })],
});
const tools = (id: string) => contextFor(sel(id), p).tools;

test("Stabilize is a tool with an outline icon, directly after Cut out", () => {
  expect(TOOL_IDS).toContain("stabilize");
  expect(TOOL_IDS.indexOf("stabilize")).toBe(TOOL_IDS.indexOf("cutout") + 1);
  expect(TOOL_META.stabilize).toEqual({ label: "Stabilize", icon: "hand-left-outline" });
  for (const id of ["a", "L"]) expect(tools(id).indexOf("stabilize")).toBe(tools(id).indexOf("cutout") + 1);
});

test("on a video that plays forwards, main or layer; never on a photo or a reversed clip", () => {
  for (const id of ["a", "L", "s", "cut"]) expect(tools(id)).toContain("stabilize");     // with Remove background on it is there, and says why it cannot
  for (const id of ["ph", "r"]) expect(tools(id)).not.toContain("stabilize");
});

test("Reverse is left out while the clip has a steady copy — and only then", () => {
  for (const id of ["s", "sm", "LS"]) expect(tools(id)).not.toContain("reverse");
  for (const id of ["a", "L", "idle"]) expect(tools(id)).toContain("reverse");           // an idle Smooth slow motion switch hides nothing
  expect(tools("cut")).not.toContain("reverse");                                         // as before
});
