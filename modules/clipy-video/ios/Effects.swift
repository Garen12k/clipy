import CoreGraphics
import CoreImage
import Foundation

/// Mirror of src/editor/effects.ts — ids and shape paths must stay identical.
enum Effects {
  static let filterIds = ["none", "warm", "cool", "vivid", "faded", "mono", "noir", "vintage", "sunset", "golden", "teal", "pastel", "film", "chrome", "instant", "process", "tonal", "sepia", "crisp", "dream"]
  static let transitionTypes = ["none", "fade", "dissolve", "slide", "zoom", "slideRight", "slideUp", "slideDown", "wipe", "spin", "blur"]
  static let effectIds = ["glitch", "shake", "zoomPulse", "blur", "vhs", "lightLeak", "flash", "rgbSplit", "oldFilm", "glow"]

  /// Core Image recipe per filter id (applied in order). Unknown ids (and nil / "none") → empty chain (no filter).
  static func filterChain(_ id: String?) -> [(name: String, params: [String: Any])] {
    switch id ?? "none" {
    case "warm":    return [("CITemperatureAndTint", ["inputNeutral": CIVector(x: 6500, y: 0), "inputTargetNeutral": CIVector(x: 7100, y: 0)]), ("CIColorControls", ["inputSaturation": 1.1])]
    case "cool":    return [("CITemperatureAndTint", ["inputNeutral": CIVector(x: 6500, y: 0), "inputTargetNeutral": CIVector(x: 5900, y: 0)])]
    case "vivid":   return [("CIColorControls", ["inputSaturation": 1.4, "inputContrast": 1.1])]
    case "faded":   return [("CIColorControls", ["inputSaturation": 0.7, "inputBrightness": 0.08, "inputContrast": 0.9])]
    case "mono":    return [("CIPhotoEffectMono", [:])]
    case "noir":    return [("CIPhotoEffectNoir", [:])]
    case "vintage": return [("CISepiaTone", ["inputIntensity": 0.5]), ("CIVignette", ["inputIntensity": 1.0, "inputRadius": 1.5])]
    case "sunset":  return [("CITemperatureAndTint", ["inputNeutral": CIVector(x: 6500, y: 0), "inputTargetNeutral": CIVector(x: 7600, y: 0)]), ("CIColorControls", ["inputSaturation": 1.2])]
    case "golden":  return [("CITemperatureAndTint", ["inputNeutral": CIVector(x: 6500, y: 0), "inputTargetNeutral": CIVector(x: 7200, y: 0)]), ("CIColorControls", ["inputBrightness": 0.04])]
    case "teal":    return [("CITemperatureAndTint", ["inputNeutral": CIVector(x: 6500, y: 0), "inputTargetNeutral": CIVector(x: 5600, y: 0)]), ("CIColorControls", ["inputSaturation": 1.1, "inputContrast": 1.05])]
    case "pastel":  return [("CIColorControls", ["inputSaturation": 0.8, "inputBrightness": 0.06, "inputContrast": 0.9])]
    case "film":    return [("CIPhotoEffectTransfer", [:])]
    case "chrome":  return [("CIPhotoEffectChrome", [:])]
    case "instant": return [("CIPhotoEffectInstant", [:])]
    case "process": return [("CIPhotoEffectProcess", [:])]
    case "tonal":   return [("CIPhotoEffectTonal", [:])]
    case "sepia":   return [("CISepiaTone", ["inputIntensity": 1.0])]
    case "crisp":   return [("CISharpenLuminance", ["inputSharpness": 0.8]), ("CIColorControls", ["inputContrast": 1.1])]
    case "dream":   return [("CIBloom", ["inputRadius": 10, "inputIntensity": 0.6]), ("CIColorControls", ["inputSaturation": 1.1])]
    default:        return []
    }
  }

  /// Applies a filter chain; a filter Core Image does not know is skipped. The result keeps the input's extent.
  static func apply(_ chain: [(name: String, params: [String: Any])], to image: CIImage) -> CIImage {
    guard !chain.isEmpty else { return image }
    var out = image
    for step in chain {
      guard let f = CIFilter(name: step.name) else { continue }
      f.setValue(out, forKey: kCIInputImageKey)
      for (k, v) in step.params { f.setValue(v, forKey: k) }
      out = f.outputImage ?? out
    }
    return out.cropped(to: image.extent)
  }

  /// 100×100 box, y-down (SVG) coordinates, absolute M/L/C/Q/Z only — copied verbatim from SHAPES in effects.ts.
  static let shapePaths: [String: String] = [
    "circle":       "M50 0 C77.6 0 100 22.4 100 50 C100 77.6 77.6 100 50 100 C22.4 100 0 77.6 0 50 C0 22.4 22.4 0 50 0 Z",
    "square":       "M0 0 L100 0 L100 100 L0 100 Z",
    "roundedBox":   "M20 0 L80 0 C91 0 100 9 100 20 L100 80 C100 91 91 100 80 100 L20 100 C9 100 0 91 0 80 L0 20 C0 9 9 0 20 0 Z",
    "arrow":        "M0 35 L60 35 L60 10 L100 50 L60 90 L60 65 L0 65 Z",
    "star":         "M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z",
    "speechBubble": "M10 0 L90 0 C95.5 0 100 4.5 100 10 L100 60 C100 65.5 95.5 70 90 70 L40 70 L20 90 L25 70 L10 70 C4.5 70 0 65.5 0 60 L0 10 C0 4.5 4.5 0 10 0 Z",
    "heart":        "M50 90 C20 65 0 50 0 30 C0 13 13 0 28 0 C38 0 46 6 50 14 C54 6 62 0 72 0 C87 0 100 13 100 30 C100 50 80 65 50 90 Z",
  ]
  /// Emoji font size = stickerEmojiScale × frame height × overlay scale (STICKER_EMOJI_SCALE).
  static let stickerEmojiScale: CGFloat = 0.12
  /// Shape box side = stickerShapeScale × frame height × overlay scale (STICKER_SHAPE_SCALE).
  static let stickerShapeScale: CGFloat = 0.2
}
