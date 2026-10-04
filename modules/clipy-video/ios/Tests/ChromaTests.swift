import CoreGraphics
import CoreImage
import XCTest
@testable import ClipyVideo

/// The vectors of src/editor/model/__tests__/chroma.vectors.ts. The tables below are checked against the TS vectors
/// by src/editor/model/__tests__/chroma.parity.test.ts — keep the literals identical.
struct ChromaHsvVector {
  let name: String
  let r: Double
  let g: Double
  let b: Double
  let h: Double
  let s: Double
  let v: Double
}

struct ChromaHexVector {
  let name: String
  let hex: String
  let rgb: [Double]?
}

struct ChromaHueVector {
  let a: Double
  let b: Double
  let d: Double
}

struct ChromaAlphaVector {
  let name: String
  let r: Double
  let g: Double
  let b: Double
  let key: String
  let strength: Double
  let alpha: Double
}

let chromaHsvVectors: [ChromaHsvVector] = [
  ChromaHsvVector(name: "red", r: 1, g: 0, b: 0, h: 0, s: 1, v: 1),
  ChromaHsvVector(name: "yellow", r: 1, g: 1, b: 0, h: 60, s: 1, v: 1),
  ChromaHsvVector(name: "green", r: 0, g: 1, b: 0, h: 120, s: 1, v: 1),
  ChromaHsvVector(name: "cyan", r: 0, g: 1, b: 1, h: 180, s: 1, v: 1),
  ChromaHsvVector(name: "blue", r: 0, g: 0, b: 1, h: 240, s: 1, v: 1),
  ChromaHsvVector(name: "magenta", r: 1, g: 0, b: 1, h: 300, s: 1, v: 1),
  ChromaHsvVector(name: "black", r: 0, g: 0, b: 0, h: 0, s: 0, v: 0),
  ChromaHsvVector(name: "white", r: 1, g: 1, b: 1, h: 0, s: 0, v: 1),
  ChromaHsvVector(name: "mid grey", r: 0.5, g: 0.5, b: 0.5, h: 0, s: 0, v: 0.5),
  ChromaHsvVector(name: "skin tone", r: 0.9, g: 0.7, b: 0.6, h: 20, s: 0.3333333333333333, v: 0.9),
  ChromaHsvVector(name: "yellow-green", r: 0.5, g: 1, b: 0, h: 90, s: 1, v: 1),
  ChromaHsvVector(name: "red towards magenta (wraps)", r: 1, g: 0, b: 0.25, h: 345, s: 1, v: 1),
  ChromaHsvVector(name: "half-dark green", r: 0, g: 0.5, b: 0, h: 120, s: 1, v: 0.5),
  ChromaHsvVector(name: "out of range -> red", r: 2, g: -1, b: 0, h: 0, s: 1, v: 1),
  ChromaHsvVector(name: "NaN / Infinity -> 0 (green)", r: .nan, g: 1, b: .infinity, h: 120, s: 1, v: 1),
]

let chromaHexVectors: [ChromaHexVector] = [
  ChromaHexVector(name: "green", hex: "#00FF00", rgb: [0, 1, 0]),
  ChromaHexVector(name: "blue", hex: "#0000FF", rgb: [0, 0, 1]),
  ChromaHexVector(name: "lower case", hex: "#ff8000", rgb: [1, 0.5019607843137255, 0]),
  ChromaHexVector(name: "mid grey", hex: "#808080", rgb: [0.5019607843137255, 0.5019607843137255, 0.5019607843137255]),
  ChromaHexVector(name: "short form", hex: "#0F0", rgb: nil),
  ChromaHexVector(name: "no hash", hex: "00FF00", rgb: nil),
  ChromaHexVector(name: "not hex digits", hex: "#GGGGGG", rgb: nil),
  ChromaHexVector(name: "with alpha", hex: "#00FF00FF", rgb: nil),
  ChromaHexVector(name: "empty", hex: "", rgb: nil),
]

let chromaHueVectors: [ChromaHueVector] = [
  ChromaHueVector(a: 350, b: 10, d: 20),
  ChromaHueVector(a: 10, b: 350, d: 20),
  ChromaHueVector(a: 120, b: 120, d: 0),
  ChromaHueVector(a: 0, b: 180, d: 180),
  ChromaHueVector(a: 90, b: 120, d: 30),
  ChromaHueVector(a: 240, b: 120, d: 120),
  ChromaHueVector(a: 345, b: 0, d: 15),
]

let chromaAlphaVectors: [ChromaAlphaVector] = [
  ChromaAlphaVector(name: "pure green, green key, strength 0", r: 0, g: 1, b: 0, key: "#00FF00", strength: 0, alpha: 0),
  ChromaAlphaVector(name: "pure green, green key, strength 0.5", r: 0, g: 1, b: 0, key: "#00FF00", strength: 0.5, alpha: 0),
  ChromaAlphaVector(name: "pure green, green key, strength 1", r: 0, g: 1, b: 0, key: "#00FF00", strength: 1, alpha: 0),
  ChromaAlphaVector(name: "pure green, lower-case key", r: 0, g: 1, b: 0, key: "#00ff00", strength: 0.5, alpha: 0),
  ChromaAlphaVector(name: "half-dark green", r: 0, g: 0.5, b: 0, key: "#00FF00", strength: 0, alpha: 0),
  ChromaAlphaVector(name: "yellow-green hue 90, strength 0", r: 0.5, g: 1, b: 0, key: "#00FF00", strength: 0, alpha: 1),
  ChromaAlphaVector(name: "yellow-green hue 90, strength 0.25 (ramp)", r: 0.5, g: 1, b: 0, key: "#00FF00", strength: 0.25, alpha: 0.6),
  ChromaAlphaVector(name: "yellow-green hue 90, strength 0.5", r: 0.5, g: 1, b: 0, key: "#00FF00", strength: 0.5, alpha: 0),
  ChromaAlphaVector(name: "yellow-green hue 75, strength 0.5 (ramp)", r: 0.75, g: 1, b: 0, key: "#00FF00", strength: 0.5, alpha: 0.9),
  ChromaAlphaVector(name: "yellow-green hue 75, strength 1", r: 0.75, g: 1, b: 0, key: "#00FF00", strength: 1, alpha: 0),
  ChromaAlphaVector(name: "skin tone, strength 1", r: 0.9, g: 0.7, b: 0.6, key: "#00FF00", strength: 1, alpha: 1),
  ChromaAlphaVector(name: "mid grey", r: 0.5, g: 0.5, b: 0.5, key: "#00FF00", strength: 1, alpha: 1),
  ChromaAlphaVector(name: "white", r: 1, g: 1, b: 1, key: "#00FF00", strength: 1, alpha: 1),
  ChromaAlphaVector(name: "black", r: 0, g: 0, b: 0, key: "#00FF00", strength: 1, alpha: 1),
  ChromaAlphaVector(name: "near-black green", r: 0, g: 0.1, b: 0, key: "#00FF00", strength: 1, alpha: 1),
  ChromaAlphaVector(name: "pale green", r: 0.8, g: 1, b: 0.8, key: "#00FF00", strength: 1, alpha: 1),
  ChromaAlphaVector(name: "pure blue, blue key", r: 0, g: 0, b: 1, key: "#0000FF", strength: 0.5, alpha: 0),
  ChromaAlphaVector(name: "pure green, blue key", r: 0, g: 1, b: 0, key: "#0000FF", strength: 1, alpha: 1),
  ChromaAlphaVector(name: "pure blue, green key", r: 0, g: 0, b: 1, key: "#00FF00", strength: 1, alpha: 1),
  ChromaAlphaVector(name: "wrap-around, strength 0 (ramp)", r: 1, g: 0, b: 0.25, key: "#FF0000", strength: 0, alpha: 0.3),
  ChromaAlphaVector(name: "strength above 1 = 1", r: 0.75, g: 1, b: 0, key: "#00FF00", strength: 5, alpha: 0),
  ChromaAlphaVector(name: "strength below 0 = 0", r: 0.5, g: 1, b: 0, key: "#00FF00", strength: -3, alpha: 1),
  ChromaAlphaVector(name: "grey key, pure green", r: 0, g: 1, b: 0, key: "#808080", strength: 1, alpha: 1),
  ChromaAlphaVector(name: "grey key, the same grey", r: 0.5019607843137255, g: 0.5019607843137255, b: 0.5019607843137255, key: "#808080", strength: 1, alpha: 1),
  ChromaAlphaVector(name: "white key, pure red", r: 1, g: 0, b: 0, key: "#FFFFFF", strength: 1, alpha: 1),
  ChromaAlphaVector(name: "black key, pure red", r: 1, g: 0, b: 0, key: "#000000", strength: 1, alpha: 1),
  ChromaAlphaVector(name: "invalid key", r: 0, g: 1, b: 0, key: "green", strength: 1, alpha: 1),
  ChromaAlphaVector(name: "short key", r: 0, g: 1, b: 0, key: "#0F0", strength: 1, alpha: 1),
]

/// Green screen (the mirrored maths, the colour cube, the filter), layer blend modes and the blur / mosaic boxes.
final class ChromaTests: XCTestCase {
  private let size = CGSize(width: 64, height: 36)
  private var rect: CGRect { CGRect(origin: .zero, size: size) }
  /// Colour management OFF, so the bytes read back are the values the filters computed.
  private let ctx = CIContext(options: [.workingColorSpace: NSNull(), .outputColorSpace: NSNull()])
  private func solid(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) -> CIImage {
    return CIImage(color: CIColor(red: r, green: g, blue: b)).cropped(to: rect)
  }
  private var red: CIImage { solid(1, 0, 0) }
  private var green: CIImage { solid(0, 1, 0) }
  private var white: CIImage { solid(1, 1, 1) }
  private var black: CIImage { solid(0, 0, 0) }
  private let half = ClipTransform(scale: 0.5, x: 0, y: 0, rotation: 0, flipH: false, flipV: false)

  /// (red, green, blue, alpha) of the pixel whose bottom-left corner is (x, y) in Core Image space (y-up), each
  /// 0…1; the colours are premultiplied by the alpha (as `.RGBA8` is).
  private func rgba(_ img: CIImage, _ x: CGFloat, _ y: CGFloat) -> (r: Double, g: Double, b: Double, a: Double) {
    var px = [UInt8](repeating: 0, count: 4)
    ctx.render(img, toBitmap: &px, rowBytes: 4, bounds: CGRect(x: x, y: y, width: 1, height: 1), format: .RGBA8, colorSpace: nil)
    return (Double(px[0]) / 255, Double(px[1]) / 255, Double(px[2]) / 255, Double(px[3]) / 255)
  }

  private func layer(blend: String = "normal", chroma: ChromaKey? = nil, opacity: Double = 1) -> LayerSpec {
    return LayerSpec(trackID: 7, fill: .identity, orient: .identity, crop: .full, transform: half, background: .black,
                     filter: nil, opacity: opacity, transparent: true, blend: blend, chroma: chroma)
  }

  private func clip(chroma: ChromaKey?) -> LayerSpec {
    return LayerSpec(trackID: 1, fill: .identity, orient: .identity, crop: .full, transform: .identity,
                     background: LayerBackground(type: "color", color: "#0000FF"), filter: nil, chroma: chroma)
  }

  // MARK: - The mirrored maths

  func testConstants() {
    XCTAssertEqual(Chroma.hueBase, 12); XCTAssertEqual(Chroma.hueRange, 48); XCTAssertEqual(Chroma.soft, 10)
    XCTAssertEqual(Chroma.minSat, 0.25); XCTAssertEqual(Chroma.minVal, 0.2)
    XCTAssertEqual(Chroma.defaultStrength, 0.5); XCTAssertEqual(Chroma.cube, 32)
  }

  func testRgbToHsvMatchesTheVectors() {
    XCTAssertEqual(chromaHsvVectors.count, 15)
    for v in chromaHsvVectors {
      let got = Chroma.rgbToHsv(v.r, v.g, v.b)
      XCTAssertEqual(got.h, v.h, accuracy: 1e-9, v.name)
      XCTAssertEqual(got.s, v.s, accuracy: 1e-9, v.name)
      XCTAssertEqual(got.v, v.v, accuracy: 1e-9, v.name)
    }
  }

  func testHexToRgbMatchesTheVectors() {
    XCTAssertEqual(chromaHexVectors.count, 9)
    for v in chromaHexVectors {
      let got = Chroma.hexToRgb(v.hex)
      guard let want = v.rgb else { XCTAssertTrue(got == nil, v.name); continue }
      guard let got else { XCTFail(v.name); continue }
      XCTAssertEqual(got.r, want[0], accuracy: 1e-12, v.name)
      XCTAssertEqual(got.g, want[1], accuracy: 1e-12, v.name)
      XCTAssertEqual(got.b, want[2], accuracy: 1e-12, v.name)
    }
    // ASCII hex digits only, and nothing around them.
    XCTAssertTrue(Chroma.hexToRgb(" #00FF00") == nil)
    XCTAssertTrue(Chroma.hexToRgb("#00FF00\n") == nil)
    XCTAssertTrue(Chroma.hexToRgb("#００FF00") == nil)
  }

  func testHueDistanceMatchesTheVectors() {
    XCTAssertEqual(chromaHueVectors.count, 7)
    for v in chromaHueVectors {
      XCTAssertEqual(Chroma.hueDistance(v.a, v.b), v.d, accuracy: 1e-9, "\(v.a) / \(v.b)")
    }
  }

  func testAlphaMatchesTheVectors() {
    XCTAssertEqual(chromaAlphaVectors.count, 28)
    for v in chromaAlphaVectors {
      XCTAssertEqual(Chroma.alpha(r: v.r, g: v.g, b: v.b, hex: v.key, strength: v.strength), v.alpha, accuracy: 1e-9, v.name)
    }
    XCTAssertEqual(Chroma.alpha(r: 0, g: 1, b: 0, hex: "#00FF00", strength: .nan), 0)   // a non-finite strength is 0: tol 12
    XCTAssertEqual(Chroma.alpha(r: 0.5, g: 1, b: 0, hex: "#00FF00", strength: .nan), 1)
  }

  func testOnlyAColourKeyIsUsable() {
    XCTAssertTrue(Chroma.usableKey("#00FF00") != nil)
    XCTAssertTrue(Chroma.usableKey("#0000ff") != nil)
    XCTAssertTrue(Chroma.usableKey("#808080") == nil)
    XCTAssertTrue(Chroma.usableKey("#FFFFFF") == nil)
    XCTAssertTrue(Chroma.usableKey("green") == nil)
  }

  // MARK: - The colour cube

  /// 32 × 32 × 32 entries of four Float32, premultiplied, RED varying fastest, then green, then blue.
  func testCubeDataSizeOrderAndEntries() throws {
    let data = try XCTUnwrap(Chroma.cubeData(key: "#00FF00", strength: 0.5))
    let n = Chroma.cube
    XCTAssertEqual(data.count, n * n * n * 4 * MemoryLayout<Float>.size)
    XCTAssertEqual(data.count, 524288)
    var values = [Float](repeating: 0, count: n * n * n * 4)
    let copied = values.withUnsafeMutableBytes { data.copyBytes(to: $0) }
    XCTAssertEqual(copied, data.count)
    func entry(_ r: Int, _ g: Int, _ b: Int) -> [Float] {
      let i = (r + g * n + b * n * n) * 4
      return Array(values[i..<(i + 4)])
    }
    XCTAssertEqual(entry(0, n - 1, 0), [0, 0, 0, 0])               // the key colour itself: alpha 0, premultiplied
    XCTAssertEqual(entry(0, 0, 0), [0, 0, 0, 1])                   // black is kept
    XCTAssertEqual(entry(n - 1, 0, 0), [1, 0, 0, 1])               // red is entry 31: red varies fastest
    XCTAssertEqual(entry(0, 0, n - 1), [0, 0, 1, 1])               // blue is in the last plane
    XCTAssertEqual(entry(n - 1, n - 1, n - 1), [1, 1, 1, 1])       // white is the last entry
    XCTAssertEqual(Array(values[124..<128]), [1, 0, 0, 1])         // 31 × 4: the same red entry by its raw offset
  }

  func testCubeDataIsCachedPerKeyAndRoundedStrength() {
    let a = Chroma.cubeData(key: "#00FF00", strength: 0.5)
    XCTAssertNotNil(a)
    XCTAssertEqual(Chroma.cubeData(key: "#00ff00", strength: 0.5), a)       // the key's case does not matter
    XCTAssertEqual(Chroma.cubeData(key: "#00FF00", strength: 0.501), a)     // the strength is rounded to hundredths
    XCTAssertNotEqual(Chroma.cubeData(key: "#00FF00", strength: 0), a)
    XCTAssertNotEqual(Chroma.cubeData(key: "#0000FF", strength: 0.5), a)
    XCTAssertNil(Chroma.cubeData(key: "green", strength: 0.5))
    XCTAssertNil(Chroma.cubeData(key: "#0F0", strength: 0.5))
    XCTAssertEqual(Chroma.cubeStrength(0.254), 0.25, accuracy: 1e-12)
    XCTAssertEqual(Chroma.cubeStrength(7), 1)
    XCTAssertEqual(Chroma.cubeStrength(-1), 0)
    XCTAssertEqual(Chroma.cubeStrength(.nan), 0)
    // Filling the cache past its limit still gives the right cube.
    for i in 0..<12 { XCTAssertNotNil(Chroma.cubeData(key: "#00FF00", strength: Double(i) / 100)) }
    XCTAssertEqual(Chroma.cubeData(key: "#00FF00", strength: 0.5), a)
  }

  // MARK: - The filter

  func testApplyRemovesTheKeyColourAndKeepsTheRest() {
    let keyed = Chroma.apply(to: green, key: "#00FF00", strength: 0.5)
    XCTAssertEqual(keyed.extent, rect)
    XCTAssertEqual(rgba(keyed, 32, 18).a, 0, accuracy: 0.03)
    XCTAssertEqual(rgba(keyed, 32, 18).g, 0, accuracy: 0.03)
    let kept = Chroma.apply(to: red, key: "#00FF00", strength: 1)
    XCTAssertEqual(rgba(kept, 32, 18).a, 1, accuracy: 0.03)
    XCTAssertEqual(rgba(kept, 32, 18).r, 1, accuracy: 0.03)
    let grey = Chroma.apply(to: solid(0.5, 0.5, 0.5), key: "#00FF00", strength: 1)
    XCTAssertEqual(rgba(grey, 32, 18).a, 1, accuracy: 0.03)
    XCTAssertEqual(rgba(grey, 32, 18).g, 0.5, accuracy: 0.03)
  }

  func testApplyWithoutAUsableKeyReturnsTheImageItself() {
    let image = green
    XCTAssertTrue(Chroma.apply(to: image, key: "green", strength: 1) === image)
    XCTAssertTrue(Chroma.apply(to: image, key: "#808080", strength: 1) === image)
    let endless = CIImage(color: CIColor(red: 0, green: 1, blue: 0))
    XCTAssertTrue(Chroma.apply(to: endless, key: "#00FF00", strength: 1) === endless)
  }

  // MARK: - The compositor: green screen

  func testTheSpecKeepsOnlyAUsableKeyAndAKnownBlend() {
    XCTAssertNil(clip(chroma: nil).chroma)
    XCTAssertTrue(clip(chroma: nil).usesFill)
    XCTAssertEqual(clip(chroma: ChromaKey(color: "#00FF00", strength: 0.5)).chroma, ChromaKey(color: "#00FF00", strength: 0.5))
    XCTAssertFalse(clip(chroma: ChromaKey(color: "#00FF00", strength: 0.5)).usesFill, "a keyed clip shows its background")
    XCTAssertNil(clip(chroma: ChromaKey(color: "#808080", strength: 0.5)).chroma)
    XCTAssertTrue(clip(chroma: ChromaKey(color: "nope", strength: 0.5)).usesFill, "a key that cannot key is no key")
    XCTAssertEqual(clip(chroma: nil).blend, "normal")
    XCTAssertEqual(layer(blend: "multiply").blend, "multiply")
    XCTAssertEqual(layer(blend: "sparkle").blend, "normal")
  }

  /// A keyed layer shows the frame beneath it where its picture had the key colour.
  func testAKeyedLayerShowsTheFrameBeneathIt() {
    let key = ChromaKey(color: "#00FF00", strength: 0.5)
    let img = ClipyCompositor.overlayFrame(layer(chroma: key), source: green, over: red, time: 0, size: size)
    XCTAssertEqual(img.extent, rect)
    XCTAssertEqual(rgba(img, 32, 18).r, 1, accuracy: 0.03)
    XCTAssertEqual(rgba(img, 32, 18).g, 0, accuracy: 0.03)
    let other = ClipyCompositor.overlayFrame(layer(chroma: key), source: white, over: red, time: 0, size: size)
    XCTAssertEqual(rgba(other, 32, 18).g, 1, accuracy: 0.03)       // white is not keyed
    XCTAssertEqual(rgba(other, 2, 2).g, 0, accuracy: 0.03)
  }

  /// A keyed main clip shows its own background, even though its picture covers the frame.
  func testAKeyedMainClipShowsItsBackground() {
    let spec = clip(chroma: ChromaKey(color: "#00FF00", strength: 0.5))
    let img = ClipyCompositor.placedFrame(spec, transform: .identity, opacity: 1, source: green, size: size)
    XCTAssertEqual(rgba(img, 32, 18).b, 1, accuracy: 0.03)
    XCTAssertEqual(rgba(img, 32, 18).g, 0, accuracy: 0.03)
    XCTAssertEqual(rgba(img, 32, 18).a, 1, accuracy: 0.03)
  }

  // MARK: - The compositor: blend modes

  /// White multiplied onto red is red; white screened / lightened onto red is white; black darkened onto red is
  /// black; overlay cannot move red's channels (they are 0 or 1). Whatever the mode, the frame outside the half-size picture stays red.
  func testBlendModesMixTheLayerWithTheFrameBeneath() {
    let cases: [(mode: String, source: CIImage, r: Double, g: Double)] = [
      ("multiply", white, 1, 0), ("darken", white, 1, 0), ("screen", white, 1, 1), ("lighten", white, 1, 1),
      ("multiply", black, 0, 0), ("darken", black, 0, 0), ("screen", black, 1, 0), ("lighten", black, 1, 0),
      ("overlay", white, 1, 0), ("overlay", black, 1, 0),   // overlay leaves a base channel at 0 or 1 as it is
    ]
    for c in cases {
      let img = ClipyCompositor.overlayFrame(layer(blend: c.mode), source: c.source, over: red, time: 0, size: size)
      XCTAssertEqual(img.extent, rect, c.mode)
      XCTAssertEqual(rgba(img, 32, 18).r, c.r, accuracy: 0.05, c.mode)
      XCTAssertEqual(rgba(img, 32, 18).g, c.g, accuracy: 0.05, c.mode)
      XCTAssertEqual(rgba(img, 2, 2).r, 1, accuracy: 0.03, "\(c.mode): outside the picture")
      XCTAssertEqual(rgba(img, 2, 2).g, 0, accuracy: 0.03, "\(c.mode): outside the picture")
      XCTAssertEqual(rgba(img, 2, 2).a, 1, accuracy: 0.03, "\(c.mode): outside the picture")
    }
  }

  /// The opacity mixes between the frame beneath and the blended result: black multiplied onto red is black, at
  /// half opacity half-way back to red.
  func testABlendedLayerFadesTowardsTheFrameBeneath() {
    let img = ClipyCompositor.overlayFrame(layer(blend: "multiply", opacity: 0.5), source: black, over: red, time: 0, size: size)
    XCTAssertEqual(rgba(img, 32, 18).r, 0.5, accuracy: 0.05)
    XCTAssertEqual(rgba(img, 2, 2).r, 1, accuracy: 0.03)
  }

  func testAnUnknownBlendModeIsNotBlended() {
    XCTAssertNil(ClipyCompositor.blended(white, over: red, mode: "normal", rect: rect))
    XCTAssertNil(ClipyCompositor.blended(white, over: red, mode: "sparkle", rect: rect))
    XCTAssertEqual(ClipyCompositor.blended(white, over: red, mode: "screen", rect: rect)?.extent, rect)
  }

  // MARK: - Blur / mosaic boxes

  /// Top-left fractions → Core Image's bottom-left pixels: y = (1 − y − h) × height.
  func testRegionRectConversion() {
    XCTAssertEqual(EffectRenderer.regionRect(RegionRect(x: 0.25, y: 0.5, w: 0.5, h: 0.25), in: size), CGRect(x: 16, y: 9, width: 32, height: 9))
    XCTAssertEqual(EffectRenderer.regionRect(RegionRect(x: 0, y: 0, w: 0.5, h: 0.5), in: size), CGRect(x: 0, y: 18, width: 32, height: 18))
    XCTAssertEqual(EffectRenderer.regionRect(RegionRect(x: 0, y: 0, w: 1, h: 1), in: size), rect)
    // The part outside the frame is cut off.
    XCTAssertEqual(EffectRenderer.regionRect(RegionRect(x: 0.75, y: 0.75, w: 0.5, h: 0.5), in: size), CGRect(x: 48, y: 0, width: 16, height: 9))
    for bad in [RegionRect(x: .nan, y: 0, w: 0.5, h: 0.5), RegionRect(x: 0, y: 0, w: 0, h: 0.5), RegionRect(x: 0, y: 0, w: 0.5, h: -0.5),
                RegionRect(x: 0, y: 0, w: .infinity, h: 0.5), RegionRect(x: 2, y: 0, w: 0.5, h: 0.5)] {
      XCTAssertNil(EffectRenderer.regionRect(bad, in: size), "\(bad)")
    }
    XCTAssertNil(EffectRenderer.regionRect(RegionRect(x: 0, y: 0, w: 1, h: 1), in: .zero))
  }

  /// A frame whose left `edge` pixels are white and the rest black.
  private func split(at edge: CGFloat) -> CIImage {
    let left = CIImage(color: CIColor(red: 1, green: 1, blue: 1)).cropped(to: CGRect(x: 0, y: 0, width: edge, height: size.height))
    return left.composited(over: black).cropped(to: rect)
  }

  func testABoxWithoutARectangleChangesNothing() {
    let image = split(at: 32)
    for id in ["blurBox", "mosaicBox"] {
      XCTAssertTrue(EffectRenderer.apply(type: id, image: image, t: 1, d: 2, k: 1, size: size) === image, id)
      XCTAssertTrue(EffectRenderer.apply(type: id, image: image, t: 1, d: 2, k: 1, size: size, region: RegionRect(x: 0, y: 0, w: 0, h: 0)) === image, id)
      XCTAssertTrue(EffectRenderer.apply(type: id, image: image, t: 1, d: 2, k: 0, size: size, region: RegionRect(x: 0, y: 0, w: 1, h: 1)) === image, id)
    }
    // A rectangle on any other effect is ignored.
    let flash = EffectRenderer.apply(type: "flash", image: image, t: 0, d: 2, k: 1, size: size, region: RegionRect(x: 0, y: 0, w: 0.1, h: 0.1))
    XCTAssertEqual(rgba(flash, 60, 30).r, 1, accuracy: 0.03)
  }

  /// The box is x 16…48, y 9…27 (Core Image). Radius 0.06 × 36 = 2.16 px: the white / black edge at x = 32 is
  /// smeared inside the box and untouched above, below and beside it. No fade: the same at the effect's first frame.
  func testTheBlurBoxBlursOnlyInsideItsRectangle() {
    let image = split(at: 32)
    let box = RegionRect(x: 0.25, y: 0.25, w: 0.5, h: 0.5)
    for t in [0, 1.0] {
      let out = EffectRenderer.apply(type: "blurBox", image: image, t: t, d: 2, k: 1, size: size, region: box)
      XCTAssertEqual(out.extent, rect)
      let inside = rgba(out, 32, 18).r                             // black before, next to the edge
      XCTAssertGreaterThan(inside, 0.1, "t \(t)")
      XCTAssertLessThan(inside, 0.9, "t \(t)")
      XCTAssertEqual(rgba(out, 32, 4).r, 0, accuracy: 0.03)        // below the box: the edge is still hard
      XCTAssertEqual(rgba(out, 31, 4).r, 1, accuracy: 0.03)
      XCTAssertEqual(rgba(out, 32, 30).r, 0, accuracy: 0.03)       // above the box
      XCTAssertEqual(rgba(out, 8, 18).r, 1, accuracy: 0.03)        // beside it
      XCTAssertEqual(rgba(out, 56, 18).r, 0, accuracy: 0.03)
      XCTAssertEqual(rgba(out, 17, 18).r, 1, accuracy: 0.03)       // inside, far from the edge: nothing to smear
    }
  }

  /// Blocks of max(4, 0.08 × 36 = 2.88) = 4 px, the grid starting at the box's left edge (x = 16): 28…32 is one
  /// block, so the white / black edge at x = 30 inside it disappears; outside the box it stays.
  func testTheMosaicBoxPixelatesOnlyInsideItsRectangle() {
    let image = split(at: 30)
    let box = RegionRect(x: 0.25, y: 0.25, w: 0.5, h: 0.5)
    let out = EffectRenderer.apply(type: "mosaicBox", image: image, t: 1, d: 2, k: 1, size: size, region: box)
    XCTAssertEqual(out.extent, rect)
    XCTAssertEqual(rgba(out, 28, 18).r, rgba(out, 31, 18).r, accuracy: 0.03)   // one block, one colour
    XCTAssertEqual(rgba(out, 20, 18).r, 1, accuracy: 0.03)
    XCTAssertEqual(rgba(out, 40, 18).r, 0, accuracy: 0.03)
    XCTAssertEqual(rgba(out, 29, 4).r, 1, accuracy: 0.03)                      // below the box: untouched
    XCTAssertEqual(rgba(out, 30, 4).r, 0, accuracy: 0.03)
    XCTAssertEqual(rgba(out, 29, 30).r, 1, accuracy: 0.03)                     // above the box
    XCTAssertEqual(rgba(out, 30, 30).r, 0, accuracy: 0.03)
  }

  func testTheRequestRecordsDefaultToNoBlendNoKeyNoRectangle() {
    XCTAssertEqual(ExportClip().blend, "normal"); XCTAssertNil(ExportClip().chroma)
    XCTAssertEqual(ExportLayer().blend, "normal"); XCTAssertNil(ExportLayer().chroma)
    XCTAssertNil(ExportEffect().rect)
    XCTAssertNil(ExportSession.chromaKey(nil)); XCTAssertNil(ExportSession.effectRegion(nil))
    var chroma = ExportChroma(); chroma.color = "#00FF00"; chroma.strength = 0.7
    XCTAssertEqual(ExportSession.chromaKey(chroma), ChromaKey(color: "#00FF00", strength: 0.7))
    var box = ExportEffectRect(); box.x = 0.1; box.y = 0.2; box.w = 0.3; box.h = 0.4
    XCTAssertEqual(ExportSession.effectRegion(box), RegionRect(x: 0.1, y: 0.2, w: 0.3, h: 0.4))
    // The pre-pass keeps both on a prepared layer / clip.
    var l = ExportLayer(); l.sourceUri = "file:///l.mov"; l.blend = "screen"; l.chroma = chroma
    let c = l.clip
    XCTAssertEqual(c.blend, "screen"); XCTAssertEqual(c.chroma?.color, "#00FF00"); XCTAssertEqual(c.chroma?.strength, 0.7)
    let r = MediaPrePass.rewrite(c, preparedURL: URL(fileURLWithPath: "/tmp/l.mp4"), duration: 3)
    XCTAssertEqual(r.blend, "screen"); XCTAssertEqual(r.chroma?.color, "#00FF00"); XCTAssertEqual(r.chroma?.strength, 0.7)
    // The effect spec keeps its rectangle through `usable`.
    let region = RegionRect(x: 0.1, y: 0.2, w: 0.3, h: 0.4)
    let usable = ActiveEffectSpec.usable([ActiveEffectSpec(type: "blurBox", start: 0, end: 2, intensity: 3, rect: region)])
    XCTAssertEqual(usable, [ActiveEffectSpec(type: "blurBox", start: 0, end: 2, intensity: 1, rect: region)])
  }
}
