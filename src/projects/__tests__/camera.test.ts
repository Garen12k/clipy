jest.mock("expo", () => ({ isRunningInExpoGo: jest.fn(() => false) }));
jest.mock("@/modules/clipy-video", () => ({ isPeaksAvailable: jest.fn(() => true) }));
jest.mock("expo-image-picker", () => ({ requestCameraPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn() }));
import { isRunningInExpoGo } from "expo";
import * as ImagePicker from "expo-image-picker";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { isPeaksAvailable } from "@/modules/clipy-video";
import { CAMERA_NEEDS_BUILD } from "@/src/lib/buildInfo";
import { canUseCamera, takeMedia } from "../camera";

const allow = (granted: boolean, canAskAgain = true) => jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted, canAskAgain, status: granted ? "granted" : "denied", expires: "never" } as never);
const build = (peaks: boolean, expoGo = false) => { jest.mocked(isPeaksAvailable).mockReturnValue(peaks); jest.mocked(isRunningInExpoGo).mockReturnValue(expoGo); };

beforeEach(() => { jest.clearAllMocks(); build(true); allow(true); });

test("the camera is offered only where the installed app has a camera usage text: this build, or Expo Go", () => {
  build(true); expect(canUseCamera()).toBe(true);
  build(false, true); expect(canUseCamera()).toBe(true);
  build(false); expect(canUseCamera()).toBe(false);          // an older build: iOS would END the app
  jest.mocked(isRunningInExpoGo).mockImplementation(() => { throw new Error("no constants"); });
  expect(canUseCamera()).toBe(false);
  expect(CAMERA_NEEDS_BUILD).toBe("Photos and videos from the camera need the latest Clipy build. Install it from the newest build link.");
});

test("in an older build nothing of the camera is touched — not even the permission question", async () => {
  build(false);
  expect(await takeMedia()).toEqual({ status: "unavailable" });
  expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
  expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
});

test("a video comes back in the photo picker's shape, its length in seconds", async () => {
  jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValue({ canceled: false, assets: [{ uri: "file:///v.mov", type: "video", duration: 4200, width: 1080, height: 1920, fileName: "v.mov" }] } as never);
  expect(await takeMedia()).toEqual({ status: "taken", asset: { uri: "file:///v.mov", kind: "video", durationSec: 4.2, width: 1080, height: 1920, fileName: "v.mov" } });
  expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith({ mediaTypes: ["images", "videos"], quality: 1 });
});

test("a photo has no length, and a missing file name is left out", async () => {
  jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValue({ canceled: false, assets: [{ uri: "file:///p.jpg", type: "image", width: 3024, height: 4032, fileName: null }] } as never);
  expect(await takeMedia()).toEqual({ status: "taken", asset: { uri: "file:///p.jpg", kind: "photo", durationSec: 0, width: 3024, height: 4032, fileName: undefined } });
});

test("closing the camera, a refusal and a camera that cannot open are told apart, and nothing throws", async () => {
  jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValue({ canceled: true, assets: null } as never);
  expect(await takeMedia()).toEqual({ status: "cancelled" });
  allow(false, false);
  jest.mocked(ImagePicker.launchCameraAsync).mockClear();
  expect(await takeMedia()).toEqual({ status: "denied", canAskAgain: false });
  expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  allow(true);
  jest.mocked(ImagePicker.launchCameraAsync).mockRejectedValue(new Error("Camera not available on simulator"));
  expect(await takeMedia()).toEqual({ status: "unavailable" });
});

test("no screen opens the camera yet: only this wrapper opens it; the wizard's permission row (src/auth/permissions.ts) asks canUseCamera() and nothing more", () => {
  const root = join(__dirname, "..", "..", "..");
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== "__tests__" && name !== "node_modules") walk(p); }
      else if (/\.tsx?$/.test(name) && /launchCameraAsync|takeMedia\(|projects\/camera"/.test(readFileSync(p, "utf8"))) found.push(p.slice(root.length + 1).split("\\").join("/"));
    }
  };
  walk(join(root, "src")); walk(join(root, "app"));
  expect(found.sort()).toEqual(["src/auth/permissions.ts", "src/projects/camera.ts"]);
  const wizard = readFileSync(join(root, "src", "auth", "permissions.ts"), "utf8");
  expect(/launchCameraAsync|takeMedia\(/.test(wizard)).toBe(false);
});
