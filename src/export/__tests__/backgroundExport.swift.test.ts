import { readFileSync } from "fs";
import { join } from "path";

/**
 * The native half of "background export", read as text: there is no Swift toolchain on this machine, so these pin the contracts
 * the JavaScript relies on and the rules the Swift must keep (what a successful frame is made of is untouched; every exit ends what
 * it began; nothing newer than iOS 16.4 outside `#available`).
 */
const IOS = join(__dirname, "..", "..", "..", "modules", "clipy-video", "ios");
const read = (file: string): string => readFileSync(join(IOS, file), "utf8").replace(/\r\n/g, "\n");
const between = (source: string, from: string, to: string): string => {
  const a = source.indexOf(from);
  expect({ from, found: a >= 0 }).toEqual({ from, found: true });
  const b = source.indexOf(to, a + from.length);
  expect({ to, found: b > a }).toEqual({ to, found: true });
  return source.slice(a, b + to.length);
};
const background = read("ExportBackground.swift");
const compositor = read("ClipyCompositor.swift");
const session = read("ExportSession.swift");
const moduleFile = read("ClipyVideoModule.swift");
const inOrder = (text: string, parts: string[]): void => {
  let at = -1;
  for (const part of parts) {
    const next = text.indexOf(part, at + 1);
    expect({ part, found: next > at }).toEqual({ part, found: true });
    at = next;
  }
};

describe("the app's state, known on every thread", () => {
  test("the flag turns on when the app has entered the background and off only when it is active again; both under the lock", () => {
    const watch = between(background, "  func watch() {", "\n  }\n");
    inOrder(watch, ["UIApplication.didEnterBackgroundNotification", "self?.set(background: true)", "UIApplication.didBecomeActiveNotification", "self?.set(background: false)"]);
    expect(watch).not.toContain("willEnterForeground");
    const set = between(background, "  private func set(background now: Bool) {", "\n  }\n");
    inOrder(set, ["lock.lock()", "background = now", "leaves += 1", "lock.unlock()"]);
    expect(between(background, "  func hasLeft(since count: Int) -> Bool {", "\n  }\n")).toContain("return background || leaves != count");
    expect(moduleFile).toMatch(/OnCreate \{\n\s+ExportPause\.shared\.watch\(\)/);
  });

  test("UIApplication is only ever asked on the main thread", () => {
    const lines = background.split("\n");
    lines.forEach((line, i) => {
      if (!line.includes("UIApplication.shared")) return;
      // the line is inside a block handed to the main queue (or the expiration handler, which UIKit calls on the main thread)
      const before = lines.slice(Math.max(0, i - 12), i).join("\n");
      expect({ line: line.trim(), onMain: /DispatchQueue\.main\.async \{|\/\/ main thread only/.test(before) }).toEqual({ line: line.trim(), onMain: true });
    });
  });
});

describe("a frame's outcome is known", () => {
  const body = between(compositor, "  func startRequest(", "\n  }\n");

  test("what a good frame is made of is untouched: the same context, the same render call into the same buffer, then the same finish", () => {
    expect(compositor).toContain("  private let ctx = CIContext(options: [.cacheIntermediates: false])");
    expect(body).toContain("    ctx.render(result.cropped(to: rect).composited(over: black), to: out)\n");
    expect(body.match(/ctx\.render\(/g)).toHaveLength(1);
    expect(body.match(/req\.finish\(withComposedVideoFrame: out\)/g)).toHaveLength(1);
    expect(body.trimEnd().endsWith("req.finish(withComposedVideoFrame: out)\n  }")).toBe(true);
  });

  test("a frame that was not drawn with the app in front all the way is never handed on", () => {
    inOrder(body, ["if hold(req) { return }", "let leaves = ExportPause.shared.leaveCount", "guard let inst = req.videoCompositionInstruction", "ctx.render(", "guard ClipyCompositor.drawnInFront(since: leaves) else {", "if hold(req) { return }", "req.finish(with: ExportInterruption.frameError())", "return", "req.finish(withComposedVideoFrame: out)"]);
    expect(between(compositor, "  static func drawnInFront(since leaves: Int) -> Bool {", "\n  }\n")).toContain("return !ExportPause.shared.hasLeft(since: leaves)");
  });
});

describe("an interrupted export says so", () => {
  test("the event of a failure in front is the old one, key for key; after the app was away it carries the code and the prefix", () => {
    const event = between(background, "  static func event(jobId: String, message: String, left: Bool) -> [String: Any] {", "\n  }\n");
    expect(event).toContain('guard left else { return ["jobId": jobId, "type": "error", "message": message] }');
    expect(event).toContain('return ["jobId": jobId, "type": "error", "code": code, "message": prefix + message]');
    expect(background).toContain('static let code = "interrupted"');
    expect(background).toContain('static let prefix = "export interrupted: "');
  });

  test("both ways an export fails ask whether the app was away, and the partial file is removed as before", () => {
    const end = between(session, "      default:\n        try? FileManager.default.removeItem(at: outputURL)\n", "      }\n");
    expect(end).toContain('let message = ExportSession.describe(session.error) + " {" + facts + "}"');
    expect(end).toContain("self.onEvent(ExportInterruption.event(jobId: jobId, message: message, left: ExportPause.shared.hasLeft(since: leaves)))");
    expect(session).toContain("  let leavesAtStart = ExportPause.shared.leaveCount\n");
    const thrown = between(moduleFile, "        } catch {\n          ExportSession.removeFile(atPath: outputPath)\n", "          self?.dropSession(jobId)\n");
    expect(thrown).toContain('ExportInterruption.event(jobId: jobId, message: "start: " + ExportSession.describe(error), left: left)');
    // done and cancelled are what they were
    expect(session).toContain('self.onEvent(["jobId": jobId, "type": "done", "fileUri": outputURL.absoluteString])');
    expect(session).toContain('        try? FileManager.default.removeItem(at: outputURL)\n        self.onEvent(["jobId": jobId, "type": "cancelled"])');
  });
});

describe("in the background the frames WAIT (they are neither drawn nor finished), and go on by themselves", () => {
  test("deciding and keeping are one step under the lock; the waiting frames are drawn when the app is active again, off the main thread", () => {
    const hold = between(background, "  func hold(_ frame: HeldFrame) -> Bool {", "\n  }\n");
    inOrder(hold, ["lock.lock()", "let keep = background", "if keep { held.append(frame) }", "lock.unlock()", "return keep"]);
    const set = between(background, "  private func set(background now: Bool) {", "\n  }\n");
    inOrder(set, ["lock.lock()", "if !now {", "waiting = held", "held = []", "lock.unlock()", "drawing.async {", "for frame in waiting { frame.draw() }"]);
    expect(background).toContain('private let drawing = DispatchQueue(label: "clipy.export.held")');
  });

  test("the compositor keeps a request with how to draw it again and how to give it back; a cancel gives every waiting one back", () => {
    const keep = between(compositor, "  private func hold(_ req: AVAsynchronousVideoCompositionRequest) -> Bool {", "\n  }\n");
    expect(keep).toContain("owner: ObjectIdentifier(self)");
    expect(keep).toContain("draw: { self.startRequest(req) }");
    expect(keep).toContain("cancel: { req.finishCancelledRequest() }");
    const cancel = between(compositor, "  func cancelAllPendingVideoCompositionRequests() {", "\n  }\n");
    expect(cancel).toContain("for frame in ExportPause.shared.release(owner: ObjectIdentifier(self)) { frame.cancel() }");
    const release = between(background, "  func release(owner: ObjectIdentifier) -> [HeldFrame] {", "\n  }\n");
    inOrder(release, ["lock.lock()", "held.filter", "held.removeAll", "return own"]);
  });

  test("a flag that is ever wrong is put right by asking the app itself, on the main thread", () => {
    const confirm = between(background, "  private func confirm() {", "\n  }\n");
    inOrder(confirm, ["DispatchQueue.main.async {", "UIApplication.shared.applicationState == .active", "self.set(background: false)"]);
  });
});

describe("a cut-out or steady copy made while the app was away is never kept", () => {
  test("leaving stops every copy being made, and each answers as interrupted, not as cancelled", () => {
    expect(moduleFile).toContain("      ExportPause.shared.onChange { [weak self] (left: Bool) -> Void in\n        if left { self?.interruptCopies() }\n      }");
    const stop = between(moduleFile, "  private func interruptCopies() {", "\n  }\n");
    inOrder(stop, ["let cutouts = cutoutJobs", "let steadies = steadyJobs", "leftJobs.insert(id)", "for job in cutouts.values { job.cancel() }", "for job in steadies.values { job.cancel() }"]);
    expect(stop).not.toContain("soundJobs");                                    // sound copies do not use the GPU: they go on
    expect(moduleFile.match(/if self\?\.takeLeft\(jobId\) == true \{\n\s+promise\.reject\("E_(CUTOUT|STEADY)_INTERRUPTED"/g)).toHaveLength(3);
    expect(moduleFile.match(/promise\.reject\("E_CUTOUT_CANCELLED", "Cutout cancelled"\)/g)).toHaveLength(1);
    expect(moduleFile.match(/promise\.reject\("E_STEADY_CANCELLED", "Steady cancelled"\)/g)).toHaveLength(2);
  });

  test("each of the three renders reads the count first, is not started in the background, and a finished copy is checked BEFORE it is answered and removed if the app was away", () => {
    for (const name of ["renderCutout", "measureShake", "renderSteady"]) {
      const body = between(moduleFile, `    AsyncFunction("${name}")`, "\n    }\n");
      const kind = name === "renderCutout" ? "CUTOUT" : "STEADY";
      inOrder(body, ["let leaves = ExportPause.shared.leaveCount", "if ExportPause.shared.isBackground {", `promise.reject("E_${kind}_INTERRUPTED"`, "return", "do {", "if ExportPause.shared.hasLeft(since: leaves) {", `promise.reject("E_${kind}_INTERRUPTED"`, "return", "promise.resolve(answer)"]);
      if (name !== "measureShake") expect(between(body, "if ExportPause.shared.hasLeft(since: leaves) {", "return")).toContain("ExportSession.removeFile(atPath: request.outputPath)");
    }
    expect(between(moduleFile, '    AsyncFunction("renderCutout")', "\n    }\n")).toContain("if !request.stillPath.isEmpty { ExportSession.removeFile(atPath: request.stillPath) }");
    expect(moduleFile).toContain('return kind + " interrupted: Clipy was in the background while the copy was made"');
  });

  test("the render files themselves are untouched", () => {
    for (const file of ["CutoutRender.swift", "SteadyRender.swift", "MediaPrePass.swift", "SoundRender.swift"]) expect(read(file)).not.toContain("ExportPause");
  });
});

describe("the grace period on every iOS", () => {
  const begin = between(background, "  private func beginGrace(_ runId: String) {", "\n  }\n");
  const take = between(background, "  private func takeGrace() -> UIBackgroundTaskIdentifier {", "\n  }\n");

  test("the task is begun with a name and an expiration handler, on the main thread, when the export begins", () => {
    inOrder(begin, ["DispatchQueue.main.async {", "self.graceRun = runId", 'UIApplication.shared.beginBackgroundTask(withName: "Clipy export") {']);
    expect(between(background, "  func begin(runId: String,", "\n  }\n")).toContain("beginGrace(runId)");
    expect(between(background, "  func end(runId: String, success: Bool) {", "\n  }\n")).toContain("endGrace(runId)");
  });

  test("endBackgroundTask on EVERY path, exactly once: the id is handed out once, and whoever holds a valid one ends it", () => {
    inOrder(take, ["let id = grace", "grace = .invalid", "return id"]);
    // every end is fed by the id that was taken (never by the stored one), and only a valid id is ended
    const ends = background.split("\n").filter((l) => l.includes("UIApplication.shared.endBackgroundTask("));
    expect(ends).toHaveLength(4);
    for (const line of ends) expect(line.trim()).toMatch(/^if (stale|expired|id) != \.invalid \{ UIApplication\.shared\.endBackgroundTask\((stale|expired|id)\) \}$|^UIApplication\.shared\.endBackgroundTask\(id\)$/);
    // a run before this one; the expiration handler; the handler having run before the id was stored; the end of the export
    inOrder(begin, ["let stale = self.takeGrace()", "endBackgroundTask(stale)", "let expired = self.takeGrace()", "endBackgroundTask(expired)", "if self.graceOpen {", "self.grace = id", "} else if id != .invalid {", "endBackgroundTask(id)"]);
    const end = between(background, "  private func endGrace(_ runId: String) {", "\n  }\n");
    inOrder(end, ["DispatchQueue.main.async {", "guard self.graceRun == runId else { return }", "let id = self.takeGrace()", "endBackgroundTask(id)"]);
    // the stored id is written in one place
    expect(background.match(/self\.grace = /g)).toHaveLength(1);
  });

  test("the expiration does not cancel the export, and the frames still wait in that time (the GPU rule holds)", () => {
    const handler = between(begin, 'beginBackgroundTask(withName: "Clipy export") {', "\n      }\n");
    expect(handler).not.toMatch(/cancel\(|onEvent/);
    expect(between(compositor, "  func startRequest(", "\n  }\n")).not.toContain("ExportKeepAlive");
  });

  test("the three functions of the module and its event are there under the names the JavaScript asks for", () => {
    expect(moduleFile).toContain('Events("onExportEvent", "onSoundEvent", "onCutoutEvent", "onSteadyEvent", "onBackgroundExportEvent")');
    expect(moduleFile).toContain('AsyncFunction("beginBackgroundExport") { (runId: String, title: String, subtitle: String, promise: Promise) in');
    expect(moduleFile).toContain('Function("reportBackgroundExport") { (runId: String, progress: Double) in');
    expect(moduleFile).toContain('Function("endBackgroundExport") { (runId: String, success: Bool) in');
    expect(moduleFile).toContain('self?.sendEvent("onBackgroundExportEvent", ["runId": runId, "type": type])');
    const js = readFileSync(join(IOS, "..", "background.ts"), "utf8");
    for (const name of ["beginBackgroundExport", "reportBackgroundExport", "endBackgroundExport", "onBackgroundExportEvent"]) expect(js).toContain(name);
  });
});
