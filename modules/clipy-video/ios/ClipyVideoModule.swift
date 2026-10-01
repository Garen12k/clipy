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

  public func definition() -> ModuleDefinition {
    Name("ClipyVideo")
    Events("onExportEvent")

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
          self?.sendEvent("onExportEvent", ["jobId": jobId, "type": "error", "message": error.localizedDescription])
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
          promise.reject("E_SPEECH", error.localizedDescription)
        }
      }
    }

    Function("cancelTranscribe") { () -> Void in
      if let running = self.swapTranscriber(nil) { running.cancel() }
    }
  }
}
