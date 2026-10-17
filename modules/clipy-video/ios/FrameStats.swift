import AVFoundation
import CoreGraphics
import ExpoModulesCore
import ImageIO

/// What the app asks to know about a clip's picture (`FrameStatsRequest` in modules/clipy-video/frameStats.ts): the file,
/// whether it is a video or a photo, the source seconds to look at (a photo has one picture: `times` is ignored) and the
/// longest side the frames are scaled to. Numbers are Doubles so that nothing the app can send fails to decode.
struct FrameStatsRequest: Record {
  @Field var jobId: String = ""
  @Field var uri: String = ""
  @Field var kind: String = ""
  @Field var times: [Double] = []
  @Field var maxSide: Double = 0
}

enum StatsError: Error, LocalizedError {
  case cancelled
  case failed(String)
  var errorDescription: String? {
    switch self {
    case .cancelled: return "Stats cancelled"
    case .failed(let text): return text
    }
  }
}

/// The cancel flag of one look, and the generator it uses (so a cancel also stops a frame being decoded). `cancel()` comes
/// from the JS thread; the reading checks the flag before and after every frame.
final class StatsJob: @unchecked Sendable {
  private let lock = NSLock()
  private var stopped = false                          // guarded by `lock`
  private var generator: AVAssetImageGenerator?        // guarded by `lock`

  func cancel() {
    lock.lock()
    stopped = true
    let running = generator
    lock.unlock()
    running?.cancelAllCGImageGeneration()
  }

  var isCancelled: Bool {
    lock.lock()
    defer { lock.unlock() }
    return stopped
  }

  /// Keeps the generator for a cancel. False when the job was already cancelled (nothing is then started).
  func attach(_ g: AVAssetImageGenerator) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if stopped { return false }
    generator = g
    return true
  }
}

/// Plain numbers about a few frames of a clip, for Auto enhance: per frame a 64-bin histogram of Rec. 709 luma on the
/// gamma-encoded sRGB values, the mean of each component and the mean chroma (max − min). It decides nothing: what to set
/// is TypeScript (src/editor/model/autoEnhance.ts). Each frame is drawn ONCE by Core Graphics into an 8-bit sRGB bitmap
/// (Core Graphics converts from the frame's own colour space) and counted in one plain loop — no Core Image, no GPU pass.
enum FrameStats {
  static let bins: Int = 64
  static let fewestSide: Int = 16
  static let mostSide: Int = 1024
  static let defaultSide: Int = 256
  /// Never draw more than this on a side, whatever the frame says (the readers are asked for at most `mostSide`).
  static let largestDrawn: Int = 4096
  static let mostTimes: Int = 10
  /// Seconds either side of an asked time the generator may take a frame from: the nearest decodable one is fine.
  static let tolerance: Double = 0.25
  /// A pixel less covered than this is not counted (a see-through picture's background is not part of its look).
  static let opaque: UInt8 = 128
  static let red: Double = 0.2126
  static let green: Double = 0.7152
  static let blue: Double = 0.0722

  /// What a failure says to the app: a StatsError's own staged text, anything else described in full.
  static func message(_ error: Error) -> String {
    if let own = error as? StatsError, let text = own.errorDescription { return text }
    return "stats reader: " + ExportSession.describe(error)
  }

  /// The longest side as a whole number in `fewestSide` … `mostSide`; not a number, or nothing asked, is the default.
  static func clampSide(_ asked: Double) -> Int {
    guard asked.isFinite, asked > 0 else { return defaultSide }
    let whole = asked.rounded()
    if whole <= Double(fewestSide) { return fewestSide }
    if whole >= Double(mostSide) { return mostSide }
    return Int(whole)
  }

  /// At most `mostTimes` asked times that are numbers, each inside the file (a little before its very end, where no frame
  /// may be); none left is the middle of the file.
  static func clampTimes(_ asked: [Double], length: Double) -> [Double] {
    let last = max(0, length - 0.05)
    var times: [Double] = []
    for t in asked.prefix(mostTimes) where t.isFinite { times.append(min(max(0, t), last)) }
    if times.isEmpty { times.append(last / 2) }
    return times
  }

  static func run(_ request: FrameStatsRequest, job: StatsJob) async throws -> [String: Any] {
    guard let url = ExportSession.fileURL(from: request.uri) else { throw StatsError.failed("stats source: not a file path") }
    let side = clampSide(request.maxSide)
    if request.kind == "photo" { return try photo(url, side: side, job: job) }
    guard request.kind == "video" else { throw StatsError.failed("stats source: unknown kind") }
    return try await video(url, times: request.times, side: side, job: job)
  }

  /// A photo: decoded upright (EXIF applied) at `side`, one frame at time 0.
  static func photo(_ url: URL, side: Int, job: StatsJob) throws -> [String: Any] {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { throw StatsError.failed("stats source: this picture cannot be read") }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: side,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
      throw StatsError.failed("stats source: this picture cannot be read")
    }
    if job.isCancelled { throw StatsError.cancelled }
    guard var frame = measure(image) else { throw StatsError.failed("stats measure: nothing in this picture could be counted") }
    frame["time"] = 0.0
    return ["frames": [frame], "failed": 0]
  }

  /// A video: one frame per asked time, upright and aspect-fitted in `side` × `side`, in order. A frame that cannot be
  /// read is counted and skipped; none at all is a failure. The asset is a local of this function, which does not return
  /// before the last frame has been read.
  static func video(_ url: URL, times asked: [Double], side: Int, job: StatsJob) async throws -> [String: Any] {
    let asset = AVURLAsset(url: url)
    let tracks: [AVAssetTrack]
    let length: CMTime
    do {
      tracks = try await asset.loadTracks(withMediaType: .video)
      length = try await asset.load(.duration)
    } catch {
      throw StatsError.failed("stats source: " + ExportSession.describe(error))
    }
    guard !tracks.isEmpty else { throw StatsError.failed("stats source: this file has no picture") }
    let total = length.seconds.isFinite ? length.seconds : 0
    guard total > 0 else { throw StatsError.failed("stats source: nothing to look at") }
    let times = clampTimes(asked, length: total)
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: side, height: side)
    let slack = ExportSession.time(tolerance)
    generator.requestedTimeToleranceBefore = slack
    generator.requestedTimeToleranceAfter = slack
    guard job.attach(generator) else { throw StatsError.cancelled }
    var frames: [[String: Any]] = []
    var failed = 0
    for t in times {
      if job.isCancelled { throw StatsError.cancelled }
      do {
        let (image, actual) = try await generator.image(at: ExportSession.time(t))
        if job.isCancelled { throw StatsError.cancelled }
        guard var frame = measure(image) else {
          failed += 1
          continue
        }
        frame["time"] = actual.seconds.isFinite ? actual.seconds : t
        frames.append(frame)
      } catch StatsError.cancelled {
        throw StatsError.cancelled
      } catch {
        if job.isCancelled { throw StatsError.cancelled }
        failed += 1
      }
    }
    guard !frames.isEmpty else { throw StatsError.failed("stats frames: no frame could be read") }
    return ["frames": frames, "failed": failed]
  }

  /// Draws the frame once into an 8-bit RGBA bitmap in sRGB (premultiplied) and counts it. Nil when it cannot be drawn
  /// or has no pixel covered enough to count.
  static func measure(_ image: CGImage) -> [String: Any]? {
    let width = image.width
    let height = image.height
    guard width > 0, height > 0, width <= largestDrawn, height <= largestDrawn else { return nil }
    guard let space = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
    let rowBytes = width * 4
    var data = [UInt8](repeating: 0, count: rowBytes * height)
    let drawn: Bool = data.withUnsafeMutableBytes { (raw: UnsafeMutableRawBufferPointer) -> Bool in
      guard let base = raw.baseAddress,
            let context = CGContext(data: base, width: width, height: height, bitsPerComponent: 8, bytesPerRow: rowBytes,
                                    space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
      context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
      return true
    }
    guard drawn else { return nil }
    return count(data, pixels: width * height)
  }

  /// The numbers of one bitmap of `pixels` RGBA pixels (premultiplied, 8 bits): a component is `value / alpha`, so 0 … 1
  /// gamma-encoded; a pixel with alpha under `opaque` is left out.
  static func count(_ data: [UInt8], pixels: Int) -> [String: Any]? {
    guard pixels > 0, data.count >= pixels * 4 else { return nil }
    var histogram = [Int](repeating: 0, count: bins)
    var sumR = 0.0
    var sumG = 0.0
    var sumB = 0.0
    var sumChroma = 0.0
    var counted = 0
    for i in 0..<pixels {
      let o = i * 4
      let a = data[o + 3]
      if a < opaque { continue }
      let cover = Double(a)
      let r = min(1, Double(data[o]) / cover)
      let g = min(1, Double(data[o + 1]) / cover)
      let b = min(1, Double(data[o + 2]) / cover)
      let luma = red * r + green * g + blue * b
      let bin = min(bins - 1, max(0, Int(luma * Double(bins))))
      histogram[bin] += 1
      sumR += r
      sumG += g
      sumB += b
      sumChroma += max(r, g, b) - min(r, g, b)
      counted += 1
    }
    guard counted > 0 else { return nil }
    let n = Double(counted)
    let answer: [String: Any] = ["histogram": histogram, "r": sumR / n, "g": sumG / n, "b": sumB / n, "saturation": sumChroma / n, "pixels": counted]
    return answer
  }
}
