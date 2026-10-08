jest.mock("@/modules/clipy-video", () => ({ isNativeAvailable: jest.fn(), isSoundAvailable: jest.fn(), isSpeechAvailable: jest.fn(), isCutoutAvailable: jest.fn(), isSteadyAvailable: jest.fn(), isBlurAndCutsBuild: jest.fn() }));
import { isBlurAndCutsBuild, isCutoutAvailable, isNativeAvailable, isSoundAvailable, isSpeechAvailable, isSteadyAvailable } from "@/modules/clipy-video";
import { BEATS_BACKGROUND_TOOLS, buildLabel, LATEST_TOOLS, NEEDS_LATEST_BUILD, STEADY_TOOLS } from "../buildInfo";

const set = (native: boolean, sound: boolean, speech: boolean, cutout: boolean, steady: boolean, blurAndCuts = false) => {
  (isBlurAndCutsBuild as jest.Mock).mockReturnValue(blurAndCuts);
  (isNativeAvailable as jest.Mock).mockReturnValue(native); (isSoundAvailable as jest.Mock).mockReturnValue(sound);
  (isSpeechAvailable as jest.Mock).mockReturnValue(speech); (isCutoutAvailable as jest.Mock).mockReturnValue(cutout);
  (isSteadyAvailable as jest.Mock).mockReturnValue(steady);
};

test("the label names what the installed app can do, newest ability first", () => {
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

test("a missing ability is said with what to do about it", () => {
  expect(NEEDS_LATEST_BUILD("Voice and sound effects")).toBe("Voice and sound effects need the latest Clipy build. Install it from the newest build link.");
  expect(LATEST_TOOLS).toBe("Reduce noise and Read aloud need the latest Clipy build. Install it from the newest build link.");
  expect(BEATS_BACKGROUND_TOOLS).toBe("Beats in your own music and Remove background need the latest Clipy build. Install it from the newest build link.");
  expect(STEADY_TOOLS).toBe("Stabilize and Smooth slow motion need the latest Clipy build. Install it from the newest build link.");
});
