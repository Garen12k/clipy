import { FONTS } from "../fonts";
import { clampAnimEdge, clampTextStyle, ANIM_LOOP_IDS, DEFAULT_TEXT_STYLE, FONT_IDS, OVERLAY_LIMITS, TEXT_STYLE_LIMITS, type TextStyle } from "../model/types";
import { CAPTION_PRESET_IDS, CAPTION_PRESETS, TEXT_TEMPLATE_IDS, TEXT_TEMPLATES } from "../textTemplates";

const HEX = /^#[0-9A-F]{6}$/;
const within = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;

function expectStyleInLimits(s: TextStyle) {
  const L = TEXT_STYLE_LIMITS;
  expect(clampTextStyle(s)).toEqual(s);   // survives the sanity rule unchanged
  expect(Object.keys(s).sort()).toEqual(["boxCorner", "boxPadding", "glow", "letterSpacing", "lineSpacing", "opacity", "outlineColor", "outlineWidth", "shadow"]);
  expect(within(s.opacity, L.opacity) && within(s.letterSpacing, L.letterSpacing) && within(s.lineSpacing, L.lineSpacing) && within(s.outlineWidth, L.outlineWidth)).toBe(true);
  expect(within(s.boxPadding, L.boxPadding)).toBe(true); expect(["rounded", "square"]).toContain(s.boxCorner);
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
  test("twenty-four, in order: the first twelve as they were, then the twelve of 2026-10-06", () => {
    expect(TEXT_TEMPLATE_IDS).toEqual(["cleanTitle", "boldPop", "neon", "subtitleBar", "comic", "retro", "handwritten", "elegant", "shadowed", "outlineOnly", "stickerLabel", "softGlow",
      "headline", "neonOutline", "softShadow", "note", "titleBar", "stamp", "bubblegum", "cinema", "gold", "chalk", "pop3d", "watermark"]);
    expect(Object.keys(TEXT_TEMPLATES)).toEqual([...TEXT_TEMPLATE_IDS]);
    expect(TEXT_TEMPLATE_IDS.map((id) => TEXT_TEMPLATES[id].label)).toEqual(
      ["Clean title", "Bold pop", "Neon", "Subtitle bar", "Comic", "Retro", "Handwritten", "Elegant", "Shadowed", "Outline only", "Sticker label", "Soft glow",
        "Headline", "Neon outline", "Soft shadow", "Sticky note", "Title bar", "Stamp", "Bubblegum", "Cinema", "Gold", "Chalkboard", "3D pop", "Watermark"]);
    expect(new Set(TEXT_TEMPLATE_IDS.map((id) => TEXT_TEMPLATES[id].label)).size).toBe(24);
  });
  test("the first twelve keep the box every text had: default padding, round corners", () => {
    for (const id of TEXT_TEMPLATE_IDS.slice(0, 12)) expect(TEXT_TEMPLATES[id].patch.style).toMatchObject({ boxPadding: 0.25, boxCorner: "rounded" });
    for (const id of CAPTION_PRESET_IDS) expect(CAPTION_PRESETS[id].patch.style).toMatchObject({ boxPadding: 0.25, boxCorner: "rounded" });
  });
  test("the twelve new looks, value for value", () => {
    const t = TEXT_TEMPLATES, base = DEFAULT_TEXT_STYLE;
    expect(t.headline.patch).toEqual({ fontId: "anton", color: "#FFFFFF", background: { color: "#E10600", opacity: 1 }, outline: false,
      style: { ...base, letterSpacing: 0.04, boxPadding: 0.35, boxCorner: "square" } });
    expect(t.neonOutline.patch).toEqual({ fontId: "poppins", color: "#0B0B14", background: null, outline: true,
      style: { ...base, letterSpacing: 0.06, outlineColor: "#39FF14", outlineWidth: 2.4, glow: { color: "#39FF14", size: 0.35 } } });
    expect(t.softShadow.patch).toEqual({ fontId: "fredoka", color: "#FFF8E7", background: null, outline: false,
      style: { ...base, shadow: { color: "#3A1F5D", opacity: 0.7, distance: 0.05, blur: 0.45 } } });
    expect(t.note.patch).toEqual({ fontId: "permanentMarker", color: "#1B1B1F", background: { color: "#FFF27A", opacity: 1 }, outline: false,
      style: { ...base, lineSpacing: 1.1, boxPadding: 0.5, boxCorner: "square" } });
    expect(t.titleBar.patch).toEqual({ fontId: "oswald", color: "#FFFFFF", background: { color: "#0A1B33", opacity: 0.85 }, outline: false,
      style: { ...base, letterSpacing: 0.06, boxPadding: 0.15, boxCorner: "square" } });
    expect(t.stamp.patch).toEqual({ fontId: "bebasNeue", color: "#D7263D", background: { color: "#FFF4E0", opacity: 1 }, outline: true,
      style: { ...base, letterSpacing: 0.12, outlineColor: "#D7263D", outlineWidth: 0.8, boxPadding: 0.2 } });
    expect(t.bubblegum.patch).toEqual({ fontId: "lobster", color: "#FFFFFF", background: null, outline: true,
      style: { ...base, outlineColor: "#FF4FA3", outlineWidth: 2.5, shadow: { color: "#B0005A", opacity: 1, distance: 0.07, blur: 0 } } });
    expect(t.cinema.patch).toEqual({ fontId: "montserrat", color: "#FFFFFF", background: null, outline: false,
      style: { ...base, opacity: 0.9, letterSpacing: 0.3, lineSpacing: 1.4 } });
    expect(t.gold.patch).toEqual({ fontId: "dancingScript", color: "#F5C542", background: null, outline: false,
      style: { ...base, shadow: { color: "#5A3A00", opacity: 0.9, distance: 0.04, blur: 0.08 }, glow: { color: "#FFE9A8", size: 0.2 } } });
    expect(t.chalk.patch).toEqual({ fontId: "caveat", color: "#F4F4F5", background: { color: "#1E3B2F", opacity: 0.95 }, outline: false,
      style: { ...base, letterSpacing: 0.03, boxPadding: 0.4 } });
    expect(t.pop3d.patch).toEqual({ fontId: "righteous", color: "#FFFFFF", background: null, outline: true,
      style: { ...base, outlineColor: "#6C2BD9", outlineWidth: 2, shadow: { color: "#00E5A0", opacity: 1, distance: 0.12, blur: 0 } } });
    expect(t.watermark.patch).toEqual({ fontId: "poppins", color: "#FFFFFF", background: null, outline: false,
      style: { ...base, opacity: 0.55, letterSpacing: 0.15, lineSpacing: 1.3 } });
  });
  test("the new looks use what the first twelve did not: the box fields, three unused fonts; none carries an animation", () => {
    const fresh = TEXT_TEMPLATE_IDS.slice(12).map((id) => TEXT_TEMPLATES[id].patch);
    expect(fresh.filter((p) => p.style.boxPadding !== 0.25 || p.style.boxCorner !== "rounded")).toHaveLength(5);
    const oldFonts = new Set(TEXT_TEMPLATE_IDS.slice(0, 12).map((id) => TEXT_TEMPLATES[id].patch.fontId));
    expect(fresh.map((p) => p.fontId).filter((f) => !oldFonts.has(f))).toEqual(["permanentMarker", "lobster", "dancingScript"]);
    expect(fresh.every((p) => p.animation === undefined)).toBe(true);
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
