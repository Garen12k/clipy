import AudioToolbox
import AVFoundation
import ExpoModulesCore

/// One equaliser band of a render request (`SoundBand` in src/editor/model/sound.ts): Hz, dB, octaves.
struct SoundBand: Record {
  @Field var type: String = "parametric"
  @Field var frequency: Double = 1000
  @Field var gain: Double = 0
  @Field var bandwidth: Double = 1
}

/// One render (`SoundRenderRequest` in modules/clipy-video/index.ts). The numbers come ready-made from the app
/// (`soundChain`): this side only sets them on the units. A unit is left out when its switch is off: pitch 0, a
/// wet mix of 0 or an unknown preset name, no bands.
struct SoundRenderRequest: Record {
  @Field var jobId: String = ""
  @Field var sourceUri: String = ""
  @Field var outputPath: String = ""
  @Field var pitchCents: Double = 0
  @Field var distortionPreset: String = ""
  @Field var distortionWet: Double = 0
  @Field var distortionPreGain: Double = -6
  @Field var delayTime: Double = 0
  @Field var delayFeedback: Double = 0
  @Field var delayWet: Double = 0
  @Field var delayLowPass: Double = 15000
  @Field var reverbPreset: String = ""
  @Field var reverbWet: Double = 0
  @Field var bands: [SoundBand] = []
  @Field var level: Bool = false
  @Field var noiseWet: Double = 0                  // Reduce noise: the isolation unit's wet/dry mix in percent; 0 = no unit
}

enum SoundError: Error, LocalizedError {
  case cancelled
  case failed(String)
  var errorDescription: String? {
    switch self {
    case .cancelled: return "Sound cancelled"
    case .failed(let text): return text
    }
  }
}

/// The cancel flag of one render. `cancel()` comes from the JS thread, the render loop reads it on its own thread.
final class SoundJob: @unchecked Sendable {
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

/// A started reader and its one output.
struct SoundReader {
  let reader: AVAssetReader
  let output: AVAssetReaderAudioMixOutput
}

/// The file a render reads: the asset, its first audio track and its length. The asset is a stored property on
/// purpose — `AVAssetTrack.asset` is weak, and the track is only usable while the asset lives.
final class SoundSource {
  let asset: AVURLAsset
  let track: AVAssetTrack
  let seconds: Double

  init(asset: AVURLAsset, track: AVAssetTrack, seconds: Double) {
    self.asset = asset
    self.track = track
    self.seconds = seconds
  }

  /// Opens an audio OR a video file and takes its first audio track (what the export takes too).
  static func open(_ uri: String) async throws -> SoundSource {
    guard let url = ExportSession.fileURL(from: uri) else { throw SoundError.failed("sound open: not a file: \(uri)") }
    let asset = AVURLAsset(url: url)
    let found: [AVAssetTrack]
    do { found = try await asset.loadTracks(withMediaType: .audio) }
    catch { throw SoundError.failed("sound open: " + ExportSession.describe(error)) }
    guard let track = found.first else { throw SoundError.failed("sound open: no sound in this file") }
    let length: CMTime
    do { length = try await asset.load(.duration) }
    catch { throw SoundError.failed("sound open: " + ExportSession.describe(error)) }
    let seconds = length.seconds
    guard seconds.isFinite, seconds > 0 else { throw SoundError.failed("sound open: the file has no length") }
    return SoundSource(asset: asset, track: track, seconds: seconds)
  }

  /// A reader that decodes the track to 44.1 kHz stereo 32-bit float, interleaved. `limit` = only the first seconds.
  /// An asset reader opens whatever AVFoundation plays (a clip's .mov / .mp4, a recorded .m4a, a bundled .mp3) and
  /// does the sample-rate and channel conversion itself, so the engine below only ever sees one format.
  func startReader(limit: Double?) throws -> SoundReader {
    let reader: AVAssetReader
    do { reader = try AVAssetReader(asset: asset) }
    catch { throw SoundError.failed("sound reader: " + ExportSession.describe(error)) }
    let output = AVAssetReaderAudioMixOutput(audioTracks: [track], audioSettings: SoundRender.pcmSettings)
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else { throw SoundError.failed("sound reader: the sound of this file cannot be read") }
    reader.add(output)
    if let limit, limit.isFinite, limit > 0 {
      reader.timeRange = CMTimeRange(start: .zero, duration: CMTime(seconds: limit, preferredTimescale: 600))
    }
    guard reader.startReading() else { throw SoundError.failed("sound reader: " + ExportSession.describe(reader.error)) }
    return SoundReader(reader: reader, output: output)
  }
}

/// Renders a source through the units a request names into an AAC file as long as the source, with AVAudioEngine in
/// offline manual rendering. Everything here is SYNCHRONOUS on purpose: in an async function `scheduleBuffer` would
/// resolve to its async overload, which waits for the buffer to be played — and nothing plays until the loop renders.
enum SoundRender {
  static let sampleRate: Double = 44_100
  static let maxFrames: AVAudioFrameCount = 4096
  static let bitRate: Int = 192_000
  /// How many render calls in a row may give nothing before the render is given up.
  static let maxStalls: Int = 200
  /// One render at a time: a second one waits here for its turn (and still answers a cancel while it waits).
  static let gate = NSLock()
  /// How the reader hands the sound over (the engine's own format is the deinterleaved twin of this).
  static let pcmSettings: [String: Any] = [
    AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: sampleRate, AVNumberOfChannelsKey: 2,
    AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true, AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false,
  ]
  /// `REVERB_PRESETS` in src/editor/model/sound.ts: every AVAudioUnitReverbPreset there is on iOS 16.4, by its case
  /// name. The app's list has one more name, a case that exists from iOS 27 only: naming it here would not compile
  /// for this module's iOS 16.4, so a request that names it gets no reverb, like any unknown name.
  static let reverbPresets: [String: AVAudioUnitReverbPreset] = [
    "smallRoom": .smallRoom, "mediumRoom": .mediumRoom, "largeRoom": .largeRoom, "mediumHall": .mediumHall, "largeHall": .largeHall,
    "plate": .plate, "mediumChamber": .mediumChamber, "largeChamber": .largeChamber, "cathedral": .cathedral, "largeRoom2": .largeRoom2,
    "mediumHall2": .mediumHall2, "mediumHall3": .mediumHall3, "largeHall2": .largeHall2,
  ]
  /// `DISTORTION_PRESETS` in src/editor/model/sound.ts: every AVAudioUnitDistortionPreset by its case name.
  static let distortionPresets: [String: AVAudioUnitDistortionPreset] = [
    "drumsBitBrush": .drumsBitBrush, "drumsBufferBeats": .drumsBufferBeats, "drumsLoFi": .drumsLoFi,
    "multiBrokenSpeaker": .multiBrokenSpeaker, "multiCellphoneConcert": .multiCellphoneConcert, "multiDecimated1": .multiDecimated1,
    "multiDecimated2": .multiDecimated2, "multiDecimated3": .multiDecimated3, "multiDecimated4": .multiDecimated4,
    "multiDistortedFunk": .multiDistortedFunk, "multiDistortedCubed": .multiDistortedCubed, "multiDistortedSquared": .multiDistortedSquared,
    "multiEcho1": .multiEcho1, "multiEcho2": .multiEcho2, "multiEchoTight1": .multiEchoTight1, "multiEchoTight2": .multiEchoTight2,
    "multiEverythingIsBroken": .multiEverythingIsBroken, "speechAlienChatter": .speechAlienChatter,
    "speechCosmicInterference": .speechCosmicInterference, "speechGoldenPi": .speechGoldenPi, "speechRadioTower": .speechRadioTower,
    "speechWaves": .speechWaves,
  ]
  /// `BAND_TYPES` in src/editor/model/sound.ts.
  static let filterTypes: [String: AVAudioUnitEQFilterType] = [
    "parametric": .parametric, "lowShelf": .lowShelf, "highShelf": .highShelf, "highPass": .highPass, "lowPass": .lowPass,
  ]

  /// What a failure says to the app: a SoundError's own staged text, anything else described in full.
  static func message(_ error: Error) -> String {
    if let own = error as? SoundError, let text = own.errorDescription { return text }
    return "sound render: " + ExportSession.describe(error)
  }

  static func bounded(_ value: Double, _ low: Double, _ high: Double) -> Double {
    return min(high, max(low, value))
  }

  /// One decoded sample buffer (interleaved 32-bit float, one or more channels) as a stereo engine buffer. Nil when
  /// it is not what the reader was asked for.
  static func pcmBuffer(from sample: CMSampleBuffer, format: AVAudioFormat) -> AVAudioPCMBuffer? {
    let frames: Int = CMSampleBufferGetNumSamples(sample)
    guard frames > 0, frames < Int(Int32.max), format.channelCount == 2,
          let description = CMSampleBufferGetFormatDescription(sample),
          let stream = CMAudioFormatDescriptionGetStreamBasicDescription(description),
          let block = CMSampleBufferGetDataBuffer(sample),
          let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)),
          let channels = buffer.floatChannelData else { return nil }
    let width = Int(stream.pointee.mChannelsPerFrame)
    let isFloat = (stream.pointee.mFormatFlags & kAudioFormatFlagIsFloat) != 0
    let count = frames * width
    let byteCount = count * MemoryLayout<Float>.size
    guard width >= 1, isFloat, stream.pointee.mBitsPerChannel == 32, CMBlockBufferGetDataLength(block) >= byteCount else { return nil }
    var interleaved = [Float](repeating: 0, count: count)
    let status: OSStatus = interleaved.withUnsafeMutableBytes { (raw: UnsafeMutableRawBufferPointer) -> OSStatus in
      guard let base = raw.baseAddress else { return -1 }
      return CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: byteCount, destination: base)
    }
    guard status == kCMBlockBufferNoErr else { return nil }
    let right = width > 1 ? 1 : 0                  // a mono source plays on both sides
    let leftChannel: UnsafeMutablePointer<Float> = channels[0]
    let rightChannel: UnsafeMutablePointer<Float> = channels[1]
    for i in 0..<frames {
      leftChannel[i] = interleaved[i * width]
      rightChannel[i] = interleaved[i * width + right]
    }
    buffer.frameLength = AVAudioFrameCount(frames)
    return buffer
  }

  /// `frames` of silence (a source whose sound starts later than its file does).
  static func silence(frames: Int, format: AVAudioFormat) -> AVAudioPCMBuffer? {
    guard frames > 0, frames < Int(Int32.max), format.channelCount == 2,
          let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)),
          let channels = buffer.floatChannelData else { return nil }
    let leftChannel: UnsafeMutablePointer<Float> = channels[0]
    let rightChannel: UnsafeMutablePointer<Float> = channels[1]
    for i in 0..<frames {
      leftChannel[i] = 0
      rightChannel[i] = 0
    }
    buffer.frameLength = AVAudioFrameCount(frames)
    return buffer
  }

  /// The units a request switches on, in signal order: pitch, distortion, delay, reverb, equaliser.
  static func units(for request: SoundRenderRequest) -> [AVAudioNode] {
    var nodes: [AVAudioNode] = []
    if request.pitchCents.isFinite, abs(request.pitchCents) >= 1 {
      let pitch = AVAudioUnitTimePitch()
      pitch.pitch = Float(bounded(request.pitchCents, -2400, 2400))
      pitch.rate = 1                               // the copy is exactly as long as the source
      nodes.append(pitch)
    }
    if let preset = distortionPresets[request.distortionPreset], request.distortionWet > 0 {
      let distortion = AVAudioUnitDistortion()
      distortion.loadFactoryPreset(preset)
      distortion.preGain = Float(bounded(request.distortionPreGain.isFinite ? request.distortionPreGain : -6, -80, 20))
      distortion.wetDryMix = Float(bounded(request.distortionWet, 0, 100))
      nodes.append(distortion)
    }
    if request.delayWet > 0, request.delayTime > 0 {
      let delay = AVAudioUnitDelay()
      delay.delayTime = bounded(request.delayTime, 0, 2)
      delay.feedback = Float(bounded(request.delayFeedback.isFinite ? request.delayFeedback : 0, -100, 100))
      delay.lowPassCutoff = Float(bounded(request.delayLowPass.isFinite ? request.delayLowPass : 15000, 10, sampleRate / 2))
      delay.wetDryMix = Float(bounded(request.delayWet, 0, 100))
      nodes.append(delay)
    }
    if let preset = reverbPresets[request.reverbPreset], request.reverbWet > 0 {
      let reverb = AVAudioUnitReverb()
      reverb.loadFactoryPreset(preset)
      reverb.wetDryMix = Float(bounded(request.reverbWet, 0, 100))
      nodes.append(reverb)
    }
    let usable: [SoundBand] = request.bands.filter { (b: SoundBand) -> Bool in
      filterTypes[b.type] != nil && b.frequency.isFinite && b.gain.isFinite && b.bandwidth.isFinite
    }
    if !usable.isEmpty {
      let equaliser = AVAudioUnitEQ(numberOfBands: usable.count)
      let made: [AVAudioUnitEQFilterParameters] = equaliser.bands
      for (index, wanted) in usable.enumerated() where index < made.count {
        let band: AVAudioUnitEQFilterParameters = made[index]
        band.filterType = filterTypes[wanted.type] ?? .parametric
        band.frequency = Float(bounded(wanted.frequency, 20, 20_000))
        band.gain = Float(bounded(wanted.gain, -24, 24))
        band.bandwidth = Float(bounded(wanted.bandwidth, 0.05, 5))
        band.bypass = false                        // set every time: the default is not documented
      }
      nodes.append(equaliser)
    }
    return nodes
  }

  /// Even out loudness: one pass over the source, the mean square of each block of the mono mix, and the gain (dB)
  /// `SoundMath.levelGainDb` gives for them.
  static func measure(_ source: SoundSource, format: AVAudioFormat, job: SoundJob, progress: (Double) -> Void) throws -> Double {
    let reading = try source.startReader(limit: nil)
    defer { if reading.reader.status == .reading { reading.reader.cancelReading() } }
    let blockFrames = max(1, Int(sampleRate * SoundMath.levelBlockSeconds))
    let expected = max(1, source.seconds * sampleRate)
    var blocks: [Double] = []
    var sum = 0.0
    var inBlock = 0
    var seen = 0
    var ended = false
    while !ended {
      if job.isCancelled { throw SoundError.cancelled }
      autoreleasepool { () -> Void in
        guard let sample = reading.output.copyNextSampleBuffer() else {
          ended = true
          return
        }
        guard let decoded = pcmBuffer(from: sample, format: format), let channels = decoded.floatChannelData else { return }
        let leftChannel: UnsafeMutablePointer<Float> = channels[0]
        let rightChannel: UnsafeMutablePointer<Float> = channels[1]
        let frames = Int(decoded.frameLength)
        for i in 0..<frames {
          let mono = (Double(leftChannel[i]) + Double(rightChannel[i])) * 0.5
          sum += mono * mono
          inBlock += 1
          if inBlock == blockFrames {
            blocks.append(sum / Double(inBlock))
            sum = 0
            inBlock = 0
          }
        }
        seen += frames
      }
      progress(min(1, Double(seen) / expected))
    }
    if reading.reader.status == .failed { throw SoundError.failed("sound reader: " + ExportSession.describe(reading.reader.error)) }
    if inBlock > blockFrames / 4 { blocks.append(sum / Double(inBlock)) }   // a last block of at least 0.1 s counts
    return SoundMath.levelGainDb(blocks)
  }

  /// The loop: decoded buffers are scheduled on a player, the engine is pulled `maxFrames` at a time through `units`,
  /// and every rendered buffer — its samples times `gain`, through the peak guard — is handed to `sink`. The units'
  /// latency is dropped from the start and rendered on at the end, so what `sink` gets lines up with the source and
  /// is exactly as long. Returns the frames handed over.
  /// It always ends: the cancel flag and the frame cap are checked on every pass, a pass that renders nothing counts
  /// towards `maxStalls`, and once the source has ended only the units' latency is still pulled.
  static func process(_ source: SoundSource, units: [AVAudioNode], format: AVAudioFormat, limit: Double?, gain: Double, job: SoundJob,
                      progress: (Double) -> Void, sink: (AVAudioPCMBuffer) throws -> Void) throws -> Int {
    let reading = try source.startReader(limit: limit)
    defer { if reading.reader.status == .reading { reading.reader.cancelReading() } }
    let engine = AVAudioEngine()
    let player = AVAudioPlayerNode()
    engine.attach(player)
    var previous: AVAudioNode = player
    for unit in units {
      engine.attach(unit)
      engine.connect(previous, to: unit, format: format)
      previous = unit
    }
    engine.connect(previous, to: engine.mainMixerNode, format: format)
    do {
      try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: maxFrames)
      try engine.start()
    } catch { throw SoundError.failed("sound engine: " + ExportSession.describe(error)) }
    defer {
      player.stop()
      engine.stop()
    }
    guard let engineBuffer = AVAudioPCMBuffer(pcmFormat: engine.manualRenderingFormat, frameCapacity: engine.manualRenderingMaximumFrameCount),
          let shaped = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: maxFrames) else { throw SoundError.failed("sound engine: no render buffer") }
    guard engine.manualRenderingFormat.channelCount == 2, format.channelCount == 2 else { throw SoundError.failed("sound engine: the engine is not rendering stereo") }

    var latencySeconds = 0.0
    for unit in units { latencySeconds += unit.latency }
    let latencyFrames: Int = latencySeconds.isFinite ? Int((bounded(latencySeconds, 0, 10) * sampleRate).rounded()) : 0
    var skipFrames = latencyFrames
    let wantedSeconds: Double = limit ?? source.seconds
    let expected: Double = wantedSeconds.isFinite && wantedSeconds > 0 ? max(1, wantedSeconds * sampleRate) : 1
    // No render may pull more than this, whatever the file or the engine does: twice the source and a minute.
    let frameCap: Int = Int(min(expected * 2 + sampleRate * 60, 1.0e12)) + latencyFrames
    let ahead: Int = max(Int(maxFrames) * 4, Int(sampleRate))
    var scheduledFrames = 0
    var pulledFrames = 0
    var writtenFrames = 0
    var ended = false
    var isFirstSample = true
    var stalls = 0

    while true {
      if job.isCancelled { throw SoundError.cancelled }
      if pulledFrames >= frameCap { throw SoundError.failed("sound render: the render ran past its frame cap") }
      // One pass in its own pool, so a long file never piles up what AVFoundation autoreleases. False = finished.
      let more: Bool = try autoreleasepool { () throws -> Bool in
        // Keep the player well ahead of the engine, so a render call never runs dry before the source has ended.
        while !ended && scheduledFrames - pulledFrames < ahead {
          guard let sample = reading.output.copyNextSampleBuffer() else {
            ended = true
            if reading.reader.status == .failed { throw SoundError.failed("sound reader: " + ExportSession.describe(reading.reader.error)) }
            break
          }
          if isFirstSample {
            isFirstSample = false
            let lead = CMSampleBufferGetPresentationTimeStamp(sample).seconds
            if lead.isFinite, lead > 0.001, lead < 600, let quiet = silence(frames: Int((lead * sampleRate).rounded()), format: format) {
              player.scheduleBuffer(quiet, completionHandler: nil)
              scheduledFrames += Int(quiet.frameLength)
            }
          }
          guard let decoded = pcmBuffer(from: sample, format: format) else { continue }
          player.scheduleBuffer(decoded, completionHandler: nil)
          scheduledFrames += Int(decoded.frameLength)
        }
        if !player.isPlaying { player.play() }

        let want = ended ? min(Int(maxFrames), scheduledFrames + latencyFrames - pulledFrames) : Int(maxFrames)
        if want <= 0 { return false }
        let status: AVAudioEngineManualRenderingStatus
        do { status = try engine.renderOffline(AVAudioFrameCount(want), to: engineBuffer) }
        catch { throw SoundError.failed("sound render: " + ExportSession.describe(error)) }
        let got: Int
        switch status {
        case .success: got = Int(engineBuffer.frameLength)
        case .insufficientDataFromInputNode, .cannotDoInCurrentContext: got = 0
        case .error: throw SoundError.failed("sound render: the engine reported an error")
        @unknown default: got = 0
        }
        if got <= 0 {
          stalls += 1
          if stalls > maxStalls { throw SoundError.failed("sound render: the engine stopped giving sound") }
          return true
        }
        stalls = 0
        pulledFrames += got

        let drop = min(got, skipFrames)
        skipFrames -= drop
        let keep = min(min(got - drop, scheduledFrames - writtenFrames), Int(maxFrames))
        if keep > 0, let rendered = engineBuffer.floatChannelData, let target = shaped.floatChannelData {
          for channel in 0..<2 {
            let fromChannel: UnsafeMutablePointer<Float> = rendered[channel]
            let intoChannel: UnsafeMutablePointer<Float> = target[channel]
            for i in 0..<keep {
              intoChannel[i] = Float(SoundMath.softClip(Double(fromChannel[drop + i]) * gain))
            }
          }
          shaped.frameLength = AVAudioFrameCount(keep)
          try sink(shaped)
          writtenFrames += keep
        }
        progress(min(1, Double(pulledFrames) / expected))
        return true
      }
      if !more { break }
    }
    return writtenFrames
  }

  /// One whole render: measure (if asked), process, write AAC under a `part-` name, move it into place. On any
  /// failure or cancel the partial file is removed and nothing is left at `outputURL` that was not there before.
  /// `lead` are units placed first in the chain, in order (none unless the caller names them).
  static func render(_ request: SoundRenderRequest, source: SoundSource, lead: [AVAudioNode] = [], to outputURL: URL, job: SoundJob,
                     progress: (Double) -> Void) throws -> (seconds: Double, gainDb: Double) {
    guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 2) else { throw SoundError.failed("sound engine: no audio format") }
    while !gate.lock(before: Date(timeIntervalSinceNow: 0.05)) {
      if job.isCancelled { throw SoundError.cancelled }
    }
    defer { gate.unlock() }
    if job.isCancelled { throw SoundError.cancelled }
    let measureShare = request.level ? 0.3 : 0.0
    var gainDb = 0.0
    if request.level {
      gainDb = try measure(source, format: format, job: job, progress: { (fraction: Double) -> Void in progress(fraction * measureShare) })
    }
    let folder = outputURL.deletingLastPathComponent()
    let partURL = folder.appendingPathComponent("part-" + outputURL.lastPathComponent)
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    try? FileManager.default.removeItem(at: partURL)
    var finished = false
    defer { if !finished { try? FileManager.default.removeItem(at: partURL) } }

    let settings: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: sampleRate, AVNumberOfChannelsKey: 2, AVEncoderBitRateKey: bitRate]
    // `lead` = units that go before the request's own (Reduce noise: the isolation unit, made by the caller because making it is async).
    let chain: [AVAudioNode] = lead + units(for: request)
    let linearGain: Double = SoundMath.dbToGain(gainDb)
    // The file lives only inside this scope: leaving it releases the file, which finishes it — before it is moved.
    let frames: Int = try autoreleasepool { () throws -> Int in
      let file: AVAudioFile
      do { file = try AVAudioFile(forWriting: partURL, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false) }
      catch { throw SoundError.failed("sound output: " + ExportSession.describe(error)) }
      // Writing a buffer of another format than the file's own does not throw, it stops the app: checked first.
      let taken: AVAudioFormat = file.processingFormat
      guard taken.channelCount == format.channelCount, taken.sampleRate == format.sampleRate, taken.commonFormat == format.commonFormat,
            taken.isInterleaved == format.isInterleaved else { throw SoundError.failed("sound output: the file does not take the render format") }
      return try SoundRender.process(source, units: chain, format: format, limit: nil, gain: linearGain, job: job,
                                     progress: { (fraction: Double) -> Void in progress(measureShare + fraction * (1 - measureShare)) },
                                     sink: { (buffer: AVAudioPCMBuffer) throws -> Void in
                                       do { try file.write(from: buffer) }
                                       catch { throw SoundError.failed("sound output: " + ExportSession.describe(error)) }
                                     })
    }
    guard frames > 0 else { throw SoundError.failed("sound render: there was nothing to render") }
    try? FileManager.default.removeItem(at: outputURL)
    do { try FileManager.default.moveItem(at: partURL, to: outputURL) }
    catch { throw SoundError.failed("sound output: " + ExportSession.describe(error)) }
    finished = true
    return (seconds: Double(frames) / sampleRate, gainDb: gainDb)
  }
}

/// Reduce noise: Apple's sound isolation unit, FIRST in a render's chain (it is trained on natural speech, so it
/// must hear the recording before pitch, echo or filters change it). Made exactly as the probe proved on the phone
/// (`SoundProbe`): instantiated with `AVAudioUnit.instantiate` (a failure is an error, not a crash), then given the
/// render format on its first input and output bus BEFORE the engine connects it (a refusal is an error too).
enum SoundNoise {
  static func component() -> AudioComponentDescription {
    return AudioComponentDescription(componentType: kAudioUnitType_Effect, componentSubType: kAudioUnitSubType_AUSoundIsolation,
                                     componentManufacturer: kAudioUnitManufacturer_Apple, componentFlags: 0, componentFlagsMask: 0)
  }

  /// Whether this iPhone has the unit at all. Only looks the component up: nothing is instantiated.
  static func isOnThisPhone() -> Bool {
    var wanted: AudioComponentDescription = component()
    return AudioComponentFindNext(nil, &wanted) != nil
  }

  /// The unit, ready for the engine: `wet` percent of the isolated voice (0 … 100), the render format taken.
  /// Throws `sound noise: …`. It never returns a unit whose strength is not the one asked for.
  static func make(wet: Double, format: AVAudioFormat) async throws -> AVAudioUnit {
    guard wet.isFinite else { throw SoundError.failed("sound noise: the strength is not a number") }
    guard isOnThisPhone() else { throw SoundError.failed("sound noise: the sound isolation unit is not on this iPhone") }
    let unit: AVAudioUnit
    do { unit = try await AVAudioUnit.instantiate(with: component(), options: []) }
    catch { throw SoundError.failed("sound noise: " + ExportSession.describe(error)) }
    do { try SoundProbe.accepts(unit, format: format) }
    catch { throw SoundError.failed("sound noise: " + ExportSession.describe(error)) }
    let percent: Float = Float(SoundRender.bounded(wet, 0, 100))
    if let tree = unit.auAudioUnit.parameterTree,
       let mix = tree.parameter(withAddress: AUParameterAddress(kAUSoundIsolationParam_WetDryMixPercent)) {
      mix.value = percent
      return unit
    }
    // No parameter tree, or no such parameter in it: the older way of setting the same number.
    let status: OSStatus = AudioUnitSetParameter(unit.audioUnit, kAUSoundIsolationParam_WetDryMixPercent, kAudioUnitScope_Global, 0, percent, 0)
    guard status == noErr else { throw SoundError.failed("sound noise: the strength could not be set (\(status))") }
    return unit
  }
}

/// The noise-reduction TEST (no user feature): can Apple's sound isolation unit render a saved recording offline?
/// Never throws; the answer is `{ ok, stage, detail }`.
enum SoundProbe {
  static let probeSeconds: Double = 5

  static func report(_ ok: Bool, _ stage: String, _ detail: String) -> [String: Any] {
    return ["ok": ok, "stage": stage, "detail": detail]
  }

  static func run(_ uri: String) async -> [String: Any] {
    var description = AudioComponentDescription(componentType: kAudioUnitType_Effect, componentSubType: kAudioUnitSubType_AUSoundIsolation,
                                                componentManufacturer: kAudioUnitManufacturer_Apple, componentFlags: 0, componentFlagsMask: 0)
    guard AudioComponentFindNext(nil, &description) != nil else { return report(false, "find", "the sound isolation unit is not on this iPhone") }
    guard let format = AVAudioFormat(standardFormatWithSampleRate: SoundRender.sampleRate, channels: 2) else { return report(false, "format", "no audio format") }
    let source: SoundSource
    do { source = try await SoundSource.open(uri) }
    catch { return report(false, "open", SoundRender.message(error)) }
    let unit: AVAudioUnit
    do { unit = try await AVAudioUnit.instantiate(with: description, options: []) }
    catch { return report(false, "instantiate", ExportSession.describe(error)) }
    // Asked first, where a refusal is an error that can be caught: the engine stops the app when a unit will not
    // take the format it is connected with.
    do { try accepts(unit, format: format) }
    catch { return report(false, "format", ExportSession.describe(error)) }
    do {
      let detail: String = try through(unit, source: source, format: format)
      return report(true, "render", detail)
    }
    catch { return report(false, "render", SoundRender.message(error)) }
  }

  /// Sets the render format on the unit's first input and output bus; throws when the unit refuses it.
  static func accepts(_ unit: AVAudioUnit, format: AVAudioFormat) throws {
    let core: AUAudioUnit = unit.auAudioUnit
    let inputs: AUAudioUnitBusArray = core.inputBusses
    let outputs: AUAudioUnitBusArray = core.outputBusses
    if inputs.count > 0 { try inputs[0].setFormat(format) }
    if outputs.count > 0 { try outputs[0].setFormat(format) }
  }

  /// The first seconds of the source through the unit, with the render loop of a real render. Synchronous.
  static func through(_ unit: AVAudioUnit, source: SoundSource, format: AVAudioFormat) throws -> String {
    var sum = 0.0
    var count = 0
    let chain: [AVAudioNode] = [unit]
    let frames = try SoundRender.process(source, units: chain, format: format, limit: probeSeconds, gain: 1, job: SoundJob(),
                                         progress: { (_: Double) -> Void in },
                                         sink: { (buffer: AVAudioPCMBuffer) throws -> Void in
                                           guard let data = buffer.floatChannelData else { return }
                                           let leftChannel: UnsafeMutablePointer<Float> = data[0]
                                           for i in 0..<Int(buffer.frameLength) {
                                             let value = Double(leftChannel[i])
                                             sum += value * value
                                             count += 1
                                           }
                                         })
    let rms = count > 0 ? (sum / Double(count)).squareRoot() : 0
    return "frames \(frames) outputRms \(rms) latency \(unit.latency)"
  }
}
