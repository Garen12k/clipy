import AVFoundation
import ExpoModulesCore

/// One Read aloud (`SpeechRequest` in modules/clipy-video/index.ts). `rate` is 0 … 1 with 0.5 = the system's normal
/// pace (`speechRate` in src/editor/model/speech.ts); `text` is already cleaned by the app; `outputPath` is a
/// `file://` address, like a sound render's.
struct SpeechRequest: Record {
  @Field var jobId: String = ""
  @Field var text: String = ""
  @Field var voiceId: String = ""
  @Field var rate: Double = 0.5
  @Field var outputPath: String = ""
}

enum SpeechError: Error, LocalizedError {
  case cancelled
  case failed(String)
  var errorDescription: String? {
    switch self {
    case .cancelled: return "Speech cancelled"
    case .failed(let text): return text
    }
  }
}

/// Pure helpers of Read aloud.
enum SpeechRender {
  /// How often a running job is looked at.
  static let tick: Double = 0.25
  /// Sound has come and then nothing for this long: the speech is over (the empty end buffer never came).
  static let idleSeconds: Double = 8
  /// Nothing at all for this long: this voice gives no sound here.
  static let startSeconds: Double = 20
  /// No reading is this long (a text is at most 1000 letters): a synthesizer that never stops is stopped here.
  static let maxSeconds: Double = 1800
  /// How long an ended job is kept after the synthesizer's last call (see `SpeechJob.linger`).
  static let lingerSeconds: Double = 1

  /// What a failure says to the app: a SpeechError's own staged text, anything else described in full.
  static func message(_ error: Error) -> String {
    if let own = error as? SpeechError, let text = own.errorDescription { return text }
    return "speech render: " + ExportSession.describe(error)
  }

  /// The app's 0 … 1 (0.5 = normal) placed around Apple's own constants: below the middle between the slowest and
  /// the default rate, above it between the default and the fastest. Not a number → the default.
  static func rate(_ normal: Double) -> Float {
    let r: Double = normal.isFinite ? min(1, max(0, normal)) : 0.5
    let low: Double = Double(AVSpeechUtteranceMinimumSpeechRate)
    let mid: Double = Double(AVSpeechUtteranceDefaultSpeechRate)
    let high: Double = Double(AVSpeechUtteranceMaximumSpeechRate)
    let value: Double = r <= 0.5 ? low + (mid - low) * (r / 0.5) : mid + (high - mid) * ((r - 0.5) / 0.5)
    return Float(value)
  }

  /// Two formats a file can take one after the other without converting.
  static func same(_ a: AVAudioFormat, _ b: AVAudioFormat) -> Bool {
    return a.channelCount == b.channelCount && a.sampleRate == b.sampleRate && a.commonFormat == b.commonFormat && a.isInterleaved == b.isInterleaved
  }

  /// A format a file is asked to take at all: one of the four plain PCM kinds, with a rate and a channel.
  static func writable(_ format: AVAudioFormat) -> Bool {
    return format.commonFormat != .otherFormat && format.sampleRate.isFinite && format.sampleRate > 0 && format.channelCount > 0
  }

  /// The voices installed on this iPhone: id, name, language code, the language's name in the phone's language and
  /// Apple's quality number (1 default, 2 enhanced, 3 premium — sent raw, no case is named). Novelty and personal
  /// voices are left out where the system can tell (iOS 17 and later).
  static func voices() -> [[String: Any]] {
    var out: [[String: Any]] = []
    for voice in AVSpeechSynthesisVoice.speechVoices() {
      if #available(iOS 17.0, *) {
        if voice.voiceTraits.contains(.isNoveltyVoice) || voice.voiceTraits.contains(.isPersonalVoice) { continue }
      }
      let languageName: String = Locale.current.localizedString(forIdentifier: voice.language) ?? voice.language
      let row: [String: Any] = ["id": voice.identifier, "name": voice.name, "language": voice.language, "languageName": languageName, "quality": voice.quality.rawValue]
      out.append(row)
    }
    return out
  }
}

/// One Read aloud while it runs. It OWNS the synthesizer (the system does not keep one alive), takes the buffers the
/// synthesizer hands over on whatever thread it uses, writes them to `part-<name>` in the voice's own PCM format,
/// and ends exactly once: on the empty end buffer, on silence after sound, on no sound at all, or on a cancel.
/// On success the part file is moved into place; on anything else it is removed.
/// The app's sound session is not touched: the speech goes into buffers, not to the speaker.
final class SpeechJob: @unchecked Sendable {
  private let lock = NSLock()
  private let synthesizer = AVSpeechSynthesizer()
  private let outputURL: URL
  private let partURL: URL
  private let done: (Result<Double, Error>) -> Void
  private var file: AVAudioFile?                   // guarded by `lock`, like everything below
  private var format: AVAudioFormat?
  private var frames: Int = 0
  private var quietLooks: Int = 0                  // looks (see `watch`) since the last buffer; counted, not timed
  private var endSeen = false                      // the empty end buffer came before any sound
  private var stopped = false
  private var finished = false

  init(outputURL: URL, done: @escaping (Result<Double, Error>) -> Void) {
    self.outputURL = outputURL
    self.partURL = outputURL.deletingLastPathComponent().appendingPathComponent("part-" + outputURL.lastPathComponent)
    self.done = done
  }

  /// Starts the speech. Answers through `done`, once.
  func start(text: String, voiceId: String, rate: Double) {
    if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      end(.failure(SpeechError.failed("speech render: there is nothing to read")))
      return
    }
    guard let voice = AVSpeechSynthesisVoice(identifier: voiceId) else {
      end(.failure(SpeechError.failed("speech voice: this voice is not on the iPhone any more")))
      return
    }
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = voice
    utterance.rate = SpeechRender.rate(rate)
    try? FileManager.default.createDirectory(at: partURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? FileManager.default.removeItem(at: partURL)
    DispatchQueue.main.async {
      self.lock.lock()
      let called: Bool = self.stopped
      self.lock.unlock()
      if called {
        self.end(.failure(SpeechError.cancelled))
        return
      }
      // Weak: the synthesizer keeps this closure and the job keeps the synthesizer. The module holds the job until it has answered.
      self.synthesizer.write(utterance, toBufferCallback: { [weak self] (buffer: AVAudioBuffer) -> Void in
        guard let owner = self else { return }
        owner.take(buffer)
      })
      self.watch()
    }
  }

  /// Stops the speech; the job then answers as cancelled (at once if a buffer comes, else at the next look).
  func cancel() {
    lock.lock()
    stopped = true
    lock.unlock()
    halt()
  }

  /// Tells the synthesizer to stop, on the main queue. One that is not speaking takes no notice.
  private func halt() {
    DispatchQueue.main.async {
      _ = self.synthesizer.stopSpeaking(at: .immediate)
    }
  }

  /// Keeps the job, and so the synthesizer, a moment longer and lets go of it on the main queue: the last hold on a
  /// synthesizer is never dropped inside that synthesizer's own call.
  private func linger() {
    DispatchQueue.main.asyncAfter(deadline: .now() + SpeechRender.lingerSeconds) {
      _ = self.synthesizer.isSpeaking
    }
  }

  private var seconds: Double {                    // call with `lock` held
    guard let known = format, known.sampleRate > 0 else { return 0 }
    return Double(frames) / known.sampleRate
  }

  /// One buffer from the synthesizer. An empty one is the end.
  private func take(_ buffer: AVAudioBuffer) {
    var outcome: Result<Double, Error>? = nil
    var over = false
    autoreleasepool { () -> Void in
      lock.lock()
      defer { lock.unlock() }
      if finished {
        over = true
        return
      }
      if stopped {
        outcome = .failure(SpeechError.cancelled)
        return
      }
      guard let pcm = buffer as? AVAudioPCMBuffer else { return }
      if pcm.frameLength == 0 {
        if frames > 0 {
          outcome = .success(seconds)
        } else if !endSeen {
          // An end with no sound before it: the look gives it `idleSeconds` for sound to come after all.
          endSeen = true
          quietLooks = 0
        }
        return
      }
      quietLooks = 0
      guard SpeechRender.writable(pcm.format) else {
        outcome = .failure(SpeechError.failed("speech output: this voice gives a sound the file cannot take"))
        return
      }
      do {
        if let current = file, let known = format {
          // Writing a buffer of another format than the file's own does not throw, it stops the app: checked first.
          guard SpeechRender.same(known, pcm.format) else {
            outcome = .failure(SpeechError.failed("speech output: this voice gives a sound the file cannot take"))
            return
          }
          try current.write(from: pcm)
        } else {
          let made = try AVAudioFile(forWriting: partURL, settings: pcm.format.settings, commonFormat: pcm.format.commonFormat, interleaved: pcm.format.isInterleaved)
          guard SpeechRender.same(made.processingFormat, pcm.format) else {
            outcome = .failure(SpeechError.failed("speech output: this voice gives a sound the file cannot take"))
            return
          }
          try made.write(from: pcm)
          file = made
          format = pcm.format
        }
        frames += Int(pcm.frameLength)
        if seconds > SpeechRender.maxSeconds {
          outcome = .failure(SpeechError.failed("speech render: the speech did not stop"))
        }
      } catch {
        outcome = .failure(SpeechError.failed("speech output: " + ExportSession.describe(error)))
      }
    }
    if let result = outcome {
      end(result)
      over = true
    }
    if over { linger() }
  }

  /// Looks at the job every `tick` until it has ended, so it ends even when the synthesizer goes quiet. The quiet
  /// is counted in looks, not read from the clock: time the app spent asleep is not silence.
  private func watch() {
    DispatchQueue.main.asyncAfter(deadline: .now() + SpeechRender.tick) {
      var outcome: Result<Double, Error>? = nil
      self.lock.lock()
      let over: Bool = self.finished
      if !over {
        self.quietLooks += 1
        let quiet: Double = Double(self.quietLooks) * SpeechRender.tick
        if self.stopped {
          outcome = .failure(SpeechError.cancelled)
        } else if self.frames > 0 {
          if quiet > SpeechRender.idleSeconds { outcome = .success(self.seconds) }
        } else if self.endSeen {
          if quiet > SpeechRender.idleSeconds { outcome = .failure(SpeechError.failed("speech render: no sound came out")) }
        } else if quiet > SpeechRender.startSeconds {
          outcome = .failure(SpeechError.failed("speech render: no sound came out"))
        }
      }
      self.lock.unlock()
      if over { return }
      if let result = outcome { self.end(result) } else { self.watch() }
    }
  }

  /// The one way out. Releasing the file finishes it, before it is moved.
  private func end(_ outcome: Result<Double, Error>) {
    lock.lock()
    if finished {
      lock.unlock()
      return
    }
    finished = true
    autoreleasepool { () -> Void in
      file = nil
    }
    lock.unlock()
    switch outcome {
    case .success(let length):
      guard length.isFinite, length > 0 else {
        try? FileManager.default.removeItem(at: partURL)
        done(.failure(SpeechError.failed("speech render: no sound came out")))
        return
      }
      do {
        try? FileManager.default.removeItem(at: outputURL)
        try FileManager.default.moveItem(at: partURL, to: outputURL)
      } catch {
        try? FileManager.default.removeItem(at: partURL)
        done(.failure(SpeechError.failed("speech output: " + ExportSession.describe(error))))
        return
      }
      done(.success(length))
    case .failure(let error):
      halt()
      try? FileManager.default.removeItem(at: partURL)
      done(.failure(error))
    }
  }
}
