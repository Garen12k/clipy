import CoreMedia
import XCTest
@testable import ClipyVideo

final class SpeedSpansTests: XCTestCase {
  private func span(_ duration: Double, _ speed: Double) -> SpeedSpan { SpeedSpan(duration: duration, speed: speed) }
  private func t(_ seconds: Double) -> CMTime { ExportSession.time(seconds) }

  // MARK: - usable / fitted / outputDuration

  func testUsableDropsSpansWithoutLengthAndRepairsTheSpeed() {
    let spans = [span(1, 2), span(0, 3), span(-1, 3), span(.nan, 1), span(.infinity, 1), span(2, 0), span(0.5, .nan), span(1, -4)]
    XCTAssertEqual(SpeedSpans.usable(spans), [span(1, 2), span(2, 1), span(0.5, 1), span(1, 1)])
    XCTAssertEqual(SpeedSpans.usable([]), [])
  }

  func testFittedLeavesSpansThatAlreadyCoverTheLength() {
    let spans = [span(1, 4), span(1, 3), span(2, 0.5)]
    XCTAssertEqual(SpeedSpans.fitted(spans, to: 4), spans)
  }

  /// The real file is shorter than the app believed: the last span is shortened, never the others.
  func testFittedShortensTheLastSpan() {
    XCTAssertEqual(SpeedSpans.fitted([span(1, 4), span(1, 3), span(2, 0.5)], to: 3.5), [span(1, 4), span(1, 3), span(1.5, 0.5)])
  }

  /// A layer cut by the end of the video: the source seconds its first `output` seconds play, span by span.
  func testSourceSecondsOfAnOutputLength() {
    let spans = [span(1, 2), span(2, 0.5), span(1, 4)]           // output 0.5 + 4 + 0.25 = 4.75 s
    XCTAssertEqual(SpeedSpans.sourceSeconds(spans, output: 0.25), 0.5, accuracy: 1e-9)    // inside the ×2 span
    XCTAssertEqual(SpeedSpans.sourceSeconds(spans, output: 0.5), 1, accuracy: 1e-9)       // exactly at the first cut
    XCTAssertEqual(SpeedSpans.sourceSeconds(spans, output: 2.5), 2, accuracy: 1e-9)       // 2 s into the ×0.5 span
    XCTAssertEqual(SpeedSpans.sourceSeconds(spans, output: 4.6), 3.4, accuracy: 1e-9)     // 0.1 s into the ×4 span
    XCTAssertEqual(SpeedSpans.sourceSeconds(spans, output: 4.75), 4, accuracy: 1e-9)
    XCTAssertEqual(SpeedSpans.sourceSeconds(spans, output: 99), 4, accuracy: 1e-9)        // never more than there is
    XCTAssertEqual(SpeedSpans.sourceSeconds([span(3, 1.5)], output: 1), 1.5, accuracy: 1e-9)   // a constant speed is one span
    for none in [0, -1, Double.nan, Double.infinity] { XCTAssertEqual(SpeedSpans.sourceSeconds(spans, output: none), 0) }
    XCTAssertEqual(SpeedSpans.sourceSeconds([], output: 2), 0)
  }

  /// The spans kept for a cut layer play for exactly the length that is left.
  func testSpansFittedToACutLayerLastTheLengthLeft() {
    let spans = [span(1, 2), span(2, 0.5), span(1, 4)]
    let kept = SpeedSpans.fitted(spans, to: SpeedSpans.sourceSeconds(spans, output: 2.5))
    XCTAssertEqual(kept, [span(1, 2), span(1, 0.5)])
    XCTAssertEqual(SpeedSpans.outputSeconds(kept), 2.5, accuracy: 1e-9)
    let constant = [span(3, 1.5)]
    XCTAssertEqual(SpeedSpans.fitted(constant, to: SpeedSpans.sourceSeconds(constant, output: 1)), [span(1.5, 1.5)])
  }

  /// Much shorter: spans wholly beyond the length go, and the one crossing it becomes the (shortened) last span.
  func testFittedDropsSpansBeyondTheLength() {
    XCTAssertEqual(SpeedSpans.fitted([span(1, 4), span(1, 3), span(2, 0.5)], to: 1.25), [span(1, 4), span(0.25, 3)])
    XCTAssertEqual(SpeedSpans.fitted([span(1, 4), span(1, 3)], to: 1), [span(1, 4)])
  }

  func testFittedLengthensTheLastSpan() {
    XCTAssertEqual(SpeedSpans.fitted([span(1, 4), span(1, 3)], to: 2.5), [span(1, 4), span(1.5, 3)])
  }

  func testFittedAlwaysAddsUpToTheLength() {
    let spans = [span(0.1, 4), span(0.2, 3), span(0.3, 0.5), span(0.7, 2)]
    for length in [0.05, 0.3, 0.6000000001, 1.3, 1.2999999999, 9.0] {
      let fitted = SpeedSpans.fitted(spans, to: length)
      XCTAssertEqual(fitted.reduce(0) { $0 + $1.duration }, length, accuracy: 1e-12, "\(length)")
      XCTAssertTrue(fitted.allSatisfy { $0.duration > 0 }, "\(length)")
    }
  }

  func testFittedIsEmptyWithoutSpansOrLength() {
    XCTAssertEqual(SpeedSpans.fitted([], to: 3), [])
    XCTAssertEqual(SpeedSpans.fitted([span(1, 2)], to: 0), [])
    XCTAssertEqual(SpeedSpans.fitted([span(1, 2)], to: -1), [])
    XCTAssertEqual(SpeedSpans.fitted([span(1, 2)], to: .nan), [])
  }

  func testOutputDurationIsTheSumOfDurationOverSpeed() {
    XCTAssertEqual(SpeedSpans.outputSeconds([span(1, 2), span(2, 0.5), span(1, 4)]), 4.75, accuracy: 1e-12)
    // "hero" over 8 s (1 s slices): 1 + 0.5 + 1/3 + 2 + 2 + 1/3 + 0.5 + 1.
    let hero = [1, 2, 3, 0.5, 0.5, 3, 2, 1].map { span(1, $0) }
    XCTAssertEqual(SpeedSpans.outputSeconds(hero), 23.0 / 3, accuracy: 1e-12)
    XCTAssertEqual(SpeedSpans.outputSeconds([]), 0)
  }

  // MARK: - plan

  func testPlanWithoutHandlesIsTheSpansBackToBack() {
    let p = SpeedSpans.plan([span(1, 2), span(2, 0.5), span(1, 4)], head: 0, tail: 0)
    XCTAssertEqual(p.ranges, [
      SpeedRange(start: 0, duration: 1, speed: 2, outputStart: 0),
      SpeedRange(start: 1, duration: 2, speed: 0.5, outputStart: 0.5),
      SpeedRange(start: 3, duration: 1, speed: 4, outputStart: 4.5),
    ])
    XCTAssertEqual(p.outputDurations, [0.5, 4, 0.25])
    XCTAssertEqual(p.bodyStart, 0); XCTAssertEqual(p.bodyLength, 4.75); XCTAssertEqual(p.tailLength, 0)
    XCTAssertEqual(p.outputDuration, 4.75)
  }

  /// Head 0.5 s and tail 0.8 s of source: the first range starts at the inserted range's start and is 0.5 s longer,
  /// the last is 0.8 s longer; the ranges in between move 0.5 s later. The handles play at the edge spans' speeds.
  func testPlanExtendsTheFirstRangeByTheHeadAndTheLastByTheTail() {
    let p = SpeedSpans.plan([span(1, 2), span(2, 0.5), span(1, 4)], head: 0.5, tail: 0.8)
    XCTAssertEqual(p.ranges.count, 3)
    let expected: [(start: Double, duration: Double, speed: Double, outputStart: Double, out: Double)] = [
      (0, 1.5, 2, -0.25, 0.75), (1.5, 2, 0.5, 0.5, 4), (3.5, 1.8, 4, 4.5, 0.45),
    ]
    for (r, e) in zip(p.ranges, expected) {
      XCTAssertEqual(r.start, e.start, accuracy: 1e-12); XCTAssertEqual(r.duration, e.duration, accuracy: 1e-12)
      XCTAssertEqual(r.speed, e.speed); XCTAssertEqual(r.outputStart, e.outputStart, accuracy: 1e-12)
      XCTAssertEqual(r.outputDuration, e.out, accuracy: 1e-12)
    }
    XCTAssertEqual(p.bodyStart, 0.25, accuracy: 1e-12)        // 0.5 s of head at speed 2
    XCTAssertEqual(p.bodyLength, 4.75, accuracy: 1e-12)       // unchanged by the handles
    XCTAssertEqual(p.tailLength, 0.2, accuracy: 1e-12)        // 0.8 s of tail at speed 4
    XCTAssertEqual(p.outputDuration, 5.2, accuracy: 1e-12)
    XCTAssertEqual(p.outputDurations.reduce(0, +), p.outputDuration, accuracy: 1e-12)
  }

  /// The ranges tile the inserted source range [0, head + Σ duration + tail] in playback order, and each range's
  /// output start is the previous one's plus its output length.
  func testPlanRangesAreContiguousInSourceAndOutput() {
    let spans = [4, 3, 2, 1.5, 1, 1, 1, 1].map { span(0.7, $0) }
    let p = SpeedSpans.plan(spans, head: 0.3, tail: 0.4)
    XCTAssertEqual(p.ranges.map { $0.speed }, [4, 3, 2, 1.5, 1, 1, 1, 1])
    XCTAssertEqual(p.ranges.first?.start, 0)
    for (a, b) in zip(p.ranges, p.ranges.dropFirst()) {
      XCTAssertEqual(a.start + a.duration, b.start, accuracy: 1e-12)
      XCTAssertEqual(a.outputStart + a.outputDuration, b.outputStart, accuracy: 1e-12)
    }
    let last = p.ranges[p.ranges.count - 1]
    XCTAssertEqual(last.start + last.duration, 0.3 + 8 * 0.7 + 0.4, accuracy: 1e-12)
    XCTAssertEqual(p.ranges[0].outputStart, -p.bodyStart, accuracy: 1e-12)
    XCTAssertEqual(last.outputStart + last.outputDuration, p.bodyLength + p.tailLength, accuracy: 1e-12)
    XCTAssertEqual(p.bodyLength, SpeedSpans.outputSeconds(spans), accuracy: 1e-12)
  }

  func testPlanOfOneSpanCarriesBothHandles() {
    let p = SpeedSpans.plan([span(2, 2)], head: 0.4, tail: 0.6)
    XCTAssertEqual(p.ranges.count, 1)
    XCTAssertEqual(p.ranges[0].start, 0); XCTAssertEqual(p.ranges[0].duration, 3, accuracy: 1e-12)
    XCTAssertEqual(p.ranges[0].outputStart, -0.2, accuracy: 1e-12); XCTAssertEqual(p.ranges[0].outputDuration, 1.5, accuracy: 1e-12)
    XCTAssertEqual(p.bodyStart, 0.2, accuracy: 1e-12); XCTAssertEqual(p.bodyLength, 1, accuracy: 1e-12)
    XCTAssertEqual(p.tailLength, 0.3, accuracy: 1e-12)
  }

  func testPlanTreatsBadHandlesAsNoneAndNoSpansAsNothing() {
    let p = SpeedSpans.plan([span(1, 2), span(1, 4)], head: -1, tail: .nan)
    XCTAssertEqual(p, SpeedSpans.plan([span(1, 2), span(1, 4)], head: 0, tail: 0))
    let none = SpeedSpans.plan([], head: 0.5, tail: 0.5)
    XCTAssertTrue(none.ranges.isEmpty); XCTAssertEqual(none.outputDuration, 0)
  }

  // MARK: - request → spans

  func testRequestSpansAreReadInOrderAndAConstantClipHasNone() {
    XCTAssertEqual(ExportSession.speedSpans(ExportClip()), [])
    var a = ExportSpeedSpan(); a.duration = 1; a.speed = 4
    var bad = ExportSpeedSpan(); bad.duration = 0; bad.speed = 2
    var b = ExportSpeedSpan(); b.duration = 0.5; b.speed = 0.5
    var c = ExportClip()
    c.speedSpans = [a, bad, b]
    XCTAssertEqual(ExportSession.speedSpans(c), [span(1, 4), span(0.5, 0.5)])
  }

  // MARK: - cut points (CMTime)

  /// Spans (1 s ×2), (2 s ×0.5), (1 s ×4) of a clip trimmed to source 2…6, placed at composition 10 with no handles.
  func testRetimeCutsKeepEveryCutBetweenTheEnds() {
    let cuts = ExportSession.retimeCuts(
      from: (source: t(2), output: t(10)), to: (source: t(6), output: t(14.75)),
      interior: [(source: t(3), output: t(10.5)), (source: t(5), output: t(14.5))])
    XCTAssertEqual(cuts.source.map { $0.seconds }, [2, 3, 5, 6])
    XCTAssertEqual(cuts.output.map { $0.seconds }, [10, 10.5, 14.5, 14.75])
  }

  func testRetimeCutsDropACutThatWouldLeaveAnEmptyPiece() {
    // The second cut has the first one's output time (a span that rounds to nothing): it joins its neighbour.
    let same = ExportSession.retimeCuts(
      from: (source: t(0), output: t(0)), to: (source: t(4), output: t(3)),
      interior: [(source: t(1), output: t(0.5)), (source: t(2), output: t(0.5)), (source: t(3), output: t(2))])
    XCTAssertEqual(same.source.map { $0.seconds }, [0, 1, 3, 4])
    XCTAssertEqual(same.output.map { $0.seconds }, [0, 0.5, 2, 3])
    // Cuts at or outside the ends (audio that covers only part of the clip) are dropped; the ends stay exact.
    let part = ExportSession.retimeCuts(
      from: (source: t(1.5), output: t(0.75)), to: (source: t(3), output: t(2)),
      interior: [(source: t(1), output: t(0.5)), (source: t(2), output: t(1)), (source: t(3), output: t(2))])
    XCTAssertEqual(part.source.map { $0.seconds }, [1.5, 2, 3])
    XCTAssertEqual(part.output.map { $0.seconds }, [0.75, 1, 2])
    let none = ExportSession.retimeCuts(from: (source: t(0), output: t(0)), to: (source: t(1), output: t(2)), interior: [])
    XCTAssertEqual(none.source.count, 2); XCTAssertEqual(none.output.count, 2)
  }

  func testRetimedTimeFollowsTheCuts() {
    let cuts = RetimeCuts(source: [t(2), t(3), t(5), t(6)], output: [t(10), t(10.5), t(14.5), t(14.75)])
    XCTAssertEqual(CMTimeCompare(ExportSession.retimedTime(t(2), cuts: cuts), t(10)), 0)
    XCTAssertEqual(CMTimeCompare(ExportSession.retimedTime(t(3), cuts: cuts), t(10.5)), 0)
    XCTAssertEqual(CMTimeCompare(ExportSession.retimedTime(t(6), cuts: cuts), t(14.75)), 0)
    XCTAssertEqual(ExportSession.retimedTime(t(2.5), cuts: cuts).seconds, 10.25, accuracy: 1e-9)   // ×2
    XCTAssertEqual(ExportSession.retimedTime(t(4), cuts: cuts).seconds, 12.5, accuracy: 1e-9)      // ×0.5
    XCTAssertEqual(ExportSession.retimedTime(t(5.5), cuts: cuts).seconds, 14.625, accuracy: 1e-9)  // ×4
    XCTAssertEqual(ExportSession.retimedTime(t(0), cuts: cuts).seconds, 10)                         // before → the start
    XCTAssertEqual(ExportSession.retimedTime(t(9), cuts: cuts).seconds, 14.75)                      // after → the end
  }

  /// The whole chain for a clip with handles, as `ExportSession` builds it: the clip's own range lands exactly on
  /// [bodyStart, bodyStart + outDur) and the pieces' output lengths add up to the whole insert.
  func testCutsBuiltFromAPlanKeepTheBodyInPlace() {
    let spans = [span(1, 2), span(2, 0.5), span(1, 4)]
    let head = 0.5, tail = 0.8, clipSourceStart = 2.0
    let plan = SpeedSpans.plan(spans, head: head, tail: tail)
    let bodyStart = t(10), bodyEnd = t(10) + t(SpeedSpans.outputSeconds(spans))
    let sourceStart = t(clipSourceStart - head), sourceEnd = t(clipSourceStart + 4 + tail)
    let mainStart = bodyStart - t(plan.bodyStart), mainEnd = bodyEnd + t(plan.tailLength)
    let interior = plan.ranges.dropFirst().map { (source: sourceStart + t($0.start), output: bodyStart + t($0.outputStart)) }
    let cuts = ExportSession.retimeCuts(from: (source: sourceStart, output: mainStart), to: (source: sourceEnd, output: mainEnd), interior: interior)
    XCTAssertEqual(cuts.source.map { $0.seconds }, [1.5, 3, 5, 6.8])
    XCTAssertEqual(cuts.output.map { $0.seconds }, [9.75, 10.5, 14.5, 14.95])
    // The clip's own first / last frame (source 2 and 6) land on the body's ends.
    XCTAssertEqual(ExportSession.retimedTime(t(2), cuts: cuts).seconds, 10, accuracy: 0.002)
    XCTAssertEqual(ExportSession.retimedTime(t(6), cuts: cuts).seconds, 14.75, accuracy: 0.002)
    var total = CMTime.zero
    for j in 0..<(cuts.output.count - 1) { total = total + (cuts.output[j + 1] - cuts.output[j]) }
    XCTAssertEqual(CMTimeCompare(total, mainEnd - mainStart), 0)
  }
}
