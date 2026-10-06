import CoreGraphics
import CoreImage
import Foundation
import UIKit

/// The images behind the ten transitions of 2026-10-06 (`ClipyCompositor.blend` calls these; the numbers are
/// `TransitionMath`'s). Core Image is y-up: screen-down fractions are negated here. Every Core Image filter is made
/// through `Adjust.filtered` or `generator`, which return nil for a filter or key Core Image does not know — the
/// caller then falls back to a plain dissolve.
enum TransitionBlend {
  /// Longest side, in pixels, of the clock wipe's drawn mask (it is scaled up to the frame; the edge is soft).
  static let sectorMaskMaxSide: CGFloat = 512

  /// Half the frame's diagonal: a circle of this radius about the centre reaches the corners.
  static func halfDiagonal(_ size: CGSize) -> CGFloat {
    return (size.width * size.width + size.height * size.height).squareRoot() / 2
  }

  /// cover / reveal / coverUp / revealDown: each frame moved by its `TransitionMath.slideOffsets` and the one named
  /// on top drawn over the other. Nil for any other type.
  static func slid(_ type: String, from a: CIImage, to b: CIImage, progress p: CGFloat, size: CGSize) -> CIImage? {
    guard let o = TransitionMath.slideOffsets(type, Double(p)) else { return nil }
    let rect = CGRect(origin: .zero, size: size)
    let outgoing = a.cropped(to: rect).transformed(by: CGAffineTransform(translationX: CGFloat(o.ax) * size.width, y: -CGFloat(o.ay) * size.height))
    let incoming = b.cropped(to: rect).transformed(by: CGAffineTransform(translationX: CGFloat(o.bx) * size.width, y: -CGFloat(o.by) * size.height))
    return (o.incomingOnTop ? incoming.composited(over: outgoing) : outgoing.composited(over: incoming)).cropped(to: rect)
  }

  /// `inside` where `mask` is white, `outside` where it is black (`CIBlendWithMask`). Nil without a mask or filter.
  static func masked(_ inside: CIImage, over outside: CIImage, mask: CIImage?, rect: CGRect) -> CIImage? {
    guard let mask else { return nil }
    return Adjust.filtered(inside.cropped(to: rect), "CIBlendWithMask", [
      kCIInputBackgroundImageKey: outside.cropped(to: rect),
      "inputMaskImage": mask.cropped(to: rect),
    ])?.cropped(to: rect)
  }

  /// A white disc of `radius` pixels about the frame's centre on black, its edge one pixel soft
  /// (`CIRadialGradient`: white up to `radius`, black from `radius + 1`). A radius of 0 or less is all black.
  static func discMask(radius: CGFloat, size: CGSize) -> CIImage? {
    let rect = CGRect(origin: .zero, size: size)
    guard radius.isFinite, !rect.isEmpty, !rect.isInfinite else { return nil }
    if radius <= 0 { return CIImage(color: CIColor.black).cropped(to: rect) }
    return generator("CIRadialGradient", [
      "inputCenter": CIVector(x: rect.midX, y: rect.midY),
      "inputRadius0": NSNumber(value: Double(radius)),
      "inputRadius1": NSNumber(value: Double(radius) + 1),
      "inputColor0": CIColor.white,
      "inputColor1": CIColor.black,
    ])?.cropped(to: rect)
  }

  /// The diagonal wipe's mask: white where u + v < `edge` (u, v = fractions from the TOP-left corner of the screen),
  /// black elsewhere. In Core Image space (y-up) that is x/w − y/h < edge − 1: a half-plane whose normal is
  /// (h, −w) / diagonal. It is built from a white square of twice the diagonal lying on the near side of the line —
  /// local x from −side to 0 — turned to the normal and moved to the line's point nearest the frame's centre.
  static func diagonalMask(edge: Double, size: CGSize) -> CIImage? {
    let rect = CGRect(origin: .zero, size: size)
    let w = Double(size.width), h = Double(size.height)
    guard edge.isFinite, w.isFinite, h.isFinite, w > 0, h > 0 else { return nil }
    let black = CIImage(color: CIColor.black).cropped(to: rect)
    if edge <= 0 { return black }
    if edge >= 2 { return CIImage(color: CIColor.white).cropped(to: rect) }
    let diagonal = (w * w + h * h).squareRoot()
    let nx = h / diagonal, ny = -w / diagonal
    let distance = (edge - 1) * (w * h / diagonal)             // the line's distance from the centre, along the normal
    let side = CGFloat(2 * diagonal)
    let place = CGAffineTransform(rotationAngle: CGFloat(atan2(-w, h)))
      .concatenating(CGAffineTransform(translationX: CGFloat(w / 2 + nx * distance), y: CGFloat(h / 2 + ny * distance)))
    let plane = CIImage(color: CIColor.white).cropped(to: CGRect(x: -side, y: -side / 2, width: side, height: side)).transformed(by: place)
    return plane.composited(over: black).cropped(to: rect)
  }

  /// The clock wipe's mask: a white pie sector on black, from 12 o'clock clockwise through `angle` radians, drawn
  /// with Core Graphics into a small grey bitmap (longest side ≤ `sectorMaskMaxSide`) and scaled up to the frame.
  /// The bitmap is y-up like Core Image: 12 o'clock is +π/2 and a clockwise sweep ON SCREEN runs towards smaller
  /// angles. The small bitmap is clamped before it is scaled, so the frame's border pixels read the mask's own edge
  /// value and not the transparency beyond it (which would leave a thin line of the other frame along the border).
  /// Nil when the bitmap cannot be made.
  static func sectorMask(angle: Double, size: CGSize) -> CIImage? {
    let rect = CGRect(origin: .zero, size: size)
    guard angle.isFinite, size.width.isFinite, size.height.isFinite, size.width > 0, size.height > 0 else { return nil }
    if angle <= 0 { return CIImage(color: CIColor.black).cropped(to: rect) }
    if angle >= 2 * Double.pi { return CIImage(color: CIColor.white).cropped(to: rect) }
    let scale = min(1, sectorMaskMaxSide / max(size.width, size.height))
    let w = Int((size.width * scale).rounded(.up)), h = Int((size.height * scale).rounded(.up))
    guard w > 0, h > 0,
          let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)
    else { return nil }
    ctx.setFillColor(gray: 0, alpha: 1)
    ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    ctx.setFillColor(gray: 1, alpha: 1)
    let centre = CGPoint(x: CGFloat(w) / 2, y: CGFloat(h) / 2)
    ctx.move(to: centre)
    ctx.addArc(center: centre, radius: CGFloat(w + h), startAngle: .pi / 2, endAngle: .pi / 2 - CGFloat(angle), clockwise: true)
    ctx.closePath()
    ctx.fillPath()
    guard let drawn = ctx.makeImage() else { return nil }
    return CIImage(cgImage: drawn)
      .clampedToExtent()
      .transformed(by: CGAffineTransform(scaleX: size.width / CGFloat(w), y: size.height / CGFloat(h)))
      .cropped(to: rect)
  }

  /// `image` in square blocks of `block` pixels (`CIPixellate`, the grid from the frame's corner; clamped first so
  /// no block reads beyond the frame). A block of 1 pixel or less, or a missing filter → `image` untouched.
  static func pixelated(_ image: CIImage, block: CGFloat, rect: CGRect) -> CIImage {
    guard block.isFinite, block > 1,
          let tiles = Adjust.filtered(image.cropped(to: rect).clampedToExtent(), "CIPixellate", [
            "inputScale": NSNumber(value: Double(block)),
            "inputCenter": CIVector(x: rect.minX, y: rect.minY),
          ])
    else { return image }
    return tiles.cropped(to: rect)
  }

  /// White (`TransitionMath.flashColor`) laid over `image` at `amount` (0…1). 0 or less → `image` untouched.
  static func flashed(_ image: CIImage, amount: CGFloat, rect: CGRect) -> CIImage {
    guard amount.isFinite, amount > 0 else { return image }
    let white = CIColor(color: UIColor(hex: TransitionMath.flashColor).withAlphaComponent(min(1, amount)))
    return CIImage(color: white).cropped(to: rect).composited(over: image.cropped(to: rect)).cropped(to: rect)
  }

  /// A Core Image generator's output (no input image). Nil when Core Image has no such filter or the filter does
  /// not declare one of the keys — `setValue(_:forKey:)` is never called with a key the filter does not list.
  private static func generator(_ name: String, _ params: [String: Any]) -> CIImage? {
    guard let f = CIFilter(name: name) else { return nil }
    let keys = f.inputKeys
    guard params.keys.allSatisfy({ keys.contains($0) }) else { return nil }
    for (key, value) in params { f.setValue(value, forKey: key) }
    return f.outputImage
  }
}
