import { readFileSync } from "fs";
import { join } from "path";

// There is no Swift compiler on this machine: these tests READ the Swift and pin what the app relies on.
const root = join(__dirname, "../../../..");
const iosDir = join(root, "modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const swift = code(read("SteadyRender.swift"));
const moduleSwift = code(read("ClipyVideoModule.swift"));
const wrapper = readFileSync(join(root, "modules/clipy-video/index.ts"), "utf8").replace(/\r\n/g, "\n");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const fieldsOf = (record: string) => [...between(swift, `struct ${record}: Record {`, "\n}").matchAll(/@Field var (\w+)/g)].map((m) => m[1]).sort();
const sentOf = (name: string) => [...new Set([...between(wrapper, `export interface ${name} {`, "\n}").matchAll(/(\w+): /g)].map((m) => m[1]))].sort();
const measure = between(swift, "static func measure(", "\n  }\n");
const render = between(swift, "static func render(", "\n  }\n");

test("the two request records have exactly the fields the app sends", () => {
  expect(fieldsOf("ShakeRequest")).toEqual(sentOf("ShakeRequest"));
  expect(fieldsOf("ShakeRequest")).toEqual(["from", "jobId", "measureSide", "minFrameGap", "sourceUri", "to"]);
  expect(fieldsOf("SteadyRequest")).toEqual(sentOf("SteadyRequest"));
  expect(fieldsOf("SteadyRequest")).toEqual(["bitRate", "blendFloor", "dx", "dy", "from", "grid", "jobId", "maxSide", "minFrameGap", "outputPath", "sourceUri", "times", "to", "zoom"]);
  for (const list of ["times", "dx", "dy"]) expect(swift).toContain(`@Field var ${list}: [Double] = []`);
  expect(wrapper).toContain("export interface ShakeResult { times: number[]; dx: number[]; dy: number[]; frames: number; failed: number }");
  expect(measure).toContain('let answer: [String: Any] = ["times": times, "dx": dx, "dy": dy, "frames": times.count, "failed": failed]');
  expect(wrapper).toContain("export interface SteadyResult { fileUri: string; seconds: number; frames: number }");
  expect(render).toContain('let answer: [String: Any] = ["fileUri": outputURL.absoluteString, "seconds": span.end, "frames": written]');
});

test("the asset lives in the source for as long as its tracks and its readers are used", () => {
  const source = between(swift, "final class SteadySource", "\n}\n");
  expect(source).toContain("let asset: AVURLAsset");
  expect(source).toContain("try await asset.loadTracks(withMediaType: .video)");
  expect(measure).toContain("source: SteadySource");
  expect(measure).toContain("AVAssetReader(asset: source.asset)");
  expect(render).toContain("AVAssetReader(asset: source.asset)");
});

test("measuring: the frame is registered against the frame BEFORE it, with the iOS 11 request, and a failure is no movement", () => {
  expect(measure).toContain("VNTranslationalImageRegistrationRequest(targetedCVPixelBuffer: slots[slot], options: [:], completionHandler: nil)");
  expect(measure).toContain("try handler.perform([registration], on: slots[1 - slot])");
  expect(measure).toContain("Double(found.alignmentTransform.tx) / Double(size.width)");
  expect(measure).toContain("Double(found.alignmentTransform.ty) / Double(size.height)");
  expect(measure).toContain("guard !times.isEmpty else { return (0, 0, true) }");          // the first frame has nothing before it
  expect(measure.split("return (0, 0, false)").length - 1).toBe(3);                         // Vision threw, answered nothing, or a number that is not one
  expect(measure).not.toContain("await");                                                   // one synchronous loop
  expect(swift).not.toContain("VNTrackTranslationalImageRegistrationRequest");              // iOS 17
  expect(swift).not.toContain("VNHomographic");
});

test("writing: HEVC or H.264, only with settings the writer says it can apply, in a QuickTime file moved into place", () => {
  const settings = between(swift, "static func videoSettings(", "\n  }\n");
  expect(settings).toContain("let codecs: [AVVideoCodecType] = [.hevc, .h264]");
  expect(settings).toContain("writer.canApply(outputSettings: settings, forMediaType: .video)");
  expect(swift).toContain("try AVAssetWriter(outputURL: url, fileType: .mov)");
  expect(swift.split("guard writer.canAdd(").length - 1).toBe(2);                           // the picture, the sound
  expect(swift.split("guard reader.canAdd(").length - 1).toBe(2);                           // the picture, the sound
  expect(render).toContain("let partURL = CutoutRender.partFile(for: outputURL)");
  expect(render).toContain("try place(partURL, at: outputURL)");
  expect(render).toContain("try? FileManager.default.removeItem(at: partURL)");
});

test("the copy keeps the source's timeline and its sound", () => {
  expect(render).toContain("writer.startSession(atSourceTime: .zero)");
  expect(render).toContain("writer.endSession(atSourceTime: range.end)");
  expect(between(swift, "static func put(", "\n  }\n")).toContain("guard adaptor.append(out, withPresentationTime: stamp) else");
  expect(render).toContain("try put(placed, at: pts, rect: rect, pool: pool, space: space, adaptor: adaptor, writer: writer)");      // no grid: a source frame at its own time
  expect(render).toContain("ahead = SteadyFrame(time: at, stamp: pts, slot: into)");
  expect(render).toContain("try put(own, at: b.stamp, rect: rect, pool: pool, space: space, adaptor: adaptor, writer: writer)");     // a grid: the same
  expect(render).toContain("guard reader.status == .completed else");                                                                // every source frame was read
  expect(render).toContain("AVAssetReaderTrackOutput(track: audio, outputSettings: nil)");
  expect(render).toContain("AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint: source.audioHint)");
  expect(render).toContain("guard writer.status == .writing else");
});

test("a frame is zoomed about its centre and moved by its correction, taken from the line between the two entries around its time", () => {
  const placement = between(swift, "static func placement(", "\n  }\n");
  expect(placement).toContain("CGAffineTransform(translationX: -w / 2, y: -h / 2)");
  expect(placement).toContain("CGAffineTransform(scaleX: z, y: z)");
  expect(placement).toContain("CGAffineTransform(translationX: w / 2 + CGFloat(move.x) * w, y: h / 2 + CGFloat(move.y) * h)");
  expect(render).toContain(".clampedToExtent()");
  const shift = between(swift, "static func shift(", "\n  }\n");
  expect(shift).toContain("while cursor + 1 < count, times[cursor + 1] <= time { cursor += 1 }");   // the entry at or before the frame's time
  expect(shift).toContain("let part = min(1, max(0, (time - times[cursor]) / room))");
  expect(shift).toContain("return (x0 + (x1 - x0) * part, y0 + (y1 - y0) * part)");
  expect(shift).toContain("guard cursor + 1 < count, time > times[cursor] else { return (x0, y0) }");
});

test("one heavy render at a time on the phone: the cut-out's gate, taken while a cancel is still answered", () => {
  const enter = between(swift, "static func enter(", "\n  }\n");
  expect(enter).toContain("if job.isCancelled { throw SteadyError.cancelled }");
  expect(enter).toContain("if CutoutRender.takeGate() { return }");
  for (const fn of ['AsyncFunction("measureShake")', 'AsyncFunction("renderSteady")']) {
    const body = between(moduleSwift, fn, "\n    }\n");
    expect(body).toContain("try await SteadyRender.enter(job)");
    expect(body).toContain("defer { CutoutRender.leave() }");
    expect(body).toContain("defer { self?.dropSteadyJob(jobId, job) }");
    expect(body).toContain('promise.reject("E_STEADY_CANCELLED", "Steady cancelled")');
    expect(body).toContain('promise.reject("E_STEADY", SteadyRender.message(error))');
    expect(body.split("promise.resolve(").length - 1).toBe(1);
    expect(body).toContain('self?.sendEvent("onSteadyEvent", ["jobId": jobId, "progress": fraction])');
  }
});

test("the module knows the event and the cancel; a finished job is only dropped if it is still the stored one", () => {
  expect(moduleSwift).toContain('Events("onExportEvent", "onSoundEvent", "onCutoutEvent", "onSteadyEvent")');
  expect(between(moduleSwift, 'Function("cancelSteady")', "\n    }\n")).toContain("self.lookupSteadyJob(jobId)?.cancel()");
  expect(between(moduleSwift, "private func dropSteadyJob(", "\n  }\n")).toContain("if steadyJobs[id] === job { steadyJobs[id] = nil }");
  expect(wrapper).toContain('addListener("onSteadyEvent", cb)');
});

test("every failure names its stage, and nothing is forced", () => {
  for (const stage of ["steady output: ", "steady source: ", "steady reader: ", "steady measure: ", "steady writer: ", "steady sound: ", "steady render: "]) expect(swift).toContain(`"${stage}`);
  expect(swift).not.toMatch(/try!|as!|\w!\.|\w!\)/);
  expect(read("CutoutRender.swift")).toContain("static func takeGate() -> Bool");          // what this file borrows is still there, unedited
});

test("a correction is looked up by TIME, is nothing outside the measured stretch, and never moves the picture further than the zoom hides", () => {
  const shift = between(swift, "static func shift(", "\n  }\n");
  expect(shift).toContain("guard time >= times[0] - edge, time <= times[count - 1] + edge else { return (0, 0) }");
  expect(shift).not.toMatch(/dx\[kept\]|dx\[written\]|dx\[step\]/);
  const hidden = between(swift, "static func hidden(", "\n  }\n");
  expect(hidden).toContain("let most = (z - 1) / 2");
  expect(hidden).toContain("min(most, max(-most, move.x))");
  expect(hidden).toContain("min(most, max(-most, move.y))");
  expect(render).toContain("let move = hidden(shift(at: at, times: times, dx: dx, dy: dy, cursor: &cursor), zoom: zoom)");
  // Zoom about the centre FIRST, the move after it (the order the app's clamp assumes).
  const placement = between(swift, "static func placement(", "\n  }\n");
  expect(placement.indexOf("CGAffineTransform(scaleX: z, y: z)")).toBeLessThan(placement.indexOf("CGFloat(move.x) * w"));
});

test("smooth slow motion: every source frame stays as it is at its own time, and blended frames go only BETWEEN two neighbours", () => {
  // How many: round(gap x grid) - 1, none above the cap (a hole is not filled), never closer together than minFrameGap.
  const count = between(swift, "static func blendsBetween(", "\n  }\n");
  expect(swift).toContain("static let mostBetween = 16");
  expect(count).toContain("let asked = (length * grid).rounded() - 1");
  expect(count).toContain("guard asked.isFinite, asked >= 1, asked <= Double(mostBetween) else { return 0 }");
  expect(count).toContain("if room.isFinite, room < Double(count + 1) { count = Int(room.rounded(.down)) - 1 }");
  expect(count).toContain("return max(0, count)");
  expect(render).toContain("count = blendsBetween(at - before.time, grid: grid, gap: gap)");
  // Where and what: evenly between the two, a dissolve by the share of the way; never a second copy of a neighbour.
  expect(render).toContain("let weight = Double(step) / Double(between + 1)");
  expect(render).toContain("let stamp = CMTime(seconds: a.time + (b.time - a.time) * weight, preferredTimescale: 6000)");
  expect(render).toContain("if weight > near, weight < 1 - near, CMTimeCompare(stamp, a.stamp) > 0, CMTimeCompare(stamp, b.stamp) < 0 {");
  expect(render).toContain('guard let mixed = Adjust.filtered(first, "CIDissolveTransition", ["inputTargetImage": second, "inputTime": NSNumber(value: weight)]) else {');
  expect(render).toContain("try put(mixed.cropped(to: rect), at: stamp, rect: rect, pool: pool, space: space, adaptor: adaptor, writer: writer)");
  // The blended frames of a pair are written before the pair's second frame, and that frame before the next is read.
  expect(render.indexOf("try put(mixed.cropped(to: rect)")).toBeLessThan(render.indexOf("try put(own, at: b.stamp"));
  expect(render.indexOf("try put(own, at: b.stamp")).toBeLessThan(render.indexOf("pictures.copyNextSampleBuffer()"));
  expect(render.split("pictures.copyNextSampleBuffer()").length - 1).toBe(1);
  // No lattice of times is left, and the file's frame rate is not asked.
  expect(swift).not.toContain("gridIndex");
  expect(swift).not.toContain("nominalFrameRate");
});

test("progress is sent at most once per percent", () => {
  for (const fn of ['AsyncFunction("measureShake")', 'AsyncFunction("renderSteady")']) {
    expect(between(moduleSwift, fn, "\n    }\n")).toContain("guard fraction - lastSent >= 0.01 else { return }");
  }
});
