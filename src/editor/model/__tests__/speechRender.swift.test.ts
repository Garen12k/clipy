import { readFileSync } from "fs";
import { join } from "path";

// There is no Swift compiler on this machine: these tests READ the Swift and pin what the app relies on.
const root = join(__dirname, "../../../..");
const iosDir = join(root, "modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const speech = code(read("SpeechRender.swift"));
const moduleSwift = code(read("ClipyVideoModule.swift"));
const wrapper = readFileSync(join(root, "modules/clipy-video/index.ts"), "utf8");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const count = (source: string, part: string): number => source.split(part).length - 1;
const job = between(speech, "final class SpeechJob", "\n}\n");

test("the request record has exactly the fields the app sends", () => {
  const fields = [...between(speech, "struct SpeechRequest: Record {", "\n}").matchAll(/@Field var (\w+)/g)].map((m) => m[1]);
  expect(fields.sort()).toEqual(["jobId", "outputPath", "rate", "text", "voiceId"]);
  expect(wrapper).toContain("export interface SpeechRequest { jobId: string; text: string; voiceId: string; rate: number; outputPath: string }");
  expect(wrapper).toContain("export interface SpeechResult { fileUri: string; seconds: number }");
});

test("the synthesizer lives as long as the job, and the job as long as the module holds it", () => {
  expect(job).toMatch(/private let synthesizer = AVSpeechSynthesizer\(\)/);
  expect(count(speech, "AVSpeechSynthesizer()")).toBe(1);        // never a local one, which would be gone before it spoke
  expect(moduleSwift).toContain("private var speechJobs: [String: SpeechJob] = [:]");
  expect(moduleSwift).toContain("self.storeSpeechJob(jobId, job)");
  expect(moduleSwift).toContain("self?.dropSpeechJob(jobId)");
  // Stored before it starts, so a cancel that comes at once finds it.
  expect(moduleSwift.indexOf("self.storeSpeechJob(jobId, job)")).toBeLessThan(moduleSwift.indexOf("job.start(text: request.text, voiceId: request.voiceId, rate: request.rate)"));
  // Until it has ended the job is also held by its own look (a strong `self` in `watch`), whatever the module does.
  expect(between(job, "private func watch(", "\n  }\n")).not.toContain("weak self");
});

test("the speech is asked for on the main queue, with the buffer callback named", () => {
  const start = between(job, "func start(", "\n  }\n");
  expect(start).toContain("DispatchQueue.main.async {");
  expect(start).toContain("self.synthesizer.write(utterance, toBufferCallback: { [weak self] (buffer: AVAudioBuffer) -> Void in");
  expect(start).toContain("AVSpeechSynthesisVoice(identifier: voiceId)");
  expect(start).toContain("utterance.rate = SpeechRender.rate(rate)");
  expect(speech).not.toContain("toMarkerCallback");
  expect(count(speech, ".write(utterance")).toBe(1);
  // A cancel that came before the main queue got to it: nothing is asked of the synthesizer at all.
  expect(start.indexOf("if called {")).toBeGreaterThan(start.indexOf("DispatchQueue.main.async {"));
  expect(start.indexOf("if called {")).toBeLessThan(start.indexOf("self.synthesizer.write("));
});

test("nothing to read and a voice that is gone are refused before anything is asked of the synthesizer", () => {
  const start = between(job, "func start(", "\n  }\n");
  const asked = start.indexOf("DispatchQueue.main.async {");
  expect(start).toContain("text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty");
  expect(start.indexOf('SpeechError.failed("speech render: there is nothing to read")')).toBeLessThan(asked);
  expect(start.indexOf('SpeechError.failed("speech voice: this voice is not on the iPhone any more")')).toBeLessThan(asked);
  expect(start.indexOf('SpeechError.failed("speech render: there is nothing to read")')).toBeGreaterThan(0);
  expect(start.indexOf('SpeechError.failed("speech voice: this voice is not on the iPhone any more")')).toBeGreaterThan(0);
});

test("the file is made from the FIRST buffer's own format, and no buffer of another format is ever written", () => {
  const take = between(job, "private func take(", "\n  }\n");
  expect(take).toContain("AVAudioFile(forWriting: partURL, settings: pcm.format.settings, commonFormat: pcm.format.commonFormat, interleaved: pcm.format.isInterleaved)");
  expect(take).toContain("SpeechRender.same(made.processingFormat, pcm.format)");
  expect(take).toContain("SpeechRender.same(known, pcm.format)");
  expect(take.indexOf("SpeechRender.same(made.processingFormat, pcm.format)")).toBeLessThan(take.indexOf("try made.write(from: pcm)"));
  expect(take.indexOf("SpeechRender.same(known, pcm.format)")).toBeLessThan(take.indexOf("try current.write(from: pcm)"));
  expect(take).toContain("pcm.frameLength == 0");
  expect(take).toContain("guard let pcm = buffer as? AVAudioPCMBuffer else { return }");
  // A format no file is asked to take: not one of the four plain PCM kinds, or without a rate or a channel.
  expect(take).toContain("SpeechRender.writable(pcm.format)");
  expect(take.indexOf("SpeechRender.writable(pcm.format)")).toBeLessThan(take.indexOf("AVAudioFile(forWriting:"));
  const writable = between(speech, "static func writable(", "\n  }\n");
  for (const part of [".otherFormat", "sampleRate.isFinite", "sampleRate > 0", "channelCount > 0"]) expect(writable).toContain(part);
  expect(count(speech, ".write(from:")).toBe(2);
  expect(speech).not.toMatch(/\.close\(\)/);                     // AVAudioFile.close() is iOS 18
  // Every touch of the job's state in `take` is under the lock, and the lock is free again before `end` runs.
  expect(take).toMatch(/autoreleasepool \{ \(\) -> Void in\s*lock\.lock\(\)\s*defer \{ lock\.unlock\(\) \}/);
  expect(take.indexOf("end(result)")).toBeGreaterThan(take.lastIndexOf("lock.unlock()"));
  expect(count(take, "lock.lock()")).toBe(1);
  // The last hold on the synthesizer is never dropped inside its own call: an ended job is kept a moment, on the main queue.
  expect(take.trimEnd().endsWith("if over { linger() }")).toBe(true);
  const linger = between(job, "private func linger(", "\n  }\n");
  expect(linger).toContain("DispatchQueue.main.asyncAfter(deadline: .now() + SpeechRender.lingerSeconds) {");
  expect(linger).toContain("self.synthesizer");
});

test("a job always ends, and exactly once: the end marker, silence after sound, nothing at all, or a cancel", () => {
  expect(speech).toContain("static let idleSeconds: Double = 3");
  expect(speech).toContain("static let startSeconds: Double = 20");
  const watch = between(job, "private func watch(", "\n  }\n");
  expect(watch).toContain("DispatchQueue.main.asyncAfter(deadline: .now() + SpeechRender.tick)");
  expect(watch).toContain("SpeechRender.idleSeconds");
  expect(watch).toContain("SpeechRender.startSeconds");
  expect(watch).toContain("if let result = outcome { self.end(result) } else { self.watch() }");
  const end = between(job, "private func end(", "\n  }\n");
  expect(end).toMatch(/if finished \{\s*lock\.unlock\(\)\s*return\s*\}/);
  expect(end).toContain("finished = true");
  expect(end).toContain("file = nil");
  expect(end.indexOf("file = nil")).toBeLessThan(end.indexOf("moveItem(at: partURL, to: outputURL)"));
  expect(end).toContain("removeItem(at: partURL)");
  expect(job).toContain("synthesizer.stopSpeaking(at: .immediate)");
  // `done` is called only by `end`, never with the lock held, and once on each of its four ways out.
  expect(count(job, "done(")).toBe(4);
  expect(count(end, "done(")).toBe(4);
  expect(end.indexOf("lock.unlock()", end.indexOf("finished = true"))).toBeLessThan(end.indexOf("done("));
  expect(count(end, "lock.lock()")).toBe(1);
  // The three ways out that are not a finished file each remove the part file first.
  expect(count(end, "removeItem(at: partURL)")).toBe(3);
  // `finished` is written in one place.
  expect(count(job, "finished = true")).toBe(1);
});

test("the answer's length is frames over the voice's own rate, and a length that is not above 0 is a failure, not an empty bar", () => {
  expect(job).toContain("return Double(frames) / known.sampleRate");
  const end = between(job, "private func end(", "\n  }\n");
  expect(end).toContain("guard length.isFinite, length > 0 else {");
  expect(end.indexOf("guard length.isFinite, length > 0 else {")).toBeLessThan(end.indexOf("moveItem(at: partURL, to: outputURL)"));
  expect(end.indexOf("moveItem(at: partURL, to: outputURL)")).toBeLessThan(end.indexOf("done(.success(length))"));
  expect(count(speech, 'SpeechError.failed("speech render: no sound came out")')).toBeGreaterThanOrEqual(2);
});

test("a look counts its own turns, not the clock: time the app spent asleep is not silence", () => {
  const watch = between(job, "private func watch(", "\n  }\n");
  expect(watch).toContain("self.quietLooks += 1");
  expect(watch).toContain("let quiet: Double = Double(self.quietLooks) * SpeechRender.tick");
  expect(between(job, "private func take(", "\n  }\n")).toContain("quietLooks = 0");
  expect(speech).not.toMatch(/\bDate\(/);
});

test("every failure has a speech stage; a cancel has its own code", () => {
  const thrown = [...speech.matchAll(/SpeechError\.failed\("([^"]*)/g)].map((m) => m[1]);
  expect(thrown.length).toBeGreaterThanOrEqual(4);
  for (const text of thrown) expect(text).toMatch(/^speech (output|voice|render): /);
  expect(speech).toContain('"speech output: " + ExportSession.describe(error)');
  expect(speech).toContain('return "speech render: " + ExportSession.describe(error)');
  expect(moduleSwift).toContain('promise.reject("E_READ_ALOUD_CANCELLED", "Speech cancelled")');
  expect(moduleSwift).toContain('promise.reject("E_READ_ALOUD", SpeechRender.message(error))');
  expect(moduleSwift).toContain('promise.reject("E_READ_ALOUD", "speech output: not a file path")');
  expect(wrapper).toContain('export const SPEECH_CANCELLED = "E_READ_ALOUD_CANCELLED";');
});

test("the rate is placed around Apple's own constants, whatever their values", () => {
  const rate = between(speech, "static func rate(", "\n  }\n");
  for (const name of ["AVSpeechUtteranceMinimumSpeechRate", "AVSpeechUtteranceDefaultSpeechRate", "AVSpeechUtteranceMaximumSpeechRate"]) expect(rate).toContain(name);
  expect(rate).toContain("r <= 0.5 ? low + (mid - low) * (r / 0.5) : mid + (high - mid) * ((r - 0.5) / 0.5)");
  expect(rate).toContain("normal.isFinite ? min(1, max(0, normal)) : 0.5");
});

test("the voice list names nothing newer than iOS 16.4 outside an availability check, and no quality case at all", () => {
  const voices = between(speech, "static func voices(", "\n  }\n");
  expect(voices).toContain("AVSpeechSynthesisVoice.speechVoices()");
  expect(voices).toContain("if #available(iOS 17.0, *) {");
  expect(voices.indexOf("if #available(iOS 17.0, *) {")).toBeLessThan(voices.indexOf("voiceTraits"));
  expect(speech.split("voiceTraits").length - 1).toBe(2);         // both uses are in that block
  expect(count(speech, "#available")).toBe(1);
  expect(voices).toContain("voice.quality.rawValue");
  expect(speech).not.toMatch(/\.premium|\.enhanced/);
  for (const key of ["id", "name", "language", "languageName", "quality"]) expect(voices).toContain(`"${key}":`);
  expect(wrapper).toContain("export interface SpeechVoice { id: string; name: string; language: string; languageName: string; quality: number }");
});

test("the app's sound session is left alone", () => {
  expect(speech).not.toContain("AVAudioSession");
  expect(speech).not.toContain("usesApplicationAudioSession");
  expect(speech).not.toContain(".speak(");
  expect(speech).not.toContain("delegate");
});

test("no force unwrap, no try!, no as!; no type and no static name declared twice; nothing clashes with the other files", () => {
  expect(speech).not.toMatch(/[\w)\]]!(?!=)/);
  expect(speech).not.toMatch(/\b(try|as)!/);
  const types = [...speech.matchAll(/^(?:final class|struct|enum) (\w+)/gm)].map((m) => m[1]);
  expect(types.sort()).toEqual(["SpeechError", "SpeechJob", "SpeechRender", "SpeechRequest"]);
  const others = ["ExportSession.swift", "ClipyVideoModule.swift", "MediaPrePass.swift", "Transcriber.swift", "AudioMix.swift", "SoundMath.swift", "SoundRender.swift"].map((f) => code(read(f))).join("\n");
  for (const t of types) expect(others).not.toMatch(new RegExp(`(?:class|struct|enum) ${t}\\b`));
  const body = between(speech, "enum SpeechRender {", "\n}\n");
  const values = [...body.matchAll(/static (?:let|var) (\w+)/g)].map((m) => m[1]);
  const funcs = [...body.matchAll(/static func (\w+)\(/g)].map((m) => m[1]);
  expect(values.filter((n) => funcs.includes(n))).toEqual([]);
  expect(new Set(values).size).toBe(values.length);
  expect(new Set(funcs).size).toBe(funcs.length);
  // The job: no stored name twice, and no method named like a stored name.
  const stored = [...job.matchAll(/^  private (?:let|var) (\w+)/gm)].map((m) => m[1]);
  const methods = [...job.matchAll(/^  (?:private )?func (\w+)\(/gm)].map((m) => m[1]);
  expect(new Set(stored).size).toBe(stored.length);
  expect(new Set(methods).size).toBe(methods.length);
  expect(stored.filter((n) => methods.includes(n))).toEqual([]);
  expect(methods.sort()).toEqual(["cancel", "end", "halt", "linger", "start", "take", "watch"]);
});

test("the module registers the three functions and answers with the shapes the wrapper declares", () => {
  expect(moduleSwift).toContain('AsyncFunction("listVoices")');
  expect(moduleSwift).toContain('AsyncFunction("speakToFile")');
  expect(moduleSwift).toContain('Function("cancelSpeech")');
  expect(moduleSwift).toContain('let answer: [String: Any] = ["current": AVSpeechSynthesisVoice.currentLanguageCode(), "voices": SpeechRender.voices()]');
  expect(moduleSwift).toContain('let answer: [String: Any] = ["fileUri": outputURL.absoluteString, "seconds": seconds]');
  expect(moduleSwift).toContain("self.lookupSpeechJob(jobId)?.cancel()");
  expect(moduleSwift).toContain("guard let outputURL = ExportSession.fileURL(from: request.outputPath) else {");
  for (const fn of ["listVoices", "speakToFile", "cancelSpeech"]) expect(wrapper).toContain(`latestNative("${fn}").${fn}(`);
  // Each name once.
  for (const name of ["listVoices", "speakToFile", "cancelSpeech"]) expect(count(moduleSwift, `Function("${name}")`)).toBe(1);
  // In `speakToFile` the promise is answered in the job's `done` (three ways) and for a path that is no file: nowhere else.
  const speak = between(moduleSwift, 'AsyncFunction("speakToFile")', 'Function("cancelSpeech")');
  expect(count(speak, "promise.resolve(")).toBe(1);
  expect(count(speak, "promise.reject(")).toBe(3);
  // Everything that was there is still there.
  for (const name of ["exportTimeline", "transcribe", "renderSound", "soundInfo", "probeNoiseReduction"]) expect(moduleSwift).toContain(`AsyncFunction("${name}")`);
});
