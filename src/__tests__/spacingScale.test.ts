import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const ROOT = join(__dirname, "..", "..");
const DIRS = ["src/ui", "src/editor/components"];
/**
 * Files that still hold raw spacing numbers, with exactly how many. One file per line: a task that fixes a file deletes (or lowers)
 * that file's line and no other. The count is exact — fewer hits than listed fails too, so the table cannot go stale.
 */
const ALLOW: Record<string, { max: number; why: string }> = {
  "src/ui/NumField.tsx": { max: 2, why: "round 1, task 8" },
  "src/ui/Toast.tsx": { max: 2, why: "round 1, task 3" },
  "src/editor/components/AudioBar.tsx": { max: 3, why: "round 1, task 6" },
  "src/editor/components/ClipThumbStrip.tsx": { max: 10, why: "round 1, task 6" },
  "src/editor/components/ColorRow.tsx": { max: 2, why: "round 1, task 7" },
  "src/editor/components/CoverSheet.tsx": { max: 1, why: "the Cover sheet is out of scope in round 1" },
  "src/editor/components/EffectPill.tsx": { max: 1, why: "HANDLE_W + 2: geometry inside a 28-pt lane, below the 4-pt scale" },
  "src/editor/components/FontStrip.tsx": { max: 2, why: "round 1, task 8" },
  "src/editor/components/LayerBar.tsx": { max: 3, why: "round 1, task 6" },
  "src/editor/components/OverlayPill.tsx": { max: 1, why: "HANDLE_W + 2: geometry inside a 28-pt lane, below the 4-pt scale" },
  "src/editor/components/PreviewTag.tsx": { max: 2, why: "round 1, task 6" },
  "src/editor/components/ReorderHandle.tsx": { max: 1, why: "round 1, task 6" },
  "src/editor/components/StickerPanel.tsx": { max: 1, why: "round 1, task 8" },
  "src/editor/components/StickerSheet.tsx": { max: 2, why: "round 1, task 8" },
  "src/editor/components/TextPanel.tsx": { max: 2, why: "round 1, task 8" },
  "src/editor/components/TextStyleSection.tsx": { max: 1, why: "round 1, task 8" },
  "src/editor/components/TransportRow.tsx": { max: 1, why: "round 1, task 6" },
  "src/editor/components/TrimSheet.tsx": { max: 1, why: "round 1, task 7" },
};

/** A spacing property's name, up to its colon. */
const PROP = /\b((?:padding|margin)(?:Top|Bottom|Left|Right|Horizontal|Vertical|Start|End|Inline|Block|InlineStart|InlineEnd|BlockStart|BlockEnd)?|gap|rowGap|columnGap)\s*:/g;
/** A bare number: not part of a name, a member (`STRIP.lift`) or an index. */
const NUMBER = /(?<![\w.$\]])\d+(?:\.\d+)?(?![\w.])/g;

/** Where the comment, string or template literal that starts at `i` ends; -1 when none starts there. A quoted string never runs past its line. */
function literalEnd(src: string, i: number): number {
  const c = src[i], next = src[i + 1];
  if (c === "/" && next === "/") { const j = src.indexOf("\n", i); return j < 0 ? src.length : j; }
  if (c === "/" && next === "*") { const j = src.indexOf("*/", i + 2); return j < 0 ? src.length : j + 2; }
  if (c === '"' || c === "'") {
    let j = i + 1;
    for (; j < src.length && src[j] !== "\n"; j++) { if (src[j] === "\\") j++; else if (src[j] === c) return j + 1; }
    return Math.min(j, src.length);
  }
  if (c !== "`") return -1;
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === "\\") j++;
    else if (src[j] === "`") return j + 1;
    else if (src[j] === "$" && src[j + 1] === "{") {        // `${ … }` is code again: it may hold braces, strings and templates of its own
      let depth = 1;
      j += 2;
      while (j < src.length && depth > 0) {
        const end = literalEnd(src, j);
        if (end >= 0) { j = end; continue; }
        if (src[j] === "{") depth++; else if (src[j] === "}") depth--;
        j++;
      }
      j--;
    }
  }
  return src.length;
}

/** `src` with every comment, string and template literal blanked out. Newlines stay, so line numbers still hold. */
function codeOnly(src: string): string {
  let out = "";
  for (let i = 0; i < src.length;) {
    const end = literalEnd(src, i);
    if (end < 0) { out += src[i++]; continue; }
    out += src.slice(i, end).replace(/[^\n]/g, " ");
    i = end;
  }
  return out;
}

/** The value that starts at `from`: up to the comma, semicolon or closing bracket that ends it (it may span lines and hold calls and brackets of its own). */
function valueAt(code: string, from: number): string {
  let depth = 0, i = from;
  for (; i < code.length; i++) {
    const c = code[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") { if (depth === 0) break; depth--; }
    else if ((c === "," || c === ";") && depth === 0) break;
  }
  return code.slice(from, i);
}

/**
 * Every raw number (other than 0) used as padding / margin / gap in `src`, as `line: property: value`. A value that multiplies or
 * divides is a share of something measured and passes. Comments and strings are not code and never count.
 */
function rawSpacing(src: string): string[] {
  const code = codeOnly(src.replace(/\r\n?/g, "\n"));
  const hits: string[] = [];
  for (const m of code.matchAll(PROP)) {
    const value = valueAt(code, m.index + m[0].length);
    if (/[*/]/.test(value)) continue;
    const line = code.slice(0, m.index).split("\n").length;
    for (const n of value.match(NUMBER) ?? []) if (Number(n) !== 0) hits.push(`${line}: ${m[1]}: ${value.trim().replace(/\s+/g, " ")}`);
  }
  return hits;
}

/** What is wrong with the hits found per file, against the allow-table: one instruction per file, empty when all is as listed. */
function problems(found: Record<string, string[]>, allow: Record<string, { max: number; why: string }>): string[] {
  const out: string[] = [];
  const lines = (file: string) => found[file].map((h) => `      ${file}:${h}`).join("\n");
  for (const file of Object.keys(found).sort()) {
    const n = found[file].length, max = allow[file]?.max;
    if (n === 0 || n === max) continue;
    if (max === undefined) out.push(`${file}: ${n} raw spacing number(s). Use theme.space.* (xs 4, sm 8, md 12, lg 16, xl 24, xxl 32, gutter 16) instead:\n${lines(file)}`);
    else if (n > max) out.push(`${file}: ${n} raw spacing numbers, ${n - max} more than the ${max} the ALLOW table lets it keep. Use theme.space.* for the new one(s):\n${lines(file)}`);
    else out.push(`${file}: ${n} raw spacing number(s) left, the ALLOW table says ${max}. Lower this file's "max" to ${n} in src/__tests__/spacingScale.test.ts. Still there:\n${lines(file)}`);
  }
  for (const file of Object.keys(allow).sort()) {
    if (!(found[file]?.length)) out.push(`${file}: no raw spacing numbers left (or the file is gone). Delete its line from ALLOW in src/__tests__/spacingScale.test.ts.`);
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

test("the scanner: raw numbers are hits; tokens, 0, hairlines, ratios, comments and other properties are not", () => {
  const hits = (code: string) => rawSpacing(code).length;
  expect(hits("{ padding: 10 }")).toBe(1);
  expect(hits("{ paddingHorizontal: 8, gap: 4 }")).toBe(2);                       // on the scale, but still not a token
  expect(hits("{ paddingHorizontal: roomy ? HANDLE_W + 2 : 0 }")).toBe(1);
  expect(hits("{ marginLeft: -14, rowGap: 6, columnGap: 6 }")).toBe(3);
  expect(hits("{ paddingInline: 8, marginBlockStart: 2 }")).toBe(2);
  expect(hits("{ padding: theme.space.md, gap: theme.space.xs, margin: 0 }")).toBe(0);
  expect(hits("{ marginTop: -STRIP.lift, paddingBottom: insets.bottom, borderTopWidth: StyleSheet.hairlineWidth }")).toBe(0);
  expect(hits("{ paddingBottom: StyleSheet.hairlineWidth, marginTop: -StyleSheet.hairlineWidth, gap: sizes.x2, margin: 0.0 }")).toBe(0);
  expect(hits("{ paddingTop: h * 0.12, marginLeft: -HANDLE / 2 }")).toBe(0);
  expect(hits("{ width: 28, height: 44, top: 4, fontSize: 12, borderRadius: 8, hitSlop: 8 }")).toBe(0);
  expect(hits("// padding: 10 would be wrong\n/**\n * the bottom padding: 1 hairline\n */")).toBe(0);
});

test("the scanner: comments and strings are not code, wherever they sit", () => {
  const hits = (code: string) => rawSpacing(code).length;
  expect(hits("{ gap: theme.space.sm } // was gap: 8")).toBe(0);
  expect(hits("/* padding: 10\n   margin: 4 */ const a = { gap: theme.space.xs };")).toBe(0);
  expect(hits("/** a block,\n * gap: 6\n */\nconst a = { /* margin: 3 */ gap: 6 };")).toBe(1);
  expect(hits("const hint = \"use padding: 10\"; const b = 'gap: 4'; const c = `margin: ${n} or margin: 12`;")).toBe(0);
  expect(hits("const url = \"https://example.com\"; const s = { padding: 10 };")).toBe(1);       // `//` inside a string starts no comment
  expect(hits("const s = 'it\\'s'; const t = { gap: 4 };")).toBe(1);                            // an escaped quote does not end the string
  expect(hits("const label = `${on ? `a` : \"}\"} gap: 9`; const s = { gap: 4 };")).toBe(1);    // a template inside a template's ${ }
  expect(hits("{ padding: \"10%\", gap: 5 /* not 6 */ }")).toBe(1);
  expect(hits("<Text>Don't</Text>\nconst s = { gap: 4 };")).toBe(1);                            // a stray quote never swallows the next line
  expect(hits("const s = { gap: 4 }; /* never closed")).toBe(1);
});

test("the scanner: a value may span lines and hold calls; every hit names its line, property and value", () => {
  expect(rawSpacing("const s = StyleSheet.create({\n  row: {\n    gap:\n      6,\n    paddingHorizontal: wide\n      ? 12\n      : 8,\n  },\n});"))
    .toEqual(["3: gap: 6", "5: paddingHorizontal: wide ? 12 : 8", "5: paddingHorizontal: wide ? 12 : 8"]);
  expect(rawSpacing("{ padding: Math.max(8, insets.bottom), margin: pick([a, 3]), width: 9 }")).toEqual(["1: padding: Math.max(8, insets.bottom)", "1: margin: pick([a, 3])"]);
  expect(rawSpacing("{ paddingTop: Math.round(h * 0.5) + 2, gap: clamp(w / 4, lo, hi) }")).toEqual([]);          // a ratio anywhere in the value
  expect(rawSpacing("a\r\nb\r\n{ gap: 4 }")).toEqual(["3: gap: 4"]);                                              // Windows line ends
  expect(rawSpacing("type P = { gap: number; padding?: number };\nfunction f({ gap = 4 }: P) { return <View style={{ gap }} />; }")).toEqual([]);
  expect(rawSpacing("{ row: { gap: 2 }, tile: { margin: 1 } }")).toEqual(["1: gap: 2", "1: margin: 1"]);         // a value ends at its own brace
});

test("the report: says per file whether to use a token, lower the count or delete the line", () => {
  const allow = { "a.tsx": { max: 2, why: "" }, "b.tsx": { max: 2, why: "" }, "c.tsx": { max: 1, why: "" }, "d.tsx": { max: 1, why: "" }, "gone.tsx": { max: 1, why: "" } };
  expect(problems({ "a.tsx": ["1: gap: 4", "2: gap: 4"], "clean.tsx": [] }, { "a.tsx": allow["a.tsx"] })).toEqual([]);
  const out = problems({ "a.tsx": ["1: gap: 4", "2: gap: 4"], "b.tsx": ["1: gap: 4", "2: gap: 4", "9: margin: 3"], "c.tsx": [], "d.tsx": ["4: gap: 6"], "new.tsx": ["7: padding: 10"], "b2.tsx": [] }, { ...allow, "b.tsx": { max: 2, why: "" }, "d.tsx": { max: 3, why: "" } });
  expect(out).toHaveLength(5);
  expect(out[0]).toMatch(/^b\.tsx: 3 raw spacing numbers, 1 more than the 2 .*theme\.space[\s\S]*b\.tsx:9: margin: 3/);
  expect(out[1]).toMatch(/^d\.tsx: 1 raw spacing number\(s\) left, the ALLOW table says 3\. Lower this file's "max" to 1[\s\S]*d\.tsx:4: gap: 6/);
  expect(out[2]).toMatch(/^new\.tsx: 1 raw spacing number\(s\)\. Use theme\.space\.\*[\s\S]*new\.tsx:7: padding: 10/);
  expect(out[3]).toMatch(/^c\.tsx: no raw spacing numbers left.*Delete its line from ALLOW/);
  expect(out[4]).toMatch(/^gone\.tsx: .*Delete its line from ALLOW/);
});

test("no raw padding / margin / gap numbers in the kit and the editor's components, outside the allow-table", () => {
  const found: Record<string, string[]> = {};
  let files = 0;
  for (const dir of DIRS) for (const file of walk(join(ROOT, dir))) {
    files++;
    found[relative(ROOT, file).split(sep).join("/")] = rawSpacing(readFileSync(file, "utf8"));
  }
  expect(files).toBeGreaterThan(50);       // the scan really read the two folders
  const wrong = problems(found, ALLOW);
  if (wrong.length > 0) {
    throw new Error(`Spacing comes from theme.space (src/theme/theme.ts), never from a raw number. ${wrong.length} file(s) to fix:\n\n  - ${wrong.join("\n\n  - ")}\n\n`
      + "A value that multiplies or divides (h * 0.12), 0 and StyleSheet.hairlineWidth are fine. A number that truly cannot be a token gets a line in ALLOW with its reason.");
  }
});
