import { readdirSync, readFileSync } from "fs";
import { join } from "path";

// There is no Swift compiler on this machine: these tests READ the Swift and pin what the app relies on.
const root = join(__dirname, "../../../..");
const iosDir = join(root, "modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const swift = code(read("SoundPeaks.swift"));
const moduleSwift = code(read("ClipyVideoModule.swift"));
const wrapper = readFileSync(join(root, "modules/clipy-video/index.ts"), "utf8");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const run = between(swift, "static func run(", "\n  }\n");
const decode = between(swift, "static func decode(", "\n  }\n}");

test("the request record has exactly the fields the app sends, and the answer the keys the app reads", () => {
  const record = between(swift, "struct SoundPeaksRequest: Record {", "\n}");
  const fields = [...record.matchAll(/@Field var (\w+)/g)].map((m) => m[1]);
  const sent = [...between(wrapper, "export interface SoundPeaksRequest {", "}").matchAll(/(\w+): /g)].map((m) => m[1]);
  expect(fields.sort()).toEqual(sent.sort());
  expect(fields.sort()).toEqual(["count", "from", "jobId", "to", "uri"]);
  // Every number is a Double: no number the app can send fails to decode, and none is turned into an Int unchecked.
  expect([...record.matchAll(/@Field var \w+: (\w+)/g)].map((m) => m[1]).sort()).toEqual(["Double", "Double", "Double", "String", "String"]);
  expect(wrapper).toContain("export interface SoundPeaksResult { peaks: number[]; from: number; to: number }");
  expect(decode).toContain('let answer: [String: Any] = ["peaks": peaks, "from": start, "to": end]');
  expect(decode).toContain("var peaks: [Double] = []");
});

test("the module has the function and its cancel, answers the promise exactly once, and keeps the job until then", () => {
  const fn = between(moduleSwift, 'AsyncFunction("soundPeaks")', "\n    }\n");
  expect(fn).toContain("(request: SoundPeaksRequest, promise: Promise) in");
  expect(fn.indexOf("self.storePeaksJob(jobId, job)")).toBeLessThan(fn.indexOf("Task { [weak self] in"));
  expect(fn).toContain("defer { self?.dropPeaksJob(jobId) }");
  expect(fn).toContain("let answer: [String: Any] = try await SoundPeaks.run(request, job: job)");
  expect(fn.split("promise.resolve(").length - 1).toBe(1);
  expect(fn.split("promise.reject(").length - 1).toBe(2);
  expect(fn).toContain('} catch PeaksError.cancelled {\n          promise.reject("E_PEAKS_CANCELLED", "Peaks cancelled")');
  expect(fn).toContain('promise.reject("E_PEAKS", SoundPeaks.message(error))');
  expect(between(moduleSwift, 'Function("cancelSoundPeaks")', "\n    }\n")).toContain("self.lookupPeaksJob(jobId)?.cancel()");
  expect(moduleSwift).toContain("private var peaksJobs: [String: PeaksJob] = [:]");
  expect(wrapper).toContain('export const PEAKS_CANCELLED = "E_PEAKS_CANCELLED";');
  expect(wrapper).toContain('export function isPeaksAvailable(): boolean { return typeof optional()?.soundPeaks === "function"; }');
});

test("the asset is held for as long as its track and its reader are used", () => {
  expect(run).toContain("let asset = AVURLAsset(url: url)");
  expect(run).toContain("try await asset.loadTracks(withMediaType: .audio)");
  expect(run).toContain("try await asset.load(.duration)");
  // `run` does not return before `decode` has, and `decode` is synchronous: the asset outlives the reader.
  expect(run).toContain("return try decode(asset: asset, track: track, start: start, end: end, count: clampCount(request.count), job: job)");
  expect(decode.startsWith("static func decode(asset: AVURLAsset, track: AVAssetTrack, start: Double, end: Double, count: Int, job: PeaksJob) throws -> [String: Any] {")).toBe(true);
  expect(decode).toContain("AVAssetReader(asset: asset)");
  expect(decode).not.toContain("await");
  expect(swift).not.toContain("track.asset");
});

test("the count is 16 … 2000 and the stretch is clamped to the file, with nothing that can trap", () => {
  expect(swift).toContain("static let fewest: Int = 16");
  expect(swift).toContain("static let most: Int = 2000");
  const clamp = between(swift, "static func clampCount(", "\n  }\n");
  expect(clamp.indexOf("guard asked.isFinite else { return fewest }")).toBeLessThan(clamp.indexOf("Int(whole)"));
  expect(clamp).toContain("if whole <= Double(fewest) { return fewest }");
  expect(clamp).toContain("if whole >= Double(most) { return most }");
  expect(run).toContain("let total = length.seconds.isFinite ? length.seconds : 0");
  expect(run).toContain("let start = max(0, min(request.from.isFinite ? request.from : 0, total))");
  expect(run).toContain("let asked = request.to.isFinite && request.to > start ? request.to : total");
  expect(run).toContain("let end = min(total, asked, start + longestSeconds)");
  expect(run).toContain("guard end - start > 0 else");
  // Every Double that becomes an Int is checked first.
  const slice = between(swift, "static func slice(", "\n  }\n");
  expect(slice.indexOf("guard raw.isFinite, raw >= 0 else { return last }")).toBeLessThan(slice.indexOf("Int(raw)"));
  const first = between(swift, "static func firstSample(", "\n  }\n");
  expect(first.indexOf("guard raw.isFinite")).toBeLessThan(first.indexOf("return Int(raw)"));
  expect(decode.indexOf("basic.mSampleRate >= SoundPeaks.lowestRate, basic.mSampleRate <= SoundPeaks.highestRate")).toBeLessThan(decode.indexOf("position = Int((lead * rate).rounded())"));
  expect(decode).toContain("if lead.isFinite, lead > 0.001, lead < end - start {");
  // What goes out is 0 … 1, never a NaN.
  expect(decode).toContain("let value: Float = top.isFinite ? min(Float(1), max(Float(0), top)) : 0");
  expect(decode).toContain("if top.isFinite, top > tops[slice] { tops[slice] = top }");
});

test("the samples are read as mono float PCM through a mix output and the maximum is Accelerate's, not a Swift loop", () => {
  expect(read("SoundPeaks.swift").startsWith("import Accelerate\n")).toBe(true);
  expect(read("ClipyVideo.podspec")).toContain("s.frameworks = 'Speech', 'Accelerate'");
  expect(decode).toContain("AVAssetReaderAudioMixOutput(audioTracks: [track], audioSettings: settings)");
  expect(decode).toContain("AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: SoundPeaks.decodeRate, AVNumberOfChannelsKey: 2,");
  expect(decode).toContain("AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true, AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false,");
  expect(decode).toContain("guard reader.canAdd(output) else");
  expect(decode).toContain("reader.timeRange = CMTimeRange(start: ExportSession.time(start), end: ExportSession.time(end))");
  expect(decode).toContain("defer { if reader.status == .reading { reader.cancelReading() } }");
  expect(decode).toContain("try autoreleasepool { () throws -> Void in");
  expect(decode).toContain("vDSP_maxmgv(UnsafePointer<Float>(mono + offset), 1, &top, vDSP_Length(take))");
  expect(decode).toContain("take = min(left, max(1, next - at))");          // always at least one sample: the loop ends
  const mix = between(swift, "static func mixDown(", "\n  }\n");
  expect(mix).toContain("if width == 1 { return interleaved }");
  expect(mix).toContain("var half: Float = 0.5");
  expect(mix).toContain("vDSP_vasm(UnsafePointer<Float>(interleaved), 2, UnsafePointer<Float>(interleaved + 1), 2, &half, mono, 1, vDSP_Length(frames))");
});

test("a cancel is read before every buffer, and every failure says its stage", () => {
  const loop = between(decode, "while !ended {", "try autoreleasepool");
  expect(loop).toContain("if job.isCancelled { throw PeaksError.cancelled }");
  const messages = [...swift.matchAll(/PeaksError\.failed\("([^"]*)/g)].map((m) => m[1]);
  expect(messages.length).toBeGreaterThanOrEqual(10);
  for (const m of messages) expect(m).toMatch(/^peaks (source|reader): /);
  expect(between(swift, "static func message(", "\n  }\n")).toContain('return "peaks reader: " + ExportSession.describe(error)');
  expect(swift.split("ExportSession.describe(").length - 1).toBeGreaterThanOrEqual(5);
  expect(decode).toContain("guard reader.status == .completed else");
});

test("its names are its own: no other Swift file declares them", () => {
  const names = ["SoundPeaksRequest", "PeaksError", "PeaksJob", "PeaksMemory", "SoundPeaks"];
  for (const file of readdirSync(iosDir).filter((f) => f.endsWith(".swift") && f !== "SoundPeaks.swift")) {
    const other = code(read(file));
    for (const name of names) expect(new RegExp(`\\b(struct|enum|class|protocol|typealias|func) ${name}\\b`).test(other)).toBe(false);
  }
  for (const name of names) expect(swift.split(new RegExp(`\\b(?:struct|enum|final class) ${name}\\b`)).length - 1).toBe(1);
});
