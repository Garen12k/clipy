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
/**
 * "Fit" (spec D3, as built): above the default size the label keeps to its line(s) and may SHRINK to fit them. iOS has no floor for
 * that shrink (it ignores `minimumFontScale` and stops at 4 pt), so `fit` is ONLY for a short FIXED label the app itself writes —
 * bounded in length, fitting at the default size — and NEVER for what a user or a platform wrote (a project's name, an account's or
 * a channel's name, an email address), for a message, a caption, a file name or an error sentence: those keep their line limit and
 * their dots. File → how many; every entry says what the label is.
 */
const FIT_KIT: Record<string, number> = {
  "src/ui/Chip.tsx": 1,              // a chip's label: a tab, a preset (`fit={false}` where the phone supplies the name)
  "src/ui/PrimaryButton.tsx": 1,     // a button's title
  "src/ui/QuietButton.tsx": 1,       // a button's title
  "src/ui/SecondaryButton.tsx": 1,   // a button's title
  "src/ui/ScreenBar.tsx": 1,         // a screen's title: "Post", "Accounts", "Welcome"
  "src/ui/Segmented.tsx": 1,         // a segment: "1080p", "Send as Draft"
  "src/ui/Tile.tsx": 1,              // a tile's small second line (`note`): an Export preset's values, "720p · 30 · Small" — at most 18 characters, from fixed tables
};
const FIT_EDITOR: Record<string, number> = {
  "src/editor/components/BackgroundSheet.tsx": 1,     // "Blur"
  "src/editor/components/BeatsSheet.tsx": 2,          // "Fewer", "More"
  "src/editor/components/FilterSheet.tsx": 1,         // a filter's name, from the registry
  "src/editor/components/MultiSelectBar.tsx": 1,      // "3 selected"
  "src/editor/components/ReadAloudSection.tsx": 1,    // "Read aloud"
  "src/editor/components/SmoothSlowSection.tsx": 1,   // "Smooth slow motion"
  "src/editor/components/SoundQualitySheet.tsx": 2,   // "Even out loudness", "Reduce noise"
  "src/editor/components/SpeedSheet.tsx": 1,          // "Smooth"
  "src/editor/components/StickerSheet.tsx": 1,        // a shape's name from the registry (two lines)
  "src/editor/components/TemplateSheet.tsx": 2,       // "Random", a template's name from the registry
  "src/editor/components/TemplateStrip.tsx": 1,       // a template's name from the registry (two lines)
  "src/editor/components/TextStyleSection.tsx": 1,    // a text-look row's title
  "src/editor/components/TransportRow.tsx": 2,        // the time ("0:12 / 1:05"), the ratio ("9:16")
  "src/editor/components/VolumeSheet.tsx": 1,         // "Mute"
};
const FIT_SCREENS: Record<string, number> = {
  "app/accounts.tsx": 2,                              // the build's name and the background-export readout: fixed tables
  "app/index.tsx": 1,                                 // "Creating your project" / "Making your quick edit"
  "src/projects/AspectRatioSheet.tsx": 1,             // a ratio's name
};
/**
 * Texts that ask for shrink-to-fit THEMSELVES, at every size — they did before text size was limited, and the default-tree PROOF
 * holds them: a tool's and a tile's label, a slider row's "Opacity 40 %", the Preview tag. All are short fixed labels. File → how
 * many. Their `minimumFontScale` 0.85 is not honoured by iOS: there is no floor. Never add to this table — a new label uses `fit`.
 */
const SHRINKS_AS_WRITTEN: Record<string, number> = { "src/editor/components/PreviewTag.tsx": 1, "src/ui/Tile.tsx": 1, "src/ui/ToolButton.tsx": 3, "src/ui/ToolStrip.tsx": 1 };
/** The one place that turns `fit` into shrink-to-fit. */
const FIT_PATH = "src/ui/textScale.ts";
/** Tests only: its `shrinks()` looks for the prop. */
const TEST_HELPER = "src/ui/testing/textSize.ts";

const DRAWS = /<Text(Input)?(?![A-Za-z0-9_])|Animated\.Text|createAnimatedComponent\(\s*Text/;
/** The names a file imports as VALUES from "react-native" (`import type` and `type X` specifiers are free). */
function rnValues(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']react-native["']/g)) {
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
  // No way round the named import: the whole module under one name, a default import, or a `require` (whose `.Text` no test above would see).
  const whole = /import\s+\*\s+as\s+\w+\s+from\s+["']react-native["']|import\s+\w+\s*(,\s*\{[^}]*\}\s*)?from\s+["']react-native["']|require\(\s*["']react-native["']\s*\)/;
  expect(files().filter(({ src }) => whole.test(src)).map((f) => f.rel)).toEqual([]);
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
  // In a file that draws content only, EVERY text is fixed — whichever kit text draws it.
  for (const { rel, src } of files().filter((f) => CONTENT_ONLY.includes(f.rel))) {
    expect(`${rel}: ${(src.match(/<(KitText|Body|Title|ValueLabel|StripNote)(?![A-Za-z0-9_])/g) ?? []).length}`).toBe(`${rel}: ${(src.match(/<(KitText|Body|Title|ValueLabel|StripNote) scale="fixed"/g) ?? []).length}`);
  }
});

/** A `fit` attribute on any component, first or after plain attributes (`name`, `name="…"`, `name={…}` without nested braces), with or without a value. */
const FIT_ATTR = /<[A-Z][A-Za-z0-9.]*(?:\s+[A-Za-z]+(?:=(?:"[^"]*"|\{[^{}]*\}))?)*\s+fit(?=[\s>=/])(?!=\{false\})/g;

test("what grows further is exactly the reading list, and what may shrink to fit is exactly the `fit` list", () => {
  expect(counts(/scale="reading"/g)).toEqual(sorted(READING));
  expect(counts(FIT_ATTR)).toEqual(sorted({ ...FIT_KIT, ...FIT_EDITOR, ...FIT_SCREENS }));
  // It is the bare word everywhere but in the chip, which hands its own on so that a chip can say no.
  expect(counts(/\sfit=\{/g)).toEqual(sorted({ "src/ui/Chip.tsx": 1, "src/editor/components/ReadAloudSection.tsx": 2 }));
  expect(counts(/\sfit=\{false\}/g)).toEqual({ "src/editor/components/ReadAloudSection.tsx": 2 });      // a language's and a voice's name: the phone's words, not ours
});

test("shrink-to-fit is asked for by `fit` alone: nothing else names it, but the six labels that always did", () => {
  expect(counts(/\badjustsFontSizeToFit\b/g)).toEqual(sorted({ ...SHRINKS_AS_WRITTEN, [FIT_PATH]: 2, [TEST_HELPER]: 1 }));
  expect(counts(/\bminimumFontScale\b/g)).toEqual(sorted(SHRINKS_AS_WRITTEN));                         // and no file pretends to a floor: iOS keeps none
  expect(counts(/\bminimumFontSize\b/g)).toEqual({});
});

test("the numbers: the hand-off's 1.16, the largest standard size, the reading size — and what they rest on", () => {
  expect(theme.textScale).toEqual({ editor: 1.16, screen: 1.35, reading: 1.65 });
  expect(theme.textScale.screen).toBeLessThanOrEqual(1.353);          // xxxLarge: the screens follow every standard size exactly
  expect(theme.textScale.editor).toBeLessThan(theme.textScale.screen);
  expect(theme.textScale.screen).toBeLessThan(theme.textScale.reading);
});
