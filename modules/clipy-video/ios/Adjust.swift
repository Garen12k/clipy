import CoreGraphics
import CoreImage
import Foundation

/// A clip's twelve Adjust slider values (two-sided keys −1…1, one-sided 0…1; 0 = no change) — `ClipAdjust` in
/// src/editor/model/types.ts, in `ADJUST_KEYS` order.
struct AdjustValues: Equatable {
  var brightness: Double
  var contrast: Double
  var saturation: Double
  var exposure: Double
  var temperature: Double
  var tint: Double
  var highlights: Double
  var shadows: Double
  var sharpen: Double
  var vignette: Double
  var fade: Double
  var grain: Double

  static let neutral = AdjustValues(brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, tint: 0,
                                    highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0, grain: 0)

  private var all: [Double] {
    [brightness, contrast, saturation, exposure, temperature, tint, highlights, shadows, sharpen, vignette, fade, grain]
  }

  /// Every key is 0 (`isNeutralAdjust`): the whole chain is skipped and the frame is drawn exactly as before.
  var isNeutral: Bool { all.allSatisfy { $0 == 0 } }

  /// Non-finite values count as 0 (no change).
  var sanitized: AdjustValues {
    func f(_ v: Double) -> Double { v.isFinite ? v : 0 }
    return AdjustValues(brightness: f(brightness), contrast: f(contrast), saturation: f(saturation), exposure: f(exposure),
                        temperature: f(temperature), tint: f(tint), highlights: f(highlights), shadows: f(shadows),
                        sharpen: f(sharpen), vignette: f(vignette), fade: f(fade), grain: f(grain))
  }
}

/// An (x, y) pair of an `AdjustStep` (a white point or a tone-curve point).
struct AdjustPoint: Equatable {
  let x: Double
  let y: Double
  init(_ x: Double, _ y: Double) { self.x = x; self.y = y }
}

/// Mirror of the `AdjustStep` union in src/editor/model/adjust.ts.
enum AdjustStep: Equatable {
  case exposure(ev: Double)
  case temperatureTint(neutral: AdjustPoint, target: AdjustPoint)
  case colorControls(brightness: Double, contrast: Double, saturation: Double)
  case toneCurve(points: [AdjustPoint])
  case sharpen(sharpness: Double)
  case vignette(intensity: Double, radius: Double)
  case grain(opacity: Double)
}

/// Mirror of src/editor/model/adjust.ts — the constants (`ADJUST`) and the recipe (`adjustRecipe`) must stay
/// identical (checked by src/editor/model/__tests__/adjust.parity.test.ts).
enum Adjust {
  static let brightness: Double = 0.25
  static let contrast: Double = 0.5
  static let saturation: Double = 1
  static let exposureEV: Double = 1.5
  static let neutral: Double = 6500
  static let temperature: Double = 2500
  static let tint: Double = 100
  static let curve: Double = 0.15
  static let fadeLift: Double = 0.25
  static let sharpen: Double = 1.2
  static let vignetteIntensity: Double = 1.5
  static let vignetteRadius: Double = 1.5
  static let grainOpacity: Double = 0.25

  private static func clamp01(_ n: Double) -> Double { min(1, max(0, n)) }

  /// Filter strength as the compositor uses it: 0…1, a non-finite value counts as 1 (the filter in full).
  static func strength(_ v: Double) -> Double { v.isFinite ? min(1, max(0, v)) : 1 }

  /// Export recipe in order; neutral steps are omitted; a neutral adjust gives [].
  static func steps(_ a: AdjustValues) -> [AdjustStep] {
    var steps: [AdjustStep] = []
    if a.exposure != 0 { steps.append(.exposure(ev: Adjust.exposureEV * a.exposure)) }
    if a.temperature != 0 || a.tint != 0 {
      steps.append(.temperatureTint(
        neutral: AdjustPoint(Adjust.neutral, 0),
        target: AdjustPoint(Adjust.neutral - Adjust.temperature * a.temperature, Adjust.tint * a.tint)))
    }
    if a.brightness != 0 || a.contrast != 0 || a.saturation != 0 {
      steps.append(.colorControls(
        brightness: Adjust.brightness * a.brightness,
        contrast: 1 + Adjust.contrast * a.contrast,
        saturation: Adjust.saturation * a.saturation + 1))
    }
    if a.highlights != 0 || a.shadows != 0 || a.fade != 0 {
      steps.append(.toneCurve(points: [
        AdjustPoint(0, clamp01(Adjust.fadeLift * a.fade)),
        AdjustPoint(0.25, clamp01(0.25 + Adjust.curve * a.shadows)),
        AdjustPoint(0.5, 0.5),
        AdjustPoint(0.75, clamp01(0.75 + Adjust.curve * a.highlights)),
        AdjustPoint(1, 1),
      ]))
    }
    if a.sharpen > 0 { steps.append(.sharpen(sharpness: Adjust.sharpen * a.sharpen)) }
    if a.vignette > 0 { steps.append(.vignette(intensity: Adjust.vignetteIntensity * a.vignette, radius: Adjust.vignetteRadius)) }
    if a.grain > 0 { steps.append(.grain(opacity: Adjust.grainOpacity * a.grain)) }
    return steps
  }

  /// Runs the recipe on a frame with Core Image. Every step's result is cropped to the input's extent; a step whose
  /// filter (or one of its keys) Core Image does not know is skipped, so the worst case is "no change". `time` is the
  /// frame's composition time in seconds (the grain moves with it).
  static func apply(_ a: AdjustValues, to image: CIImage, time: Double) -> CIImage {
    let steps = Adjust.steps(a)
    guard !steps.isEmpty else { return image }
    let extent = image.extent
    var out = image
    for step in steps {
      let next: CIImage?
      switch step {
      case .exposure(let ev): next = filtered(out, "CIExposureAdjust", ["inputEV": number(ev)])
      case .temperatureTint(let neutral, let target): next = filtered(out, "CITemperatureAndTint", ["inputNeutral": vector(neutral), "inputTargetNeutral": vector(target)])
      case .colorControls(let brightness, let contrast, let saturation): next = filtered(out, "CIColorControls", ["inputBrightness": number(brightness), "inputContrast": number(contrast), "inputSaturation": number(saturation)])
      case .toneCurve(let points): next = points.count == 5 ? filtered(out, "CIToneCurve", Dictionary(uniqueKeysWithValues: points.enumerated().map { ("inputPoint\($0.offset)", vector($0.element) as Any) })) : nil
      case .sharpen(let sharpness): next = filtered(out.clampedToExtent(), "CISharpenLuminance", ["inputSharpness": number(sharpness)])   // clamped: no transparent border samples
      case .vignette(let intensity, let radius): next = filtered(out, "CIVignette", ["inputIntensity": number(intensity), "inputRadius": number(radius)])
      case .grain(let opacity): next = grain(over: out, opacity: opacity, time: time)
      }
      if let next { out = next.cropped(to: extent) }
    }
    return out
  }

  /// Zero-mean film grain over `image` (also used by the effects renderer): the frame's mean brightness stays the
  /// same, the picture is neither fogged nor lifted. Returns the image cropped to its own extent; an opacity that is
  /// ≤ 0 or non-finite, or any missing Core Image piece, returns the image unchanged.
  ///
  /// `CIRandomGenerator` (uniform 0…1 per channel, moved by a per-frame offset, cut to the frame and made opaque —
  /// the generator's alpha is random too) → `CIColorControls` saturation 0 (monochrome, mean still 0.5) →
  /// `CIColorMatrix` pulling it toward mid-grey: s = 0.5 + (n − 0.5)·opacity, always inside 0…1 → `CIOverlayBlendMode`
  /// over the frame. Overlay is neutral at s = 0.5 and linear in s for a fixed frame value b:
  /// b + (s − 0.5)·2b for b ≤ 0.5, b + (s − 0.5)·2(1 − b) above — so with a zero-mean (n − 0.5) the mean stays b, the
  /// result never leaves 0…1 (nothing to clamp, no negative intermediates), black stays black and white stays white.
  /// At mid-grey the grain is exactly (n − 0.5)·opacity.
  static func grain(over image: CIImage, opacity: Double, time: Double) -> CIImage {
    let extent = image.extent
    guard opacity.isFinite, opacity > 0, !extent.isInfinite, !extent.isEmpty,
          let noise = CIFilter(name: "CIRandomGenerator")?.outputImage else { return image }
    let k = CGFloat(min(1, opacity))
    let offset = grainOffset(time: time)
    let opaque = noise.transformed(by: CGAffineTransform(translationX: offset.x, y: offset.y)).cropped(to: extent)
      .composited(over: CIImage(color: CIColor.black).cropped(to: extent))
    let lift = 0.5 * (1 - k)
    guard let mono = filtered(opaque, "CIColorControls", ["inputSaturation": number(0)]),
          let centred = filtered(mono, "CIColorMatrix", [
            "inputRVector": CIVector(x: k, y: 0, z: 0, w: 0),
            "inputGVector": CIVector(x: 0, y: k, z: 0, w: 0),
            "inputBVector": CIVector(x: 0, y: 0, z: k, w: 0),
            "inputBiasVector": CIVector(x: lift, y: lift, z: lift, w: 0),
          ]),
          let grained = filtered(centred.cropped(to: extent), "CIOverlayBlendMode", [kCIInputBackgroundImageKey: image])
    else { return image }
    return grained.cropped(to: extent)
  }

  /// Where the noise field sits for the frame at `time`: a whole-pixel offset that changes every 1/30 s and is the
  /// same for the same time (deterministic). A non-finite or negative time counts as 0.
  static func grainOffset(time: Double) -> CGPoint {
    let frame = time.isFinite ? (max(0, time) * 30).rounded() : 0
    return CGPoint(x: (frame * 37).truncatingRemainder(dividingBy: 509), y: (frame * 53).truncatingRemainder(dividingBy: 503))
  }

  private static func number(_ v: Double) -> NSNumber { NSNumber(value: v) }
  private static func vector(_ p: AdjustPoint) -> CIVector { CIVector(x: CGFloat(p.x), y: CGFloat(p.y)) }

  /// One Core Image filter on `image`. Nil (→ the step is skipped) when Core Image has no such filter, the filter
  /// takes no input image, or it does not declare one of the keys — `setValue(_:forKey:)` is never called with a key
  /// the filter does not list, so a wrong name cannot raise.
  private static func filtered(_ image: CIImage, _ name: String, _ params: [String: Any]) -> CIImage? {
    guard let f = CIFilter(name: name) else { return nil }
    let keys = f.inputKeys
    guard keys.contains(kCIInputImageKey), params.keys.allSatisfy({ keys.contains($0) }) else { return nil }
    f.setValue(image, forKey: kCIInputImageKey)
    for (k, v) in params { f.setValue(v, forKey: k) }
    return f.outputImage
  }
}
