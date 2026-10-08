import AudioToolbox
import AVFoundation
import ExpoModulesCore

/// One Find beats for a file of the owner's (`BeatEnvelopeRequest` in modules/clipy-video/index.ts): the seconds of the
/// file to listen to. `to` at or before `from` means to the end of the file.
struct BeatEnvelopeRequest: Record {
  @Field var jobId: String = ""
  @Field var sourceUri: String = ""
  @Field var from: Double = 0
  @Field var to: Double = 0
}

enum BeatError: Error, LocalizedError {
  case cancelled
  case failed(String)
  var errorDescription: String? {
    switch self {
    case .cancelled: return "Beats cancelled"
    case .failed(let text): return text
    }
  }
}

/// The cancel flag of one listening. `cancel()` comes from the JS thread, the decode loop reads it on its own thread
/// before every buffer.
final class BeatJob: @unchecked Sendable {
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

/// The onset envelope of a mono signal, one sample at a time — the mirror of `onsetEnvelope` in
/// src/editor/model/beatDetect.ts (keep the two identical: constants, formulas, vectors). It keeps only the last
/// `size` samples (a ring), so memory does not grow with the file; frame f is the window that ENDS at sample
/// (f + 1) * hop, zero before the start. Like the TypeScript, the samples are Float32 values and everything after
/// them is worked out in Double.
/// The working buffers are plain memory owned by the builder (made in `init`, freed in `deinit`): a development
/// build is not optimised, and an Array element costs many times more there than these do — a frame is a thousand
/// samples through ten passes, a hundred times a second of music. One thread uses a builder, from start to end.
/// `sampleRate` must be a real rate (the caller checks 8 000 … 192 000): `Int(_:)` of a rate that is not a number stops the app.
final class EnvelopeBuilder {
  let sampleRate: Double
  let hop: Int
  let size: Int
  private let hann: UnsafeMutablePointer<Double>   // `size` values
  private let ring: UnsafeMutablePointer<Double>   // `size` values: the last `size` samples
  private var at = 0                               // where the next sample goes = the oldest sample in the ring
  private let re: UnsafeMutablePointer<Double>     // `size` values
  private let im: UnsafeMutablePointer<Double>     // `size` values
  private var prev: UnsafeMutablePointer<Double>   // `size / 2` values
  private var cur: UnsafeMutablePointer<Double>    // `size / 2` values
  private(set) var env: [Double] = []
  private(set) var count = 0                       // samples taken

  /// `n` zeros (at least one, so a length of 0 is still memory that can be freed).
  private static func zeros(_ n: Int) -> UnsafeMutablePointer<Double> {
    let length = max(1, n)
    let memory = UnsafeMutablePointer<Double>.allocate(capacity: length)
    memory.initialize(repeating: 0, count: length)
    return memory
  }

  /// Everything is worked out in locals first and stored last: no property of `self` is read before all are set.
  /// (`rounded()` is half away from zero and `Math.round` half up: the same for every positive number.)
  init(sampleRate: Double) {
    let hop = max(1, Int((sampleRate / BeatEnvelope.envelopeRate).rounded()))
    let size = BeatEnvelope.nextPow2(Int((sampleRate * BeatEnvelope.windowSeconds).rounded(.up)))
    let hann = EnvelopeBuilder.zeros(size)
    for i in 0..<size {
      hann[i] = 0.5 - 0.5 * cos(2 * Double.pi * Double(i) / Double(size - 1))
    }
    self.sampleRate = sampleRate
    self.hop = hop
    self.size = size
    self.hann = hann
    self.ring = EnvelopeBuilder.zeros(size)
    self.re = EnvelopeBuilder.zeros(size)
    self.im = EnvelopeBuilder.zeros(size)
    self.prev = EnvelopeBuilder.zeros(size / 2)
    self.cur = EnvelopeBuilder.zeros(size / 2)
  }

  deinit {
    hann.deallocate()
    ring.deallocate()
    re.deallocate()
    im.deallocate()
    prev.deallocate()
    cur.deallocate()
  }

  /// Values per second of sound.
  var rate: Double { sampleRate / Double(hop) }

  func push(_ sample: Double) {
    ring[at] = sample
    at = (at + 1) % size
    count += 1
    if count % hop == 0 { frame() }
  }

  /// One value: the sum over frequency of the RISE in log-compressed magnitude since the previous frame.
  private func frame() {
    let size = self.size
    let oldest = self.at
    let ring = self.ring
    let hann = self.hann
    let re = self.re
    let im = self.im
    let prev = self.prev
    let cur = self.cur
    for i in 0..<size {
      re[i] = ring[(oldest + i) % size] * hann[i]
      im[i] = 0
    }
    BeatEnvelope.fft(re, im, size)
    var flux = 0.0
    for k in 0..<(size / 2) {
      cur[k] = log(1 + BeatEnvelope.compress * hypot(re[k], im[k]) / Double(size))
      let d = cur[k] - prev[k]
      if d > 0 { flux += d }
    }
    env.append(env.isEmpty ? 0 : flux)
    self.prev = cur
    self.cur = prev
  }
}

/// Find beats, the native part: the file's sound decoded to float PCM and turned into the onset envelope. Everything
/// that decides a tempo is TypeScript (src/editor/ownBeats.ts).
enum BeatEnvelope {
  /// Onset-envelope values per second (the hop is the sample rate / this, rounded).
  static let envelopeRate: Double = 100
  /// Analysis window in seconds (rounded up to a power of two samples).
  static let windowSeconds: Double = 0.023
  /// Log compression of the magnitudes before the difference.
  static let compress: Double = 1000
  /// The rate the sound is decoded at: the one the bundled tracks were analysed at.
  static let decodeRate: Double = 44_100
  /// Never listen to more than this many seconds, whatever the request says.
  static let longestSeconds: Double = 600
  /// The rates a decoded buffer may say it has. The reader is asked for `decodeRate`; a buffer outside these is
  /// refused before its rate is turned into a whole number.
  static let lowestRate: Double = 8_000
  static let highestRate: Double = 192_000

  /// What a failure says to the app: a BeatError's own staged text, anything else described in full.
  static func message(_ error: Error) -> String {
    if let own = error as? BeatError, let text = own.errorDescription { return text }
    return "beats reader: " + ExportSession.describe(error)
  }

  static func nextPow2(_ n: Int) -> Int {
    var p = 1
    while p < n { p *= 2 }
    return p
  }

  /// In-place radix-2 FFT of the `n` values at `re` / `im` (`n` a power of two) — the transform of beatDetect.ts,
  /// line for line, so the two give the same numbers to within the last digits of `cos` / `sin` / `log` / `hypot`.
  /// (Not Accelerate: its packing and scaling are another convention, and nothing here can run it to check.)
  static func fft(_ re: UnsafeMutablePointer<Double>, _ im: UnsafeMutablePointer<Double>, _ n: Int) {
    var j = 0
    var i = 1
    while i < n {
      var bit = n >> 1
      while j & bit != 0 {
        j ^= bit
        bit >>= 1
      }
      j ^= bit
      if i < j {
        let tr = re[i]
        re[i] = re[j]
        re[j] = tr
        let ti = im[i]
        im[i] = im[j]
        im[j] = ti
      }
      i += 1
    }
    var len = 2
    while len <= n {
      let ang = -2 * Double.pi / Double(len)
      let wr = cos(ang)
      let wi = sin(ang)
      var first = 0
      while first < n {
        var cr = 1.0
        var ci = 0.0
        for k in 0..<(len / 2) {
          let a = first + k
          let b = a + len / 2
          let xr = re[b] * cr - im[b] * ci
          let xi = re[b] * ci + im[b] * cr
          re[b] = re[a] - xr
          im[b] = im[a] - xi
          re[a] += xr
          im[a] += xi
          let nr = cr * wr - ci * wi
          ci = cr * wi + ci * wr
          cr = nr
        }
        first += len
      }
      len *= 2
    }
  }

  /// Opens the file (an audio OR a video file), finds its first sound track and decodes the asked stretch. The
  /// asset is a local of this function, which does not return before `decode` has (a track's `asset` is a weak
  /// reference).
  static func run(_ request: BeatEnvelopeRequest, job: BeatJob) async throws -> [String: Any] {
    guard let url = ExportSession.fileURL(from: request.sourceUri) else { throw BeatError.failed("beats source: not a file path") }
    let asset = AVURLAsset(url: url)
    let tracks: [AVAssetTrack]
    let length: CMTime
    do {
      tracks = try await asset.loadTracks(withMediaType: .audio)
      length = try await asset.load(.duration)
    } catch {
      throw BeatError.failed("beats source: " + ExportSession.describe(error))
    }
    guard let track = tracks.first else { throw BeatError.failed("beats source: this file has no sound") }
    let total = length.seconds.isFinite ? length.seconds : 0
    let start = max(0, min(request.from.isFinite ? request.from : 0, total))
    let asked = request.to.isFinite && request.to > start ? request.to : total
    let end = min(total, asked, start + longestSeconds)
    guard end - start > 0 else { throw BeatError.failed("beats source: nothing to listen to") }
    return try decode(asset: asset, track: track, start: start, end: end, job: job)
  }

  /// Reads `start` … `end` of the track the way SoundRender reads a source — a mix output of the one track, 44.1 kHz
  /// stereo 32-bit float, interleaved, one buffer at a time in its own pool — averages the channels and builds the
  /// envelope. Each buffer says what it holds (linear PCM, float, rate, channels) and is refused when that is not
  /// what was asked for. Synchronous; the cancel flag is read before every buffer.
  /// The answer's `from` is `start`: sound that begins later than that (a track that starts after its file does)
  /// is led in with silence, so value i of the envelope is always the time start + i / rate.
  static func decode(asset: AVURLAsset, track: AVAssetTrack, start: Double, end: Double, job: BeatJob) throws -> [String: Any] {
    let reader: AVAssetReader
    do {
      reader = try AVAssetReader(asset: asset)
    } catch {
      throw BeatError.failed("beats reader: " + ExportSession.describe(error))
    }
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: BeatEnvelope.decodeRate, AVNumberOfChannelsKey: 2,
      AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true, AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false,
    ]
    let output = AVAssetReaderAudioMixOutput(audioTracks: [track], audioSettings: settings)
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else { throw BeatError.failed("beats reader: this sound cannot be decoded") }
    reader.add(output)
    reader.timeRange = CMTimeRange(start: ExportSession.time(start), end: ExportSession.time(end))
    guard reader.startReading() else { throw BeatError.failed("beats reader: " + ExportSession.describe(reader.error)) }
    defer { if reader.status == .reading { reader.cancelReading() } }

    var made: EnvelopeBuilder? = nil
    var channels = 0
    var scratch: [Float] = []
    var isFirstSample = true
    var ended = false
    while !ended {
      if job.isCancelled { throw BeatError.cancelled }
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
              basic.mSampleRate >= BeatEnvelope.lowestRate, basic.mSampleRate <= BeatEnvelope.highestRate,
              basic.mChannelsPerFrame > 0, basic.mChannelsPerFrame <= 64 else {
          throw BeatError.failed("beats reader: unexpected sound format")
        }
        let builder: EnvelopeBuilder
        if let existing = made {
          guard existing.sampleRate == basic.mSampleRate, channels == Int(basic.mChannelsPerFrame) else {
            throw BeatError.failed("beats reader: unexpected sound format")
          }
          builder = existing
        } else {
          builder = EnvelopeBuilder(sampleRate: basic.mSampleRate)
          channels = Int(basic.mChannelsPerFrame)
          made = builder
        }
        if isFirstSample {
          isFirstSample = false
          let lead = CMSampleBufferGetPresentationTimeStamp(sample).seconds - start
          if lead.isFinite, lead > 0.001, lead < end - start {
            let quiet = Int((lead * builder.sampleRate).rounded())
            for _ in 0..<quiet { builder.push(0) }
          }
        }
        let width = channels
        let floats = CMBlockBufferGetDataLength(block) / MemoryLayout<Float>.size
        let frames = floats / width
        if frames == 0 { return }
        if scratch.count < floats { scratch = [Float](repeating: 0, count: floats) }
        let status: OSStatus = scratch.withUnsafeMutableBytes { (raw: UnsafeMutableRawBufferPointer) -> OSStatus in
          guard let base = raw.baseAddress else { return -1 }
          return CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: floats * MemoryLayout<Float>.size, destination: base)
        }
        guard status == kCMBlockBufferNoErr else { throw BeatError.failed("beats reader: could not read the sound (\(status))") }
        scratch.withUnsafeBufferPointer { (interleaved: UnsafeBufferPointer<Float>) -> Void in
          for f in 0..<frames {
            var sum: Float = 0
            for c in 0..<width { sum += interleaved[f * width + c] }
            let mono: Float = sum / Float(width)
            builder.push(mono.isFinite ? Double(mono) : 0)
          }
        }
      }
    }
    guard reader.status == .completed else { throw BeatError.failed("beats reader: " + ExportSession.describe(reader.error)) }
    guard let builder = made, builder.count > 0 else { throw BeatError.failed("beats reader: no sound came out") }
    let answer: [String: Any] = ["env": builder.env, "rate": builder.rate, "seconds": Double(builder.count) / builder.sampleRate, "from": start]
    return answer
  }
}
