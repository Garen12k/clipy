import { COLLAGE_LAYOUT_IDS, PHOTO_MOTION_IDS } from "../model/types";
import { COLLAGE_LAYOUTS, CORNER_LABELS, PHOTO_MOTIONS } from "../photoTools";

const GLYPHS: Record<string, number> = require("@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json");

test("the seven motions: labels in sentence case, icons that are Ionicons outline glyphs", () => {
  expect(PHOTO_MOTION_IDS.map((id) => PHOTO_MOTIONS[id].label)).toEqual(["Zoom in", "Zoom out", "Pan left", "Pan right", "Pan up", "Pan down", "Corner zoom"]);
  expect(PHOTO_MOTION_IDS.map((id) => PHOTO_MOTIONS[id].icon)).toEqual(["expand-outline", "contract-outline", "arrow-back-outline", "arrow-forward-outline", "arrow-up-outline", "arrow-down-outline", "scan-outline"]);
  for (const id of PHOTO_MOTION_IDS) expect(GLYPHS[PHOTO_MOTIONS[id].icon]).toBeDefined();
  expect(Object.keys(PHOTO_MOTIONS).sort()).toEqual([...PHOTO_MOTION_IDS].sort());
});

test("the six layouts and the three corners: short labels that fit under a 72-pt tile", () => {
  expect(COLLAGE_LAYOUT_IDS.map((id) => COLLAGE_LAYOUTS[id].label)).toEqual(["Side by side", "Stacked", "Big and two", "Row of three", "Grid of four", "Inset"]);
  for (const id of COLLAGE_LAYOUT_IDS) expect(COLLAGE_LAYOUTS[id].label.length).toBeLessThanOrEqual(12);
  for (const id of PHOTO_MOTION_IDS) expect(PHOTO_MOTIONS[id].label.length).toBeLessThanOrEqual(12);
  expect(CORNER_LABELS).toEqual(["Square", "Rounded", "Round"]);
});
