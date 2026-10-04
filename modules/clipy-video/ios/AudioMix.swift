import Foundation

/// One breakpoint of a piecewise-linear gain curve: `gain` (0 = silent, 1 = as recorded, above 1 = boosted) at `time` seconds.
struct GainPoint: Equatable {
  let time: Double
  let gain: Double
}

/// One volume ramp for the export's audio mix: from gain `from` at `start` to gain `to` at `end` (seconds, `end > start`).
struct GainRamp: Equatable {
  let start: Double
  let end: Double
  let from: Double
  let to: Double
}

/// What the mixing maths needs to know of an audio track (`AudioTrack` in src/editor/model/types.ts).
struct MixTrack: Equatable {
  let start: Double                                // project seconds
  let trimStart: Double                            // source seconds
  let trimEnd: Double
  let volume: Double
  let kind: String                                 // music | voice | sfx
}

/// A stretch of project time, `[start, end]` seconds.
struct MixInterval: Equatable {
  let start: Double
  let end: Double
}

/// Audio gain maths, mirroring src/editor/model/audioMix.ts: keep the constants and formulas identical (guarded by
/// src/editor/model/__tests__/audioMix.parity.test.ts; vectors in AudioMixTests). Pure — no AVFoundation.
/// The export request already carries every gain curve (`audioMix.ts` builds them: volume, fades, ducking and the
/// end-of-video fade), so the export only needs `ramps`; the other functions are the twins of the app's, kept for
/// the parity tests and for later use. The curve BUILDERS (`trackGainCurve`, `clipGainCurve`) are not mirrored.
enum AudioMix {
  /// `DUCKING.level`: music gain while a voice track is audible.
  static let duckLevel: Double = 0.3
  /// `DUCKING.ramp`: seconds to ramp down before / up after a voice.
  static let duckRamp: Double = 0.3
  /// `CURVE_STEP` … `CURVE_DECIMALS`: how the app spaces the extra breakpoints of a curve (not used by the export itself).
  static let curveStep: Double = 0.05
  static let curveMinStep: Double = 0.005
  static let curveMaxPoints: Double = 400
  static let curveTolerance: Double = 0.01
  static let curveStepSafety: Double = 0.9
  static let curveDecimals: Double = 4
  /// Swift only: the export's time grid (`ExportSession.time` uses timescale 600). Breakpoints closer than one tick
  /// are merged, so no ramp is empty and no two ramps overlap.
  static let ticksPerSecond: Double = 600

  /// One tick of the export's time grid, in seconds.
  static var tick: Double { 1 / ticksPerSecond }

  private static func finitePositive(_ v: Double) -> Double { v.isFinite && v > 0 ? v : 0 }

  /// Scaled fades so fadeIn + fadeOut ≤ length: negative / non-finite → 0; both shrink by `length / (in + out)` when
  /// they do not fit.
  static func fitFades(fadeIn: Double, fadeOut: Double, length: Double) -> (fadeIn: Double, fadeOut: Double) {
    let a = finitePositive(fadeIn)
    let b = finitePositive(fadeOut)
    let len = finitePositive(length)
    if len == 0 { return (fadeIn: 0, fadeOut: 0) }
    if a + b <= len { return (fadeIn: a, fadeOut: b) }
    let k = len / (a + b)
    return (fadeIn: a * k, fadeOut: b * k)
  }

  /// 0…1 fade envelope at `local` seconds into something `length` seconds long: `min(1, local / in, (length − local) / out)`
  /// with fitted fades, zero-length fades ignored. 0 outside `[0, length]`, for no length and for non-finite input.
  static func fadeEnvelope(local: Double, length: Double, fadeIn: Double, fadeOut: Double) -> Double {
    guard local.isFinite, length.isFinite, length > 0 else { return 0 }
    if local < 0 || local > length { return 0 }
    let f = fitFades(fadeIn: fadeIn, fadeOut: fadeOut, length: length)
    let up = f.fadeIn > 0 ? local / f.fadeIn : 1
    let down = f.fadeOut > 0 ? (length - local) / f.fadeOut : 1
    return min(1, min(up, down))
  }

  /// Intervals of project time during which any voice track is audible: `[start, start + trimEnd − trimStart]` each,
  /// merged when they touch or overlap, sorted. A voice at volume 0 (or a broken volume) is left out.
  static func voiceIntervals(_ tracks: [MixTrack]) -> [MixInterval] {
    var spans: [MixInterval] = []
    for t in tracks where t.kind == "voice" && finitePositive(t.volume) > 0 {
      let end = t.start + (t.trimEnd - t.trimStart)
      if t.start.isFinite, end.isFinite, end > t.start { spans.append(MixInterval(start: t.start, end: end)) }
    }
    spans.sort { (a: MixInterval, b: MixInterval) -> Bool in a.start < b.start }
    var merged: [MixInterval] = []
    for s in spans {
      if let last = merged.last, s.start <= last.end {
        merged[merged.count - 1] = MixInterval(start: last.start, end: max(last.end, s.end))
      } else {
        merged.append(s)
      }
    }
    return merged
  }

  /// Music gain factor from ducking at a project time: 1 outside, `duckLevel` inside, linear ramps of `duckRamp`
  /// before / after each interval (ramps sit OUTSIDE the interval; overlapping ramps take the lower value).
  /// A non-finite time → 1.
  static func duckFactorAt(_ intervals: [MixInterval], time: Double) -> Double {
    guard time.isFinite else { return 1 }
    var factor = 1.0
    for i in intervals {
      let distance = time < i.start ? i.start - time : (time > i.end ? time - i.end : 0)
      if distance >= duckRamp { continue }
      factor = min(factor, min(1, duckLevel + (1 - duckLevel) * (distance / duckRamp)))
    }
    return factor
  }

  /// A curve the export can draw: points with a non-finite number dropped, negative gains raised to 0, in time order
  /// (points at the same time keep their order), and times at least one tick apart. Of points closer than a tick the
  /// first is kept — except at the very start, where the LATER gain wins (as `curveFrom` in audioMix.ts does).
  static func usable(_ points: [GainPoint]) -> [GainPoint] {
    let finite: [GainPoint] = points.filter { (p: GainPoint) -> Bool in p.time.isFinite && p.gain.isFinite }
    let ordered = finite.enumerated().sorted { (a: (offset: Int, element: GainPoint), b: (offset: Int, element: GainPoint)) -> Bool in
      a.element.time != b.element.time ? a.element.time < b.element.time : a.offset < b.offset
    }
    var out: [GainPoint] = []
    for entry in ordered {
      let p = entry.element
      let level = max(0, p.gain)
      if let last = out.last, p.time - last.time < tick {
        if out.count == 1 { out[0] = GainPoint(time: last.time, gain: level) }
        continue
      }
      out.append(GainPoint(time: p.time, gain: level))
    }
    return out
  }

  /// A curve (points in time order) read at `time`: exact on a breakpoint, a straight line between two, the first /
  /// last gain outside. 0 for an empty curve or a non-finite time.
  static func gain(at time: Double, in points: [GainPoint]) -> Double {
    guard let first = points.first, let last = points.last, time.isFinite else { return 0 }
    if time <= first.time { return first.gain }
    for i in points.indices.dropFirst() {
      let a = points[i - 1]
      let b = points[i]
      if time == b.time { return b.gain }
      if time < b.time {
        let length = b.time - a.time
        return length > 0 ? a.gain + (b.gain - a.gain) * ((time - a.time) / length) : b.gain
      }
    }
    return last.gain
  }

  /// One ramp between each two neighbouring breakpoints of the `usable` curve, in time order: back to back, never
  /// overlapping, none shorter than a tick. Fewer than two usable points → none.
  static func ramps(from points: [GainPoint]) -> [GainRamp] {
    let curve = usable(points)
    var out: [GainRamp] = []
    for i in curve.indices.dropFirst() {
      out.append(GainRamp(start: curve[i - 1].time, end: curve[i].time, from: curve[i - 1].gain, to: curve[i].gain))
    }
    return out
  }

  /// The ramps that play a curve over exactly `[lo, hi]`, with every breakpoint moved by `offset` seconds first (a
  /// clip's curve is clip-local; `offset` is where the clip starts). Before the first breakpoint and after the last
  /// the gain is flat (the first / last gain); a ramp crossing `lo` or `hi` is cut there at its interpolated gain.
  /// The ramps are back to back from `lo` to `hi`, so two calls with ranges that do not overlap never give
  /// overlapping ramps. No points, a broken range or one shorter than a tick → none.
  static func ramps(from points: [GainPoint], offset: Double, over lo: Double, to hi: Double) -> [GainRamp] {
    guard lo.isFinite, hi.isFinite, offset.isFinite, hi - lo >= tick else { return [] }
    let curve: [GainPoint] = usable(points).map { (p: GainPoint) -> GainPoint in GainPoint(time: p.time + offset, gain: p.gain) }
    guard !curve.isEmpty else { return [] }
    var marks: [GainPoint] = [GainPoint(time: lo, gain: gain(at: lo, in: curve))]
    // A breakpoint within a tick of either end is left out: the end's own (interpolated) gain stands for it.
    for p in curve where p.time - lo >= tick && hi - p.time >= tick { marks.append(p) }
    marks.append(GainPoint(time: hi, gain: gain(at: hi, in: curve)))
    return ramps(from: marks)
  }
}
