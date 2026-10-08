import { readFileSync } from "fs";
import { join } from "path";
import { BAND_TYPES, DISTORTION_PRESETS, REVERB_PRESETS, soundChain } from "../sound";
import { NO_SOUND } from "../types";

// There is no Swift compiler on this machine: these tests READ the Swift and pin what the app relies on — the names and shapes of
// modules/clipy-video/index.ts, the cancel code, the part-file move, the limits that make the render loop end.
const root = join(__dirname, "../../../..");
const iosDir = join(root, "modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const render = code(read("SoundRender.swift"));
const moduleSwift = code(read("ClipyVideoModule.swift"));
const session = code(read("ExportSession.swift"));
const wrapper = readFileSync(join(root, "modules/clipy-video/index.ts"), "utf8");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const fields = (name: string) => [...between(render, `struct ${name}: Record {`, "\n}").matchAll(/@Field var (\w+)/g)].map((m) => m[1]);
const keysOf = (name: string) => [...between(render, `static let ${name}:`, "\n  ]").matchAll(/"(\w+)": \./g)].map((m) => m[1]);
const processFn = between(render, "static func process(", "\n  }\n");
const renderFn = between(render, "static func render(", "\n  }\n");
/**
 * Reverb presets the app's table names that this build cannot: `AVAudioUnitReverbPreset.outdoorGeneral` exists from iOS 27 only
 * (Apple's documentation), and the module is built for iOS 16.4 — naming the case would not compile. A request that names it gets
 * no reverb unit, like any unknown name. No voice uses it.
 */
const NOT_ON_IOS_16 = ["outdoorGeneral"];

test("the request record has exactly the fields the app sends, and a band exactly a band's", () => {
  const sent = Object.keys({ ...soundChain(NO_SOUND), jobId: "", sourceUri: "", outputPath: "" }).sort();
  expect(fields("SoundRenderRequest").sort()).toEqual(sent);
  expect(fields("SoundBand").sort()).toEqual(["bandwidth", "frequency", "gain", "type"]);
});

test("every name the app may send is a key of the Swift tables, and the tables hold nothing else", () => {
  expect(keysOf("reverbPresets").sort()).toEqual(REVERB_PRESETS.filter((p) => !NOT_ON_IOS_16.includes(p)).sort());
  expect(keysOf("distortionPresets").sort()).toEqual([...DISTORTION_PRESETS].sort());
  expect(keysOf("filterTypes").sort()).toEqual([...BAND_TYPES].sort());
  // Each key maps to the case of the same name.
  for (const table of ["reverbPresets", "distortionPresets", "filterTypes"]) for (const m of between(render, `static let ${table}:`, "\n  ]").matchAll(/"(\w+)": \.(\w+)/g)) expect(m[2]).toBe(m[1]);
});

test("no case newer than iOS 16.4 is named, and no voice needs one", () => {
  for (const name of NOT_ON_IOS_16) {
    expect(render).not.toContain(name);
    expect(REVERB_PRESETS).toContain(name);
  }
  // Every preset a voice or an equaliser can actually send has its unit.
  const sendable = new Set<string>();
  for (const voice of ["deep", "high", "chipmunk", "robot", "echo", "hall", "telephone"] as const) for (const strength of [0, 0.5, 1]) {
    const chain = soundChain({ ...NO_SOUND, voice, strength });
    if (chain.reverbPreset) sendable.add(chain.reverbPreset);
  }
  for (const name of sendable) expect(keysOf("reverbPresets")).toContain(name);
  expect(render).not.toMatch(/\.close\(\)/);   // AVAudioFile.close() is iOS 18
});

test("the source asset is held strongly for as long as its track is used", () => {
  const source = between(render, "final class SoundSource {", "\n}");
  expect(source).toContain("let asset: AVURLAsset");
  expect(source).toContain("let track: AVAssetTrack");
  expect(render).not.toMatch(/weak var asset|unowned/);
  // Any file — a video's sound, a voice-over, a bundled song — is read with an asset reader, never AVAudioFile(forReading:).
  expect(source).toContain("AVAssetReaderAudioMixOutput(audioTracks: [track], audioSettings: SoundRender.pcmSettings)");
  expect(render).not.toContain("forReading");
  expect(source).toContain('throw SoundError.failed("sound open: no sound in this file")');
});

test("the render loop is synchronous and schedules with the completion-handler overload", () => {
  expect(processFn.slice(0, processFn.indexOf("{"))).not.toContain("async");
  const calls = [...render.matchAll(/\.scheduleBuffer\(([^)]*)\)/g)].map((m) => m[1]);
  expect(calls.length).toBeGreaterThanOrEqual(2);
  for (const c of calls) expect(c).toMatch(/, completionHandler: nil$/);
  expect(render).not.toMatch(/await [\w.]*scheduleBuffer/);
  expect(renderFn.split("{")[0]).not.toContain("async");
  for (const fn of [processFn, renderFn, between(render, "static func measure(", "\n  }\n"), between(render, "static func through(", "\n  }\n")]) expect(fn).not.toMatch(/\bawait\b/);
  expect(processFn).toContain("if job.isCancelled { throw SoundError.cancelled }");
  expect(processFn).toContain("try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: maxFrames)");
  expect(processFn).toContain("SoundMath.softClip(");
});

test("the engine is set to offline rendering before it starts, and the player plays only after", () => {
  const enable = processFn.indexOf("try engine.enableManualRenderingMode(");
  const start = processFn.indexOf("try engine.start()");
  const play = processFn.indexOf("player.play()");
  const pull = processFn.indexOf("try engine.renderOffline(");
  expect(enable).toBeGreaterThan(0);
  expect(start).toBeGreaterThan(enable);
  expect(play).toBeGreaterThan(start);
  expect(pull).toBeGreaterThan(play);
  // Every connection is made in the one render format: nothing converts a sample rate or a channel count.
  const connections = [...processFn.matchAll(/engine\.connect\(([^\n]*)\)/g)].map((m) => m[1]);
  expect(connections.length).toBe(2);
  for (const c of connections) expect(c).toMatch(/, format: format$/);
  expect(processFn).toContain("defer {\n      player.stop()\n      engine.stop()\n    }");
});

test("the render loop always ends: a cancel flag, a hard frame cap, a stall limit, and every engine status handled", () => {
  const loop = processFn.slice(processFn.indexOf("while true {"));
  expect(loop.indexOf("if job.isCancelled { throw SoundError.cancelled }")).toBeGreaterThan(0);
  expect(loop).toContain('if pulledFrames >= frameCap { throw SoundError.failed("sound render: the render ran past its frame cap") }');
  // Both checks come before the engine is pulled, on every pass.
  expect(loop.indexOf("if pulledFrames >= frameCap")).toBeLessThan(loop.indexOf("engine.renderOffline("));
  expect(loop.indexOf("if job.isCancelled")).toBeLessThan(loop.indexOf("engine.renderOffline("));
  expect(processFn).toMatch(/let frameCap: Int = Int\(min\(/);
  expect(loop).toContain("stalls += 1");
  expect(loop).toContain('if stalls > maxStalls { throw SoundError.failed("sound render: the engine stopped giving sound") }');
  expect(render).toMatch(/static let maxStalls: Int = \d+\n/);
  const statuses = between(loop, "switch status {", "\n        }");
  for (const c of ["case .success:", "case .insufficientDataFromInputNode, .cannotDoInCurrentContext:", "case .error:", "@unknown default:"]) expect(statuses).toContain(c);
  expect(statuses).toContain('case .error: throw SoundError.failed("sound render: the engine reported an error")');
  // After the source has ended the loop renders on for the units' latency only, then leaves.
  expect(loop).toContain("let want = ended ? min(Int(maxFrames), scheduledFrames + latencyFrames - pulledFrames) : Int(maxFrames)");
  expect(loop).toContain("if want <= 0 { return false }");
  // The measuring pass checks the flag on every buffer too.
  expect(between(render, "static func measure(", "\n  }\n")).toContain("if job.isCancelled { throw SoundError.cancelled }");
});

test("the copy is written under a part- name and moved into place only when it is complete", () => {
  expect(renderFn).toContain('let partURL = folder.appendingPathComponent("part-" + outputURL.lastPathComponent)');
  expect(renderFn).toContain("defer { if !finished { try? FileManager.default.removeItem(at: partURL) } }");
  expect(renderFn).toContain("AVAudioFile(forWriting: partURL,");
  expect(renderFn).not.toContain("forWriting: outputURL");
  // The file is opened and written inside one scope, which has closed (the file released = finished) before the move.
  const scope = renderFn.indexOf("let frames: Int = try autoreleasepool {");
  const write = renderFn.indexOf("try file.write(from: buffer)");
  const moved = renderFn.indexOf("try FileManager.default.moveItem(at: partURL, to: outputURL)");
  const done = renderFn.indexOf("finished = true");
  expect(scope).toBeGreaterThan(0);
  expect(write).toBeGreaterThan(scope);
  expect(renderFn.indexOf("\n    }\n", write)).toBeLessThan(moved);
  expect(done).toBeGreaterThan(moved);
  expect(renderFn.match(/finished = true/g)).toHaveLength(1);
  // Nothing is moved when nothing was rendered.
  expect(renderFn.indexOf("guard frames > 0 else")).toBeLessThan(moved);
  // One engine at a time, and a render that waits its turn still answers a cancel.
  const gate = between(renderFn, "while !gate.lock(before:", "\n    }");
  expect(gate).toContain("if job.isCancelled { throw SoundError.cancelled }");
  expect(renderFn).toContain("defer { gate.unlock() }");
});

test("the loudness maths is SoundMath's: nothing here computes a level, a gain or the peak guard", () => {
  expect(between(render, "static func measure(", "\n  }\n")).toContain("return SoundMath.levelGainDb(blocks)");
  expect(between(render, "static func measure(", "\n  }\n")).toContain("SoundMath.levelBlockSeconds");
  expect(renderFn).toContain("SoundMath.dbToGain(gainDb)");
  expect(render).not.toMatch(/\b(pow|log10|tanh|exp|log)\(/);
});

test("every failure names its stage, and an Error is always described", () => {
  const messages = [...render.matchAll(/SoundError\.failed\("([^"]*)"/g)].map((m) => m[1]);
  expect(messages.length).toBeGreaterThanOrEqual(10);
  for (const m of messages) expect(m).toMatch(/^sound (open|reader|engine|output|render|noise): /);
  // A `catch` that rethrows as a SoundError carries the description of what it caught.
  const rethrown = [...render.matchAll(/catch \{ throw SoundError\.failed\(([^\n]*)\) \}/g)];
  expect(rethrown.length).toBeGreaterThanOrEqual(6);
  for (const m of rethrown) expect(m[1]).toContain("ExportSession.describe(");
  expect(render).not.toContain("localizedDescription");
});

test("nothing is force-unwrapped, force-cast or force-tried", () => {
  for (const source of [render, between(moduleSwift, 'AsyncFunction("renderSound")', "\n  }\n}")]) {
    expect(source).not.toMatch(/[\w)\]]!(?!=)/);
    expect(source).not.toMatch(/\b(try|as)!/);
  }
});

test("no type and no static name is declared twice", () => {
  const types = [...render.matchAll(/^(?:final class|struct|enum) (\w+)/gm)].map((m) => m[1]);
  expect(types.sort()).toEqual(["SoundBand", "SoundError", "SoundJob", "SoundNoise", "SoundProbe", "SoundReader", "SoundRender", "SoundRenderRequest", "SoundSource"]);
  const others = ["ExportSession.swift", "ClipyVideoModule.swift", "MediaPrePass.swift", "Transcriber.swift", "AudioMix.swift", "SoundMath.swift"].map((f) => code(read(f))).join("\n");
  for (const t of types) expect(others).not.toMatch(new RegExp(`(?:class|struct|enum) ${t}\\b`));
  for (const owner of ["SoundRender", "SoundProbe", "SoundNoise"]) {
    const body = between(render, `enum ${owner} {`, "\n}\n");
    const values = [...body.matchAll(/static (?:let|var) (\w+)/g)].map((m) => m[1]);
    const funcs = [...body.matchAll(/static func (\w+)\(/g)].map((m) => m[1]);
    expect(values.filter((n) => funcs.includes(n))).toEqual([]);
    expect(new Set(values).size).toBe(values.length);
    expect(new Set(funcs).size).toBe(funcs.length);
  }
});

test("the module registers the four functions and the event", () => {
  expect(moduleSwift).toContain('Events("onExportEvent", "onSoundEvent")');
  for (const name of ["renderSound", "soundInfo", "probeNoiseReduction"]) expect(moduleSwift).toContain(`AsyncFunction("${name}")`);
  expect(moduleSwift).toContain('Function("cancelSoundRender")');
  expect(moduleSwift).toContain('promise.reject("E_SOUND_CANCELLED", "Sound cancelled")');
  expect(moduleSwift).toContain('promise.reject("E_SOUND", SoundRender.message(error))');
  expect(moduleSwift).toContain('"sound info: " + ExportSession.describe(error)');
  // The export functions are still there.
  for (const name of ["exportTimeline", "transcribe"]) expect(moduleSwift).toContain(`AsyncFunction("${name}")`);
});

test("the module answers with the names and shapes the wrapper declares", () => {
  // Every native name the wrapper calls is registered, and the cancel code is the wrapper's.
  for (const fn of ["renderSound", "cancelSoundRender", "soundInfo", "probeNoiseReduction"]) {
    expect(wrapper).toContain(`soundNative("${fn}").${fn}(`);
    expect(moduleSwift).toMatch(new RegExp(`Function\\("${fn}"\\)`));
  }
  expect(wrapper).toContain('native().addListener("onSoundEvent", cb)');
  const cancelCode = /export const SOUND_CANCELLED = "(\w+)";/.exec(wrapper)?.[1];
  expect(cancelCode).toBe("E_SOUND_CANCELLED");
  expect(moduleSwift.match(new RegExp(`promise\\.reject\\("${cancelCode}"`, "g"))).toHaveLength(1);
  // SoundEvent { jobId, progress }; SoundRenderResult { fileUri, seconds, gainDb }; SoundInfo { hasSound, seconds }; NoiseProbe { ok, stage, detail }.
  expect(wrapper).toContain("export type SoundEvent = { jobId: string; progress: number };");
  expect(moduleSwift).toContain('sendEvent("onSoundEvent", ["jobId": jobId, "progress": fraction])');
  expect(wrapper).toContain("export interface SoundRenderResult { fileUri: string; seconds: number; gainDb: number }");
  expect(moduleSwift).toContain('let answer: [String: Any] = ["fileUri": outputURL.absoluteString, "seconds": result.seconds, "gainDb": result.gainDb]');
  expect(wrapper).toContain("export interface SoundInfo { hasSound: boolean; seconds: number }");
  expect(moduleSwift).toContain('let answer: [String: Any] = ["hasSound": !found.isEmpty, "seconds": length.seconds.isFinite ? length.seconds : 0]');
  expect(wrapper).toContain("export interface NoiseProbe { ok: boolean; stage: string; detail: string }");
  expect(render).toContain('return ["ok": ok, "stage": stage, "detail": detail]');
});

test("a render answers exactly once on every path, and a cancel reaches it through its job", () => {
  const fn = between(moduleSwift, 'AsyncFunction("renderSound")', '\n    Function("cancelSoundRender")');
  // The job is known before the work starts, so a cancel that comes at once is not lost; it is forgotten when the render has answered.
  expect(fn.indexOf("self.storeSoundJob(jobId, job)")).toBeLessThan(fn.indexOf("Task {"));
  expect(fn).toContain("defer { self?.dropSoundJob(jobId) }");
  // One resolve, and one reject in each of the two catches that between them take every error.
  expect(fn.match(/promise\.resolve\(/g)).toHaveLength(1);
  expect(fn.match(/promise\.reject\(/g)).toHaveLength(2);
  expect(fn).toMatch(/promise\.resolve\(answer\)\n\s*\} catch SoundError\.cancelled \{\n\s*promise\.reject\("E_SOUND_CANCELLED", "Sound cancelled"\)\n\s*\} catch \{\n\s*promise\.reject\("E_SOUND", SoundRender\.message\(error\)\)\n\s*\}/);
  expect(fn).not.toMatch(/\breturn\b(?! *\})/);   // no early way out of the do block (the progress closure's guard is the one `return`)
  // Cancelling: the flag of that job only; an unknown or finished job is a no-op.
  expect(between(moduleSwift, 'Function("cancelSoundRender")', "\n    }")).toContain("self.lookupSoundJob(jobId)?.cancel()");
  const job = between(render, "final class SoundJob", "\n}");
  expect(job).toContain("private let lock = NSLock()");
  expect(job.match(/lock\.lock\(\)/g)).toHaveLength(2);
});

test("the noise test never throws and never assumes the unit exists", () => {
  const probe = between(render, "enum SoundProbe {", "\n}\n");
  const run = between(probe, "static func run(", "\n  }\n");
  expect(run.split("{")[0]).toContain("async -> [String: Any]");
  expect(run.split("{")[0]).not.toContain("throws");
  expect(run).toContain("componentType: kAudioUnitType_Effect, componentSubType: kAudioUnitSubType_AUSoundIsolation");
  expect(run).toContain("componentManufacturer: kAudioUnitManufacturer_Apple");
  expect(run).toContain("guard AudioComponentFindNext(nil, &description) != nil else { return report(false, \"find\",");
  // Every `try` in it sits in a do / catch that answers.
  expect(run.match(/\btry\b/g)?.length).toBe(run.match(/\bdo \{/g)?.length);
  expect(run.match(/catch \{ return report\(false, /g)?.length).toBe(run.match(/\bdo \{/g)?.length);
  expect(moduleSwift).toContain("let answer: [String: Any] = await SoundProbe.run(uri)");
});

test("the export skips a video without sound that sits on the audio row, and still fails for any other file without sound", () => {
  const loop = between(session, "for audio in request.audioTracks {", "mixParams.append(params)");
  expect(loop).toContain("let pictures = (try? await audioAsset.loadTracks(withMediaType: .video)) ?? []");
  expect(loop).toContain("if !pictures.isEmpty { continue }");
  expect(loop).toContain('throw ExportError.sessionFailed("No sound in audio file \\(audio.sourceUri)")');
  expect(loop).toContain("sourceAssets.append(audioAsset)");
  // A file WITH sound takes the lines it always took, in the order it always took them.
  const order = ["let audioAsset = AVURLAsset(url: audioURL)", "sourceAssets.append(audioAsset)", "guard let srcAudio = try await audioAsset.loadTracks(withMediaType: .audio).first else {",
    "let assetDuration = try await audioAsset.load(.duration)", "try track.insertTimeRange(CMTimeRange(start: srcStart, duration: length), of: srcAudio, at: insertAt)"];
  const at = order.map((line) => loop.indexOf(line));
  for (const i of at) expect(i).toBeGreaterThan(0);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
  // The skip is inside the guard's else: it runs only when there is no audio track.
  const guardElse = between(loop, "guard let srcAudio = try await audioAsset.loadTracks(withMediaType: .audio).first else {", "\n      }");
  expect(guardElse).toContain("if !pictures.isEmpty { continue }");
  expect(loop.match(/pictures/g)).toHaveLength(2);
});

describe("Reduce noise (SoundNoise)", () => {
  const noise = between(render, "enum SoundNoise {", "\n}\n");
  const renderSoundFn = between(moduleSwift, 'AsyncFunction("renderSound")', "\n    }\n");
  const make = between(noise, "static func make(", "\n  }\n");

  test("the unit is made the way the probe proved: found, instantiated with await, given the format before the engine sees it", () => {
    expect(noise).toContain("kAudioUnitType_Effect");
    expect(noise).toContain("kAudioUnitSubType_AUSoundIsolation");
    expect(noise).toContain("kAudioUnitManufacturer_Apple");
    expect(noise).toContain("AudioComponentFindNext(nil, &wanted)");
    expect(make).toMatch(/static func make\(wet: Double, format: AVAudioFormat\) async throws -> AVAudioUnit/);
    expect(make).toContain("try await AVAudioUnit.instantiate(with: component(), options: [])");
    expect(make).toContain("try SoundProbe.accepts(unit, format: format)");
    expect(make.indexOf("isOnThisPhone()")).toBeLessThan(make.indexOf("AVAudioUnit.instantiate"));
    expect(make.indexOf("AVAudioUnit.instantiate")).toBeLessThan(make.indexOf("SoundProbe.accepts"));
    expect(make.indexOf("SoundProbe.accepts")).toBeLessThan(make.indexOf("kAUSoundIsolationParam_WetDryMixPercent"));
    // The description is the probe's own, field for field.
    const probed = /AudioComponentDescription\(([^)]*)\)/.exec(between(render, "enum SoundProbe {", "\n}\n"))?.[1].replace(/\s+/g, " ");
    const made = /AudioComponentDescription\(([^)]*)\)/.exec(noise)?.[1].replace(/\s+/g, " ");
    expect(made).toBeDefined();
    expect(made).toBe(probed);
  });

  test("the strength is set through the parameter tree, else through AudioUnitSetParameter, and a failure is said — never a render at another strength", () => {
    expect(make).toContain("parameter(withAddress: AUParameterAddress(kAUSoundIsolationParam_WetDryMixPercent))");
    expect(make).toContain("AudioUnitSetParameter(unit.audioUnit, kAUSoundIsolationParam_WetDryMixPercent, kAudioUnitScope_Global, 0,");
    expect(make).toContain('throw SoundError.failed("sound noise: the strength could not be set (\\(status))")');
    expect(make).toContain("SoundRender.bounded(wet, 0, 100)");
    // A strength that is not a number is refused before anything is made: `bounded` would let a NaN through.
    expect(make).toContain('guard wet.isFinite else { throw SoundError.failed("sound noise: the strength is not a number") }');
    expect(make.indexOf("guard wet.isFinite")).toBeLessThan(make.indexOf("SoundRender.bounded(wet, 0, 100)"));
  });

  test("every failure of the unit has the noise stage", () => {
    const thrown = [...noise.matchAll(/SoundError\.failed\("([^"]*)/g)].map((m) => m[1]);
    expect(thrown.length).toBeGreaterThanOrEqual(4);
    for (const text of thrown) expect(text.startsWith("sound noise: ")).toBe(true);
    expect((noise.match(/ExportSession\.describe\(error\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // Every `try` of it is inside a do / catch that restages the error; nothing is forced.
    expect(make.match(/\btry\b/g)?.length).toBe(make.match(/\bdo \{/g)?.length);
    expect(make.match(/catch \{ throw SoundError\.failed\("sound noise: " \+ ExportSession\.describe\(error\)\) \}/g)?.length).toBe(make.match(/\bdo \{/g)?.length);
    // The module passes a SoundError's own text on unchanged, so the stage reaches the app.
    expect(between(render, "static func message(", "\n  }\n")).toContain("if let own = error as? SoundError, let text = own.errorDescription { return text }");
  });

  test("nothing newer than iOS 16.4 is named: no high-quality sound type, no availability check needed", () => {
    expect(noise).not.toContain("HighQuality");
    expect(noise).not.toContain("kAUSoundIsolationParam_SoundToIsolate");
    expect(noise).not.toContain("#available");
    expect(noise).not.toContain("withAudioUnit");   // iOS 27
  });

  test("the render puts the unit FIRST, before the request's own units, and a request without noise makes none", () => {
    // `lead` is a defaulted parameter: a caller that does not name it gets the chain of before.
    expect(renderFn).toMatch(/static func render\(_ request: SoundRenderRequest, source: SoundSource, lead: \[AVAudioNode\] = \[\], to outputURL: URL, job: SoundJob,/);
    expect(renderFn).toContain("let chain: [AVAudioNode] = lead + units(for: request)");
    expect(renderFn.match(/\blead\b/g)).toHaveLength(2);
    // The loop takes the chain in order and connects each unit after the one before it, the first after the player.
    expect(renderFn).toContain("SoundRender.process(source, units: chain,");
    expect(processFn).toContain("var previous: AVAudioNode = player\n    for unit in units {\n      engine.attach(unit)\n      engine.connect(previous, to: unit, format: format)\n      previous = unit\n    }");
    // Its latency is counted with the other units'.
    expect(processFn).toContain("for unit in units { latencySeconds += unit.latency }");
    expect(renderSoundFn).toContain("var lead: [AVAudioNode] = []");
    expect(renderSoundFn).toContain("if request.noiseWet.isFinite, request.noiseWet > 0 {");
    expect(renderSoundFn).toContain("try await SoundNoise.make(wet: request.noiseWet, format: noiseFormat)");
    expect(renderSoundFn).toContain("try SoundRender.render(request, source: source, lead: lead, to: outputURL, job: job, progress:");
    expect(renderSoundFn.indexOf("SoundNoise.make")).toBeLessThan(renderSoundFn.indexOf("SoundRender.render("));
    // The unit is made in the render format, inside the `if`, and nowhere else.
    const branch = between(renderSoundFn, "if request.noiseWet.isFinite, request.noiseWet > 0 {", "\n          }");
    expect(branch).toContain("AVAudioFormat(standardFormatWithSampleRate: SoundRender.sampleRate, channels: 2)");
    expect(branch).toContain("SoundNoise.make(");
    expect(branch).toContain("lead.append(isolation)");
    expect(moduleSwift.match(/SoundNoise\.make\(/g)).toHaveLength(1);
    expect(render.match(/SoundNoise\./g)).toBeNull();
    // The loop itself is the one the probe ran: untouched, synchronous.
    expect(processFn).not.toContain("await");
    expect(renderFn).not.toContain("await");
    expect(between(render, "static func units(", "\n  }\n")).not.toContain("noiseWet");
  });

  test("the module says whether this iPhone has the unit: synchronously, without making one", () => {
    expect(moduleSwift).toContain('Function("noiseAvailable") { () -> Bool in');
    expect(moduleSwift).not.toContain('AsyncFunction("noiseAvailable")');
    expect(between(moduleSwift, 'Function("noiseAvailable")', "\n    }")).toContain("return SoundNoise.isOnThisPhone()");
    const has = between(noise, "static func isOnThisPhone(", "\n  }\n");
    expect(has.split("{")[0]).toBe("static func isOnThisPhone() -> Bool ");
    expect(has).toContain("return AudioComponentFindNext(nil, &wanted) != nil");
    expect(has).not.toMatch(/instantiate|AVAudioEngine|\btry\b|await/);
    expect(wrapper).toContain("m.noiseAvailable() === true");
  });
});
