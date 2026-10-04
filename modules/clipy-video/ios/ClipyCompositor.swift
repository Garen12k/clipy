import AVFoundation
import CoreImage
import CoreVideo
import Foundation
import UIKit

/// What shows where a placed picture leaves the frame uncovered (mirror of ClipFrame.tsx's background).
enum LayerBackground {
  case black
  case color(CIColor)
  case blur

  /// `type` black | color | blur; unknown types and a missing or malformed colour fall back to black (as the preview
  /// shows black), not to `UIColor(hex:)`'s white.
  init(type: String, color: String?) {
    switch type {
    case "color":
      if let color, LayerBackground.isHexColor(color) { self = .color(CIColor(color: UIColor(hex: color))) } else { self = .black }
    case "blur":
      self = .blur
    default:
      self = .black
    }
  }

  /// Exactly `#RRGGBB` (surrounding whitespace allowed, `#` optional — what `UIColor(hex:)` reads).
  static func isHexColor(_ s: String) -> Bool {
    let trimmed = s.trimmingCharacters(in: .whitespaces)
    let digits = trimmed.hasPrefix("#") ? trimmed.dropFirst() : Substring(trimmed)
    return digits.count == 6 && digits.allSatisfy { $0.isHexDigit }
  }
}

/// A clip's animation and pins as the compositor resolves them for every frame (`Motion.resolveClip`). Pin times are
/// clip-local output seconds; edge durations are the request's already-scaled ones.
struct ClipMotionSpec: Equatable {
  let keyframes: [MotionKeyframe]
  let animIn: MotionEdge?
  let animOut: MotionEdge?
  let animCombo: String?

  /// Nothing to play: no pins, no In, no Out, no Combo.
  var isEmpty: Bool { keyframes.isEmpty && animIn == nil && animOut == nil && animCombo == nil }
}

/// One source track drawn by a `ClipyInstruction`: which composition track, how to place its frames in the render
/// rect (Core Image space: bottom-left origin), what fills the uncovered frame, and its look: which filter to apply,
/// how strongly (0…1), and the Adjust values that follow it.
/// `fill` is the cover transform (`ExportSession.ciFillTransform`); `orient` uprights a frame for
/// `ClipLayout.ciPlacement`. A clip with the default transform and full crop takes the `fill` path unchanged.
final class LayerSpec {
  let trackID: CMPersistentTrackID
  let fill: CGAffineTransform
  let orient: CGAffineTransform
  let crop: ClipCrop
  let transform: ClipTransform
  let background: LayerBackground
  let filter: String?
  /// 0…1 — the mix of the unfiltered (0) and the filtered (1) frame; a non-finite value counts as 1.
  let filterIntensity: Double
  /// Applied after the filter; non-finite values count as 0. Neutral = no adjust pass at all.
  let adjust: AdjustValues
  /// True for the default clip (scale 1, no offset / rotation / flip, full crop) and for values that cannot be
  /// placed (non-finite, zero scale, empty crop): those frames are drawn exactly as before placement existed.
  let usesFill: Bool
  /// The clip's animation and pins; nil for a clip with neither — such a layer is drawn exactly as before.
  let motion: ClipMotionSpec?
  /// Composition seconds where the clip's OWN range starts (the transition handle before it is not included).
  let clipStart: Double
  /// The clip's length in the composition, in seconds (after speed).
  let clipLength: Double

  init(trackID: CMPersistentTrackID, fill: CGAffineTransform, orient: CGAffineTransform, crop: ClipCrop,
       transform: ClipTransform, background: LayerBackground, filter: String?,
       filterIntensity: Double = 1, adjust: AdjustValues = .neutral,
       motion: ClipMotionSpec? = nil, clipStart: Double = 0, clipLength: Double = 0) {
    self.motion = motion
    self.clipStart = clipStart
    self.clipLength = clipLength
    self.trackID = trackID
    self.fill = fill
    self.orient = orient
    self.crop = crop
    self.transform = transform
    self.background = background
    self.filter = filter
    self.filterIntensity = Adjust.strength(filterIntensity)
    self.adjust = adjust.sanitized
    let t = transform, c = crop
    let finite = [t.scale, t.x, t.y, t.rotation, c.x, c.y, c.w, c.h].allSatisfy { $0.isFinite }
    let placeable = finite && t.scale > 0 && c.w > 0 && c.h > 0
    self.usesFill = !placeable || (t == .identity && c == .full)
  }

  /// The clip's resolved placement and opacity for the frame at composition time `time`; nil without motion.
  /// Clip-local time is clamped to the clip's own range, so inside a transition window (before the clip's start /
  /// after its end) the clip shows its first / last moment. The base is the static transform with opacity 1 (pins,
  /// when there are any, replace it inside `Motion.resolveClip`).
  func values(at time: Double) -> KeyValues? {
    guard let motion = self.motion else { return nil }
    let local = min(max(time - clipStart, 0), clipLength)
    let base = KeyValues(x: Double(transform.x), y: Double(transform.y), scale: Double(transform.scale),
                         rotation: Double(transform.rotation), opacity: 1)
    return Motion.resolveClip(base: base, keyframes: motion.keyframes, animIn: motion.animIn, animOut: motion.animOut,
                              animCombo: motion.animCombo, local: local, length: clipLength)
  }
}

/// One timeline effect as the compositor uses it: its type (`Effects.effectIds`), its range in seconds of composition
/// time (= project time; start inclusive, end exclusive) and its intensity (0…1).
struct ActiveEffectSpec: Equatable {
  let type: String
  let start: Double
  let end: Double
  let intensity: Double

  /// The effects that can be drawn, in list order: a known type, a finite, non-empty range and a finite intensity
  /// (clamped to 0…1). Everything else is dropped, so a request without usable effects takes the path it always took.
  static func usable(_ all: [ActiveEffectSpec]) -> [ActiveEffectSpec] {
    return all.compactMap { (e: ActiveEffectSpec) -> ActiveEffectSpec? in
      guard Effects.effectIds.contains(e.type), e.start.isFinite, e.end.isFinite, e.end > e.start, e.intensity.isFinite else { return nil }
      return ActiveEffectSpec(type: e.type, start: e.start, end: e.end, intensity: min(1, max(0, e.intensity)))
    }
  }

  /// True when the effect covers any part of [from, to) (seconds).
  func overlaps(from: Double, to: Double) -> Bool {
    return start < to && end > from
  }
}

/// A plain range carries one layer; a transition window carries two (outgoing, incoming) plus the window's
/// type/start/duration, so the compositor computes progress = (t − start) / duration. `effects` are the timeline
/// effects overlapping the range (usually none).
final class ClipyInstruction: NSObject, AVVideoCompositionInstructionProtocol {
  let timeRange: CMTimeRange
  let enablePostProcessing: Bool = true          // the Core Animation tool (text/stickers) runs after us
  let containsTweening: Bool = true
  let requiredSourceTrackIDs: [NSValue]?
  let passthroughTrackID: CMPersistentTrackID = kCMPersistentTrackID_Invalid
  let layers: [LayerSpec]
  let transition: (type: String, start: CMTime, duration: CMTime)?
  let effects: [ActiveEffectSpec]

  init(timeRange: CMTimeRange, layers: [LayerSpec], transition: (type: String, start: CMTime, duration: CMTime)?, effects: [ActiveEffectSpec] = []) {
    self.timeRange = timeRange
    self.layers = layers
    self.transition = transition
    self.effects = effects
    self.requiredSourceTrackIDs = layers.map { NSNumber(value: $0.trackID) as NSValue }
    super.init()
  }
}

/// Custom compositor: renders each source frame with Core Image — placed by `ClipLayout` (crop, flip, scale, rotate,
/// offset) over its background, then the clip's filter chain at its strength, then its Adjust values — and blends
/// the two finished frames of a transition window by type and progress.
final class ClipyCompositor: NSObject, AVVideoCompositing {
  private let ctx = CIContext(options: [.cacheIntermediates: false])

  var sourcePixelBufferAttributes: [String: Any]? {
    [kCVPixelBufferPixelFormatTypeKey as String: [NSNumber(value: kCVPixelFormatType_32BGRA)]]
  }

  var requiredPixelBufferAttributesForRenderContext: [String: Any] {
    [kCVPixelBufferPixelFormatTypeKey as String: [NSNumber(value: kCVPixelFormatType_32BGRA)]]
  }

  func renderContextChanged(_ newRenderContext: AVVideoCompositionRenderContext) {}

  func startRequest(_ req: AVAsynchronousVideoCompositionRequest) {
    guard let inst = req.videoCompositionInstruction as? ClipyInstruction, let out = req.renderContext.newPixelBuffer() else {
      req.finish(with: NSError(domain: "Clipy", code: 1, userInfo: [NSLocalizedDescriptionKey: "Video compositor could not render a frame"]))
      return
    }
    let size = req.renderContext.size
    let rect = CGRect(origin: .zero, size: size)

    let time = req.compositionTime.seconds              // output seconds (the grain moves with it)

    let black = CIImage(color: CIColor.black).cropped(to: rect)

    /// One clip's composed frame (placed picture over its background), then its look (filter at its strength, then
    /// adjust) — as the preview draws it.
    func frame(_ spec: LayerSpec) -> CIImage? {
      guard let pb = req.sourceFrame(byTrackID: spec.trackID) else { return nil }
      let source = CIImage(cvPixelBuffer: pb)
      let img: CIImage
      if let motion = spec.motion {
        // Animated / keyframed clip: the resolved transform replaces the static one (never the `usesFill` shortcut).
        img = ClipyCompositor.movingFrame(spec, motion: motion, source: source, time: time, size: size)
      } else if spec.usesFill {
        img = source.transformed(by: spec.fill).cropped(to: rect)       // unchanged pre-placement path
      } else {
        let oriented = source.transformed(by: spec.orient)
        let p = ClipLayout.ciPlacement(orientedExtent: oriented.extent, crop: spec.crop, transform: spec.transform, frame: size)
        // Hard crop edges: clamp the cropped picture so scaling never samples transparency across the crop border,
        // cut it back to the placed box while still unrotated, and only then rotate + translate (a rotated picture's
        // edges are the box's own edges, with no clamped smear in the corners).
        let picture = oriented.cropped(to: p.cropRect).clampedToExtent()
          .transformed(by: p.local).cropped(to: p.localRect)
          .transformed(by: p.outer)
        let covered = ClipLayout.coversFrame(p.placed, size.width, size.height)
        let behind = covered ? black : ClipyCompositor.background(spec, source: source, size: size)
        img = picture.composited(over: behind).cropped(to: rect)
      }
      return ClipyCompositor.look(spec, on: img, time: time)
    }

    var result = black
    if let t = inst.transition, inst.layers.count == 2 {
      let a = frame(inst.layers[0])
      let b = frame(inst.layers[1])
      if let a, let b {
        let elapsed = CMTimeSubtract(req.compositionTime, t.start).seconds
        let total = t.duration.seconds
        let p = CGFloat(total > 0 ? max(0, min(1, elapsed / total)) : 1)
        result = ClipyCompositor.blend(type: t.type, from: a, to: b, progress: p, size: size)
      } else if let only = a ?? b {
        // A handle had no source material and no hold could be built: show whichever frame exists.
        result = only
      }
    } else if let first = inst.layers.first, let a = frame(first) {
      result = a
    }
    // Timeline effects on the finished frame, in list order (start inclusive, end exclusive — as `activeEffects`).
    // With no active effect `result` is not touched.
    for effect in inst.effects where time >= effect.start && time < effect.end {
      result = EffectRenderer.apply(type: effect.type, image: result.cropped(to: rect),
                                    t: time - effect.start, d: effect.end - effect.start, k: effect.intensity, size: size)
    }
    ctx.render(result.cropped(to: rect).composited(over: black), to: out)
    req.finish(withComposedVideoFrame: out)
  }

  func cancelAllPendingVideoCompositionRequests() {}

  /// A composed clip frame's look: the filter chain mixed in at the clip's strength (`original·(1 − s) + filtered·s`;
  /// s = 1 skips the mix, s = 0 or no filter skips the chain), then the Adjust recipe (skipped when neutral). A clip
  /// with the defaults (strength 1, neutral adjust) gets exactly `Effects.apply(chain, to: img)`, as before.
  static func look(_ spec: LayerSpec, on img: CIImage, time: Double) -> CIImage {
    var out = img
    let chain = Effects.filterChain(spec.filter)
    if !chain.isEmpty, spec.filterIntensity > 0 {
      let filtered = Effects.apply(chain, to: img)
      out = spec.filterIntensity >= 1
        ? filtered
        : dissolve(from: img, to: filtered, progress: CGFloat(spec.filterIntensity)).cropped(to: img.extent)
    }
    return spec.adjust.isNeutral ? out : Adjust.apply(spec.adjust, to: out, time: time)
  }

  /// One frame of a clip with motion: the picture placed by the transform resolved for `time` (flips from the static
  /// transform), its alpha multiplied by the resolved opacity, over the clip's background. The background is drawn
  /// when the picture does not cover the frame OR is not fully opaque. A picture that cannot be seen (scale ≤ 0 or
  /// opacity ≤ 0) leaves just the background; values that cannot be placed (non-finite, empty crop) fall back to the
  /// plain cover (`fill`) frame, as for a clip without motion.
  static func movingFrame(_ spec: LayerSpec, motion: ClipMotionSpec, source: CIImage, time: Double, size: CGSize) -> CIImage {
    let rect = CGRect(origin: .zero, size: size)
    let plain = source.transformed(by: spec.fill).cropped(to: rect)
    guard let v = spec.values(at: time) else { return plain }
    let t = ClipTransform(scale: CGFloat(v.scale), x: CGFloat(v.x), y: CGFloat(v.y), rotation: CGFloat(v.rotation),
                          flipH: spec.transform.flipH, flipV: spec.transform.flipV)
    let c = spec.crop
    let finite = [t.scale, t.x, t.y, t.rotation, c.x, c.y, c.w, c.h].allSatisfy { $0.isFinite } && v.opacity.isFinite
    guard finite, c.w > 0, c.h > 0 else { return plain }
    guard t.scale > 0, v.opacity > 0 else { return background(spec, source: source, size: size) }
    let oriented = source.transformed(by: spec.orient)
    let p = ClipLayout.ciPlacement(orientedExtent: oriented.extent, crop: spec.crop, transform: t, frame: size)
    // Same hard-edged drawing as the static placement in `startRequest`.
    let picture = oriented.cropped(to: p.cropRect).clampedToExtent()
      .transformed(by: p.local).cropped(to: p.localRect)
      .transformed(by: p.outer)
    let covered = v.opacity >= 1 && ClipLayout.coversFrame(p.placed, size.width, size.height)
    let behind = covered ? CIImage(color: CIColor.black).cropped(to: rect) : background(spec, source: source, size: size)
    return faded(picture, opacity: v.opacity).composited(over: behind).cropped(to: rect)
  }

  /// `image` with its alpha multiplied by `opacity` (`CIColorMatrix`: A vector (0, 0, 0, opacity); the colour vectors
  /// keep their identity defaults). Fully opaque (≥ 1) skips the filter; so does a missing filter.
  static func faded(_ image: CIImage, opacity: Double) -> CIImage {
    guard opacity < 1 else { return image }
    return Adjust.filtered(image, "CIColorMatrix", ["inputAVector": CIVector(x: 0, y: 0, z: 0, w: CGFloat(opacity))]) ?? image
  }

  /// Blur radius as a fraction of the frame's shorter side.
  static let blurRadiusFactor: CGFloat = 0.04

  /// The full-frame background behind a picture that does not cover the frame: black, a constant colour, or the same
  /// source frame scaled to cover (the `fill` transform) and blurred — clamped first so the blur has no transparent
  /// edges, then cropped back to the frame.
  static func background(_ spec: LayerSpec, source: CIImage, size: CGSize) -> CIImage {
    let rect = CGRect(origin: .zero, size: size)
    switch spec.background {
    case .black:
      return CIImage(color: CIColor.black).cropped(to: rect)
    case .color(let c):
      return CIImage(color: c).cropped(to: rect)
    case .blur:
      let radius = blurRadiusFactor * min(size.width, size.height)
      return source.transformed(by: spec.fill)
        .clampedToExtent()
        .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: NSNumber(value: Double(radius))])
        .cropped(to: rect)
    }
  }

  /// Blends outgoing `a` into incoming `b` at progress `p` (0 → all `a`, 1 → all `b`). Unknown types dissolve.
  static func blend(type: String, from a: CIImage, to b: CIImage, progress p: CGFloat, size: CGSize) -> CIImage {
    let rect = CGRect(origin: .zero, size: size)
    switch type {
    case "fade":
      // To black over the first half, then from black over the second half.
      let k = p < 0.5 ? 1 - p * 2 : (p - 0.5) * 2
      let src = p < 0.5 ? a : b
      return src.applyingFilter("CIColorMatrix", parameters: [
        "inputRVector": CIVector(x: k, y: 0, z: 0, w: 0),
        "inputGVector": CIVector(x: 0, y: k, z: 0, w: 0),
        "inputBVector": CIVector(x: 0, y: 0, z: k, w: 0),
      ]).cropped(to: rect)
    case "slide":
      // Incoming enters from the right while the outgoing frame leaves to the left.
      let dx = (1 - p) * size.width
      let incoming = b.transformed(by: CGAffineTransform(translationX: dx, y: 0))
      let outgoing = a.transformed(by: CGAffineTransform(translationX: dx - size.width, y: 0))
      return incoming.composited(over: outgoing).cropped(to: rect)
    case "zoom":
      // Outgoing scales up about the centre (1 → 1.2) while cross-dissolving into the incoming frame.
      let s = 1 + 0.2 * p
      let zoom = CGAffineTransform(scaleX: s, y: s)
        .concatenating(CGAffineTransform(translationX: -size.width * (s - 1) / 2, y: -size.height * (s - 1) / 2))
      let scaled = a.transformed(by: zoom).cropped(to: rect)
      return dissolve(from: scaled, to: b, progress: p).cropped(to: rect)
    case "slideRight":
      // Mirror of "slide": incoming enters from the left (x from −width to 0), outgoing leaves to the right.
      return push(from: a, to: b, progress: p, dx: -size.width, dy: 0).cropped(to: rect)
    case "slideUp":
      // ON SCREEN the incoming frame enters from the bottom edge and moves up; the outgoing leaves through the top.
      // Core Image is y-up, so the bottom of the screen is y = 0 and "below the screen" is NEGATIVE y: the incoming
      // starts at y = −height and rises to 0, while the outgoing moves from 0 to +height.
      return push(from: a, to: b, progress: p, dx: 0, dy: -size.height).cropped(to: rect)
    case "slideDown":
      // The opposite: on screen the incoming enters from the top edge (y-up: starts at +height, falls to 0) and the
      // outgoing leaves through the bottom (0 → −height).
      return push(from: a, to: b, progress: p, dx: 0, dy: size.height).cropped(to: rect)
    case "wipe":
      // Nothing moves: the incoming frame is revealed behind a hard edge travelling left → right.
      let edge = p * size.width
      if edge <= 0 { return a.cropped(to: rect) }                 // nothing revealed yet (no empty-rect crop)
      return b.cropped(to: CGRect(x: 0, y: 0, width: edge, height: size.height)).composited(over: a).cropped(to: rect)
    case "spin":
      // Outgoing turns 0 → 90° clockwise ON SCREEN about the frame centre and shrinks 1 → 0.6, over black, while
      // dissolving into the incoming frame. Core Image is y-up with counter-clockwise positive angles, so a clockwise
      // on-screen turn is a NEGATIVE angle (the convention of `ClipLayout.ciPlacement`).
      let s = 1 - 0.4 * p
      let turn = CGAffineTransform(translationX: -size.width / 2, y: -size.height / 2)
        .concatenating(CGAffineTransform(rotationAngle: -p * .pi / 2))
        .concatenating(CGAffineTransform(scaleX: s, y: s))
        .concatenating(CGAffineTransform(translationX: size.width / 2, y: size.height / 2))
      let black = CIImage(color: CIColor.black).cropped(to: rect)
      let spun = a.transformed(by: turn).composited(over: black).cropped(to: rect)
      return dissolve(from: spun, to: b, progress: p).cropped(to: rect)
    case "blur":
      // Both frames carry the same blur — none at either end, strongest in the middle — and cross-dissolve
      // throughout, so the picture never jumps (a sharp frame never meets a fully blurred one).
      let r = blurTransitionRadius(p, size: size)
      return dissolve(from: blurred(a, radius: r, rect: rect), to: blurred(b, radius: r, rect: rect), progress: p).cropped(to: rect)
    default:
      return dissolve(from: a, to: b, progress: p).cropped(to: rect)
    }
  }

  /// The blur transition's radius at progress `p`: `blurRadiusFactor` × the shorter side × (1 − |2p − 1|) — 0 at
  /// p = 0 and p = 1, the full radius at p = 0.5, linear in between.
  static func blurTransitionRadius(_ p: CGFloat, size: CGSize) -> CGFloat {
    return blurRadiusFactor * min(size.width, size.height) * (1 - abs(2 * p - 1))
  }

  /// A push: the incoming frame starts displaced by (dx, dy) and travels to the origin while the outgoing frame is
  /// pushed out ahead of it by the same amount (at p = 0 only `a` is in the frame, at p = 1 only `b`). Not cropped.
  static func push(from a: CIImage, to b: CIImage, progress p: CGFloat, dx: CGFloat, dy: CGFloat) -> CIImage {
    let incoming = b.transformed(by: CGAffineTransform(translationX: (1 - p) * dx, y: (1 - p) * dy))
    let outgoing = a.transformed(by: CGAffineTransform(translationX: -p * dx, y: -p * dy))
    return incoming.composited(over: outgoing)
  }

  /// `img` Gaussian-blurred by `radius` pixels — clamped first so the blur has no transparent edges, then cropped back
  /// to `rect`. A radius of 0 (or less, or non-finite) returns the image untouched.
  static func blurred(_ img: CIImage, radius: CGFloat, rect: CGRect) -> CIImage {
    guard radius.isFinite, radius > 0 else { return img }
    return img.clampedToExtent()
      .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: NSNumber(value: Double(radius))])
      .cropped(to: rect)
  }

  static func dissolve(from a: CIImage, to b: CIImage, progress p: CGFloat) -> CIImage {
    a.applyingFilter("CIDissolveTransition", parameters: [
      "inputTargetImage": b,
      "inputTime": NSNumber(value: Double(p)),
    ])
  }
}
