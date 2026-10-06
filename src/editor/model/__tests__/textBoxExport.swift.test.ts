import { readFileSync } from "fs";
import { join } from "path";
import { SHAPES } from "@/src/editor/effects";
import { BACKGROUND_PAD_FACTOR, BOX_RADIUS_FACTOR } from "../overlayLayout";
import { DEFAULT_TEXT_STYLE, SHAPE_IDS } from "../types";

/**
 * The native export is never compiled here, so these checks read the Swift source: the text's box takes its padding and its corner
 * from OverlayLayout and from nowhere else, the default box is the old box, and sticker shapes are filled with no fill rule (a
 * counter-wound subpath is then a hole on both sides).
 */
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
const layer = between(session, "static func overlayLayer(", "\n  }\n");

test("the box: its padding and its corner radius come from the layout", () => {
  expect(layer).toContain("let pad = l.padding");
  expect(layer).toContain("container.cornerRadius = l.boxRadius");
  expect(layer.match(/cornerRadius/g)).toHaveLength(1);
  expect(layer).not.toContain("pad / 2");
  // The padded box and the wrapping width both follow the same padding, as in the preview (a border-box of maxWidth).
  expect(layer).toContain("let wrapWidth = max(1, l.maxWidth - 2 * pad)");
  expect(layer).toContain("container.bounds = CGRect(x: 0, y: 0, width: w + 2 * pad, height: h + 2 * pad)");
  expect(layer).toContain("layer.frame = CGRect(x: pad, y: pad, width: w, height: h)");
});

test("only OverlayLayout turns the box fields into pixels: the layer code never reads them or a box constant", () => {
  expect(layer).not.toMatch(/boxPadding|boxCorner|backgroundPadFactor|boxRadiusFactor/);
  const layout = code(read("OverlayLayout.swift"));
  expect(layout).toContain("CGFloat(o.style.boxPadding) * fontSize");
  expect(layout).toContain("o.style.boxCorner == \"square\"");
});

test("the default box is the old box: the record's defaults are the model's, and the round corner is the old `pad / 2`", () => {
  // A request written before the box fields existed has neither key, so the record's defaults decide what it draws.
  const record = between(session, "struct ExportTextStyle: Record {", "\n}\n");
  expect(record).toContain(`@Field var boxPadding: Double = ${DEFAULT_TEXT_STYLE.boxPadding} `);
  expect(record).toContain(`@Field var boxCorner: String = "${DEFAULT_TEXT_STYLE.boxCorner}" `);
  // Old: padding = backgroundPadFactor × fontSize, corner = padding / 2. New, with the defaults: the same product, × 0.5.
  const layout = code(read("OverlayLayout.swift"));
  expect(layout).toContain(`static let backgroundPadFactor: CGFloat = ${BACKGROUND_PAD_FACTOR}\n`);
  expect(layout).toContain(`static let boxRadiusFactor: CGFloat = ${BOX_RADIUS_FACTOR}\n`);
  expect(DEFAULT_TEXT_STYLE.boxPadding).toBe(BACKGROUND_PAD_FACTOR);
  expect(BOX_RADIUS_FACTOR).toBe(0.5);   // × 0.5 and / 2 are the same number, bit for bit
  expect(layout).toContain("padding: o.backgroundColor == nil ? 0 : CGFloat(o.style.boxPadding) * fontSize,");
  expect(layout).toContain("boxRadius: o.backgroundColor == nil || o.style.boxCorner == \"square\" ? 0 : backgroundPadFactor * fontSize * boxRadiusFactor)");
});

test("the box is still drawn only when the text has a background, in one guarded block", () => {
  const box = between(layer, "if let bg = o.backgroundColor {", "\n    }\n");
  expect(box).toContain("container.backgroundColor = UIColor(hex: bg).withAlphaComponent(CGFloat(o.backgroundOpacity)).cgColor");
  expect(box).toContain("container.cornerRadius = l.boxRadius");
  // The corner rounds the box's own fill only: nothing clips the text layers inside it.
  expect(layer).not.toMatch(/masksToBounds|\.mask\b/);
});

test("sticker shapes: neither side sets a fill rule, so a counter-wound inner subpath is a hole in the preview and in the export", () => {
  const sticker = between(session, "static func stickerLayer(", "\n  }\n");
  expect(sticker).toContain("let shapeLayer = CAShapeLayer()");
  expect(sticker).not.toMatch(/fillRule|evenOdd/);
  for (const file of ["StickerView.tsx", "StickerSheet.tsx"]) expect(readFileSync(join(root, "src/editor/components", file), "utf8")).not.toMatch(/fillRule|evenodd/i);
  // The parser both sides' paths are written for: absolute M L C Q Z, nothing else.
  expect(code(read("SVGPath.swift"))).toContain("ch == \"M\" || ch == \"L\" || ch == \"C\" || ch == \"Q\" || ch == \"Z\"");
  for (const id of SHAPE_IDS) expect(SHAPES[id].path).toMatch(/^[MLCQZ0-9 .]+$/);
});

test("the XCTests exist: the box layer and the holes", () => {
  const box = read("Tests/TextBoxTests.swift");
  expect(box).toContain("@testable import ClipyVideo");
  for (const name of ["testTheDefaultBoxIsTheBoxFromBefore", "testSquareCorners", "testPaddingGrowsTheBoxAroundTheSameText", "testNoBackgroundNoBox"]) expect(box).toContain(`func ${name}()`);
  const exportTests = read("Tests/ExportSessionTests.swift");
  expect(exportTests).toContain("func testCompoundShapesKeepTheirHoles()");
  expect(exportTests).toContain(`XCTAssertEqual(Effects.shapePaths.count, ${SHAPE_IDS.length})`);
});
