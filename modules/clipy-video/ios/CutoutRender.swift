import AVFoundation
import CoreImage
import CoreMedia
import CoreVideo
import ExpoModulesCore
import ImageIO
import UniformTypeIdentifiers
import VideoToolbox
import Vision

/// One cut-out copy (`CutoutRequest` in modules/clipy-video/index.ts; the numbers are `CUTOUT` in
/// src/editor/model/cutout.ts). Video: the source range `from` … `to` goes to `outputPath`, a .mov with a see-through
/// background, the source's timing and its sound. Photo: `outputPath` is a PNG and `stillPath` a movie of the same
/// picture, `stillSeconds` long.
struct CutoutRequest: Record {
  @Field var jobId: String = ""
  @Field var sourceUri: String = ""
  @Field var outputPath: String = ""
  @Field var kind: String = "video"
  @Field var from: Double = 0
  @Field var to: Double = 0
  @Field var maxSide: Double = 1920
  @Field var minFrameGap: Double = 0.03
  @Field var minPerson: Double = 0.005
  @Field var alphaQuality: Double = 0.75
  @Field var bitsPerPixel: Double = 0.1
  @Field var stillPath: String = ""
  @Field var stillSeconds: Double = 60
}

enum CutoutError: Error, LocalizedError {
  case cancelled
  case failed(String)
  var errorDescription: String? {
    switch self {
    case .cancelled: return "Cutout cancelled"
    case .failed(let text): return text
    }
  }
}

/// A cut-out render while it runs: `cancel()` makes the loop stop at its next pass.
final class CutoutJob: @unchecked Sendable {
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

/// A video file opened for a cut-out. It HOLDS the asset: `AVAssetTrack.asset` is a weak reference, so the tracks
/// and the reader made from them are only usable while this object lives (the module keeps it for the whole render).
final class CutoutSource {
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

  static func open(_ uri: String) async throws -> CutoutSource {
    guard let url = ExportSession.fileURL(from: uri) else { throw CutoutError.failed("cutout source: not a file path") }
    let asset = AVURLAsset(url: url)
    do {
      guard let video = try await asset.loadTracks(withMediaType: .video).first else {
        throw CutoutError.failed("cutout source: this file has no picture")
      }
      let (preferredTransform, naturalSize) = try await video.load(.preferredTransform, .naturalSize)
      let length = try await asset.load(.duration)
      let audio: AVAssetTrack? = try await asset.loadTracks(withMediaType: .audio).first
      // The hint tells the writer what the copied packets are. Only a description of SOUND is handed on: a writer
      // input given a description of another media type stops the app instead of throwing.
      var audioHint: CMFormatDescription? = nil
      if let track = audio {
        let described: [CMFormatDescription] = try await track.load(.formatDescriptions)
        if let first = described.first, CMFormatDescriptionGetMediaType(first) == kCMMediaType_Audio {
          audioHint = first
        }
      }
      return CutoutSource(asset: asset, video: video, audio: audio, audioHint: audioHint,
                          preferredTransform: preferredTransform, naturalSize: naturalSize,
                          seconds: length.seconds.isFinite ? length.seconds : 0)
    } catch let own as CutoutError {
      throw own
    } catch {
      throw CutoutError.failed("cutout source: " + ExportSession.describe(error))
    }
  }
}

/// Remove background, the native part: people found with Vision, cut out with Core Image, written as HEVC with
/// alpha. Nothing here decides a number: sizes, rates and thresholds come in the request. All the pixel work is
/// done by Core Image, Vision and the encoder; the Swift here only hands buffers on (it runs unoptimised in a
/// development build).
enum CutoutRender {
  static let context = CIContext(options: [.cacheIntermediates: false])
  /// The mask's coverage is measured on the first kept frame and on every this-many-th after it.
  static let personEvery = 15
  /// No copy is larger than this on its long side, whatever the request says.
  static let largestSide: Double = 4096
  private static let gateLock = NSLock()
  private static var gateTaken = false             // guarded by `gateLock`

  /// What a failure says to the app: a CutoutError's own staged text, anything else described in full.
  static func message(_ error: Error) -> String {
    if let own = error as? CutoutError, let text = own.errorDescription { return text }
    return "cutout render: " + ExportSession.describe(error)
  }

  /// Takes the gate if it is free. Synchronous on purpose: a Swift lock is never held across an `await`.
  static func takeGate() -> Bool {
    gateLock.lock()
    defer { gateLock.unlock() }
    if gateTaken { return false }
    gateTaken = true
    return true
  }

  /// Gives the gate back (called once for every `enter` that returned).
  static func leave() {
    gateLock.lock()
    gateTaken = false
    gateLock.unlock()
  }

  /// One cut-out render at a time (its own gate: the sound renders have theirs). A second render waits here for
  /// its turn and still answers a cancel while it waits.
  static func enter(_ job: CutoutJob) async throws {
    while true {
      if job.isCancelled { throw CutoutError.cancelled }
      if takeGate() { return }
      try await Task.sleep(nanoseconds: 50_000_000)
    }
  }

  /// The copy's pixel size for an upright picture: the long side at most `maxSide`, both sides even, at least 2
  /// (`cutoutSize` in src/editor/model/cutout.ts).
  static func evenSize(width: Double, height: Double, maxSide: Double) -> (width: Int, height: Int) {
    let w = width.isFinite && width > 0 ? width : 2
    let h = height.isFinite && height > 0 ? height : 2
    let cap = maxSide.isFinite && maxSide >= 2 ? min(maxSide, largestSide) : 1920
    let k = min(1, cap / max(w, h))
    func even(_ v: Double) -> Int { max(2, Int((v * k).rounded()) / 2 * 2) }
    return (even(w), even(h))
  }

  /// The file a render writes before it is moved into place.
  static func partFile(for url: URL) -> URL {
    return url.deletingLastPathComponent().appendingPathComponent("part-" + url.lastPathComponent)
  }

  /// Moves a finished part file into place; on failure the part file is removed.
  static func place(_ partURL: URL, at outputURL: URL) throws {
    do {
      try? FileManager.default.removeItem(at: outputURL)
      try FileManager.default.moveItem(at: partURL, to: outputURL)
    } catch {
      try? FileManager.default.removeItem(at: partURL)
      throw CutoutError.failed("cutout output: " + ExportSession.describe(error))
    }
  }

  /// The colour space every render here writes in: the one ordinary video is stored in, so a person keeps the
  /// colours of the original file (a picture written in another space and played as video shifts a little).
  static func videoSpace() -> CGColorSpace {
    return CGColorSpace(name: CGColorSpace.itur_709) ?? CGColorSpaceCreateDeviceRGB()
  }

  /// Marks a buffer as holding ordinary (BT.709) video, so the file says what its numbers mean.
  static func tag(_ buffer: CVPixelBuffer) {
    CVBufferSetAttachment(buffer, kCVImageBufferColorPrimariesKey, kCVImageBufferColorPrimaries_ITU_R_709_2, .shouldPropagate)
    CVBufferSetAttachment(buffer, kCVImageBufferTransferFunctionKey, kCVImageBufferTransferFunction_ITU_R_709_2, .shouldPropagate)
    CVBufferSetAttachment(buffer, kCVImageBufferYCbCrMatrixKey, kCVImageBufferYCbCrMatrix_ITU_R_709_2, .shouldPropagate)
  }

  /// A BGRA pixel buffer Core Image can render into and Vision and the writer can read.
  static func bgraBuffer(width: Int, height: Int) throws -> CVPixelBuffer {
    let attrs: [String: Any] = [
      kCVPixelBufferCGImageCompatibilityKey as String: true,
      kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
      kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
    ]
    var made: CVPixelBuffer? = nil
    guard CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &made) == kCVReturnSuccess,
          let buffer = made else { throw CutoutError.failed("cutout render: no picture buffer") }
    return buffer
  }

  /// The share of the picture a one-channel 8-bit mask covers (0 … 1), from every fourth pixel of every fourth row
  /// (a few ten thousand bytes, on the first kept frame and every `personEvery`-th: the one loop over pixels here).
  /// A mask in another format cannot be read here and counts as covered (the render is not refused for it).
  static func coverage(of mask: CVPixelBuffer) -> Double {
    guard CVPixelBufferGetPixelFormatType(mask) == kCVPixelFormatType_OneComponent8 else { return 1 }
    CVPixelBufferLockBaseAddress(mask, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(mask, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(mask) else { return 1 }
    let width = CVPixelBufferGetWidth(mask)
    let height = CVPixelBufferGetHeight(mask)
    let row = CVPixelBufferGetBytesPerRow(mask)
    guard width > 0, height > 0, row >= width else { return 1 }
    let bytes: UnsafeMutablePointer<UInt8> = base.assumingMemoryBound(to: UInt8.self)
    var sum = 0
    var counted = 0
    var y = 0
    while y < height {
      let line: UnsafeMutablePointer<UInt8> = bytes + y * row
      var x = 0
      while x < width {
        sum += Int(line[x])
        counted += 1
        x += 4
      }
      y += 4
    }
    return counted > 0 ? Double(sum) / Double(counted) / 255 : 1
  }

  /// `picture` (filling `rect`) kept where the mask is white and see-through where it is black; the mask is
  /// stretched to the picture's size first (its edge pixels repeated outwards, so the rim is not faded). The RED
  /// mask blend is used because a one-channel buffer is a red-only image to Core Image. A missing filter is an
  /// error, never a copy that still has its background.
  static func cut(_ picture: CIImage, mask: CVPixelBuffer, rect: CGRect) throws -> CIImage {
    let raw = CIImage(cvPixelBuffer: mask)
    guard raw.extent.width > 0, raw.extent.height > 0, rect.width > 0, rect.height > 0 else {
      throw CutoutError.failed("cutout people: the mask is empty")
    }
    let stretch = CGAffineTransform(scaleX: rect.width / raw.extent.width, y: rect.height / raw.extent.height)
    let stretched = raw.clampedToExtent().transformed(by: stretch).cropped(to: rect)
    guard let blend = CIFilter(name: "CIBlendWithRedMask") else {
      throw CutoutError.failed("cutout render: this iPhone has no mask filter")
    }
    blend.setValue(picture.cropped(to: rect), forKey: kCIInputImageKey)
    blend.setValue(CIImage(color: CIColor.clear).cropped(to: rect), forKey: kCIInputBackgroundImageKey)
    blend.setValue(stretched, forKey: kCIInputMaskImageKey)
    guard let output = blend.outputImage else {
      throw CutoutError.failed("cutout render: the mask filter gave no picture")
    }
    return output.cropped(to: rect)
  }

  /// HEVC-with-alpha settings the writer says it can apply: with the see-through layer's quality when it takes that
  /// key, without it otherwise. (Settings a writer cannot apply raise an Objective-C exception when they are used,
  /// which Swift cannot catch: they are asked about first.)
  static func videoSettings(width: Int, height: Int, bitsPerPixel: Double, alphaQuality: Double, writer: AVAssetWriter) throws -> [String: Any] {
    let perPixel = bitsPerPixel.isFinite && bitsPerPixel > 0 ? min(bitsPerPixel, 1) : 0.1
    let bitRate = Int(min(100_000_000, max(1_000_000, Double(width * height) * 30 * perPixel)))
    let quality = alphaQuality.isFinite ? min(1, max(0, alphaQuality)) : 0.75
    let plain: [String: Any] = [AVVideoAverageBitRateKey: bitRate]
    var fine: [String: Any] = plain
    fine[kVTCompressionPropertyKey_TargetQualityForAlpha as String] = quality
    let choices: [[String: Any]] = [fine, plain]
    for compression in choices {
      let settings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.hevcWithAlpha,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: compression,
      ]
      if writer.canApply(outputSettings: settings, forMediaType: .video) {
        return settings
      }
    }
    throw CutoutError.failed("cutout writer: this iPhone cannot write video with a see-through background")
  }

  /// A QuickTime writer with one picture input that takes BGRA buffers. Not started.
  static func makeWriter(_ url: URL, width: Int, height: Int, request: CutoutRequest)
    throws -> (AVAssetWriter, AVAssetWriterInput, AVAssetWriterInputPixelBufferAdaptor) {
    try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? FileManager.default.removeItem(at: url)
    let writer: AVAssetWriter
    do {
      writer = try AVAssetWriter(outputURL: url, fileType: .mov)
    } catch {
      throw CutoutError.failed("cutout writer: " + ExportSession.describe(error))
    }
    let settings = try videoSettings(width: width, height: height, bitsPerPixel: request.bitsPerPixel, alphaQuality: request.alphaQuality, writer: writer)
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
      throw CutoutError.failed("cutout writer: this iPhone cannot write video with a see-through background")
    }
    writer.add(input)
    return (writer, input, adaptor)
  }

  /// One frame: made upright at the copy's size, its people found, everything else made see-through, rendered into
  /// a buffer from the writer's pool. Returns that buffer and the mask (for the coverage check).
  static func cutFrame(_ frame: CVPixelBuffer, upright: CGAffineTransform, rect: CGRect, straight: CVPixelBuffer,
                       segmentation: VNGeneratePersonSegmentationRequest, sequence: VNSequenceRequestHandler,
                       pool: CVPixelBufferPool, space: CGColorSpace) throws -> (picture: CVPixelBuffer, mask: CVPixelBuffer) {
    let placed = CIImage(cvPixelBuffer: frame).transformed(by: upright).cropped(to: rect)
    context.render(placed, to: straight, bounds: rect, colorSpace: space)
    do {
      try sequence.perform([segmentation], on: straight)
    } catch {
      throw CutoutError.failed("cutout people: " + ExportSession.describe(error))
    }
    guard let mask = segmentation.results?.first?.pixelBuffer else { throw CutoutError.failed("cutout people: no mask came back") }
    var made: CVPixelBuffer? = nil
    guard CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &made) == kCVReturnSuccess, let out = made else {
      throw CutoutError.failed("cutout writer: no picture buffer")
    }
    // `straight` is read back as what it was written as (it carries no colour tag of its own).
    let upImage = CIImage(cvPixelBuffer: straight, options: [CIImageOption.colorSpace: space])
    let image = try cut(upImage, mask: mask, rect: rect)
    // Every pixel of `rect` is drawn (see-through ones too), so nothing of the pool buffer's last use is left.
    context.render(image, to: out, bounds: rect, colorSpace: space)
    tag(out)
    return (out, mask)
  }

  /// A video's cut-out copy. Frames of the asked range are read, cut and written at their OWN source times into a
  /// session that starts at zero, so the copy has the source's timeline (an empty stretch before its first frame);
  /// a frame closer than `minFrameGap` to the last kept one is left out, and the last kept frame lasts until the
  /// range's end. The source's sound packets are copied beside the picture as they are, at their own times. The
  /// loop serves whichever input is ready and sleeps when neither is.
  static func renderVideo(_ request: CutoutRequest, source: CutoutSource, to outputURL: URL, job: CutoutJob,
                          progress: (Double) -> Void) async throws -> [String: Any] {
    let start = max(0, min(request.from.isFinite ? request.from : 0, source.seconds))
    let end = min(source.seconds, request.to.isFinite && request.to > start ? request.to : source.seconds)
    guard end - start > 0 else { throw CutoutError.failed("cutout source: nothing to render") }
    let range = CMTimeRange(start: ExportSession.time(start), end: ExportSession.time(end))

    let shown = source.naturalSize.applying(source.preferredTransform)
    let fullWidth = Double(abs(shown.width))
    let fullHeight = Double(abs(shown.height))
    guard fullWidth.isFinite, fullHeight.isFinite, fullWidth >= 1, fullHeight >= 1 else {
      throw CutoutError.failed("cutout source: this file has no picture")
    }
    let size = evenSize(width: fullWidth, height: fullHeight, maxSide: request.maxSide)
    let rect = CGRect(x: 0, y: 0, width: size.width, height: size.height)
    let scale = CGAffineTransform(scaleX: CGFloat(size.width) / CGFloat(fullWidth), y: CGFloat(size.height) / CGFloat(fullHeight))
    let upright = ExportSession.ciOrientTransform(preferredTransform: source.preferredTransform, naturalSize: source.naturalSize).concatenating(scale)

    let reader: AVAssetReader
    do {
      reader = try AVAssetReader(asset: source.asset)
    } catch {
      throw CutoutError.failed("cutout reader: " + ExportSession.describe(error))
    }
    let pictures = AVAssetReaderTrackOutput(track: source.video, outputSettings: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
    ])
    pictures.alwaysCopiesSampleData = false
    guard reader.canAdd(pictures) else { throw CutoutError.failed("cutout reader: this picture cannot be decoded") }
    reader.add(pictures)
    var sounds: AVAssetReaderTrackOutput? = nil
    if let audio = source.audio {
      let stored = AVAssetReaderTrackOutput(track: audio, outputSettings: nil)
      stored.alwaysCopiesSampleData = false
      guard reader.canAdd(stored) else { throw CutoutError.failed("cutout sound: this clip's sound cannot be copied") }
      reader.add(stored)
      sounds = stored
    }
    reader.timeRange = range

    let segmentation = VNGeneratePersonSegmentationRequest()
    segmentation.qualityLevel = .balanced
    segmentation.outputPixelFormat = kCVPixelFormatType_OneComponent8
    let sequence = VNSequenceRequestHandler()
    let straight = try bgraBuffer(width: size.width, height: size.height)
    let space = videoSpace()
    let gap = request.minFrameGap.isFinite && request.minFrameGap > 0 ? request.minFrameGap : 0
    let needed = request.minPerson.isFinite ? request.minPerson : 0

    let partURL = partFile(for: outputURL)
    let (writer, pictureInput, adaptor) = try makeWriter(partURL, width: size.width, height: size.height, request: request)
    var soundInput: AVAssetWriterInput? = nil
    if sounds != nil {
      let input = AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint: source.audioHint)
      input.expectsMediaDataInRealTime = false
      guard writer.canAdd(input) else { throw CutoutError.failed("cutout sound: this clip's sound cannot be copied") }
      writer.add(input)
      soundInput = input
    }

    var kept = 0
    var lastKept = -Double.infinity
    var person = 0.0
    var picturesDone = false
    var soundsDone = soundInput == nil
    do {
      if job.isCancelled { throw CutoutError.cancelled }
      guard reader.startReading() else { throw CutoutError.failed("cutout reader: " + ExportSession.describe(reader.error)) }
      guard writer.startWriting() else { throw CutoutError.failed("cutout writer: " + ExportSession.describe(writer.error)) }
      writer.startSession(atSourceTime: .zero)
      guard let pool = adaptor.pixelBufferPool else { throw CutoutError.failed("cutout writer: no picture buffer") }
      while !picturesDone || !soundsDone {
        if job.isCancelled { throw CutoutError.cancelled }
        guard writer.status == .writing else { throw CutoutError.failed("cutout writer: " + ExportSession.describe(writer.error)) }
        var worked = false
        if !picturesDone, pictureInput.isReadyForMoreMediaData {
          worked = true
          if let sample = pictures.copyNextSampleBuffer() {
            let pts = CMSampleBufferGetPresentationTimeStamp(sample)
            let at = pts.seconds
            if at.isFinite, at >= start - 0.0005, at > lastKept, at - lastKept >= gap, let frame = CMSampleBufferGetImageBuffer(sample) {
              let measure = kept % CutoutRender.personEvery == 0
              let share: Double = try autoreleasepool { () throws -> Double in
                let done = try cutFrame(frame, upright: upright, rect: rect, straight: straight, segmentation: segmentation,
                                        sequence: sequence, pool: pool, space: space)
                guard adaptor.append(done.picture, withPresentationTime: pts) else {
                  throw CutoutError.failed("cutout writer: " + ExportSession.describe(writer.error))
                }
                return measure ? coverage(of: done.mask) : -1
              }
              if share > person { person = share }
              kept += 1
              lastKept = at
              progress(min(1, max(0, (at - start) / (end - start))))
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
              guard soundInput.append(packet) else { throw CutoutError.failed("cutout sound: " + ExportSession.describe(writer.error)) }
            }
          } else {
            soundsDone = true
            soundInput.markAsFinished()
          }
        }
        if !worked { try await Task.sleep(nanoseconds: 2_000_000) }
      }
      guard reader.status == .completed else { throw CutoutError.failed("cutout reader: " + ExportSession.describe(reader.error)) }
      guard kept > 0 else { throw CutoutError.failed("cutout render: no picture came out") }
      guard person >= needed else { throw CutoutError.failed("cutout person: no person found") }
      if job.isCancelled { throw CutoutError.cancelled }
      // The last append can fail the writer after the loop's own check: never end a session on a writer that is not writing.
      guard writer.status == .writing else { throw CutoutError.failed("cutout writer: " + ExportSession.describe(writer.error)) }
      writer.endSession(atSourceTime: range.end)
      await writer.finishWriting()
      guard writer.status == .completed else { throw CutoutError.failed("cutout writer: " + ExportSession.describe(writer.error)) }
      try place(partURL, at: outputURL)
    } catch {
      if reader.status == .reading { reader.cancelReading() }
      if writer.status == .writing { writer.cancelWriting() }
      try? FileManager.default.removeItem(at: partURL)
      throw error
    }
    progress(1)
    let answer: [String: Any] = ["fileUri": outputURL.absoluteString, "seconds": end, "frames": kept, "person": person]
    return answer
  }

  /// A photo's cut-out copy: decoded upright (EXIF applied) at the cap, its people found once at the best quality,
  /// then two files — a still movie with a see-through background (two frames, `stillSeconds` long: what the export
  /// plays) and, LAST, the PNG (what the preview draws; its presence is what "ready" means).
  static func renderPhoto(_ request: CutoutRequest, to outputURL: URL, job: CutoutJob) async throws -> [String: Any] {
    guard let url = ExportSession.fileURL(from: request.sourceUri) else { throw CutoutError.failed("cutout source: not a file path") }
    guard let stillURL = ExportSession.fileURL(from: request.stillPath) else { throw CutoutError.failed("cutout output: not a file path") }
    guard let imageSource = CGImageSourceCreateWithURL(url as CFURL, nil) else { throw CutoutError.failed("cutout source: this picture cannot be read") }
    let cap = request.maxSide.isFinite && request.maxSide >= 2 ? Int(min(request.maxSide, largestSide)) : 2560
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: cap,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(imageSource, 0, options as CFDictionary), image.width > 0, image.height > 0 else {
      throw CutoutError.failed("cutout source: this picture cannot be read")
    }
    if job.isCancelled { throw CutoutError.cancelled }

    let segmentation = VNGeneratePersonSegmentationRequest()
    segmentation.qualityLevel = .accurate
    segmentation.outputPixelFormat = kCVPixelFormatType_OneComponent8
    do {
      try VNImageRequestHandler(cgImage: image, options: [:]).perform([segmentation])
    } catch {
      throw CutoutError.failed("cutout people: " + ExportSession.describe(error))
    }
    guard let mask = segmentation.results?.first?.pixelBuffer else { throw CutoutError.failed("cutout people: no mask came back") }
    let person = coverage(of: mask)
    let needed = request.minPerson.isFinite ? request.minPerson : 0
    guard person >= needed else { throw CutoutError.failed("cutout person: no person found") }
    if job.isCancelled { throw CutoutError.cancelled }

    let full = CGRect(x: 0, y: 0, width: image.width, height: image.height)
    let cutImage = try cut(CIImage(cgImage: image), mask: mask, rect: full)

    // 1. The still movie.
    let size = evenSize(width: Double(image.width), height: Double(image.height), maxSide: request.maxSide)
    let rect = CGRect(x: 0, y: 0, width: size.width, height: size.height)
    let fitted = cutImage.transformed(by: CGAffineTransform(scaleX: CGFloat(size.width) / CGFloat(image.width),
                                                            y: CGFloat(size.height) / CGFloat(image.height))).cropped(to: rect)
    let still = try bgraBuffer(width: size.width, height: size.height)
    // Drawn over clear, so every pixel of the new buffer is written.
    context.render(fitted.composited(over: CIImage(color: CIColor.clear).cropped(to: rect)), to: still, bounds: rect, colorSpace: videoSpace())
    tag(still)
    let seconds = request.stillSeconds.isFinite && request.stillSeconds >= 1 ? min(request.stillSeconds, 3600) : 60
    let total = ExportSession.time(seconds)
    let stillPart = partFile(for: stillURL)
    let (writer, input, adaptor) = try makeWriter(stillPart, width: size.width, height: size.height, request: request)
    do {
      guard writer.startWriting() else { throw CutoutError.failed("cutout writer: " + ExportSession.describe(writer.error)) }
      writer.startSession(atSourceTime: .zero)
      let times: [CMTime] = [.zero, total - CMTime(value: 1, timescale: 30)]
      for time in times {
        while !input.isReadyForMoreMediaData {
          if job.isCancelled { throw CutoutError.cancelled }
          guard writer.status == .writing else { throw CutoutError.failed("cutout writer: " + ExportSession.describe(writer.error)) }
          try await Task.sleep(nanoseconds: 2_000_000)
        }
        if job.isCancelled { throw CutoutError.cancelled }
        guard adaptor.append(still, withPresentationTime: time) else {
          throw CutoutError.failed("cutout writer: " + ExportSession.describe(writer.error))
        }
      }
      guard writer.status == .writing else { throw CutoutError.failed("cutout writer: " + ExportSession.describe(writer.error)) }
      input.markAsFinished()
      writer.endSession(atSourceTime: total)
      await writer.finishWriting()
      guard writer.status == .completed else { throw CutoutError.failed("cutout writer: " + ExportSession.describe(writer.error)) }
      try place(stillPart, at: stillURL)
    } catch {
      if writer.status == .writing { writer.cancelWriting() }
      try? FileManager.default.removeItem(at: stillPart)
      throw error
    }

    // 2. The PNG, last.
    guard let png = context.createCGImage(cutImage, from: full, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)) else {
      throw CutoutError.failed("cutout output: the picture could not be made")
    }
    let pngPart = partFile(for: outputURL)
    try? FileManager.default.createDirectory(at: pngPart.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? FileManager.default.removeItem(at: pngPart)
    guard let destination = CGImageDestinationCreateWithURL(pngPart as CFURL, UTType.png.identifier as CFString, 1, nil) else {
      throw CutoutError.failed("cutout output: the picture could not be written")
    }
    CGImageDestinationAddImage(destination, png, nil)
    guard CGImageDestinationFinalize(destination) else {
      try? FileManager.default.removeItem(at: pngPart)
      throw CutoutError.failed("cutout output: the picture could not be written")
    }
    try place(pngPart, at: outputURL)
    let answer: [String: Any] = ["fileUri": outputURL.absoluteString, "seconds": seconds, "frames": 1, "person": person]
    return answer
  }
}
