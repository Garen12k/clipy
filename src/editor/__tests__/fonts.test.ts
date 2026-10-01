import { existsSync } from "fs";
import { join } from "path";
import { FONT_IDS, FONTS, fontAssets } from "../fonts";

test("eight fonts, each with a label, family, PostScript name and a TTF on disk", () => {
  expect(FONT_IDS).toHaveLength(8);
  for (const id of FONT_IDS) {
    const f = FONTS[id];
    expect(f.label.length).toBeGreaterThan(0);
    expect(f.family.length).toBeGreaterThan(0);
    expect(f.postScriptName).toMatch(/^[A-Za-z]+-Regular$/);
    expect(existsSync(join(__dirname, "../../../assets/fonts", f.file))).toBe(true);
  }
  expect(Object.keys(fontAssets)).toEqual(FONT_IDS.map((id) => FONTS[id].family));
});
