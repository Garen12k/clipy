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
/// The same type describes a picture-in-picture layer (`transparent`): it is drawn over the finished main frame
/// instead of over a background of its own (`ClipyInstruction.overlays`).
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
  /// The picture's own (static) opacity, 0…1; multiplied with the motion opacity. A non-finite value counts as 1.
  let opacity: Double
  /// none | rounded | circle — the picture box's corners (`ClipLayout.maskRadius`); anything else counts as none.
  let mask: String
  /// A picture-in-picture layer: drawn over what is beneath it, with no background of its own, and its look
  /// (filter, adjust) applied to its picture alone.
  let transparent: Bool
  /// How a picture-in-picture layer is mixed with what is beneath it: normal (source-over) or one of
  /// `ClipyCompositor.blendFilters`; anything else counts as normal. A main clip is always drawn normally.
  let blend: String
  /// The green screen; nil for none — also for a key colour that cannot key (not `#RRGGBB`, or grey).
  let chroma: ChromaKey?
  /// True for the default clip (scale 1, no offset / rotation / flip, full crop, opaque, no mask, no green screen)
  /// and for values
  /// that cannot be placed (non-finite, zero scale, empty crop): those frames are drawn exactly as before placement
  /// existed.
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
       opacity: Double = 1, mask: String = "none", transparent: Bool = false, blend: String = "normal", chroma: ChromaKey? = nil,
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
    let shown = opacity.isFinite ? min(1, max(0, opacity)) : 1
    self.opacity = shown
    self.mask = mask
    self.transparent = transparent
    self.blend = ClipyCompositor.blendFilters[blend] != nil ? blend : "normal"
    let key: ChromaKey? = chroma.flatMap { (c: ChromaKey) -> ChromaKey? in Chroma.usableKey(c.color) != nil ? c : nil }
    self.chroma = key
    let t = transform, c = crop
    let finite = [t.scale, t.x, t.y, t.rotation, c.x, c.y, c.w, c.h].allSatisfy { $0.isFinite }
    let placeable = finite && t.scale > 0 && c.w > 0 && c.h > 0
    // A see-through, masked or keyed picture shows what is behind it, so it is placed even at the default transform.
    let plain = shown >= 1 && mask != "rounded" && mask != "circle" && !transparent && key == nil
    self.usesFill = !placeable || (t == .identity && c == .full && plain)
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
  /// A blur / mosaic box's rectangle (fractions of the frame, top-left origin); nil for every other effect.
  var rect: RegionRect? = nil

  /// The effects that can be drawn, in list order: a known type, a finite, non-empty range and a finite intensity
  /// (clamped to 0…1). Everything else is dropped, so a request without usable effects takes the path it always took.
  static func usable(_ all: [ActiveEffectSpec]) -> [ActiveEffectSpec] {
    return all.compactMap { (e: ActiveEffectSpec) -> ActiveEffectSpec? in
      guard Effects.effectIds.contains(e.type), e.start.isFinite, e.end.isFinite, e.end > e.start, e.intensity.isFinite else { return nil }
      return ActiveEffectSpec(type: e.type, start: e.start, end: e.end, intensity: min(1, max(0, e.intensity)), rect: e.rect)
    }
  }

  /// True when the effect covers any part of [from, to) (seconds).
  func overlaps(from: Double, to: Double) -> Bool {
    return start < to && end > from
  }
}

/// A plain range carries one layer; a transition window carries two (outgoing, incoming) plus the window's
/// type/start/duration, so the compositor computes progress = (t − start) / duration. `overlays` are the
/// picture-in-picture layers shown during the whole range, in draw order (usually none); `effects` are the timeline
/// effects overlapping the range (usually none).
final class ClipyInstruction: NSObject, AVVideoCompositionInstructionProtocol {
  let timeRange: CMTimeRange
  let enablePostProcessing: Bool = true          // the Core Animation tool (text/stickers) runs after us
  let containsTweening: Bool = true
  let requiredSourceTrackIDs: [NSValue]?
  let passthroughTrackID: CMPersistentTrackID = kCMPersistentTrackID_Invalid
  let layers: [LayerSpec]
  let transition: (type: String, start: CMTime, duration: CMTime)?
  let overlays: [LayerSpec]
  let effects: [ActiveEffectSpec]

  init(timeRange: CMTimeRange, layers: [LayerSpec], transition: (type: String, start: CMTime, duration: CMTime)?, overlays: [LayerSpec] = [], effects: [ActiveEffectSpec] = []) {
    self.timeRange = timeRange
    self.layers = layers
    self.transition = transition
    self.overlays = overlays
    self.effects = effects
    self.requiredSourceTrackIDs = (layers + overlays).map { NSNumber(value: $0.trackID) as NSValue }
    super.init()
  }
}

/// Custom compositor: renders each source frame with Core Image — placed by `ClipLayout` (crop, flip, scale, rotate,
/// offset) over its background, then the clip's filter chain at its strength, then its Adjust values — and blends
/// the two finished frames of a transition window by type and progress. Picture-in-picture layers are then drawn
/// over that frame in order, and the timeline effects go over everything.
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
      if spec.motion != nil {
        // Animated / keyframed clip: the resolved transform replaces the static one (never the `usesFill` shortcut).
        img = ClipyCompositor.movingFrame(spec, source: source, time: time, size: size)
      } else if spec.usesFill {
        img = source.transformed(by: spec.fill).cropped(to: rect)       // unchanged pre-placement path
      } else {
        img = ClipyCompositor.placedFrame(spec, transform: spec.transform, opacity: 1, source: source, size: size)
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
    // Picture-in-picture layers over the main frame, in draw order (later = on top). A layer with no frame at this
    // time is left out. With no overlays `result` is not touched.
    for overlay in inst.overlays {
      guard let pb = req.sourceFrame(byTrackID: overlay.trackID) else { continue }
      result = ClipyCompositor.overlayFrame(overlay, source: CIImage(cvPixelBuffer: pb), over: result.cropped(to: rect), time: time, size: size)
    }
    // Timeline effects on the finished frame, in list order (start inclusive, end exclusive — as `activeEffects`).
    // With no active effect `result` is not touched.
    for effect in inst.effects where time >= effect.start && time < effect.end {
      result = EffectRenderer.apply(type: effect.type, image: result.cropped(to: rect),
                                    t: time - effect.start, d: effect.end - effect.start, k: effect.intensity, size: size, region: effect.rect)
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
  /// transform) and faded by the resolved opacity over the clip's background (`placedFrame`). A picture that cannot
  /// be seen (scale ≤ 0 or opacity ≤ 0) leaves just the background; values that cannot be placed (non-finite, empty
  /// crop) fall back to the plain cover (`fill`) frame, as for a clip without motion.
  static func movingFrame(_ spec: LayerSpec, source: CIImage, time: Double, size: CGSize) -> CIImage {
    let rect = CGRect(origin: .zero, size: size)
    let plain = source.transformed(by: spec.fill).cropped(to: rect)
    guard let v = spec.values(at: time) else { return plain }
    let t = ClipTransform(scale: CGFloat(v.scale), x: CGFloat(v.x), y: CGFloat(v.y), rotation: CGFloat(v.rotation),
                          flipH: spec.transform.flipH, flipV: spec.transform.flipV)
    let c = spec.crop
    let finite = [t.scale, t.x, t.y, t.rotation, c.x, c.y, c.w, c.h].allSatisfy { $0.isFinite } && v.opacity.isFinite
    guard finite, c.w > 0, c.h > 0 else { return plain }
    guard t.scale > 0, v.opacity > 0 else { return background(spec, source: source, size: size) }
    return placedFrame(spec, transform: t, opacity: v.opacity, source: source, size: size)
  }

  /// One picture-in-picture layer drawn over `running` (the finished frame beneath it) at composition time `time`:
  /// always placed (`placedFrame`, never the cover shortcut), by its static transform or — with an animation or
  /// pins — the one resolved for `time` (flips from the static transform), and faded by the resolved opacity. A
  /// layer that cannot be seen or placed (scale ≤ 0, opacity ≤ 0, non-finite values, empty crop) leaves `running`
  /// as it is.
  static func overlayFrame(_ spec: LayerSpec, source: CIImage, over running: CIImage, time: Double, size: CGSize) -> CIImage {
    var t = spec.transform
    var fade = 1.0
    if let v = spec.values(at: time) {
      t = ClipTransform(scale: CGFloat(v.scale), x: CGFloat(v.x), y: CGFloat(v.y), rotation: CGFloat(v.rotation),
                        flipH: spec.transform.flipH, flipV: spec.transform.flipV)
      fade = v.opacity
    }
    let c = spec.crop
    let finite = [t.scale, t.x, t.y, t.rotation, c.x, c.y, c.w, c.h].allSatisfy { $0.isFinite } && fade.isFinite
    guard finite, c.w > 0, c.h > 0, t.scale > 0, fade > 0, spec.opacity > 0 else { return running }
    return placedFrame(spec, transform: t, opacity: fade, source: source, size: size, over: running, time: time)
  }

  /// A clip's picture placed by `transform` (`ClipLayout.ciPlacement`: crop, flip, scale, rotate, offset) over its
  /// background, cropped to the frame — the one drawing chain of a still placed clip (`opacity` 1), of a clip
  /// with motion and of a picture-in-picture layer. `transform` must be placeable (finite, scale > 0) and the crop
  /// non-empty: the callers check.
  /// The background (black / colour / blur) is drawn when the picture does not cover the frame, is not fully
  /// opaque OR is masked; a covering, opaque, unmasked picture gets plain black behind it (never seen, and no blur
  /// is computed). A layer (`running` given) has no background: it is drawn over `running`.
  /// Opacity (`opacity` × the spec's own): ≥ 1 → the picture over what is behind it, no dissolve; ≤ 0 → what is
  /// behind it only; in between → a dissolve FROM that TO the picture-over-it at the opacity. Both ends are opaque
  /// full frames, so the result is `behind·(1 − opacity) + picture·opacity` whatever alpha convention the picture
  /// carries.
  /// Mask: the unrotated picture box is cut to a rounded rectangle (`ClipLayout.maskRadius`) BEFORE the rotation,
  /// so the mask turns with the picture; radius 0 (no mask) leaves the chain exactly as it was.
  /// Look: a transparent layer's filter and adjust are applied to its own picture box (at `time`, for the grain),
  /// before the mask; a main clip's look is applied to its whole composed frame by the caller, as before.
  /// Green screen (`spec.chroma`): the key colour is made see-through after the look and before the mask, so what
  /// is behind the picture shows through — the running frame for a layer, the clip's own background for a main
  /// clip (drawn even when the picture covers the frame). Without a key the chain is exactly as it was.
  /// Blend (`spec.blend`, layers only): any mode but normal replaces the source-over step (`blended`); the opacity
  /// then mixes between the running frame and that result, as it does for a normal layer.
  static func placedFrame(_ spec: LayerSpec, transform: ClipTransform, opacity: Double, source: CIImage, size: CGSize, over running: CIImage? = nil, time: Double = 0) -> CIImage {
    let rect = CGRect(origin: .zero, size: size)
    let opacity = opacity * spec.opacity             // the spec's own opacity is 1 unless the picture is see-through
    let oriented = source.transformed(by: spec.orient)
    let p = ClipLayout.ciPlacement(orientedExtent: oriented.extent, crop: spec.crop, transform: transform, frame: size)
    // Hard crop edges: clamp the cropped picture so scaling never samples transparency across the crop border,
    // cut it back to the placed box while still unrotated, and only then rotate + translate (a rotated picture's
    // edges are the box's own edges, with no clamped smear in the corners).
    let boxed = oriented.cropped(to: p.cropRect).clampedToExtent()
      .transformed(by: p.local).cropped(to: p.localRect)
    let radius = ClipLayout.maskRadius(p.placed.width, p.placed.height, spec.mask)
    let looked = spec.transparent ? look(spec, on: boxed, time: time) : boxed
    var keyed = looked
    if let chroma = spec.chroma {
      keyed = Chroma.apply(to: looked, key: chroma.color, strength: chroma.strength)
    }
    let picture = (radius > 0 ? rounded(keyed, rect: p.localRect, radius: radius) : keyed)
      .transformed(by: p.outer)
    let covered = opacity >= 1 && ClipLayout.coversFrame(p.placed, size.width, size.height)
    let behind: CIImage
    if let running {
      behind = running.cropped(to: rect)
    } else if spec.transparent {
      behind = CIImage(color: CIColor.clear).cropped(to: rect)
    } else {
      behind = covered && radius <= 0 && spec.chroma == nil ? CIImage(color: CIColor.black).cropped(to: rect) : background(spec, source: source, size: size)
    }
    guard opacity > 0 else { return behind }
    if running != nil, spec.blend != "normal", let mixed = blended(picture, over: behind, mode: spec.blend, rect: rect) {
      // A layer with a blend mode: `mixed` stands where the source-over picture would, then the same opacity mix.
      return opacity < 1 ? dissolve(from: behind, to: mixed, progress: CGFloat(opacity)).cropped(to: rect) : mixed
    }
    let over = picture.composited(over: behind).cropped(to: rect)
    guard opacity < 1 else { return over }
    return dissolve(from: behind, to: over, progress: CGFloat(opacity)).cropped(to: rect)
  }

  /// The Core Image filter of each blend mode other than normal (`BLEND_IDS` in src/editor/model/types.ts).
  static let blendFilters: [String: String] = [
    "screen": "CIScreenBlendMode", "multiply": "CIMultiplyBlendMode", "overlay": "CIOverlayBlendMode",
    "lighten": "CILightenBlendMode", "darken": "CIDarkenBlendMode",
  ]

  /// The layer `picture` blended onto `running` (an opaque full frame) with `mode`, cropped to the frame `rect`.
  /// With the picture's colour Cs and alpha αs and the running frame B, the result is
  /// `αs · Blend(Cs, B) + (1 − αs) · B` — the picture's alpha counts ONCE:
  ///  1. `solid`: the picture made opaque, its colour kept (`CIColorMatrix` with the alpha row zeroed and an alpha
  ///     bias of 1). `picture` is premultiplied (Cs·αs, αs); `CIColorMatrix` is one of the filters that work on
  ///     unpremultiplied colour — it divides by alpha, applies the matrix and multiplies by the NEW alpha — so the
  ///     output is (Cs, 1), not the darkened (Cs·αs, 1). Where αs is 0 there is no colour to recover (black), and
  ///     step 3 gives that pixel no weight. The bias makes the result opaque everywhere, hence the crop.
  ///     UNVERIFIED until first build: that `CIColorMatrix` unpremultiplies first. If it did not, soft edges of a
  ///     blended layer would be too dark (never wrong where the picture is opaque).
  ///  2. `mixed`: the blend filter with `solid` as its input and the running frame as its background — both
  ///     opaque, so this is plain Blend(Cs, B).
  ///  3. `mixed` kept in proportion to the picture's own alpha (`CIBlendWithAlphaMask`, the mask being the picture
  ///     itself), with the running frame for the rest — so nothing outside the picture can change either.
  /// (Handing the blend filter the picture with its alpha, as before, weighted soft edges by αs twice.)
  /// Nil (the caller draws the picture source-over, as for normal) for an unknown mode or a missing filter / key.
  static func blended(_ picture: CIImage, over running: CIImage, mode: String, rect: CGRect) -> CIImage? {
    let top = picture.cropped(to: rect)
    guard let name = blendFilters[mode],
          let solid = Adjust.filtered(top, "CIColorMatrix", [
            "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 0),
            "inputBiasVector": CIVector(x: 0, y: 0, z: 0, w: 1),
          ]),
          let mixed = Adjust.filtered(solid.cropped(to: rect), name, [kCIInputBackgroundImageKey: running]),
          let inside = Adjust.filtered(mixed.cropped(to: rect), "CIBlendWithAlphaMask", [
            kCIInputBackgroundImageKey: running,
            "inputMaskImage": top,
          ])
    else { return nil }
    return inside.cropped(to: rect)
  }

  /// `image` — the unrotated picture box, filling `rect` — cut to a rounded rectangle with corners of `radius`:
  /// kept inside the shape, transparent outside it (`CIBlendWithMask` with a white-on-black mask and a clear
  /// background). When no shape can be made the picture is returned unmasked.
  static func rounded(_ image: CIImage, rect: CGRect, radius: CGFloat) -> CIImage {
    guard let shape = roundedShape(rect: rect, radius: radius) else { return image }
    let mask = shape.composited(over: CIImage(color: CIColor.black).cropped(to: rect)).cropped(to: rect)
    return image.applyingFilter("CIBlendWithMask", parameters: [
      "inputBackgroundImage": CIImage(color: CIColor.clear).cropped(to: rect),
      "inputMaskImage": mask,
    ]).cropped(to: rect)
  }

  /// A white rounded rectangle filling `rect` (transparent outside its corners), the radius capped at half the
  /// shorter side. Core Image's generator is used when it is there and declares the three keys set here —
  /// `setValue(_:forKey:)` is never called with a key the filter does not list, so a wrong name cannot raise;
  /// otherwise the shape is drawn with Core Graphics. Nil when there is nothing to draw.
  static func roundedShape(rect: CGRect, radius: CGFloat) -> CIImage? {
    // The sides are checked too: the Core Graphics fallback turns them into Ints, which traps on a non-finite value.
    guard radius.isFinite, !rect.isEmpty, !rect.isInfinite, rect.width.isFinite, rect.height.isFinite else { return nil }
    let r = min(radius, min(rect.width, rect.height) / 2)
    guard r > 0 else { return nil }
    if let f = CIFilter(name: "CIRoundedRectangleGenerator") {
      let keys = f.inputKeys
      if keys.contains("inputExtent"), keys.contains("inputRadius"), keys.contains("inputColor") {
        f.setValue(CIVector(cgRect: rect), forKey: "inputExtent")
        f.setValue(NSNumber(value: Double(r)), forKey: "inputRadius")
        f.setValue(CIColor.white, forKey: "inputColor")
        if let shape = f.outputImage { return shape.cropped(to: rect) }
      }
    }
    return drawnRoundedShape(rect: rect, radius: r)
  }

  /// Largest side, in pixels, of a mask drawn with Core Graphics (the fallback): a bigger box is left unmasked.
  static let drawnMaskMaxSide = 8192

  /// The fallback shape: the rounded rectangle filled white on black in an 8-bit grey bitmap of the box's size,
  /// wrapped as an image and moved to `rect`'s origin. `radius` must be at most half the shorter side (the caller
  /// caps it). Nil when the box is too large or the bitmap cannot be made.
  static func drawnRoundedShape(rect: CGRect, radius: CGFloat) -> CIImage? {
    let w = Int(rect.width.rounded(.up)), h = Int(rect.height.rounded(.up))
    guard w > 0, h > 0, w <= drawnMaskMaxSide, h <= drawnMaskMaxSide,
          let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)
    else { return nil }
    ctx.setFillColor(gray: 0, alpha: 1)
    ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    ctx.setFillColor(gray: 1, alpha: 1)
    ctx.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: rect.width, height: rect.height),
                       cornerWidth: radius, cornerHeight: radius, transform: nil))
    ctx.fillPath()
    guard let drawn = ctx.makeImage() else { return nil }
    return CIImage(cgImage: drawn).transformed(by: CGAffineTransform(translationX: rect.minX, y: rect.minY))
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
