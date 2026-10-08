import ExpoModulesCore
import AVFoundation
import Speech

public class ClipyVideoModule: Module {
  private let sessionsLock = NSLock()
  private var sessions: [String: ExportSession] = [:]   // guarded by `sessionsLock`

  private func storeSession(_ session: ExportSession) {
    sessionsLock.lock(); defer { sessionsLock.unlock() }
    sessions[session.id] = session
  }

  private func dropSession(_ id: String) {
    sessionsLock.lock(); defer { sessionsLock.unlock() }
    sessions[id] = nil
  }

  private func lookupSession(_ id: String) -> ExportSession? {
    sessionsLock.lock(); defer { sessionsLock.unlock() }
    return sessions[id]
  }

  private let transcriberLock = NSLock()
  private var transcriber: Transcriber?   // guarded by `transcriberLock`; at most one transcription at a time

  /// Installs `t` as the current transcriber, returning the previous one (which the caller cancels).
  private func swapTranscriber(_ t: Transcriber?) -> Transcriber? {
    transcriberLock.lock(); defer { transcriberLock.unlock() }
    let previous = transcriber
    transcriber = t
    return previous
  }

  /// Clears the current transcriber only if it is still `t` (a newer call may have replaced it).
  private func clearTranscriber(_ t: Transcriber) {
    transcriberLock.lock(); defer { transcriberLock.unlock() }
    if transcriber === t { transcriber = nil }
  }

  private let soundLock = NSLock()
  private var soundJobs: [String: SoundJob] = [:]   // guarded by `soundLock`; one entry per render that has not answered yet

  private func storeSoundJob(_ id: String, _ job: SoundJob) {
    soundLock.lock(); defer { soundLock.unlock() }
    soundJobs[id] = job
  }

  private func dropSoundJob(_ id: String) {
    soundLock.lock(); defer { soundLock.unlock() }
    soundJobs[id] = nil
  }

  private func lookupSoundJob(_ id: String) -> SoundJob? {
    soundLock.lock(); defer { soundLock.unlock() }
    return soundJobs[id]
  }

  private let speechLock = NSLock()
  private var speechJobs: [String: SpeechJob] = [:]   // guarded by `speechLock`; a job is held here until it has answered

  private func storeSpeechJob(_ id: String, _ job: SpeechJob) {
    speechLock.lock(); defer { speechLock.unlock() }
    speechJobs[id] = job
  }

  private func dropSpeechJob(_ id: String) {
    speechLock.lock(); defer { speechLock.unlock() }
    speechJobs[id] = nil
  }

  private func lookupSpeechJob(_ id: String) -> SpeechJob? {
    speechLock.lock(); defer { speechLock.unlock() }
    return speechJobs[id]
  }

  private let beatLock = NSLock()
  private var beatJobs: [String: BeatJob] = [:]   // guarded by `beatLock`; one entry per listening that has not answered yet

  private func storeBeatJob(_ id: String, _ job: BeatJob) {
    beatLock.lock(); defer { beatLock.unlock() }
    beatJobs[id] = job
  }

  private func dropBeatJob(_ id: String) {
    beatLock.lock(); defer { beatLock.unlock() }
    beatJobs[id] = nil
  }

  private func lookupBeatJob(_ id: String) -> BeatJob? {
    beatLock.lock(); defer { beatLock.unlock() }
    return beatJobs[id]
  }

  private let cutoutLock = NSLock()
  private var cutoutJobs: [String: CutoutJob] = [:]   // guarded by `cutoutLock`; one entry per render that has not answered yet

  private func storeCutoutJob(_ id: String, _ job: CutoutJob) {
    cutoutLock.lock(); defer { cutoutLock.unlock() }
    cutoutJobs[id] = job
  }

  private func dropCutoutJob(_ id: String) {
    cutoutLock.lock(); defer { cutoutLock.unlock() }
    cutoutJobs[id] = nil
  }

  private func lookupCutoutJob(_ id: String) -> CutoutJob? {
    cutoutLock.lock(); defer { cutoutLock.unlock() }
    return cutoutJobs[id]
  }

  private let steadyLock = NSLock()
  private var steadyJobs: [String: SteadyJob] = [:]   // guarded by `steadyLock`; one entry per measuring or render that has not answered yet

  private func storeSteadyJob(_ id: String, _ job: SteadyJob) {
    steadyLock.lock(); defer { steadyLock.unlock() }
    steadyJobs[id] = job
  }

  /// Removes `job` — only if it is still the one stored under `id`: a copy's measuring and its render share an id,
  /// and the render may be stored before the measuring's task has let go.
  private func dropSteadyJob(_ id: String, _ job: SteadyJob) {
    steadyLock.lock(); defer { steadyLock.unlock() }
    if steadyJobs[id] === job { steadyJobs[id] = nil }
  }

  private func lookupSteadyJob(_ id: String) -> SteadyJob? {
    steadyLock.lock(); defer { steadyLock.unlock() }
    return steadyJobs[id]
  }

  public func definition() -> ModuleDefinition {
    Name("ClipyVideo")
    Events("onExportEvent", "onSoundEvent", "onCutoutEvent", "onSteadyEvent")

    // Phase 0 smoke test: proves the Swift module is linked and callable.
    Function("hello") { () -> String in
      let version = ProcessInfo.processInfo.operatingSystemVersionString
      return "Hello from ClipyVideo (Swift, AVFoundation) — \(version)"
    }

    // Resolves with the job id BEFORE any `onExportEvent` for that job is emitted: the promise is
    // resolved first (scheduled on the JS runtime with immediate priority), and only then is the
    // export started on a detached Task. Every outcome after that arrives as an event.
    AsyncFunction("exportTimeline") { (request: ExportRequest, promise: Promise) in
      let session = ExportSession { [weak self] payload in
        self?.sendEvent("onExportEvent", payload)
        if let type = payload["type"] as? String, type != "progress", let id = payload["jobId"] as? String {
          self?.dropSession(id)
        }
      }
      let jobId = session.id
      let outputPath = request.outputPath
      self.storeSession(session)
      promise.resolve(jobId)

      Task { [weak self] in
        do {
          try await session.start(request)
        } catch {
          ExportSession.removeFile(atPath: outputPath)
          self?.sendEvent("onExportEvent", ["jobId": jobId, "type": "error", "message": "start: " + ExportSession.describe(error)])
          self?.dropSession(jobId)
        }
      }
    }

    Function("cancelExport") { (jobId: String) in
      self.lookupSession(jobId)?.cancel()
    }

    // Transcribes the file's speech; resolves `[{ text, start, end }]` in source seconds clamped to
    // [trimStart, trimEnd]. A new call cancels any transcription still running (its promise rejects with
    // "Transcription cancelled").
    AsyncFunction("transcribe") { (uri: String, trimStart: Double, trimEnd: Double, promise: Promise) in
      let t = Transcriber()
      self.swapTranscriber(t)?.cancel()
      Task { [weak self] in
        defer { self?.clearTranscriber(t) }
        let status = await Transcriber.requestAuthorization()
        guard status == .authorized else {
          promise.reject("E_SPEECH_DENIED", "Speech recognition permission denied")
          return
        }
        guard let url = ExportSession.fileURL(from: uri) else {
          promise.reject("E_URI", "Invalid file")
          return
        }
        do {
          let segments = try await t.transcribe(url: url, trimStart: trimStart, trimEnd: trimEnd)
          promise.resolve(segments)
        } catch {
          promise.reject(Transcriber.isCancellation(error) ? "E_SPEECH_CANCELLED" : "E_SPEECH", error.localizedDescription)
        }
      }
    }

    Function("cancelTranscribe") { () -> Void in
      if let running = self.swapTranscriber(nil) { running.cancel() }
    }

    // Renders the source through the request's units into `outputPath` (see SoundRender). Resolves
    // `{ fileUri, seconds, gainDb }`; progress arrives as `onSoundEvent { jobId, progress }`. Rejects
    // "E_SOUND_CANCELLED" after `cancelSoundRender(jobId)`, else "E_SOUND" with a staged message.
    // The work runs on a Swift concurrency thread, never the main one. The job is stored before that work starts, so
    // a cancel that comes at once finds it; every way out of the `do` answers the promise exactly once.
    AsyncFunction("renderSound") { (request: SoundRenderRequest, promise: Promise) in
      let job = SoundJob()
      let jobId = request.jobId
      self.storeSoundJob(jobId, job)
      Task { [weak self] in
        defer { self?.dropSoundJob(jobId) }
        do {
          guard let outputURL = ExportSession.fileURL(from: request.outputPath) else { throw SoundError.failed("sound output: not a file path") }
          let source = try await SoundSource.open(request.sourceUri)
          // Reduce noise: the isolation unit goes first. Making it is the one async step, so it is made here and
          // handed to the synchronous render. No noise in the request → no unit, and the render is the old one.
          var lead: [AVAudioNode] = []
          if request.noiseWet.isFinite, request.noiseWet > 0 {
            guard let noiseFormat = AVAudioFormat(standardFormatWithSampleRate: SoundRender.sampleRate, channels: 2) else { throw SoundError.failed("sound engine: no audio format") }
            let isolation: AVAudioUnit = try await SoundNoise.make(wet: request.noiseWet, format: noiseFormat)
            lead.append(isolation)
          }
          var lastSent = -1.0
          let result = try SoundRender.render(request, source: source, lead: lead, to: outputURL, job: job, progress: { (fraction: Double) -> Void in
            guard fraction - lastSent >= 0.02 else { return }   // at most ~50 events a render
            lastSent = fraction
            self?.sendEvent("onSoundEvent", ["jobId": jobId, "progress": fraction])
          })
          let answer: [String: Any] = ["fileUri": outputURL.absoluteString, "seconds": result.seconds, "gainDb": result.gainDb]
          promise.resolve(answer)
        } catch SoundError.cancelled {
          promise.reject("E_SOUND_CANCELLED", "Sound cancelled")
        } catch {
          promise.reject("E_SOUND", SoundRender.message(error))
        }
      }
    }

    // Stops that render at its next pass (it then rejects "E_SOUND_CANCELLED"). An unknown or finished job: nothing.
    Function("cancelSoundRender") { (jobId: String) in
      self.lookupSoundJob(jobId)?.cancel()
    }

    // Whether this iPhone has Apple's sound isolation unit. Its presence also tells the app that this build knows
    // the request's `noiseWet` (a build without this function would ignore the number and render without the unit).
    Function("noiseAvailable") { () -> Bool in
      return SoundNoise.isOnThisPhone()
    }

    // Whether the file has a sound track at all (a silent screen recording has none), and how long the file is.
    AsyncFunction("soundInfo") { (uri: String, promise: Promise) in
      Task {
        guard let url = ExportSession.fileURL(from: uri) else {
          promise.reject("E_URI", "Invalid file")
          return
        }
        let asset = AVURLAsset(url: url)
        do {
          let found = try await asset.loadTracks(withMediaType: .audio)
          let length = try await asset.load(.duration)
          let answer: [String: Any] = ["hasSound": !found.isEmpty, "seconds": length.seconds.isFinite ? length.seconds : 0]
          promise.resolve(answer)
        } catch {
          promise.reject("E_SOUND", "sound info: " + ExportSession.describe(error))
        }
      }
    }

    // The noise-reduction test (dev only; see SoundProbe). Always resolves.
    AsyncFunction("probeNoiseReduction") { (uri: String, promise: Promise) in
      Task {
        let answer: [String: Any] = await SoundProbe.run(uri)
        promise.resolve(answer)
      }
    }

    // The voices installed on this iPhone and the phone's own language code (see SpeechRender.voices).
    AsyncFunction("listVoices") { (promise: Promise) in
      let answer: [String: Any] = ["current": AVSpeechSynthesisVoice.currentLanguageCode(), "voices": SpeechRender.voices()]
      promise.resolve(answer)
    }

    // Read aloud: speaks `text` with the voice into `outputPath` (the voice's own PCM, a .caf). Resolves
    // `{ fileUri, seconds }`. Rejects "E_READ_ALOUD_CANCELLED" after `cancelSpeech(jobId)`, else "E_READ_ALOUD" with
    // a staged message. The job is stored before it starts, so a cancel that comes at once finds it; the job answers
    // exactly once (SpeechJob.end).
    AsyncFunction("speakToFile") { (request: SpeechRequest, promise: Promise) in
      guard let outputURL = ExportSession.fileURL(from: request.outputPath) else {
        promise.reject("E_READ_ALOUD", "speech output: not a file path")
        return
      }
      let jobId = request.jobId
      let job = SpeechJob(outputURL: outputURL, done: { [weak self] (outcome: Result<Double, Error>) -> Void in
        self?.dropSpeechJob(jobId)
        switch outcome {
        case .success(let seconds):
          let answer: [String: Any] = ["fileUri": outputURL.absoluteString, "seconds": seconds]
          promise.resolve(answer)
        case .failure(let error):
          if let own = error as? SpeechError, case .cancelled = own {
            promise.reject("E_READ_ALOUD_CANCELLED", "Speech cancelled")
          } else {
            promise.reject("E_READ_ALOUD", SpeechRender.message(error))
          }
        }
      })
      self.storeSpeechJob(jobId, job)
      job.start(text: request.text, voiceId: request.voiceId, rate: request.rate)
    }

    // Stops that Read aloud (it then rejects "E_READ_ALOUD_CANCELLED"). An unknown or finished job: nothing.
    Function("cancelSpeech") { (jobId: String) in
      self.lookupSpeechJob(jobId)?.cancel()
    }

    // Find beats for a file of the owner's: decodes the asked stretch of the file's sound and resolves its onset
    // envelope `{ env, rate, seconds, from }` (see BeatEnvelope). Rejects "E_BEATS_CANCELLED" after
    // `cancelBeatEnvelope(jobId)`, else "E_BEATS" with a staged message. The work runs on a Swift concurrency
    // thread, never the main one; the job is stored before it starts, so a cancel that comes at once finds it, and
    // every way out of the `do` answers the promise exactly once.
    AsyncFunction("beatEnvelope") { (request: BeatEnvelopeRequest, promise: Promise) in
      let job = BeatJob()
      let jobId = request.jobId
      self.storeBeatJob(jobId, job)
      Task { [weak self] in
        defer { self?.dropBeatJob(jobId) }
        do {
          let answer: [String: Any] = try await BeatEnvelope.run(request, job: job)
          promise.resolve(answer)
        } catch BeatError.cancelled {
          promise.reject("E_BEATS_CANCELLED", "Beats cancelled")
        } catch {
          promise.reject("E_BEATS", BeatEnvelope.message(error))
        }
      }
    }

    // Stops that listening at its next buffer (it then rejects "E_BEATS_CANCELLED"). An unknown or finished job: nothing.
    Function("cancelBeatEnvelope") { (jobId: String) in
      self.lookupBeatJob(jobId)?.cancel()
    }

    // Remove background: renders the cut-out copy the request names (see CutoutRender). Resolves
    // `{ fileUri, seconds, frames, person }`; progress arrives as `onCutoutEvent { jobId, progress }`. Rejects
    // "E_CUTOUT_CANCELLED" after `cancelCutout(jobId)`, else "E_CUTOUT" with a staged message. The work runs on a
    // Swift concurrency thread; the job is stored before it starts, and every way out of the `do` answers the
    // promise exactly once. One render at a time: a second one waits in `enter` (and still answers a cancel there);
    // the gate is given back on every way out after it was taken. The source (and so its asset) lives until the
    // render has returned.
    AsyncFunction("renderCutout") { (request: CutoutRequest, promise: Promise) in
      let job = CutoutJob()
      let jobId = request.jobId
      self.storeCutoutJob(jobId, job)
      Task { [weak self] in
        defer { self?.dropCutoutJob(jobId) }
        do {
          guard let outputURL = ExportSession.fileURL(from: request.outputPath) else { throw CutoutError.failed("cutout output: not a file path") }
          try await CutoutRender.enter(job)
          defer { CutoutRender.leave() }
          let answer: [String: Any]
          if request.kind == "photo" {
            answer = try await CutoutRender.renderPhoto(request, to: outputURL, job: job)
          } else {
            let source = try await CutoutSource.open(request.sourceUri)
            var lastSent = -1.0
            answer = try await CutoutRender.renderVideo(request, source: source, to: outputURL, job: job, progress: { (fraction: Double) -> Void in
              guard fraction - lastSent >= 0.02 else { return }   // at most ~50 events a render
              lastSent = fraction
              self?.sendEvent("onCutoutEvent", ["jobId": jobId, "progress": fraction])
            })
          }
          promise.resolve(answer)
        } catch CutoutError.cancelled {
          promise.reject("E_CUTOUT_CANCELLED", "Cutout cancelled")
        } catch {
          promise.reject("E_CUTOUT", CutoutRender.message(error))
        }
      }
    }

    // Stops that render at its next pass (it then rejects "E_CUTOUT_CANCELLED"). An unknown or finished job: nothing.
    Function("cancelCutout") { (jobId: String) in
      self.lookupCutoutJob(jobId)?.cancel()
    }

    // Stabilize, first half: how far each frame of the asked range moved against the frame before it (see
    // SteadyRender.measure). Resolves `{ times, dx, dy, frames, failed }`; progress arrives as
    // `onSteadyEvent { jobId, progress }`. Rejects "E_STEADY_CANCELLED" after `cancelSteady(jobId)`, else "E_STEADY"
    // with a staged message. The work runs on a Swift concurrency thread; the job is stored before it starts, and
    // every way out of the `do` answers the promise exactly once. One heavy render at a time, cut-outs included: a
    // second one waits in `enter` (and still answers a cancel there); the gate is given back on every way out after
    // it was taken. The source (and so its asset) lives until the measuring has returned.
    AsyncFunction("measureShake") { (request: ShakeRequest, promise: Promise) in
      let job = SteadyJob()
      let jobId = request.jobId
      self.storeSteadyJob(jobId, job)
      Task { [weak self] in
        defer { self?.dropSteadyJob(jobId, job) }
        do {
          try await SteadyRender.enter(job)
          defer { CutoutRender.leave() }
          let source = try await SteadySource.open(request.sourceUri)
          var lastSent = -1.0
          let answer: [String: Any] = try SteadyRender.measure(request, source: source, job: job, progress: { (fraction: Double) -> Void in
            guard fraction - lastSent >= 0.01 else { return }   // at most one event a percent
            lastSent = fraction
            self?.sendEvent("onSteadyEvent", ["jobId": jobId, "progress": fraction])
          })
          promise.resolve(answer)
        } catch SteadyError.cancelled {
          promise.reject("E_STEADY_CANCELLED", "Steady cancelled")
        } catch {
          promise.reject("E_STEADY", SteadyRender.message(error))
        }
      }
    }

    // Stabilize, second half, and Smooth slow motion: writes the copy the request names (see SteadyRender.render).
    // Resolves `{ fileUri, seconds, frames }`; progress, rejections, the gate and the job store as for `measureShake`.
    AsyncFunction("renderSteady") { (request: SteadyRequest, promise: Promise) in
      let job = SteadyJob()
      let jobId = request.jobId
      self.storeSteadyJob(jobId, job)
      Task { [weak self] in
        defer { self?.dropSteadyJob(jobId, job) }
        do {
          guard let outputURL = ExportSession.fileURL(from: request.outputPath) else { throw SteadyError.failed("steady output: not a file path") }
          try await SteadyRender.enter(job)
          defer { CutoutRender.leave() }
          let source = try await SteadySource.open(request.sourceUri)
          var lastSent = -1.0
          let answer: [String: Any] = try await SteadyRender.render(request, source: source, to: outputURL, job: job, progress: { (fraction: Double) -> Void in
            guard fraction - lastSent >= 0.01 else { return }   // at most one event a percent
            lastSent = fraction
            self?.sendEvent("onSteadyEvent", ["jobId": jobId, "progress": fraction])
          })
          promise.resolve(answer)
        } catch SteadyError.cancelled {
          promise.reject("E_STEADY_CANCELLED", "Steady cancelled")
        } catch {
          promise.reject("E_STEADY", SteadyRender.message(error))
        }
      }
    }

    // Stops the measuring or the render stored under that id at its next pass (it then rejects
    // "E_STEADY_CANCELLED"). An unknown or finished job: nothing.
    Function("cancelSteady") { (jobId: String) in
      self.lookupSteadyJob(jobId)?.cancel()
    }
  }
}
