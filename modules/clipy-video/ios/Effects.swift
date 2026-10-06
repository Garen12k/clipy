import CoreGraphics
import CoreImage
import Foundation

/// Mirror of src/editor/effects.ts — ids and shape paths must stay identical.
enum Effects {
  static let filterIds = ["none", "warm", "cool", "vivid", "faded", "mono", "noir", "vintage", "sunset", "golden", "teal", "pastel", "film", "chrome", "instant", "process", "tonal", "sepia", "crisp", "dream", "kodak", "fuji", "matte", "bleach", "dusk", "moody", "tealOrange", "blush", "grit", "silver", "indigo", "drama"]
  static let transitionTypes = ["none", "fade", "dissolve", "slide", "zoom", "slideRight", "slideUp", "slideDown", "wipe", "spin", "blur", "cover", "reveal", "coverUp", "revealDown", "circleOpen", "circleClose", "wipeDiagonal", "wipeClock", "pixelate", "flashWhite"]
  static let effectIds = ["glitch", "shake", "zoomPulse", "blur", "vhs", "lightLeak", "flash", "rgbSplit", "oldFilm", "glow", "blurBox", "mosaicBox", "filmBurn", "lensFlare", "dust", "heartbeat", "hueShift", "mirror", "softEdges", "strobe"]

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

  /// 100×100 box, y-down (SVG) coordinates, absolute M/L/C/Q/Z only — copied verbatim from SHAPES in effects.ts. Every subpath is clockwise; a hole is an inner subpath drawn counter-clockwise (the shape layer keeps its default non-zero fill).
  static let shapePaths: [String: String] = [
    "circle":       "M50 0 C77.6 0 100 22.4 100 50 C100 77.6 77.6 100 50 100 C22.4 100 0 77.6 0 50 C0 22.4 22.4 0 50 0 Z",
    "square":       "M0 0 L100 0 L100 100 L0 100 Z",
    "roundedBox":   "M20 0 L80 0 C91 0 100 9 100 20 L100 80 C100 91 91 100 80 100 L20 100 C9 100 0 91 0 80 L0 20 C0 9 9 0 20 0 Z",
    "arrow":        "M0 35 L60 35 L60 10 L100 50 L60 90 L60 65 L0 65 Z",
    "star":         "M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z",
    "speechBubble": "M10 0 L90 0 C95.5 0 100 4.5 100 10 L100 60 C100 65.5 95.5 70 90 70 L40 70 L20 90 L25 70 L10 70 C4.5 70 0 65.5 0 60 L0 10 C0 4.5 4.5 0 10 0 Z",
    "heart":        "M50 90 C20 65 0 50 0 30 C0 13 13 0 28 0 C38 0 46 6 50 14 C54 6 62 0 72 0 C87 0 100 13 100 30 C100 50 80 65 50 90 Z",
    "arrowCurved":   "M8 92 C8 52 30 30 62 30 L62 12 L96 42 L62 72 L62 54 C44 54 32 68 32 92 Z",
    "arrowDouble":   "M0 50 L28 18 L28 38 L72 38 L72 18 L100 50 L72 82 L72 62 L28 62 L28 82 Z",
    "bubbleRound":   "M50 2 C77.6 2 100 19.9 100 42 C100 64.1 77.6 82 50 82 C46 82 42 81.6 38 80.9 L16 98 L22 75 C8.5 67.5 0 55.5 0 42 C0 19.9 22.4 2 50 2 Z",
    "bubbleSquare":  "M0 0 L100 0 L100 70 L45 70 L22 96 L26 70 L0 70 Z",
    "bubbleThought": "M26 66 C11 66 2 56 2 45 C2 35 9 27 19 25 C21 12 33 4 46 6 C54 0 68 0 76 8 C89 8 98 18 98 30 C98 37 95 43 90 47 C91 58 82 66 71 66 Z M24 72 C28.4 72 32 75.6 32 80 C32 84.4 28.4 88 24 88 C19.6 88 16 84.4 16 80 C16 75.6 19.6 72 24 72 Z M9 88 C11.8 88 14 90.2 14 93 C14 95.8 11.8 98 9 98 C6.2 98 4 95.8 4 93 C4 90.2 6.2 88 9 88 Z",
    "badgeSeal":     "M50 0 L56.9 6.5 L65.5 2.4 L70 10.8 L79.4 9.5 L81.1 18.9 L90.5 20.6 L89.2 30 L97.6 34.5 L93.5 43.1 L100 50 L93.5 56.9 L97.6 65.5 L89.2 70 L90.5 79.4 L81.1 81.1 L79.4 90.5 L70 89.2 L65.5 97.6 L56.9 93.5 L50 100 L43.1 93.5 L34.5 97.6 L30 89.2 L20.6 90.5 L18.9 81.1 L9.5 79.4 L10.8 70 L2.4 65.5 L6.5 56.9 L0 50 L6.5 43.1 L2.4 34.5 L10.8 30 L9.5 20.6 L18.9 18.9 L20.6 9.5 L30 10.8 L34.5 2.4 L43.1 6.5 Z",
    "badgeRibbon":   "M50 0 C69.9 0 86 16.1 86 36 C86 55.9 69.9 72 50 72 C30.1 72 14 55.9 14 36 C14 16.1 30.1 0 50 0 Z M24 60 L44 70 L32 100 L26 86 L10 90 Z M76 60 L90 90 L74 86 L68 100 L56 70 Z",
    "banner":        "M0 28 L100 28 L88 50 L100 72 L0 72 L12 50 Z",
    "sparkle":       "M50 0 Q56 44 100 50 Q56 56 50 100 Q44 56 0 50 Q44 44 50 0 Z",
    "burst":         "M50 0 L57.8 21 L75 6.7 L71.2 28.8 L93.3 25 L79 42.2 L100 50 L79 57.8 L93.3 75 L71.2 71.2 L75 93.3 L57.8 79 L50 100 L42.2 79 L25 93.3 L28.8 71.2 L6.7 75 L21 57.8 L0 50 L21 42.2 L6.7 25 L28.8 28.8 L25 6.7 L42.2 21 Z",
    "frameRounded":  "M16 0 L84 0 C92.8 0 100 7.2 100 16 L100 84 C100 92.8 92.8 100 84 100 L16 100 C7.2 100 0 92.8 0 84 L0 16 C0 7.2 7.2 0 16 0 Z M18 12 C14.7 12 12 14.7 12 18 L12 82 C12 85.3 14.7 88 18 88 L82 88 C85.3 88 88 85.3 88 82 L88 18 C88 14.7 85.3 12 82 12 Z",
    "ring":          "M50 0 C77.6 0 100 22.4 100 50 C100 77.6 77.6 100 50 100 C22.4 100 0 77.6 0 50 C0 22.4 22.4 0 50 0 Z M50 14 C30.1 14 14 30.1 14 50 C14 69.9 30.1 86 50 86 C69.9 86 86 69.9 86 50 C86 30.1 69.9 14 50 14 Z",
    "brackets":      "M0 0 L30 0 L30 10 L10 10 L10 30 L0 30 Z M70 0 L100 0 L100 30 L90 30 L90 10 L70 10 Z M100 70 L100 100 L70 100 L70 90 L90 90 L90 70 Z M0 70 L10 70 L10 90 L30 90 L30 100 L0 100 Z",
  ]
  /// Emoji font size = stickerEmojiScale × frame height × overlay scale (STICKER_EMOJI_SCALE).
  static let stickerEmojiScale: CGFloat = 0.12
  /// Shape box side = stickerShapeScale × frame height × overlay scale (STICKER_SHAPE_SCALE).
  static let stickerShapeScale: CGFloat = 0.2
}
