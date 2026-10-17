# Auto enhance: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Adjust strip gains a FIRST chip **Auto** (a wand). One tap looks at the selected clip on the phone and SETS the ordinary Adjust sliders (Exposure, Contrast, Saturation, Warmth, Tint — gentle limits) as ONE undo step, said "Auto enhance applied" with Undo; an **Auto · strength** slider (0–100 %, default 100 %) rescales from the values the clip had before; a line says what was set; **Apply to All** looks at every main clip on its own and sets them all in one step. Without the new build the tap says the "latest build" sentence and changes nothing.

**Architecture:** ONE new native function `frameStats` (`FrameStats.swift`: a few upright frames, scaled to 256, drawn once into an 8-bit sRGB bitmap by Core Graphics and counted in Swift — a 64-bin luma histogram, mean R G B, mean chroma; no Core Image, no decisions), its cancel, background refusal / `E_STATS_INTERRUPTED`, a guarded wrapper `modules/clipy-video/frameStats.ts` and a new top `LEVELS` row. WHAT to set is pure TypeScript (`src/editor/model/autoEnhance.ts`, no Swift twin). The look (one at a time, `activeTimeout` deadline, cancel, retry after an interruption, session memory) is `src/editor/autoLook.ts`; the strip's hook is `src/editor/useAutoEnhance.ts`; the strip is `AdjustSheet.tsx` with the kit `Chip` gaining an optional `icon`. Values are written only through the existing `setClipAdjust` — no schema change, no new look maths, the export request unchanged.

**Tech Stack:** Expo SDK 57, React Native (Fabric), TypeScript strict, zustand 5, Jest 29.7 (`jest-expo`) + RNTL 14; Swift (Expo Modules API, AVFoundation, ImageIO, Core Graphics), compiled only on EAS — **no Swift toolchain here**: verify by reading against `node_modules/expo-modules-core/ios`. No new package, no `app.json` change, no schema bump.

**Spec:** `docs/superpowers/specs/2026-10-17-auto-enhance-design.md` (binding: §1 the keys and limits, §2 the native function, §3 the maths and vectors, §4 undo / strength / memory, §5 the look, §6 old builds, §7 the strip, §8 the tests that may change).

## Global Constraints

- iPhone only. Read `AGENTS.md` first; it binds (Native code, the guarded native wrappers, Look maths, Existing looks are frozen, Messages, Undo, Toolbar / strips, Sliders, Casing, Text size, Palette, Spacing, Icons, Background export, `activeTimeout`).
- **Never edited to make a change pass:** `looks.frozen.test.ts`, `src/ui/__tests__/defaultTree.proof.test.tsx`, `src/export/__tests__/backgroundExport.swift.test.ts`, `AdjustTests.swift`, every PROOF named in AGENTS.md (`toolGroups.groups.test.ts`'s PROOF, `timeline.stepped.proof.test.ts`, `overlayFrames.proof.test.tsx`, `quickEdit.recipes.proof.test.ts`, `storage.load.proof.test.ts`, the PROOF blocks of `migrate.test.ts` / `useExport*.test.ts` / `theme.test.ts`).
- **Not edited:** `src/editor/model/adjust.ts`, `Adjust.swift`, `ClipyCompositor.swift`, `ExportSession.swift`, `ExportBackground.swift`, `MediaPrePass.swift`, `CutoutRender.swift`, `SteadyRender.swift`, `SoundPeaks.swift`, `src/editor/model/types.ts`, `src/editor/model/ops.ts`, `store.ts`, `ToolStrip.tsx` (and `STRIP`), `Slider.tsx`, `sfSymbols.ts`, the export, `app.json`, `package.json`.
- **Tests that may be updated, and only as stated:** `src/lib/__tests__/buildInfo.test.ts` (Task 1: the mock of `@/modules/clipy-video/frameStats`, a tenth argument `auto` to `set`, the "Auto enhance" lines at the top of both tests). `AdjustSheet.test.tsx` and `strips.params.test.tsx` are NOT edited (they keep passing as written: Brightness stays picked on opening, one `strip-slider`).
- Swift: insert only where a task says, copy the module's idioms (explicit closure types, a lock-guarded job store, every Double checked before it becomes an Int, every way out of a `do` answers the promise exactly once), nothing newer than iOS 16.4 and no `#available`. Every Swift change gets a source-reading pin.
- RNTL v14: `render` / `renderHook` / `fireEvent` are async — always `await`.
- **Checks for every task:** `npm.cmd run typecheck`, then `npm.cmd test`. Record the baseline (app and server: suites / tests / snapshots) before Task 1; every task ends with no failure and the app suite count grown by exactly its new files.
- Windows: PowerShell, no `&&`, `npx.cmd` / `npm.cmd`. Never `git stash`. `git add` explicit paths only, never `-A`, never push. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Task order

`1 → 2 → 3 → 4 → 5`

| Task | Title | Files it owns |
|---|---|---|
| 1 | Native `frameStats` + wrapper + `LEVELS` row + pins + XCTest | NEW `modules/clipy-video/ios/FrameStats.swift`, `ClipyVideoModule.swift`, NEW `modules/clipy-video/frameStats.ts`, `modules/clipy-video/index.ts`, `src/lib/buildInfo.ts`, NEW `modules/clipy-video/ios/Tests/FrameStatsTests.swift`, NEW `modules/clipy-video/__tests__/frameStats{,.swift}.test.ts`, `src/lib/__tests__/buildInfo.test.ts` |
| 2 | The pure decision + vectors | NEW `src/editor/model/autoEnhance.ts`, NEW `src/editor/model/__tests__/autoEnhance.test.ts`, NEW `src/editor/model/__tests__/autoEnhance.vectors.ts` |
| 3 | The look: one at a time, deadline, cancel, memory | NEW `src/editor/autoLook.ts`, NEW `src/editor/__tests__/autoLook.test.ts` |
| 4 | The strip: Auto chip, strength, line, Apply to All, message | NEW `src/editor/useAutoEnhance.ts`, `src/editor/components/AdjustSheet.tsx`, `src/ui/Chip.tsx`, NEW `src/ui/__tests__/Chip.icon.test.tsx`, NEW `src/editor/__tests__/AdjustSheet.auto.test.tsx` |
| 5 | Docs | `AGENTS.md`, `docs/next-build-phone-checklist.md`, the spec's "As built" |

---

### Task 1: Native frameStats, its wrapper, the LEVELS row, the pins

**Files:**
- Create: `modules/clipy-video/ios/FrameStats.swift`
- Modify: `modules/clipy-video/ios/ClipyVideoModule.swift` (two insertions only)
- Create: `modules/clipy-video/frameStats.ts`
- Modify: `modules/clipy-video/index.ts` (one re-export line)
- Modify: `src/lib/buildInfo.ts`
- Create: `modules/clipy-video/ios/Tests/FrameStatsTests.swift`
- Create: `modules/clipy-video/__tests__/frameStats.test.ts`, `modules/clipy-video/__tests__/frameStats.swift.test.ts`
- Modify (as stated): `src/lib/__tests__/buildInfo.test.ts`

- [ ] **Step 1: Write the failing wrapper test** `modules/clipy-video/__tests__/frameStats.test.ts`:

```ts
const mockNative: { module: Record<string, unknown> | null } = { module: null };
jest.mock("expo-modules-core", () => ({ ...jest.requireActual("expo-modules-core"), requireOptionalNativeModule: jest.fn(() => mockNative.module) }));
import { cancelFrameStats, frameStats, isFrameStatsAvailable, isStatsCancelled, isStatsInterrupted, STATS_CANCELLED, STATS_INTERRUPTED } from "../frameStats";

const answer = { frames: [{ time: 1, histogram: new Array(64).fill(0), r: 0.5, g: 0.5, b: 0.5, saturation: 0.2, pixels: 10 }], failed: 0 };
const full = () => ({ frameStats: jest.fn(async () => answer), cancelFrameStats: jest.fn() });
/** A build from before "auto enhance": the module with older functions only. */
const older = () => ({ hello: jest.fn(), soundPeaks: jest.fn(), textReveal: jest.fn() });
const req = { jobId: "j", uri: "file:///a.mov", kind: "video" as const, times: [1], maxSide: 256 };

test("the build is known by the presence of frameStats", () => {
  mockNative.module = null;
  expect(isFrameStatsAvailable()).toBe(false);
  mockNative.module = older();
  expect(isFrameStatsAvailable()).toBe(false);
  mockNative.module = full();
  expect(isFrameStatsAvailable()).toBe(true);
});

test("without it nothing is called, frameStats rejects (never throws) and the cancel is quiet", async () => {
  for (const m of [null, older()]) {
    mockNative.module = m;
    const p = frameStats(req);
    await expect(p).rejects.toThrow("Install the latest Clipy build");
    expect(() => cancelFrameStats("j")).not.toThrow();
    if (m) for (const fn of Object.values(m)) expect(fn).not.toHaveBeenCalled();
  }
});

test("on the build the calls go through with their arguments", async () => {
  const m = full();
  mockNative.module = m;
  await expect(frameStats(req)).resolves.toEqual(answer);
  expect(m.frameStats).toHaveBeenCalledWith(req);
  cancelFrameStats("j");
  expect(m.cancelFrameStats).toHaveBeenCalledWith("j");
});

test("a module that throws is the module missing", () => {
  const { requireOptionalNativeModule } = jest.requireMock("expo-modules-core") as { requireOptionalNativeModule: jest.Mock };
  requireOptionalNativeModule.mockImplementationOnce(() => { throw new Error("boom"); });
  expect(isFrameStatsAvailable()).toBe(false);
});

test("the two codes", () => {
  expect(STATS_CANCELLED).toBe("E_STATS_CANCELLED");
  expect(STATS_INTERRUPTED).toBe("E_STATS_INTERRUPTED");
  expect(isStatsCancelled({ code: "E_STATS_CANCELLED" })).toBe(true);
  expect(isStatsInterrupted({ code: "E_STATS_INTERRUPTED" })).toBe(true);
  expect(isStatsCancelled(new Error("x"))).toBe(false);
  expect(isStatsInterrupted(null)).toBe(false);
});
```

- [ ] **Step 2: Run it — it fails** (`npx.cmd jest modules/clipy-video/__tests__/frameStats.test.ts`: cannot find `../frameStats`).

- [ ] **Step 3: Write the wrapper** `modules/clipy-video/frameStats.ts`:

```ts
import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * The "auto enhance" build (2026-10-17): the phone reads a few frames of a clip and answers PLAIN NUMBERS about them
 * (FrameStats.swift) — what to set from them is TypeScript (src/editor/model/autoEnhance.ts). Imported by its own path, so a
 * test that mocks `@/modules/clipy-video` still gets these real, absent-safe functions. Nothing here throws.
 */
export interface FrameStatsRequest { jobId: string; uri: string; kind: "video" | "photo"; times: number[]; maxSide: number }
/** One frame: `histogram` = 64 bins of Rec. 709 luma on gamma values (counts); means of R′ G′ B′ and of chroma (max − min), 0 … 1. */
export interface FrameStat { time: number; histogram: number[]; r: number; g: number; b: number; saturation: number; pixels: number }
export interface FrameStatsResult { frames: FrameStat[]; failed: number }
/** The code a cancelled look rejects with (`cancelFrameStats`). */
export const STATS_CANCELLED = "E_STATS_CANCELLED";
/** The code of a look that was not made, or cannot be trusted, because Clipy was in the background during it. */
export const STATS_INTERRUPTED = "E_STATS_INTERRUPTED";
const NOT_IN_BUILD = "This build of the app cannot do that yet. Install the latest Clipy build.";

type StatsNative = { frameStats?: (req: FrameStatsRequest) => Promise<FrameStatsResult>; cancelFrameStats?: (jobId: string) => void };
function optional(): StatsNative | null {
  try { return requireOptionalNativeModule<StatsNative>("ClipyVideo"); } catch { return null; }
}
/** Whether the installed app is the "auto enhance" build or a newer one. */
export function isFrameStatsAvailable(): boolean { return typeof optional()?.frameStats === "function"; }
export function frameStats(req: FrameStatsRequest): Promise<FrameStatsResult> {
  const m = optional();
  if (!m || typeof m.frameStats !== "function") return Promise.reject(new Error(NOT_IN_BUILD));
  try { return m.frameStats(req); } catch (e) { return Promise.reject(e); }
}
export function cancelFrameStats(jobId: string): void {
  try {
    const m = optional();
    if (m && typeof m.cancelFrameStats === "function") m.cancelFrameStats(jobId);
  } catch { /* nothing to stop */ }
}
const codeOf = (e: unknown): unknown => (typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined);
export function isStatsCancelled(e: unknown): boolean { return codeOf(e) === STATS_CANCELLED; }
export function isStatsInterrupted(e: unknown): boolean { return codeOf(e) === STATS_INTERRUPTED; }
```

In `modules/clipy-video/index.ts`, directly under the `export * from "./reveal";` line (and its comment), add:

```ts
// The "auto enhance" build: a few frames of a clip as plain numbers (frameStats.ts).
export * from "./frameStats";
```

- [ ] **Step 4: Run the wrapper test — it passes.**

- [ ] **Step 5: Write the failing Swift-reading test** `modules/clipy-video/__tests__/frameStats.swift.test.ts`:

```ts
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
```

- [ ] **Step 6: Run it — it fails** (no `FrameStats.swift`).

- [ ] **Step 7: Write** `modules/clipy-video/ios/FrameStats.swift`:

```swift
import AVFoundation
import CoreGraphics
import ExpoModulesCore
import ImageIO

/// What the app asks to know about a clip's picture (`FrameStatsRequest` in modules/clipy-video/frameStats.ts): the file,
/// whether it is a video or a photo, the source seconds to look at (a photo has one picture: `times` is ignored) and the
/// longest side the frames are scaled to. Numbers are Doubles so that nothing the app can send fails to decode.
struct FrameStatsRequest: Record {
  @Field var jobId: String = ""
  @Field var uri: String = ""
  @Field var kind: String = ""
  @Field var times: [Double] = []
  @Field var maxSide: Double = 0
}

enum StatsError: Error, LocalizedError {
  case cancelled
  case failed(String)
  var errorDescription: String? {
    switch self {
    case .cancelled: return "Stats cancelled"
    case .failed(let text): return text
    }
  }
}

/// The cancel flag of one look, and the generator it uses (so a cancel also stops a frame being decoded). `cancel()` comes
/// from the JS thread; the reading checks the flag before and after every frame.
final class StatsJob: @unchecked Sendable {
  private let lock = NSLock()
  private var stopped = false                          // guarded by `lock`
  private var generator: AVAssetImageGenerator?        // guarded by `lock`

  func cancel() {
    lock.lock()
    stopped = true
    let running = generator
    lock.unlock()
    running?.cancelAllCGImageGeneration()
  }

  var isCancelled: Bool {
    lock.lock()
    defer { lock.unlock() }
    return stopped
  }

  /// Keeps the generator for a cancel. False when the job was already cancelled (nothing is then started).
  func attach(_ g: AVAssetImageGenerator) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if stopped { return false }
    generator = g
    return true
  }
}

/// Plain numbers about a few frames of a clip, for Auto enhance: per frame a 64-bin histogram of Rec. 709 luma on the
/// gamma-encoded sRGB values, the mean of each component and the mean chroma (max − min). It decides nothing: what to set
/// is TypeScript (src/editor/model/autoEnhance.ts). Each frame is drawn ONCE by Core Graphics into an 8-bit sRGB bitmap
/// (Core Graphics converts from the frame's own colour space) and counted in one plain loop — no Core Image, no GPU pass.
enum FrameStats {
  static let bins: Int = 64
  static let fewestSide: Int = 16
  static let mostSide: Int = 1024
  static let defaultSide: Int = 256
  /// Never draw more than this on a side, whatever the frame says (the readers are asked for at most `mostSide`).
  static let largestDrawn: Int = 4096
  static let mostTimes: Int = 10
  /// Seconds either side of an asked time the generator may take a frame from: the nearest decodable one is fine.
  static let tolerance: Double = 0.25
  /// A pixel less covered than this is not counted (a see-through picture's background is not part of its look).
  static let opaque: UInt8 = 128
  static let red: Double = 0.2126
  static let green: Double = 0.7152
  static let blue: Double = 0.0722

  /// What a failure says to the app: a StatsError's own staged text, anything else described in full.
  static func message(_ error: Error) -> String {
    if let own = error as? StatsError, let text = own.errorDescription { return text }
    return "stats reader: " + ExportSession.describe(error)
  }

  /// The longest side as a whole number in `fewestSide` … `mostSide`; not a number, or nothing asked, is the default.
  static func clampSide(_ asked: Double) -> Int {
    guard asked.isFinite, asked > 0 else { return defaultSide }
    let whole = asked.rounded()
    if whole <= Double(fewestSide) { return fewestSide }
    if whole >= Double(mostSide) { return mostSide }
    return Int(whole)
  }

  /// At most `mostTimes` asked times that are numbers, each inside the file (a little before its very end, where no frame
  /// may be); none left is the middle of the file.
  static func clampTimes(_ asked: [Double], length: Double) -> [Double] {
    let last = max(0, length - 0.05)
    var times: [Double] = []
    for t in asked.prefix(mostTimes) where t.isFinite { times.append(min(max(0, t), last)) }
    if times.isEmpty { times.append(last / 2) }
    return times
  }

  static func run(_ request: FrameStatsRequest, job: StatsJob) async throws -> [String: Any] {
    guard let url = ExportSession.fileURL(from: request.uri) else { throw StatsError.failed("stats source: not a file path") }
    let side = clampSide(request.maxSide)
    if request.kind == "photo" { return try photo(url, side: side, job: job) }
    guard request.kind == "video" else { throw StatsError.failed("stats source: unknown kind") }
    return try await video(url, times: request.times, side: side, job: job)
  }

  /// A photo: decoded upright (EXIF applied) at `side`, one frame at time 0.
  static func photo(_ url: URL, side: Int, job: StatsJob) throws -> [String: Any] {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { throw StatsError.failed("stats source: this picture cannot be read") }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: side,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
      throw StatsError.failed("stats source: this picture cannot be read")
    }
    if job.isCancelled { throw StatsError.cancelled }
    guard var frame = measure(image) else { throw StatsError.failed("stats measure: nothing in this picture could be counted") }
    frame["time"] = 0.0
    return ["frames": [frame], "failed": 0]
  }

  /// A video: one frame per asked time, upright and aspect-fitted in `side` × `side`, in order. A frame that cannot be
  /// read is counted and skipped; none at all is a failure. The asset is a local of this function, which does not return
  /// before the last frame has been read.
  static func video(_ url: URL, times asked: [Double], side: Int, job: StatsJob) async throws -> [String: Any] {
    let asset = AVURLAsset(url: url)
    let tracks: [AVAssetTrack]
    let length: CMTime
    do {
      tracks = try await asset.loadTracks(withMediaType: .video)
      length = try await asset.load(.duration)
    } catch {
      throw StatsError.failed("stats source: " + ExportSession.describe(error))
    }
    guard !tracks.isEmpty else { throw StatsError.failed("stats source: this file has no picture") }
    let total = length.seconds.isFinite ? length.seconds : 0
    guard total > 0 else { throw StatsError.failed("stats source: nothing to look at") }
    let times = clampTimes(asked, length: total)
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: side, height: side)
    let slack = ExportSession.time(tolerance)
    generator.requestedTimeToleranceBefore = slack
    generator.requestedTimeToleranceAfter = slack
    guard job.attach(generator) else { throw StatsError.cancelled }
    var frames: [[String: Any]] = []
    var failed = 0
    for t in times {
      if job.isCancelled { throw StatsError.cancelled }
      do {
        let (image, actual) = try await generator.image(at: ExportSession.time(t))
        if job.isCancelled { throw StatsError.cancelled }
        guard var frame = measure(image) else {
          failed += 1
          continue
        }
        frame["time"] = actual.seconds.isFinite ? actual.seconds : t
        frames.append(frame)
      } catch StatsError.cancelled {
        throw StatsError.cancelled
      } catch {
        if job.isCancelled { throw StatsError.cancelled }
        failed += 1
      }
    }
    guard !frames.isEmpty else { throw StatsError.failed("stats frames: no frame could be read") }
    return ["frames": frames, "failed": failed]
  }

  /// Draws the frame once into an 8-bit RGBA bitmap in sRGB (premultiplied) and counts it. Nil when it cannot be drawn
  /// or has no pixel covered enough to count.
  static func measure(_ image: CGImage) -> [String: Any]? {
    let width = image.width
    let height = image.height
    guard width > 0, height > 0, width <= largestDrawn, height <= largestDrawn else { return nil }
    guard let space = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
    let rowBytes = width * 4
    var data = [UInt8](repeating: 0, count: rowBytes * height)
    let drawn: Bool = data.withUnsafeMutableBytes { (raw: UnsafeMutableRawBufferPointer) -> Bool in
      guard let base = raw.baseAddress,
            let context = CGContext(data: base, width: width, height: height, bitsPerComponent: 8, bytesPerRow: rowBytes,
                                    space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
      context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
      return true
    }
    guard drawn else { return nil }
    return count(data, pixels: width * height)
  }

  /// The numbers of one bitmap of `pixels` RGBA pixels (premultiplied, 8 bits): a component is `value / alpha`, so 0 … 1
  /// gamma-encoded; a pixel with alpha under `opaque` is left out.
  static func count(_ data: [UInt8], pixels: Int) -> [String: Any]? {
    guard pixels > 0, data.count >= pixels * 4 else { return nil }
    var histogram = [Int](repeating: 0, count: bins)
    var sumR = 0.0
    var sumG = 0.0
    var sumB = 0.0
    var sumChroma = 0.0
    var counted = 0
    for i in 0..<pixels {
      let o = i * 4
      let a = data[o + 3]
      if a < opaque { continue }
      let cover = Double(a)
      let r = min(1, Double(data[o]) / cover)
      let g = min(1, Double(data[o + 1]) / cover)
      let b = min(1, Double(data[o + 2]) / cover)
      let luma = red * r + green * g + blue * b
      let bin = min(bins - 1, max(0, Int(luma * Double(bins))))
      histogram[bin] += 1
      sumR += r
      sumG += g
      sumB += b
      sumChroma += max(r, g, b) - min(r, g, b)
      counted += 1
    }
    guard counted > 0 else { return nil }
    let n = Double(counted)
    let answer: [String: Any] = ["histogram": histogram, "r": sumR / n, "g": sumG / n, "b": sumB / n, "saturation": sumChroma / n, "pixels": counted]
    return answer
  }
}
```

(Checked against the SDK and `node_modules/expo-modules-core/ios`: `Record` with `@Field var times: [Double]` decodes a JS number array as `SteadyRender.swift` already does; `AVAssetImageGenerator.image(at:) async throws -> (image: CGImage, actualTime: CMTime)` and `AVAsset.load(.duration)` / `loadTracks(withMediaType:)` are iOS 16.0; `cancelAllCGImageGeneration()` is iOS 4; the ImageIO keys are as in `CutoutRender.renderPhoto`. `luma` is finite: `cover ≥ 128`.)

- [ ] **Step 8: Wire it in** `modules/clipy-video/ios/ClipyVideoModule.swift`. First insertion, directly after `lookupPeaksJob` (the line `    return peaksJobs[id]\n  }\n`):

```swift

  private let statsLock = NSLock()
  private var statsJobs: [String: StatsJob] = [:]   // guarded by `statsLock`; one entry per look that has not answered yet

  private func storeStatsJob(_ id: String, _ job: StatsJob) {
    statsLock.lock(); defer { statsLock.unlock() }
    statsJobs[id] = job
  }

  private func dropStatsJob(_ id: String) {
    statsLock.lock(); defer { statsLock.unlock() }
    statsJobs[id] = nil
  }

  private func lookupStatsJob(_ id: String) -> StatsJob? {
    statsLock.lock(); defer { statsLock.unlock() }
    return statsJobs[id]
  }

  /// What a look says when it was not made, or cannot be trusted, because the app was in the background during it.
  private static let statsInterrupted = "stats interrupted: Clipy was in the background while the picture was read"
```

Second insertion, directly after the `Function("textReveal") { () -> Bool in\n      return true\n    }\n` block (still inside `definition()`):

```swift

    // The build of 2026-10-17 ("auto enhance"): plain numbers about a few frames of a clip (see FrameStats) — resolves
    // `{ frames: [{ time, histogram, r, g, b, saturation, pixels }], failed }`. Rejects "E_STATS_CANCELLED" after
    // `cancelFrameStats(jobId)`, "E_STATS_INTERRUPTED" when asked in the background or when the app was away during it (a
    // decoded frame is not trusted then; the app asks again in front), else "E_STATS" with a staged message. The job is
    // stored before the work starts, and every way out answers the promise exactly once. The app asks whether this
    // function is THERE to know the build.
    AsyncFunction("frameStats") { (request: FrameStatsRequest, promise: Promise) in
      let job = StatsJob()
      let jobId = request.jobId
      self.storeStatsJob(jobId, job)
      Task { [weak self] in
        defer { self?.dropStatsJob(jobId) }
        let leaves = ExportPause.shared.leaveCount
        if ExportPause.shared.isBackground {
          promise.reject("E_STATS_INTERRUPTED", ClipyVideoModule.statsInterrupted)
          return
        }
        do {
          let answer: [String: Any] = try await FrameStats.run(request, job: job)
          if ExportPause.shared.hasLeft(since: leaves) {
            promise.reject("E_STATS_INTERRUPTED", ClipyVideoModule.statsInterrupted)
            return
          }
          promise.resolve(answer)
        } catch StatsError.cancelled {
          promise.reject("E_STATS_CANCELLED", "Stats cancelled")
        } catch {
          if ExportPause.shared.hasLeft(since: leaves) {
            promise.reject("E_STATS_INTERRUPTED", ClipyVideoModule.statsInterrupted + " (" + FrameStats.message(error) + ")")
          } else {
            promise.reject("E_STATS", FrameStats.message(error))
          }
        }
      }
    }

    // Stops that look at its next frame (it then rejects "E_STATS_CANCELLED"). An unknown or finished job: nothing.
    Function("cancelFrameStats") { (jobId: String) in
      self.lookupStatsJob(jobId)?.cancel()
    }
```

(`ExportPause.shared.isBackground`, `.leaveCount`, `.hasLeft(since:)` are the ones `measureShake` already uses. `interruptCopies` and `takeLeft` are not touched.)

- [ ] **Step 9: Write the XCTest** `modules/clipy-video/ios/Tests/FrameStatsTests.swift`:

```swift
import CoreGraphics
import XCTest
@testable import ClipyVideo

/// Auto enhance's numbers: counting a bitmap, drawing a picture into sRGB, and the clamps.
final class FrameStatsTests: XCTestCase {
  private func solid(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1, width: Int = 8, height: Int = 4) -> CGImage {
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.setFillColor(CGColor(colorSpace: space, components: [r, g, b, a])!)
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    return ctx.makeImage()!
  }

  func testCountsGammaValuesAndLeavesOutSeeThroughPixels() {
    // grey 153 (0.6), pure red, a see-through pixel, a half-covered red (64 of 128 = 0.5 once un-premultiplied).
    let data: [UInt8] = [153, 153, 153, 255, 255, 0, 0, 255, 0, 0, 0, 0, 64, 0, 0, 128]
    let s = FrameStats.count(data, pixels: 4)!
    XCTAssertEqual(s["pixels"] as? Int, 3)
    let h = s["histogram"] as! [Int]
    XCTAssertEqual(h.count, 64)
    XCTAssertEqual(h[38], 1)   // 0.6 × 64 = 38.4
    XCTAssertEqual(h[13], 1)   // 0.2126 × 64 = 13.6
    XCTAssertEqual(h[6], 1)    // 0.5 × 0.2126 × 64 = 6.8
    XCTAssertEqual(h.reduce(0, +), 3)
    XCTAssertEqual(s["r"] as! Double, (0.6 + 1 + 0.5) / 3, accuracy: 1e-9)
    XCTAssertEqual(s["g"] as! Double, 0.6 / 3, accuracy: 1e-9)
    XCTAssertEqual(s["saturation"] as! Double, (0 + 1 + 0.5) / 3, accuracy: 1e-9)
  }

  func testNothingToCount() {
    XCTAssertNil(FrameStats.count([0, 0, 0, 0], pixels: 1))
    XCTAssertNil(FrameStats.count([1, 2, 3], pixels: 1))      // shorter than it says
    XCTAssertNil(FrameStats.count([], pixels: 0))
    XCTAssertNil(FrameStats.measure(solid(1, 1, 1, 0.25)))     // alpha 64: nothing covered enough
  }

  func testADrawnPictureIsCountedInSRGB() {
    let grey = FrameStats.measure(solid(0.6, 0.6, 0.6))!
    XCTAssertEqual(grey["pixels"] as? Int, 32)
    XCTAssertEqual((grey["histogram"] as! [Int])[38], 32)
    XCTAssertEqual(grey["r"] as! Double, 0.6, accuracy: 0.01)
    XCTAssertEqual(grey["saturation"] as! Double, 0, accuracy: 0.01)
    let red = FrameStats.measure(solid(1, 0, 0))!
    XCTAssertEqual((red["histogram"] as! [Int])[13], 32)
    XCTAssertEqual(red["saturation"] as! Double, 1, accuracy: 0.01)
  }

  func testTheClamps() {
    XCTAssertEqual(FrameStats.clampSide(.nan), 256)
    XCTAssertEqual(FrameStats.clampSide(0), 256)
    XCTAssertEqual(FrameStats.clampSide(8), 16)
    XCTAssertEqual(FrameStats.clampSide(300.4), 300)
    XCTAssertEqual(FrameStats.clampSide(5000), 1024)
    XCTAssertEqual(FrameStats.clampTimes([1, .nan, -2, 99], length: 10), [1, 0, 9.95])
    XCTAssertEqual(FrameStats.clampTimes([], length: 10), [4.975])
    XCTAssertEqual(FrameStats.clampTimes(Array(repeating: 1, count: 12), length: 10).count, 10)
  }
}
```

- [ ] **Step 10: Run the Swift-reading test — it passes.** Read `FrameStats.swift` once more against `node_modules/expo-modules-core/ios` (the `Record` / `@Field` / `AsyncFunction` with a `Promise` argument as `soundPeaks` uses them).

- [ ] **Step 11: The LEVELS row.** In `src/lib/buildInfo.ts` add the import `import { isFrameStatsAvailable } from "@/modules/clipy-video/frameStats";`, a new FIRST row of `LEVELS`:

```ts
  { name: "auto enhance", title: "Auto enhance", has: isFrameStatsAvailable },
```

and, at the end of the file:

```ts
/** Said where Auto (the Adjust strip's first chip) is tapped in Expo Go or in a build from before `frameStats` (the "auto enhance" build). */
export const AUTO_TOOLS = NEEDS_LATEST_BUILD("Automatic adjustments");
```

Update `src/lib/__tests__/buildInfo.test.ts` exactly as stated: add `jest.mock("@/modules/clipy-video/frameStats", () => ({ isFrameStatsAvailable: jest.fn() }));` and its import; `set` gains a tenth parameter `auto = false` with `(isFrameStatsAvailable as jest.Mock).mockReturnValue(auto);`; the first test starts with

```ts
  set(true, true, true, true, true, true, true, true, true, true);
  expect(buildLabel()).toBe("App build: auto enhance");
```

the second with

```ts
  set(true, true, true, true, true, true, true, true, true, true);
  expect(buildName()).toBe("Auto enhance");
```

and a new test:

```ts
test("Auto enhance's sentence", () => {
  expect(AUTO_TOOLS).toBe("Automatic adjustments need the latest Clipy build. Install it from the newest build link.");
});
```

(add `AUTO_TOOLS` to the import from `../buildInfo`). Every existing line stays as it is (a call with nine arguments still means `auto = false`).

- [ ] **Step 12: Checks.** `npm.cmd run typecheck`, `npm.cmd test` — all pass; the app suite count is the baseline + 2.

- [ ] **Step 13: Commit.**

```powershell
git add modules/clipy-video/ios/FrameStats.swift modules/clipy-video/ios/ClipyVideoModule.swift modules/clipy-video/frameStats.ts modules/clipy-video/index.ts src/lib/buildInfo.ts modules/clipy-video/ios/Tests/FrameStatsTests.swift modules/clipy-video/__tests__/frameStats.test.ts modules/clipy-video/__tests__/frameStats.swift.test.ts src/lib/__tests__/buildInfo.test.ts
git commit -m "native: frameStats for Auto enhance — a few frames as plain numbers, the auto enhance build row" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The pure decision, autoEnhance.ts, with vectors

**Files:**
- Create: `src/editor/model/autoEnhance.ts`
- Create: `src/editor/model/__tests__/autoEnhance.vectors.ts` (a helper, ignored as a suite by `testPathIgnorePatterns`)
- Create: `src/editor/model/__tests__/autoEnhance.test.ts`

- [ ] **Step 1: The helper** `src/editor/model/__tests__/autoEnhance.vectors.ts`:

```ts
import type { FrameStat } from "@/modules/clipy-video/frameStats";

/** A histogram of 64 bins, flat (100 each) from bin `round(from × 64)` up to (not including) `round(to × 64)`. */
export const flat = (from: number, to: number): number[] => {
  const h = new Array<number>(64).fill(0);
  for (let i = Math.round(from * 64); i < Math.round(to * 64); i++) h[i] = 100;
  return h;
};
/** One frame of the look: luma flat between `from` and `to`, means r g b, mean chroma `sat`. */
export const frame = (from: number, to: number, r: number, g: number, b: number, sat: number): FrameStat =>
  ({ time: 0, histogram: flat(from, to), r, g, b, saturation: sat, pixels: 1000 });

const fine = [0.0625, 0.875] as const;
/** The spec's §3 table: one frame per case → the five values. */
export const VECTORS: { name: string; f: FrameStat; want: { exposure: number; contrast: number; saturation: number; temperature: number; tint: number } }[] = [
  { name: "well exposed: nothing", f: frame(...fine, 0.47, 0.47, 0.47, 0.22), want: { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 } },
  { name: "dark", f: frame(0.03125, 0.4375, 0.24, 0.23, 0.22, 0.12), want: { exposure: 0.3, contrast: 0.2, saturation: 0.2, temperature: 0, tint: 0 } },
  { name: "dim", f: frame(0.0625, 0.6875, 0.37, 0.37, 0.36, 0.14), want: { exposure: 0.23, contrast: 0.2, saturation: 0.2, temperature: 0, tint: 0 } },
  { name: "bright", f: frame(0.375, 1, 0.75, 0.74, 0.73, 0.2), want: { exposure: -0.2, contrast: 0.2, saturation: 0, temperature: 0, tint: 0 } },
  { name: "flat", f: frame(0.28125, 0.65625, 0.47, 0.47, 0.46, 0.1), want: { exposure: 0, contrast: 0.2, saturation: 0.2, temperature: 0, tint: 0 } },
  { name: "blue cast warms", f: frame(...fine, 0.38, 0.46, 0.58, 0.22), want: { exposure: 0, contrast: 0, saturation: 0, temperature: 0.15, tint: 0 } },
  { name: "warm cast cools a little", f: frame(...fine, 0.52, 0.47, 0.42, 0.22), want: { exposure: 0, contrast: 0, saturation: 0, temperature: -0.11, tint: 0 } },
  { name: "green cast goes magenta", f: frame(...fine, 0.42, 0.56, 0.42, 0.22), want: { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0.1 } },
  { name: "clipped both ends and garish", f: frame(0, 1, 0.5, 0.5, 0.5, 0.36), want: { exposure: 0, contrast: -0.08, saturation: -0.1, temperature: 0, tint: 0 } },
  { name: "black and white keeps its grey", f: frame(...fine, 0.47, 0.47, 0.47, 0.01), want: { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 } },
  { name: "a black card is left alone", f: frame(0, 0.03125, 0.01, 0.01, 0.01, 0), want: { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 } },
  { name: "a white card is left alone", f: frame(0.9375, 1, 0.97, 0.97, 0.97, 0), want: { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 } },
];
```

- [ ] **Step 2: The failing test** `src/editor/model/__tests__/autoEnhance.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";
import { ADJUST_LABELS } from "@/src/editor/components/AdjustSheet";
import { ADJUST_RANGE, DEFAULT_ADJUST } from "../types";
import { AUTO, AUTO_KEYS, AUTO_NAMES, autoLine, autoState, autoStrengthOf, autoTargets, autoTimes, autoValues, percentile, summarize, valuesOf, type AutoValues } from "../autoEnhance";
import { frame, flat, VECTORS } from "./autoEnhance.vectors";

const zero: AutoValues = { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 };
const dark: AutoValues = { exposure: 0.3, contrast: 0.2, saturation: 0.2, temperature: 0, tint: 0 };

describe("the vectors (spec §3)", () => {
  for (const v of VECTORS) test(v.name, () => expect(autoTargets(summarize([v.f])!)).toEqual(v.want));
});

test("the summary: percentiles inside a bin, every frame weighs the same, bad frames skipped", () => {
  const s = summarize([frame(0.0625, 0.875, 0.47, 0.47, 0.47, 0.22)])!;
  expect(s.p2).toBeCloseTo(0.07875, 10);
  expect(s.p50).toBeCloseTo(0.46875, 10);
  expect(s.p98).toBeCloseTo(0.85875, 10);
  const big = { ...frame(0.0625, 0.875, 0.47, 0.47, 0.47, 0.22), pixels: 4000, histogram: flat(0.0625, 0.875).map((n) => n * 4) };
  const two = summarize([frame(0.03125, 0.4375, 0.24, 0.23, 0.22, 0.12), big])!;
  expect(two.r).toBeCloseTo(0.355, 10);
  expect(two.p50).toBeCloseTo(0.3125, 10);
  expect(autoTargets(two)).toEqual({ ...zero, exposure: 0.3 });
  expect(summarize([])).toBeNull();
  expect(summarize([{ ...big, histogram: [1, 2] }, { ...big, r: Number.NaN }, { ...big, pixels: 0 }, { ...big, histogram: new Array(64).fill(0) }])).toBeNull();
  expect(percentile([0, 1, 0, 0], 0.5)).toBe(0.375);
});

test("the gentle limits sit well inside the sliders, and every target is on the slider's step", () => {
  for (const k of AUTO_KEYS) {
    const [lo, hi] = AUTO.limits[k];
    expect(lo).toBeGreaterThanOrEqual(-0.2);
    expect(hi).toBeLessThanOrEqual(0.3);
    expect(lo).toBeGreaterThan(ADJUST_RANGE[k][0]);
    expect(hi).toBeLessThan(ADJUST_RANGE[k][1]);
  }
  for (const v of VECTORS) for (const k of AUTO_KEYS) {
    const t = autoTargets(summarize([v.f])!)[k];
    expect(Math.round(t * 100) / 100).toBe(t);
    expect(Object.is(t, -0)).toBe(false);
  }
});

test("the times: a photo one, a video up to five at the middles of equal parts of its trim", () => {
  expect(autoTimes("photo", 0, 5)).toEqual([0]);
  expect(autoTimes("video", 0, 10)).toEqual([1, 3, 5, 7, 9]);
  expect(autoTimes("video", 2, 3)).toEqual([2.25, 2.75]);
  expect(autoTimes("video", 0, 0.3)).toEqual([0.15]);
  expect(autoTimes("video", 4, 4)).toEqual([4]);
});

test("the strength blends from the base, on the slider's step", () => {
  expect(autoValues(dark, zero, 1)).toEqual(dark);
  expect(autoValues(dark, zero, 0)).toEqual(zero);
  expect(autoValues(dark, zero, 0.5)).toEqual({ ...zero, exposure: 0.15, contrast: 0.1, saturation: 0.1 });
  expect(autoValues(dark, { ...zero, exposure: 0.5 }, 0.5)).toEqual({ ...zero, exposure: 0.4, contrast: 0.1, saturation: 0.1 });
});

test("which strength the clip shows: the hint first, else the highest that matches; never 0 inferred, never when nothing differs", () => {
  const half = autoValues(dark, zero, 0.5);
  expect(autoStrengthOf(half, dark, zero, 0.5)).toBe(0.5);
  expect(autoStrengthOf(half, dark, zero, 1)).toBe(0.51);           // 51 % rounds to the same values
  expect(autoStrengthOf(dark, dark, zero, 0.5)).toBe(1);             // Undo of a drag: the values say 100 %
  expect(autoStrengthOf(zero, dark, zero, 1)).toBeNull();            // Undo of the tap: the base, not "1 %"
  expect(autoStrengthOf(zero, dark, zero, 0)).toBe(0);               // dragged to 0 %: still Auto's
  expect(autoStrengthOf({ ...dark, contrast: 0.5 }, dark, zero, 1)).toBeNull();   // a slider moved by hand
  expect(autoStrengthOf(zero, zero, zero, 1)).toBeNull();
});

test("the state and the line", () => {
  expect(autoState(dark, dark, zero, 1)).toEqual({ kind: "set", strength: 1, line: "Set exposure +30, contrast +20, saturation +20" });
  expect(autoState(autoValues(dark, zero, 0.5), dark, zero, 0.5)).toEqual({ kind: "set", strength: 0.5, line: "Set exposure +15, contrast +10, saturation +10" });
  expect(autoState(zero, zero, zero, 1)).toEqual({ kind: "good" });
  expect(autoState({ ...zero, tint: 0.1 }, zero, zero, 1)).toBeNull();
  expect(autoState(zero, dark, zero, 1)).toBeNull();
  const cast: AutoValues = { ...zero, temperature: -0.04, tint: 0.03 };
  expect(autoLine(cast, cast, zero)).toBe("Set warmth -4, tint +3");
});

test("the names are the slider labels, lower-cased; the values are the clip's", () => {
  for (const k of AUTO_KEYS) expect(AUTO_NAMES[k]).toBe(ADJUST_LABELS[k].toLowerCase());
  expect(valuesOf({ ...DEFAULT_ADJUST, exposure: 0.2, brightness: 0.9 })).toEqual({ ...zero, exposure: 0.2 });
});

test("the phone's 64 bins are the model's", () => {
  const swift = readFileSync(join(__dirname, "../../../../modules/clipy-video/ios/FrameStats.swift"), "utf8");
  expect(swift).toContain(`static let bins: Int = ${AUTO.bins}`);
  expect(swift).toContain(`static let defaultSide: Int = ${AUTO.maxSide}`);
});
```

- [ ] **Step 3: Run it — it fails** (no `../autoEnhance`).

- [ ] **Step 4: Write** `src/editor/model/autoEnhance.ts`:

```ts
import type { FrameStat } from "@/modules/clipy-video/frameStats";
import { ADJUST } from "./adjust";
import type { ClipAdjust } from "./types";

/**
 * Auto enhance: WHAT to set, from the plain numbers the phone read (`frameStats`). TypeScript only — no Swift twin, nothing
 * mirrored; it writes no look maths of its own: its answer is values of five ORDINARY Adjust sliders, which `setClipAdjust`
 * stores and the existing Adjust pipeline draws. A heuristic on gamma-encoded statistics (spec §3): every number below is
 * tunable without a build.
 */
export const AUTO_KEYS = ["exposure", "contrast", "saturation", "temperature", "tint"] as const;
export type AutoKey = (typeof AUTO_KEYS)[number];
export type AutoValues = Record<AutoKey, number>;
export interface LookSummary { p2: number; p50: number; p98: number; r: number; g: number; b: number; chroma: number }

export const AUTO = {
  /** The phone's histogram (FrameStats.swift `bins`) and the side frames are scaled to (its `defaultSide`). */
  bins: 64, maxSide: 256,
  /** At most five frames, one per half second of the trim. */
  mostFrames: 5, frameEvery: 0.5,
  /** A picture with nothing to see (a black or white card, a fade): left alone. */
  blank: 0.08,
  /** Exposure: the median luma towards mid-grey, 60 % of the way, on gamma values (Y′ ≈ linear^(1 / 2.2)). */
  mid: 0.45, midSlack: 0.05, exposureShare: 0.6, gamma: 2.2, darkest: 0.01,
  /** Contrast: the p2–p98 range towards 0.85, half the way; clipped at both ends → a touch less. */
  width: 0.85, widthEnough: 0.75, contrastShare: 0.5, narrowest: 0.2, clipped: 0.02, flatten: -0.08,
  /** Saturation: mean chroma towards 0.22, half the way; black and white (under 0.04) and 0.16 … 0.32 are left alone. */
  chroma: 0.22, chromaLow: 0.16, chromaHigh: 0.32, grey: 0.04, saturationShare: 0.5,
  /** Warmth / tint: a red − blue or green − magenta cast, as a share of the picture's sum, beyond a dead zone. */
  castSlack: 0.03, tintSlack: 0.025, warmthPerCast: 1.5, tintPerCast: 1.5,
  /** The GENTLE limits, in slider units (the slider shows ×100; every range is −1 … 1). */
  limits: {
    exposure: [-0.2, 0.3], contrast: [-0.1, 0.2], saturation: [-0.1, 0.2], temperature: [-0.15, 0.15], tint: [-0.1, 0.1],
  } as Record<AutoKey, readonly [number, number]>,
} as const;

/** What the line calls each key: the slider's own label, lower-cased (pinned to ADJUST_LABELS in the tests). */
export const AUTO_NAMES: Record<AutoKey, string> = { exposure: "exposure", contrast: "contrast", saturation: "saturation", temperature: "warmth", tint: "tint" };

const r2 = (v: number): number => Math.round(v * 100) / 100 + 0;
const r3 = (v: number): number => Math.round(v * 1000) / 1000 + 0;
const within = (v: number, [lo, hi]: readonly [number, number]): number => Math.min(hi, Math.max(lo, v));
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const ZERO: AutoValues = { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 };

/** The source seconds to look at: a photo one picture; a video up to five, at the middles of equal parts of its trim. */
export function autoTimes(kind: "video" | "photo", from: number, to: number): number[] {
  if (kind === "photo") return [0];
  const length = to - from;
  if (!(length > 0)) return [r3(Math.max(0, from))];
  const n = Math.max(1, Math.min(AUTO.mostFrames, Math.floor(length / AUTO.frameEvery)));
  return Array.from({ length: n }, (_, i) => r3(from + ((i + 0.5) * length) / n));
}

/** The value at share `q` of a normalised histogram, linear inside a bin, 0 … 1. */
export function percentile(hist: readonly number[], q: number): number {
  let below = 0;
  for (let i = 0; i < hist.length; i++) {
    const h = hist[i];
    if (h > 0 && below + h >= q) return (i + (q - below) / h) / hist.length;
    below += h;
  }
  return 1;
}

/** The frames as one: each histogram normalised and the frames averaged (each weighs the same); a malformed frame is skipped. */
export function summarize(frames: readonly FrameStat[]): LookSummary | null {
  const hist = new Array<number>(AUTO.bins).fill(0);
  let used = 0, r = 0, g = 0, b = 0, chroma = 0;
  for (const f of frames) {
    if (!isNum(f.pixels) || f.pixels <= 0 || !Array.isArray(f.histogram) || f.histogram.length !== AUTO.bins) continue;
    if (![f.r, f.g, f.b, f.saturation].every(isNum) || !f.histogram.every((n) => isNum(n) && n >= 0)) continue;
    const total = f.histogram.reduce((s, n) => s + n, 0);
    if (total <= 0) continue;
    for (let i = 0; i < AUTO.bins; i++) hist[i] += f.histogram[i] / total;
    used += 1; r += f.r; g += f.g; b += f.b; chroma += f.saturation;
  }
  if (used === 0) return null;
  for (let i = 0; i < AUTO.bins; i++) hist[i] /= used;
  return { p2: percentile(hist, 0.02), p50: percentile(hist, 0.5), p98: percentile(hist, 0.98), r: r / used, g: g / used, b: b / used, chroma: chroma / used };
}

/** The five values Auto sets at 100 %, ABSOLUTE (the source picture is what the clip shows with a neutral adjust). */
export function autoTargets(s: LookSummary): AutoValues {
  const L = AUTO.limits;
  if (s.p98 < AUTO.blank || s.p2 > 1 - AUTO.blank) return { ...ZERO };
  const ev = Math.abs(s.p50 - AUTO.mid) <= AUTO.midSlack ? 0 : AUTO.gamma * Math.log2(AUTO.mid / Math.max(s.p50, AUTO.darkest)) * AUTO.exposureShare;
  const exposure = r2(within(ev / ADJUST.exposureEV, L.exposure));
  const gain = 2 ** ((ADJUST.exposureEV * exposure) / AUTO.gamma);
  const w = Math.min(1, s.p98 * gain) - s.p2 * gain;
  let contrast = 0;
  if (s.p2 <= AUTO.clipped && s.p98 >= 1 - AUTO.clipped) contrast = AUTO.flatten;
  else if (w < AUTO.widthEnough) contrast = within(((AUTO.width / Math.max(w, AUTO.narrowest) - 1) / ADJUST.contrast) * AUTO.contrastShare, L.contrast);
  const S = s.chroma;
  const saturation = S < AUTO.grey || (S >= AUTO.chromaLow && S <= AUTO.chromaHigh) ? 0
    : within(((AUTO.chroma / S - 1) * AUTO.saturationShare) / ADJUST.saturation, L.saturation);
  const sum = Math.max(0.05, s.r + s.g + s.b);
  const rb = (s.r - s.b) / sum;
  const gm = (s.g - (s.r + s.b) / 2) / sum;
  const temperature = Math.abs(rb) <= AUTO.castSlack ? 0 : within(-rb * AUTO.warmthPerCast, L.temperature);
  const tint = Math.abs(gm) <= AUTO.tintSlack ? 0 : within(gm * AUTO.tintPerCast, L.tint);
  return { exposure, contrast: r2(contrast), saturation: r2(saturation), temperature: r2(temperature), tint: r2(tint) };
}

/** The clip's own values of the five keys. */
export const valuesOf = (a: ClipAdjust): AutoValues => ({ exposure: a.exposure, contrast: a.contrast, saturation: a.saturation, temperature: a.temperature, tint: a.tint });

/** What Auto writes at `strength` (0 … 1): FROM the base towards the target, on the slider's step — 0 is exactly the base. */
export function autoValues(target: AutoValues, base: AutoValues, strength: number): AutoValues {
  const out = { ...ZERO };
  for (const k of AUTO_KEYS) out[k] = r2(base[k] + (target[k] - base[k]) * strength);
  return out;
}

const same = (a: AutoValues, b: AutoValues): boolean => AUTO_KEYS.every((k) => a[k] === b[k]);

/**
 * The strength at which `now` is exactly what Auto set: `hint` if it matches, else the highest of 100 % … 1 % that matches and is
 * not the base itself (so Undo of the tap is never read as "1 %"), else null — null too when the target IS the base.
 */
export function autoStrengthOf(now: AutoValues, target: AutoValues, base: AutoValues, hint: number): number | null {
  if (same(target, base)) return null;
  if (same(now, autoValues(target, base, hint))) return hint;
  for (let pct = 100; pct >= 1; pct--) {
    const at = autoValues(target, base, pct / 100);
    if (same(now, at) && !same(at, base)) return pct / 100;
  }
  return null;
}

const signed = (v: number): string => {
  const pct = Math.round(v * 100) + 0;
  return `${pct > 0 ? "+" : ""}${pct}`;
};
/** "Set exposure +12, contrast +8, …": the keys Auto changes (target ≠ base), with the values the clip has NOW, as the slider prints them. */
export function autoLine(now: AutoValues, target: AutoValues, base: AutoValues): string {
  return `Set ${AUTO_KEYS.filter((k) => target[k] !== base[k]).map((k) => `${AUTO_NAMES[k]} ${signed(now[k])}`).join(", ")}`;
}

export type AutoState = { kind: "set"; strength: number; line: string } | { kind: "good" };
/** What the strip shows for a clip Auto has looked at: its strength and line, "already looks good", or nothing (stale). */
export function autoState(now: AutoValues, target: AutoValues, base: AutoValues, hint: number): AutoState | null {
  if (same(target, base)) return same(now, base) ? { kind: "good" } : null;
  const strength = autoStrengthOf(now, target, base, hint);
  return strength === null ? null : { kind: "set", strength, line: autoLine(now, target, base) };
}
```

- [ ] **Step 5: Run the test — it passes.** (The vectors were computed with exactly this code; if one differs, the CODE is wrong — never edit a vector.)

- [ ] **Step 6: Checks** (typecheck, full test; suites + 1). **Commit:**

```powershell
git add src/editor/model/autoEnhance.ts src/editor/model/__tests__/autoEnhance.test.ts src/editor/model/__tests__/autoEnhance.vectors.ts
git commit -m "model: autoEnhance — what Auto sets from a clip's frame numbers, with vectors" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The look — one at a time, a deadline, cancel, session memory

**Files:**
- Create: `src/editor/autoLook.ts`
- Create: `src/editor/__tests__/autoLook.test.ts`

- [ ] **Step 1: The failing test** `src/editor/__tests__/autoLook.test.ts`:

```ts
jest.mock("@/modules/clipy-video/frameStats", () => ({
  isFrameStatsAvailable: jest.fn(() => true), frameStats: jest.fn(), cancelFrameStats: jest.fn(),
  isStatsCancelled: (e: { code?: string }) => e?.code === "E_STATS_CANCELLED",
  isStatsInterrupted: (e: { code?: string }) => e?.code === "E_STATS_INTERRUPTED",
}));
import { cancelFrameStats, frameStats, isFrameStatsAvailable } from "@/modules/clipy-video/frameStats";
import { AUTO_DEADLINE_MS, AUTO_MEMORY, lookAt, lookKey, rememberApplied, resetAutoLooks, setStrength, stopLooking, useAutoLooks, type LookSource } from "../autoLook";
import { frame, VECTORS } from "../model/__tests__/autoEnhance.vectors";

const fs = frameStats as jest.Mock;
const src: LookSource = { clipId: "a", uri: "file:///a.mov", kind: "video", from: 0, to: 10 };
const darkAnswer = { frames: [VECTORS[1].f], failed: 0 };
const deferred = <T,>() => { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

beforeEach(() => { fs.mockReset(); (cancelFrameStats as jest.Mock).mockReset(); (isFrameStatsAvailable as jest.Mock).mockReturnValue(true); resetAutoLooks(); jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { jest.useRealTimers(); (console.warn as jest.Mock).mockRestore(); });

test("asks the phone once with the clip's file, kind, times and side; remembers the target for the session", async () => {
  fs.mockResolvedValue(darkAnswer);
  await expect(lookAt(src)).resolves.toEqual({ status: "ready", target: VECTORS[1].want });
  expect(fs).toHaveBeenCalledTimes(1);
  expect(fs.mock.calls[0][0]).toMatchObject({ uri: "file:///a.mov", kind: "video", times: [1, 3, 5, 7, 9], maxSide: 256 });
  expect(useAutoLooks.getState().targets[lookKey(src)]).toEqual(VECTORS[1].want);
  await expect(lookAt(src)).resolves.toEqual({ status: "ready", target: VECTORS[1].want });
  expect(fs).toHaveBeenCalledTimes(1);   // known: no second read
  expect(lookKey(src)).toBe("a|file:///a.mov|0|10");
  expect(lookKey({ ...src, to: 9 })).not.toBe(lookKey(src));   // another trim is another look
});

test("a photo is asked as one picture", async () => {
  fs.mockResolvedValue(darkAnswer);
  await lookAt({ ...src, kind: "photo" });
  expect(fs.mock.calls[0][0]).toMatchObject({ kind: "photo", times: [0] });
});

test("without the build nothing is asked", async () => {
  (isFrameStatsAvailable as jest.Mock).mockReturnValue(false);
  await expect(lookAt(src)).resolves.toEqual({ status: "unavailable" });
  expect(fs).not.toHaveBeenCalled();
});

test("one at a time: a second look while one runs is busy", async () => {
  const d = deferred<typeof darkAnswer>();
  fs.mockReturnValue(d.promise);
  const first = lookAt(src);
  await expect(lookAt({ ...src, clipId: "b" })).resolves.toEqual({ status: "busy" });
  d.resolve(darkAnswer);
  await expect(first).resolves.toMatchObject({ status: "ready" });
});

test("stop ends it at once, tells the phone, and a late answer is dropped (nothing remembered)", async () => {
  const d = deferred<typeof darkAnswer>();
  fs.mockReturnValue(d.promise);
  const look = lookAt(src);
  await Promise.resolve();
  stopLooking();
  await expect(look).resolves.toEqual({ status: "cancelled" });
  expect(cancelFrameStats).toHaveBeenCalledWith(fs.mock.calls[0][0].jobId);
  d.resolve(darkAnswer);
  await Promise.resolve();
  expect(useAutoLooks.getState().targets).toEqual({});
});

test("the deadline counts time in front only; past it the phone is told to stop and the look failed", async () => {
  jest.useFakeTimers();
  fs.mockReturnValue(new Promise(() => {}));
  const look = lookAt(src);
  await jest.advanceTimersByTimeAsync(AUTO_DEADLINE_MS);
  await expect(look).resolves.toEqual({ status: "failed" });
  expect(cancelFrameStats).toHaveBeenCalledTimes(1);
});

test("interrupted (Clipy was away) is asked again in front, at most twice more; a failure is failed and logged", async () => {
  const away = { code: "E_STATS_INTERRUPTED", message: "stats interrupted: …" };
  fs.mockRejectedValueOnce(away).mockResolvedValueOnce(darkAnswer);
  await expect(lookAt(src)).resolves.toMatchObject({ status: "ready" });
  expect(fs).toHaveBeenCalledTimes(2);
  fs.mockReset(); resetAutoLooks();
  fs.mockRejectedValue(away);
  await expect(lookAt(src)).resolves.toEqual({ status: "failed" });
  expect(fs).toHaveBeenCalledTimes(3);
  fs.mockReset();
  fs.mockRejectedValue(new Error("stats frames: no frame could be read"));
  await expect(lookAt(src)).resolves.toEqual({ status: "failed" });
  expect(console.warn).toHaveBeenCalledWith("auto enhance failed", "stats frames: no frame could be read");
  fs.mockResolvedValue({ frames: [{ ...frame(0, 1, 0, 0, 0, 0), histogram: [1] }], failed: 1 });
  await expect(lookAt(src)).resolves.toEqual({ status: "failed" });   // nothing usable came back
});

test("memory: applied entries, the strength, and a cap of AUTO_MEMORY", () => {
  rememberApplied("k", { base: VECTORS[0].want, strength: 1 });
  setStrength("k", 0.4);
  expect(useAutoLooks.getState().applied.k).toEqual({ base: VECTORS[0].want, strength: 0.4 });
  setStrength("none", 0.4);
  expect(useAutoLooks.getState().applied.none).toBeUndefined();
  for (let i = 0; i < AUTO_MEMORY + 3; i++) rememberApplied(`k${i}`, { base: VECTORS[0].want, strength: 1 });
  const keys = Object.keys(useAutoLooks.getState().applied);
  expect(keys).toHaveLength(AUTO_MEMORY);
  expect(keys[keys.length - 1]).toBe(`k${AUTO_MEMORY + 2}`);
  expect(keys).not.toContain("k");
});
```

- [ ] **Step 2: Run it — it fails.**

- [ ] **Step 3: Write** `src/editor/autoLook.ts`:

```ts
import { create } from "zustand";
import { cancelFrameStats, frameStats, isFrameStatsAvailable, isStatsCancelled, isStatsInterrupted, type FrameStatsResult } from "@/modules/clipy-video/frameStats";
import { activeTimeout, untilActive } from "@/src/lib/activeTime";
import { newId } from "@/src/lib/id";
import { AUTO, autoTargets, autoTimes, summarize, type AutoValues } from "./model/autoEnhance";

/** The longest one native look may take, counted in front only (`activeTimeout`). */
export const AUTO_DEADLINE_MS = 20000;
/** How many more times a look that Clipy's leaving interrupted is asked again, once it is in front. */
export const AUTO_RETRIES = 2;
/** At most this many looks (and as many applied entries) are remembered; the oldest goes first. */
export const AUTO_MEMORY = 64;

/** What is looked at: a clip's own file over its trim (source seconds). */
export interface LookSource { clipId: string; uri: string; kind: "video" | "photo"; from: number; to: number }
/** One look per clip, file and trim: another trim is another look. */
export const lookKey = (s: LookSource): string => `${s.clipId}|${s.uri}|${s.from}|${s.to}`;
export type LookAnswer = { status: "ready"; target: AutoValues } | { status: "failed" | "cancelled" | "unavailable" | "busy" };
/** What Auto applied to a clip: the values it had before (`base`) and the strength now. */
export interface Applied { base: AutoValues; strength: number }

/**
 * The session's memory of Auto, in MEMORY ONLY — never in the project, the undo history or on disk: `targets` (what a look found)
 * and `applied` (the base and strength the strip rescales from), both keyed by `lookKey`.
 */
export const useAutoLooks = create<{ targets: Record<string, AutoValues>; applied: Record<string, Applied> }>(() => ({ targets: {}, applied: {} }));

function capped<T>(map: Record<string, T>, key: string, value: T): Record<string, T> {
  const next = { ...map };
  delete next[key];
  next[key] = value;
  const keys = Object.keys(next);
  for (let i = 0; i < keys.length - AUTO_MEMORY; i++) delete next[keys[i]];
  return next;
}
export function rememberApplied(key: string, applied: Applied): void { useAutoLooks.setState((s) => ({ applied: capped(s.applied, key, applied) })); }
export function setStrength(key: string, strength: number): void {
  useAutoLooks.setState((s) => {
    const a = s.applied[key];
    return a && a.strength !== strength ? { applied: { ...s.applied, [key]: { ...a, strength } } } : s;
  });
}
export function resetAutoLooks(): void { useAutoLooks.setState({ targets: {}, applied: {} }); }

type Look = { halt: () => void };
let active: Look | null = null;
/** Ends the look under way at once (closing the strip, another selection, leaving the editor): the phone is told, a late answer is dropped. */
export function stopLooking(): void { active?.halt(); }

type Outcome = AutoValues | "interrupted" | "failed" | "stopped";

/** One native call with its deadline. Never rejects. */
async function askOnce(source: LookSource, stopped: Promise<"stopped">, started: (jobId: string) => void): Promise<Outcome> {
  const jobId = newId();
  started(jobId);
  let stopTimer: () => void = () => {};
  const late = new Promise<"late">((resolve) => { stopTimer = activeTimeout(() => resolve("late"), AUTO_DEADLINE_MS); });
  try {
    const asked = frameStats({ jobId, uri: source.uri, kind: source.kind, times: autoTimes(source.kind, source.from, source.to), maxSide: AUTO.maxSide });
    asked.catch(() => {});   // a rejection after Stop or the deadline is nobody's business
    const answer: FrameStatsResult | "stopped" | "late" = await Promise.race([asked, stopped, late]);
    if (answer === "stopped") return "stopped";
    if (answer === "late") {
      cancelFrameStats(jobId);
      console.warn("auto enhance failed", `stats: no answer after ${AUTO_DEADLINE_MS / 1000} s`);
      return "failed";
    }
    const summary = summarize(answer.frames ?? []);
    if (!summary) { console.warn("auto enhance failed", "stats: no frame could be used"); return "failed"; }
    return autoTargets(summary);
  } catch (e) {
    if (isStatsCancelled(e)) return "stopped";
    if (isStatsInterrupted(e)) return "interrupted";
    console.warn("auto enhance failed", e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e));
    return "failed";
  } finally {
    stopTimer();
  }
}

/**
 * Looks at one clip: the remembered target at once, else ONE native read (`frameStats`, the only caller) with `AUTO_DEADLINE_MS`.
 * One look at a time (a second one meanwhile is `busy`). A read that Clipy's leaving interrupted is asked again once Clipy is in
 * front, at most `AUTO_RETRIES` more times. Never rejects.
 */
export async function lookAt(source: LookSource): Promise<LookAnswer> {
  if (!isFrameStatsAvailable()) return { status: "unavailable" };
  const key = lookKey(source);
  const known = useAutoLooks.getState().targets[key];
  if (known) return { status: "ready", target: known };
  if (active) return { status: "busy" };
  let halted = false;
  let jobId: string | null = null;
  let release: () => void = () => {};
  const stopped = new Promise<"stopped">((resolve) => { release = () => resolve("stopped"); });
  const mine: Look = { halt: () => { if (halted) return; halted = true; if (jobId !== null) cancelFrameStats(jobId); release(); } };
  active = mine;
  try {
    for (let attempt = 0; ; attempt++) {
      if (halted) return { status: "cancelled" };
      const outcome = await askOnce(source, stopped, (id) => { jobId = id; });
      if (halted || outcome === "stopped") return { status: "cancelled" };
      if (outcome === "interrupted") {
        if (attempt >= AUTO_RETRIES) { console.warn("auto enhance failed", "stats: interrupted every time"); return { status: "failed" }; }
        const back = await Promise.race([untilActive().then(() => "back" as const), stopped]);
        if (back === "stopped" || halted) return { status: "cancelled" };
        continue;
      }
      if (outcome === "failed") return { status: "failed" };
      useAutoLooks.setState((s) => ({ targets: capped(s.targets, key, outcome) }));
      return { status: "ready", target: outcome };
    }
  } finally {
    if (active === mine) active = null;
  }
}
```

- [ ] **Step 4: Run the test — it passes.** Checks (suites + 1). **Commit:**

```powershell
git add src/editor/autoLook.ts src/editor/__tests__/autoLook.test.ts
git commit -m "editor: autoLook — one look at a time, a deadline in front, cancel, session memory" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The strip — the Auto chip, strength, line, Apply to All, the message

**Files:**
- Modify: `src/ui/Chip.tsx` (an optional `icon`)
- Create: `src/ui/__tests__/Chip.icon.test.tsx`
- Create: `src/editor/useAutoEnhance.ts`
- Modify: `src/editor/components/AdjustSheet.tsx`
- Create: `src/editor/__tests__/AdjustSheet.auto.test.tsx`

- [ ] **Step 1: The failing Chip test** `src/ui/__tests__/Chip.icon.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import { Chip } from "../Chip";

test("a chip with an icon draws it before its label; without one the chip is exactly as before", async () => {
  const { toJSON } = await render(<Chip label="Auto" selected={false} onPress={() => {}} icon="color-wand-outline" />);
  expect(screen.getByRole("button", { name: "Auto" })).toBeTruthy();
  expect(JSON.stringify(toJSON())).toContain("color-wand-outline");
  const plain = await render(<Chip label="Brightness" selected={false} onPress={() => {}} />);
  expect(JSON.stringify(plain.toJSON())).not.toContain("color-wand-outline");
});
```

(The Ionicon renders its glyph name in Jest — `jest.setup.ts` empties `expo-symbols`; if the serialised tree does not carry the name, assert `screen.UNSAFE_getByProps({ name: "color-wand-outline" })` instead.)

- [ ] **Step 2: Add the icon to the kit Chip** (`src/ui/Chip.tsx`): import `{ View } from "react-native"` and `{ Icon, type IconName } from "./Icon"` (`IconName` is `src/ui/Icon.tsx:7`), add to `Props`

```ts
  /** An icon before the label (the Adjust strip's Auto): the kit Icon in the label's colour. Without it the chip is drawn exactly as before. */
  icon?: IconName;
```

take `icon` in the parameters, and replace the one `<KitText …>{label}</KitText>` child with:

```tsx
      {icon ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.xs }}>
          <Icon name={icon} size={theme.size.icon.sm} color={s.text} />
          <KitText fit={fit} style={{ fontWeight: theme.weight.semi, color: s.text, fontSize: compact ? theme.type.small : theme.type.body }}>{label}</KitText>
        </View>
      ) : (
        <KitText fit={fit} style={{ fontWeight: theme.weight.semi, color: s.text, fontSize: compact ? theme.type.small : theme.type.body }}>{label}</KitText>
      )}
```

Run the Chip test, `defaultTree.proof.test.tsx` (unchanged, must pass), `spacingScale.test.ts`, `outlineIcons.test.ts`, `sfSymbols.map.test.ts` (no new icon name: `color-wand-outline` is already in `USED` and `SF_SYMBOLS` → `wand.and.stars`).

- [ ] **Step 3: The failing strip test** `src/editor/__tests__/AdjustSheet.auto.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-17T10:00:00.000Z" }));
jest.mock("@/modules/clipy-video/frameStats", () => ({
  isFrameStatsAvailable: jest.fn(() => true), frameStats: jest.fn(), cancelFrameStats: jest.fn(),
  isStatsCancelled: (e: { code?: string }) => e?.code === "E_STATS_CANCELLED",
  isStatsInterrupted: (e: { code?: string }) => e?.code === "E_STATS_INTERRUPTED",
}));
jest.mock("@react-native-community/slider", () => {
  const { View } = require("react-native");
  return ({ testID, minimumValue, maximumValue, value, onSlidingStart, onValueChange, onSlidingComplete }: { testID?: string; minimumValue?: number; maximumValue?: number; value?: number; onSlidingStart?: () => void; onValueChange?: (v: number) => void; onSlidingComplete?: (v: number) => void }) =>
    <View testID={testID} accessibilityValue={{ min: minimumValue, max: maximumValue, now: value }} onTouchStart={() => onSlidingStart?.()} onTouchMove={() => onValueChange?.(0.5)} onTouchEnd={() => onSlidingComplete?.(0.5)} />;
});
import { cancelFrameStats, frameStats, isFrameStatsAvailable } from "@/modules/clipy-video/frameStats";
import { resetAutoLooks } from "@/src/editor/autoLook";
import { makeClip, makeLayer, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { AUTO_TOOLS } from "@/src/lib/buildInfo";
import { useToast } from "@/src/ui/Toast";
import { VECTORS } from "../model/__tests__/autoEnhance.vectors";
import { AdjustSheet } from "../components/AdjustSheet";
import { AUTO_WORDS } from "../useAutoEnhance";

const fs = frameStats as jest.Mock;
const answer = (i: number) => ({ frames: [VECTORS[i].f], failed: 0 });   // 1 = dark, 0 = well exposed, 5 = blue cast
const st = () => useEditorStore.getState();
const clip = (id: string) => st().project!.clips.find((c) => c.id === id)!;
const btn = (name: string) => screen.getByRole("button", { name });
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((a) => { resolve = a; }); return { promise, resolve }; };

beforeEach(() => {
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10, trimEnd: 10 }), makePhotoClip({ id: "b" })], layers: [makeLayer({ id: "L", sourceDuration: 4 })] }));
  fs.mockReset(); (cancelFrameStats as jest.Mock).mockReset(); (isFrameStatsAvailable as jest.Mock).mockReturnValue(true);
  resetAutoLooks(); useToast.getState().clear();
});

test("Auto is the first chip, with the wand; opening reads nothing and Brightness stays picked", async () => {
  await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  const chips = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel);
  expect(chips.indexOf("Auto")).toBeLessThan(chips.indexOf("Brightness"));
  expect(btn("Brightness")).toBeSelected();
  expect(fs).not.toHaveBeenCalled();
});

test("without the build the tap says so and changes nothing", async () => {
  (isFrameStatsAvailable as jest.Mock).mockReturnValue(false);
  await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(btn("Auto"));
  expect(useToast.getState().message).toBe(AUTO_TOOLS);
  expect(btn("Auto")).not.toBeSelected();
  expect(btn("Brightness")).toBeSelected();
  expect(fs).not.toHaveBeenCalled();
  expect(st().past).toHaveLength(0);
});

test("one tap: pauses, looks once, sets the sliders as ONE step, says it with Undo, shows the line and the strength", async () => {
  fs.mockResolvedValue(answer(1));
  st().setPlaying(true);
  await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(btn("Auto"));
  expect(st().isPlaying).toBe(false);
  await screen.findByTestId("auto-strength");
  expect(fs).toHaveBeenCalledTimes(1);
  expect(fs.mock.calls[0][0]).toMatchObject({ kind: "video", times: [1, 3, 5, 7, 9], maxSide: 256, uri: clip("a").sourceUri });
  expect(clip("a").adjust).toMatchObject({ exposure: 0.3, contrast: 0.2, saturation: 0.2, temperature: 0, tint: 0, brightness: 0 });
  expect(st().past).toHaveLength(1);
  expect(useToast.getState()).toMatchObject({ message: AUTO_WORDS.done, kind: "done", undo: true });
  expect(screen.getByText("Set exposure +30, contrast +20, saturation +20")).toBeTruthy();
  expect(screen.getByText(`${AUTO_WORDS.strength} 100%`)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
  expect(screen.getAllByRole("button", { name: "Apply to All" })).toHaveLength(1);   // in the row, not in the header
});

test("the strength rescales from the values before Auto, one step per drag; Undo walks back; a hand-moved slider ends it", async () => {
  fs.mockResolvedValue(answer(1));
  await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(btn("Auto"));
  const s = await screen.findByTestId("auto-strength");
  await fireEvent(s, "touchStart"); await fireEvent(s, "touchMove"); await fireEvent(s, "touchEnd");
  expect(clip("a").adjust).toMatchObject({ exposure: 0.15, contrast: 0.1, saturation: 0.1 });
  expect(st().past).toHaveLength(2);
  expect(screen.getByText(`${AUTO_WORDS.strength} 50%`)).toBeTruthy();
  st().undo();
  expect(await screen.findByText(`${AUTO_WORDS.strength} 100%`)).toBeTruthy();
  st().undo();
  await waitFor(() => expect(screen.queryByTestId("auto-strength")).toBeNull());
  expect(screen.getByText(AUTO_WORDS.hint)).toBeTruthy();
  st().redo();
  expect(await screen.findByTestId("auto-strength")).toBeTruthy();
  await fireEvent.press(btn("Contrast"));
  const manual = screen.getByTestId("adjust-slider");
  await fireEvent(manual, "touchStart"); await fireEvent(manual, "touchMove");
  await fireEvent.press(btn("Auto"));   // the memory no longer holds: a new tap, from today's values, no second read
  await screen.findByTestId("auto-strength");
  expect(fs).toHaveBeenCalledTimes(1);
  expect(clip("a").adjust.contrast).toBe(0.2);
});

test("a clip that already looks good: no step, no message, the line says so", async () => {
  fs.mockResolvedValue(answer(0));
  await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(btn("Auto"));
  expect(await screen.findByText(AUTO_WORDS.good)).toBeTruthy();
  expect(st().past).toHaveLength(0);
  expect(useToast.getState().message).toBeNull();
});

test("closing while looking tells the phone and drops the late answer", async () => {
  const d = deferred<ReturnType<typeof answer>>();
  fs.mockReturnValue(d.promise);
  const view = await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(btn("Auto"));
  expect(screen.getByText(AUTO_WORDS.looking)).toBeTruthy();
  await view.rerender(<AdjustSheet clipId="a" visible={false} onClose={() => {}} />);
  expect(cancelFrameStats).toHaveBeenCalledTimes(1);
  d.resolve(answer(1));
  await new Promise((r) => setImmediate(r));
  expect(st().past).toHaveLength(0);
});

test("Apply to All: every main clip looked at on its own, one at a time, ONE step, said with Undo", async () => {
  const first = deferred<ReturnType<typeof answer>>();
  fs.mockReturnValueOnce(first.promise).mockResolvedValueOnce(answer(5));
  await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(btn("Auto"));
  await waitFor(() => expect(screen.getByText(AUTO_WORDS.looking)).toBeTruthy());
  first.resolve(answer(1));
  await screen.findByTestId("auto-strength");
  const before = st().past.length;
  await fireEvent.press(btn("Apply to All"));
  await waitFor(() => expect(useToast.getState().message).toBe(AUTO_WORDS.allDone(2, 0)));
  expect(fs).toHaveBeenCalledTimes(2);                                   // "a" was remembered: only the photo is read
  expect(fs.mock.calls[1][0]).toMatchObject({ kind: "photo", times: [0] });
  expect(st().past.length).toBe(before + 1);
  expect(clip("b").adjust.temperature).toBe(0.15);
  expect(useToast.getState()).toMatchObject({ kind: "done", undo: true });
  expect(st().project!.layers[0].adjust.exposure).toBe(0);             // layers are not included
});

test("Apply to All: a clip that cannot be read is skipped and counted; nothing new to set is said plainly; Cancel applies nothing", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 }), makePhotoClip({ id: "b" }), makeClip({ id: "c", sourceDuration: 4 })] }));
  fs.mockResolvedValueOnce(answer(1)).mockRejectedValueOnce(new Error("stats source: this picture cannot be read")).mockResolvedValueOnce(answer(5));
  jest.spyOn(console, "warn").mockImplementation(() => {});
  await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(btn("Auto"));
  await screen.findByTestId("auto-strength");
  await fireEvent.press(btn("Apply to All"));
  await waitFor(() => expect(useToast.getState().message).toBe(AUTO_WORDS.allDone(2, 1)));   // a (already Auto's) and c; b skipped
  expect(useToast.getState()).toMatchObject({ kind: "done", undo: true });
  expect(clip("c").adjust.temperature).toBe(0.15);
  // Again: everything is already Auto's (b still fails) — no step, said plainly.
  fs.mockRejectedValueOnce(new Error("stats source: this picture cannot be read"));
  const steps = st().past.length;
  await fireEvent.press(btn("Apply to All"));
  await waitFor(() => expect(useToast.getState().message).toBe(AUTO_WORDS.nothing(1)));
  expect(st().past.length).toBe(steps);
  // Cancel: with the memory gone the row offers Apply to All again; cancelling it changes nothing.
  const d = deferred<ReturnType<typeof answer>>();
  resetAutoLooks(); fs.mockReset(); fs.mockReturnValue(d.promise);
  await fireEvent.press(await screen.findByRole("button", { name: "Apply to All" }));
  await fireEvent.press(btn("Cancel"));
  d.resolve(answer(1));
  await new Promise((r) => setImmediate(r));
  expect(st().past.length).toBe(steps);
  (console.warn as jest.Mock).mockRestore();
});

test("a layer: Auto works on the layer, with no Apply to All", async () => {
  fs.mockResolvedValue(answer(1));
  await render(<AdjustSheet clipId="L" visible onClose={() => {}} />);
  await fireEvent.press(btn("Auto"));
  await screen.findByTestId("auto-strength");
  expect(st().project!.layers[0].adjust.exposure).toBe(0.3);
  expect(screen.queryByRole("button", { name: "Apply to All" })).toBeNull();
});
```

- [ ] **Step 4: Run it — it fails.**

- [ ] **Step 5: Write** `src/editor/useAutoEnhance.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { isFrameStatsAvailable } from "@/modules/clipy-video/frameStats";
import { AUTO_TOOLS } from "@/src/lib/buildInfo";
import { haptic } from "@/src/ui/haptics";
import { useToast, type MessageOptions } from "@/src/ui/Toast";
import { lookAt, lookKey, rememberApplied, stopLooking, useAutoLooks, type Applied, type LookSource } from "./autoLook";
import { autoStrengthOf, autoValues, valuesOf, type AutoValues } from "./model/autoEnhance";
import { setClipAdjust } from "./model/ops";
import { findItem } from "./model/timeline";
import type { Clip } from "./model/types";
import { useEditorStore } from "./store";

const couldNot = (n: number): string => (n === 1 ? "1 clip could not be read." : `${n} clips could not be read.`);
/** Every word of Auto (spec §5, §7). */
export const AUTO_WORDS = {
  done: "Auto enhance applied",
  good: "This clip already looks good.",
  /** Apply to All changed nothing (every clip already had its values): no step, no Undo. */
  nothing: (skipped: number): string => `Nothing to change${skipped === 0 ? "" : `. ${couldNot(skipped)}`}`,
  allFailed: "Could not look at these clips.",
  failed: "Could not look at this clip.",
  missing: "The file of this clip is missing.",
  looking: "Looking at this clip…",
  lookingAll: (at: number, of: number): string => `Looking at ${at} of ${of}…`,
  hint: "Auto sets the sliders from this clip's picture.",
  strength: "Auto · strength",
  /** `n`: the clips that were looked at and given their values (one already at them counts too). */
  allDone: (n: number, skipped: number): string =>
    `${n === 1 ? "Auto enhance applied to 1 clip" : `Auto enhance applied to ${n} clips`}${skipped === 0 ? "" : `. ${couldNot(skipped)}`}`,
} as const;

export type AutoBusy = null | { all: false } | { all: true; at: number; of: number };
export const sourceOf = (c: Clip): LookSource => ({ clipId: c.id, uri: c.sourceUri, kind: c.kind, from: c.trimStart, to: c.trimEnd });
/** The values Auto blends FROM: the remembered base while Auto's own values are on the clip (a second tap brings 100 % back), else today's. */
export function baseFor(c: Clip, target: AutoValues, applied: Applied | undefined): AutoValues {
  const now = valuesOf(c.adjust);
  return applied && autoStrengthOf(now, target, applied.base, applied.strength) !== null ? applied.base : now;
}
const say = (message: string, options?: MessageOptions) => useToast.getState().show(message, options);

/**
 * The Adjust strip's Auto. `run(clipId)`: the preview paused, ONE look (`lookAt`), then ONE `apply` that sets the five sliders,
 * said with Undo. `runAll()`: every MAIN clip in turn, one look at a time, then ONE `apply` for all. Only from a tap; stopped at
 * once (`stop`, closing the strip, another `clipId`, leaving) — a late answer is dropped, and so is one for a clip that changed.
 */
export function useAutoEnhance(clipId: string | null, visible: boolean): { busy: AutoBusy; run: (id: string) => Promise<void>; runAll: () => Promise<void>; stop: () => void } {
  const [busy, setBusy] = useState<AutoBusy>(null);
  const current = useRef<object | null>(null);
  const mounted = useRef(true);
  const stop = useCallback(() => {
    if (current.current === null) return;
    current.current = null;
    stopLooking();
    if (mounted.current) setBusy(null);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; current.current = null; stopLooking(); };
  }, []);
  useEffect(() => () => stop(), [clipId, visible, stop]);

  const run = useCallback(async (id: string): Promise<void> => {
    if (current.current !== null) return;
    if (!isFrameStatsAvailable()) { say(AUTO_TOOLS); return; }
    const st = useEditorStore.getState();
    const p = st.project;
    const c = p ? findItem(p, id)?.clip : undefined;
    if (!p || !c) return;
    if (st.missingSourceUris.includes(c.sourceUri)) { say(AUTO_WORDS.missing, { kind: "problem" }); return; }
    st.setPlaying(false);
    const mine = {};
    current.current = mine;
    setBusy({ all: false });
    try {
      const source = sourceOf(c);
      const answer = await lookAt(source);
      if (current.current !== mine || !mounted.current) return;
      if (answer.status === "cancelled" || answer.status === "busy") return;
      if (answer.status === "unavailable") { say(AUTO_TOOLS); return; }
      if (answer.status === "failed") { say(AUTO_WORDS.failed, { kind: "problem" }); return; }
      const now = useEditorStore.getState().project;
      const here = now && now.id === p.id ? findItem(now, id)?.clip : undefined;
      const key = lookKey(source);
      if (!now || !here || lookKey(sourceOf(here)) !== key) return;   // the clip changed meanwhile: dropped
      const base = baseFor(here, answer.target, useAutoLooks.getState().applied[key]);
      rememberApplied(key, { base, strength: 1 });
      const next = setClipAdjust(now, id, autoValues(answer.target, base, 1));
      if (next === now) return;   // already there (or nothing to change: the line says "already looks good")
      haptic("light");
      useEditorStore.getState().apply(() => next);
      say(AUTO_WORDS.done, { kind: "done", undo: true });   // one step, just applied
    } finally {
      if (current.current === mine) { current.current = null; if (mounted.current) setBusy(null); }
    }
  }, []);

  const runAll = useCallback(async (): Promise<void> => {
    if (current.current !== null) return;
    if (!isFrameStatsAvailable()) { say(AUTO_TOOLS); return; }
    const st = useEditorStore.getState();
    const p = st.project;
    if (!p || p.clips.length === 0) return;
    st.setPlaying(false);
    const mine = {};
    current.current = mine;
    const found: { id: string; key: string; target: AutoValues }[] = [];
    let skipped = 0;
    try {
      for (let i = 0; i < p.clips.length; i++) {
        if (current.current !== mine || !mounted.current) return;
        setBusy({ all: true, at: i + 1, of: p.clips.length });
        const c = p.clips[i];
        if (useEditorStore.getState().missingSourceUris.includes(c.sourceUri)) { skipped++; continue; }
        const answer = await lookAt(sourceOf(c));
        if (current.current !== mine || !mounted.current) return;
        if (answer.status === "cancelled" || answer.status === "busy") return;
        if (answer.status === "unavailable") { say(AUTO_TOOLS); return; }
        if (answer.status === "failed") { skipped++; continue; }
        found.push({ id: c.id, key: lookKey(sourceOf(c)), target: answer.target });
      }
      const now = useEditorStore.getState().project;
      if (!now || now.id !== p.id) return;
      let next = now;
      let done = 0;
      for (const f of found) {
        const here = now.clips.find((c) => c.id === f.id);
        if (!here || lookKey(sourceOf(here)) !== f.key) { skipped++; continue; }   // changed meanwhile: not touched
        const base = baseFor(here, f.target, useAutoLooks.getState().applied[f.key]);
        rememberApplied(f.key, { base, strength: 1 });
        next = setClipAdjust(next, f.id, autoValues(f.target, base, 1));
        done++;
      }
      if (done === 0) { say(AUTO_WORDS.allFailed, { kind: "problem" }); return; }
      if (next === now) { say(AUTO_WORDS.nothing(skipped)); return; }
      haptic("light");
      useEditorStore.getState().apply(() => next);
      say(AUTO_WORDS.allDone(done, skipped), { kind: "done", undo: true });   // one step for all, just applied
    } finally {
      if (current.current === mine) { current.current = null; if (mounted.current) setBusy(null); }
    }
  }, []);

  return { busy, run, runAll, stop };
}
```

(`findItem` is `src/editor/model/timeline.ts:245`. `setClipAdjust` already writes a main clip or a layer and rounds to the step; no op is added to `ops.ts`.)

- [ ] **Step 6: The strip.** Replace `src/editor/components/AdjustSheet.tsx` with (the existing chips, slider row, Reset and copy-to-all are kept exactly; `ADJUST_LABELS` stays exported):

```tsx
import { useState } from "react";
import { View } from "react-native";
import { isFrameStatsAvailable } from "@/modules/clipy-video/frameStats";
import { lookKey, setStrength, useAutoLooks } from "@/src/editor/autoLook";
import { autoState, autoValues, valuesOf } from "@/src/editor/model/autoEnhance";
import { resetClipAdjust, setAdjustForAllClips, setClipAdjust } from "@/src/editor/model/ops";
import { ADJUST_KEYS, ADJUST_RANGE, isNeutralAdjust, type AdjustKey } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { AUTO_WORDS, sourceOf, useAutoEnhance } from "@/src/editor/useAutoEnhance";
import { useIsLayer, useItemClip } from "@/src/editor/useItem";
import { AUTO_TOOLS } from "@/src/lib/buildInfo";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { haptic } from "@/src/ui/haptics";
import { QuietButton } from "@/src/ui/QuietButton";
import { Slider } from "@/src/ui/Slider";
import { Spinner } from "@/src/ui/Spinner";
import { Body } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";
import { STRIP, StripNote, StripSlider, StripTiles, ToolStrip } from "@/src/ui/ToolStrip";

export const ADJUST_LABELS: Record<AdjustKey, string> = {
  brightness: "Brightness", contrast: "Contrast", saturation: "Saturation", exposure: "Exposure", temperature: "Warmth", tint: "Tint",
  highlights: "Highlights", shadows: "Shadows", sharpen: "Sharpen", vignette: "Vignette", fade: "Fade", grain: "Grain",
};
/** 0: a two-sided control ticks lightly when a drag reaches or passes its centre. */
const CENTRE = [0] as const;
/** 100 %: Auto's strength at rest. */
const FULL = [1] as const;
/** Auto's row: in the slider row's place, as high (STRIP.slider). */
const ROW = { height: STRIP.slider, flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingHorizontal: theme.space.gutter } as const;
const step = (v: number): number => Math.round(v * 100) / 100 + 0;

export function AdjustSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const layer = useIsLayer(clipId);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const [key, setKey] = useState<AdjustKey | "auto">("brightness");
  const auto = useAutoEnhance(clip?.id ?? null, visible);
  const look = clip ? lookKey(sourceOf(clip)) : "";
  const target = useAutoLooks((s) => s.targets[look]);
  const applied = useAutoLooks((s) => s.applied[look]);
  if (!clip) return null;
  const state = target && applied ? autoState(valuesOf(clip.adjust), target, applied.base, applied.strength) : null;
  const picked = key === "auto";

  const pickAuto = () => {
    if (!isFrameStatsAvailable()) { useToast.getState().show(AUTO_TOOLS); return; }   // the chip is not picked; nothing changes
    haptic("light");
    setKey("auto");
    void auto.run(clip.id);
  };
  // Main clips only, as the copy-to-all is: a layer's Adjust offers no Apply to All.
  const autoAll = layer ? null : <QuietButton compact title="Apply to All" onPress={() => { haptic("light"); void auto.runAll(); }} />;

  const note = !picked || auto.busy || !state ? undefined
    : state.kind === "set" ? <StripNote lines={2} accessibilityLabel={state.line}>{state.line}</StripNote>
    : <StripNote lines={2}>{AUTO_WORDS.good}</StripNote>;

  const autoRow = () => {
    if (auto.busy) {
      const words = auto.busy.all ? AUTO_WORDS.lookingAll(auto.busy.at, auto.busy.of) : AUTO_WORDS.looking;
      return (
        <View testID="auto-row" style={ROW}>
          <Spinner label={words} />
          <Body muted numberOfLines={1} style={{ flex: 1, fontSize: theme.type.small }}>{words}</Body>
          <QuietButton compact title="Cancel" onPress={auto.stop} />
        </View>
      );
    }
    if (state?.kind === "set" && target && applied) {
      const set = (v: number) => {
        const at = step(v);
        setStrength(look, at);
        applyTransient((p) => setClipAdjust(p, clip.id, autoValues(target, applied.base, at)));
      };
      return (
        <StripSlider label={AUTO_WORDS.strength} value={`${Math.round(state.strength * 100)}%`} trailing={autoAll}>
          <Slider testID="auto-strength" minimumValue={0} maximumValue={1} step={0.01} value={state.strength}
            onSlidingStart={beginTransaction} onValueChange={set} onSlidingComplete={(v) => setStrength(look, step(v))} detents={FULL} />
        </StripSlider>
      );
    }
    return (
      <View testID="auto-row" style={ROW}>
        <Body muted numberOfLines={2} style={{ flex: 1, fontSize: theme.type.small }}>{AUTO_WORDS.hint}</Body>
        {autoAll}
      </View>
    );
  };

  const adjustKey = picked ? "brightness" : key;
  const [lo, hi] = ADJUST_RANGE[adjustKey];
  const value = clip.adjust[adjustKey];
  const pct = Math.round(value * 100);
  const neutral = isNeutralAdjust(clip.adjust);

  return (
    <ToolStrip visible={visible} onClose={onClose} title="Adjust" note={note}
      // "Apply to all" writes the main clips: it is not offered for a layer. While Auto is picked it is Auto's, in the row below.
      action={layer || picked ? undefined : { label: "Apply to All", onPress: () => { haptic("light"); apply((p) => setAdjustForAllClips(p, clip.adjust)); } }}>
      <StripTiles>
        <Chip key="auto" label="Auto" icon="color-wand-outline" selected={picked} onPress={pickAuto} />
        {ADJUST_KEYS.map((k) => (
          <Chip key={k} label={clip.adjust[k] !== 0 ? `${ADJUST_LABELS[k]} •` : ADJUST_LABELS[k]} accessibilityLabel={ADJUST_LABELS[k]} selected={key === k} onPress={() => setKey(k)} />
        ))}
      </StripTiles>
      {picked ? autoRow() : (
        <StripSlider label={ADJUST_LABELS[adjustKey]} value={`${lo < 0 && pct > 0 ? "+" : ""}${pct}`}
          trailing={<QuietButton compact title="Reset" disabled={neutral} onPress={() => { haptic("light"); apply((p) => resetClipAdjust(p, clip.id)); }} />}>
          <Slider
            testID="adjust-slider"
            minimumValue={lo} maximumValue={hi} step={0.01}
            value={value}
            onSlidingStart={beginTransaction}
            onValueChange={(v) => applyTransient((p) => setClipAdjust(p, clip.id, { [adjustKey]: v }))}
            detents={lo < 0 ? CENTRE : undefined}
          />
        </StripSlider>
      )}
    </ToolStrip>
  );
}
```

Note: `ADJUST_LABELS` is now imported by `autoEnhance.test.ts` from this component; keep it exported here (no move).

- [ ] **Step 7: Run** the new strip test, `AdjustSheet.test.tsx`, `strips.params.test.tsx`, `strips.polish.test.tsx`, `strips.layout.test.tsx`, `textScale.editor.test.tsx`, the guards (`noHexLiterals`, `casing.guard`, `spacingScale`, `systemFont.guard`, `textScale.guard`, `palette.guard`, `kitSlider`, `outlineIcons`, `sfSymbols.map`) — all pass with no edit to an existing test. If `textScale.guard.test.ts` or `spacingScale.test.ts` names AdjustSheet.tsx or Chip.tsx with a count, the new code must FIT that count (no new `fit`, no new `scale="fixed"`, no number outside `theme.space`) — never raise a table.

- [ ] **Step 8: Checks** (typecheck, full test; suites + 2). **Commit:**

```powershell
git add src/ui/Chip.tsx src/ui/__tests__/Chip.icon.test.tsx src/editor/useAutoEnhance.ts src/editor/components/AdjustSheet.tsx src/editor/__tests__/AdjustSheet.auto.test.tsx
git commit -m "editor: Auto in the Adjust strip — one tap sets the sliders, a strength, a line, Apply to All" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Docs

**Files:** `AGENTS.md`, `docs/next-build-phone-checklist.md`, `docs/superpowers/specs/2026-10-17-auto-enhance-design.md` ("As built").

- [ ] **Step 1: AGENTS.md.** (a) In the Messages line's list of `undo: true` cases (`today: Cut to Beats, …, Remove pauses`) add `, Auto enhance (the tap, and Apply to All)`. (b) A new line after "Remove pauses":

```
- Auto enhance (the "auto enhance" build, 2026-10-17; top row of `LEVELS`, known by `isFrameStatsAvailable()`; spec `docs/superpowers/specs/2026-10-17-auto-enhance-design.md`, phone checklist part P): the Adjust strip's FIRST chip `Auto` (the kit `Chip`'s optional `icon`, `color-wand-outline`). It SETS ORDINARY ADJUST SLIDERS ONLY — `exposure` −0.20…+0.30, `contrast` −0.10…+0.20, `saturation` −0.10…+0.20, `temperature` (Warmth) ±0.15, `tint` ±0.10 (`AUTO_KEYS`, `AUTO.limits`), through `setClipAdjust`: no schema change, no look maths, `adjust.ts` ↔ `Adjust.swift` untouched, the export request unchanged. The phone only COUNTS: native `frameStats({ jobId, uri, kind, times, maxSide })` → `{ frames: [{ time, histogram (64 bins of Rec. 709 luma on gamma sRGB, counts), r, g, b, saturation (mean max − min), pixels }], failed }` (`FrameStats.swift`: `AVAssetImageGenerator` upright, ±0.25 s, the iOS 16 `image(at:)`; a photo by ImageIO with its orientation; drawn ONCE by Core Graphics into 8-bit sRGB and counted in Swift — no Core Image; asked in the background or with the app away during it → `E_STATS_INTERRUPTED`, never part of `interruptCopies`), wrapped ONLY in `modules/clipy-video/frameStats.ts` (imported by its own path). WHAT to set is `src/editor/model/autoEnhance.ts` (TypeScript only, no Swift twin, tunable without a build; vectors in `autoEnhance.vectors.ts` — never edit one to pass). `src/editor/autoLook.ts` is the only caller of `frameStats` / `cancelFrameStats`: one look at a time, `AUTO_DEADLINE_MS` by `activeTimeout`, an interrupted look asked again in front (`AUTO_RETRIES`), `stopLooking()`; what it found and what was applied (`base`, `strength`) are remembered for the SESSION in `useAutoLooks` by `lookKey` (clip id + file + trim) — never in the project, the undo history or on disk. The tap: the preview paused, ONE `apply`, "Auto enhance applied" with Undo; the strength slider (kit `Slider`, `applyTransient` per drag = one step) rescales FROM the base (0 % = the clip before Auto) and shows ONLY while `autoState` says the clip's values are Auto's (a hand-moved slider, Undo of the tap or another trim → gone). While Auto is picked the strip's slider row is Auto's (status + Cancel / strength + Apply to All / the hint) and the header has no action — its note is the line (`autoLine`, two lines, no `fit`); STRIP is unchanged. Apply to All (main clips only, never layers): one look per clip in turn ("Looking at 3 of 8…", Cancel = nothing applied), a failed or missing clip skipped and counted, ONE `apply`. Without the build the chip shows and a tap says `AUTO_TOOLS`. Only a phone can show (checklist part P): the numbers on real clips, HDR video, the line on a 375-pt phone.
```

- [ ] **Step 2: The phone checklist** — append part P to `docs/next-build-phone-checklist.md`, numbering on from the last check of part O (read the file; if O ends at 73, start at 74):

```
## P. Auto enhance

### 74. A dark clip
Select a dark video clip (filmed indoors at night) → **Adjust** → **Auto** (the first chip, with a wand).
- **Right looks like:** a moment of "Looking at this clip…", then the picture is brighter and a little punchier; the top of the
  strip says what was set ("Set exposure +…, contrast +…"); the message bar says "Auto enhance applied" with **Undo**; the chips
  that changed have a dot. Tap Exposure: its slider shows the same number as the line.
- **Wrong looks like:** the picture much too bright or grey, numbers above +30, or nothing happening.

### 75. Bright, flat and colour-cast clips
Try Auto on an over-bright clip, a misty / flat one, one filmed under blue light (or in shade), one under orange lamps.
- **Right looks like:** bright gets a little darker, flat gets more contrast and colour, blue gets warmer, orange a little cooler.
  Write down any clip where Auto made it WORSE, with what the line said.

### 76. A good clip and a photo
Auto on a clip that already looks fine; then on a photo.
- **Right looks like:** the fine clip: "This clip already looks good." and nothing changes (no Undo offered). The photo: the
  same as a video, at once.

### 77. Strength
After Auto, drag **Auto · strength** to 50 %, then to 0 %.
- **Right looks like:** the picture moves back towards how it was; at 0 % it is exactly as before Auto. Undo once: back to the
  strength before the drag. Undo again: Auto is gone and so is the strength slider. Move Contrast by hand: the strength slider
  goes (it never shows stale numbers).

### 78. Apply to All
With several clips (videos and photos), Auto on one, then **Apply to All**.
- **Right looks like:** "Looking at 2 of 5…" counting up, then each clip gets its own numbers (a dark one more light than a
  bright one), and ONE Undo takes all of them back. Start it again and tap **Cancel**: nothing changes.

### 79. The old build and Expo Go
In Expo Go (or a build from before this one) tap Auto.
- **Right looks like:** "Automatic adjustments need the latest Clipy build. Install it from the newest build link." and nothing
  changes. Accounts → Build says "Auto enhance" on the new build.

### 80. Leaving the app mid-look
Tap Apply to All on many clips and press the Home button at once; come back after a few seconds.
- **Right looks like:** it carries on (or finishes) once you are back, with no error; the result is the same as without leaving.

### 81. HDR video
Auto on a video filmed in HDR (the iPhone's default since the 12).
- **Right looks like:** sensible numbers, like an ordinary clip. Write down the line if it looks far off.
```

- [ ] **Step 3: The spec's "As built"** — replace "(Filled in after the build.)" with what was built and anything that differed from §1–§8 (file names, constants, test counts).

- [ ] **Step 4: Checks** (typecheck, full test — no change in counts). **Commit:**

```powershell
git add AGENTS.md docs/next-build-phone-checklist.md docs/superpowers/specs/2026-10-17-auto-enhance-design.md
git commit -m "docs: Auto enhance — AGENTS line, phone checklist part P, as built" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review (done when writing this plan)

- **Spec coverage.** §1 keys / limits → Task 2 (`AUTO.limits`, the limits test). §2 native → Task 1 (Swift, wrapper, module, background, LEVELS, three pins). §3 maths and vectors → Task 2 (every vector computed with the very code in Step 4). §4 undo / strength / memory → Tasks 3 (memory) and 4 (one step, `applyTransient`, `autoState` gating, Undo / Redo walk). §5 look → Task 3 (one at a time, deadline, retry, stop) and 4 (pause, cancel on close / selection / leave, late answers dropped, Apply to All). §6 old builds → Task 4 test 2. §7 strip → Task 4 (STRIP unchanged, header action moved into the row, note). §8 → Global Constraints.
- **Placeholders.** None: every file has its code; the only "read first" is the checklist's numbering (part O's last check).
- **Type consistency.** `FrameStat` / `FrameStatsRequest` (frameStats.ts) are what `autoEnhance.ts`, `autoLook.ts` and the vectors use; `LookSource.kind` is `ClipKind` ("video" | "photo"); `AutoValues` keys = `AUTO_KEYS` ⊂ `AdjustKey`; `setClipAdjust(p, id, Partial<ClipAdjust>)` accepts `AutoValues`.
- **Risks noted for the implementer.** `0.51` in `autoStrengthOf` is deliberate (rounding): the hint wins while it matches. The RNTL slider mock fires `onSlidingComplete` on `touchEnd`. `findItem` returns `{ clip, layer }`. The AdjustSheet's `ADJUST_LABELS` import into a model test creates a test-only dependency from model to component — acceptable (tests only); do not import it into `autoEnhance.ts`.
