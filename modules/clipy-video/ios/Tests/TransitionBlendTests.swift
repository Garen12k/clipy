import CoreGraphics
import CoreImage
import XCTest
@testable import ClipyVideo

/// `ClipyCompositor.blend`: every transition type returns a frame-sized image, shows only the outgoing frame at
/// progress 0 and only the incoming at 1, and moves in the direction its name says ON SCREEN (Core Image is y-up).
final class TransitionBlendTests: XCTestCase {
  private let size = CGSize(width: 64, height: 36)
  private var rect: CGRect { CGRect(origin: .zero, size: size) }
  /// Outgoing = solid red, incoming = solid blue.
  private var a: CIImage { CIImage(color: CIColor(red: 1, green: 0, blue: 0)).cropped(to: rect) }
  private var b: CIImage { CIImage(color: CIColor(red: 0, green: 0, blue: 1)).cropped(to: rect) }
  private let ctx = CIContext(options: [.workingColorSpace: NSNull()])

  private let newTypes = ["slideRight", "slideUp", "slideDown", "wipe", "spin", "blur"]
  private let allTypes = ["fade", "dissolve", "slide", "zoom", "slideRight", "slideUp", "slideDown", "wipe", "spin", "blur"]

  /// (red, blue) of the pixel whose bottom-left corner is (x, y) in Core Image space (y-up), each 0…1.
  private func redBlue(_ img: CIImage, _ x: CGFloat, _ y: CGFloat) -> (r: Double, b: Double) {
    var px = [UInt8](repeating: 0, count: 4)
    ctx.render(img, toBitmap: &px, rowBytes: 4, bounds: CGRect(x: x, y: y, width: 1, height: 1), format: .RGBA8, colorSpace: nil)
    return (Double(px[0]) / 255, Double(px[2]) / 255)
  }

  private func blend(_ type: String, _ p: CGFloat) -> CIImage {
    ClipyCompositor.blend(type: type, from: a, to: b, progress: p, size: size)
  }

  private func assertOutgoing(_ img: CIImage, _ x: CGFloat, _ y: CGFloat, _ message: String) {
    let c = redBlue(img, x, y)
    XCTAssertEqual(c.r, 1, accuracy: 0.02, message)
    XCTAssertEqual(c.b, 0, accuracy: 0.02, message)
  }

  private func assertIncoming(_ img: CIImage, _ x: CGFloat, _ y: CGFloat, _ message: String) {
    let c = redBlue(img, x, y)
    XCTAssertEqual(c.r, 0, accuracy: 0.02, message)
    XCTAssertEqual(c.b, 1, accuracy: 0.02, message)
  }

  func testEveryTypeKeepsTheFrameExtent() {
    for type in allTypes + ["unknown"] {
      for p in [0, 0.5, 1] as [CGFloat] {
        XCTAssertEqual(blend(type, p).extent, rect, "\(type) at \(p)")
      }
    }
  }

  /// Progress 0 is the outgoing frame, progress 1 the incoming — in the centre and in two opposite corners.
  func testEndPointsAreTheOutgoingAndTheIncomingFrame() {
    let points: [(CGFloat, CGFloat)] = [(32, 18), (1, 1), (62, 34)]
    for type in newTypes {
      let start = blend(type, 0), end = blend(type, 1)
      for (x, y) in points {
        assertOutgoing(start, x, y, "\(type) at 0, (\(x), \(y))")
        assertIncoming(end, x, y, "\(type) at 1, (\(x), \(y))")
      }
    }
  }

  /// At a quarter of the way the incoming frame covers the quarter of the frame next to the edge it enters from.
  func testSlideDirections() {
    let p: CGFloat = 0.25
    // "slide" (Slide left): incoming enters from the right.
    assertIncoming(blend("slide", p), 60, 18, "slide right edge")
    assertOutgoing(blend("slide", p), 4, 18, "slide left edge")
    // slideRight: incoming enters from the left.
    assertIncoming(blend("slideRight", p), 4, 18, "slideRight left edge")
    assertOutgoing(blend("slideRight", p), 60, 18, "slideRight right edge")
    // slideUp: incoming enters from the BOTTOM of the screen = low y in Core Image.
    assertIncoming(blend("slideUp", p), 32, 2, "slideUp bottom edge")
    assertOutgoing(blend("slideUp", p), 32, 33, "slideUp top edge")
    // slideDown: incoming enters from the TOP of the screen = high y in Core Image.
    assertIncoming(blend("slideDown", p), 32, 33, "slideDown top edge")
    assertOutgoing(blend("slideDown", p), 32, 2, "slideDown bottom edge")
  }

  /// Half way, the left half is the incoming frame and the right half still the outgoing one (a hard edge).
  func testWipeRevealsLeftToRight() {
    let half = blend("wipe", 0.5)
    assertIncoming(half, 8, 18, "left of the edge")
    assertIncoming(half, 30, 18, "just left of the edge")
    assertOutgoing(half, 33, 18, "just right of the edge")
    assertOutgoing(half, 56, 18, "right of the edge")
  }

  /// Half way: the centre is an even mix of both frames; a corner the shrunken, turned outgoing frame no longer
  /// reaches is black mixed with the incoming frame (no red left).
  func testSpinMixesInTheMiddleAndLeavesTheCorners() {
    let half = blend("spin", 0.5)
    let centre = redBlue(half, 32, 18)
    XCTAssertEqual(centre.r, 0.5, accuracy: 0.05)
    XCTAssertEqual(centre.b, 0.5, accuracy: 0.05)
    let corner = redBlue(half, 0, 0)
    XCTAssertEqual(corner.r, 0, accuracy: 0.02)
    XCTAssertEqual(corner.b, 0.5, accuracy: 0.05)
  }

  /// Solid frames blur to themselves (clamped edges), so the blur transition is a plain mix at any progress.
  func testBlurKeepsTheEdgesOpaqueAndMixes() {
    for p in [0.25, 0.5, 0.75] as [CGFloat] {
      for (x, y) in [(32, 18), (0, 0), (63, 35)] as [(CGFloat, CGFloat)] {
        let c = redBlue(blend("blur", p), x, y)
        XCTAssertEqual(c.r, Double(1 - p), accuracy: 0.05, "blur at \(p), (\(x), \(y))")
        XCTAssertEqual(c.b, Double(p), accuracy: 0.05, "blur at \(p), (\(x), \(y))")
      }
    }
  }

  func testBlurredHelper() {
    let image = a
    XCTAssertTrue(ClipyCompositor.blurred(image, radius: 0, rect: rect) === image)
    XCTAssertTrue(ClipyCompositor.blurred(image, radius: -1, rect: rect) === image)
    XCTAssertTrue(ClipyCompositor.blurred(image, radius: .nan, rect: rect) === image)
    XCTAssertEqual(ClipyCompositor.blurred(image, radius: 1.44, rect: rect).extent, rect)
  }
}
