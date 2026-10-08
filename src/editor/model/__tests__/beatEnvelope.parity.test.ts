import { readFileSync } from "fs";
import { join } from "path";
import { BEAT_DETECT, onsetEnvelope } from "../beatDetect";

// There is no Swift compiler on this machine: these tests READ the Swift and pin what the app relies on.
const root = join(__dirname, "../../../..");
const iosDir = join(root, "modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const swift = code(read("BeatEnvelope.swift"));
const moduleSwift = code(read("ClipyVideoModule.swift"));
const wrapper = readFileSync(join(root, "modules/clipy-video/index.ts"), "utf8");
const ts = readFileSync(join(root, "src/editor/model/beatDetect.ts"), "utf8");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const num = (name: string): number => {
  const m = new RegExp(`static let ${name}: Double = ([0-9._]+)`).exec(swift);
  if (!m) throw new Error(`${name} not found`);
  return Number(m[1].replace(/_/g, ""));
};

test("the three constants of the envelope are the detector's", () => {
  expect(num("envelopeRate")).toBe(BEAT_DETECT.envelopeRate);
  expect(num("windowSeconds")).toBe(BEAT_DETECT.windowSeconds);
  expect(num("compress")).toBe(BEAT_DETECT.compress);
  expect(num("decodeRate")).toBe(44100);                       // the rate the bundled tracks were analysed at
});

test("the hop, the window size, the Hann window and the flux are the TypeScript formulas", () => {
  const builder = between(swift, "final class EnvelopeBuilder", "\n}\n");
  // hop = max(1, round(rate / envelopeRate)); size = the next power of two at or above ceil(rate * windowSeconds)
  expect(ts).toContain("const hop = Math.max(1, Math.round(sampleRate / BEAT_DETECT.envelopeRate));");
  expect(builder).toContain("hop = max(1, Int((sampleRate / BeatEnvelope.envelopeRate).rounded()))");
  expect(ts).toContain("const size = nextPow2(Math.ceil(sampleRate * BEAT_DETECT.windowSeconds));");
  expect(builder).toContain("size = BeatEnvelope.nextPow2(Int((sampleRate * BeatEnvelope.windowSeconds).rounded(.up)))");
  expect(ts).toContain("hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));");
  expect(builder).toContain("hann[i] = 0.5 - 0.5 * cos(2 * Double.pi * Double(i) / Double(size - 1))");
  expect(ts).toContain("cur[k] = Math.log(1 + BEAT_DETECT.compress * Math.hypot(re[k], im[k]) / size);");
  expect(builder).toContain("cur[k] = log(1 + BeatEnvelope.compress * hypot(re[k], im[k]) / Double(size))");
  expect(ts).toContain("env[f] = f === 0 ? 0 : flux;");
  expect(builder).toContain("env.append(env.isEmpty ? 0 : flux)");
  expect(ts).toContain("return { env, rate: sampleRate / hop };");
  expect(builder).toContain("var rate: Double { sampleRate / Double(hop) }");
});

test("the FFT is the same radix-2 transform, line for line where it counts", () => {
  const fft = between(swift, "static func fft(", "\n  }\n");
  expect(fft).toContain("let ang = -2 * Double.pi / Double(len)");
  expect(fft).toContain("let xr = re[b] * cr - im[b] * ci");
  expect(fft).toContain("let xi = re[b] * ci + im[b] * cr");
  expect(fft).toContain("let nr = cr * wr - ci * wi");
  expect(fft).toContain("ci = cr * wi + ci * wr");
  expect(ts).toContain("const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;");
  expect(ts).toContain("const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;");
});

test("the worked vector of the spec (§5.2): what the TypeScript side gives for the sound the Swift side must give the same for", () => {
  const x = new Float32Array(800);
  for (let i = 400; i < 800; i++) x[i] = Math.sin((2 * Math.PI * 1000 * i) / 8000) * 0.5;
  const { env, rate } = onsetEnvelope(x, 8000);
  expect(rate).toBe(100);
  expect(Array.from(env).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 0, 0, 0, 0, 102.717898, 17.724067, 0.30335, 0.091661, 0]);
});

test("the request record has exactly the fields the app sends; the answer has the keys the wrapper declares", () => {
  const fields = [...between(swift, "struct BeatEnvelopeRequest: Record {", "\n}").matchAll(/@Field var (\w+)/g)].map((m) => m[1]);
  expect(fields.sort()).toEqual(["from", "jobId", "sourceUri", "to"]);
  expect(wrapper).toContain("export interface BeatEnvelopeRequest { jobId: string; sourceUri: string; from: number; to: number }");
  expect(swift).toContain('let answer: [String: Any] = ["env": builder.env, "rate": builder.rate, "seconds": Double(builder.count) / builder.sampleRate, "from": start]');
  expect(wrapper).toContain("export interface BeatEnvelopeResult { env: number[]; rate: number; seconds: number; from: number }");
});

test("the decoded sound is checked before it is read as floats, and the asset outlives its reader", () => {
  const decode = between(swift, "static func decode(", "\n  }\n");
  expect(decode).toContain("AVLinearPCMIsFloatKey: true");
  expect(decode).toContain("AVLinearPCMBitDepthKey: 32");
  expect(decode).toContain("AVSampleRateKey: BeatEnvelope.decodeRate");
  expect(decode).toContain("basic.mFormatID == kAudioFormatLinearPCM");
  expect(decode).toContain("basic.mBitsPerChannel == 32");
  expect(decode).toContain("(basic.mFormatFlags & kAudioFormatFlagIsFloat) != 0");
  expect(decode).toContain("reader.canAdd(output)");
  expect(decode).toContain("job.isCancelled");
  expect(decode).toContain("asset: AVURLAsset");                 // handed in by `run`, which holds it until decode returns
  // The reading pattern is SoundRender's (the one proven on the phone): a mix output of the one track, 44.1 kHz stereo float,
  // each pass in its own pool, the reader cancelled on every way out that leaves it reading.
  expect(decode).toContain("AVAssetReaderAudioMixOutput(audioTracks: [track], audioSettings: settings)");
  expect(decode).toContain("AVNumberOfChannelsKey: 2");
  expect(decode).toContain("defer { if reader.status == .reading { reader.cancelReading() } }");
  expect(decode).toContain("try autoreleasepool { () throws -> Void in");
  expect(decode).not.toContain("await");
  // The TypeScript reads Float32 samples: the mono mix is rounded to a Float before it is widened; a sample that is not a
  // number is silence, so the envelope holds only finite numbers (JSON cannot carry any other).
  expect(decode).toContain("let mono: Float = sum / Float(width)");
  expect(decode).toContain("builder.push(mono.isFinite ? Double(mono) : 0)");
  expect(decode).toContain("guard reader.status == .completed else");
  const run = between(swift, "static func run(", "\n  }\n");
  expect(run).toContain("let asset = AVURLAsset(url: url)");
  expect(run).toContain("return try decode(asset: asset, track: track");
  expect(run).toContain("try await asset.loadTracks(withMediaType: .audio)");
  expect(run).toContain("try await asset.load(.duration)");
});

test("every failure has a beats stage; a cancel has its own code; the promise is answered once", () => {
  const thrown = [...swift.matchAll(/BeatError\.failed\("([^"]*)/g)].map((m) => m[1]);
  expect(thrown.length).toBeGreaterThanOrEqual(6);
  for (const text of thrown) expect(text).toMatch(/^beats (source|reader): /);
  expect(swift).toContain("ExportSession.describe(");
  const fn = between(moduleSwift, 'AsyncFunction("beatEnvelope")', "\n    }\n");
  expect(fn).toContain("self.storeBeatJob(jobId, job)");
  expect(fn).toContain("defer { self?.dropBeatJob(jobId) }");
  expect(fn.split("promise.resolve(").length - 1).toBe(1);
  expect(fn).toContain('promise.reject("E_BEATS_CANCELLED", "Beats cancelled")');
  expect(fn).toContain('promise.reject("E_BEATS", BeatEnvelope.message(error))');
  expect(moduleSwift).toContain('Function("cancelBeatEnvelope")');
  expect(wrapper).toContain('export const BEATS_CANCELLED = "E_BEATS_CANCELLED";');
});

test("no force unwrap, no try!, no as!; no type and no static name declared twice; nothing clashes with the other files", () => {
  expect(swift).not.toMatch(/[\w)\]]!(?!=)/);
  expect(swift).not.toMatch(/\b(try|as)!/);
  const types = [...swift.matchAll(/^(?:final class|struct|enum) (\w+)/gm)].map((m) => m[1]);
  expect(types.sort()).toEqual(["BeatEnvelope", "BeatEnvelopeRequest", "BeatError", "BeatJob", "EnvelopeBuilder"]);
  const others = ["ExportSession.swift", "ClipyVideoModule.swift", "MediaPrePass.swift", "Transcriber.swift", "AudioMix.swift", "SoundMath.swift", "SoundRender.swift", "SpeechRender.swift", "ClipyCompositor.swift"].map((f) => code(read(f))).join("\n");
  for (const t of types) expect(others).not.toMatch(new RegExp(`(?:class|struct|enum) ${t}\\b`));
  const body = between(swift, "enum BeatEnvelope {", "\n}\n");
  const values = [...body.matchAll(/static (?:let|var) (\w+)/g)].map((m) => m[1]);
  const funcs = [...body.matchAll(/static func (\w+)\(/g)].map((m) => m[1]);
  expect(values.filter((n) => funcs.includes(n))).toEqual([]);
  expect(new Set(values).size).toBe(values.length);
  expect(new Set(funcs).size).toBe(funcs.length);
  // Everything that was there is still there.
  for (const name of ["exportTimeline", "transcribe", "renderSound", "soundInfo", "probeNoiseReduction", "listVoices", "speakToFile"]) expect(moduleSwift).toContain(`AsyncFunction("${name}")`);
});
