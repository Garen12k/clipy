jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-14T10:00:00.000Z" }));
import { pasteTextLook, TEXT_LOOK_KEYS, textLookOf, type TextLook } from "../ops";
import { DEFAULT_TEXT_STYLE, makeClip, makeKeyframe, makeOverlay, makeProject, makeSticker, type TextOverlay } from "../types";

/** A text whose look is all different from the default: every look field and every style field set. */
const styled: TextOverlay = makeOverlay({
  id: "from", text: "Big sale", fontId: "oswald" as TextOverlay["fontId"], fontScale: 0.12, color: "#FF0000", background: { color: "#00FF00", opacity: 0.5 }, outline: false,
  align: "left", x: 0.2, y: 0.8, scale: 1.5, rotation: 12, start: 1, end: 3,
  style: { opacity: 0.7, letterSpacing: 0.1, lineSpacing: 1.4, outlineColor: "#123456", outlineWidth: 2, shadow: { color: "#111111", opacity: 0.4, distance: 0.1, blur: 0.2 },
    glow: { color: "#ABCDEF", size: 0.3 }, boxPadding: 0.4, boxCorner: "square" },
});
const plain: TextOverlay = makeOverlay({ id: "to", text: "Hello", align: "right", x: 0.6, y: 0.3, scale: 0.8, rotation: -20, start: 0.5, end: 2.5,
  animation: { in: "fade", out: "fade", loop: null } as unknown as TextOverlay["animation"],
  keyframes: [makeKeyframe({ t: 0 }), makeKeyframe({ t: 1, x: 0.7 })] });
const project = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 6 })], overlays: [styled, plain, makeOverlay({ id: "cap", kind: "caption", text: "hi" }), makeSticker({ id: "st" })] });
const find = (p: typeof project, id: string) => p.overlays.find((o) => o.id === id) as TextOverlay;

test("the look is exactly font, size, colour, background, outline and the whole style", () => {
  expect([...TEXT_LOOK_KEYS]).toEqual(["fontId", "fontScale", "color", "background", "outline", "style"]);
  expect(textLookOf(styled)).toEqual({ fontId: "oswald", fontScale: 0.12, color: "#FF0000", background: { color: "#00FF00", opacity: 0.5 }, outline: false, style: styled.style });
});

test("the look is a copy: changing the text afterwards does not change what was copied", () => {
  const look = textLookOf(styled);
  expect(look.style).not.toBe(styled.style);
  expect(look.background).not.toBe(styled.background);
  expect(look.style.shadow).not.toBe(styled.style.shadow);
  expect(look.style.glow).not.toBe(styled.style.glow);
});

test("paste: every look field is the copied one; every other field is the target's, byte for byte", () => {
  const next = pasteTextLook(project, "to", textLookOf(styled));
  expect(next).not.toBe(project);
  const to = find(next, "to");
  for (const k of TEXT_LOOK_KEYS) expect(to[k]).toEqual(styled[k]);
  const rest = (o: TextOverlay) => JSON.stringify(Object.fromEntries(Object.entries(o).filter(([k]) => !(TEXT_LOOK_KEYS as readonly string[]).includes(k))));
  expect(rest(to)).toBe(rest(plain));
  // Every other overlay is the same object.
  for (const id of ["from", "cap", "st"]) expect(next.overlays.find((o) => o.id === id)).toBe(project.overlays.find((o) => o.id === id));
  // The pasted objects are the text's own, not the look's.
  const look = textLookOf(styled);
  const again = find(pasteTextLook(project, "to", look), "to");
  expect(again.style).not.toBe(look.style);
  expect(again.background).not.toBe(look.background);
});

test("paste clamps through the panel's own rules: size to its limits, the style through clampTextStyle, an unknown font or a bad colour keeps the target's", () => {
  const bad = { fontId: "nope", fontScale: 9, color: "red", background: { color: "blue", opacity: 7 }, outline: "yes",
    style: { ...DEFAULT_TEXT_STYLE, opacity: 5, letterSpacing: -3, boxCorner: "oval", extra: 1 } } as unknown as TextLook;
  const to = find(pasteTextLook(project, "to", bad), "to");
  expect(to.fontId).toBe(plain.fontId);
  expect(to.fontScale).toBe(0.25);
  expect(to.color).toBe(plain.color);
  expect(to.background).toBeNull();
  expect(to.outline).toBe(plain.outline);
  expect(to.style).toEqual({ ...DEFAULT_TEXT_STYLE, opacity: 1, letterSpacing: -0.05 });
  // A background with a good colour keeps it, its opacity clamped.
  const half = find(pasteTextLook(project, "to", { ...textLookOf(styled), background: { color: "#00FF00", opacity: 7 } }), "to");
  expect(half.background).toEqual({ color: "#00FF00", opacity: 1 });
});

test("the same look again is no change: the same project (so no undo step)", () => {
  expect(pasteTextLook(project, "from", textLookOf(styled))).toBe(project);
  const once = pasteTextLook(project, "to", textLookOf(styled));
  expect(pasteTextLook(once, "to", textLookOf(styled))).toBe(once);
});

test("a caption, a sticker or an unknown id is refused: the same project", () => {
  const look = textLookOf(styled);
  for (const id of ["cap", "st", "gone"]) expect(pasteTextLook(project, id, look)).toBe(project);
});
