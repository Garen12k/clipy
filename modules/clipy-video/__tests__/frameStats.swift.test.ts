import { readFileSync } from "fs";
import { join } from "path";

// There is no Swift compiler on this machine: these tests READ the Swift and pin what the app relies on.
const root = join(__dirname, "../../..");
const iosDir = join(root, "modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const swift = code(read("FrameStats.swift"));
const moduleSwift = code(read("ClipyVideoModule.swift"));
const wrapper = readFileSync(join(root, "modules/clipy-video/frameStats.ts"), "utf8");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const inOrder = (body: string, parts: string[]) => {
  let at = -1;
  for (const p of parts) { const i = body.indexOf(p, at + 1); expect(i).toBeGreaterThan(at); at = i; }
};

test("the request record has exactly the fields the app sends; the answer the keys the app reads", () => {
  const record = between(swift, "struct FrameStatsRequest: Record {", "\n}");
  const fields = [...record.matchAll(/@Field var (\w+)/g)].map((m) => m[1]).sort();
  const sent = [...between(wrapper, "export interface FrameStatsRequest {", "}").matchAll(/(\w+): /g)].map((m) => m[1]).sort();
  expect(fields).toEqual(sent);
  expect(fields).toEqual(["jobId", "kind", "maxSide", "times", "uri"]);
  expect(record).toContain("@Field var times: [Double] = []");
  expect(record).toContain("@Field var maxSide: Double = 0");
  const frame = [...between(wrapper, "export interface FrameStat {", "}").matchAll(/(\w+): /g)].map((m) => m[1]).sort();
  const counted = between(swift, "static func count(", "\n  }\n");
  for (const k of frame.filter((k) => k !== "time")) expect(counted).toContain(`"${k}": `);
  expect(swift).toContain('frame["time"] = ');
  expect(swift.match(/return \["frames": frames, "failed": failed\]/g)).toHaveLength(1);
  expect(swift).toContain('return ["frames": [frame], "failed": 0]');
});

test("pixels are counted on gamma values in sRGB, Rec. 709 weights, 64 bins, see-through pixels left out", () => {
  expect(swift).toContain("static let bins: Int = 64");
  expect(swift).toContain("static let red: Double = 0.2126");
  expect(swift).toContain("static let green: Double = 0.7152");
  expect(swift).toContain("static let blue: Double = 0.0722");
  expect(swift).toContain("static let opaque: UInt8 = 128");
  const measure = between(swift, "static func measure(", "\n  }\n");
  expect(measure).toContain("CGColorSpace(name: CGColorSpace.sRGB)");
  expect(measure).toContain("CGImageAlphaInfo.premultipliedLast.rawValue");
  expect(measure).toContain("bitsPerComponent: 8");
  const counted = between(swift, "static func count(", "\n  }\n");
  expect(counted).toContain("if a < opaque { continue }");
  expect(counted).toContain("let r = min(1, Double(data[o]) / cover)");
  expect(counted).toContain("let bin = min(bins - 1, max(0, Int(luma * Double(bins))))");
  expect(counted).toContain("sumChroma += max(r, g, b) - min(r, g, b)");
  // Counted in Swift, not by Core Image: nothing of Core Image in this file.
  expect(swift).not.toMatch(/CIContext|CIFilter|CIImage|Adjust\.filtered/);
});

test("frames are read upright, scaled, near the asked time; a photo with its orientation applied", () => {
  const video = between(swift, "static func video(", "\n  }\n");
  inOrder(video, ["let asset = AVURLAsset(url: url)", "try await asset.loadTracks(withMediaType: .video)", "try await asset.load(.duration)",
    "let generator = AVAssetImageGenerator(asset: asset)", "generator.appliesPreferredTrackTransform = true",
    "generator.maximumSize = CGSize(width: side, height: side)", "generator.requestedTimeToleranceBefore = slack",
    "generator.requestedTimeToleranceAfter = slack", "guard job.attach(generator) else { throw StatsError.cancelled }",
    "try await generator.image(at: ExportSession.time(t))"]);
  expect(swift).toContain("static let tolerance: Double = 0.25");
  expect(swift).not.toContain("copyCGImage");
  expect(video).toContain('guard !frames.isEmpty else { throw StatsError.failed("stats frames: no frame could be read") }');
  const photo = between(swift, "static func photo(", "\n  }\n");
  expect(photo).toContain("kCGImageSourceCreateThumbnailWithTransform: true");
  expect(photo).toContain("kCGImageSourceThumbnailMaxPixelSize: side");
});

test("every number is bounded before it becomes an Int; the times are clamped to the file", () => {
  const side = between(swift, "static func clampSide(", "\n  }\n");
  expect(side.indexOf("guard asked.isFinite, asked > 0 else { return defaultSide }")).toBeLessThan(side.indexOf("Int(whole)"));
  expect(swift).toContain("static let fewestSide: Int = 16");
  expect(swift).toContain("static let mostSide: Int = 1024");
  expect(swift).toContain("static let defaultSide: Int = 256");
  expect(swift).toContain("static let mostTimes: Int = 10");
  const times = between(swift, "static func clampTimes(", "\n  }\n");
  expect(times).toContain("for t in asked.prefix(mostTimes) where t.isFinite { times.append(min(max(0, t), last)) }");
  expect(between(swift, "static func video(", "\n  }\n")).toContain("guard total > 0 else");
});

test("the module: job stored first, the background checks in order, the promise answered exactly once", () => {
  const fn = between(moduleSwift, 'AsyncFunction("frameStats")', '\n    Function("cancelFrameStats")');
  expect(fn).toContain("(request: FrameStatsRequest, promise: Promise) in");
  expect(fn.indexOf("self.storeStatsJob(jobId, job)")).toBeLessThan(fn.indexOf("Task { [weak self] in"));
  expect(fn).toContain("defer { self?.dropStatsJob(jobId) }");
  inOrder(fn, ["let leaves = ExportPause.shared.leaveCount", "if ExportPause.shared.isBackground {", 'promise.reject("E_STATS_INTERRUPTED"', "return",
    "do {", "let answer: [String: Any] = try await FrameStats.run(request, job: job)", "if ExportPause.shared.hasLeft(since: leaves) {",
    'promise.reject("E_STATS_INTERRUPTED"', "return", "promise.resolve(answer)",
    "} catch StatsError.cancelled {", 'promise.reject("E_STATS_CANCELLED", "Stats cancelled")', "} catch {",
    "if ExportPause.shared.hasLeft(since: leaves) {", 'promise.reject("E_STATS_INTERRUPTED"', "} else {", 'promise.reject("E_STATS", FrameStats.message(error))']);
  expect(fn.split("promise.resolve(").length - 1).toBe(1);
  expect(fn.split("promise.reject(").length - 1).toBe(5);
  expect(fn).not.toContain("takeLeft");
  expect(between(moduleSwift, 'Function("cancelFrameStats")', "\n    }\n")).toContain("self.lookupStatsJob(jobId)?.cancel()");
  expect(moduleSwift).toContain("private var statsJobs: [String: StatsJob] = [:]");
  // Not a copy: the background's stop of the cut-out and steady copies is unchanged.
  expect(between(moduleSwift, "  private func interruptCopies() {", "\n  }\n")).not.toContain("stats");
  expect(wrapper).toContain('export function isFrameStatsAvailable(): boolean { return typeof optional()?.frameStats === "function"; }');
});

test("nothing newer than iOS 16.4: no availability checks needed, none written", () => {
  expect(swift).not.toMatch(/#available|@available/);
  expect(read("ClipyVideo.podspec")).toContain("s.platforms      = { :ios => '16.4' }");
});
