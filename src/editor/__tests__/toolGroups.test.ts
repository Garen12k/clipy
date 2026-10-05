import { TOOL_IDS } from "../toolbarContext";
import { TOOL_META } from "../toolGroups";

test("every tool id has a label and an icon, and nothing else is listed", () => {
  expect(Object.keys(TOOL_META).sort()).toEqual([...TOOL_IDS].sort());
  for (const id of TOOL_IDS) { expect(TOOL_META[id].label.length).toBeGreaterThan(0); expect(TOOL_META[id].icon.length).toBeGreaterThan(0); }
});

test("the labels the bars show", () => {
  const label = (ids: readonly string[]) => ids.map((id) => TOOL_META[id as keyof typeof TOOL_META].label);
  expect(label(["edit", "audioMenu", "textMenu", "sticker", "overlay", "effect", "filter", "adjust", "ratio", "background", "cover", "templates"]))
    .toEqual(["Edit", "Audio", "Text", "Stickers", "Overlay", "Effects", "Filter", "Adjust", "Ratio", "Background", "Cover", "Templates"]);
  expect(label(["text", "captions", "addAudio", "ducking", "beats", "layerForward", "layerBack", "chroma"])).toEqual(["Add text", "Captions", "Add audio", "Ducking", "Beats", "Forward", "Back", "Green screen"]);
});
