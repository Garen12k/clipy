import { readFileSync } from "fs";
import { join } from "path";
import { CURVE_DECIMALS, CURVE_MAX_POINTS, CURVE_MIN_STEP, CURVE_STEP, CURVE_STEP_SAFETY, CURVE_TOLERANCE } from "../audioMix";
import { DUCKING } from "../types";
import { CLIP_CURVE_VECTORS, CURVE_VECTORS, DUCK_VECTORS, ENVELOPE_VECTORS, FIT_VECTORS, INTERVAL_EXPECT, INTERVAL_TRACKS, type MixTrack } from "./audioMix.vectors";

const iosDir = join(__dirname, "../../../../modules/clipy-video/ios");
/** Line endings normalised, so the checks do not depend on how git checked the files out. */
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const swift = read("AudioMix.swift");
const table = read("Tests/AudioMixTests.swift");
const session = read("ExportSession.swift");
const prePass = read("MediaPrePass.swift");
const wrapper = readFileSync(join(iosDir, "../index.ts"), "utf8");

/** Numbers are written in Swift exactly as JS prints them (the vectors are plain literals), e.g. 0.65, -0.5, 2. */
const fmt = (n: number) => String(n);
/** The text of `source` from `from` up to `to` (or the end). */
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
/** Swift source without its comments, so a name in a comment never satisfies a check. */
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const fnBody = (name: string) => code(between(swift, `static func ${name}(`, "\n  }\n"));
/** The `@Field var` names of one record in ExportSession.swift, in order. */
const recordFields = (name: string): string[] =>
  [...between(session, `struct ${name}: Record {`, "\n}").matchAll(/@Field var (\w+)/g)].map((m) => m[1]);
const count = (source: string, part: string) => source.split(part).length - 1;

test("AudioMix.swift declares the DUCKING and curve constants with the same values (plus its own time grid)", () => {
  const constants = Object.fromEntries([...swift.matchAll(/static let (\w+): Double = (-?[0-9.]+)/g)].map((m) => [m[1], Number(m[2])]));
  expect(constants).toEqual({
    duckLevel: DUCKING.level, duckRamp: DUCKING.ramp,
    curveStep: CURVE_STEP, curveMinStep: CURVE_MIN_STEP, curveMaxPoints: CURVE_MAX_POINTS, curveTolerance: CURVE_TOLERANCE,
    curveStepSafety: CURVE_STEP_SAFETY, curveDecimals: CURVE_DECIMALS,
    ticksPerSecond: 600,
  });
  // Every `static let` is one of those (none with another type slipped past the pattern above).
  expect([...swift.matchAll(/static let (\w+)/g)].map((m) => m[1]).sort()).toEqual(Object.keys(constants).sort());
  // The tick is the export's own time grid.
  expect(session).toContain("static func time(_ seconds: Double) -> CMTime { CMTime(seconds: seconds, preferredTimescale: 600) }");
  expect(code(swift)).toContain("static var tick: Double { 1 / ticksPerSecond }");
});

test("AudioMix.swift mirrors the pure functions of audioMix.ts and adds the ramps", () => {
  expect(swift).toContain("static func fitFades(fadeIn: Double, fadeOut: Double, length: Double) -> (fadeIn: Double, fadeOut: Double) {");
  expect(swift).toContain("static func fadeEnvelope(local: Double, length: Double, fadeIn: Double, fadeOut: Double) -> Double {");
  expect(swift).toContain("static func voiceIntervals(_ tracks: [MixTrack]) -> [MixInterval] {");
  expect(swift).toContain("static func duckFactorAt(_ intervals: [MixInterval], time: Double) -> Double {");
  expect(swift).toContain("static func usable(_ points: [GainPoint]) -> [GainPoint] {");
  expect(swift).toContain("static func gain(at time: Double, in points: [GainPoint]) -> Double {");
  expect(swift).toContain("static func ramps(from points: [GainPoint]) -> [GainRamp] {");
  expect(swift).toContain("static func ramps(from points: [GainPoint], offset: Double, over lo: Double, to hi: Double) -> [GainRamp] {");
  // Swift rejects `static let x` / `static var x` next to `static func x(...)`.
  const values = [...swift.matchAll(/static (?:let|var) (\w+)/g)].map((m) => m[1]);
  const funcs = [...swift.matchAll(/static func (\w+)\(/g)].map((m) => m[1]);
  expect(values.filter((n) => funcs.includes(n))).toEqual([]);
  // Pure maths: nothing from AVFoundation in this file.
  expect(code(swift)).not.toMatch(/import (AVFoundation|CoreMedia)|CMTime/);
});

test("the formulas are the ones of audioMix.ts", () => {
  const fit = fnBody("fitFades");
  expect(fit).toContain("if a + b <= len { return (fadeIn: a, fadeOut: b) }");
  expect(fit).toContain("let k = len / (a + b)");
  const envelope = fnBody("fadeEnvelope");
  expect(envelope).toContain("guard local.isFinite, length.isFinite, length > 0 else { return 0 }");
  expect(envelope).toContain("if local < 0 || local > length { return 0 }");
  expect(envelope).toContain("let up = f.fadeIn > 0 ? local / f.fadeIn : 1");
  expect(envelope).toContain("let down = f.fadeOut > 0 ? (length - local) / f.fadeOut : 1");
  expect(envelope).toContain("return min(1, min(up, down))");
  const voices = fnBody("voiceIntervals");
  expect(voices).toContain(`for t in tracks where t.kind == "voice" && finitePositive(t.volume) > 0 {`);
  expect(voices).toContain("let end = t.start + (t.trimEnd - t.trimStart)");
  expect(voices).toContain("if let last = merged.last, s.start <= last.end {");
  const duck = fnBody("duckFactorAt");
  expect(duck).toContain("guard time.isFinite else { return 1 }");
  expect(duck).toContain("let distance = time < i.start ? i.start - time : (time > i.end ? time - i.end : 0)");
  expect(duck).toContain("if distance >= duckRamp { continue }");
  expect(duck).toContain("factor = min(factor, min(1, duckLevel + (1 - duckLevel) * (distance / duckRamp)))");
  // Breakpoints closer than a tick are merged, the later gain winning only at the very start (as `curveFrom` does).
  const usable = fnBody("usable");
  expect(usable).toContain("if let last = out.last, p.time - last.time < tick {");
  expect(usable).toContain("if out.count == 1 { out[0] = GainPoint(time: last.time, gain: level) }");
});

const interval = (i: [number, number]) => `MixInterval(start: ${fmt(i[0])}, end: ${fmt(i[1])})`;
const point = (b: { time: number; gain: number }) => `GainPoint(time: ${fmt(b.time)}, gain: ${fmt(b.gain)})`;
const mixTrack = (t: MixTrack) => `MixTrack(start: ${fmt(t.start)}, trimStart: ${fmt(t.trimStart)}, trimEnd: ${fmt(t.trimEnd)}, volume: ${fmt(t.volume)}, kind: "${t.kind}")`;

describe("the Swift test table embeds every shared vector's numbers", () => {
  const curves = [...CURVE_VECTORS, ...CLIP_CURVE_VECTORS];
  it("has the same number of cases", () => {
    expect(count(table, 'AudioFitVector(name: "')).toBe(FIT_VECTORS.length);
    expect(count(table, 'AudioEnvelopeVector(name: "')).toBe(ENVELOPE_VECTORS.length);
    expect(count(table, 'AudioDuckVector(name: "')).toBe(DUCK_VECTORS.length);
    expect(count(table, 'AudioCurveVector(name: "')).toBe(curves.length);
  });
  it.each(FIT_VECTORS.map((v) => [v.name, v] as const))("fitFades: %s", (_name, v) => {
    expect(table).toContain(`AudioFitVector(name: "${v.name}", fadeIn: ${fmt(v.fadeIn)}, fadeOut: ${fmt(v.fadeOut)}, length: ${fmt(v.length)}, fittedIn: ${fmt(v.in)}, fittedOut: ${fmt(v.out)})`);
  });
  it.each(ENVELOPE_VECTORS.map((v) => [v.name, v] as const))("fadeEnvelope: %s", (_name, v) => {
    expect(table).toContain(`AudioEnvelopeVector(name: "${v.name}", local: ${fmt(v.local)}, length: ${fmt(v.length)}, fadeIn: ${fmt(v.fadeIn)}, fadeOut: ${fmt(v.fadeOut)}, expect: ${fmt(v.expect)})`);
  });
  it("voiceIntervals: the tracks and the merged intervals", () => {
    expect(table).toContain(`let audioIntervalTracks: [MixTrack] = [\n${INTERVAL_TRACKS.map((t) => `  ${mixTrack(t)},\n`).join("")}]`);
    expect(table).toContain(`let audioIntervalExpect: [MixInterval] = [${INTERVAL_EXPECT.map(interval).join(", ")}]`);
  });
  it.each(DUCK_VECTORS.map((v) => [v.name, v] as const))("duckFactorAt: %s", (_name, v) => {
    expect(table).toContain(`AudioDuckVector(name: "${v.name}", intervals: [${v.intervals.map(interval).join(", ")}], time: ${fmt(v.time)}, expect: ${fmt(v.expect)})`);
  });
  it.each(curves.map((v) => [v.name, v] as const))("a curve the export draws: %s", (_name, v) => {
    expect(table).toContain(`AudioCurveVector(name: "${v.name}", points: [${v.curve.map(point).join(", ")}])`);
  });
  it("the vectors are checked to 1e-9", () => {
    expect(table).toMatch(/accuracy: 1e-9/);
    expect(table).not.toMatch(/accuracy: 1e-[0-5]\b/);
  });
});

test("the request records: gain curves on clips and audio tracks, and no single `audio` any more", () => {
  expect(recordFields("ExportGainPoint")).toEqual(["time", "gain"]);
  expect(recordFields("ExportAudioTrack")).toEqual(["sourceUri", "start", "trimStart", "trimEnd", "gain"]);
  expect(between(session, "struct ExportAudioTrack: Record {", "\n}")).toMatch(/@Field var gain: \[ExportGainPoint\] = \[\]/);
  expect(between(session, "struct ExportClip: Record {", "\n}")).toMatch(/@Field var gain: \[ExportGainPoint\] = \[\]/);
  const request = between(session, "struct ExportRequest: Record {", "\n}");
  expect(request).toMatch(/@Field var audioTracks: \[ExportAudioTrack\] = \[\]/);
  expect(recordFields("ExportRequest")).not.toContain("audio");
  expect(code(session)).not.toMatch(/struct ExportAudio: Record|request\.audio\b/);
  // The wrapper sends the same shape.
  expect(wrapper).toMatch(/export interface ExportAudioTrack \{ sourceUri: string; start: number; trimStart: number; trimEnd: number; gain: ExportGainPoint\[\] \}/);
  expect(wrapper).toMatch(/\n {2}audioTracks: ExportAudioTrack\[\];/);
  expect(wrapper).toMatch(/\n {2}gain: ExportGainPoint\[\];/);
  expect(wrapper).not.toMatch(/\baudio: |interface ExportAudio /);
});

test("the pre-pass rewrite carries the clip's gain curve", () => {
  const body = between(prePass, "static func rewrite(", "return out");
  expect(recordFields("ExportClip")).toContain("gain");
  for (const f of recordFields("ExportClip")) expect(body).toMatch(new RegExp(`\\n\\s*out\\.${f} = `));
  expect(body).toContain("out.gain = clip.gain\n");
});

describe("ExportSession mixes with the curves", () => {
  const all = code(session);
  it("turns a request curve into points, falling back to volume / muted only when a clip has none", () => {
    expect(all).toContain("static func gainPoints(_ points: [ExportGainPoint], fallback: Double) -> [GainPoint] {");
    expect(code(between(session, "static func clipGain(", "\n  }\n"))).toContain("return gainPoints(c.gain, fallback: c.muted ? 0 : c.volume)");
    // Nothing else reads a clip's volume / muted.
    expect(count(all, "c.muted")).toBe(1);
    expect(count(all, ".muted")).toBe(1);
    expect(count(all, ".volume")).toBe(1);
  });
  it("draws ramps only, never overlapping, one call site", () => {
    const apply = code(between(session, "static func applyRamps(", "\n  }\n"));
    expect(apply).toContain("let start = CMTimeMaximum(time(r.start), drawnTo ?? .zero)");
    expect(apply).toContain("guard CMTimeCompare(end, start) > 0 else { continue }");
    expect(apply).toContain("if drawnTo == nil, CMTimeCompare(start, .zero) > 0 { params.setVolume(Float(r.from), at: .zero) }");
    expect(apply).toContain("params.setVolumeRamp(fromStartVolume: Float(r.from), toEndVolume: Float(r.to), timeRange: CMTimeRange(start: start, end: end))");
    expect(count(all, "setVolumeRamp(")).toBe(1);
    expect(count(all, "setVolume(")).toBe(1);
  });
  it("each clip's curve sits at bodyStart, over the clip's own audio range, on both the constant-speed and the curved path", () => {
    const perClip = "audioRamps[k].append(contentsOf: AudioMix.ramps(from: Self.clipGain(c.clip), offset: bodyStart.seconds, over: aStart.seconds, to: aEnd.seconds))";
    expect(count(all, perClip)).toBe(2);
    expect(count(all, "audioUsed[k] = true")).toBe(2);
    expect(all).toContain("if !audioUsed[k] { composition.removeTrack(audioTrack); continue }");
    expect(all).toContain("Self.applyRamps(audioRamps[k], to: params)");
    expect(all).not.toMatch(/audioVolumes/);
  });
  it("one composition track per request audio track, played with its curve; no automatic fade", () => {
    const loop = code(between(session, "for audio in request.audioTracks {", "\n    }\n"));
    expect(loop).toContain("composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)");
    expect(loop).toContain("let length = CMTimeMinimum(CMTimeSubtract(srcEnd, srcStart), CMTimeSubtract(total, insertAt))");
    expect(loop).toContain("try track.insertTimeRange(CMTimeRange(start: srcStart, duration: length), of: srcAudio, at: insertAt)");
    expect(loop).toContain("Self.applyRamps(AudioMix.ramps(from: Self.gainPoints(audio.gain, fallback: 1), offset: 0, over: insertAt.seconds, to: (insertAt + length).seconds), to: params)");
    // A bad file still fails the export.
    expect(count(loop, "throw ExportError.sessionFailed(")).toBe(2);
    expect(all).not.toMatch(/toEndVolume: 0\b/);
  });
});

describe("audio tracks are placed on a millisecond grid, so the two pieces of a split meet exactly", () => {
  const src = code(session);
  const loop = code(between(session, "for audio in request.audioTracks {", "\n    }\n"));
  /** `CMTime(seconds:preferredTimescale:)` as ticks: the nearest whole tick. */
  const ticks = (seconds: number, scale: number) => Math.round(seconds * scale);
  const r3 = (v: number) => Math.round(v * 1000) / 1000;

  it("the audio-track path builds its insert time and source range at timescale 1000; everything else stays at 600", () => {
    expect(src).toContain("static let audioTimescale: CMTimeScale = 1000");
    expect(src).toContain("static func audioTime(_ seconds: Double) -> CMTime { CMTime(seconds: seconds, preferredTimescale: audioTimescale) }");
    expect(src).toContain("static func time(_ seconds: Double) -> CMTime { CMTime(seconds: seconds, preferredTimescale: 600) }");
    expect(loop).toContain("let insertAt = Self.audioTime(max(0, audio.start))");
    expect(loop).toContain("let srcEnd = CMTimeMinimum(Self.audioTime(max(0, audio.trimEnd)), assetDuration)");
    expect(loop).toContain("let srcStart = CMTimeMinimum(Self.audioTime(max(0, audio.trimStart)), srcEnd)");
    expect(loop).not.toMatch(/Self\.time\(/);
    // Only that loop uses the audio grid: clips, layers and ramps are untouched.
    expect(src.split("audioTime(").length - 1).toBe(4); // the definition and the three uses
    expect(src.split("audioTime(").length - 1 - (loop.split("audioTime(").length - 1)).toBe(1);
  });

  it("on that grid a split is contiguous: the first piece ends on the tick the second starts on, in the video and in the file", () => {
    let holesAt600 = 0, cases = 0;
    for (let start = 0; start < 3; start += 0.137) for (let trimStart = 0; trimStart < 2; trimStart += 0.211) for (let into = 0.3; into < 4; into += 0.173) {
      const s = r3(start), t = r3(trimStart), cut = r3(t + into);     // stored values: 3 decimals
      const second = r3(s + (cut - t));                               // the second piece's start, as `audioSplitPieces` stores it
      cases++;
      // First piece: inserted at s, source [t, cut). Second: inserted at `second`, source from cut.
      expect(ticks(s, 1000) + (ticks(cut, 1000) - ticks(t, 1000))).toBe(ticks(second, 1000));
      if (ticks(s, 600) + (ticks(cut, 600) - ticks(t, 600)) !== ticks(second, 600)) holesAt600++;
    }
    expect(cases).toBeGreaterThan(4000);
    // What it was: on the 1/600 s grid about a third of the cuts had a one-tick hole or overlap.
    expect(holesAt600 / cases).toBeGreaterThan(0.2);
  });

  it("the Swift tests assert the same arithmetic", () => {
    const tests = read("Tests/ExportSessionTests.swift");
    expect(tests).toContain("func testAudioTrackTimesAreOnAMillisecondGrid() {");
    expect(tests).toContain("XCTAssertEqual(ExportSession.audioTimescale, 1000)");
  });
});
