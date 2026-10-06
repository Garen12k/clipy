import CoreGraphics
import CoreImage
import Foundation
import UIKit

/// A blur / mosaic box's rectangle as the request gives it: fractions of the frame, TOP-LEFT origin (y down).
struct RegionRect: Equatable {
  let x: Double
  let y: Double
  let w: Double
  let h: Double
}

/// Draws one timeline effect on a finished frame (after the transition blend, before text and stickers) with Core
/// Image, driven by `EffectMath` — the same deterministic maths the preview uses. Every result is cropped to the
/// frame. A filter (or one of its keys) Core Image does not know is skipped, so the worst case is "no change".
enum EffectRenderer {
  /// Export-only look values with no preview twin (the spec gives no number for them).
  static let scanLineOpacity: CGFloat = 0.18          // darkness of a VHS scan line at full strength
  static let scanLinePairs: CGFloat = 240             // dark + clear line pairs over the frame height
  static let filmVignetteRadius: CGFloat = 1.5        // as the "vintage" filter's vignette
  /// The blur / mosaic boxes (spec section 4): radius and block as fractions of the frame's shorter side at full
  /// strength, and the smallest block in pixels.
  static let blurBoxRadius: Double = 0.06
  static let mosaicBoxBlock: Double = 0.08
  static let mosaicBoxMinBlock: Double = 4
  /// The lens flare's halo is this share of its core's strength (export only).
  static let flareHaloAlpha: Double = 0.5

  /// `image` with the effect `type` at local time `t` (seconds since the effect's start) of its duration `d`, at
  /// intensity `k`; `size` is the frame. Unknown types, non-finite input and times outside [0, d] → `image` unchanged.
  /// `region` is the rectangle of a blur / mosaic box (nil for every other effect; a box without a usable one
  /// leaves `image` unchanged).
  static func apply(type: String, image: CIImage, t: Double, d: Double, k: Double, size: CGSize, region: RegionRect? = nil) -> CIImage {
    let rect = CGRect(origin: .zero, size: size)
    guard t.isFinite, d.isFinite, k.isFinite, d > 0, t >= 0, t <= d, k > 0, !rect.isEmpty, !rect.isInfinite else { return image }
    let w = Double(size.width), h = Double(size.height), shorter = min(w, h)
    let env = EffectMath.envelope(t: t, d: d)
    switch type {
    case "shake":
      // `o.y` is positive DOWN on screen (as the preview's translateY); Core Image is y-up, so it is negated.
      let o = EffectMath.shakeOffset(t: t, d: d, k: k)
      return scaled(image, by: o.scale, dx: o.x * w, dy: -o.y * h, rect: rect)
    case "zoomPulse":
      return scaled(image, by: EffectMath.pulseScale(t: t, d: d, k: k), dx: 0, dy: 0, rect: rect)
    case "flash":
      return colorLayer(EffectMath.flashColor, opacity: EffectMath.flashOpacity(t: t, k: k), over: image, rect: rect)
    case "lightLeak":
      return colorLayer(EffectMath.lightLeakColor, opacity: EffectMath.leakAlpha(t: t, d: d, k: k), over: image, rect: rect)
    case "vhs":
      // Red / blue pulled apart, scan lines, then the tint the preview shows.
      let shifted = splitChannels(image: image.cropped(to: rect), dx: CGFloat(EffectMath.vhsShift * k * w))
      let lined = scanLines(over: shifted, opacity: Double(scanLineOpacity) * k * env, rect: rect)
      return colorLayer(EffectMath.vhsColor, opacity: EffectMath.vhsTint * k * env, over: lined, rect: rect)
    case "oldFilm":
      let amount = k * env
      var out = image.cropped(to: rect)
      if amount > 0 {
        if let sepia = Adjust.filtered(out, "CISepiaTone", ["inputIntensity": number(min(1, amount))]) { out = sepia.cropped(to: rect) }
        if let dark = Adjust.filtered(out, "CIVignette", ["inputIntensity": number(amount), "inputRadius": number(Double(filmVignetteRadius))]) {
          out = dark.cropped(to: rect)
        }
      }
      out = colorLayer(EffectMath.flickerColor, opacity: EffectMath.flickerAlpha(t: t, k: k), over: out, rect: rect)
      return amount > 0 ? Adjust.grain(over: out, opacity: Adjust.grainOpacity * amount, time: t).cropped(to: rect) : out
    case "glow":
      let radius = EffectMath.glowRadius * k * shorter, intensity = EffectMath.glowIntensity * k * env
      guard radius > 0, intensity > 0,
            let bloom = Adjust.filtered(image.clampedToExtent(), "CIBloom", ["inputRadius": number(radius), "inputIntensity": number(intensity)])
      else { return image }
      return bloom.cropped(to: rect)
    case "blur":
      // Clamped before the blur, cropped after; a radius of 0 hands the image back untouched.
      return ClipyCompositor.blurred(image, radius: CGFloat(EffectMath.blurRadius * k * env * shorter), rect: rect)
    case "glitch":
      let g = EffectMath.glitchSlice(t: t, k: k)
      guard g.active else { return image }
      // `bandY` is the band's top as a fraction from the TOP of the screen; Core Image is y-up, so the band's lower
      // edge is at height × (1 − bandY − bandH).
      let band = CGRect(x: 0, y: h * (1 - g.bandY - g.bandH), width: w, height: h * g.bandH)
      let frame = image.cropped(to: rect)
      let torn = band.isEmpty ? frame : frame.cropped(to: band)
        .transformed(by: CGAffineTransform(translationX: CGFloat(g.shift * w), y: 0))
        .composited(over: frame).cropped(to: rect)
      return splitChannels(image: torn, dx: CGFloat(g.split * w))
    case "rgbSplit":
      return splitChannels(image: image.cropped(to: rect), dx: CGFloat(EffectMath.rgbSplit * k * env * w))
    case "blurBox":
      // The box hides something, so its strength is constant while the effect is active (no fade in / out). Only
      // the box's own pixels are blurred (clamped first, so nothing from outside the box bleeds in and its edge
      // stays hard), cut back to the box and laid over the untouched frame.
      guard let region, let box = regionRect(region, in: size) else { return image }
      let radius = blurBoxRadius * k * shorter
      guard radius.isFinite, radius > 0 else { return image }
      return ClipyCompositor.blurred(image.cropped(to: box), radius: CGFloat(radius), rect: box)
        .composited(over: image).cropped(to: rect)
    case "mosaicBox":
      // As the blur box, with square blocks whose grid starts at the box's bottom-left corner.
      guard let region, let box = regionRect(region, in: size) else { return image }
      let block = max(mosaicBoxMinBlock, mosaicBoxBlock * k * shorter)
      guard block.isFinite, block > 0,
            let tiles = Adjust.filtered(image.cropped(to: box).clampedToExtent(), "CIPixellate", [
              "inputScale": number(block),
              "inputCenter": CIVector(x: box.minX, y: box.minY),
            ])
      else { return image }
      return tiles.cropped(to: box).composited(over: image).cropped(to: rect)
    // ---- The eight effects of 2026-10-06 (the maths is EffectMath's; every filter goes through a guarded helper). ----
    case "filmBurn":
      // Warm light swelling in from the LEFT edge. `burnCentreY` is a fraction from the TOP of the screen; Core
      // Image is y-up, so the centre is at height × (1 − y).
      let centre = CGPoint(x: 0, y: h * (1 - EffectMath.burnCentreY(t: t)))
      return light(EffectMath.filmBurnColor, alpha: EffectMath.burnOpacity(t: t, d: d, k: k), centre: centre, radius: EffectMath.burnRadius * w, over: image, rect: rect)
    case "lensFlare":
      // A bright spot with a wide soft halo, sweeping left → right at a fixed height (`flareY` from the top).
      let alpha = EffectMath.flareOpacity(t: t, d: d, k: k)
      let centre = CGPoint(x: EffectMath.flareX(t: t) * w, y: h * (1 - EffectMath.flareY))
      let halo = light(EffectMath.lensFlareColor, alpha: alpha * flareHaloAlpha, centre: centre, radius: EffectMath.flareHalo * shorter, over: image, rect: rect)
      return light(EffectMath.lensFlareColor, alpha: alpha, centre: centre, radius: EffectMath.flareCore * shorter, over: halo, rect: rect)
    case "dust":
      // Thin light scratches at the places the preview draws them (their opacity clamped as `effectShapes` clamps
      // it), then a fine white grain.
      let amount = k * env
      guard amount > 0 else { return image }
      var out = image.cropped(to: rect)
      let lineWidth = max(1, (EffectMath.dustWidth * w).rounded())
      let line = CIColor(color: UIColor(hex: EffectMath.dustColor).withAlphaComponent(CGFloat(EffectMath.within(EffectMath.dustOpacity * amount, 0, EffectMath.dustOpacity, 0))))
      for i in 0..<Int(EffectMath.dustLines) {
        let s = EffectMath.dustScratch(t: t, k: k, i: Double(i))
        guard s.on else { continue }
        let strip = CGRect(x: (s.x * w).rounded(), y: 0, width: lineWidth, height: h).intersection(rect)
        if strip.isNull || strip.isEmpty { continue }
        out = CIImage(color: line).cropped(to: strip).composited(over: out).cropped(to: rect)
      }
      return specks(over: out, amount: amount, time: t, rect: rect)
    case "heartbeat":
      return scaled(image, by: EffectMath.heartbeatScale(t: t, d: d, k: k), dx: 0, dy: 0, rect: rect)
    case "hueShift":
      let angle = EffectMath.hueAngle(t: t, d: d, k: k)
      guard angle.isFinite, angle != 0,
            let turned = Adjust.filtered(image.cropped(to: rect), "CIHueAdjust", ["inputAngle": number(angle)])
      else { return image }
      return turned.cropped(to: rect)
    case "mirror":
      // The left half turned over about the frame's vertical centre line (x → width − x) and laid over the right half.
      // The seam is at width / 2 for any width: the half [0, w/2] lands on [w/2, w], and the whole frame lies under it.
      let mix = EffectMath.mirrorMix(t: t, d: d, k: k)
      guard mix > 0 else { return image }
      let frame = image.cropped(to: rect)
      let flipped = frame.cropped(to: CGRect(x: 0, y: 0, width: w / 2, height: h))
        .transformed(by: CGAffineTransform(a: -1, b: 0, c: 0, d: 1, tx: CGFloat(w), ty: 0))
      let mirrored = flipped.composited(over: frame).cropped(to: rect)
      return mix >= 1 ? mirrored : ClipyCompositor.dissolve(from: frame, to: mirrored, progress: CGFloat(mix)).cropped(to: rect)
    case "softEdges":
      // The whole frame blurred (`CIGaussianBlur` through `ClipyCompositor.blurred`: clamped first, cropped after),
      // then the sharp frame kept in the middle by a round mask (white = sharp).
      let radius = EffectMath.edgeBlur * EffectMath.softEdgeAmount(t: t, d: d, k: k) * shorter
      guard radius.isFinite, radius > 0 else { return image }
      let frame = image.cropped(to: rect)
      let soft = ClipyCompositor.blurred(frame, radius: CGFloat(radius), rect: rect)
      guard let mask = softMask(shorter: shorter, rect: rect),
            let out = Adjust.filtered(frame, "CIBlendWithMask", [kCIInputBackgroundImageKey: soft, "inputMaskImage": mask])
      else { return image }
      return out.cropped(to: rect)
    case "strobe":
      return colorLayer(EffectMath.strobeColor, opacity: EffectMath.strobeOpacity(t: t, k: k), over: image, rect: rect)
    default:
      return image
    }
  }

  /// A box given as fractions of the frame with a TOP-LEFT origin, in Core Image's pixels (BOTTOM-LEFT origin, y
  /// up): the box's lower edge is at height × (1 − y − h). The part outside the frame is cut off. Nil when a number
  /// is not finite, a side is not positive, or nothing of the box is inside the frame.
  static func regionRect(_ region: RegionRect, in size: CGSize) -> CGRect? {
    let w = Double(size.width), h = Double(size.height)
    guard [region.x, region.y, region.w, region.h, w, h].allSatisfy({ $0.isFinite }),
          region.w > 0, region.h > 0, w > 0, h > 0 else { return nil }
    let box = CGRect(x: region.x * w, y: (1 - region.y - region.h) * h, width: region.w * w, height: region.h * h)
      .intersection(CGRect(x: 0, y: 0, width: w, height: h))
    if box.isNull || box.isEmpty || box.isInfinite { return nil }
    return box
  }

  /// `image` scaled by `scale` about the frame centre, then moved by (dx, dy) pixels (Core Image space, y-up). The
  /// image is clamped first so no transparent edge can enter the frame, and cropped back to it.
  private static func scaled(_ image: CIImage, by scale: Double, dx: Double, dy: Double, rect: CGRect) -> CIImage {
    guard scale.isFinite, scale > 0, dx.isFinite, dy.isFinite else { return image }
    if scale == 1, dx == 0, dy == 0 { return image }
    let s = CGFloat(scale)
    let about = CGAffineTransform(translationX: -rect.midX, y: -rect.midY)
      .concatenating(CGAffineTransform(scaleX: s, y: s))
      .concatenating(CGAffineTransform(translationX: rect.midX + CGFloat(dx), y: rect.midY + CGFloat(dy)))
    return image.cropped(to: rect).clampedToExtent().transformed(by: about).cropped(to: rect)
  }

  /// A full-frame layer of the colour `hex` at `opacity` over `image`. `CIColor`'s components are unpremultiplied and
  /// `CIImage(color:)` premultiplies them, so the layer blends source-over like the preview's translucent view.
  /// Opacity 0 (or less, or non-finite) → `image` unchanged.
  private static func colorLayer(_ hex: String, opacity: Double, over image: CIImage, rect: CGRect) -> CIImage {
    guard opacity.isFinite, opacity > 0 else { return image }
    let color = CIColor(color: UIColor(hex: hex).withAlphaComponent(CGFloat(min(1, opacity))))
    return CIImage(color: color).cropped(to: rect).composited(over: image).cropped(to: rect)
  }

  /// Red moved `dx` pixels to the right, blue `dx` to the left, green in place: each channel is isolated with
  /// `CIColorMatrix` (on a clamped image, so a moved channel has no empty edge; alpha is left as it is) and the three
  /// are put back together with `CIMaximumCompositing`, the per-component maximum: (r, 0, 0, a) max (0, g, 0, a) max
  /// (0, 0, b, a) = (r, g, b, a) — alpha is never summed, so an opaque frame stays exactly opaque.
  /// `image` must have a finite extent (the frame); the result keeps it. dx 0 → `image` unchanged.
  private static func splitChannels(image: CIImage, dx: CGFloat) -> CIImage {
    let rect = image.extent
    guard dx.isFinite, dx != 0, !rect.isInfinite, !rect.isEmpty else { return image }
    let base = image.clampedToExtent()
    func channel(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, shift: CGFloat) -> CIImage? {
      return Adjust.filtered(base, "CIColorMatrix", [
        "inputRVector": CIVector(x: r, y: 0, z: 0, w: 0),
        "inputGVector": CIVector(x: 0, y: g, z: 0, w: 0),
        "inputBVector": CIVector(x: 0, y: 0, z: b, w: 0),
      ])?.transformed(by: CGAffineTransform(translationX: shift, y: 0)).cropped(to: rect)
    }
    func maximum(_ top: CIImage, _ bottom: CIImage) -> CIImage? {
      return Adjust.filtered(top, "CIMaximumCompositing", ["inputBackgroundImage": bottom])
    }
    guard let red = channel(1, 0, 0, shift: dx), let green = channel(0, 1, 0, shift: 0), let blue = channel(0, 0, 1, shift: -dx),
          let redGreen = maximum(red, green), let all = maximum(blue, redGreen)
    else { return image }
    return all.cropped(to: rect)
  }

  /// Thin horizontal dark lines over `image`: `CIStripesGenerator` draws VERTICAL stripes (they alternate along x),
  /// so the generated image is turned 90° to make them alternate along y. The stripes are black at `opacity` and
  /// fully transparent (black needs no premultiplication). Opacity 0 or an unknown generator → `image` unchanged.
  private static func scanLines(over image: CIImage, opacity: Double, rect: CGRect) -> CIImage {
    guard opacity.isFinite, opacity > 0 else { return image }
    let lineHeight = max(1, (rect.height / scanLinePairs / 2).rounded())
    guard let stripes = generated("CIStripesGenerator", [
      "inputCenter": CIVector(x: 0, y: 0),
      "inputColor0": CIColor(red: 0, green: 0, blue: 0, alpha: CGFloat(min(1, opacity))),
      "inputColor1": CIColor(red: 0, green: 0, blue: 0, alpha: 0),
      "inputWidth": number(Double(lineHeight)),
      "inputSharpness": number(1),
    ]) else { return image }
    return stripes.transformed(by: CGAffineTransform(rotationAngle: .pi / 2)).cropped(to: rect)
      .composited(over: image).cropped(to: rect)
  }

  private static func number(_ v: Double) -> NSNumber { return NSNumber(value: v) }

  /// A Core Image generator's output (no input image), with the same key guard as `Adjust.filtered`.
  private static func generated(_ name: String, _ params: [String: Any]) -> CIImage? {
    guard let f = CIFilter(name: name) else { return nil }
    let keys = f.inputKeys
    guard params.keys.allSatisfy({ keys.contains($0) }) else { return nil }
    for (key, value) in params { f.setValue(value, forKey: key) }
    return f.outputImage
  }

  /// A soft round light: the colour `hex` at `alpha` in the centre, fading to nothing at `radius` pixels
  /// (`CIRadialGradient`), screened over `image` (`CIScreenBlendMode`: it can only brighten). Nothing to draw, or a
  /// filter / key Core Image does not know → `image` unchanged.
  private static func light(_ hex: String, alpha: Double, centre: CGPoint, radius: Double, over image: CIImage, rect: CGRect) -> CIImage {
    guard alpha.isFinite, alpha > 0, radius.isFinite, radius > 0, centre.x.isFinite, centre.y.isFinite else { return image }
    let color = UIColor(hex: hex)
    guard let glow = generated("CIRadialGradient", [
            "inputCenter": CIVector(x: centre.x, y: centre.y),
            "inputRadius0": number(0),
            "inputRadius1": number(radius),
            "inputColor0": CIColor(color: color.withAlphaComponent(CGFloat(min(1, alpha)))),
            "inputColor1": CIColor(color: color.withAlphaComponent(0)),
          ]),
          let lit = Adjust.filtered(glow.cropped(to: rect), "CIScreenBlendMode", [kCIInputBackgroundImageKey: image.cropped(to: rect)])
    else { return image }
    return lit.cropped(to: rect)
  }

  /// The soft-edges mask: white (sharp) within `edgeInner` × the shorter side of the frame's centre, black (blurred)
  /// from `edgeOuter` × the shorter side outwards. Nil when the generator is missing.
  private static func softMask(shorter: Double, rect: CGRect) -> CIImage? {
    return generated("CIRadialGradient", [
      "inputCenter": CIVector(x: rect.midX, y: rect.midY),
      "inputRadius0": number(EffectMath.edgeInner * shorter),
      "inputRadius1": number(EffectMath.edgeOuter * shorter),
      "inputColor0": CIColor.white,
      "inputColor1": CIColor.black,
    ])?.cropped(to: rect)
  }

  /// A fine white grain over `image` (Apple's "scratchy analog film" recipe): `CIRandomGenerator` noise, moved every
  /// frame, through `CIColorMatrix` — every colour channel takes the noise's green, and the alpha is a small multiple
  /// of it (`dustSpeck` × amount), so only a faint sprinkle is left — composited over the frame. Anything missing →
  /// `image` unchanged.
  private static func specks(over image: CIImage, amount: Double, time: Double, rect: CGRect) -> CIImage {
    guard amount.isFinite, amount > 0, let noise = generated("CIRandomGenerator", [:]) else { return image }
    let offset = Adjust.grainOffset(time: time)
    let field = noise.transformed(by: CGAffineTransform(translationX: offset.x, y: offset.y)).cropped(to: rect)
    let alpha = CGFloat(min(1, EffectMath.dustSpeck * amount))
    guard let white = Adjust.filtered(field, "CIColorMatrix", [
            "inputRVector": CIVector(x: 0, y: 1, z: 0, w: 0),
            "inputGVector": CIVector(x: 0, y: 1, z: 0, w: 0),
            "inputBVector": CIVector(x: 0, y: 1, z: 0, w: 0),
            "inputAVector": CIVector(x: 0, y: alpha, z: 0, w: 0),
            "inputBiasVector": CIVector(x: 0, y: 0, z: 0, w: 0),
          ])
    else { return image }
    // `CIColorClamp` keeps every component of the sprinkle in 0…1; without it the unclamped sprinkle is used.
    let bounded = Adjust.filtered(white, "CIColorClamp", [
      "inputMinComponents": CIVector(x: 0, y: 0, z: 0, w: 0),
      "inputMaxComponents": CIVector(x: 1, y: 1, z: 1, w: 1),
    ]) ?? white
    return bounded.cropped(to: rect).composited(over: image).cropped(to: rect)
  }
}
