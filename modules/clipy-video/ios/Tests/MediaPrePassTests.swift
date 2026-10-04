import CoreGraphics
import CoreMedia
import XCTest
@testable import ClipyVideo

final class MediaPrePassTests: XCTestCase {
  private func clip(kind: String = "video", reversed: Bool = false) -> ExportClip {
    var c = ExportClip()
    c.sourceUri = "file:///clip.mov"; c.trimStart = 1; c.trimEnd = 4
    c.kind = kind; c.reversed = reversed
    return c
  }

  func testPlanListsPhotosAndReversedClipsInClipOrder() {
    let clips = [clip(), clip(kind: "photo"), clip(reversed: true), clip(), clip(kind: "photo")]
    XCTAssertEqual(MediaPrePass.plan(clips), [
      PrePassJob(clipIndex: 1, kind: .photo),
      PrePassJob(clipIndex: 2, kind: .reverse),
      PrePassJob(clipIndex: 4, kind: .photo),
    ])
  }

  func testPlanIsEmptyForOrdinaryForwardVideo() {
    XCTAssertEqual(MediaPrePass.plan([clip(), clip()]), [])
    XCTAssertEqual(MediaPrePass.plan([]), [])
  }

  /// A still reversed is the same still: a photo is only ever turned into video, never reversed as well.
  func testPhotoMarkedReversedIsOnlyAPhotoJob() {
    XCTAssertEqual(MediaPrePass.plan([clip(kind: "photo", reversed: true)]), [PrePassJob(clipIndex: 0, kind: .photo)])
  }

  func testRewritePointsAtThePreparedFileAndKeepsEverythingElse() {
    var c = clip(kind: "photo", reversed: true)
    c.volume = 0.5; c.muted = true; c.speed = 2; c.filter = "warm"
    var tr = ExportTransition(); tr.type = "dissolve"; tr.duration = 0.5
    c.transition = tr
    c.sourceWidth = 1080; c.sourceHeight = 1920
    var t = ExportClipTransform(); t.scale = 1.5; t.x = 0.1; t.y = -0.2; t.rotation = 90; t.flipH = true; t.flipV = true
    c.transform = t
    var crop = ExportCrop(); crop.x = 0.1; crop.y = 0.2; crop.w = 0.5; crop.h = 0.6
    c.crop = crop
    var bg = ExportBackground(); bg.type = "color"; bg.color = "#FF0000"
    c.background = bg
    c.filterIntensity = 0.4
    var adjust = ExportAdjust(); adjust.brightness = 0.5; adjust.grain = 0.25
    c.adjust = adjust
    var animIn = ExportAnimEdge(); animIn.id = "zoomIn"; animIn.duration = 0.5
    var animOut = ExportAnimEdge(); animOut.id = "fade"; animOut.duration = 0.25
    c.animIn = animIn; c.animOut = animOut; c.animCombo = "sway"
    var pin = ExportKeyframe(); pin.t = 1.5; pin.x = 0.2; pin.y = -0.1; pin.scale = 2; pin.rotation = 45; pin.opacity = 0.5
    c.keyframes = [ExportKeyframe(), pin]
    c.outputDuration = 1.5

    let prepared = URL(fileURLWithPath: "/tmp/clipy-prepass-x/0-photo.mp4")
    let r = MediaPrePass.rewrite(c, preparedURL: prepared, duration: 3)

    XCTAssertEqual(r.sourceUri, prepared.absoluteString)
    XCTAssertEqual(r.trimStart, 0)
    XCTAssertEqual(r.trimEnd, 3)
    XCTAssertEqual(r.kind, "video")
    XCTAssertFalse(r.reversed)
    XCTAssertEqual(r.volume, 0.5); XCTAssertTrue(r.muted); XCTAssertEqual(r.speed, 2); XCTAssertEqual(r.filter, "warm")
    XCTAssertEqual(r.transition.type, "dissolve"); XCTAssertEqual(r.transition.duration, 0.5)
    XCTAssertEqual(r.sourceWidth, 1080); XCTAssertEqual(r.sourceHeight, 1920)
    XCTAssertEqual(r.transform.scale, 1.5); XCTAssertEqual(r.transform.x, 0.1); XCTAssertEqual(r.transform.y, -0.2)
    XCTAssertEqual(r.transform.rotation, 90); XCTAssertTrue(r.transform.flipH); XCTAssertTrue(r.transform.flipV)
    XCTAssertEqual(r.crop.x, 0.1); XCTAssertEqual(r.crop.y, 0.2); XCTAssertEqual(r.crop.w, 0.5); XCTAssertEqual(r.crop.h, 0.6)
    XCTAssertEqual(r.background.type, "color"); XCTAssertEqual(r.background.color, "#FF0000")
    XCTAssertEqual(r.filterIntensity, 0.4)
    XCTAssertEqual(r.adjust.brightness, 0.5); XCTAssertEqual(r.adjust.grain, 0.25); XCTAssertEqual(r.adjust.contrast, 0)
    // Motion is in the clip's output time, so the prepared (forward) file keeps it as it is.
    XCTAssertEqual(r.animIn?.id, "zoomIn"); XCTAssertEqual(r.animIn?.duration, 0.5)
    XCTAssertEqual(r.animOut?.id, "fade"); XCTAssertEqual(r.animOut?.duration, 0.25)
    XCTAssertEqual(r.animCombo, "sway")
    XCTAssertEqual(r.keyframes.count, 2)
    XCTAssertEqual(r.keyframes.first?.t, 0); XCTAssertEqual(r.keyframes.first?.scale, 1); XCTAssertEqual(r.keyframes.first?.opacity, 1)
    XCTAssertEqual(r.keyframes.last?.t, 1.5); XCTAssertEqual(r.keyframes.last?.x, 0.2); XCTAssertEqual(r.keyframes.last?.y, -0.1)
    XCTAssertEqual(r.keyframes.last?.scale, 2); XCTAssertEqual(r.keyframes.last?.rotation, 45); XCTAssertEqual(r.keyframes.last?.opacity, 0.5)
    XCTAssertEqual(r.outputDuration, 1.5)
    XCTAssertEqual(ExportSession.clipMotion(r)?.animCombo, "sway")
  }

  func testRewriteOfAClipWithoutMotionHasNone() {
    let r = MediaPrePass.rewrite(clip(reversed: true), preparedURL: URL(fileURLWithPath: "/tmp/r.mp4"), duration: 3)
    XCTAssertNil(r.animIn); XCTAssertNil(r.animOut); XCTAssertNil(r.animCombo)
    XCTAssertTrue(r.keyframes.isEmpty)
    XCTAssertNil(ExportSession.clipMotion(r))
  }

  /// `@Field` is a class: the rewrite must build a new record, never write through a copy of the original.
  func testRewriteLeavesTheOriginalClipUnchanged() {
    let c = clip(reversed: true)
    _ = MediaPrePass.rewrite(c, preparedURL: URL(fileURLWithPath: "/tmp/r.mp4"), duration: 3)
    XCTAssertEqual(c.sourceUri, "file:///clip.mov")
    XCTAssertEqual(c.trimStart, 1); XCTAssertEqual(c.trimEnd, 4)
    XCTAssertTrue(c.reversed)
    XCTAssertEqual(c.kind, "video")
  }

  func testPrePassTakesTheFirstTwentyPercentSplitEvenly() {
    XCTAssertEqual(MediaPrePass.prePassProgress(job: 0, jobCount: 2, fraction: 0), 0, accuracy: 1e-9)
    XCTAssertEqual(MediaPrePass.prePassProgress(job: 0, jobCount: 2, fraction: 0.5), 0.05, accuracy: 1e-9)
    XCTAssertEqual(MediaPrePass.prePassProgress(job: 1, jobCount: 2, fraction: 0), 0.1, accuracy: 1e-9)
    XCTAssertEqual(MediaPrePass.prePassProgress(job: 1, jobCount: 2, fraction: 1), 0.2, accuracy: 1e-9)
    XCTAssertEqual(MediaPrePass.prePassProgress(job: 0, jobCount: 1, fraction: 7), 0.2, accuracy: 1e-9, "fraction is clamped")
  }

  func testExportProgressIsRescaledOnlyWhenThereWereJobs() {
    XCTAssertEqual(MediaPrePass.exportProgress(0, hasJobs: true), 0.2, accuracy: 1e-9)
    XCTAssertEqual(MediaPrePass.exportProgress(0.5, hasJobs: true), 0.6, accuracy: 1e-9)
    XCTAssertEqual(MediaPrePass.exportProgress(1, hasJobs: true), 1, accuracy: 1e-9)
    XCTAssertEqual(MediaPrePass.exportProgress(0.37, hasJobs: false), 0.37)
  }

  func testReverseWindowsRunFromTheEndBackwards() {
    XCTAssertEqual(MediaPrePass.reverseWindows(start: 1, end: 6, window: 2), [
      TimeWindow(start: 4, end: 6), TimeWindow(start: 2, end: 4), TimeWindow(start: 1, end: 2),
    ])
    XCTAssertEqual(MediaPrePass.reverseWindows(start: 0, end: 1.5, window: 2), [TimeWindow(start: 0, end: 1.5)])
    XCTAssertEqual(MediaPrePass.reverseWindows(start: 2, end: 2, window: 2), [])
  }

  /// Window + look-back holds at most ~300 MB of decoded 420v frames (w × h × 1.5 bytes) and at most 2 s.
  func testReverseWindowingIsBoundedByBytes() {
    let cases: [(w: Double, h: Double, fps: Double, window: Double, lookBack: Double)] = [
      (3840, 2160, 30, 0.7037551, 0.1),     // 4K30: 24.1 frames fit
      (3840, 2160, 60, 0.3018776, 0.1),     // 4K60
      (1920, 1080, 240, 0.3018776, 0.1),    // 1080p240 slow motion
      (1280, 720, 30, 1.9, 0.1),            // 720p30: the 2 s cap wins
      (1280, 720, 10, 1.8, 0.2),            // slow rate: look-back is two frame lengths
    ]
    for c in cases {
      let r = MediaPrePass.reverseWindowing(width: c.w, height: c.h, fps: c.fps)
      let label = "\(Int(c.w))x\(Int(c.h))@\(Int(c.fps))"
      XCTAssertEqual(r.window, c.window, accuracy: 1e-6, label)
      XCTAssertEqual(r.lookBack, c.lookBack, accuracy: 1e-9, label)
      XCTAssertLessThanOrEqual(r.window + r.lookBack, MediaPrePass.reverseWindowMaxSeconds + 1e-9, label)
      let bytes = (r.window + r.lookBack) * c.fps * c.w * c.h * 1.5
      XCTAssertLessThanOrEqual(bytes, MediaPrePass.reverseWindowByteBudget + 1, label)
    }
    XCTAssertEqual(MediaPrePass.reverseWindowing(width: 1280, height: 720, fps: 0).window, 1.9, accuracy: 1e-9, "unknown rate → 30 fps")
    XCTAssertEqual(MediaPrePass.reverseWindowing(width: 7680, height: 4320, fps: 240).window, 3.0 / 240, accuracy: 1e-9, "never below 3 frames")
  }

  private func frameTimes(_ range: Range<Int>, fps: Int32 = 30) -> [CMTime] {
    range.map { CMTime(value: CMTimeValue($0), timescale: fps) }
  }

  /// Runs the schedule over every window like makeReversedCopy does, feeding each window extra frames around its
  /// edges (as a reader might return). Returns the appended source times and output times, in append order.
  private func reverseAll(frames: [CMTime], start: Double, end: Double, window: Double) -> (source: [Double], out: [Double]) {
    let windows = MediaPrePass.reverseWindows(start: start, end: end, window: window)
    let e = ExportSession.time(end)
    var later = e
    var source: [Double] = [], out: [Double] = []
    for (w, win) in windows.enumerated() {
      let lo = ExportSession.time(win.start), hi = ExportSession.time(win.end)
      let fed = frames.filter { $0.seconds >= win.start - 0.2 && $0.seconds < win.end + 0.1 }
      let s = MediaPrePass.reverseSchedule(pts: fed, windowStart: lo, windowEnd: hi, isEarliest: w == windows.count - 1, end: e, later: later)
      for step in s.steps { source.append(fed[step.index].seconds); out.append(step.time.seconds) }
      later = s.later
    }
    return (source, out)
  }

  func testReverseScheduleHasNoDuplicatesOrGapsAndRisesFromZero() {
    // 30 fps frames over 0–3 s; trim [0.51, 2.0]: frame 15 (0.5 s) is on screen at S, frame 59 is the last before E.
    let r = reverseAll(frames: frameTimes(0..<90), start: 0.51, end: 2.0, window: 0.7)
    let expected = (15...59).reversed().map { Double($0) / 30 }
    XCTAssertEqual(r.source.count, expected.count)
    for (a, b) in zip(r.source, expected) { XCTAssertEqual(a, b, accuracy: 1e-9) }
    XCTAssertEqual(r.out.first ?? -1, 0, accuracy: 1e-9)
    for (a, b) in zip(r.out, r.out.dropFirst()) { XCTAssertLessThan(a, b) }
    // Each frame keeps its source spacing: frame i (below the last) starts at E − (i + 1) / 30.
    for (src, t) in zip(r.source.dropFirst(), r.out.dropFirst()) { XCTAssertEqual(t, 2.0 - (src + 1.0 / 30), accuracy: 1e-3) }
    // The covering frame is last and lasts from E − 16/30 until E − S (where the session ends).
    let last = r.out.last ?? 0
    XCTAssertLessThan(last, 2.0 - 0.51)
    XCTAssertEqual((2.0 - 0.51) - last, 16.0 / 30 - 0.51, accuracy: 1e-3)
  }

  func testReverseScheduleTakesTheFrameExactlyAtStartWithoutTheOneBefore() {
    let r = reverseAll(frames: frameTimes(0..<90), start: 0.5, end: 1.0, window: 2)
    XCTAssertEqual(r.source.last ?? -1, 0.5, accuracy: 1e-9)
    XCTAssertEqual(r.source.count, 15)                       // frames 15...29
  }

  func testReverseScheduleSkipsARepeatedStartTime() {
    let pts = [CMTime(value: 3, timescale: 30), CMTime(value: 4, timescale: 30), CMTime(value: 4, timescale: 30)]
    let e = CMTime(value: 5, timescale: 30)
    let s = MediaPrePass.reverseSchedule(pts: pts, windowStart: .zero, windowEnd: e, isEarliest: false, end: e, later: e)
    XCTAssertEqual(s.steps.map { pts[$0.index].value }, [4, 3])
    XCTAssertEqual(s.steps.map { $0.time.seconds }, [0, 1.0 / 30])
    XCTAssertEqual(s.later.value, 3)
  }

  func testCancellationErrorIsACancelNotAFailure() {
    XCTAssertTrue(MediaPrePass.outcome(of: CancellationError(), for: .reverse) is PrePassCancelled)
    XCTAssertTrue(MediaPrePass.outcome(of: PrePassCancelled(), for: .photo) is PrePassCancelled)
    XCTAssertEqual((MediaPrePass.outcome(of: URLError(.unknown), for: .photo) as? ExportError)?.errorDescription,
                   "Couldn't prepare a photo for export.")
  }

  func testPhotoDecodeCapIsTwiceTheExportLongSideUpTo4096() {
    XCTAssertEqual(MediaPrePass.photoMaxPixelSize(renderSize: CGSize(width: 720, height: 1280)), 2560)
    XCTAssertEqual(MediaPrePass.photoMaxPixelSize(renderSize: CGSize(width: 1080, height: 1080)), 2160)
    XCTAssertEqual(MediaPrePass.photoMaxPixelSize(renderSize: CGSize(width: 2160, height: 3840)), 4096)
  }

  func testEncodableSizeIsEvenAndWithinTheH264FrameLimit() {
    let odd = MediaPrePass.encodableSize(CGSize(width: 1001, height: 751))
    XCTAssertEqual(odd.width, 1000); XCTAssertEqual(odd.height, 750)
    let uhd = MediaPrePass.encodableSize(CGSize(width: 3840, height: 2160))
    XCTAssertEqual(uhd.width, 3840); XCTAssertEqual(uhd.height, 2160)
    for size in [CGSize(width: 3840, height: 2880), CGSize(width: 4096, height: 4096), CGSize(width: 4096, height: 3072)] {
      let s = MediaPrePass.encodableSize(size)
      XCTAssertEqual(s.width % 2, 0); XCTAssertEqual(s.height % 2, 0)
      let macroblocks = ((s.width + 15) / 16) * ((s.height + 15) / 16)
      XCTAssertLessThanOrEqual(macroblocks, MediaPrePass.maxMacroblocks, "\(size)")
      XCTAssertEqual(Double(s.width) / Double(s.height), Double(size.width / size.height), accuracy: 0.01, "aspect kept")
    }
    let tiny = MediaPrePass.encodableSize(CGSize(width: 1, height: 1))
    XCTAssertEqual(tiny.width, 2); XCTAssertEqual(tiny.height, 2)
  }

  func testFailureMessages() {
    XCTAssertEqual(ExportError.photoPrepFailed.errorDescription, "Couldn't prepare a photo for export.")
    XCTAssertEqual(ExportError.reversePrepFailed.errorDescription, "Couldn't reverse a clip for export.")
    XCTAssertEqual(MediaPrePass.failure(for: .photo).errorDescription, "Couldn't prepare a photo for export.")
    XCTAssertEqual(MediaPrePass.failure(for: .reverse).errorDescription, "Couldn't reverse a clip for export.")
  }
}
