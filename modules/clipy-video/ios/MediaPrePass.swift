import AVFoundation
import CoreGraphics
import CoreVideo
import ImageIO

/// One piece of work before composing: a photo clip becomes a short video, a reversed clip becomes a reversed copy.
struct PrePassJob: Equatable {
  enum Kind: Equatable { case photo, reverse }
  let clipIndex: Int
  let kind: Kind
}

/// A source-time window `[start, end)` in seconds.
struct TimeWindow: Equatable {
  let start: Double
  let end: Double
}

/// Thrown when the export is cancelled during the pre-pass; ExportSession turns it into a `cancelled` event.
struct PrePassCancelled: Error {}

/// Any AVFoundation / ImageIO failure inside a job; `run` turns it into the job's readable `ExportError`.
private struct PrePassFailure: Error {}

/// The pre-pass: before the composition is built, every photo clip is turned into an ordinary H.264 video and every
/// reversed clip into a reversed copy of its trimmed range, so the rest of the export only ever sees forward video.
/// The planning, rewrite, progress and size maths are pure (MediaPrePassTests); the AVFoundation work is below them.
enum MediaPrePass {
  /// Share of the reported progress the pre-pass takes when it has any job.
  static let progressShare = 0.2
  /// Never decode a photo larger than this on its long side.
  static let maxPhotoPixels = 4096
  /// H.264 level 5.1 / 5.2 frame-size limit (MaxFS), in 16×16 macroblocks (= 4096 × 2304).
  static let maxMacroblocks = 36_864
  /// Decoded pixels one reverse window may hold: 60 frames at 4K UHD.
  static let reverseWindowPixelBudget = 60.0 * 3840 * 2160

  // MARK: - Pure planning

  /// Which clips need preparing, in clip order. A photo is only turned into video (a still reversed is the same still).
  static func plan(_ clips: [ExportClip]) -> [PrePassJob] {
    var jobs: [PrePassJob] = []
    for (i, c) in clips.enumerated() {
      if c.kind == "photo" { jobs.append(PrePassJob(clipIndex: i, kind: .photo)) }
      else if c.reversed { jobs.append(PrePassJob(clipIndex: i, kind: .reverse)) }
    }
    return jobs
  }

  /// The clip after its job: plays the prepared file from 0 to its duration, forward, as a video; everything else is
  /// kept. A NEW record is built field by field — `@Field` is a class, so mutating a copy would change the original.
  /// Keep this list in step with `ExportClip`.
  static func rewrite(_ clip: ExportClip, preparedURL: URL, duration: Double) -> ExportClip {
    var out = ExportClip()
    out.sourceUri = preparedURL.absoluteString
    out.trimStart = 0
    out.trimEnd = duration
    out.volume = clip.volume
    out.muted = clip.muted
    out.speed = clip.speed
    out.filter = clip.filter
    out.transition = clip.transition
    out.kind = "video"
    out.sourceWidth = clip.sourceWidth
    out.sourceHeight = clip.sourceHeight
    out.transform = clip.transform
    out.crop = clip.crop
    out.background = clip.background
    out.reversed = false
    return out
  }

  /// Overall progress while job `job` (0-based) of `jobCount` is `fraction` done: the jobs share the first 20 % evenly.
  static func prePassProgress(job: Int, jobCount: Int, fraction: Double) -> Double {
    guard jobCount > 0 else { return 0 }
    let f = fraction.isFinite ? min(1, max(0, fraction)) : 0
    return progressShare * (Double(job) + f) / Double(jobCount)
  }

  /// The composition export's own progress, rescaled to 20–100 % after a pre-pass; unchanged when there was none.
  static func exportProgress(_ p: Double, hasJobs: Bool) -> Double {
    hasJobs ? progressShare + (1 - progressShare) * p : p
  }

  /// Windows covering `[start, end)`, latest first, each at most `window` seconds long.
  static func reverseWindows(start: Double, end: Double, window: Double) -> [TimeWindow] {
    guard end > start, window > 0 else { return [] }
    var out: [TimeWindow] = []
    var hi = end
    while hi > start {
      let lo = max(start, hi - window)
      out.append(TimeWindow(start: lo, end: hi))
      hi = lo
    }
    return out
  }

  /// 2 s windows, or 1 s when 2 s of decoded frames would exceed ~60 frames at 4K. An unknown rate counts as 30 fps.
  static func reverseWindowSeconds(width: Double, height: Double, fps: Double) -> Double {
    let rate = fps.isFinite && fps > 0 ? fps : 30
    return 2 * rate * width * height > reverseWindowPixelBudget ? 1 : 2
  }

  /// Photo decode cap: twice the export's long side (room to zoom in), never above 4096.
  static func photoMaxPixelSize(renderSize: CGSize) -> Int {
    let long = Double(max(renderSize.width, renderSize.height)) * 2
    guard long.isFinite, long >= 2 else { return 2 }
    return min(maxPhotoPixels, Int(long))
  }

  /// A frame size the H.264 encoder accepts: scaled down (aspect kept) to at most `maxMacroblocks`, then rounded down
  /// to even numbers, at least 2 × 2.
  static func encodableSize(_ size: CGSize) -> (width: Int, height: Int) {
    var w = max(2, Double(size.width)), h = max(2, Double(size.height))
    func macroblocks(_ w: Double, _ h: Double) -> Int { Int((w / 16).rounded(.up) * (h / 16).rounded(.up)) }
    if macroblocks(w, h) > maxMacroblocks {
      var k = (Double(maxMacroblocks) / Double(macroblocks(w, h))).squareRoot()
      while macroblocks(Double(Int(w * k)), Double(Int(h * k))) > maxMacroblocks { k *= 0.995 }
      w *= k; h *= k
    }
    return (max(2, Int(w) & ~1), max(2, Int(h) & ~1))
  }

  /// The readable error for a failed job.
  static func failure(for kind: PrePassJob.Kind) -> ExportError {
    kind == .photo ? .photoPrepFailed : .reversePrepFailed
  }

  // MARK: - Files

  /// One folder per export under the temporary directory.
  static func makeFolder(exportId: String) throws -> URL {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("clipy-prepass-\(exportId)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  static func removeFolder(_ dir: URL) {
    try? FileManager.default.removeItem(at: dir)
  }

  // MARK: - AVFoundation work

  /// Runs one job, writing `output`; returns the prepared file's duration in seconds. Throws `PrePassCancelled` when
  /// `isCancelled` turns true (checked between frames / windows), otherwise the job's readable `ExportError`.
  static func run(_ job: PrePassJob, clip: ExportClip, to output: URL, renderSize: CGSize,
                  isCancelled: () -> Bool, progress: (Double) -> Void) async throws -> Double {
    do {
      switch job.kind {
      case .photo: return try await makePhotoVideo(clip, to: output, renderSize: renderSize, isCancelled: isCancelled, progress: progress)
      case .reverse: return try await makeReversedCopy(clip, to: output, isCancelled: isCancelled, progress: progress)
      }
    } catch is PrePassCancelled {
      throw PrePassCancelled()
    } catch {
      throw failure(for: job.kind)
    }
  }

  static func videoSettings(width: Int, height: Int, fps: Double) -> [String: Any] {
    let rate = fps.isFinite ? min(60, max(24, fps)) : 30
    let bitRate = Int(min(100_000_000, max(2_000_000, Double(width * height) * rate * 0.2)))
    return [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: bitRate],
    ]
  }

  /// Waits for the writer input, checking for cancel and writer failure while it waits.
  private static func waitUntilReady(_ input: AVAssetWriterInput, _ writer: AVAssetWriter, _ isCancelled: () -> Bool) async throws {
    while !input.isReadyForMoreMediaData {
      if isCancelled() { throw PrePassCancelled() }
      guard writer.status == .writing else { throw PrePassFailure() }
      try await Task.sleep(nanoseconds: 2_000_000)
    }
    if isCancelled() { throw PrePassCancelled() }
  }

  private static func makeWriter(_ output: URL, width: Int, height: Int, fps: Double, transform: CGAffineTransform)
    throws -> (AVAssetWriter, AVAssetWriterInput, AVAssetWriterInputPixelBufferAdaptor) {
    try? FileManager.default.removeItem(at: output)
    let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings(width: width, height: height, fps: fps))
    input.expectsMediaDataInRealTime = false
    input.transform = transform
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: nil)
    guard writer.canAdd(input) else { throw PrePassFailure() }
    writer.add(input)
    guard writer.startWriting() else { throw PrePassFailure() }
    writer.startSession(atSourceTime: .zero)
    return (writer, input, adaptor)
  }

  /// Ends the session at `end` (the last sample is held until then) and finishes the file.
  private static func finish(_ writer: AVAssetWriter, _ input: AVAssetWriterInput, at end: CMTime) async throws {
    input.markAsFinished()
    writer.endSession(atSourceTime: end)
    await writer.finishWriting()
    guard writer.status == .completed else { throw PrePassFailure() }
  }

  /// Photo → video of the clip's duration. Decoded upright (EXIF orientation applied by ImageIO), capped in size,
  /// drawn once into a BGRA buffer and appended as TWO frames — at 0 and one frame (1/30 s) before the end — with the
  /// session ended at the duration. `endSession(atSourceTime:)` makes the last sample last until that time, and the
  /// composition already plays long samples (the edge "hold" frames are one source frame stretched by
  /// `scaleTimeRange`), so 30 identical frames per second would only cost encode time. The second frame keeps the
  /// track from being a single sample.
  private static func makePhotoVideo(_ clip: ExportClip, to output: URL, renderSize: CGSize,
                                     isCancelled: () -> Bool, progress: (Double) -> Void) async throws -> Double {
    let seconds = clip.trimEnd - clip.trimStart
    guard seconds.isFinite, seconds > 0, let url = URL(string: clip.sourceUri),
          let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { throw PrePassFailure() }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,        // honours EXIF orientation (HEIC, rotated JPEG)
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: photoMaxPixelSize(renderSize: renderSize),
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { throw PrePassFailure() }
    let size = encodableSize(CGSize(width: image.width, height: image.height))
    let buffer = try pixelBuffer(drawing: image, width: size.width, height: size.height)
    if isCancelled() { throw PrePassCancelled() }

    let (writer, input, adaptor) = try makeWriter(output, width: size.width, height: size.height, fps: 30, transform: .identity)
    do {
      let total = ExportSession.time(seconds)
      let frame = CMTime(value: 1, timescale: 30)
      var times: [CMTime] = [.zero]
      if CMTimeCompare(total - frame, .zero) > 0 { times.append(total - frame) }
      for (i, t) in times.enumerated() {
        try await waitUntilReady(input, writer, isCancelled)
        guard adaptor.append(buffer, withPresentationTime: t) else { throw PrePassFailure() }
        progress(Double(i + 1) / Double(times.count + 1))
      }
      try await finish(writer, input, at: total)
      progress(1)
      return total.seconds
    } catch {
      if writer.status == .writing { writer.cancelWriting() }
      throw error
    }
  }

  /// A BGRA pixel buffer with `image` drawn to fill it, over black (for photos with transparency).
  private static func pixelBuffer(drawing image: CGImage, width: Int, height: Int) throws -> CVPixelBuffer {
    let attrs: [String: Any] = [
      kCVPixelBufferCGImageCompatibilityKey as String: true,
      kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
      kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
    ]
    var pb: CVPixelBuffer?
    guard CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &pb) == kCVReturnSuccess,
          let buffer = pb else { throw PrePassFailure() }
    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
    guard let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: width, height: height, bitsPerComponent: 8,
                              bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
    else { throw PrePassFailure() }
    let rect = CGRect(x: 0, y: 0, width: width, height: height)
    ctx.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
    ctx.fill(rect)
    ctx.interpolationQuality = .high
    ctx.draw(image, in: rect)
    return buffer
  }

  /// Reversed copy of the clip's trimmed source range `[S, E]`, video only (audio is dropped).
  /// Read in windows from the end backwards (only one window's decoded frames in memory at a time); each frame is
  /// appended at `E − (start of the next later frame)`, so presentation times ascend from 0 and every frame keeps
  /// its source duration; the session ends at `E − S`, so the copy lasts exactly the trimmed range. The source's
  /// `preferredTransform` goes on the writer input, so the copy keeps its orientation.
  private static func makeReversedCopy(_ clip: ExportClip, to output: URL,
                                       isCancelled: () -> Bool, progress: (Double) -> Void) async throws -> Double {
    guard let url = URL(string: clip.sourceUri) else { throw PrePassFailure() }
    let asset = AVURLAsset(url: url)
    guard let track = try await asset.loadTracks(withMediaType: .video).first else { throw PrePassFailure() }
    let (preferredTransform, naturalSize, trackRange) = try await track.load(.preferredTransform, .naturalSize, .timeRange)
    let nominalFrameRate = try await track.load(.nominalFrameRate)
    let fps = Double(nominalFrameRate)
    let duration = try await asset.load(.duration)
    // Clamp like ExportSession does, and to the video track.
    let endSeconds = min(clip.trimEnd, duration.seconds, trackRange.end.seconds)
    let startSeconds = max(0, min(clip.trimStart, endSeconds))
    guard endSeconds.isFinite, endSeconds - startSeconds > 0 else { throw PrePassFailure() }
    let start = ExportSession.time(startSeconds), end = ExportSession.time(endSeconds)
    let total = end - start

    let size = encodableSize(naturalSize)
    let windows = reverseWindows(start: startSeconds, end: endSeconds,
                                 window: reverseWindowSeconds(width: Double(naturalSize.width), height: Double(naturalSize.height), fps: fps))
    let (writer, input, adaptor) = try makeWriter(output, width: size.width, height: size.height, fps: fps, transform: preferredTransform)
    do {
      var later = end                                   // source start of the frame appended just before
      var appended = 0
      for (w, window) in windows.enumerated() {
        if isCancelled() { throw PrePassCancelled() }
        let lo = ExportSession.time(window.start), hi = ExportSession.time(window.end)
        let isEarliest = w == windows.count - 1
        // The earliest window reads a little earlier so the frame on screen at S (which may start before S) is found.
        let readFrom = isEarliest ? CMTimeMaximum(trackRange.start, lo - ExportSession.time(0.5)) : lo
        let frames = try readFrames(asset, track, range: CMTimeRange(start: readFrom, end: hi), isCancelled: isCancelled)
        // Each frame belongs to the window holding its start time, so windows never repeat or skip a frame.
        var kept = frames.filter { CMTimeCompare($0.pts, lo) >= 0 && CMTimeCompare($0.pts, hi) < 0 }
        if isEarliest, !kept.contains(where: { CMTimeCompare($0.pts, lo) == 0 }),
           let covering = frames.filter({ CMTimeCompare($0.pts, lo) < 0 }).max(by: { CMTimeCompare($0.pts, $1.pts) < 0 }) {
          kept.append(covering)
        }
        kept.sort { CMTimeCompare($0.pts, $1.pts) > 0 }   // latest first
        for f in kept where CMTimeCompare(f.pts, later) < 0 {
          try await waitUntilReady(input, writer, isCancelled)
          guard adaptor.append(f.buffer, withPresentationTime: end - later) else { throw PrePassFailure() }
          appended += 1
          later = f.pts
        }
        progress(Double(w + 1) / Double(windows.count))
      }
      guard appended > 0 else { throw PrePassFailure() }
      try await finish(writer, input, at: total)
      return total.seconds
    } catch {
      if writer.status == .writing { writer.cancelWriting() }
      throw error
    }
  }

  /// Decodes the frames of `track` within `range` (a fresh reader per window: an AVAssetReader cannot restart).
  private static func readFrames(_ asset: AVAsset, _ track: AVAssetTrack, range: CMTimeRange,
                                 isCancelled: () -> Bool) throws -> [(pts: CMTime, buffer: CVPixelBuffer)] {
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
    ])
    guard reader.canAdd(output) else { throw PrePassFailure() }
    reader.add(output)
    reader.timeRange = range
    guard reader.startReading() else { throw PrePassFailure() }
    var frames: [(pts: CMTime, buffer: CVPixelBuffer)] = []
    while let sample = output.copyNextSampleBuffer() {
      if isCancelled() { reader.cancelReading(); throw PrePassCancelled() }
      guard let buffer = CMSampleBufferGetImageBuffer(sample) else { continue }
      frames.append((pts: CMSampleBufferGetPresentationTimeStamp(sample), buffer: buffer))
    }
    guard reader.status == .completed else { throw PrePassFailure() }
    return frames
  }
}
