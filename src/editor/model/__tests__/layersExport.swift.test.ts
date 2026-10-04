import { readFileSync } from "fs";
import { join } from "path";
import { MASK_IDS } from "../types";

/**
 * Structure of the native layer export (group E round 1). The Swift is never compiled here, so these checks pin the
 * pieces that must stay in step: the request records, the pre-pass, the instruction split and the compositor's order.
 */
const iosDir = join(__dirname, "../../../../modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
/** Swift source without its comments, so a name in a comment never satisfies a check. */
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const session = read("ExportSession.swift");
const compositor = read("ClipyCompositor.swift");
const prePass = read("MediaPrePass.swift");
const split = read("InstructionSplit.swift");
const layout = read("ClipLayout.swift");
const wrapper = readFileSync(join(iosDir, "../index.ts"), "utf8").replace(/\r\n/g, "\n");

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
const recordFields = (name: string): string[] =>
  [...between(session, `struct ${name}: Record {`, "\n}").matchAll(/@Field var (\w+)/g)].map((m) => m[1]);

describe("the request records", () => {
  it("a clip decodes opacity and mask with the neutral defaults", () => {
    const clip = between(session, "struct ExportClip: Record {", "\n}");
    expect(clip).toMatch(/@Field var opacity: Double = 1\b/);
    expect(clip).toMatch(/@Field var mask: String = "none"/);
    expect(wrapper).toMatch(/\n {2}opacity: number;/);
    expect(wrapper).toMatch(/\n {2}mask: MaskId;/);
  });
  it("a layer is every clip field plus `start`, declared with the same types and defaults", () => {
    expect(recordFields("ExportLayer")).toEqual([...recordFields("ExportClip"), "start"]);
    const declarations = (name: string) =>
      [...between(session, `struct ${name}: Record {`, "\n}").matchAll(/@Field var (\w+: [^/\n]*?)\s*(?:\/\/|\n)/g)].map((m) => m[1]);
    expect(declarations("ExportLayer").slice(0, -1)).toEqual(declarations("ExportClip"));
    expect(between(session, "struct ExportLayer: Record {", "\n}")).toMatch(/@Field var start: Double = 0\b/);
    expect(wrapper).toContain("export type ExportLayer = ExportClip & { start: number };");
  });
  it("a layer turns into a clip record field by field", () => {
    const body = between(prePass, "var clip: ExportClip {", "return out");
    for (const f of recordFields("ExportClip")) expect(body).toContain(`out.${f} = ${f}\n`);
  });
  it("the request carries the layers, none by default", () => {
    expect(between(session, "struct ExportRequest: Record {", "\n}")).toMatch(/@Field var layers: \[ExportLayer\] = \[\]/);
    expect(wrapper).toMatch(/\n {2}layers: ExportLayer\[\];/);
  });
});

describe("the pre-pass", () => {
  it("plans photo / reversed layers after the clips, and the rewrite keeps opacity and mask", () => {
    expect(prePass).toContain("static func plan(_ clips: [ExportClip], layers: [ExportClip] = []) -> [PrePassJob] {");
    expect(between(prePass, "struct PrePassJob: Equatable {", "\n}")).toMatch(/var layer: Bool = false/);
    const body = between(prePass, "static func rewrite(", "return out");
    expect(body).toContain("out.opacity = clip.opacity\n");
    expect(body).toContain("out.mask = clip.mask\n");
  });
  it("the session prepares layers with the same jobs and skips a layer that cannot be prepared", () => {
    const all = code(session);
    expect(all).toContain("let jobs = MediaPrePass.plan(request.clips, layers: layers)");
    expect(all).toContain("guard job.layer else { throw error }");
  });
});

describe("the composition", () => {
  const all = code(session);
  const layers = between(all, "var placedLayers: [PlacedOverlay] = []", "func spec(_ i: Int) -> LayerSpec {");
  it("a layer gets its own video track, retimed with the clips' helper and cut at the video's end", () => {
    inOrder(layers, [
      "CMTimeCompare(at, total) < 0", "let length = CMTimeMinimum(c.outDur, total - at)", "SpeedSpans.fitted(",
      "SpeedSpans.sourceSeconds(", "composition.addMutableTrack(withMediaType: .video", "Self.retimeCuts(",
      "insertRetimed(track, of: c.srcVideo, cuts: cuts)",
    ]);
    // No transition handles: nothing is read before the trim start, and no hold frame is inserted.
    expect(layers).toContain("SpeedSpans.plan(kept, head: 0, tail: 0)");
    expect(layers).not.toMatch(/insertScaled\(|holdFrame|halves/);
  });
  it("a layer's sound goes on its own audio track with its gain curve from the layer's start", () => {
    inOrder(layers, [
      "composition.addMutableTrack(withMediaType: .audio", "insertRetimed(audioTrack, of: srcAudio, cuts: audioCuts)",
      "AudioMix.ramps(from: Self.clipGain(c.clip), offset: at.seconds, over: aStart.seconds, to: aEnd.seconds)", "mixParams.append(",
    ]);
  });
  it("a layer's spec is transparent, with its own opacity, mask, motion and start", () => {
    expect(layers).toMatch(/opacity: l\.opacity, mask: l\.mask, transparent: true,/);
    expect(layers).toMatch(/motion: ExportSession\.clipMotion\(l\), clipStart: at\.seconds, clipLength: c\.outDur\.seconds\)/);
    expect(layers).toContain("placedLayers.append(PlacedOverlay(spec: spec, range: CMTimeRange(start: at, end: end)))");
  });
  it("a main clip's spec carries its opacity and mask", () => {
    expect(between(all, "func spec(_ i: Int) -> LayerSpec {", "\n    }\n")).toMatch(/opacity: c\.opacity, mask: c\.mask,/);
  });
  it("the instructions are split only when there are layers", () => {
    const build = between(all, "var instructions: [AVVideoCompositionInstructionProtocol] = []", "let videoComposition");
    expect(build).toContain("if !placedLayers.isEmpty { instructions = InstructionSplit.attach(placedLayers, to: instructions) }");
  });
});

describe("InstructionSplit", () => {
  const all = code(split);
  it("splits ranges at the boundaries strictly inside them (pure)", () => {
    expect(all).toContain("static func splitRanges(ranges: [CMTimeRange], boundaries: [CMTime]) -> [[CMTimeRange]] {");
    const body = between(all, "static func splitRanges(", "\n  }\n");
    expect(body).toMatch(/CMTimeCompare\(cut, from\) > 0 && CMTimeCompare\(cut, range\.end\) < 0/);
    expect(body).not.toMatch(/ClipyInstruction|LayerSpec/);
  });
  it("attaches the layers active in each piece and leaves an untouched instruction as it is", () => {
    const body = between(all, "static func attach(", "\n  }\n");
    expect(body).toContain("guard !overlays.isEmpty else { return instructions }");
    expect(body).toContain("if active.isEmpty, pieces[i].count == 1 { out.append(inst); continue }");
    expect(body).toMatch(/ClipyInstruction\(timeRange: piece, layers: inst\.layers, transition: inst\.transition, overlays: active,/);
  });
});

describe("the compositor", () => {
  const all = code(compositor);
  it("a LayerSpec knows its opacity, mask and whether it is a transparent layer (defaults = a plain clip)", () => {
    const layer = between(compositor, "final class LayerSpec {", "\n}\n");
    expect(layer).toMatch(/let opacity: Double/);
    expect(layer).toMatch(/let mask: String/);
    expect(layer).toMatch(/let transparent: Bool/);
    expect(layer).toMatch(/opacity: Double = 1, mask: String = "none", transparent: Bool = false,/);
    // A see-through or masked clip never takes the plain cover shortcut.
    expect(code(layer)).toMatch(/self\.usesFill = !placeable \|\| \(t == \.identity && c == \.full && plain\)/);
  });
  it("an instruction carries its overlays and asks for their tracks", () => {
    expect(all).toMatch(/let overlays: \[LayerSpec\]/);
    expect(all).toMatch(/overlays: \[LayerSpec\] = \[\], effects: \[ActiveEffectSpec\] = \[\]\)/);
    expect(all).toContain("self.requiredSourceTrackIDs = (layers + overlays).map { NSNumber(value: $0.trackID) as NSValue }");
  });
  it("draws the main frame, then each overlay in order, then the timeline effects", () => {
    const body = between(all, "func startRequest(", "\n  }\n");
    inOrder(body, [
      "ClipyCompositor.blend(", "for overlay in inst.overlays {", "guard let pb = req.sourceFrame(byTrackID: overlay.trackID) else { continue }",
      "ClipyCompositor.overlayFrame(overlay, source: CIImage(cvPixelBuffer: pb), over: result.cropped(to: rect), time: time, size: size)",
      "for effect in inst.effects where", "ctx.render(",
    ]);
  });
  it("an overlay always takes the placement path, at its resolved motion", () => {
    const body = between(all, "static func overlayFrame(", "\n  }\n");
    expect(body).toMatch(/spec\.values\(at: time\)/);
    expect(body).not.toMatch(/usesFill|spec\.fill|background\(/);
    expect(body).toContain("return placedFrame(spec, transform: t, opacity: fade, source: source, size: size, over: running, time: time)");
  });
  it("the one placement chain: look (layers only), mask, then rotate; opacity = static × motion", () => {
    const body = between(all, "static func placedFrame(", "\n  }\n");
    inOrder(body, [
      "let opacity = opacity * spec.opacity", "ClipLayout.ciPlacement(", ".transformed(by: p.local).cropped(to: p.localRect)",
      "ClipLayout.maskRadius(p.placed.width, p.placed.height, spec.mask)", "spec.transparent ? look(spec, on: boxed, time: time) : boxed",
      "radius > 0 ? rounded(", ".transformed(by: p.outer)", "let covered = ", "picture.composited(over: behind)", "dissolve(from: behind, to: over,",
    ]);
    // A masked main clip shows its background; a layer shows what is beneath it and never draws a background.
    expect(body).toContain("covered && radius <= 0");
    expect(body).toMatch(/if let running \{\s*behind = running/);
  });
  it("the mask is a rounded rectangle blended in the picture's own space; a missing filter key cannot raise", () => {
    const rounded = between(all, "static func rounded(", "\n  }\n");
    expect(rounded).toContain('"CIBlendWithMask"');
    expect(rounded).toContain('"inputMaskImage"');
    const shape = between(all, "static func roundedShape(", "\n  }\n");
    expect(shape).toContain('CIFilter(name: "CIRoundedRectangleGenerator")');
    for (const key of ["inputExtent", "inputRadius", "inputColor"]) expect(shape).toContain(`keys.contains("${key}")`);
    expect(shape).toContain("return drawnRoundedShape(rect: rect, radius: r)");
    expect(between(all, "static func drawnRoundedShape(", "\n  }\n")).toContain("CGPath(roundedRect:");
  });
  it("a mask box with a non-finite side is refused before the Core Graphics fallback can turn it into an Int", () => {
    const shape = code(between(compositor, "static func roundedShape(", "\n  }\n"));
    inOrder(shape, ["guard radius.isFinite, !rect.isEmpty, !rect.isInfinite, rect.width.isFinite, rect.height.isFinite else { return nil }", "drawnRoundedShape("]);
  });
  it("a pre-pass folder that cannot be made fails the export only when a main clip needs it; layers are left out instead", () => {
    const body = code(between(session, "if hasJobs {", "// 1. Load every clip first"));
    inOrder(body, [
      "var folder: URL? = nil", "do { folder = try MediaPrePass.makeFolder(exportId: id) } catch {",
      "guard jobs.allSatisfy({ $0.layer }) else { throw MediaPrePass.failure(for: jobs[0].kind) }",
      "for job in jobs { unpreparedLayers.insert(job.clipIndex) }", "prepFolder = folder", "if let folder {", "for (j, job) in jobs.enumerated() {",
    ]);
  });
  it("a layer with a negative (or non-finite) start is left out", () => {
    expect(code(session)).toContain("guard !unpreparedLayers.contains(i), layerStarts[i].isFinite, layerStarts[i] >= 0 else { continue }");
  });
  it("the mask ids are the ones ClipLayout.maskRadius knows", () => {
    const body = between(layout, "static func maskRadius(", "\n  }\n");
    const cases = [...body.matchAll(/case "(\w+)":/g)].map((m) => m[1]);
    expect([...cases, "none"].sort()).toEqual([...MASK_IDS].sort());
  });
});
