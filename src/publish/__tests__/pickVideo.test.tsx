jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  VideoExportPreset: { Passthrough: 0 },
  UIImagePickerPreferredAssetRepresentationMode: { Current: "current" },
}));
jest.mock("@/src/lib/fileInfo", () => ({ fileSize: jest.fn() }));
import * as ImagePicker from "expo-image-picker";
import { Linking } from "react-native";
import { fileSize } from "@/src/lib/fileInfo";
import { useToast } from "@/src/ui/Toast";
import { pickVideoForPost } from "../pickVideo";

const launch = ImagePicker.launchImageLibraryAsync as jest.Mock;
const asset = (over = {}) => ({ uri: "file:///pick.mov", duration: 21000, fileSize: 14000000, mimeType: "video/quicktime", width: 1080, height: 1920, ...over });
beforeEach(() => {
  jest.clearAllMocks(); useToast.getState().clear();
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true, canAskAgain: true });
  (fileSize as jest.Mock).mockReturnValue(14000000);
});

test("cancelled → null", async () => {
  launch.mockResolvedValue({ canceled: true, assets: null });
  expect(await pickVideoForPost()).toBeNull();
});

test("one original video: milliseconds become seconds; size and type come from the asset", async () => {
  launch.mockResolvedValue({ canceled: false, assets: [asset()] });
  expect(await pickVideoForPost()).toEqual({ fileUri: "file:///pick.mov", durationSec: 21, fileSize: 14000000, mimeType: "video/quicktime" });
  expect(launch).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ["videos"], allowsEditing: false, allowsMultipleSelection: false, videoExportPreset: 0, preferredAssetRepresentationMode: "current" }));
});

test("no fileSize on the asset → the file's real size; no mimeType → video/mp4", async () => {
  (fileSize as jest.Mock).mockReturnValue(9000000);
  launch.mockResolvedValue({ canceled: false, assets: [asset({ fileSize: undefined, mimeType: undefined })] });
  expect(await pickVideoForPost()).toEqual({ fileUri: "file:///pick.mov", durationSec: 21, fileSize: 9000000, mimeType: "video/mp4" });
  expect(fileSize).toHaveBeenCalledWith("file:///pick.mov");
});

test("a missing or empty file → toast and null", async () => {
  (fileSize as jest.Mock).mockReturnValue(0);
  launch.mockResolvedValue({ canceled: false, assets: [asset()] });
  expect(await pickVideoForPost()).toBeNull();
  expect(useToast.getState().message).toBe("Couldn't read that video.");
});

test.each([[null], [undefined], [0], [NaN]])("no usable duration (%s) → toast and null", async (duration) => {
  launch.mockResolvedValue({ canceled: false, assets: [asset({ duration })] });
  expect(await pickVideoForPost()).toBeNull();
  expect(useToast.getState().message).toBe("Couldn't read that video.");
});

test("Photos access denied → explains, opens Settings when it can't ask again, null", async () => {
  const open = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: false });
  expect(await pickVideoForPost()).toBeNull();
  expect(launch).not.toHaveBeenCalled();
  expect(useToast.getState().message).toMatch(/Photos access/);
  expect(open).toHaveBeenCalled();
  open.mockRestore();
});

test("a picker error → toast and null", async () => {
  launch.mockRejectedValue(new Error("iCloud download failed"));
  expect(await pickVideoForPost()).toBeNull();
  expect(useToast.getState().message).toBe("iCloud download failed");
});
