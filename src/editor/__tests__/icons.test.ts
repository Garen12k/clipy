import { TOOL_IDS } from "../toolbarContext";
import { TOOL_META } from "../toolGroups";

const GLYPHS: Record<string, number> = require("@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json");

test("every tool's icon is an Ionicons outline glyph that exists", () => {
  for (const id of TOOL_IDS) {
    expect(`${id}: ${TOOL_META[id].icon}`).toMatch(/-outline$/);
    expect(GLYPHS[TOOL_META[id].icon]).toBeDefined();
  }
  expect(GLYPHS.diamond).toBeDefined();                                  // the one filled glyph: Keyframe while the playhead is on a pin
});

test("the icon of each tool", () => {
  expect(Object.fromEntries(TOOL_IDS.map((id) => [id, TOOL_META[id].icon]))).toEqual({
    edit: "film-outline", audioMenu: "musical-notes-outline", textMenu: "text-outline", sticker: "happy-outline", overlay: "layers-outline", effect: "flash-outline",
    filter: "color-filter-outline", adjust: "options-outline", ratio: "phone-portrait-outline", background: "color-palette-outline", cover: "image-outline", templates: "color-wand-outline",
    split: "cut-outline", trim: "code-outline", speed: "speedometer-outline", volume: "volume-high-outline", animate: "sparkles-outline", crop: "crop-outline",
    transform: "resize-outline", opacity: "contrast-outline", mask: "ellipse-outline", blend: "color-fill-outline", chroma: "leaf-outline", keyframe: "diamond-outline",
    transition: "swap-horizontal-outline", layerForward: "arrow-up-outline", layerBack: "arrow-down-outline", replace: "sync-outline", reverse: "play-back-outline", freeze: "snow-outline",
    duplicate: "copy-outline", delete: "trash-outline", select: "checkmark-done-outline",
    overlayEdit: "create-outline", overlayDuplicate: "copy-outline", overlayDelete: "trash-outline", text: "add-circle-outline", captions: "chatbox-ellipses-outline",
    addAudio: "add-circle-outline", ducking: "volume-low-outline", beats: "pulse-outline", audioVolume: "volume-medium-outline", audioFade: "trending-up-outline",
    audioDuplicate: "copy-outline", audioDelete: "trash-outline", audioSplit: "cut-outline",
    extractAudio: "git-branch-outline", voice: "mic-outline", soundQuality: "stats-chart-outline",
    effectStrength: "speedometer-outline", effectDuplicate: "copy-outline", effectDelete: "trash-outline",
    collage: "grid-outline", motion: "move-outline",
  });
  // Tools that can be on the same bar never share a glyph: Trim / Crop did; Overlay / Blend would have, once both are outline.
  expect(TOOL_META.trim.icon).not.toBe(TOOL_META.crop.icon);
  expect(TOOL_META.overlay.icon).not.toBe(TOOL_META.blend.icon);
  // Motion sits next to Animate and Transform on a photo's bar; Collage next to Overlay.
  expect(new Set([TOOL_META.motion.icon, TOOL_META.animate.icon, TOOL_META.transform.icon, TOOL_META.keyframe.icon]).size).toBe(4);
  expect(TOOL_META.collage.icon).not.toBe(TOOL_META.overlay.icon);
  // The two Splits are the same action on different bars (a clip's, a sound's), never side by side: one glyph, one label.
  expect(TOOL_META.audioSplit).toEqual(TOOL_META.split);
});
