import XCTest
@testable import ClipyVideo

/// The vectors of src/editor/model/__tests__/transitionMath.vectors.ts. The tables below are checked against the TS
/// vectors by src/editor/model/__tests__/transitionMath.parity.test.ts — keep the literals identical. Results are
/// compared with a 1e-12 tolerance, never with `==`. Offsets are fractions of the frame, y DOWN.
struct TransitionScalarVector {
  let fn: String
  let p: Double
  let expect: Double
}

struct TransitionSlideVector {
  let type: String
  let p: Double
  let ax: Double
  let ay: Double
  let bx: Double
  let by: Double
  let incomingOnTop: Bool
}

struct TransitionIrisVector {
  let type: String
  let p: Double
  let radius: Double
}

let transitionScalarVectors: [TransitionScalarVector] = [
  TransitionScalarVector(fn: "dip", p: 0, expect: 0),
  TransitionScalarVector(fn: "dip", p: 0.25, expect: 0.5),
  TransitionScalarVector(fn: "dip", p: 0.5, expect: 1),
  TransitionScalarVector(fn: "dip", p: 0.75, expect: 0.5),
  TransitionScalarVector(fn: "dip", p: 1, expect: 0),
  TransitionScalarVector(fn: "diagonalEdge", p: 0.25, expect: 0.5),
  TransitionScalarVector(fn: "diagonalEdge", p: 1, expect: 2),
  TransitionScalarVector(fn: "clockAngle", p: 0.25, expect: 1.5707963267948966),
  TransitionScalarVector(fn: "clockAngle", p: 0.5, expect: 3.141592653589793),
  TransitionScalarVector(fn: "clockAngle", p: 1, expect: 6.283185307179586),
  TransitionScalarVector(fn: "pixelSize", p: 0.25, expect: 0.025),
  TransitionScalarVector(fn: "pixelSize", p: 0.5, expect: 0.05),
  TransitionScalarVector(fn: "pixelSize", p: 1, expect: 0),
  TransitionScalarVector(fn: "diagonalEdge", p: 0, expect: 0),
  TransitionScalarVector(fn: "clockAngle", p: 0, expect: 0),
  TransitionScalarVector(fn: "pixelSize", p: 0, expect: 0),
  TransitionScalarVector(fn: "dip", p: -1, expect: 0),
  TransitionScalarVector(fn: "dip", p: 2, expect: 0),
  TransitionScalarVector(fn: "diagonalEdge", p: 3, expect: 2),
  TransitionScalarVector(fn: "clockAngle", p: -0.5, expect: 0),
  TransitionScalarVector(fn: "clockAngle", p: 2, expect: 6.283185307179586),
  TransitionScalarVector(fn: "pixelSize", p: 1.5, expect: 0),
]

let transitionSlideVectors: [TransitionSlideVector] = [
  TransitionSlideVector(type: "cover", p: 0.25, ax: 0, ay: 0, bx: 0.75, by: 0, incomingOnTop: true),
  TransitionSlideVector(type: "cover", p: 1, ax: 0, ay: 0, bx: 0, by: 0, incomingOnTop: true),
  TransitionSlideVector(type: "reveal", p: 0.25, ax: -0.25, ay: 0, bx: 0, by: 0, incomingOnTop: false),
  TransitionSlideVector(type: "reveal", p: 1, ax: -1, ay: 0, bx: 0, by: 0, incomingOnTop: false),
  TransitionSlideVector(type: "coverUp", p: 0.25, ax: 0, ay: 0, bx: 0, by: 0.75, incomingOnTop: true),
  TransitionSlideVector(type: "revealDown", p: 0.25, ax: 0, ay: 0.25, bx: 0, by: 0, incomingOnTop: false),
  TransitionSlideVector(type: "revealDown", p: 1, ax: 0, ay: 1, bx: 0, by: 0, incomingOnTop: false),
  TransitionSlideVector(type: "cover", p: 0, ax: 0, ay: 0, bx: 1, by: 0, incomingOnTop: true),
  TransitionSlideVector(type: "reveal", p: 0, ax: 0, ay: 0, bx: 0, by: 0, incomingOnTop: false),
  TransitionSlideVector(type: "coverUp", p: 0, ax: 0, ay: 0, bx: 0, by: 1, incomingOnTop: true),
  TransitionSlideVector(type: "coverUp", p: 1, ax: 0, ay: 0, bx: 0, by: 0, incomingOnTop: true),
  TransitionSlideVector(type: "revealDown", p: 0, ax: 0, ay: 0, bx: 0, by: 0, incomingOnTop: false),
  TransitionSlideVector(type: "cover", p: -1, ax: 0, ay: 0, bx: 1, by: 0, incomingOnTop: true),
  TransitionSlideVector(type: "reveal", p: 2, ax: -1, ay: 0, bx: 0, by: 0, incomingOnTop: false),
  TransitionSlideVector(type: "revealDown", p: 7, ax: 0, ay: 1, bx: 0, by: 0, incomingOnTop: false),
]

let transitionIrisVectors: [TransitionIrisVector] = [
  TransitionIrisVector(type: "circleOpen", p: 0.25, radius: 0.25),
  TransitionIrisVector(type: "circleOpen", p: 1, radius: 1),
  TransitionIrisVector(type: "circleClose", p: 0.25, radius: 0.75),
  TransitionIrisVector(type: "circleClose", p: 1, radius: 0),
  TransitionIrisVector(type: "circleOpen", p: 0, radius: 0),
  TransitionIrisVector(type: "circleClose", p: 0, radius: 1),
  TransitionIrisVector(type: "circleOpen", p: 2, radius: 1),
  TransitionIrisVector(type: "circleClose", p: -3, radius: 1),
]

final class TransitionMathTests: XCTestCase {
  private let accuracy: Double = 1e-12
  private let slides: [String] = ["cover", "reveal", "coverUp", "revealDown"]
  private let wild: [Double] = [Double.nan, Double.infinity, -Double.infinity, -1, 2, 1e308, -1e308]

  private func assertSlide(_ got: SlideOffsets?, _ ax: Double, _ ay: Double, _ bx: Double, _ by: Double, _ incomingOnTop: Bool, _ message: String) {
    guard let o = got else { XCTFail(message); return }
    XCTAssertEqual(o.ax, ax, accuracy: accuracy, message)
    XCTAssertEqual(o.ay, ay, accuracy: accuracy, message)
    XCTAssertEqual(o.bx, bx, accuracy: accuracy, message)
    XCTAssertEqual(o.by, by, accuracy: accuracy, message)
    XCTAssertEqual(o.incomingOnTop, incomingOnTop, message)
  }

  func testScalarFunctionsMatchTheVectors() {
    XCTAssertEqual(transitionScalarVectors.count, 22)
    for v in transitionScalarVectors {
      let got: Double
      switch v.fn {
      case "dip": got = TransitionMath.dip(v.p)
      case "diagonalEdge": got = TransitionMath.diagonalEdge(v.p)
      case "clockAngle": got = TransitionMath.clockAngle(v.p)
      case "pixelSize": got = TransitionMath.pixelSize(v.p)
      default: XCTFail(v.fn); continue
      }
      XCTAssertEqual(got, v.expect, accuracy: accuracy, "\(v.fn)(\(v.p))")
    }
  }

  func testSlideOffsetsMatchTheVectors() {
    XCTAssertEqual(transitionSlideVectors.count, 15)
    for v in transitionSlideVectors {
      assertSlide(TransitionMath.slideOffsets(v.type, v.p), v.ax, v.ay, v.bx, v.by, v.incomingOnTop, "\(v.type) at \(v.p)")
    }
    XCTAssertNil(TransitionMath.slideOffsets("fade", 0.5))
    XCTAssertNil(TransitionMath.slideOffsets("circleOpen", 0.5))
  }

  func testIrisRadiusMatchesTheVectors() {
    XCTAssertEqual(transitionIrisVectors.count, 8)
    for v in transitionIrisVectors {
      guard let r = TransitionMath.irisRadius(v.type, v.p) else { XCTFail(v.type); continue }
      XCTAssertEqual(r, v.radius, accuracy: accuracy, "\(v.type) at \(v.p)")
    }
    XCTAssertNil(TransitionMath.irisRadius("cover", 0.5))
  }

  func testConstants() {
    XCTAssertEqual(TransitionMath.pixelMax, 0.05, accuracy: accuracy)
    XCTAssertEqual(TransitionMath.flashColor, "#FFFFFF")
  }

  /// At progress 0 only the outgoing frame shows, at 1 only the incoming one — for each of the ten.
  func testEveryTransitionStartsOnTheOutgoingFrameAndEndsOnTheIncomingOne() {
    // Cover left / cover up: the incoming frame (on top) starts a whole frame to the right / below and ends in place.
    assertSlide(TransitionMath.slideOffsets("cover", 0), 0, 0, 1, 0, true, "cover 0")
    assertSlide(TransitionMath.slideOffsets("cover", 1), 0, 0, 0, 0, true, "cover 1")
    assertSlide(TransitionMath.slideOffsets("coverUp", 0), 0, 0, 0, 1, true, "coverUp 0")
    assertSlide(TransitionMath.slideOffsets("coverUp", 1), 0, 0, 0, 0, true, "coverUp 1")
    // Reveal left / reveal down: the outgoing frame (on top) starts in place and ends a whole frame to the left / below.
    assertSlide(TransitionMath.slideOffsets("reveal", 0), 0, 0, 0, 0, false, "reveal 0")
    assertSlide(TransitionMath.slideOffsets("reveal", 1), -1, 0, 0, 0, false, "reveal 1")
    assertSlide(TransitionMath.slideOffsets("revealDown", 0), 0, 0, 0, 0, false, "revealDown 0")
    assertSlide(TransitionMath.slideOffsets("revealDown", 1), 0, 1, 0, 0, false, "revealDown 1")
    // Circle open: the incoming frame is inside — no circle, then one through the corners. Circle close: the outgoing one is.
    XCTAssertEqual(TransitionMath.irisRadius("circleOpen", 0) ?? -1, 0, accuracy: accuracy)
    XCTAssertEqual(TransitionMath.irisRadius("circleOpen", 1) ?? -1, 1, accuracy: accuracy)
    XCTAssertEqual(TransitionMath.irisRadius("circleClose", 0) ?? -1, 1, accuracy: accuracy)
    XCTAssertEqual(TransitionMath.irisRadius("circleClose", 1) ?? -1, 0, accuracy: accuracy)
    // Diagonal wipe: the incoming frame is where u + v < edge (0 … 2). Clock wipe: inside the sweep.
    XCTAssertEqual(TransitionMath.diagonalEdge(0), 0, accuracy: accuracy)
    XCTAssertEqual(TransitionMath.diagonalEdge(1), 2, accuracy: accuracy)
    XCTAssertEqual(TransitionMath.clockAngle(0), 0, accuracy: accuracy)
    XCTAssertEqual(TransitionMath.clockAngle(1), 2 * Double.pi, accuracy: accuracy)
    // Pixelate and white flash: no blocks and no white at either end; the most at the cut.
    XCTAssertEqual(TransitionMath.pixelSize(0), 0, accuracy: accuracy)
    XCTAssertEqual(TransitionMath.pixelSize(1), 0, accuracy: accuracy)
    XCTAssertEqual(TransitionMath.pixelSize(0.5), TransitionMath.pixelMax, accuracy: accuracy)
    XCTAssertEqual(TransitionMath.dip(0), 0, accuracy: accuracy)
    XCTAssertEqual(TransitionMath.dip(1), 0, accuracy: accuracy)
    XCTAssertEqual(TransitionMath.dip(0.5), 1, accuracy: accuracy)
  }

  /// Left is −x, down is +y (screen coordinates), and every value moves one way only.
  func testDirections() {
    let steps: [Double] = [0, 0.1, 0.35, 0.5, 0.8, 1]
    for i in 1..<steps.count {
      let a: Double = steps[i - 1]
      let b: Double = steps[i]
      guard let coverA = TransitionMath.slideOffsets("cover", a), let coverB = TransitionMath.slideOffsets("cover", b),
            let revealA = TransitionMath.slideOffsets("reveal", a), let revealB = TransitionMath.slideOffsets("reveal", b),
            let upA = TransitionMath.slideOffsets("coverUp", a), let upB = TransitionMath.slideOffsets("coverUp", b),
            let downA = TransitionMath.slideOffsets("revealDown", a), let downB = TransitionMath.slideOffsets("revealDown", b),
            let openA = TransitionMath.irisRadius("circleOpen", a), let openB = TransitionMath.irisRadius("circleOpen", b),
            let closeA = TransitionMath.irisRadius("circleClose", a), let closeB = TransitionMath.irisRadius("circleClose", b)
      else { XCTFail("nil at \(a) / \(b)"); continue }
      XCTAssertLessThan(coverB.bx, coverA.bx)          // moving LEFT, from the right
      XCTAssertLessThan(revealB.ax, revealA.ax)        // moving LEFT, off the frame
      XCTAssertLessThan(upB.by, upA.by)                // moving UP, from below
      XCTAssertGreaterThan(downB.ay, downA.ay)         // moving DOWN, off the frame
      XCTAssertGreaterThan(openB, openA)
      XCTAssertLessThan(closeB, closeA)
      XCTAssertGreaterThan(TransitionMath.diagonalEdge(b), TransitionMath.diagonalEdge(a))
      XCTAssertGreaterThan(TransitionMath.clockAngle(b), TransitionMath.clockAngle(a))
    }
    XCTAssertGreaterThan(TransitionMath.slideOffsets("cover", 0.3)?.bx ?? 0, 0)
    XCTAssertLessThan(TransitionMath.slideOffsets("reveal", 0.3)?.ax ?? 0, 0)
    XCTAssertGreaterThan(TransitionMath.slideOffsets("coverUp", 0.3)?.by ?? 0, 0)
    XCTAssertGreaterThan(TransitionMath.slideOffsets("revealDown", 0.3)?.ay ?? 0, 0)
  }

  /// A progress outside 0…1, or one that is not a number, gives finite values inside the range.
  func testEveryFunctionIsTotal() {
    let expected: [Double] = [0, 1, 0, 0, 1, 1, 0]
    for i in 0..<wild.count {
      let p: Double = wild[i]
      let end: Double = expected[i]
      XCTAssertEqual(TransitionMath.unitProgress(p), end, accuracy: accuracy, "unitProgress(\(p))")
      XCTAssertEqual(TransitionMath.dip(p), 0, accuracy: accuracy, "dip(\(p))")
      XCTAssertEqual(TransitionMath.pixelSize(p), 0, accuracy: accuracy, "pixelSize(\(p))")
      XCTAssertEqual(TransitionMath.diagonalEdge(p), 2 * end, accuracy: accuracy, "diagonalEdge(\(p))")
      XCTAssertEqual(TransitionMath.clockAngle(p), 2 * Double.pi * end, accuracy: accuracy, "clockAngle(\(p))")
      XCTAssertEqual(TransitionMath.irisRadius("circleOpen", p) ?? -1, end, accuracy: accuracy, "circleOpen(\(p))")
      XCTAssertEqual(TransitionMath.irisRadius("circleClose", p) ?? -1, 1 - end, accuracy: accuracy, "circleClose(\(p))")
      for type in slides {
        guard let got = TransitionMath.slideOffsets(type, p), let want = TransitionMath.slideOffsets(type, end) else { XCTFail(type); continue }
        for n in [got.ax, got.ay, got.bx, got.by] {
          XCTAssertTrue(n.isFinite, "\(type) at \(p)")
          XCTAssertLessThanOrEqual(abs(n), 1, "\(type) at \(p)")
        }
        assertSlide(got, want.ax, want.ay, want.bx, want.by, want.incomingOnTop, "\(type) at \(p)")
      }
    }
  }
}
