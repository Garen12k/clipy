import Accelerate
import AudioToolbox
import AVFoundation
import ExpoModulesCore

/// One waveform for a timeline bar (`SoundPeaksRequest` in modules/clipy-video/index.ts): the seconds of the file to
/// look at and how many values to answer with. `to` at or before `from` means to the end of the file. `count` is a
/// Double so that no number the app can send fails to decode; it is clamped to `SoundPeaks.fewest` … `most`.
struct SoundPeaksRequest: Record {
  @Field var jobId: String = ""
  @Field var uri: String = ""
  @Field var from: Double = 0
  @Field var to: Double = 0
  @Field var count: Double = 0
}

enum PeaksError: Error, LocalizedError {
  case cancelled
  case failed(String)
  var errorDescription: String? {
    switch self {
    case .cancelled: return "Peaks cancelled"
    case .failed(let text): return text
    }
  }
}

/// The cancel flag of one waveform. `cancel()` comes from the JS thread, the decode loop reads it on its own thread
/// before every buffer.
final class PeaksJob: @unchecked Sendable {
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

/// Plain memory for the samples of one buffer, grown when a buffer is larger than any before it and freed with the
/// object. (A development build is not optimised: an Array element costs many times more there than this does, and
/// Accelerate wants pointers anyway.) One thread uses it, from start to end.
final class PeaksMemory {
  private var memory: UnsafeMutablePointer<Float>
  private var capacity: Int

  init() {
    let first = UnsafeMutablePointer<Float>.allocate(capacity: 1)
    first.initialize(repeating: 0, count: 1)
    self.memory = first
    self.capacity = 1
  }

  deinit {
    memory.deallocate()
  }

  /// Room for at least `count` values (their contents are whatever was there, or zeros when the room is new).
  func room(_ count: Int) -> UnsafeMutablePointer<Float> {
    if count > capacity {
      memory.deallocate()
      let grown = UnsafeMutablePointer<Float>.allocate(capacity: count)
      grown.initialize(repeating: 0, count: count)
      memory = grown
      capacity = count
    }
    return memory
  }
}

/// The loudness outline of a sound file, for drawing a waveform: the asked stretch is cut into `count` equal slices
/// and each value is the largest |sample| of the mono mix inside its slice, 0 … 1. Nothing here decides how it is
/// drawn. There is no TypeScript twin: the numbers are only ever looked at.
enum SoundPeaks {
  /// The fewest and the most values one answer holds, whatever the request says.
  static let fewest: Int = 16
  static let most: Int = 2000
  /// The rate the sound is decoded at.
  static let decodeRate: Double = 44_100
  /// Never look at more than this many seconds, whatever the request says (four hours): it also keeps every sample
  /// count far inside what an Int holds.
  static let longestSeconds: Double = 14_400
  /// The rates a decoded buffer may say it has. The reader is asked for `decodeRate`; a buffer outside these is
  /// refused before its rate is used in a sample count.
  static let lowestRate: Double = 8_000
  static let highestRate: Double = 192_000

  /// What a failure says to the app: a PeaksError's own staged text, anything else described in full.
  static func message(_ error: Error) -> String {
    if let own = error as? PeaksError, let text = own.errorDescription { return text }
    return "peaks reader: " + ExportSession.describe(error)
  }

  /// The asked number of values as a whole number in `fewest` … `most`. A number that is not one (NaN, infinite)
  /// is the fewest: it is compared before it is turned into an Int, so the conversion cannot stop the app.
  static func clampCount(_ asked: Double) -> Int {
    guard asked.isFinite else { return fewest }
    let whole = asked.rounded()
    if whole <= Double(fewest) { return fewest }
    if whole >= Double(most) { return most }
    return Int(whole)
  }

  /// The slice the mono sample number `at` (counted from the start of the stretch) falls in, when the whole stretch
  /// is `total` samples cut into `count` slices. Anything at or past the end, and anything that is not a number,
  /// is the last slice.
  static func slice(of at: Int, total: Double, count: Int) -> Int {
    let last = count - 1
    guard total > 0 else { return last }
    let raw = Double(at) * Double(count) / total
    guard raw.isFinite, raw >= 0 else { return last }
    if raw >= Double(last) { return last }
    return Int(raw)
  }

  /// The number of the first sample that belongs to slice `slice` (the end of the slice before it).
  static func firstSample(ofSlice slice: Int, total: Double, count: Int) -> Int {
    let raw = (Double(slice) * total / Double(count)).rounded(.up)
    guard raw.isFinite, raw >= 0, raw < 9.0e15 else { return Int.max / 2 }
    return Int(raw)
  }

  /// The mono mix of `frames` interleaved frames of `width` channels: the mean of the channels. One channel is
  /// already mono and is handed back as it is; two (what the reader is asked for) are averaged by Accelerate into
  /// `mono`; any other number takes the plain loop.
  static func mixDown(_ interleaved: UnsafeMutablePointer<Float>, width: Int, frames: Int, mono: UnsafeMutablePointer<Float>) -> UnsafeMutablePointer<Float> {
    if width == 1 { return interleaved }
    if width == 2 {
      var half: Float = 0.5
      vDSP_vasm(UnsafePointer<Float>(interleaved), 2, UnsafePointer<Float>(interleaved + 1), 2, &half, mono, 1, vDSP_Length(frames))
      return mono
    }
    for f in 0..<frames {
      var sum: Float = 0
      for c in 0..<width { sum += interleaved[f * width + c] }
      mono[f] = sum / Float(width)
    }
    return mono
  }

  /// Opens the file (an audio OR a video file), finds its first sound track and reads the asked stretch. The asset
  /// is a local of this function, which does not return before `decode` has (a track's `asset` is a weak reference).
  static func run(_ request: SoundPeaksRequest, job: PeaksJob) async throws -> [String: Any] {
    guard let url = ExportSession.fileURL(from: request.uri) else { throw PeaksError.failed("peaks source: not a file path") }
    let asset = AVURLAsset(url: url)
    let tracks: [AVAssetTrack]
    let length: CMTime
    do {
      tracks = try await asset.loadTracks(withMediaType: .audio)
      length = try await asset.load(.duration)
    } catch {
      throw PeaksError.failed("peaks source: " + ExportSession.describe(error))
    }
    guard let track = tracks.first else { throw PeaksError.failed("peaks source: this file has no sound") }
    let total = length.seconds.isFinite ? length.seconds : 0
    let start = max(0, min(request.from.isFinite ? request.from : 0, total))
    let asked = request.to.isFinite && request.to > start ? request.to : total
    let end = min(total, asked, start + longestSeconds)
    guard end - start > 0 else { throw PeaksError.failed("peaks source: nothing to look at") }
    return try decode(asset: asset, track: track, start: start, end: end, count: clampCount(request.count), job: job)
  }

  /// Reads `start` … `end` of the track the way BeatEnvelope does — a mix output of the one track, 44.1 kHz stereo
  /// 32-bit float, interleaved, one buffer at a time in its own pool — mixes each buffer to mono and keeps, per
  /// slice, the largest magnitude Accelerate finds (`vDSP_maxmgv`, one call per slice a buffer touches: no Swift
  /// loop over the samples). Each buffer says what it holds and is refused when that is not what was asked for.
  /// Synchronous; the cancel flag is read before every buffer.
  /// Sound that begins later than `start` (a track that starts after its file does) is led in with silence, and a
  /// slice no sample reached stays 0, so value i is always the stretch from start + i × (end − start) / count.
  static func decode(asset: AVURLAsset, track: AVAssetTrack, start: Double, end: Double, count: Int, job: PeaksJob) throws -> [String: Any] {
    let reader: AVAssetReader
    do {
      reader = try AVAssetReader(asset: asset)
    } catch {
      throw PeaksError.failed("peaks reader: " + ExportSession.describe(error))
    }
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: SoundPeaks.decodeRate, AVNumberOfChannelsKey: 2,
      AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true, AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false,
    ]
    let output = AVAssetReaderAudioMixOutput(audioTracks: [track], audioSettings: settings)
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else { throw PeaksError.failed("peaks reader: this sound cannot be decoded") }
    reader.add(output)
    reader.timeRange = CMTimeRange(start: ExportSession.time(start), end: ExportSession.time(end))
    guard reader.startReading() else { throw PeaksError.failed("peaks reader: " + ExportSession.describe(reader.error)) }
    defer { if reader.status == .reading { reader.cancelReading() } }

    let slices = max(1, count)
    var tops = [Float](repeating: 0, count: slices)
    let interleavedMemory = PeaksMemory()
    let monoMemory = PeaksMemory()
    var rate: Double = 0             // 0 until the first buffer has said its rate
    var channels = 0
    var total: Double = 0            // the samples the whole stretch holds at `rate`
    var position = 0                 // mono samples taken so far, counted from `start`
    var isFirstSample = true
    var ended = false
    while !ended {
      if job.isCancelled { throw PeaksError.cancelled }
      // One buffer in its own pool, so a long file never piles up what AVFoundation autoreleases.
      try autoreleasepool { () throws -> Void in
        guard let sample = output.copyNextSampleBuffer() else {
          ended = true
          return
        }
        guard let format = CMSampleBufferGetFormatDescription(sample),
              let basic = CMAudioFormatDescriptionGetStreamBasicDescription(format)?.pointee,
              let block = CMSampleBufferGetDataBuffer(sample) else { return }
        guard basic.mFormatID == kAudioFormatLinearPCM, basic.mBitsPerChannel == 32,
              (basic.mFormatFlags & kAudioFormatFlagIsFloat) != 0,
              basic.mSampleRate >= SoundPeaks.lowestRate, basic.mSampleRate <= SoundPeaks.highestRate,
              basic.mChannelsPerFrame > 0, basic.mChannelsPerFrame <= 64 else {
          throw PeaksError.failed("peaks reader: unexpected sound format")
        }
        if rate == 0 {
          rate = basic.mSampleRate
          channels = Int(basic.mChannelsPerFrame)
          total = (end - start) * rate
        } else {
          guard rate == basic.mSampleRate, channels == Int(basic.mChannelsPerFrame) else {
            throw PeaksError.failed("peaks reader: unexpected sound format")
          }
        }
        if isFirstSample {
          isFirstSample = false
          let lead = CMSampleBufferGetPresentationTimeStamp(sample).seconds - start
          if lead.isFinite, lead > 0.001, lead < end - start {
            position = Int((lead * rate).rounded())
          }
        }
        let width = channels
        let floats = CMBlockBufferGetDataLength(block) / MemoryLayout<Float>.size
        let frames = floats / width
        if frames == 0 { return }
        let interleaved: UnsafeMutablePointer<Float> = interleavedMemory.room(floats)
        let status: OSStatus = CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: floats * MemoryLayout<Float>.size, destination: UnsafeMutableRawPointer(interleaved))
        guard status == kCMBlockBufferNoErr else { throw PeaksError.failed("peaks reader: could not read the sound (\(status))") }
        let mono: UnsafeMutablePointer<Float> = SoundPeaks.mixDown(interleaved, width: width, frames: frames, mono: monoMemory.room(frames))
        var offset = 0
        while offset < frames {
          let at = position + offset
          let slice = SoundPeaks.slice(of: at, total: total, count: slices)
          let left = frames - offset
          var take = left
          if slice < slices - 1 {
            let next = SoundPeaks.firstSample(ofSlice: slice + 1, total: total, count: slices)
            take = min(left, max(1, next - at))
          }
          var top: Float = 0
          vDSP_maxmgv(UnsafePointer<Float>(mono + offset), 1, &top, vDSP_Length(take))
          if top.isFinite, top > tops[slice] { tops[slice] = top }
          offset += take
        }
        position += frames
      }
    }
    guard reader.status == .completed else { throw PeaksError.failed("peaks reader: " + ExportSession.describe(reader.error)) }
    guard rate > 0, position > 0 else { throw PeaksError.failed("peaks reader: no sound came out") }
    var peaks: [Double] = []
    peaks.reserveCapacity(slices)
    for top in tops {
      let value: Float = top.isFinite ? min(Float(1), max(Float(0), top)) : 0
      peaks.append(Double(value))
    }
    let answer: [String: Any] = ["peaks": peaks, "from": start, "to": end]
    return answer
  }
}
