import { readFileSync } from "fs";
import { join } from "path";

// There is no Swift compiler on this machine: these tests READ the Swift and pin what the app relies on.
const root = join(__dirname, "../../../..");
const iosDir = join(root, "modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const swift = code(read("CutoutRender.swift"));
const moduleSwift = code(read("ClipyVideoModule.swift"));
const wrapper = readFileSync(join(root, "modules/clipy-video/index.ts"), "utf8");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const video = between(swift, "static func renderVideo(", "\n  }\n");
const photo = between(swift, "static func renderPhoto(", "\n  }\n");

test("the request record has exactly the fields the app sends", () => {
  const fields = [...between(swift, "struct CutoutRequest: Record {", "\n}").matchAll(/@Field var (\w+)/g)].map((m) => m[1]);
  const sent = [...between(wrapper, "export interface CutoutRequest {", "\n}").matchAll(/(\w+): /g)].map((m) => m[1]);
  expect(fields.sort()).toEqual([...new Set(sent)].sort());
  expect(fields.sort()).toEqual(["alphaQuality", "bitsPerPixel", "from", "jobId", "kind", "maxSide", "minFrameGap", "minPerson", "outputPath", "sourceUri", "stillPath", "stillSeconds", "to"]);
  expect(wrapper).toContain("export interface CutoutResult { fileUri: string; seconds: number; frames: number; person: number }");
  expect(swift.split('let answer: [String: Any] = ["fileUri": outputURL.absoluteString, "seconds":').length - 1).toBe(2);   // the video's and the photo's
});

test("the asset lives in the source for as long as its tracks and its reader are used", () => {
  const source = between(swift, "final class CutoutSource", "\n}\n");
  expect(source).toContain("let asset: AVURLAsset");
  expect(source).toContain("let video: AVAssetTrack");
  expect(source).toContain("try await asset.loadTracks(withMediaType: .video)");
  expect(source).toContain("try await video.load(.preferredTransform, .naturalSize)");
  expect(source).toContain("try await asset.load(.duration)");
  expect(video).toContain("source: CutoutSource");
  expect(video).toContain("AVAssetReader(asset: source.asset)");
});

test("the copy is HEVC with alpha in a QuickTime file, only with settings the writer says it can apply", () => {
  const settings = between(swift, "static func videoSettings(", "\n  }\n");
  expect(settings).toContain("AVVideoCodecKey: AVVideoCodecType.hevcWithAlpha");
  expect(settings).toContain("kVTCompressionPropertyKey_TargetQualityForAlpha as String");
  expect(settings).toContain("writer.canApply(outputSettings: settings, forMediaType: .video)");
  expect(settings.indexOf("writer.canApply(")).toBeLessThan(settings.indexOf("return settings"));
  const make = between(swift, "static func makeWriter(", "\n  }\n");
  expect(make).toContain("AVAssetWriter(outputURL: url, fileType: .mov)");
  expect(make).toContain("kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA");
  expect(make).toContain("writer.canAdd(input)");
  expect(swift).not.toContain("AlphaChannelMode");                 // the default (premultiplied) is what Core Image writes
});

test("the copy keeps the source's timing: the session starts at zero and frames are appended at their own times", () => {
  expect(video).toContain("writer.startSession(atSourceTime: .zero)");
  expect(video).toContain("reader.timeRange = range");
  expect(video).toContain("withPresentationTime: pts");
  expect(video).toContain("at - lastKept >= gap");
  expect(video).toContain("CMSampleBufferGetPresentationTimeStamp(sample)");
  // The last kept frame lasts until the range's end (as MediaPrePass ends its sessions), so the copy is as long as its range.
  expect(video).toContain("writer.endSession(atSourceTime: range.end)");
  expect(video.indexOf("writer.endSession(atSourceTime: range.end)")).toBeLessThan(video.indexOf("await writer.finishWriting()"));
});

test("people are found with Vision's person segmentation, one sequence handler for the whole clip, a one-channel mask", () => {
  expect(video).toContain("let segmentation = VNGeneratePersonSegmentationRequest()");
  expect(video).toContain("segmentation.qualityLevel = .balanced");
  expect(video).toContain("segmentation.outputPixelFormat = kCVPixelFormatType_OneComponent8");
  expect(video.split("VNSequenceRequestHandler()").length - 1).toBe(1);
  expect(photo).toContain("segmentation.qualityLevel = .accurate");
  expect(photo).toContain("VNImageRequestHandler(cgImage: image, options: [:])");
  const cut = between(swift, "static func cut(", "\n  }\n");
  // The RED mask blend: Vision's one-channel mask is a red-only image to Core Image (Apple's own sample blends it this way).
  expect(cut).toContain('CIFilter(name: "CIBlendWithRedMask")');
  expect(cut).not.toContain('"CIBlendWithMask"');
  expect(cut).toContain("clampedToExtent()");
  expect(cut).toContain("CIImage(color: CIColor.clear)");
  const coverage = between(swift, "static func coverage(", "\n  }\n");
  expect(coverage).toContain("CVPixelBufferGetPixelFormatType(mask) == kCVPixelFormatType_OneComponent8");
});

test("the sound is copied as stored, and a sound that cannot be copied fails the render", () => {
  expect(video).toContain("AVAssetReaderTrackOutput(track: audio, outputSettings: nil)");
  expect(video).toContain("AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint: source.audioHint)");
  expect(video.split("cutout sound: this clip's sound cannot be copied").length - 1).toBe(2);
});

test("the loop is cancellable, never waits for one input alone, and no await sits inside an autoreleasepool", () => {
  expect(video).toContain("if job.isCancelled { throw CutoutError.cancelled }");
  expect(video).toContain("pictureInput.isReadyForMoreMediaData");
  expect(video).toContain("soundInput.isReadyForMoreMediaData");
  // No Swift lock is taken in an async function (NSLock is not for async code): the gate's lock lives in synchronous helpers.
  for (const name of ["enter", "renderVideo", "renderPhoto"]) expect(between(swift, `static func ${name}(`, "\n  }\n")).not.toMatch(/\.lock\(|\.unlock\(/);
  expect(video).toContain("try await Task.sleep(nanoseconds: 2_000_000)");
  expect(video).toContain("await writer.finishWriting()");
  const pools = swift.split("autoreleasepool {").slice(1);
  expect(pools).toHaveLength(1);
  for (const pool of pools) {
    const close = pool.indexOf("\n              }\n");                 // the closure's own closing brace (14 spaces)
    expect(close).toBeGreaterThan(0);
    expect(pool.slice(0, close)).not.toContain("await ");
  }
});

test("a part file is written and moved; every way out that is not success removes it", () => {
  expect(swift).toContain('appendingPathComponent("part-" + url.lastPathComponent)');
  const place = between(swift, "static func place(", "\n  }\n");
  expect(place).toContain("moveItem(at: partURL, to: outputURL)");
  expect(video).toContain("try place(partURL, at: outputURL)");
  expect(video).toContain("try? FileManager.default.removeItem(at: partURL)");
  expect(video).toContain("if writer.status == .writing { writer.cancelWriting() }");
  expect(photo.indexOf("try place(stillPart, at: stillURL)")).toBeLessThan(photo.indexOf("try place(pngPart, at: outputURL)"));   // the PNG last: its presence means ready
});

test("no person: measured on the mask, refused with its own stage", () => {
  expect(video).toContain("kept % CutoutRender.personEvery == 0");
  expect(video).toContain('throw CutoutError.failed("cutout person: no person found")');
  expect(photo).toContain('throw CutoutError.failed("cutout person: no person found")');
  expect(swift).toContain("static let personEvery = 15");
});

test("every failure has a cutout stage; a cancel has its own code; the promise is answered once", () => {
  const thrown = [...swift.matchAll(/CutoutError\.failed\("([^"]*)/g)].map((m) => m[1]);
  expect(thrown.length).toBeGreaterThanOrEqual(15);
  for (const text of thrown) expect(text).toMatch(/^cutout (output|source|reader|writer|sound|people|render|person): /);
  const fn = between(moduleSwift, 'AsyncFunction("renderCutout")', "\n    }\n");
  expect(fn).toContain("self.storeCutoutJob(jobId, job)");
  expect(fn).toContain("defer { self?.dropCutoutJob(jobId) }");
  expect(fn.split("promise.resolve(").length - 1).toBe(1);
  expect(fn).toContain('promise.reject("E_CUTOUT_CANCELLED", "Cutout cancelled")');
  expect(fn).toContain('promise.reject("E_CUTOUT", CutoutRender.message(error))');
  expect(fn).toContain('self?.sendEvent("onCutoutEvent", ["jobId": jobId, "progress": fraction])');
  expect(moduleSwift).toContain('Events("onExportEvent", "onSoundEvent", "onCutoutEvent", "onSteadyEvent")');
  expect(moduleSwift).toContain('Function("cancelCutout")');
  // One cut-out render at a time: the gate is taken inside the `do` (a cancel while waiting is answered) and always given back.
  expect(fn.indexOf("try await CutoutRender.enter(job)")).toBeGreaterThan(0);
  expect(fn.indexOf("try await CutoutRender.enter(job)")).toBeLessThan(fn.indexOf("defer { CutoutRender.leave() }"));
  expect(fn.indexOf("defer { CutoutRender.leave() }")).toBeLessThan(fn.indexOf("CutoutRender.renderPhoto("));
  const enter = between(swift, "static func enter(", "\n  }\n");
  expect(enter).toContain("if job.isCancelled { throw CutoutError.cancelled }");
  expect(enter).toContain("try await Task.sleep(nanoseconds: 50_000_000)");
  expect(swift).not.toMatch(/SoundRender\.gate/);                    // its own gate, not the sound render's
  expect(wrapper).toContain('export const CUTOUT_CANCELLED = "E_CUTOUT_CANCELLED";');
  expect(wrapper).toContain('addListener("onCutoutEvent", cb)');
});

test("no force unwrap, no try!, no as!; no type and no static name declared twice; nothing clashes; the export's Swift is not touched", () => {
  expect(swift).not.toMatch(/[\w)\]]!(?!=)/);
  expect(swift).not.toMatch(/\b(try|as)!/);
  const types = [...swift.matchAll(/^(?:final class|struct|enum) (\w+)/gm)].map((m) => m[1]);
  expect(types.sort()).toEqual(["CutoutError", "CutoutJob", "CutoutRender", "CutoutRequest", "CutoutSource"]);
  const others = ["ExportSession.swift", "ClipyVideoModule.swift", "MediaPrePass.swift", "Transcriber.swift", "AudioMix.swift", "SoundMath.swift", "SoundRender.swift", "SpeechRender.swift", "ClipyCompositor.swift", "BeatEnvelope.swift"].map((f) => code(read(f))).join("\n");
  for (const t of types) expect(others).not.toMatch(new RegExp(`(?:class|struct|enum) ${t}\\b`));
  const body = between(swift, "enum CutoutRender {", "\n}\n");
  const values = [...body.matchAll(/static (?:let|var) (\w+)/g)].map((m) => m[1]);
  const funcs = [...body.matchAll(/static func (\w+)\(/g)].map((m) => m[1]);
  expect(values.filter((n) => funcs.includes(n))).toEqual([]);
  expect(new Set(values).size).toBe(values.length);
  expect(new Set(funcs).size).toBe(funcs.length);
  for (const name of ["exportTimeline", "transcribe", "renderSound", "soundInfo", "probeNoiseReduction", "listVoices", "speakToFile", "beatEnvelope"]) expect(moduleSwift).toContain(`AsyncFunction("${name}")`);
  // The export knows nothing of cut-outs: it is handed another file.
  for (const file of ["ExportSession.swift", "ClipyCompositor.swift", "MediaPrePass.swift"]) expect(read(file)).not.toMatch(/cutout/i);
});
