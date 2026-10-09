import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const ROOT = join(__dirname, "..", "..");
/** The Grand Voyage palette: every colour the theme held before the redesign and holds no more. */
const OLD_HEX = ["0A1B33", "081527", "0C2542", "0E2440", "112C4D", "17365C", "1F4572", "F6E7C1", "9FB3CC", "1C6E9E", "2E86AB", "E5484D", "F47A7E", "E86A7A", "3BA7C9", "9A86D6", "4FA89B", "E0916A", "7F93B8"];
/** The bases of its translucent colours (the gold hairline, the navy scrims), with or without spaces. */
const OLD_RGBA = [/217\s*,\s*179\s*,\s*106/, /\(\s*3\s*,\s*10\s*,\s*20\b/];
/** Colours the USER can put on the video, which happen to equal an old theme value. Exact: one file, the values it may hold. Never add a file for interface colour. */
const CONTENT: Record<string, string[]> = {
  "src/editor/components/ColorRow.tsx": ["2E86AB"],     // a swatch of the text / sticker palette
  "src/editor/textTemplates.ts": ["0A1B33"],            // the "Title bar" template's box
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "__tests__" && name !== "node_modules") walk(p, out); }
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const files = () => ["src", "app"].flatMap((d) => walk(join(ROOT, d))).map((f) => ({ rel: relative(ROOT, f).split(sep).join("/"), src: readFileSync(f, "utf8") }));

test("no colour of the old palette is left in src/ or app/", () => {
  const found: string[] = [];
  const all = files();
  expect(all.length).toBeGreaterThan(200);       // the scan really read the tree
  for (const { rel, src } of all) {
    for (const hex of OLD_HEX) if (new RegExp(`#${hex}\\b`, "i").test(src) && !(CONTENT[rel] ?? []).includes(hex)) found.push(`${rel}: #${hex}`);
    for (const re of OLD_RGBA) if (re.test(src)) found.push(`${rel}: ${re.source}`);
  }
  expect(found).toEqual([]);
});

test("the content exceptions are exact: each listed value is still there", () => {
  for (const [rel, hexes] of Object.entries(CONTENT)) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    for (const hex of hexes) expect(new RegExp(`#${hex}\\b`, "i").test(src)).toBe(true);
  }
});

test("the bridge is gone: no old token name is read", () => {
  const found = files().filter(({ src }) => /theme\.colors\.(sea|seaLight|bgDeep|bgEnd|lane[A-Z]\w*)\b/.test(src)).map((f) => f.rel);
  expect(found).toEqual([]);
});

test("a theme colour is only a value: never built into a string, never sliced (a second appearance must be able to swap it)", () => {
  const found = files().filter(({ rel, src }) => rel !== "src/theme/theme.ts"
    && /\$\{\s*theme\.(colors|elevation)\.|theme\.(colors|elevation)\.\w+\s*\+|theme\.(colors|elevation)\.\w+\.(slice|replace|substring|toUpperCase|toLowerCase)\(/.test(src)).map((f) => f.rel);
  expect(found).toEqual([]);
});
