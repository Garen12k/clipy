import CoreGraphics
import CoreImage
import XCTest
@testable import ClipyVideo

/// One case of `FILTER_VECTORS` (src/editor/model/__tests__/filterRecipes.vectors.ts). The table below is checked
/// against the TS vectors by filterRecipes.parity.test.ts — keep the literals and the spacing identical.
struct FilterVector {
  let id: String
  let expect: [FilterStep]
}

let filterVectors: [FilterVector] = [
  FilterVector(id: "kodak", expect: [.adjust(.temperatureTint(neutral: AdjustPoint(6500, 0), target: AdjustPoint(6000, 0))), .adjust(.colorControls(brightness: 0, contrast: 1.075, saturation: 1.15)), .splitTone(shadow: "#27413A", highlight: "#FFC98A", amount: 0.25), .adjust(.toneCurve(points: [AdjustPoint(0, 0.02), AdjustPoint(0.25, 0.25), AdjustPoint(0.5, 0.5), AdjustPoint(0.75, 0.75), AdjustPoint(1, 1)])), .adjust(.grain(opacity: 0.0375))]),
  FilterVector(id: "fuji", expect: [.adjust(.temperatureTint(neutral: AdjustPoint(6500, 0), target: AdjustPoint(6800, -15))), .adjust(.colorControls(brightness: 0, contrast: 1.05, saturation: 1.1)), .splitTone(shadow: "#1F4A45", highlight: "#F2F5E6", amount: 0.2), .adjust(.toneCurve(points: [AdjustPoint(0, 0.025), AdjustPoint(0.25, 0.25), AdjustPoint(0.5, 0.5), AdjustPoint(0.75, 0.75), AdjustPoint(1, 1)]))]),
  FilterVector(id: "matte", expect: [.adjust(.temperatureTint(neutral: AdjustPoint(6500, 0), target: AdjustPoint(6300, 0))), .adjust(.colorControls(brightness: 0, contrast: 0.875, saturation: 0.8)), .adjust(.toneCurve(points: [AdjustPoint(0, 0.175), AdjustPoint(0.25, 0.25), AdjustPoint(0.5, 0.5), AdjustPoint(0.75, 0.75), AdjustPoint(1, 1)])), .adjust(.grain(opacity: 0.075))]),
  FilterVector(id: "bleach", expect: [.adjust(.colorControls(brightness: -0.0125, contrast: 1.25, saturation: 0.45)), .adjust(.sharpen(sharpness: 0.24)), .adjust(.grain(opacity: 0.05))]),
  FilterVector(id: "dusk", expect: [.adjust(.temperatureTint(neutral: AdjustPoint(6500, 0), target: AdjustPoint(6125, 30))), .adjust(.colorControls(brightness: -0.025, contrast: 1, saturation: 1.15)), .splitTone(shadow: "#3B2A6B", highlight: "#FF9E6B", amount: 0.35), .adjust(.vignette(intensity: 0.375, radius: 1.5))]),
  FilterVector(id: "moody", expect: [.adjust(.temperatureTint(neutral: AdjustPoint(6500, 0), target: AdjustPoint(7375, 0))), .adjust(.colorControls(brightness: -0.03, contrast: 1.125, saturation: 0.7)), .adjust(.toneCurve(points: [AdjustPoint(0, 0.0375), AdjustPoint(0.25, 0.25), AdjustPoint(0.5, 0.5), AdjustPoint(0.75, 0.75), AdjustPoint(1, 1)])), .adjust(.vignette(intensity: 0.525, radius: 1.5))]),
  FilterVector(id: "tealOrange", expect: [.adjust(.colorControls(brightness: 0, contrast: 1.1, saturation: 1.1)), .splitTone(shadow: "#0E6E78", highlight: "#FF9A45", amount: 0.5)]),
  FilterVector(id: "blush", expect: [.adjust(.temperatureTint(neutral: AdjustPoint(6500, 0), target: AdjustPoint(6500, 25))), .adjust(.colorControls(brightness: 0.05, contrast: 0.9, saturation: 0.85)), .splitTone(shadow: "#8A5A7A", highlight: "#FFE3EA", amount: 0.25), .adjust(.toneCurve(points: [AdjustPoint(0, 0.075), AdjustPoint(0.25, 0.25), AdjustPoint(0.5, 0.5), AdjustPoint(0.75, 0.75), AdjustPoint(1, 1)]))]),
  FilterVector(id: "grit", expect: [.adjust(.colorControls(brightness: 0, contrast: 1.35, saturation: 0)), .adjust(.toneCurve(points: [AdjustPoint(0, 0), AdjustPoint(0.25, 0.19), AdjustPoint(0.5, 0.5), AdjustPoint(0.75, 0.75), AdjustPoint(1, 1)])), .adjust(.sharpen(sharpness: 0.6)), .adjust(.vignette(intensity: 0.45, radius: 1.5)), .adjust(.grain(opacity: 0.15))]),
  FilterVector(id: "silver", expect: [.adjust(.colorControls(brightness: 0, contrast: 0.9, saturation: 0)), .adjust(.toneCurve(points: [AdjustPoint(0, 0.1125), AdjustPoint(0.25, 0.25), AdjustPoint(0.5, 0.5), AdjustPoint(0.75, 0.72), AdjustPoint(1, 1)])), .adjust(.grain(opacity: 0.0375))]),
  FilterVector(id: "indigo", expect: [.adjust(.colorControls(brightness: 0, contrast: 1.075, saturation: 0)), .splitTone(shadow: "#10214F", highlight: "#DCE9FF", amount: 0.8)]),
  FilterVector(id: "drama", expect: [.adjust(.colorControls(brightness: -0.0375, contrast: 1.25, saturation: 0.75)), .adjust(.toneCurve(points: [AdjustPoint(0, 0), AdjustPoint(0.25, 0.175), AdjustPoint(0.5, 0.5), AdjustPoint(0.75, 0.75), AdjustPoint(1, 1)])), .adjust(.sharpen(sharpness: 0.24)), .adjust(.vignette(intensity: 0.9, radius: 1.5))]),
]

final class FilterRecipeTests: XCTestCase {
  private let size = CGSize(width: 64, height: 36)
  private var rect: CGRect { CGRect(origin: .zero, size: size) }
  private let ctx = CIContext(options: [.workingColorSpace: NSNull()])
  private var grey: CIImage { CIImage(color: CIColor(red: 0.5, green: 0.5, blue: 0.5)).cropped(to: rect) }

  private func rgb(_ img: CIImage, _ x: CGFloat, _ y: CGFloat) -> (r: Double, g: Double, b: Double) {
    var px = [UInt8](repeating: 0, count: 4)
    ctx.render(img, toBitmap: &px, rowBytes: 4, bounds: CGRect(x: x, y: y, width: 1, height: 1), format: .RGBA8, colorSpace: nil)
    return (Double(px[0]) / 255, Double(px[1]) / 255, Double(px[2]) / 255)
  }

  /// A step as a name and its numbers / strings, so two steps can be compared with a tolerance.
  private func flat(_ step: FilterStep) -> (String, [Double], [String]) {
    switch step {
    case .splitTone(let shadow, let highlight, let amount): return ("splitTone", [amount], [shadow, highlight])
    case .adjust(let a):
      switch a {
      case .exposure(let ev): return ("exposure", [ev], [])
      case .temperatureTint(let n, let t): return ("temperatureTint", [n.x, n.y, t.x, t.y], [])
      case .colorControls(let b, let c, let s): return ("colorControls", [b, c, s], [])
      case .toneCurve(let points): return ("toneCurve", points.flatMap { (p: AdjustPoint) -> [Double] in [p.x, p.y] }, [])
      case .sharpen(let s): return ("sharpen", [s], [])
      case .vignette(let i, let r): return ("vignette", [i, r], [])
      case .grain(let o): return ("grain", [o], [])
      }
    }
  }

  func testStepsMatchTheVectors() {
    XCTAssertEqual(filterVectors.count, 12)
    XCTAssertEqual(filterVectors.map { (v: FilterVector) -> String in v.id }, FilterRecipes.ids)
    for v in filterVectors {
      let got = FilterRecipes.steps(v.id)
      XCTAssertEqual(got.count, v.expect.count, v.id)
      for (a, b) in zip(got, v.expect) {
        let x = flat(a), y = flat(b)
        XCTAssertEqual(x.0, y.0, v.id)
        XCTAssertEqual(x.2, y.2, v.id)
        XCTAssertEqual(x.1.count, y.1.count, v.id)
        for (m, n) in zip(x.1, y.1) { XCTAssertEqual(m, n, accuracy: 1e-9, "\(v.id) \(x.0)") }
      }
    }
  }

  /// The twelve ids are the last twelve filter ids; none of them has an old chain; an old filter has no recipe.
  func testEveryRecipeFilterIsAFilterIdWithoutAChain() {
    XCTAssertEqual(Effects.filterIds.count, 32)
    XCTAssertEqual(Array(Effects.filterIds.suffix(12)), FilterRecipes.ids)
    for id in FilterRecipes.ids {
      XCTAssertNotNil(FilterRecipes.recipes[id], id)
      XCTAssertTrue(Effects.filterChain(id).isEmpty, id)
    }
    for id in Effects.filterIds.prefix(20) { XCTAssertNil(FilterRecipes.apply(id, to: grey, time: 0), id) }
    XCTAssertNil(FilterRecipes.apply(nil, to: grey, time: 0))
    XCTAssertNil(FilterRecipes.apply("sparkle", to: grey, time: 0))
    XCTAssertTrue(FilterRecipes.steps("warm").isEmpty)
  }

  func testEveryRecipeKeepsTheFrameExtent() {
    for id in FilterRecipes.ids {
      XCTAssertEqual(FilterRecipes.apply(id, to: grey, time: 1.5)?.extent, rect, id)
    }
  }

  /// The three black-and-whites leave no colour on a strongly coloured frame (Indigo is toned afterwards: blue ≥ red).
  func testBlackAndWhiteRecipesDesaturate() {
    let orange = CIImage(color: CIColor(red: 0.9, green: 0.5, blue: 0.1)).cropped(to: rect)
    for id in ["grit", "silver"] {
      guard let out = FilterRecipes.apply(id, to: orange, time: 0) else { XCTFail(id); continue }
      let c = rgb(out, 32, 18)
      XCTAssertEqual(c.r, c.b, accuracy: 0.06, id)
    }
    if let out = FilterRecipes.apply("indigo", to: orange, time: 0) {
      let c = rgb(out, 32, 18)
      XCTAssertGreaterThanOrEqual(c.b, c.r - 0.02)
    } else { XCTFail("indigo") }
  }

  /// A split tone with nothing to do, or with a colour that is not #RRGGBB, hands the image back; a real one keeps the extent.
  func testSplitToneGuards() {
    let image = grey
    XCTAssertTrue(FilterRecipes.splitTone(image, tone: SplitTone(shadow: "#000000", highlight: "#FFFFFF", amount: 0)) === image)
    XCTAssertTrue(FilterRecipes.splitTone(image, tone: SplitTone(shadow: "teal", highlight: "#FFFFFF", amount: 0.5)) === image)
    XCTAssertTrue(FilterRecipes.splitTone(image, tone: SplitTone(shadow: "#000000", highlight: "#FFFFFF", amount: .nan)) === image)
    XCTAssertEqual(FilterRecipes.splitTone(image, tone: SplitTone(shadow: "#0E6E78", highlight: "#FF9A45", amount: 0.5)).extent, rect)
  }

  /// A recipe filter goes through `look` at its strength: 0 leaves the frame, and it never changes the extent.
  func testLookAppliesARecipeFilterAtItsStrength() {
    func spec(_ filter: String, _ strength: Double) -> LayerSpec {
      return LayerSpec(trackID: 1, fill: .identity, orient: .identity, crop: .full, transform: .identity, background: .black, filter: filter, filterIntensity: strength)
    }
    let image = grey
    XCTAssertTrue(ClipyCompositor.look(spec("moody", 0), on: image, time: 0) === image)
    XCTAssertEqual(ClipyCompositor.look(spec("moody", 1), on: image, time: 0).extent, rect)
    XCTAssertEqual(ClipyCompositor.look(spec("moody", 0.5), on: image, time: 0).extent, rect)
    // Moody darkens: brightness −0.03 and a cool white point on a mid-grey frame.
    XCTAssertLessThan(rgb(ClipyCompositor.look(spec("moody", 1), on: image, time: 0), 32, 18).r, 0.5)
  }

  /// Strength is the old filters' rule: `original·(1 − s) + filtered·s` — half strength is half way between the frame
  /// and the full recipe (Bleach on mid-grey: no vignette, and the grain is the same at the same time).
  func testHalfStrengthIsHalfWayBetweenTheFrameAndTheFullRecipe() {
    func spec(_ strength: Double) -> LayerSpec {
      return LayerSpec(trackID: 1, fill: .identity, orient: .identity, crop: .full, transform: .identity, background: .black, filter: "bleach", filterIntensity: strength)
    }
    let image = CIImage(color: CIColor(red: 0.8, green: 0.4, blue: 0.2)).cropped(to: rect)
    let from = rgb(image, 32, 18)
    let full = rgb(ClipyCompositor.look(spec(1), on: image, time: 0), 32, 18)
    let half = rgb(ClipyCompositor.look(spec(0.5), on: image, time: 0), 32, 18)
    XCTAssertEqual(half.r, (from.r + full.r) / 2, accuracy: 0.02)
    XCTAssertEqual(half.g, (from.g + full.g) / 2, accuracy: 0.02)
    XCTAssertEqual(half.b, (from.b + full.b) / 2, accuracy: 0.02)
  }
}
