import AVFoundation
import CoreImage
import CoreMedia
import CoreVideo
import ExpoModulesCore
import Vision

/// One measuring for Stabilize (`ShakeRequest` in modules/clipy-video/index.ts): the source range `from` … `to` is
/// read once and every kept frame is compared with the frame before it.
struct ShakeRequest: Record {
  @Field var jobId: String = ""
  @Field var sourceUri: String = ""
  @Field var from: Double = 0
  @Field var to: Double = 0
  @Field var minFrameGap: Double = 0.008
  @Field var measureSide: Double = 512
}

/// One steadied and / or filled copy (`SteadyRequest` in modules/clipy-video/index.ts; the numbers are `STEADY` /
/// `SMOOTH` in src/editor/model/steady.ts). The source range goes to `outputPath`, a .mov with the source's timing
/// and its sound. `times` / `dx` / `dy`: each frame's correction (fractions of the picture), worked out by the app
/// (src/editor/model/steadyPath.ts). `grid`: 0 = the source's own frames; above 0 = that many frames per source
/// second, the ones in between blended.
struct SteadyRequest: Record {
  @Field var jobId: String = ""
  @Field var sourceUri: String = ""
  @Field var outputPath: String = ""
  @Field var from: Double = 0
  @Field var to: Double = 0
  @Field var maxSide: Double = 1920
  @Field var minFrameGap: Double = 0.008
  @Field var grid: Double = 0
  @Field var zoom: Double = 1
  @Field var times: [Double] = []
  @Field var dx: [Double] = []
  @Field var dy: [Double] = []
  @Field var bitRate: Double = 8_000_000
  @Field var blendFloor: Double = 0.02
}

enum SteadyError: Error, LocalizedError {
  case cancelled
  case failed(String)
  var errorDescription: String? {
    switch self {
    case .cancelled: return "Steady cancelled"
    case .failed(let text): return text
    }
  }
}

/// A measuring or a steady render while it runs: `cancel()` makes its loop stop at the next pass.
final class SteadyJob: @unchecked Sendable {
  private let lock = NSLock()
  private var stopped = false                      // guarded by `lock`

  func cancel() {
    lock.lock()
    stopped = true
    lock.unlock()
  }

  var isCancelled: Bool {
    lock.lock()
    defer { lock.unlock() }
    return stopped
  }
}

/// A video file opened for measuring or for a steady render. It HOLDS the asset: `AVAssetTrack.asset` is a weak
/// reference, so the tracks and the readers made from them are only usable while this object lives (the module
/// keeps it for the whole call).
final class SteadySource {
  let asset: AVURLAsset
  let video: AVAssetTrack
  let audio: AVAssetTrack?
  let audioHint: CMFormatDescription?
  let preferredTransform: CGAffineTransform
  let naturalSize: CGSize
  let seconds: Double
  let frameRate: Double                            // the file's own frames per second; 0 = not known

  init(asset: AVURLAsset, video: AVAssetTrack, audio: AVAssetTrack?, audioHint: CMFormatDescription?,
       preferredTransform: CGAffineTransform, naturalSize: CGSize, seconds: Double, frameRate: Double) {
    self.asset = asset
    self.video = video
    self.audio = audio
    self.audioHint = audioHint
    self.preferredTransform = preferredTransform
    self.naturalSize = naturalSize
    self.seconds = seconds
    self.frameRate = frameRate
  }

  /// How many frames a second a render keeps of this file: its own rate, or what `gap` (the least time between two
  /// kept frames) lets through. 0 = not known.
  func keptRate(gap: Double) -> Double {
    guard frameRate.isFinite, frameRate > 0 else { return 0 }
    return gap > 0 ? min(frameRate, 1 / gap) : frameRate
  }

  static func open(_ uri: String) async throws -> SteadySource {
    guard let url = ExportSession.fileURL(from: uri) else { throw SteadyError.failed("steady source: not a file path") }
    let asset = AVURLAsset(url: url)
    do {
      guard let video = try await asset.loadTracks(withMediaType: .video).first else {
        throw SteadyError.failed("steady source: this file has no picture")
      }
      let (preferredTransform, naturalSize) = try await video.load(.preferredTransform, .naturalSize)
      let length = try await asset.load(.duration)
      let nominal: Float = try await video.load(.nominalFrameRate)
      let audio: AVAssetTrack? = try await asset.loadTracks(withMediaType: .audio).first
      // Only a description of SOUND is handed to the writer: an input given another media type's description stops the app.
      var audioHint: CMFormatDescription? = nil
      if let track = audio {
        let described: [CMFormatDescription] = try await track.load(.formatDescriptions)
        if let first = described.first, CMFormatDescriptionGetMediaType(first) == kCMMediaType_Audio {
          audioHint = first
        }
      }
      return SteadySource(asset: asset, video: video, audio: audio, audioHint: audioHint,
                          preferredTransform: preferredTransform, naturalSize: naturalSize,
                          seconds: length.seconds.isFinite ? length.seconds : 0,
                          frameRate: nominal.isFinite && nominal > 0 ? Double(nominal) : 0)
    } catch let own as SteadyError {
      throw own
    } catch {
      throw SteadyError.failed("steady source: " + ExportSession.describe(error))
    }
  }
}

/// One corrected source frame held for blending: its source second and which of the two held buffers it is in.
struct SteadyFrame {
  let time: Double
  let slot: Int
}

/// Stabilize and Smooth slow motion, the native part. Nothing here decides a number: what Vision's steps mean, the
/// corrections, the zoom, the grid and the bitrate come from the app. `measure` reports how far each frame moved
/// against the frame before it; `render` writes the frames, moved and zoomed as told, on their own times or on a
/// uniform grid with blended frames in between. All the pixel work is Core Image's, Vision's and the encoder's.
enum SteadyRender {
  /// What a failure says to the app: a SteadyError's own staged text, anything else described in full.
  static func message(_ error: Error) -> String {
    if let own = error as? SteadyError, let text = own.errorDescription { return text }
    return "steady render: " + ExportSession.describe(error)
  }

  /// One heavy render at a time on this phone, cut-outs included: the cut-out's own gate. A second call waits here
  /// for its turn and still answers a cancel while it waits. Every return is paired with one `CutoutRender.leave()`.
  static func enter(_ job: SteadyJob) async throws {
    while true {
      if job.isCancelled { throw SteadyError.cancelled }
      if CutoutRender.takeGate() { return }
      try await Task.sleep(nanoseconds: 50_000_000)
    }
  }

  /// A BGRA pixel buffer Core Image can render into and Vision can read.
  static func bgraBuffer(width: Int, height: Int) throws -> CVPixelBuffer {
    let attrs: [String: Any] = [
      kCVPixelBufferCGImageCompatibilityKey as String: true,
      kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
      kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
    ]
    var made: CVPixelBuffer? = nil
    guard CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &made) == kCVReturnSuccess,
          let buffer = made else { throw SteadyError.failed("steady render: no picture buffer") }
    return buffer
  }

  /// A buffer from the writer's pool.
  static func poolBuffer(_ pool: CVPixelBufferPool) throws -> CVPixelBuffer {
    var made: CVPixelBuffer? = nil
    guard CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &made) == kCVReturnSuccess, let out = made else {
      throw SteadyError.failed("steady writer: no picture buffer")
    }
    return out
  }

  /// The asked source seconds, inside the file.
  static func sourceSpan(from: Double, to: Double, seconds: Double) throws -> (start: Double, end: Double) {
    let start = max(0, min(from.isFinite ? from : 0, seconds))
    let end = min(seconds, to.isFinite && to > start ? to : seconds)
    guard end - start > 0 else { throw SteadyError.failed("steady source: nothing to render") }
    return (start, end)
  }

  /// The picture's size as it is shown (its rotation applied).
  static func shownSize(_ source: SteadySource) throws -> (width: Double, height: Double) {
    let shown = source.naturalSize.applying(source.preferredTransform)
    let width = Double(abs(shown.width))
    let height = Double(abs(shown.height))
    guard width.isFinite, height.isFinite, width >= 1, height >= 1 else {
      throw SteadyError.failed("steady source: this file has no picture")
    }
    return (width, height)
  }

  /// The reader's picture output: decoded 8-bit frames.
  static func pictureOutput(_ reader: AVAssetReader, source: SteadySource) throws -> AVAssetReaderTrackOutput {
    let pictures = AVAssetReaderTrackOutput(track: source.video, outputSettings: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
    ])
    pictures.alwaysCopiesSampleData = false
    guard reader.canAdd(pictures) else { throw SteadyError.failed("steady reader: this picture cannot be decoded") }
    reader.add(pictures)
    return pictures
  }

  /// How far every kept frame of the range moved against the kept frame before it, as Vision reports it: the
  /// transform that aligns THIS frame (the request's targeted image) with the frame before (the handler's image),
  /// its `tx` / `ty` divided by the measured picture's width / height. The first frame reports 0, 0. A frame Vision
  /// cannot place reports 0, 0 and is counted in `failed`: it never fails the measuring. One synchronous loop.
  static func measure(_ request: ShakeRequest, source: SteadySource, job: SteadyJob, progress: (Double) -> Void) throws -> [String: Any] {
    let span = try sourceSpan(from: request.from, to: request.to, seconds: source.seconds)
    let full = try shownSize(source)
    let side = request.measureSide.isFinite && request.measureSide >= 64 ? request.measureSide : 512
    let size = CutoutRender.evenSize(width: full.width, height: full.height, maxSide: side)
    let rect = CGRect(x: 0, y: 0, width: size.width, height: size.height)
    let scale = CGAffineTransform(scaleX: CGFloat(size.width) / CGFloat(full.width), y: CGFloat(size.height) / CGFloat(full.height))
    let upright = ExportSession.ciOrientTransform(preferredTransform: source.preferredTransform, naturalSize: source.naturalSize).concatenating(scale)

    let reader: AVAssetReader
    do {
      reader = try AVAssetReader(asset: source.asset)
    } catch {
      throw SteadyError.failed("steady reader: " + ExportSession.describe(error))
    }
    let pictures = try pictureOutput(reader, source: source)
    reader.timeRange = CMTimeRange(start: ExportSession.time(span.start), end: ExportSession.time(span.end))

    let slots: [CVPixelBuffer] = [try bgraBuffer(width: size.width, height: size.height), try bgraBuffer(width: size.width, height: size.height)]
    let space = CutoutRender.videoSpace()
    let handler = VNSequenceRequestHandler()
    let gap = request.minFrameGap.isFinite && request.minFrameGap > 0 ? request.minFrameGap : 0
    var times: [Double] = []
    var dx: [Double] = []
    var dy: [Double] = []
    var failed = 0
    var slot = 0
    var lastKept = -Double.infinity

    if job.isCancelled { throw SteadyError.cancelled }
    guard reader.startReading() else { throw SteadyError.failed("steady reader: " + ExportSession.describe(reader.error)) }
    while let sample = pictures.copyNextSampleBuffer() {
      if job.isCancelled {
        reader.cancelReading()
        throw SteadyError.cancelled
      }
      let at = CMSampleBufferGetPresentationTimeStamp(sample).seconds
      guard at.isFinite, at >= span.start - 0.0005, at > lastKept, at - lastKept >= gap, let frame = CMSampleBufferGetImageBuffer(sample) else { continue }
      let step: (x: Double, y: Double, ok: Bool) = autoreleasepool { () -> (x: Double, y: Double, ok: Bool) in
        let placed = CIImage(cvPixelBuffer: frame).transformed(by: upright).cropped(to: rect)
        CutoutRender.context.render(placed, to: slots[slot], bounds: rect, colorSpace: space)
        guard !times.isEmpty else { return (0, 0, true) }
        let registration = VNTranslationalImageRegistrationRequest(targetedCVPixelBuffer: slots[slot], options: [:], completionHandler: nil)
        do {
          try handler.perform([registration], on: slots[1 - slot])
        } catch {
          return (0, 0, false)
        }
        guard let found = registration.results?.first else { return (0, 0, false) }
        let x = Double(found.alignmentTransform.tx) / Double(size.width)
        let y = Double(found.alignmentTransform.ty) / Double(size.height)
        guard x.isFinite, y.isFinite else { return (0, 0, false) }
        return (x, y, true)
      }
      if !step.ok { failed += 1 }
      times.append(at)
      dx.append(step.x)
      dy.append(step.y)
      slot = 1 - slot
      lastKept = at
      progress(min(1, max(0, (at - span.start) / (span.end - span.start))))
    }
    guard reader.status == .completed else { throw SteadyError.failed("steady reader: " + ExportSession.describe(reader.error)) }
    guard !times.isEmpty else { throw SteadyError.failed("steady measure: no picture came out") }
    progress(1)
    let answer: [String: Any] = ["times": times, "dx": dx, "dy": dy, "frames": times.count, "failed": failed]
    return answer
  }

  /// Settings the writer says it can apply: HEVC, else H.264. (Settings a writer cannot apply raise an Objective-C
  /// exception when they are used, which Swift cannot catch: they are asked about first.)
  static func videoSettings(width: Int, height: Int, bitRate: Double, writer: AVAssetWriter) throws -> [String: Any] {
    let rate = Int(min(100_000_000, max(1_000_000, bitRate.isFinite ? bitRate : 8_000_000)))
    let compression: [String: Any] = [AVVideoAverageBitRateKey: rate]
    let codecs: [AVVideoCodecType] = [.hevc, .h264]
    for codec in codecs {
      let settings: [String: Any] = [
        AVVideoCodecKey: codec,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: compression,
      ]
      if writer.canApply(outputSettings: settings, forMediaType: .video) {
        return settings
      }
    }
    throw SteadyError.failed("steady writer: this iPhone cannot write this video")
  }

  /// A QuickTime writer with one picture input that takes BGRA buffers. Not started.
  static func makeWriter(_ url: URL, width: Int, height: Int, bitRate: Double)
    throws -> (AVAssetWriter, AVAssetWriterInput, AVAssetWriterInputPixelBufferAdaptor) {
    try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? FileManager.default.removeItem(at: url)
    let writer: AVAssetWriter
    do {
      writer = try AVAssetWriter(outputURL: url, fileType: .mov)
    } catch {
      throw SteadyError.failed("steady writer: " + ExportSession.describe(error))
    }
    let settings = try videoSettings(width: width, height: height, bitRate: bitRate, writer: writer)
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    let attributes: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferWidthKey as String: width,
      kCVPixelBufferHeightKey as String: height,
      kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
    ]
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attributes)
    guard writer.canAdd(input) else {
      throw SteadyError.failed("steady writer: this iPhone cannot write this video")
    }
    writer.add(input)
    return (writer, input, adaptor)
  }

  /// Moves a finished part file into place; on failure the part file is removed.
  static func place(_ partURL: URL, at outputURL: URL) throws {
    do {
      try? FileManager.default.removeItem(at: outputURL)
      try FileManager.default.moveItem(at: partURL, to: outputURL)
    } catch {
      try? FileManager.default.removeItem(at: partURL)
      throw SteadyError.failed("steady output: " + ExportSession.describe(error))
    }
  }

  /// The correction for a frame at `time`: the entry whose TIME is nearest (never the entry with the frame's index:
  /// the app leaves frames out), found by walking on from `cursor` (frames come in order, so the walk never goes
  /// back). No entries, or a frame outside the stretch the entries cover → no correction.
  static func shift(at time: Double, times: [Double], dx: [Double], dy: [Double], cursor: inout Int) -> (x: Double, y: Double) {
    let count = min(times.count, min(dx.count, dy.count))
    guard count > 0 else { return (0, 0) }
    let edge = 0.05
    guard time >= times[0] - edge, time <= times[count - 1] + edge else { return (0, 0) }
    if cursor < 0 { cursor = 0 }
    if cursor >= count { cursor = count - 1 }
    while cursor + 1 < count, abs(times[cursor + 1] - time) <= abs(times[cursor] - time) { cursor += 1 }
    let x = dx[cursor]
    let y = dy[cursor]
    return (x.isFinite ? x : 0, y.isFinite ? y : 0)
  }

  /// A correction held to what the zoom hides: the picture, scaled about its centre by `zoom`, reaches
  /// `(zoom − 1) / 2` of the copy past each edge, so a move no larger than that never shows the picture's rim. (The
  /// app clamps the same way; this is the last word.)
  static func hidden(_ move: (x: Double, y: Double), zoom: Double) -> (x: Double, y: Double) {
    let z = zoom.isFinite ? min(2, max(1, zoom)) : 1
    let most = (z - 1) / 2
    return (min(most, max(-most, move.x)), min(most, max(-most, move.y)))
  }

  /// Where a frame goes in the copy: made upright at the copy's size (`upright`), scaled about the copy's centre by
  /// `zoom` (1 … 2), then moved by `move` (fractions of the copy's width and height, in Core Image's coordinates —
  /// the coordinates Vision's steps were reported in).
  static func placement(upright: CGAffineTransform, width: Int, height: Int, zoom: Double, move: (x: Double, y: Double)) -> CGAffineTransform {
    let w = CGFloat(width)
    let h = CGFloat(height)
    let z = CGFloat(zoom.isFinite ? min(2, max(1, zoom)) : 1)
    return upright
      .concatenating(CGAffineTransform(translationX: -w / 2, y: -h / 2))
      .concatenating(CGAffineTransform(scaleX: z, y: z))
      .concatenating(CGAffineTransform(translationX: w / 2 + CGFloat(move.x) * w, y: h / 2 + CGFloat(move.y) * h))
  }

  /// A steady copy. Frames of the asked range are read, placed (`placement`) and written into a session that starts
  /// at zero and ends at the range's end, so the copy has the source's timeline. Without a grid every kept frame is
  /// written at its OWN source time. With a grid a frame is written at `start + k / grid` for every k inside the
  /// range: the kept frame before that moment (`held`) dissolved into the one after it (`ahead`) by time; before the
  /// first frame and after the last, that frame itself. (A file that already has the grid's frames a second is
  /// written without a grid.) The source's sound packets are copied beside the picture as
  /// they are. The loop serves whichever input is ready and sleeps when neither is.
  static func render(_ request: SteadyRequest, source: SteadySource, to outputURL: URL, job: SteadyJob,
                     progress: (Double) -> Void) async throws -> [String: Any] {
    let span = try sourceSpan(from: request.from, to: request.to, seconds: source.seconds)
    let range = CMTimeRange(start: ExportSession.time(span.start), end: ExportSession.time(span.end))
    let full = try shownSize(source)
    let size = CutoutRender.evenSize(width: full.width, height: full.height, maxSide: request.maxSide)
    let rect = CGRect(x: 0, y: 0, width: size.width, height: size.height)
    let scale = CGAffineTransform(scaleX: CGFloat(size.width) / CGFloat(full.width), y: CGFloat(size.height) / CGFloat(full.height))
    let upright = ExportSession.ciOrientTransform(preferredTransform: source.preferredTransform, naturalSize: source.naturalSize).concatenating(scale)
    let times: [Double] = request.times
    let dx: [Double] = request.dx
    let dy: [Double] = request.dy
    let gap: Double = request.minFrameGap.isFinite && request.minFrameGap > 0 ? request.minFrameGap : 0
    let wanted: Double = request.grid.isFinite && request.grid >= 1 ? min(240, request.grid.rounded()) : 0
    // A file that already has the grid's frames a second (or more) keeps its OWN frames at their own times: a grid
    // would drop some of them and blend the rest.
    let grid: Double = wanted > 0 && source.keptRate(gap: gap) >= wanted - 0.5 ? 0 : wanted
    let near: Double = request.blendFloor.isFinite ? min(0.49, max(0, request.blendFloor)) : 0.02
    let zoom: Double = request.zoom

    let reader: AVAssetReader
    do {
      reader = try AVAssetReader(asset: source.asset)
    } catch {
      throw SteadyError.failed("steady reader: " + ExportSession.describe(error))
    }
    let pictures = try pictureOutput(reader, source: source)
    var sounds: AVAssetReaderTrackOutput? = nil
    if let audio = source.audio {
      let stored = AVAssetReaderTrackOutput(track: audio, outputSettings: nil)
      stored.alwaysCopiesSampleData = false
      guard reader.canAdd(stored) else { throw SteadyError.failed("steady sound: this clip's sound cannot be copied") }
      reader.add(stored)
      sounds = stored
    }
    reader.timeRange = range

    let slots: [CVPixelBuffer] = [try bgraBuffer(width: size.width, height: size.height), try bgraBuffer(width: size.width, height: size.height)]
    let space = CutoutRender.videoSpace()
    let partURL = CutoutRender.partFile(for: outputURL)
    let (writer, pictureInput, adaptor) = try makeWriter(partURL, width: size.width, height: size.height, bitRate: request.bitRate)
    var soundInput: AVAssetWriterInput? = nil
    if sounds != nil {
      let input = AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint: source.audioHint)
      input.expectsMediaDataInRealTime = false
      guard writer.canAdd(input) else { throw SteadyError.failed("steady sound: this clip's sound cannot be copied") }
      writer.add(input)
      soundInput = input
    }

    var cursor = 0
    var kept = 0                                   // source frames used
    var written = 0                                // frames in the copy
    var lastKept = -Double.infinity
    var held: SteadyFrame? = nil                   // grid only: the kept frame at or before the next grid moment
    var ahead: SteadyFrame? = nil                  // grid only: the kept frame after `held`
    var sourceDone = false
    var gridIndex = 0
    var picturesDone = false
    var soundsDone = soundInput == nil
    do {
      if job.isCancelled { throw SteadyError.cancelled }
      guard reader.startReading() else { throw SteadyError.failed("steady reader: " + ExportSession.describe(reader.error)) }
      guard writer.startWriting() else { throw SteadyError.failed("steady writer: " + ExportSession.describe(writer.error)) }
      writer.startSession(atSourceTime: .zero)
      guard let pool = adaptor.pixelBufferPool else { throw SteadyError.failed("steady writer: no picture buffer") }
      while !picturesDone || !soundsDone {
        if job.isCancelled { throw SteadyError.cancelled }
        guard writer.status == .writing else { throw SteadyError.failed("steady writer: " + ExportSession.describe(writer.error)) }
        var worked = false
        if !picturesDone, pictureInput.isReadyForMoreMediaData {
          worked = true
          if grid == 0 || (ahead == nil && !sourceDone) {
            // The next source frame: written at once (no grid), or held for the grid frames around it.
            if let sample = pictures.copyNextSampleBuffer() {
              let pts = CMSampleBufferGetPresentationTimeStamp(sample)
              let at = pts.seconds
              if at.isFinite, at >= span.start - 0.0005, at > lastKept, at - lastKept >= gap, let frame = CMSampleBufferGetImageBuffer(sample) {
                let move = hidden(shift(at: at, times: times, dx: dx, dy: dy, cursor: &cursor), zoom: zoom)
                let spot = placement(upright: upright, width: size.width, height: size.height, zoom: zoom, move: move)
                if grid == 0 {
                  try autoreleasepool { () throws -> Void in
                    // The edge pixels are repeated outwards first, so a rounding sliver at the rim is never black.
                    let placed = CIImage(cvPixelBuffer: frame).clampedToExtent().transformed(by: spot).cropped(to: rect)
                    let out = try poolBuffer(pool)
                    CutoutRender.context.render(placed, to: out, bounds: rect, colorSpace: space)
                    CutoutRender.tag(out)
                    guard adaptor.append(out, withPresentationTime: pts) else {
                      throw SteadyError.failed("steady writer: " + ExportSession.describe(writer.error))
                    }
                  }
                  written += 1
                  progress(min(1, max(0, (at - span.start) / (span.end - span.start))))
                } else {
                  var into = 0
                  if let before = held { into = 1 - before.slot }
                  autoreleasepool {
                    let placed = CIImage(cvPixelBuffer: frame).clampedToExtent().transformed(by: spot).cropped(to: rect)
                    CutoutRender.context.render(placed, to: slots[into], bounds: rect, colorSpace: space)
                  }
                  let made = SteadyFrame(time: at, slot: into)
                  if held == nil { held = made } else { ahead = made }
                }
                kept += 1
                lastKept = at
              }
            } else {
              sourceDone = true
              if grid == 0 {
                picturesDone = true
                pictureInput.markAsFinished()
              }
            }
          } else if let a = held {
            // One grid frame — or one step on to the next pair of source frames.
            let at = span.start + Double(gridIndex) / grid
            if at >= span.end - 0.0005 {
              picturesDone = true
              pictureInput.markAsFinished()
            } else if let b = ahead, at >= b.time {
              held = b
              ahead = nil
            } else {
              var weight = 0.0
              if let b = ahead, b.time > a.time { weight = min(1, max(0, (at - a.time) / (b.time - a.time))) }
              let stamp = CMTime(seconds: span.start + Double(gridIndex) / grid, preferredTimescale: 6000)
              try autoreleasepool { () throws -> Void in
                // The held buffers are read back as what they were written as (they carry no colour tag of their own).
                let first = CIImage(cvPixelBuffer: slots[a.slot], options: [CIImageOption.colorSpace: space])
                var image = first
                if let b = ahead, weight > near {
                  let second = CIImage(cvPixelBuffer: slots[b.slot], options: [CIImageOption.colorSpace: space])
                  if weight >= 1 - near {
                    image = second
                  } else if let mixed = Adjust.filtered(first, "CIDissolveTransition", ["inputTargetImage": second, "inputTime": NSNumber(value: weight)]) {
                    image = mixed.cropped(to: rect)
                  } else if weight >= 0.5 {
                    image = second                 // no dissolve on this iPhone: the nearer frame
                  }
                }
                let out = try poolBuffer(pool)
                CutoutRender.context.render(image, to: out, bounds: rect, colorSpace: space)
                CutoutRender.tag(out)
                guard adaptor.append(out, withPresentationTime: stamp) else {
                  throw SteadyError.failed("steady writer: " + ExportSession.describe(writer.error))
                }
              }
              written += 1
              gridIndex += 1
              progress(min(1, max(0, (at - span.start) / (span.end - span.start))))
            }
          } else {
            // A grid, the source is at its end and no frame was kept: nothing to write.
            picturesDone = true
            pictureInput.markAsFinished()
          }
        }
        if picturesDone, !sourceDone, !soundsDone {
          // The grid ended before the reader's last frames: they are still taken (and dropped), so the reader is
          // never left holding pictures while the sound beside them is wanted.
          worked = true
          if pictures.copyNextSampleBuffer() == nil { sourceDone = true }
        }
        if !soundsDone, let soundInput, let sounds, soundInput.isReadyForMoreMediaData {
          worked = true
          if let packet = sounds.copyNextSampleBuffer() {
            // A buffer without samples is a marker, not sound: nothing to copy.
            if CMSampleBufferGetNumSamples(packet) > 0 {
              guard soundInput.append(packet) else { throw SteadyError.failed("steady sound: " + ExportSession.describe(writer.error)) }
            }
          } else {
            soundsDone = true
            soundInput.markAsFinished()
          }
        }
        if !worked { try await Task.sleep(nanoseconds: 2_000_000) }
      }
      // With a grid the picture can be finished before the reader has handed out its last frame (the range's end is
      // reached first): the reader is then still reading, which is not a failure.
      guard reader.status == .completed || (grid > 0 && reader.status == .reading) else {
        throw SteadyError.failed("steady reader: " + ExportSession.describe(reader.error))
      }
      guard kept > 0, written > 0 else { throw SteadyError.failed("steady render: no picture came out") }
      if job.isCancelled { throw SteadyError.cancelled }
      // The last append can fail the writer after the loop's own check: never end a session on a writer that is not writing.
      guard writer.status == .writing else { throw SteadyError.failed("steady writer: " + ExportSession.describe(writer.error)) }
      if reader.status == .reading { reader.cancelReading() }
      writer.endSession(atSourceTime: range.end)
      await writer.finishWriting()
      guard writer.status == .completed else { throw SteadyError.failed("steady writer: " + ExportSession.describe(writer.error)) }
      try place(partURL, at: outputURL)
    } catch {
      if reader.status == .reading { reader.cancelReading() }
      if writer.status == .writing { writer.cancelWriting() }
      try? FileManager.default.removeItem(at: partURL)
      throw error
    }
    progress(1)
    let answer: [String: Any] = ["fileUri": outputURL.absoluteString, "seconds": span.end, "frames": written]
    return answer
  }
}
