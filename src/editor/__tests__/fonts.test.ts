import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { FONT_IDS, FONTS, fontAssets } from "../fonts";

/** Reads name ID 6 (PostScript name) from a TrueType / OpenType font buffer; platform 3 (UTF-16BE) preferred, platform 1 (MacRoman) as fallback. */
export function readPostScriptName(b: Buffer): string | null {
  const numTables = b.readUInt16BE(4);
  let nameOffset = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (b.toString("latin1", rec, rec + 4) === "name") nameOffset = b.readUInt32BE(rec + 8);
  }
  if (nameOffset < 0) return null;
  const count = b.readUInt16BE(nameOffset + 2), strings = nameOffset + b.readUInt16BE(nameOffset + 4);
  let mac: string | null = null;
  for (let i = 0; i < count; i++) {
    const r = nameOffset + 6 + i * 12;
    if (b.readUInt16BE(r + 6) !== 6) continue;
    const platform = b.readUInt16BE(r), encoding = b.readUInt16BE(r + 2), len = b.readUInt16BE(r + 8), off = strings + b.readUInt16BE(r + 10);
    const raw = b.subarray(off, off + len);
    if (platform === 3 && encoding === 1) return Buffer.from(raw).swap16().toString("utf16le");
    if (platform === 1 && mac === null) mac = raw.toString("latin1");
  }
  return mac;
}

const FONT_DIR = join(__dirname, "../../../assets/fonts");

test("sixteen fonts, each with a label, family, PostScript name and a TTF on disk", () => {
  expect(FONT_IDS).toHaveLength(16);
  for (const id of FONT_IDS) {
    const f = FONTS[id];
    expect(f.label.length).toBeGreaterThan(0);
    expect(f.family.length).toBeGreaterThan(0);
    expect(f.postScriptName).toMatch(/^[A-Za-z0-9]+-[A-Za-z]+$/);
    expect(existsSync(join(FONT_DIR, f.file))).toBe(true);
  }
  expect(Object.keys(fontAssets)).toEqual(FONT_IDS.map((id) => FONTS[id].family));
});

test("every font file is listed in the expo-font plugin of app.json", () => {
  const app = JSON.parse(readFileSync(join(__dirname, "../../../app.json"), "utf8"));
  const plugin = app.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === "expo-font");
  const listed: string[] = plugin[1].fonts;
  expect([...listed].sort()).toEqual(FONT_IDS.map((id) => `./assets/fonts/${FONTS[id].file}`).sort());
});

test("each registry PostScript name equals the one inside its TTF (the export looks fonts up by it)", () => {
  for (const id of FONT_IDS) {
    expect({ id, name: readPostScriptName(readFileSync(join(FONT_DIR, FONTS[id].file))) }).toEqual({ id, name: FONTS[id].postScriptName });
  }
});
