import { FONTS } from "../fonts";
import { clampAnimEdge, clampTextStyle, ANIM_LOOP_IDS, FONT_IDS, OVERLAY_LIMITS, TEXT_STYLE_LIMITS, type TextStyle } from "../model/types";
import { CAPTION_PRESET_IDS, CAPTION_PRESETS, TEXT_TEMPLATE_IDS, TEXT_TEMPLATES } from "../textTemplates";

const HEX = /^#[0-9A-F]{6}$/;
const within = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;

function expectStyleInLimits(s: TextStyle) {
  const L = TEXT_STYLE_LIMITS;
  expect(clampTextStyle(s)).toEqual(s);   // survives the sanity rule unchanged
  expect(Object.keys(s).sort()).toEqual(["glow", "letterSpacing", "lineSpacing", "opacity", "outlineColor", "outlineWidth", "shadow"]);
  expect(within(s.opacity, L.opacity) && within(s.letterSpacing, L.letterSpacing) && within(s.lineSpacing, L.lineSpacing) && within(s.outlineWidth, L.outlineWidth)).toBe(true);
  if (s.outlineColor !== null) expect(s.outlineColor).toMatch(HEX);
  if (s.shadow) {
    expect(s.shadow.color).toMatch(HEX);
    expect(within(s.shadow.opacity, L.shadowOpacity) && within(s.shadow.distance, L.shadowDistance) && within(s.shadow.blur, L.shadowBlur)).toBe(true);
  }
  if (s.glow) { expect(s.glow.color).toMatch(HEX); expect(within(s.glow.size, L.glowSize)).toBe(true); }
}
const expectBackground = (b: { color: string; opacity: number } | null) => {
  if (b) { expect(b.color).toMatch(HEX); expect(within(b.opacity, [0, 1])).toBe(true); }
};

describe("text templates", () => {
  test("the twelve of the spec, in order, each with a label", () => {
    expect(TEXT_TEMPLATE_IDS).toEqual(["cleanTitle", "boldPop", "neon", "subtitleBar", "comic", "retro", "handwritten", "elegant", "shadowed", "outlineOnly", "stickerLabel", "softGlow"]);
    expect(Object.keys(TEXT_TEMPLATES)).toEqual([...TEXT_TEMPLATE_IDS]);
    expect(TEXT_TEMPLATE_IDS.map((id) => TEXT_TEMPLATES[id].label)).toEqual(
      ["Clean title", "Bold pop", "Neon", "Subtitle bar", "Comic", "Retro", "Handwritten", "Elegant", "Shadowed", "Outline only", "Sticker label", "Soft glow"]);
  });
  test.each(TEXT_TEMPLATE_IDS.map((id) => [id]))("%s is a complete, valid patch", (id) => {
    const { patch } = TEXT_TEMPLATES[id];
    expect(FONT_IDS).toContain(patch.fontId);
    expect(FONTS[patch.fontId]).toBeDefined();
    expect(patch.color).toMatch(HEX);
    expect(typeof patch.outline).toBe("boolean");
    expectBackground(patch.background);
    expectStyleInLimits(patch.style);
    if (patch.animation) {
      for (const k of ["in", "out"] as const) { const e = patch.animation[k]; if (e) expect(clampAnimEdge(e)).toEqual(e); }
      if (patch.animation.loop != null) expect(ANIM_LOOP_IDS).toContain(patch.animation.loop);
    }
  });
  test("every template looks different", () => {
    const looks = TEXT_TEMPLATE_IDS.map((id) => JSON.stringify(TEXT_TEMPLATES[id].patch));
    expect(new Set(looks).size).toBe(TEXT_TEMPLATE_IDS.length);
  });
  test("the looks named in the design", () => {
    const t = TEXT_TEMPLATES;
    expect(t.cleanTitle.patch.fontId).toBe("poppins");
    expect(t.boldPop.patch).toMatchObject({ fontId: "anton", outline: true, animation: { in: { id: "pop" } } });
    expect(t.neon.patch.style.glow).not.toBeNull();
    expect(t.subtitleBar.patch).toMatchObject({ color: "#FFFFFF", background: { color: "#000000" }, outline: false });
    expect(t.comic.patch.fontId).toBe("bangers");
    expect(t.retro.patch.fontId).toBe("pressStart");
    expect(t.handwritten.patch.fontId).toBe("caveat");
    expect(t.elegant.patch.fontId).toBe("playfair");
    expect(t.shadowed.patch.style.shadow).not.toBeNull();
    expect(t.outlineOnly.patch.outline).toBe(true);
    expect(t.outlineOnly.patch.style.outlineColor).not.toBeNull();
    expect(t.outlineOnly.patch.style.outlineColor).not.toBe(t.outlineOnly.patch.color);
    expect(t.outlineOnly.patch.style.outlineWidth).toBeGreaterThanOrEqual(2);
    expect(t.stickerLabel.patch.background).toMatchObject({ opacity: 1 });
    expect(t.softGlow.patch.style.glow).not.toBeNull();
    // Only templates that say so carry an animation.
    expect(TEXT_TEMPLATE_IDS.filter((id) => t[id].patch.animation)).toEqual(["boldPop"]);
  });
});

describe("caption presets", () => {
  test("the six of the spec, in order, each with a label", () => {
    expect(CAPTION_PRESET_IDS).toEqual(["classicBar", "boldOutline", "yellowPop", "cleanWhite", "neonGlow", "karaoke"]);
    expect(Object.keys(CAPTION_PRESETS)).toEqual([...CAPTION_PRESET_IDS]);
    expect(CAPTION_PRESET_IDS.map((id) => CAPTION_PRESETS[id].label)).toEqual(["Classic bar", "Bold outline", "Yellow pop", "Clean white", "Neon glow", "Karaoke"]);
  });
  test.each(CAPTION_PRESET_IDS.map((id) => [id]))("%s is a complete, valid patch", (id) => {
    const { patch } = CAPTION_PRESETS[id];
    expect(Object.keys(patch).sort()).toEqual(["background", "color", "fontId", "fontScale", "highlightColor", "outline", "style"]);   // never x / y / align
    expect(FONT_IDS).toContain(patch.fontId);
    expect(within(patch.fontScale, OVERLAY_LIMITS.fontScale)).toBe(true);
    expect(patch.color).toMatch(HEX);
    expectBackground(patch.background);
    expectStyleInLimits(patch.style);
    if (patch.highlightColor !== null) { expect(patch.highlightColor).toMatch(HEX); expect(patch.highlightColor).not.toBe(patch.color); }
  });
  test("every preset looks different; the looks named in the design", () => {
    const looks = CAPTION_PRESET_IDS.map((id) => JSON.stringify(CAPTION_PRESETS[id].patch));
    expect(new Set(looks).size).toBe(CAPTION_PRESET_IDS.length);
    const c = CAPTION_PRESETS;
    expect(c.classicBar.patch).toMatchObject({ color: "#FFFFFF", background: { color: "#000000" }, highlightColor: null });
    expect(c.boldOutline.patch).toMatchObject({ outline: true, background: null });
    expect(c.cleanWhite.patch).toMatchObject({ color: "#FFFFFF", background: null });
    expect(c.neonGlow.patch.style.glow).not.toBeNull();
    expect(c.karaoke.patch).toMatchObject({ color: "#FFFFFF", highlightColor: "#FFE14D" });
    expect(CAPTION_PRESET_IDS.filter((id) => c[id].patch.highlightColor !== null)).toEqual(["karaoke"]);
  });
});
