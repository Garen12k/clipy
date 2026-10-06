import { readFileSync } from "fs";
import { join } from "path";
import { TRANSITION, TRANSITION_COLORS } from "../transitionMath";
import { TRANSITION_TYPES } from "../types";

/** The native export is never compiled here: these checks read the Swift source of the ten transitions of 2026-10-06. */
const iosDir = join(__dirname, "../../../../modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const compositor = read("ClipyCompositor.swift");
const masks = code(read("TransitionMasks.swift"));
const start = compositor.indexOf("static func blend(");
const blend = code(compositor.slice(start, compositor.indexOf("static func ", start + 1)));
const NEW = TRANSITION_TYPES.slice(11);
const branch = (id: string) => { const from = blend.indexOf(`case "${id}":`); const next = blend.slice(from + 1).search(/\n    (case "|default:)/); return blend.slice(from, from + 1 + next); };
const FALLBACK = "?? dissolve(from: a, to: b, progress: p).cropped(to: rect)";

test("no placeholder is left; the ten new cases sit between Spin and Blur, in the registry's order", () => {
  expect(compositor).not.toContain("MORE-LOOKS-PLACEHOLDER");
  expect([...blend.matchAll(/case "(\w+)":/g)].map((m) => m[1])).toEqual(["fade", "slide", "zoom", "slideRight", "slideUp", "slideDown", "wipe", "spin", ...NEW, "blur"]);
});

test.each(["cover", "reveal", "coverUp", "revealDown"])("%s: the frames moved by TransitionMath.slideOffsets, with a dissolve if that fails", (id) => {
  expect(branch(id)).toContain(`TransitionBlend.slid(type, from: a, to: b, progress: p, size: size) ${FALLBACK}`);
});

test("the circles: the incoming frame inside an opening circle, the outgoing frame inside a closing one", () => {
  for (const id of ["circleOpen", "circleClose"]) {
    expect(branch(id)).toContain("TransitionMath.irisRadius(type, Double(p))");
    expect(branch(id)).toContain("TransitionBlend.halfDiagonal(size)");
    expect(branch(id)).toContain("TransitionBlend.discMask(radius:");
    expect(branch(id)).toContain(FALLBACK);
  }
  expect(branch("circleOpen")).toContain("TransitionBlend.masked(b, over: a,");
  expect(branch("circleClose")).toContain("TransitionBlend.masked(a, over: b,");
});

test("the wipes: the incoming frame where the mask is white", () => {
  expect(branch("wipeDiagonal")).toContain(`TransitionBlend.masked(b, over: a, mask: TransitionBlend.diagonalMask(edge: TransitionMath.diagonalEdge(Double(p)), size: size), rect: rect) ${FALLBACK}`);
  expect(branch("wipeClock")).toContain(`TransitionBlend.masked(b, over: a, mask: TransitionBlend.sectorMask(angle: TransitionMath.clockAngle(Double(p)), size: size), rect: rect) ${FALLBACK}`);
});

test("pixelate: both frames in blocks of the same size, cross-dissolved; white flash: white over whichever frame is playing", () => {
  const px = branch("pixelate");
  expect(px).toContain("TransitionMath.pixelSize(Double(p))");
  expect((px.match(/TransitionBlend\.pixelated\(/g) ?? [])).toHaveLength(2);
  expect(px).toContain("dissolve(from:");
  const flash = branch("flashWhite");
  expect(flash).toContain("TransitionMath.dip(Double(p))");
  expect(flash).toContain("TransitionBlend.flashed(p < 0.5 ? a : b,");
});

test("TransitionMasks.swift: screen-down maths drawn y-up, every filter through a guarded helper", () => {
  const slid = between(masks, "static func slid(", "\n  }\n");
  expect(slid).toContain("TransitionMath.slideOffsets(type, Double(p))");
  expect((slid.match(/y: -CGFloat\(o\.[ab]y\) \* size\.height/g) ?? [])).toHaveLength(2);       // y down on screen → negated
  expect(slid).toContain("o.incomingOnTop ? incoming.composited(over: outgoing) : outgoing.composited(over: incoming)");
  expect(between(masks, "static func masked(", "\n  }\n")).toContain("Adjust.filtered(inside.cropped(to: rect), \"CIBlendWithMask\"");
  expect(between(masks, "static func discMask(", "\n  }\n")).toContain("generator(\"CIRadialGradient\"");
  expect(between(masks, "static func pixelated(", "\n  }\n")).toContain("\"CIPixellate\"");
  // The sector is drawn with Core Graphics, starting at 12 o'clock (+π/2 in a y-up bitmap) and running clockwise.
  const sector = between(masks, "static func sectorMask(", "\n  }\n");
  expect(sector).toContain("startAngle: .pi / 2, endAngle: .pi / 2 - CGFloat(angle), clockwise: true");
  expect(sector).toContain("sectorMaskMaxSide");
  // The diagonal: the half-plane's normal in Core Image space is (h, −w) / diagonal.
  expect(between(masks, "static func diagonalMask(", "\n  }\n")).toMatch(/atan2\(-w, h\)/);
  expect(masks).not.toMatch(/applyingFilter\(/);
  expect([...masks.matchAll(/CIFilter\(name:/g)]).toHaveLength(1);                               // inside `generator` only
});

test("the XCTests cover every type", () => {
  const tests = read("Tests/TransitionBlendTests.swift");
  for (const t of TRANSITION_TYPES.slice(1)) expect(between(tests, "private let allTypes", "\n")).toContain(`"${t}"`);
  for (const name of ["testMoreTypesStartWithTheOutgoingAndEndWithTheIncomingFrame", "testCoverAndRevealDirections", "testCirclesOpenFromAndCloseToTheCentre", "testDiagonalWipeStartsAtTheTopLeftOfTheScreen", "testClockWipeSweepsClockwiseFromTwelve", "testWhiteFlashPeaksWhiteAtTheCut", "testPixelateMixesSolidFrames", "testMaskHelpersGuardTheirInput"]) expect(tests).toContain(`func ${name}()`);
});

test("the drawing code carries no numbers of its own: block size, flash colour and angles come from TransitionMath", () => {
  const math = read("TransitionMath.swift");
  expect(math).toContain(`static let pixelMax: Double = ${TRANSITION.pixelMax}`);
  expect(math).toContain(`static let flashColor = "${TRANSITION_COLORS.flash}"`);
  expect(masks).toContain("UIColor(hex: TransitionMath.flashColor)");
  expect(masks).not.toMatch(/#[0-9A-Fa-f]{6}/);
  expect(masks).not.toContain(String(TRANSITION.pixelMax));
  for (const id of NEW) expect(branch(id)).not.toMatch(/0\.0\d|#[0-9A-Fa-f]{6}/);
  expect(branch("pixelate")).toContain("* min(size.width, size.height)");
  // The clock mask's small bitmap is clamped before it is scaled up (no see-through line along the frame's border).
  expect(between(masks, "static func sectorMask(", "\n  }\n")).toMatch(/CIImage\(cgImage: drawn\)\s*\.clampedToExtent\(\)\s*\.transformed\(by:/);
});
