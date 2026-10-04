import Foundation

/// One constant-speed stretch of a curved clip: `duration` SOURCE seconds played at `speed`. A clip's spans are in
/// PLAYBACK order (`playbackSpans` in src/editor/model/timeline.ts), which is the order its file is read in.
struct SpeedSpan: Equatable {
  let duration: Double
  let speed: Double
}

/// One stretch of the inserted source range to retime. The inserted range is the clip's own range plus its
/// transition handles: it begins `head` source seconds before the clip's own first frame.
struct SpeedRange: Equatable {
  let start: Double                                // source seconds from the START OF THE INSERTED RANGE
  let duration: Double                             // source seconds (the first range includes the head handle, the last the tail)
  let speed: Double
  let outputStart: Double                          // output seconds from the clip's own BODY START (negative for the first range when there is a head)

  /// Output seconds this range lasts once retimed.
  var outputDuration: Double { duration / speed }
}

/// A curved clip's retiming: what to scale, and where the clip's own body ends up inside the retimed material.
struct SpeedPlan: Equatable {
  let ranges: [SpeedRange]                         // playback order, back to back from 0
  let bodyStart: Double                            // output seconds from the start of the retimed material to the clip's own first frame (= the head handle after retiming)
  let bodyLength: Double                           // output seconds of the clip's own range = Σ duration / speed
  let tailLength: Double                           // output seconds of the tail handle after retiming

  var outputDurations: [Double] { ranges.map { (r: SpeedRange) -> Double in r.outputDuration } }
  /// Output seconds of everything inserted: head handle + body + tail handle.
  var outputDuration: Double { bodyStart + bodyLength + tailLength }
}

/// Pure maths for exporting a speed curve (no AVFoundation): `ExportSession` inserts a curved clip's source range
/// once and retimes each range of the plan, last to first. A clip without spans never comes here.
enum SpeedSpans {
  /// Lengths below this are treated as nothing (float noise from adding spans up).
  static let epsilon = 1e-9

  /// The spans that can be played: a span whose duration is not a positive finite number is dropped; a speed that
  /// is not a positive finite number plays at 1 (as `ExportSession` treats a clip's `speed`).
  static func usable(_ spans: [SpeedSpan]) -> [SpeedSpan] {
    var out: [SpeedSpan] = []
    for s in spans where s.duration.isFinite && s.duration > 0 {
      out.append(SpeedSpan(duration: s.duration, speed: s.speed.isFinite && s.speed > 0 ? s.speed : 1))
    }
    return out
  }

  /// The spans made to cover exactly `length` source seconds (the clamped trim range), so nothing beyond it is ever
  /// read: when they add up to less, the LAST span is lengthened; when they add up to more, the last span is
  /// shortened — and spans lying wholly beyond `length` are dropped, so the span that crosses it becomes the last.
  /// No spans, or no length → none.
  static func fitted(_ spans: [SpeedSpan], to length: Double) -> [SpeedSpan] {
    guard length.isFinite, length > 0 else { return [] }
    var out: [SpeedSpan] = []
    var left = length
    for s in spans {
      guard left > epsilon else { break }
      let d = min(s.duration, left)
      out.append(SpeedSpan(duration: d, speed: s.speed))
      left -= d
    }
    if left > 0, let last = out.last {
      out[out.count - 1] = SpeedSpan(duration: last.duration + left, speed: last.speed)
    }
    return out
  }

  /// Output seconds the spans last: Σ duration / speed (`clipDuration` of a curved clip).
  static func outputSeconds(_ spans: [SpeedSpan]) -> Double {
    var total = 0.0
    for s in spans { total += s.duration / s.speed }
    return total
  }

  /// Source seconds played during the first `output` seconds of the spans (usable, in playback order): what is left
  /// of a layer that runs past the end of the video. Never more than the spans hold; no output, or one that is not a
  /// positive finite number → 0.
  static func sourceSeconds(_ spans: [SpeedSpan], output: Double) -> Double {
    guard output.isFinite, output > 0 else { return 0 }
    var left = output
    var source = 0.0
    for s in spans {
      let lasts = s.duration / s.speed
      if lasts >= left { return source + left * s.speed }
      source += s.duration
      left -= lasts
    }
    return source
  }

  /// The ranges to retime for `spans` (usable, in playback order) with `head` / `tail` source seconds of transition
  /// handle before / after the clip's own range. The first range is extended by the head and the last by the tail,
  /// so a handle plays at the speed of the nearest edge span. Negative or non-finite handles count as 0.
  static func plan(_ spans: [SpeedSpan], head: Double, tail: Double) -> SpeedPlan {
    guard let first = spans.first, let last = spans.last else {
      return SpeedPlan(ranges: [], bodyStart: 0, bodyLength: 0, tailLength: 0)
    }
    let h = head.isFinite ? max(0, head) : 0
    let t = tail.isFinite ? max(0, tail) : 0
    var ranges: [SpeedRange] = []
    var source = 0.0                               // source seconds from the clip's own start
    var output = 0.0                               // output seconds from the clip's own body start
    for (i, s) in spans.enumerated() {
      let isFirst = i == 0, isLast = i == spans.count - 1
      ranges.append(SpeedRange(
        start: isFirst ? 0 : h + source,
        duration: s.duration + (isFirst ? h : 0) + (isLast ? t : 0),
        speed: s.speed,
        outputStart: isFirst ? -h / s.speed : output))
      source += s.duration
      output += s.duration / s.speed
    }
    return SpeedPlan(ranges: ranges, bodyStart: h / first.speed, bodyLength: output, tailLength: t / last.speed)
  }
}
