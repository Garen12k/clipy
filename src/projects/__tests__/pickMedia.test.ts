jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
import * as ImagePicker from "expo-image-picker";
import { Linking } from "react-native";
import { useToast } from "@/src/ui/Toast";
import { pickMedia } from "../pickMedia";

const launch = ImagePicker.launchImageLibraryAsync as jest.Mock;
beforeEach(() => {
  jest.clearAllMocks(); useToast.getState().clear();
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true, canAskAgain: true });
});

test("permission denied -> toast, null, opens Settings when it can't ask again", async () => {
  const open = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: false });
  expect(await pickMedia()).toBeNull();
  expect(launch).not.toHaveBeenCalled();
  expect(useToast.getState().message).toMatch(/Photos access/);
  expect(open).toHaveBeenCalled();
  open.mockRestore();
});

test("cancelled -> null", async () => {
  launch.mockResolvedValue({ canceled: true, assets: null });
  expect(await pickMedia()).toBeNull();
});

test("a video and a photo map to the right kind, seconds and sizes", async () => {
  launch.mockResolvedValue({ canceled: false, assets: [
    { uri: "file:///v.mov", type: "video", duration: 4500, width: 1080, height: 1920, fileName: "v.mov" },
    { uri: "file:///p.heic", type: "image", duration: null, width: 4032, height: 3024, fileName: null },
  ] });
  expect(await pickMedia()).toEqual([
    { uri: "file:///v.mov", kind: "video", durationSec: 4.5, width: 1080, height: 1920, fileName: "v.mov" },
    { uri: "file:///p.heic", kind: "photo", durationSec: 0, width: 4032, height: 3024, fileName: undefined },
  ]);
  expect(launch).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ["images", "videos"], allowsMultipleSelection: true, selectionLimit: 20, quality: 1 }));
});

test("multiple: false asks for a single item", async () => {
  launch.mockResolvedValue({ canceled: true, assets: null });
  await pickMedia({ multiple: false });
  expect(launch).toHaveBeenCalledWith(expect.objectContaining({ allowsMultipleSelection: false }));
  expect(launch.mock.calls[0][0].selectionLimit).toBeUndefined();
});

test("a limit asks for at most that many items, in the order they are tapped; without one nothing changes", async () => {
  launch.mockResolvedValue({ canceled: true, assets: null });
  await pickMedia({ limit: 3 });
  expect(launch).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ["images", "videos"], allowsMultipleSelection: true, selectionLimit: 3, orderedSelection: true, quality: 1 }));
  launch.mockClear();
  await pickMedia();
  expect(launch.mock.calls[0][0].selectionLimit).toBe(20);
  expect(launch.mock.calls[0][0].orderedSelection).toBeUndefined();
});
