import AVFoundation
import XCTest
@testable import ClipyVideo

final class InstructionSplitTests: XCTestCase {
  private func t(_ seconds: Double) -> CMTime { ExportSession.time(seconds) }
  private func range(_ start: Double, _ end: Double) -> CMTimeRange { CMTimeRange(start: t(start), end: t(end)) }
  /// Pieces as [start, end] seconds, one list per range.
  private func seconds(_ pieces: [[CMTimeRange]]) -> [[[Double]]] {
    pieces.map { (list: [CMTimeRange]) -> [[Double]] in list.map { (r: CMTimeRange) -> [Double] in [r.start.seconds, r.end.seconds] } }
  }

  private func spec(_ trackID: CMPersistentTrackID, transparent: Bool = false) -> LayerSpec {
    LayerSpec(trackID: trackID, fill: .identity, orient: .identity, crop: .full, transform: .identity, background: .black,
              filter: nil, transparent: transparent)
  }

  // MARK: - splitRanges

  func testNoBoundariesLeaveEveryRangeAsItsOnePiece() {
    let pieces = InstructionSplit.splitRanges(ranges: [range(0, 2), range(2, 5)], boundaries: [])
    XCTAssertEqual(seconds(pieces), [[[0, 2]], [[2, 5]]])
    XCTAssertEqual(seconds(InstructionSplit.splitRanges(ranges: [], boundaries: [t(1)])), [])
  }

  func testARangeIsCutAtTheBoundariesInsideIt() {
    let pieces = InstructionSplit.splitRanges(ranges: [range(0, 4)], boundaries: [t(1), t(3)])
    XCTAssertEqual(seconds(pieces), [[[0, 1], [1, 3], [3, 4]]])
  }

  /// A boundary on a range's edge, outside it, repeated, or not a number cuts nothing; the order given does not matter.
  func testOnlyBoundariesStrictlyInsideCut() {
    let boundaries = [t(4), t(3), t(2), t(1), t(5), t(3), CMTime.invalid, CMTime.positiveInfinity]
    let pieces = InstructionSplit.splitRanges(ranges: [range(2, 4)], boundaries: boundaries)
    XCTAssertEqual(seconds(pieces), [[[2, 3], [3, 4]]])
  }

  func testEachRangeIsCutByItsOwnBoundaries() {
    let pieces = InstructionSplit.splitRanges(ranges: [range(0, 2), range(2, 5)], boundaries: [t(1), t(2), t(4)])
    XCTAssertEqual(seconds(pieces), [[[0, 1], [1, 2]], [[2, 4], [4, 5]]])
  }

  /// The pieces are back to back from the range's start to its end, each with a length.
  func testThePiecesCoverTheRangeWithoutGaps() {
    let whole = range(1.25, 7.5)
    let pieces = InstructionSplit.splitRanges(ranges: [whole], boundaries: [t(6), t(2), t(2.5), t(7.5), t(1.25)])[0]
    XCTAssertEqual(pieces.count, 4)
    XCTAssertEqual(CMTimeCompare(pieces[0].start, whole.start), 0)
    XCTAssertEqual(CMTimeCompare(pieces[pieces.count - 1].end, whole.end), 0)
    for (a, b) in zip(pieces, pieces.dropFirst()) { XCTAssertEqual(CMTimeCompare(a.end, b.start), 0) }
    for p in pieces { XCTAssertGreaterThan(CMTimeCompare(p.duration, .zero), 0) }
  }

  func testIntersectsTreatsTheEndAsExclusive() {
    XCTAssertTrue(InstructionSplit.intersects(range(1, 4), range(3, 5)))
    XCTAssertTrue(InstructionSplit.intersects(range(1, 4), range(0, 10)))
    XCTAssertTrue(InstructionSplit.intersects(range(1, 4), range(2, 3)))
    XCTAssertFalse(InstructionSplit.intersects(range(1, 4), range(4, 5)))
    XCTAssertFalse(InstructionSplit.intersects(range(1, 4), range(0, 1)))
    XCTAssertFalse(InstructionSplit.intersects(range(1, 4), range(6, 7)))
  }

  // MARK: - attach

  private func trackIDs(_ instruction: AVVideoCompositionInstructionProtocol) -> [Int] {
    (instruction.requiredSourceTrackIDs ?? []).compactMap { ($0 as? NSNumber)?.intValue }
  }

  func testWithoutLayersTheInstructionsComeBackAsTheyAre() {
    let solo = ClipyInstruction(timeRange: range(0, 3), layers: [spec(1)], transition: nil)
    let out = InstructionSplit.attach([], to: [solo])
    XCTAssertEqual(out.count, 1)
    XCTAssertTrue(out[0] === solo)
    XCTAssertTrue(solo.overlays.isEmpty)
    XCTAssertEqual(trackIDs(solo), [1])
  }

  /// Clips: A alone on [0, 2), a transition window [2, 3), B alone on [3, 6) and [6, 8). Layers: one on [1, 4) and
  /// one above it on [3.5, 6). Every piece lists exactly the layers shown during it, in draw order.
  func testInstructionsAreCutAtLayerEdgesAndListTheLayersShown() {
    let a = spec(1), b = spec(2)
    let low = spec(7, transparent: true), high = spec(8, transparent: true)
    let glitch = ActiveEffectSpec(type: "glitch", start: 3.2, end: 3.4, intensity: 1)
    let window = (type: "dissolve", start: t(2), duration: t(1))
    let instructions: [AVVideoCompositionInstructionProtocol] = [
      ClipyInstruction(timeRange: range(0, 2), layers: [a], transition: nil),
      ClipyInstruction(timeRange: range(2, 3), layers: [a, b], transition: window),
      ClipyInstruction(timeRange: range(3, 6), layers: [b], transition: nil, effects: [glitch]),
      ClipyInstruction(timeRange: range(6, 8), layers: [b], transition: nil),
    ]
    let overlays = [PlacedOverlay(spec: low, range: range(1, 4)), PlacedOverlay(spec: high, range: range(3.5, 6))]
    let out = InstructionSplit.attach(overlays, to: instructions)

    XCTAssertEqual(out.map { [$0.timeRange.start.seconds, $0.timeRange.end.seconds] },
                   [[0, 1], [1, 2], [2, 3], [3, 3.5], [3.5, 4], [4, 6], [6, 8]])
    XCTAssertEqual(out.map { trackIDs($0) }, [[1], [1, 7], [1, 2, 7], [2, 7], [2, 7, 8], [2, 8], [2]])
    let pieces = out.compactMap { $0 as? ClipyInstruction }
    XCTAssertEqual(pieces.count, out.count)
    XCTAssertEqual(pieces.map { $0.overlays.map { $0.trackID } }, [[], [7], [7], [7], [7, 8], [8], []])
    // The window keeps its own start and duration (the transition's progress does not restart), and its two clips.
    XCTAssertEqual(pieces[2].transition?.type, "dissolve")
    XCTAssertEqual(pieces[2].transition?.start.seconds, 2)
    XCTAssertEqual(pieces[2].transition?.duration.seconds, 1)
    XCTAssertEqual(pieces[2].layers.map { $0.trackID }, [1, 2])
    XCTAssertNil(pieces[3].transition)
    // Each piece carries the effects overlapping it.
    XCTAssertEqual(pieces.map { $0.effects.count }, [0, 0, 0, 1, 0, 0, 0])
    // An instruction no layer touches is the same object.
    XCTAssertTrue(out[6] === instructions[3])
    // Contiguous, as AVFoundation needs.
    for (x, y) in zip(out, out.dropFirst()) { XCTAssertEqual(CMTimeCompare(x.timeRange.end, y.timeRange.start), 0) }
  }

  /// A layer covering a whole instruction does not cut it, but the instruction still lists the layer.
  func testALayerOverAWholeInstructionIsListedWithoutACut() {
    let solo = ClipyInstruction(timeRange: range(0, 3), layers: [spec(1)], transition: nil)
    let out = InstructionSplit.attach([PlacedOverlay(spec: spec(7, transparent: true), range: range(0, 3))], to: [solo])
    XCTAssertEqual(out.count, 1)
    XCTAssertEqual(trackIDs(out[0]), [1, 7])
    XCTAssertEqual(out[0].timeRange.duration.seconds, 3)
  }
}
