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

  /// `type` black | color | blur; unknown types and a colour without a value fall back to black.
  init(type: String, color: String?) {
    switch type {
    case "color":
      if let color { self = .color(CIColor(color: UIColor(hex: color))) } else { self = .black }
    case "blur":
      self = .blur
    default:
      self = .black
    }
  }
}

/// One source track drawn by a `ClipyInstruction`: which composition track, how to place its frames in the render
/// rect (Core Image space: bottom-left origin), what fills the uncovered frame, and which filter to apply.
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
  /// True for the default clip (scale 1, no offset / rotation / flip, full crop) and for values that cannot be
  /// placed (non-finite, zero scale, empty crop): those frames are drawn exactly as before placement existed.
  let usesFill: Bool

  init(trackID: CMPersistentTrackID, fill: CGAffineTransform, orient: CGAffineTransform, crop: ClipCrop,
       transform: ClipTransform, background: LayerBackground, filter: String?) {
    self.trackID = trackID
    self.fill = fill
    self.orient = orient
    self.crop = crop
    self.transform = transform
    self.background = background
    self.filter = filter
    let t = transform, c = crop
    let finite = [t.scale, t.x, t.y, t.rotation, c.x, c.y, c.w, c.h].allSatisfy { $0.isFinite }
    let placeable = finite && t.scale > 0 && c.w > 0 && c.h > 0
    self.usesFill = !placeable || (t == .identity && c == .full)
  }
}

/// A plain range carries one layer; a transition window carries two (outgoing, incoming) plus the window's
/// type/start/duration, so the compositor computes progress = (t − start) / duration.
final class ClipyInstruction: NSObject, AVVideoCompositionInstructionProtocol {
  let timeRange: CMTimeRange
  let enablePostProcessing: Bool = true          // the Core Animation tool (text/stickers) runs after us
  let containsTweening: Bool = true
  let requiredSourceTrackIDs: [NSValue]?
  let passthroughTrackID: CMPersistentTrackID = kCMPersistentTrackID_Invalid
  let layers: [LayerSpec]
  let transition: (type: String, start: CMTime, duration: CMTime)?

  init(timeRange: CMTimeRange, layers: [LayerSpec], transition: (type: String, start: CMTime, duration: CMTime)?) {
    self.timeRange = timeRange
    self.layers = layers
    self.transition = transition
    self.requiredSourceTrackIDs = layers.map { NSNumber(value: $0.trackID) as NSValue }
    super.init()
  }
}

/// Custom compositor: renders each source frame with Core Image — placed by `ClipLayout` (crop, flip, scale, rotate,
/// offset) over its background, then the clip's filter chain — and blends the two frames of a transition window by
/// type and progress.
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

    let black = CIImage(color: CIColor.black).cropped(to: rect)

    /// One clip's composed frame (placed picture over its background), then its filter — as the preview draws it.
    func frame(_ spec: LayerSpec) -> CIImage? {
      guard let pb = req.sourceFrame(byTrackID: spec.trackID) else { return nil }
      let source = CIImage(cvPixelBuffer: pb)
      let img: CIImage
      if spec.usesFill {
        img = source.transformed(by: spec.fill).cropped(to: rect)       // unchanged pre-placement path
      } else {
        let oriented = source.transformed(by: spec.orient)
        let p = ClipLayout.ciPlacement(orientedExtent: oriented.extent, crop: spec.crop, transform: spec.transform, frame: size)
        let picture = oriented.cropped(to: p.cropRect).transformed(by: p.transform)
        let covered = ClipLayout.coversFrame(p.placed, size.width, size.height)
        let behind = covered ? black : ClipyCompositor.background(spec, source: source, size: size)
        img = picture.composited(over: behind).cropped(to: rect)
      }
      return Effects.apply(Effects.filterChain(spec.filter), to: img)
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
    ctx.render(result.cropped(to: rect).composited(over: black), to: out)
    req.finish(withComposedVideoFrame: out)
  }

  func cancelAllPendingVideoCompositionRequests() {}

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
    default:
      return dissolve(from: a, to: b, progress: p).cropped(to: rect)
    }
  }

  static func dissolve(from a: CIImage, to b: CIImage, progress p: CGFloat) -> CIImage {
    a.applyingFilter("CIDissolveTransition", parameters: [
      "inputTargetImage": b,
      "inputTime": NSNumber(value: Double(p)),
    ])
  }
}
