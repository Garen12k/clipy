import AVFoundation
import Foundation
import UIKit

/// Whether the app is in the background, for code that draws with the GPU on its own threads (the export's
/// compositor, the cut-out and steady renders). iOS does not let a background app use the GPU ("the system prevents
/// those commands from executing", Metal: Preparing your Metal app to run in the background), and Core Image does not
/// say so when it draws into a pixel buffer — so nothing drawn while the app was away is trusted.
///
/// `background` turns true when the app has ENTERED the background and false when it is ACTIVE again (not merely on
/// its way to the front); `leaves` counts the times it left. Both are read under a lock from any thread and written
/// on the main thread, in the notifications themselves (their observers run on the posting thread, so the flag is
/// set before UIKit goes on).
final class ExportPause: @unchecked Sendable {
  static let shared = ExportPause()

  private let lock = NSLock()
  private var background = false   // guarded by `lock`
  private var leaves = 0           // guarded by `lock`
  private var watching = false     // guarded by `lock`

  private init() {}

  /// Starts watching the app's state. Called when the module is created; a second call does nothing.
  func watch() {
    lock.lock()
    let first = !watching
    watching = true
    lock.unlock()
    guard first else { return }
    let center = NotificationCenter.default
    _ = center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: nil) { [weak self] (_: Notification) -> Void in
      self?.set(background: true)
    }
    _ = center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: nil) { [weak self] (_: Notification) -> Void in
      self?.set(background: false)
    }
    // An app that was started in the background (it is not, by a tap — but the flag must be right whatever started it).
    DispatchQueue.main.async {
      if UIApplication.shared.applicationState == .background { self.set(background: true) }
    }
  }

  private func set(background now: Bool) {
    lock.lock()
    let changed = background != now
    background = now
    if changed && now { leaves += 1 }
    lock.unlock()
  }

  /// Whether the app is in the background now.
  var isBackground: Bool {
    lock.lock(); defer { lock.unlock() }
    return background
  }

  /// How often the app has gone to the background so far. Kept before a piece of work and asked again after it
  /// (`hasLeft`): the same number, with the app in front, means the app was in front for all of it.
  var leaveCount: Int {
    lock.lock(); defer { lock.unlock() }
    return leaves
  }

  /// Whether the app is in the background now or has been since `count` was read.
  func hasLeft(since count: Int) -> Bool {
    lock.lock(); defer { lock.unlock() }
    return background || leaves != count
  }
}

/// An export (or a copy made for it) that did not fail by itself: it was ended, or could not be trusted, because the
/// app was in the background during it. The app tells it apart from a failure by `code` and starts the work again.
enum ExportInterruption {
  /// The `code` of the export's `error` event, and what a copy's rejection code ends in.
  static let code = "interrupted"
  /// What the message of an interrupted export starts with.
  static let prefix = "export interrupted: "
  static let domain = "ClipyInterrupted"

  /// The error a frame is failed with when it cannot be drawn with the app in front (`ClipyCompositor.startRequest`).
  static func frameError() -> NSError {
    return NSError(domain: domain, code: 2, userInfo: [NSLocalizedDescriptionKey: "A frame was drawn while Clipy was in the background"])
  }

  /// The `error` event of an export that ended with `message`. With the app in front for all of it (`left` false)
  /// this is the event as it always was, key for key; otherwise it carries the code and the prefix.
  static func event(jobId: String, message: String, left: Bool) -> [String: Any] {
    guard left else { return ["jobId": jobId, "type": "error", "message": message] }
    return ["jobId": jobId, "type": "error", "code": code, "message": prefix + message]
  }
}
