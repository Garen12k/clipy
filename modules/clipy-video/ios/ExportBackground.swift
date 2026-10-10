import AVFoundation
import Foundation
import UIKit
#if canImport(BackgroundTasks)
import BackgroundTasks
#endif

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
      guard let self else { return }
      self.set(background: true)
    }
    _ = center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: nil) { [weak self] (_: Notification) -> Void in
      guard let self else { return }
      self.set(background: false)
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
    // The frames that waited are let go only when the app is active again.
    let waiting: [HeldFrame] = now ? [] : held
    if !now { held = [] }
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
/// was left (`beginBackgroundTask`; Apple states no length). On iOS 26 and later also a continued processing task
/// (`ContinuedExport`): the app stays alive while the person is elsewhere, and the system shows the export's title
/// and progress with its own control to stop it. NO GPU is asked for and the app has no entitlement for it, so the
/// frames of the video still wait while the app is in the background (`ExportPause`): what goes on there is what
/// needs no GPU — a sound copy, the last writes of a file — and the export saying what happened.
///
/// The export never depends on any of it: a task that is refused, never handed over, or ended by the system leaves
/// the export exactly as it would be without one.
final class ExportKeepAlive: @unchecked Sendable {
  static let shared = ExportKeepAlive()

  /// The steps of the task's `Progress`: a thousand, so the system's display moves as finely as the ring.
  static let units: Int64 = 1000
  /// The task's second line while the app is in the background and the video waits.
  static let pausedSubtitle = "Paused. Open Clipy to go on."
  /// The export counts as moving when its progress last went up less than this long ago (`expired`).
  static let movingSeconds: Double = 5

  private var graceRun: String?                                      // main thread only
  private var grace: UIBackgroundTaskIdentifier = .invalid           // main thread only
  private var graceOpen = false                                      // main thread only

  private let lock = NSLock()
  private var runId: String?                        // guarded by `lock`: the export that is kept alive now
  private var outcome: Bool?                        // guarded by `lock`: set once that export has said it is over
  private var progress: Double = 0                  // guarded by `lock`
  private var lastStep = Date.distantPast           // guarded by `lock`: when the progress last went up
  private var title = ""                            // guarded by `lock`
  private var subtitle = ""                         // guarded by `lock`
  private var onEvent: ((String) -> Void)?          // guarded by `lock`
  /// The system's task once it has been handed over (a `BGContinuedProcessingTask`; iOS 26 and later). Guarded by
  /// `lock`, and TAKEN (set to nil) by whoever completes it, so it is completed exactly once.
  private var task: AnyObject?

  private init() {
    ExportPause.shared.onChange { [weak self] (left: Bool) -> Void in
      guard let self else { return }
      self.appChanged(left: left)
    }
  }

  /// The export `runId` begins (the tap on Export, the app in front). Answers what was asked of the phone: `grace`
  /// (always), `continued` and, when that is false, the `reason`. A run before it that never said it was over is
  /// ended first.
  func begin(runId: String, title: String, subtitle: String, onEvent: @escaping (String) -> Void) -> [String: Any] {
    lock.lock()
    let stale = task
    task = nil
    self.runId = runId
    self.outcome = nil
    self.progress = 0
    self.lastStep = Date()
    self.title = title
    self.subtitle = subtitle
    self.onEvent = onEvent
    lock.unlock()
    complete(stale, success: false)
    beginGrace(runId)
    var continued = false
    var reason = "needs iOS 26"
    #if canImport(BackgroundTasks) && compiler(>=6.2)
    if #available(iOS 26.0, *) {
      reason = ContinuedExport.submit(runId: runId, title: title, subtitle: subtitle, keeper: self)
      continued = reason.isEmpty
    }
    #else
    reason = "built without the continued task"
    #endif
    return ["grace": true, "continued": continued, "reason": reason]
  }

  /// The export's progress, 0 … 1, preparations included: passed on to the system's display. Nothing for another
  /// run, or once the export is over.
  func report(runId: String, progress value: Double) {
    guard value.isFinite else { return }
    let now = max(0, min(1, value))
    lock.lock()
    guard self.runId == runId, outcome == nil else {
      lock.unlock()
      return
    }
    if now > progress { lastStep = Date() }
    progress = now
    let held = task
    lock.unlock()
    show(held, progress: now)
  }

  /// The export `runId` is over (done, failed or cancelled): the grace task is ended and the system's task is
  /// completed — both once. A second call, or one for another run, does nothing.
  func end(runId: String, success: Bool) {
    lock.lock()
    guard self.runId == runId, outcome == nil else {
      lock.unlock()
      return
    }
    outcome = success
    let held = task
    task = nil
    onEvent = nil
    lock.unlock()
    endGrace(runId)
    complete(held, success: success)
  }

  /// The system's task was ended from outside (its expiration handler): by the person, with the system's own stop
  /// control, or by the system itself — a task that reports no progress is expired, and iOS does not say which it
  /// was. The task is completed here, once. What the export does: it is CANCELLED, as by the app's own Cancel, only
  /// when the app is in the background AND the export was moving — then nothing but the person's stop is likely.
  /// In every other case (the video waiting in the background, or the app in front) the export is left alone: the
  /// app is suspended as it would be without a task, and the export goes on when Clipy is opened.
  private func expired(runId: String) {
    lock.lock()
    guard self.runId == runId, outcome == nil, let held = task else {
      lock.unlock()
      return
    }
    task = nil
    let moving = Date().timeIntervalSince(lastStep) < ExportKeepAlive.movingSeconds
    let tell = onEvent
    lock.unlock()
    let away = ExportPause.shared.isBackground
    complete(held, success: false)
    tell?(away && moving ? "cancel" : "expired")
  }

  /// The app went to the background (`left`) or is active again: the task's second line says that the video waits.
  private func appChanged(left: Bool) {
    lock.lock()
    let held = task
    let first = title
    let second = left ? ExportKeepAlive.pausedSubtitle : subtitle
    lock.unlock()
    #if canImport(BackgroundTasks) && compiler(>=6.2)
    if #available(iOS 26.0, *), let continued = held as? BGContinuedProcessingTask {
      continued.updateTitle(first, subtitle: second)
    }
    #endif
  }

  /// Completes the system's task, if there is one. Callers hand in a task they TOOK (`task = nil` under the lock).
  private func complete(_ held: AnyObject?, success: Bool) {
    #if canImport(BackgroundTasks) && compiler(>=6.2)
    if #available(iOS 26.0, *), let continued = held as? BGContinuedProcessingTask {
      if success { continued.progress.completedUnitCount = continued.progress.totalUnitCount }
      continued.setTaskCompleted(success: success)
    }
    #endif
  }

  private func show(_ held: AnyObject?, progress now: Double) {
    #if canImport(BackgroundTasks) && compiler(>=6.2)
    if #available(iOS 26.0, *), let continued = held as? BGContinuedProcessingTask {
      continued.progress.completedUnitCount = Int64((now * Double(ExportKeepAlive.units)).rounded())
    }
    #endif
  }

  #if canImport(BackgroundTasks) && compiler(>=6.2)
  /// The system hands the task over (the launch handler of `ContinuedExport.submit`). It is kept for the export it
  /// was asked for; one whose export is already over (or is another's) is completed at once.
  @available(iOS 26.0, *)
  func attach(_ continued: BGContinuedProcessingTask, runId: String) {
    lock.lock()
    let mine = self.runId == runId && outcome == nil && task == nil
    if mine { task = continued }
    let now = progress
    lock.unlock()
    guard mine else {
      continued.setTaskCompleted(success: false)
      return
    }
    continued.progress.totalUnitCount = ExportKeepAlive.units
    continued.progress.completedUnitCount = Int64((now * Double(ExportKeepAlive.units)).rounded())
    continued.expirationHandler = { [weak self] () -> Void in
      guard let self else { return }
      self.expired(runId: runId)
    }
  }
  #endif

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

#if canImport(BackgroundTasks) && compiler(>=6.2)
/// The continued processing task of iOS 26 (`BGContinuedProcessingTask`) for an export: registered and submitted
/// when the export begins, as Apple's article does for this kind of task (not at launch). Everything that names a
/// BackgroundTasks symbol newer than iOS 16.4 is in this file, behind `#available(iOS 26.0, *)`, and behind
/// `compiler(>=6.2)` so that an Xcode from before the iOS 26 SDK leaves it out instead of failing to build.
@available(iOS 26.0, *)
enum ContinuedExport {
  /// The identifier is `<bundle id>.export.<run>`; Info.plist permits `<bundle id>.export.*` (app.json).
  static let middle = ".export."
  static let permittedKey = "BGTaskSchedulerPermittedIdentifiers"
  /// Two empty files in Library: `trying` is there only while the system is being asked. Found at the next
  /// export it means the app DIED in that call, and `off` is written: the task is never asked for again by this
  /// install, and exports run as they did before it.
  static let tryingName = "clipy-continued-export-trying"
  static let offName = "clipy-continued-export-off"

  static func marker(_ name: String) -> URL? {
    return FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first?.appendingPathComponent(name)
  }

  /// Registers the launch handler for this export's own identifier and submits the request: strategy `fail` (not
  /// queued behind other tasks), no resources asked for. Answers "" when the system took it, else why not; never
  /// throws, and whatever it answers the export goes on.
  static func submit(runId: String, title: String, subtitle: String, keeper: ExportKeepAlive) -> String {
    guard let bundle = Bundle.main.bundleIdentifier else { return "no bundle id" }
    let permitted = (Bundle.main.object(forInfoDictionaryKey: permittedKey) as? [String]) ?? []
    guard permitted.contains(bundle + middle + "*") else { return "identifier not in Info.plist" }
    guard let trying = marker(tryingName), let off = marker(offName) else { return "no place for the marker" }
    let files = FileManager.default
    if files.fileExists(atPath: off.path) { return "switched off after a crash" }
    if files.fileExists(atPath: trying.path) {
      _ = files.createFile(atPath: off.path, contents: nil)
      try? files.removeItem(at: trying)
      return "switched off after a crash"
    }
    guard files.createFile(atPath: trying.path, contents: nil) else { return "no marker" }
    defer { try? files.removeItem(at: trying) }

    // The run's id with nothing but letters, digits and hyphens: an identifier of its own for every export (a second
    // registration of one identifier ends the app).
    let kept: [Unicode.Scalar] = runId.unicodeScalars.filter { (c: Unicode.Scalar) -> Bool in CharacterSet.alphanumerics.contains(c) || c == "-" }
    let run = String(String.UnicodeScalarView(kept))
    guard !run.isEmpty else { return "no run id" }
    let identifier = bundle + middle + run
    let registered = BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { (task: BGTask) -> Void in
      guard let continued = task as? BGContinuedProcessingTask else {
        task.setTaskCompleted(success: false)
        return
      }
      keeper.attach(continued, runId: runId)
    }
    guard registered else { return "not registered" }
    let request = BGContinuedProcessingTaskRequest(identifier: identifier, title: title, subtitle: subtitle)
    request.strategy = .fail
    do {
      try BGTaskScheduler.shared.submit(request)
      return ""
    } catch {
      return "submit: " + ExportSession.describe(error)
    }
  }
}
#endif
