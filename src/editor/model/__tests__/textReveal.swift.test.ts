import { readFileSync } from "fs";
import { join } from "path";
import { REVEAL } from "../textReveal";

/** The reveal in the export is never compiled here: these checks read the Swift source (spec section 5). */
const root = join(__dirname, "../../../..");
const iosDir = join(root, "modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const session = code(read("ExportSession.swift"));
const reveal = code(read("TextReveal.swift"));
const layer = between(session, "static func overlayLayer(", "\n  }\n");
const block = between(layer, 'if o.kind == "text", let reveal = o.reveal {', "\n    }\n");

test("TextReveal.swift is pure: Foundation only, no layers, the one function", () => {
  expect([...read("TextReveal.swift").matchAll(/^import (\w+)/gm)].map((m) => m[1])).toEqual(["Foundation"]);
  expect(reveal).not.toMatch(/CALayer|CATextLayer|UIKit|ExportOverlay|NSAttributedString/);
  expect(reveal).toContain("static func steps(cuts: [Double], from: [Double], length: Int, life: Double) -> [(cut: Int, from: Double, to: Double)]");
  for (const line of [
    "guard cuts.count >= 2, cuts.count == from.count, length > 0, life.isFinite, life > 0 else { return [] }",
    "guard cuts.count <= maxSteps else { return [] }",
    "guard c.isFinite, c == c.rounded(), c > Double(lastCut), c <= Double(length) else { return [] }",
    "guard t.isFinite, t > lastFrom, t < life else { return [] }",
    "if i == 0 && t != 0 { return [] }",
    "guard lastCut == length else { return [] }",
    "for i in 0..<(out.count - 1) { out[i].to = out[i + 1].from }",
  ]) expect(reveal).toContain(line);
});

test("the Swift's cap on steps is a safety bound at or above the app's own REVEAL.maxSteps (tuning that needs no build)", () => {
  const m = /static let maxSteps = (\d+)/.exec(reveal); expect(m).not.toBeNull(); expect(REVEAL.maxSteps).toBeLessThanOrEqual(Number(m![1])); expect(Number(m![1])).toBe(120);
});

test("the request: ExportReveal is two Double lists, and ExportOverlay carries it as an optional", () => {
  const record = between(session, "struct ExportReveal: Record {", "\n}");
  expect([...record.matchAll(/@Field var (\w+): \[Double\] = \[\]/g)].map((m) => m[1])).toEqual(["cuts", "from"]);
  expect(between(session, "struct ExportOverlay: Record {", "\n}")).toMatch(/@Field var reveal: ExportReveal\?/);
});

test("the block: after the shadow, before the caption highlight; a text only; checked by TextReveal", () => {
  expect(layer.indexOf("if let shadow = l.shadow")).toBeLessThan(layer.indexOf("let reveal = o.reveal"));
  expect(layer.indexOf("let reveal = o.reveal")).toBeLessThan(layer.indexOf('if o.kind == "caption"'));
  expect(block).toContain("let steps = TextReveal.steps(cuts: reveal.cuts, from: reveal.from, length: (o.text as NSString).length, life: o.end - o.start)");
  expect(block).toContain("if steps.count >= 2 {");
  expect(block.split("container.allowsGroupOpacity = true")).toHaveLength(2);
});

test("every text layer (glow, shadow, fill) is copied per step but the last, its hidden range clear in fill AND stroke", () => {
  for (const line of [
    "let passes: [CATextLayer] = (container.sublayers ?? []).compactMap { (layer: CALayer) -> CATextLayer? in layer as? CATextLayer }",
    "let clear = UIColor.clear.cgColor",
    "for i in 0..<(steps.count - 1) {",
    "guard let full = pass.string as? NSAttributedString else { continue }",
    "let part = NSMutableAttributedString(attributedString: full)",
    "let rest = NSRange(location: step.cut, length: part.length - step.cut)",
    "part.addAttribute(key(kCTForegroundColorAttributeName), value: clear, range: rest)",
    "part.addAttribute(key(kCTStrokeColorAttributeName), value: clear, range: rest)",
    "let stepLayer = textCopy(part)",
    "stepLayer.shadowColor = pass.shadowColor", "stepLayer.shadowOpacity = pass.shadowOpacity",
    "stepLayer.shadowRadius = pass.shadowRadius", "stepLayer.shadowOffset = pass.shadowOffset",
    "container.addSublayer(stepLayer)",
    "addVisibility(stepLayer, start: o.start + step.from, end: o.start + step.to, opacity: Double(pass.opacity))",
    "let last = steps[steps.count - 1]",
    "for pass in passes { addVisibility(pass, start: o.start + last.from, end: o.end, opacity: Double(pass.opacity)) }",
  ]) expect(block).toContain(line);
  // Copies are made only by the one helper; nothing is removed or re-ordered.
  expect(layer.match(/CATextLayer\(\)/g)).toHaveLength(1);
  expect(block).not.toMatch(/removeFromSuperlayer|insertSublayer|\.mask/);
});

test("what a frame is made of is untouched: the compositor knows nothing of reveals, the session only this block and its record", () => {
  // (The compositor's "reveal" / "revealDown" are transitions, older than this.)
  for (const file of ["ClipyCompositor.swift", "OverlayLayout.swift", "OverlayMotion.swift", "Motion.swift"]) {
    expect(code(read(file))).not.toMatch(/TextReveal|ExportReveal|\.reveal\b/);
  }
  // Outside the record, its field and the block, ExportSession names no reveal.
  const rest = session
    .replace(between(session, "struct ExportReveal: Record {", "\n}"), "")
    .replace(block, "");
  expect(rest.match(/[Rr]eveal/g)).toEqual(["reveal", "Reveal"]);
  expect(rest).toContain("@Field var reveal: ExportReveal?");
});

test("the build: a marker function the app asks for, and its wrapper", () => {
  const moduleSwift = code(read("ClipyVideoModule.swift"));
  expect(between(moduleSwift, 'Function("textReveal") { () -> Bool in', "\n    }\n")).toContain("return true");
  const wrapper = readFileSync(join(root, "modules/clipy-video/reveal.ts"), "utf8");
  expect(wrapper).toContain('export function isTextRevealBuild(): boolean { return typeof optional()?.textReveal === "function"; }');
  expect(readFileSync(join(root, "modules/clipy-video/index.ts"), "utf8")).toContain('export * from "./reveal";');
});

test("the XCTests exist", () => {
  const tests = read("Tests/TextRevealTests.swift");
  for (const name of ["testStepsEndWhereTheNextBegins", "testAnythingOddIsNoReveal", "testWithoutARevealTheLayersAreTheOldOnes", "testOneCopyPerLayerPerStepButTheLast", "testTheHiddenRangeIsClear", "testACaptionIgnoresTheKey"]) {
    expect(tests).toContain(`func ${name}()`);
  }
});
