import { readFileSync } from "fs";
import { join } from "path";
import { MOTION } from "../motion";
import { ANIM_COMBO_IDS, ANIM_IN_IDS, ANIM_LOOP_IDS } from "../types";
import {
  COMBO_VECTORS, IN_VECTORS, KEY_PINS, KEY_VECTORS, LOOP_VECTORS, OUT_VECTORS, RESOLVE_CLIP_VECTORS,
  type DeltaVector, type ResolveClipVector,
} from "./motion.vectors";

const iosDir = join(__dirname, "../../../../modules/clipy-video/ios");
/** Line endings normalised, so the checks do not depend on how git checked the files out. */
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const swift = read("Motion.swift");
const table = read("Tests/MotionTests.swift");
const session = read("ExportSession.swift");
const compositor = read("ClipyCompositor.swift");
const prePass = read("MediaPrePass.swift");

/** Numbers are written in Swift exactly as JS prints them (the vectors are plain literals), e.g. 0.125, -22.5, 2. */
const fmt = (n: number) => String(n);
/** The text of `source` from `from` up to `to` (or the end). */
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
/** Swift source without its comments, so a name in a comment never satisfies a check. */
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
/** The body of one `static func` of Motion.swift (comments removed). */
const fnBody = (name: string) => code(between(swift, `static func ${name}(`, "\n  }\n"));
/** One `case "<id>":` branch of a function body, up to the next case / default. */
const branch = (body: string, id: string): string => {
  const start = body.indexOf(`case "${id}":`);
  if (start < 0) throw new Error(`case "${id}" not found`);
  const next = body.slice(start + 1).search(/\n\s*(case "|default:)/);
  return next < 0 ? body.slice(start) : body.slice(start, start + 1 + next);
};
const caseIds = (body: string) => [...body.matchAll(/case "(\w+)"/g)].map((m) => m[1]);
const usedConstants = (text: string) => [...new Set([...text.matchAll(/Motion\.(\w+)/g)].map((m) => m[1]))].sort();
/** The `@Field var` names of one record in ExportSession.swift, in order. */
const recordFields = (name: string): string[] =>
  [...between(session, `struct ${name}: Record {`, "\n}").matchAll(/@Field var (\w+)/g)].map((m) => m[1]);

type K = keyof typeof MOTION;
/** The MOTION constants each branch reads (spec section 4). */
const IN_CONSTANTS: Record<(typeof ANIM_IN_IDS)[number], K[]> = {
  fade: [], slideLeft: [], slideRight: [], slideUp: [], slideDown: [],
  zoomIn: ["zoomFrom"], zoomOut: ["zoomOutFrom"], spin: ["spinFrom", "spinTurn"],
  pop: ["popFadeBy", "popPeak", "popPeakAt"], rise: ["rise"],
};
const COMBO_CONSTANTS: Record<(typeof ANIM_COMBO_IDS)[number], K[]> = {
  zoomInSlow: ["comboZoom"], zoomOutSlow: ["comboZoom"], panLeft: ["pan", "panScale"], panRight: ["pan", "panScale"],
  sway: ["swayCycles", "swayDeg", "swayScale"], pulse: ["pulseAmp", "pulseHz"],
};
const LOOP_CONSTANTS: Record<(typeof ANIM_LOOP_IDS)[number], K[]> = {
  wiggle: ["wiggleDeg", "wiggleHz"], pulse: ["loopPulseAmp", "loopPulseHz"], spin: ["loopSpinDegPerSec"],
  float: ["floatAmp", "floatHz"], blink: ["blinkHz", "blinkMin"], shake: ["shakeAmp", "shakeHz"],
};

test("Motion.swift declares exactly the MOTION constants, with the same values", () => {
  const constants = Object.fromEntries(
    [...swift.matchAll(/static let (\w+): Double = (-?[0-9.]+)/g)].map((m) => [m[1], Number(m[2])]),
  );
  expect(constants).toEqual({ ...MOTION });
});

test("Motion.swift mirrors every function of motion.ts, and no constant shares a function's name", () => {
  for (const fn of ["easeOut", "smooth", "animInDelta", "animOutDelta", "animComboDelta", "animLoopDelta", "sampleKeyframes", "combine", "resolveClip", "resolveOverlay"]) {
    expect(swift).toMatch(new RegExp(`static func ${fn}\\(`));
  }
  expect(swift).toMatch(/static func animInDelta\(id: String, p: Double, distance: Double\) -> MotionDelta/);
  expect(swift).toMatch(/static func animOutDelta\(id: String, p: Double, distance: Double\) -> MotionDelta/);
  expect(swift).toMatch(/static func animComboDelta\(id: String, p: Double, seconds: Double\) -> MotionDelta/);
  expect(swift).toMatch(/static func animLoopDelta\(id: String, seconds: Double\) -> MotionDelta/);
  expect(swift).toMatch(/static func resolveClip\(base: KeyValues, keyframes: \[MotionKeyframe\], animIn: MotionEdge\?, animOut: MotionEdge\?,\s*animCombo: String\?, local: Double, length: Double\) -> KeyValues/);
  expect(swift).toMatch(/static func resolveOverlay\(base: KeyValues, keyframes: \[MotionKeyframe\], animIn: MotionEdge\?, animOut: MotionEdge\?,\s*animLoop: String\?, local: Double, length: Double\) -> KeyValues/);
  // Swift rejects `static let x` next to `static func x(...)`.
  const lets = [...swift.matchAll(/static let (\w+)/g)].map((m) => m[1]);
  const funcs = [...swift.matchAll(/static func (\w+)\(/g)].map((m) => m[1]);
  expect(lets.filter((n) => funcs.includes(n))).toEqual([]);
});

describe("one case per id inside the matching Swift function, and nothing else", () => {
  const LISTS = [
    ["animInDelta", ANIM_IN_IDS, IN_CONSTANTS],
    ["animComboDelta", ANIM_COMBO_IDS, COMBO_CONSTANTS],
    ["animLoopDelta", ANIM_LOOP_IDS, LOOP_CONSTANTS],
  ] as const;
  it.each(LISTS)("%s", (fn, ids, constants) => {
    const body = fnBody(fn);
    expect(caseIds(body).sort()).toEqual([...ids].sort());
    expect(body).toMatch(/default:\s*break/);                      // unknown ids → the identity
    for (const id of ids) {
      expect(usedConstants(branch(body, id))).toEqual([...(constants as Record<string, K[]>)[id]].sort());
    }
  });
  it("the branch tables cover every MOTION constant except the two slide distances", () => {
    const all = [IN_CONSTANTS, COMBO_CONSTANTS, LOOP_CONSTANTS].flatMap((t) => Object.values(t).flat());
    expect([...new Set([...all, "slideClip", "slideOverlay"])].sort()).toEqual(Object.keys(MOTION).sort());
    expect(usedConstants(fnBody("resolveClip"))).toContain("slideClip");
    expect(usedConstants(fnBody("resolveOverlay"))).toContain("slideOverlay");
  });
  it("Out is the In played backwards with dx, dy and rotation negated", () => {
    const body = fnBody("animOutDelta");
    expect(body).toMatch(/animInDelta\(id: id, p: 1 - \w+\(p\), distance: distance\)/);
    expect(body).toContain("dx: 0 - d.dx, dy: 0 - d.dy, scale: d.scale, rotation: 0 - d.rotation, opacity: d.opacity");
    expect(caseIds(body)).toEqual([]);
  });
  it("the end-point-exact forms of motion.ts are kept", () => {
    const body = fnBody("animInDelta");
    expect(branch(body, "slideLeft")).toContain("d.dx = (1 - e) * distance");
    expect(branch(body, "slideRight")).toContain("d.dx = (e - 1) * distance");
    expect(branch(body, "slideUp")).toContain("d.dy = (1 - e) * distance");
    expect(branch(body, "slideDown")).toContain("d.dy = (e - 1) * distance");
    expect(branch(body, "spin")).toContain("d.rotation = Motion.spinTurn * (e - 1)");
    expect(branch(body, "pop")).toContain("Motion.popPeak * raw / Motion.popPeakAt");
    expect(branch(body, "pop")).toContain("Motion.popPeak - (Motion.popPeak - 1) * ((raw - Motion.popPeakAt) / (1 - Motion.popPeakAt))");
    expect(branch(body, "rise")).toContain("d.dy = Motion.rise * (1 - e)");
    expect(code(between(swift, "static func easeOut(", "\n  }\n"))).toContain("1 - q * q * q");
    expect(code(between(swift, "static func smooth(", "\n  }\n"))).toContain("v * v * (3 - 2 * v)");
  });
});

const delta = (v: { dx: number; dy: number; scale: number; rotation: number; opacity: number }) =>
  `dx: ${fmt(v.dx)}, dy: ${fmt(v.dy)}, scale: ${fmt(v.scale)}, rotation: ${fmt(v.rotation)}, opacity: ${fmt(v.opacity)}`;
const values = (v: { x: number; y: number; scale: number; rotation: number; opacity: number }) =>
  `x: ${fmt(v.x)}, y: ${fmt(v.y)}, scale: ${fmt(v.scale)}, rotation: ${fmt(v.rotation)}, opacity: ${fmt(v.opacity)}`;
const pin = (k: (typeof KEY_PINS)[number]) => `MotionKeyframe(t: ${fmt(k.t)}, ${values(k)})`;
const edge = (e: { id: string; duration: number } | null) => (e ? `MotionEdge(id: "${e.id}", duration: ${fmt(e.duration)})` : "nil");
const resolveEntry = (v: ResolveClipVector) =>
  `MotionResolveVector(name: "${v.name}", base: KeyValues(${values(v.base)}), keyframes: [${v.keyframes.map(pin).join(", ")}], ` +
  `animIn: ${edge(v.animIn)}, animOut: ${edge(v.animOut)}, animCombo: ${v.animCombo ? `"${v.animCombo}"` : "nil"}, ` +
  `local: ${fmt(v.local)}, length: ${fmt(v.length)}, ${values(v)})`;

describe("the Swift test table embeds every MOTION_VECTORS number", () => {
  const EDGES: [string, DeltaVector[]][] = [["in", IN_VECTORS], ["out", OUT_VECTORS]];
  it("has the same number of cases", () => {
    expect([...table.matchAll(/MotionDeltaVector\(fn: "in", /g)]).toHaveLength(IN_VECTORS.length);
    expect([...table.matchAll(/MotionDeltaVector\(fn: "out", /g)]).toHaveLength(OUT_VECTORS.length);
    expect([...table.matchAll(/MotionComboVector\(name: "/g)]).toHaveLength(COMBO_VECTORS.length);
    expect([...table.matchAll(/MotionLoopVector\(name: "/g)]).toHaveLength(LOOP_VECTORS.length);
    expect([...table.matchAll(/MotionKeyVector\(name: "/g)]).toHaveLength(KEY_VECTORS.length);
    expect([...table.matchAll(/MotionResolveVector\(name: "/g)]).toHaveLength(RESOLVE_CLIP_VECTORS.length);
  });
  it.each(EDGES.flatMap(([fn, list]) => list.map((v) => [`${fn}: ${v.name}`, fn, v] as const)))("%s", (_label, fn, v) => {
    expect(table).toContain(
      `MotionDeltaVector(fn: "${fn}", name: "${v.name}", id: "${v.id}", p: ${fmt(v.p)}, distance: ${fmt(v.distance)}, ${delta(v)})`,
    );
  });
  it.each(COMBO_VECTORS.map((v) => [v.name, v] as const))("combo: %s", (_name, v) => {
    expect(table).toContain(`MotionComboVector(name: "${v.name}", id: "${v.id}", p: ${fmt(v.p)}, seconds: ${fmt(v.seconds)}, ${delta(v)})`);
  });
  it.each(LOOP_VECTORS.map((v) => [v.name, v] as const))("loop: %s", (_name, v) => {
    expect(table).toContain(`MotionLoopVector(name: "${v.name}", id: "${v.id}", seconds: ${fmt(v.seconds)}, ${delta(v)})`);
  });
  it("the key pins", () => {
    expect(table).toContain(`let motionKeyPins: [MotionKeyframe] = [\n${KEY_PINS.map((k) => `  ${pin(k)},\n`).join("")}]`);
  });
  it.each(KEY_VECTORS.map((v) => [v.name, v] as const))("keys: %s", (_name, v) => {
    expect(table).toContain(`MotionKeyVector(name: "${v.name}", t: ${fmt(v.t)}, ${values(v)})`);
  });
  it.each(RESOLVE_CLIP_VECTORS.map((v) => [v.name, v] as const))("resolveClip: %s", (_name, v) => {
    expect(table).toContain(resolveEntry(v));
  });
  it("the vectors are checked to 1e-9", () => {
    expect(table).toMatch(/accuracy: 1e-9/);
    expect(table).not.toMatch(/accuracy: 1e-[0-8]\b/);
  });
});

test("the request records decode the motion fields", () => {
  expect(recordFields("ExportAnimEdge")).toEqual(["id", "duration"]);
  expect(recordFields("ExportKeyframe")).toEqual(["t", "x", "y", "scale", "rotation", "opacity"]);
  const key = between(session, "struct ExportKeyframe: Record {", "\n}");
  expect(key).toMatch(/@Field var scale: Double = 1\b/);
  expect(key).toMatch(/@Field var opacity: Double = 1\b/);
  const clip = between(session, "struct ExportClip: Record {", "\n}");
  expect(clip).toMatch(/@Field var animIn: ExportAnimEdge\?/);
  expect(clip).toMatch(/@Field var animOut: ExportAnimEdge\?/);
  expect(clip).toMatch(/@Field var animCombo: String\?/);
  expect(clip).toMatch(/@Field var keyframes: \[ExportKeyframe\] = \[\]/);
  // The clip's length is the composition's (`outDur`): no informational copy travels with the request.
  expect(session).not.toMatch(/outputDuration/);
  expect(prePass).not.toMatch(/outputDuration/);
  expect(readFileSync(join(iosDir, "../index.ts"), "utf8")).not.toMatch(/outputDuration/);
  const overlay = between(session, "struct ExportOverlay: Record {", "\n}");
  expect(overlay).toMatch(/@Field var animIn: ExportAnimEdge\?/);
  expect(overlay).toMatch(/@Field var animOut: ExportAnimEdge\?/);
  expect(overlay).toMatch(/@Field var animLoop: String\?/);
  expect(overlay).toMatch(/@Field var keyframes: \[ExportKeyframe\] = \[\]/);
});

test("the pre-pass rewrite carries every ExportClip field", () => {
  const body = between(prePass, "static func rewrite(", "return out");
  const fields = recordFields("ExportClip");
  expect(fields).toEqual(expect.arrayContaining(["animIn", "animOut", "animCombo", "keyframes", "speedSpans"]));
  expect(fields).not.toContain("outputDuration");
  for (const f of fields) expect(body).toMatch(new RegExp(`\\n\\s*out\\.${f} = `));
  // Speed spans are in PLAYBACK order, which is the order a prepared (reversed) file runs in: carried as they are.
  for (const f of ["animIn", "animOut", "animCombo", "keyframes", "speedSpans"]) expect(body).toContain(`out.${f} = clip.${f}\n`);
  expect(between(session, "struct ExportClip: Record {", "\n}")).toMatch(/@Field var speedSpans: \[ExportSpeedSpan\] = \[\]/);
  expect(recordFields("ExportSpeedSpan")).toEqual(["duration", "speed"]);
});

test("a LayerSpec knows its clip's motion, composition start and length", () => {
  const layer = between(compositor, "final class LayerSpec {", "\n}\n");
  expect(layer).toMatch(/let motion: ClipMotionSpec\?/);
  expect(layer).toMatch(/let clipStart: Double/);
  expect(layer).toMatch(/let clipLength: Double/);
  // Defaults keep every existing call site (and a clip without motion) as it was.
  expect(layer).toMatch(/motion: ClipMotionSpec\? = nil, clipStart: Double = 0, clipLength: Double = 0\)/);
  expect(code(layer)).toMatch(/min\(max\(time - clipStart, 0\), clipLength\)/);
  expect(code(layer)).toMatch(/Motion\.resolveClip\(/);
  const spec = between(session, "func spec(_ i: Int) -> LayerSpec {", "\n    }\n");
  expect(spec).toContain("motion: ExportSession.clipMotion(c), clipStart: placed[i].bodyStart.seconds, clipLength: loaded[i].outDur.seconds)");
});

test("the compositor: motion replaces the placement and fades the picture; without motion the path is unchanged", () => {
  const body = between(compositor, "func startRequest(", "\n  }\n");
  // The motion branch comes first, so `usesFill` is only consulted for a clip without motion.
  const at = ["if spec.motion != nil {", "img = ClipyCompositor.movingFrame(spec, source: source, time: time, size: size)", "} else if spec.usesFill {",
    "img = source.transformed(by: spec.fill).cropped(to: rect)", "} else {",
    "img = ClipyCompositor.placedFrame(spec, transform: spec.transform, opacity: 1, source: source, size: size)"].map((s) => body.indexOf(s));
  expect(at.every((i) => i >= 0)).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
  expect(compositor).toContain("static func movingFrame(_ spec: LayerSpec, source: CIImage, time: Double, size: CGSize) -> CIImage {");   // no unused `motion:`
  const moving = code(between(compositor, "static func movingFrame(", "\n  }\n"));
  expect(moving).not.toMatch(/usesFill/);
  expect(moving).toMatch(/flipH: spec\.transform\.flipH, flipV: spec\.transform\.flipV/);
  expect(moving).toContain("guard t.scale > 0, v.opacity > 0 else { return background(spec, source: source, size: size) }");
  expect(moving).toContain("return placedFrame(spec, transform: t, opacity: v.opacity, source: source, size: size)");
});

test("the compositor: one placement chain for still and moving clips; a fade is a dissolve from the background", () => {
  const all = code(compositor);
  // The crop / clamp / transform chain exists once, in `placedFrame`.
  expect(all.match(/ClipLayout\.ciPlacement\(/g)).toHaveLength(1);
  expect(all.match(/\.clampedToExtent\(\)\n\s*\.transformed\(by: p\.local\)/g)).toHaveLength(1);
  const placed = code(between(compositor, "static func placedFrame(", "\n  }\n"));
  expect(placed).toContain("static func placedFrame(_ spec: LayerSpec, transform: ClipTransform, opacity: Double, source: CIImage, size: CGSize) -> CIImage {");
  expect(placed).toContain("ClipLayout.ciPlacement(orientedExtent: oriented.extent, crop: spec.crop, transform: transform, frame: size)");
  for (const step of ["oriented.cropped(to: p.cropRect).clampedToExtent()", ".transformed(by: p.local).cropped(to: p.localRect)", ".transformed(by: p.outer)"]) expect(placed).toContain(step);
  // The background shows when the picture does not cover the frame OR it is not fully opaque.
  expect(placed).toContain("let covered = opacity >= 1 && ClipLayout.coversFrame(p.placed, size.width, size.height)");
  expect(placed).toContain("let over = picture.composited(over: behind).cropped(to: rect)");
  // Fully opaque: no dissolve at all. Otherwise background → picture-over-background by the opacity (no alpha arithmetic).
  expect(placed).toContain("guard opacity < 1 else { return over }");
  expect(placed).toContain("guard opacity > 0 else { return behind }");
  expect(placed).toContain("return dissolve(from: behind, to: over, progress: CGFloat(opacity)).cropped(to: rect)");
  expect(all).not.toMatch(/inputAVector/);
  expect(all).not.toMatch(/static func faded\(/);
  expect(table).not.toMatch(/ClipyCompositor\.faded\(/);
  expect(table).not.toMatch(/movingFrame\([^)]*motion:/);
  expect(table).toContain("func testAPlacedFrameFadesByDissolvingFromItsBackground()");
});
