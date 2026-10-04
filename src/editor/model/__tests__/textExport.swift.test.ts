import { readFileSync } from "fs";
import { join } from "path";

/**
 * The native export of text styles and caption word highlights is never compiled here, so these checks read the Swift source: the
 * style reaches the attributed string and the layers, every new piece is guarded so a default text builds the layers it always built,
 * and the word highlight goes through the pure `CaptionWords`.
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

const session = code(read("ExportSession.swift"));
const words = code(read("CaptionWords.swift"));
const tests = read("Tests/CaptionWordsTests.swift");
const layer = between(session, "static func overlayLayer(", "\n  }\n");

test("CaptionWords.swift is pure: Foundation only, no layers", () => {
  expect([...read("CaptionWords.swift").matchAll(/^import (\w+)/gm)].map((m) => m[1])).toEqual(["Foundation"]);
  expect(words).not.toMatch(/CALayer|CATextLayer|UIKit|ExportOverlay/);
  expect(words).toContain("static func spans(text: String, words: [(text: String, start: Double, end: Double)], start: Double, end: Double) -> [(range: NSRange, start: Double, end: Double)]");
});

test("CaptionWords finds each word in order (UTF-16 ranges), clamps its time into the caption and skips what it cannot place", () => {
  const body = between(words, "static func spans(", "\n  }\n");
  expect(body).toContain("let whole = text as NSString");
  expect(body).toContain("whole.range(of: word.text, options: [], range: NSRange(location: cursor, length: whole.length - cursor))");
  expect(body).toContain("guard found.location != NSNotFound else { continue }");
  expect(body).toContain("cursor = found.location + found.length");
  expect(body).toContain("let from = min(max(start + word.start, start), end)");
  expect(body).toContain("let to = min(max(start + word.end, start), end)");
  expect(body).toContain("guard to > from else { continue }");
});

test("kerning is set only for a non-zero letter spacing", () => {
  expect(layer).toContain("if l.letterSpacing != 0 { attrs[key(kCTKernAttributeName)] = NSNumber(value: Double(l.letterSpacing)) }");
  expect(layer.match(/kCTKernAttributeName/g)).toHaveLength(1);
});

test("line height and stroke come from the layout's style-aware values", () => {
  expect(layer).toContain("ctParagraphStyle(alignment: ctAlign, lineHeight: l.lineHeight)");
  expect(layer).toContain("attrs[key(kCTStrokeWidthAttributeName)] = NSNumber(value: Double(-(l.outlineWidth / l.fontSize * 100)))");
  expect(layer).toContain("attrs[key(kCTStrokeColorAttributeName)] = UIColor(hex: l.outlineColor).cgColor");
  expect(session).not.toContain("contrastFor(hex: o.color)");   // only OverlayLayout picks the automatic colour
});

test("glow and shadow are tinted copies of the text layer below the fill, each with a layer shadow", () => {
  const glow = between(layer, "if let glow = l.glow", "\n    }\n");
  expect(glow).toMatch(/^if let glow = l\.glow, glow\.radius > 0 \{/);
  for (const line of [
    "let halo = textCopy(tinted(glow.color))", "halo.shadowColor = UIColor(hex: glow.color).cgColor", "halo.shadowOpacity = 1",
    "halo.shadowRadius = glow.radius / 2", "halo.shadowOffset = .zero", "container.insertSublayer(halo, below: textLayer)",
  ]) expect(glow).toContain(line);

  const shadow = between(layer, "if let shadow = l.shadow", "\n    }\n");
  expect(shadow).toMatch(/^if let shadow = l\.shadow, shadow\.opacity > 0 \{/);
  for (const line of [
    "let cast = textCopy(tinted(shadow.color))", "cast.opacity = Float(shadow.opacity)", "cast.shadowColor = UIColor(hex: shadow.color).cgColor",
    "cast.shadowOpacity = 1", "cast.shadowRadius = shadow.blur / 2", "cast.shadowOffset = CGSize(width: shadow.dx, height: -shadow.dy)",
    "container.insertSublayer(cast, below: textLayer)",
  ]) expect(shadow).toContain(line);
  // Bottom to top: glow, shadow, fill — the glow goes in first, the shadow lands between it and the fill.
  expect(layer.indexOf("if let glow = l.glow")).toBeLessThan(layer.indexOf("if let shadow = l.shadow"));
  expect(layer.indexOf("container.addSublayer(textLayer)")).toBeLessThan(layer.indexOf("if let glow = l.glow"));
});

test("a tinted copy shows no glyph in another colour: fill and stroke both take the tint", () => {
  const tinted = between(layer, "func tinted(", "\n    }\n");
  expect(tinted).toContain("copy[key(kCTForegroundColorAttributeName)] = tint");
  expect(tinted).toContain("if copy[key(kCTStrokeColorAttributeName)] != nil { copy[key(kCTStrokeColorAttributeName)] = tint }");
  expect(tinted).toContain("NSAttributedString(string: o.text, attributes: copy)");
});

test("every text layer of an overlay is built by one helper: same frame, alignment and wrapping", () => {
  const copy = between(layer, "func textCopy(", "\n    }\n");
  for (const line of [
    "let layer = CATextLayer()", "layer.string = string", "layer.alignmentMode = mode", "layer.isWrapped = true", "layer.truncationMode = .none",
    "layer.contentsScale = 1", "layer.frame = CGRect(x: pad, y: pad, width: w, height: h)",
  ]) expect(copy).toContain(line);
  expect(layer.match(/CATextLayer\(\)/g)).toHaveLength(1);
  expect(layer).toContain("let textLayer = textCopy(string)");
});

test("the word highlight: one copy per CaptionWords span above the fill, visible only during the word", () => {
  const loop = between(layer, "if o.kind == \"caption\"", "\n    }\n");
  expect(loop).toMatch(/^if o\.kind == "caption", let highlight = o\.highlightColor, !o\.words\.isEmpty \{/);
  expect(loop).toContain("CaptionWords.spans(text: o.text, words: o.words.map { (text: $0.text, start: $0.start, end: $0.end) }, start: o.start, end: o.end)");
  expect(loop).toContain("let lit = NSMutableAttributedString(attributedString: string)");
  expect(loop).toContain("lit.addAttribute(key(kCTForegroundColorAttributeName), value: UIColor(hex: highlight).cgColor, range: span.range)");
  expect(loop).toContain("let wordLayer = textCopy(lit)");
  expect(loop).toContain("container.addSublayer(wordLayer)");
  expect(loop).toContain("addVisibility(wordLayer, start: span.start, end: span.end)");
  expect(loop).not.toMatch(/shadow|kCTStroke/);
  expect(layer.indexOf("container.addSublayer(textLayer)")).toBeLessThan(layer.indexOf("if o.kind == \"caption\""));
});

test("the default path adds no extra sublayer: every addition sits inside one of the three guards", () => {
  // Outside the glow / shadow / highlight blocks the only sublayer call is the fill's.
  let rest = layer;
  for (const from of ["if let glow = l.glow", "if let shadow = l.shadow", "if o.kind == \"caption\""]) rest = rest.replace(between(layer, from, "\n    }\n"), "");
  expect(rest.match(/Sublayer\(/g)).toEqual(["Sublayer("]);
  expect(rest).toContain("container.addSublayer(textLayer)");
  expect(rest).not.toMatch(/shadowColor|shadowRadius|shadowOffset|shadowOpacity/);
});

test("group opacity is switched on only off the default path: with a glow / shadow copy, word layers, or a see-through style", () => {
  const on = "container.allowsGroupOpacity = true";
  let rest = layer;
  for (const from of ["if let glow = l.glow", "if let shadow = l.shadow", "if o.kind == \"caption\""]) {
    const block = between(layer, from, "\n    }\n");
    expect(block.split(on)).toHaveLength(2);
    rest = rest.replace(block, "");
  }
  // Outside the three guards: once, behind the opacity check.
  expect(rest.split(on)).toHaveLength(2);
  expect(rest).toContain(`if shown < 1 { ${on} }`);
  expect(session.split("allowsGroupOpacity")).toHaveLength(5);
});

test("text opacity multiplies what the overlay shows: the visibility value and every motion opacity sample", () => {
  expect(session).toContain("static func addVisibility(_ layer: CALayer, start: Double, end: Double, opacity: Double = 1) {");
  const visibility = between(session, "static func addVisibility(", "\n  }\n");
  expect(visibility).toContain("anim.fromValue = opacity");
  expect(visibility).toContain("anim.toValue = opacity");
  expect(visibility).toContain("layer.opacity = 0");

  expect(session).toContain("static func addMotion(_ layer: CALayer, _ o: ExportOverlay, renderSize: CGSize, opacity: Double = 1) -> Bool {");
  expect(between(session, "static func addMotion(", "\n  }\n")).toContain("NSNumber(value: s.values.opacity * opacity)");

  expect(layer).toContain("let shown = Double(l.opacity)");
  expect(layer).toContain("if !addMotion(container, o, renderSize: renderSize, opacity: shown) { addVisibility(container, start: o.start, end: o.end, opacity: shown) }");
  // Stickers have no text style: their calls are as they were.
  expect(between(session, "static func stickerLayer(", "\n  }\n")).toContain("if !addMotion(container, o, renderSize: renderSize) { addVisibility(container, start: o.start, end: o.end) }");
});

test("the XCTests cover the word spans: ranges, times, clamping and skipped words", () => {
  expect(tests).toContain("@testable import ClipyVideo");
  for (const name of ["testRangesAndCompositionTimes", "testRepeatedWordsAreFoundInOrder", "testUTF16Ranges", "testTimesAreClampedIntoTheCaption", "testSkipsMissingAndEmptyWords", "testNoWords", "testLayerTree"]) {
    expect(tests).toContain(`func ${name}()`);
  }
  const tree = between(tests, "func testLayerTree()", "\n  }\n");
  expect(tree).toContain("XCTAssertTrue(rich.allowsGroupOpacity)");
  expect(tree).toContain("XCTAssertTrue(sung.allowsGroupOpacity)");
});
