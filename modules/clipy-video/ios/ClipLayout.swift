import CoreGraphics

/// A crop rectangle as fractions of the oriented source, TOP-LEFT origin (like `CropRect` in types.ts).
struct ClipCrop: Equatable {
  var x: CGFloat
  var y: CGFloat
  var w: CGFloat
  var h: CGFloat
  static let full = ClipCrop(x: 0, y: 0, w: 1, h: 1)
}

/// Mirror of `ClipTransform` in types.ts: scale 1 = cover, offsets as fractions of the frame, rotation in degrees
/// clockwise as seen on screen, flips in the picture's own space.
struct ClipTransform: Equatable {
  var scale: CGFloat
  var x: CGFloat
  var y: CGFloat
  var rotation: CGFloat
  var flipH: Bool
  var flipV: Bool
  static let identity = ClipTransform(scale: 1, x: 0, y: 0, rotation: 0, flipH: false, flipV: false)
}

/// Mirror of `PlacedClip` in clipLayout.ts: the cropped picture's unrotated size and its centre, in frame pixels with
/// a TOP-LEFT origin.
struct ClipPlacement: Equatable {
  let width: CGFloat
  let height: CGFloat
  let centerX: CGFloat
  let centerY: CGFloat
  let rotation: CGFloat
  let flipH: Bool
  let flipV: Bool
}

/// Mirror of src/editor/model/clipLayout.ts — keep the functions and constants identical (`SNAP` / `snapTransform`
/// are preview-only and have no twin here). Reference vectors: `PLACE_VECTORS` in
/// src/editor/model/__tests__/clipLayout.vectors.ts, embedded in Tests/ClipLayoutTests.swift.
/// Everything here is in the frame's coordinate space with a TOP-LEFT origin (like the preview); the only
/// conversion to Core Image's bottom-left origin is `ciPlacement` at the bottom of this file.
enum ClipLayout {
  /// `isQuarterTurn`: within this many degrees of ±90°.
  static let quarterTurnTolerance: CGFloat = 1
  /// `coversFrame`: only pictures within this many degrees of a straight angle can cover the frame.
  static let straightAngleTolerance: CGFloat = 0.5
  /// `coversFrame`: the picture's edges may fall short of the frame's edges by this many pixels.
  static let coverageEpsilon: CGFloat = 0.5

  /// True when the picture is turned on its side (within 1° of ±90°), so its width and height swap for cover / fit.
  static func isQuarterTurn(_ rotation: CGFloat) -> Bool {
    // JS `%` keeps the dividend's sign, like truncatingRemainder.
    let r = (rotation.truncatingRemainder(dividingBy: 180) + 180).truncatingRemainder(dividingBy: 180)
    return abs(r - 90) < quarterTurnTolerance
  }

  /// Pixel size of the cropped picture before any scaling.
  static func croppedSize(_ source: CGSize, _ crop: ClipCrop) -> CGSize {
    CGSize(width: source.width * crop.w, height: source.height * crop.h)
  }

  /// The cropped picture's bounding box as it sits in the frame (sides swapped on a quarter turn).
  static func turned(_ source: CGSize, _ crop: ClipCrop, _ rotation: CGFloat) -> CGSize {
    let c = croppedSize(source, crop)
    return isQuarterTurn(rotation) ? CGSize(width: c.height, height: c.width) : c
  }

  /// Pixels of frame per pixel of picture at scale 1 (the picture just covers the frame).
  static func coverFactor(_ source: CGSize, _ crop: ClipCrop, _ rotation: CGFloat, _ frameW: CGFloat, _ frameH: CGFloat) -> CGFloat {
    let b = turned(source, crop, rotation)
    return max(frameW / b.width, frameH / b.height)
  }

  /// The transform scale at which the whole picture is visible (≤ 1).
  static func fitScale(_ source: CGSize, _ crop: ClipCrop, _ rotation: CGFloat, _ frameW: CGFloat, _ frameH: CGFloat) -> CGFloat {
    let b = turned(source, crop, rotation)
    return min(frameW / b.width, frameH / b.height) / coverFactor(source, crop, rotation, frameW, frameH)
  }

  static func placeClip(_ source: CGSize, _ crop: ClipCrop, _ t: ClipTransform, _ frameW: CGFloat, _ frameH: CGFloat) -> ClipPlacement {
    let c = croppedSize(source, crop), k = coverFactor(source, crop, t.rotation, frameW, frameH) * t.scale
    return ClipPlacement(
      width: c.width * k, height: c.height * k,
      centerX: frameW / 2 + t.x * frameW, centerY: frameH / 2 + t.y * frameH,
      rotation: t.rotation, flipH: t.flipH, flipV: t.flipV)
  }

  /// Whether the picture hides the whole frame (only decidable cheaply for upright / quarter-turned pictures; anything
  /// else shows background).
  static func coversFrame(_ p: ClipPlacement, _ frameW: CGFloat, _ frameH: CGFloat) -> Bool {
    let r = (p.rotation.truncatingRemainder(dividingBy: 90) + 90).truncatingRemainder(dividingBy: 90)
    if min(r, 90 - r) > straightAngleTolerance { return false }
    let q = isQuarterTurn(p.rotation), w = q ? p.height : p.width, h = q ? p.width : p.height, e = coverageEpsilon
    return p.centerX - w / 2 <= e && p.centerX + w / 2 >= frameW - e && p.centerY - h / 2 <= e && p.centerY + h / 2 >= frameH - e
  }
}

// MARK: - Export only (no TS twin): the one place the top-left layout meets Core Image's bottom-left origin.

extension ClipLayout {
  /// Where one oriented frame goes in the export. `orientedExtent` is the frame AFTER the track's preferred transform,
  /// in Core Image space (y-up), normally (0, 0, displayW, displayH); its ACTUAL size is used for the maths.
  /// `transform` = `local` then `outer`. The compositor draws in two steps so the crop edge stays hard:
  /// `oriented.cropped(to: cropRect).clampedToExtent().transformed(by: local).cropped(to: localRect)` (crop centre at
  /// the origin, flipped, scaled to the placed size; `localRect` is that unrotated placed box), then
  /// `.transformed(by: outer)` (rotate, move to the placed centre).
  ///
  /// The placement mirrors ClipFrame.tsx (`[{rotate}, {scaleX: ±1}, {scaleY: ±1}]` on a box centred at the placed
  /// centre): crop centre → origin, flip (local space), scale to the placed size, rotate, move to the placed centre.
  /// Core Image is y-up with counter-clockwise positive angles, so — here and only here — the layout's top-left
  /// centre (cx, cy) becomes (cx, frameH − cy), the crop's top-left y becomes a bottom-left y, and the preview's
  /// clockwise `rotation` becomes an angle of −rotation. A 90° clockwise turn on screen is therefore a 90° clockwise
  /// turn in the exported video. Flips are mirror images about the picture's own axes, the same in either origin.
  static func ciPlacement(orientedExtent e: CGRect, crop: ClipCrop, transform t: ClipTransform, frame: CGSize)
    -> (cropRect: CGRect, local: CGAffineTransform, localRect: CGRect, outer: CGAffineTransform, transform: CGAffineTransform, placed: ClipPlacement) {
    let placed = placeClip(e.size, crop, t, frame.width, frame.height)
    let cropRect = CGRect(
      x: e.minX + crop.x * e.width,
      y: e.minY + (1 - crop.y - crop.h) * e.height,     // top-left fraction → bottom-left y
      width: crop.w * e.width,
      height: crop.h * e.height)
    let local = CGAffineTransform(translationX: -cropRect.midX, y: -cropRect.midY)
      .concatenating(CGAffineTransform(scaleX: t.flipH ? -1 : 1, y: t.flipV ? -1 : 1))
      .concatenating(CGAffineTransform(scaleX: placed.width / cropRect.width, y: placed.height / cropRect.height))
    let localRect = CGRect(x: -placed.width / 2, y: -placed.height / 2, width: placed.width, height: placed.height)
    let outer = CGAffineTransform(rotationAngle: -placed.rotation * .pi / 180)
      .concatenating(CGAffineTransform(translationX: placed.centerX, y: frame.height - placed.centerY))
    return (cropRect: cropRect, local: local, localRect: localRect, outer: outer, transform: local.concatenating(outer), placed: placed)
  }
}
