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

  init(asset: AVURLAsset, video: AVAssetTrack, audio: AVAssetTrack?, audioHint: CMFormatDescription?,
       preferredTransform: CGAffineTransform, naturalSize: CGSize, seconds: Double) {
    self.asset = asset
    self.video = video
    self.audio = audio
    self.audioHint = audioHint
    self.preferredTransform = preferredTransform
    self.naturalSize = naturalSize
    self.seconds = seconds
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
                          seconds: length.seconds.isFinite ? length.seconds : 0)
    } catch let own as SteadyError {
      throw own
    } catch {
      throw SteadyError.failed("steady source: " + ExportSession.describe(error))
    }
  }
}

/// One corrected source frame held for blending: its source second, its own presentation time, that time on the
/// copy's clock (`SteadyRender.tick`) and which of the two held buffers it is in.
struct SteadyFrame {
  let time: Double
  let stamp: CMTime
  let tick: Int64
  let slot: Int
}

/// Stabilize and Smooth slow motion, the native part. Nothing here decides a number: what Vision's steps mean, the
/// corrections, the zoom, the grid and the bitrate come from the app. `measure` reports how far each frame moved
/// against the frame before it; `render` writes the frames, moved and zoomed as told, on their own times, with
/// blended frames added between them when asked. All the pixel work is Core Image's, Vision's and the encoder's.
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
  /// transform that aligns THIS frame (the request's targeted image) with the frame before (the image of a handler
  /// made for that one pair),
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
          // A handler of its own for every pair: nothing of an earlier frame can be remembered for a buffer that is used again.
          try VNImageRequestHandler(cvPixelBuffer: slots[1 - slot], options: [:]).perform([registration])
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
    // The picture track's own clock, set before writing starts (never on a sound input): every time written here is
    // stored on it, and the blended frames are made on it exactly.
    input.mediaTimeScale = SteadyRender.timescale
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

  /// The correction for a frame at `time`, looked up by TIME (never by the frame's index: the app leaves frames
  /// out): on a straight line between the entry at or before it and the entry after it, found by walking on from
  /// `cursor` (frames come in order, so the walk never goes back). No entries, or a frame outside the stretch the
  /// entries cover → no correction.
  static func shift(at time: Double, times: [Double], dx: [Double], dy: [Double], cursor: inout Int) -> (x: Double, y: Double) {
    let count = min(times.count, min(dx.count, dy.count))
    guard count > 0, time.isFinite else { return (0, 0) }
    let edge = 0.05
    guard time >= times[0] - edge, time <= times[count - 1] + edge else { return (0, 0) }
    if cursor < 0 { cursor = 0 }
    if cursor >= count { cursor = count - 1 }
    while cursor + 1 < count, times[cursor + 1] <= time { cursor += 1 }
    let x0 = dx[cursor].isFinite ? dx[cursor] : 0
    let y0 = dy[cursor].isFinite ? dy[cursor] : 0
    guard cursor + 1 < count, time > times[cursor] else { return (x0, y0) }
    let room = times[cursor + 1] - times[cursor]
    guard room.isFinite, room > 0 else { return (x0, y0) }
    let part = min(1, max(0, (time - times[cursor]) / room))
    let x1 = dx[cursor + 1].isFinite ? dx[cursor + 1] : 0
    let y1 = dy[cursor + 1].isFinite ? dy[cursor + 1] : 0
    return (x0 + (x1 - x0) * part, y0 + (y1 - y0) * part)
  }

  /// The clock of the copy's picture track, in ticks a second: 1/600, 1/6000 and 1001/30000 of a second are whole
  /// numbers of ticks.
  static let timescale: CMTimeScale = 30000

  /// A source second on that clock (0 for a number that is not one).
  static func tick(_ seconds: Double) -> Int64 {
    guard seconds.isFinite, abs(seconds) < 1_000_000_000 else { return 0 }
    return Int64((seconds * Double(timescale)).rounded())
  }

  /// No pair of source frames gets more blended frames than this: a hole in the file (dropped frames, a pause) is
  /// left as it is.
  static let mostBetween = 16

  /// How many blended frames go between two neighbouring source frames `length` seconds apart, so that the copy
  /// reaches about `grid` frames a second there: `round(length × grid) − 1`; none for a pair already that close,
  /// none above `mostBetween` (a hole is not filled), and never so many that two frames of the copy are closer than `gap`.
  static func blendsBetween(_ length: Double, grid: Double, gap: Double) -> Int {
    guard length.isFinite, length > 0, grid.isFinite, grid > 0 else { return 0 }
    let asked = (length * grid).rounded() - 1
    guard asked.isFinite, asked >= 1, asked <= Double(mostBetween) else { return 0 }
    var count = Int(asked)
    if gap > 0 {
      let room = length / gap
      if room.isFinite, room < Double(count + 1) { count = Int(room.rounded(.down)) - 1 }
    }
    return max(0, count)
  }

  /// Renders `image` (filling `rect`) into a buffer from the writer's pool and appends it at `stamp`.
  static func put(_ image: CIImage, at stamp: CMTime, rect: CGRect, pool: CVPixelBufferPool, space: CGColorSpace,
                  adaptor: AVAssetWriterInputPixelBufferAdaptor, writer: AVAssetWriter) throws {
    let out = try poolBuffer(pool)
    CutoutRender.context.render(image, to: out, bounds: rect, colorSpace: space)
    CutoutRender.tag(out)
    guard adaptor.append(out, withPresentationTime: stamp) else {
      throw SteadyError.failed("steady writer: " + ExportSession.describe(writer.error))
    }
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
  /// at zero and ends at the range's end, so the copy has the source's timeline. EVERY kept frame is written at its
  /// OWN source time. With a grid (a DENSITY: about that many frames a source second, not a lattice of times),
  /// blended frames (`blendsBetween`) are added between each two neighbouring kept frames A and B, evenly spaced in time
  /// between them (on the copy's clock, `timescale`), each a dissolve of A into B by its share of the way; nothing is added before the first frame or
  /// after the last. The source's sound packets are copied beside the picture as they are. The loop serves whichever
  /// input is ready and sleeps when neither is.
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
    let grid: Double = request.grid.isFinite && request.grid >= 1 ? min(240, request.grid.rounded()) : 0
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
    var held: SteadyFrame? = nil                   // grid only: the last kept frame, already written
    var ahead: SteadyFrame? = nil                  // grid only: the kept frame after `held`, not yet written
    var between = 0                                // grid only: blended frames to write before `ahead`
    var step = 1                                   // grid only: the next of them (1 … between)
    var lastTick: Int64 = 0                        // grid only: the last written frame's time on the copy's clock
    // The least room between two frames of the copy, on its clock: the request's gap, and never under two ticks (a
    // source frame's own time may be stored one tick off; a blended frame must still fall strictly between two).
    let room: Int64 = max(2, tick(gap))
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
          if let b = ahead {
            if step <= between, let a = held {
              // One blended frame between A and B, at its share of the way from A's time to B's.
              let weight = Double(step) / Double(between + 1)
              let spot = tick(a.time + (b.time - a.time) * weight)
              let stamp = CMTime(value: CMTimeValue(spot), timescale: SteadyRender.timescale)
              // Never a second copy of a neighbour (a share within `near` of an end), and never closer than `room`
              // to the frame written before it or to the source frame after it — all three on the copy's clock.
              if weight > near, weight < 1 - near, spot - lastTick >= room, b.tick - spot >= room {
                let mixedIn: Bool = try autoreleasepool { () throws -> Bool in
                  // The held buffers are read back as what they were written as (they carry no colour tag of their own).
                  let first = CIImage(cvPixelBuffer: slots[a.slot], options: [CIImageOption.colorSpace: space])
                  let second = CIImage(cvPixelBuffer: slots[b.slot], options: [CIImageOption.colorSpace: space])
                  guard let mixed = Adjust.filtered(first, "CIDissolveTransition", ["inputTargetImage": second, "inputTime": NSNumber(value: weight)]) else {
                    return false                   // no dissolve on this iPhone: no frame is added
                  }
                  try put(mixed.cropped(to: rect), at: stamp, rect: rect, pool: pool, space: space, adaptor: adaptor, writer: writer)
                  return true
                }
                if mixedIn {
                  written += 1
                  lastTick = spot
                }
              }
              step += 1
            } else {
              // The source frame itself, at its own time.
              try autoreleasepool { () throws -> Void in
                let own = CIImage(cvPixelBuffer: slots[b.slot], options: [CIImageOption.colorSpace: space])
                try put(own, at: b.stamp, rect: rect, pool: pool, space: space, adaptor: adaptor, writer: writer)
              }
              written += 1
              lastTick = b.tick
              held = b
              ahead = nil
              progress(min(1, max(0, (b.time - span.start) / (span.end - span.start))))
            }
          } else if let sample = pictures.copyNextSampleBuffer() {
            let pts = CMSampleBufferGetPresentationTimeStamp(sample)
            let at = pts.seconds
            if at.isFinite, at >= span.start - 0.0005, at > lastKept, at - lastKept >= gap, let frame = CMSampleBufferGetImageBuffer(sample) {
              let move = hidden(shift(at: at, times: times, dx: dx, dy: dy, cursor: &cursor), zoom: zoom)
              let spot = placement(upright: upright, width: size.width, height: size.height, zoom: zoom, move: move)
              if grid == 0 {
                try autoreleasepool { () throws -> Void in
                  // The edge pixels are repeated outwards first, so a rounding sliver at the rim is never black.
                  let placed = CIImage(cvPixelBuffer: frame).clampedToExtent().transformed(by: spot).cropped(to: rect)
                  try put(placed, at: pts, rect: rect, pool: pool, space: space, adaptor: adaptor, writer: writer)
                }
                written += 1
                progress(min(1, max(0, (at - span.start) / (span.end - span.start))))
              } else {
                // Held in a buffer of its own: the blended frames before it and the frame itself are made from it.
                var into = 0
                var count = 0
                if let before = held {
                  into = 1 - before.slot
                  count = blendsBetween(at - before.time, grid: grid, gap: gap)
                }
                autoreleasepool {
                  let placed = CIImage(cvPixelBuffer: frame).clampedToExtent().transformed(by: spot).cropped(to: rect)
                  CutoutRender.context.render(placed, to: slots[into], bounds: rect, colorSpace: space)
                }
                ahead = SteadyFrame(time: at, stamp: pts, tick: tick(at), slot: into)
                between = count
                step = 1
              }
              kept += 1
              lastKept = at
            }
          } else {
            picturesDone = true
            pictureInput.markAsFinished()
          }
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
      guard reader.status == .completed else { throw SteadyError.failed("steady reader: " + ExportSession.describe(reader.error)) }
      guard kept > 0, written > 0 else { throw SteadyError.failed("steady render: no picture came out") }
      if job.isCancelled { throw SteadyError.cancelled }
      // The last append can fail the writer after the loop's own check: never end a session on a writer that is not writing.
      guard writer.status == .writing else { throw SteadyError.failed("steady writer: " + ExportSession.describe(writer.error)) }
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
