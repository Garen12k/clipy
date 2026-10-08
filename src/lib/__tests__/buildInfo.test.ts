jest.mock("@/modules/clipy-video", () => ({ isNativeAvailable: jest.fn(), isSoundAvailable: jest.fn(), isSpeechAvailable: jest.fn() }));
import { isNativeAvailable, isSoundAvailable, isSpeechAvailable } from "@/modules/clipy-video";
import { buildLabel, LATEST_TOOLS, NEEDS_LATEST_BUILD } from "../buildInfo";

const set = (native: boolean, sound: boolean, speech: boolean) => {
  (isNativeAvailable as jest.Mock).mockReturnValue(native); (isSoundAvailable as jest.Mock).mockReturnValue(sound); (isSpeechAvailable as jest.Mock).mockReturnValue(speech);
};

test("the label names what the installed app can do, newest ability first", () => {
  set(true, true, true);
  expect(buildLabel()).toBe("App build: noise, ramps and speech");
  set(true, true, false);
  expect(buildLabel()).toBe("App build: sound tools");
  set(true, false, false);
  expect(buildLabel()).toBe("App build: export only (older)");
  set(false, false, false);
  expect(buildLabel()).toBe("Expo Go (no video engine)");
});

test("a missing ability is said with what to do about it", () => {
  expect(NEEDS_LATEST_BUILD("Voice and sound effects")).toBe("Voice and sound effects need the latest Clipy build. Install it from the newest build link.");
  expect(LATEST_TOOLS).toBe("Reduce noise and Read aloud need the latest Clipy build. Install it from the newest build link.");
});
