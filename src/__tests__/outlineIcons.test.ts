import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const ROOT = join(__dirname, "..", "..");
const DIRS = ["app", "src/projects", "src/export", "src/publish"];
/**
 * Files that still name a filled icon, and which ones, in the order they appear. One file per line: the task that fixes a file
 * deletes that file's line and no other. The list is exact, so the table cannot go stale.
 */
const ALLOW: Record<string, string[]> = {
};

/** A `name=` attribute: a string, or an expression whose string literals are all candidates (`name={on ? "a" : "b"}`). */
const NAME = /\bname=(?:"([^"]*)"|\{([^}]*)\})/g;
/** What an Ionicons name looks like (a route name such as "editor/[id]/export" does not). */
const ICON = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Every icon name in `src` that is neither an outline glyph nor a brand logo (the logos have no outline version). */
function filledIcons(src: string): string[] {
  const names: string[] = [];
  for (const m of src.matchAll(NAME)) {
    if (m[1] !== undefined) names.push(m[1]);
    else for (const q of (m[2] ?? "").matchAll(/"([^"]*)"/g)) names.push(q[1]);
  }
  return names.filter((n) => ICON.test(n) && !n.endsWith("-outline") && !n.startsWith("logo-"));
}

/** What is wrong with the names found per file, against the allow-table: one instruction per file, empty when all is as listed. */
function problems(found: Record<string, string[]>, allow: Record<string, string[]>): string[] {
  const out: string[] = [];
  const list = (names: string[]) => names.map((n) => `"${n}"`).join(", ");
  for (const file of Object.keys(found).sort()) {
    const names = found[file], listed = allow[file];
    if (names.length === 0 || JSON.stringify(names) === JSON.stringify(listed)) continue;
    const fresh = listed === undefined ? names : names.filter((n) => !listed.includes(n));
    if (fresh.length > 0) out.push(`${file}: filled icon(s) ${list(fresh)}. Use the outline name instead: ${fresh.map((n) => `"${n}-outline"`).join(", ")}.`);
    else out.push(`${file}: the ALLOW table lists ${list(listed ?? [])}, the file now has ${names.length > 0 ? list(names) : "none"}. Make this file's line in src/__tests__/outlineIcons.test.ts exactly [${list(names)}].`);
  }
  for (const file of Object.keys(allow).sort()) {
    if (!(found[file]?.length)) out.push(`${file}: no filled icons left (or the file is gone). Delete its line from ALLOW in src/__tests__/outlineIcons.test.ts.`);
  }
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

test("the scanner: a filled name is a hit; outline names, logos, route names and variables are not", () => {
  expect(filledIcons('<Ionicons name="add" size={18} />')).toEqual(["add"]);
  expect(filledIcons('<IconButton name="chevron-back-outline" /><Ionicons name="logo-youtube" />')).toEqual([]);
  expect(filledIcons('<Ionicons name={checked ? "checkbox" : "square-outline"} />')).toEqual(["checkbox"]);
  expect(filledIcons('<Stack.Screen name="editor/[id]/export" /><Stack.Screen name={name} /><Ionicons name={icon} />')).toEqual([]);
});

test("the report: says per file whether to use the outline name, correct the line or delete it", () => {
  const allow = { "a.tsx": ["add"], "b.tsx": ["add"], "c.tsx": ["add", "close"], "d.tsx": ["add"], "gone.tsx": ["add"] };
  expect(problems({ "a.tsx": ["add"], "clean.tsx": [] }, { "a.tsx": ["add"] })).toEqual([]);
  const out = problems({ "a.tsx": ["add"], "b.tsx": ["add", "trash"], "c.tsx": ["close"], "d.tsx": [], "new.tsx": ["chevron-back"] }, allow);
  expect(out).toHaveLength(5);
  expect(out[0]).toMatch(/^b\.tsx: filled icon\(s\) "trash"\. Use the outline name instead: "trash-outline"\.$/);
  expect(out[1]).toMatch(/^c\.tsx: the ALLOW table lists "add", "close", the file now has "close"\. Make this file's line .* exactly \["close"\]\.$/);
  expect(out[2]).toMatch(/^new\.tsx: filled icon\(s\) "chevron-back"\. Use the outline name instead: "chevron-back-outline"\.$/);
  expect(out[3]).toMatch(/^d\.tsx: no filled icons left.*Delete its line from ALLOW/);
  expect(out[4]).toMatch(/^gone\.tsx: .*Delete its line from ALLOW/);
});

test("icons on the home, export, post and accounts screens are outline icons, outside the allow-table", () => {
  const found: Record<string, string[]> = {};
  let files = 0;
  for (const dir of DIRS) for (const file of walk(join(ROOT, dir))) {
    files++;
    found[relative(ROOT, file).split(sep).join("/")] = filledIcons(readFileSync(file, "utf8"));
  }
  expect(files).toBeGreaterThan(30);       // the scan really read the four folders
  const wrong = problems(found, ALLOW);
  if (wrong.length > 0) {
    throw new Error(`Icons are Ionicons outline names ("add-outline", never "add"). ${wrong.length} file(s) to fix:\n\n  - ${wrong.join("\n\n  - ")}\n\n`
      + 'Brand marks ("logo-…") have no outline version and are fine. If a glyph has no "-outline" name at all (check node_modules/@expo/vector-icons), pick the nearest outline glyph.');
  }
});
