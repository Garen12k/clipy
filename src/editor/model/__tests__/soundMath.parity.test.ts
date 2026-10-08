import { readFileSync } from "fs";
import { join } from "path";
import { LEVEL, SOFT_CLIP } from "../soundMath";

const swift = readFileSync(join(__dirname, "../../../../modules/clipy-video/ios/SoundMath.swift"), "utf8").replace(/\r\n/g, "\n");
/** Swift source without its comments, so a name in a comment never satisfies a check. */
const code = swift.replace(/\/\/[^\n]*/g, "");
const fnBody = (name: string) => {
  const start = code.indexOf(`static func ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  return code.slice(start, code.indexOf("\n  }\n", start));
};

test("SoundMath.swift declares the constants of soundMath.ts with the same values", () => {
  const constants = Object.fromEntries([...code.matchAll(/static let (\w+): Double = (-?[0-9.]+)/g)].map((m) => [m[1], Number(m[2])]));
  expect(constants).toEqual({
    levelTargetDb: LEVEL.targetDb, levelGateDb: LEVEL.gateDb, levelMaxBoostDb: LEVEL.maxBoostDb, levelMaxCutDb: LEVEL.maxCutDb, levelBlockSeconds: LEVEL.blockSeconds,
    clipKnee: SOFT_CLIP.knee, clipCeiling: SOFT_CLIP.ceiling,
  });
  // Every `static let` is one of those.
  expect([...code.matchAll(/static let (\w+)/g)].map((m) => m[1]).sort()).toEqual(Object.keys(constants).sort());
});

test("it mirrors the three functions, and is pure", () => {
  expect(code).toContain("static func dbToGain(_ db: Double) -> Double {");
  expect(code).toContain("static func levelGainDb(_ blocks: [Double]) -> Double {");
  expect(code).toContain("static func softClip(_ x: Double) -> Double {");
  // Swift rejects `static let x` next to `static func x(...)`.
  const values = [...code.matchAll(/static (?:let|var) (\w+)/g)].map((m) => m[1]);
  const funcs = [...code.matchAll(/static func (\w+)\(/g)].map((m) => m[1]);
  expect(values.filter((n) => funcs.includes(n))).toEqual([]);
  expect(new Set(funcs).size).toBe(funcs.length);
  expect(code).not.toMatch(/import (AVFoundation|AVFAudio|CoreMedia)/);
  expect(code).toContain("import Foundation");
});

test("the formulas are the ones of soundMath.ts", () => {
  expect(fnBody("dbToGain")).toContain("db.isFinite ? pow(10, db / 20) : 1");
  const level = fnBody("levelGainDb");
  expect(level).toContain("let gate = pow(10, levelGateDb / 10)");
  expect(level).toContain("for b in blocks where b.isFinite && b > gate {");
  expect(level).toContain("guard count > 0 else { return 0 }");
  expect(level).toContain("let measured = 10 * log10(sum / count)");
  expect(level).toContain("return min(levelMaxBoostDb, max(-levelMaxCutDb, levelTargetDb - measured))");
  const clip = fnBody("softClip");
  expect(clip).toContain("guard x.isFinite else { return 0 }");
  expect(clip).toContain("if a <= clipKnee { return x }");
  expect(clip).toContain("let room = clipCeiling - clipKnee");
  expect(clip).toContain("let y = clipKnee + room * tanh((a - clipKnee) / room)");
  expect(clip).toContain("return x < 0 ? -y : y");
});
