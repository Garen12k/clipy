import QuartzCore
import UIKit
import XCTest
@testable import ClipyVideo

/// The sampler behind text / sticker motion in the export (`OverlayMotion`): the time grid and where the values
/// come from. The formulas themselves are `Motion`'s (MotionTests).
final class OverlayMotionTests: XCTestCase {
  /// A resolver that records the time it was asked for in every field.
  private func echo(_ t: Double) -> KeyValues {
    return KeyValues(x: t, y: 2 * t, scale: 1 + t, rotation: 10 * t, opacity: 1)
  }

  private func animated() -> ExportOverlay {
    var o = ExportOverlay()
    o.kind = "text"; o.text = "Hi"
    o.x = 0.25; o.y = 0.75; o.scale = 1.5; o.rotation = 30
    o.start = 2; o.end = 4
    var fade = ExportAnimEdge()
    fade.id = "fade"; fade.duration = 0.5
    o.animIn = fade
    var slide = ExportAnimEdge()
    slide.id = "slideLeft"; slide.duration = 0.5
    o.animOut = slide
    o.animLoop = "wiggle"
    return o
  }

  func testSampleCountAndTimes() {
    // One second at 30 samples per second: 0, 1/30, …, 29/30 and the end — 31 samples.
    let s = OverlayMotion.samples(start: 2, end: 3, fps: 30, resolve: echo)
    XCTAssertEqual(s.count, 31)
    XCTAssertEqual(s[0].time, 0)
    XCTAssertEqual(s[1].time, 1.0 / 30, accuracy: 1e-12)
    XCTAssertEqual(s[29].time, 29.0 / 30, accuracy: 1e-12)
    XCTAssertEqual(s[30].time, 1)
    for i in 1..<s.count { XCTAssertGreaterThan(s[i].time, s[i - 1].time) }
  }

  func testLastSampleIsExactlyTheEnd() {
    // 0.25 s is 7.5 steps: seven whole steps after 0, then the end itself.
    let s = OverlayMotion.samples(start: 1, end: 1.25, fps: 30, resolve: echo)
    XCTAssertEqual(s.count, 9)
    XCTAssertEqual(s[7].time, 7.0 / 30, accuracy: 1e-12)
    XCTAssertEqual(s[8].time, 0.25)
    // A life that is a whole number of steps has no doubled end sample.
    let whole = OverlayMotion.samples(start: 0, end: 0.1, fps: 30, resolve: echo)
    XCTAssertEqual(whole.count, 4)
    XCTAssertEqual(whole[3].time, 0.1)
    XCTAssertGreaterThan(whole[3].time - whole[2].time, 0.03)
  }

  func testAtLeastTwoSamples() {
    // Shorter than one step: the start and the end.
    let s = OverlayMotion.samples(start: 5, end: 5.01, fps: 30, resolve: echo)
    XCTAssertEqual(s.count, 2)
    XCTAssertEqual(s[0].time, 0)
    XCTAssertEqual(s[1].time, 0.01, accuracy: 1e-12)
    // No life, a backwards life, a non-finite life or a bad rate: nothing.
    XCTAssertTrue(OverlayMotion.samples(start: 1, end: 1, fps: 30, resolve: echo).isEmpty)
    XCTAssertTrue(OverlayMotion.samples(start: 2, end: 1, fps: 30, resolve: echo).isEmpty)
    XCTAssertTrue(OverlayMotion.samples(start: 0, end: .infinity, fps: 30, resolve: echo).isEmpty)
    XCTAssertTrue(OverlayMotion.samples(start: .nan, end: 1, fps: 30, resolve: echo).isEmpty)
    XCTAssertTrue(OverlayMotion.samples(start: 0, end: 1, fps: 0, resolve: echo).isEmpty)
  }

  func testValuesComeFromTheResolver() {
    let s = OverlayMotion.samples(start: 3, end: 3.5, fps: 30, resolve: echo)
    XCTAssertEqual(s.count, 16)
    for sample in s { XCTAssertEqual(sample.values, echo(sample.time)) }   // asked with times since the start
  }

  func testResolverMatchesMotionResolveOverlay() {
    let o = animated()
    let resolve = OverlayMotion.resolver(o)
    let base = KeyValues(x: 0.25, y: 0.75, scale: 1.5, rotation: 30, opacity: 1)
    let s = OverlayMotion.samples(start: o.start, end: o.end, fps: OverlayMotion.fps, resolve: resolve)
    XCTAssertEqual(s.count, 61)
    for sample in s {
      let expected = Motion.resolveOverlay(base: base, keyframes: [], animIn: MotionEdge(id: "fade", duration: 0.5),
                                           animOut: MotionEdge(id: "slideLeft", duration: 0.5), animLoop: "wiggle",
                                           local: sample.time, length: 2)
      XCTAssertEqual(sample.values, expected)
    }
    // The fade starts from nothing; the slide ends a quarter of the frame to the left.
    XCTAssertEqual(s[0].values.opacity, 0, accuracy: 1e-12)
    XCTAssertEqual(s[60].values.x, 0.25 - Motion.slideOverlay, accuracy: 1e-9)
    XCTAssertTrue(OverlayMotion.allFinite(s))

    // Pins replace the overlay's own values (t = seconds since its start).
    var pinned = ExportOverlay()
    pinned.start = 1; pinned.end = 3
    var a = ExportKeyframe(); a.t = 0; a.x = 0.2; a.y = 0.2; a.scale = 1; a.rotation = 0; a.opacity = 1
    var b = ExportKeyframe(); b.t = 2; b.x = 0.8; b.y = 0.6; b.scale = 2; b.rotation = 90; b.opacity = 0.5
    pinned.keyframes = [b, a]                                              // order does not matter
    let at = OverlayMotion.resolver(pinned)
    XCTAssertEqual(at(0), KeyValues(x: 0.2, y: 0.2, scale: 1, rotation: 0, opacity: 1))
    XCTAssertEqual(at(2), KeyValues(x: 0.8, y: 0.6, scale: 2, rotation: 90, opacity: 0.5))
    XCTAssertEqual(at(1).x, 0.5, accuracy: 1e-12)                          // smooth(0.5) = 0.5
  }

  func testHasMotion() {
    XCTAssertFalse(OverlayMotion.hasMotion(ExportOverlay()))
    XCTAssertTrue(OverlayMotion.hasMotion(animated()))
    var caption = animated()
    caption.kind = "caption"
    XCTAssertFalse(OverlayMotion.hasMotion(caption))
    var loop = ExportOverlay()
    loop.animLoop = "pulse"
    XCTAssertTrue(OverlayMotion.hasMotion(loop))
    var dead = ExportOverlay()                                             // an edge that cannot play is no motion
    var edge = ExportAnimEdge()
    edge.id = "fade"; edge.duration = 0
    dead.animIn = edge
    dead.animLoop = ""
    XCTAssertFalse(OverlayMotion.hasMotion(dead))
  }

  func testScaleRatio() {
    XCTAssertEqual(OverlayMotion.scaleRatio(1.5, base: 1.5), 1)
    XCTAssertEqual(OverlayMotion.scaleRatio(3, base: 1.5), 2)
    XCTAssertEqual(OverlayMotion.scaleRatio(0.75, base: 1.5), 0.5)
    XCTAssertEqual(OverlayMotion.scaleRatio(-1, base: 1), 0)
    XCTAssertEqual(OverlayMotion.scaleRatio(2, base: 0), 1)
    XCTAssertEqual(OverlayMotion.scaleRatio(.nan, base: 1), 1)
    // Content is drawn at the largest ratio, between 1 and the cap.
    let small = [(time: 0.0, values: KeyValues(x: 0, y: 0, scale: 0.5, rotation: 0, opacity: 1)),
                 (time: 1.0, values: KeyValues(x: 0, y: 0, scale: 1, rotation: 0, opacity: 1))]
    XCTAssertEqual(OverlayMotion.contentScale(small, base: 1), 1)
    let grow = [(time: 0.0, values: KeyValues(x: 0, y: 0, scale: 1, rotation: 0, opacity: 1)),
                (time: 1.0, values: KeyValues(x: 0, y: 0, scale: 2.5, rotation: 0, opacity: 1))]
    XCTAssertEqual(OverlayMotion.contentScale(grow, base: 1), 2.5)
    XCTAssertEqual(OverlayMotion.contentScale(grow, base: 0.1), OverlayMotion.maxContentScale)
  }

  /// The layer part: an animated overlay gets the three keyframe animations in place of the visibility animation;
  /// a static one is as before.
  func testLayerAnimations() {
    let size = CGSize(width: 1080, height: 1920)
    let o = animated()
    let layer = ExportSession.overlayLayer(o, renderSize: size)
    XCTAssertEqual(layer.opacity, 0)
    XCTAssertNil(layer.animation(forKey: "visible"))
    for path in ["position", "transform", "opacity"] {
      guard let anim = layer.animation(forKey: "motion." + path) as? CAKeyframeAnimation else { XCTFail("no \(path) animation"); continue }
      XCTAssertEqual(anim.values?.count, 61)
      XCTAssertEqual(anim.keyTimes?.count, 61)
      XCTAssertEqual(anim.keyTimes?.first?.doubleValue, 0)
      XCTAssertEqual(anim.keyTimes?.last?.doubleValue, 1)
      XCTAssertEqual(anim.beginTime, 2)
      XCTAssertEqual(anim.duration, 2)
      XCTAssertFalse(anim.isRemovedOnCompletion)
    }
    // Mid-life (no edge playing at a whole wiggle cycle): the static place, y flipped.
    let position = layer.animation(forKey: "motion.position") as? CAKeyframeAnimation
    let middle = (position?.values?[30] as? NSValue)?.cgPointValue
    XCTAssertEqual(Double(middle?.x ?? 0), 270, accuracy: 1e-6)
    XCTAssertEqual(Double(middle?.y ?? 0), 1920 - 1440, accuracy: 1e-6)

    var plain = ExportOverlay()
    plain.text = "Hi"; plain.start = 0; plain.end = 4
    let still = ExportSession.overlayLayer(plain, renderSize: size)
    XCTAssertNotNil(still.animation(forKey: "visible"))
    XCTAssertNil(still.animation(forKey: "motion.position"))
    XCTAssertEqual(still.position, CGPoint(x: 540, y: 960))
  }
}
