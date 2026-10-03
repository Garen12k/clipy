import CoreGraphics
import CoreImage
import XCTest
@testable import ClipyVideo

/// One case of `ADJUST_VECTORS` (src/editor/model/__tests__/adjust.vectors.ts). The table below is checked against
/// the TS vectors by src/editor/model/__tests__/adjust.parity.test.ts — keep the literals identical.
struct AdjustVector {
  let name: String
  let adjust: AdjustValues
  let expect: [AdjustStep]
}

let adjustVectors: [AdjustVector] = [
  AdjustVector(name: "neutral",
    adjust: AdjustValues(brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 0),
    expect: []),
  AdjustVector(name: "brightness +1",
    adjust: AdjustValues(brightness: 1, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 0),
    expect: [.colorControls(brightness: 0.25, contrast: 1, saturation: 1)]),
  AdjustVector(name: "brightness -1",
    adjust: AdjustValues(brightness: -1, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 0),
    expect: [.colorControls(brightness: -0.25, contrast: 1, saturation: 1)]),
  AdjustVector(name: "contrast +1",
    adjust: AdjustValues(brightness: 0, contrast: 1, saturation: 0, exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 0),
    expect: [.colorControls(brightness: 0, contrast: 1.5, saturation: 1)]),
  AdjustVector(name: "contrast -1",
    adjust: AdjustValues(brightness: 0, contrast: -1, saturation: 0, exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 0),
    expect: [.colorControls(brightness: 0, contrast: 0.5, saturation: 1)]),
  AdjustVector(name: "saturation +1",
    adjust: AdjustValues(brightness: 0, contrast: 0, saturation: 1, exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 0),
    expect: [.colorControls(brightness: 0, contrast: 1, saturation: 2)]),
  AdjustVector(name: "saturation -1",
    adjust: AdjustValues(brightness: 0, contrast: 0, saturation: -1, exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 0),
    expect: [.colorControls(brightness: 0, contrast: 1, saturation: 0)]),
  AdjustVector(name: "exposure +1",
    adjust: AdjustValues(brightness: 0, contrast: 0, saturation: 0, exposure: 1, temperature: 0, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 0),
    expect: [.exposure(ev: 1.5)]),
  AdjustVector(name: "exposure -1",
    adjust: AdjustValues(brightness: 0, contrast: 0, saturation: 0, exposure: -1, temperature: 0, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 0),
    expect: [.exposure(ev: -1.5)]),
  AdjustVector(name: "temperature +1",
    adjust: AdjustValues(brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 1, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 0),
    expect: [.temperatureTint(neutral: AdjustPoint(6500, 0), target: AdjustPoint(4000, 0))]),
  AdjustVector(name: "temperature -1",
    adjust: AdjustValues(brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: -1, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 0),
    expect: [.temperatureTint(neutral: AdjustPoint(6500, 0), target: AdjustPoint(9000, 0))]),
  AdjustVector(name: "tint +1",
    adjust: AdjustValues(brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 1, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 0),
    expect: [.temperatureTint(neutral: AdjustPoint(6500, 0), target: AdjustPoint(6500, 100))]),
  AdjustVector(name: "tint -1",
    adjust: AdjustValues(brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: -1, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 0),
    expect: [.temperatureTint(neutral: AdjustPoint(6500, 0), target: AdjustPoint(6500, -100))]),
  AdjustVector(name: "highlights +1",
    adjust: AdjustValues(brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0, highlights: 1, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 0),
    expect: [.toneCurve(points: [AdjustPoint(0, 0), AdjustPoint(0.25, 0.25), AdjustPoint(0.5, 0.5), AdjustPoint(0.75, 0.9), AdjustPoint(1, 1)])]),
  AdjustVector(name: "highlights -1",
    adjust: AdjustValues(brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0, highlights: -1, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 0),
    expect: [.toneCurve(points: [AdjustPoint(0, 0), AdjustPoint(0.25, 0.25), AdjustPoint(0.5, 0.5), AdjustPoint(0.75, 0.6), AdjustPoint(1, 1)])]),
  AdjustVector(name: "shadows +1",
    adjust: AdjustValues(brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: 1, sharpen: 0, vignette: 0, fade: 0, grain: 0),
    expect: [.toneCurve(points: [AdjustPoint(0, 0), AdjustPoint(0.25, 0.4), AdjustPoint(0.5, 0.5), AdjustPoint(0.75, 0.75), AdjustPoint(1, 1)])]),
  AdjustVector(name: "shadows -1",
    adjust: AdjustValues(brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: -1, sharpen: 0, vignette: 0, fade: 0, grain: 0),
    expect: [.toneCurve(points: [AdjustPoint(0, 0), AdjustPoint(0.25, 0.1), AdjustPoint(0.5, 0.5), AdjustPoint(0.75, 0.75), AdjustPoint(1, 1)])]),
  AdjustVector(name: "fade +1",
    adjust: AdjustValues(brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 1, grain: 0),
    expect: [.toneCurve(points: [AdjustPoint(0, 0.25), AdjustPoint(0.25, 0.25), AdjustPoint(0.5, 0.5), AdjustPoint(0.75, 0.75), AdjustPoint(1, 1)])]),
  AdjustVector(name: "sharpen +1",
    adjust: AdjustValues(brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, sharpen: 1, vignette: 0, fade: 0, grain: 0),
    expect: [.sharpen(sharpness: 1.2)]),
  AdjustVector(name: "vignette +1",
    adjust: AdjustValues(brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 1, fade: 0, grain: 0),
    expect: [.vignette(intensity: 1.5, radius: 1.5)]),
  AdjustVector(name: "grain +1",
    adjust: AdjustValues(brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 1),
    expect: [.grain(opacity: 0.25)]),
  AdjustVector(name: "all keys at 0.5",
    adjust: AdjustValues(brightness: 0.5, contrast: 0.5, saturation: 0.5, exposure: 0.5, temperature: 0.5, tint: 0.5, highlights: 0.5, shadows: 0.5, sharpen: 0.5, vignette: 0.5, fade: 0.5, grain: 0.5),
    expect: [.exposure(ev: 0.75), .temperatureTint(neutral: AdjustPoint(6500, 0), target: AdjustPoint(5250, 50)), .colorControls(brightness: 0.125, contrast: 1.25, saturation: 1.5), .toneCurve(points: [AdjustPoint(0, 0.125), AdjustPoint(0.25, 0.325), AdjustPoint(0.5, 0.5), AdjustPoint(0.75, 0.825), AdjustPoint(1, 1)]), .sharpen(sharpness: 0.6), .vignette(intensity: 0.75, radius: 1.5), .grain(opacity: 0.125)]),
  AdjustVector(name: "temperature 0.4 with tint -0.5",
    adjust: AdjustValues(brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0.4, tint: -0.5, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 0),
    expect: [.temperatureTint(neutral: AdjustPoint(6500, 0), target: AdjustPoint(5500, -50))]),
]

final class AdjustTests: XCTestCase {
  /// A step as its kind plus its numbers in declaration order, so two steps can be compared with a tolerance.
  private func flat(_ s: AdjustStep) -> (kind: String, numbers: [Double]) {
    switch s {
    case .exposure(let ev): return ("exposure", [ev])
    case .temperatureTint(let n, let t): return ("temperatureTint", [n.x, n.y, t.x, t.y])
    case .colorControls(let b, let c, let sat): return ("colorControls", [b, c, sat])
    case .toneCurve(let points): return ("toneCurve", points.flatMap { [$0.x, $0.y] })
    case .sharpen(let sharpness): return ("sharpen", [sharpness])
    case .vignette(let intensity, let radius): return ("vignette", [intensity, radius])
    case .grain(let opacity): return ("grain", [opacity])
    }
  }

  private func values(_ change: (inout AdjustValues) -> Void) -> AdjustValues {
    var a = AdjustValues.neutral
    change(&a)
    return a
  }

  func testStepsMatchTheVectors() {
    XCTAssertEqual(adjustVectors.count, 23)
    for v in adjustVectors {
      let got = Adjust.steps(v.adjust)
      XCTAssertEqual(got.count, v.expect.count, v.name)
      for (g, e) in zip(got, v.expect) {
        let a = flat(g), b = flat(e)
        XCTAssertEqual(a.kind, b.kind, v.name)
        XCTAssertEqual(a.numbers.count, b.numbers.count, v.name)
        for (x, y) in zip(a.numbers, b.numbers) { XCTAssertEqual(x, y, accuracy: 1e-9, v.name) }
      }
    }
  }

  func testNeutralGivesNoSteps() {
    XCTAssertTrue(AdjustValues.neutral.isNeutral)
    XCTAssertTrue(Adjust.steps(.neutral).isEmpty)
    XCTAssertFalse(values { $0.grain = 0.01 }.isNeutral)
    XCTAssertFalse(values { $0.tint = -0.01 }.isNeutral)
  }

  /// One-sided keys below 0 add no step (as `adjustRecipe`: `> 0`).
  func testNegativeOneSidedKeysAreSkipped() {
    XCTAssertTrue(Adjust.steps(values { $0.sharpen = -1; $0.vignette = -1; $0.grain = -1 }).isEmpty)
  }

  /// The tone curve's y values stay inside 0…1 whatever the sliders say.
  func testToneCurveIsClamped() {
    let steps = Adjust.steps(values { $0.fade = 10; $0.shadows = -10; $0.highlights = 10 })
    guard steps.count == 1, case .toneCurve(let points) = steps[0] else { return XCTFail("one tone curve") }
    XCTAssertEqual(points.map { $0.y }, [1, 0, 0.5, 1, 1])
  }

  func testNonFiniteValuesCountAsNeutral() {
    let bad = values { $0.brightness = .nan; $0.exposure = .infinity; $0.grain = -.infinity; $0.contrast = 0.5 }
    XCTAssertEqual(bad.sanitized, values { $0.contrast = 0.5 })
    XCTAssertTrue(values { $0.fade = .nan }.sanitized.isNeutral)
    XCTAssertEqual(AdjustValues.neutral.sanitized, .neutral)
  }

  func testStrength() {
    XCTAssertEqual(Adjust.strength(0.4), 0.4)
    XCTAssertEqual(Adjust.strength(-1), 0)
    XCTAssertEqual(Adjust.strength(3), 1)
    XCTAssertEqual(Adjust.strength(.nan), 1)
    XCTAssertEqual(Adjust.strength(.infinity), 1)
  }

  /// The noise moves every frame, by whole pixels, and is the same for the same time.
  func testGrainOffsetIsDeterministicAndChangesEachFrame() {
    XCTAssertEqual(Adjust.grainOffset(time: 0), .zero)
    XCTAssertEqual(Adjust.grainOffset(time: 1.0 / 30), CGPoint(x: 37, y: 53))
    XCTAssertEqual(Adjust.grainOffset(time: 2.5), Adjust.grainOffset(time: 2.5))
    XCTAssertNotEqual(Adjust.grainOffset(time: 2.5), Adjust.grainOffset(time: 2.5 + 1.0 / 30))
    XCTAssertEqual(Adjust.grainOffset(time: .nan), .zero)
    XCTAssertEqual(Adjust.grainOffset(time: -4), .zero)
    let far = Adjust.grainOffset(time: 3600)
    XCTAssertTrue(far.x >= 0 && far.x < 509 && far.y >= 0 && far.y < 503)
  }

  /// A neutral adjust hands the frame back untouched; any other keeps the frame's extent.
  func testApplyKeepsTheExtent() {
    let rect = CGRect(x: 0, y: 0, width: 64, height: 36)
    let image = CIImage(color: CIColor(red: 0.5, green: 0.4, blue: 0.3)).cropped(to: rect)
    XCTAssertTrue(Adjust.apply(.neutral, to: image, time: 0) === image)
    for v in adjustVectors {
      XCTAssertEqual(Adjust.apply(v.adjust, to: image, time: 1.25).extent, rect, v.name)
    }
    XCTAssertEqual(Adjust.grain(image, opacity: 0.25, time: 0.5).extent, rect)
    XCTAssertTrue(Adjust.grain(image, opacity: 0, time: 0.5) === image)
  }

  /// Brightness up makes a mid-grey frame lighter; grain at full strength keeps it roughly mid-grey (noise mean 0.5).
  func testApplyChangesThePicture() {
    let rect = CGRect(x: 0, y: 0, width: 32, height: 32)
    let image = CIImage(color: CIColor(red: 0.5, green: 0.5, blue: 0.5)).cropped(to: rect)
    let ctx = CIContext(options: [.workingColorSpace: NSNull()])
    func red(_ img: CIImage) -> Double {
      var px = [UInt8](repeating: 0, count: 4)
      ctx.render(img, toBitmap: &px, rowBytes: 4, bounds: CGRect(x: 16, y: 16, width: 1, height: 1), format: .RGBA8, colorSpace: nil)
      return Double(px[0]) / 255
    }
    XCTAssertEqual(red(image), 0.5, accuracy: 0.02)
    XCTAssertGreaterThan(red(Adjust.apply(values { $0.brightness = 1 }, to: image, time: 0)), 0.6)
    XCTAssertLessThan(red(Adjust.apply(values { $0.brightness = -1 }, to: image, time: 0)), 0.4)
    let grained = red(Adjust.apply(values { $0.grain = 1 }, to: image, time: 0))
    XCTAssertEqual(grained, 0.5, accuracy: 0.13)   // 0.5·0.75 + noise·0.25, noise in 0…1
  }
}
