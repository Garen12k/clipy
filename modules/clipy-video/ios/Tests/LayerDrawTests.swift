import CoreImage
import XCTest
@testable import ClipyVideo

/// Picture-in-picture layers, masks and static opacity as `ClipyCompositor` draws them, on a 64 × 36 frame with a
/// white picture: a layer is drawn over the frame beneath it (red here), a main clip over its own background.
final class LayerDrawTests: XCTestCase {
  private let size = CGSize(width: 64, height: 36)
  private var rect: CGRect { CGRect(origin: .zero, size: size) }
  private let ctx = CIContext(options: [.workingColorSpace: NSNull()])
  private var white: CIImage { CIImage(color: CIColor(red: 1, green: 1, blue: 1)).cropped(to: rect) }
  private var red: CIImage { CIImage(color: CIColor(red: 1, green: 0, blue: 0)).cropped(to: rect) }
  private let half = ClipTransform(scale: 0.5, x: 0, y: 0, rotation: 0, flipH: false, flipV: false)

  private func overlay(transform: ClipTransform = .identity, filter: String? = nil, opacity: Double = 1, mask: String = "none",
                       motion: ClipMotionSpec? = nil, clipLength: Double = 0) -> LayerSpec {
    return LayerSpec(trackID: 7, fill: .identity, orient: .identity, crop: .full, transform: transform, background: .black,
                     filter: filter, opacity: opacity, mask: mask, transparent: true, motion: motion, clipLength: clipLength)
  }

  private func clip(opacity: Double = 1, mask: String = "none", transparent: Bool = false) -> LayerSpec {
    return LayerSpec(trackID: 1, fill: .identity, orient: .identity, crop: .full, transform: .identity,
                     background: LayerBackground(type: "color", color: "#FF0000"), filter: nil,
                     opacity: opacity, mask: mask, transparent: transparent)
  }

  /// (red, green, blue) of the pixel whose bottom-left corner is (x, y) in Core Image space (y-up), each 0…1.
  private func rgb(_ img: CIImage, _ x: CGFloat, _ y: CGFloat) -> (r: Double, g: Double, b: Double) {
    var px = [UInt8](repeating: 0, count: 4)
    ctx.render(img, toBitmap: &px, rowBytes: 4, bounds: CGRect(x: x, y: y, width: 1, height: 1), format: .RGBA8, colorSpace: nil)
    return (Double(px[0]) / 255, Double(px[1]) / 255, Double(px[2]) / 255)
  }

  // MARK: - The spec

  /// Only a plain clip (opaque, unmasked, not a layer) takes the cover shortcut at the default transform.
  func testOnlyAPlainClipUsesTheCoverShortcut() {
    XCTAssertTrue(clip().usesFill)
    XCTAssertFalse(clip(opacity: 0.5).usesFill)
    XCTAssertFalse(clip(mask: "rounded").usesFill)
    XCTAssertFalse(clip(mask: "circle").usesFill)
    XCTAssertFalse(clip(transparent: true).usesFill)
    XCTAssertTrue(clip(mask: "star").usesFill, "an unknown mask is no mask")
    XCTAssertTrue(clip(opacity: .nan).usesFill, "a non-finite opacity counts as 1")
  }

  func testTheStaticOpacityIsClampedAndTheDefaultsAreAPlainClip() {
    let plain = LayerSpec(trackID: 1, fill: .identity, orient: .identity, crop: .full, transform: .identity, background: .black, filter: nil)
    XCTAssertEqual(plain.opacity, 1)
    XCTAssertEqual(plain.mask, "none")
    XCTAssertFalse(plain.transparent)
    XCTAssertEqual(clip(opacity: 7).opacity, 1)
    XCTAssertEqual(clip(opacity: -2).opacity, 0)
    XCTAssertEqual(clip(opacity: 0.25).opacity, 0.25)
    XCTAssertEqual(clip(opacity: .infinity).opacity, 1)
  }

  // MARK: - A layer over the frame beneath it

  func testALayerIsDrawnOverTheFrameBeneathIt() {
    let img = ClipyCompositor.overlayFrame(overlay(transform: half), source: white, over: red, time: 0, size: size)
    XCTAssertEqual(img.extent, rect)
    XCTAssertEqual(rgb(img, 32, 18).g, 1, accuracy: 0.03)          // the layer's picture, in the middle
    XCTAssertEqual(rgb(img, 2, 2).g, 0, accuracy: 0.03)            // the frame beneath it, in the corner
    XCTAssertEqual(rgb(img, 2, 2).r, 1, accuracy: 0.03)
  }

  /// `beneath·(1 − opacity) + picture·opacity`; the static opacity multiplies the motion opacity.
  func testALayerFadesOverWhatIsBeneathIt() {
    let fixed = ClipyCompositor.overlayFrame(overlay(transform: half, opacity: 0.5), source: white, over: red, time: 0, size: size)
    XCTAssertEqual(rgb(fixed, 32, 18).r, 1, accuracy: 0.03)
    XCTAssertEqual(rgb(fixed, 32, 18).g, 0.5, accuracy: 0.03)
    XCTAssertEqual(rgb(fixed, 2, 2).g, 0, accuracy: 0.03)
    let both = ClipyCompositor.placedFrame(overlay(transform: half, opacity: 0.5), transform: half, opacity: 0.5, source: white, size: size, over: red, time: 0)
    XCTAssertEqual(rgb(both, 32, 18).g, 0.25, accuracy: 0.03)
  }

  /// With pins the layer is placed and faded by the values resolved at its local time (flat before the first pin).
  func testALayerWithPinsUsesItsResolvedValues() {
    let pin = MotionKeyframe(t: 0, x: 0, y: 0, scale: 0.5, rotation: 0, opacity: 0.5)
    let motion = ClipMotionSpec(keyframes: [pin], animIn: nil, animOut: nil, animCombo: nil)
    let img = ClipyCompositor.overlayFrame(overlay(motion: motion, clipLength: 2), source: white, over: red, time: 1, size: size)
    XCTAssertEqual(rgb(img, 32, 18).g, 0.5, accuracy: 0.03)        // half see-through, in the middle
    XCTAssertEqual(rgb(img, 2, 2).g, 0, accuracy: 0.03)            // half size: the corner is the frame beneath
  }

  func testALayerThatCannotBeSeenLeavesTheFrameAlone() {
    let unseen = [overlay(opacity: 0), overlay(transform: ClipTransform(scale: 0, x: 0, y: 0, rotation: 0, flipH: false, flipV: false)),
                  overlay(transform: ClipTransform(scale: .nan, x: 0, y: 0, rotation: 0, flipH: false, flipV: false))]
    for spec in unseen {
      let img = ClipyCompositor.overlayFrame(spec, source: white, over: red, time: 0, size: size)
      XCTAssertEqual(rgb(img, 32, 18).g, 0, accuracy: 0.03)
      XCTAssertEqual(rgb(img, 32, 18).r, 1, accuracy: 0.03)
    }
  }

  /// A layer's filter changes its own picture only: the frame around it keeps its colour.
  func testALayersLookStaysInsideItsPicture() {
    let green = CIImage(color: CIColor(red: 0, green: 1, blue: 0)).cropped(to: rect)
    let img = ClipyCompositor.overlayFrame(overlay(transform: half, filter: "mono"), source: green, over: red, time: 0, size: size)
    let middle = rgb(img, 32, 18)
    XCTAssertEqual(middle.r, middle.g, accuracy: 0.05)             // the layer went grey
    XCTAssertEqual(middle.g, middle.b, accuracy: 0.05)
    XCTAssertEqual(rgb(img, 2, 2).r, 1, accuracy: 0.03)            // the frame beneath it did not
    XCTAssertEqual(rgb(img, 2, 2).g, 0, accuracy: 0.03)
  }

  // MARK: - Masks

  /// A circle mask on a 64 × 36 box is a pill with 18-pixel ends: the corners show what is beneath, the middle of
  /// the left edge and the centre stay the picture.
  func testAMaskedLayerShowsTheFrameBeneathInItsCorners() {
    let img = ClipyCompositor.overlayFrame(overlay(mask: "circle"), source: white, over: red, time: 0, size: size)
    for (x, y) in [(0, 0), (63, 0), (0, 35), (63, 35), (2, 2)] as [(CGFloat, CGFloat)] {
      XCTAssertEqual(rgb(img, x, y).g, 0, accuracy: 0.05, "corner (\(x), \(y))")
      XCTAssertEqual(rgb(img, x, y).r, 1, accuracy: 0.05, "corner (\(x), \(y))")
    }
    XCTAssertEqual(rgb(img, 32, 18).g, 1, accuracy: 0.03)
    XCTAssertEqual(rgb(img, 2, 18).g, 1, accuracy: 0.05)
    XCTAssertEqual(rgb(img, 32, 1).g, 1, accuracy: 0.05)
  }

  /// A masked main clip shows its own background in the cut corners, even though the picture covers the frame.
  func testAMaskedMainClipShowsItsBackground() {
    let img = ClipyCompositor.placedFrame(clip(mask: "rounded"), transform: .identity, opacity: 1, source: white, size: size)
    XCTAssertEqual(img.extent, rect)
    XCTAssertEqual(rgb(img, 0, 0).g, 0, accuracy: 0.05)            // radius 0.12 × 36 = 4.32: the corner pixel is outside
    XCTAssertEqual(rgb(img, 0, 0).r, 1, accuracy: 0.05)
    XCTAssertEqual(rgb(img, 32, 18).g, 1, accuracy: 0.03)
    XCTAssertEqual(rgb(img, 8, 8).g, 1, accuracy: 0.03)
  }

  /// A main clip's static opacity shows its background through the picture.
  func testASeeThroughMainClipShowsItsBackground() {
    let img = ClipyCompositor.placedFrame(clip(opacity: 0.5), transform: .identity, opacity: 1, source: white, size: size)
    XCTAssertEqual(rgb(img, 32, 18).r, 1, accuracy: 0.03)
    XCTAssertEqual(rgb(img, 32, 18).g, 0.5, accuracy: 0.03)
  }

  /// The mask turns with the picture. A quarter-turned picture at scale 0.25 is a 28.44 × 16 box standing upright:
  /// x 24…40, y 3.78…32.22, a pill with 8-pixel ends at the top and bottom. Its round ends are on the turned box's
  /// short sides — a mask that stayed lying down would cut the pixel at (32, 5) and keep the box's corner.
  func testTheMaskTurnsWithThePicture() {
    let turned = ClipTransform(scale: 0.25, x: 0, y: 0, rotation: 90, flipH: false, flipV: false)
    let img = ClipyCompositor.overlayFrame(overlay(transform: turned, mask: "circle"), source: white, over: red, time: 0, size: size)
    XCTAssertEqual(rgb(img, 32, 18).g, 1, accuracy: 0.03)          // the centre
    XCTAssertEqual(rgb(img, 32, 5).g, 1, accuracy: 0.05)           // inside the lower round end
    XCTAssertEqual(rgb(img, 24, 18).g, 1, accuracy: 0.05)          // the straight left side
    XCTAssertEqual(rgb(img, 24, 4).g, 0, accuracy: 0.05)           // the box's corner, cut away: the frame beneath
    XCTAssertEqual(rgb(img, 39, 31).g, 0, accuracy: 0.05)
    XCTAssertEqual(rgb(img, 20, 18).g, 0, accuracy: 0.03)          // outside the box
  }

  /// The Core Graphics fallback: a white rounded rectangle on black, exactly on the box.
  func testTheDrawnShapeIsARoundedRectangleOnTheBox() throws {
    let box = CGRect(x: -20, y: -10, width: 40, height: 20)
    let shape = try XCTUnwrap(ClipyCompositor.drawnRoundedShape(rect: box, radius: 10))
    XCTAssertEqual(shape.extent, box)
    XCTAssertEqual(rgb(shape, 0, 0).g, 1, accuracy: 0.03)          // inside
    XCTAssertEqual(rgb(shape, -19, 0).g, 1, accuracy: 0.1)         // the middle of the round end
    XCTAssertEqual(rgb(shape, -20, -10).g, 0, accuracy: 0.05)      // the cut corner
    XCTAssertEqual(rgb(shape, 19, 9).g, 0, accuracy: 0.05)
    XCTAssertNil(ClipyCompositor.drawnRoundedShape(rect: CGRect(x: 0, y: 0, width: 20000, height: 10), radius: 5))
  }

  func testNoShapeWithoutARadiusOrABox() {
    XCTAssertNil(ClipyCompositor.roundedShape(rect: CGRect(x: 0, y: 0, width: 10, height: 10), radius: 0))
    XCTAssertNil(ClipyCompositor.roundedShape(rect: .zero, radius: 4))
    XCTAssertNil(ClipyCompositor.roundedShape(rect: CGRect(x: 0, y: 0, width: 10, height: 10), radius: .nan))
    let shape = ClipyCompositor.roundedShape(rect: CGRect(x: 0, y: 0, width: 10, height: 10), radius: 50)
    XCTAssertEqual(shape?.extent, CGRect(x: 0, y: 0, width: 10, height: 10))   // the radius is capped at half the side
  }
}
