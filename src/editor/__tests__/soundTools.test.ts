import { EQ_IDS, VOICE_IDS } from "../model/types";
import { EQS, VOICES } from "../soundTools";

const GLYPHS: Record<string, number> = require("@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json");

test("the seven voices: labels in sentence case, icons that are Ionicons outline glyphs", () => {
  expect(VOICE_IDS.map((id) => VOICES[id].label)).toEqual(["Deep", "High", "Chipmunk", "Robot", "Echo", "Hall", "Telephone"]);
  expect(VOICE_IDS.map((id) => VOICES[id].icon)).toEqual(["arrow-down-outline", "arrow-up-outline", "paw-outline", "hardware-chip-outline", "repeat-outline", "business-outline", "call-outline"]);
  expect(Object.keys(VOICES).sort()).toEqual([...VOICE_IDS].sort());
});

test("the four equaliser presets", () => {
  expect(EQ_IDS.map((id) => EQS[id].label)).toEqual(["Bass boost", "Clear voice", "Warm", "Bright"]);
  expect(EQ_IDS.map((id) => EQS[id].icon)).toEqual(["pulse-outline", "chatbubble-outline", "flame-outline", "sunny-outline"]);
  expect(Object.keys(EQS).sort()).toEqual([...EQ_IDS].sort());
});

test("every icon exists and every label fits under a 72-pt tile", () => {
  for (const row of [...Object.values(VOICES), ...Object.values(EQS)]) {
    expect(row.icon).toMatch(/-outline$/);
    expect(GLYPHS[row.icon]).toBeDefined();
    expect(row.label.length).toBeLessThanOrEqual(12);
  }
});
