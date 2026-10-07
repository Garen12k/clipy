import {
  activePhotoMotion, clampCollageCell, clampPhotoMotion, COLLAGE_CELLS, COLLAGE_CORNERS, COLLAGE_LAYOUT_IDS, COLLAGE_LIMITS, COMBO_AS_MOTION, CORNER_MASK,
  makeClip, makeKeyframe, makeLayer, makePhotoClip, newLayer, newPhotoClip, newVideoClip, PHOTO_MOTION_IDS, PHOTO_MOTION_LIMITS, SCHEMA_VERSION, shownPhotoMotion,
  type Clip, type PhotoMotion,
} from "../types";

const zoom: PhotoMotion = { id: "zoomIn", strength: 0.8 };
const photo = (extra: Partial<Clip> = {}): Clip => ({ ...makePhotoClip({ id: "p" }), ...extra });

test("schema is v18; the motion ids, the layouts and their limits are as specified", () => {
  expect(SCHEMA_VERSION).toBe(18);
  expect(PHOTO_MOTION_IDS).toEqual(["zoomIn", "zoomOut", "panLeft", "panRight", "panUp", "panDown", "zoomCorner"]);
  expect(PHOTO_MOTION_LIMITS).toEqual({ strength: [0, 1], defaultStrength: 0.5 });
  expect(COLLAGE_LAYOUT_IDS).toEqual(["sideBySide", "stacked", "bigTwo", "row3", "grid4", "inset"]);
  expect(COLLAGE_CELLS).toEqual({ sideBySide: 2, stacked: 2, bigTwo: 3, row3: 3, grid4: 4, inset: 2 });
  expect(COLLAGE_CORNERS).toEqual([0, 1, 2]);
  expect(CORNER_MASK).toEqual(["none", "rounded", "circle"]);
  expect(COLLAGE_LIMITS).toEqual({ border: [0, 0.06], borderStep: 0.005 });
  expect(COMBO_AS_MOTION).toEqual({ zoomInSlow: "zoomIn", zoomOutSlow: "zoomOut", panLeft: "panLeft", panRight: "panRight" });
});

test("no factory writes the two new fields: a new clip has the shape it always had", () => {
  const made: object[] = [
    newVideoClip({ id: "v", sourceUri: "file:///v.mp4", sourceDuration: 4, width: 1080, height: 1920 }),
    newPhotoClip({ id: "p", sourceUri: "file:///p.jpg", width: 1080, height: 1920 }),
    makeClip({ id: "a", sourceDuration: 4 }), makePhotoClip({ id: "p" }), makeLayer({ id: "l", sourceDuration: 4 }), newLayer(makePhotoClip({ id: "p" }), 1),
  ];
  for (const c of made) { expect("motion" in c).toBe(false); expect("collage" in c).toBe(false); }
});

test("clampPhotoMotion: a known id with the strength clamped to 0–1 (not a number → 0.5); anything else → null", () => {
  expect(clampPhotoMotion({ id: "panUp", strength: 0.3 })).toEqual({ id: "panUp", strength: 0.3 });
  expect(clampPhotoMotion({ id: "panUp", strength: 4 })).toEqual({ id: "panUp", strength: 1 });
  expect(clampPhotoMotion({ id: "panUp", strength: -1 })).toEqual({ id: "panUp", strength: 0 });
  expect(clampPhotoMotion({ id: "panUp", strength: NaN })).toEqual({ id: "panUp", strength: 0.5 });
  expect(clampPhotoMotion({ id: "panUp" })).toEqual({ id: "panUp", strength: 0.5 });
  expect(clampPhotoMotion({ id: "panUp", strength: 0.3, extra: 1 })).toEqual({ id: "panUp", strength: 0.3 });   // unknown keys dropped
  for (const junk of [null, undefined, "zoomIn", 3, {}, { id: "sway", strength: 0.5 }, { id: "zoomInSlow" }]) expect(clampPhotoMotion(junk)).toBeNull();
});

test("clampCollageCell: a usable tag is kept (border clamped, an unknown corner → 0); anything else → null", () => {
  const tag = { group: "g1", layout: "grid4", cell: 3, border: 0.02, corner: 1, aspect: 0.5625 };
  expect(clampCollageCell(tag)).toEqual(tag);
  expect(clampCollageCell({ ...tag, border: 0.5 })).toEqual({ ...tag, border: 0.06 });
  expect(clampCollageCell({ ...tag, border: "x" })).toEqual({ ...tag, border: 0 });
  expect(clampCollageCell({ ...tag, corner: 7 })).toEqual({ ...tag, corner: 0 });
  expect(clampCollageCell({ ...tag, more: true })).toEqual(tag);
  for (const bad of [null, "g1", { ...tag, group: "" }, { ...tag, group: 3 }, { ...tag, layout: "spiral" }, { ...tag, cell: 4 }, { ...tag, cell: -1 }, { ...tag, cell: 1.5 },
    { ...tag, aspect: 0 }, { ...tag, aspect: NaN }, { ...tag, layout: "sideBySide", cell: 2 }]) expect(clampCollageCell(bad)).toBeNull();
});

test("activePhotoMotion: what plays — a photo's stored motion, unless a Combo or keyframes own the clip", () => {
  expect(activePhotoMotion(photo())).toBeNull();
  expect(activePhotoMotion(photo({ motion: zoom }))).toEqual(zoom);
  expect(activePhotoMotion(photo({ motion: zoom, animation: { in: { id: "fade", duration: 0.5 }, out: null, combo: null } }))).toEqual(zoom);   // In / Out stay
  expect(activePhotoMotion(photo({ motion: zoom, animation: { in: null, out: null, combo: "sway" } }))).toBeNull();
  expect(activePhotoMotion(photo({ motion: zoom, keyframes: [makeKeyframe({ t: 0 })] }))).toBeNull();
  expect(activePhotoMotion({ ...makeClip({ id: "v", sourceDuration: 4 }), motion: zoom })).toBeNull();                                           // never a video
});

test("shownPhotoMotion: what the tool rings — the active motion, else the twin of an old zoom / pan Combo at the default strength", () => {
  expect(shownPhotoMotion(photo())).toBeNull();
  expect(shownPhotoMotion(photo({ motion: zoom }))).toEqual(zoom);
  const combo = (id: "zoomInSlow" | "zoomOutSlow" | "panLeft" | "panRight" | "sway" | "pulse") => photo({ animation: { in: null, out: null, combo: id } });
  expect(shownPhotoMotion(combo("zoomInSlow"))).toEqual({ id: "zoomIn", strength: 0.5 });
  expect(shownPhotoMotion(combo("zoomOutSlow"))).toEqual({ id: "zoomOut", strength: 0.5 });
  expect(shownPhotoMotion(combo("panLeft"))).toEqual({ id: "panLeft", strength: 0.5 });
  expect(shownPhotoMotion(combo("panRight"))).toEqual({ id: "panRight", strength: 0.5 });
  expect(shownPhotoMotion(combo("sway"))).toBeNull();
  expect(shownPhotoMotion(combo("pulse"))).toBeNull();
  expect(shownPhotoMotion(makeClip({ id: "v", sourceDuration: 4, animation: { in: null, out: null, combo: "zoomInSlow" } }))).toBeNull();        // a video's Combo is not a Motion
});

test("newLayer copies a motion and a collage tag as its own objects", () => {
  const tag = { group: "g", layout: "sideBySide" as const, cell: 0, border: 0, corner: 0 as const, aspect: 0.5625 };
  const src = photo({ motion: zoom, collage: tag });
  const layer = newLayer(src, 2);
  expect(layer.motion).toEqual(zoom);
  expect(layer.motion).not.toBe(zoom);
  expect(layer.collage).toEqual(tag);
  expect(layer.collage).not.toBe(tag);
});
