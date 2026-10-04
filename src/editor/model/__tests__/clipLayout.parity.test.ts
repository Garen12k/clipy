import { readFileSync } from "fs";
import { join } from "path";
import { MASK } from "../types";
import { MASK_VECTORS, PLACE_VECTORS } from "./clipLayout.vectors";

const iosDir = join(__dirname, "../../../../modules/clipy-video/ios");
const swift = readFileSync(join(iosDir, "ClipLayout.swift"), "utf8");
const table = readFileSync(join(iosDir, "Tests/ClipLayoutTests.swift"), "utf8");

/** Numbers are written in Swift exactly as JS prints them (the vectors are plain literals), e.g. 3413.3333333, -0.2, 1080. */
const fmt = (n: number) => String(n);
const swiftNumber = (name: string): number => {
  const m = swift.match(new RegExp(`static let ${name}(?::\\s*\\w+)?\\s*=\\s*(-?[0-9.]+)`));
  if (!m) throw new Error(`ClipLayout.swift: ${name} not found`);
  return Number(m[1]);
};
/** The Swift table entry for one vector: from its `name: "..."` up to the next entry (or the end of the table). */
const entry = (name: string): string => {
  const start = table.indexOf(`name: "${name}"`);
  if (start < 0) throw new Error(`ClipLayoutTests.swift: vector "${name}" not found`);
  const next = table.indexOf("name: \"", start + 1);
  return table.slice(start, next < 0 ? undefined : next);
};

test("ClipLayout.swift uses the same tolerances as clipLayout.ts", () => {
  expect(swiftNumber("quarterTurnTolerance")).toBe(1);
  expect(swiftNumber("straightAngleTolerance")).toBe(0.5);
  expect(swiftNumber("coverageEpsilon")).toBe(0.5);
});

test("ClipLayout.swift uses the same rounded-mask radius as MASK.roundedRadius", () => {
  expect(swiftNumber("maskRoundedRadius")).toBe(MASK.roundedRadius);
});

/** The text of one `static func` in ClipLayout.swift, up to the next declaration. */
const swiftBody = (fn: string): string => {
  const start = swift.indexOf(`static func ${fn}(`);
  if (start < 0) throw new Error(`ClipLayout.swift: ${fn} not found`);
  const next = swift.slice(start + 1).search(/\n\s*(static |\/\/\/|\}\n)/);
  return next < 0 ? swift.slice(start) : swift.slice(start, start + 1 + next);
};

test("the tolerances are used where clipLayout.ts uses them", () => {
  expect(swiftBody("isQuarterTurn")).toMatch(/quarterTurnTolerance/);
  expect(swiftBody("coversFrame")).toMatch(/straightAngleTolerance/);
  expect(swiftBody("coversFrame")).toMatch(/coverageEpsilon/);
  expect(swiftBody("coversFrame")).not.toMatch(/0\.5/);
  expect(swiftBody("maskRadius")).toMatch(/maskRoundedRadius \* side/);
  expect(swiftBody("maskRadius")).toMatch(/side \/ 2/);
  expect(swiftBody("maskRadius")).not.toMatch(/0\.12/);
});

test("ClipLayout.swift mirrors every clipLayout.ts function (except the TS-only snapping)", () => {
  for (const fn of ["isQuarterTurn", "croppedSize", "coverFactor", "fitScale", "placeClip", "maskRadius", "coversFrame"]) {
    expect(swift).toMatch(new RegExp(`static func ${fn}\\(`));
  }
});

describe("the Swift test table embeds every PLACE_VECTORS case", () => {
  it("has the same number of cases", () => {
    expect([...table.matchAll(/PlaceVector\(\s*name: "/g)]).toHaveLength(PLACE_VECTORS.length);
  });
  it.each(PLACE_VECTORS.map((v) => [v.name, v] as const))("%s", (name, v) => {
    const e = entry(name);
    const [inputs, expected] = e.split("expect:");
    expect(expected).toBeDefined();
    expect(inputs).toContain(`source: CGSize(width: ${fmt(v.source.width)}, height: ${fmt(v.source.height)})`);
    expect(inputs).toContain(`crop: ClipCrop(x: ${fmt(v.crop.x)}, y: ${fmt(v.crop.y)}, w: ${fmt(v.crop.w)}, h: ${fmt(v.crop.h)})`);
    const t = v.transform;
    expect(inputs).toContain(`transform: ClipTransform(scale: ${fmt(t.scale)}, x: ${fmt(t.x)}, y: ${fmt(t.y)}, rotation: ${fmt(t.rotation)}, flipH: ${t.flipH}, flipV: ${t.flipV})`);
    expect(inputs).toContain(`frame: CGSize(width: ${fmt(v.frame[0])}, height: ${fmt(v.frame[1])})`);
    const p = v.expect;
    expect(expected).toContain(
      `ClipPlacement(width: ${fmt(p.width)}, height: ${fmt(p.height)}, centerX: ${fmt(p.centerX)}, centerY: ${fmt(p.centerY)}, rotation: ${fmt(p.rotation)}, flipH: ${p.flipH}, flipV: ${p.flipV})`,
    );
  });
});

describe("the Swift test table embeds every MASK_VECTORS case", () => {
  it("has the same number of cases", () => {
    expect([...table.matchAll(/MaskVector\(name: "/g)]).toHaveLength(MASK_VECTORS.length);
  });
  it.each(MASK_VECTORS.map((v) => [v.name, v] as const))("%s", (name, v) => {
    expect(table).toContain(
      `MaskVector(name: "${name}", width: ${fmt(v.placed.width)}, height: ${fmt(v.placed.height)}, mask: "${v.mask}", expect: ${fmt(v.expect)})`,
    );
  });
  it("the vectors are run against ClipLayout.maskRadius", () => {
    expect(table).toMatch(/ClipLayout\.maskRadius\(v\.width, v\.height, v\.mask\)/);
  });
});
