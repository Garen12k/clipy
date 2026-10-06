import { readFileSync } from "fs";
import { join } from "path";
import { BEFORE_TONE, FILTER_RECIPES, RECIPE_FILTER_IDS, type FilterStep } from "../filterRecipes";
import { ADJUST_KEYS, DEFAULT_ADJUST } from "../types";
import { FILTER_VECTORS } from "./filterRecipes.vectors";

const iosDir = join(__dirname, "../../../../modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const swift = read("FilterRecipes.swift");
const table = read("Tests/FilterRecipeTests.swift");
const compositor = read("ClipyCompositor.swift");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const fmt = (n: number) => String(n);
const point = (p: readonly [number, number]) => `AdjustPoint(${fmt(p[0])}, ${fmt(p[1])})`;
/** One step as it is written in the Swift table. */
const swiftStep = (s: FilterStep): string => {
  switch (s.kind) {
    case "exposure": return `.adjust(.exposure(ev: ${fmt(s.ev)}))`;
    case "temperatureTint": return `.adjust(.temperatureTint(neutral: ${point(s.neutral)}, target: ${point(s.target)}))`;
    case "colorControls": return `.adjust(.colorControls(brightness: ${fmt(s.brightness)}, contrast: ${fmt(s.contrast)}, saturation: ${fmt(s.saturation)}))`;
    case "toneCurve": return `.adjust(.toneCurve(points: [${s.points.map(point).join(", ")}]))`;
    case "sharpen": return `.adjust(.sharpen(sharpness: ${fmt(s.sharpness)}))`;
    case "vignette": return `.adjust(.vignette(intensity: ${fmt(s.intensity)}, radius: ${fmt(s.radius)}))`;
    case "grain": return `.adjust(.grain(opacity: ${fmt(s.opacity)}))`;
    case "splitTone": return `.splitTone(shadow: "${s.shadow}", highlight: "${s.highlight}", amount: ${fmt(s.amount)})`;
  }
};

test("FilterRecipes.swift holds the same twelve rows, value for value, in the same order", () => {
  const ids = [...between(swift, "static let ids", "]").matchAll(/"(\w+)"/g)].map((m) => m[1]);
  expect(ids).toEqual([...RECIPE_FILTER_IDS]);
  expect([...swift.matchAll(/"(\w+)": FilterRecipe\(/g)].map((m) => m[1])).toEqual([...RECIPE_FILTER_IDS]);
  for (const id of RECIPE_FILTER_IDS) {
    const r = FILTER_RECIPES[id], a = { ...DEFAULT_ADJUST, ...r.adjust };
    const tone = r.tone ? `SplitTone(shadow: "${r.tone.shadow}", highlight: "${r.tone.highlight}", amount: ${fmt(r.tone.amount)})` : "nil";
    expect(swift).toContain(`    "${id}": FilterRecipe(adjust: AdjustValues(${ADJUST_KEYS.map((k) => `${k}: ${fmt(a[k])}`).join(", ")}), tone: ${tone}),`);
  }
});

test("the colour stage is the same six keys on both sides; both stages go through the untouched Adjust functions", () => {
  const stages = code(between(swift, "static func stages(", "\n  }\n"));
  expect([...stages.matchAll(/before\.(\w+) = a\.(\w+)/g)].map((m) => [m[1], m[2]])).toEqual(BEFORE_TONE.map((k) => [k, k]));
  expect([...stages.matchAll(/after\.(\w+) = a\.(\w+)/g)].map((m) => m[1])).toEqual(ADJUST_KEYS.filter((k) => !BEFORE_TONE.includes(k)));
  const apply = code(between(swift, "static func apply(", "\n  }\n"));
  const order = ["Adjust.apply(s.before", "splitTone(", "Adjust.apply(s.after"].map((s) => apply.indexOf(s));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order].sort((x, y) => x - y)).toEqual(order);
  const steps = code(between(swift, "static func steps(", "\n  }\n"));
  expect(steps).toContain("Adjust.steps(s.before)"); expect(steps).toContain("Adjust.steps(s.after)");
});

test("the split tone: brightness mapped onto the two colours, soft light over the frame, mixed by the amount — every filter through the guarded helper", () => {
  const body = code(between(swift, "static func splitTone(", "\n  }\n"));
  expect([...body.matchAll(/"(CI\w+)"/g)].map((m) => m[1])).toEqual(["CIFalseColor", "CISoftLightBlendMode"]);
  expect([...body.matchAll(/Adjust\.filtered\(/g)]).toHaveLength(2);
  expect(body).toContain("\"inputColor0\": CIColor(color: UIColor(hex: tone.shadow))");
  expect(body).toContain("\"inputColor1\": CIColor(color: UIColor(hex: tone.highlight))");
  expect(body).toContain("ClipyCompositor.dissolve(from: image");
  expect(body).toMatch(/else \{ return image \}/);
  // No filter is made any other way in the file.
  expect(code(swift)).not.toMatch(/CIFilter\(name:|applyingFilter\(/);
});

test("the compositor: the old chain block is as it was; a recipe filter takes the branch after it, with the same strength mix", () => {
  const look = between(compositor, "static func look(", "\n  }\n");
  const at = ["if !chain.isEmpty, spec.filterIntensity > 0 {", "} else if spec.filterIntensity > 0, let filtered = FilterRecipes.apply(spec.filter, to: img, time: time) {", "return spec.adjust.isNeutral ? out : Adjust.apply(spec.adjust, to: out, time: time)"].map((s) => look.indexOf(s));
  expect(at.every((i) => i >= 0)).toBe(true);
  expect([...at].sort((x, y) => x - y)).toEqual(at);
  expect([...look.matchAll(/dissolve\(from: img, to: filtered, progress: CGFloat\(spec\.filterIntensity\)\)\.cropped\(to: img\.extent\)/g)]).toHaveLength(2);
  expect([...compositor.matchAll(/FilterRecipes\.apply\(/g)]).toHaveLength(1);
});

describe("the Swift test table embeds every FILTER_VECTORS case", () => {
  it("has the same number of cases", () => expect([...table.matchAll(/FilterVector\(id: "/g)]).toHaveLength(FILTER_VECTORS.length));
  it.each(FILTER_VECTORS.map((v) => [v.id, v] as const))("%s", (_id, v) => {
    expect(table).toContain(`  FilterVector(id: "${v.id}", expect: [${v.steps.map(swiftStep).join(", ")}]),`);
  });
});
