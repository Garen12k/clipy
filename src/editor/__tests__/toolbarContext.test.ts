import { makeAudioTrack, makeClip, makeEffect, makeLayer, makeOverlay, makePhotoClip, makeProject, makeSticker, type LayerClip } from "@/src/editor/model/types";
import { contextFor, selectionKey, TOOL_IDS, type ToolbarSelection } from "../toolbarContext";

const none: ToolbarSelection = { clipId: null, overlayId: null, effectId: null, audioId: null, section: null };
const photoLayer = (id: string): LayerClip => ({ ...makePhotoClip({ id }), start: 0 });
// a (video), p (photo), r (reversed video), z (video, last) on the main track; layers L (video), P (photo), R (reversed video).
const project = makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 4 }), makePhotoClip({ id: "p" }), makeClip({ id: "r", sourceDuration: 4, reversed: true }), makeClip({ id: "z", sourceDuration: 4 })],
  layers: [makeLayer({ id: "L", sourceDuration: 2, start: 1 }), photoLayer("P"), { ...makeLayer({ id: "R", sourceDuration: 2, start: 5 }), reversed: true }],
  overlays: [makeOverlay({ id: "t" }), makeOverlay({ id: "c", kind: "caption" }), makeSticker({ id: "s" })],
  effects: [makeEffect({ id: "e" })],
  audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })],
});

const MAIN = ["edit", "audioMenu", "textMenu", "sticker", "overlay", "effect", "filter", "adjust", "ratio", "background", "cover", "templates"];
const CLIP = ["split", "trim", "speed", "volume", "animate", "filter", "adjust", "crop", "transform", "opacity", "mask", "chroma", "keyframe", "transition", "replace", "reverse", "freeze", "duplicate", "delete", "select"];
const LAYER = ["trim", "speed", "volume", "animate", "filter", "adjust", "crop", "transform", "opacity", "mask", "blend", "chroma", "keyframe", "layerForward", "layerBack", "replace", "reverse", "duplicate", "delete"];
const without = (list: string[], ...gone: string[]) => list.filter((t) => !gone.includes(t));

test("nothing selected: the main bar; an empty project keeps only what needs no clip", () => {
  expect(contextFor(none, project)).toEqual({ bar: "main", tools: MAIN });
  expect(contextFor(none, makeProject())).toEqual({ bar: "main", tools: ["audioMenu", "effect", "ratio"] });
});

test("a main clip: the clip bar in the spec's order", () => {
  expect(contextFor({ ...none, clipId: "a" }, project)).toEqual({ bar: "clip", tools: CLIP });
});

test("clip rules: a photo has no Speed / Volume / Reverse / Freeze; a reversed clip no Volume; the last clip no Transition; one clip no Select", () => {
  expect(contextFor({ ...none, clipId: "p" }, project).tools).toEqual(without(CLIP, "speed", "volume", "reverse", "freeze"));
  expect(contextFor({ ...none, clipId: "r" }, project).tools).toEqual(without(CLIP, "volume"));
  expect(contextFor({ ...none, clipId: "z" }, project).tools).toEqual(without(CLIP, "transition"));
  const one = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })] });
  expect(contextFor({ ...none, clipId: "a" }, one).tools).toEqual(without(CLIP, "transition", "select"));
});

test("a layer: the layer bar; a photo layer has no Speed / Volume / Reverse; a reversed layer no Volume", () => {
  expect(contextFor({ ...none, clipId: "L" }, project)).toEqual({ bar: "layer", tools: LAYER });
  expect(contextFor({ ...none, clipId: "P" }, project)).toEqual({ bar: "layer", tools: without(LAYER, "speed", "volume", "reverse") });
  expect(contextFor({ ...none, clipId: "R" }, project).tools).toEqual(without(LAYER, "volume"));
  for (const id of ["L", "P", "R"]) for (const t of ["split", "freeze", "transition", "select", "background", "ratio"]) expect(contextFor({ ...none, clipId: id }, project).tools).not.toContain(t);
});

test("a text, a caption and a sticker", () => {
  const OVERLAY = ["overlayEdit", "animate", "keyframe", "overlayDuplicate", "overlayDelete"];
  expect(contextFor({ ...none, overlayId: "t" }, project)).toEqual({ bar: "text", tools: OVERLAY });
  expect(contextFor({ ...none, overlayId: "c" }, project)).toEqual({ bar: "text", tools: ["overlayEdit", "captions", "overlayDuplicate", "overlayDelete"] });
  expect(contextFor({ ...none, overlayId: "s" }, project)).toEqual({ bar: "sticker", tools: OVERLAY });
});

test("a sound and an effect", () => {
  expect(contextFor({ ...none, audioId: "m" }, project)).toEqual({ bar: "audio", tools: ["audioVolume", "audioFade", "audioDuplicate", "audioDelete", "addAudio"] });
  expect(contextFor({ ...none, effectId: "e" }, project)).toEqual({ bar: "effect", tools: ["effectStrength", "effectDuplicate", "effectDelete"] });
});

test("sections open a bar without a selection; a selection wins over the section; Text needs clips", () => {
  expect(contextFor({ ...none, section: "audio" }, project)).toEqual({ bar: "audio", tools: ["addAudio", "ducking", "beats"] });
  expect(contextFor({ ...none, section: "text" }, project)).toEqual({ bar: "text", tools: ["text", "captions"] });
  expect(contextFor({ ...none, section: "audio" }, makeProject())).toEqual({ bar: "audio", tools: ["addAudio", "ducking", "beats"] });
  expect(contextFor({ ...none, section: "text" }, makeProject()).bar).toBe("main");
  expect(contextFor({ ...none, section: "audio", clipId: "a" }, project).bar).toBe("clip");
  expect(contextFor({ ...none, section: "text", audioId: "m" }, project).tools).toEqual(["audioVolume", "audioFade", "audioDuplicate", "audioDelete", "addAudio"]);
});

test("an id that no longer exists counts as no selection", () => {
  for (const sel of [{ clipId: "gone" }, { overlayId: "gone" }, { effectId: "gone" }, { audioId: "gone" }]) expect(contextFor({ ...none, ...sel }, project)).toEqual({ bar: "main", tools: MAIN });
});

test("every tool id is reachable, and no bar lists a tool twice", () => {
  const sels: ToolbarSelection[] = [none, { ...none, section: "audio" }, { ...none, section: "text" }, { ...none, clipId: "a" }, { ...none, clipId: "L" },
    { ...none, overlayId: "t" }, { ...none, overlayId: "c" }, { ...none, overlayId: "s" }, { ...none, audioId: "m" }, { ...none, effectId: "e" }];
  const seen = new Set<string>();
  for (const sel of sels) {
    const { tools } = contextFor(sel, project);
    expect(new Set(tools).size).toBe(tools.length);
    for (const t of tools) seen.add(t);
  }
  expect([...seen].sort()).toEqual([...TOOL_IDS].sort());
  expect(TOOL_IDS).toHaveLength(48);
});

test("selectionKey names what is selected; multi-select first", () => {
  const s = { selectedClipId: null, selectedOverlayId: null, selectedEffectId: null, selectedAudioId: null, multiSelect: null };
  expect(selectionKey(s)).toBe("none");
  expect(selectionKey({ ...s, selectedClipId: "a" })).toBe("clip:a");
  expect(selectionKey({ ...s, selectedOverlayId: "t" })).toBe("overlay:t");
  expect(selectionKey({ ...s, selectedEffectId: "e" })).toBe("effect:e");
  expect(selectionKey({ ...s, selectedAudioId: "m" })).toBe("audio:m");
  expect(selectionKey({ ...s, multiSelect: [] })).toBe("multi");
  expect(selectionKey({ ...s, multiSelect: ["a", "b"], selectedClipId: "a" })).toBe("multi");
});
