import ExpoModulesCore
import AVFoundation

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
  }
}
