import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const ROOT = join(__dirname, "..", "..");
/** The only files that name a font family: they draw CONTENT (text on the video, the font picker's samples, the cover). */
const FAMILY_OK = ["src/editor/components/CoverFrame.tsx", "src/editor/components/FontStrip.tsx", "src/editor/components/OverlayText.tsx", "src/projects/ProjectCard.tsx"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "__tests__" && name !== "node_modules") walk(p, out); }
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const files = () => ["src", "app"].flatMap((d) => walk(join(ROOT, d))).map((f) => ({ rel: relative(ROOT, f).split(sep).join("/"), src: readFileSync(f, "utf8") }));

test("interface text is the system font: a font family is named only where content is drawn", () => {
  expect(files().filter(({ src }) => /\bfontFamily\b/.test(src)).map((f) => f.rel).sort()).toEqual(FAMILY_OK);
});

test("no interface font is left: no theme.fonts, no uiFonts module, no interface-only font key", () => {
  const found = files().filter(({ rel, src }) => /theme\.fonts\b|uiFontAssets|theme\/uiFonts|Montserrat_600SemiBold|Montserrat_800ExtraBold/.test(src)
    || (/Oswald_700Bold/.test(src) && rel !== "src/editor/coverFont.ts")).map((f) => f.rel);
  expect(found).toEqual([]);
  expect(readdirSync(join(ROOT, "assets", "fonts", "ui")).sort()).toEqual(["OFL.txt", "Oswald_700Bold.ttf"]);
});
