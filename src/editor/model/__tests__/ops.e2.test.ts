jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { useEditorStore } from "@/src/editor/store";
import { BLEND_IDS, CHROMA, REGION_LIMITS, makeClip, makeEffect, makeLayer, makePhotoClip, makeProject, type ChromaKey, type LayerClip, type Project } from "../types";
import { migrateProject } from "../migrate";
import {
  addEffect, addLayer, duplicateClip, duplicateEffect, duplicateLayer, insertFreezeFrame, moveEffect, replaceClipMedia, setClipBlend, setClipChroma,
  setEffectRect, splitClipAt, updateEffect,
} from "../ops";

const GREEN: ChromaKey = { color: "#00FF00", strength: 0.5 };
const a = makeClip({ id: "a", sourceDuration: 6 });
const b = makeClip({ id: "b", sourceDuration: 4 });
const v1 = makeLayer({ id: "v1", sourceDuration: 4, start: 1 });                       // 1 – 5
const ph: LayerClip = { ...makePhotoClip({ id: "ph", seconds: 3 }), start: 2 };        // 2 – 5
const shake = makeEffect({ id: "shake", type: "shake", start: 1, end: 2 });
const blur = makeEffect({ id: "blur", type: "blurBox", start: 2, end: 3 });
const mosaic = makeEffect({ id: "mosaic", type: "mosaicBox", start: 4, end: 5, rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } });
const p = makeProject({ clips: [a, b], layers: [v1, ph], effects: [shake, blur, mosaic] });
const layer = (x: Project, id: string) => x.layers.find((l) => l.id === id)!;
const clip = (x: Project, id: string) => x.clips.find((c) => c.id === id)!;
const effect = (x: Project, id: string) => x.effects.find((e) => e.id === id)!;
const still = { id: "still", sourceUri: "file:///media/still.jpg", width: 1080, height: 1920 };
const reloads = (x: Project) => expect(migrateProject(JSON.parse(JSON.stringify(x)))).toEqual(x);

describe("setClipBlend", () => {
  test("a layer takes every blend mode; only `layers` changes", () => {
    for (const blend of BLEND_IDS.filter((id) => id !== "normal")) {
      const next = setClipBlend(p, "v1", blend);
      expect(next).not.toBe(p);
      expect(layer(next, "v1")).toEqual({ ...v1, blend });
      expect(next.clips).toBe(p.clips);
      expect(next.effects).toBe(p.effects);
      expect(layer(next, "ph")).toBe(ph);
      expect(next.updatedAt).toBe("2026-10-01T10:00:00.000Z");
      reloads(next);
    }
    expect(layer(setClipBlend(p, "ph", "multiply"), "ph").blend).toBe("multiply");   // a photo layer too
  });

  test("back to normal", () => {
    const x = setClipBlend(p, "v1", "screen");
    expect(layer(setClipBlend(x, "v1", "normal"), "v1")).toEqual(v1);
  });

  test("same project: a main clip, an unknown id, an unknown blend, the blend it already has", () => {
    expect(setClipBlend(p, "a", "screen")).toBe(p);
    expect(setClipBlend(p, "zzz", "screen")).toBe(p);
    expect(setClipBlend(p, "v1", "dodge" as never)).toBe(p);
    expect(setClipBlend(p, "v1", "normal")).toBe(p);
    const x = setClipBlend(p, "v1", "screen");
    expect(setClipBlend(x, "v1", "screen")).toBe(x);
  });
});

describe("setClipChroma", () => {
  test("a layer and a main clip both take a key; the stored key is its own object", () => {
    const onLayer = setClipChroma(p, "v1", GREEN);
    expect(layer(onLayer, "v1")).toEqual({ ...v1, chroma: GREEN });
    expect(layer(onLayer, "v1").chroma).not.toBe(GREEN);
    expect(onLayer.clips).toBe(p.clips);
    reloads(onLayer);
    const onClip = setClipChroma(p, "a", GREEN);
    expect(clip(onClip, "a")).toEqual({ ...a, chroma: GREEN });
    expect(clip(onClip, "a").chroma).not.toBe(GREEN);
    expect(onClip.layers).toBe(p.layers);
    expect(clip(onClip, "b")).toBe(b);
    reloads(onClip);
    expect(layer(setClipChroma(p, "ph", GREEN), "ph").chroma).toEqual(GREEN);   // photos too
  });

  test("strength is clamped to 0–1 and rounded to 2 decimals; the colour is kept as given", () => {
    expect(clip(setClipChroma(p, "a", { color: "#00FF00", strength: 7 }), "a").chroma).toEqual({ color: "#00FF00", strength: 1 });
    expect(clip(setClipChroma(p, "a", { color: "#00FF00", strength: -2 }), "a").chroma).toEqual({ color: "#00FF00", strength: 0 });
    expect(clip(setClipChroma(p, "a", { color: "#00FF00", strength: 0.4567 }), "a").chroma).toEqual({ color: "#00FF00", strength: 0.46 });
    expect(clip(setClipChroma(p, "a", { color: "#00FF00", strength: 0.30000000000000004 }), "a").chroma!.strength).toBe(0.3);
    expect(clip(setClipChroma(p, "a", { color: "#0000ff", strength: 0.5 }), "a").chroma).toEqual({ color: "#0000ff", strength: 0.5 });
    expect(clip(setClipChroma(p, "a", { color: "#00FF00", strength: -0.001 }), "a").chroma!.strength).toBe(0);
    expect(Object.is(clip(setClipChroma(p, "a", { color: "#00FF00", strength: -0.001 }), "a").chroma!.strength, -0)).toBe(false);
  });

  test("unknown keys of the given object are not stored", () => {
    const next = setClipChroma(p, "a", { ...GREEN, extra: 1 } as never);
    expect(clip(next, "a").chroma).toEqual(GREEN);
    expect(Object.keys(clip(next, "a").chroma!)).toEqual(["color", "strength"]);
  });

  test("null clears the key", () => {
    const x = setClipChroma(p, "v1", GREEN);
    const cleared = setClipChroma(x, "v1", null);
    expect(layer(cleared, "v1")).toEqual(v1);
    expect(setClipChroma(p, "v1", null)).toBe(p);   // nothing to clear
  });

  test("same project: unknown id, an unchanged value (compared by value), a key that is not #RRGGBB, a non-finite strength", () => {
    expect(setClipChroma(p, "zzz", GREEN)).toBe(p);
    const x = setClipChroma(p, "v1", GREEN);
    expect(setClipChroma(x, "v1", { color: "#00FF00", strength: 0.5 })).toBe(x);
    expect(setClipChroma(x, "v1", { color: "#00FF00", strength: 0.5004 })).toBe(x);   // rounds to the stored value
    expect(setClipChroma(x, "v1", { color: "green", strength: 0.5 })).toBe(x);
    expect(setClipChroma(x, "v1", { color: "#0F0", strength: 0.5 })).toBe(x);
    expect(setClipChroma(x, "v1", { color: "#00FF00", strength: NaN })).toBe(x);
    expect(setClipChroma(x, "v1", { color: "#00FF00", strength: Infinity })).toBe(x);
    expect(setClipChroma(x, "v1", "#00FF00" as never)).toBe(x);
    expect(setClipChroma(x, "v1", undefined as never)).toBe(x);
  });

  test("a strength slider drag is one undo step", () => {
    const st = () => useEditorStore.getState();
    st().reset(); st().setProject(p);
    st().beginTransaction();
    for (const s of [0.6, 0.7, 0.8]) st().applyTransient((x) => setClipChroma(x, "v1", { color: "#00FF00", strength: s }));
    expect(layer(st().project!, "v1").chroma).toEqual({ color: "#00FF00", strength: 0.8 });
    expect(st().past).toHaveLength(1);
    st().undo();
    expect(st().project).toBe(p);
    expect(st().canUndo()).toBe(false);
    st().reset();
  });

  test("picking a blend mode is one undo step", () => {
    const st = () => useEditorStore.getState();
    st().reset(); st().setProject(p);
    st().apply((x) => setClipBlend(x, "v1", "screen"));
    expect(st().past).toHaveLength(1);
    st().apply((x) => setClipBlend(x, "v1", "screen"));   // the same again: nothing to undo
    expect(st().past).toHaveLength(1);
    st().undo();
    expect(st().project).toBe(p);
    st().reset();
  });
});

describe("setEffectRect", () => {
  test("a region effect takes the rectangle; only that effect changes", () => {
    const rect = { x: 0.2, y: 0.1, w: 0.5, h: 0.25 };
    const next = setEffectRect(p, "blur", rect);
    expect(effect(next, "blur")).toEqual({ ...blur, rect });
    expect(effect(next, "blur").rect).not.toBe(rect);
    expect(effect(next, "mosaic")).toBe(mosaic);
    expect(effect(next, "shake")).toBe(shake);
    expect(next.clips).toBe(p.clips);
    expect(next.updatedAt).toBe("2026-10-01T10:00:00.000Z");
    reloads(next);
    expect(effect(setEffectRect(p, "mosaic", rect), "mosaic").rect).toEqual(rect);
  });

  test("clamped: sides in [REGION_LIMITS.min, 1], the box inside the frame", () => {
    expect(effect(setEffectRect(p, "blur", { x: 0.5, y: 0.5, w: 0.001, h: 3 }), "blur").rect).toEqual({ x: 0.5, y: 0, w: REGION_LIMITS.min, h: 1 });
    expect(effect(setEffectRect(p, "blur", { x: 0.9, y: -1, w: 0.5, h: 0.5 }), "blur").rect).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
    expect(effect(setEffectRect(p, "blur", { x: -2, y: 2, w: 0.25, h: 0.25 }), "blur").rect).toEqual({ x: 0, y: 0.75, w: 0.25, h: 0.25 });
  });

  test("same project: unknown id, not a region effect, an unchanged rectangle, a non-finite value", () => {
    const rect = { x: 0.2, y: 0.1, w: 0.5, h: 0.25 };
    expect(setEffectRect(p, "zzz", rect)).toBe(p);
    expect(setEffectRect(p, "shake", rect)).toBe(p);
    expect(effect(p, "shake").rect).toBeNull();
    expect(setEffectRect(p, "mosaic", { x: 0.1, y: 0.2, w: 0.3, h: 0.4 })).toBe(p);
    expect(setEffectRect(p, "blur", { ...REGION_LIMITS.default })).toBe(p);
    expect(setEffectRect(p, "blur", { x: NaN, y: 0.1, w: 0.5, h: 0.25 })).toBe(p);
    expect(setEffectRect(p, "blur", { x: 0.1, y: 0.1, w: Infinity, h: 0.25 })).toBe(p);
    expect(setEffectRect(p, "blur", null as never)).toBe(p);
  });

  test("a box drag is one undo step", () => {
    const st = () => useEditorStore.getState();
    st().reset(); st().setProject(p);
    st().beginTransaction();
    for (const x of [0.32, 0.36, 0.4]) st().applyTransient((q) => setEffectRect(q, "blur", { x, y: 0.4, w: 0.4, h: 0.2 }));
    expect(effect(st().project!, "blur").rect).toEqual({ x: 0.4, y: 0.4, w: 0.4, h: 0.2 });
    expect(st().past).toHaveLength(1);
    st().undo();
    expect(st().project).toBe(p);
    st().reset();
  });
});

describe("effects: the rect through the existing ops", () => {
  test("addEffect: a region effect gets its own copy of the default rectangle; any other effect gets none", () => {
    const one = addEffect(p, "blurBox", 0, "n1");
    const two = addEffect(one, "mosaicBox", 0, "n2");
    expect(effect(two, "n1").rect).toEqual({ x: 0.3, y: 0.4, w: 0.4, h: 0.2 });
    expect(effect(two, "n2").rect).toEqual({ x: 0.3, y: 0.4, w: 0.4, h: 0.2 });
    expect(effect(two, "n1").rect).not.toBe(REGION_LIMITS.default);
    expect(effect(two, "n1").rect).not.toBe(effect(two, "n2").rect);
    expect(effect(addEffect(p, "shake", 0, "n3"), "n3").rect).toBeNull();
    reloads(two);
  });

  test("duplicateEffect copies the rectangle into its own object", () => {
    const next = duplicateEffect(p, "mosaic");
    const copy = effect(next, "new-id");
    expect(copy.rect).toEqual(mosaic.rect);
    expect(copy.rect).not.toBe(mosaic.rect);
    expect(effect(next, "mosaic")).toBe(mosaic);
    expect(effect(duplicateEffect(p, "shake"), "new-id").rect).toBeNull();
    // Moving the copy's box leaves the original's alone.
    const moved = setEffectRect(next, "new-id", { x: 0.6, y: 0.5, w: 0.3, h: 0.4 });
    expect(effect(moved, "mosaic").rect).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  });

  test("strength, trim and move keep the rectangle", () => {
    expect(effect(updateEffect(p, "mosaic", { intensity: 0.2 }), "mosaic")).toEqual({ ...mosaic, intensity: 0.2 });
    expect(effect(updateEffect(p, "mosaic", { end: 6 }), "mosaic").rect).toEqual(mosaic.rect);
    expect(effect(moveEffect(p, "mosaic", 6), "mosaic").rect).toEqual(mosaic.rect);
  });
});

describe("copies keep blend and green screen, each with its own key object", () => {
  const keyed = makeProject({ clips: [{ ...a, chroma: { ...GREEN } }, b], layers: [{ ...v1, blend: "screen", chroma: { ...GREEN } }] });
  const srcClip = keyed.clips[0];
  const srcLayer = keyed.layers[0];

  test("duplicateClip", () => {
    const next = duplicateClip(keyed, "a");
    expect(next.clips[1]).toMatchObject({ id: "new-id", blend: "normal", chroma: GREEN });
    expect(next.clips[1].chroma).not.toBe(srcClip.chroma);
    expect(next.clips[0]).toBe(srcClip);
    expect(duplicateClip(p, "a").clips[1].chroma).toBeNull();
  });

  test("duplicateLayer (and duplicateClip with a layer's id)", () => {
    for (const next of [duplicateLayer(keyed, "v1"), duplicateClip(keyed, "v1")]) {
      expect(next.layers).toHaveLength(2);
      expect(next.layers[1]).toMatchObject({ id: "new-id", blend: "screen", chroma: GREEN });
      expect(next.layers[1].chroma).not.toBe(srcLayer.chroma);
      expect(next.layers[0]).toBe(srcLayer);
    }
    expect(duplicateLayer(makeProject({ clips: [a, b], layers: [v1] }), "v1").layers[1]).toMatchObject({ blend: "normal", chroma: null });
  });

  test("addLayer: a keyed clip becomes a keyed layer with its own key", () => {
    const source = { ...makeClip({ id: "n", sourceDuration: 3 }), chroma: { ...GREEN } };
    const next = addLayer(p, source, 0);
    expect(layer(next, "n")).toMatchObject({ blend: "normal", chroma: GREEN });
    expect(layer(next, "n").chroma).not.toBe(source.chroma);
  });

  test("splitClipAt: both halves are keyed, the new half with its own key (video and photo)", () => {
    const next = splitClipAt(keyed, 2);
    expect(next.clips).toHaveLength(3);
    expect(next.clips[0]).toMatchObject({ id: "a", blend: "normal", chroma: GREEN });
    expect(next.clips[1]).toMatchObject({ id: "new-id", blend: "normal", chroma: GREEN });
    expect(next.clips[1].chroma).not.toBe(next.clips[0].chroma);
    const photo = makeProject({ clips: [{ ...makePhotoClip({ id: "s", seconds: 4 }), chroma: { ...GREEN } }] });
    const halves = splitClipAt(photo, 2).clips;
    expect(halves[1]).toMatchObject({ id: "new-id", chroma: GREEN });
    expect(halves[1].chroma).not.toBe(halves[0].chroma);
    expect(splitClipAt(p, 2).clips[1].chroma).toBeNull();
  });

  test("insertFreezeFrame: the still keeps the key (its own object) and is blend normal", () => {
    const next = insertFreezeFrame(keyed, 2, still);
    expect(next.clips.map((c) => c.id)).toEqual(["a", "still", "new-id", "b"]);
    expect(next.clips[1]).toMatchObject({ kind: "photo", blend: "normal", chroma: GREEN });
    expect(next.clips[1].chroma).not.toBe(next.clips[0].chroma);
    expect(next.clips[1].chroma).not.toBe(next.clips[2].chroma);
    expect(next.clips[1].chroma).not.toBe(srcClip.chroma);
    expect(insertFreezeFrame(p, 2, still).clips[1]).toMatchObject({ blend: "normal", chroma: null });
    // Even from a clip whose data says otherwise, the still (a main-track clip) is normal.
    const odd = makeProject({ clips: [{ ...a, blend: "screen" }, b] });
    expect(insertFreezeFrame(odd, 2, still).clips[1].blend).toBe("normal");
  });

  test("replaceClipMedia keeps blend and key (clip and layer)", () => {
    const media = { sourceUri: "file:///media/new.mp4", sourceDuration: 9, width: 1920, height: 1080, kind: "video" as const };
    expect(clip(replaceClipMedia(keyed, "a", media), "a")).toMatchObject({ sourceUri: media.sourceUri, blend: "normal", chroma: GREEN });
    expect(layer(replaceClipMedia(keyed, "v1", media), "v1")).toMatchObject({ sourceUri: media.sourceUri, blend: "screen", chroma: GREEN });
    const photo = { sourceUri: "file:///media/new.jpg", sourceDuration: 0, width: 1080, height: 1080, kind: "photo" as const };
    expect(layer(replaceClipMedia(keyed, "v1", photo), "v1")).toMatchObject({ kind: "photo", blend: "screen", chroma: GREEN });
  });

  test("editing the copy's key leaves the original's alone", () => {
    const next = setClipChroma(duplicateLayer(keyed, "v1"), "new-id", { color: "#0000FF", strength: 0.9 });
    expect(next.layers[0].chroma).toEqual(GREEN);
    expect(next.layers[1].chroma).toEqual({ color: "#0000FF", strength: 0.9 });
  });

  test("the default strength is the one a new key starts with", () => {
    expect(clip(setClipChroma(p, "a", { color: "#00FF00", strength: CHROMA.defaultStrength }), "a").chroma).toEqual(GREEN);
  });
});
