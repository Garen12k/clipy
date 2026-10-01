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
/// padding 72, outlineWidth 2, rotation 30, lineHeight 345.6.
/// Outputs are in the frame's coordinate space with a TOP-LEFT origin (like the preview); the export flips y.
/// Unlike the TS version (which works in screen points, constant 2pt outline), the outline is scaled with the frame
/// height so it stays proportional in pixel exports; it equals OUTLINE_PX at the 1920-tall reference frame.
enum OverlayLayout {
  static let outlinePx: CGFloat = 2
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
      outlineWidth: outlinePx * (frame.height / 1920),
      rotation: CGFloat(o.rotation),
      lineHeight: lineHeightFactor * fontSize)
  }
}
