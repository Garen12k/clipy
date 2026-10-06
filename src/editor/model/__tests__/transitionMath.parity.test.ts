import { readFileSync } from "fs";
import { join } from "path";
import { TRANSITION, TRANSITION_COLORS } from "../transitionMath";
import { TRANSITION_IRIS_VECTORS, TRANSITION_SCALAR_VECTORS, TRANSITION_SLIDE_VECTORS } from "./transitionMath.vectors";

const iosDir = join(__dirname, "../../../../modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const swift = read("TransitionMath.swift");
const table = read("Tests/TransitionMathTests.swift");
const ts = readFileSync(join(__dirname, "../transitionMath.ts"), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const fmt = (n: number) => String(n);

test("TransitionMath.swift declares exactly the TRANSITION constants and the flash colour", () => {
  const constants = Object.fromEntries([...swift.matchAll(/static let (\w+): Double = (-?[0-9.]+)/g)].map((m) => [m[1], Number(m[2])]));
  expect(constants).toEqual({ ...TRANSITION });
  const colors = Object.fromEntries([...swift.matchAll(/static let (\w+)Color = "(#[0-9A-Fa-f]{6})"/g)].map((m) => [m[1], m[2]]));
  expect(colors).toEqual({ flash: TRANSITION_COLORS.flash });           // the curtain colour is the preview's alone
});

test("the same functions, the same expressions", () => {
  const FUNCTIONS = ["unitProgress", "dip", "slideOffsets", "irisRadius", "diagonalEdge", "clockAngle", "pixelSize"];
  for (const fn of FUNCTIONS) expect(swift).toMatch(new RegExp(`static func ${fn}\\(`));
  const body = code(swift);
  // The clamp is the same, and every function clamps its progress before anything else, on both sides.
  const clamp = between(body, "static func unitProgress(", "\n  }\n");
  expect(clamp).toContain("if progress.isNaN { return 0 }");
  expect(clamp).toContain("return min(1, max(0, progress))");
  expect(ts).toContain("Number.isNaN(progress) ? 0 : Math.min(1, Math.max(0, progress))");
  for (const fn of FUNCTIONS.slice(1)) {
    expect(body).toMatch(new RegExp(`static func ${fn}\\((_ type: String, )?_ progress: Double\\) -> [A-Za-z?]+ \\{\\n    let p = unitProgress\\(progress\\)\\n`));
    expect(ts).toMatch(new RegExp(`export function ${fn}\\((type: string, )?progress: number\\): [a-zA-Z |]+ \\{\\n  const p = unitProgress\\(progress\\);\\n`));
  }
  expect(body).toContain("return 1 - abs(2 * p - 1)");
  expect(body).toContain("case \"cover\": return SlideOffsets(ax: 0, ay: 0, bx: 1 - p, by: 0, incomingOnTop: true)");
  expect(body).toContain("case \"reveal\": return SlideOffsets(ax: 0 - p, ay: 0, bx: 0, by: 0, incomingOnTop: false)");
  expect(body).toContain("case \"coverUp\": return SlideOffsets(ax: 0, ay: 0, bx: 0, by: 1 - p, incomingOnTop: true)");
  expect(body).toContain("case \"revealDown\": return SlideOffsets(ax: 0, ay: p, bx: 0, by: 0, incomingOnTop: false)");
  expect(body).toContain("case \"circleOpen\": return p");
  expect(body).toContain("case \"circleClose\": return 1 - p");
  expect(between(body, "static func diagonalEdge(", "\n  }\n")).toContain("return 2 * p");
  expect(between(body, "static func clockAngle(", "\n  }\n")).toContain("return tau * p");
  expect(between(body, "static func pixelSize(", "\n  }\n")).toContain("return TransitionMath.pixelMax * dip(p)");
  // Pure maths: no Core Image, no UIKit.
  expect(body).not.toMatch(/import (CoreImage|UIKit)|CIImage|CIFilter/);
});

describe("the Swift test tables embed every vector", () => {
  it("have the same number of cases", () => {
    expect([...table.matchAll(/TransitionScalarVector\(fn: "/g)]).toHaveLength(TRANSITION_SCALAR_VECTORS.length);
    expect([...table.matchAll(/TransitionSlideVector\(type: "/g)]).toHaveLength(TRANSITION_SLIDE_VECTORS.length);
    expect([...table.matchAll(/TransitionIrisVector\(type: "/g)]).toHaveLength(TRANSITION_IRIS_VECTORS.length);
  });
  it.each(TRANSITION_SCALAR_VECTORS.map((v) => [`${v.fn}(${v.p})`, v] as const))("%s", (_n, v) => {
    expect(table).toContain(`  TransitionScalarVector(fn: "${v.fn}", p: ${fmt(v.p)}, expect: ${fmt(v.expect)}),`);
  });
  it.each(TRANSITION_SLIDE_VECTORS.map((v) => [`${v.type} ${v.p}`, v] as const))("%s", (_n, v) => {
    expect(table).toContain(`  TransitionSlideVector(type: "${v.type}", p: ${fmt(v.p)}, ax: ${fmt(v.ax)}, ay: ${fmt(v.ay)}, bx: ${fmt(v.bx)}, by: ${fmt(v.by)}, incomingOnTop: ${v.incomingOnTop}),`);
  });
  it.each(TRANSITION_IRIS_VECTORS.map((v) => [`${v.type} ${v.p}`, v] as const))("%s", (_n, v) => {
    expect(table).toContain(`  TransitionIrisVector(type: "${v.type}", p: ${fmt(v.p)}, radius: ${fmt(v.radius)}),`);
  });
});
