import { readFileSync } from "fs";
import { join } from "path";
import { ADJUST, adjustRecipe, type AdjustStep } from "../adjust";
import { ADJUST_KEYS, type ClipAdjust } from "../types";
import { ADJUST_VECTORS } from "./adjust.vectors";

const iosDir = join(__dirname, "../../../../modules/clipy-video/ios");
/** Line endings normalised, so the checks do not depend on how git checked the files out. */
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const swift = read("Adjust.swift");
const table = read("Tests/AdjustTests.swift");
const session = read("ExportSession.swift");
const compositor = read("ClipyCompositor.swift");
const prePass = read("MediaPrePass.swift");

/** Numbers are written in Swift exactly as JS prints them (the vectors are plain literals), e.g. 0.25, -1.5, 6500. */
const fmt = (n: number) => String(n);
const point = (p: readonly [number, number]) => `AdjustPoint(${fmt(p[0])}, ${fmt(p[1])})`;
/** One recipe step as it is written in the Swift table. */
const swiftStep = (s: AdjustStep): string => {
  switch (s.kind) {
    case "exposure": return `.exposure(ev: ${fmt(s.ev)})`;
    case "temperatureTint": return `.temperatureTint(neutral: ${point(s.neutral)}, target: ${point(s.target)})`;
    case "colorControls": return `.colorControls(brightness: ${fmt(s.brightness)}, contrast: ${fmt(s.contrast)}, saturation: ${fmt(s.saturation)})`;
    case "toneCurve": return `.toneCurve(points: [${s.points.map(point).join(", ")}])`;
    case "sharpen": return `.sharpen(sharpness: ${fmt(s.sharpness)})`;
    case "vignette": return `.vignette(intensity: ${fmt(s.intensity)}, radius: ${fmt(s.radius)})`;
    case "grain": return `.grain(opacity: ${fmt(s.opacity)})`;
  }
};
const swiftValues = (a: ClipAdjust) => `AdjustValues(${ADJUST_KEYS.map((k) => `${k}: ${fmt(a[k])}`).join(", ")})`;

/** The Swift table entry for one vector: from its `name: "..."` up to the next entry (or the end of the table). */
const entry = (name: string): string => {
  const start = table.indexOf(`name: "${name}"`);
  if (start < 0) throw new Error(`AdjustTests.swift: vector "${name}" not found`);
  const next = table.indexOf("name: \"", start + 1);
  return table.slice(start, next < 0 ? undefined : next);
};
/** The text of `source` from `from` up to `to` (or the end). */
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
/** The `@Field var` names of one record in ExportSession.swift, in order. */
const recordFields = (name: string): string[] =>
  [...between(session, `struct ${name}: Record {`, "\n}").matchAll(/@Field var (\w+)/g)].map((m) => m[1]);

const ALL_HALF = ADJUST_VECTORS.find((v) => v.name === "all keys at 0.5")!;
/** Every step kind, in recipe order (from the TS recipe itself). */
const KINDS = adjustRecipe(ALL_HALF.adjust).map((s) => s.kind);
/** The Core Image filter each step starts with (spec section 4.1). */
const CI_FILTER: Record<AdjustStep["kind"], string> = {
  exposure: "CIExposureAdjust", temperatureTint: "CITemperatureAndTint", colorControls: "CIColorControls",
  toneCurve: "CIToneCurve", sharpen: "CISharpenLuminance", vignette: "CIVignette", grain: "CIRandomGenerator",
};

test("Adjust.swift declares exactly the ADJUST constants, with the same values", () => {
  const constants = Object.fromEntries(
    [...swift.matchAll(/static let (\w+): Double = (-?[0-9.]+)/g)].map((m) => [m[1], Number(m[2])]),
  );
  expect(constants).toEqual({ ...ADJUST });
});

test("Adjust.steps builds the steps in the recipe's order, from the constants", () => {
  expect(KINDS).toEqual(["exposure", "temperatureTint", "colorControls", "toneCurve", "sharpen", "vignette", "grain"]);
  const body = between(swift, "static func steps(", "static func apply(");
  expect([...body.matchAll(/steps\.append\(\.(\w+)/g)].map((m) => m[1])).toEqual(KINDS);
  for (const name of Object.keys(ADJUST)) expect(body).toContain(`Adjust.${name}`);
  // The only bare numbers are the tone curve's fixed x / y positions (as in adjustRecipe) and the neutral tests.
  const literals = [...body.replace(/\/\/[^\n]*/g, "").matchAll(/(?<![\w.])\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  expect(literals.filter((n) => ![0, 0.25, 0.5, 0.75, 1].includes(n))).toEqual([]);
});

test("Adjust.apply turns each step into its Core Image filter, in the recipe's order", () => {
  const body = between(swift, "static func apply(", "\n  }\n");
  const cases = [...body.matchAll(/case \.(\w+)[^\n]*?"(CI\w+)"/g)].map((m) => [m[1], m[2]]);
  expect(cases).toEqual(KINDS.map((k) => [k, CI_FILTER[k]]));
  expect(body).toMatch(/Adjust\.steps\(/);
});

test("the grain recipe: noise, monochrome, alpha scaled to the opacity, over the frame, moved per frame", () => {
  const body = between(swift, "static func grain(", "\n  }\n");
  const order = ["CIRandomGenerator", "CIColorControls", "CIColorMatrix", "composited(over: image)"].map((s) => body.indexOf(s));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(body).toMatch(/grainOffset\(time/);
});

describe("the Swift test table embeds every ADJUST_VECTORS case", () => {
  it("has the same number of cases", () => {
    expect([...table.matchAll(/AdjustVector\(\s*name: "/g)]).toHaveLength(ADJUST_VECTORS.length);
  });
  it.each(ADJUST_VECTORS.map((v) => [v.name, v] as const))("%s", (name, v) => {
    const e = entry(name);
    expect(e).toContain(`adjust: ${swiftValues(v.adjust)}`);
    expect(e).toContain(`expect: [${v.recipe.map(swiftStep).join(", ")}])`);
  });
  it("the vectors are what adjustRecipe gives (so the table is the recipe's output)", () => {
    for (const v of ADJUST_VECTORS) {
      const got = adjustRecipe(v.adjust);
      expect(got.map((s) => s.kind)).toEqual(v.recipe.map((s) => s.kind));
    }
  });
});

test("AdjustValues and the ExportAdjust record carry the twelve keys in ADJUST_KEYS order", () => {
  const values = between(swift, "struct AdjustValues", "static let neutral");
  expect([...values.matchAll(/(?:var|let) (\w+): Double/g)].map((m) => m[1])).toEqual([...ADJUST_KEYS]);
  expect(recordFields("ExportAdjust")).toEqual([...ADJUST_KEYS]);
  expect(between(session, "struct ExportAdjust: Record {", "\n}")).not.toMatch(/Double = (?!0\b)/);
});

test("the request records decode the new fields with the defaults", () => {
  const clip = between(session, "struct ExportClip: Record {", "\n}");
  expect(clip).toMatch(/@Field var filterIntensity: Double = 1\b/);
  expect(clip).toMatch(/@Field var adjust: ExportAdjust = ExportAdjust\(\)/);
  expect(recordFields("ExportEffect")).toEqual(["type", "start", "end", "intensity"]);
  expect(between(session, "struct ExportRequest: Record {", "\n}")).toMatch(/@Field var effects: \[ExportEffect\] = \[\]/);
});

test("the pre-pass keeps a prepared clip's strength and adjust values", () => {
  const body = between(prePass, "static func rewrite(", "return out");
  expect(body).toContain("out.filterIntensity = clip.filterIntensity");
  expect(body).toContain("out.adjust = clip.adjust");
});

test("the compositor applies the filter at its strength, then the adjust chain", () => {
  const body = between(compositor, "static func look(", "\n  }\n");
  const order = ["Effects.filterChain(", "filterIntensity", "dissolve(", "Adjust.apply("].map((s) => body.indexOf(s));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(body).toMatch(/adjust\.isNeutral/);
  expect(compositor).toMatch(/compositionTime\.seconds/);
});
