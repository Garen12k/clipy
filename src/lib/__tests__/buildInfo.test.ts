jest.mock("@/modules/clipy-video", () => ({ isNativeAvailable: jest.fn(), isSoundAvailable: jest.fn(), isSpeechAvailable: jest.fn(), isCutoutAvailable: jest.fn(), isSteadyAvailable: jest.fn(), isBlurAndCutsBuild: jest.fn(), isPeaksAvailable: jest.fn() }));
jest.mock("@/modules/clipy-video/background", () => ({ isBackgroundExportBuild: jest.fn() }));
import { isBlurAndCutsBuild, isCutoutAvailable, isNativeAvailable, isPeaksAvailable, isSoundAvailable, isSpeechAvailable, isSteadyAvailable } from "@/modules/clipy-video";
import { isBackgroundExportBuild } from "@/modules/clipy-video/background";
import { BEATS_BACKGROUND_TOOLS, buildLabel, buildName, LATEST_TOOLS, NEEDS_LATEST_BUILD, STEADY_TOOLS } from "../buildInfo";

const set = (native: boolean, sound: boolean, speech: boolean, cutout: boolean, steady: boolean, blurAndCuts = false, peaks = false, background = false) => {
  (isBackgroundExportBuild as jest.Mock).mockReturnValue(background);
  (isPeaksAvailable as jest.Mock).mockReturnValue(peaks);
  (isBlurAndCutsBuild as jest.Mock).mockReturnValue(blurAndCuts);
  (isNativeAvailable as jest.Mock).mockReturnValue(native); (isSoundAvailable as jest.Mock).mockReturnValue(sound);
  (isSpeechAvailable as jest.Mock).mockReturnValue(speech); (isCutoutAvailable as jest.Mock).mockReturnValue(cutout);
  (isSteadyAvailable as jest.Mock).mockReturnValue(steady);
};

test("the label names what the installed app can do, newest ability first", () => {
  set(true, true, true, true, true, true, true, true);
  expect(buildLabel()).toBe("App build: background export");
  set(true, true, true, true, true, true, true);
  expect(buildLabel()).toBe("App build: icons and light");
  set(true, true, true, true, true, true);
  expect(buildLabel()).toBe("App build: blur and cuts");
  set(true, true, true, true, true);
  expect(buildLabel()).toBe("App build: stabilize and smooth");
  set(true, true, true, true, false);
  expect(buildLabel()).toBe("App build: beats and background");
  set(true, true, true, false, false);
  expect(buildLabel()).toBe("App build: noise, ramps and speech");
  set(true, true, false, false, false);
  expect(buildLabel()).toBe("App build: sound tools");
  set(true, false, false, false, false);
  expect(buildLabel()).toBe("App build: export only (older)");
  set(false, false, false, false, false);
  expect(buildLabel()).toBe("Expo Go (no video engine)");
});

test("the name alone (the Accounts screen's Build row) is the label's name, word for word", () => {
  set(true, true, true, true, true, true, true, true);
  expect(buildName()).toBe("Background export");
  set(true, true, true, true, true, true, true);
  expect(buildName()).toBe("Icons and light");
  set(true, true, true, true, true, true);
  expect(buildName()).toBe("Blur and cuts");
  set(true, true, true, true, true);
  expect(buildName()).toBe("Stabilize and smooth");
  set(true, false, false, false, false);
  expect(buildName()).toBe("Export only (older)");
  expect(buildLabel()).toBe("App build: export only (older)");
  set(false, false, false, false, false);
  expect(buildName()).toBe("Expo Go (no video engine)");
  expect(buildLabel()).toBe(buildName());
});

test("a missing ability is said with what to do about it", () => {
  expect(NEEDS_LATEST_BUILD("Voice and sound effects")).toBe("Voice and sound effects need the latest Clipy build. Install it from the newest build link.");
  expect(LATEST_TOOLS).toBe("Reduce noise and Read aloud need the latest Clipy build. Install it from the newest build link.");
  expect(BEATS_BACKGROUND_TOOLS).toBe("Beats in your own music and Remove background need the latest Clipy build. Install it from the newest build link.");
  expect(STEADY_TOOLS).toBe("Stabilize and Smooth slow motion need the latest Clipy build. Install it from the newest build link.");
});

test("the top row is the background-export build, known by its own function, with every older row below it untouched", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "buildInfo.ts"), "utf8") as string;
  const rows = [...src.matchAll(/\{ name: "([^"]+)", title: "([^"]+)", has: (\w+) \}/g)].map((m) => [m[1], m[2], m[3]]);
  expect(rows).toEqual([
    ["background export", "Background export", "isBackgroundExportBuild"],
    ["icons and light", "Icons and light", "isPeaksAvailable"],
    ["blur and cuts", "Blur and cuts", "isBlurAndCutsBuild"],
    ["stabilize and smooth", "Stabilize and smooth", "isSteadyAvailable"],
    ["beats and background", "Beats and background", "isCutoutAvailable"],
    ["noise, ramps and speech", "Noise, ramps and speech", "isSpeechAvailable"],
    ["sound tools", "Sound tools", "isSoundAvailable"],
    ["export only (older)", "Export only (older)", "isNativeAvailable"],
  ]);
  const real = jest.requireActual("@/modules/clipy-video/background") as { isBackgroundExportBuild: () => boolean };
  expect(real.isBackgroundExportBuild.toString()).toContain("backgroundExportSupport");
});
