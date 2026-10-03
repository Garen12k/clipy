import CoreGraphics
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

  func testReverseWindowIsOneSecondWhenTwoWouldHoldMoreThanSixty4KFrames() {
    XCTAssertEqual(MediaPrePass.reverseWindowSeconds(width: 1920, height: 1080, fps: 60), 2)
    XCTAssertEqual(MediaPrePass.reverseWindowSeconds(width: 3840, height: 2160, fps: 30), 2)
    XCTAssertEqual(MediaPrePass.reverseWindowSeconds(width: 3840, height: 2160, fps: 60), 1)
    XCTAssertEqual(MediaPrePass.reverseWindowSeconds(width: 3840, height: 2160, fps: 0), 2, "unknown rate → 30 fps")
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
