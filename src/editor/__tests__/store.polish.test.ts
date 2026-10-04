jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-04T10:00:00.000Z" }));
import { deleteClips, setAspectRatio } from "@/src/editor/model/ops";
import { makeAudioTrack, makeClip, makeEffect, makeLayer, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "../store";

const st = () => useEditorStore.getState();
const p = makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 }), makeClip({ id: "c", sourceDuration: 4 })],
  layers: [makeLayer({ id: "l", sourceDuration: 2 })], overlays: [makeOverlay({ id: "o" })],
  effects: [makeEffect({ id: "e" })], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })],
});
beforeEach(() => { st().reset(); st().setProject(p); });

test("not in the mode by default; entering seeds it with the selected MAIN clip and clears every selection", () => {
  expect(st().multiSelect).toBeNull();
  st().select("b"); st().enterMultiSelect();
  expect(st()).toMatchObject({ multiSelect: ["b"], selectedClipId: null, selectedOverlayId: null, selectedEffectId: null, selectedAudioId: null });
  st().exitMultiSelect();
  expect(st().multiSelect).toBeNull();
  st().select("l"); st().enterMultiSelect();       // a layer is not multi-selectable
  expect(st()).toMatchObject({ multiSelect: [], selectedClipId: null });
});

test("toggle adds and removes main clips only; select all takes them in timeline order", () => {
  st().toggleMultiSelect("a");
  expect(st().multiSelect).toBeNull();             // not in the mode: nothing happens
  st().enterMultiSelect();
  st().toggleMultiSelect("c"); st().toggleMultiSelect("a");
  expect(st().multiSelect).toEqual(["c", "a"]);
  st().toggleMultiSelect("c");
  expect(st().multiSelect).toEqual(["a"]);
  st().toggleMultiSelect("l"); st().toggleMultiSelect("zz");
  expect(st().multiSelect).toEqual(["a"]);
  st().selectAllClips();
  expect(st().multiSelect).toEqual(["a", "b", "c"]);
});

test("a change that removes selected clips drops them; when none is left the mode ends; one undo step", () => {
  st().enterMultiSelect(); st().selectAllClips();
  const before = st().multiSelect;
  st().apply((x) => setAspectRatio(x, "1:1"));
  expect(st().multiSelect).toBe(before);           // nothing removed → the same array
  st().apply((x) => deleteClips(x, ["b"]));
  expect(st().multiSelect).toEqual(["a", "c"]);
  st().apply((x) => deleteClips(x, ["a", "c"]));
  expect(st().multiSelect).toBeNull();
  expect(st().past).toHaveLength(3);
  st().undo();
  expect(st().project?.clips.map((x) => x.id)).toEqual(["a", "c"]);
  expect(st().multiSelect).toBeNull();             // undo does not bring the mode back
});

test("selecting anything else leaves the mode; deselecting does not; reset clears it", () => {
  for (const pick of [() => st().select("a"), () => st().selectOverlay("o"), () => st().selectEffect("e"), () => st().selectAudio("m")]) {
    st().enterMultiSelect();
    pick();
    expect(st().multiSelect).toBeNull();
  }
  st().enterMultiSelect();
  st().select(null); st().selectOverlay(null);
  expect(st().multiSelect).toEqual([]);
  st().reset();
  expect(st().multiSelect).toBeNull();
});

test("setExportSettings writes the project without an undo step and survives undo / redo", () => {
  st().setExportSettings({ fps: 60, quality: "small" });
  expect(st().project?.exportSettings).toEqual({ fps: 60, quality: "small" });
  expect(st().past).toHaveLength(0);
  expect(st().dirty).toBe(true);
  st().apply((x) => setAspectRatio(x, "1:1"));
  st().setExportSettings({ fps: 24, quality: "small" });
  st().undo();
  expect(st().project).toMatchObject({ aspectRatio: "9:16", exportSettings: { fps: 24, quality: "small" } });
  st().redo();
  expect(st().project).toMatchObject({ aspectRatio: "1:1", exportSettings: { fps: 24, quality: "small" } });
});

test("setExportSettings: unchanged or junk that clamps to what is stored does nothing", () => {
  st().setExportSettings({ fps: 30, quality: "high" });
  st().setExportSettings({ fps: 25, quality: "ultra" } as never);   // clamps to 30 / high = stored
  expect(st().dirty).toBe(false);
  expect(st().project).toBe(p);
});

test("entering the mode again while in it keeps the chosen clips", () => {
  st().enterMultiSelect();
  st().toggleMultiSelect("a"); st().toggleMultiSelect("c");
  const before = st().multiSelect;
  st().enterMultiSelect();
  expect(st().multiSelect).toBe(before);
  expect(st().multiSelect).toEqual(["a", "c"]);
});
