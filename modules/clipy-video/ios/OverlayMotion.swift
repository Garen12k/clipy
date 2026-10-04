import Foundation

/// The pure part of text / sticker motion in the export: where an overlay is at each sample of its life. The layer
/// part (`ExportSession.addMotion`) turns the samples into Core Animation keyframes. No formula lives here — every
/// value comes from `Motion.resolveOverlay`.
enum OverlayMotion {
  /// Samples per second of an overlay's life (the export's frame rate).
  static let fps: Double = 30
  /// Two sample times are never closer than this (seconds), so the key times strictly increase.
  static let minStep: Double = 1e-6
  /// The most an animated overlay's content is drawn above its own size to stay sharp while it is scaled up.
  static let maxContentScale: Double = 4

  /// Any In / Out / Loop animation or pin. Captions never have motion. An overlay without takes exactly the old
  /// static path.
  static func hasMotion(_ o: ExportOverlay) -> Bool {
    guard o.kind != "caption" else { return false }
    return ExportSession.motionEdge(o.animIn) != nil || ExportSession.motionEdge(o.animOut) != nil
      || !(o.animLoop ?? "").isEmpty || !ExportSession.motionKeyframes(o.keyframes).isEmpty
  }

  /// The overlay's placement and opacity at `local` seconds since its start: `Motion.resolveOverlay` over the
  /// overlay's own x / y / scale / rotation (opacity 1), its pins, its edges and its loop — the preview's rule
  /// (`resolveOverlayMotion` in motion.ts).
  static func resolver(_ o: ExportOverlay) -> (Double) -> KeyValues {
    let base = KeyValues(x: o.x, y: o.y, scale: o.scale, rotation: o.rotation, opacity: 1)
    let keyframes = ExportSession.motionKeyframes(o.keyframes)
    let animIn = ExportSession.motionEdge(o.animIn)
    let animOut = ExportSession.motionEdge(o.animOut)
    let loop: String? = (o.animLoop ?? "").isEmpty ? nil : o.animLoop
    let length = o.end - o.start
    return { (local: Double) -> KeyValues in
      Motion.resolveOverlay(base: base, keyframes: keyframes, animIn: animIn, animOut: animOut, animLoop: loop, local: local, length: length)
    }
  }

  /// `resolve` at every `1 / fps` seconds of a life from `start` to `end`. Times are relative to `start`: the first
  /// is 0, the last is exactly `end − start`, and there are at least two. A step that would land within `minStep` of
  /// the end is left out (the end sample stands for it). Empty when the life is not a finite, positive length or
  /// `fps` is not finite and positive.
  static func samples(start: Double, end: Double, fps: Double, resolve: (Double) -> KeyValues) -> [(time: Double, values: KeyValues)] {
    let length = end - start
    guard length.isFinite, length > 0, fps.isFinite, fps > 0 else { return [] }
    var out: [(time: Double, values: KeyValues)] = [(time: 0, values: resolve(0))]
    var k: Double = 1
    while k / fps < length - minStep {
      let t = k / fps
      out.append((time: t, values: resolve(t)))
      k += 1
    }
    out.append((time: length, values: resolve(length)))
    return out
  }

  /// True when every number of every sample is finite (a layer must never be given a non-finite position).
  static func allFinite(_ samples: [(time: Double, values: KeyValues)]) -> Bool {
    for s in samples {
      let v = s.values
      if !(s.time.isFinite && v.x.isFinite && v.y.isFinite && v.scale.isFinite && v.rotation.isFinite && v.opacity.isFinite) { return false }
    }
    return true
  }

  /// A sampled scale relative to the scale the layer was built at (`base` = the overlay's own scale, which is baked
  /// into its font size / box): the factor the layer's transform applies. Never negative; 1 when `base` is not a
  /// finite, positive number or `scale` is not finite.
  static func scaleRatio(_ scale: Double, base: Double) -> Double {
    guard base.isFinite, base > 0, scale.isFinite else { return 1 }
    return max(0, scale / base)
  }

  /// How much above its own size the content must be drawn so that the largest sampled scale is still sharp: the
  /// largest `scaleRatio`, at least 1, at most `maxContentScale`.
  static func contentScale(_ samples: [(time: Double, values: KeyValues)], base: Double) -> Double {
    var most: Double = 1
    for s in samples { most = max(most, scaleRatio(s.values.scale, base: base)) }
    return min(maxContentScale, most)
  }
}
