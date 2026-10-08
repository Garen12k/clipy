import { makeAudioTrack, makeClip, makeEffect, makeKeyframe, makeLayer, makeOverlay, makePhotoClip, makeProject, makeSticker, type Clip, type LayerClip, type Project } from "@/src/editor/model/types";
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

const MAIN = ["edit", "audioMenu", "textMenu", "sticker", "overlay", "collage", "effect", "filter", "adjust", "ratio", "background", "cover", "templates"];
const CLIP = ["split", "trim", "select", "speed", "volume", "extractAudio", "voice", "soundQuality", "animate", "filter", "adjust", "background", "templates", "crop", "transform", "opacity", "mask", "chroma", "cutout", "keyframe", "transition", "replace", "reverse", "freeze", "duplicate", "delete"];
const SOUND = ["audioSplit", "audioVolume", "audioFade", "voice", "soundQuality", "audioDuplicate", "audioDelete", "addAudio", "ducking", "beats"];
const LAYER = ["trim", "speed", "volume", "extractAudio", "voice", "soundQuality", "animate", "filter", "adjust", "crop", "transform", "opacity", "mask", "blend", "chroma", "cutout", "keyframe", "layerForward", "layerBack", "replace", "reverse", "duplicate", "delete"];
const without = (list: string[], ...gone: string[]) => list.filter((t) => !gone.includes(t));
const withMotion = (list: string[]) => list.flatMap((t) => (t === "animate" ? ["animate", "motion"] : [t]));

test("nothing selected: the main bar; an empty project keeps only what needs no clip", () => {
  expect(contextFor(none, project)).toEqual({ bar: "main", tools: MAIN });
  expect(contextFor(none, makeProject())).toEqual({ bar: "main", tools: ["audioMenu", "effect", "ratio"] });
});

test("a main clip: the clip bar in the spec's order", () => {
  expect(contextFor({ ...none, clipId: "a" }, project)).toEqual({ bar: "clip", tools: CLIP });
});

test("a main clip: Select is third, Background and Templates follow Adjust", () => {
  const { tools } = contextFor({ ...none, clipId: "a" }, project);
  expect(tools.slice(0, 4)).toEqual(["split", "trim", "select", "speed"]);
  expect(tools.slice(tools.indexOf("adjust"), tools.indexOf("adjust") + 3)).toEqual(["adjust", "background", "templates"]);
});

test("clip rules: a photo has no Speed / Volume / Reverse / Freeze; a reversed clip no Volume; the last clip no Transition; one clip no Select", () => {
  expect(contextFor({ ...none, clipId: "p" }, project).tools).toEqual(withMotion(without(CLIP, "speed", "volume", "extractAudio", "voice", "soundQuality", "reverse", "freeze")));
  expect(contextFor({ ...none, clipId: "r" }, project).tools).toEqual(without(CLIP, "volume", "extractAudio", "voice", "soundQuality", "cutout"));
  expect(contextFor({ ...none, clipId: "z" }, project).tools).toEqual(without(CLIP, "transition"));
  const one = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })] });
  expect(contextFor({ ...none, clipId: "a" }, one).tools).toEqual(without(CLIP, "transition", "select"));
});

test("a layer: the layer bar; a photo layer has no Speed / Volume / Reverse; a reversed layer no Volume", () => {
  expect(contextFor({ ...none, clipId: "L" }, project)).toEqual({ bar: "layer", tools: LAYER });
  expect(contextFor({ ...none, clipId: "P" }, project)).toEqual({ bar: "layer", tools: withMotion(without(LAYER, "speed", "volume", "extractAudio", "voice", "soundQuality", "reverse")) });
  expect(contextFor({ ...none, clipId: "R" }, project).tools).toEqual(without(LAYER, "volume", "extractAudio", "voice", "soundQuality", "cutout"));
  for (const id of ["L", "P", "R"]) for (const t of ["split", "freeze", "transition", "select", "background", "templates", "ratio"]) expect(contextFor({ ...none, clipId: id }, project).tools).not.toContain(t);
});

test("a text, a caption and a sticker: Add text follows Delete on a text and a caption, not on a sticker", () => {
  expect(contextFor({ ...none, overlayId: "t" }, project)).toEqual({ bar: "text", tools: ["overlayEdit", "animate", "keyframe", "overlayDuplicate", "overlayDelete", "text"] });
  expect(contextFor({ ...none, overlayId: "c" }, project)).toEqual({ bar: "text", tools: ["overlayEdit", "captions", "overlayDuplicate", "overlayDelete", "text"] });
  expect(contextFor({ ...none, overlayId: "s" }, project)).toEqual({ bar: "sticker", tools: ["overlayEdit", "animate", "keyframe", "overlayDuplicate", "overlayDelete"] });
});

test("a sound and an effect", () => {
  expect(contextFor({ ...none, audioId: "m" }, project)).toEqual({ bar: "audio", tools: SOUND });
  expect(contextFor({ ...none, effectId: "e" }, project)).toEqual({ bar: "effect", tools: ["effectStrength", "effectDuplicate", "effectDelete"] });
});

test("a sound: Split is first, before Volume, and only on a selected sound's bar (where the playhead is does not change the bar)", () => {
  const { tools } = contextFor({ ...none, audioId: "m" }, project);
  expect(tools.slice(0, 2)).toEqual(["audioSplit", "audioVolume"]);
  expect(tools).not.toContain("split");
  expect(contextFor({ ...none, section: "audio" }, project).tools).not.toContain("audioSplit");
  expect(contextFor({ ...none, clipId: "a" }, project).tools).not.toContain("audioSplit");
});

test("sections open a bar without a selection; a selection wins over the section; Text needs clips", () => {
  expect(contextFor({ ...none, section: "audio" }, project)).toEqual({ bar: "audio", tools: ["addAudio", "ducking", "beats"] });
  expect(contextFor({ ...none, section: "text" }, project)).toEqual({ bar: "text", tools: ["text", "captions"] });
  expect(contextFor({ ...none, section: "audio" }, makeProject())).toEqual({ bar: "audio", tools: ["addAudio", "ducking"] });
  expect(contextFor({ ...none, section: "text" }, makeProject()).bar).toBe("main");
  expect(contextFor({ ...none, section: "audio", clipId: "a" }, project).bar).toBe("clip");
  expect(contextFor({ ...none, section: "text", audioId: "m" }, project).tools).toEqual(SOUND);
});

test("Beats needs clips: not on an empty project, with or without a sound selected", () => {
  const empty = makeProject({ audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })] });
  expect(contextFor({ ...none, section: "audio" }, empty).tools).toEqual(["addAudio", "ducking"]);
  expect(contextFor({ ...none, audioId: "m" }, empty).tools).toEqual(["audioSplit", "audioVolume", "audioFade", "voice", "soundQuality", "audioDuplicate", "audioDelete", "addAudio", "ducking"]);
});

test("an id that no longer exists counts as no selection", () => {
  for (const sel of [{ clipId: "gone" }, { overlayId: "gone" }, { effectId: "gone" }, { audioId: "gone" }]) expect(contextFor({ ...none, ...sel }, project)).toEqual({ bar: "main", tools: MAIN });
});

test("every tool id is reachable, and no bar lists a tool twice", () => {
  const sels: ToolbarSelection[] = [none, { ...none, section: "audio" }, { ...none, section: "text" }, { ...none, clipId: "a" }, { ...none, clipId: "p" }, { ...none, clipId: "L" },
    { ...none, overlayId: "t" }, { ...none, overlayId: "c" }, { ...none, overlayId: "s" }, { ...none, audioId: "m" }, { ...none, effectId: "e" }];
  const seen = new Set<string>();
  for (const sel of sels) {
    const { tools } = contextFor(sel, project);
    expect(new Set(tools).size).toBe(tools.length);
    for (const t of tools) seen.add(t);
  }
  expect([...seen].sort()).toEqual([...TOOL_IDS].sort());
  expect(TOOL_IDS).toHaveLength(55);
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

describe("Motion and Collage", () => {
  const tagged = (id: string): LayerClip => ({ ...makePhotoClip({ id }), start: 0, collage: { group: "g", layout: "sideBySide", cell: 0, border: 0, corner: 0, aspect: 0.5625 } });
  const tools = (clip: Clip, layer = false) => contextFor({ ...none, clipId: clip.id }, makeProject({ clips: layer ? [makeClip({ id: "a", sourceDuration: 4 })] : [clip, makeClip({ id: "z", sourceDuration: 4 })], layers: layer ? [{ ...clip, start: 0 }] : [] })).tools;

  test("Collage is on the main bar right after Overlay, and needs a clip like Overlay", () => {
    const { tools: main } = contextFor(none, project);
    expect(main.slice(main.indexOf("overlay"), main.indexOf("overlay") + 3)).toEqual(["overlay", "collage", "effect"]);
    expect(contextFor(none, makeProject()).tools).not.toContain("collage");
  });

  test("Motion follows Animate for a photo — main clip or layer — and is never there for a video", () => {
    for (const layer of [false, true]) {
      const list = tools(makePhotoClip({ id: "p" }), layer);
      expect(list.slice(list.indexOf("animate"), list.indexOf("animate") + 3)).toEqual(["animate", "motion", "filter"]);
      expect(tools(makeClip({ id: "v", sourceDuration: 4 }), layer)).not.toContain("motion");
    }
  });

  test("one way of moving a photo at a time: keyframes hide Motion, a Motion hides Keyframe", () => {
    const pinned = makePhotoClip({ id: "p", keyframes: [makeKeyframe({ t: 0 })] });
    const moving: Clip = { ...makePhotoClip({ id: "p" }), motion: { id: "zoomIn", strength: 0.5 } };
    for (const layer of [false, true]) {
      expect(tools(pinned, layer)).not.toContain("motion");
      expect(tools(pinned, layer)).toContain("keyframe");
      expect(tools(moving, layer)).toContain("motion");
      expect(tools(moving, layer)).not.toContain("keyframe");
    }
    // An older Combo is not a stored Motion: both tools are there.
    const old = makePhotoClip({ id: "p", animation: { in: null, out: null, combo: "zoomInSlow" } });
    expect(tools(old)).toEqual(expect.arrayContaining(["motion", "keyframe"]));
    // A video is untouched by either rule: Keyframe as ever, pinned or not.
    expect(tools(makeClip({ id: "v", sourceDuration: 4, keyframes: [makeKeyframe({ t: 0 })] }))).toContain("keyframe");
  });

  test("a collage cell: Collage comes first on its bar, and it has no Motion (it would grow over its neighbours)", () => {
    const list = contextFor({ ...none, clipId: "c" }, makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], layers: [tagged("c")] })).tools;
    expect(list[0]).toBe("collage");
    expect(list[1]).toBe("trim");
    expect(list).not.toContain("motion");
    expect(list).toContain("keyframe");
    expect(contextFor({ ...none, clipId: "P" }, project).tools).not.toContain("collage");      // a plain layer
    expect(contextFor({ ...none, clipId: "a" }, project).tools).not.toContain("collage");      // a main clip
  });
});

test("the sound tools: on a sound's bar, and on a video's bar exactly where Volume is — never on a photo or a reversed clip", () => {
  const three = ["extractAudio", "voice", "soundQuality"];
  const of = (p: Project, id: string) => contextFor({ ...none, clipId: id }, p).tools;
  const p = makeProject({
    clips: [makeClip({ id: "v", sourceDuration: 4 }), makeClip({ id: "r", sourceDuration: 4, reversed: true }), makePhotoClip({ id: "ph" }), makeClip({ id: "fast", sourceDuration: 4, speed: 2 }), makeClip({ id: "quiet", sourceDuration: 4, muted: true })],
    layers: [makeLayer({ id: "Lv", sourceDuration: 4 }), { ...makePhotoClip({ id: "Lp" }), start: 0 }],
    audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })],
  });
  // A muted clip keeps them (as it keeps Volume): its sound can still be put on the audio row.
  for (const id of ["v", "fast", "quiet", "Lv"]) { expect(of(p, id)).toEqual(expect.arrayContaining(three)); expect(of(p, id).indexOf("extractAudio")).toBe(of(p, id).indexOf("volume") + 1); }
  for (const id of ["r", "ph", "Lp"]) for (const t of [...three, "volume"]) expect(of(p, id)).not.toContain(t);
  const sound = contextFor({ ...none, audioId: "m" }, p).tools;
  expect(sound).toEqual(expect.arrayContaining(["voice", "soundQuality"]));
  expect(sound).not.toContain("extractAudio");
  expect(contextFor({ ...none, section: "audio" }, p).tools).toEqual(["addAudio", "ducking", "beats"]);   // no sound selected: no sound tools
});
