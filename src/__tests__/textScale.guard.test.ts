import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";
import { theme } from "@/src/theme/theme";

const ROOT = join(__dirname, "..", "..");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "__tests__" && name !== "node_modules") walk(p, out); }
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const files = () => ["src", "app"].flatMap((d) => walk(join(ROOT, d))).map((f) => ({ rel: relative(ROOT, f).split(sep).join("/"), src: readFileSync(f, "utf8") }));
const counts = (pattern: RegExp): Record<string, number> =>
  Object.fromEntries(files().map(({ rel, src }) => [rel, (src.match(pattern) ?? []).length] as const).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)));
const sorted = (table: Record<string, number>) => Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b)));

/** The one file that draws React Native's Text and TextInput. */
const KIT_TEXT = "src/ui/Text.tsx";
/** Files that still draw raw text: emptied by the task that owns them (the plan's Task 2 and Task 3). Both are [] when the work is done. */
const PENDING_EDITOR: string[] = [];
const PENDING_SCREENS: string[] = [];
const PENDING = [...PENDING_EDITOR, ...PENDING_SCREENS];

/** Never scaled (spec D5): file → how many texts. Content in the video frame, marks on the timeline, a glyph as a picture. */
const FIXED_KIT: Record<string, number> = { "src/ui/EmptyState.tsx": 1, "src/ui/LoadingScreen.tsx": 2, "src/ui/ProgressRing.tsx": 1 };
const FIXED_EDITOR: Record<string, number> = { "src/editor/components/AudioBar.tsx": 2, "src/editor/components/ClipThumbStrip.tsx": 1, "src/editor/components/CoverFrame.tsx": 1,
  "src/editor/components/EffectPill.tsx": 1, "src/editor/components/FontStrip.tsx": 1, "src/editor/components/LayerBar.tsx": 1, "src/editor/components/OverlayPill.tsx": 1,
  "src/editor/components/OverlayText.tsx": 6, "src/editor/components/StickerSheet.tsx": 2, "src/editor/components/StickerView.tsx": 2, "src/editor/components/TemplateSheet.tsx": 1,
  "src/editor/components/TimeRuler.tsx": 1 };
const FIXED_SCREENS: Record<string, number> = { "src/projects/ProjectCard.tsx": 2 };
/** Files that draw content only: every text in them is fixed. */
const CONTENT_ONLY: string[] = ["src/ui/LoadingScreen.tsx", "src/editor/components/AudioBar.tsx", "src/editor/components/ClipThumbStrip.tsx", "src/editor/components/CoverFrame.tsx",
  "src/editor/components/FontStrip.tsx", "src/editor/components/LayerBar.tsx", "src/editor/components/OverlayPill.tsx", "src/editor/components/OverlayText.tsx", "src/editor/components/StickerView.tsx",
  "src/editor/components/TimeRuler.tsx"];
/** A paragraph under a title on a page that scrolls (spec D6): file → how many. */
const READING: Record<string, number> = { "src/auth/EmailSignIn.tsx": 2, "src/auth/WelcomeScreen.tsx": 2, "src/auth/WelcomeWizard.tsx": 1, "src/export/ExportScreenBody.tsx": 2, "src/publish/components/SignInCard.tsx": 2 };
/** One-line labels in a box of a fixed height that fit back at a larger text size (spec D3): file → how many. */
const FIT_KIT: Record<string, number> = { "src/ui/Chip.tsx": 1, "src/ui/PrimaryButton.tsx": 1, "src/ui/QuietButton.tsx": 1, "src/ui/SecondaryButton.tsx": 1 };
const FIT_EDITOR: Record<string, number> = { "src/editor/components/BackgroundSheet.tsx": 1, "src/editor/components/BeatsSheet.tsx": 2, "src/editor/components/ReadAloudSection.tsx": 1,
  "src/editor/components/SoundQualitySheet.tsx": 2, "src/editor/components/SpeedSheet.tsx": 1, "src/editor/components/TemplateSheet.tsx": 2, "src/editor/components/TextStyleSection.tsx": 1,
  "src/editor/components/TransportRow.tsx": 1, "src/editor/components/VolumeSheet.tsx": 1 };
const FIT_SCREENS: Record<string, number> = { "app/index.tsx": 1 };

const DRAWS = /<Text(Input)?(?![A-Za-z0-9_])|Animated\.Text|createAnimatedComponent\(\s*Text/;
/** The names a file imports as VALUES from "react-native" (`import type` and `type X` specifiers are free). */
function rnValues(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+"react-native"/g)) {
    if (m[1]) continue;
    for (const raw of m[2].split(",")) { const name = raw.trim(); if (name && !name.startsWith("type ")) out.push(name.split(/\s+as\s+/)[0]); }
  }
  return out;
}

test("only the kit's Text.tsx draws React Native's Text and TextInput", () => {
  expect(files().filter(({ src }) => DRAWS.test(src)).map((f) => f.rel).sort()).toEqual([KIT_TEXT, ...PENDING].sort());
  const importers = Object.fromEntries(files().map(({ rel, src }) => [rel, rnValues(src).filter((n) => n === "Text" || n === "TextInput").sort()] as const).filter(([, n]) => n.length > 0));
  const allowed: Record<string, string[]> = { [KIT_TEXT]: ["Text", "TextInput"], "src/ui/ToolPanel.tsx": ["TextInput"] };   // ToolPanel: TextInput.State only
  for (const rel of PENDING) delete importers[rel];
  expect(importers).toEqual(allowed);
  expect(files().filter(({ src }) => /import\s+\*\s+as\s+\w+\s+from\s+"react-native"/.test(src)).map((f) => f.rel)).toEqual([]);
});

test("the props that limit text size are named in the kit's two files (and the test helper) only", () => {
  const named = files().filter(({ src }) => /\b(allowFontScaling|maxFontSizeMultiplier|accessibilityShowsLargeContentViewer|accessibilityLargeContentTitle)\b/.test(src)).map((f) => f.rel).sort();
  expect(named).toEqual(["src/ui/Text.tsx", "src/ui/testing/textSize.ts", "src/ui/textScale.ts"]);
});

test("one file asks the phone for its text size", () => {
  const asks = /getFontScale|useWindowDimensions\(\)\.fontScale|Dimensions\.get\([^)]*\)\.fontScale|\bfontScale\b\s*[,}][^=\n]*=\s*useWindowDimensions/;
  expect(files().filter(({ src }) => asks.test(src)).map((f) => f.rel)).toEqual(["src/ui/phoneTextSize.ts"]);
});

test("what never scales is exactly the list: content, marks on the timeline, a glyph as a picture", () => {
  expect(counts(/scale="fixed"/g)).toEqual(sorted({ ...FIXED_KIT, ...FIXED_EDITOR, ...FIXED_SCREENS }));
  for (const { rel, src } of files().filter((f) => CONTENT_ONLY.includes(f.rel))) {
    expect(`${rel}: ${(src.match(/<KitText(?![A-Za-z0-9_])/g) ?? []).length}`).toBe(`${rel}: ${(src.match(/<KitText scale="fixed"/g) ?? []).length}`);
  }
});

test("what grows further is exactly the reading list, and what fits back by `fit` is exactly its list", () => {
  expect(counts(/scale="reading"/g)).toEqual(sorted(READING));
  expect(counts(/<(Body|Title|KitText) fit[\s>]/g)).toEqual(sorted({ ...FIT_KIT, ...FIT_EDITOR, ...FIT_SCREENS }));
});

test("the numbers: the hand-off's 1.16, the largest standard size, the reading size — and what they rest on", () => {
  expect(theme.textScale).toEqual({ editor: 1.16, screen: 1.35, reading: 1.65 });
  expect(0.85 * theme.textScale.editor).toBeLessThan(1);              // a tool label that shrinks to fit never needs more width than at the default
  expect(theme.textScale.screen).toBeLessThanOrEqual(1.353);          // xxxLarge: the screens follow every standard size exactly
  expect(theme.textScale.editor).toBeLessThan(theme.textScale.screen);
  expect(theme.textScale.screen).toBeLessThan(theme.textScale.reading);
});
