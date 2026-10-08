import Foundation

/// The sample maths of a sound render, mirroring src/editor/model/soundMath.ts: keep the constants and formulas identical
/// (guarded by src/editor/model/__tests__/soundMath.parity.test.ts). Pure — no AVFoundation.
enum SoundMath {
  /// `LEVEL.targetDb`: the RMS level Even out loudness brings a sound to.
  static let levelTargetDb: Double = -18
  /// `LEVEL.gateDb`: a block at or under this level counts as silence and is not measured.
  static let levelGateDb: Double = -45
  /// `LEVEL.maxBoostDb` / `LEVEL.maxCutDb`: how far the gain may go, up and down.
  static let levelMaxBoostDb: Double = 18
  static let levelMaxCutDb: Double = 6
  /// `LEVEL.blockSeconds`: the length of one measured block.
  static let levelBlockSeconds: Double = 0.4
  /// `SOFT_CLIP`: samples up to the knee pass unchanged; louder ones bend towards the ceiling and never pass it.
  static let clipKnee: Double = 0.9
  static let clipCeiling: Double = 0.98

  /// Decibels as a factor; not a number → 1.
  static func dbToGain(_ db: Double) -> Double {
    return db.isFinite ? pow(10, db / 20) : 1
  }

  /// The gain in dB that brings a sound to `levelTargetDb`. `blocks` = the mean square of each block of the mono mix.
  /// Blocks that are not a number or not above the gate are left out; none left → 0 (silence is not boosted).
  static func levelGainDb(_ blocks: [Double]) -> Double {
    let gate = pow(10, levelGateDb / 10)
    var sum = 0.0
    var count = 0.0
    for b in blocks where b.isFinite && b > gate {
      sum += b
      count += 1
    }
    guard count > 0 else { return 0 }
    let measured = 10 * log10(sum / count)
    return min(levelMaxBoostDb, max(-levelMaxCutDb, levelTargetDb - measured))
  }

  /// One sample through the peak guard. Not a number → 0.
  static func softClip(_ x: Double) -> Double {
    guard x.isFinite else { return 0 }
    let a = abs(x)
    if a <= clipKnee { return x }
    let room = clipCeiling - clipKnee
    let y = clipKnee + room * tanh((a - clipKnee) / room)
    return x < 0 ? -y : y
  }
}
