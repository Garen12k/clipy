const mockNative: { module: Record<string, unknown> | null } = { module: null };
jest.mock("expo-modules-core", () => ({ ...jest.requireActual("expo-modules-core"), requireOptionalNativeModule: jest.fn(() => mockNative.module) }));
import { addBackgroundExportListener, backgroundExportSupport, beginBackgroundExport, endBackgroundExport, EXPORT_INTERRUPTED, isBackgroundExportBuild, reportBackgroundExport } from "../background";

const full = () => ({
  backgroundExportSupport: jest.fn(() => ({ os: "27.0", continued: true, gpu: false })),
  beginBackgroundExport: jest.fn(async () => ({ grace: true, continued: true, reason: "" })),
  reportBackgroundExport: jest.fn(), endBackgroundExport: jest.fn(),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
});
/** A build from before "background export": the module with its older functions only. */
const older = () => ({ hello: jest.fn(), exportTimeline: jest.fn(), cancelExport: jest.fn(), addListener: jest.fn(), soundPeaks: jest.fn() });

test("the build is known by the presence of backgroundExportSupport", () => {
  mockNative.module = null;
  expect(isBackgroundExportBuild()).toBe(false);
  mockNative.module = older();
  expect(isBackgroundExportBuild()).toBe(false);
  mockNative.module = full();
  expect(isBackgroundExportBuild()).toBe(true);
  expect(EXPORT_INTERRUPTED).toBe("interrupted");
});

test("on an older build, and in Expo Go, NOTHING is called and every answer is the not-there one", async () => {
  for (const m of [null, older()]) {
    mockNative.module = m;
    expect(backgroundExportSupport()).toBeNull();
    await expect(beginBackgroundExport("r", "Exporting x", "1080p")).resolves.toBeNull();
    expect(() => { reportBackgroundExport("r", 0.5); endBackgroundExport("r", true); }).not.toThrow();
    expect(addBackgroundExportListener(() => {})).toBeNull();
    if (m) for (const fn of Object.values(m)) expect(fn).not.toHaveBeenCalled();
  }
});

test("on the build: the calls go through with their arguments, and the readout is three plain values", async () => {
  const m = full();
  mockNative.module = m;
  expect(backgroundExportSupport()).toEqual({ os: "27.0", continued: true, gpu: false });
  await expect(beginBackgroundExport("r1", "Exporting Beach day", "1080p")).resolves.toEqual({ grace: true, continued: true, reason: "" });
  expect(m.beginBackgroundExport).toHaveBeenCalledWith("r1", "Exporting Beach day", "1080p");
  reportBackgroundExport("r1", 0.25);
  expect(m.reportBackgroundExport).toHaveBeenCalledWith("r1", 0.25);
  endBackgroundExport("r1", true);
  expect(m.endBackgroundExport).toHaveBeenCalledWith("r1", true);
  const cb = jest.fn();
  expect(addBackgroundExportListener(cb)).not.toBeNull();
  expect(m.addListener).toHaveBeenCalledWith("onBackgroundExportEvent", cb);
});

test("a phone that throws or rejects never breaks the export", async () => {
  const m = full();
  m.backgroundExportSupport.mockImplementation(() => { throw new Error("no"); });
  m.beginBackgroundExport.mockRejectedValue(new Error("not permitted"));
  m.reportBackgroundExport.mockImplementation(() => { throw new Error("gone"); });
  m.endBackgroundExport.mockImplementation(() => { throw new Error("gone"); });
  m.addListener.mockImplementation(() => { throw new Error("no events"); });
  mockNative.module = m;
  expect(backgroundExportSupport()).toBeNull();
  await expect(beginBackgroundExport("r", "t", "s")).resolves.toBeNull();
  expect(() => { reportBackgroundExport("r", 1); endBackgroundExport("r", false); }).not.toThrow();
  expect(addBackgroundExportListener(() => {})).toBeNull();
});
