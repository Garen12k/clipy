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
  private var held: [HeldFrame] = []                // guarded by `lock`: the frames that wait for the app to be in front
  private var watchers: [(Bool) -> Void] = []       // guarded by `lock`: told each change (true = left), on the main thread
  /// Where the frames that waited are drawn, one after the other, once the app is in front again.
  private let drawing = DispatchQueue(label: "clipy.export.held")

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
    var waiting: [HeldFrame] = []
    if !now {
      waiting = held
      held = []
    }
    let tell: [(Bool) -> Void] = changed ? watchers : []
    lock.unlock()
    if !waiting.isEmpty {
      drawing.async {
        for frame in waiting { frame.draw() }
      }
    }
    for watcher in tell { watcher(now) }
  }

  /// `watcher` is called with true when the app has entered the background and with false when it is active again
  /// (on the main thread, after the flag has changed). Never removed: the callers live as long as the app.
  func onChange(_ watcher: @escaping (Bool) -> Void) {
    lock.lock()
    watchers.append(watcher)
    lock.unlock()
  }

  /// Keeps `frame` for as long as the app is in the background: true = kept (the caller must neither draw nor finish
  /// it now; it is drawn when the app is active again, or given back by `release`), false = the app is in front and
  /// nothing was kept. Deciding and keeping are one step under the lock, so a frame cannot be kept just after the
  /// waiting ones were let go.
  func hold(_ frame: HeldFrame) -> Bool {
    lock.lock()
    let keep = background
    if keep { held.append(frame) }
    lock.unlock()
    // Should the flag ever be wrong (a notification that did not come), the app's own answer puts it right.
    if keep { confirm() }
    return keep
  }

  /// The frames `owner` has waiting, taken out: its export was cancelled, and each must be given back (`cancel`).
  func release(owner: ObjectIdentifier) -> [HeldFrame] {
    lock.lock(); defer { lock.unlock() }
    let own = held.filter { (frame: HeldFrame) -> Bool in frame.owner == owner }
    held.removeAll { (frame: HeldFrame) -> Bool in frame.owner == owner }
    return own
  }

  /// How many frames wait now.
  var heldCount: Int {
    lock.lock(); defer { lock.unlock() }
    return held.count
  }

  /// Asks the app itself, on the main thread, whether it is active — and if it is while the flag says background,
  /// the flag is put right (and the waiting frames are drawn).
  private func confirm() {
    DispatchQueue.main.async {
      if UIApplication.shared.applicationState == .active { self.set(background: false) }
    }
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

/// A frame the export's compositor could not draw because the app was in the background: how to draw it once the app
/// is in front again, and how to give it back unfinished when its export is cancelled. `owner` is the compositor.
struct HeldFrame {
  let owner: ObjectIdentifier
  let draw: () -> Void
  let cancel: () -> Void
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

/// Keeps the app alive for one export after it is left — one export at a time, from the tap on Export (the
/// preparations included) to its end. On every iOS: the short time UIKit gives a task that was begun before the app
/// was left (`beginBackgroundTask`; Apple states no length). The frames of the video still wait while the app is in
/// the background (`ExportPause`): this time lets the parts that need no GPU finish — a sound copy, the last writes
/// of a file — and lets the export say what happened before the app is suspended.
final class ExportKeepAlive: @unchecked Sendable {
  static let shared = ExportKeepAlive()

  private var graceRun: String?                                      // main thread only
  private var grace: UIBackgroundTaskIdentifier = .invalid           // main thread only
  private var graceOpen = false                                      // main thread only

  private init() {}

  /// The export `runId` begins. Answers what was asked of the phone: `grace` (always), `continued` and, when that is
  /// false, the `reason`.
  func begin(runId: String, title: String, subtitle: String, onEvent: @escaping (String) -> Void) -> [String: Any] {
    beginGrace(runId)
    return ["grace": true, "continued": false, "reason": "not asked"]
  }

  /// The export's progress, 0 … 1.
  func report(runId: String, progress value: Double) {}

  /// The export `runId` is over (done, failed or cancelled). A second call, or one for another run, does nothing.
  func end(runId: String, success: Bool) {
    endGrace(runId)
  }

  /// Asks UIKit for time in the background for this export. A run before it that never said it was over is ended
  /// first. The task is ended exactly once: by `endGrace`, by the next `beginGrace`, or by its own expiration handler
  /// (which UIKit calls on the main thread shortly before the time is up) — whichever takes the id first (`takeGrace`).
  private func beginGrace(_ runId: String) {
    DispatchQueue.main.async {
      // main thread only
      let stale = self.takeGrace()
      if stale != .invalid { UIApplication.shared.endBackgroundTask(stale) }
      self.graceRun = runId
      self.graceOpen = true
      let id = UIApplication.shared.beginBackgroundTask(withName: "Clipy export") {
        // main thread only: the time is up. The export is not cancelled: the app is suspended and goes on when it is opened.
        let expired = self.takeGrace()
        if expired != .invalid { UIApplication.shared.endBackgroundTask(expired) }
      }
      // The handler may already have run (iOS could not give the time): then nothing is kept, and the id is ended here.
      if self.graceOpen {
        self.grace = id
      } else if id != .invalid {
        UIApplication.shared.endBackgroundTask(id)
      }
    }
  }

  private func endGrace(_ runId: String) {
    DispatchQueue.main.async {
      // main thread only
      guard self.graceRun == runId else { return }
      let id = self.takeGrace()
      if id != .invalid { UIApplication.shared.endBackgroundTask(id) }
    }
  }

  /// Hands the task's id out ONCE (after it there is none): whoever gets a valid id ends the task. Main thread only.
  private func takeGrace() -> UIBackgroundTaskIdentifier {
    let id = grace
    grace = .invalid
    graceRun = nil
    graceOpen = false
    return id
  }
}
