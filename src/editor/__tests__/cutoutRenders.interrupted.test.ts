jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { projectDir: (id: string) => `file:///doc/projects/${id}` } }));
jest.mock("@/src/projects/expoFs", () => ({ expoFs: { exists: jest.fn(async () => false), mkdir: jest.fn(async () => {}), list: jest.fn(async () => []), remove: jest.fn(async () => {}) } }));
jest.mock("@/modules/clipy-video", () => ({
  isCutoutAvailable: jest.fn(() => true), renderCutout: jest.fn(), cancelCutout: jest.fn(), addCutoutListener: jest.fn(() => ({ remove() {} })),
  isNativeAvailable: jest.fn(() => true), isSoundAvailable: jest.fn(() => true), isSpeechAvailable: jest.fn(() => true),
  CUTOUT_CANCELLED: "E_CUTOUT_CANCELLED",
  isCutoutCancelled: (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "E_CUTOUT_CANCELLED",
}));
import { readFileSync } from "fs";
import { join } from "path";
import { AppState, type AppStateStatus } from "react-native";
import { renderCutout } from "@/modules/clipy-video";
import { isRenderInterrupted, saysInterrupted } from "@/modules/clipy-video/background";
import { neededCutouts } from "@/src/editor/model/cutout";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { newId } from "@/src/lib/id";
import { useToast } from "@/src/ui/Toast";
import { knownCopies, useCutoutFiles } from "../cutoutFiles";
import { CUTOUT_SETTLE_MS, openCutouts, resetCutouts, syncCutouts } from "../cutoutRenders";

const render = jest.mocked(renderCutout);
const DIR = "file:///doc/projects/p1/cutout";
const NAME = "abc-c1-2000-12000.mov";
const clip = makeClip({ id: "a", sourceDuration: 30, sourceUri: "file:///doc/projects/p1/media/abc.mov", trimStart: 4.2, trimEnd: 9.7, cutout: true });
const files = () => useCutoutFiles.getState().files;
const tick = async (n = 40) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const interrupted = () => Object.assign(new Error("cutout interrupted: Clipy was in the background while the copy was made"), { code: "E_CUTOUT_INTERRUPTED" });
let heard: ((s: AppStateStatus) => void)[] = [];
const app = (now: AppStateStatus) => {
  Object.defineProperty(AppState, "currentState", { configurable: true, get: () => now });
  for (const cb of [...heard]) cb(now);
};

beforeEach(() => {
  jest.clearAllMocks();
  render.mockReset();
  let n = 0;
  jest.mocked(newId).mockImplementation(() => `job-${++n}`);
  heard = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, cb: (s: AppStateStatus) => void) => { heard.push(cb); return { remove: () => { heard = heard.filter((l) => l !== cb); } }; }) as never);
  app("active");
  resetCutouts();
  useToast.getState().clear();
  useEditorStore.getState().reset();
  jest.useFakeTimers();
});
afterEach(async () => { resetCutouts(); jest.runOnlyPendingTimers(); await tick(); jest.useRealTimers(); jest.restoreAllMocks(); app("active"); });

test("a copy that was interrupted by leaving Clipy is not a failure: nothing is said, and it is made again once Clipy is in front", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [clip] }));
  await openCutouts("p1");
  let stop: (e: unknown) => void = () => {};
  render.mockImplementationOnce(() => new Promise((_, reject) => { stop = reject; }));
  render.mockResolvedValueOnce({ fileUri: `${DIR}/${NAME}`, seconds: 11, frames: 240, person: 0.3 });
  syncCutouts("p1", neededCutouts(useEditorStore.getState().project!, [], knownCopies(files())));
  jest.advanceTimersByTime(CUTOUT_SETTLE_MS);
  await tick();
  expect(render).toHaveBeenCalledTimes(1);

  app("background");
  stop(interrupted());
  await tick();
  expect(files()[NAME]).toBeUndefined();                       // not failed, not busy: simply not made yet
  expect(useToast.getState().message).toBeNull();
  expect(render).toHaveBeenCalledTimes(1);                     // and nothing is asked of the phone while Clipy is away

  app("active");
  await tick();
  expect(render).toHaveBeenCalledTimes(2);
  expect(files()[NAME]).toEqual({ status: "ready", uri: `${DIR}/${NAME}` });
});

test("an interruption is known by its code, and by its words through what a preparation puts before them", () => {
  expect(isRenderInterrupted(interrupted())).toBe(true);
  expect(isRenderInterrupted(Object.assign(new Error("x"), { code: "E_STEADY_INTERRUPTED" }))).toBe(true);
  expect(isRenderInterrupted(Object.assign(new Error("x"), { code: "E_CUTOUT_CANCELLED" }))).toBe(false);
  expect(isRenderInterrupted(Object.assign(new Error("x"), { code: "E_CUTOUT" }))).toBe(false);
  expect(isRenderInterrupted(new Error("x"))).toBe(false);
  expect(isRenderInterrupted(null)).toBe(false);
  expect(saysInterrupted("export interrupted: The operation could not be completed")).toBe(true);
  expect(saysInterrupted("Could not remove a background for the export: cutout interrupted: Clipy was in the background while the copy was made")).toBe(true);
  expect(saysInterrupted("steady interrupted: Clipy was in the background while the copy was made (steady write: x)")).toBe(true);
  expect(saysInterrupted("cutout write: the recording was interrupted")).toBe(false);
  expect(saysInterrupted("Not enough free space on this iPhone for the export.")).toBe(false);
});

test("the steady queue treats an interrupted copy the same way", () => {
  for (const file of ["cutoutRenders.ts", "steadyRenders.ts"]) {
    const src = readFileSync(join(__dirname, "..", file), "utf8");
    expect(src).toContain("if (isRenderInterrupted(e)) { setFile(next.name, null); await untilActive(); continue; }");
  }
});
