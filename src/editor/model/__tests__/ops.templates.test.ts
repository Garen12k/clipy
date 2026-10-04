let mockIdCounter = 0;
jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => `t${++mockIdCounter}`) }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { isSticker, makeClip, makeOverlay, makeProject, type TextOverlay } from "../types";
import { totalDuration } from "../timeline";
import { applyCaptionPreset, applyTemplate, applyTextTemplate } from "../ops";
import { TEMPLATES } from "../../templates";
import { CAPTION_PRESETS, TEXT_TEMPLATES } from "../../textTemplates";

const a = makeClip({ id: "a", sourceDuration: 4 });
const b = makeClip({ id: "b", sourceDuration: 4 });
const c = makeClip({ id: "c", sourceDuration: 4, transitionOut: { type: "none", duration: 0 } });
const caption = makeOverlay({ id: "cap", kind: "caption", text: "hi", fontId: "montserrat", start: 0, end: 1 });
const text = makeOverlay({ id: "txt", text: "hello", fontId: "bangers", start: 1, end: 2 });
const p = makeProject({ clips: [a, b, c], overlays: [caption, text] });
const hype = TEMPLATES.hype;   // vivid, 1.5×, zoom 0.3, bangers

beforeEach(() => { mockIdCounter = 0; });

test("clip scope changes only the target clip and adds one title + one sticker", () => {
  const out = applyTemplate(p, hype, "clip", "a");
  expect(out.clips[0]).toMatchObject({ speed: 1.5, filter: "vivid", transitionOut: { type: "zoom", duration: 0.3 } });
  expect(out.clips[1]).toBe(b);
  expect(out.clips[2]).toBe(c);
  expect(out.overlays.slice(0, 2)).toEqual([caption, text]);
  const added = out.overlays.slice(2);
  expect(added).toHaveLength(2);
  expect(added.filter((o) => o.kind === "text")).toHaveLength(1);
  expect(added.filter(isSticker)).toHaveLength(1);
  expect(added[0]).toMatchObject({ kind: "text", text: hype.title.text, fontId: "bangers", x: 0.5, y: hype.title.y, fontScale: hype.title.fontScale, start: 0, end: 3 });
  expect(added[1]).toMatchObject({ kind: "sticker", emoji: "🔥", start: 0, end: 3 });
});

test("clip scope on the last clip leaves its transition alone", () => {
  const out = applyTemplate(p, hype, "clip", "c");
  expect(out.clips[2]).toMatchObject({ speed: 1.5, filter: "vivid", transitionOut: { type: "none", duration: 0 } });
  expect(out.clips.slice(0, 2)).toEqual([a, b]);
});

test("clip scope with a missing or null clip id returns the project unchanged", () => {
  expect(applyTemplate(p, hype, "clip", "zzz")).toBe(p);
  expect(applyTemplate(p, hype, "clip", null)).toBe(p);
});

test("project scope sets every clip; the last clip has no transition", () => {
  const out = applyTemplate(p, TEMPLATES.retro, "project", null);
  for (const cl of out.clips) expect(cl).toMatchObject({ speed: 0.8, filter: "vintage" });
  expect(out.clips[0].transitionOut).toEqual({ type: "fade", duration: 0.5 });
  expect(out.clips[1].transitionOut).toEqual({ type: "fade", duration: 0.5 });
  expect(out.clips[2].transitionOut).toEqual({ type: "none", duration: 0 });
});

test("project scope caps transitions on short clips and 'none' clears them", () => {
  const short = makeProject({ clips: [makeClip({ id: "s1", sourceDuration: 0.8 }), makeClip({ id: "s2", sourceDuration: 0.8 })] });
  const out = applyTemplate(short, TEMPLATES.cinematic, "project", null);   // dissolve 0.6, cap = 0.4
  expect(out.clips[0].transitionOut).toEqual({ type: "dissolve", duration: 0.4 });
  const cleared = applyTemplate(out, TEMPLATES.minimal, "project", null);
  expect(cleared.clips.map((x) => x.transitionOut.type)).toEqual(["none", "none"]);
});

test("project scope restyles captions and existing text overlays", () => {
  const out = applyTemplate(p, TEMPLATES.neon, "project", null);
  const cap = out.overlays.find((o) => o.id === "cap")!;
  const txt = out.overlays.find((o) => o.id === "txt")!;
  expect(cap).toMatchObject({ fontId: "anton", color: "#00F0FF", background: { color: "#000000", opacity: 0.5 }, outline: false, text: "hi" });
  expect(txt).toMatchObject({ ...TEMPLATES.neon.text, text: "hello", start: 1, end: 2 });
  expect(out.overlays).toHaveLength(4);
});

test("empty project is unchanged", () => {
  const empty = makeProject();
  expect(applyTemplate(empty, hype, "project", null)).toBe(empty);
  expect(applyTemplate(empty, hype, "clip", "a")).toBe(empty);
});

test("title and sticker never outlast the project", () => {
  const tiny = makeProject({ clips: [makeClip({ id: "t", sourceDuration: 1 })] });
  const out = applyTemplate(tiny, TEMPLATES.clean, "project", null);
  const total = totalDuration(out);
  const added = out.overlays.slice(-2);
  expect(added).toHaveLength(2);
  for (const o of added) { expect(o.start).toBe(0); expect(o.end).toBeLessThanOrEqual(total); expect(o.end).toBe(total); }
  // sped up: 1 s at 1.5× = 0.667 s
  const fast = applyTemplate(tiny, hype, "project", null);
  for (const o of fast.overlays) expect(o.end).toBeLessThanOrEqual(totalDuration(fast));
});

test("a project look resets the outline colour of the texts and captions it restyles to automatic, and keeps the rest of the style", () => {
  const styled = applyCaptionPreset(applyTextTemplate(p, "txt", "outlineOnly"), "karaoke");   // white edge on the text, black edge on the caption
  const out = applyTemplate(styled, TEMPLATES.retro, "project", null);
  const [cap, txt] = out.overlays as TextOverlay[];
  expect(txt).toMatchObject({ color: TEMPLATES.retro.text.color, outline: true });
  expect(txt.style).toEqual({ ...TEXT_TEMPLATES.outlineOnly.patch.style, outlineColor: null });
  expect(cap.style).toEqual({ ...CAPTION_PRESETS.karaoke.patch.style, outlineColor: null });
  expect(cap.highlightColor).toBe(CAPTION_PRESETS.karaoke.patch.highlightColor);
  // Clip scope restyles no text, so it leaves the colour alone.
  expect((applyTemplate(styled, TEMPLATES.retro, "clip", "a").overlays[1] as TextOverlay).style.outlineColor).toBe("#FFFFFF");
});
