import { readFileSync } from "fs";
import { join } from "path";
import { DEFAULT_EXPORT_SETTINGS, EXPORT_FPS } from "@/src/editor/model/types";

/** The Swift is never compiled here: these checks pin the export-option pieces that must stay in step with the TypeScript. */
const session = readFileSync(join(__dirname, "../../../modules/clipy-video/ios/ExportSession.swift"), "utf8").replace(/\r\n/g, "\n");
const code = session.replace(/\/\/[^\n]*/g, "");   // without comments, so a name in a comment never satisfies a check

test("the engine knows exactly the frame rates the app offers, and the same default", () => {
  const list = /static let frameRates: \[Int32\] = \[([^\]]*)\]/.exec(code);
  expect(list?.[1].split(",").map((s) => Number(s.trim()))).toEqual([...EXPORT_FPS]);
  expect(code).toMatch(new RegExp(`static let frameRate: Int32 = ${DEFAULT_EXPORT_SETTINGS.fps}\\n`));
  expect(code).toMatch(new RegExp(`@Field var fps: Int = ${DEFAULT_EXPORT_SETTINGS.fps}\\b`));
  expect(code).toMatch(/@Field var bitrate: Double = 0\b/);
});

test("the request's frame rate drives the composition; a bitrate above 0 becomes a file-length limit behind one switch", () => {
  expect(code).toContain("let fps = Self.frameRate(for: request.fps)");
  expect(code).toContain("videoComposition.frameDuration = CMTime(value: 1, timescale: fps)");
  expect(code).not.toContain("videoComposition.frameDuration = CMTime(value: 1, timescale: ExportSession.frameRate)");
  expect(code).toContain("static let limitsFileLength = true");
  expect(code).toContain("static let audioAllowance: Double = 256_000");
  expect(code).toContain("let seconds = CMTimeGetSeconds(composition.duration)");
  expect(code).toContain("if let limit = Self.fileLengthLimit(bitrate: request.bitrate, seconds: seconds) { session.fileLengthLimit = limit }");
});

test("the default request (30 fps, bitrate 0) takes today's path: 30 fps frame duration, no file-length limit", () => {
  // The record's defaults are the default request; `frameRate(for: 30)` is 30, so the frame duration is CMTime(1, 30) as before.
  expect(code).toMatch(/@Field var fps: Int = 30\b/);
  expect(code).toMatch(/@Field var bitrate: Double = 0\b/);
  expect(code).toMatch(/return frameRates\.contains\(rate\) \? rate : frameRate\b/);
  // The limit is assigned in exactly one place, and that place is skipped when the bitrate is not above 0.
  expect(code.match(/\.fileLengthLimit = /g)).toHaveLength(1);
  expect(code).toMatch(/guard limitsFileLength, bitrate\.isFinite, seconds\.isFinite, bitrate > 0, seconds > 0 else \{ return nil \}/);
});
