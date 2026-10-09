import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const ROOT = join(__dirname, "..", "..");
/**
 * The Grand Voyage palette: every colour the theme held before the redesign and holds no more — the three navies that did not come
 * back (the deep one, the gradient's end, the old preview surface), the cream and blue-grey text, the sea blues, the old reds and
 * the old lane colours.
 */
const OLD_HEX = ["081527", "0C2542", "0E2440", "F6E7C1", "9FB3CC", "1C6E9E", "2E86AB", "E5484D", "F47A7E", "E86A7A", "3BA7C9", "9A86D6", "4FA89B", "E0916A", "7F93B8",
  // The hue-free greys of the design hand-off, which the editor wore for a few days and no part of the app wears now (the owner chose soft
  // slate, 9 October 2026): timeline, bar, tile, selected, separator, track — and the old red text. True black is NOT here: it is content
  // (the video's frame, a text's box, a curtain) and the ink on a timeline bar.
  "0E0E0F", "1C1C1E", "2C2C2E", "3A3A3C", "38383A", "636366", "FF8078"];
/**
 * The four navy steps the owner asked back for every screen that is not the editor (9 October 2026). They are the theme's again —
 * and ONLY the theme's: anywhere else they are still a hard-coded old colour. (They were in OLD_HEX until that day.)
 */
const THEME_ONLY = ["0A1B33", "112C4D", "17365C", "1F4572",
  // The editor's soft slate: surround, timeline, bar (the owner's three), tile, selected, separator, track; and the screens' separator.
  "10151F", "171E2B", "212A3A", "2C384D", "374661", "35435D", "52688F", "2B5080",
  // Light: the cream family of the screens (page and card are the owner's, 9 October 2026; tile, selected, picked tint, muted text, separator), the gold
  // as ink on cream, and its two deep reds. The navy TEXT on cream is not a new value: it is the dark page's navy, named there once.
  "F7F1E3", "FFFBF1", "EBE2CC", "DDD0B4", "E8DABC", "4B576B", "D2C5A9", "7A5200", "A3261C", "C92A1A"];
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
    if (statSync(p).isDirectory()) { if (name !== "__tests__" && name !== "node_modules" && name !== "testing") walk(p, out); }
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

test("the navy and the slate are the theme's: each step is there exactly once", () => {
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
  const FAMILY = String.raw`(?:theme\.screen|theme\.screens\.\w+|theme\.surfaces\.\w+|\bs)\.(?:page|bar|tile|lifted|picked|text|muted|separator|accentInk|danger|dangerText)`;
  const built = new RegExp(String.raw`\$\{\s*${FAMILY}\b|${FAMILY}\s*\+|${FAMILY}\.(?:slice|replace|substring|toUpperCase|toLowerCase)\(`);
  expect(built.test("`${theme.screen.page}80`")).toBe(true);                      // the pattern really catches one
  expect(built.test('s.muted + "80"')).toBe(true);
  expect(files().filter(({ rel, src }) => rel !== THEME && built.test(src)).map((f) => f.rel)).toEqual([]);
});

/** What differs between the two families, by the name each side reads it under. */
const EDITOR_KEYS = /theme\.elevation\.|theme\.colors\.(bg|surfaceBar|surfaceAlt|surfaceHigh|textMuted|hairline|dangerText)\b|theme\.surfaces\.editor\b/;
/**
 * The screen family by name — the colours that DIFFER between the phone's two settings. Read like this a colour would not follow the
 * phone, so nothing that draws does: it asks `useSurfaces()` (src/ui/tone.ts), which is told when the setting changes.
 */
const SCREEN_KEYS = /theme\.screen\b|theme\.screens\b|theme\.surfaces\.screen\b|theme\.colors\.(screen[A-Z]\w*|accentInk)\b/;
/** The only code that names the screen family (outside theme.ts, where it is made): where a tone becomes surfaces, where iOS is told the page colour, and the route map (the colour behind a sliding screen). */
const NAMES_SCREEN_FAMILY = ["src/navigation/screenOptions.ts", "src/theme/appearance.ts", "src/ui/tone.ts"];
/** What a screen may still read from `theme.colors`: the roles that are ONE value in both appearances and are right on cream too — the ink on the gold fill, and the scrim over a picture with the words on it. */
const SCREEN_MAY_READ = ["onAccent", "onScrim", "scrim", "scrimStrong"];
/** … and the kit drawn on both sides: also the gold FILL (PrimaryButton) — and nothing else; the slider is the editor's. */
const KIT_MAY_READ: Record<string, string[]> = { "src/ui/PrimaryButton.tsx": ["accent", "onAccent"], "src/ui/Sheet.tsx": ["scrim"], "src/ui/Slider.tsx": ["accent", "track"] };
const colorsRead = (src: string) => [...new Set([...src.matchAll(/theme\.colors\.(\w+)/g)].map((m) => m[1]))].sort();
/** Only ever drawn on a screen (navy, or cream when the phone is light). */
const isScreenFile = (rel: string) => /^src\/(auth|projects|export|publish)\//.test(rel) || (rel.startsWith("app/") && rel !== "app/editor/[id]/index.tsx")
  || ["src/ui/Waves.tsx", "src/ui/LoadingScreen.tsx", "src/ui/EmptyState.tsx"].includes(rel);
/** Only ever drawn in the editor: its own code, and the four kit parts that exist only there. */
const EDITOR_KIT = ["ToolStrip", "ToolPanel", "ToolButton", "DoneButton"];
const isEditorFile = (rel: string) => rel.startsWith("src/editor/") || rel === "app/editor/[id]/index.tsx" || EDITOR_KIT.some((k) => rel === `src/ui/${k}.tsx`);

test("two families, one reader each: a screen never reads the editor's slate, the editor never reads the navy", () => {
  const all = files();
  expect(all.filter(({ rel, src }) => isScreenFile(rel) && EDITOR_KEYS.test(src)).map((f) => f.rel)).toEqual([]);
  expect(all.filter(({ rel, src }) => isEditorFile(rel) && SCREEN_KEYS.test(src)).map((f) => f.rel)).toEqual([]);
  // The one file outside the editor and the kit that names the editor's page is the route map: the background behind the editor while it slides.
  expect(all.filter(({ rel, src }) => !isEditorFile(rel) && !rel.startsWith("src/ui/") && rel !== THEME && EDITOR_KEYS.test(src)).map((f) => f.rel)).toEqual(["src/navigation/screenOptions.ts"]);
  // The editor-only kit parts are not drawn on a screen.
  const used = new RegExp(String.raw`from "(?:@/src/ui|\.)/(?:${EDITOR_KIT.join("|")})"`);
  expect(all.filter(({ rel, src }) => isScreenFile(rel) && used.test(src)).map((f) => f.rel)).toEqual([]);
});

test("light follows the phone: no code that draws names the screen family — it asks useSurfaces(), which is told when the phone's setting changes", () => {
  const all = files();
  expect(SCREEN_KEYS.test("backgroundColor: theme.screen.page")).toBe(true);     // the pattern really catches one
  expect(SCREEN_KEYS.test("theme.screens.light.tile")).toBe(true);
  expect(SCREEN_KEYS.test("color: theme.colors.accentInk")).toBe(true);
  expect(all.filter(({ src }) => SCREEN_KEYS.test(src)).map((f) => f.rel).sort()).toEqual(NAMES_SCREEN_FAMILY);
  // A screen reads from `theme.colors` only what is the same on navy and on cream. Not `text` (white: the editor's), not `accent`
  // (the bright gold is a FILL — as ink on cream it is 1.8 : 1), not `danger` (the family has its own red).
  const strays = all.filter(({ rel }) => isScreenFile(rel)).flatMap(({ rel, src }) => colorsRead(src).filter((k) => !SCREEN_MAY_READ.includes(k)).map((k) => `${rel}: theme.colors.${k}`));
  expect(strays).toEqual([]);
  // The kit drawn on both sides: the same, plus the gold fill — each exception exact.
  const shared = all.filter(({ rel }) => rel.startsWith("src/ui/") && !isEditorFile(rel) && !isScreenFile(rel));
  expect(Object.fromEntries(shared.map(({ rel, src }) => [rel, colorsRead(src)] as const).filter(([, keys]) => keys.length > 0))).toEqual(KIT_MAY_READ);
  // The slider is the editor's alone (its tints are baked at import, in the editor's gold).
  expect(all.filter(({ rel, src }) => isScreenFile(rel) && /from "(?:@\/src\/ui|\.)\/Slider"/.test(src)).map((f) => f.rel)).toEqual([]);
  // The picked ring: the editor's is `theme.ring`; on both-sided parts and on screens it is `ringOf(s)`, in the family's gold ink.
  expect(all.filter(({ rel, src }) => !isEditorFile(rel) && rel !== THEME && rel !== "src/ui/tone.ts" && /theme\.ring\b(?!Clear)/.test(src)).map((f) => f.rel)).toEqual([]);
  // And none of it is read where a module loads — a constant made then would keep the appearance of that moment: `useSurfaces()` is a hook, so it is only ever called while drawing.
  expect(all.filter(({ src }) => /^(?:export )?const \w+ = useSurfaces\(\)/m.test(src)).map((f) => f.rel)).toEqual([]);
});

test("the kit parts drawn on both sides take their surfaces from the tone, not from one family", () => {
  const shared = files().filter(({ rel }) => rel.startsWith("src/ui/") && !isEditorFile(rel) && !isScreenFile(rel));
  expect(shared.length).toBeGreaterThan(15);
  // Screen.tsx says the tone and tone.ts turns it into surfaces: the only two that name a family.
  expect(shared.filter(({ rel, src }) => rel !== "src/ui/Screen.tsx" && rel !== "src/ui/tone.ts" && (EDITOR_KEYS.test(src) || SCREEN_KEYS.test(src))).map((f) => f.rel)).toEqual([]);
});

test('a route says its family once, on its Screen: only the editor and Crop say "editor", and nothing else provides a tone', () => {
  const all = files();
  expect(all.filter(({ src }) => /<\w+[^>]*\stone="editor"/.test(src)).map((f) => f.rel).sort()).toEqual(["app/editor/[id]/index.tsx", "src/editor/components/CropScreen.tsx"]);
  // Every Screen the editor route draws (loading, failed, the editor) says it: no navy page while a project opens.
  const editor = readFileSync(join(ROOT, "app/editor/[id]/index.tsx"), "utf8");
  expect(editor.match(/<Screen\b/g)).toHaveLength(3);
  expect(editor.match(/<Screen tone="editor"/g)).toHaveLength(3);
  expect(all.filter(({ src }) => /ToneContext\.Provider/.test(src)).map((f) => f.rel)).toEqual(["src/ui/Screen.tsx"]);
  // The appearance has ONE provider, the root layout (the app's, and the navy loading screen's) — and under the word "editor" it is never
  // read: `useSurfaces` answers the editor before it reaches the appearance, and the editor's own code never asks for it by name.
  expect(all.filter(({ src }) => /ShownContext\.Provider/.test(src)).map((f) => f.rel).sort()).toEqual(["app/_layout.tsx"]);
  expect(all.filter(({ rel, src }) => isEditorFile(rel) && /\b(ShownContext|useShown|useShownAppearance|shownAppearance|appAppearance)\b/.test(src)).map((f) => f.rel)).toEqual([]);
  const tone = readFileSync(join(ROOT, "src/ui/tone.ts"), "utf8");
  expect(tone).toContain('if (useContext(ToneContext) === "editor") return theme.surfaces.editor;');
  expect(tone.indexOf('=== "editor") return theme.surfaces.editor;')).toBeLessThan(tone.indexOf("use(ShownContext)"));
  // Who else reads it: the layout, and the sign-in page for Apple's button — screens both.
  expect(all.filter(({ src }) => /\buseShown\(\)/.test(src)).map((f) => f.rel).sort()).toEqual(["src/auth/WelcomeScreen.tsx"]);
});
