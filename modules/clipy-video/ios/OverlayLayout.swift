import CoreGraphics
import Foundation

/// A text shadow in frame pixels (TOP-LEFT origin: `dx` right, `dy` down).
struct OverlayShadow: Equatable {
  let color: String
  let opacity: CGFloat
  let dx: CGFloat
  let dy: CGFloat
  let blur: CGFloat
}

/// A text glow: a halo of `radius` frame pixels.
struct OverlayGlow: Equatable {
  let color: String
  let radius: CGFloat
}

struct OverlayLayoutResult {
  let centerX: CGFloat
  let centerY: CGFloat
  let fontSize: CGFloat
  let maxWidth: CGFloat
  let padding: CGFloat
  let rotation: CGFloat
  let letterSpacing: CGFloat
  let lineHeight: CGFloat
  let outlineWidth: CGFloat
  let outlineColor: String
  let shadow: OverlayShadow?
  let glow: OverlayGlow?
  let opacity: CGFloat
  let boxRadius: CGFloat
}

/// Mirror of `contrastFor` in src/editor/model/overlayLayout.ts: black outline for light text, white for dark.
func contrastFor(hex: String) -> String {
  let digits = String(hex.replacingOccurrences(of: "#", with: "").prefix(6))
  let n = UInt32(digits, radix: 16) ?? 0          // TS: parseInt → NaN → channels 0 → "#FFFFFF"
  let r = Double((n >> 16) & 255), g = Double((n >> 8) & 255), b = Double(n & 255)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "#000000" : "#FFFFFF"
}

/// Mirror of src/editor/model/overlayLayout.ts — keep the formulas identical. Reference values (frame 1080×1920,
/// x .25 y .75 fontScale .1 scale 1.5 rotation 30, background on, neutral style): centre (270, 1440), fontSize 288,
/// maxWidth 972, padding 72, boxRadius 36, outlineWidth 8.5333, rotation 30, lineHeight 345.6, letterSpacing 0, no shadow, no glow,
/// opacity 1.
/// Outputs are in the frame's coordinate space with a TOP-LEFT origin (like the preview); the export flips y.
/// The outline is proportional to frame height (OUTLINE_FACTOR = 2/450 in the TS version), so the preview glow and
/// the exported stroke have the same relative thickness at any resolution.
/// The style values are multiplied in (× 1 and × 0 are exact), so the neutral style gives the numbers from before
/// styles existed.
enum OverlayLayout {
  static let outlineFactor: CGFloat = 2.0 / 450.0
  static let lineHeightFactor: CGFloat = 1.2
  static let backgroundPadFactor: CGFloat = 0.25
  /// A rounded box corner = half of the DEFAULT padding (BOX_RADIUS_FACTOR): the corner every box had before the padding became adjustable.
  static let boxRadiusFactor: CGFloat = 0.5
  static let maxWidthFactor: CGFloat = 0.9
  /// cos 45° = sin 45°: a shadow's distance goes equally right and down.
  static let shadowAngle: CGFloat = 0.7071

  static func layout(_ o: ExportOverlay, frame: CGSize) -> OverlayLayoutResult {
    let fontSize = CGFloat(o.fontScale * o.scale) * frame.height
    return OverlayLayoutResult(
      centerX: CGFloat(o.x) * frame.width,
      centerY: CGFloat(o.y) * frame.height,
      fontSize: fontSize,
      maxWidth: maxWidthFactor * frame.width,
      padding: o.backgroundColor == nil ? 0 : CGFloat(o.style.boxPadding) * fontSize,
      rotation: CGFloat(o.rotation),
      letterSpacing: CGFloat(o.style.letterSpacing) * fontSize,
      lineHeight: lineHeightFactor * fontSize * CGFloat(o.style.lineSpacing),
      outlineWidth: outlineFactor * frame.height * CGFloat(o.style.outlineWidth),
      outlineColor: o.style.outlineColor ?? contrastFor(hex: o.color),
      shadow: shadow(o, fontSize: fontSize),
      glow: glow(o, fontSize: fontSize),
      opacity: CGFloat(o.style.opacity),
      boxRadius: o.backgroundColor == nil || o.style.boxCorner == "square" ? 0 : backgroundPadFactor * fontSize * boxRadiusFactor)
  }

  /// nil when the style has no shadow colour (the request's "no shadow").
  private static func shadow(_ o: ExportOverlay, fontSize: CGFloat) -> OverlayShadow? {
    guard let color = o.style.shadowColor else { return nil }
    let offset = CGFloat(o.style.shadowDistance) * fontSize * shadowAngle
    return OverlayShadow(color: color, opacity: CGFloat(o.style.shadowOpacity), dx: offset, dy: offset,
                         blur: CGFloat(o.style.shadowBlur) * fontSize)
  }

  /// nil when the style has no glow colour (the request's "no glow").
  private static func glow(_ o: ExportOverlay, fontSize: CGFloat) -> OverlayGlow? {
    guard let color = o.style.glowColor else { return nil }
    return OverlayGlow(color: color, radius: CGFloat(o.style.glowSize) * fontSize)
  }
}
