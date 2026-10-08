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

  public func definition() -> ModuleDefinition {
    Name("ClipyVideo")
    Events("onExportEvent", "onSoundEvent")

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
  }
}
