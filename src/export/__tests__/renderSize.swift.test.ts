import { readFileSync } from "fs";
import { join } from "path";
import { ASPECT_LIMITS, ASPECT_RATIOS, frameAspect, makeClip, makeProject } from "@/src/editor/model/types";
import { MAX_MACROBLOCKS, RESOLUTIONS, renderSize } from "../estimate";

/** The Swift is never compiled here: these checks pin the render-size pieces that must stay in step with the TypeScript. */
const ios = join(__dirname, "../../../modules/clipy-video/ios");
const read = (f: string) => readFileSync(join(ios, f), "utf8").replace(/\r\n/g, "\n");
const code = read("ExportSession.swift").replace(/\/\/[^\n]*/g, "");   // without comments
const tests = read("Tests/ExportSessionTests.swift");

/** The first clip Auto reads in this table: a 4032 × 3024 photo-shaped clip (4:3). */
const project = (id: (typeof ASPECT_RATIOS)[number]) => makeProject({ aspectRatio: id, clips: [makeClip({ id: "a", sourceDuration: 4, width: 4032, height: 3024 })] });
const size = (id: (typeof ASPECT_RATIOS)[number], res: number) => { const s = renderSize(frameAspect(project(id)), res); return [s.width, s.height]; };

test("the three ratios that existed before give exactly the sizes they always gave", () => {
  expect([720, 1080, 2160].map((r) => size("9:16", r))).toEqual([[720, 1280], [1080, 1920], [2160, 3840]]);
  expect([720, 1080, 2160].map((r) => size("1:1", r))).toEqual([[720, 720], [1080, 1080], [2160, 2160]]);
  expect([720, 1080, 2160].map((r) => size("16:9", r))).toEqual([[1280, 720], [1920, 1080], [3840, 2160]]);
});

test("every ratio at every resolution: the short side is the resolution, both sides are even", () => {
  const table = Object.fromEntries(ASPECT_RATIOS.map((id) => [id, RESOLUTIONS.map((r) => size(id, r.value).join("x"))]));
  expect(table).toEqual({
    "auto": ["960x720", "1440x1080", "2880x2160"],     // the 4:3 first clip
    "1:1": ["720x720", "1080x1080", "2160x2160"],
    "3:2": ["1080x720", "1620x1080", "3240x2160"],
    "2:3": ["720x1080", "1080x1620", "2160x3240"],
    "16:9": ["1280x720", "1920x1080", "3840x2160"],
    "9:16": ["720x1280", "1080x1920", "2160x3840"],
    "4:3": ["960x720", "1440x1080", "2880x2160"],
    "3:4": ["720x960", "1080x1440", "2160x2880"],
    "21:9": ["1680x720", "2520x1080", "4672x2002"],    // 5040 × 2160 is more than the H.264 encoder takes: scaled down, same shape
  });
  for (const id of ASPECT_RATIOS) for (const r of RESOLUTIONS) {
    const [w, h] = size(id, r.value);
    expect(w % 2).toBe(0); expect(h % 2).toBe(0);
    expect(Math.ceil(w / 16) * Math.ceil(h / 16)).toBeLessThanOrEqual(MAX_MACROBLOCKS);
    if (!(id === "21:9" && r.value === 2160)) expect(Math.min(w, h)).toBe(r.value);
    expect(w / h).toBeCloseTo(frameAspect(project(id)), 2);
  }
});

test("any Auto shape gives even sizes inside the encoder's limit; junk is a square", () => {
  for (let a = ASPECT_LIMITS[0]; a <= ASPECT_LIMITS[1]; a += 0.0137) for (const r of RESOLUTIONS) {
    const { width, height } = renderSize(a, r.value);
    expect(width % 2).toBe(0); expect(height % 2).toBe(0);
    expect(Math.ceil(width / 16) * Math.ceil(height / 16)).toBeLessThanOrEqual(MAX_MACROBLOCKS);
    expect(width >= height).toBe(a >= 1);
  }
  for (const bad of [0, -1, NaN, Infinity]) expect(renderSize(bad, 1080)).toEqual({ width: 1080, height: 1080 });
  expect(renderSize(1080 / 1920, 1080)).toEqual({ width: 1080, height: 1920 });
  expect(renderSize(1920 / 1080, 720)).toEqual({ width: 1280, height: 720 });
});

test("the Swift tests assert this same table, cell by cell", () => {
  const rows = [...tests.matchAll(/\("([^"]+)", (\d+), (\d+), (\d+)\),/g)].map((m) => [m[1], Number(m[2]), Number(m[3]), Number(m[4])]);
  const fixed = ASPECT_RATIOS.filter((id) => id !== "auto");
  expect(rows).toEqual(fixed.flatMap((id) => RESOLUTIONS.map((r) => [id, r.value, ...size(id, r.value)])));
  expect(rows).toHaveLength(24);
  // Auto: the number decides. The same four first clips the README lists, at 1080.
  const auto = [...tests.matchAll(/\(frameAspect: ([\d.]+), (\d+), (\d+), (\d+)\),/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]);
  expect(auto).toEqual([[0.5625, 1080, 1080, 1920], [1.777778, 1080, 1920, 1080], [1.333333, 1080, 1440, 1080], [2.333333, 1080, 2520, 1080], [2.333333, 2160, 4672, 2002], [1.333333, 720, 960, 720]]);
  for (const [a, res, w, h] of auto) expect(renderSize(a, res)).toEqual({ width: w, height: h });
});

test("the engine's render size is the same rule, with the same limits", () => {
  expect(code).toMatch(/@Field var aspectRatio: String = "9:16"/);
  expect(code).toMatch(/@Field var frameAspect: Double = 0\b/);
  expect(code).toContain("static let aspectLimits: (min: Double, max: Double) = (9.0 / 21.0, 21.0 / 9.0)");
  expect(ASPECT_LIMITS).toEqual([9 / 21, 21 / 9]);
  expect(read("MediaPrePass.swift")).toMatch(new RegExp(`static let maxMacroblocks = ${String(MAX_MACROBLOCKS).replace(/(\d)(?=(\d{3})+$)/g, "$1_")}\\b`));
  expect(code).toContain("static func renderSize(aspect: Double, resolution: Int) -> CGSize {");
  expect(code).toContain("let a = aspect.isFinite && aspect > 0 ? aspect : 1");
  expect(code).toContain("let ratio = max(a, 1 / a)");
  expect(code).toContain("func even(_ v: Double) -> Int { max(2, Int((v / 2).rounded()) * 2) }");
  expect(code).toContain("func macroblocks(_ w: Int, _ h: Int) -> Int { ((w + 15) / 16) * ((h + 15) / 16) }");
  expect(code).toContain("while macroblocks(long, short) > MediaPrePass.maxMacroblocks && short > 2 { short -= 2; long = even(Double(short) * ratio) }");
  expect(code).toContain("return a >= 1 ? CGSize(width: long, height: short) : CGSize(width: short, height: long)");
  // The request: a "w:h" string is that ratio; anything else ("auto") uses the number; neither → a square, as before.
  expect(code).toContain("let renderSize = Self.renderSize(aspect: Self.aspectValue(aspect: request.aspectRatio, frameAspect: request.frameAspect), resolution: request.resolution)");
  expect(code).not.toMatch(/case "9:16"|case "16:9"|aspect == "/);   // no code switches on the old ids any more
});
