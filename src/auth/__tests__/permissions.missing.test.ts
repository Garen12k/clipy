// An installed app without the media library's picker (an older build): the package throws the moment it is loaded.
jest.mock("expo-media-library", () => { throw new Error("Cannot find native module 'ExpoMediaLibraryNext'"); });
jest.mock("expo-image-picker", () => ({}));
jest.mock("expo-audio", () => ({}));
jest.mock("@/src/lib/notify", () => ({ notifyAvailable: () => false, notifyState: jest.fn(), askToNotify: jest.fn() }));
jest.mock("@/src/projects/camera", () => ({ canUseCamera: () => false }));
import { Linking } from "react-native";
import { managePhotos, PERMISSION_IDS, readPermission } from "../permissions";

test("importing is safe, every row reads as unavailable, and Manage opens Settings", async () => {
  const settings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  for (const id of PERMISSION_IDS) expect(await readPermission(id)).toBe("unavailable");
  await managePhotos();
  expect(settings).toHaveBeenCalledTimes(1);
  settings.mockRestore();
});
