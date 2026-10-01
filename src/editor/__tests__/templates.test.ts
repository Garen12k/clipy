import { FILTERS, SHAPES, TRANSITIONS } from "../effects";
import { FONTS } from "../fonts";
import { SPEED_LIMITS } from "../model/types";
import { pickRandomTemplate, TEMPLATE_IDS, TEMPLATES } from "../templates";

test("every template uses only registered ids and sane values", () => {
  expect(Object.keys(TEMPLATES).sort()).toEqual([...TEMPLATE_IDS].sort());
  for (const id of TEMPLATE_IDS) {
    const t = TEMPLATES[id];
    expect(t.id).toBe(id);
    expect(FILTERS[t.filter]).toBeDefined();
    expect(TRANSITIONS[t.transition.type]).toBeDefined();
    expect(FONTS[t.text.fontId]).toBeDefined();
    if (t.caption.fontId) expect(FONTS[t.caption.fontId]).toBeDefined();
    if (t.sticker.shape) expect(SHAPES[t.sticker.shape]).toBeDefined();
    expect(t.sticker.emoji !== null || t.sticker.shape !== null).toBe(true);
    expect(t.speed).toBeGreaterThanOrEqual(SPEED_LIMITS[0]);
    expect(t.speed).toBeLessThanOrEqual(SPEED_LIMITS[1]);
    if (t.transition.type !== "none") {
      expect(t.transition.duration).toBeGreaterThanOrEqual(0.3);
      expect(t.transition.duration).toBeLessThanOrEqual(0.6);
    }
    for (const c of t.swatch) expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
  }
});

test("pickRandomTemplate never returns the excluded id and covers all others", () => {
  for (const exclude of [...TEMPLATE_IDS, null]) {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const t = pickRandomTemplate(exclude, rnd);
      expect(t.id).not.toBe(exclude);
      seen.add(t.id);
    }
    expect(seen.size).toBe(exclude ? TEMPLATE_IDS.length - 1 : TEMPLATE_IDS.length);
  }
  expect(pickRandomTemplate("clean", () => 0.999999).id).not.toBe("clean");
  expect(pickRandomTemplate("clean", () => 0).id).toBe("retro");
});
