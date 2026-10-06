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
  private let allTypes = ["fade", "dissolve", "slide", "zoom", "slideRight", "slideUp", "slideDown", "wipe", "spin", "blur", "cover", "reveal", "coverUp", "revealDown", "circleOpen", "circleClose", "wipeDiagonal", "wipeClock", "pixelate", "flashWhite"]
  private let moreTypes = ["cover", "reveal", "coverUp", "revealDown", "circleOpen", "circleClose", "wipeDiagonal", "wipeClock", "pixelate", "flashWhite"]

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

  /// The turn is CLOCKWISE on screen. At p = 0.5 the outgoing frame is scaled 0.8 and rotated −45° in Core Image
  /// (y-up, counter-clockwise positive) about the centre (32, 18). A point q is inside it when
  /// u = R(+45°)(q − centre) / 0.8 has |u.x| ≤ 32 and |u.y| ≤ 18, i.e. with v = q − centre:
  /// u.x = (v.x − v.y)·0.8839, u.y = (v.x + v.y)·0.8839.
  ///  - pixel (44, 6), centre (44.5, 6.5): v = (12.5, −11.5) → u = (21.2, 0.9): inside → half red.
  ///  - pixel (44, 30), centre (44.5, 30.5): v = (12.5, 12.5) → u = (0, 22.1): outside (22.1 > 18) → no red.
  /// With the wrong sign (+45°) u.x = (v.x + v.y)·0.8839, u.y = (v.y − v.x)·0.8839, and the two swap:
  /// (44, 6) → (0.9, −21.2) outside, (44, 30) → (22.1, 0) inside.
  func testSpinTurnsClockwiseOnScreen() {
    let half = blend("spin", 0.5)
    let lowerRight = redBlue(half, 44, 6)       // low y in Core Image = lower on screen
    XCTAssertEqual(lowerRight.r, 0.5, accuracy: 0.05)
    XCTAssertEqual(lowerRight.b, 0.5, accuracy: 0.05)
    let upperRight = redBlue(half, 44, 30)
    XCTAssertEqual(upperRight.r, 0, accuracy: 0.02)
    XCTAssertEqual(upperRight.b, 0.5, accuracy: 0.05)
  }

  /// The blur transition's radius is continuous: 0 at both ends, the full radius (0.04 × the shorter side) in the
  /// middle, linear in between and the same on both sides of the middle.
  func testBlurTransitionRadiusPeaksInTheMiddle() {
    let full = ClipyCompositor.blurRadiusFactor * 36
    XCTAssertEqual(ClipyCompositor.blurTransitionRadius(0, size: size), 0, accuracy: 1e-9)
    XCTAssertEqual(ClipyCompositor.blurTransitionRadius(0.25, size: size), full / 2, accuracy: 1e-9)
    XCTAssertEqual(ClipyCompositor.blurTransitionRadius(0.5, size: size), full, accuracy: 1e-9)
    XCTAssertEqual(ClipyCompositor.blurTransitionRadius(0.75, size: size), full / 2, accuracy: 1e-9)
    XCTAssertEqual(ClipyCompositor.blurTransitionRadius(1, size: size), 0, accuracy: 1e-9)
    // No jump around the middle (the old recipe switched which frame was blurred there).
    let before = ClipyCompositor.blurTransitionRadius(0.499, size: size), after = ClipyCompositor.blurTransitionRadius(0.501, size: size)
    XCTAssertEqual(before, after, accuracy: 1e-9)
  }

  /// Both frames are blurred in the middle: an outgoing frame with a hard white / black edge no longer shows that
  /// edge sharply at p = 0.5 (a pixel just on the black side has picked up white), while at p = 0 it is untouched.
  func testBlurTransitionBlursBothFramesInTheMiddle() {
    let white = CIImage(color: CIColor(red: 1, green: 1, blue: 1)).cropped(to: CGRect(x: 0, y: 0, width: 32, height: 36))
    let edged = white.composited(over: CIImage(color: CIColor.black).cropped(to: rect)).cropped(to: rect)
    let start = ClipyCompositor.blend(type: "blur", from: edged, to: edged, progress: 0, size: size)
    XCTAssertEqual(redBlue(start, 32, 18).r, 0, accuracy: 0.02)
    let middle = ClipyCompositor.blend(type: "blur", from: edged, to: edged, progress: 0.5, size: size)
    XCTAssertGreaterThan(redBlue(middle, 32, 18).r, 0.1)       // radius 1.44 px, half a pixel from the edge
    XCTAssertEqual(middle.extent, rect)
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

  // ---- The ten transitions of 2026-10-06 ----

  func testMoreTypesStartWithTheOutgoingAndEndWithTheIncomingFrame() {
    let points: [(CGFloat, CGFloat)] = [(32, 18), (1, 1), (62, 34)]
    for type in moreTypes {
      let start = blend(type, 0), end = blend(type, 1)
      XCTAssertEqual(start.extent, rect, type)
      XCTAssertEqual(end.extent, rect, type)
      for (x, y) in points {
        assertOutgoing(start, x, y, "\(type) at 0, (\(x), \(y))")
        assertIncoming(end, x, y, "\(type) at 1, (\(x), \(y))")
      }
    }
  }

  /// A quarter of the way: the edge between the two frames is at three quarters of the width (cover, reveal), a
  /// quarter up from the bottom of the screen (cover up), a quarter down from the top (reveal down).
  func testCoverAndRevealDirections() {
    let p: CGFloat = 0.25
    for type in ["cover", "reveal"] {
      assertIncoming(blend(type, p), 60, 18, "\(type): right edge")
      assertOutgoing(blend(type, p), 4, 18, "\(type): left edge")
      assertOutgoing(blend(type, p), 44, 18, "\(type): just left of x = 48")
      assertIncoming(blend(type, p), 51, 18, "\(type): just right of x = 48")
    }
    // coverUp: the incoming frame has risen a quarter from the BOTTOM of the screen = low y in Core Image (y < 9).
    assertIncoming(blend("coverUp", p), 32, 2, "coverUp: bottom")
    assertOutgoing(blend("coverUp", p), 32, 33, "coverUp: top")
    // revealDown: the outgoing frame has dropped a quarter; the incoming one shows at the TOP = high y (y ≥ 27).
    assertIncoming(blend("revealDown", p), 32, 33, "revealDown: top")
    assertOutgoing(blend("revealDown", p), 32, 2, "revealDown: bottom")
  }

  /// Half way the circle's radius is half of the half-diagonal (18.4 px): the centre is inside it, the corners are not.
  func testCirclesOpenFromAndCloseToTheCentre() {
    let open = blend("circleOpen", 0.5), close = blend("circleClose", 0.5)
    assertIncoming(open, 32, 18, "open: centre")
    assertOutgoing(open, 1, 1, "open: corner")
    assertOutgoing(open, 62, 34, "open: corner")
    assertOutgoing(close, 32, 18, "close: centre")
    assertIncoming(close, 1, 1, "close: corner")
    assertIncoming(close, 62, 34, "close: corner")
    XCTAssertEqual(TransitionBlend.halfDiagonal(size), 36.715, accuracy: 0.01)          // √(64² + 36²) / 2
  }

  /// Half way the edge runs corner to corner. The TOP-left of the screen (low x, high y) is the incoming frame, the
  /// bottom-right the outgoing one. A quarter of the way, only the top-left quarter-triangle has turned.
  func testDiagonalWipeStartsAtTheTopLeftOfTheScreen() {
    let half = blend("wipeDiagonal", 0.5)
    assertIncoming(half, 4, 30, "top-left")
    assertOutgoing(half, 60, 4, "bottom-right")
    let quarter = blend("wipeDiagonal", 0.25)
    assertIncoming(quarter, 2, 33, "the top-left corner")
    assertOutgoing(quarter, 32, 18, "the centre")
    assertOutgoing(quarter, 4, 4, "bottom-left")
  }

  /// A quarter of the way the hand is at 3 o'clock: the upper-right quarter of the screen (high x, high y) has
  /// turned; the lower-right and the upper-left have not. Three quarters: only the upper-left is left.
  func testClockWipeSweepsClockwiseFromTwelve() {
    let quarter = blend("wipeClock", 0.25)
    assertIncoming(quarter, 50, 30, "upper right")
    assertOutgoing(quarter, 50, 5, "lower right")
    assertOutgoing(quarter, 14, 30, "upper left")
    let three = blend("wipeClock", 0.75)
    assertIncoming(three, 50, 5, "lower right")
    assertIncoming(three, 14, 5, "lower left")
    assertOutgoing(three, 14, 30, "upper left")
  }

  /// At the cut the frame is white; a quarter of the way it is the outgoing (red) frame half-covered with white.
  func testWhiteFlashPeaksWhiteAtTheCut() {
    let peak = redBlue(blend("flashWhite", 0.5), 32, 18)
    XCTAssertEqual(peak.r, 1, accuracy: 0.02)
    XCTAssertEqual(peak.b, 1, accuracy: 0.02)
    let early = redBlue(blend("flashWhite", 0.25), 32, 18)
    XCTAssertEqual(early.r, 1, accuracy: 0.02)
    XCTAssertEqual(early.b, 0.5, accuracy: 0.05)
    let late = redBlue(blend("flashWhite", 0.75), 32, 18)
    XCTAssertEqual(late.r, 0.5, accuracy: 0.05)
    XCTAssertEqual(late.b, 1, accuracy: 0.02)
  }

  /// Solid frames stay solid in blocks, so Pixelate is a plain mix at any progress, opaque to the corners.
  func testPixelateMixesSolidFrames() {
    for p in [0.25, 0.5, 0.75] as [CGFloat] {
      for (x, y) in [(32, 18), (0, 0), (63, 35)] as [(CGFloat, CGFloat)] {
        let c = redBlue(blend("pixelate", p), x, y)
        XCTAssertEqual(c.r, Double(1 - p), accuracy: 0.05, "pixelate at \(p), (\(x), \(y))")
        XCTAssertEqual(c.b, Double(p), accuracy: 0.05, "pixelate at \(p), (\(x), \(y))")
      }
    }
    let image = a
    XCTAssertTrue(TransitionBlend.pixelated(image, block: 1, rect: rect) === image)
    XCTAssertTrue(TransitionBlend.pixelated(image, block: .nan, rect: rect) === image)
  }

  func testMaskHelpersGuardTheirInput() {
    XCTAssertNil(TransitionBlend.masked(a, over: b, mask: nil, rect: rect))
    XCTAssertNil(TransitionBlend.slid("fade", from: a, to: b, progress: 0.5, size: size))
    XCTAssertNil(TransitionBlend.discMask(radius: .nan, size: size))
    XCTAssertNil(TransitionBlend.diagonalMask(edge: .nan, size: size))
    XCTAssertNil(TransitionBlend.sectorMask(angle: .nan, size: size))
    XCTAssertNil(TransitionBlend.sectorMask(angle: 1, size: CGSize(width: 0, height: 36)))
    XCTAssertEqual(TransitionBlend.discMask(radius: 0, size: size)?.extent, rect)
    XCTAssertEqual(TransitionBlend.diagonalMask(edge: 1, size: size)?.extent, rect)
    XCTAssertEqual(TransitionBlend.sectorMask(angle: 1, size: size)?.extent, rect)
    let image = a
    XCTAssertTrue(TransitionBlend.flashed(image, amount: 0, rect: rect) === image)
  }
}
