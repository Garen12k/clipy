import Foundation

/// What an animation adds to a base value (`MotionDelta` in motion.ts): offsets and rotation add, scale and opacity
/// multiply. Clip offsets are fractions of the frame as in `ClipTransform`; rotation in degrees.
struct MotionDelta: Equatable {
  var dx: Double
  var dy: Double
  var scale: Double
  var rotation: Double
  var opacity: Double
  static let identity = MotionDelta(dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1)
}

/// Where something is and how opaque it is (`KeyValues` in motion.ts).
struct KeyValues: Equatable {
  var x: Double
  var y: Double
  var scale: Double
  var rotation: Double
  var opacity: Double
}

/// One pin. `t` is in seconds of the item's own OUTPUT time: clip-local output seconds for a clip (the request has
/// already converted from source time, so there is no speed / reverse arithmetic here), seconds since its start for a
/// text / sticker.
struct MotionKeyframe: Equatable {
  var t: Double
  var x: Double
  var y: Double
  var scale: Double
  var rotation: Double
  var opacity: Double

  var values: KeyValues { KeyValues(x: x, y: y, scale: scale, rotation: rotation, opacity: opacity) }
}

/// An In or Out animation: its id (`ANIM_IN_IDS`) and its length in seconds — already scaled by the request so that
/// In + Out fit inside the item (`edgeDurations` in motion.ts).
struct MotionEdge: Equatable {
  var id: String
  var duration: Double
}

/// Mirror of src/editor/model/motion.ts — the constants (`MOTION`) and the formulas must stay identical (checked by
/// src/editor/model/__tests__/motion.parity.test.ts). Pure maths.
/// Not mirrored: `edgeDurations` (the request carries scaled durations) and the source-time conversion of clip pins
/// (the request carries output-local pins).
enum Motion {
  static let slideClip: Double = 1
  static let slideOverlay: Double = 0.25
  static let zoomFrom: Double = 0.6
  static let zoomOutFrom: Double = 1.4
  static let spinTurn: Double = 180
  static let spinFrom: Double = 0.5
  static let popPeak: Double = 1.15
  static let popPeakAt: Double = 0.6
  static let popFadeBy: Double = 0.3
  static let rise: Double = 0.15
  static let comboZoom: Double = 0.15
  static let panScale: Double = 1.1
  static let pan: Double = 0.05
  static let swayDeg: Double = 3
  static let swayCycles: Double = 2
  static let swayScale: Double = 1.08
  static let pulseAmp: Double = 0.05
  static let pulseHz: Double = 1
  static let wiggleDeg: Double = 8
  static let wiggleHz: Double = 2
  static let loopPulseAmp: Double = 0.1
  static let loopPulseHz: Double = 1.5
  static let loopSpinDegPerSec: Double = 180
  static let floatAmp: Double = 0.015
  static let floatHz: Double = 0.8
  static let blinkMin: Double = 0.35
  static let blinkHz: Double = 1.5
  static let shakeAmp: Double = 0.008
  static let shakeHz: Double = 8

  private static let tau = 2 * Double.pi

  /// `v` limited to lo…hi (`clamp` in motion.ts). Callers pass finite values.
  private static func limit(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
    return min(hi, max(lo, v))
  }

  /// `v` limited to 0…1 (`clamp01` in motion.ts).
  private static func unit(_ v: Double) -> Double {
    return limit(v, 0, 1)
  }

  /// 1 − (1 − p)³, progress clamped to 0–1.
  static func easeOut(_ p: Double) -> Double {
    let q = 1 - unit(p)
    return 1 - q * q * q
  }

  /// u²(3 − 2u), progress clamped to 0–1.
  static func smooth(_ u: Double) -> Double {
    let v = unit(u)
    return v * v * (3 - 2 * v)
  }

  /// In animation at progress `p` (0 → 1); the identity at p = 1. `distance` = how far a slide travels
  /// (`slideClip` / `slideOverlay`). Unknown ids and non-finite input give the identity.
  static func animInDelta(id: String, p: Double, distance: Double) -> MotionDelta {
    var d = MotionDelta.identity
    guard p.isFinite, distance.isFinite else { return d }
    let raw = unit(p)
    let e = easeOut(raw)
    switch id {
    case "fade":
      d.opacity = e
    case "slideLeft":
      d.dx = (1 - e) * distance                    // enters from the right, moving left
    case "slideRight":
      d.dx = (e - 1) * distance                    // = −(1 − e)·distance
    case "slideUp":
      d.dy = (1 - e) * distance                    // enters from below
    case "slideDown":
      d.dy = (e - 1) * distance
    case "zoomIn":
      d.scale = Motion.zoomFrom + (1 - Motion.zoomFrom) * e
      d.opacity = e
    case "zoomOut":
      d.scale = Motion.zoomOutFrom - (Motion.zoomOutFrom - 1) * e
      d.opacity = e
    case "spin":
      d.rotation = Motion.spinTurn * (e - 1)       // = −spinTurn·(1 − e)
      d.scale = Motion.spinFrom + (1 - Motion.spinFrom) * e
      d.opacity = e
    case "pop":
      d.scale = raw < Motion.popPeakAt
        ? Motion.popPeak * raw / Motion.popPeakAt
        : Motion.popPeak - (Motion.popPeak - 1) * ((raw - Motion.popPeakAt) / (1 - Motion.popPeakAt))
      d.opacity = min(1, raw / Motion.popFadeBy)
    case "rise":
      d.dy = Motion.rise * (1 - e)                 // `distance` is not applied
      d.opacity = e
    default:
      break
    }
    return d
  }

  /// Out animation at progress `p` (0 → 1); the identity at p = 0. The In played backwards with dx, dy and rotation
  /// negated.
  static func animOutDelta(id: String, p: Double, distance: Double) -> MotionDelta {
    guard p.isFinite else { return MotionDelta.identity }
    let d = animInDelta(id: id, p: 1 - unit(p), distance: distance)
    return MotionDelta(dx: 0 - d.dx, dy: 0 - d.dy, scale: d.scale, rotation: 0 - d.rotation, opacity: d.opacity)
  }

  /// Combo (clips): `p` = linear progress through the clip, `seconds` = clip-local seconds.
  static func animComboDelta(id: String, p: Double, seconds: Double) -> MotionDelta {
    var d = MotionDelta.identity
    guard p.isFinite, seconds.isFinite else { return d }
    let q = unit(p)
    switch id {
    case "zoomInSlow":
      d.scale = 1 + Motion.comboZoom * q
    case "zoomOutSlow":
      d.scale = 1 + Motion.comboZoom * (1 - q)
    case "panLeft":
      d.scale = Motion.panScale
      d.dx = Motion.pan * (1 - 2 * q)
    case "panRight":
      d.scale = Motion.panScale
      d.dx = Motion.pan * (2 * q - 1)              // = −pan·(1 − 2p)
    case "sway":
      d.scale = Motion.swayScale
      d.rotation = Motion.swayDeg * sin(tau * Motion.swayCycles * q)
    case "pulse":
      d.scale = 1 + Motion.pulseAmp * (0.5 - 0.5 * cos(tau * Motion.pulseHz * seconds))
    default:
      break
    }
    return d
  }

  /// Loop (text / stickers): `seconds` since the overlay's start.
  static func animLoopDelta(id: String, seconds: Double) -> MotionDelta {
    var d = MotionDelta.identity
    guard seconds.isFinite else { return d }
    let s = seconds
    switch id {
    case "wiggle":
      d.rotation = Motion.wiggleDeg * sin(tau * Motion.wiggleHz * s)
    case "pulse":
      d.scale = 1 + Motion.loopPulseAmp * sin(tau * Motion.loopPulseHz * s)
    case "spin":
      d.rotation = Motion.loopSpinDegPerSec * s
    case "float":
      d.dy = Motion.floatAmp * sin(tau * Motion.floatHz * s)
    case "blink":
      d.opacity = Motion.blinkMin + (1 - Motion.blinkMin) * (0.5 + 0.5 * cos(tau * Motion.blinkHz * s))
    case "shake":
      d.dx = Motion.shakeAmp * sin(tau * Motion.shakeHz * s)
    default:
      break
    }
    return d
  }

  /// Value at time `t` from pins sorted by `t`: holds before the first and after the last, `a + (b − a)·smooth(u)` in
  /// between (rotation numerically — no shortest path). Empty → nil. A non-finite `t` holds the first pin.
  static func sampleKeyframes(_ keyframes: [MotionKeyframe], t: Double) -> KeyValues? {
    let n = keyframes.count
    guard n > 0 else { return nil }
    let first = keyframes[0]
    let last = keyframes[n - 1]
    if n == 1 || !t.isFinite || t <= first.t { return first.values }
    if t >= last.t { return last.values }
    var i = 1
    while i < n - 1 && keyframes[i].t <= t { i += 1 }
    let a = keyframes[i - 1]
    let b = keyframes[i]
    let span = b.t - a.t
    if !(span > 0) { return b.values }
    let s = smooth((t - a.t) / span)
    func mix(_ from: Double, _ to: Double) -> Double { return from + (to - from) * s }
    return KeyValues(x: mix(a.x, b.x), y: mix(a.y, b.y), scale: mix(a.scale, b.scale),
                     rotation: mix(a.rotation, b.rotation), opacity: mix(a.opacity, b.opacity))
  }

  /// An animation delta layered on a base value: offsets and rotation add, scale and opacity multiply. Nothing is
  /// clamped here.
  static func combine(_ base: KeyValues, _ d: MotionDelta) -> KeyValues {
    return KeyValues(x: base.x + d.dx, y: base.y + d.dy, scale: base.scale * d.scale,
                     rotation: base.rotation + d.rotation, opacity: base.opacity * d.opacity)
  }

  /// Two deltas as one (same rule as `combine`).
  private static func compose(_ a: MotionDelta, _ b: MotionDelta) -> MotionDelta {
    return MotionDelta(dx: a.dx + b.dx, dy: a.dy + b.dy, scale: a.scale * b.scale,
                       rotation: a.rotation + b.rotation, opacity: a.opacity * b.opacity)
  }

  /// In + Out delta at `local` seconds into an item of `length` seconds. The durations are the request's (already
  /// scaled so the two windows do not overlap), so they are used as they are: In while `local < in.duration`, Out
  /// while `local > length − out.duration`.
  private static func edgeDelta(_ animIn: MotionEdge?, _ animOut: MotionEdge?, local: Double, length: Double, distance: Double) -> MotionDelta {
    var d = MotionDelta.identity
    if let i = animIn, i.duration > 0, local < i.duration {
      d = compose(d, animInDelta(id: i.id, p: local / i.duration, distance: distance))
    }
    if let o = animOut, o.duration > 0, local > length - o.duration {
      d = compose(d, animOutDelta(id: o.id, p: (local - (length - o.duration)) / o.duration, distance: distance))
    }
    return d
  }

  /// `lengthOf` in motion.ts: a finite, positive number of seconds, else 0.
  private static func usableLength(_ seconds: Double) -> Double {
    return seconds.isFinite && seconds > 0 ? seconds : 0
  }

  /// A clip's placement and opacity at `local` output seconds into a clip of `length` seconds (`resolveClipMotion` in
  /// motion.ts): the base — the pins sampled at `local` when there are any, else `base` (the static transform with
  /// opacity 1) — plus the Combo when there is one, else In / Out. `local` is clamped to the clip; the placement is
  /// NOT clamped; opacity is clamped to 0–1. A non-finite `local` gives the base at the clip's start, no animation.
  static func resolveClip(base: KeyValues, keyframes: [MotionKeyframe], animIn: MotionEdge?, animOut: MotionEdge?,
                          animCombo: String?, local: Double, length: Double) -> KeyValues {
    let len = usableLength(length)
    let finite = local.isFinite
    let at = finite ? limit(local, 0, len) : 0
    let start = sampleKeyframes(keyframes, t: at) ?? base
    var delta = MotionDelta.identity
    if finite {
      if let combo = animCombo, !combo.isEmpty {
        delta = animComboDelta(id: combo, p: len > 0 ? at / len : 0, seconds: at)
      } else {
        delta = edgeDelta(animIn, animOut, local: at, length: len, distance: Motion.slideClip)
      }
    }
    var v = combine(start, delta)
    v.opacity = unit(v.opacity)
    return v
  }

  /// A text's / sticker's placement and opacity at `local` seconds since its start, for a life of `length` seconds
  /// (`resolveOverlayMotion` in motion.ts): the base — the pins sampled at `local` (not clamped, as in the TS), else
  /// `base` — plus In / Out and the Loop, both at `local` clamped to the overlay's life. Opacity is clamped to 0–1.
  /// A non-finite `local` gives the base with no animation.
  static func resolveOverlay(base: KeyValues, keyframes: [MotionKeyframe], animIn: MotionEdge?, animOut: MotionEdge?,
                             animLoop: String?, local: Double, length: Double) -> KeyValues {
    var start = sampleKeyframes(keyframes, t: local) ?? base
    guard local.isFinite else {
      start.opacity = unit(start.opacity)
      return start
    }
    let len = usableLength(length)
    let at = limit(local, 0, len)
    var delta = edgeDelta(animIn, animOut, local: at, length: len, distance: Motion.slideOverlay)
    if let loop = animLoop, !loop.isEmpty {
      delta = compose(delta, animLoopDelta(id: loop, seconds: at))
    }
    var v = combine(start, delta)
    v.opacity = unit(v.opacity)
    return v
  }
}
