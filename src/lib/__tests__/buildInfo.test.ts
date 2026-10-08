jest.mock("@/modules/clipy-video", () => ({ isNativeAvailable: jest.fn(), isSoundAvailable: jest.fn() }));
import { isNativeAvailable, isSoundAvailable } from "@/modules/clipy-video";
import { buildLabel, NEEDS_LATEST_BUILD } from "../buildInfo";

const set = (native: boolean, sound: boolean) => { (isNativeAvailable as jest.Mock).mockReturnValue(native); (isSoundAvailable as jest.Mock).mockReturnValue(sound); };

test("the label names what the installed app can do, newest ability first", () => {
  set(true, true);
  expect(buildLabel()).toBe("App build: sound tools");
  set(true, false);
  expect(buildLabel()).toBe("App build: export only (older)");
  set(false, false);
  expect(buildLabel()).toBe("Expo Go (no video engine)");
});

test("a missing ability is said with what to do about it", () => {
  expect(NEEDS_LATEST_BUILD("Voice and sound effects")).toBe("Voice and sound effects need the latest Clipy build. Install it from the newest build link.");
});
