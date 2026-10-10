jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: () => "job-1" }));
jest.mock("@/src/projects", () => ({ storage: { projectDir: (id: string) => `file:///doc/projects/${id}` } }));
jest.mock("@/src/projects/expoFs", () => ({ expoFs: { exists: jest.fn(async () => false), mkdir: jest.fn(async () => {}), list: jest.fn(async () => []), remove: jest.fn(async () => {}) } }));
jest.mock("@/modules/clipy-video", () => ({
  isSoundAvailable: () => true, renderSound: jest.fn(() => new Promise(() => {})), cancelSoundRender: jest.fn(),
  isNoiseBuild: () => true, isNoiseAvailable: () => true, addSoundListener: jest.fn(() => ({ remove() {} })),
  SOUND_CANCELLED: "E_SOUND_CANCELLED", isSoundCancelled: () => false,
}));
import { readFileSync } from "fs";
import { join } from "path";
import { AppState, type AppStateStatus } from "react-native";
import { cancelSoundRender } from "@/modules/clipy-video";
import { NO_SOUND } from "@/src/editor/model/types";
import { prepareSounds } from "@/src/export/exportSounds";
import { makeAudioTrack } from "@/src/editor/model/types";
import { ensureSound, SOUND_RENDER_DEADLINE_MS } from "../soundRenders";

const app = (now: AppStateStatus) => { Object.defineProperty(AppState, "currentState", { configurable: true, get: () => now }); };
const settle = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
beforeEach(() => { jest.useFakeTimers(); app("active"); jest.clearAllMocks(); });
afterEach(() => { jest.useRealTimers(); app("active"); });

test("a render's deadline does not count the time the app was SUSPENDED: coming back does not fail the copy", async () => {
  const outcome = jest.fn();
  ensureSound("p1", "file:///m/a.m4a", { ...NO_SOUND, voice: "deep" }).then(() => outcome("made"), (e: Error) => outcome(e.message));
  await settle();
  jest.advanceTimersByTime(60000);                        // a minute of rendering in front
  jest.setSystemTime(Date.now() + 30 * 60000);            // then half an hour in another app: the process stands still
  jest.advanceTimersByTime(1000);                         // back: the one timer that was waiting runs, overdue
  await settle();
  expect(outcome).not.toHaveBeenCalled();                 // before: "sound render: no answer after 120 s", the moment the app returned
  expect(cancelSoundRender).not.toHaveBeenCalled();
  jest.advanceTimersByTime(SOUND_RENDER_DEADLINE_MS - 61000 - 1);
  await settle();
  expect(outcome).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);                            // the two minutes it was given, in front, are over: now it has failed
  await settle();
  expect(outcome).toHaveBeenCalledWith("sound render: no answer after 120 s");
});

test("nor the time it is alive in the background: an export that waits on the copy is not failed while Clipy is out of sight", async () => {
  const outcome = jest.fn();
  const track = makeAudioTrack({ id: "t", sourceUri: "file:///m/b.m4a", sourceDuration: 9, sound: { ...NO_SOUND, voice: "high" } });
  prepareSounds("p1", [track], () => {}).then(() => outcome("made"), (e: Error) => outcome(e.message));
  await settle();
  app("background");
  jest.advanceTimersByTime(20 * 60000);
  await settle();
  expect(outcome).not.toHaveBeenCalled();
  app("active");
  jest.advanceTimersByTime(SOUND_RENDER_DEADLINE_MS);
  await settle();
  expect(outcome).toHaveBeenCalledWith("Could not prepare a sound for the export: sound render: no answer after 120 s");
});

test("every render queue on the export's path counts its deadline that way (and none measures it against the clock)", () => {
  for (const file of ["soundRenders.ts", "cutoutRenders.ts", "steadyRenders.ts"]) {
    const src = readFileSync(join(__dirname, "..", file), "utf8");
    expect(src).toContain("const stopDeadline = activeTimeout(() => settle(() => {");
    expect(src).toContain("stopDeadline();");
    expect(src).not.toMatch(/const deadline = setTimeout\(/);
    expect(src).not.toMatch(/Date\.now\(\)/);
  }
});
