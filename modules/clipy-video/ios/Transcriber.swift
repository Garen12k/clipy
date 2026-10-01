import AVFoundation
import Speech

/// One-shot on-device transcription of a file's audio within [trimStart, trimEnd]. Results are word/phrase
/// segments in SOURCE seconds.
///
/// `SFSpeechURLRecognitionRequest` always transcribes the whole file; trimming is applied to the resulting
/// segments (segments overlapping the window are kept and clamped to it). Long files may be rejected by
/// on-device recognition on older devices — the native error is surfaced to the caller.
///
/// Thread-safety: `transcribe` runs on a Swift concurrency thread, the recognition callback arrives on the
/// recognizer's operation queue (main by default), and `cancel()` is called from the JS thread. All mutable
/// state is guarded by `lock`, and the continuation is resumed exactly once (whoever takes it out first).
final class Transcriber: @unchecked Sendable {
  /// Sendable carrier for one segment; converted to a `[String: Any]` dictionary at the end of `transcribe`.
  private struct Segment: Sendable {
    let text: String
    let start: Double
    let end: Double
  }

  private let lock = NSLock()
  private var task: SFSpeechRecognitionTask?                                   // guarded by `lock`
  private var continuation: CheckedContinuation<[Segment], Error>?            // guarded by `lock`
  private var cancelled = false                                                // guarded by `lock`
  private let recognizer = SFSpeechRecognizer(locale: Locale.current) ?? SFSpeechRecognizer()

  /// `SFSpeechRecognizer.requestAuthorization` may be called from any thread; its handler runs on an
  /// arbitrary background queue, which is fine here because it only resumes a continuation.
  static func requestAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
    await withCheckedContinuation { (c: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
      SFSpeechRecognizer.requestAuthorization { status in c.resume(returning: status) }
    }
  }

  static let errorDomain = "Clipy"
  static let cancelledCode = 3

  static func cancellationError() -> NSError {
    NSError(domain: errorDomain, code: cancelledCode, userInfo: [NSLocalizedDescriptionKey: "Transcription cancelled"])
  }

  /// True when `error` is this Transcriber's own cancellation error (see `cancellationError()`).
  static func isCancellation(_ error: Error) -> Bool {
    let ns = error as NSError
    return ns.domain == errorDomain && ns.code == cancelledCode
  }

  /// Speech reports "No speech detected" as an error (kAFAssistantErrorDomain 1110 on older systems,
  /// kLSRErrorDomain with that message on newer ones).
  private static func isNoSpeechError(_ error: Error) -> Bool {
    let ns = error as NSError
    let message = ns.localizedDescription
    return (ns.domain == "kAFAssistantErrorDomain" && ns.code == 1110)
      || (ns.domain == "kLSRErrorDomain" && message.localizedCaseInsensitiveContains("no speech"))
      || message.localizedCaseInsensitiveContains("no speech detected")
  }

  func transcribe(url: URL, trimStart: Double, trimEnd: Double) async throws -> [[String: Any]] {
    guard let recognizer, recognizer.isAvailable else {
      throw NSError(domain: "Clipy", code: 2, userInfo: [NSLocalizedDescriptionKey: "Speech recognition is not available for this language on this device"])
    }
    let request = SFSpeechURLRecognitionRequest(url: url)
    request.shouldReportPartialResults = false
    if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
    if #available(iOS 16, *) { request.addsPunctuation = true }

    let segments: [Segment] = try await withCheckedThrowingContinuation { (cont: CheckedContinuation<[Segment], Error>) in
      lock.lock()
      if cancelled {
        lock.unlock()
        cont.resume(throwing: Self.cancellationError())
        return
      }
      continuation = cont
      lock.unlock()

      // Never hold `lock` while calling into Speech: the result handler could in principle run synchronously.
      let newTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
        guard let self else { return }
        if let error {
          // A clip with no speech is not a failure: resolve [] so the captions flow can skip it.
          // Speech's own cancellation codes (kLSRErrorDomain 301, kAFAssistantErrorDomain 216) are NOT matched here.
          if Self.isNoSpeechError(error) {
            self.finish(.success([]))
            return
          }
          self.finish(.failure(error))
          return
        }
        guard let result, result.isFinal else { return }
        let segs = result.bestTranscription.segments
          .filter { $0.timestamp + $0.duration > trimStart && $0.timestamp < trimEnd }
          .map { Segment(text: $0.substring, start: max($0.timestamp, trimStart), end: min($0.timestamp + $0.duration, trimEnd)) }
        self.finish(.success(segs))
      }

      lock.lock()
      let stillRunning = continuation != nil && !cancelled
      if stillRunning { task = newTask }
      lock.unlock()
      // Finished (or cancelled) before we could store the task: make sure Speech stops working.
      if !stillRunning { newTask.cancel() }
    }

    return segments.map { ["text": $0.text, "start": $0.start, "end": $0.end] as [String: Any] }
  }

  /// Cancels the running recognition (if any) and rejects the pending `transcribe` call with
  /// "Transcription cancelled". Safe to call at any time, any number of times, from any thread.
  func cancel() {
    lock.lock()
    cancelled = true
    let t = task
    task = nil
    lock.unlock()
    t?.cancel()
    finish(.failure(Self.cancellationError()))
  }

  /// Resumes the continuation at most once; later calls (late callbacks after cancel, etc.) are no-ops.
  private func finish(_ outcome: Result<[Segment], Error>) {
    lock.lock()
    let c = continuation
    continuation = nil
    task = nil
    lock.unlock()
    c?.resume(with: outcome)
  }
}
