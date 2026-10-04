import { readFileSync } from "fs";
import { join } from "path";

/**
 * The native export of text / sticker motion is never compiled here, so these checks read the Swift source: the sampler exists with
 * the agreed signature, the animated path reuses the static path's position and transform builders, and the static path is unchanged.
 */
const iosDir = join(__dirname, "../../../../modules/clipy-video/ios");
/** Line endings normalised, so the checks do not depend on how git checked the files out. */
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
/** Swift source without its comments, so a name in a comment never satisfies a check. */
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
/** The text of `source` from `from` up to `to` (or the end). */
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};

const motion = code(read("OverlayMotion.swift"));
const session = code(read("ExportSession.swift"));
const tests = read("Tests/OverlayMotionTests.swift");

test("OverlayMotion.swift is pure maths: Foundation only, no layers", () => {
  expect([...read("OverlayMotion.swift").matchAll(/^import (\w+)/gm)].map((m) => m[1])).toEqual(["Foundation"]);
  expect(motion).not.toMatch(/CALayer|CAKeyframeAnimation|CGPoint|UIKit/);
});

test("the sampler has the agreed signature and samples 30 times per second", () => {
  expect(motion).toContain("static func samples(start: Double, end: Double, fps: Double, resolve: (Double) -> KeyValues) -> [(time: Double, values: KeyValues)]");
  // The rate is named once (`ExportSession.frameRate`) and shared by the composition's frame duration, the hold frame and the sampler.
  expect(motion).toMatch(/static let fps: Double = Double\(ExportSession\.frameRate\)\n/);
  expect(session).toMatch(/static let frameRate: Int32 = 30\n/);
  expect(session).toContain("videoComposition.frameDuration = CMTime(value: 1, timescale: ExportSession.frameRate)");
  expect(session).toContain("let holdFrame = CMTime(value: 1, timescale: ExportSession.frameRate)");
  expect(session).not.toMatch(/timescale: 30\)/);
});

test("a sampled scale of 0 never gives a singular transform: the ratio has a small positive floor", () => {
  expect(motion).toMatch(/static let minScaleRatio: Double = 0\.001\n/);
  const body = between(motion, "static func scaleRatio(", "\n  }\n");
  expect(body).toContain("return max(minScaleRatio, scale / base)");
  expect(tests).toContain("XCTAssertEqual(OverlayMotion.scaleRatio(0, base: 1), OverlayMotion.minScaleRatio)");
  expect(tests).toContain("XCTAssertEqual(OverlayMotion.scaleRatio(-1, base: 1), OverlayMotion.minScaleRatio)");
});

test("the resolver is Motion.resolveOverlay over the overlay's own values (opacity 1), its pins, edges and loop", () => {
  const body = between(motion, "static func resolver(", "\n  }\n");
  expect(body).toContain("KeyValues(x: o.x, y: o.y, scale: o.scale, rotation: o.rotation, opacity: 1)");
  expect(body).toContain("ExportSession.motionKeyframes(o.keyframes)");
  expect(body).toContain("ExportSession.motionEdge(o.animIn)");
  expect(body).toContain("ExportSession.motionEdge(o.animOut)");
  expect(body).toContain("Motion.resolveOverlay(base: base, keyframes: keyframes, animIn: animIn, animOut: animOut, animLoop: loop, local: local, length: length)");
  expect(body).toContain("let length = o.end - o.start");
});

test("captions never have motion; an overlay without an animation or pins has none", () => {
  const body = between(motion, "static func hasMotion(", "\n  }\n");
  expect(body).toMatch(/o\.kind != "caption"/);
  for (const part of ["motionEdge(o.animIn) != nil", "motionEdge(o.animOut) != nil", "(o.animLoop ?? \"\").isEmpty", "motionKeyframes(o.keyframes).isEmpty"]) expect(body).toContain(part);
});

test("the static path and the animated path share one position and one transform builder", () => {
  const position = between(session, "static func overlayPosition(", "\n  }\n");
  expect(position).toContain("CGPoint(x: CGFloat(x) * renderSize.width, y: renderSize.height - CGFloat(y) * renderSize.height)");
  const transform = between(session, "static func overlayTransform(", "\n  }\n");
  expect(transform).toContain("CATransform3DMakeRotation(-rotation * .pi / 180, 0, 0, 1)");
  expect(transform).toContain("CATransform3DScale(turn, scale, scale, 1)");
  // Nobody else builds a position or a rotation.
  expect(session.match(/CATransform3DMakeRotation\(/g)).toHaveLength(1);
  expect(session.match(/renderSize\.height - CGFloat\(/g)).toHaveLength(1);
  expect(session).not.toContain("renderSize.height - l.centerY");
  for (const fn of ["static func overlayLayer(", "static func stickerLayer("]) {
    const body = between(session, fn, "\n  }\n");
    expect(body).toContain("container.position = overlayPosition(x: o.x, y: o.y, renderSize: renderSize)");
    expect(body).toMatch(/container\.transform = overlayTransform\(scale: 1, rotation: [^\n]+\)\n/);
    // Motion when there is some, else the visibility animation (a text passes its style's opacity to both: textExport.swift.test.ts).
    expect(body).toMatch(/if !addMotion\(container, o, renderSize: renderSize(, opacity: shown)?\) \{ addVisibility\(container, start: o\.start, end: o\.end(, opacity: shown)?\) \}\n/);
  }
});

test("the visibility animation of an overlay without motion is as it was", () => {
  // The shown opacity is 1 unless a caller passes a text style's opacity.
  expect(session).toContain("static func addVisibility(_ layer: CALayer, start: Double, end: Double, opacity: Double = 1) {");
  const body = between(session, "static func addVisibility(", "\n  }\n");
  for (const line of [
    "layer.opacity = 0", 'CABasicAnimation(keyPath: "opacity")', "anim.fromValue = opacity", "anim.toValue = opacity",
    "anim.beginTime = max(start, AVCoreAnimationBeginTimeAtZero)", "anim.duration = end - start", "anim.fillMode = .removed",
    "anim.isRemovedOnCompletion = true", 'layer.add(anim, forKey: "visible")',
  ]) expect(body).toContain(line);
});

test("addMotion drives position, transform and opacity with linear keyframe animations over the overlay's life", () => {
  const body = between(session, "static func addMotion(", "\n  }\n");
  expect(body).toContain("guard OverlayMotion.hasMotion(o) else { return false }");
  expect(body).toContain("OverlayMotion.samples(start: o.start, end: o.end, fps: OverlayMotion.fps, resolve: OverlayMotion.resolver(o))");
  expect(body).toContain("layer.opacity = 0");
  expect(body).toContain("overlayPosition(x: s.values.x, y: s.values.y, renderSize: renderSize)");
  expect(body).toContain("overlayTransform(scale: CGFloat(OverlayMotion.scaleRatio(s.values.scale, base: o.scale)), rotation: CGFloat(s.values.rotation))");
  for (const path of ["position", "transform", "opacity"]) expect(body).toContain(`"${path}"`);
  for (const line of [
    "CAKeyframeAnimation(keyPath: keyPath)", "anim.keyTimes = keyTimes", "anim.calculationMode = .linear",
    "anim.beginTime = max(o.start, AVCoreAnimationBeginTimeAtZero)", "anim.duration = o.end - o.start", "anim.fillMode = .removed",
    "anim.isRemovedOnCompletion = false",
  ]) expect(body).toContain(line);
});

test("the XCTests cover the sampler: count, first and last time, values from the resolver", () => {
  expect(tests).toContain("@testable import ClipyVideo");
  for (const name of ["testSampleCountAndTimes", "testLastSampleIsExactlyTheEnd", "testAtLeastTwoSamples", "testValuesComeFromTheResolver", "testResolverMatchesMotionResolveOverlay", "testScaleRatio"]) {
    expect(tests).toContain(`func ${name}()`);
  }
});
