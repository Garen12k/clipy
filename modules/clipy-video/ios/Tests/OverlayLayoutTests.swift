import CoreGraphics
import XCTest
@testable import ClipyVideo

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

  func testContrastFor() {
    XCTAssertEqual(contrastFor(hex: "#FFFFFF"), "#000000")
    XCTAssertEqual(contrastFor(hex: "#F4F4F5"), "#000000")
    XCTAssertEqual(contrastFor(hex: "#000000"), "#FFFFFF")
    XCTAssertEqual(contrastFor(hex: "#FF0000"), "#FFFFFF")   // luma 0.299
    XCTAssertEqual(contrastFor(hex: "#00FF00"), "#000000")   // luma 0.587
    XCTAssertEqual(contrastFor(hex: "nonsense"), "#FFFFFF")
  }
}
