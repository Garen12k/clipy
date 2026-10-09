import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const ROOT = join(__dirname, "..", "..");
/**
 * The Grand Voyage palette: every colour the theme held before the redesign and holds no more — the three navies that did not come
 * back (the deep one, the gradient's end, the old preview surface), the cream and blue-grey text, the sea blues, the old reds and
 * the old lane colours.
 */
const OLD_HEX = ["081527", "0C2542", "0E2440", "F6E7C1", "9FB3CC", "1C6E9E", "2E86AB", "E5484D", "F47A7E", "E86A7A", "3BA7C9", "9A86D6", "4FA89B", "E0916A", "7F93B8"];
/**
 * The four navy steps the owner asked back for every screen that is not the editor (9 October 2026). They are the theme's again —
 * and ONLY the theme's: anywhere else they are still a hard-coded old colour. (They were in OLD_HEX until that day.)
 */
const THEME_ONLY = ["0A1B33", "112C4D", "17365C", "1F4572"];
const THEME = "src/theme/theme.ts";
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
    if (rel !== THEME) for (const hex of THEME_ONLY) if (new RegExp(`#${hex}\\b`, "i").test(src) && !(CONTENT[rel] ?? []).includes(hex)) found.push(`${rel}: #${hex}`);
    for (const re of OLD_RGBA) if (re.test(src)) found.push(`${rel}: ${re.source}`);
  }
  expect(found).toEqual([]);
});

test("the navy is the theme's: each of its four steps is there exactly once", () => {
  const src = readFileSync(join(ROOT, THEME), "utf8");
  for (const hex of THEME_ONLY) expect(src.match(new RegExp(`#${hex}\\b`, "gi")) ?? []).toHaveLength(1);
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
  // The same for the two families (`theme.screen.x`, `theme.surfaces.editor.x`) and for what the kit reads from `useSurfaces()` as `s.x`.
  const FAMILY = String.raw`(?:theme\.screen|theme\.surfaces\.\w+|\bs)\.(?:page|bar|tile|lifted|muted|separator|dangerText)`;
  const built = new RegExp(String.raw`\$\{\s*${FAMILY}\b|${FAMILY}\s*\+|${FAMILY}\.(?:slice|replace|substring|toUpperCase|toLowerCase)\(`);
  expect(built.test("`${theme.screen.page}80`")).toBe(true);                      // the pattern really catches one
  expect(built.test('s.muted + "80"')).toBe(true);
  expect(files().filter(({ rel, src }) => rel !== THEME && built.test(src)).map((f) => f.rel)).toEqual([]);
});

/** What differs between the two families, by the name each side reads it under. */
const EDITOR_KEYS = /theme\.elevation\.|theme\.colors\.(bg|surfaceBar|surfaceAlt|surfaceHigh|textMuted|hairline|dangerText)\b|theme\.surfaces\.editor\b/;
const SCREEN_KEYS = /theme\.screen\.|theme\.surfaces\.screen\b|theme\.colors\.screen[A-Z]/;
/** Only ever drawn on a navy screen. */
const isScreenFile = (rel: string) => /^src\/(auth|projects|export|publish)\//.test(rel) || (rel.startsWith("app/") && rel !== "app/editor/[id]/index.tsx")
  || ["src/ui/Waves.tsx", "src/ui/LoadingScreen.tsx", "src/ui/EmptyState.tsx"].includes(rel);
/** Only ever drawn in the editor: its own code, and the four kit parts that exist only there. */
const EDITOR_KIT = ["ToolStrip", "ToolPanel", "ToolButton", "DoneButton"];
const isEditorFile = (rel: string) => rel.startsWith("src/editor/") || rel === "app/editor/[id]/index.tsx" || EDITOR_KIT.some((k) => rel === `src/ui/${k}.tsx`);

test("two families, one reader each: a screen never reads the editor's neutrals, the editor never reads the navy", () => {
  const all = files();
  expect(all.filter(({ rel, src }) => isScreenFile(rel) && EDITOR_KEYS.test(src)).map((f) => f.rel)).toEqual([]);
  expect(all.filter(({ rel, src }) => isEditorFile(rel) && SCREEN_KEYS.test(src)).map((f) => f.rel)).toEqual([]);
  // The one file outside the editor and the kit that names the editor's page is the route map: the background behind the editor while it slides.
  expect(all.filter(({ rel, src }) => !isEditorFile(rel) && !rel.startsWith("src/ui/") && rel !== THEME && EDITOR_KEYS.test(src)).map((f) => f.rel)).toEqual(["src/navigation/screenOptions.ts"]);
  // The editor-only kit parts are not drawn on a screen.
  const used = new RegExp(String.raw`from "(?:@/src/ui|\.)/(?:${EDITOR_KIT.join("|")})"`);
  expect(all.filter(({ rel, src }) => isScreenFile(rel) && used.test(src)).map((f) => f.rel)).toEqual([]);
});

test("the kit parts drawn on both sides take their surfaces from the tone, not from one family", () => {
  const shared = files().filter(({ rel }) => rel.startsWith("src/ui/") && !isEditorFile(rel) && !isScreenFile(rel));
  expect(shared.length).toBeGreaterThan(15);
  expect(shared.filter(({ rel, src }) => rel !== "src/ui/Screen.tsx" && (EDITOR_KEYS.test(src) || SCREEN_KEYS.test(src))).map((f) => f.rel)).toEqual([]);
});

test('a route says its family once, on its Screen: only the editor and Crop say "editor", and nothing else provides a tone', () => {
  const all = files();
  expect(all.filter(({ src }) => /<\w+[^>]*\stone="editor"/.test(src)).map((f) => f.rel).sort()).toEqual(["app/editor/[id]/index.tsx", "src/editor/components/CropScreen.tsx"]);
  // Every Screen the editor route draws (loading, failed, the editor) says it: no navy page while a project opens.
  const editor = readFileSync(join(ROOT, "app/editor/[id]/index.tsx"), "utf8");
  expect(editor.match(/<Screen\b/g)).toHaveLength(3);
  expect(editor.match(/<Screen tone="editor"/g)).toHaveLength(3);
  expect(all.filter(({ src }) => /ToneContext\.Provider/.test(src)).map((f) => f.rel)).toEqual(["src/ui/Screen.tsx"]);
});
