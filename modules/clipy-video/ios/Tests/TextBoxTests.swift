import CoreGraphics
import QuartzCore
import XCTest
@testable import ClipyVideo

/// The background box of an exported text. Frame 1080 × 1920, fontScale 0.07 → font 134.4 px:
/// default padding 0.25 × 134.4 = 33.6, round corner 33.6 × 0.5 = 16.8 (src/editor/model/__tests__/overlayLayout.vectors.ts).
final class TextBoxTests: XCTestCase {
  private let size = CGSize(width: 1080, height: 1920)
  private let accuracy: CGFloat = 0.0001

  /// A fresh record each time: `@Field` storage is a reference, so a copied record would share its values.
  private func boxed(padding: Double = 0.25, corner: String = "rounded", background: Bool = true) -> ExportOverlay {
    var o = ExportOverlay()
    o.text = "Hello"; o.start = 0; o.end = 2; o.fontScale = 0.07; o.outline = false
    if background { o.backgroundColor = "#000000"; o.backgroundOpacity = 0.6 }
    var style = ExportTextStyle(); style.boxPadding = padding; style.boxCorner = corner
    o.style = style
    return o
  }

  func testTheDefaultBoxIsTheBoxFromBefore() {
    var plain = ExportOverlay()                          // nothing set on the style: what an old request, or an old project, gives
    plain.text = "Hello"; plain.start = 0; plain.end = 2; plain.fontScale = 0.07; plain.outline = false
    plain.backgroundColor = "#000000"; plain.backgroundOpacity = 0.6
    let layer = ExportSession.overlayLayer(plain, renderSize: size)
    let pad: CGFloat = 33.6
    XCTAssertEqual(layer.cornerRadius, pad / 2, accuracy: accuracy)
    XCTAssertEqual(layer.sublayers?.count, 1)                              // the fill, as always
    XCTAssertEqual(layer.sublayers?.first?.frame.origin.x ?? 0, pad, accuracy: accuracy)
    XCTAssertEqual(layer.sublayers?.first?.frame.origin.y ?? 0, pad, accuracy: accuracy)
    let same = ExportSession.overlayLayer(boxed(), renderSize: size)
    XCTAssertEqual(same.cornerRadius, layer.cornerRadius)
    XCTAssertEqual(same.bounds, layer.bounds)
  }

  func testSquareCorners() {
    let layer = ExportSession.overlayLayer(boxed(corner: "square"), renderSize: size)
    XCTAssertEqual(layer.cornerRadius, 0)
    XCTAssertNotNil(layer.backgroundColor)
    XCTAssertEqual(ExportSession.overlayLayer(boxed(corner: "pill"), renderSize: size).cornerRadius, 16.8, accuracy: accuracy)   // unknown → rounded
  }

  func testPaddingGrowsTheBoxAroundTheSameText() {
    let tight = ExportSession.overlayLayer(boxed(padding: 0), renderSize: size)
    let wide = ExportSession.overlayLayer(boxed(padding: 0.5), renderSize: size)
    // "Hello" is one line in both, so only the padding differs: 2 × 0.5 × 134.4 = 134.4 each way.
    XCTAssertEqual(wide.bounds.width - tight.bounds.width, 134.4, accuracy: accuracy)
    XCTAssertEqual(wide.bounds.height - tight.bounds.height, 134.4, accuracy: accuracy)
    XCTAssertEqual(tight.sublayers?.first?.frame.origin.x ?? -1, 0, accuracy: accuracy)
    XCTAssertEqual(wide.sublayers?.first?.frame.origin.x ?? -1, 67.2, accuracy: accuracy)
    XCTAssertEqual(wide.cornerRadius, 16.8, accuracy: accuracy)            // the round corner does not follow the padding
    XCTAssertEqual(tight.cornerRadius, 16.8, accuracy: accuracy)
    XCTAssertEqual(wide.position, tight.position)                          // the box grows about the text's centre
  }

  func testNoBackgroundNoBox() {
    let layer = ExportSession.overlayLayer(boxed(padding: 0.5, corner: "square", background: false), renderSize: size)
    XCTAssertNil(layer.backgroundColor)
    XCTAssertEqual(layer.cornerRadius, 0)
    XCTAssertEqual(layer.sublayers?.first?.frame.origin.x ?? -1, 0, accuracy: accuracy)
  }
}
