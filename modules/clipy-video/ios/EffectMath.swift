import Foundation

/// `shakeOffset`'s result: x / y are fractions of the frame (y positive = DOWN on screen), scale about the centre.
struct ShakeOffset: Equatable {
  let x: Double
  let y: Double
  let scale: Double
}

/// `glitchSlice`'s result: bandY is the band's top as a fraction of the height (from the TOP of the screen), bandH
/// its height; shift is a signed fraction of the width; split the R/B offset as a fraction of the width.
struct GlitchSlice: Equatable {
  let active: Bool
  let bandY: Double
  let bandH: Double
  let shift: Double
  let split: Double
}

/// Mirror of src/editor/model/effectMath.ts — the constants (`EFFECT`), the colours (`EFFECT_COLORS`) and the
/// formulas must stay identical (checked by src/editor/model/__tests__/effectMath.parity.test.ts).
/// `t` = seconds since the effect's start, `d` = its duration, `k` = intensity.
enum EffectMath {
  static let ramp: Double = 0.15
  static let shakeAmp: Double = 0.03
  static let shakeFx: Double = 9
  static let shakeFy: Double = 11
  static let shakePhase: Double = 1.3
  static let shakeZoom: Double = 0.06
  static let pulseAmp: Double = 0.12
  static let pulseHz: Double = 2
  static let flashHz: Double = 2
  static let flashDecay: Double = 4
  static let leakOpacity: Double = 0.35
  static let leakHz: Double = 0.5
  static let vhsTint: Double = 0.12
  static let vhsShift: Double = 0.004
  static let filmTint: Double = 0.3
  static let filmFlicker: Double = 0.12
  static let filmFps: Double = 12
  static let glowLayer: Double = 0.12
  static let glowRadius: Double = 0.02
  static let glowIntensity: Double = 0.8
  static let blurRadius: Double = 0.03
  static let glitchHz: Double = 8
  static let glitchChance: Double = 0.5
  static let glitchShift: Double = 0.08
  static let glitchSplit: Double = 0.01
  static let glitchBandMin: Double = 0.08
  static let glitchBandMax: Double = 0.2
  static let rgbSplit: Double = 0.008

  /// Content values burned into the video (`EFFECT_COLORS`).
  static let flashColor = "#FFFFFF"
  static let lightLeakColor = "#FFB347"
  static let vhsColor = "#7A5CFF"
  static let oldFilmColor = "#C8A05A"
  static let flickerColor = "#000000"
  static let glowColor = "#FFFFFF"

  private static let tau = 2 * Double.pi

  /// x − floor(x): in [0, 1) for negative numbers too.
  static func frac(_ x: Double) -> Double {
    return x - x.rounded(.down)
  }

  /// Pseudo-random value in [0, 1), identical on every platform that has a double `sin`.
  static func hash(_ n: Double) -> Double {
    return frac(sin(n * 12.9898) * 43758.5453)
  }

  /// 0→1 over the first `ramp` seconds, 1→0 over the last; each ramp is at most d/2. 0 outside [0, d].
  static func envelope(t: Double, d: Double) -> Double {
    if !(d > 0) || !(t >= 0) || !(t <= d) { return 0 }
    let r = min(EffectMath.ramp, d / 2)
    return min(1, t / r, (d - t) / r)
  }

  static func shakeOffset(t: Double, d: Double, k: Double) -> ShakeOffset {
    let a = EffectMath.shakeAmp * k * envelope(t: t, d: d)
    return ShakeOffset(
      x: a * sin(tau * EffectMath.shakeFx * t),
      y: a * sin(tau * EffectMath.shakeFy * t + EffectMath.shakePhase),
      scale: 1 + EffectMath.shakeZoom * k)
  }

  static func pulseScale(t: Double, d: Double, k: Double) -> Double {
    return 1 + EffectMath.pulseAmp * k * envelope(t: t, d: d) * (0.5 - 0.5 * cos(tau * EffectMath.pulseHz * t))
  }

  static func flashOpacity(t: Double, k: Double) -> Double {
    return k * max(0, 1 - EffectMath.flashDecay * frac(EffectMath.flashHz * t))
  }

  static func leakOpacity(t: Double, d: Double, k: Double) -> Double {
    let peak: Double = EffectMath.leakOpacity
    return peak * k * envelope(t: t, d: d) * (0.6 + 0.4 * sin(tau * EffectMath.leakHz * t))
  }

  static func filmFlicker(t: Double, k: Double) -> Double {
    let depth: Double = EffectMath.filmFlicker
    return depth * k * hash((EffectMath.filmFps * t).rounded(.down))
  }

  /// One glitch slice (1/glitchHz s).
  static func glitchSlice(t: Double, k: Double) -> GlitchSlice {
    let n = (t * EffectMath.glitchHz).rounded(.down)
    let active = hash(n) < EffectMath.glitchChance * k
    let bandH = EffectMath.glitchBandMin + (EffectMath.glitchBandMax - EffectMath.glitchBandMin) * hash(n + 0.5)
    let bandY = hash(n + 0.25) * (1 - bandH)
    return GlitchSlice(
      active: active, bandY: bandY, bandH: bandH,
      shift: active ? (hash(n + 0.75) * 2 - 1) * EffectMath.glitchShift * k : 0,
      split: active ? EffectMath.glitchSplit * k : 0)
  }
}
