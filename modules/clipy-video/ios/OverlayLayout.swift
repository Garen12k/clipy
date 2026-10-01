import CoreGraphics

struct OverlayLayoutResult {
  let centerX: CGFloat
  let centerY: CGFloat
  let fontSize: CGFloat
  let maxWidth: CGFloat
  let padding: CGFloat
  let outlineWidth: CGFloat
  let rotation: CGFloat
  let lineHeight: CGFloat
}

/// Mirror of src/editor/model/overlayLayout.ts — keep the formulas identical. Reference values (frame 1080×1920,
/// x .25 y .75 fontScale .1 scale 1.5 rotation 30, background on): centre (270, 1440), fontSize 288, maxWidth 972,
/// padding 72, outlineWidth 8.5333, rotation 30, lineHeight 345.6.
/// Outputs are in the frame's coordinate space with a TOP-LEFT origin (like the preview); the export flips y.
/// The outline is proportional to frame height (OUTLINE_FACTOR = 2/450 in the TS version), so the preview glow and
/// the exported stroke have the same relative thickness at any resolution.
enum OverlayLayout {
  static let outlineFactor: CGFloat = 2.0 / 450.0
  static let lineHeightFactor: CGFloat = 1.2
  static let backgroundPadFactor: CGFloat = 0.25
  static let maxWidthFactor: CGFloat = 0.9

  static func layout(_ o: ExportOverlay, frame: CGSize) -> OverlayLayoutResult {
    let fontSize = CGFloat(o.fontScale * o.scale) * frame.height
    return OverlayLayoutResult(
      centerX: CGFloat(o.x) * frame.width,
      centerY: CGFloat(o.y) * frame.height,
      fontSize: fontSize,
      maxWidth: maxWidthFactor * frame.width,
      padding: o.backgroundColor == nil ? 0 : backgroundPadFactor * fontSize,
      outlineWidth: outlineFactor * frame.height,
      rotation: CGFloat(o.rotation),
      lineHeight: lineHeightFactor * fontSize)
  }
}
