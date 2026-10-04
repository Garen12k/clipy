import CoreGraphics
import CoreImage
import XCTest
@testable import ClipyVideo

/// The vectors of src/editor/model/__tests__/motion.vectors.ts. The tables below are checked against the TS vectors by
/// src/editor/model/__tests__/motion.parity.test.ts — keep the literals identical. `fn` is "in" (`animInDelta`) or
/// "out" (`animOutDelta`).
struct MotionDeltaVector {
  let fn: String
  let name: String
  let id: String
  let p: Double
  let distance: Double
  let dx: Double
  let dy: Double
  let scale: Double
  let rotation: Double
  let opacity: Double
}

struct MotionComboVector {
  let name: String
  let id: String
  let p: Double
  let seconds: Double
  let dx: Double
  let dy: Double
  let scale: Double
  let rotation: Double
  let opacity: Double
}

struct MotionLoopVector {
  let name: String
  let id: String
  let seconds: Double
  let dx: Double
  let dy: Double
  let scale: Double
  let rotation: Double
  let opacity: Double
}

/// `sampleKeyframes(motionKeyPins, t)`.
struct MotionKeyVector {
  let name: String
  let t: Double
  let x: Double
  let y: Double
  let scale: Double
  let rotation: Double
  let opacity: Double
}

/// `Motion.resolveClip`: pins in clip-local OUTPUT seconds, edge durations already scaled.
struct MotionResolveVector {
  let name: String
  let base: KeyValues
  let keyframes: [MotionKeyframe]
  let animIn: MotionEdge?
  let animOut: MotionEdge?
  let animCombo: String?
  let local: Double
  let length: Double
  let x: Double
  let y: Double
  let scale: Double
  let rotation: Double
  let opacity: Double
}

let motionDeltaVectors: [MotionDeltaVector] = [
  MotionDeltaVector(fn: "in", name: "fade p=0", id: "fade", p: 0, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 0),
  MotionDeltaVector(fn: "in", name: "fade p=0.5", id: "fade", p: 0.5, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 0.875),
  MotionDeltaVector(fn: "in", name: "fade p=1", id: "fade", p: 1, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "slideLeft p=0", id: "slideLeft", p: 0, distance: 1, dx: 1, dy: 0, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "slideLeft p=0.5", id: "slideLeft", p: 0.5, distance: 1, dx: 0.125, dy: 0, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "slideLeft p=1", id: "slideLeft", p: 1, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "slideRight p=0", id: "slideRight", p: 0, distance: 1, dx: -1, dy: 0, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "slideRight p=0.5", id: "slideRight", p: 0.5, distance: 1, dx: -0.125, dy: 0, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "slideRight p=1", id: "slideRight", p: 1, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "slideUp p=0", id: "slideUp", p: 0, distance: 1, dx: 0, dy: 1, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "slideUp p=0.5", id: "slideUp", p: 0.5, distance: 1, dx: 0, dy: 0.125, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "slideUp p=1", id: "slideUp", p: 1, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "slideDown p=0", id: "slideDown", p: 0, distance: 1, dx: 0, dy: -1, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "slideDown p=0.5", id: "slideDown", p: 0.5, distance: 1, dx: 0, dy: -0.125, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "slideDown p=1", id: "slideDown", p: 1, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "zoomIn p=0", id: "zoomIn", p: 0, distance: 1, dx: 0, dy: 0, scale: 0.6, rotation: 0, opacity: 0),
  MotionDeltaVector(fn: "in", name: "zoomIn p=0.5", id: "zoomIn", p: 0.5, distance: 1, dx: 0, dy: 0, scale: 0.95, rotation: 0, opacity: 0.875),
  MotionDeltaVector(fn: "in", name: "zoomIn p=1", id: "zoomIn", p: 1, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "zoomOut p=0", id: "zoomOut", p: 0, distance: 1, dx: 0, dy: 0, scale: 1.4, rotation: 0, opacity: 0),
  MotionDeltaVector(fn: "in", name: "zoomOut p=0.5", id: "zoomOut", p: 0.5, distance: 1, dx: 0, dy: 0, scale: 1.05, rotation: 0, opacity: 0.875),
  MotionDeltaVector(fn: "in", name: "zoomOut p=1", id: "zoomOut", p: 1, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "spin p=0", id: "spin", p: 0, distance: 1, dx: 0, dy: 0, scale: 0.5, rotation: -180, opacity: 0),
  MotionDeltaVector(fn: "in", name: "spin p=0.5", id: "spin", p: 0.5, distance: 1, dx: 0, dy: 0, scale: 0.9375, rotation: -22.5, opacity: 0.875),
  MotionDeltaVector(fn: "in", name: "spin p=1", id: "spin", p: 1, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "pop p=0", id: "pop", p: 0, distance: 1, dx: 0, dy: 0, scale: 0, rotation: 0, opacity: 0),
  MotionDeltaVector(fn: "in", name: "pop p=0.3", id: "pop", p: 0.3, distance: 1, dx: 0, dy: 0, scale: 0.575, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "pop p=0.5", id: "pop", p: 0.5, distance: 1, dx: 0, dy: 0, scale: 0.9583333333333334, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "pop p=0.6", id: "pop", p: 0.6, distance: 1, dx: 0, dy: 0, scale: 1.15, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "pop p=0.8", id: "pop", p: 0.8, distance: 1, dx: 0, dy: 0, scale: 1.075, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "pop p=1", id: "pop", p: 1, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "rise p=0", id: "rise", p: 0, distance: 1, dx: 0, dy: 0.15, scale: 1, rotation: 0, opacity: 0),
  MotionDeltaVector(fn: "in", name: "rise p=0.5", id: "rise", p: 0.5, distance: 1, dx: 0, dy: 0.01875, scale: 1, rotation: 0, opacity: 0.875),
  MotionDeltaVector(fn: "in", name: "rise p=1", id: "rise", p: 1, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "slideLeft p=0.5 overlay distance", id: "slideLeft", p: 0.5, distance: 0.25, dx: 0.03125, dy: 0, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "in", name: "rise p=0 overlay distance", id: "rise", p: 0, distance: 0.25, dx: 0, dy: 0.15, scale: 1, rotation: 0, opacity: 0),
  MotionDeltaVector(fn: "out", name: "slideLeft out p=0", id: "slideLeft", p: 0, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "out", name: "slideLeft out p=0.5", id: "slideLeft", p: 0.5, distance: 1, dx: -0.125, dy: 0, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "out", name: "slideLeft out p=1", id: "slideLeft", p: 1, distance: 1, dx: -1, dy: 0, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "out", name: "spin out p=0", id: "spin", p: 0, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1),
  MotionDeltaVector(fn: "out", name: "spin out p=0.5", id: "spin", p: 0.5, distance: 1, dx: 0, dy: 0, scale: 0.9375, rotation: 22.5, opacity: 0.875),
  MotionDeltaVector(fn: "out", name: "spin out p=1", id: "spin", p: 1, distance: 1, dx: 0, dy: 0, scale: 0.5, rotation: 180, opacity: 0),
]

let motionComboVectors: [MotionComboVector] = [
  MotionComboVector(name: "zoomInSlow", id: "zoomInSlow", p: 0.25, seconds: 0.5, dx: 0, dy: 0, scale: 1.0375, rotation: 0, opacity: 1),
  MotionComboVector(name: "zoomOutSlow", id: "zoomOutSlow", p: 0.25, seconds: 0.5, dx: 0, dy: 0, scale: 1.1125, rotation: 0, opacity: 1),
  MotionComboVector(name: "panLeft", id: "panLeft", p: 0.25, seconds: 0.5, dx: 0.025, dy: 0, scale: 1.1, rotation: 0, opacity: 1),
  MotionComboVector(name: "panRight", id: "panRight", p: 0.25, seconds: 0.5, dx: -0.025, dy: 0, scale: 1.1, rotation: 0, opacity: 1),
  MotionComboVector(name: "sway", id: "sway", p: 0.25, seconds: 0.5, dx: 0, dy: 0, scale: 1.08, rotation: 0, opacity: 1),
  MotionComboVector(name: "sway at an eighth", id: "sway", p: 0.125, seconds: 0.25, dx: 0, dy: 0, scale: 1.08, rotation: 3, opacity: 1),
  MotionComboVector(name: "pulse", id: "pulse", p: 0.25, seconds: 0.5, dx: 0, dy: 0, scale: 1.05, rotation: 0, opacity: 1),
]

let motionLoopVectors: [MotionLoopVector] = [
  MotionLoopVector(name: "wiggle", id: "wiggle", seconds: 0.1, dx: 0, dy: 0, scale: 1, rotation: 7.608452130361228, opacity: 1),
  MotionLoopVector(name: "pulse", id: "pulse", seconds: 0.1, dx: 0, dy: 0, scale: 1.0809016994374947, rotation: 0, opacity: 1),
  MotionLoopVector(name: "spin", id: "spin", seconds: 0.1, dx: 0, dy: 0, scale: 1, rotation: 18, opacity: 1),
  MotionLoopVector(name: "float", id: "float", seconds: 0.1, dx: 0, dy: 0.007226305111525729, scale: 1, rotation: 0, opacity: 1),
  MotionLoopVector(name: "blink", id: "blink", seconds: 0.1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 0.8660302069950538),
  MotionLoopVector(name: "shake", id: "shake", seconds: 0.1, dx: -0.007608452130361228, dy: 0, scale: 1, rotation: 0, opacity: 1),
]

let motionKeyPins: [MotionKeyframe] = [
  MotionKeyframe(t: 1, x: 0, y: 0.2, scale: 1, rotation: 0, opacity: 1),
  MotionKeyframe(t: 3, x: 0.4, y: -0.2, scale: 2, rotation: 90, opacity: 0.5),
]

let motionKeyVectors: [MotionKeyVector] = [
  MotionKeyVector(name: "midpoint", t: 2, x: 0.2, y: 0, scale: 1.5, rotation: 45, opacity: 0.75),
  MotionKeyVector(name: "quarter", t: 1.5, x: 0.0625, y: 0.1375, scale: 1.15625, rotation: 14.0625, opacity: 0.921875),
  MotionKeyVector(name: "before the first", t: 0, x: 0, y: 0.2, scale: 1, rotation: 0, opacity: 1),
  MotionKeyVector(name: "after the last", t: 5, x: 0.4, y: -0.2, scale: 2, rotation: 90, opacity: 0.5),
]

let motionResolveVectors: [MotionResolveVector] = [
  MotionResolveVector(name: "pins + In (the reversed clip as exported)", base: KeyValues(x: 0.9, y: 0.9, scale: 3, rotation: 10, opacity: 1), keyframes: [MotionKeyframe(t: 1, x: 0, y: 0.2, scale: 1, rotation: 0, opacity: 1), MotionKeyframe(t: 3, x: 0.4, y: -0.2, scale: 2, rotation: 90, opacity: 0.5)], animIn: MotionEdge(id: "zoomIn", duration: 3), animOut: nil, animCombo: nil, local: 1.5, length: 4, x: 0.0625, y: 0.1375, scale: 1.0984375, rotation: 14.0625, opacity: 0.806640625),
  MotionResolveVector(name: "static + In", base: KeyValues(x: 0.1, y: -0.3, scale: 2, rotation: 90, opacity: 1), keyframes: [], animIn: MotionEdge(id: "slideLeft", duration: 1), animOut: MotionEdge(id: "fade", duration: 2), animCombo: nil, local: 0.5, length: 10, x: 0.225, y: -0.3, scale: 2, rotation: 90, opacity: 1),
  MotionResolveVector(name: "static + Out", base: KeyValues(x: 0.1, y: -0.3, scale: 2, rotation: 90, opacity: 1), keyframes: [], animIn: MotionEdge(id: "slideLeft", duration: 1), animOut: MotionEdge(id: "fade", duration: 2), animCombo: nil, local: 9, length: 10, x: 0.1, y: -0.3, scale: 2, rotation: 90, opacity: 0.875),
  MotionResolveVector(name: "Combo", base: KeyValues(x: 0, y: 0, scale: 1, rotation: 0, opacity: 1), keyframes: [], animIn: MotionEdge(id: "fade", duration: 2), animOut: MotionEdge(id: "fade", duration: 2), animCombo: "zoomInSlow", local: 2, length: 8, x: 0, y: 0, scale: 1.0375, rotation: 0, opacity: 1),
]

/// `ANIM_IN_IDS` (Out animations use the same ids).
let motionInIds = ["fade", "slideLeft", "slideRight", "slideUp", "slideDown", "zoomIn", "zoomOut", "spin", "pop", "rise"]

final class MotionTests: XCTestCase {
  private func expectDelta(_ d: MotionDelta, dx: Double, dy: Double, scale: Double, rotation: Double, opacity: Double, _ name: String) {
    XCTAssertEqual(d.dx, dx, accuracy: 1e-9, name)
    XCTAssertEqual(d.dy, dy, accuracy: 1e-9, name)
    XCTAssertEqual(d.scale, scale, accuracy: 1e-9, name)
    XCTAssertEqual(d.rotation, rotation, accuracy: 1e-9, name)
    XCTAssertEqual(d.opacity, opacity, accuracy: 1e-9, name)
  }

  private func expectValues(_ v: KeyValues, x: Double, y: Double, scale: Double, rotation: Double, opacity: Double, _ name: String) {
    XCTAssertEqual(v.x, x, accuracy: 1e-9, name)
    XCTAssertEqual(v.y, y, accuracy: 1e-9, name)
    XCTAssertEqual(v.scale, scale, accuracy: 1e-9, name)
    XCTAssertEqual(v.rotation, rotation, accuracy: 1e-9, name)
    XCTAssertEqual(v.opacity, opacity, accuracy: 1e-9, name)
  }

  func testEasing() {
    XCTAssertEqual(Motion.easeOut(0), 0)
    XCTAssertEqual(Motion.easeOut(0.5), 0.875, accuracy: 1e-9)
    XCTAssertEqual(Motion.easeOut(1), 1)
    XCTAssertEqual(Motion.easeOut(-1), 0)
    XCTAssertEqual(Motion.easeOut(2), 1)
    XCTAssertEqual(Motion.smooth(0), 0)
    XCTAssertEqual(Motion.smooth(0.25), 0.15625, accuracy: 1e-9)
    XCTAssertEqual(Motion.smooth(0.5), 0.5, accuracy: 1e-9)
    XCTAssertEqual(Motion.smooth(1), 1)
    XCTAssertEqual(Motion.smooth(-3), 0)
    XCTAssertEqual(Motion.smooth(3), 1)
  }

  func testInAndOutMatchTheVectors() {
    XCTAssertFalse(motionDeltaVectors.isEmpty)
    for v in motionDeltaVectors {
      let d: MotionDelta
      switch v.fn {
      case "in": d = Motion.animInDelta(id: v.id, p: v.p, distance: v.distance)
      case "out": d = Motion.animOutDelta(id: v.id, p: v.p, distance: v.distance)
      default: XCTFail("\(v.fn): \(v.name)"); continue
      }
      expectDelta(d, dx: v.dx, dy: v.dy, scale: v.scale, rotation: v.rotation, opacity: v.opacity, "\(v.fn): \(v.name)")
    }
    // Every In id has a vector.
    XCTAssertEqual(Set(motionDeltaVectors.filter { $0.fn == "in" }.map { $0.id }), Set(motionInIds))
  }

  func testComboMatchesTheVectors() {
    XCTAssertFalse(motionComboVectors.isEmpty)
    for v in motionComboVectors {
      let d = Motion.animComboDelta(id: v.id, p: v.p, seconds: v.seconds)
      expectDelta(d, dx: v.dx, dy: v.dy, scale: v.scale, rotation: v.rotation, opacity: v.opacity, v.name)
    }
  }

  func testLoopMatchesTheVectors() {
    XCTAssertFalse(motionLoopVectors.isEmpty)
    for v in motionLoopVectors {
      let d = Motion.animLoopDelta(id: v.id, seconds: v.seconds)
      expectDelta(d, dx: v.dx, dy: v.dy, scale: v.scale, rotation: v.rotation, opacity: v.opacity, v.name)
    }
  }

  /// In at p = 1 and Out at p = 0 are EXACTLY the identity (so a finished In / an unstarted Out changes nothing),
  /// also when the progress is out of range (it is clamped).
  func testEndPointsAreExactlyTheIdentity() {
    XCTAssertEqual(motionInIds.count, 10)
    for id in motionInIds {
      XCTAssertEqual(Motion.animInDelta(id: id, p: 1, distance: 1), MotionDelta.identity, id)
      XCTAssertEqual(Motion.animOutDelta(id: id, p: 0, distance: 1), MotionDelta.identity, id)
      XCTAssertEqual(Motion.animInDelta(id: id, p: 5, distance: 0.25), MotionDelta.identity, id)
      XCTAssertEqual(Motion.animOutDelta(id: id, p: -5, distance: 0.25), MotionDelta.identity, id)
    }
  }

  func testOutMirrorsInWithOffsetsAndRotationNegated() {
    let steps: [Double] = [0, 0.2, 0.5, 0.9, 1]
    for id in motionInIds {
      for p in steps {
        let i = Motion.animInDelta(id: id, p: 1 - p, distance: 0.25)
        let o = Motion.animOutDelta(id: id, p: p, distance: 0.25)
        expectDelta(o, dx: -i.dx, dy: -i.dy, scale: i.scale, rotation: -i.rotation, opacity: i.opacity, "\(id) at \(p)")
      }
    }
  }

  func testUnknownIdsAndNonFiniteInputGiveTheIdentity() {
    XCTAssertEqual(Motion.animInDelta(id: "nope", p: 0.5, distance: 1), MotionDelta.identity)
    XCTAssertEqual(Motion.animOutDelta(id: "nope", p: 0.5, distance: 1), MotionDelta.identity)
    XCTAssertEqual(Motion.animComboDelta(id: "nope", p: 0.5, seconds: 1), MotionDelta.identity)
    XCTAssertEqual(Motion.animLoopDelta(id: "nope", seconds: 1), MotionDelta.identity)
    XCTAssertEqual(Motion.animInDelta(id: "fade", p: .nan, distance: 1), MotionDelta.identity)
    XCTAssertEqual(Motion.animInDelta(id: "slideLeft", p: 0.5, distance: .infinity), MotionDelta.identity)
    XCTAssertEqual(Motion.animOutDelta(id: "spin", p: .nan, distance: 1), MotionDelta.identity)
    XCTAssertEqual(Motion.animComboDelta(id: "pulse", p: 0.5, seconds: .nan), MotionDelta.identity)
    XCTAssertEqual(Motion.animComboDelta(id: "sway", p: .nan, seconds: 1), MotionDelta.identity)
    XCTAssertEqual(Motion.animLoopDelta(id: "spin", seconds: .infinity), MotionDelta.identity)
  }

  func testSampleKeyframesMatchesTheVectors() {
    XCTAssertFalse(motionKeyVectors.isEmpty)
    for v in motionKeyVectors {
      guard let got = Motion.sampleKeyframes(motionKeyPins, t: v.t) else { XCTFail(v.name); continue }
      expectValues(got, x: v.x, y: v.y, scale: v.scale, rotation: v.rotation, opacity: v.opacity, v.name)
    }
  }

  func testSampleKeyframesEdges() {
    XCTAssertNil(Motion.sampleKeyframes([], t: 1))
    let only = MotionKeyframe(t: 2, x: 0.3, y: 0, scale: 2, rotation: 0, opacity: 0.4)
    let times: [Double] = [0, 2, 9]
    for t in times { XCTAssertEqual(Motion.sampleKeyframes([only], t: t), only.values) }
    // Exactly on a pin; a non-finite time holds the first pin.
    XCTAssertEqual(Motion.sampleKeyframes(motionKeyPins, t: 1), motionKeyPins[0].values)
    XCTAssertEqual(Motion.sampleKeyframes(motionKeyPins, t: 3), motionKeyPins[1].values)
    XCTAssertEqual(Motion.sampleKeyframes(motionKeyPins, t: .nan), motionKeyPins[0].values)
    // Three pins use the surrounding pair; rotation is numeric (no shortest path).
    let pins = [
      MotionKeyframe(t: 0, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1),
      MotionKeyframe(t: 2, x: 0, y: 0, scale: 1, rotation: 350, opacity: 1),
      MotionKeyframe(t: 4, x: 1, y: 0, scale: 1, rotation: 350, opacity: 1),
    ]
    XCTAssertEqual(Motion.sampleKeyframes(pins, t: 1)?.rotation ?? -1, 175, accuracy: 1e-9)
    XCTAssertEqual(Motion.sampleKeyframes(pins, t: 3)?.x ?? -1, 0.5, accuracy: 1e-9)
    XCTAssertEqual(Motion.sampleKeyframes(pins, t: 3)?.rotation ?? -1, 350, accuracy: 1e-9)
  }

  func testCombine() {
    let got = Motion.combine(KeyValues(x: 0.25, y: -0.5, scale: 2, rotation: 30, opacity: 0.5),
                             MotionDelta(dx: 0.5, dy: 0.25, scale: 1.5, rotation: -45, opacity: 4))
    XCTAssertEqual(got, KeyValues(x: 0.75, y: -0.25, scale: 3, rotation: -15, opacity: 2))   // nothing is clamped here
    let base = KeyValues(x: 0.1, y: -0.2, scale: 2, rotation: 30, opacity: 0.5)
    XCTAssertEqual(Motion.combine(base, MotionDelta.identity), base)
  }

  /// Includes In + keyframes (the first vector: the reversed, speed-2, trimmed clip as the request carries it).
  func testResolveClipMatchesTheVectors() {
    XCTAssertFalse(motionResolveVectors.isEmpty)
    for v in motionResolveVectors {
      let got = Motion.resolveClip(base: v.base, keyframes: v.keyframes, animIn: v.animIn, animOut: v.animOut,
                                   animCombo: v.animCombo, local: v.local, length: v.length)
      expectValues(got, x: v.x, y: v.y, scale: v.scale, rotation: v.rotation, opacity: v.opacity, v.name)
    }
  }

  func testResolveClipWindowsAndClamping() {
    let base = KeyValues(x: 0.1, y: -0.3, scale: 2, rotation: 90, opacity: 1)
    let slide = MotionEdge(id: "slideLeft", duration: 1)
    let fade = MotionEdge(id: "fade", duration: 2)
    func at(_ local: Double) -> KeyValues {
      return Motion.resolveClip(base: base, keyframes: [], animIn: slide, animOut: fade, animCombo: nil, local: local, length: 10)
    }
    XCTAssertEqual(at(0).x, 1.1, accuracy: 1e-9)                  // 0.1 + slideClip
    XCTAssertEqual(at(0).opacity, 1)
    let between: [Double] = [1, 5, 8]
    for local in between { XCTAssertEqual(at(local), base, "\(local)") }   // between the windows: exactly the base
    XCTAssertEqual(at(10).opacity, 0)
    XCTAssertEqual(at(-3), at(0))                                 // clamped to the clip
    XCTAssertEqual(at(99), at(10))
    XCTAssertEqual(at(.nan), base)                                // non-finite: the base, no animation
    // No motion at all: the base comes back untouched.
    XCTAssertEqual(Motion.resolveClip(base: base, keyframes: [], animIn: nil, animOut: nil, animCombo: nil, local: 3, length: 10), base)
    // Opacity is clamped to 0–1; the placement is not clamped.
    let bright = [MotionKeyframe(t: 0, x: 1, y: 0, scale: 5, rotation: 0, opacity: 7)]
    let zoom = MotionEdge(id: "zoomOut", duration: 1)
    XCTAssertEqual(Motion.resolveClip(base: base, keyframes: bright, animIn: zoom, animOut: nil, animCombo: nil, local: 2, length: 4).opacity, 1)
    XCTAssertEqual(Motion.resolveClip(base: base, keyframes: bright, animIn: zoom, animOut: nil, animCombo: nil, local: 0, length: 4).scale, 7, accuracy: 1e-9)
    // A pin before 0 and one after the end still shape the interpolation.
    let around = [
      MotionKeyframe(t: -2, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1),
      MotionKeyframe(t: 2, x: 0.4, y: 0, scale: 1, rotation: 0, opacity: 1),
    ]
    XCTAssertEqual(Motion.resolveClip(base: base, keyframes: around, animIn: nil, animOut: nil, animCombo: nil, local: 0, length: 4).x, 0.2, accuracy: 1e-9)
    // The Combo's `seconds` are clip-local seconds: pulse peaks at 0.5 s.
    let plain = KeyValues(x: 0, y: 0, scale: 1, rotation: 0, opacity: 1)
    XCTAssertEqual(Motion.resolveClip(base: plain, keyframes: [], animIn: nil, animOut: nil, animCombo: "pulse", local: 0.5, length: 8).scale, 1.05, accuracy: 1e-9)
  }

  func testResolveOverlay() {
    let base = KeyValues(x: 0.5, y: 0.5, scale: 2, rotation: 10, opacity: 1)
    let slide = MotionEdge(id: "slideLeft", duration: 0.2)
    // local 0.1: In p = 0.5 → dx 0.125 × slideOverlay; spin 18°.
    let a = Motion.resolveOverlay(base: base, keyframes: [], animIn: slide, animOut: nil, animLoop: "spin", local: 0.1, length: 4)
    expectValues(a, x: 0.53125, y: 0.5, scale: 2, rotation: 28, opacity: 1, "In + Loop")
    let b = Motion.resolveOverlay(base: base, keyframes: [], animIn: slide, animOut: nil, animLoop: "spin", local: 2, length: 4)
    expectValues(b, x: 0.5, y: 0.5, scale: 2, rotation: 370, opacity: 1, "Loop only")
    // Pins replace the base (local 2 → the midpoint vector).
    let k = Motion.resolveOverlay(base: base, keyframes: motionKeyPins, animIn: nil, animOut: nil, animLoop: nil, local: 2, length: 4)
    expectValues(k, x: 0.2, y: 0, scale: 1.5, rotation: 45, opacity: 0.75, "pins")
    // Out at the very end; non-finite time gives the base.
    let fade = MotionEdge(id: "fade", duration: 1)
    XCTAssertEqual(Motion.resolveOverlay(base: base, keyframes: [], animIn: nil, animOut: fade, animLoop: nil, local: 4, length: 4).opacity, 0)
    XCTAssertEqual(Motion.resolveOverlay(base: base, keyframes: [], animIn: slide, animOut: fade, animLoop: "spin", local: .nan, length: 4), base)
  }

  // MARK: - Request → compositor

  private func edge(_ id: String, _ duration: Double) -> ExportAnimEdge {
    var e = ExportAnimEdge()
    e.id = id
    e.duration = duration
    return e
  }

  private func key(_ t: Double, x: Double) -> ExportKeyframe {
    var k = ExportKeyframe()
    k.t = t
    k.x = x
    return k
  }

  func testAClipWithoutAnimationOrPinsHasNoMotion() {
    XCTAssertNil(ExportSession.clipMotion(ExportClip()))
    var c = ExportClip()
    c.animCombo = ""                                              // an empty id is no Combo
    c.animIn = edge("fade", 0)                                    // an edge that cannot play is no edge
    c.animOut = edge("", 1)
    XCTAssertNil(ExportSession.clipMotion(c))
  }

  func testClipMotionCarriesEdgesComboAndPins() {
    var c = ExportClip()
    c.animIn = edge("zoomIn", 0.5)
    c.animOut = edge("fade", 0.25)
    c.animCombo = "sway"
    c.keyframes = [key(3, x: 0.4), key(-1, x: 0.1), key(.nan, x: 9)]
    let m = ExportSession.clipMotion(c)
    XCTAssertEqual(m?.animIn, MotionEdge(id: "zoomIn", duration: 0.5))
    XCTAssertEqual(m?.animOut, MotionEdge(id: "fade", duration: 0.25))
    XCTAssertEqual(m?.animCombo, "sway")
    // The pin with a non-finite number is dropped; the rest are in time order, with the record's defaults.
    XCTAssertEqual(m?.keyframes, [
      MotionKeyframe(t: -1, x: 0.1, y: 0, scale: 1, rotation: 0, opacity: 1),
      MotionKeyframe(t: 3, x: 0.4, y: 0, scale: 1, rotation: 0, opacity: 1),
    ])
    var pinsOnly = ExportClip()
    pinsOnly.keyframes = [key(0, x: 0.2)]
    XCTAssertNotNil(ExportSession.clipMotion(pinsOnly))
  }

  func testOverlayMotionFieldsDefaultToNone() {
    let o = ExportOverlay()
    XCTAssertNil(o.animIn)
    XCTAssertNil(o.animOut)
    XCTAssertNil(o.animLoop)
    XCTAssertTrue(o.keyframes.isEmpty)
  }

  private let size = CGSize(width: 64, height: 36)
  private var rect: CGRect { CGRect(origin: .zero, size: size) }
  private let ctx = CIContext(options: [.workingColorSpace: NSNull()])

  private func layer(_ motion: ClipMotionSpec?, transform: ClipTransform = .identity, background: LayerBackground = .black,
                     clipStart: Double = 0, clipLength: Double = 0) -> LayerSpec {
    return LayerSpec(trackID: 1, fill: .identity, orient: .identity, crop: .full, transform: transform, background: background,
                     filter: nil, motion: motion, clipStart: clipStart, clipLength: clipLength)
  }

  /// (red, green, blue) of the pixel whose bottom-left corner is (x, y) in Core Image space (y-up), each 0…1.
  private func rgb(_ img: CIImage, _ x: CGFloat, _ y: CGFloat) -> (r: Double, g: Double, b: Double) {
    var px = [UInt8](repeating: 0, count: 4)
    ctx.render(img, toBitmap: &px, rowBytes: 4, bounds: CGRect(x: x, y: y, width: 1, height: 1), format: .RGBA8, colorSpace: nil)
    return (Double(px[0]) / 255, Double(px[1]) / 255, Double(px[2]) / 255)
  }

  func testALayerWithoutMotionResolvesNothing() {
    let plain = layer(nil)
    XCTAssertNil(plain.motion)
    XCTAssertNil(plain.values(at: 1))
    XCTAssertEqual(plain.clipStart, 0)
    XCTAssertEqual(plain.clipLength, 0)
    XCTAssertTrue(plain.usesFill)
  }

  /// Clip-local time = composition time − clipStart, clamped to the clip's own range (so the transition handles
  /// before / after it show the clip's first / last moment). The base is the static transform with opacity 1.
  func testALayerResolvesItsMotionAtClipLocalTime() {
    let still = ClipTransform(scale: 2, x: 0.1, y: -0.3, rotation: 90, flipH: true, flipV: false)
    let motion = ClipMotionSpec(keyframes: [], animIn: MotionEdge(id: "slideLeft", duration: 1),
                                animOut: MotionEdge(id: "fade", duration: 2), animCombo: nil)
    let l = layer(motion, transform: still, clipStart: 5, clipLength: 10)
    XCTAssertEqual(l.values(at: 5)?.x ?? -1, 1.1, accuracy: 1e-9)
    XCTAssertEqual(l.values(at: 5.5)?.x ?? -1, 0.225, accuracy: 1e-9)
    XCTAssertEqual(l.values(at: 9)?.x ?? -1, 0.1, accuracy: 1e-9)
    XCTAssertEqual(l.values(at: 9)?.opacity ?? -1, 1, accuracy: 1e-9)
    XCTAssertEqual(l.values(at: 14)?.opacity ?? -1, 0.875, accuracy: 1e-9)
    XCTAssertEqual(l.values(at: 3), l.values(at: 5))               // inside the handle before the clip
    XCTAssertEqual(l.values(at: 20), l.values(at: 15))             // inside the handle after it
    XCTAssertEqual(l.values(at: 15)?.opacity ?? -1, 0, accuracy: 1e-9)
  }

  /// A white picture over a red background at an opacity: `background·(1 − opacity) + picture·opacity` — white at 1
  /// (and above), half way at 0.5, the background alone at 0. Always exactly the frame.
  func testAPlacedFrameFadesByDissolvingFromItsBackground() {
    let white = CIImage(color: CIColor(red: 1, green: 1, blue: 1)).cropped(to: rect)
    let l = layer(nil, background: LayerBackground(type: "color", color: "#FF0000"))
    func pixel(_ opacity: Double) -> (r: Double, g: Double, b: Double) {
      let img = ClipyCompositor.placedFrame(l, transform: .identity, opacity: opacity, source: white, size: size)
      XCTAssertEqual(img.extent, rect)
      return rgb(img, 32, 18)
    }
    for opacity in [1.0, 1.5] {                                    // fully opaque: the picture, no dissolve
      let full = pixel(opacity)
      XCTAssertEqual(full.r, 1, accuracy: 0.03)
      XCTAssertEqual(full.g, 1, accuracy: 0.03)
      XCTAssertEqual(full.b, 1, accuracy: 0.03)
    }
    let half = pixel(0.5)
    XCTAssertEqual(half.r, 1, accuracy: 0.03)
    XCTAssertEqual(half.g, 0.5, accuracy: 0.03)
    XCTAssertEqual(half.b, 0.5, accuracy: 0.03)
    let none = pixel(0)                                            // the background only
    XCTAssertEqual(none.r, 1, accuracy: 0.03)
    XCTAssertEqual(none.g, 0, accuracy: 0.03)
    XCTAssertEqual(none.b, 0, accuracy: 0.03)
  }

  /// The still placement goes through the same helper: a half-size picture leaves the background around it.
  func testAPlacedFrameDrawsAStillPlacementOverItsBackground() {
    let white = CIImage(color: CIColor(red: 1, green: 1, blue: 1)).cropped(to: rect)
    let small = ClipTransform(scale: 0.5, x: 0, y: 0, rotation: 0, flipH: false, flipV: false)
    let l = layer(nil, transform: small, background: LayerBackground(type: "color", color: "#FF0000"))
    let img = ClipyCompositor.placedFrame(l, transform: l.transform, opacity: 1, source: white, size: size)
    XCTAssertEqual(img.extent, rect)
    XCTAssertEqual(rgb(img, 32, 18).g, 1, accuracy: 0.03)          // the picture, in the middle
    XCTAssertEqual(rgb(img, 2, 2).g, 0, accuracy: 0.03)            // the background, in the corner
    XCTAssertEqual(rgb(img, 2, 2).r, 1, accuracy: 0.03)
  }

  /// A white picture fading in over a red background: red at the clip's start, 0.875 white + 0.125 red half way
  /// through the In (easeOut(0.5) = 0.875), plain white once the In has finished.
  func testAMovingFrameFadesThePictureOverItsBackground() {
    let white = CIImage(color: CIColor(red: 1, green: 1, blue: 1)).cropped(to: rect)
    let motion = ClipMotionSpec(keyframes: [], animIn: MotionEdge(id: "fade", duration: 1), animOut: nil, animCombo: nil)
    let l = layer(motion, background: LayerBackground(type: "color", color: "#FF0000"), clipStart: 2, clipLength: 4)
    func pixel(_ time: Double) -> (r: Double, g: Double, b: Double) {
      let img = ClipyCompositor.movingFrame(l, source: white, time: time, size: size)
      XCTAssertEqual(img.extent, rect)
      return rgb(img, 32, 18)
    }
    let start = pixel(2)
    XCTAssertEqual(start.r, 1, accuracy: 0.03)
    XCTAssertEqual(start.g, 0, accuracy: 0.03)
    XCTAssertEqual(start.b, 0, accuracy: 0.03)
    let mid = pixel(2.5)
    XCTAssertEqual(mid.r, 1, accuracy: 0.03)
    XCTAssertEqual(mid.g, 0.875, accuracy: 0.03)
    XCTAssertEqual(mid.b, 0.875, accuracy: 0.03)
    let done = pixel(4)
    XCTAssertEqual(done.r, 1, accuracy: 0.03)
    XCTAssertEqual(done.g, 1, accuracy: 0.03)
    XCTAssertEqual(done.b, 1, accuracy: 0.03)
  }

  /// A keyframed offset moves the picture: half a frame to the right leaves the left half showing the background.
  func testAMovingFramePlacesThePictureByTheResolvedTransform() {
    let white = CIImage(color: CIColor(red: 1, green: 1, blue: 1)).cropped(to: rect)
    let pin = MotionKeyframe(t: 0, x: 0.5, y: 0, scale: 1, rotation: 0, opacity: 1)
    let motion = ClipMotionSpec(keyframes: [pin], animIn: nil, animOut: nil, animCombo: nil)
    let l = layer(motion, background: LayerBackground(type: "color", color: "#FF0000"), clipStart: 0, clipLength: 4)
    let img = ClipyCompositor.movingFrame(l, source: white, time: 1, size: size)
    let left = rgb(img, 8, 18)
    let right = rgb(img, 56, 18)
    XCTAssertEqual(left.r, 1, accuracy: 0.03)                      // background (red)
    XCTAssertEqual(left.g, 0, accuracy: 0.03)
    XCTAssertEqual(right.g, 1, accuracy: 0.03)                     // the picture (white)
  }
}
