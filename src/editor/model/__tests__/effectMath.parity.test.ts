import { readFileSync } from "fs";
import { join } from "path";
import { EFFECT, EFFECT_COLORS } from "../effectMath";
import { EFFECT_IDS } from "../types";
import {
  ENVELOPE_VECTORS, FLASH_VECTORS, FLICKER_VECTORS, GLITCH_VECTORS, HASH_VECTORS, LEAK_VECTORS, PULSE_VECTORS, SHAKE_VECTORS,
  type ScalarVector,
} from "./effectMath.vectors";

const iosDir = join(__dirname, "../../../../modules/clipy-video/ios");
/** Line endings normalised, so the checks do not depend on how git checked the files out. */
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const swift = read("EffectMath.swift");
const renderer = read("EffectRenderer.swift");
const table = read("Tests/EffectMathTests.swift");
const session = read("ExportSession.swift");
const compositor = read("ClipyCompositor.swift");

/** Numbers are written in Swift exactly as JS prints them (the vectors are plain literals), e.g. 0.15, -0.0058, 2. */
const fmt = (n: number) => String(n);
/** The text of `source` from `from` up to `to` (or the end). */
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const inOrder = (body: string, parts: string[]) => {
  const at = parts.map((s) => body.indexOf(s));
  expect(at.every((i) => i >= 0)).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
};

/** Every scalar vector with the Swift EffectMath function it checks (the `fn` of its Swift table entry). TS `leakOpacity` is
 *  Swift `leakAlpha` and TS `filmFlicker` is Swift `flickerAlpha`: in Swift a constant and a function cannot share a base name. */
const SCALARS: [string, ScalarVector[]][] = [
  ["hash", HASH_VECTORS], ["envelope", ENVELOPE_VECTORS], ["pulseScale", PULSE_VECTORS], ["flashOpacity", FLASH_VECTORS],
  ["leakAlpha", LEAK_VECTORS], ["flickerAlpha", FLICKER_VECTORS],
];

test("EffectMath.swift declares exactly the EFFECT constants, with the same values", () => {
  const constants = Object.fromEntries(
    [...swift.matchAll(/static let (\w+): Double = (-?[0-9.]+)/g)].map((m) => [m[1], Number(m[2])]),
  );
  expect(constants).toEqual({ ...EFFECT });
});

test("EffectMath.swift declares exactly the EFFECT_COLORS colours", () => {
  const colors = Object.fromEntries([...swift.matchAll(/static let (\w+)Color = "(#[0-9A-Fa-f]{6})"/g)].map((m) => [m[1], m[2]]));
  expect(colors).toEqual({ ...EFFECT_COLORS });
});

test("EffectMath.swift mirrors every scalar function of effectMath.ts", () => {
  for (const fn of ["hash", "envelope", "shakeOffset", "pulseScale", "flashOpacity", "leakAlpha", "flickerAlpha", "glitchSlice"]) {
    expect(swift).toMatch(new RegExp(`static func ${fn}\\(`));
  }
  // No constant shares its base name with a function (Swift rejects `static let x` next to `static func x(...)`).
  const lets = [...swift.matchAll(/static let (\w+)/g)].map((m) => m[1]);
  const funcs = [...swift.matchAll(/static func (\w+)\(/g)].map((m) => m[1]);
  expect(lets.filter((n) => funcs.includes(n))).toEqual([]);
  expect(renderer).toMatch(/EffectMath\.leakAlpha\(t: t, d: d, k: k\)/);
  expect(renderer).toMatch(/EffectMath\.flickerAlpha\(t: t, k: k\)/);
  expect(table).toMatch(/EffectMath\.leakAlpha\(t: a\[0\], d: a\[1\], k: a\[2\]\)/);
  expect(table).toMatch(/EffectMath\.flickerAlpha\(t: a\[0\], k: a\[1\]\)/);
  // frac(x) = x − floor(x) (right for negative numbers too), never a truncating remainder.
  expect(between(swift, "static func frac(", "\n  }\n")).toMatch(/x - x\.rounded\(\.down\)/);
  expect(swift).not.toMatch(/truncatingRemainder/);
});

test("EffectRenderer.apply has one case per effect id, and nothing else", () => {
  const body = between(renderer, "static func apply(", "\n  }\n");
  expect([...body.matchAll(/case "(\w+)"/g)].map((m) => m[1]).sort()).toEqual([...EFFECT_IDS].sort());
  expect(body).toMatch(/default:/);
});

test("the three channel-offset effects share one split helper", () => {
  const body = between(renderer, "static func apply(", "\n  }\n");
  for (const id of ["vhs", "glitch", "rgbSplit"]) {
    const branch = between(body, `case "${id}"`, "\n    case ");
    expect(branch).toContain("splitChannels(image:");
  }
  expect([...renderer.matchAll(/func splitChannels\(/g)]).toHaveLength(1);
  // The isolated channels are recombined per-channel-maximum: (r, 0, 0, a) max (0, g, 0, a) max (0, 0, b, a) = (r, g, b, a).
  expect([...renderer.matchAll(/"CIMaximumCompositing"/g)]).toHaveLength(1);
  expect(renderer).not.toMatch(/CIAdditionCompositing/);
  // One shared guarded-filter helper (Adjust's); the renderer has no copy of its own.
  expect([...renderer.matchAll(/func filtered\(/g)]).toHaveLength(0);
  expect([...read("Adjust.swift").matchAll(/\n  static func filtered\(/g)]).toHaveLength(1);
});

describe("the Swift test table embeds every EFFECT_VECTORS number", () => {
  it("has the same number of cases", () => {
    const scalarCount = SCALARS.reduce((n, [, list]) => n + list.length, 0);
    expect([...table.matchAll(/EffectScalarVector\(fn: "/g)]).toHaveLength(scalarCount);
    expect([...table.matchAll(/EffectShakeVector\(name: "/g)]).toHaveLength(SHAKE_VECTORS.length);
    expect([...table.matchAll(/EffectGlitchVector\(name: "/g)]).toHaveLength(GLITCH_VECTORS.length);
  });
  it.each(SCALARS.flatMap(([fn, list]) => list.map((v) => [`${fn}: ${v.name}`, fn, v] as const)))("%s", (_label, fn, v) => {
    expect(table).toContain(
      `EffectScalarVector(fn: "${fn}", name: "${v.name}", args: [${v.args.map(fmt).join(", ")}], expect: ${fmt(v.expect)})`,
    );
  });
  it.each(SHAKE_VECTORS.map((v) => [v.name, v] as const))("shake: %s", (_name, v) => {
    expect(table).toContain(
      `EffectShakeVector(name: "${v.name}", t: ${fmt(v.t)}, d: ${fmt(v.d)}, k: ${fmt(v.k)}, x: ${fmt(v.x)}, y: ${fmt(v.y)}, scale: ${fmt(v.scale)})`,
    );
  });
  it.each(GLITCH_VECTORS.map((v) => [v.name, v] as const))("glitch: %s", (_name, v) => {
    expect(table).toContain(
      `EffectGlitchVector(name: "${v.name}", t: ${fmt(v.t)}, k: ${fmt(v.k)}, active: ${v.active}, bandY: ${fmt(v.bandY)}, bandH: ${fmt(v.bandH)}, shift: ${fmt(v.shift)}, split: ${fmt(v.split)})`,
    );
  });
});

test("an instruction carries the effects overlapping its range (default none)", () => {
  expect(compositor).toMatch(/let effects: \[ActiveEffectSpec\]/);
  expect(compositor).toMatch(/init\(timeRange: CMTimeRange, layers: \[LayerSpec\],[^\n]*effects: \[ActiveEffectSpec\] = \[\]\)/);
  const build = between(session, "var instructions: [AVVideoCompositionInstructionProtocol] = []", "let videoComposition");
  expect([...build.matchAll(/ClipyInstruction\(/g)]).toHaveLength(2);
  expect([...build.matchAll(/effects: effects\(in: /g)]).toHaveLength(2);
  expect(session).toMatch(/ActiveEffectSpec\.usable\(/);
});

test("the compositor applies the active effects to the finished frame, before the render", () => {
  const body = between(compositor, "func startRequest(", "\n  }\n");
  inOrder(body, ["ClipyCompositor.blend(", "for effect in inst.effects where", "EffectRenderer.apply(", "ctx.render("]);
  // Start inclusive, end exclusive (as activeEffects); local time and duration from the effect's own range.
  expect(body).toMatch(/where time >= effect\.start && time < effect\.end/);
  expect(body).toMatch(/t: time - effect\.start, d: effect\.end - effect\.start, k: effect\.intensity/);
  // The final render is the line it always was (nothing wraps `result` when no effect is active).
  expect(body).toContain("ctx.render(result.cropped(to: rect).composited(over: black), to: out)");
});

test("the blur transition is continuous: both frames blurred by a radius that peaks in the middle", () => {
  expect(between(compositor, "static func blurTransitionRadius(", "\n  }\n")).toMatch(/1 - abs\(2 \* p - 1\)/);
  const start = compositor.indexOf("static func blend(");
  const blend = compositor.slice(start, compositor.indexOf("static func ", start + 1));
  const branch = between(blend, 'case "blur"', "default:");
  expect([...branch.matchAll(/blurred\(/g)]).toHaveLength(2);
  expect(branch).toMatch(/blurTransitionRadius\(/);
  expect(branch).not.toMatch(/p < 0\.5/);
});
