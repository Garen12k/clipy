import AVFoundation
import CoreGraphics
import CoreImage
import XCTest
@testable import ClipyVideo

/// The vectors of src/editor/model/__tests__/effectMath.vectors.ts. The tables below are checked against the TS
/// vectors by src/editor/model/__tests__/effectMath.parity.test.ts — keep the literals identical. `fn` is the Swift
/// function name (`leakAlpha` = TS `leakOpacity`, `flickerAlpha` = TS `filmFlicker`).
struct EffectScalarVector {
  let fn: String
  let name: String
  let args: [Double]
  let expect: Double
}

struct EffectShakeVector {
  let name: String
  let t: Double
  let d: Double
  let k: Double
  let x: Double
  let y: Double
  let scale: Double
}

struct EffectGlitchVector {
  let name: String
  let t: Double
  let k: Double
  let active: Bool
  let bandY: Double
  let bandH: Double
  let shift: Double
  let split: Double
}

let effectScalarVectors: [EffectScalarVector] = [
  EffectScalarVector(fn: "hash", name: "hash(1)", args: [1], expect: 0.9216903898159217),
  EffectScalarVector(fn: "hash", name: "hash(7.5)", args: [7.5], expect: 0.9096731311619806),
  EffectScalarVector(fn: "envelope", name: "start", args: [0, 2], expect: 0),
  EffectScalarVector(fn: "envelope", name: "half ramp in", args: [0.075, 2], expect: 0.5),
  EffectScalarVector(fn: "envelope", name: "ramp end", args: [0.15, 2], expect: 1),
  EffectScalarVector(fn: "envelope", name: "middle", args: [1, 2], expect: 1),
  EffectScalarVector(fn: "envelope", name: "half ramp out", args: [1.925, 2], expect: 0.5),
  EffectScalarVector(fn: "envelope", name: "end", args: [2, 2], expect: 0),
  EffectScalarVector(fn: "envelope", name: "short effect, half ramp in", args: [0.05, 0.2], expect: 0.5),
  EffectScalarVector(fn: "envelope", name: "short effect, peak", args: [0.1, 0.2], expect: 1),
  EffectScalarVector(fn: "envelope", name: "short effect, ramp out", args: [0.15, 0.2], expect: 0.5),
  EffectScalarVector(fn: "pulseScale", name: "peak at 0.25 s", args: [0.25, 2, 1], expect: 1.12),
  EffectScalarVector(fn: "pulseScale", name: "ramping in at 0.1 s", args: [0.1, 2, 1], expect: 1.027639320225),
  EffectScalarVector(fn: "flashOpacity", name: "t = 0", args: [0, 1], expect: 1),
  EffectScalarVector(fn: "flashOpacity", name: "t = 0.1", args: [0.1, 1], expect: 0.2),
  EffectScalarVector(fn: "flashOpacity", name: "t = 0.25", args: [0.25, 1], expect: 0),
  EffectScalarVector(fn: "flashOpacity", name: "t = 0.5 (second flash)", args: [0.5, 1], expect: 1),
  EffectScalarVector(fn: "flashOpacity", name: "half intensity", args: [0.1, 0.5], expect: 0.1),
  EffectScalarVector(fn: "leakAlpha", name: "t = 1, k = 1", args: [1, 2, 1], expect: 0.21),
  EffectScalarVector(fn: "leakAlpha", name: "t = 0.5, k = 0.5", args: [0.5, 2, 0.5], expect: 0.175),
  EffectScalarVector(fn: "flickerAlpha", name: "t = 0.25 (frame 3)", args: [0.25, 1], expect: 0.06698671062971698),
]

let effectShakeVectors: [EffectShakeVector] = [
  EffectShakeVector(name: "ramping in", t: 0.1, d: 2, k: 0.5, x: -0.005877852522924734, y: 0.009367668135426397, scale: 1.03),
  EffectShakeVector(name: "full envelope", t: 0.25, d: 2, k: 0.5, x: 0.015, y: -0.004012482429368836, scale: 1.03),
  EffectShakeVector(name: "one second in", t: 1, d: 2, k: 0.5, x: 0, y: 0.014453372781257844, scale: 1.03),
]

let effectGlitchVectors: [EffectGlitchVector] = [
  EffectGlitchVector(name: "active slice", t: 0.3, k: 1, active: true, bandY: 0.10145767707985968, bandH: 0.13413593816803768, shift: 0.07958605447551236, split: 0.01),
  EffectGlitchVector(name: "inactive slice", t: 1, k: 0.5, active: false, bandY: 0.49186976637340174, bandH: 0.11834738805497182, shift: 0, split: 0),
]

final class EffectMathTests: XCTestCase {
  private let size = CGSize(width: 64, height: 36)
  private var rect: CGRect { CGRect(origin: .zero, size: size) }
  private let ctx = CIContext(options: [.workingColorSpace: NSNull()])

  /// The function a scalar vector names, on its arguments (nil for a name or an argument count this test does not know).
  private func value(_ v: EffectScalarVector) -> Double? {
    let a = v.args
    switch (v.fn, a.count) {
    case ("hash", 1): return EffectMath.hash(a[0])
    case ("envelope", 2): return EffectMath.envelope(t: a[0], d: a[1])
    case ("pulseScale", 3): return EffectMath.pulseScale(t: a[0], d: a[1], k: a[2])
    case ("flashOpacity", 2): return EffectMath.flashOpacity(t: a[0], k: a[1])
    case ("leakAlpha", 3): return EffectMath.leakAlpha(t: a[0], d: a[1], k: a[2])
    case ("flickerAlpha", 2): return EffectMath.flickerAlpha(t: a[0], k: a[1])
    default: return nil
    }
  }

  /// (red, green, blue) of the pixel whose bottom-left corner is (x, y) in Core Image space (y-up), each 0…1.
  private func rgb(_ img: CIImage, _ x: CGFloat, _ y: CGFloat) -> (r: Double, g: Double, b: Double) {
    var px = [UInt8](repeating: 0, count: 4)
    ctx.render(img, toBitmap: &px, rowBytes: 4, bounds: CGRect(x: x, y: y, width: 1, height: 1), format: .RGBA8, colorSpace: nil)
    return (Double(px[0]) / 255, Double(px[1]) / 255, Double(px[2]) / 255)
  }

  private var grey: CIImage { CIImage(color: CIColor(red: 0.5, green: 0.5, blue: 0.5)).cropped(to: rect) }

  func testScalarFunctionsMatchTheVectors() {
    XCTAssertEqual(effectScalarVectors.count, 21)
    for v in effectScalarVectors {
      guard let got = value(v) else { XCTFail("\(v.fn): \(v.name)"); continue }
      XCTAssertEqual(got, v.expect, accuracy: 1e-9, "\(v.fn): \(v.name)")
    }
  }

  func testShakeOffsetMatchesTheVectors() {
    XCTAssertEqual(effectShakeVectors.count, 3)
    for v in effectShakeVectors {
      let o = EffectMath.shakeOffset(t: v.t, d: v.d, k: v.k)
      XCTAssertEqual(o.x, v.x, accuracy: 1e-9, v.name)
      XCTAssertEqual(o.y, v.y, accuracy: 1e-9, v.name)
      XCTAssertEqual(o.scale, v.scale, accuracy: 1e-9, v.name)
    }
  }

  func testGlitchSliceMatchesTheVectors() {
    XCTAssertEqual(effectGlitchVectors.count, 2)
    for v in effectGlitchVectors {
      let g = EffectMath.glitchSlice(t: v.t, k: v.k)
      XCTAssertEqual(g.active, v.active, v.name)
      XCTAssertEqual(g.bandY, v.bandY, accuracy: 1e-9, v.name)
      XCTAssertEqual(g.bandH, v.bandH, accuracy: 1e-9, v.name)
      XCTAssertEqual(g.shift, v.shift, accuracy: 1e-9, v.name)
      XCTAssertEqual(g.split, v.split, accuracy: 1e-9, v.name)
    }
  }

  /// 1000 inputs, negatives included (frac is x − floor(x), so a negative product still lands in [0, 1)).
  func testHashStaysInTheUnitInterval() {
    for i in -500..<500 {
      let h = EffectMath.hash(Double(i) * 0.37 + 0.11)
      XCTAssertGreaterThanOrEqual(h, 0)
      XCTAssertLessThan(h, 1)
    }
    XCTAssertEqual(EffectMath.frac(-0.25), 0.75, accuracy: 1e-12)
    XCTAssertEqual(EffectMath.frac(2.25), 0.25, accuracy: 1e-12)
  }

  func testEnvelopeIsZeroOutsideTheEffect() {
    XCTAssertEqual(EffectMath.envelope(t: -0.1, d: 2), 0)
    XCTAssertEqual(EffectMath.envelope(t: 2.1, d: 2), 0)
    XCTAssertEqual(EffectMath.envelope(t: 0, d: 0), 0)
    XCTAssertEqual(EffectMath.envelope(t: 0.1, d: -1), 0)
    XCTAssertEqual(EffectMath.envelope(t: .nan, d: 2), 0)
    XCTAssertEqual(EffectMath.envelope(t: 1, d: .nan), 0)
  }

  /// Every effect id, half way through a 2 s effect at full strength (and inside an active glitch slice), gives a
  /// frame-sized image.
  func testEveryEffectKeepsTheFrameExtent() {
    XCTAssertEqual(Effects.effectIds.count, 10)
    for id in Effects.effectIds {
      XCTAssertEqual(EffectRenderer.apply(type: id, image: grey, t: 1, d: 2, k: 1, size: size).extent, rect, id)
      XCTAssertEqual(EffectRenderer.apply(type: id, image: grey, t: 0.3, d: 2, k: 1, size: size).extent, rect, id)
    }
  }

  /// Unknown types, zero strength, non-finite input and times outside the effect hand the image back untouched.
  func testNoOpInputsReturnTheImageItself() {
    let image = grey
    XCTAssertTrue(EffectRenderer.apply(type: "sparkle", image: image, t: 1, d: 2, k: 1, size: size) === image)
    for id in Effects.effectIds {
      XCTAssertTrue(EffectRenderer.apply(type: id, image: image, t: 1, d: 2, k: 0, size: size) === image, id)
      XCTAssertTrue(EffectRenderer.apply(type: id, image: image, t: -0.1, d: 2, k: 1, size: size) === image, id)
      XCTAssertTrue(EffectRenderer.apply(type: id, image: image, t: 2.1, d: 2, k: 1, size: size) === image, id)
      XCTAssertTrue(EffectRenderer.apply(type: id, image: image, t: .nan, d: 2, k: 1, size: size) === image, id)
      XCTAssertTrue(EffectRenderer.apply(type: id, image: image, t: 1, d: 2, k: .nan, size: size) === image, id)
    }
    // An inactive glitch slice (the "inactive slice" vector) changes nothing.
    XCTAssertTrue(EffectRenderer.apply(type: "glitch", image: image, t: 1, d: 2, k: 0.5, size: size) === image)
  }

  /// A flash at its peak (t = 0, k = 1 → opacity 1) is white; half way down its decay (t = 0.0625 →
  /// 1 − 4·frac(0.125) = 0.5) it is the grey frame mixed half and half with white: 0.5·0.5 + 0.5 = 0.75.
  func testFlashCompositesWhiteAtTheComputedOpacity() {
    let peak = rgb(EffectRenderer.apply(type: "flash", image: grey, t: 0, d: 2, k: 1, size: size), 32, 18)
    XCTAssertEqual(peak.r, 1, accuracy: 0.02)
    let part = rgb(EffectRenderer.apply(type: "flash", image: grey, t: 0.0625, d: 2, k: 1, size: size), 32, 18)
    XCTAssertEqual(part.r, 0.75, accuracy: 0.03)
    XCTAssertEqual(part.b, 0.75, accuracy: 0.03)
  }

  /// A solid frame has no edges to pull apart: shake, zoom, blur and the channel split leave it as it was, opaque to
  /// the corners (clamped edges; the per-channel maximum of the three isolated channels is the original, alpha 1).
  func testGeometryAndSplitKeepASolidFrame() {
    for id in ["shake", "zoomPulse", "blur", "rgbSplit"] {
      let out = EffectRenderer.apply(type: id, image: grey, t: 1.03, d: 2, k: 1, size: size)
      for (x, y) in [(32, 18), (0, 0), (63, 35)] as [(CGFloat, CGFloat)] {
        let c = rgb(out, x, y)
        XCTAssertEqual(c.r, 0.5, accuracy: 0.03, "\(id) at (\(x), \(y))")
        XCTAssertEqual(c.g, 0.5, accuracy: 0.03, "\(id) at (\(x), \(y))")
        XCTAssertEqual(c.b, 0.5, accuracy: 0.03, "\(id) at (\(x), \(y))")
      }
    }
  }

  /// rgbSplit moves red to the right and blue to the left: on a 1000 px wide frame whose left half is white and
  /// right half black (edge at x = 500) the split is 8 px, so just right of the edge only red is left and just left
  /// of it blue is already gone (red + green = yellow).
  func testRgbSplitMovesRedRightAndBlueLeft() {
    let wide = CGSize(width: 1000, height: 20)                  // split = 0.008 × 1000 = 8 px at k = 1, env = 1
    let frame = CGRect(origin: .zero, size: wide)
    let white = CIImage(color: CIColor(red: 1, green: 1, blue: 1)).cropped(to: CGRect(x: 0, y: 0, width: 500, height: 20))
    let image = white.composited(over: CIImage(color: CIColor.black).cropped(to: frame)).cropped(to: frame)
    let out = EffectRenderer.apply(type: "rgbSplit", image: image, t: 1, d: 2, k: 1, size: wide)
    XCTAssertEqual(out.extent, frame)
    let right = rgb(out, 503, 10)                               // red reaches 8 px past the edge; green and blue do not
    XCTAssertEqual(right.r, 1, accuracy: 0.02)
    XCTAssertEqual(right.g, 0, accuracy: 0.02)
    XCTAssertEqual(right.b, 0, accuracy: 0.02)
    let left = rgb(out, 496, 10)                                // blue's edge moved 8 px left: red + green only
    XCTAssertEqual(left.r, 1, accuracy: 0.02)
    XCTAssertEqual(left.g, 1, accuracy: 0.02)
    XCTAssertEqual(left.b, 0, accuracy: 0.02)
  }

  /// Only drawable effects are kept (known type, finite non-empty range, finite intensity), in order, with the
  /// intensity clamped to 0…1.
  func testUsableEffects() {
    let all = [
      ActiveEffectSpec(type: "shake", start: 1, end: 3, intensity: 2),
      ActiveEffectSpec(type: "sparkle", start: 1, end: 3, intensity: 1),
      ActiveEffectSpec(type: "flash", start: 3, end: 3, intensity: 1),
      ActiveEffectSpec(type: "flash", start: 4, end: 2, intensity: 1),
      ActiveEffectSpec(type: "glow", start: .nan, end: 3, intensity: 1),
      ActiveEffectSpec(type: "glow", start: 0, end: .infinity, intensity: 1),
      ActiveEffectSpec(type: "blur", start: 0, end: 1, intensity: .nan),
      ActiveEffectSpec(type: "vhs", start: 2, end: 5, intensity: -1),
    ]
    XCTAssertEqual(ActiveEffectSpec.usable(all), [
      ActiveEffectSpec(type: "shake", start: 1, end: 3, intensity: 1),
      ActiveEffectSpec(type: "vhs", start: 2, end: 5, intensity: 0),
    ])
    XCTAssertTrue(ActiveEffectSpec.usable([]).isEmpty)
  }

  /// An effect belongs to every instruction range it touches; ranges that only meet at an end point do not overlap.
  func testOverlaps() {
    let e = ActiveEffectSpec(type: "shake", start: 1, end: 3, intensity: 1)
    XCTAssertTrue(e.overlaps(from: 0, to: 1.5))
    XCTAssertTrue(e.overlaps(from: 2, to: 2.5))
    XCTAssertTrue(e.overlaps(from: 2.5, to: 10))
    XCTAssertFalse(e.overlaps(from: 0, to: 1))
    XCTAssertFalse(e.overlaps(from: 3, to: 4))
  }

  func testAnInstructionCarriesNoEffectsByDefault() {
    let range = CMTimeRange(start: .zero, duration: CMTime(value: 1, timescale: 1))
    XCTAssertTrue(ClipyInstruction(timeRange: range, layers: [], transition: nil).effects.isEmpty)
    let e = ActiveEffectSpec(type: "glow", start: 0, end: 1, intensity: 0.5)
    XCTAssertEqual(ClipyInstruction(timeRange: range, layers: [], transition: nil, effects: [e]).effects, [e])
  }
}
