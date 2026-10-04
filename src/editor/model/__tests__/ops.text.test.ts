jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { CAPTION_PRESET_IDS, CAPTION_PRESETS, TEXT_TEMPLATE_IDS, TEXT_TEMPLATES, type CaptionPresetId, type TextTemplateId } from "@/src/editor/textTemplates";
import { migrateProject } from "../migrate";
import {
  applyCaptionPreset, applyTextTemplate, duplicateOverlay, moveOverlay, setCaptionStyleForAll, setOverlayAnimation, setTextStyle, updateOverlay, updateOverlayShared,
} from "../ops";
import {
  clampCaptionWords, clampTextStyle, DEFAULT_GLOW, DEFAULT_SHADOW, DEFAULT_TEXT_STYLE, makeClip, makeOverlay, makeProject, makeSticker, type Project, type TextOverlay,
} from "../types";

const w = (text: string, start: number, end: number) => ({ text, start, end });
const WORDS = [w("hello", 0, 0.5), w("big", 0.5, 1), w("world", 1, 2)];
const cap = (id: string, over: Partial<TextOverlay> = {}) =>
  makeOverlay({ id, kind: "caption", text: "hello big world", start: 2, end: 4, x: 0.4, y: 0.8, words: WORDS.map((x) => ({ ...x })), ...over });
const p = makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 10 })],
  overlays: [makeOverlay({ id: "t", start: 1, end: 4 }), cap("c1"), cap("c2", { start: 5, end: 7 }), makeSticker({ id: "s" })],
});
const text = (q: Project, id: string) => q.overlays.find((o) => o.id === id) as TextOverlay;

describe("setTextStyle", () => {
  test("merges a patch into a text's style and keeps the rest", () => {
    const next = setTextStyle(p, "t", { opacity: 0.5, letterSpacing: 0.1 });
    expect(text(next, "t").style).toEqual({ ...DEFAULT_TEXT_STYLE, opacity: 0.5, letterSpacing: 0.1 });
    expect(setTextStyle(next, "t", { glow: { ...DEFAULT_GLOW } }).overlays[0]).toMatchObject({ style: { opacity: 0.5, letterSpacing: 0.1, glow: DEFAULT_GLOW } });
    expect(next.overlays.slice(1)).toEqual(p.overlays.slice(1));
    expect(next.updatedAt).toBe("2026-10-01T10:00:00.000Z");
  });
  test("works on captions and keeps their words", () => {
    const next = setTextStyle(p, "c1", { shadow: { ...DEFAULT_SHADOW } });
    expect(text(next, "c1").style.shadow).toEqual(DEFAULT_SHADOW);
    expect(text(next, "c1").words).toEqual(WORDS);
  });
  test("clamps every value and repairs colours", () => {
    const next = setTextStyle(p, "t", { opacity: 7, letterSpacing: -3, lineSpacing: 9, outlineWidth: 0, outlineColor: "red",
      shadow: { color: "nope", opacity: 4, distance: 4, blur: 4 }, glow: { color: "#00FF00", size: 9 } });
    expect(text(next, "t").style).toEqual({ opacity: 1, letterSpacing: -0.05, lineSpacing: 2, outlineColor: null, outlineWidth: 0.5,
      shadow: { color: "#000000", opacity: 1, distance: 0.3, blur: 0.5 }, glow: { color: "#00FF00", size: 0.6 } });
  });
  test("same project when nothing changes, for a sticker and for an unknown id", () => {
    expect(setTextStyle(p, "t", { opacity: 1 })).toBe(p);
    expect(setTextStyle(p, "t", {})).toBe(p);
    expect(setTextStyle(p, "t", { opacity: 4 })).toBe(p);   // clamps back to the stored value
    expect(setTextStyle(p, "s", { opacity: 0.5 })).toBe(p);
    expect(setTextStyle(p, "zzz", { opacity: 0.5 })).toBe(p);
  });
  test("the stored style never shares the patch's objects", () => {
    const shadow = { ...DEFAULT_SHADOW };
    const next = setTextStyle(p, "t", { shadow });
    expect(text(next, "t").style.shadow).not.toBe(shadow);
  });
});

describe("applyTextTemplate", () => {
  const base = makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 10 })],
    overlays: [makeOverlay({ id: "t", text: "Hi there", x: 0.3, y: 0.7, scale: 1.5, rotation: 20, start: 1, end: 4, fontScale: 0.1, align: "left",
      keyframes: [{ t: 0, x: 0.3, y: 0.7, scale: 1.5, rotation: 20, opacity: 1 }, { t: 1, x: 0.6, y: 0.2, scale: 1, rotation: 0, opacity: 0.5 }],
      animation: { in: { id: "fade", duration: 0.3 }, out: { id: "slideUp", duration: 0.4 }, loop: "float" } }), cap("c1"), makeSticker({ id: "s" })],
  });
  test.each(TEXT_TEMPLATE_IDS.map((id) => [id]))("%s sets the whole look and keeps text, placement, size, timing and pins", (id) => {
    const { patch } = TEXT_TEMPLATES[id as TextTemplateId];
    const before = text(base, "t");
    const next = applyTextTemplate(base, "t", id as TextTemplateId);
    const o = text(next, "t");
    expect(o).toMatchObject({ fontId: patch.fontId, color: patch.color, background: patch.background, outline: patch.outline, style: patch.style });
    for (const k of ["id", "kind", "text", "x", "y", "scale", "rotation", "start", "end", "fontScale", "align", "keyframes", "words", "highlightColor"] as const) expect(o[k]).toEqual(before[k]);
    if (patch.animation) expect(o.animation).toEqual(text(setOverlayAnimation(base, "t", patch.animation), "t").animation);
    else expect(o.animation).toEqual(before.animation);
    expect(next.overlays.slice(1)).toEqual(base.overlays.slice(1));
    // One change (one undo step), nothing left to repair on reload, and tapping it again does nothing.
    expect(migrateProject(JSON.parse(JSON.stringify(next))).overlays).toEqual(next.overlays);
    expect(applyTextTemplate(next, "t", id as TextTemplateId)).toBe(next);
  });
  test("replaces the style: nothing of the previous template is left", () => {
    const neon = applyTextTemplate(base, "t", "neon");
    expect(text(neon, "t").style.glow).not.toBeNull();
    const bar = applyTextTemplate(neon, "t", "subtitleBar");
    expect(text(bar, "t").style).toEqual(TEXT_TEMPLATES.subtitleBar.patch.style);
    expect(text(bar, "t")).toEqual(text(applyTextTemplate(base, "t", "subtitleBar"), "t"));
  });
  test("a template with an animation sets only the parts it names", () => {
    const o = text(applyTextTemplate(base, "t", "boldPop"), "t");
    expect(o.animation).toEqual({ in: TEXT_TEMPLATES.boldPop.patch.animation?.in, out: { id: "slideUp", duration: 0.4 }, loop: "float" });
  });
  test("stored objects are copies of the registry's", () => {
    const o = text(applyTextTemplate(base, "t", "stickerLabel"), "t");
    expect(o.background).not.toBe(TEXT_TEMPLATES.stickerLabel.patch.background);
    expect(o.style).not.toBe(TEXT_TEMPLATES.stickerLabel.patch.style);
    const s = text(applyTextTemplate(base, "t", "shadowed"), "t");
    expect(s.style.shadow).not.toBe(TEXT_TEMPLATES.shadowed.patch.style.shadow);
  });
  test("refused on captions, stickers, unknown overlays and unknown templates", () => {
    expect(applyTextTemplate(base, "c1", "neon")).toBe(base);
    expect(applyTextTemplate(base, "s", "neon")).toBe(base);
    expect(applyTextTemplate(base, "zzz", "neon")).toBe(base);
    expect(applyTextTemplate(base, "t", "nope" as TextTemplateId)).toBe(base);
  });
});

describe("setCaptionStyleForAll with style and highlight", () => {
  test("merges the style patch into every caption's own style and clamps it", () => {
    const start = setTextStyle(p, "c1", { opacity: 0.5 });
    const next = setCaptionStyleForAll(start, { style: { letterSpacing: 9, glow: { ...DEFAULT_GLOW } } });
    expect(text(next, "c1").style).toEqual({ ...DEFAULT_TEXT_STYLE, opacity: 0.5, letterSpacing: 0.3, glow: DEFAULT_GLOW });
    expect(text(next, "c2").style).toEqual({ ...DEFAULT_TEXT_STYLE, letterSpacing: 0.3, glow: DEFAULT_GLOW });
    expect(text(next, "c1").style.glow).not.toBe(text(next, "c2").style.glow);
    expect(text(next, "t")).toBe(text(start, "t"));
    expect(text(next, "c1").words).toEqual(WORDS);
  });
  test("highlight colour: set, cleared, bad value → null", () => {
    const on = setCaptionStyleForAll(p, { highlightColor: "#FFE14D" });
    expect([text(on, "c1").highlightColor, text(on, "c2").highlightColor, text(on, "t").highlightColor]).toEqual(["#FFE14D", "#FFE14D", null]);
    expect(setCaptionStyleForAll(on, { highlightColor: "#FFE14D" })).toBe(on);
    expect(setCaptionStyleForAll(on, { color: "#FFFFFF" }).overlays.map((o) => (o as TextOverlay).highlightColor)).toEqual([null, "#FFE14D", "#FFE14D", undefined]);
    expect(text(setCaptionStyleForAll(on, { highlightColor: null }), "c1").highlightColor).toBeNull();
    expect(text(setCaptionStyleForAll(on, { highlightColor: "yellow" }), "c1").highlightColor).toBeNull();
  });
  test("same project when nothing changes", () => {
    expect(setCaptionStyleForAll(p, { style: { opacity: 1 }, highlightColor: null })).toBe(p);
    expect(setCaptionStyleForAll(p, { style: {} })).toBe(p);
  });
});

describe("applyCaptionPreset", () => {
  test.each(CAPTION_PRESET_IDS.map((id) => [id]))("%s restyles every caption and nothing else", (id) => {
    const { patch } = CAPTION_PRESETS[id as CaptionPresetId];
    const next = applyCaptionPreset(p, id as CaptionPresetId);
    for (const cid of ["c1", "c2"]) {
      const before = text(p, cid), o = text(next, cid);
      expect(o).toMatchObject({ fontId: patch.fontId, fontScale: patch.fontScale, color: patch.color, background: patch.background, outline: patch.outline,
        style: patch.style, highlightColor: patch.highlightColor });
      for (const k of ["id", "kind", "text", "x", "y", "scale", "rotation", "start", "end", "align", "words", "animation", "keyframes"] as const) expect(o[k]).toEqual(before[k]);
    }
    expect(text(next, "t")).toBe(text(p, "t"));
    expect(next.overlays[3]).toBe(p.overlays[3]);
    expect(migrateProject(JSON.parse(JSON.stringify(next))).overlays).toEqual(next.overlays);
    expect(applyCaptionPreset(next, id as CaptionPresetId)).toBe(next);
  });
  test("replaces the style: a later preset leaves nothing of the earlier one", () => {
    const a = applyCaptionPreset(applyCaptionPreset(p, "neonGlow"), "karaoke");
    expect(a.overlays).toEqual(applyCaptionPreset(p, "karaoke").overlays);
    expect(text(applyCaptionPreset(a, "classicBar"), "c1").highlightColor).toBeNull();
  });
  test("captions never share the registry's or each other's objects", () => {
    const next = applyCaptionPreset(p, "classicBar");
    expect(text(next, "c1").background).not.toBe(CAPTION_PRESETS.classicBar.patch.background);
    expect(text(next, "c1").background).not.toBe(text(next, "c2").background);
    expect(text(next, "c1").style).not.toBe(text(next, "c2").style);
  });
  test("same project when there are no captions or the preset is unknown", () => {
    const none = makeProject({ clips: p.clips, overlays: [makeOverlay({ id: "t" })] });
    expect(applyCaptionPreset(none, "karaoke")).toBe(none);
    expect(applyCaptionPreset(p, "nope" as CaptionPresetId)).toBe(p);
  });
});

describe("caption words through edits", () => {
  test("editing a caption's text clears its words", () => {
    const next = updateOverlay(p, "c1", { text: "hello small world" });
    expect(text(next, "c1")).toMatchObject({ text: "hello small world", words: [] });
    expect(text(next, "c2").words).toEqual(WORDS);
    // Even a whitespace-only edit: the words are no longer the caption's text.
    expect(text(updateOverlay(p, "c1", { text: "hello  big world" }), "c1").words).toEqual([]);
  });
  test("the same text and other edits keep the words", () => {
    expect(updateOverlay(p, "c1", { text: "hello big world" })).toBe(p);
    expect(text(updateOverlay(p, "c1", { color: "#FF0000", x: 0.2, fontScale: 0.06 }), "c1").words).toEqual(WORDS);
    expect(text(moveOverlay(p, "c1", 6), "c1").words).toEqual(WORDS);
  });
  test("a timing edit keeps the words, re-clamped to the new length", () => {
    const shorter = text(updateOverlay(p, "c1", { end: 3.2 }), "c1");
    expect(shorter.end - shorter.start).toBeCloseTo(1.2);
    const len = shorter.end - shorter.start;
    expect(shorter.words).toEqual([w("hello", 0, 0.5), w("big", 0.5, 1), w("world", 1, len)]);
    expect(shorter.words).toEqual(clampCaptionWords(shorter.words, shorter.text, len));
    expect(text(updateOverlay(p, "c1", { end: 9 }), "c1").words).toEqual(WORDS);
    expect(text(updateOverlayShared(p, "c1", { end: 3.2 }), "c1").words).toEqual(shorter.words);
  });
  test("a plain text never gets words", () => {
    expect(text(updateOverlay(p, "t", { text: "New" }), "t").words).toEqual([]);
  });
});

describe("duplicateOverlay", () => {
  test("deep-copies the style and the words", () => {
    const styled = setTextStyle(setTextStyle(p, "c1", { shadow: { ...DEFAULT_SHADOW }, glow: { ...DEFAULT_GLOW } }), "t", { shadow: { ...DEFAULT_SHADOW }, glow: { ...DEFAULT_GLOW } });
    for (const id of ["t", "c1"]) {
      const dup = duplicateOverlay(styled, id);
      const src = text(styled, id), copy = text(dup, "new-id");
      expect(copy.style).toEqual(src.style);
      expect(copy.style).not.toBe(src.style);
      expect(copy.style.shadow).not.toBe(src.style.shadow);
      expect(copy.style.glow).not.toBe(src.style.glow);
      expect(copy.words).toEqual(src.words);
      expect(copy.highlightColor).toBe(src.highlightColor);
      if (src.words.length > 0) { expect(copy.words).not.toBe(src.words); expect(copy.words[0]).not.toBe(src.words[0]); }
      expect(clampTextStyle(copy.style)).toEqual(copy.style);
    }
  });
});
