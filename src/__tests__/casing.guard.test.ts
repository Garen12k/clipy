/**
 * Labels are title-style and nothing forces a case. Test files are not scanned (they may assert the ABSENCE of a transform).
 * Two documented blind spots of the label scanner, neither of which produces a false alarm:
 *  - a `title` that comes after a prop containing `>` (an arrow function) on the same element is not seen;
 *  - a label inside a template literal with `${…}` in a `title={…}` expression is not seen.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const ROOT = join(__dirname, "..", "..");
const DIRS = ["src/ui", "src/editor/components", "src/projects", "src/export", "src/publish", "src/auth", "app"];
/** Joining words that stay lower case inside a title-style label (never as its first word). */
const SMALL = new Set(["a", "an", "and", "the", "to", "with", "in", "of", "for", "or"]);
/** The only `.toUpperCase()` calls: they compare colour codes, they do not show text. */
const UPPER_OK = ["src/editor/components/BackgroundSheet.tsx", "src/editor/components/ChromaSheet.tsx", "src/editor/components/ColorRow.tsx"];

/**
 * Title-style: no word starts with a lower-case letter, except a joining word that is neither first nor last ("Sign In", not "Sign in").
 * A one-letter unit ("s"), a word that trails off ("to…") and a `${value}` pass.
 */
export function isTitleStyle(label: string): boolean {
  const words = label.replace(/\$\{[^}]*\}/g, "0").split(/\s+/).filter(Boolean);
  return words.every((w, i) => !/^[a-z]/.test(w) || (i > 0 && (w.length === 1 || w.endsWith("…") || (i < words.length - 1 && SMALL.has(w)))));
}

/** Every literal label of a button, a tab chip, a strip / panel / sheet action and an alert button in `src`. */
export function labels(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/<(?:PrimaryButton|SecondaryButton|QuietButton|Chip)\b[^>]*?\b(?:title|label)=(?:"([^"]*)"|\{([^}]*)\})/g)) {
    if (m[1] !== undefined) out.push(m[1]);
    else for (const q of (m[2] ?? "").matchAll(/"([^"]*)"|`([^`]*)`/g)) out.push(q[1] ?? q[2]);
  }
  for (const m of src.matchAll(/\baction=\{[^}]*?\blabel:\s*"([^"]*)"/g)) out.push(m[1]);
  if (src.includes("Alert.alert(")) for (const m of src.matchAll(/\{\s*text:\s*"([^"]*)"/g)) out.push(m[1]);
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "__tests__" && name !== "node_modules") walk(p, out); }
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const rel = (f: string) => relative(ROOT, f).split(sep).join("/");

test("the rule: capitals on every word but a joining word in the middle", () => {
  for (const ok of ["Export", "New Project", "Choose Photos and Videos", "Continue Without an Account", "Continue with Google", "Post to…", "Save to Photos", "Apply to All Clips", "Resend Code in ${n} s", "Sign In", "4K", "1080p"]) expect(isTitleStyle(ok)).toBe(true);
  for (const bad of ["New project", "Try again", "sign In", "Sign in", "Cut to beats", "to Photos"]) expect(isTitleStyle(bad)).toBe(false);
});

test("the scanner finds titles, chip labels, actions and alert buttons", () => {
  expect(labels('<PrimaryButton compact title="Export" onPress={go} />')).toEqual(["Export"]);
  expect(labels('<QuietButton title={first ? "Continue Without an Account" : "Not Now"} />')).toEqual(["Continue Without an Account", "Not Now"]);
  expect(labels('<Chip compact label="Slow Motion" selected />')).toEqual(["Slow Motion"]);
  expect(labels('<ToolStrip action={layer ? undefined : { label: "Apply to All Clips", onPress }} />')).toEqual(["Apply to All Clips"]);
  expect(labels('Alert.alert("Stop posting?", "…", [{ text: "Keep Posting", style: "cancel" }, { text: "Stop" }])')).toEqual(["Keep Posting", "Stop"]);
  expect(labels('<Body>Find beats in your music</Body>')).toEqual([]);
});

test("every literal button, tab chip, action and alert button is title-style", () => {
  const wrong: string[] = [];
  let seen = 0;
  for (const dir of DIRS) for (const file of walk(join(ROOT, dir))) {
    for (const l of labels(readFileSync(file, "utf8"))) { seen++; if (!isTitleStyle(l)) wrong.push(`${rel(file)}: "${l}"`); }
  }
  expect(seen).toBeGreaterThan(50);       // the scan really found the labels
  expect(wrong).toEqual([]);
});

test("nothing forces a case: no textTransform anywhere, and toUpperCase only where colour codes are compared", () => {
  const transform: string[] = [], upper: string[] = [];
  for (const dir of ["src", "app"]) for (const file of walk(join(ROOT, dir))) {
    const src = readFileSync(file, "utf8");
    if (src.includes("textTransform")) transform.push(rel(file));
    if (/\.toUpperCase\(\)/.test(src)) upper.push(rel(file));
  }
  expect(transform).toEqual([]);
  expect(upper.sort()).toEqual(UPPER_OK);
});
