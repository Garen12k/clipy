import { readFileSync } from "fs";
import { join } from "path";

/**
 * The Blur background of a cut-out main clip is made from the clip's ORIGINAL (the request's `backdrop`), not from the see-through
 * copy the clip is drawn from. The Swift is never compiled here: these checks READ it and pin what the fix relies on — and that a
 * request without the key takes the lines it always took.
 */
const root = join(__dirname, "../../..");
const iosDir = join(root, "modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const session = code(read("ExportSession.swift"));
const compositor = code(read("ClipyCompositor.swift"));
const prePass = code(read("MediaPrePass.swift"));
const moduleSwift = code(read("ClipyVideoModule.swift"));
const wrapper = readFileSync(join(root, "modules/clipy-video/index.ts"), "utf8").replace(/\r\n/g, "\n");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const inOrder = (text: string, parts: string[]) => {
  const at = parts.map((s) => text.indexOf(s));
  expect(at.every((i) => i >= 0)).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
};

describe("the request", () => {
  test("a clip may name the file its Blur background is made from; absent = nil (a Record sets only the keys it is sent)", () => {
    expect(between(session, "struct ExportBackdrop: Record {", "\n}")).toMatch(/@Field var uri: String = ""\s+@Field var kind: String = "video"/);
    expect(between(session, "struct ExportClip: Record {", "\n}")).toMatch(/@Field var backdrop: ExportBackdrop\?\s/);
    expect(wrapper).toMatch(/\n {2}backdrop\?: \{ uri: string; kind: "video" \| "photo" \};/);
    // expo-modules-core: a field whose key is not in the dictionary keeps its default, and a key no field declares is never read.
    const record = readFileSync(join(root, "node_modules/expo-modules-core/ios/Core/Records/Record.swift"), "utf8");
    expect(record).toContain("if dictKeys.contains(key) || field.isRequired {");
    expect(record).toContain("try fieldsOf(self).forEach { field in");
    const field = readFileSync(join(root, "node_modules/expo-modules-core/ios/Core/Records/Field.swift"), "utf8");
    expect(field).toContain("public init(wrappedValue: Type = nil) where Type: ExpressibleByNilLiteral {");
  });
  test("a prepared (photo / reversed) file has its own timing, so the pre-pass drops the key; a layer record only carries it", () => {
    expect(between(prePass, "static func rewrite(", "return out")).toContain("out.backdrop = nil\n");
    expect(between(prePass, "var clip: ExportClip {", "return out")).toContain("out.backdrop = backdrop\n");
    // No layer's spec is ever given one.
    const layers = between(session, "var placedLayers: [PlacedOverlay] = []", "func backdropOf(");
    expect(layers).not.toContain("backdrop");
  });
  test("the build says so, and the app asks whether the function is there", () => {
    expect(moduleSwift).toContain('Function("blurAndCuts") { () -> Bool in');
    expect(wrapper).toContain("blurAndCuts(): boolean;");
  });
});

describe("loading", () => {
  const load = between(session, "private static func loadBackdrop(", "\n  }\n");
  test("the original is loaded without ever throwing, with its OWN cover transform and readable end", () => {
    expect(load).toContain("async -> LoadedBackdrop? {");
    expect(load).not.toContain("throws");
    inOrder(load, [
      "guard let url = URL(string: uri) else { return nil }", "let asset = AVURLAsset(url: url)", "do {",
      "guard let video = try await asset.loadTracks(withMediaType: .video).first else { return nil }",
      "try await video.load(.preferredTransform, .naturalSize, .timeRange)", "try await asset.load(.duration)",
      "Self.ciFillTransform(preferredTransform: preferredTransform, naturalSize: naturalSize, renderSize: renderSize)",
      "sourceEnd: CMTimeMinimum(duration, videoRange.end))", "} catch {",
    ]);
  });
  test("the asset is kept for as long as the export reads its track (AVAssetTrack.asset is weak)", () => {
    expect(between(session, "private struct LoadedBackdrop {", "\n}")).toMatch(/let asset: AVURLAsset\s/);
    const step = between(session, "var backdropSources: [Int: LoadedBackdrop] = [:]", "var halves");
    inOrder(step, [
      'guard let asked = one.clip.backdrop, one.clip.background.type == "blur" else { continue }',
      'if asked.kind == "photo" {', "MediaPrePass.uprightPhoto(asked.uri, maxPixels:", "LayerBackdrop.photo(image, renderSize: renderSize)",
      "} else if let found = await Self.loadBackdrop(asked.uri, renderSize: renderSize) {", "backdropSources[i] = found", "sourceAssets.append(found.asset)",
    ]);
    expect(session).toContain("let keepAlive = sourceAssets");
    expect(session).toContain("withExtendedLifetime(keepAlive) {}");
  });
  test("a photo is decoded the way the pre-pass decodes one", () => {
    const photo = between(prePass, "static func uprightPhoto(", "\n  }\n");
    expect(photo).toContain("-> CGImage? {");
    for (const key of ["kCGImageSourceCreateThumbnailFromImageAlways: true", "kCGImageSourceCreateThumbnailWithTransform: true", "kCGImageSourceThumbnailMaxPixelSize: min(maxPhotoPixels, max(2, maxPixels))"]) expect(photo).toContain(key);
  });
});

describe("the composition", () => {
  const place = between(session, "func placeBackdrop(", "\n    }\n\n    for (i, c) in loaded.enumerated() {");
  test("the original goes on a track of its own with the clip's own cuts: the three inserts the clip itself gets", () => {
    inOrder(place, [
      "guard let back = backdropSources[i], pieces >= 1 else { return }",
      "let sourceEnd = CMTimeMinimum(cuts.source[pieces], back.sourceEnd)",
      "short <= ExportSession.backdropSlack",
      "composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else { return }",
      "ExportSession.retimeCuts(from: (source: sourceStart, output: mainStart), to: (source: sourceEnd, output: mainEnd), interior: interior)",
      "try insertScaled(track, CMTimeRange(start: sourceStart, duration: held), of: back.video, from: clipStart, to: mainStart)",
      "try insertRetimed(track, of: back.video, cuts: own)",
      "try insertScaled(track, CMTimeRange(start: sourceEnd - held, duration: held), of: back.video, from: mainEnd, to: clipEnd)",
      "backdropTracks[i] = track.trackID",
    ]);
    // No speed maths of its own: only the cuts it is handed.
    expect(place).not.toMatch(/speed|SpeedSpans|outDur/);
  });
  test("it never fails an export: nothing is thrown out of it, and a track that could not be filled is taken out again", () => {
    expect(between(session, "func placeBackdrop(", ") {")).not.toContain("throws");
    expect(place.split("composition.removeTrack(track)").length - 1).toBe(2);
    expect(place).not.toContain("throw ");
    expect(session).not.toMatch(/try!|as!/);
  });
  test("both ways a clip is inserted lay the backdrop with exactly the cuts they used", () => {
    expect(session).toContain("placeBackdrop(i, cuts: cuts, edge: edge, from: clipStart, to: clipEnd)");
    expect(session).toContain("placeBackdrop(i, cuts: RetimeCuts(source: [source.start, source.end], output: [mainStart, mainEnd]), edge: edge, from: clipStart, to: clipEnd)");
    expect(session.split("placeBackdrop(i, ").length - 1).toBe(2);
    // The clip's own three inserts are the lines they were (twice: the curve path and the constant path).
    expect(session.split("_ = try insertScaled(track, CMTimeRange(start: source.start, duration: edge), of: c.srcVideo, from: clipStart, to: mainStart)").length - 1).toBe(2);
    expect(session).toContain("_ = try insertRetimed(track, of: c.srcVideo, cuts: cuts)");
    expect(session).toContain("_ = try insertScaled(track, source, of: c.srcVideo, from: mainStart, to: mainEnd)");
  });
  test("a main clip's spec is handed the backdrop only when its track was laid (or its still decoded)", () => {
    const of = between(session, "func backdropOf(", "\n    }\n");
    inOrder(of, ["if let still = backdropStills[i] { return still }", "guard let back = backdropSources[i], let trackID = backdropTracks[i] else { return nil }", "return LayerBackdrop(trackID: trackID, fill: back.fill, still: nil)"]);
    expect(between(session, "func spec(_ i: Int) -> LayerSpec {", "\n    }\n")).toContain("backdrop: backdropOf(i),");
  });
});

describe("the compositor", () => {
  test("an instruction also asks for its layers' backdrop tracks — none for every other clip", () => {
    const init = between(compositor, "init(timeRange: CMTimeRange, layers: [LayerSpec]", "\n  }\n");
    expect(init).toContain("let behind: [NSValue] = ClipyInstruction.backdropTracks(layers)");
    expect(init).toContain("self.requiredSourceTrackIDs = (layers + overlays).map { NSNumber(value: $0.trackID) as NSValue } + behind");
    const tracks = between(compositor, "static func backdropTracks(", "\n  }\n");
    expect(tracks).toContain("guard let back = layer.backdrop, back.still == nil, back.trackID != kCMPersistentTrackID_Invalid else { return nil }");
  });
  test("a frame with a backdrop is drawn over the blurred ORIGINAL; without one (or without a frame of it) by the lines it always was", () => {
    const frame = between(compositor, "func frame(_ spec: LayerSpec) -> CIImage? {", "\n    }\n\n    var result = black");
    inOrder(frame, [
      "guard let pb = req.sourceFrame(byTrackID: spec.trackID) else { return nil }", "if let back = spec.backdrop {", "var behind: CIImage? = back.still",
      "if behind == nil, let held = req.sourceFrame(byTrackID: back.trackID) {", "CIImage(cvPixelBuffer: held).transformed(by: back.fill)", "if let behind {",
      "ClipyCompositor.backedFrame(spec, source: source, behind: behind, time: time, size: size)", "return ClipyCompositor.look(spec, on: backed, time: time)",
      "let img: CIImage", "if spec.motion != nil {", "img = ClipyCompositor.movingFrame(spec, source: source, time: time, size: size)", "} else if spec.usesFill {",
      "img = ClipyCompositor.placedFrame(spec, transform: spec.transform, opacity: 1, source: source, size: size)", "return ClipyCompositor.look(spec, on: img, time: time)",
    ]);
  });
  test("the blur is the background's own (clamped, the same radius, cropped), and the picture goes over it through the one placement chain", () => {
    const backed = between(compositor, "static func backedFrame(", "\n  }\n");
    inOrder(backed, [
      "blurred(behind, radius: blurRadiusFactor * min(size.width, size.height), rect: rect)", "if let v = spec.values(at: time) {",
      "guard finite, c.w > 0, c.h > 0 else { return source.transformed(by: spec.fill).cropped(to: rect) }",
      "guard t.scale > 0, fade > 0, spec.opacity > 0 else { return blurry }",
      "return placedFrame(spec, transform: t, opacity: fade, source: source, size: size, over: blurry, time: time)",
    ]);
    // The old background is untouched: a clip without a backdrop blurs its own frame exactly as before.
    const background = between(compositor, "static func background(", "\n  }\n");
    expect(background).toContain("static func background(_ spec: LayerSpec, source: CIImage, size: CGSize) -> CIImage {");
    expect(background).toContain("return source.transformed(by: spec.fill)");
    // New Swift sits before the frozen stretch (`blend` to the end of the file).
    expect(compositor.indexOf("static func backedFrame(")).toBeLessThan(compositor.indexOf("  static func blend("));
    expect(compositor).not.toMatch(/try!|as!/);
  });
  test("a photo's still covers the frame about its centre", () => {
    const photo = between(compositor, "static func photo(", "\n  }\n");
    inOrder(photo, [
      "guard w > 0, h > 0, renderSize.width > 0, renderSize.height > 0 else { return nil }", "let scale = max(renderSize.width / w, renderSize.height / h)",
      "CGAffineTransform(translationX: (renderSize.width - w * scale) / 2, y: (renderSize.height - h * scale) / 2)",
      "LayerBackdrop(trackID: kCMPersistentTrackID_Invalid, fill: cover, still: CIImage(cgImage: image).transformed(by: cover))",
    ]);
  });
  test("a LayerSpec has no backdrop unless it is given one", () => {
    const layer = between(compositor, "final class LayerSpec {", "\n}\n");
    expect(layer).toContain("let backdrop: LayerBackdrop?");
    expect(layer).toContain("backdrop: LayerBackdrop? = nil,");
    expect(layer).toContain("self.backdrop = backdrop");
  });
});
