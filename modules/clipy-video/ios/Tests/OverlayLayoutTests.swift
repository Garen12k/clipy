import CoreGraphics
import XCTest
@testable import ClipyVideo

/// One case of `BOX_VECTORS` (src/editor/model/__tests__/overlayLayout.vectors.ts). overlayLayout.test.ts compares this table
/// with the TS vectors line for line — keep the literals and the spacing identical.
struct BoxVector {
  let name: String
  let fontScale: Double
  let scale: Double
  let background: Bool
  let boxPadding: Double
  let boxCorner: String
  let frame: CGSize
  let fontSize: CGFloat
  let padding: CGFloat
  let boxRadius: CGFloat
}

let boxVectors: [BoxVector] = [
  BoxVector(name: "the old box", fontScale: 0.1, scale: 1.5, background: true, boxPadding: 0.25, boxCorner: "rounded", frame: CGSize(width: 1080, height: 1920), fontSize: 288, padding: 72, boxRadius: 36),
  BoxVector(name: "the old box in a small preview", fontScale: 0.1, scale: 1.5, background: true, boxPadding: 0.25, boxCorner: "rounded", frame: CGSize(width: 300, height: 533), fontSize: 79.95, padding: 19.9875, boxRadius: 9.99375),
  BoxVector(name: "wide and square", fontScale: 0.07, scale: 1, background: true, boxPadding: 0.5, boxCorner: "square", frame: CGSize(width: 1080, height: 1920), fontSize: 134.4, padding: 67.2, boxRadius: 0),
  BoxVector(name: "tight, still rounded", fontScale: 0.07, scale: 1, background: true, boxPadding: 0.1, boxCorner: "rounded", frame: CGSize(width: 1080, height: 1920), fontSize: 134.4, padding: 13.44, boxRadius: 16.8),
  BoxVector(name: "no padding keeps the round corner", fontScale: 0.07, scale: 1, background: true, boxPadding: 0, boxCorner: "rounded", frame: CGSize(width: 1080, height: 1920), fontSize: 134.4, padding: 0, boxRadius: 16.8),
  BoxVector(name: "the widest", fontScale: 0.07, scale: 1, background: true, boxPadding: 0.6, boxCorner: "rounded", frame: CGSize(width: 1080, height: 1920), fontSize: 134.4, padding: 80.64, boxRadius: 16.8),
  BoxVector(name: "no background, no box", fontScale: 0.07, scale: 1, background: false, boxPadding: 0.5, boxCorner: "rounded", frame: CGSize(width: 1080, height: 1920), fontSize: 134.4, padding: 0, boxRadius: 0),
  BoxVector(name: "a square frame", fontScale: 0.05, scale: 2, background: true, boxPadding: 0.3, boxCorner: "rounded", frame: CGSize(width: 1080, height: 1080), fontSize: 108, padding: 32.4, boxRadius: 13.5),
]

/// The numbers pinned by src/editor/model/__tests__/overlayLayout.test.ts (which also checks that this file names
/// them). The TS side rounds to four decimals, so compare with that accuracy.
final class OverlayLayoutTests: XCTestCase {
  private let frame = CGSize(width: 1080, height: 1920)
  private let accuracy: CGFloat = 0.00006

  func testNeutralStyleGivesTheNumbersFromBeforeStyles() {
    var o = ExportOverlay()
    o.x = 0.25; o.y = 0.75; o.fontScale = 0.1; o.scale = 1.5; o.rotation = 30
    o.backgroundColor = "#000000"; o.backgroundOpacity = 0.5; o.color = "#F4F4F5"
    let l = OverlayLayout.layout(o, frame: frame)
    XCTAssertEqual(l.centerX, 270, accuracy: accuracy)
    XCTAssertEqual(l.centerY, 1440, accuracy: accuracy)
    XCTAssertEqual(l.fontSize, 288, accuracy: accuracy)
    XCTAssertEqual(l.maxWidth, 972, accuracy: accuracy)
    XCTAssertEqual(l.padding, 72, accuracy: accuracy)
    XCTAssertEqual(l.boxRadius, 36, accuracy: accuracy)
    XCTAssertEqual(l.boxRadius, l.padding / 2)   // exactly the corner the export drew before
    XCTAssertEqual(l.outlineWidth, 8.5333, accuracy: accuracy)
    XCTAssertEqual(l.rotation, 30, accuracy: accuracy)
    XCTAssertEqual(l.lineHeight, 345.6, accuracy: accuracy)
    // Exactly the previous expressions: × 1 and × 0 change nothing.
    XCTAssertEqual(l.lineHeight, OverlayLayout.lineHeightFactor * l.fontSize)
    XCTAssertEqual(l.outlineWidth, OverlayLayout.outlineFactor * frame.height)
    XCTAssertEqual(l.letterSpacing, 0)
    XCTAssertEqual(l.outlineColor, "#000000")
    XCTAssertNil(l.shadow)
    XCTAssertNil(l.glow)
    XCTAssertEqual(l.opacity, 1)
  }

  func testRecordDefaultsAreTheNeutralStyle() {
    let o = ExportOverlay()
    XCTAssertEqual(o.style.opacity, 1)
    XCTAssertEqual(o.style.letterSpacing, 0)
    XCTAssertEqual(o.style.lineSpacing, 1)
    XCTAssertNil(o.style.outlineColor)
    XCTAssertEqual(o.style.outlineWidth, 1)
    XCTAssertNil(o.style.shadowColor)
    XCTAssertNil(o.style.glowColor)
    XCTAssertEqual(o.style.boxPadding, 0.25)
    XCTAssertEqual(o.style.boxCorner, "rounded")
    XCTAssertTrue(o.words.isEmpty)
    XCTAssertNil(o.highlightColor)
    let w = ExportCaptionWord()
    XCTAssertEqual(w.text, "")
    XCTAssertEqual(w.start, 0)
    XCTAssertEqual(w.end, 0)
  }

  func testStyledText() {
    var o = ExportOverlay()
    o.fontScale = 0.07; o.color = "#FFFFFF"
    var style = ExportTextStyle()
    style.opacity = 0.8; style.letterSpacing = 0.1; style.lineSpacing = 1.5; style.outlineWidth = 2
    style.shadowColor = "#000000"; style.shadowOpacity = 0.6; style.shadowDistance = 0.06; style.shadowBlur = 0.1
    style.glowColor = "#FFFFFF"; style.glowSize = 0.25
    o.style = style
    let l = OverlayLayout.layout(o, frame: frame)
    XCTAssertEqual(l.centerX, 540, accuracy: accuracy)
    XCTAssertEqual(l.centerY, 960, accuracy: accuracy)
    XCTAssertEqual(l.fontSize, 134.4, accuracy: accuracy)
    XCTAssertEqual(l.padding, 0)
    XCTAssertEqual(l.boxRadius, 0)
    XCTAssertEqual(l.letterSpacing, 13.44, accuracy: accuracy)
    XCTAssertEqual(l.lineHeight, 241.92, accuracy: accuracy)
    XCTAssertEqual(l.outlineWidth, 17.0667, accuracy: accuracy)
    XCTAssertEqual(l.outlineColor, "#000000")
    XCTAssertEqual(l.shadow?.color, "#000000")
    XCTAssertEqual(l.shadow?.opacity ?? 0, 0.6, accuracy: accuracy)
    XCTAssertEqual(l.shadow?.dx ?? 0, 5.7021, accuracy: accuracy)
    XCTAssertEqual(l.shadow?.dy ?? 0, 5.7021, accuracy: accuracy)
    XCTAssertEqual(l.shadow?.blur ?? 0, 13.44, accuracy: accuracy)
    XCTAssertEqual(l.glow?.color, "#FFFFFF")
    XCTAssertEqual(l.glow?.radius ?? 0, 33.6, accuracy: accuracy)
    XCTAssertEqual(l.opacity, 0.8, accuracy: accuracy)

    o.style.outlineColor = "#FF2D7A"
    XCTAssertEqual(OverlayLayout.layout(o, frame: frame).outlineColor, "#FF2D7A")
  }

  func testBoxVectors() {
    for v in boxVectors {
      var o = ExportOverlay()
      o.fontScale = v.fontScale; o.scale = v.scale
      o.backgroundColor = v.background ? "#000000" : nil; o.backgroundOpacity = 0.5
      var style = ExportTextStyle(); style.boxPadding = v.boxPadding; style.boxCorner = v.boxCorner
      o.style = style
      let l = OverlayLayout.layout(o, frame: v.frame)
      XCTAssertEqual(l.fontSize, v.fontSize, accuracy: accuracy, v.name)
      XCTAssertEqual(l.padding, v.padding, accuracy: accuracy, v.name)
      XCTAssertEqual(l.boxRadius, v.boxRadius, accuracy: accuracy, v.name)
    }
  }

  func testContrastFor() {
    XCTAssertEqual(contrastFor(hex: "#FFFFFF"), "#000000")
    XCTAssertEqual(contrastFor(hex: "#F4F4F5"), "#000000")
    XCTAssertEqual(contrastFor(hex: "#000000"), "#FFFFFF")
    XCTAssertEqual(contrastFor(hex: "#FF0000"), "#FFFFFF")   // luma 0.299
    XCTAssertEqual(contrastFor(hex: "#00FF00"), "#000000")   // luma 0.587
    XCTAssertEqual(contrastFor(hex: "nonsense"), "#FFFFFF")
  }
}
