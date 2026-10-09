import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";
import { ANIM_COMBO, ANIM_IN, ANIM_LOOP, EFFECTS } from "@/src/editor/effects";
import { PHOTO_MOTIONS } from "@/src/editor/photoTools";
import { EQS, VOICES } from "@/src/editor/soundTools";
import { BAR_GLYPH } from "@/src/editor/timelineMarks";
import { GROUPS, TOOL_META } from "@/src/editor/toolGroups";
import { QUICK_RECIPES } from "@/src/projects/quickEdit";
import { PLATFORMS } from "@/src/publish/platforms";
import { SF_SYMBOLS } from "../sfSymbols";

const ROOT = join(__dirname, "..", "..", "..");
const GLYPHS: Record<string, number> = require("@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json");

/**
 * EVERY icon name the app draws, found by the scan below and written out here: a new name in the source fails this suite until it
 * is added to this list AND given a symbol in `SF_SYMBOLS` (or a line in `NO_SYMBOL`, with its reason). 121 names.
 */
const USED = [
  "add-circle-outline", "add-outline", "airplane-outline", "albums-outline", "alert-circle-outline", "aperture-outline", "apps-outline", "arrow-back-circle-outline",
  "arrow-back-outline", "arrow-down-outline", "arrow-forward-circle-outline", "arrow-forward-outline", "arrow-redo-outline", "arrow-undo-outline", "arrow-up-outline",
  "balloon-outline", "ban-outline", "boat-outline", "body-outline", "brush-outline", "bulb-outline", "business-outline", "call-outline", "chatbox-ellipses-outline",
  "chatbubble-outline", "checkbox-outline", "checkmark", "checkmark-circle-outline", "checkmark-done-outline", "checkmark-outline", "chevron-back-outline",
  "chevron-down-outline", "chevron-up-outline", "close-circle-outline", "close-outline", "cloud-outline", "code-outline", "color-fill-outline", "color-filter-outline",
  "color-palette-outline", "color-wand-outline", "construct-outline", "contract-outline", "contrast-outline", "copy-outline", "create-outline", "crop-outline", "cut-outline",
  "diamond", "diamond-outline", "ellipse-outline", "ellipsis-horizontal-outline", "expand-outline", "eye-outline", "film-outline", "fitness-outline", "flame-outline",
  "flash-outline", "flashlight-outline", "git-branch-outline", "git-compare-outline", "grid-outline", "hand-left-outline", "happy-outline", "hardware-chip-outline",
  "heart-outline", "image-outline", "information-circle-outline", "layers-outline", "leaf-outline", "log-out-outline", "logo-facebook", "logo-google", "logo-instagram",
  "logo-tiktok", "logo-x", "logo-youtube", "mail-outline", "mic", "mic-outline", "move-outline", "musical-notes-outline", "options-outline", "paper-plane-outline", "pause",
  "paw-outline", "person-circle-outline", "phone-portrait-outline", "play", "play-back-outline", "play-outline", "pulse-outline", "radio-outline", "refresh-outline",
  "remove-circle-outline", "reorder-two-outline", "repeat-outline", "resize-outline", "scan-outline", "share-outline", "snow-outline", "sparkles-outline", "speedometer-outline",
  "square-outline", "stats-chart-outline", "stop", "stop-outline", "sunny-outline", "swap-horizontal-outline", "swap-vertical-outline", "sync-outline", "text-outline",
  "trash-outline", "trending-up-outline", "videocam-outline", "volume-high-outline", "volume-low-outline", "volume-medium-outline", "warning", "warning-outline", "water-outline",
];
/** The names that are deliberately NOT an SF Symbol, and why. */
const NO_SYMBOL: Record<string, string> = {
  "logo-facebook": "a brand mark", "logo-google": "a brand mark", "logo-instagram": "a brand mark", "logo-tiktok": "a brand mark", "logo-x": "a brand mark", "logo-youtube": "a brand mark",
};
/** Words the scan takes for an icon name that are not one: a tool's state compared in the same expression as its icon. */
const NOT_AN_ICON: Record<string, string[]> = { "src/editor/components/EditorToolbar.tsx": ["remove"] };

const QUOTED = /"([a-z0-9]+(?:-[a-z0-9]+)*)"/g;
/** Where a FILLED name can stand: the value of a `name=` or `icon=` attribute, or of an `icon:` field, up to its end. */
const VALUE = /\b(?:name|icon)=(?:("[^"]*")|\{([^}]*)\})|\bicon:([^,}\n]*)/g;

/** Every Ionicons name in `src`: an outline or brand name anywhere, any other glyph name only where an icon is named. */
function iconNames(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(QUOTED)) if ((m[1].endsWith("-outline") || m[1].startsWith("logo-")) && m[1] in GLYPHS) out.add(m[1]);
  for (const v of src.matchAll(VALUE)) for (const m of (v[1] ?? v[2] ?? v[3] ?? "").matchAll(QUOTED)) if (m[1] in GLYPHS) out.add(m[1]);
  return [...out];
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "__tests__" && name !== "node_modules") walk(p, out); }
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** The version of SF Symbols each symbol first appeared in, from the package's own lists ("4.0" = iOS 16.0, "4.2" = iOS 16.4, "5.0" = iOS 17). */
function symbolVersions(): Map<string, number> {
  const out = new Map<string, number>();
  let version = 0;
  for (const line of readFileSync(join(ROOT, "node_modules/sf-symbols-typescript/dist/index.d.ts"), "utf8").split("\n")) {
    const head = /^export type SFSymbols(\d+)_(\d+) =/.exec(line);
    if (head) { version = Number(head[1]) + Number(head[2]) / 10; continue; }
    const name = /^\s*\| '([^']+)'/.exec(line);
    if (name && version > 0 && !out.has(name[1])) out.set(name[1], version);
  }
  return out;
}

test("the scanner: outline and brand names anywhere, a filled name only where an icon is named, nothing else", () => {
  expect(iconNames('const T = { a: { label: "Edit", icon: "film-outline" } }; const B = { text: "text-outline" };')).toEqual(["film-outline", "text-outline"]);
  expect(iconNames('<Icon name={on ? "pause" : "play"} /><ToolButton icon="warning" /><Stack.Screen name="index" />')).toEqual(["pause", "play", "warning"]);
  expect(iconNames('keyframe: { icon: pin === "remove" ? "diamond" : undefined, disabled: pin === "off" }')).toEqual(["remove", "diamond"]);
  expect(iconNames('if (step === "code") openStrip("filter"); const kind = "text";')).toEqual([]);
  expect(iconNames('"not-a-glyph-outline"')).toEqual([]);
});

test("USED is every icon name in the app's source, no more and no fewer", () => {
  const found = new Set<string>();
  let files = 0;
  for (const dir of ["app", "src"]) for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file).split(sep).join("/");
    if (rel === "src/ui/sfSymbols.ts") continue;                  // the table itself
    files++;
    const skip = NOT_AN_ICON[rel] ?? [];
    for (const n of iconNames(readFileSync(file, "utf8"))) if (!skip.includes(n)) found.add(n);
  }
  expect(files).toBeGreaterThan(200);
  const fresh = [...found].filter((n) => !USED.includes(n)).sort();
  const gone = USED.filter((n) => !found.has(n));
  if (fresh.length > 0 || gone.length > 0) {
    throw new Error(`The icon names in the source and the USED list in src/ui/__tests__/sfSymbols.map.test.ts differ.\n`
      + (fresh.length > 0 ? `  New in the source: ${fresh.join(", ")} — add each to USED and give it an SF Symbol in SF_SYMBOLS (src/ui/sfSymbols.ts), or a line in NO_SYMBOL.\n` : "")
      + (gone.length > 0 ? `  No longer in the source: ${gone.join(", ")} — delete each from USED and from SF_SYMBOLS.\n` : ""));
  }
  expect(USED).toEqual([...USED].sort());
  expect(USED).toHaveLength(121);
});

test("the tables that hand icons to the toolbar, the tiles, the timeline and the platform rows are all in USED", () => {
  const tables: Record<string, { icon: string }>[] = [TOOL_META, EFFECTS, ANIM_IN, ANIM_COMBO, ANIM_LOOP, PHOTO_MOTIONS, VOICES, EQS, QUICK_RECIPES, PLATFORMS];
  const names = [...tables.flatMap((t) => Object.values(t).map((row) => row.icon)), ...GROUPS.map((g) => g.icon), ...Object.values(BAR_GLYPH)];
  expect(names.length).toBeGreaterThan(130);
  expect([...new Set(names)].filter((n) => !USED.includes(n))).toEqual([]);
});

test("every icon name has a decision: an SF Symbol, or a listed reason for none — and the table holds nothing else", () => {
  const table = SF_SYMBOLS as Record<string, string | undefined>;
  expect(USED.filter((n) => table[n] === undefined && NO_SYMBOL[n] === undefined)).toEqual([]);
  expect(USED.filter((n) => table[n] !== undefined && NO_SYMBOL[n] !== undefined)).toEqual([]);
  expect(Object.keys(table).filter((n) => !USED.includes(n))).toEqual([]);
  expect(Object.keys(NO_SYMBOL).filter((n) => !USED.includes(n))).toEqual([]);
  expect(Object.keys(table)).toHaveLength(115);
  expect(Object.keys(NO_SYMBOL)).toHaveLength(6);
  for (const n of USED) if (n.startsWith("logo-")) expect(table[n]).toBeUndefined();   // a brand mark is never Apple's symbol
});

test("every symbol is a real SF Symbol that an iPhone on iOS 16.4 has (SF Symbols 4.2 or older)", () => {
  const versions = symbolVersions();
  expect(versions.get("plus")).toBe(1);
  expect(versions.get("balloon")).toBe(4);
  expect(versions.get("lightspectrum.horizontal")).toBe(5);    // the parser does tell a too-new symbol
  const wrong = Object.entries(SF_SYMBOLS).filter(([, symbol]) => !(versions.get(symbol) !== undefined && versions.get(symbol)! <= 4.2));
  expect(wrong).toEqual([]);
});

test("outline names are plain symbols and filled names are `.fill` symbols", () => {
  /** A filled name whose symbol has no fill to add: a tick is a stroke either way. */
  const STROKE = ["checkmark"];
  for (const [name, symbol] of Object.entries(SF_SYMBOLS)) {
    if (name.endsWith("-outline")) expect(`${name}: ${symbol}`).not.toMatch(/\.fill$/);
    else if (!STROKE.includes(name)) expect(`${name}: ${symbol}`).toMatch(/\.fill$/);
  }
  // The swaps the app makes to show a state: each side has its own symbol.
  expect([SF_SYMBOLS["diamond-outline"], SF_SYMBOLS["diamond"]]).toEqual(["diamond", "diamond.fill"]);                 // Keyframe, on a pin
  expect([SF_SYMBOLS["play"], SF_SYMBOLS["pause"]]).toEqual(["play.fill", "pause.fill"]);                              // the transport
  expect([SF_SYMBOLS["mic"], SF_SYMBOLS["stop"]]).toEqual(["mic.fill", "stop.fill"]);                                  // recording
  expect([SF_SYMBOLS["play-outline"], SF_SYMBOLS["stop-outline"]]).toEqual(["play", "stop"]);                          // a track's preview
  expect([SF_SYMBOLS["square-outline"], SF_SYMBOLS["checkbox-outline"]]).toEqual(["square", "checkmark.square"]);      // a platform, ticked
  expect([SF_SYMBOLS["chevron-down-outline"], SF_SYMBOLS["chevron-up-outline"]]).toEqual(["chevron.down", "chevron.up"]);
});

test("the map, as decided", () => {
  expect(SF_SYMBOLS).toMatchObject({
    "film-outline": "film", "musical-notes-outline": "music.note", "text-outline": "textformat", "happy-outline": "face.smiling", "layers-outline": "square.on.square",
    "grid-outline": "rectangle.split.2x2", "flash-outline": "bolt", "color-filter-outline": "camera.filters", "options-outline": "slider.horizontal.3",
    "color-palette-outline": "paintpalette", "image-outline": "photo", "color-wand-outline": "wand.and.stars", "cut-outline": "scissors", "code-outline": "timeline.selection",
    "speedometer-outline": "speedometer", "volume-high-outline": "speaker.wave.2", "volume-low-outline": "speaker.wave.1", "sparkles-outline": "sparkles", "crop-outline": "crop",
    "resize-outline": "crop.rotate", "contrast-outline": "circle.lefthalf.filled", "ellipse-outline": "circle.dashed", "color-fill-outline": "square.2.layers.3d",
    "body-outline": "person.and.background.dotted", "swap-horizontal-outline": "arrow.left.arrow.right", "sync-outline": "arrow.triangle.2.circlepath", "play-back-outline": "backward",
    "snow-outline": "snowflake", "copy-outline": "plus.square.on.square", "trash-outline": "trash", "git-branch-outline": "waveform.badge.plus", "mic-outline": "mic",
    "stats-chart-outline": "waveform", "chatbox-ellipses-outline": "captions.bubble", "add-circle-outline": "plus.circle", "albums-outline": "checklist",
    "paper-plane-outline": "paperplane", "person-circle-outline": "person.crop.circle", "mail-outline": "envelope", "alert-circle-outline": "exclamationmark.circle",
    "warning": "exclamationmark.triangle.fill", "reorder-two-outline": "line.3.horizontal",
    // The closest matches — no symbol says exactly this; the owner is asked to look at these.
    "hand-left-outline": "camera.viewfinder", "trending-up-outline": "chart.line.uptrend.xyaxis", "phone-portrait-outline": "iphone", "leaf-outline": "leaf",
    "pulse-outline": "waveform.path.ecg", "git-compare-outline": "waveform.path", "flashlight-outline": "light.beacon.max", "fitness-outline": "waveform.path.ecg.rectangle",
  });
});
