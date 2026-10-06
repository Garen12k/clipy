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

/// `dustScratch`'s result: whether the line shows, and its place as a fraction of the width.
struct DustScratch: Equatable {
  let on: Bool
  let x: Double
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
  static let beatHz: Double = 1.25
  static let beatAmp: Double = 0.1
  static let beatWidth: Double = 0.2
  static let beatGap: Double = 0.28
  static let beatSecond: Double = 0.6
  static let strobeHz: Double = 2
  static let strobeDuty: Double = 0.4
  static let burnMax: Double = 0.6
  static let burnHz: Double = 0.4
  static let burnDrift: Double = 0.35
  static let burnDriftHz: Double = 0.15
  static let burnRadius: Double = 0.9
  static let flareMax: Double = 0.8
  static let flareHz: Double = 0.5
  static let flareMargin: Double = 0.2
  static let flareY: Double = 0.35
  static let flareCore: Double = 0.12
  static let flareHalo: Double = 0.4
  static let edgeBlur: Double = 0.02
  static let edgeInner: Double = 0.25
  static let edgeOuter: Double = 0.75
  static let edgeVeil: Double = 0.35
  static let dustFps: Double = 12
  static let dustChance: Double = 0.6
  static let dustLines: Double = 2
  static let dustOpacity: Double = 0.5
  static let dustWidth: Double = 0.003
  static let dustSpeck: Double = 0.02
  static let hueHz: Double = 0.25
  static let mirrorFull: Double = 0.5

  /// Content values burned into the video (`EFFECT_COLORS`).
  static let flashColor = "#FFFFFF"
  static let lightLeakColor = "#FFB347"
  static let vhsColor = "#7A5CFF"
  static let oldFilmColor = "#C8A05A"
  static let flickerColor = "#000000"
  static let glowColor = "#FFFFFF"
  static let strobeColor = "#000000"
  static let filmBurnColor = "#FF5A1F"
  static let lensFlareColor = "#FFF1D0"
  static let softEdgesColor = "#FFFFFF"
  static let dustColor = "#F2EBDD"

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

  /// `leakOpacity(t, d, k)` in effectMath.ts. Named differently here: Swift does not allow a `static let` and a
  /// `static func` with the same base name in one type.
  static func leakAlpha(t: Double, d: Double, k: Double) -> Double {
    return EffectMath.leakOpacity * k * envelope(t: t, d: d) * (0.6 + 0.4 * sin(tau * EffectMath.leakHz * t))
  }

  /// `filmFlicker(t, k)` in effectMath.ts (renamed for the same reason as `leakAlpha`).
  static func flickerAlpha(t: Double, k: Double) -> Double {
    return EffectMath.filmFlicker * k * hash((EffectMath.filmFps * t).rounded(.down))
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

  /// `v` kept inside lo … hi; `rest` when it is not a finite number. Every function below ends in it, so no NaN
  /// reaches a renderer. (`min` / `max` only ever see finite numbers here: Swift's and JavaScript's differ on NaN.)
  static func within(_ v: Double, _ lo: Double, _ hi: Double, _ rest: Double) -> Double {
    return v.isFinite ? min(hi, max(lo, v)) : rest
  }

  /// `envelope`, and 0 for a time or a duration that is not finite.
  static func calmEnvelope(t: Double, d: Double) -> Double {
    return t.isFinite && d.isFinite ? envelope(t: t, d: d) : 0
  }

  /// A smooth bump: 0 at both ends, 1 in the middle of (0, 1); 0 outside it.
  static func bump(_ x: Double) -> Double {
    if !(x > 0 && x < 1) { return 0 }
    let s = sin(Double.pi * x)
    return s * s
  }

  /// A heartbeat: two beats (the second weaker) and a rest, `beatHz` times a second. Never below 1.
  static func heartbeatScale(t: Double, d: Double, k: Double) -> Double {
    let phase = frac(EffectMath.beatHz * t)
    let beat = bump(phase / EffectMath.beatWidth) + EffectMath.beatSecond * bump((phase - EffectMath.beatGap) / EffectMath.beatWidth)
    return within(1 + EffectMath.beatAmp * k * calmEnvelope(t: t, d: d) * beat, 1, 1 + EffectMath.beatAmp, 1)
  }

  /// A dark strobe: the black layer's opacity is k for the first `strobeDuty` of every period, 0 for the rest.
  static func strobeOpacity(t: Double, k: Double) -> Double {
    return frac(EffectMath.strobeHz * t) < EffectMath.strobeDuty ? within(k, 0, 1, 0) : 0
  }

  static func burnOpacity(t: Double, d: Double, k: Double) -> Double {
    return within(EffectMath.burnMax * k * calmEnvelope(t: t, d: d) * (0.5 + 0.5 * sin(tau * EffectMath.burnHz * t)), 0, EffectMath.burnMax, 0)
  }

  /// Where the burn's centre sits on the LEFT edge: a fraction of the height from the TOP of the screen.
  static func burnCentreY(t: Double) -> Double {
    return within(0.5 + EffectMath.burnDrift * sin(tau * EffectMath.burnDriftHz * t), 0.5 - EffectMath.burnDrift, 0.5 + EffectMath.burnDrift, 0.5)
  }

  /// The flare's centre as a fraction of the width: from one margin left of the frame to one margin right of it.
  static func flareX(t: Double) -> Double {
    return within(-EffectMath.flareMargin + (1 + 2 * EffectMath.flareMargin) * frac(EffectMath.flareHz * t), -EffectMath.flareMargin, 1 + EffectMath.flareMargin, -EffectMath.flareMargin)
  }

  static func flareOpacity(t: Double, d: Double, k: Double) -> Double {
    return within(EffectMath.flareMax * k * calmEnvelope(t: t, d: d), 0, EffectMath.flareMax, 0)
  }

  /// How soft the edges are, 0…1 (× edgeBlur × the shorter side = the blur radius).
  static func softEdgeAmount(t: Double, d: Double, k: Double) -> Double {
    return within(k * calmEnvelope(t: t, d: d), 0, 1, 0)
  }

  /// Scratch line `i` (0 … dustLines − 1) in the film frame under `t`.
  static func dustScratch(t: Double, k: Double, i: Double) -> DustScratch {
    let n = (EffectMath.dustFps * t).rounded(.down)
    return DustScratch(on: hash(n * 7 + i * 13 + 1) < EffectMath.dustChance * k, x: within(hash(n * 3 + i * 17 + 2), 0, 1, 0))
  }

  /// How far the colours are turned round the colour wheel, in radians.
  static func hueAngle(t: Double, d: Double, k: Double) -> Double {
    return within(Double.pi * k * calmEnvelope(t: t, d: d) * sin(tau * EffectMath.hueHz * t), -Double.pi, Double.pi, 0)
  }

  /// How much of the mirrored frame shows: full from strength `mirrorFull` up, fading below it.
  static func mirrorMix(t: Double, d: Double, k: Double) -> Double {
    return within(within(k / EffectMath.mirrorFull, 0, 1, 0) * calmEnvelope(t: t, d: d), 0, 1, 0)
  }
}
