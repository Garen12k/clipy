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
    inOrder(body, ["let leaves = ExportPause.shared.leaveCount", "guard let inst = req.videoCompositionInstruction", "ctx.render(", "guard ClipyCompositor.drawnInFront(since: leaves) else {", "req.finish(with: ExportInterruption.frameError())", "return", "req.finish(withComposedVideoFrame: out)"]);
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
