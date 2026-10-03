import type { ClipTransform, CropRect } from "../types";
import type { PlacedClip, Size } from "../clipLayout";

/** Shared with the Swift mirror (Task 12): keep expected values as plain numeric literals. */
export interface PlaceVector { name: string; source: Size; crop: CropRect; transform: ClipTransform; frame: [number, number]; expect: PlacedClip }

const FULL: CropRect = { x: 0, y: 0, w: 1, h: 1 };
const ID: ClipTransform = { scale: 1, x: 0, y: 0, rotation: 0, flipH: false, flipV: false };

export const PLACE_VECTORS: PlaceVector[] = [
  {
    // cover = max(1080/1080, 1920/1920) = 1 -> 1080x1920 centred at (540, 960)
    name: "portrait source in portrait frame (identity)",
    source: { width: 1080, height: 1920 }, crop: FULL, transform: ID, frame: [1080, 1920],
    expect: { width: 1080, height: 1920, centerX: 540, centerY: 960, rotation: 0, flipH: false, flipV: false },
  },
  {
    // cover = max(1080/1920, 1920/1080) = max(0.5625, 1.77778) = 1.77778 -> 1920*1.77778 = 3413.333, 1080*1.77778 = 1920
    name: "landscape source covers a portrait frame",
    source: { width: 1920, height: 1080 }, crop: FULL, transform: ID, frame: [1080, 1920],
    expect: { width: 3413.3333333, height: 1920, centerX: 540, centerY: 960, rotation: 0, flipH: false, flipV: false },
  },
  {
    // fitScale = 0.5625 / 1.77778 = 0.31640625 -> 3413.333*0.31640625 = 1080, 1920*0.31640625 = 607.5
    name: "landscape source at fit scale in a portrait frame",
    source: { width: 1920, height: 1080 }, crop: FULL, transform: { ...ID, scale: 0.31640625 }, frame: [1080, 1920],
    expect: { width: 1080, height: 607.5, centerX: 540, centerY: 960, rotation: 0, flipH: false, flipV: false },
  },
  {
    // quarter turn swaps the bounding box to 1080x1920 -> cover = max(1080/1080, 1920/1920) = 1 -> unrotated size stays 1920x1080
    name: "landscape source turned 90 degrees covers a portrait frame exactly",
    source: { width: 1920, height: 1080 }, crop: FULL, transform: { ...ID, rotation: 90 }, frame: [1080, 1920],
    expect: { width: 1920, height: 1080, centerX: 540, centerY: 960, rotation: 90, flipH: false, flipV: false },
  },
  {
    // cropped 1920*0.5 = 960 x 1080 -> cover = max(1080/960, 1920/1080) = max(1.125, 1.77778) = 1.77778 -> 960*1.77778 = 1706.667, 1920
    name: "centre crop of a landscape source",
    source: { width: 1920, height: 1080 }, crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, transform: ID, frame: [1080, 1920],
    expect: { width: 1706.6666667, height: 1920, centerX: 540, centerY: 960, rotation: 0, flipH: false, flipV: false },
  },
  {
    // centre = (540 + 0.1*1080, 960 - 0.2*1920) = (648, 576)
    name: "offsets x 0.1, y -0.2",
    source: { width: 1080, height: 1920 }, crop: FULL, transform: { ...ID, x: 0.1, y: -0.2 }, frame: [1080, 1920],
    expect: { width: 1080, height: 1920, centerX: 648, centerY: 576, rotation: 0, flipH: false, flipV: false },
  },
  {
    // flips do not change size or position, only carried through
    name: "flips are carried through",
    source: { width: 1080, height: 1920 }, crop: FULL, transform: { ...ID, flipH: true, flipV: true }, frame: [1080, 1920],
    expect: { width: 1080, height: 1920, centerX: 540, centerY: 960, rotation: 0, flipH: true, flipV: true },
  },
  {
    // 1:1 frame 1000x1000: cover = max(1000/1920, 1000/1080) = 0.9259259 -> 1777.778 x 1000, centre (500, 500)
    name: "landscape source in a square frame",
    source: { width: 1920, height: 1080 }, crop: FULL, transform: ID, frame: [1000, 1000],
    expect: { width: 1777.7777778, height: 1000, centerX: 500, centerY: 500, rotation: 0, flipH: false, flipV: false },
  },
  {
    // scale 2 doubles the cover size: 1080x1920 -> 2160x3840; rotation 30 carried through
    name: "scale 2 with a 30 degree rotation",
    source: { width: 1080, height: 1920 }, crop: FULL, transform: { ...ID, scale: 2, rotation: 30 }, frame: [1080, 1920],
    expect: { width: 2160, height: 3840, centerX: 540, centerY: 960, rotation: 30, flipH: false, flipV: false },
  },
];
