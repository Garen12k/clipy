jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { addAudioTrack, deleteAudioTrack, moveAudioTrack, setClipFade, trimClip, updateAudioTrackById } from "@/src/editor/model/ops";
import { makeAudioTrack, makeClip, makeEffect, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "../store";

const p = makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 5 })], overlays: [makeOverlay({ id: "o1", start: 0, end: 2 })], effects: [makeEffect({ id: "e1", start: 0, end: 2 })],
  audioTracks: [makeAudioTrack({ id: "m1", sourceDuration: 30 }), makeAudioTrack({ id: "v1", sourceDuration: 6, kind: "voice" })],
});
const st = () => useEditorStore.getState();
beforeEach(() => { st().reset(); st().setProject(p); });

test("starts with no audio selection", () => {
  expect(st().selectedAudioId).toBeNull();
});

test("selecting an audio track clears the clip, overlay and effect selections", () => {
  st().select("a");
  st().selectAudio("m1");
  expect(st()).toMatchObject({ selectedClipId: null, selectedOverlayId: null, selectedEffectId: null, selectedAudioId: "m1" });
  st().selectAudio(null);
  st().selectOverlay("o1");
  st().selectAudio("m1");
  expect(st()).toMatchObject({ selectedOverlayId: null, selectedAudioId: "m1" });
  st().selectAudio(null);
  st().selectEffect("e1");
  st().selectAudio("v1");
  expect(st()).toMatchObject({ selectedEffectId: null, selectedAudioId: "v1" });
});

test("selecting a clip, an overlay or an effect clears the audio selection", () => {
  st().selectAudio("m1");
  st().select("a");
  expect(st()).toMatchObject({ selectedClipId: "a", selectedAudioId: null });
  st().selectAudio("m1");
  st().selectOverlay("o1");
  expect(st()).toMatchObject({ selectedOverlayId: "o1", selectedAudioId: null });
  st().selectAudio("m1");
  st().selectEffect("e1");
  expect(st()).toMatchObject({ selectedEffectId: "e1", selectedAudioId: null });
});

test("deselecting something else (null) leaves the audio selection alone; selectAudio(null) clears only itself", () => {
  st().selectAudio("m1");
  st().select(null);
  st().selectOverlay(null);
  st().selectEffect(null);
  expect(st().selectedAudioId).toBe("m1");
  st().selectAudio(null);
  expect(st().selectedAudioId).toBeNull();
  st().select("a");
  st().selectAudio(null);
  expect(st().selectedClipId).toBe("a");
});

test("the selection is dropped when the track disappears (delete, undo of the add) and kept through other edits", () => {
  st().selectAudio("v1");
  st().apply((x) => trimClip(x, "a", 0, 1));
  st().apply((x) => updateAudioTrackById(x, "v1", { volume: 0.5 }));
  expect(st().selectedAudioId).toBe("v1");
  st().apply((x) => deleteAudioTrack(x, "v1"));
  expect(st().selectedAudioId).toBeNull();

  st().apply((x) => addAudioTrack(x, makeAudioTrack({ id: "s1", sourceDuration: 1, kind: "sfx" })));
  st().selectAudio("s1");
  st().undo();
  expect(st().selectedAudioId).toBeNull();
});

test("setProject and reset clear the audio selection", () => {
  st().selectAudio("m1");
  st().setProject(p);
  expect(st().selectedAudioId).toBeNull();
  st().selectAudio("m1");
  st().reset();
  expect(st().selectedAudioId).toBeNull();
});

test("one bar drag is one undo step", () => {
  st().beginTransaction();
  for (const t of [1, 2, 3]) st().applyTransient((x) => moveAudioTrack(x, "m1", t));
  expect(st().project!.audioTracks[0].start).toBe(3);
  expect(st().past).toHaveLength(1);
  st().undo();
  expect(st().project).toBe(p);
  expect(st().canUndo()).toBe(false);
});

test("one fade slider drag is one undo step (track and clip)", () => {
  st().beginTransaction();
  for (const v of [0.5, 1, 1.5]) st().applyTransient((x) => updateAudioTrackById(x, "m1", { fadeIn: v }));
  st().beginTransaction();
  for (const v of [0.5, 1]) st().applyTransient((x) => setClipFade(x, "a", { fadeOut: v }));
  expect(st().project!.audioTracks[0].fadeIn).toBe(1.5);
  expect(st().project!.clips[0].fadeOut).toBe(1);
  expect(st().past).toHaveLength(2);
  st().undo();
  expect(st().project!.clips[0].fadeOut).toBe(0);
  expect(st().project!.audioTracks[0].fadeIn).toBe(1.5);
  st().undo();
  expect(st().project).toBe(p);
});
